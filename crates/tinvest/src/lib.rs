pub mod client;
pub mod error;
pub mod models;
pub mod stream;

pub const GRPC_ENDPOINT: &str = "https://invest-public-api.tbank.ru:443";
pub const REST_ENDPOINT: &str = "https://invest-public-api.tbank.ru/rest";

pub mod pb {
    include!(concat!(env!("OUT_DIR"), "/tinkoff.public.invest.api.contract.v1.rs"));
}
