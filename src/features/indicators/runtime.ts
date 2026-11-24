import type {
  IndicatorHLine,
  IndicatorPlot,
  MarketData,
  PlotPoint,
  RuntimeResult,
} from './types';

/**
 * Pine-compatible runtime. Functions are vectorised over the whole loaded series:
 * `ta.sma(close, 20)` returns an array aligned with `time`.
 *
 * Deliberate limitations (documented in the UI): per-bar state (`var`), loops that
 * build series incrementally, `request.security` and drawing objects are not supported.
 */

const NAN = Number.NaN;
const PALETTE = ['#2962ff', '#ff9800', '#26a69a', '#e91e63', '#9c27b0', '#00bcd4', '#8bc34a', '#ff5722'];

type SeriesInput = number | number[];
type ColorInput = string | string[];

interface RuntimeContext {
  data: MarketData;
  name: string;
  overlay: boolean;
  plots: IndicatorPlot[];
  hlines: IndicatorHLine[];
  warnings: string[];
}

function isSeries(value: unknown): value is number[] {
  return Array.isArray(value);
}

function asSeries(value: SeriesInput, length: number): number[] {
  if (isSeries(value)) return value;
  const constant = Number(value);
  return new Array<number>(length).fill(Number.isFinite(constant) ? constant : NAN);
}

function mean(values: number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function rolling(src: number[], length: number, fn: (window: number[]) => number): number[] {
  const out = new Array<number>(src.length).fill(NAN);
  if (length <= 0) return out;
  for (let i = length - 1; i < src.length; i += 1) {
    const window = src.slice(i - length + 1, i + 1);
    if (window.some((value) => !Number.isFinite(value))) continue;
    out[i] = fn(window);
  }
  return out;
}

function rollingStdev(src: number[], length: number): number[] {
  return rolling(src, length, (window) => {
    const avg = mean(window);
    const variance = mean(window.map((value) => (value - avg) ** 2));
    return Math.sqrt(variance);
  });
}

function rma(src: number[], length: number): number[] {
  const out = new Array<number>(src.length).fill(NAN);
  if (length <= 0) return out;
  let accumulator: number | null = null;
  let seedCount = 0;
  let seedSum = 0;
  for (let i = 0; i < src.length; i += 1) {
    const value = src[i]!;
    if (!Number.isFinite(value)) continue;
    if (accumulator === null) {
      seedSum += value;
      seedCount += 1;
      if (seedCount === length) accumulator = seedSum / length;
      continue;
    }
    accumulator = (accumulator * (length - 1) + value) / length;
    out[i] = accumulator;
  }
  return out;
}

function ema(src: number[], length: number): number[] {
  const out = new Array<number>(src.length).fill(NAN);
  if (length <= 0) return out;
  const alpha = 2 / (length + 1);
  let previous: number | null = null;
  let seedCount = 0;
  let seedSum = 0;
  for (let i = 0; i < src.length; i += 1) {
    const value = src[i]!;
    if (!Number.isFinite(value)) continue;
    if (previous === null) {
      seedSum += value;
      seedCount += 1;
      if (seedCount === length) previous = seedSum / length;
      continue;
    }
    previous = value * alpha + previous * (1 - alpha);
    out[i] = previous;
  }
  return out;
}

function trueRange(data: MarketData): number[] {
  const out = new Array<number>(data.close.length).fill(NAN);
  for (let i = 0; i < data.close.length; i += 1) {
    const high = data.high[i]!;
    const low = data.low[i]!;
    const previousClose = i > 0 ? data.close[i - 1]! : NAN;
    if (!Number.isFinite(high) || !Number.isFinite(low)) continue;
    out[i] = Number.isFinite(previousClose)
      ? Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose))
      : high - low;
  }
  return out;
}

function toColor(value: ColorInput | undefined, fallback: string): string | string[] {
  if (value === undefined || value === null || value === '') return fallback;
  return value;
}

