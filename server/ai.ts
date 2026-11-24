/**
 * Optional AI-assisted Pine Script -> JS conversion.
 * Keys are stored locally (data/secrets.json) and sent only to the chosen provider.
 */

const SYSTEM_PROMPT = `Ты — транспилятор Pine Script v5 в JavaScript для векторного движка индикаторов.
Верни ТОЛЬКО валидный JavaScript в одном блоке \`\`\`js ... \`\`\`, без пояснений вне кода.

Доступные глобалы (все серии уже вычислены по всей истории):
- open, high, low, close, volume, time — массивы чисел (time — unix-секунды).
- ta.sma, ta.ema, ta.rma, ta.wma, ta.vwma, ta.rsi, ta.macd, ta.bb, ta.atr, ta.tr, ta.stdev,
  ta.dev, ta.highest, ta.lowest, ta.highestbars, ta.lowestbars, ta.change, ta.mom, ta.roc,
  ta.linreg, ta.corr, ta.median, ta.sum, ta.cum, ta.crossover, ta.crossunder, ta.rising,
  ta.falling, ta.barssince, ta.valuewhen, ta.pivothigh, ta.pivotlow, ta.sar.
- math.abs, math.max, math.min, math.log, math.exp, math.pow, math.sqrt, math.floor,
  math.ceil, math.round, math.sign, math.avg, math.sum.
- color.red, color.green, color.blue, color.aqua, color.orange, color.purple, color.yellow,
  color.teal, color.white, color.black, color.gray; color.new(hex, transparency).
- input(default, title, options) — возвращает default (UI-инпутов нет).
- plot(series, title, { color, linewidth, style: 'line' | 'histogram' | 'area', overlay }).
- hline(value, title, { color, linestyle }).
- indicator(title, { overlay }).
- nz, na, iff, barstate, timeframe, syminfo, format.

Правила:
- Запрещены DOM, fetch, async/await, import, require, классы, setTimeout.
- Не используй var-состояние, request.security, line.new/label.new/box.new/table.new, alert.
- Циклы и if должны работать по всей серии, а не по одному бару.
- ta.macd возвращает массив-кортеж с полями macd/signal/histogram; ta.bb — с полями upper/middle/lower.
- Нельзя переопределять имена plot, hline, indicator, input.
- Если в Pine есть неподдерживаемые конструкции, удали их и оставь рабочий векторный аналог.`;

export interface AiConvertInput {
  pine: string;
  provider: 'openai' | 'anthropic';
  model: string;
  apiKey: string;
}

export interface AiConvertResult {
  code: string;
  explanation?: string;
  warnings?: string[];
}

export function extractCode(text: string): string {
  const fenced = text.match(/```(?:js|javascript)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return text.trim();
}

async function callOpenAI(input: AiConvertInput): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model || 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input.pine },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message || `OpenAI: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(input: AiConvertInput): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: input.model || 'claude-3-5-haiku-latest',
      max_tokens: 4000,
      temperature: 0.1,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: input.pine }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message || `Anthropic: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  return body.content?.find((item) => item.type === 'text')?.text ?? '';
}

export async function convertPine(input: AiConvertInput): Promise<AiConvertResult> {
  const text =
    input.provider === 'anthropic' ? await callAnthropic(input) : await callOpenAI(input);
  const code = extractCode(text);
  if (!code) throw new Error('Модель вернула пустой код');
  const warnings: string[] = [];
  if (/request\.security|label\.new|line\.new|box\.new|table\.new/.test(code)) {
    warnings.push('В коде остались неподдерживаемые конструкции — проверьте результат');
  }
  return { code, warnings };
}
