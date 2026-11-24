import path from 'node:path';
import { promises as fs } from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import {
  clearToken,
  getAiApiKey,
  getAiConfig,
  getToken,
  maskToken,
  setAiConfig,
  setToken,
} from './secrets.js';
import {
  findInstruments,
  getCandles,
  getOrderBook,
  REST_ENDPOINT,
  TinkoffError,
  type CandlesQuery,
} from './tinkoff.js';
import { createMarketStream, type SubscriptionSpec } from './stream.js';
import { convertPine } from './ai.js';

const pkg = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8')) as {
  version: string;
};

if (!process.env.NODE_EXTRA_CA_CERTS) {
  console.warn(
    '[trading-terminal] NODE_EXTRA_CA_CERTS не задан. Если T-Invest API недоступен по TLS, запустите через npm start/dev — они добавляют сертификат НУЦ Минцифры.',
  );
}

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  },
});

app.addHook('onRequest', async (request, reply) => {
  const origin = request.headers.origin;
  if (origin) {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Vary', 'Origin');
    reply.header('Access-Control-Allow-Credentials', 'true');
  }
  reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (request.method === 'OPTIONS') {
    await reply.code(204).send();
  }
});

await app.register(fastifyStatic, {
  root: path.join(process.cwd(), 'dist'),
  prefix: '/',
  index: ['index.html'],
});

app.get('/api/health', async () => ({
  ok: true,
  version: pkg.version,
  backend: 'http',
  endpoint: REST_ENDPOINT,
  hasToken: Boolean(await getToken()),
  streaming: 'sse',
}));

app.get('/api/token', async () => {
  const token = await getToken();
  return {
    hasToken: Boolean(token),
    storage: token ? 'file' : 'none',
    masked: maskToken(token),
  };
});

app.put('/api/token', async (request, reply) => {
  const body = (request.body ?? {}) as { token?: string };
  if (!body.token?.trim()) return reply.code(400).send({ error: 'Токен не указан' });
  try {
    await setToken(body.token);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
  }
  const token = await getToken();
  return { hasToken: Boolean(token), storage: 'file', masked: maskToken(token) };
});

app.delete('/api/token', async () => {
  await clearToken();
  return { ok: true };
});

app.post('/api/instruments/search', async (request, reply) => {
  const body = (request.body ?? {}) as { query?: string };
  const query = body.query?.trim();
  if (!query) return reply.code(400).send({ error: 'Пустой запрос' });
  const token = await getToken();
  if (!token) return reply.code(401).send({ error: 'Токен T-Invest не задан' });
  try {
    return { instruments: await findInstruments(token, query) };
  } catch (error) {
    return fail(reply, error);
  }
});

app.post('/api/candles', async (request, reply) => {
  const body = (request.body ?? {}) as Partial<CandlesQuery>;
  if (!body.instrumentId || !body.interval || !body.from || !body.to) {
    return reply.code(400).send({ error: 'Неполный запрос свечей' });
  }
  const token = await getToken();
  if (!token) return reply.code(401).send({ error: 'Токен T-Invest не задан' });
  try {
    return { candles: await getCandles(token, body as CandlesQuery) };
  } catch (error) {
    return fail(reply, error);
  }
});

app.post('/api/orderbook', async (request, reply) => {
  const body = (request.body ?? {}) as { instrumentId?: string; depth?: number };
  if (!body.instrumentId) return reply.code(400).send({ error: 'Не указан инструмент' });
  const token = await getToken();
  if (!token) return reply.code(401).send({ error: 'Токен T-Invest не задан' });
  try {
    return await getOrderBook(token, body.instrumentId, Math.min(Math.max(body.depth ?? 20, 1), 100));
  } catch (error) {
    return fail(reply, error);
  }
});

app.post('/api/stream', async (request, reply) => {
  const body = (request.body ?? {}) as { spec?: SubscriptionSpec };
  if (!body.spec?.candles && !body.spec?.orderbook) {
    return reply.code(400).send({ error: 'Нет подписок' });
  }
  const token = await getToken();
  if (!token) return reply.code(401).send({ error: 'Токен T-Invest не задан' });

  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const write = (event: string, data: unknown) => {
    try {
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      /* socket closed */
    }
  };

  write('status', { status: 'connecting' });
  const heartbeat = setInterval(() => {
    try {
      raw.write(': ping\n\n');
    } catch {
      /* ignore */
    }
  }, 15_000);

  const closeStream = createMarketStream(token, body.spec, {
    onCandle: (candle) => write('candle', candle),
    onOrderBook: (book) => write('orderbook', book),
    onStatus: (status) => write('status', { status }),
    onError: (message) => write('error', { message }),
  });

  request.raw.on('close', () => {
    clearInterval(heartbeat);
    closeStream();
  });

  return reply;
});

app.get('/api/ai/config', async () => getAiConfig());

app.put('/api/ai/config', async (request, reply) => {
  const body = (request.body ?? {}) as {
    provider?: 'openai' | 'anthropic';
    model?: string;
    apiKey?: string;
  };
  if (body.provider !== 'openai' && body.provider !== 'anthropic') {
    return reply.code(400).send({ error: 'Неизвестный провайдер' });
  }
  try {
    return await setAiConfig({
      provider: body.provider,
      model: body.model ?? '',
      apiKey: body.apiKey,
    });
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/ai/convert', async (request, reply) => {
  const body = (request.body ?? {}) as { pine?: string; provider?: 'openai' | 'anthropic'; model?: string };
  if (!body.pine?.trim()) return reply.code(400).send({ error: 'Пустой Pine Script' });
  const [config, apiKey] = await Promise.all([getAiConfig(), getAiApiKey()]);
  if (!apiKey) return reply.code(400).send({ error: 'API-ключ не задан в настройках' });
  try {
    return await convertPine({
      pine: body.pine,
      provider: body.provider ?? config.provider,
      model: body.model ?? config.model,
      apiKey,
    });
  } catch (error) {
    return reply.code(502).send({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'Не найдено' });
  return reply.sendFile('index.html');
});

function fail(reply: import('fastify').FastifyReply, error: unknown) {
  if (error instanceof TinkoffError) {
    return reply.code(error.status === 401 || error.status === 403 ? 401 : 502).send({
      error: error.message,
      code: error.code,
    });
  }
  return reply.code(502).send({ error: error instanceof Error ? error.message : String(error) });
}

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, 'request failed');
  const status = (error as { statusCode?: number }).statusCode ?? 500;
  reply.code(status).send({ error: error instanceof Error ? error.message : String(error) });
});

const port = Number(process.env.PORT ?? 5175);
const host = process.env.TT_BIND ?? '0.0.0.0';

try {
  await app.listen({ port, host });
  app.log.info(`Trading Terminal API listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(String(error));
  process.exit(1);
}
