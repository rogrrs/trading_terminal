/// <reference lib="webworker" />
import { runIndicator } from '../features/indicators/runtime';
import type { MarketData } from '../features/indicators/types';

interface RunRequest {
  id: number;
  code: string;
  data: MarketData;
  name?: string;
}

interface RunResponse {
  id: number;
  name: string;
  overlay: boolean;
  plots: unknown[];
  hlines: unknown[];
  warnings: string[];
  error?: string;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RunRequest>) => void) | null;
  postMessage: (message: RunResponse) => void;
};

scope.onmessage = (event: MessageEvent<RunRequest>) => {
  const { id, code, data, name } = event.data;
  try {
    const result = runIndicator(code, data, { name });
    scope.postMessage({
      id,
      name: result.name,
      overlay: result.overlay,
      plots: result.plots,
      hlines: result.hlines,
      warnings: result.warnings,
      error: result.error,
    });
  } catch (error) {
    scope.postMessage({
      id,
      name: name ?? 'Indicator',
      overlay: false,
      plots: [],
      hlines: [],
      warnings: [],
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
