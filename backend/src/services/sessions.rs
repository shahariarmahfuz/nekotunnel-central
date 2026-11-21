use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::{
    models::{ActiveUserRow, ConnectResponse, SlotSecretRow},
    security::{decrypt_secret, token_hash, token_prefix},
    services::audit::record_audit,
};

#[derive(Debug)]
pub enum AllocateError {
    InvalidToken,
    MaxSessionsReached,
    NoFreeSlot,
    Internal(String),
}

pub async fn find_active_user_by_token(
    pool: &PgPool,
    app_secret: &str,
    token: &str,
) -> Result<Option<ActiveUserRow>, sqlx::Error> {
    let prefix = token_prefix(token);
    let thash = token_hash(app_secret, token);
    sqlx::query_as::<_, ActiveUserRow>(
        r#"
        SELECT id, name, max_sessions
        FROM users
        WHERE token_prefix = $1 AND token_hash = $2 AND status = 'active'
        LIMIT 1
        "#,
    )
    .bind(prefix)
    .bind(thash)
    .fetch_optional(pool)
    .await
}

pub async fn allocate_slot(
    pool: &PgPool,
    app_secret: &str,
    encryption_key: &str,
    token: &str,
    local_port: Option<i32>,
) -> Result<ConnectResponse, AllocateError> {
    let user = find_active_user_by_token(pool, app_secret, token)
        .await
        .map_err(|e| AllocateError::Internal(e.to_string()))?
        .ok_or(AllocateError::InvalidToken)?;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| AllocateError::Internal(e.to_string()))?;

    // Lock the user row so concurrent requests from the same token enforce max_sessions strictly.
    let locked_user = sqlx::query_as::<_, ActiveUserRow>(
        r#"
        SELECT id, name, max_sessions
        FROM users
        WHERE id = $1 AND status = 'active'
        FOR UPDATE
        "#,
    )
    .bind(&user.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| AllocateError::Internal(e.to_string()))?
    .ok_or(AllocateError::InvalidToken)?;

    let active_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND status = 'active'",
    )
    .bind(&locked_user.id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| AllocateError::Internal(e.to_string()))?;

    if active_count >= i64::from(locked_user.max_sessions) {
        return Err(AllocateError::MaxSessionsReached);
    }

    let slot = sqlx::query_as::<_, SlotSecretRow>(
        r#"
        SELECT id, railway_account_id, project_name, project_id, service_name,
               server_addr, server_port, frp_token_cipher, remote_port
        FROM slots
        WHERE status = 'free'
          AND current_session_id IS NULL
          AND server_addr IS NOT NULL
          AND server_port IS NOT NULL
        ORDER BY COALESCE(last_used_at, created_at) ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
        "#,
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| AllocateError::Internal(e.to_string()))?
    .ok_or(AllocateError::NoFreeSlot)?;

    let server_addr = slot
        .server_addr
        .clone()
        .ok_or(AllocateError::NoFreeSlot)?;
    let server_port = slot.server_port.ok_or(AllocateError::NoFreeSlot)?;
    let frp_token = decrypt_secret(encryption_key, &slot.frp_token_cipher)
        .map_err(AllocateError::Internal)?;

    let session_id = Uuid::new_v4().to_string();
    let short_slot: String = slot.id.chars().take(8).collect();
    let proxy_name = format!("nekotunnel-{short_slot}");

    sqlx::query(
        r#"
        INSERT INTO sessions (id, user_id, slot_id, status, client_local_port, proxy_name, started_at, last_heartbeat_at)
        VALUES ($1, $2, $3, 'active', $4, $5, NOW(), NOW())
        "#,
    )
    .bind(&session_id)
    .bind(&locked_user.id)
    .bind(&slot.id)
    .bind(local_port)
    .bind(&proxy_name)
    .execute(&mut *tx)
    .await
    .map_err(|e| AllocateError::Internal(e.to_string()))?;

    sqlx::query(
        r#"
        UPDATE slots
        SET status = 'busy',
            current_session_id = $1,
            last_used_at = NOW(),
            updated_at = NOW()
        WHERE id = $2
        "#,
    )
    .bind(&session_id)
    .bind(&slot.id)
    .execute(&mut *tx)
    .await
    .map_err(|e| AllocateError::Internal(e.to_string()))?;

    let details = format!("session={session_id} slot={}", slot.project_name);
    record_audit(&mut *tx, &locked_user.name, "session_started", Some(&details))
        .await
        .map_err(|e| AllocateError::Internal(e.to_string()))?;

    tx.commit()
        .await
        .map_err(|e| AllocateError::Internal(e.to_string()))?;

    Ok(ConnectResponse {
        session_id,
        server_addr,
        server_port,
        frp_token,
        remote_port: slot.remote_port,
        proxy_name,
    })
}

