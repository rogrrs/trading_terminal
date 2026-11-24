import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** T-Invest Quotation {units, nano} -> number (safe for 9 decimal digits). */
export function quotationToNumber(q?: { units?: string | number; nano?: number | string } | null): number {
  if (!q) return Number.NaN;
  const units = Number(q.units ?? 0);
  const nano = Number(q.nano ?? 0) / 1_000_000_000;
  return units + nano;
}

export function formatPrice(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} млрд`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} млн`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)} тыс.`;
  return new Intl.NumberFormat('ru-RU').format(value);
}

export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function precisionForPrice(price?: number): number {
  if (!price || !Number.isFinite(price)) return 2;
  const abs = Math.abs(price);
  if (abs >= 1000) return 2;
  if (abs >= 1) return 3;
  if (abs >= 0.01) return 5;
  return 6;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function uid(prefix = 'id'): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, delay: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}
