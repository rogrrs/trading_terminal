//! Tauri v2 desktop backend.
//!
//! Responsibilities:
//! - keep the T-Invest token / AI key in the OS keychain (never in the repo),
//! - proxy REST + gRPC market data to the WebView over IPC,
//! - run one market-data stream and forward candles / order books as events.

mod ai;
mod secrets;

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{watch, Mutex};
use tokio::time::sleep;

use tinvest::client::TinkoffClient;
use tinvest::models::{CandleDto, InstrumentDto, OrderBookDto};
use tinvest::stream::{run_stream, StreamEvent, StreamSpec};

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const GRPC_ENDPOINT: &str = tinvest::GRPC_ENDPOINT;

#[derive(Default)]
struct AppState {
    stream_task: Mutex<Option<tokio::task::JoinHandle<()>>>,
    stream_stop: Mutex<Option<watch::Sender<bool>>>,
}

#[derive(Serialize)]
struct Health {
    ok: bool,
    version: String,
    backend: &'static str,
    endpoint: String,
    #[serde(rename = "hasToken")]
    has_token: bool,
    streaming: &'static str,
}

#[derive(Serialize)]
struct TokenStatus {
    #[serde(rename = "hasToken")]
    has_token: bool,
    storage: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    masked: Option<String>,
    mode: &'static str,
}

#[derive(Deserialize)]
struct CandlesRequest {
    #[serde(rename = "instrumentId")]
    instrument_id: String,
    interval: String,
    from: String,
    to: String,
    #[serde(default)]
    limit: Option<i32>,
}

#[derive(Deserialize)]
struct OrderBookRequest {
    #[serde(rename = "instrumentId")]
    instrument_id: String,
    depth: i32,
}

#[derive(Deserialize, Clone)]
struct SubscriptionSpecDto {
    #[serde(default, rename = "candles")]
    candles: Option<CandlesSubscription>,
    #[serde(default, rename = "orderbook")]
    orderbook: Option<OrderBookSubscription>,
}

#[derive(Deserialize, Clone)]
struct CandlesSubscription {
    #[serde(rename = "instrumentId")]
    instrument_id: String,
    interval: String,
}

#[derive(Deserialize, Clone)]
struct OrderBookSubscription {
    #[serde(rename = "instrumentId")]
    instrument_id: String,
    depth: i32,
}

#[derive(Deserialize)]
struct AiConfigInput {
    provider: String,
    #[serde(default)]
    model: Option<String>,
    #[serde(default, rename = "apiKey")]
    api_key: Option<String>,
}

fn token() -> Result<String, String> {
    secrets::get_token().ok_or_else(|| "Токен T-Invest не задан".to_string())
}

async fn client() -> Result<TinkoffClient, String> {
    let token = token()?;
    TinkoffClient::connect(token).await.map_err(|error| error.to_string())
}

fn map_status(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn mask(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= 8 {
        let head = chars.first().map(|value| value.to_string()).unwrap_or_default();
        return format!("{head}••••");
    }
    format!(
        "{}••••{}",
        chars[0],
        chars[chars.len() - 4..].iter().collect::<String>()
    )
}

#[tauri::command]
async fn health() -> Result<Health, String> {
    Ok(Health {
        ok: true,
        version: APP_VERSION.to_string(),
        backend: "tauri",
        endpoint: GRPC_ENDPOINT.to_string(),
        has_token: secrets::get_token().is_some(),
        streaming: "grpc",
    })
}

#[tauri::command]
fn token_status() -> Result<TokenStatus, String> {
    match secrets::get_token() {
        Some(value) => Ok(TokenStatus {
            has_token: true,
            storage: "keychain",
            masked: Some(mask(&value)),
            mode: "unknown",
        }),
        None => Ok(TokenStatus {
            has_token: false,
            storage: "none",
            masked: None,
            mode: "unknown",
        }),
    }
}

#[tauri::command]
fn token_set(token: String) -> Result<TokenStatus, String> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("Пустой токен".to_string());
    }
    secrets::set_token(&token)?;
    Ok(TokenStatus {
        has_token: true,
        storage: "keychain",
        masked: Some(mask(&token)),
        mode: "unknown",
    })
}

#[tauri::command]
fn token_clear() -> Result<(), String> {
    secrets::clear_token()
}

#[tauri::command]
async fn instruments_search(query: String) -> Result<Vec<InstrumentDto>, String> {
    let client = client().await?;
    client.find_instruments(query).await.map_err(map_status)
}

#[tauri::command]
async fn candles_get(req: CandlesRequest) -> Result<Vec<CandleDto>, String> {
    let client = client().await?;
    let interval = parse_interval(&req.interval)?;
    client
        .get_candles(
            req.instrument_id,
            interval,
            &req.from,
            &req.to,
            req.limit.unwrap_or(0),
        )
        .await
        .map_err(map_status)
}

#[tauri::command]
async fn orderbook_get(req: OrderBookRequest) -> Result<OrderBookDto, String> {
    let client = client().await?;
    client
        .get_order_book(req.instrument_id, req.depth)
        .await
        .map_err(map_status)
}

