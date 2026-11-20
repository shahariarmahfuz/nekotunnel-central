use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::{
    models::{
        AuditLogDto, OverviewCounts, RailwayAccountDto, RailwayAccountSecret, SessionDto, SlotDto,
        SlotSecretRow, UserDto,
    },
    security::{
        decrypt_secret, encrypt_secret, make_user_token, sign_admin_session, token_hash,
        token_prefix, verify_admin_session, verify_admin_token,
    },
    services::{
        audit::record_audit,
        railway::{
            check_railway_cli_available, create_and_deploy_slot, fetch_whoami,
            prepare_account_auth, random_frp_token, refresh_slot_tcp, spawn_railway_cli_login,
        },
        sessions::terminate_session_admin,
    },
    state::AppState,
};

const SESSION_COOKIE_NAME: &str = "neko_session";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/login", post(admin_login))
        .route("/api/admin/logout", post(admin_logout))
        .route("/api/admin/me", get(admin_me))
        .route("/api/admin/overview", get(admin_overview))
        .route("/api/admin/accounts", get(list_accounts))
        .route("/api/admin/accounts/login", post(start_account_login))
        .route("/api/admin/accounts/login/{job_id}", get(get_account_login_status))
        .route("/api/admin/accounts/{id}/verify", post(verify_account))
        .route("/api/admin/accounts/{id}/toggle", post(toggle_account))
        .route("/api/admin/accounts/{id}", delete(delete_account))
        .route("/api/admin/users", get(list_users).post(create_user))
        .route("/api/admin/users/{id}/token", get(reveal_user_token))
        .route("/api/admin/users/{id}/toggle", post(toggle_user))
        .route("/api/admin/users/{id}", delete(delete_user))
        .route("/api/admin/slots", get(list_slots))
        .route("/api/admin/slots/manual", post(add_manual_slot))
        .route("/api/admin/slots/create", post(create_railway_slots))
        .route("/api/admin/slots/{id}/refresh", post(refresh_slot))
        .route("/api/admin/slots/{id}/free", post(force_free_slot))
        .route("/api/admin/slots/{id}", delete(delete_slot))
        .route("/api/admin/sessions", get(list_sessions))
        .route("/api/admin/sessions/{id}/terminate", post(terminate_session))
        .route("/api/admin/logs", get(list_logs))
}

fn extract_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    for part in raw.split(';') {
        let trimmed = part.trim();
        if let Some((k, v)) = trimmed.split_once('=') {
            if k.trim() == name {
                return Some(v.trim().to_string());
            }
        }
    }
    None
}

fn is_admin_authorized(headers: &HeaderMap, state: &AppState) -> bool {
    if let Some(header_token) = headers.get("x-admin-token").and_then(|v| v.to_str().ok()) {
        if verify_admin_token(&state.config.admin_token, Some(header_token)) {
            return true;
        }
    }
    if let Some(cookie_val) = extract_cookie(headers, SESSION_COOKIE_NAME) {
        if verify_admin_session(&state.config.app_secret, &cookie_val) {
            return true;
        }
    }
    false
}

fn require_admin(headers: &HeaderMap, state: &AppState) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    if is_admin_authorized(headers, state) {
        Ok(())
    } else {
        Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "detail": "admin auth required" })),
        ))
    }
}

fn is_https_request(headers: &HeaderMap, state: &AppState) -> bool {
    if let Some(forced) = state.config.cookie_secure {
        return forced;
    }
    headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .map(|proto| proto.split(',').any(|p| p.trim().eq_ignore_ascii_case("https")))
        .unwrap_or(false)
}

#[derive(Deserialize)]
struct LoginReq {
    admin_token: String,
}

async fn admin_login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<LoginReq>,
) -> impl IntoResponse {
    if !verify_admin_token(&state.config.admin_token, Some(req.admin_token.trim())) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "detail": "Wrong admin token" })),
        )
            .into_response();
    }

    let Ok(session_val) = sign_admin_session(&state.config.app_secret) else {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": "failed to create session" })),
        )
            .into_response();
    };

    let secure_attr = if is_https_request(&headers, &state) {
        "; Secure"
    } else {
        ""
    };
    let cookie = format!(
        "{SESSION_COOKIE_NAME}={session_val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800{secure_attr}"
    );

    (
        StatusCode::OK,
        [(header::SET_COOKIE, cookie)],
        Json(json!({ "ok": true })),
    )
        .into_response()
}

async fn admin_logout(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let secure_attr = if is_https_request(&headers, &state) {
        "; Secure"
    } else {
        ""
    };
    let cookie = format!(
        "{SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure_attr}"
    );
    (
        StatusCode::OK,
        [(header::SET_COOKIE, cookie)],
        Json(json!({ "ok": true })),
    )
}

