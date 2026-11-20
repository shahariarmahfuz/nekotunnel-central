use axum::{
    extract::State,
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde_json::json;

use crate::{
    models::{ConnectRequest, SessionRequest},
    services::sessions::{
        allocate_slot, disconnect, find_active_user_by_token, heartbeat, AllocateError,
    },
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .route("/api/connect", post(api_connect))
        .route("/api/heartbeat", post(api_heartbeat))
        .route("/api/disconnect", post(api_disconnect))
        .route("/client/nekotunnel", get(get_client_script))
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
        .is_ok();

    let status = if db_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status,
        Json(json!({
            "ok": db_ok,
            "db": db_ok,
            "time": Utc::now().to_rfc3339(),
        })),
    )
}

async fn api_connect(
    State(state): State<AppState>,
    Json(req): Json<ConnectRequest>,
) -> impl IntoResponse {
    match allocate_slot(
        &state.pool,
        &state.config.app_secret,
        &state.config.encryption_key,
        req.token.trim(),
        req.local_port,
    )
    .await
    {
        Ok(resp) => (StatusCode::OK, Json(json!(resp))).into_response(),
        Err(AllocateError::InvalidToken) => (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "detail": "invalid_token" })),
        )
            .into_response(),
        Err(AllocateError::MaxSessionsReached) => (
            StatusCode::CONFLICT,
            Json(json!({ "detail": "max_sessions_reached" })),
        )
            .into_response(),
        Err(AllocateError::NoFreeSlot) => (
            StatusCode::CONFLICT,
            Json(json!({ "detail": "no_free_slot" })),
        )
            .into_response(),
        Err(AllocateError::Internal(err)) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": err })),
        )
            .into_response(),
    }
}

async fn api_heartbeat(
    State(state): State<AppState>,
    Json(req): Json<SessionRequest>,
) -> impl IntoResponse {
    let Ok(Some(user)) =
        find_active_user_by_token(&state.pool, &state.config.app_secret, req.token.trim()).await
    else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "detail": "invalid_token" })),
        );
    };

    match heartbeat(&state.pool, &user.id, req.session_id.trim()).await {
        Ok(true) => (StatusCode::OK, Json(json!({ "ok": true }))),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "session_not_found" })),
        ),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": err.to_string() })),
        ),
    }
}

async fn api_disconnect(
    State(state): State<AppState>,
    Json(req): Json<SessionRequest>,
) -> impl IntoResponse {
    let Ok(Some(user)) =
        find_active_user_by_token(&state.pool, &state.config.app_secret, req.token.trim()).await
    else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "detail": "invalid_token" })),
        );
    };

    match disconnect(&state.pool, &user, req.session_id.trim()).await {
        Ok(true) => (StatusCode::OK, Json(json!({ "ok": true }))),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "session_not_found" })),
        ),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": err.to_string() })),
        ),
    }
}

async fn get_client_script(State(state): State<AppState>) -> impl IntoResponse {
    let candidates = [
        state.config.client_script_path.as_str(),
        "../client/nekotunnel",
        "/app/client/nekotunnel",
    ];
    for path in candidates {
        if let Ok(content) = tokio::fs::read_to_string(path).await {
            return (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
                content,
            )
                .into_response();
        }
    }
    (
        StatusCode::NOT_FOUND,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        "client/nekotunnel script not found".to_string(),
    )
        .into_response()
}
