import { useEffect } from 'react';
import { backend, getTimeframe } from '@/features/api';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';

/** Loads history/snapshot and keeps the gRPC (Tauri) or SSE (browser) stream alive. */
export function useMarketData() {
  const instrumentId = useTerminalStore((state) => state.instrument?.id ?? null);
  const timeframe = useTerminalStore((state) => state.timeframe);
  const loadCandles = useTerminalStore((state) => state.loadCandles);
  const loadOrderBook = useTerminalStore((state) => state.loadOrderBook);
  const applyCandle = useTerminalStore((state) => state.applyCandle);
  const setOrderBook = useTerminalStore((state) => state.setOrderBook);
  const setStreamStatus = useTerminalStore((state) => state.setStreamStatus);
  const depth = useSettingsStore((state) => state.orderBookDepth);

  useEffect(() => {
    if (!instrumentId) return;
    void loadCandles();
  }, [instrumentId, timeframe, loadCandles]);

  useEffect(() => {
    if (!instrumentId) return;
    void loadOrderBook(depth);
  }, [instrumentId, depth, loadOrderBook]);

  useEffect(() => {
    if (!instrumentId) return;

    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    let candlePoll: ReturnType<typeof setInterval> | undefined;
    let bookPoll: ReturnType<typeof setInterval> | undefined;

    const stopPolling = () => {
      if (candlePoll) clearInterval(candlePoll);
      if (bookPoll) clearInterval(bookPoll);
      candlePoll = undefined;
      bookPoll = undefined;
    };

    const startPolling = () => {
      if (disposed || candlePoll) return;
      candlePoll = setInterval(() => {
        if (!disposed) void loadCandles(true);
      }, 15_000);
      bookPoll = setInterval(() => {
        if (!disposed) void loadOrderBook(depth);
      }, 5_000);
    };

    setStreamStatus('connecting');

    backend
      .subscribe(
        {
          candles: {
            instrumentId,
            interval: getTimeframe(timeframe).subscriptionInterval,
          },
          orderbook: { instrumentId, depth },
        },
        {
          onCandle: (candle) => {
            if (!disposed) applyCandle(candle);
          },
          onOrderBook: (book) => {
            if (!disposed) setOrderBook(book);
          },
          onStatus: (status) => {
            if (disposed) return;
            if (status === 'subscribed' || status === 'connected' || status === 'open') {
              stopPolling();
              setStreamStatus('live');
            } else if (status === 'connecting') {
              setStreamStatus('connecting');
            } else if (status === 'disconnected') {
              setStreamStatus('off');
              startPolling();
            }
          },
          onError: (message) => {
            if (disposed) return;
            setStreamStatus('error', message);
            startPolling();
          },
        },
      )
      .then((unsub) => {
        if (disposed) {
          unsub();
          return;
        }
        unsubscribe = unsub;
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setStreamStatus('error', error instanceof Error ? error.message : String(error));
        startPolling();
      });

    return () => {
      disposed = true;
      unsubscribe?.();
      stopPolling();
    };
  }, [instrumentId, timeframe, depth, applyCandle, setOrderBook, setStreamStatus, loadCandles, loadOrderBook]);
}
