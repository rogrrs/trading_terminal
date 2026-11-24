import { useEffect, useState } from 'react';
import { Check, ExternalLink, RotateCcw, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore, THEME_PRESETS, useSettingsStore, type ThemeId } from '@/stores/settings';
import { backend } from '@/features/api';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

const COLOR_FIELDS: Array<{ key: 'background' | 'grid' | 'bull' | 'bear' | 'text' | 'crosshair'; label: string }> = [
  { key: 'background', label: 'Фон графика' },
  { key: 'grid', label: 'Сетка' },
  { key: 'bull', label: 'Бычьи свечи' },
  { key: 'bear', label: 'Медвежьи свечи' },
  { key: 'text', label: 'Текст осей' },
  { key: 'crosshair', label: 'Перекрестие' },
];

const ACCENTS = ['#2962ff', '#7c5cff', '#00bcd4', '#089981', '#ff9800', '#f23645'];

export function SettingsDialog() {
  const open = useAppStore((state) => state.settingsOpen);
  const setOpen = useAppStore((state) => state.setSettingsOpen);
  const setTokenDialogOpen = useAppStore((state) => state.setTokenDialogOpen);
  const health = useAppStore((state) => state.health);
  const token = useAppStore((state) => state.token);

  const theme = useSettingsStore((state) => state.theme);
  const accent = useSettingsStore((state) => state.accent);
  const chart = useSettingsStore((state) => state.chart);
  const showOrderBook = useSettingsStore((state) => state.showOrderBook);
  const showVolume = useSettingsStore((state) => state.showVolume);
  const showGrid = useSettingsStore((state) => state.showGrid);
  const showDrawings = useSettingsStore((state) => state.showDrawings);
  const orderBookDepth = useSettingsStore((state) => state.orderBookDepth);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setAccent = useSettingsStore((state) => state.setAccent);
  const setChartColors = useSettingsStore((state) => state.setChartColors);
  const resetChartColors = useSettingsStore((state) => state.resetChartColors);
  const setShowOrderBook = useSettingsStore((state) => state.setShowOrderBook);
  const setShowVolume = useSettingsStore((state) => state.setShowVolume);
  const setShowGrid = useSettingsStore((state) => state.setShowGrid);
  const setShowDrawings = useSettingsStore((state) => state.setShowDrawings);
  const setOrderBookDepth = useSettingsStore((state) => state.setOrderBookDepth);

  const [aiProvider, setAiProvider] = useState<'openai' | 'anthropic'>('openai');
  const [aiModel, setAiModel] = useState('gpt-4o-mini');
  const [aiKey, setAiKey] = useState('');
  const [aiHasKey, setAiHasKey] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    backend
      .getAiConfig()
      .then((config) => {
        setAiProvider(config.provider);
        setAiModel(config.model);
        setAiHasKey(config.hasKey);
      })
      .catch(() => undefined);
  }, [open]);

  const saveAi = async () => {
    setAiBusy(true);
    try {
      const config = await backend.setAiConfig({
        provider: aiProvider,
        model: aiModel.trim() || (aiProvider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-haiku-latest'),
        apiKey: aiKey.trim() || undefined,
      });
      setAiProvider(config.provider);
      setAiModel(config.model);
      setAiHasKey(config.hasKey);
      setAiKey('');
      toast({ title: 'AI-конвертер настроен', description: config.hasKey ? 'Ключ сохранён локально' : undefined });
    } catch (error) {
      toast({
        title: 'Не удалось сохранить',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Настройки</DialogTitle>
          <DialogDescription>Внешний вид, график, данные и токен T-Invest API</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="appearance" className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="m-3 mb-0 flex w-full justify-start rounded-md bg-muted p-0.5">
            <TabsTrigger value="appearance">Внешний вид</TabsTrigger>
            <TabsTrigger value="chart">График</TabsTrigger>
            <TabsTrigger value="data">Данные</TabsTrigger>
            <TabsTrigger value="token">Токен и AI</TabsTrigger>
            <TabsTrigger value="about">О приложении</TabsTrigger>
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <TabsContent value="appearance" className="mt-3 space-y-4">
              <div className="space-y-2">
                <Label>Тема</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(THEME_PRESETS) as ThemeId[]).map((id) => {
                    const preset = THEME_PRESETS[id];
                    const active = theme === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTheme(id)}
                        className={cn(
                          'overflow-hidden rounded-md border text-left transition-colors',
                          active ? 'border-primary ring-1 ring-primary' : 'hover:border-muted-foreground/40',
                        )}
                      >
                        <div
                          className="relative h-14 w-full"
                          style={{ background: preset.chart.background }}
                        >
                          <div className="absolute inset-x-2 bottom-2 flex items-end gap-1">
                            <div className="h-5 w-1.5 rounded-sm" style={{ background: preset.chart.bull }} />
                            <div className="h-8 w-1.5 rounded-sm" style={{ background: preset.chart.bear }} />
                            <div className="h-3 w-1.5 rounded-sm" style={{ background: preset.chart.bull }} />
                          </div>
                          {active && (
                            <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </div>
                        <div className="px-2 py-1.5 text-[11px] font-medium">{preset.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Акцентный цвет интерфейса</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={accent}
                    onChange={(event) => setAccent(event.target.value)}
                    className="h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5"
                    aria-label="Акцентный цвет"
                  />
                  <span className="tnum text-xs text-muted-foreground">{accent}</span>
                  <div className="ml-auto flex gap-1.5">
                    {ACCENTS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setAccent(color)}
                        className={cn(
                          'h-5 w-5 rounded-full border-2',
                          accent === color ? 'border-foreground' : 'border-transparent',
                        )}
                        style={{ background: color }}
                        aria-label={color}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="chart" className="mt-3 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {COLOR_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center justify-between gap-2">
                    <Label className="text-[11px] text-muted-foreground">{field.label}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={chart[field.key]}
                        onChange={(event) => setChartColors({ [field.key]: event.target.value })}
                        className="h-6 w-8 cursor-pointer rounded border bg-transparent p-0.5"
                        aria-label={field.label}
                      />
                      <span className="tnum w-16 text-[10px] text-muted-foreground">{chart[field.key]}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={resetChartColors}>
                  <RotateCcw className="h-3 w-3" /> Сбросить цвета
                </Button>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Объёмы на графике</Label>
                    <p className="text-[10px] text-muted-foreground">Гистограмма под свечами</p>
                  </div>
                  <Switch checked={showVolume} onCheckedChange={setShowVolume} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Сетка</Label>
                    <p className="text-[10px] text-muted-foreground">Горизонтальные и вертикальные линии</p>
                  </div>
                  <Switch checked={showGrid} onCheckedChange={setShowGrid} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Рисунки</Label>
                    <p className="text-[10px] text-muted-foreground">Уровни, тренды, зоны, линейка</p>
                  </div>
                  <Switch checked={showDrawings} onCheckedChange={setShowDrawings} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="data" className="mt-3 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Стакан справа</Label>
                  <p className="text-[10px] text-muted-foreground">Панель bid/ask на десктопе</p>
                </div>
                <Switch checked={showOrderBook} onCheckedChange={setShowOrderBook} />
              </div>

              <div className="space-y-2">
                <Label>Глубина стакана: {orderBookDepth}</Label>
                <Slider
                  value={[orderBookDepth]}
                  min={10}
                  max={50}
                  step={10}
                  onValueChange={(value) => setOrderBookDepth(value[0] ?? 20)}
                />
              </div>

              <div className="rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">Данные</p>
                <p className="mt-1">
                  Котировки и стакан приходят из T-Invest API (Т-Банк Инвестиции). История —{' '}
                  <code className="text-[10px]">GetCandles</code>, реальное время —{' '}
                  <code className="text-[10px]">MarketDataStream</code>. При недоступности стрима
                  включается запасное обновление раз в 15 секунд.
                </p>
                <p className="mt-1">
                  Биржа работает по расписанию Мосбиржи. Вне торгового окна новые свечи не приходят —
                  это нормально.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="token" className="mt-3 space-y-4">
              <div className="space-y-2">
                <Label>T-Invest API токен</Label>
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">
                      {token?.hasToken ? 'Токен сохранён' : 'Токен не задан'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {token?.hasToken
                        ? `Хранилище: ${token.storage === 'keychain' ? 'системное хранилище' : 'локальный файл'}${token.masked ? ` · ${token.masked}` : ''}`
                        : 'Без токена доступны только настройки интерфейса'}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setTokenDialogOpen(true)}>
                    {token?.hasToken ? 'Изменить' : 'Вставить токен'}
                  </Button>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Токен хранится только локально (в Tauri — в системном хранилище учётных данных, в
                  браузере — в файле <code>data/secrets.json</code> с правами 0600) и уходит только на{' '}
                  <code>invest-public-api.tbank.ru</code>. В репозиторий и в git он не попадает.
                  Используйте Read-Only токен: терминал не отправляет заявки.
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <Label>AI-конвертер Pine Script</Label>
                  <span className="text-[10px] text-muted-foreground">
                    {aiHasKey ? 'ключ сохранён' : 'ключ не задан'}
                  </span>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Для сложных Pine-скриптов: модель получает код и возвращает JavaScript для
                  встроенного движка. Ключ хранится локально и используется только для запроса к
                  выбранному провайдеру.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={aiProvider} onValueChange={(value) => setAiProvider(value as 'openai' | 'anthropic')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={aiModel}
                    onChange={(event) => setAiModel(event.target.value)}
                    placeholder="gpt-4o-mini"
                  />
                </div>
                <Input
                  type="password"
                  value={aiKey}
                  onChange={(event) => setAiKey(event.target.value)}
                  placeholder={aiHasKey ? 'Новый ключ (не обязательно)' : 'API-ключ'}
                  autoComplete="off"
                />
                <Button size="sm" onClick={() => void saveAi()} disabled={aiBusy}>
                  {aiBusy ? 'Сохранение…' : 'Сохранить AI-настройки'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="about" className="mt-3 space-y-3">
              <div className="rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Trading Terminal</span>
                  <span className="text-muted-foreground">v{__APP_VERSION__}</span>
                </div>
                <Separator className="my-2" />
                <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-muted-foreground">
                  <dt>Оболочка</dt>
                  <dd>{health?.backend === 'tauri' ? 'Tauri v2 (нативный)' : 'Браузер / PWA'}</dd>
                  <dt>Стриминг</dt>
                  <dd>{health?.streaming === 'grpc' ? 'gRPC (Rust)' : health?.streaming === 'sse' ? 'SSE (Node)' : '—'}</dd>
                  <dt>API</dt>
                  <dd className="truncate">invest-public-api.tbank.ru</dd>
                  <dt>Токен</dt>
                  <dd>{health?.hasToken ? 'сохранён' : 'не задан'}</dd>
                </dl>
              </div>
              <a
                href="https://developer.tbank.ru/invest"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-primary hover:underline"
              >
                Документация T-Invest API <ExternalLink className="h-3 w-3" />
              </a>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Приложение предназначено для анализа котировок. Оно не является инвестиционной
                рекомендацией и не отправляет брокерские заявки.
              </p>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
