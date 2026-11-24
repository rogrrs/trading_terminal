import { isTauri } from '@/lib/utils';
import { HttpBackend } from './http-backend';
import { TauriBackend } from './tauri-backend';
import type { BackendAdapter } from './types';

export * from './types';
export * from './timeframes';

let instance: BackendAdapter | null = null;

/** Lazy singleton — Tauri detection happens at first use, not at module load. */
export function getBackend(): BackendAdapter {
  if (!instance) {
    instance = isTauri() ? new TauriBackend() : new HttpBackend();
  }
  return instance;
}

export const backend: BackendAdapter = {
  get kind() {
    return getBackend().kind;
  },
  health: () => getBackend().health(),
  getTokenStatus: () => getBackend().getTokenStatus(),
  setToken: (token) => getBackend().setToken(token),
  clearToken: () => getBackend().clearToken(),
  searchInstruments: (query) => getBackend().searchInstruments(query),
  getCandles: (req) => getBackend().getCandles(req),
  getOrderBook: (req) => getBackend().getOrderBook(req),
  getLastPrices: (ids) => getBackend().getLastPrices(ids),
  subscribe: (spec, handlers) => getBackend().subscribe(spec, handlers),
  convertPine: (req) => getBackend().convertPine(req),
  getAiConfig: () => getBackend().getAiConfig(),
  setAiConfig: (config) => getBackend().setAiConfig(config),
};
