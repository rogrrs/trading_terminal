import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { useIndicatorStore, type IndicatorDef } from '@/stores/indicators';
import { useSettingsStore } from '@/stores/settings';
import { IndicatorEditor } from './IndicatorEditor';
import type { IndicatorRunResult } from './types';
import { clamp, cn } from '@/lib/utils';

const TEMPLATE = `//@version=5
indicator("Мой индикатор", overlay=false)

len = input(14, "Период")
src = input(close, "Источник")

value = ta.ema(src, len)

plot(value, "EMA", color=color.new(color.blue, 0), linewidth=2)
hline(0, "Ноль", color=color.new(color.gray, 60))
`;

interface IndicatorPanelProps {
  results: IndicatorRunResult[];
  mobile?: boolean;
}

export function IndicatorPanel({ results, mobile = false }: IndicatorPanelProps) {
  const indicators = useIndicatorStore((state) => state.indicators);
  const addIndicator = useIndicatorStore((state) => state.add);
  const toggle = useIndicatorStore((state) => state.toggle);
  const remove = useIndicatorStore((state) => state.remove);
  const editorOpen = useSettingsStore((state) => state.editorOpen);
  const setEditorOpen = useSettingsStore((state) => state.setEditorOpen);
  const editorHeight = useSettingsStore((state) => state.editorHeight);
  const setEditorHeight = useSettingsStore((state) => state.setEditorHeight);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = indicators.find((indicator) => indicator.id === selectedId) ?? indicators[0] ?? null;
  const result = results.find((item) => item.indicatorId === selected?.id);
  const enabledCount = indicators.filter((indicator) => indicator.enabled).length;
  const expanded = mobile || editorOpen;

  const create = () => {
    const created = addIndicator({ name: 'Новый индикатор', code: TEMPLATE, lang: 'pine', enabled: true });
    setSelectedId(created.id);
    setEditorOpen(true);
  };

  const onDelete = (id: string) => {
    remove(id);
    if (selectedId === id) setSelectedId(null);
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = editorHeight;
    const onMove = (moveEvent: PointerEvent) => {
      setEditorHeight(clamp(startHeight + (startY - moveEvent.clientY), 160, 520));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <section className="flex h-full min-h-0 flex-col border-t bg-card">
      {!mobile && (
        <div
          onPointerDown={startResize}
          className="group relative -top-0.5 z-10 h-1.5 shrink-0 cursor-row-resize bg-transparent transition-colors hover:bg-primary/30"
          aria-label="Изменить высоту панели"
        />
      )}

      <header className="flex h-8 shrink-0 items-center gap-1.5 border-b px-2">
        {!mobile && (
          <button
            type="button"
            onClick={() => setEditorOpen(!editorOpen)}
            className="rounded p-0.5 hover:bg-accent"
            aria-label={editorOpen ? 'Свернуть' : 'Развернуть'}
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !editorOpen && '-rotate-90')} />
          </button>
        )}
        <span className="text-[11px] font-semibold">Индикаторы</span>
        <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
          {enabledCount}/{indicators.length}
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip content="Добавить индикатор">
            <Button variant="ghost" size="icon-sm" onClick={create} aria-label="Добавить индикатор">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>
      </header>

      {expanded && (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b p-1 md:w-60 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
            {indicators.length === 0 && (
              <div className="px-2 py-3 text-[11px] text-muted-foreground">Пока пусто</div>
            )}
            {indicators.map((indicator) => (
              <IndicatorListItem
                key={indicator.id}
                indicator={indicator}
                active={selected?.id === indicator.id}
                hasError={Boolean(results.find((item) => item.indicatorId === indicator.id)?.error)}
                onSelect={() => setSelectedId(indicator.id)}
                onToggle={(enabled) => toggle(indicator.id, enabled)}
              />
            ))}
          </div>

          <div className="min-h-0 min-w-0 flex-1">
            <IndicatorEditor indicator={selected} result={result} onDelete={onDelete} />
          </div>
        </div>
      )}
    </section>
  );
}

function IndicatorListItem({
  indicator,
  active,
  hasError,
  onSelect,
  onToggle,
}: {
  indicator: IndicatorDef;
  active: boolean;
  hasError: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div
      className={cn(
        'group flex shrink-0 items-center gap-1.5 rounded px-1.5 py-1 md:w-full',
        active ? 'bg-accent' : 'hover:bg-accent/60',
      )}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            hasError ? 'bg-destructive' : indicator.enabled ? 'bg-up' : 'bg-muted-foreground/50',
          )}
        />
        <span className="truncate text-[11px]">{indicator.name}</span>
        <span className="shrink-0 text-[9px] uppercase text-muted-foreground">
          {indicator.lang === 'pine' ? 'Pine' : 'JS'}
        </span>
      </button>
      <Switch
        checked={indicator.enabled}
        onCheckedChange={onToggle}
        className="scale-75"
        aria-label={`Включить ${indicator.name}`}
      />
    </div>
  );
}
