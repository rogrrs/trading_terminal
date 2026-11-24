use chrono::DateTime;
use prost_types::Timestamp;
use tonic::service::Interceptor;
use tonic::transport::{Certificate, Channel, ClientTlsConfig};
use tonic::{Request, Status};

use crate::error::{friendly_status, Error, Result};
use crate::models::*;
use crate::pb;

/// T-Invest API is signed by the Russian national CA (НУЦ Минцифры).
/// The root is vendored so the app works outside a Russian OS trust store.
const ROOT_CA: &str = include_str!("../../../contracts/certs/russian-trusted-root-ca.pem");

#[derive(Clone)]
pub struct AuthInterceptor {
    pub token: String,
}

impl Interceptor for AuthInterceptor {
    fn call(&mut self, mut request: Request<()>) -> std::result::Result<Request<()>, Status> {
        let value = format!("Bearer {}", self.token);
        request
            .metadata_mut()
            .insert("authorization", value.parse().map_err(|_| Status::internal("invalid token"))?);
        Ok(request)
    }
}

pub async fn connect_channel() -> Result<Channel> {
    let tls = ClientTlsConfig::new()
        .with_enabled_roots()
        .ca_certificate(Certificate::from_pem(ROOT_CA));
    let channel = Channel::from_static(crate::GRPC_ENDPOINT)
        .tls_config(tls)
        .map_err(|error| Error::Api(format!("TLS: {error}")))?
        .connect()
        .await?;
    Ok(channel)
}

#[derive(Clone)]
pub struct TinkoffClient {
    pub token: String,
    channel: Channel,
}

impl TinkoffClient {
    pub async fn connect(token: String) -> Result<Self> {
        if token.trim().is_empty() {
            return Err(Error::NoToken);
        }
        let channel = connect_channel().await?;
        Ok(Self { token, channel })
    }

    fn market_data(
        &self,
    ) -> pb::market_data_service_client::MarketDataServiceClient<
        tonic::service::interceptor::InterceptedService<Channel, AuthInterceptor>,
    > {
        pb::market_data_service_client::MarketDataServiceClient::with_interceptor(
            self.channel.clone(),
            AuthInterceptor {
                token: self.token.clone(),
            },
        )
    }

    pub async fn find_instruments(&self, query: impl Into<String>) -> Result<Vec<InstrumentDto>> {
        let mut client = pb::instruments_service_client::InstrumentsServiceClient::with_interceptor(
            self.channel.clone(),
            AuthInterceptor {
                token: self.token.clone(),
            },
        );
        let request = pb::FindInstrumentRequest {
            query: query.into(),
            ..Default::default()
        };
        let response = client
            .find_instrument(request)
            .await
            .map_err(|error| Error::Api(friendly_status(&error)))?;
        Ok(response.into_inner().instruments.into_iter().map(map_instrument).collect())
    }

    pub async fn get_candles(
        &self,
        instrument_id: String,
        interval: i32,
        from: &str,
        to: &str,
        limit: i32,
    ) -> Result<Vec<CandleDto>> {
        let request = pb::GetCandlesRequest {
            instrument_id: Some(instrument_id),
            interval,
            from: Some(Timestamp {
                seconds: parse_iso(from)?,
                nanos: 0,
            }),
            to: Some(Timestamp {
                seconds: parse_iso(to)?,
                nanos: 0,
            }),
            limit: Some(limit),
            ..Default::default()
        };
        let response = self
            .market_data()
            .get_candles(request)
            .await
            .map_err(|error| Error::Api(friendly_status(&error)))?;
        Ok(response
            .into_inner()
            .candles
            .into_iter()
            .map(map_historic_candle)
            .collect())
    }

    pub async fn get_order_book(
        &self,
        instrument_id: String,
        depth: i32,
    ) -> Result<OrderBookDto> {
        let request = pb::GetOrderBookRequest {
            instrument_id: Some(instrument_id.clone()),
            depth,
            ..Default::default()
        };
        let response = self
            .market_data()
            .get_order_book(request)
            .await
            .map_err(|error| Error::Api(friendly_status(&error)))?;
        let book = response.into_inner();
        let side = |orders: Vec<pb::Order>| -> Vec<OrderLevelDto> {
            orders
                .into_iter()
                .map(|order| OrderLevelDto {
                    price: quotation(order.price),
                    quantity: order.quantity as f64,
                })
                .collect()
        };
        Ok(OrderBookDto {
            instrument_id,
            depth: book.depth,
            bids: side(book.bids),
            asks: side(book.asks),
            last_price: quotation(book.last_price),
            close_price: quotation(book.close_price),
            limit_up: quotation(book.limit_up),
            limit_down: quotation(book.limit_down),
            time: timestamp_seconds(book.orderbook_ts) * 1000,
        })
    }
}

fn parse_iso(value: &str) -> Result<i64> {
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.timestamp())
        .map_err(|error| Error::Api(format!("Некорректная дата {value}: {error}")))
}
