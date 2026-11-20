use serde::Serialize;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::config::Config;

#[derive(Clone, Debug, Serialize)]
pub struct RailwayLoginJob {
    pub job_id: String,
    pub label: String,
    pub workspace: String,
    pub status: String,
    pub activation_url: Option<String>,
    pub user_code: Option<String>,
    pub railway_user: Option<String>,
    pub account_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Config,
    pub login_jobs: Arc<RwLock<HashMap<String, RailwayLoginJob>>>,
}
