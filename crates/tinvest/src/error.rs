use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("{0}")]
    Api(String),
    #[error("Токен T-Invest не задан")]
    NoToken,
    #[error("Ошибка соединения с T-Invest API: {0}")]
    Transport(#[from] tonic::transport::Error),
    #[error("T-Invest API: {0}")]
    Status(#[from] tonic::Status),
}

pub type Result<T> = std::result::Result<T, Error>;

pub fn friendly_status(status: &tonic::Status) -> String {
    match status.code() {
        tonic::Code::Unauthenticated | tonic::Code::PermissionDenied => {
            "Неверный или просроченный токен T-Invest".to_string()
        }
        tonic::Code::ResourceExhausted => "Превышен лимит запросов T-Invest API".to_string(),
        tonic::Code::Unavailable => "T-Invest API недоступен".to_string(),
        _ => status.message().to_string(),
    }
}
