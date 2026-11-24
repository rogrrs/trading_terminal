import { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore } from '@/stores/settings';
import { backend } from '@/features/api';
import { toast } from '@/components/ui/toaster';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';

export function TokenDialog() {
  const open = useAppStore((state) => state.tokenDialogOpen);
  const setOpen = useAppStore((state) => state.setTokenDialogOpen);
  const setToken = useAppStore((state) => state.setToken);
  const token = useAppStore((state) => state.token);
  const loadCandles = useTerminalStore((state) => state.loadCandles);
  const loadOrderBook = useTerminalStore((state) => state.loadOrderBook);
  const depth = useSettingsStore((state) => state.orderBookDepth);

  const [value, setValue] = useState('');
  const [mode, setMode] = useState<'readonly' | 'full'>('readonly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setValue('');
      setError(null);
    }
  }, [open]);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Вставьте токен');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const status = await backend.setToken(trimmed);
      setToken({ ...status, mode });
      toast({
        title: 'Токен сохранён',
        description:
          status.storage === 'keychain'
            ? 'Системное хранилище учётных данных'
            : 'Локальный файл, в git не попадает',
      });
      setOpen(false);
      void loadCandles();
      void loadOrderBook(depth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить токен');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await backend.clearToken();
      setToken({ hasToken: false, storage: 'none' });
      toast({ title: 'Токен удалён', description: 'Котировки больше не будут загружаться' });
      setOpen(false);
    } catch (err) {
      toast({
        title: 'Ошибка',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" /> Токен T-Invest API
          </DialogTitle>
          <DialogDescription>
            Токен нужен для котировок. Терминал только читает данные и не отправляет заявки.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="token">Токен</Label>
            <Input
              id="token"
              type="password"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="t.********************************"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Получите Read-Only токен в личном кабинете Т-Банка: Настройки → API. Full-токен тоже
              подойдёт, но торговые методы не используются.
            </p>
          </div>

          <div className="rounded-md border bg-muted/40 p-2.5">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-up" />
              <div className="text-[10px] leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">Хранение</p>
                <p>
                  {backend.kind === 'tauri'
                    ? 'Системное хранилище (Windows Credential Manager / macOS Keychain / libsecret).'
                    : 'Локальный файл data/secrets.json с правами 0600. Файл в .gitignore.'}{' '}
                  Токен не попадает в репозиторий и передаётся только на invest-public-api.tbank.ru.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'readonly' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('readonly')}
            >
              Read-Only
            </Button>
            <Button
              type="button"
              variant={mode === 'full' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('full')}
            >
              Full
            </Button>
          </div>

          {error && <p className="text-[11px] text-destructive">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <div>
              {token?.hasToken && (
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove()} disabled={busy}>
                  <Trash2 className="h-3 w-3" /> Удалить
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={busy}>
                {busy ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
