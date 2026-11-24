import { create } from 'zustand';
import { backend } from '@/features/api';
import { candlesWindow, getTimeframe } from '@/features/api/timeframes';
import type { Candle, Instrument, OrderBook, Timeframe } from '@/features/api/types';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
export type StreamStatus = 'off' | 'connecting' | 'live' | 'error';

interface TerminalState {
  instrument: Instrument | null;
  timeframe: Timeframe;
  candles: Candle[];
  status: LoadStatus;
  error: string | null;
  streamStatus: StreamStatus;
  streamError: string | null;
  orderBook: OrderBook | null;
  orderBookStatus: LoadStatus;
  lastBarAt: number | null;
  requestId: number;

  setInstrument: (instrument: Instrument) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  loadCandles: (silent?: boolean) => Promise<void>;
  loadOrderBook: (depth?: number) => Promise<void>;
  applyCandle: (candle: Candle) => void;
  setOrderBook: (book: OrderBook) => void;
  setStreamStatus: (status: StreamStatus, error?: string | null) => void;
  setError: (error: string | null) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  instrument: null,
  timeframe: '1h',
  candles: [],
  status: 'idle',
  error: null,
  streamStatus: 'off',
  streamError: null,
  orderBook: null,
  orderBookStatus: 'idle',
  lastBarAt: null,
  requestId: 0,

  setInstrument: (instrument) => {
    if (get().instrument?.id === instrument.id) return;
    set({ instrument, candles: [], orderBook: null, error: null, status: 'idle', lastBarAt: null });
  },

  setTimeframe: (timeframe) => {
    if (get().timeframe === timeframe) return;
    set({ timeframe, candles: [], error: null, status: 'idle', lastBarAt: null });
  },

  loadCandles: async (silent = false) => {
    const { instrument, timeframe } = get();
    if (!instrument) return;

    const requestId = get().requestId + 1;
    set({ requestId, ...(silent ? {} : { status: 'loading' as const }), error: null });

    try {
      const window = candlesWindow(timeframe);
      const candles = await backend.getCandles({
        instrumentId: instrument.id,
        interval: getTimeframe(timeframe).candleInterval,
        from: window.from,
        to: window.to,
        limit: window.limit,
      });
      if (get().requestId !== requestId) return;
      set({
        candles: candles.filter((c) => Number.isFinite(c.open) && Number.isFinite(c.close)),
        status: candles.length ? 'ready' : 'error',
        error: candles.length ? null : 'Биржа не вернула свечи за запрошенный период',
        lastBarAt: candles.length ? candles[candles.length - 1]!.time : null,
      });
    } catch (error) {
      if (get().requestId !== requestId) return;
      if (silent) {
        set({ status: get().candles.length ? 'ready' : 'error', error: error instanceof Error ? error.message : 'Не удалось обновить свечи' });
        return;
      }
      set({
        status: 'error',
        candles: [],
        error: error instanceof Error ? error.message : 'Не удалось загрузить свечи',
      });
    }
  },

  loadOrderBook: async (depth = 20) => {
    const { instrument } = get();
    if (!instrument) return;
    set({ orderBookStatus: 'loading' });
    try {
      const book = await backend.getOrderBook({ instrumentId: instrument.id, depth });
      if (get().instrument?.id !== book.instrumentId && get().instrument?.id !== instrument.id) return;
      set({ orderBook: book, orderBookStatus: 'ready' });
    } catch (error) {
      set({
        orderBookStatus: 'error',
        error: error instanceof Error ? error.message : 'Не удалось загрузить стакан',
      });
    }
  },

  applyCandle: (candle) => {
    const { timeframe, instrument } = get();
    if (!instrument) return;
    const tf = getTimeframe(timeframe);

    set((state) => {
      const list = state.candles;
      if (!list.length) return { candles: [candle], lastBarAt: candle.time };

      const last = list[list.length - 1]!;
      if (candle.time < last.time) return state;

      if (candle.time === last.time) {
        const next = list.slice(0, -1);
        next.push({ ...last, ...candle, volume: candle.volume ?? last.volume });
        return { candles: next, lastBarAt: candle.time };
      }

      // Guard against out-of-order frames from different intervals.
      if (candle.time - last.time < tf.ms / 2) return state;
      const next = [...list, candle];
      if (next.length > tf.limit) next.shift();
      return { candles: next, lastBarAt: candle.time };
    });
  },

  setOrderBook: (book) => set({ orderBook: book, orderBookStatus: 'ready' }),
  setStreamStatus: (streamStatus, error = null) => set({ streamStatus, streamError: error }),
  setError: (error) => set({ error }),
}));
