import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings';

function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return 0;
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function useApplyTheme() {
  const theme = useSettingsStore((state) => state.theme);
  const accent = useSettingsStore((state) => state.accent);
  const chart = useSettingsStore((state) => state.chart);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme === 'light' ? 'light' : 'dark';

    root.style.setProperty('--accent-ui', accent);
    root.style.setProperty('--primary', accent);
    root.style.setProperty('--ring', accent);
    root.style.setProperty('--primary-foreground', luminance(accent) > 0.6 ? '#0b0d12' : '#ffffff');

    root.style.setProperty('--chart-bg', chart.background);
    root.style.setProperty('--chart-grid', chart.grid);
    root.style.setProperty('--chart-text', chart.text);
    root.style.setProperty('--chart-crosshair', chart.crosshair);
    root.style.setProperty('--up', chart.bull);
    root.style.setProperty('--down', chart.bear);

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', chart.background);
  }, [theme, accent, chart]);
}
