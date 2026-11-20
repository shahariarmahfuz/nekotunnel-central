use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct RailwayAccountDto {
    pub id: String,
    pub label: String,
    pub workspace: String,
    pub auth_mode: String,
    pub railway_user: Option<String>,
    pub status: String,
    pub last_checked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct RailwayAccountSecret {
    pub id: String,
    pub label: String,
    pub workspace: String,
    pub api_token_cipher: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct UserDto {
    pub id: String,
    pub name: String,
    pub token_prefix: String,
    pub has_token: bool,
    pub status: String,
    pub max_sessions: i32,
    pub active_sessions: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct ActiveUserRow {
    pub id: String,
    pub name: String,
    pub max_sessions: i32,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct SlotDto {
    pub id: String,
    pub railway_account_id: Option<String>,
    pub account_label: Option<String>,
    pub project_name: String,
    pub project_id: Option<String>,
    pub service_name: String,
    pub server_addr: Option<String>,
    pub server_port: Option<i32>,
    pub remote_port: i32,
    pub status: String,
    pub current_session_id: Option<String>,
    pub last_error: Option<String>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct SlotSecretRow {
    pub id: String,
    pub railway_account_id: Option<String>,
    pub project_name: String,
    pub project_id: Option<String>,
    pub service_name: String,
    pub server_addr: Option<String>,
    pub server_port: Option<i32>,
    pub frp_token_cipher: String,
    pub remote_port: i32,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct SessionDto {
    pub id: String,
    pub user_id: String,
    pub user_name: String,
    pub slot_id: String,
    pub slot_project_name: String,
    pub server_addr: Option<String>,
    pub server_port: Option<i32>,
    pub status: String,
    pub client_local_port: Option<i32>,
    pub proxy_name: String,
    pub started_at: DateTime<Utc>,
    pub last_heartbeat_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct AuditLogDto {
    pub id: String,
    pub actor: String,
    pub action: String,
    pub details: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct OverviewCounts {
    pub accounts: i64,
    pub users: i64,
    pub free_slots: i64,
    pub busy_slots: i64,
    pub pending_slots: i64,
    pub deploying_slots: i64,
    pub failed_slots: i64,
    pub active_sessions: i64,
}

#[derive(Debug, Deserialize)]
pub struct ConnectRequest {
    pub token: String,
    pub local_port: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct SessionRequest {
    pub token: String,
    pub session_id: String,
}

#[derive(Debug, Serialize)]
pub struct ConnectResponse {
    pub session_id: String,
    pub server_addr: String,
    pub server_port: i32,
    pub frp_token: String,
    pub remote_port: i32,
    pub proxy_name: String,
}
