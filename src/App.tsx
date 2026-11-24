import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { TopBar } from '@/components/layout/TopBar';
import { MobileNav } from '@/components/layout/MobileNav';
import { ChartPanel } from '@/features/chart/ChartPanel';
import { OrderBookPanel } from '@/features/orderbook/OrderBookPanel';
import { IndicatorPanel } from '@/features/indicators/IndicatorPanel';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { TokenDialog } from '@/features/settings/TokenDialog';
import { useApplyTheme } from '@/features/theme/useApplyTheme';
import { useBootstrap } from '@/features/api/useBootstrap';
import { useMarketData } from '@/features/market/useMarketData';
import { useIndicators } from '@/features/indicators/useIndicators';
import { useAppStore, useSettingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

export default function App() {
  useApplyTheme();
  useBootstrap();
  useMarketData();
  const indicatorResults = useIndicators();

  const mobileTab = useAppStore((state) => state.mobileTab);
  const showOrderBook = useSettingsStore((state) => state.showOrderBook);
  const editorOpen = useSettingsStore((state) => state.editorOpen);
  const editorHeight = useSettingsStore((state) => state.editorHeight);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <TopBar />

        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col',
              mobileTab !== 'chart' && mobileTab !== 'orderbook' && 'hidden md:flex',
            )}
          >
            <div className="flex min-h-0 flex-1">
              <div
                className={cn(
                  'flex min-h-0 min-w-0 flex-1 flex-col',
                  mobileTab !== 'chart' && 'hidden md:flex',
                )}
              >
                <ChartPanel indicators={indicatorResults} />
              </div>

              <div
                className={cn(
                  'min-h-0 flex-col',
                  mobileTab === 'orderbook' ? 'flex' : 'hidden',
                  showOrderBook ? 'md:flex' : 'md:hidden',
                )}
              >
                <div className="h-full w-full md:w-[286px]">
                  <OrderBookPanel />
                </div>
              </div>
            </div>

            <div className="hidden shrink-0 md:block" style={{ height: editorOpen ? editorHeight : 36 }}>
              <IndicatorPanel results={indicatorResults} />
            </div>
          </div>

          <div
            className={cn(
              'min-h-0 flex-1 flex-col',
              mobileTab === 'indicators' ? 'flex' : 'hidden md:hidden',
            )}
          >
            <IndicatorPanel results={indicatorResults} mobile />
          </div>
        </div>

        <MobileNav />
      </div>

      <SettingsDialog />
      <TokenDialog />
      <Toaster />
    </TooltipProvider>
  );
}
