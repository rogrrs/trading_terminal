import type { IChartApi, ISeriesApi, Logical, SeriesType } from 'lightweight-charts';
import type { Drawing, DrawingPoint } from '@/stores/drawings';

export interface XY {
  x: number;
  y: number;
}

export function pointToXY(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  point: DrawingPoint,
): XY | null {
  const x = chart.timeScale().logicalToCoordinate(point.logical as Logical);
  const y = series.priceToCoordinate(point.price);
  if (x === null || y === null) return null;
  return { x: x as number, y: y as number };
}

export function distanceToSegment(point: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

export function rectOf(a: XY, b: XY): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

/** Extends a segment from `a` through `b` to the right edge of the pane. */
export function extendRay(a: XY, b: XY, width: number): XY {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 0.0001) return { x: a.x, y: b.y >= a.y ? 100000 : -100000 };
  const t = (width - a.x) / dx;
  return { x: width, y: a.y + dy * t };
}

export function hitTestDrawing(
  drawing: Drawing,
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  pointer: XY,
  width: number,
): boolean {
  const points = drawing.points
    .map((point) => pointToXY(chart, series, point))
    .filter((point): point is XY => point !== null);
  if (!points.length) return false;

  if (drawing.kind === 'hline') {
    return Math.abs(pointer.y - points[0]!.y) <= 6;
  }

  if (drawing.kind === 'rect' || drawing.kind === 'measure') {
    if (points.length < 2) return false;
    const rect = rectOf(points[0]!, points[1]!);
    const inside =
      pointer.x >= rect.x - 6 &&
      pointer.x <= rect.x + rect.w + 6 &&
      pointer.y >= rect.y - 6 &&
      pointer.y <= rect.y + rect.h + 6;
    if (inside) return true;
    return (
      distanceToSegment(pointer, points[0]!, { x: points[1]!.x, y: points[0]!.y }) <= 6 ||
      distanceToSegment(pointer, points[1]!, { x: points[0]!.x, y: points[1]!.y }) <= 6
    );
  }

  if (points.length < 2) return false;
  const a = points[0]!;
  let b = points[1]!;
  if (drawing.kind === 'ray') b = extendRay(a, b, width);
  return distanceToSegment(pointer, a, b) <= 6;
}