pub async fn heartbeat(
    pool: &PgPool,
    user_id: &str,
    session_id: &str,
) -> Result<bool, sqlx::Error> {
    let res = sqlx::query(
        r#"
        UPDATE sessions
        SET last_heartbeat_at = NOW()
        WHERE id = $1 AND user_id = $2 AND status = 'active'
        "#,
    )
    .bind(session_id)
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(res.rows_affected() > 0)
}

pub async fn disconnect(
    pool: &PgPool,
    user: &ActiveUserRow,
    session_id: &str,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let row = sqlx::query(
        r#"
        UPDATE sessions
        SET status = 'closed',
            ended_at = NOW()
        WHERE id = $1 AND user_id = $2 AND status IN ('active', 'expired')
        RETURNING slot_id
        "#,
    )
    .bind(session_id)
    .bind(&user.id)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(row) = row else {
        return Ok(false);
    };
    let slot_id: String = row.get("slot_id");

    sqlx::query(
        r#"
        UPDATE slots
        SET current_session_id = NULL,
            status = CASE
                WHEN server_addr IS NOT NULL AND server_port IS NOT NULL THEN 'free'
                ELSE 'tcp_pending'
            END,
            updated_at = NOW()
        WHERE id = $1 AND current_session_id = $2
        "#,
    )
    .bind(&slot_id)
    .bind(session_id)
    .execute(&mut *tx)
    .await?;

    let details = format!("session={session_id}");
    record_audit(&mut *tx, &user.name, "session_closed", Some(&details)).await?;

    tx.commit().await?;
    Ok(true)
}

pub async fn terminate_session_admin(
    pool: &PgPool,
    session_id: &str,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let row = sqlx::query(
        r#"
        UPDATE sessions
        SET status = 'closed',
            ended_at = NOW()
        WHERE id = $1 AND status = 'active'
        RETURNING slot_id
        "#,
    )
    .bind(session_id)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(row) = row else {
        return Ok(false);
    };
    let slot_id: String = row.get("slot_id");

    sqlx::query(
        r#"
        UPDATE slots
        SET current_session_id = NULL,
            status = CASE
                WHEN server_addr IS NOT NULL AND server_port IS NOT NULL THEN 'free'
                ELSE 'tcp_pending'
            END,
            updated_at = NOW()
        WHERE id = $1 AND current_session_id = $2
        "#,
    )
    .bind(&slot_id)
    .bind(session_id)
    .execute(&mut *tx)
    .await?;

    let details = format!("session={session_id}");
    record_audit(&mut *tx, "admin", "session_terminated", Some(&details)).await?;

    tx.commit().await?;
    Ok(true)
}

pub async fn cleanup_stale_sessions(
    pool: &PgPool,
    session_ttl_seconds: i64,
) -> Result<u64, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let expired_rows = sqlx::query(
        r#"
        UPDATE sessions
        SET status = 'expired',
            ended_at = NOW()
        WHERE status = 'active'
          AND last_heartbeat_at < NOW() - make_interval(secs => $1::double precision)
        RETURNING id, slot_id
        "#,
    )
    .bind(session_ttl_seconds as f64)
    .fetch_all(&mut *tx)
    .await?;

    let count = expired_rows.len() as u64;
    for row in expired_rows {
        let sess_id: String = row.get("id");
        let slot_id: String = row.get("slot_id");
        sqlx::query(
            r#"
            UPDATE slots
            SET current_session_id = NULL,
                status = CASE
                    WHEN server_addr IS NOT NULL AND server_port IS NOT NULL THEN 'free'
                    ELSE 'tcp_pending'
                END,
                updated_at = NOW()
            WHERE id = $1 AND current_session_id = $2
            "#,
        )
        .bind(&slot_id)
        .bind(&sess_id)
        .execute(&mut *tx)
        .await?;
    }

    if count > 0 {
        let details = format!("count={count}");
        record_audit(&mut *tx, "system", "stale_sessions_cleaned", Some(&details)).await?;
    }

    // Reconcile any slot whose status drifted out of sync with active sessions
    sqlx::query(
        r#"
        UPDATE slots
        SET status = 'busy',
            current_session_id = COALESCE(
                current_session_id,
                (SELECT s.id FROM sessions s WHERE s.slot_id = slots.id AND s.status = 'active' ORDER BY s.started_at DESC LIMIT 1)
            ),
            updated_at = NOW()
        WHERE status <> 'busy'
          AND EXISTS (SELECT 1 FROM sessions s WHERE s.slot_id = slots.id AND s.status = 'active')
        "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE slots
        SET current_session_id = NULL,
            status = CASE
                WHEN server_addr IS NOT NULL AND server_port IS NOT NULL THEN 'free'
                ELSE 'tcp_pending'
            END,
            updated_at = NOW()
        WHERE status = 'busy'
          AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.slot_id = slots.id AND s.status = 'active')
        "#,
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(count)
}
