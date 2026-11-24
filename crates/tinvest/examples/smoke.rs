//! Connectivity smoke test: `cargo run -p tinvest --example smoke -- <token>`
//! Without a token it verifies TLS + gRPC reachability and expects Unauthenticated.

use tinvest::client::TinkoffClient;

#[tokio::main]
async fn main() {
    let token = std::env::args().nth(1).unwrap_or_else(|| "t.invalid-smoke-token".to_string());
    println!("connecting to {}", tinvest::GRPC_ENDPOINT);
    let client = match TinkoffClient::connect(token).await {
        Ok(client) => client,
        Err(error) => {
            eprintln!("connect error: {error}");
            std::process::exit(2);
        }
    };
    println!("TLS ok, channel established");
    match client.find_instruments("SBER").await {
        Ok(items) => println!("find_instruments -> {} items", items.len()),
        Err(error) => println!("find_instruments -> {error}"),
    }
    let book_id = String::from("BBG004730N88");
    match client.get_order_book(book_id, 5).await {
        Ok(book) => println!("orderbook -> {} bids / {} asks", book.bids.len(), book.asks.len()),
        Err(error) => println!("orderbook -> {error}"),
    }
    match client
        .get_candles(
            "BBG004730N88".to_string(),
            4,
            "2026-11-01T00:00:00Z",
            "2026-11-24T00:00:00Z",
            10,
        )
        .await
    {
        Ok(candles) => println!("candles -> {}", candles.len()),
        Err(error) => println!("candles -> {error}"),
    }
}