async fn admin_me(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if is_admin_authorized(&headers, &state) {
        (StatusCode::OK, Json(json!({ "authenticated": true })))
    } else {
        (StatusCode::UNAUTHORIZED, Json(json!({ "authenticated": false })))
    }
}

async fn admin_overview(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let accounts = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM railway_accounts")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let users = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let free_slots = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM slots WHERE status = 'free'")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let busy_slots = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM slots WHERE status = 'busy'")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let pending_slots =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM slots WHERE status = 'tcp_pending'")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
    let deploying_slots =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM slots WHERE status = 'deploying'")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
    let failed_slots =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM slots WHERE status = 'failed'")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
    let active_sessions =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sessions WHERE status = 'active'")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);

    let logs = sqlx::query_as::<_, AuditLogDto>(
        "SELECT id, actor, action, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 20",
    )
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let railway_cli = check_railway_cli_available(&state.config.railway_cli_path).await;

    let counts = OverviewCounts {
        accounts,
        users,
        free_slots,
        busy_slots,
        pending_slots,
        deploying_slots,
        failed_slots,
        active_sessions,
    };

    (
        StatusCode::OK,
        Json(json!({
            "counts": counts,
            "logs": logs,
            "system": {
                "railway_cli": railway_cli,
                "session_ttl_seconds": state.config.session_ttl_seconds,
                "tcp_internal_port": state.config.tcp_internal_port,
                "frp_version": state.config.frp_version,
            }
        })),
    )
        .into_response()
}

async fn list_accounts(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    match sqlx::query_as::<_, RailwayAccountDto>(
        r#"
        SELECT id, label, workspace, auth_mode, railway_user, status, last_checked_at, created_at, updated_at
        FROM railway_accounts
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(accounts) => (StatusCode::OK, Json(json!({ "accounts": accounts }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct StartCliLoginReq {
    label: String,
    workspace: Option<String>,
}

async fn start_account_login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<StartCliLoginReq>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let label = req.label.trim().to_string();
    if label.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "detail": "label is required" })),
        )
            .into_response();
    }

    let workspace = req.workspace.unwrap_or_default().trim().to_string();
    let job_id = spawn_railway_cli_login(
        state.pool.clone(),
        state.config.clone(),
        state.login_jobs.clone(),
        label,
        workspace,
    );

    (StatusCode::ACCEPTED, Json(json!({ "job_id": job_id }))).into_response()
}

async fn get_account_login_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(job_id): Path<String>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let map = state.login_jobs.read().await;
    match map.get(&job_id) {
        Some(job) => (StatusCode::OK, Json(json!(job))).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "login job not found" })),
        )
            .into_response(),
    }
}

async fn verify_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let acct = match sqlx::query_as::<_, RailwayAccountSecret>(
        "SELECT id, label, workspace, api_token_cipher FROM railway_accounts WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await
    {
        Ok(Some(a)) => a,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "detail": "account not found" })),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "detail": e.to_string() })),
            )
                .into_response()
        }
    };

    let auth = match prepare_account_auth(&state.config, &acct) {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "detail": e })),
            )
                .into_response()
        }
    };

    match fetch_whoami(&state.config.railway_cli_path, &auth).await {
        Ok(who) => {
            let _ = sqlx::query(
                "UPDATE railway_accounts SET railway_user = $1, last_checked_at = NOW(), updated_at = NOW() WHERE id = $2",
            )
            .bind(&who)
            .bind(&id)
            .execute(&state.pool)
            .await;
            (StatusCode::OK, Json(json!({ "ok": true, "railway_user": who }))).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, Json(json!({ "detail": e }))).into_response(),
    }
}

