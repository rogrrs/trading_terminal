/**
 * gRPC bidi stream to T-Invest MarketDataStreamService.
 * One stream per browser/terminal client; subscriptions are sent on connect.
 */
import path from 'node:path';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { quotation, toUnixSeconds, type CandleDto, type OrderBookDto } from './tinkoff.js';

export interface SubscriptionSpec {
  candles?: { instrumentId: string; interval: string };
  orderbook?: { instrumentId: string; depth: number };
}

export interface StreamHandlers {
  onCandle: (candle: CandleDto) => void;
  onOrderBook: (book: OrderBookDto) => void;
  onStatus: (status: string) => void;
  onError: (message: string) => void;
}

const HOST = process.env.TINVEST_GRPC_HOST ?? 'invest-public-api.tbank.ru:443';
const PROTO_DIR = path.join(process.cwd(), 'contracts', 'proto');

const packageDefinition = protoLoader.loadSync(path.join(PROTO_DIR, 'marketdata.proto'), {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_DIR],
});

const proto = grpc.loadPackageDefinition(packageDefinition) as Record<string, any>;
const MarketDataStreamService = proto.tinkoff['public'].invest.api.contract.v1.MarketDataStreamService as new (
  address: string,
  credentials: grpc.ChannelCredentials,
) => grpc.Client & {
  marketDataStream: () => grpc.ClientReadableStream<unknown> & {
    write: (message: unknown) => void;
    cancel: () => void;
  };
};

let cachedClient: InstanceType<typeof MarketDataStreamService> | null = null;
let cachedToken = '';

function getClient(token: string): InstanceType<typeof MarketDataStreamService> {
  if (cachedClient && cachedToken === token) return cachedClient;
  cachedToken = token;
  const callCredentials = grpc.credentials.createFromMetadataGenerator((_options, callback) => {
    const metadata = new grpc.Metadata();
    metadata.set('authorization', `Bearer ${token}`);
    callback(null, metadata);
  });
  const channelCredentials = grpc.credentials.combineChannelCredentials(
    grpc.credentials.createSsl(),
    callCredentials,
  );
  cachedClient = new MarketDataStreamService(HOST, channelCredentials);
  return cachedClient;
}

function mapCandle(raw: Record<string, any>): CandleDto {
  return {
    time: Number(raw.time?.seconds ?? 0),
    open: quotation(raw.open),
    high: quotation(raw.high),
    low: quotation(raw.low),
    close: quotation(raw.close),
    volume: Number(raw.volume ?? 0),
    isComplete: Boolean(raw.isComplete ?? true),
  };
}

function mapOrderBook(raw: Record<string, any>, instrumentId: string): OrderBookDto {
  const mapSide = (orders: Array<Record<string, any>> | undefined) =>
    (orders ?? []).map((order) => ({
      price: quotation(order.price),
      quantity: Number(order.quantity ?? 0),
    }));
  return {
    instrumentId,
    depth: Number(raw.depth ?? 0),
    bids: mapSide(raw.bids),
    asks: mapSide(raw.asks),
    lastPrice: quotation(raw.lastPrice),
    closePrice: quotation(raw.closePrice),
    limitUp: quotation(raw.limitUp),
    limitDown: quotation(raw.limitDown),
    time: toUnixSeconds(raw.time) * 1000,
  };
}

/**
 * Opens a bidi stream and keeps reconnecting until the returned closer is called.
 * The caller owns the lifetime (HTTP SSE request or a Tauri IPC session).
 */
export function createMarketStream(
  token: string,
  spec: SubscriptionSpec,
  handlers: StreamHandlers,
): () => void {
  let closed = false;
  let stream: grpc.ClientDuplexStream<Record<string, any>, Record<string, any>> | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let attempts = 0;

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    attempts += 1;
    const delay = Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4));
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (closed) return;
    handlers.onStatus('connecting');
    let client: InstanceType<typeof MarketDataStreamService>;
    try {
      client = getClient(token);
    } catch (error) {
      handlers.onError(error instanceof Error ? error.message : String(error));
      scheduleReconnect();
      return;
    }

    let activeStream: grpc.ClientDuplexStream<Record<string, any>, Record<string, any>>;
    try {
      activeStream = client.marketDataStream() as grpc.ClientDuplexStream<Record<string, any>, Record<string, any>>;
      stream = activeStream;
    } catch (error) {
      handlers.onError(error instanceof Error ? error.message : String(error));
      scheduleReconnect();
      return;
    }

    const send = (message: Record<string, unknown>) => {
      try {
        activeStream.write(message);
      } catch (error) {
        handlers.onError(error instanceof Error ? error.message : String(error));
      }
    };

    if (spec.candles) {
      send({
        subscribeCandlesRequest: {
          subscriptionAction: 'SUBSCRIPTION_ACTION_SUBSCRIBE',
          instruments: [
            {
              instrumentId: spec.candles.instrumentId,
              interval: spec.candles.interval,
            },
          ],
        },
      });
    }
    if (spec.orderbook) {
      send({
        subscribeOrderBookRequest: {
          subscriptionAction: 'SUBSCRIPTION_ACTION_SUBSCRIBE',
          instruments: [
            {
              instrumentId: spec.orderbook.instrumentId,
              depth: spec.orderbook.depth,
            },
          ],
        },
      });
    }

    activeStream.on('data', (message: Record<string, any>) => {
      if (closed) return;
      try {
        if (message.candle) handlers.onCandle(mapCandle(message.candle));
        if (message.orderbook) {
          handlers.onOrderBook(
            mapOrderBook(message.orderbook, spec.orderbook?.instrumentId ?? spec.candles?.instrumentId ?? ''),
          );
        }
        const subscription = message.subscribeCandlesResponse ?? message.subscribeOrderBookResponse;
        if (subscription) {
          const status = String(subscription.subscriptionStatus ?? 'SUBSCRIPTION_STATUS_SUCCESS');
          if (status === 'SUBSCRIPTION_STATUS_SUCCESS') handlers.onStatus('subscribed');
          else handlers.onError(`Подписка не принята: ${status}`);
        }
      } catch (error) {
        handlers.onError(error instanceof Error ? error.message : String(error));
      }
    });

    activeStream.on('error', (error: Error) => {
      if (closed) return;
      handlers.onError(error.message || 'Ошибка стрима котировок');
      scheduleReconnect();
    });

    activeStream.on('end', () => {
      if (closed) return;
      handlers.onStatus('disconnected');
      scheduleReconnect();
    });

    activeStream.on('close', () => {
      if (closed) return;
      scheduleReconnect();
    });
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try {
      stream?.cancel();
    } catch {
      /* already closed */
    }
    stream = null;
  };
}

export function resetStreamClient(): void {
  cachedClient = null;
}
