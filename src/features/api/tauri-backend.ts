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

/**
 * Tauri v2 backend: every market-data call goes through Rust IPC (invoke).
 * The token never reaches the renderer: it is stored in the OS keychain / app data
 * and only `hasToken` is returned to JS.
 */
export class TauriBackend implements BackendAdapter {
  readonly kind = 'tauri' as const;

  private async core() {
    return import('@tauri-apps/api/core');
  }

  private async events() {
    return import('@tauri-apps/api/event');
  }

  private async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await this.core();
    try {
      return await invoke<T>(command, args);
    } catch (error) {
      const message = typeof error === 'string' ? error : error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  }

  health(): Promise<Health> {
    return this.invoke<Health>('health');
  }

  getTokenStatus(): Promise<TokenStatus> {
    return this.invoke<TokenStatus>('token_status');
  }

  setToken(token: string): Promise<TokenStatus> {
    return this.invoke<TokenStatus>('token_set', { token });
  }

  async clearToken(): Promise<void> {
    await this.invoke<{ ok: boolean }>('token_clear');
  }

  searchInstruments(query: string): Promise<Instrument[]> {
    return this.invoke<Instrument[]>('instruments_search', { query });
  }

  getCandles(req: CandlesRequest): Promise<Candle[]> {
    return this.invoke<Candle[]>('candles_get', { req });
  }

  getOrderBook(req: { instrumentId: string; depth: number }): Promise<OrderBook> {
    return this.invoke<OrderBook>('orderbook_get', { req });
  }

  getLastPrices(instrumentIds: string[]): Promise<Record<string, number>> {
    return this.invoke<Record<string, number>>('lastprices_get', { ids: instrumentIds });
  }

  async subscribe(spec: SubscriptionSpec, handlers: StreamHandlers): Promise<() => void> {
    const { listen } = await this.events();
    await this.invoke<{ ok: boolean }>('stream_subscribe', { spec });

    const unlisteners = await Promise.all([
      listen<Candle>('stream://candle', (event) => handlers.onCandle?.(event.payload)),
      listen<OrderBook>('stream://orderbook', (event) => handlers.onOrderBook?.(event.payload)),
      listen<{ status: string }>('stream://status', (event) => handlers.onStatus?.(event.payload.status)),
      listen<{ message: string }>('stream://error', (event) => handlers.onError?.(event.payload.message)),
    ]);

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      for (const unlisten of unlisteners) void unlisten();
      void this.invoke('stream_unsubscribe').catch(() => undefined);
    };
  }

  convertPine(req: AiConvertRequest): Promise<AiConvertResponse> {
    return this.invoke<AiConvertResponse>('ai_convert', { req });
  }

  getAiConfig(): Promise<AiConfig> {
    return this.invoke<AiConfig>('ai_config');
  }

  setAiConfig(config: AiConfigInput): Promise<AiConfig> {
    return this.invoke<AiConfig>('ai_config_set', { config });
  }
}
