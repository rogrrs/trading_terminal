/**
 * Thin REST client for T-Invest API (T-Bank).
 * Docs: https://developer.tbank.ru/invest
 * Endpoint: https://invest-public-api.tbank.ru/rest
 */

const BASE = (process.env.TINVEST_REST_ENDPOINT ?? 'https://invest-public-api.tbank.ru/rest').replace(/\/$/, '');
const SERVICE = 'tinkoff.public.invest.api.contract.v1';

export class TinkoffError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'TinkoffError';
  }
}

export interface InstrumentDto {
  id: string;
  tradeable: boolean;
  figi: string;
  ticker: string;
  name: string;
  kind: string;
  currency: string;
  classCode: string;
  exchange: string;
  lot: number;
  uid?: string;
}

export interface CandleDto {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isComplete?: boolean;
}

export interface OrderLevelDto {
  price: number;
  quantity: number;
}

export interface OrderBookDto {
  instrumentId: string;
  depth: number;
  bids: OrderLevelDto[];
  asks: OrderLevelDto[];
  lastPrice?: number;
  closePrice?: number;
  limitUp?: number;
  limitDown?: number;
  time?: number;
}

interface RawCandle {
  time?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
  volume?: unknown;
  isComplete?: unknown;
}

interface RawOrder {
  price?: unknown;
  quantity?: unknown;
}

interface RawOrderBook {
  figi?: string;
  depth?: number;
  bids?: RawOrder[];
  asks?: RawOrder[];
  lastPrice?: unknown;
  closePrice?: unknown;
  limitUp?: unknown;
  limitDown?: unknown;
  orderbookTs?: unknown;
  time?: unknown;
  instrumentUid?: string;
}

interface RawInstrument {
  apiTradeAvailableFlag?: boolean;
  api_trade_available_flag?: boolean;
  figi?: string;
  ticker?: string;
  name?: string;
  classCode?: string;
  instrumentType?: string;
  instrumentKind?: string | number;
  lot?: number | string;
  uid?: string;
}

async function post<T>(token: string, service: string, method: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/${service}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const code = (error as { cause?: { code?: string } })?.cause?.code;
    if (
      code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
      code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
      code === 'CERT_HAS_EXPIRED'
    ) {
      throw new TinkoffError(
        'T-Invest API использует сертификат НУЦ Минцифры. Запустите приложение через npm start / npm run dev — тогда добавляется корневой сертификат contracts/certs/russian-trusted-root-ca.pem (или установите его в систему).',
      );
    }
    throw new TinkoffError(
      'Нет соединения с T-Invest API. Проверьте интернет и доступность invest-public-api.tbank.ru.',
    );
  }

  const raw = await response.text();
  if (process.env.DEBUG_TINKOFF === '1') {
    const preview = raw.length > 600 ? `${raw.slice(0, 600)}…` : raw;
    console.log(`[tinkoff] ${service}.${method} ${JSON.stringify(body)} -> ${response.status} ${preview}`);
  }

  if (!response.ok) {
    let payload: { message?: string; code?: string } = {};
    try {
      payload = (await response.json()) as { message?: string; code?: string };
    } catch {
      /* empty */
    }
    const fallback =
      response.status === 401 || response.status === 403
        ? 'Неверный или просроченный токен T-Invest'
        : response.status === 429
          ? 'Превышен лимит запросов T-Invest API'
          : `T-Invest API ответил HTTP ${response.status}`;
    throw new TinkoffError(payload.message || fallback, response.status, payload.code);
  }

  return JSON.parse(raw) as T;
}

/** Quotation {units, nano} -> number, with a fallback for plain numbers. */
export function quotation(value: unknown): number {
  if (value == null) return Number.NaN;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof value === 'object') {
    const quote = value as { units?: string | number; nano?: string | number };
    return Number(quote.units ?? 0) + Number(quote.nano ?? 0) / 1_000_000_000;
  }
  return Number.NaN;
}

/** ISO string or protobuf Timestamp -> unix seconds. */
export function toUnixSeconds(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : 0;
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'object') {
    const timestamp = value as { seconds?: string | number; nanos?: number };
    return Number(timestamp.seconds ?? 0);
  }
  return 0;
}

const KIND_NAMES: Record<number, string> = {
  1: 'bond',
  2: 'share',
  3: 'currency',
  4: 'etf',
  5: 'futures',
  6: 'sp',
  7: 'option',
  8: 'clearing-certificate',
  9: 'index',
  10: 'commodity',
};

