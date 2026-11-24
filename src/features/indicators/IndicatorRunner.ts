import type { IndicatorRunResult, MarketData, IndicatorHLine, IndicatorPlot } from './types';

interface Pending {
  resolve: (result: IndicatorRunResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Runs user indicator code in a dedicated Web Worker so that a heavy or looping
 * indicator cannot freeze the terminal. A watchdog terminates the worker on timeout.
 */
export class IndicatorRunner {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('../../workers/indicator.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<{
      id: number;
      name: string;
      overlay: boolean;
      plots: IndicatorPlot[];
      hlines: IndicatorHLine[];
      warnings: string[];
      error?: string;
    }>) => {
      const pending = this.pending.get(event.data.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(event.data.id);
      pending.resolve({
        indicatorId: '',
        name: event.data.name,
        overlay: event.data.overlay,
        plots: event.data.plots,
        hlines: event.data.hlines,
        warnings: event.data.warnings,
        error: event.data.error,
      });
    };
    worker.onerror = (event) => {
      const message = event.message || 'Ошибка выполнения индикатора';
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(message));
        this.pending.delete(id);
      }
      this.disposeWorker();
    };
    this.worker = worker;
    return worker;
  }

  private disposeWorker() {
    this.worker?.terminate();
    this.worker = null;
  }

  run(
    indicatorId: string,
    code: string,
    data: MarketData,
    timeoutMs = 4000,
  ): Promise<IndicatorRunResult> {
    const worker = this.ensureWorker();
    const id = ++this.seq;

    return new Promise<IndicatorRunResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.disposeWorker();
        reject(new Error(`Индикатор выполнялся дольше ${timeoutMs / 1000} с и был остановлен`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (result) => resolve({ ...result, indicatorId }),
        reject,
        timer,
      });

      worker.postMessage({ id, code, data });
    });
  }

  dispose() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Индикатор отменён'));
    }
    this.pending.clear();
    this.disposeWorker();
  }
}
