//! BudgetLens desktop shell (Tauri 2, desktop-only v1).
//!
//! Tauri commands:
//! - `get_secret` / `set_secret` / `delete_secret`: OS-keychain storage for
//!   BYOK API keys (Keychain / Credential Manager / Secret Service).
//!   Secrets live in the keychain + RAM only, never in `store.json`/logs.
//! - `llm_chat` / `llm_models`: OpenAI-compatible LLM transport through
//!   Rust `reqwest` (no WebView Origin, so no CORS preflight; keys never
//!   enter the JS bundle when remembered). Non-streaming, matching the web
//!   `fetch` path shape for shape-compatible responses.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::IpAddr;
use std::time::Duration;

use zeroize::Zeroizing;

const MAX_RESPONSE_BYTES: usize = 10_000_000;
const MAX_LISTED_MODELS: usize = 500;

fn snippet(text: &str, max_chars: usize) -> String {
    let end = text
        .char_indices()
        .nth(max_chars)
        .map_or(text.len(), |(index, _)| index);
    text[..end].to_owned()
}

/// Validate a user-supplied OpenAI-compatible base URL and join an endpoint.
///
/// Contract: `http(s)` only, host required. Link-local (cloud metadata
/// `169.254.169.254` lives there) and unspecified hosts are denied.
/// Loopback (desktop Ollama/LM Studio/bridge) and LAN/private hosts stay
/// allowed — the user points the app at their own machine.
fn endpoint_url(raw_base: &str, endpoint: &str) -> Result<url::Url, String> {
    let base = raw_base.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Base URL is empty.".into());
    }
    let url =
        url::Url::parse(&format!("{base}{endpoint}")).map_err(|_| "Base URL is not valid.")?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err("Base URL must use http or https.".into()),
    }
    let host = url.host_str().ok_or("Base URL must include a host.")?;
    if let Ok(ip) = host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .parse::<IpAddr>()
    {
        let blocked = match ip {
            IpAddr::V4(v4) => v4.is_unspecified() || v4.is_link_local(),
            // fe80::/10 link-local; loopback (::1) is not link-local.
            IpAddr::V6(v6) => v6.is_unspecified() || (v6.segments()[0] & 0xffc0) == 0xfe80,
        };
        if blocked {
            return Err("Base URL host is not allowed.".into());
        }
    }
    Ok(url)
}

fn http_client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(timeout)
        // Redirects off: a rewritten POST target could leak the key.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("HTTP client failed: {error}"))
}

fn auth_header(
    builder: reqwest::RequestBuilder,
    api_key: Option<&Zeroizing<String>>,
) -> reqwest::RequestBuilder {
    match api_key {
        Some(key) if !key.trim().is_empty() => {
            builder.header("authorization", format!("Bearer {}", key.trim()))
        }
        _ => builder,
    }
}

fn attribution_headers(
    builder: reqwest::RequestBuilder,
    host: &str,
) -> reqwest::RequestBuilder {
    if host.contains("openrouter.ai") {
        builder
            .header(
                "HTTP-Referer",
                "https://github.com/cbangera2/BudgetLens",
            )
            .header("X-Title", "BudgetLens")
    } else {
        builder
    }
}

async fn read_json_body(response: reqwest::Response) -> Result<serde_json::Value, String> {
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Provider read failed: {error}"))?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("Provider response too large.".into());
    }
    let text = String::from_utf8_lossy(&bytes);
    if !status.is_success() {
        return Err(format!(
            "Provider {}: {}",
            status.as_u16(),
            snippet(&text, 300)
        ));
    }
    serde_json::from_str(&text).map_err(|_| "Provider returned an unreadable response.".into())
}

#[tauri::command]
fn get_secret(service: String, account: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(&service, &account).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn set_secret(service: String, account: String, secret: String) -> Result<(), String> {
    if secret.len() > 8_192 {
        return Err("Secret is too large.".into());
    }
    let entry = keyring::Entry::new(&service, &account).map_err(|error| error.to_string())?;
    entry
        .set_password(&secret)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_secret(service: String, account: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service, &account).map_err(|error| error.to_string())?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
async fn llm_chat(
    base_url: String,
    api_key: Option<String>,
    model: String,
    messages: serde_json::Value,
    tools: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    if model.trim().is_empty() {
        return Err("Model is empty.".into());
    }
    let url = endpoint_url(&base_url, "/chat/completions")?;
    let host = url.host_str().unwrap_or_default().to_owned();
    let client = http_client(Duration::from_secs(120))?;
    let key = api_key.map(Zeroizing::new);

    let mut body =
        serde_json::json!({ "model": model, "messages": messages, "temperature": 0.2 });
    if let Some(definitions) = tools {
        body["tools"] = definitions;
        body["tool_choice"] = serde_json::json!("auto");
    }

    let request = attribution_headers(
        auth_header(
            client.post(url).header("content-type", "application/json"),
            key.as_ref(),
        ),
        &host,
    )
    .body(body.to_string());
    let response = request
        .send()
        .await
        .map_err(|error| format!("Provider request failed: {error}"))?;
    read_json_body(response).await
}

#[tauri::command]
async fn llm_models(
    base_url: String,
    api_key: Option<String>,
) -> Result<Vec<String>, String> {
    let url = endpoint_url(&base_url, "/models")?;
    let host = url.host_str().unwrap_or_default().to_owned();
    let client = http_client(Duration::from_secs(15))?;
    let key = api_key.map(Zeroizing::new);

    let request = attribution_headers(
        auth_header(client.get(url), key.as_ref()),
        &host,
    );
    let response = request
        .send()
        .await
        .map_err(|error| format!("Provider request failed: {error}"))?;
    let payload = read_json_body(response).await?;
    let ids: Vec<String> = payload
        .get("data")
        .and_then(serde_json::Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry.get("id")?.as_str().map(str::to_owned))
                .take(MAX_LISTED_MODELS)
                .collect()
        })
        .unwrap_or_default();
    if ids.is_empty() {
        return Err("Provider listed no models.".into());
    }
    Ok(ids)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_secret,
            set_secret,
            delete_secret,
            llm_chat,
            llm_models
        ])
        .run(tauri::generate_context!())
        .expect("error while running BudgetLens");
}
