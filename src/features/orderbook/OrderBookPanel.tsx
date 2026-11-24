import { useMemo } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useTerminalStore } from '@/stores/terminal';
import { useSettingsStore } from '@/stores/settings';
import { useAppStore } from '@/stores/settings';
import { formatCompact, formatPrice, precisionForPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export function OrderBookPanel() {
  const book = useTerminalStore((state) => state.orderBook);
  const status = useTerminalStore((state) => state.orderBookStatus);
  const instrument = useTerminalStore((state) => state.instrument);
  const loadOrderBook = useTerminalStore((state) => state.loadOrderBook);
  const depth = useSettingsStore((state) => state.orderBookDepth);
  const setDepth = useSettingsStore((state) => state.setOrderBookDepth);
  const setShowOrderBook = useSettingsStore((state) => state.setShowOrderBook);
  const setMobileTab = useAppStore((state) => state.setMobileTab);

  const asks = useMemo(() => (book?.asks ?? []).slice(0, depth).reverse(), [book, depth]);
  const bids = useMemo(() => (book?.bids ?? []).slice(0, depth), [book, depth]);
  const maxQuantity = Math.max(
    1,
    ...asks.map((level) => level.quantity),
    ...bids.map((level) => level.quantity),
  );
  const bidVolume = bids.reduce((total, level) => total + level.quantity, 0);
  const askVolume = asks.reduce((total, level) => total + level.quantity, 0);
  const totalVolume = bidVolume + askVolume;
  const bidShare = totalVolume ? (bidVolume / totalVolume) * 100 : 50;
  const askShare = 100 - bidShare;

  const bestBid = bids[0];
  const bestAsk = asks[asks.length - 1];
  const spread = bestBid && bestAsk ? bestAsk.price - bestBid.price : null;
  const spreadPercent = spread !== null && bestAsk ? (spread / bestAsk.price) * 100 : null;
  const precision = precisionForPrice(bestAsk?.price ?? bestBid?.price ?? instrument?.minPriceIncrement);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l bg-card md:w-[286px] md:shrink-0">
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b px-2">
        <span className="text-xs font-semibold">Стакан</span>
        <span className="text-[10px] text-muted-foreground">{instrument?.ticker ?? ''}</span>
        <div className="ml-auto flex items-center gap-1">
          <Select value={String(depth)} onValueChange={(value) => setDepth(Number(value))}>
            <SelectTrigger className="h-6 w-[62px] border-none bg-secondary px-1.5 text-[10px] shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50].map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value} уровней
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tooltip content="Обновить">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void loadOrderBook(depth)}
              aria-label="Обновить стакан"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', status === 'loading' && 'animate-spin')} />
            </Button>
          </Tooltip>
          <Tooltip content="Скрыть">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setShowOrderBook(false);
                setMobileTab('chart');
              }}
              aria-label="Скрыть стакан"
              className="hidden md:inline-flex"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="shrink-0 border-b px-2.5 py-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-up">Покупка {bidShare.toFixed(0)}%</span>
          <span className="text-down">Продажа {askShare.toFixed(0)}%</span>
        </div>
        <div className="mt-1 flex h-1 overflow-hidden rounded-full bg-secondary">
          <div className="bg-up transition-all" style={{ width: `${bidShare}%` }} />
          <div className="bg-down transition-all" style={{ width: `${askShare}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Спред</span>
          <span className="tnum font-medium text-foreground">
            {spread !== null ? `${formatPrice(spread, Math.max(precision, 2))} · ${spreadPercent?.toFixed(3)}%` : '—'}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden px-1.5 py-1">
        <div className="flex shrink-0 items-center justify-between px-1 pb-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
          <span>Цена</span>
          <span>Объём</span>
        </div>

        <div className="flex min-h-0 flex-col justify-end overflow-hidden">
          {asks.map((level, index) => (
            <OrderRow
              key={`${level.price}:${index}`}
              price={level.price}
              quantity={level.quantity}
              maxQuantity={maxQuantity}
              precision={precision}
              side="ask"
            />
          ))}
        </div>

        <div className="my-1 h-px bg-border" />

        <div className="flex min-h-0 flex-col overflow-hidden">
          {bids.map((level, index) => (
            <OrderRow
              key={`${level.price}:${index}`}
              price={level.price}
              quantity={level.quantity}
              maxQuantity={maxQuantity}
              precision={precision}
              side="bid"
            />
          ))}
        </div>

        {status === 'loading' && !book && (
          <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
            Загрузка стакана…
          </div>
        )}
        {status === 'error' && !book && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-3 text-center text-[11px] text-muted-foreground">
            <span>Нет данных</span>
            <span className="text-destructive">Проверьте токен и доступность API</span>
          </div>
        )}
        {status === 'ready' && !book && (
          <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
            Стакан пуст
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t px-2.5 py-1 text-[9px] text-muted-foreground">
        <span>Глубина {book?.depth ?? depth}</span>
        <span>{book?.time ? new Date(book.time).toLocaleTimeString('ru-RU') : ''}</span>
      </div>
    </aside>
  );
}

function OrderRow({
  price,
  quantity,
  maxQuantity,
  precision,
  side,
}: {
  price: number;
  quantity: number;
  maxQuantity: number;
  precision: number;
  side: 'bid' | 'ask';
}) {
  const width = Math.max(2, (quantity / maxQuantity) * 100);
  return (
    <div className="relative flex h-[22px] shrink-0 items-center px-1 text-[11px]">
      <div
        className={cn('absolute inset-y-0 right-0', side === 'bid' ? 'bg-up/10' : 'bg-down/10')}
        style={{ width: `${width}%` }}
      />
      <span className={cn('tnum relative flex-1', side === 'bid' ? 'text-up' : 'text-down')}>
        {formatPrice(price, precision)}
      </span>
      <span className="tnum relative w-20 text-right text-muted-foreground">
        {formatCompact(quantity)}
      </span>
    </div>
  );
}
