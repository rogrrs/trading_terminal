import { describe, expect, it } from 'vitest';
import { runIndicator } from './runtime';
import { transpilePine } from './transpiler';
import type { MarketData } from './types';

function sample(length = 60): MarketData {
  const time: number[] = [];
  const open: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const close: number[] = [];
  const volume: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const base = 100 + Math.sin(i / 5) * 10 + i * 0.2;
    time.push(1_700_000_000 + i * 60);
    open.push(base);
    high.push(base + 1);
    low.push(base - 1);
    close.push(base + Math.cos(i / 3));
    volume.push(1000 + i * 10);
  }
  return { time, open, high, low, close, volume };
}

describe('indicator runtime', () => {
  it('computes SMA aligned with bars', () => {
    const result = runIndicator(
      `plot(ta.sma(close, 3), "SMA");
       indicator("SMA", { overlay: true });`,
      sample(10),
    );
    const plot = result.plots[0]!;
    const data = sample(10);
    expect(plot.points[0]!.value).toBeNaN();
    expect(plot.points[2]!.value).toBeCloseTo(
      (data.close[0]! + data.close[1]! + data.close[2]!) / 3,
      8,
    );
    expect(result.overlay).toBe(true);
  });

  it('computes RSI inside 0..100', () => {
    const result = runIndicator(`indicator("RSI"); plot(ta.rsi(close, 14), "RSI");`, sample());
    const values = result.plots[0]!.points.map((point) => point.value).filter((value) => Number.isFinite(value));
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('returns macd as both tuple and object', () => {
    const result = runIndicator(
      `indicator("MACD");
       const [m, s, h] = ta.macd(close, 12, 26, 9);
       plot(m, "MACD");
       plot(ta.macd(close).signal, "Signal");`,
      sample(),
    );
    expect(result.plots).toHaveLength(2);
    expect(result.plots[0]!.points.length).toBe(60);
  });

  it('collects hlines and per-bar colors', () => {
    const result = runIndicator(
      `indicator("X");
       hline(70, "OB");
       plot(volume, "Vol", { style: "histogram", color: close >= open ? "#089981" : "#f23645" });`,
      sample(),
    );
    expect(result.hlines).toHaveLength(1);
    expect(result.hlines[0]!.value).toBe(70);
    expect(result.plots[0]!.type).toBe('histogram');
  });

  it('reports runtime errors without throwing', () => {
    const result = runIndicator(`indicator("Bad"); plot(unknownFunction(close));`, sample());
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('unknownFunction');
  });

  it('runs the built-in Pine examples after transpiling', () => {
    const pine = `//@version=5
indicator("RSI 14", overlay=false)
len = input(14, "Length")
src = input(close, "Source")
rsi = ta.rsi(src, len)
plot(rsi, "RSI", color=color.new(color.purple, 0), linewidth=2)
hline(70, "Overbought", color=color.new(color.red, 40))
hline(30, "Oversold", color=color.new(color.green, 40))
`;
    const { code, warnings } = transpilePine(pine);
    const result = runIndicator(code, sample());
    expect(result.error).toBeUndefined();
    expect(result.plots).toHaveLength(1);
    expect(result.hlines).toHaveLength(2);
    expect(warnings.some((warning) => warning.includes('var'))).toBe(false);
  });
});
