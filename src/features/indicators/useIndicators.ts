import { useEffect, useRef, useState } from 'react';
import { useTerminalStore } from '@/stores/terminal';
import { useIndicatorStore } from '@/stores/indicators';
import { transpilePine } from './transpiler';
import { IndicatorRunner } from './IndicatorRunner';
import type { IndicatorRunResult, MarketData } from './types';
import type { Candle } from '@/features/api/types';

function toMarketData(candles: Candle[]): MarketData {
  return {
    time: candles.map((candle) => candle.time),
    open: candles.map((candle) => candle.open),
    high: candles.map((candle) => candle.high),
    low: candles.map((candle) => candle.low),
    close: candles.map((candle) => candle.close),
    volume: candles.map((candle) => candle.volume),
  };
}

/** Runs enabled indicators in a worker and returns series for the chart. */
export function useIndicators(): IndicatorRunResult[] {
  const candles = useTerminalStore((state) => state.candles);
  const indicators = useIndicatorStore((state) => state.indicators);
  const [results, setResults] = useState<IndicatorRunResult[]>([]);
  const runnerRef = useRef<IndicatorRunner | null>(null);

  useEffect(() => {
    const enabled = indicators.filter((indicator) => indicator.enabled && indicator.code.trim().length > 0);
    if (!candles.length || !enabled.length) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      const runner = (runnerRef.current ??= new IndicatorRunner());
      const data = toMarketData(candles);

      void Promise.all(
        enabled.map(async (indicator) => {
          const source = indicator.lang === 'pine' ? transpilePine(indicator.code).code : indicator.code;
          try {
            return await runner.run(indicator.id, source, data);
          } catch (error) {
            return {
              indicatorId: indicator.id,
              name: indicator.name,
              overlay: false,
              plots: [],
              hlines: [],
              warnings: [],
              error: error instanceof Error ? error.message : String(error),
            } satisfies IndicatorRunResult;
          }
        }),
      ).then((list) => {
        if (!cancelled) setResults(list);
      });
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candles, indicators]);

  useEffect(() => () => runnerRef.current?.dispose(), []);

  return results;
}
