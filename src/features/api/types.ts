/** Shared contract between the React frontend and both backends (Tauri IPC / HTTP proxy). */

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W';

export interface Instrument {
  /** Stable key used by the app: figi (preferred) or uid. */
  id: string;
  figi: string;
  ticker: string;
  name: string;
  kind: string;
  currency: string;
  classCode: string;
  exchange: string;
  lot: number;
  minPriceIncrement?: number;
  uid?: string;
}

export interface Candle {
  /** Unix seconds (UTC). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isComplete?: boolean;
}

export interface OrderLevel {
  price: number;
  quantity: number;
}

export interface OrderBook {
  instrumentId: string;
  depth: number;
  bids: OrderLevel[];
  asks: OrderLevel[];
  lastPrice?: number;
  closePrice?: number;
  limitUp?: number;
  limitDown?: number;
  /** Unix ms. */
  time?: number;
}

export interface CandlesRequest {
  instrumentId: string;
  interval: string;
  /** ISO datetime. */
  from: string;
  /** ISO datetime. */
  to: string;
  limit?: number;
}

export interface TokenStatus {
  hasToken: boolean;
  /** Where the token lives: keychain (Tauri) or local secret file / browser storage. */
  storage: 'keychain' | 'file' | 'memory' | 'none';
  masked?: string;
  /** Read-only tokens can only read market data; full tokens are accepted but never used for trading here. */
  mode?: 'readonly' | 'full' | 'unknown';
}

export interface Health {
  ok: boolean;
  version: string;
  backend: 'tauri' | 'http';
  endpoint: string;
  hasToken: boolean;
  streaming: 'grpc' | 'sse' | 'none';
}

export interface SubscriptionSpec {
  candles?: { instrumentId: string; interval: string };
  orderbook?: { instrumentId: string; depth: number };
}

export interface StreamHandlers {
  onCandle?: (candle: Candle) => void;
  onOrderBook?: (book: OrderBook) => void;
  onStatus?: (status: string) => void;
  onError?: (message: string) => void;
}

export interface AiConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  hasKey: boolean;
}

export interface AiConfigInput {
  provider: 'openai' | 'anthropic';
  model: string;
  apiKey?: string;
}

export interface AiConvertRequest {
  pine: string;
  provider: 'openai' | 'anthropic';
  model?: string;
}

export interface AiConvertResponse {
  code: string;
  explanation?: string;
  warnings?: string[];
}

export interface BackendError {
  message: string;
  code?: string;
  status?: number;
}

export interface BackendAdapter {
  readonly kind: 'tauri' | 'http';
  health(): Promise<Health>;
  getTokenStatus(): Promise<TokenStatus>;
  setToken(token: string): Promise<TokenStatus>;
  clearToken(): Promise<void>;
  searchInstruments(query: string): Promise<Instrument[]>;
  getCandles(req: CandlesRequest): Promise<Candle[]>;
  getOrderBook(req: { instrumentId: string; depth: number }): Promise<OrderBook>;
  /** Returns an unsubscribe function. */
  subscribe(spec: SubscriptionSpec, handlers: StreamHandlers): Promise<() => void>;
  convertPine(req: AiConvertRequest): Promise<AiConvertResponse>;
  getAiConfig(): Promise<AiConfig>;
  setAiConfig(config: AiConfigInput): Promise<AiConfig>;
}

export class TerminalApiError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'TerminalApiError';
    this.code = code;
    this.status = status;
  }
}
