import type { Timeframe } from './types';

export interface TimeframeConfig {
  id: Timeframe;
  label: string;
  short: string;
  /** GetCandles / historic candles interval. */
  candleInterval: string;
  /** MarketDataStream subscription interval. */
  subscriptionInterval: string;
  ms: number;
  /** How many bars we request (also respects the API per-interval limits). */
  bars: number;
  limit: number;
  streamable: boolean;
}

export const TIMEFRAMES: TimeframeConfig[] = [
  {
    id: '1m',
    label: '1 минута',
    short: '1м',
    candleInterval: 'CANDLE_INTERVAL_1_MIN',
    subscriptionInterval: 'SUBSCRIPTION_INTERVAL_ONE_MINUTE',
    ms: 60_000,
    bars: 500,
    limit: 2400,
    streamable: true,
  },
  {
    id: '5m',
    label: '5 минут',
    short: '5м',
    candleInterval: 'CANDLE_INTERVAL_5_MIN',
    subscriptionInterval: 'SUBSCRIPTION_INTERVAL_FIVE_MINUTES',
    ms: 5 * 60_000,
    bars: 500,
    limit: 2400,
    streamable: true,
  },
  {
    id: '15m',
    label: '15 минут',
    short: '15м',
    candleInterval: 'CANDLE_INTERVAL_15_MIN',
    subscriptionInterval: 'SUBSCRIPTION_INTERVAL_FIFTEEN_MINUTES',
    ms: 15 * 60_000,
    bars: 500,
    limit: 2400,
    streamable: true,
  },
  {
    id: '1h',
    label: '1 час',
    short: '1ч',
    candleInterval: 'CANDLE_INTERVAL_HOUR',
    subscriptionInterval: 'SUBSCRIPTION_INTERVAL_ONE_HOUR',
    ms: 3_600_000,
    bars: 800,
    limit: 2400,
    streamable: true,
  },
  {
    id: '4h',
    label: '4 часа',
    short: '4ч',
    candleInterval: 'CANDLE_INTERVAL_4_HOUR',
    subscriptionInterval: 'SUBSCRIPTION_INTERVAL_4_HOUR',
    ms: 4 * 3_600_000,
    bars: 700,
    limit: 700,
    streamable: true,
  },
  {
    id: '1D',
    label: '1 день',
    short: '1Д',
    candleInterval: 'CANDLE_INTERVAL_DAY',
    subscriptionInterval: 'SUBSCRIPTION_INTERVAL_ONE_DAY',
    ms: 24 * 3_600_000,
    bars: 1000,
    limit: 2400,
    streamable: true,
  },
  {
    id: '1W',
    label: '1 неделя',
    short: '1Н',
    candleInterval: 'CANDLE_INTERVAL_WEEK',
    subscriptionInterval: 'SUBSCRIPTION_INTERVAL_WEEK',
    ms: 7 * 24 * 3_600_000,
    bars: 200,
    limit: 300,
    streamable: true,
  },
];

export const DEFAULT_TIMEFRAME: Timeframe = '1h';

export function getTimeframe(id: Timeframe): TimeframeConfig {
  return TIMEFRAMES.find((tf) => tf.id === id) ?? TIMEFRAMES[0]!;
}

export function candlesWindow(id: Timeframe, now = Date.now()): { from: string; to: string; limit: number } {
  const tf = getTimeframe(id);
  const from = new Date(now - tf.bars * tf.ms).toISOString();
  const to = new Date(now).toISOString();
  return { from, to, limit: tf.limit };
}
