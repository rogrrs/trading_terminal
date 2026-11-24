//! Optional Pine Script -> JS conversion through OpenAI / Anthropic.
//! Mirrors `server/ai.ts` so both backends behave identically.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::secrets::{default_model, get_ai_config, get_ai_key};

const SYSTEM_PROMPT: &str = r#"Ты — транспилятор Pine Script v5 в JavaScript для векторного движка индикаторов.
Верни ТОЛЬКО валидный JavaScript в одном блоке ```js ... ```, без пояснений вне кода.

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
- Если в Pine есть неподдерживаемые конструкции, удали их и оставь рабочий векторный аналог."#;

#[derive(Debug, Serialize)]
pub struct AiConvertResult {
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct AiConvertRequest {
    pub pine: String,
    pub provider: String,
    #[serde(default)]
    pub model: Option<String>,
}

pub async fn convert_pine(request: AiConvertRequest) -> Result<AiConvertResult, String> {
    let config = get_ai_config();
    let api_key = get_ai_key().ok_or_else(|| "Ключ OpenAI/Anthropic не задан".to_string())?;
    let provider = if request.provider == "anthropic" { "anthropic" } else { "openai" };
    let model = request
        .model
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            if config.model.is_empty() {
                default_model(provider)
            } else {
                config.model.clone()
            }
        });

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| error.to_string())?;

    let text = match provider {
        "anthropic" => call_anthropic(&http, &model, &api_key, &request.pine).await?,
        _ => call_openai(&http, &model, &api_key, &request.pine).await?,
    };

    let code = extract_code(&text);
    if code.is_empty() {
        return Err("Модель вернула пустой код".to_string());
    }
    let mut warnings = Vec::new();
    if ["request.security", "label.new", "line.new", "box.new", "table.new"]
        .iter()
        .any(|needle| code.contains(needle))
    {
        warnings.push("В коде остались неподдерживаемые конструкции — проверьте результат".to_string());
    }
    Ok(AiConvertResult {
        code,
        explanation: None,
        warnings,
    })
}

fn extract_code(text: &str) -> String {
    let trimmed = text.trim();
    if let Some(start) = trimmed.find("```") {
        let after = &trimmed[start + 3..];
        let after = after.strip_prefix("js").or_else(|| after.strip_prefix("javascript")).unwrap_or(after);
        if let Some(end) = after.find("```") {
            return after[..end].trim().to_string();
        }
    }
    trimmed.to_string()
}

async fn call_openai(
    http: &reqwest::Client,
    model: &str,
    api_key: &str,
    pine: &str,
) -> Result<String, String> {
    let body = json!({
        "model": model,
        "temperature": 0.1,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": pine }
        ]
    });
    let response = http
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("OpenAI: {error}"))?;
    let status = response.status();
    let payload: Value = response.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        let message = payload
            .pointer("/error/message")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("OpenAI: HTTP {status}"));
        return Err(message);
    }
    Ok(payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string())
}

async fn call_anthropic(
    http: &reqwest::Client,
    model: &str,
    api_key: &str,
    pine: &str,
) -> Result<String, String> {
    let body = json!({
        "model": model,
        "max_tokens": 4000,
        "temperature": 0.1,
        "system": SYSTEM_PROMPT,
        "messages": [{ "role": "user", "content": pine }]
    });
    let response = http
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Anthropic: {error}"))?;
    let status = response.status();
    let payload: Value = response.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        let message = payload
            .pointer("/error/message")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("Anthropic: HTTP {status}"));
        return Err(message);
    }
    Ok(payload
        .get("content")
        .and_then(Value::as_array)
        .and_then(|items| {
            items
                .iter()
                .find(|item| item.get("type").and_then(Value::as_str) == Some("text"))
        })
        .and_then(|item| item.get("text"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string())
}
