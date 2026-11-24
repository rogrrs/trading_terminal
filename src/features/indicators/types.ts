export type PlotType = 'line' | 'histogram' | 'area';

export interface PlotPoint {
  time: number;
  value: number;
  color?: string;
}

export interface IndicatorPlot {
  key: string;
  title: string;
  type: PlotType;
  color: string;
  lineWidth: number;
  pane: 'main' | 'separate';
  points: PlotPoint[];
}

export interface IndicatorHLine {
  key: string;
  value: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  title?: string;
  pane: 'main' | 'separate';
}

export interface MarketData {
  time: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

export interface IndicatorRunResult {
  indicatorId: string;
  name: string;
  overlay: boolean;
  plots: IndicatorPlot[];
  hlines: IndicatorHLine[];
  warnings: string[];
  error?: string;
}

export interface RuntimeResult {
  name: string;
  overlay: boolean;
  plots: IndicatorPlot[];
  hlines: IndicatorHLine[];
  warnings: string[];
  error?: string;
}
