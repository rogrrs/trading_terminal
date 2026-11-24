#!/usr/bin/env node
/**
 * Diagnostics: calls T-Invest API directly with the token from data/secrets.json
 * and prints the raw responses. Use it when the terminal shows "no data".
 *
 *   npm run diagnose              # WUSH + 1h + last 5 days
 *   npm run diagnose -- SBER 5m   # any ticker and timeframe
 *
 * The token is read from data/secrets.json and never printed.
 */
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';

const SERVICE = 'tinkoff.public.invest.api.contract.v1';
const BASE = process.env.TINVEST_REST_ENDPOINT ?? 'https://invest-public-api.tbank.ru/rest';
const CA = 'contracts/certs/russian-trusted-root-ca.pem';

const query = process.argv[2] ?? 'WUSH';
const intervalArg = process.argv[3] ?? '1h';

const INTERVALS = {
  '1m': 'CANDLE_INTERVAL_1_MIN',
  '5m': 'CANDLE_INTERVAL_5_MIN',
  '15m': 'CANDLE_INTERVAL_15_MIN',
  '1h': 'CANDLE_INTERVAL_HOUR',
  '4h': 'CANDLE_INTERVAL_4_HOUR',
  '1D': 'CANDLE_INTERVAL_DAY',
  '1W': 'CANDLE_INTERVAL_WEEK',
};
const interval = INTERVALS[intervalArg] ?? INTERVALS['1h'];

if (!process.env.NODE_EXTRA_CA_CERTS) {
  console.log(`! NODE_EXTRA_CA_CERTS не задан — добавляю ${CA}`);
  process.env.NODE_EXTRA_CA_CERTS = CA;
}

function readToken() {
  const path = 'data/secrets.json';
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed.token === 'string' && parsed.token.trim() ? parsed.token.trim() : null;
  } catch {
    return null;
  }
}

const token = readToken();
if (!token) {
  console.error('Токен не найден в data/secrets.json. Вставьте его в приложении (Настройки -> Токен).');
  process.exit(1);
}

async function call(service, method, body) {
  const response = await fetch(`${BASE}/${service}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep raw */
  }
  return { status: response.status, text, json };
}

function show(label, result, limit = 900) {
  console.log(`\n=== ${label} -> HTTP ${result.status} ===`);
  if (!result.text) {
    console.log('(пустой ответ)');
    return;
  }
  console.log(result.text.length > limit ? `${result.text.slice(0, limit)}…` : result.text);
}

const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();

const found = await call(`${SERVICE}.InstrumentsService`, 'FindInstrument', { query });
show(`FindInstrument("${query}")`, found, 1200);
const instruments = found.json?.instruments ?? [];
if (!instruments.length) {
  console.error('\nИнструмент не найден — дальше проверять нечего.');
  process.exit(1);
}

for (const item of instruments.slice(0, 3)) {
  console.log(
    `  ${item.ticker ?? '?'} figi=${item.figi ?? '-'} uid=${item.uid ?? '-'} class=${item.classCode ?? '-'} kind=${item.instrumentKind ?? item.instrumentType ?? '?'}`,
  );
}

const target = instruments.find((item) => item.ticker === query) ?? instruments[0];
const instrumentId = target.figi || target.uid;
console.log(`\nПроверяю инструмент: ${target.ticker} (${instrumentId}), interval=${interval}`);

const candles = await call(`${SERVICE}.MarketDataService`, 'GetCandles', {
  instrumentId,
  interval,
  from: iso(now - 5 * 24 * 3600 * 1000),
  to: iso(now),
});
show('GetCandles (5 дней)', candles, 1200);
const list = candles.json?.candles ?? [];
console.log(`\nсвечей в ответе: ${list.length}`);
if (list.length) {
  const first = list[0];
  console.log('первая свеча:', JSON.stringify(first));
  console.log('время первой:', first?.time, '-> Date =', new Date(first?.time ?? 0).toISOString());
}

const noLimit = await call(`${SERVICE}.MarketDataService`, 'GetCandles', {
  instrumentId,
  interval,
  from: iso(now - 5 * 24 * 3600 * 1000),
  to: iso(now),
  limit: 100,
});
console.log(`\nс limit=100 свечей: ${(noLimit.json?.candles ?? []).length} (HTTP ${noLimit.status})`);

const book = await call(`${SERVICE}.MarketDataService`, 'GetOrderBook', {
  instrumentId,
  depth: 5,
});
show('GetOrderBook (depth 5)', book, 1200);
console.log(
  `бидов: ${book.json?.bids?.length ?? 0}, асков: ${book.json?.asks?.length ?? 0}, lastPrice: ${JSON.stringify(book.json?.lastPrice)}`,
);

const last = await call(`${SERVICE}.MarketDataService`, 'GetLastPrices', {
  instruments: [{ instrumentId }],
});
show('GetLastPrices', last, 600);

console.log('\nГотово. Пришлите этот вывод целиком.');
