import { ArrowUpRight, Minus, MousePointer2, Move, Ruler, Square, Trash2, TrendingUp } from 'lucide-react';
import { useAppStore, type ToolId } from '@/stores/settings';
import { useDrawingStore, type Drawing } from '@/stores/drawings';
import { useTerminalStore } from '@/stores/terminal';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const EMPTY_DRAWINGS: Drawing[] = [];

const TOOLS: Array<{ id: ToolId; label: string; icon: typeof Minus }> = [
  { id: 'cursor', label: 'Курсор', icon: MousePointer2 },
  { id: 'select', label: 'Выбрать / переместить', icon: Move },
  { id: 'hline', label: 'Горизонтальный уровень', icon: Minus },
  { id: 'trend', label: 'Трендовая линия', icon: TrendingUp },
  { id: 'ray', label: 'Луч', icon: ArrowUpRight },
  { id: 'rect', label: 'Прямоугольник (зона)', icon: Square },
  { id: 'measure', label: 'Линейка', icon: Ruler },
];

export function ChartToolbar() {
  const tool = useAppStore((state) => state.activeTool);
  const setTool = useAppStore((state) => state.setActiveTool);
  const symbol = useTerminalStore((state) => state.instrument?.id ?? '');
  const drawings = useDrawingStore((state) => (symbol ? state.bySymbol[symbol] : undefined)) ?? EMPTY_DRAWINGS;
  const clear = useDrawingStore((state) => state.clear);

  return (
    <div className="absolute left-2 right-2 top-2 z-30 flex gap-1 md:right-auto md:flex-col">
      <div className="no-scrollbar flex gap-0.5 overflow-x-auto rounded-md border bg-card/90 p-0.5 shadow-sm backdrop-blur md:flex-col md:gap-0.5">
        {TOOLS.map((item) => {
          const Icon = item.icon;
          const active = tool === item.id;
          return (
            <Tooltip key={item.id} content={item.label} side="right">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setTool(item.id)}
                className={cn('shrink-0', active && 'bg-primary/15 text-primary')}
                aria-label={item.label}
                aria-pressed={active}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          );
        })}

        <div className="mx-1 h-px bg-border md:my-1 md:h-auto md:w-px" />

        <Tooltip content="Удалить все рисунки" side="right">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => clear(symbol)}
            disabled={!drawings.length}
            className="shrink-0 text-muted-foreground hover:text-destructive"
            aria-label="Удалить все рисунки"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