async fn toggle_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let row = sqlx::query_scalar::<_, String>(
        r#"
        UPDATE railway_accounts
        SET status = CASE WHEN status = 'active' THEN 'disabled' ELSE 'active' END,
            updated_at = NOW()
        WHERE id = $1
        RETURNING label || ':' || status
        "#,
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await;

    match row {
        Ok(Some(info)) => {
            let _ = record_audit(&state.pool, "admin", "railway_account_toggled", Some(&info)).await;
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "account not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response(),
    }
}

async fn delete_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let res = sqlx::query("DELETE FROM railway_accounts WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await;

    match res {
        Ok(r) if r.rows_affected() > 0 => {
            let _ = record_audit(&state.pool, "admin", "railway_account_deleted", Some(&id)).await;
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "account not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response(),
    }
}

async fn list_users(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    match sqlx::query_as::<_, UserDto>(
        r#"
        SELECT u.id, u.name, u.token_prefix,
               (u.token_cipher IS NOT NULL) AS has_token,
               u.status, u.max_sessions, u.created_at,
               COALESCE(COUNT(s.id) FILTER (WHERE s.status = 'active'), 0) AS active_sessions
        FROM users u
        LEFT JOIN sessions s ON s.user_id = u.id
        GROUP BY u.id
        ORDER BY u.created_at DESC
        "#,
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(users) => (StatusCode::OK, Json(json!({ "users": users }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct CreateUserReq {
    name: String,
    max_sessions: Option<i32>,
}

async fn create_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CreateUserReq>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let name = req.name.trim();
    if name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "detail": "name is required" })),
        )
            .into_response();
    }

    let max_sessions = req.max_sessions.unwrap_or(1).clamp(1, 50);
    let raw_token = make_user_token();
    let prefix = token_prefix(&raw_token);
    let hash = token_hash(&state.config.app_secret, &raw_token);
    let cipher = match encrypt_secret(&state.config.encryption_key, &raw_token) {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "detail": e })),
            )
                .into_response()
        }
    };
    let id = Uuid::new_v4().to_string();

    let res = sqlx::query(
        r#"
        INSERT INTO users (id, name, token_prefix, token_hash, token_cipher, status, max_sessions, created_at)
        VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW())
        "#,
    )
    .bind(&id)
    .bind(name)
    .bind(&prefix)
    .bind(&hash)
    .bind(&cipher)
    .bind(max_sessions)
    .execute(&state.pool)
    .await;

    if let Err(e) = res {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response();
    }

    let _ = record_audit(
        &state.pool,
        "admin",
        "user_token_created",
        Some(&format!("user={name}")),
    )
    .await;

    (
        StatusCode::CREATED,
        Json(json!({ "id": id, "token": raw_token })),
    )
        .into_response()
}

async fn reveal_user_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let row = sqlx::query_scalar::<_, Option<String>>(
        "SELECT token_cipher FROM users WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await;

    match row {
        Ok(Some(Some(cipher))) => match decrypt_secret(&state.config.encryption_key, &cipher) {
            Ok(token) => (StatusCode::OK, Json(json!({ "token": token }))).into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "detail": e })),
            )
                .into_response(),
        },
        Ok(Some(None)) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "Legacy token cannot be revealed. Create a new user token to enable reveal." })),
        )
            .into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "user not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response(),
    }
}

async fn toggle_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let row = sqlx::query_scalar::<_, String>(
        r#"
        UPDATE users
        SET status = CASE WHEN status = 'active' THEN 'disabled' ELSE 'active' END
        WHERE id = $1
        RETURNING name || ':' || status
        "#,
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await;

    match row {
        Ok(Some(info)) => {
            let _ = record_audit(&state.pool, "admin", "user_toggled", Some(&info)).await;
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "user not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response(),
    }
}

async fn delete_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let res = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await;

    match res {
        Ok(r) if r.rows_affected() > 0 => {
            let _ = record_audit(&state.pool, "admin", "user_deleted", Some(&id)).await;
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "user not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response(),
    }
}

async fn list_slots(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    match sqlx::query_as::<_, SlotDto>(
        r#"
        SELECT s.id, s.railway_account_id, a.label AS account_label,
               s.project_name, s.project_id, s.service_name,
               s.server_addr, s.server_port, s.remote_port,
               s.status, s.current_session_id, s.last_error,
               s.last_used_at, s.created_at, s.updated_at
        FROM slots s
        LEFT JOIN railway_accounts a ON a.id = s.railway_account_id
        ORDER BY s.created_at DESC
        "#,
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(slots) => (StatusCode::OK, Json(json!({ "slots": slots }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct ManualSlotReq {
    project_name: String,
    server_addr: String,
    server_port: i32,
    frp_token: Option<String>,
    service_name: Option<String>,
    remote_port: Option<i32>,
}

async fn add_manual_slot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<ManualSlotReq>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let project_name = req.project_name.trim();
    let server_addr = req.server_addr.trim();
    if project_name.is_empty() || server_addr.is_empty() || !(1..=65535).contains(&req.server_port)
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "detail": "valid project_name, server_addr, and server_port are required" })),
        )
            .into_response();
    }

    let frp_token = req
        .frp_token
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(random_frp_token);

    let cipher = match encrypt_secret(&state.config.encryption_key, &frp_token) {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "detail": e })),
            )
                .into_response()
        }
    };

    let service_name = req
        .service_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("final");
    let remote_port = req.remote_port.unwrap_or(6000);
    let id = Uuid::new_v4().to_string();

    let res = sqlx::query(
        r#"
        INSERT INTO slots (id, project_name, service_name, server_addr, server_port, frp_token_cipher, remote_port, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'free', NOW(), NOW())
        "#,
    )
    .bind(&id)
    .bind(project_name)
    .bind(service_name)
    .bind(server_addr)
    .bind(req.server_port)
    .bind(&cipher)
    .bind(remote_port)
    .execute(&state.pool)
    .await;

    if let Err(e) = res {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response();
    }

    let _ = record_audit(
        &state.pool,
        "admin",
        "manual_slot_added",
        Some(&format!("{server_addr}:{}", req.server_port)),
    )
    .await;

    (
        StatusCode::CREATED,
        Json(json!({ "id": id, "frp_token": frp_token })),
    )
        .into_response()
}

