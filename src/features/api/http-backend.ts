import { TerminalApiError } from './types';
import type {
  AiConfig,
  AiConfigInput,
  AiConvertRequest,
  AiConvertResponse,
  BackendAdapter,
  Candle,
  CandlesRequest,
  Health,
  Instrument,
  OrderBook,
  StreamHandlers,
  SubscriptionSpec,
  TokenStatus,
} from './types';

interface ApiErrorBody {
  error?: string;
  message?: string;
  code?: string;
}

async function parseError(res: Response): Promise<TerminalApiError> {
  let body: ApiErrorBody = {};
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* not json */
  }
  const message = body.error || body.message || `HTTP ${res.status}`;
  return new TerminalApiError(message, body.code, res.status);
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: 'DELETE' });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

/**
 * Reads a text/event-stream produced by a POST request (EventSource only supports GET).
 * The server keeps the response open and writes `event:`/`data:` frames.
 */
async function readEventStream(
  url: string,
  body: unknown,
  onEvent: (event: string, data: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw await parseError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    let separator = buffer.indexOf('\n\n');
    while (separator !== -1) {
      const frame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf('\n\n');

      let event = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trimStart();
      }
      if (data) onEvent(event, data);
    }
  }
}

/** Backend used in a plain browser (PWA / dev): all calls go through the local Fastify proxy. */
export class HttpBackend implements BackendAdapter {
  readonly kind = 'http' as const;

  health(): Promise<Health> {
    return get<Health>('/api/health');
  }

  getTokenStatus(): Promise<TokenStatus> {
    return get<TokenStatus>('/api/token');
  }

  setToken(token: string): Promise<TokenStatus> {
    return put<TokenStatus>('/api/token', { token });
  }

  clearToken(): Promise<void> {
    return del<{ ok: boolean }>('/api/token').then(() => undefined);
  }

  searchInstruments(query: string): Promise<Instrument[]> {
    return post<{ instruments: Instrument[] }>('/api/instruments/search', { query }).then((r) => r.instruments);
  }

  getCandles(req: CandlesRequest): Promise<Candle[]> {
    return post<{ candles: Candle[] }>('/api/candles', req).then((r) => r.candles);
  }

  getOrderBook(req: { instrumentId: string; depth: number }): Promise<OrderBook> {
    return post<OrderBook>('/api/orderbook', req);
  }

  async subscribe(spec: SubscriptionSpec, handlers: StreamHandlers): Promise<() => void> {
    const controller = new AbortController();
    let stopped = false;

    const run = async () => {
      try {
        await readEventStream(
          '/api/stream',
          { spec },
          (event, data) => {
            if (stopped) return;
            let payload: unknown;
            try {
              payload = JSON.parse(data);
            } catch {
              return;
            }
            switch (event) {
              case 'candle':
                handlers.onCandle?.(payload as Candle);
                break;
              case 'orderbook':
                handlers.onOrderBook?.(payload as OrderBook);
                break;
              case 'status':
                handlers.onStatus?.((payload as { status: string }).status);
                break;
              case 'error':
                handlers.onError?.((payload as { message: string }).message);
                break;
            }
          },
          controller.signal,
        );
        if (!stopped) handlers.onStatus?.('disconnected');
      } catch (error) {
        if (stopped || controller.signal.aborted) return;
        handlers.onError?.(error instanceof Error ? error.message : String(error));
      }
    };

    void run();
    return () => {
      stopped = true;
      controller.abort();
    };
  }

  convertPine(req: AiConvertRequest): Promise<AiConvertResponse> {
    return post<AiConvertResponse>('/api/ai/convert', req);
  }

  getAiConfig(): Promise<AiConfig> {
    return get<AiConfig>('/api/ai/config');
  }

  setAiConfig(config: AiConfigInput): Promise<AiConfig> {
    return put<AiConfig>('/api/ai/config', config);
  }
}
