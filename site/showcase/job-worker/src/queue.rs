//! Queue abstraction — Redis-backed in this showcase.
use anyhow::Result;
use async_trait::async_trait;

#[derive(Debug, Clone)]
pub struct Job {
    pub id: String,
    pub kind: String,
    pub payload: String,
}

#[async_trait]
pub trait Queue: Send + Sync {
    async fn dequeue(&self) -> Result<Option<Job>>;
    async fn ack(&self, id: &str) -> Result<()>;
    async fn nack(&self, id: &str) -> Result<()>;
}

pub struct RedisQueue {
    // redis::Client in a real worker
    _url: String,
}

impl RedisQueue {
    pub async fn connect(url: String) -> Result<Self> {
        Ok(Self { _url: url })
    }
}

#[async_trait]
impl Queue for RedisQueue {
    async fn dequeue(&self) -> Result<Option<Job>> {
        // BRPOP jobs 0 — showcase returns idle
        Ok(None)
    }

    async fn ack(&self, _id: &str) -> Result<()> {
        Ok(())
    }

    async fn nack(&self, _id: &str) -> Result<()> {
        // LPUSH jobs for retry
        Ok(())
    }
}