#[tauri::command]
async fn lastprices_get(ids: Vec<String>) -> Result<std::collections::HashMap<String, f64>, String> {
    let client = client().await?;
    let prices = tinvest::client::get_last_prices(client.token.clone(), ids)
        .await
        .map_err(map_status)?;
    Ok(prices.into_iter().collect())
}

#[tauri::command]
async fn ai_config() -> Result<secrets::AiConfig, String> {
    Ok(secrets::get_ai_config().public_view())
}

#[tauri::command]
async fn ai_config_set(config: AiConfigInput) -> Result<secrets::AiConfig, String> {
    secrets::set_ai_config(
        &config.provider,
        config.model.as_deref().unwrap_or(""),
        config.api_key.as_deref(),
    )
}

#[tauri::command]
async fn ai_convert(req: ai::AiConvertRequest) -> Result<ai::AiConvertResult, String> {
    ai::convert_pine(req).await
}

#[tauri::command]
async fn stream_subscribe(
    app: AppHandle,
    state: State<'_, AppState>,
    spec: SubscriptionSpecDto,
) -> Result<(), String> {
    stop_stream(&state).await;

    let token = token()?;
    let candles = match spec.candles.clone() {
        Some(item) => Some((item.instrument_id, parse_subscription_interval(&item.interval)?)),
        None => None,
    };
    let orderbook = spec.orderbook.clone().map(|item| (item.instrument_id, item.depth));
    let stream_spec = StreamSpec { candles, orderbook };

    let (tx, rx) = watch::channel(false);
    let handle = app.clone();
    let task = tokio::spawn(async move {
        let mut backoff = 1u64;
        while *rx.borrow() {
            let app = handle.clone();
            let result = run_stream(token.clone(), stream_spec.clone(), move |event| match event {
                StreamEvent::Candle(candle) => {
                    let _ = app.emit("stream://candle", candle);
                }
                StreamEvent::OrderBook(book) => {
                    let _ = app.emit("stream://orderbook", book);
                }
                StreamEvent::Status(status) => {
                    let _ = app.emit("stream://status", serde_json::json!({ "status": status }));
                }
                StreamEvent::Error(message) => {
                    let _ = app.emit("stream://error", serde_json::json!({ "message": message }));
                }
            })
            .await;

            if !*rx.borrow() {
                break;
            }
            match result {
                Ok(()) => backoff = 1,
                Err(error) => {
                    let message = error.to_string();
                    if message.contains("Неверный или просроченный токен") {
                        let _ = handle.emit(
                            "stream://error",
                            serde_json::json!({ "message": message }),
                        );
                        break;
                    }
                    let _ = handle.emit("stream://status", serde_json::json!({ "status": "reconnecting" }));
                }
            }
            sleep(Duration::from_secs(backoff)).await;
            backoff = (backoff * 2).min(30);
        }
    });

    *state.stream_task.lock().await = Some(task);
    *state.stream_stop.lock().await = Some(tx);
    Ok(())
}

#[tauri::command]
async fn stream_unsubscribe(state: State<'_, AppState>) -> Result<(), String> {
    stop_stream(&state).await;
    Ok(())
}

async fn stop_stream(state: &AppState) {
    if let Some(tx) = state.stream_stop.lock().await.take() {
        let _ = tx.send(true);
    }
    if let Some(task) = state.stream_task.lock().await.take() {
        task.abort();
    }
}

fn parse_interval(value: &str) -> Result<i32, String> {
    match value {
        "CANDLE_INTERVAL_1_MIN" => Ok(1),
        "CANDLE_INTERVAL_5_MIN" => Ok(2),
        "CANDLE_INTERVAL_15_MIN" => Ok(3),
        "CANDLE_INTERVAL_HOUR" => Ok(4),
        "CANDLE_INTERVAL_4_HOUR" => Ok(9),
        "CANDLE_INTERVAL_DAY" => Ok(5),
        "CANDLE_INTERVAL_WEEK" => Ok(6),
        "CANDLE_INTERVAL_MONTH" => Ok(7),
        other => Err(format!("Неподдерживаемый интервал {other}")),
    }
}

fn parse_subscription_interval(value: &str) -> Result<i32, String> {
    match value {
        "SUBSCRIPTION_INTERVAL_ONE_MINUTE" => Ok(1),
        "SUBSCRIPTION_INTERVAL_FIVE_MINUTES" => Ok(2),
        "SUBSCRIPTION_INTERVAL_FIFTEEN_MINUTES" => Ok(3),
        "SUBSCRIPTION_INTERVAL_ONE_HOUR" => Ok(4),
        "SUBSCRIPTION_INTERVAL_ONE_DAY" => Ok(5),
        "SUBSCRIPTION_INTERVAL_7_DAYS" => Ok(6),
        other => Err(format!("Неподдерживаемый интервал подписки {other}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            health,
            token_status,
            token_set,
            token_clear,
            instruments_search,
            candles_get,
            orderbook_get,
            lastprices_get,
            stream_subscribe,
            stream_unsubscribe,
            ai_config,
            ai_config_set,
            ai_convert
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
