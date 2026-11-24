import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '@/lib/utils';

export type IndicatorLang = 'pine' | 'js';

export interface IndicatorDef {
  id: string;
  name: string;
  /** Source in Pine Script v5 or plain JavaScript using the Pine-compatible runtime. */
  code: string;
  lang: IndicatorLang;
  enabled: boolean;
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

interface IndicatorState {
  indicators: IndicatorDef[];
  add: (indicator: Omit<IndicatorDef, 'id' | 'createdAt' | 'updatedAt'>) => IndicatorDef;
  update: (id: string, patch: Partial<Pick<IndicatorDef, 'name' | 'code' | 'enabled' | 'lang'>>) => void;
  remove: (id: string) => void;
  toggle: (id: string, enabled?: boolean) => void;
  reset: () => void;
}

export const BUILTIN_INDICATORS: IndicatorDef[] = [
  {
    id: 'builtin-ema',
    name: 'EMA 20 / 50',
    enabled: true,
    builtin: true,
    lang: 'pine',
    code: `//@version=5
// Две экспоненциальные средние поверх цены
indicator("EMA 20/50", overlay=true)

fast = ta.ema(close, 20)
slow = ta.ema(close, 50)

plot(fast, "EMA 20", color=color.new(color.aqua, 0), linewidth=2)
plot(slow, "EMA 50", color=color.new(color.orange, 0), linewidth=2)
`,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-rsi',
    name: 'RSI 14',
    enabled: true,
    builtin: true,
    lang: 'pine',
    code: `//@version=5
// Индекс относительной силы в отдельной панели
indicator("RSI 14", overlay=false)

len = input(14, "Length")
src = input(close, "Source")

rsi = ta.rsi(src, len)

plot(rsi, "RSI", color=color.new(color.purple, 0), linewidth=2)
hline(70, "Overbought", color=color.new(color.red, 40))
hline(30, "Oversold", color=color.new(color.green, 40))
`,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-volume',
    name: 'Volume',
    enabled: true,
    builtin: true,
    lang: 'pine',
    code: `//@version=5
// Объёмы с раскраской по направлению свечи
indicator("Volume", overlay=false)

plot(volume, "Volume", style=plot.style_histogram, color=close >= open ? color.new(color.teal, 20) : color.new(color.red, 20))
`,
    createdAt: 0,
    updatedAt: 0,
  },
];

export const useIndicatorStore = create<IndicatorState>()(
  persist(
    (set) => ({
      indicators: BUILTIN_INDICATORS.map((indicator) => ({ ...indicator })),

      add: (indicator) => {
        const created: IndicatorDef = {
          ...indicator,
          id: uid('ind'),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({ indicators: [...state.indicators, created] }));
        return created;
      },

      update: (id, patch) =>
        set((state) => ({
          indicators: state.indicators.map((indicator) =>
            indicator.id === id
              ? { ...indicator, ...patch, updatedAt: Date.now() }
              : indicator,
          ),
        })),

      remove: (id) =>
        set((state) => ({
          indicators: state.indicators.filter((indicator) => indicator.id !== id),
        })),

      toggle: (id, enabled) =>
        set((state) => ({
          indicators: state.indicators.map((indicator) =>
            indicator.id === id
              ? { ...indicator, enabled: enabled ?? !indicator.enabled }
              : indicator,
          ),
        })),

      reset: () => set({ indicators: BUILTIN_INDICATORS.map((indicator) => ({ ...indicator })) }),
    }),
    {
      name: 'tt.indicators.v1',
      version: 1,
      partialize: (state) => ({ indicators: state.indicators }),
    },
  ),
);

export function newIndicator(name: string, code: string): IndicatorDef {
  return {
    id: uid('ind'),
    name,
    code,
    lang: 'pine',
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