export function normalizeKind(value: unknown): string {
  if (typeof value === 'number') return KIND_NAMES[value] ?? String(value);
  const text = String(value ?? '');
  const match = text.match(/INSTRUMENT_TYPE_([A-Z_]+)/);
  if (match?.[1]) return match[1].toLowerCase().replace(/_/g, '-');
  return text.toLowerCase();
}

export async function findInstruments(token: string, query: string): Promise<InstrumentDto[]> {
  const data = await post<{ instruments?: RawInstrument[] }>(
    token,
    `${SERVICE}.InstrumentsService`,
    'FindInstrument',
    { query },
  );
  const all = (data.instruments ?? []).filter((item) => item.figi || item.uid);
  const mapItem = (item: RawInstrument): InstrumentDto => {
    const figi = item.figi ?? '';
    const uid = item.uid ?? undefined;
    return {
      id: figi || uid || '',
      tradeable: item.apiTradeAvailableFlag !== false && item.api_trade_available_flag !== false,
      figi,
        ticker: item.ticker ?? '',
        name: item.name ?? '',
        kind: normalizeKind(item.instrumentKind ?? item.instrumentType ?? ''),
        currency: '',
        classCode: item.classCode ?? '',
        exchange: item.classCode ?? '',
        lot: Number(item.lot ?? 1),
        uid,
      };
  };
  // Expired contracts and instruments without API market data come back with
  // apiTradeAvailableFlag = false. Drop them, but never return an empty answer
  // if the flag is simply missing.
  const mapped = all.map(mapItem);
  const tradable = mapped.filter((item) => item.tradeable);
  return tradable.length ? tradable : mapped;
}

export async function getLastPrices(
  token: string,
  instrumentIds: string[],
): Promise<Record<string, number>> {
  const data = await post<{ lastPrices?: Array<{ figi?: string; instrumentUid?: string; price?: unknown }> }>(
    token,
    `${SERVICE}.MarketDataService`,
    'GetLastPrices',
    { instruments: instrumentIds.map((id) => ({ instrumentId: id })) },
  );
  const result: Record<string, number> = {};
  for (const item of data.lastPrices ?? []) {
    const id = item.figi || item.instrumentUid;
    const value = quotation(item.price);
    if (id && Number.isFinite(value)) result[id] = value;
  }
  return result;
}

export interface CandlesQuery {
  instrumentId: string;
  interval: string;
  from: string;
  to: string;
  limit?: number;
}

export async function getCandles(token: string, query: CandlesQuery): Promise<CandleDto[]> {
  const data = await post<{ candles?: RawCandle[] }>(token, `${SERVICE}.MarketDataService`, 'GetCandles', {
    instrumentId: query.instrumentId,
    interval: query.interval,
    from: query.from,
    to: query.to,
    ...(query.limit ? { limit: query.limit } : {}),
  });
  return (data.candles ?? [])
    .map((candle) => {
      const open = quotation(candle.open);
      const high = quotation(candle.high);
      const low = quotation(candle.low);
      const close = quotation(candle.close);
      return {
        time: toUnixSeconds(candle.time),
        open,
        high,
        low,
        close,
        volume: Number(candle.volume ?? 0),
        isComplete: Boolean(candle.isComplete ?? true),
      } satisfies CandleDto;
    })
    .filter((candle) => candle.time > 0 && Number.isFinite(candle.open) && Number.isFinite(candle.close))
    .sort((a, b) => a.time - b.time);
}

export async function getOrderBook(token: string, instrumentId: string, depth: number): Promise<OrderBookDto> {
  const data = await post<RawOrderBook>(token, `${SERVICE}.MarketDataService`, 'GetOrderBook', {
    instrumentId,
    depth,
  });
  const mapSide = (orders: RawOrder[] | undefined): OrderLevelDto[] =>
    (orders ?? []).map((order) => ({
      price: quotation(order.price),
      quantity: Number(order.quantity ?? 0),
    }));
  return {
    instrumentId,
    depth: data.depth ?? depth,
    bids: mapSide(data.bids),
    asks: mapSide(data.asks),
    lastPrice: quotation(data.lastPrice),
    closePrice: quotation(data.closePrice),
    limitUp: quotation(data.limitUp),
    limitDown: quotation(data.limitDown),
    time: toUnixSeconds(data.orderbookTs ?? data.time) * 1000,
  };
}

export const REST_ENDPOINT = BASE;
