import { describe, expect, it } from 'vitest';
import { transpilePine } from './transpiler';

describe('transpilePine', () => {
  it('converts keyword arguments into an options object', () => {
    const result = transpilePine(`//@version=5
indicator("RSI", overlay=false)
len = input(14, "Length")
r = ta.rsi(close, len)
plot(r, "RSI", color=color.new(color.red, 20), linewidth=2)
hline(70, "OB", color=color.red)
`);

    expect(result.title).toBe('RSI');
    expect(result.overlay).toBe(false);
    expect(result.code).toContain('indicator("RSI", { overlay: false });');
    expect(result.code).toContain('let len = input(14, "Length");');
    expect(result.code).toContain('let r = ta.rsi(close, len);');
    expect(result.code).toContain('plot(r, "RSI", { color: color.new(color.red, 20), linewidth: 2 });');
    expect(result.code).toContain('hline(70, "OB", { color: color.red });');
  });

  it('converts indentation-based if/else blocks', () => {
    const result = transpilePine(`//@version=5
indicator("X")
x = 0
if close > open
    x := 1
else
    x := 2
plot(x)
`);

    expect(result.code).toContain('let x = 0;');
    expect(result.code).toContain('if (close > open) {');
    expect(result.code).toContain('x = 1;');
    expect(result.code).toContain('else {');
    expect(result.code).toContain('x = 2;');
  });

  it('converts operators, na and hex colors', () => {
    const result = transpilePine(`//@version=5
indicator("X")
long = not na(close) and close > open or high > low
plot(close, color=#2962ff)
`);

    expect(result.code).toContain('let long = !na(close) && close > open || high > low;');
    expect(result.code).toContain("color: '#2962ff'");
  });

  it('handles line continuations', () => {
    const result = transpilePine(`//@version=5
indicator("X")
plot(ta.sma(close, 20),
     "SMA",
     color=color.aqua)
`);

    expect(result.code).toContain('plot(ta.sma(close, 20), "SMA", { color: color.aqua });');
  });

  it('converts for loops and warns about state', () => {
    const result = transpilePine(`//@version=5
indicator("X")
var float acc = 0
for i = 0 to 10
    acc := acc + close[i]
plot(acc)
`);

    expect(result.code).toContain('for (let i = 0; i <= 10; i += 1)');
    expect(result.warnings.join(' ')).toMatch(/var/);
    expect(result.warnings.join(' ')).toMatch(/Циклы/);
  });

  it('keeps multiline functions readable and warns', () => {
    const result = transpilePine(`//@version=5
indicator("X")
f(x) => x + 1
plot(f(close))
`);

    expect(result.code).toContain('function f(x) { return x + 1; }');
    expect(result.warnings.join(' ')).toMatch(/Функция f/);
  });
});
