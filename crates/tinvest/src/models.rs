use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct InstrumentDto {
    pub id: String,
    #[serde(rename = "tradeable")]
    pub tradeable: bool,
    pub figi: String,
    pub ticker: String,
    pub name: String,
    pub kind: String,
    pub currency: String,
    #[serde(rename = "classCode")]
    pub class_code: String,
    pub exchange: String,
    pub lot: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uid: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CandleDto {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
    #[serde(rename = "isComplete")]
    pub is_complete: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct OrderLevelDto {
    pub price: f64,
    pub quantity: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct OrderBookDto {
    #[serde(rename = "instrumentId")]
    pub instrument_id: String,
    pub depth: i32,
    pub bids: Vec<OrderLevelDto>,
    pub asks: Vec<OrderLevelDto>,
    #[serde(rename = "lastPrice")]
    pub last_price: f64,
    #[serde(rename = "closePrice")]
    pub close_price: f64,
    #[serde(rename = "limitUp")]
    pub limit_up: f64,
    #[serde(rename = "limitDown")]
    pub limit_down: f64,
    pub time: i64,
}

use crate::pb;

pub fn quotation(value: Option<pb::Quotation>) -> f64 {
    match value {
        Some(quote) => quote.units as f64 + quote.nano as f64 / 1_000_000_000.0,
        None => f64::NAN,
    }
}

pub fn timestamp_seconds(value: Option<prost_types::Timestamp>) -> i64 {
    value.map(|timestamp| timestamp.seconds).unwrap_or(0)
}

pub fn map_candle(candle: pb::Candle) -> CandleDto {
    CandleDto {
        time: timestamp_seconds(candle.time),
        open: quotation(candle.open),
        high: quotation(candle.high),
        low: quotation(candle.low),
        close: quotation(candle.close),
        volume: candle.volume as f64,
        is_complete: false,
    }
}

pub fn map_historic_candle(candle: pb::HistoricCandle) -> CandleDto {
    CandleDto {
        time: timestamp_seconds(candle.time),
        open: quotation(candle.open),
        high: quotation(candle.high),
        low: quotation(candle.low),
        close: quotation(candle.close),
        volume: candle.volume as f64,
        is_complete: false,
    }
}

pub fn map_order_book(book: pb::OrderBook, instrument_id: String) -> OrderBookDto {
    fn side(orders: Vec<pb::Order>) -> Vec<OrderLevelDto> {
        orders
            .into_iter()
            .map(|order| OrderLevelDto {
                price: quotation(order.price),
                quantity: order.quantity as f64,
            })
            .collect()
    }
    OrderBookDto {
        instrument_id,
        depth: book.depth,
        bids: side(book.bids),
        asks: side(book.asks),
        last_price: 0.0,
        close_price: 0.0,
        limit_up: quotation(book.limit_up),
        limit_down: quotation(book.limit_down),
        time: timestamp_seconds(book.time) * 1000,
    }
}

pub fn map_instrument(item: pb::InstrumentShort) -> InstrumentDto {
    let kind = match item.instrument_kind {
        1 => "bond",
        2 => "share",
        3 => "currency",
        4 => "etf",
        5 => "futures",
        6 => "sp",
        7 => "option",
        8 => "clearing-certificate",
        9 => "index",
        10 => "commodity",
        other => match other {
            0 => "unknown",
            _ => "instrument",
        },
    };
    let figi = item.figi.clone();
    let uid = item.uid.clone();
    InstrumentDto {
        tradeable: item.api_trade_available_flag,
        id: if figi.is_empty() { item.uid.clone() } else { figi.clone() },
        figi,
        ticker: item.ticker,
        name: item.name,
        kind: kind.to_string(),
        currency: String::new(),
        class_code: item.class_code.clone(),
        exchange: item.class_code,
        lot: item.lot.max(1) as u32,
        uid: if uid.is_empty() { None } else { Some(uid) },
    }
}