#[derive(Deserialize)]
struct CreateSlotsReq {
    account_id: String,
    count: Option<u8>,
}

async fn create_railway_slots(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CreateSlotsReq>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let account = match sqlx::query_as::<_, RailwayAccountSecret>(
        r#"
        SELECT id, label, workspace, api_token_cipher
        FROM railway_accounts
        WHERE id = $1 AND status = 'active'
        "#,
    )
    .bind(req.account_id.trim())
    .fetch_optional(&state.pool)
    .await
    {
        Ok(Some(acct)) => acct,
        Ok(None) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "detail": "Invalid or disabled Railway account" })),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "detail": e.to_string() })),
            )
                .into_response()
        }
    };

    let count = req.count.unwrap_or(1).clamp(1, 5);
    let pool = state.pool.clone();
    let config = state.config.clone();

    tokio::spawn(async move {
        for _ in 0..count {
            if let Err(err) = create_and_deploy_slot(&pool, &config, &account).await {
                tracing::error!("slot deployment failed: {err}");
            }
        }
    });

    (
        StatusCode::ACCEPTED,
        Json(json!({ "ok": true, "queued": count })),
    )
        .into_response()
}

async fn refresh_slot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let slot = match sqlx::query_as::<_, SlotSecretRow>(
        r#"
        SELECT id, railway_account_id, project_name, project_id, service_name,
               server_addr, server_port, frp_token_cipher, remote_port
        FROM slots
        WHERE id = $1
        "#,
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "detail": "slot not found" })),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "detail": e.to_string() })),
            )
                .into_response()
        }
    };

    let account = if let Some(ref acct_id) = slot.railway_account_id {
        sqlx::query_as::<_, RailwayAccountSecret>(
            "SELECT id, label, workspace, api_token_cipher FROM railway_accounts WHERE id = $1",
        )
        .bind(acct_id)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
    } else {
        None
    };

    match refresh_slot_tcp(&state.pool, &state.config, &slot, account.as_ref()).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(err) => (StatusCode::BAD_GATEWAY, Json(json!({ "detail": err }))).into_response(),
    }
}

async fn force_free_slot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let row = sqlx::query_scalar::<_, String>(
        r#"
        UPDATE slots
        SET current_session_id = NULL,
            status = CASE
                WHEN server_addr IS NOT NULL AND server_port IS NOT NULL THEN 'free'
                ELSE 'tcp_pending'
            END,
            updated_at = NOW()
        WHERE id = $1
        RETURNING project_name
        "#,
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await;

    match row {
        Ok(Some(name)) => {
            let _ = sqlx::query(
                "UPDATE sessions SET status = 'closed', ended_at = NOW() WHERE slot_id = $1 AND status = 'active'",
            )
            .bind(&id)
            .execute(&state.pool)
            .await;
            let _ = record_audit(&state.pool, "admin", "slot_force_free", Some(&name)).await;
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "slot not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response(),
    }
}

async fn delete_slot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    let res = sqlx::query("DELETE FROM slots WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await;

    match res {
        Ok(r) if r.rows_affected() > 0 => {
            let _ = record_audit(&state.pool, "admin", "slot_deleted", Some(&id)).await;
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "slot not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response(),
    }
}

async fn list_sessions(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    match sqlx::query_as::<_, SessionDto>(
        r#"
        SELECT se.id, se.user_id, u.name AS user_name,
               se.slot_id, sl.project_name AS slot_project_name,
               sl.server_addr, sl.server_port,
               se.status, se.client_local_port, se.proxy_name,
               se.started_at, se.last_heartbeat_at, se.ended_at
        FROM sessions se
        JOIN users u ON u.id = se.user_id
        JOIN slots sl ON sl.id = se.slot_id
        ORDER BY se.started_at DESC
        LIMIT 100
        "#,
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(sessions) => (StatusCode::OK, Json(json!({ "sessions": sessions }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response(),
    }
}

async fn terminate_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    match terminate_session_admin(&state.pool, &id).await {
        Ok(true) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "active session not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response(),
    }
}

async fn list_logs(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(err) = require_admin(&headers, &state) {
        return err.into_response();
    }

    match sqlx::query_as::<_, AuditLogDto>(
        "SELECT id, actor, action, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100",
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(logs) => (StatusCode::OK, Json(json!({ "logs": logs }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": e.to_string() })),
        )
            .into_response(),
    }
}
