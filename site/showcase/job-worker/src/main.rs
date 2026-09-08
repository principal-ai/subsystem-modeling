//! Background job worker — Tokio runtime pulls jobs from a queue and runs handlers.
use anyhow::Result;
use tracing::info;

mod consumer;
mod handler;
mod queue;

use consumer::run_worker;
use queue::RedisQueue;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    let queue = RedisQueue::connect(std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1".into())).await?;
    info!("worker starting");
    run_worker(queue).await
}
