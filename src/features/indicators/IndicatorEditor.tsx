import { useEffect, useState } from 'react';
import { Code2, Copy, Save, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CodeEditor } from '@/components/ui/code-editor';
import { toast } from '@/components/ui/toaster';
import { useIndicatorStore, type IndicatorDef } from '@/stores/indicators';
import { useAppStore } from '@/stores/settings';
import { backend } from '@/features/api';
import { transpilePine } from './transpiler';
import type { IndicatorRunResult } from './types';
import { cn } from '@/lib/utils';

interface IndicatorEditorProps {
  indicator: IndicatorDef | null;
  result?: IndicatorRunResult;
  onDelete: (id: string) => void;
}

export function IndicatorEditor({ indicator, result, onDelete }: IndicatorEditorProps) {
  const update = useIndicatorStore((state) => state.update);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const [code, setCode] = useState(indicator?.code ?? '');
  const [name, setName] = useState(indicator?.name ?? '');
  const [lang, setLang] = useState<'pine' | 'js'>(indicator?.lang ?? 'pine');
  const [showTranspile, setShowTranspile] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    setCode(indicator?.code ?? '');
    setName(indicator?.name ?? '');
    setLang(indicator?.lang ?? 'pine');
  }, [indicator?.id, indicator?.code, indicator?.name, indicator?.lang]);

  if (!indicator) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Выберите индикатор слева или создайте новый
      </div>
    );
  }

  const save = () => {
    update(indicator.id, { name: name.trim() || 'Без названия', code, lang });
    toast({ title: 'Индикатор сохранён', description: name.trim() || indicator.name });
  };

  const aiConvert = async () => {
    if (lang !== 'pine') {
      toast({ title: 'Уже JavaScript', description: 'AI-конвертер нужен только для Pine Script' });
      return;
    }
    try {
      const config = await backend.getAiConfig();
      if (!config.hasKey) {
        toast({
          title: 'Нет API-ключа',
          description: 'Добавьте ключ OpenAI или Anthropic в настройках → Токен и AI',
        });
        setSettingsOpen(true);
        return;
      }
      setAiBusy(true);
      const response = await backend.convertPine({ pine: code, provider: config.provider, model: config.model });
      setCode(response.code);
      setLang('js');
      update(indicator.id, { code: response.code, lang: 'js' });
      toast({
        title: 'Pine сконвертирован',
        description: response.explanation || 'Код заменён на JavaScript',
      });
    } catch (error) {
      toast({
        title: 'Конвертация не удалась',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setAiBusy(false);
    }
  };

  const transpiled = lang === 'pine' ? transpilePine(code) : null;
  const errors = result?.error ? [result.error] : [];
  const warnings = result?.warnings ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-7 w-40 text-[11px]"
          placeholder="Название"
        />
        <Select value={lang} onValueChange={(value) => setLang(value as 'pine' | 'js')}>
          <SelectTrigger className="h-7 w-20 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pine">Pine</SelectItem>
            <SelectItem value="js">JS</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" onClick={save} aria-label="Сохранить" title="Сохранить (Ctrl+S)">
            <Save className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowTranspile(true)}
            disabled={lang !== 'pine'}
            aria-label="Показать JS"
            title="Pine → JS"
          >
            <Code2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void aiConvert()}
            disabled={aiBusy || lang !== 'pine'}
            aria-label="AI-конвертация"
            title="Конвертировать через AI"
          >
            <Sparkles className={cn('h-3.5 w-3.5', aiBusy && 'animate-pulse')} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive"
            onClick={() => {
              if (window.confirm(`Удалить индикатор «${name}»?`)) onDelete(indicator.id);
            }}
            aria-label="Удалить индикатор"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <CodeEditor value={code} onChange={setCode} />
      </div>

      <div className="max-h-16 shrink-0 overflow-y-auto border-t bg-background px-2 py-1 text-[10px] leading-snug">
        {errors.map((error) => (
          <p key={error} className="text-destructive">
            Ошибка: {error}
          </p>
        ))}
        {warnings.slice(0, 2).map((warning) => (
          <p key={warning} className="text-yellow-600 dark:text-yellow-500">
            {warning}
          </p>
        ))}
        {!errors.length && !warnings.length && (
          <p className="text-muted-foreground">
            Pine транспилируется в JS автоматически. Доступны ta.*, math.*, color.*, input(), plot(), hline().
          </p>
        )}
      </div>

      <Dialog open={showTranspile} onOpenChange={setShowTranspile}>
        <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Результат транспиляции</DialogTitle>
            <DialogDescription>
              Векторный JS для встроенного движка. Скопируйте и вставьте как JS-индикатор при необходимости.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1 border bg-muted/30">
            <pre className="whitespace-pre p-3 font-mono text-[11px] leading-relaxed">
              {transpiled?.code ?? ''}
            </pre>
          </ScrollArea>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {transpiled?.warnings.length
                ? transpiled.warnings.join(' · ')
                : 'Предупреждений нет'}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(transpiled?.code ?? '');
                toast({ title: 'Скопировано' });
              }}
            >
              <Copy className="h-3 w-3" /> Копировать
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
