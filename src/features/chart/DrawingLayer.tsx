import { useCallback, useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts';
import { useAppStore } from '@/stores/settings';
import { useDrawingStore, type Drawing, type DrawingKind, type DrawingPoint } from '@/stores/drawings';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';
import { extendRay, hitTestDrawing, pointToXY, rectOf, type XY } from './drawingGeometry';

interface DrawingLayerProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
}

interface Preview {
  kind: DrawingKind;
  points: DrawingPoint[];
}

const TOOL_COLOR: Record<string, string> = {
  hline: '#2962ff',
  trend: '#2962ff',
  ray: '#ff9800',
  rect: '#9c27b0',
  measure: '#00bcd4',
};

function dashed(ctx: CanvasRenderingContext2D, on: boolean) {
  ctx.setLineDash(on ? [6, 4] : []);
}

export function DrawingLayer({ chart, series }: DrawingLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tool = useAppStore((state) => state.activeTool);
  const setActiveTool = useAppStore((state) => state.setActiveTool);
  const symbol = useTerminalStore((state) => state.instrument?.id ?? '');
  const colors = useSettingsStore((state) => state.chart);
  const accent = useSettingsStore((state) => state.accent);
  const drawings = useDrawingStore((state) => (symbol ? state.bySymbol[symbol] ?? [] : []));
  const addDrawing = useDrawingStore((state) => state.add);
  const updatePoints = useDrawingStore((state) => state.updatePoints);
  const removeDrawing = useDrawingStore((state) => state.remove);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendingRef = useRef<Preview | null>(null);
  const dragRef = useRef<{ id: string; start: XY; original: Array<{ point: DrawingPoint; xy: XY }> } | null>(null);
  const rafRef = useRef(0);

  const paneMetrics = useCallback(() => {
    const width = chart.priceScale('right').width?.() ?? 64;
    const height = chart.timeScale().height?.() ?? 26;
    return { axisWidth: width, axisHeight: height };
  }, [chart]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const targetWidth = Math.max(1, Math.round(rect.width * dpr));
      const targetHeight = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const { axisWidth, axisHeight } = paneMetrics();
      const paneWidth = Math.max(0, rect.width - axisWidth);
      const paneHeight = Math.max(0, rect.height - axisHeight);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, paneWidth, paneHeight);
      ctx.clip();

      const text = colors.text;
      const all: Array<{ drawing: Drawing; preview: boolean }> = [
        ...drawings.map((drawing) => ({ drawing, preview: false })),
      ];
      if (pendingRef.current) {
        all.push({
          drawing: {
            id: '__preview',
            kind: pendingRef.current.kind,
            points: pendingRef.current.points,
            color: TOOL_COLOR[pendingRef.current.kind] ?? accent,
            createdAt: 0,
          },
          preview: true,
        });
      }

      for (const { drawing, preview } of all) {
        drawDrawing(ctx, drawing, chart, series, paneWidth, text, preview, drawing.id === selectedId);
      }
      ctx.restore();
    });
  }, [chart, series, drawings, colors.text, accent, selectedId, paneMetrics]);

  useEffect(() => {
    scheduleDraw();
  }, [scheduleDraw, drawings, tool, selectedId, colors, accent]);

  useEffect(() => {
    if (!symbol) return;
    setSelectedId(null);
    pendingRef.current = null;
  }, [symbol]);

  useEffect(() => {
    const onCrosshair = (param: MouseEventParams<Time>) => {
      if (!pendingRef.current) return;
      if (!param.point) return;
      const logical = chart.timeScale().coordinateToLogical(param.point.x);
      const price = series.coordinateToPrice(param.point.y);
      if (logical === null || price === null) return;
      const preview = pendingRef.current;
      const first = preview.points[0]!;
      preview.points = [first, { logical: logical as number, price: price as number }];
      scheduleDraw();
    };
    chart.subscribeCrosshairMove(onCrosshair);

    const onRange = () => scheduleDraw();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    chart.timeScale().subscribeVisibleTimeRangeChange(onRange);

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onRange);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [chart, series, scheduleDraw]);

  const commitPoint = useCallback(
    (logical: number, price: number) => {
      const active = tool;
      if (active === 'cursor' || active === 'select') return;
      const point: DrawingPoint = { logical, price };
      const color = TOOL_COLOR[active] ?? accent;

      if (active === 'hline') {
        addDrawing(symbol, 'hline', [point], color);
        scheduleDraw();
        return;
      }

      const pending = pendingRef.current;
      if (!pending || pending.kind !== (active as DrawingKind)) {
        pendingRef.current = { kind: active as DrawingKind, points: [point] };
        scheduleDraw();
        return;
      }

      addDrawing(symbol, active, [pending.points[0]!, point], color);
      pendingRef.current = null;
      scheduleDraw();
    },
    [tool, accent, addDrawing, symbol, scheduleDraw],
  );

  useEffect(() => {
    const onClick = (param: MouseEventParams<Time>) => {
      if (!param.point) return;
      if (tool === 'cursor' || tool === 'select') return;
      const { axisWidth, axisHeight } = paneMetrics();
      if (param.point.x > (canvasRef.current?.getBoundingClientRect().width ?? 0) - axisWidth) return;
      if (param.point.y > (canvasRef.current?.getBoundingClientRect().height ?? 0) - axisHeight) return;
      const logical = chart.timeScale().coordinateToLogical(param.point.x);
      const price = series.coordinateToPrice(param.point.y);
      if (logical === null || price === null) return;
      commitPoint(logical as number, price as number);
    };
    chart.subscribeClick(onClick);
    return () => chart.unsubscribeClick(onClick);
  }, [chart, series, tool, commitPoint, paneMetrics]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (pendingRef.current) {
          pendingRef.current = null;
          scheduleDraw();
        } else {
          setSelectedId(null);
          setActiveTool('cursor');
        }
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        const target = (event.target as HTMLElement | null)?.tagName;
        if (target === 'INPUT' || target === 'TEXTAREA') return;
        removeDrawing(symbol, selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, symbol, removeDrawing, scheduleDraw, setActiveTool]);

  const localPoint = (event: React.PointerEvent<HTMLCanvasElement>): XY | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== 'select') return;
    const point = localPoint(event);
    if (!point) return;
    const { axisWidth, axisHeight } = paneMetrics();
    const rect = event.currentTarget.getBoundingClientRect();
    if (point.x > rect.width - axisWidth || point.y > rect.height - axisHeight) return;
    const hit = drawings.find((drawing) => hitTestDrawing(drawing, chart, series, point, rect.width - axisWidth));
    if (!hit) {
      setSelectedId(null);
      return;
    }
    setSelectedId(hit.id);
    const original = hit.points.map((p) => {
      const xy = pointToXY(chart, series, p);
      return { point: { ...p }, xy: xy ?? { x: point.x, y: point.y } };
    });
    dragRef.current = { id: hit.id, start: point, original };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== 'select') return;
    const point = localPoint(event);
    const drag = dragRef.current;
    if (!point || !drag) return;
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    const next = drag.original.map(({ point, xy }) => {
      const logical = chart.timeScale().coordinateToLogical(xy.x + dx);
      const price = series.coordinateToPrice(xy.y + dy);
      return {
        logical: logical === null ? point.logical : (logical as number),
        price: price === null ? point.price : (price as number),
      };
    });
    updatePoints(symbol, drag.id, next);
    scheduleDraw();
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10"
      style={{ pointerEvents: tool === 'select' ? 'auto' : 'none', cursor: tool === 'select' ? 'move' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    />
  );
}

