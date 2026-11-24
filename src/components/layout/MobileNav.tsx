import { BookOpen, ChartCandlestick, FlaskConical, Settings2 } from 'lucide-react';
import { useAppStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'chart' as const, label: 'График', icon: ChartCandlestick },
  { id: 'orderbook' as const, label: 'Стакан', icon: BookOpen },
  { id: 'indicators' as const, label: 'Индикаторы', icon: FlaskConical },
  { id: 'settings' as const, label: 'Настройки', icon: Settings2 },
];

export function MobileNav() {
  const tab = useAppStore((state) => state.mobileTab);
  const setTab = useAppStore((state) => state.setMobileTab);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);

  return (
    <nav className="flex shrink-0 border-t bg-background md:hidden" aria-label="Основная навигация">
      {TABS.map((item) => {
        const Icon = item.icon;
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === 'settings') {
                setSettingsOpen(true);
                return;
              }
              setTab(item.id);
            }}
            className={cn(
              'flex h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[9px] font-medium transition-colors',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className={cn('h-4 w-4', active && 'stroke-[2.2]')} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
