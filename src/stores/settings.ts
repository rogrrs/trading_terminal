import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Health, TokenStatus } from '@/features/api/types';

export type ThemeId = 'dark' | 'light' | 'midnight';

export interface ChartColors {
  background: string;
  grid: string;
  bull: string;
  bear: string;
  text: string;
  crosshair: string;
}

export interface Settings {
  theme: ThemeId;
  accent: string;
  chart: ChartColors;
  showOrderBook: boolean;
  showWatchlist: boolean;
  showVolume: boolean;
  showGrid: boolean;
  orderBookDepth: number;
  editorOpen: boolean;
  editorHeight: number;
  apiEndpoint: string;
  showDrawings: boolean;
}

export const THEME_PRESETS: Record<ThemeId, { label: string; chart: ChartColors; accent: string }> = {
  dark: {
    label: 'Dark (TradingView)',
    accent: '#2962ff',
    chart: {
      background: '#131722',
      grid: '#1e222d',
      bull: '#089981',
      bear: '#f23645',
      text: '#d1d4dc',
      crosshair: '#758696',
    },
  },
  light: {
    label: 'Light',
    accent: '#2962ff',
    chart: {
      background: '#ffffff',
      grid: '#e0e3eb',
      bull: '#089981',
      bear: '#f23645',
      text: '#131722',
      crosshair: '#9598a1',
    },
  },
  midnight: {
    label: 'Midnight Black',
    accent: '#7c5cff',
    chart: {
      background: '#050505',
      grid: '#16181d',
      bull: '#00c2a8',
      bear: '#ff3b5c',
      text: '#c9cdd6',
      crosshair: '#5f6673',
    },
  },
};

interface SettingsState extends Settings {
  setTheme: (theme: ThemeId) => void;
  setAccent: (color: string) => void;
  setChartColors: (patch: Partial<ChartColors>) => void;
  resetChartColors: () => void;
  setShowOrderBook: (value: boolean) => void;
  setShowWatchlist: (value: boolean) => void;
  setShowVolume: (value: boolean) => void;
  setShowGrid: (value: boolean) => void;
  setOrderBookDepth: (value: number) => void;
  setEditorOpen: (value: boolean) => void;
  setEditorHeight: (value: number) => void;
  setApiEndpoint: (value: string) => void;
  setShowDrawings: (value: boolean) => void;
}

const defaultSettings: Settings = {
  theme: 'dark',
  accent: THEME_PRESETS.dark.accent,
  chart: { ...THEME_PRESETS.dark.chart },
  showOrderBook: true,
  showWatchlist: true,
  showVolume: true,
  showGrid: true,
  orderBookDepth: 20,
  editorOpen: false,
  editorHeight: 280,
  apiEndpoint: 'https://invest-public-api.tbank.ru/rest',
  showDrawings: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      setTheme: (theme) => {
        const preset = THEME_PRESETS[theme];
        set({
          theme,
          accent: preset.accent,
          chart: { ...preset.chart },
        });
      },
      setAccent: (accent) => set({ accent }),
      setChartColors: (patch) => set({ chart: { ...get().chart, ...patch } }),
      resetChartColors: () => set({ chart: { ...THEME_PRESETS[get().theme].chart } }),
      setShowOrderBook: (showOrderBook) => set({ showOrderBook }),
      setShowWatchlist: (showWatchlist) => set({ showWatchlist }),
      setShowVolume: (showVolume) => set({ showVolume }),
      setShowGrid: (showGrid) => set({ showGrid }),
      setOrderBookDepth: (orderBookDepth) => set({ orderBookDepth }),
      setEditorOpen: (editorOpen) => set({ editorOpen }),
      setEditorHeight: (editorHeight) => set({ editorHeight }),
      setApiEndpoint: (apiEndpoint) => set({ apiEndpoint }),
      setShowDrawings: (showDrawings) => set({ showDrawings }),
    }),
    {
      name: 'tt.settings.v1',
      version: 1,
      partialize: (state): Settings => ({
        theme: state.theme,
        accent: state.accent,
        chart: state.chart,
        showOrderBook: state.showOrderBook,
        showWatchlist: state.showWatchlist,
        showVolume: state.showVolume,
        showGrid: state.showGrid,
        orderBookDepth: state.orderBookDepth,
        editorOpen: state.editorOpen,
        editorHeight: state.editorHeight,
        apiEndpoint: state.apiEndpoint,
        showDrawings: state.showDrawings,
      }),
    },
  ),
);

export interface AppState {
  health: Health | null;
  token: TokenStatus | null;
  tokenChecked: boolean;
  mobileTab: 'chart' | 'watchlist' | 'orderbook' | 'indicators' | 'settings';
  activeTool: ToolId;
  settingsOpen: boolean;
  tokenDialogOpen: boolean;
  setHealth: (health: Health | null) => void;
  setToken: (token: TokenStatus | null) => void;
  setTokenChecked: (value: boolean) => void;
  setMobileTab: (tab: AppState['mobileTab']) => void;
  setActiveTool: (tool: ToolId) => void;
  setSettingsOpen: (open: boolean) => void;
  setTokenDialogOpen: (open: boolean) => void;
}

export type ToolId = 'cursor' | 'select' | 'hline' | 'trend' | 'ray' | 'rect' | 'measure';

export const useAppStore = create<AppState>((set) => ({
  health: null,
  token: null,
  tokenChecked: false,
  mobileTab: 'chart',
  activeTool: 'cursor',
  settingsOpen: false,
  tokenDialogOpen: false,
  setHealth: (health) => set({ health }),
  setToken: (token) => set({ token, tokenChecked: true }),
  setTokenChecked: (tokenChecked) => set({ tokenChecked }),
  setMobileTab: (mobileTab) => set({ mobileTab }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setTokenDialogOpen: (tokenDialogOpen) => set({ tokenDialogOpen }),
}));
