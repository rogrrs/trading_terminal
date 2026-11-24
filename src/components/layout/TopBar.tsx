import { PanelRight, Settings2, KeyRound } from 'lucide-react';
import { InstrumentSearch } from '@/features/instruments/InstrumentSearch';
import { TIMEFRAMES } from '@/features/api/timeframes';
import { useAppStore } from '@/stores/settings';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';
import { formatPrice, precisionForPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function StreamBadge() {
  const status = useTerminalStore((state) => state.streamStatus);
  const error = useTerminalStore((state) => state.streamError);
  const label = status === 'live' ? 'LIVE' : status === 'connecting' ? '…' : status === 'error' ? 'OFF' : '—';
  const dot =
    status === 'live'
      ? 'bg-up'
      : status === 'connecting'
        ? 'bg-yellow-500'
        : status === 'error'
          ? 'bg-down'
          : 'bg-muted-foreground';

  return (
    <Tooltip content={error || (status === 'live' ? 'Поток котировок активен' : 'Поток котировок')}>
      <div className="flex h-7 items-center gap-1.5 rounded border bg-card px-2 text-[10px] font-medium">
        <span className={cn('h-1.5 w-1.5 rounded-full', dot, status === 'live' && 'animate-pulse')} />
        {label}
      </div>
    </Tooltip>
  );
}

export function TopBar() {
  const timeframe = useTerminalStore((state) => state.timeframe);
  const setTimeframe = useTerminalStore((state) => state.setTimeframe);
  const last = useTerminalStore((state) => state.candles[state.candles.length - 1]);
  const previous = useTerminalStore((state) =>
    state.candles.length > 1 ? state.candles[state.candles.length - 2] : undefined,
  );
  const showOrderBook = useSettingsStore((state) => state.showOrderBook);
  const setShowOrderBook = useSettingsStore((state) => state.setShowOrderBook);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const setTokenDialogOpen = useAppStore((state) => state.setTokenDialogOpen);
  const token = useAppStore((state) => state.token);

  const precision = precisionForPrice(last?.close);
  const change =
    last && previous && previous.close ? ((last.close - previous.close) / previous.close) * 100 : 0;
  const changeColor = change >= 0 ? 'text-up' : 'text-down';

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-background px-2 py-1.5 md:h-12 md:flex-nowrap md:gap-2 md:px-3">
      <div className="flex items-center gap-2 pr-1">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
          TT
        </div>
        <span className="hidden text-xs font-semibold tracking-tight lg:block">Терминал</span>
      </div>

      <InstrumentSearch />

      {last && (
        <div className="tnum hidden items-baseline gap-1.5 sm:flex">
          <span className="text-sm font-semibold">{formatPrice(last.close, precision)}</span>
          <span className={cn('text-[11px] font-medium', changeColor)}>
            {change >= 0 ? '+' : ''}
            {change.toFixed(2)}%
          </span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <StreamBadge />

        <div className="no-scrollbar hidden items-center gap-0.5 overflow-x-auto md:flex">
          {TIMEFRAMES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTimeframe(item.id)}
              className={cn(
                'h-7 rounded px-2 text-[11px] font-medium transition-colors',
                timeframe === item.id
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {item.short}
            </button>
          ))}
        </div>

        <Tooltip content={showOrderBook ? 'Скрыть стакан' : 'Показать стакан'}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowOrderBook(!showOrderBook)}
            className={cn('hidden md:inline-flex', showOrderBook && 'bg-accent')}
            aria-label="Стакан"
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </Tooltip>

        <Tooltip content={!token?.hasToken ? 'Токен не задан' : 'Токен сохранён локально'}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTokenDialogOpen(true)}
            className={cn(!token?.hasToken && 'text-destructive')}
            aria-label="Токен T-Invest"
          >
            <KeyRound className="h-4 w-4" />
          </Button>
        </Tooltip>

        <Tooltip content="Настройки">
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Настройки">
            <Settings2 className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>

      <div className="no-scrollbar order-last flex w-full items-center gap-0.5 overflow-x-auto border-t pt-1.5 md:hidden">
        {TIMEFRAMES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTimeframe(item.id)}
            className={cn(
              'h-6 rounded px-2 text-[11px] font-medium transition-colors',
              timeframe === item.id
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {item.short}
          </button>
        ))}
      </div>
    </header>
  );
}
