import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, AlertTriangle } from 'lucide-react';
import { backend } from '@/features/api';
import type { Instrument } from '@/features/api/types';
import { useAppStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';
import { debounce } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const KIND_LABELS: Record<string, string> = {
  share: 'Акция',
  stock: 'Акция',
  bond: 'Облигация',
  etf: 'Фонд',
  future: 'Фьючерс',
  futures: 'Фьючерс',
  currency: 'Валюта',
  option: 'Опцион',
  index: 'Индекс',
  commodity: 'Товар',
  sp: 'Нота',
  'clearing-certificate': 'Сертификат',
};

/** Spot instruments first: search often returns expired futures (WUSh4) before the share. */
const KIND_PRIORITY: Record<string, number> = {
  share: 0,
  stock: 0,
  etf: 1,
  bond: 2,
  currency: 3,
  index: 4,
  futures: 5,
  future: 5,
  option: 6,
  commodity: 7,
  sp: 8,
  'clearing-certificate': 9,
};

function sortInstruments(list: Instrument[], query: string): Instrument[] {
  const needle = query.trim().toUpperCase();
  const priority = (item: Instrument): number => {
    const kind = item.kind.toLowerCase().replace(/^instrument[-_]?type[-_]?/, '');
    return KIND_PRIORITY[kind] ?? 10;
  };
  return [...list].sort((a, b) => {
    const exactA = a.ticker.toUpperCase() === needle ? 0 : 1;
    const exactB = b.ticker.toUpperCase() === needle ? 0 : 1;
    if (exactA !== exactB) return exactA - exactB;
    const byKind = priority(a) - priority(b);
    if (byKind !== 0) return byKind;
    return a.ticker.length - b.ticker.length || a.ticker.localeCompare(b.ticker);
  });
}

function kindLabel(kind: string): string {
  const normalized = kind.toLowerCase().replace(/^instrument[-_]?type[-_]?/, '').replace(/_/g, '-');
  return (KIND_LABELS[normalized] ?? kind) || 'Инструмент';
}

export function InstrumentSearch() {
  const instrument = useTerminalStore((state) => state.instrument);
  const setInstrument = useTerminalStore((state) => state.setInstrument);
  const setMobileTab = useAppStore((state) => state.setMobileTab);
  const [query, setQuery] = useState(instrument?.ticker ?? '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) setQuery(instrument?.ticker ?? '');
  }, [instrument?.ticker, open]);

  const runSearch = useMemo(
    () =>
      debounce(async (value: string) => {
        if (!value.trim()) {
          setResults([]);
          setLoading(false);
          return;
        }
        setLoading(true);
        setError(null);
        try {
          const found = await backend.searchInstruments(value.trim());
          setResults(sortInstruments(found, value));
          setActive(0);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Поиск недоступен');
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 250),
    [],
  );

  const onChange = useCallback(
    (value: string) => {
      setQuery(value);
      setOpen(true);
      if (!value.trim()) {
        setResults([]);
        setError(null);
        return;
      }
      void runSearch(value);
    },
    [runSearch],
  );

  const choose = useCallback(
    (item: Instrument) => {
      setInstrument(item);
      setQuery(item.ticker);
      setOpen(false);
      setMobileTab('chart');
    },
    [setInstrument, setMobileTab],
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const candidate = results[active];
      if (candidate) choose(candidate);
      else if (query.trim()) void runSearch(query.trim());
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1 md:max-w-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => {
            setOpen(true);
            event.currentTarget.select();
          }}
          onKeyDown={onKeyDown}
          placeholder="Тикер или название"
          aria-label="Поиск инструмента"
          className="h-8 pl-8 text-xs"
          spellCheck={false}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-[60vh] w-[min(92vw,420px)] overflow-y-auto rounded-md border bg-popover shadow-lg max-md:fixed max-md:inset-x-2 max-md:top-14">
          {instrument && (
            <div className="flex items-center justify-between border-b px-2.5 py-1.5 text-[10px] text-muted-foreground">
              <span>Текущий: {instrument.ticker}</span>
              <span>{instrument.name}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!error && !loading && query.trim() && results.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">Ничего не найдено</div>
          )}

          {!error && !loading && !query.trim() && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              Введите тикер или название — например, SBER, GAzaP, IMOEX
            </div>
          )}

          {results.map((item, index) => (
            <button
              key={`${item.figi}:${item.ticker}:${item.classCode}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
              onMouseEnter={() => setActive(index)}
              className={`flex w-full items-start gap-2 px-2.5 py-2 text-left transition-colors ${
                index === active ? 'bg-accent' : 'hover:bg-accent/60'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{item.ticker}</span>
                  <Badge variant="outline" className="h-4 px-1 text-[9px]">
                    {kindLabel(item.kind)}
                  </Badge>
                  {item.currency && (
                    <span className="text-[10px] text-muted-foreground">{item.currency}</span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.name}</div>
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">{item.classCode}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
