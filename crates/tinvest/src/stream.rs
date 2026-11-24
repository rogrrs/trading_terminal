use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;
use tonic::Request;

use crate::client::{connect_channel, AuthInterceptor};
use crate::models::*;
use crate::pb;
use crate::error::Result;

#[derive(Debug, Clone)]
pub struct StreamSpec {
    pub candles: Option<(String, i32)>,
    pub orderbook: Option<(String, i32)>,
}

#[derive(Debug, Clone)]
pub enum StreamEvent {
    Candle(CandleDto),
    OrderBook(OrderBookDto),
    Status(String),
    Error(String),
}

/// Opens a bidi MarketDataStream and forwards decoded events until it ends.
/// Reconnects are the caller's responsibility (Tauri task loop).
pub async fn run_stream<F>(token: String, spec: StreamSpec, mut emit: F) -> Result<()>
where
    F: FnMut(StreamEvent) + Send,
{
    let channel = connect_channel().await?;
    let mut client =
        pb::market_data_stream_service_client::MarketDataStreamServiceClient::with_interceptor(
            channel,
            AuthInterceptor { token },
        );

    let (tx, rx) = mpsc::channel::<pb::MarketDataRequest>(16);
    let mut stream = client
        .market_data_stream(Request::new(ReceiverStream::new(rx)))
        .await?
        .into_inner();

    if let Some((instrument_id, interval)) = spec.candles.clone() {
        let _ = tx
            .send(pb::MarketDataRequest {
                payload: Some(pb::market_data_request::Payload::SubscribeCandlesRequest(
                    pb::SubscribeCandlesRequest {
                        subscription_action: pb::SubscriptionAction::Subscribe as i32,
                        waiting_close: false,
                        candle_source_type: None,
                        instruments: vec![pb::CandleInstrument {
                            instrument_id,
                            interval,
                            ..Default::default()
                        }],
                    },
                )),
            })
            .await;
    }

    if let Some((instrument_id, depth)) = spec.orderbook.clone() {
        let _ = tx
            .send(pb::MarketDataRequest {
                payload: Some(pb::market_data_request::Payload::SubscribeOrderBookRequest(
                    pb::SubscribeOrderBookRequest {
                        subscription_action: pb::SubscriptionAction::Subscribe as i32,
                        instruments: vec![pb::OrderBookInstrument {
                            instrument_id,
                            depth,
                            ..Default::default()
                        }],
                    },
                )),
            })
            .await;
    }

    while let Some(message) = stream.next().await {
        let message = match message {
            Ok(value) => value,
            Err(status) => {
                emit(StreamEvent::Error(crate::error::friendly_status(&status)));
                return Err(status.into());
            }
        };

        match message.payload {
            Some(pb::market_data_response::Payload::Candle(candle)) => {
                emit(StreamEvent::Candle(map_candle(candle)));
            }
            Some(pb::market_data_response::Payload::Orderbook(book)) => {
                let instrument_id = spec
                    .orderbook
                    .as_ref()
                    .map(|(id, _)| id.clone())
                    .or_else(|| spec.candles.as_ref().map(|(id, _)| id.clone()))
                    .unwrap_or_default();
                emit(StreamEvent::OrderBook(map_order_book(book, instrument_id)));
            }
            Some(pb::market_data_response::Payload::SubscribeCandlesResponse(_))
            | Some(pb::market_data_response::Payload::SubscribeOrderBookResponse(_))
            | Some(pb::market_data_response::Payload::TradingStatus(_)) => {
                emit(StreamEvent::Status("subscribed".to_string()));
            }
            Some(pb::market_data_response::Payload::Ping(_)) => {}
            _ => {}
        }
    }

    emit(StreamEvent::Status("disconnected".to_string()));
    Ok(())
}
