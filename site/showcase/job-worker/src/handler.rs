//! Job handlers — one function per kind; side effects stay here.
use anyhow::{bail, Result};
use tracing::info;

use crate::queue::Job;

pub async fn handle_job(job: &Job) -> Result<()> {
    match job.kind.as_str() {
        "send_email" => send_email(job).await,
        "resize_image" => resize_image(job).await,
        other => bail!("unknown job kind: {other}"),
    }
}

async fn send_email(job: &Job) -> Result<()> {
    info!(job_id = %job.id, "send_email");
    // smtp client in a real worker
    Ok(())
}

async fn resize_image(job: &Job) -> Result<()> {
    info!(job_id = %job.id, "resize_image");
    // image crate / S3 in a real worker
    Ok(())
}
