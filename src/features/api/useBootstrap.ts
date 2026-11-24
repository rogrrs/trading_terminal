import { useEffect } from 'react';
import { backend } from '@/features/api';
import { useAppStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';

/** Loads backend health + token status and picks a sane default instrument. */
export function useBootstrap() {
  const setHealth = useAppStore((state) => state.setHealth);
  const setToken = useAppStore((state) => state.setToken);
  const setTokenChecked = useAppStore((state) => state.setTokenChecked);
  const setTokenDialogOpen = useAppStore((state) => state.setTokenDialogOpen);
  const token = useAppStore((state) => state.token);
  const instrument = useTerminalStore((state) => state.instrument);
  const setInstrument = useTerminalStore((state) => state.setInstrument);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const health = await backend.health();
        if (!disposed) setHealth(health);
      } catch {
        if (!disposed) setHealth(null);
      }

      try {
        const status = await backend.getTokenStatus();
        if (disposed) return;
        setToken(status);
        if (!status.hasToken) setTokenDialogOpen(true);
      } catch (error) {
        if (disposed) return;
        setTokenChecked(true);
        setTokenDialogOpen(true);
        console.warn('Token status unavailable', error);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [setHealth, setToken, setTokenChecked, setTokenDialogOpen]);

  useEffect(() => {
    if (!token?.hasToken || instrument) return;
    let disposed = false;
    backend
      .searchInstruments('SBER')
      .then((list) => {
        if (disposed) return;
        const preferred = list.find((item) => item.ticker === 'SBER') ?? list[0];
        if (preferred) setInstrument(preferred);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [token?.hasToken, instrument, setInstrument]);
}
