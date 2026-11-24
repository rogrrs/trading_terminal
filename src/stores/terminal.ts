import { create } from 'zustand';
import { backend } from '@/features/api';
import { candlesPage, getTimeframe } from '@/features/api/timeframes';
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
  /** True when the backend has no older candles to fetch. */
  historyExhausted: boolean;
  loadingMore: boolean;

  setInstrument: (instrument: Instrument) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  loadCandles: (silent?: boolean) => Promise<void>;
  /** Prepends one more page of older candles. */
  loadMoreHistory: () => Promise<void>;
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
  historyExhausted: false,
  loadingMore: false,

  setInstrument: (instrument) => {
    if (get().instrument?.id === instrument.id) return;
    set({
      instrument,
      candles: [],
      orderBook: null,
      error: null,
      status: 'idle',
      lastBarAt: null,
      historyExhausted: false,
      loadingMore: false,
    });
  },

  setTimeframe: (timeframe) => {
    if (get().timeframe === timeframe) return;
    set({
      timeframe,
      candles: [],
      error: null,
      status: 'idle',
      lastBarAt: null,
      historyExhausted: false,
      loadingMore: false,
    });
  },

  loadCandles: async (silent = false) => {
    const { instrument, timeframe } = get();
    if (!instrument) return;

    const requestId = get().requestId + 1;
    set({ requestId, ...(silent ? {} : { status: 'loading' as const }), error: null });

    const tf = getTimeframe(timeframe);
    const interval = tf.candleInterval;
    const limit = tf.limit;
    const initialPages = silent ? 1 : 3;

    try {
      let collected: Candle[] = [];
      let toMs = Date.now();
      let exhausted = false;

      for (let page = 0; page < initialPages; page += 1) {
        const window = candlesPage(timeframe, toMs);
        const chunk = await backend.getCandles({
          instrumentId: instrument.id,
          interval,
          from: window.from,
          to: window.to,
          limit,
        });
        if (get().requestId !== requestId) return;
        if (!chunk.length) {
          exhausted = true;
          break;
        }
        collected = [...chunk, ...collected];
        // A page shorter than the limit still may have older history behind it,
        // because the API caps the period per interval. Only an empty page
        // means there is nothing left.
        if (chunk.length === 0) {
          exhausted = true;
          break;
        }
        const oldest = chunk[0]!.time * 1000;
        if (oldest <= 0) break;
        toMs = oldest - tf.ms;
      }

      const list = collected.filter((c) => Number.isFinite(c.open) && Number.isFinite(c.close));
      if (get().requestId !== requestId) return;
      set({
        candles: list,
        status: list.length ? 'ready' : 'error',
        error: list.length
          ? null
          : `Биржа не вернула свечи за запрошенный период (${instrument.ticker || instrument.id}, ${timeframe}). ` +
            'Частая причина — выбран истёкший контракт или у инструмента нет истории по этому таймфрейму.',
        lastBarAt: list.length ? list[list.length - 1]!.time : null,
        historyExhausted: exhausted,
        loadingMore: false,
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
        historyExhausted: false,
        loadingMore: false,
      });
    }
  },

  loadMoreHistory: async () => {
    const { instrument, timeframe, candles, historyExhausted, loadingMore } = get();
    if (!instrument || historyExhausted || loadingMore) return;
    const tf = getTimeframe(timeframe);
    const first = candles[0];
    const toMs = first ? first.time * 1000 - tf.ms : Date.now();
    const requestId = get().requestId;

    set({ loadingMore: true });
    try {
      const window = candlesPage(timeframe, toMs);
      const chunk = await backend.getCandles({
        instrumentId: instrument.id,
        interval: tf.candleInterval,
        from: window.from,
        to: window.to,
        limit: tf.limit,
      });
      if (get().requestId !== requestId) return;
      const merged = [...chunk, ...get().candles].sort((a, b) => a.time - b.time);
      set({
        candles: merged,
        historyExhausted: chunk.length === 0,
        loadingMore: false,
      });
    } catch (error) {
      set({
        loadingMore: false,
        error: error instanceof Error ? error.message : 'Не удалось загрузить более ранние свечи',
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
