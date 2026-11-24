import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '@/lib/utils';

export type DrawingKind = 'hline' | 'trend' | 'ray' | 'rect' | 'measure';

export interface DrawingPoint {
  /** Logical bar index — stable while panning/zooming, unlike a time coordinate. */
  logical: number;
  price: number;
}

export interface Drawing {
  id: string;
  kind: DrawingKind;
  points: DrawingPoint[];
  color: string;
  createdAt: number;
}

interface DrawingState {
  bySymbol: Record<string, Drawing[]>;
  add: (symbol: string, kind: DrawingKind, points: DrawingPoint[], color: string) => Drawing;
  updatePoints: (symbol: string, id: string, points: DrawingPoint[]) => void;
  clear: (symbol: string) => void;
  remove: (symbol: string, id: string) => void;
}

export const useDrawingStore = create<DrawingState>()(
  persist(
    (set) => ({
      bySymbol: {},

      add: (symbol, kind, points, color) => {
        const drawing: Drawing = {
          id: uid('draw'),
          kind,
          points,
          color,
          createdAt: Date.now(),
        };
        set((state) => ({
          bySymbol: {
            ...state.bySymbol,
            [symbol]: [...(state.bySymbol[symbol] ?? []), drawing],
          },
        }));
        return drawing;
      },

      updatePoints: (symbol, id, points) =>
        set((state) => ({
          bySymbol: {
            ...state.bySymbol,
            [symbol]: (state.bySymbol[symbol] ?? []).map((drawing) =>
              drawing.id === id ? { ...drawing, points } : drawing,
            ),
          },
        })),

      clear: (symbol) =>
        set((state) => {
          const next = { ...state.bySymbol };
          delete next[symbol];
          return { bySymbol: next };
        }),

      remove: (symbol, id) =>
        set((state) => ({
          bySymbol: {
            ...state.bySymbol,
            [symbol]: (state.bySymbol[symbol] ?? []).filter((drawing) => drawing.id !== id),
          },
        })),
    }),
    {
      name: 'tt.drawings.v1',
      version: 1,
      partialize: (state) => ({ bySymbol: state.bySymbol }),
    },
  ),
);
