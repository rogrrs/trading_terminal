import type { IndicatorRunResult } from '@/features/indicators/types';
import { ChartSurface } from './ChartSurface';
import { ChartToolbar } from './ChartToolbar';

export function ChartPanel({ indicators }: { indicators: IndicatorRunResult[] }) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <ChartToolbar />
      <ChartSurface indicators={indicators} />
    </div>
  );
}
