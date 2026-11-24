//! Local secret storage for the desktop build.
//!
//! The T-Invest token and the AI key live in the OS keychain (Secret Service /
//! macOS Keychain / Windows Credential Manager). If the keychain is not
//! available (headless Linux, no session bus) we fall back to a 0600 file inside
//! the app config directory. The token is never written into the repository or
//! into the WebView.

use std::fs;
use std::path::PathBuf;

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "trading-terminal";
const TOKEN_USER: &str = "tinkoff-token";
const AI_KEY_USER: &str = "ai-api-key";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AiConfig {
    pub provider: String,
    pub model: String,
    #[serde(default)]
    pub has_key: bool,
}

impl AiConfig {
    pub fn public_view(&self) -> AiConfig {
        AiConfig {
            provider: if self.provider.is_empty() {
                "openai".to_string()
            } else {
                self.provider.clone()
            },
            model: if self.model.is_empty() {
                default_model(&self.provider)
            } else {
                self.model.clone()
            },
            has_key: self.has_key,
        }
    }
}

pub fn default_model(provider: &str) -> String {
    match provider {
        "anthropic" => "claude-3-5-haiku-latest".to_string(),
        _ => "gpt-4o-mini".to_string(),
    }
}

fn project_dirs() -> Option<ProjectDirs> {
    ProjectDirs::from("dev", "rogrrs", "Trading Terminal")
}

pub fn config_dir() -> Result<PathBuf, String> {
    let dirs = project_dirs().ok_or_else(|| "Не удалось определить каталог приложения".to_string())?;
    let dir = dirs.config_dir().to_path_buf();
    fs::create_dir_all(&dir).map_err(|error| format!("Каталог конфигурации: {error}"))?;
    Ok(dir)
}

fn secret_file() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("secrets.json"))
}

#[derive(Default, Serialize, Deserialize)]
struct FileSecrets {
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    ai_key: Option<String>,
}

fn read_file_secrets() -> FileSecrets {
    let path = match secret_file() {
        Ok(path) => path,
        Err(_) => return FileSecrets::default(),
    };
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => FileSecrets::default(),
    }
}

fn write_file_secrets(secrets: &FileSecrets) -> Result<(), String> {
    let path = secret_file()?;
    fs::write(&path, serde_json::to_vec_pretty(secrets).map_err(|e| e.to_string())?)
        .map_err(|error| format!("Запись секретов: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn keyring_get(user: &str) -> Option<String> {
    let entry = keyring::Entry::new(SERVICE, user).ok()?;
    entry.get_password().ok().filter(|value| !value.is_empty())
}

fn keyring_set(user: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, user).map_err(|error| error.to_string())?;
    entry.set_password(value).map_err(|error| error.to_string())
}

fn keyring_delete(user: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, user).map_err(|error| error.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

/// True when the OS keychain is usable (writes go there instead of the file).
fn keychain_available() -> bool {
    static AVAILABLE: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *AVAILABLE.get_or_init(|| {
        let probe = keyring::Entry::new(SERVICE, "probe");
        match probe {
            Ok(entry) => {
                let value = format!("probe-{}", std::process::id());
                match entry.set_password(&value) {
                    Ok(()) => {
                        let _ = entry.delete_credential();
                        true
                    }
                    Err(_) => false,
                }
            }
            Err(_) => false,
        }
    })
}

pub fn get_token() -> Option<String> {
    if keychain_available() {
        if let Some(token) = keyring_get(TOKEN_USER) {
            return Some(token);
        }
    }
    read_file_secrets().token
}

pub fn set_token(token: &str) -> Result<(), String> {
    let token = token.trim();
    if keychain_available() {
        keyring_set(TOKEN_USER, token)?;
        let mut file = read_file_secrets();
        if file.token.is_some() {
            file.token = None;
            let _ = write_file_secrets(&file);
        }
        return Ok(());
    }
    let mut file = read_file_secrets();
    file.token = Some(token.to_string());
    write_file_secrets(&file)
}

pub fn clear_token() -> Result<(), String> {
    if keychain_available() {
        keyring_delete(TOKEN_USER)?;
    }
    let mut file = read_file_secrets();
    file.token = None;
    write_file_secrets(&file)
}

pub fn get_ai_key() -> Option<String> {
    if keychain_available() {
        if let Some(key) = keyring_get(AI_KEY_USER) {
            return Some(key);
        }
    }
    read_file_secrets().ai_key
}

pub fn get_ai_config() -> AiConfig {
    let stored = config_dir()
        .ok()
        .and_then(|dir| fs::read_to_string(dir.join("ai.json")).ok())
        .and_then(|raw| serde_json::from_str::<AiConfig>(&raw).ok())
        .unwrap_or_default();
    let has_key = get_ai_key().map(|key| !key.trim().is_empty()).unwrap_or(false);
    AiConfig {
        provider: stored.provider,
        model: stored.model,
        has_key,
    }
}

pub fn set_ai_config(provider: &str, model: &str, api_key: Option<&str>) -> Result<AiConfig, String> {
    let provider = if provider == "anthropic" { "anthropic" } else { "openai" };
    let model = if model.trim().is_empty() {
        default_model(provider)
    } else {
        model.trim().to_string()
    };

    match api_key.map(str::trim).filter(|value| !value.is_empty()) {
        Some(key) => {
            if keychain_available() {
                keyring_set(AI_KEY_USER, key)?;
            } else {
                let mut file = read_file_secrets();
                file.ai_key = Some(key.to_string());
                write_file_secrets(&file)?;
            }
        }
        None => {
            if api_key.is_some() {
                // Explicit empty string clears the key.
                if keychain_available() {
                    keyring_delete(AI_KEY_USER)?;
                } else {
                    let mut file = read_file_secrets();
                    file.ai_key = None;
                    write_file_secrets(&file)?;
                }
            }
        }
    }

    let config = AiConfig {
        provider: provider.to_string(),
        model,
        has_key: get_ai_key().is_some(),
    };
    let path = config_dir()?.join("ai.json");
    fs::write(&path, serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?)
        .map_err(|error| format!("Запись конфигурации AI: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(config.public_view())
}