function drawDrawing(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  paneWidth: number,
  text: string,
  preview: boolean,
  selected: boolean,
) {
  const points = drawing.points
    .map((point) => pointToXY(chart, series, point))
    .filter((point): point is XY => point !== null);
  if (!points.length) return;

  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = drawing.color;
  ctx.fillStyle = drawing.color;
  dashed(ctx, preview);

  if (drawing.kind === 'hline') {
    const y = points[0]!.y;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(paneWidth, y);
    ctx.stroke();
    ctx.setLineDash([]);
    const price = formatAxis(drawing.points[0]!.price);
    ctx.font = '10px ui-sans-serif, system-ui';
    const width = ctx.measureText(price).width + 10;
    ctx.fillStyle = drawing.color;
    ctx.fillRect(paneWidth - width, y - 8, width, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(price, paneWidth - width + 5, y + 3.5);
    ctx.restore();
    return;
  }

  if (drawing.kind === 'rect') {
    const rect = rectOf(points[0]!, points[1] ?? points[0]!);
    ctx.globalAlpha = 0.12;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.globalAlpha = 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    return;
  }

  if (drawing.kind === 'measure') {
    const a = points[0]!;
    const b = points[1] ?? points[0]!;
    const rect = rectOf(a, b);
    const rising = (drawing.points[1]?.price ?? 0) >= (drawing.points[0]?.price ?? 0);
    const tone = rising ? '#089981' : '#f23645';
    ctx.fillStyle = tone;
    ctx.globalAlpha = 0.16;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = tone;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    const p0 = drawing.points[0]!.price;
    const p1 = drawing.points[1]?.price ?? p0;
    const delta = p1 - p0;
    const percent = p0 !== 0 ? (delta / Math.abs(p0)) * 100 : 0;
    const bars = Math.abs((drawing.points[1]?.logical ?? 0) - drawing.points[0]!.logical);
    const label = `${delta >= 0 ? '+' : ''}${formatAxis(delta)}  (${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%)  ${Math.round(bars)} бар`;
    ctx.font = '10px ui-sans-serif, system-ui';
    const boxWidth = ctx.measureText(label).width + 12;
    const boxHeight = 18;
    const boxX = Math.min(Math.max(4, rect.x), Math.max(4, paneWidth - boxWidth - 4));
    const boxY = Math.max(4, rect.y - boxHeight - 4);
    ctx.fillStyle = tone;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, boxX + 6, boxY + 12.5);
    ctx.restore();
    return;
  }

  let a = points[0]!;
  let b = points[1] ?? points[0]!;
  if (drawing.kind === 'ray') b = extendRay(a, b, paneWidth);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  if (!preview) {
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (selected) {
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (const point of points.slice(0, 2)) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = '10px ui-sans-serif, system-ui';
    ctx.fillStyle = text;
    ctx.fillText(formatAxis(drawing.points[0]!.price), a.x + 8, a.y - 8);
  }
  ctx.restore();
}

function formatAxis(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 3 : 5;
  return value.toFixed(digits);
}
