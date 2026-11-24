import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type LineWidth,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useSettingsStore, type ChartColors } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';
import { formatCompact, formatPrice, precisionForPrice } from '@/lib/utils';
import type { Candle } from '@/features/api/types';
import type { IndicatorRunResult } from '@/features/indicators/types';
import { DrawingLayer } from './DrawingLayer';

interface ChartSurfaceProps {
  indicators: IndicatorRunResult[];
}

interface LegendInfo {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
}

interface IndicatorSeriesEntry {
  series: ISeriesApi<SeriesType>;
  pane: number;
  type: string;
}

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return hex;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function volumeData(candles: Candle[], colors: ChartColors) {
  return candles.map((candle) => ({
    time: candle.time as UTCTimestamp,
    value: candle.volume,
    color: candle.close >= candle.open ? withAlpha(colors.bull, 0.35) : withAlpha(colors.bear, 0.35),
  }));
}

export function ChartSurface({ indicators }: ChartSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const candleByTimeRef = useRef(new Map<number, Candle>());
  const colorsRef = useRef(useSettingsStore.getState().chart);
  const [chart, setChart] = useState<IChartApi | null>(null);
  const [candleSeries, setCandleSeries] = useState<ISeriesApi<'Candlestick'> | null>(null);
  const [hover, setHover] = useState<LegendInfo | null>(null);

  const instrument = useTerminalStore((state) => state.instrument);
  const timeframe = useTerminalStore((state) => state.timeframe);
  const candles = useTerminalStore((state) => state.candles);
  const status = useTerminalStore((state) => state.status);
  const error = useTerminalStore((state) => state.error);
  const colors = useSettingsStore((state) => state.chart);
  const showGrid = useSettingsStore((state) => state.showGrid);
  const showVolume = useSettingsStore((state) => state.showVolume);

  const fitKeyRef = useRef('');
  const indicatorSeriesRef = useRef(new Map<string, IndicatorSeriesEntry>());
  const indicatorPanesRef = useRef(new Map<string, number>());

  useEffect(() => {
    colorsRef.current = colors;
  }, [colors]);

  // Chart lifecycle: created once, destroyed on unmount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chartInstance = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colorsRef.current.background },
        textColor: colorsRef.current.text,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: colorsRef.current.grid, style: LineStyle.Solid },
        horzLines: { color: colorsRef.current.grid, style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: colorsRef.current.crosshair,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: colorsRef.current.crosshair,
        },
        horzLine: {
          color: colorsRef.current.crosshair,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: colorsRef.current.crosshair,
        },
      },
      rightPriceScale: {
        borderColor: colorsRef.current.grid,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: colorsRef.current.grid,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 9,
      },
      localization: { locale: 'ru-RU' },
    });

    const candle = chartInstance.addSeries(CandlestickSeries, {
      upColor: colorsRef.current.bull,
      downColor: colorsRef.current.bear,
      borderUpColor: colorsRef.current.bull,
      borderDownColor: colorsRef.current.bear,
      wickUpColor: colorsRef.current.bull,
      wickDownColor: colorsRef.current.bear,
      priceLineVisible: false,
    });

    const volume = chartInstance.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chartInstance;
    candleSeriesRef.current = candle;
    volumeSeriesRef.current = volume;
    setChart(chartInstance);
    setCandleSeries(candle);

    let raf = 0;
    const pushHover = (info: LegendInfo | null) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setHover(info);
      });
    };

    chartInstance.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
      const data = param.seriesData.get(candle) as CandlestickData<Time> | undefined;
      if (!param.time || !data) {
        pushHover(null);
        return;
      }
      const time = Number(param.time);
      const candleValue = candleByTimeRef.current.get(time);
      const previous = candleByTimeRef.current.get(time - 1);
      pushHover({
        time,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: candleValue?.volume ?? 0,
        change:
          candleValue && previous && previous.close
            ? ((data.close - previous.close) / previous.close) * 100
            : 0,
      });
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      chartInstance.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      indicatorSeriesRef.current.clear();
      indicatorPanesRef.current.clear();
    };
  }, []);

  // Apply theme / grid / candle colours.
  useEffect(() => {
    if (!chart || !candleSeries) return;
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid, visible: showGrid, style: LineStyle.Solid },
        horzLines: { color: colors.grid, visible: showGrid, style: LineStyle.Solid },
      },
      crosshair: {
        vertLine: {
          color: colors.crosshair,
          labelBackgroundColor: colors.crosshair,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: colors.crosshair,
          labelBackgroundColor: colors.crosshair,
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: { borderColor: colors.grid },
      timeScale: { borderColor: colors.grid },
    });
    candleSeries.applyOptions({
      upColor: colors.bull,
      downColor: colors.bear,
      borderUpColor: colors.bull,
      borderDownColor: colors.bear,
      wickUpColor: colors.bull,
      wickDownColor: colors.bear,
    });
    if (candles.length && volumeSeriesRef.current) {
      volumeSeriesRef.current.setData(volumeData(candles, colors));
      volumeSeriesRef.current.applyOptions({ visible: showVolume });
    }
  }, [chart, candleSeries, colors, showGrid, showVolume, candles]);

  // Price data.
  useEffect(() => {
    if (!chart || !candleSeries) return;
    const data = candles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
    candleSeries.setData(data);
    volumeSeriesRef.current?.setData(volumeData(candles, colorsRef.current));
    volumeSeriesRef.current?.applyOptions({ visible: showVolume });

    candleByTimeRef.current = new Map(candles.map((candle) => [candle.time, candle]));

    const last = candles[candles.length - 1]?.close;
    const precision = precisionForPrice(last);
    candleSeries.applyOptions({
      priceFormat: { type: 'price', precision, minMove: 10 ** -precision },
    });

    const fitKey = `${instrument?.id ?? ''}:${timeframe}`;
    if (fitKeyRef.current !== fitKey && candles.length) {
      chart.timeScale().fitContent();
      fitKeyRef.current = fitKey;
    }
    if (!candles.length) {
      setHover(null);
    }
  }, [chart, candleSeries, candles, instrument?.id, timeframe, showVolume]);

  // Indicators: reconcile series and panes without touching the price series.
  useEffect(() => {
    if (!chart || !candleSeries || !candles.length) {
      for (const entry of indicatorSeriesRef.current.values()) {
        chart?.removeSeries(entry.series);
      }
      indicatorSeriesRef.current.clear();
      return;
    }
    const times = candles.map((candle) => candle.time as UTCTimestamp);
    const usedKeys = new Set<string>();
    const usedPanes = new Set<string>();

    const paneFor = (indicatorId: string): number => {
      const existing = indicatorPanesRef.current.get(indicatorId);
      if (existing !== undefined) return existing;
      const pane = chart.addPane();
      pane.setHeight(150);
      const index = pane.paneIndex();
      indicatorPanesRef.current.set(indicatorId, index);
      return index;
    };

    for (const result of indicators) {
      if (result.error) continue;
      for (const plot of result.plots) {
        const paneIndex = plot.pane === 'main' ? 0 : paneFor(result.indicatorId);
        if (paneIndex !== 0) usedPanes.add(result.indicatorId);
        const key = `${result.indicatorId}:p:${plot.key}:${plot.type}:${paneIndex}`;
        usedKeys.add(key);
        let entry = indicatorSeriesRef.current.get(key);
        if (!entry) {
          const options = {
              color: plot.color,
              lineWidth: plot.lineWidth as LineWidth,
              priceLineVisible: false,
              lastValueVisible: false,
            crosshairMarkerVisible: false,
          };
          const series =
            plot.type === 'histogram'
              ? chart.addSeries(HistogramSeries, options, paneIndex)
              : plot.type === 'area'
                ? chart.addSeries(AreaSeries, options, paneIndex)
                : chart.addSeries(LineSeries, options, paneIndex);
          entry = { series, pane: paneIndex, type: plot.type };
          indicatorSeriesRef.current.set(key, entry);
        }
        entry.series.setData(
          plot.points.map((point) => ({
            time: point.time as UTCTimestamp,
            value: point.value,
            color: point.color,
          })),
        );
      }

      for (const hline of result.hlines) {
        const paneIndex = hline.pane === 'main' ? 0 : paneFor(result.indicatorId);
        if (paneIndex !== 0) usedPanes.add(result.indicatorId);
        const key = `${result.indicatorId}:h:${hline.key}:${hline.style}:${paneIndex}`;
        usedKeys.add(key);
        let entry = indicatorSeriesRef.current.get(key);
        if (!entry) {
          const series = chart.addSeries(
            LineSeries,
            {
              color: hline.color,
              lineWidth: 1 as LineWidth,
              lineStyle:
                hline.style === 'dashed'
                  ? LineStyle.Dashed
                  : hline.style === 'dotted'
                    ? LineStyle.Dotted
                    : LineStyle.Solid,
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: false,
            },
            paneIndex,
          );
          entry = { series, pane: paneIndex, type: 'hline' };
          indicatorSeriesRef.current.set(key, entry);
        }
        entry.series.setData(
          times.map((time) => ({ time, value: hline.value }) as LineData),
        );
      }
    }

    for (const [key, entry] of indicatorSeriesRef.current) {
      if (usedKeys.has(key)) continue;
      chart.removeSeries(entry.series);
      indicatorSeriesRef.current.delete(key);
    }

    const stalePanes = [...indicatorPanesRef.current.entries()]
      .filter(([indicatorId]) => !usedPanes.has(indicatorId))
      .sort((a, b) => b[1] - a[1]);
    for (const [indicatorId, paneIndex] of stalePanes) {
      chart.removePane(paneIndex);
      indicatorPanesRef.current.delete(indicatorId);
    }
  }, [chart, candleSeries, indicators, candles]);

  const legend = useMemo<LegendInfo | null>(() => {
    if (hover) return hover;
    const last = candles[candles.length - 1];
    if (!last) return null;
    const previous = candles[candles.length - 2];
    return {
      time: last.time,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      volume: last.volume,
      change: previous ? ((last.close - previous.close) / previous.close) * 100 : 0,
    };
  }, [hover, candles]);

  const precision = precisionForPrice(legend?.close ?? candles[candles.length - 1]?.close);
  const changeColor = legend && legend.change >= 0 ? colors.bull : colors.bear;

  return (
    <div className="relative h-full w-full min-h-0 min-w-0 chart-surface">
      <div ref={containerRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute left-2 top-12 z-20 flex flex-col gap-1 md:left-14 md:top-2">
        <div className="flex items-center gap-2 text-[11px] leading-none">
          <span className="font-semibold text-[13px]">{instrument?.ticker ?? '—'}</span>
          {instrument && <span className="text-muted-foreground">{instrument.name}</span>}
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
            {timeframe}
          </span>
          {instrument?.exchange && (
            <span className="text-[10px] text-muted-foreground">{instrument.exchange}</span>
          )}
        </div>

        {legend && (
          <div className="tnum flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] leading-none">
            <span>
              <span className="text-muted-foreground">O</span>{' '}
              <span style={{ color: legend.open >= legend.close ? colors.bear : colors.bull }}>
                {formatPrice(legend.open, precision)}
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">H</span>{' '}
              <span style={{ color: colors.bull }}>{formatPrice(legend.high, precision)}</span>
            </span>
            <span>
              <span className="text-muted-foreground">L</span>{' '}
              <span style={{ color: colors.bear }}>{formatPrice(legend.low, precision)}</span>
            </span>
            <span>
              <span className="text-muted-foreground">C</span>{' '}
              <span style={{ color: changeColor }}>{formatPrice(legend.close, precision)}</span>
            </span>
            <span style={{ color: changeColor }}>
              {legend.change >= 0 ? '+' : ''}
              {legend.change.toFixed(2)}%
            </span>
            <span className="text-muted-foreground">Vol {formatCompact(legend.volume)}</span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(legend.time * 1000).toLocaleString('ru-RU')}
            </span>
          </div>
        )}
      </div>

      {chart && candleSeries && <DrawingLayer chart={chart} series={candleSeries} />}

      {!instrument && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/60">
          <div className="text-center">
            <p className="text-sm font-medium">Выберите инструмент</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Поиск по тикеру или названию — в панели сверху
            </p>
          </div>
        </div>
      )}

      {status === 'loading' && !candles.length && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Загрузка свечей…
          </div>
        </div>
      )}

      {status === 'error' && !candles.length && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/60">
          <div className="max-w-sm px-4 text-center">
            <p className="text-sm font-medium text-destructive">Нет данных</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Проверьте токен в настройках и доступность T-Invest API.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