function rgbaFromHex(hex: string, transparency = 0): string {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return hex;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const alpha = Math.max(0, Math.min(1, 1 - transparency / 100));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const COLOR_NAMES: Record<string, string> = {
  red: '#f23645',
  green: '#089981',
  blue: '#2962ff',
  aqua: '#00bcd4',
  cyan: '#00bcd4',
  orange: '#ff9800',
  purple: '#9c27b0',
  yellow: '#ffeb3b',
  white: '#ffffff',
  black: '#000000',
  gray: '#787b86',
  grey: '#787b86',
  teal: '#26a69a',
  maroon: '#880e4f',
  lime: '#8bc34a',
  silver: '#bdc3c7',
  fuchsia: '#e91e63',
  navy: '#1a237e',
  olive: '#808000',
  brown: '#795548',
};

const color = {
  ...COLOR_NAMES,
  new: (hex: string, transparency = 0) => rgbaFromHex(hex || COLOR_NAMES.blue!, transparency),
  rgb: (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`,
  from_gradient: (from: string, to: string) => from || to || COLOR_NAMES.blue!,
} as Record<string, string> & {
  new: (hex: string, transparency?: number) => string;
  rgb: (r: number, g: number, b: number) => string;
  from_gradient: (from: string, to: string) => string;
};

function normalizeColor(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isSeries(value)) return String(value[0] ?? PALETTE[0]);
  return PALETTE[0]!;
}

function createContext(data: MarketData): { ctx: RuntimeContext; globals: Record<string, unknown> } {
  const length = data.close.length;
  const ctx: RuntimeContext = {
    data,
    name: 'Indicator',
    overlay: false,
    plots: [],
    hlines: [],
    warnings: [],
  };

  const warn = (message: string) => {
    if (!ctx.warnings.includes(message)) ctx.warnings.push(message);
  };

  const seriesOf = (value: SeriesInput) => asSeries(value, length);

  const ta = {
    sma: (src: SeriesInput, len: number) => rolling(seriesOf(src), len, mean),
    ema: (src: SeriesInput, len: number) => ema(seriesOf(src), len),
    rma: (src: SeriesInput, len: number) => rma(seriesOf(src), len),
    wma: (src: SeriesInput, len: number) =>
      rolling(seriesOf(src), len, (window) => {
        let total = 0;
        let weights = 0;
        for (let i = 0; i < window.length; i += 1) {
          const weight = i + 1;
          total += window[i]! * weight;
          weights += weight;
        }
        return total / weights;
      }),
    vwma: (src: SeriesInput, len: number) => {
      const source = seriesOf(src);
      const out = new Array<number>(source.length).fill(NAN);
      for (let i = len - 1; i < source.length; i += 1) {
        let priceVolume = 0;
        let volumeSum = 0;
        let valid = true;
        for (let j = i - len + 1; j <= i; j += 1) {
          const price = source[j]!;
          const volume = data.volume[j] ?? 0;
          if (!Number.isFinite(price)) {
            valid = false;
            break;
          }
          priceVolume += price * volume;
          volumeSum += volume;
        }
        if (valid && volumeSum !== 0) out[i] = priceVolume / volumeSum;
      }
      return out;
    },
    stdev: (src: SeriesInput, len: number) => rollingStdev(seriesOf(src), len),
    dev: (src: SeriesInput, len: number) => {
      const source = seriesOf(src);
      const middle = rolling(source, len, mean);
      return source.map((value, index) => value - (middle[index] ?? NAN));
    },
    rsi: (src: SeriesInput, len = 14) => {
      const source = seriesOf(src);
      const out = new Array<number>(source.length).fill(NAN);
      if (len <= 0) return out;
      let avgGain: number | null = null;
      let avgLoss: number | null = null;
      let gainSum = 0;
      let lossSum = 0;
      let count = 0;
      for (let i = 1; i < source.length; i += 1) {
        const change = source[i]! - source[i - 1]!;
        if (!Number.isFinite(change)) continue;
        const gain = Math.max(change, 0);
        const loss = Math.max(-change, 0);
        if (avgGain === null) {
          gainSum += gain;
          lossSum += loss;
          count += 1;
          if (count === len) {
            avgGain = gainSum / len;
            avgLoss = lossSum / len;
            out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
          }
          continue;
        }
        avgGain = (avgGain * (len - 1) + gain) / len;
        avgLoss = (avgLoss! * (len - 1) + loss) / len;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
      return out;
    },
    macd: (src: SeriesInput, fast = 12, slow = 26, signal = 9) => {
      const source = seriesOf(src);
      const fastLine = ema(source, fast);
      const slowLine = ema(source, slow);
      const macdLine = source.map((_, index) => (fastLine[index] ?? NAN) - (slowLine[index] ?? NAN));
      const signalLine = ema(macdLine, signal);
      const histogram = macdLine.map((value, index) => value - (signalLine[index] ?? NAN));
      const tuple = [macdLine, signalLine, histogram] as unknown as [
        number[],
        number[],
        number[],
      ] & { macd: number[]; signal: number[]; histogram: number[] };
      tuple.macd = macdLine;
      tuple.signal = signalLine;
      tuple.histogram = histogram;
      return tuple;
    },
    bb: (src: SeriesInput, len = 20, mult = 2) => {
      const source = seriesOf(src);
      const middle = rolling(source, len, mean);
      const dev = rollingStdev(source, len);
      const upper = middle.map((value, index) => value + mult * (dev[index] ?? NAN));
      const lower = middle.map((value, index) => value - mult * (dev[index] ?? NAN));
      const tuple = [upper, middle, lower] as unknown as [
        number[],
        number[],
        number[],
      ] & { upper: number[]; middle: number[]; lower: number[] };
      tuple.upper = upper;
      tuple.middle = middle;
      tuple.lower = lower;
      return tuple;
    },
    atr: (len = 14) => rma(trueRange(data), len),
    tr: () => trueRange(data),
    highest: (src: SeriesInput, len: number) =>
      rolling(seriesOf(src), len, (window) => Math.max(...window)),
    lowest: (src: SeriesInput, len: number) =>
      rolling(seriesOf(src), len, (window) => Math.min(...window)),
    highestbars: (src: SeriesInput, len: number) =>
      rolling(seriesOf(src), len, (window) => {
        let best = 0;
        for (let i = 1; i < window.length; i += 1) if (window[i]! >= window[best]!) best = i;
        return -(window.length - 1 - best);
      }),
    lowestbars: (src: SeriesInput, len: number) =>
      rolling(seriesOf(src), len, (window) => {
        let best = 0;
        for (let i = 1; i < window.length; i += 1) if (window[i]! <= window[best]!) best = i;
        return -(window.length - 1 - best);
      }),
    change: (src: SeriesInput, len = 1) => {
      const source = seriesOf(src);
      return source.map((value, index) => (index >= len ? value - (source[index - len] ?? NAN) : NAN));
    },
    mom: (src: SeriesInput, len = 1) => ta.change(src, len),
    roc: (src: SeriesInput, len = 1) => {
      const source = seriesOf(src);
      return source.map((value, index) => {
        const previous = index >= len ? source[index - len]! : NAN;
        return Number.isFinite(previous) && previous !== 0 ? ((value - previous) / Math.abs(previous)) * 100 : NAN;
      });
    },
    linreg: (src: SeriesInput, len: number, offset = 0) =>
      rolling(seriesOf(src), len, (window) => {
        const n = window.length;
        const xMean = (n - 1) / 2;
        const yMean = mean(window);
        let numerator = 0;
        let denominator = 0;
        for (let i = 0; i < n; i += 1) {
          numerator += (i - xMean) * (window[i]! - yMean);
          denominator += (i - xMean) ** 2;
        }
        const slope = denominator === 0 ? 0 : numerator / denominator;
        return yMean + slope * (n - 1 - xMean + offset);
      }),
    corr: (a: SeriesInput, b: SeriesInput, len: number) => {
      const left = seriesOf(a);
      const right = seriesOf(b);
      const out = new Array<number>(left.length).fill(NAN);
      for (let i = len - 1; i < left.length; i += 1) {
        const xs = left.slice(i - len + 1, i + 1);
        const ys = right.slice(i - len + 1, i + 1);
        if (xs.some((value) => !Number.isFinite(value)) || ys.some((value) => !Number.isFinite(value))) continue;
        const xMean = mean(xs);
        const yMean = mean(ys);
        let numerator = 0;
        let xDen = 0;
        let yDen = 0;
        for (let j = 0; j < len; j += 1) {
          const x = xs[j]! - xMean;
          const y = ys[j]! - yMean;
          numerator += x * y;
          xDen += x * x;
          yDen += y * y;
        }
        out[i] = xDen === 0 || yDen === 0 ? NAN : numerator / Math.sqrt(xDen * yDen);
      }
      return out;
    },
    median: (src: SeriesInput, len: number) =>
      rolling(seriesOf(src), len, (window) => {
        const sorted = [...window].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
      }),
    sum: (src: SeriesInput, len: number) =>
      rolling(seriesOf(src), len, (window) => window.reduce((total, value) => total + value, 0)),
    cum: (src: SeriesInput) => {
      let total = 0;
      return seriesOf(src).map((value) => {
        if (Number.isFinite(value)) total += value;
        return total;
      });
    },
    crossover: (a: SeriesInput, b: SeriesInput) => {
      const left = seriesOf(a);
      const right = seriesOf(b);
      return left.map((value, index) =>
        index > 0 && left[index - 1]! <= right[index - 1]! && value > (right[index] ?? NAN),
      );
    },
    crossunder: (a: SeriesInput, b: SeriesInput) => {
      const left = seriesOf(a);
      const right = seriesOf(b);
      return left.map((value, index) =>
        index > 0 && left[index - 1]! >= right[index - 1]! && value < (right[index] ?? NAN),
      );
    },
    rising: (src: SeriesInput, len: number) => {
      const source = seriesOf(src);
      return source.map((_, index) => {
        if (index < len) return false;
        for (let i = index - len + 1; i <= index; i += 1) {
          if (!(source[i]! > source[i - 1]!)) return false;
        }
        return true;
      });
    },
    falling: (src: SeriesInput, len: number) => {
      const source = seriesOf(src);
      return source.map((_, index) => {
        if (index < len) return false;
        for (let i = index - len + 1; i <= index; i += 1) {
          if (!(source[i]! < source[i - 1]!)) return false;
        }
        return true;
      });
    },
    barssince: (condition: SeriesInput) => {
      const source = seriesOf(condition).map((value) => value !== 0);
      const out = new Array<number>(source.length).fill(NAN);
      let bars = 0;
      let seen = false;
      for (let i = 0; i < source.length; i += 1) {
        if (source[i]) {
          bars = 0;
          seen = true;
        } else if (seen) {
          bars += 1;
        }
        out[i] = seen ? bars : NAN;
      }
      return out;
    },
    valuewhen: (condition: SeriesInput, src: SeriesInput, occurrence = 0) => {
      const cond = seriesOf(condition);
      const source = seriesOf(src);
      const out = new Array<number>(source.length).fill(NAN);
      for (let i = 0; i < source.length; i += 1) {
        let found = 0;
        for (let j = i; j >= 0; j -= 1) {
          if (!cond[j]) continue;
          if (found === occurrence) {
            out[i] = source[j]!;
            break;
          }
          found += 1;
        }
      }
      return out;
    },
    pivothigh: (src: SeriesInput, left = 1, right = 1) => {
      const source = seriesOf(src);
      const out = new Array<number>(source.length).fill(NAN);
      for (let i = left; i < source.length - right; i += 1) {
        const value = source[i]!;
        let isPivot = true;
        for (let j = 1; j <= left; j += 1) if (source[i - j]! > value) isPivot = false;
        for (let j = 1; j <= right; j += 1) if (source[i + j]! >= value) isPivot = false;
        if (isPivot) out[i] = value;
      }
      return out;
    },
    pivotlow: (src: SeriesInput, left = 1, right = 1) => {
      const source = seriesOf(src);
      const out = new Array<number>(source.length).fill(NAN);
      for (let i = left; i < source.length - right; i += 1) {
        const value = source[i]!;
        let isPivot = true;
        for (let j = 1; j <= left; j += 1) if (source[i - j]! < value) isPivot = false;
        for (let j = 1; j <= right; j += 1) if (source[i + j]! <= value) isPivot = false;
        if (isPivot) out[i] = value;
      }
      return out;
    },
    sar: (start = 0.02, inc = 0.02, max = 0.2) => {
      const out = new Array<number>(data.close.length).fill(NAN);
      let trend = 1;
      let ep = data.high[0] ?? NAN;
      let sarValue = data.low[0] ?? NAN;
      let af = start;
      for (let i = 1; i < data.close.length; i += 1) {
        const prevSar = sarValue;
        sarValue = prevSar + af * (ep - prevSar);
        if (trend === 1) {
          if (data.low[i]! < sarValue) {
            trend = -1;
            sarValue = ep;
            ep = data.low[i]!;
            af = start;
          } else if (data.high[i]! > ep) {
            ep = data.high[i]!;
            af = Math.min(max, af + inc);
          }
        } else {
          if (data.high[i]! > sarValue) {
            trend = 1;
            sarValue = ep;
            ep = data.high[i]!;
            af = start;
          } else if (data.low[i]! < ep) {
            ep = data.low[i]!;
            af = Math.min(max, af + inc);
          }
        }
        out[i] = sarValue;
      }
      return out;
    },
  };

  const math = {
    abs: (value: number) => Math.abs(value),
    max: (...values: number[]) => Math.max(...values.flat()),
    min: (...values: number[]) => Math.min(...values.flat()),
    log: (value: number) => Math.log(value),
    exp: (value: number) => Math.exp(value),
    pow: (base: number, exponent: number) => base ** exponent,
    sqrt: (value: number) => Math.sqrt(value),
    floor: (value: number) => Math.floor(value),
    ceil: (value: number) => Math.ceil(value),
    round: (value: number, precision = 0) => {
      const factor = 10 ** precision;
      return Math.round(value * factor) / factor;
    },
    sign: (value: number) => Math.sign(value),
    avg: (...values: number[]) => {
      const flat = values.flat();
      return flat.reduce((total, value) => total + value, 0) / flat.length;
    },
    sum: (...values: number[]) => values.flat().reduce((total, value) => total + value, 0),
    random: () => 0.5,
    todegrees: (value: number) => (value * 180) / Math.PI,
    toradians: (value: number) => (value * Math.PI) / 180,
  };

  const nz = (value: SeriesInput | number, replacement = 0): number | number[] => {
    if (isSeries(value)) return value.map((item) => (Number.isNaN(item) ? replacement : item));
    return Number.isNaN(value as number) ? replacement : (value as number);
  };

  const na = (value: SeriesInput | number): boolean | boolean[] => {
    if (isSeries(value)) return value.map((item) => Number.isNaN(item));
    return Number.isNaN(value as number);
  };

  const iff = <T,>(condition: boolean | boolean[], then: T, otherwise: T): T | T[] => {
    if (Array.isArray(condition)) return condition.map((flag) => (flag ? then : otherwise));
    return condition ? then : otherwise;
  };

  const addPlot = (
    series: SeriesInput,
    title = 'Plot',
    options: {
      color?: ColorInput;
      linewidth?: number;
      lineWidth?: number;
      style?: string;
      overlay?: boolean;
    } = {},
  ) => {
    const values = seriesOf(series);
    const palette = PALETTE[ctx.plots.length % PALETTE.length]!;
    const colorValue = toColor(options.color as ColorInput | undefined, palette);
    const points: PlotPoint[] = data.time.map((time, index) => ({
      time,
      value: values[index] ?? NAN,
      ...(Array.isArray(colorValue) ? { color: colorValue[index] } : {}),
    }));
    const style = String(options.style ?? 'line');
    const type = style.includes('histogram')
      ? 'histogram'
      : style.includes('area') || style.includes('columns')
        ? 'area'
        : 'line';
    const pane = (options.overlay ?? ctx.overlay) ? 'main' : 'separate';
    ctx.plots.push({
      key: `${ctx.plots.length}`,
      title,
      type: type as IndicatorPlot['type'],
      color: Array.isArray(colorValue) ? colorValue[0] ?? palette : colorValue,
      lineWidth: options.linewidth ?? options.lineWidth ?? 1,
      pane,
      points,
    });
  };

  const plot = Object.assign(addPlot, {
    style_line: 'line',
    style_stepline: 'line',
    style_stepline_diamond: 'line',
    style_histogram: 'histogram',
    style_cross: 'line',
    style_area: 'area',
    style_columns: 'area',
    style_circles: 'line',
  });

  const hline = (
    value: number,
    title = '',
    options: { color?: ColorInput; linestyle?: string; linewidth?: number } = {},
  ) => {
    const palette = PALETTE[ctx.hlines.length % PALETTE.length]!;
    const styleValue = String(options.linestyle ?? 'solid');
    const style = styleValue.includes('dash')
      ? 'dashed'
      : styleValue.includes('dot')
        ? 'dotted'
        : 'solid';
    ctx.hlines.push({
      key: `${ctx.hlines.length}`,
      value,
      color: normalizeColor(toColor(options.color as ColorInput | undefined, palette)),
      style: style as IndicatorHLine['style'],
      title,
      pane: 'separate',
    });
  };

  const input = (defaultValue: unknown, _title?: string, options?: { options?: unknown[] }): unknown => {
    if (options?.options && !options.options.includes(defaultValue)) return options.options[0] ?? defaultValue;
    return defaultValue;
  };

  const unsupported = (name: string) => () => {
    warn(`${name} не поддерживается движком MVP`);
  };

  const indicator = (title?: string, options: { overlay?: boolean } = {}) => {
    ctx.name = title || ctx.name;
    ctx.overlay = Boolean(options.overlay);
  };

  const strategy = (title?: string, options: { overlay?: boolean } = {}) => {
    warn('strategy() — терминал только читает данные, стратегия исполнена не будет');
    ctx.name = title || ctx.name;
    ctx.overlay = true;
    void options;
  };

  return {
    ctx,
    globals: {
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
      volume: data.volume,
      time: data.time,
      ta,
      math,
      color,
      input,
      plot,
      hline,
      indicator,
      strategy,
      nz,
      na,
      iff,
      barstate: { islast: true, isconfirmed: true, isrealtime: true, ishistory: false },
      timeframe: { period: 'D' },
      syminfo: { tickerid: 'TINKOFF:', currency: 'RUB', mintick: 0.01 },
      format: { price: 'price', percent: 'percent', volume: 'volume' },
      request: { security: () => { warn('request.security() не поддерживается'); return new Array<number>(length).fill(NAN); } },
      fill: unsupported('fill()'),
      bgcolor: unsupported('bgcolor()'),
      plotshape: unsupported('plotshape()'),
      plotchar: unsupported('plotchar()'),
      label: unsupported('label.new()'),
      line: unsupported('line.new()'),
      box: unsupported('box.new()'),
      table: unsupported('table.new()'),
      alert: unsupported('alert()'),
      alertcondition: unsupported('alertcondition()'),
    },
  };
}

export interface RunOptions {
  name?: string;
}

export function runIndicator(code: string, data: MarketData, options: RunOptions = {}): RuntimeResult {
  const { ctx, globals } = createContext(data);
  if (options.name) ctx.name = options.name;

  const names = Object.keys(globals);
  const values = Object.values(globals);

  try {
    const fn = new Function(...names, `"use strict";\n${code}`);
    fn(...values);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: ctx.name,
      overlay: ctx.overlay,
      plots: ctx.plots,
      hlines: ctx.hlines,
      warnings: ctx.warnings,
      error: message,
    };
  }

  return {
    name: ctx.name,
    overlay: ctx.overlay,
    plots: ctx.plots,
    hlines: ctx.hlines,
    warnings: ctx.warnings,
  };
}

export { PALETTE, rgbaFromHex };
