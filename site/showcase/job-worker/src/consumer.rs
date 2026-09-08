//! Dequeue loop — the heart of the worker process.
use anyhow::Result;
use tracing::{error, info};

use crate::handler::handle_job;
use crate::queue::Queue;

pub async fn run_worker<Q: Queue>(queue: Q) -> Result<()> {
    loop {
        match queue.dequeue().await? {
            Some(job) => {
                info!(job_id = %job.id, kind = %job.kind, "dequeued");
                match handle_job(&job).await {
                    Ok(()) => queue.ack(&job.id).await?,
                    Err(err) => {
                        error!(job_id = %job.id, error = %err, "handler failed");
                        queue.nack(&job.id).await?;
                    }
                }
            }
            None => tokio::time::sleep(std::time::Duration::from_millis(200)).await,
        }
    }
}
