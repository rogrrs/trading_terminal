import { useEffect, useMemo, useRef, useState } from 'react';
import { backend } from '@/features/api';

/** Polls GetLastPrices for the watchlist instruments (one batched request). */
export function useWatchlistPrices(ids: string[]): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const idsKey = ids.join(',');
  const idsRef = useRef(idsKey);
  idsRef.current = idsKey;

  const list = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);

  useEffect(() => {
    if (!list.length) {
      setPrices({});
      return;
    }
    let disposed = false;

    const run = async () => {
      try {
        const next = await backend.getLastPrices(list);
        if (!disposed) setPrices(next);
      } catch {
        /* keep previous prices */
      }
    };

    void run();
    const timer = setInterval(() => void run(), 15_000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [list]);

  return prices;
}
