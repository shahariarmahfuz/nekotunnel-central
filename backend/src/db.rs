use sqlx::{
    postgres::{PgConnectOptions, PgPoolOptions},
    PgPool,
};
use std::str::FromStr;
use std::time::Duration;
use url::Url;

fn sanitize_database_url(raw: &str) -> Result<String, String> {
    let mut parsed = Url::parse(raw).map_err(|e| format!("Invalid DATABASE_URL: {e}"))?;
    let pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .filter(|(k, _)| !k.eq_ignore_ascii_case("channel_binding"))
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();

    if pairs.is_empty() {
        parsed.set_query(None);
    } else {
        let mut qp = parsed.query_pairs_mut();
        qp.clear();
        for (k, v) in pairs {
            qp.append_pair(&k, &v);
        }
    }
    Ok(parsed.to_string())
}

pub async fn create_pool(database_url: &str) -> Result<PgPool, String> {
    let cleaned = sanitize_database_url(database_url)?;
    let options = PgConnectOptions::from_str(&cleaned)
        .map_err(|e| format!("Failed to parse DATABASE_URL options: {e}"))?
        .statement_cache_capacity(0);

    PgPoolOptions::new()
        .max_connections(10)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(15))
        .idle_timeout(Duration::from_secs(180))
        .test_before_acquire(true)
        .connect_with(options)
        .await
        .map_err(|e| format!("Database connection failed: {e}"))
}

pub async fn init_schema(pool: &PgPool) -> Result<(), String> {
    let mut conn = pool
        .acquire()
        .await
        .map_err(|e| format!("Failed to acquire DB connection for init: {e}"))?;

    sqlx::query("SELECT pg_advisory_lock(98234123)")
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Advisory lock failed: {e}"))?;

    let statements = [
        r#"
        CREATE TABLE IF NOT EXISTS railway_accounts (
            id VARCHAR(36) PRIMARY KEY,
            label VARCHAR(120) NOT NULL,
            workspace VARCHAR(200) NOT NULL DEFAULT '',
            api_token_cipher TEXT NOT NULL,
            auth_mode VARCHAR(30) NOT NULL DEFAULT 'cli_login',
            railway_user VARCHAR(200) NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'active',
            last_checked_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        "ALTER TABLE railway_accounts ADD COLUMN IF NOT EXISTS auth_mode VARCHAR(30) NOT NULL DEFAULT 'cli_login'",
        "ALTER TABLE railway_accounts ADD COLUMN IF NOT EXISTS railway_user VARCHAR(200) NULL",
        "CREATE INDEX IF NOT EXISTS ix_railway_accounts_status ON railway_accounts (status)",
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            token_prefix VARCHAR(16) NOT NULL,
            token_hash VARCHAR(128) NOT NULL UNIQUE,
            status VARCHAR(30) NOT NULL DEFAULT 'active',
            max_sessions INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        "CREATE INDEX IF NOT EXISTS ix_users_token_prefix ON users (token_prefix)",
        "CREATE INDEX IF NOT EXISTS ix_users_status ON users (status)",
        r#"
        CREATE TABLE IF NOT EXISTS slots (
            id VARCHAR(36) PRIMARY KEY,
            railway_account_id VARCHAR(36) NULL REFERENCES railway_accounts(id) ON DELETE SET NULL,
            project_name VARCHAR(160) NOT NULL,
            project_id VARCHAR(120) NULL,
            service_name VARCHAR(120) NOT NULL DEFAULT 'final',
            server_addr VARCHAR(255) NULL,
            server_port INTEGER NULL,
            frp_token_cipher TEXT NOT NULL,
            remote_port INTEGER NOT NULL DEFAULT 6000,
            status VARCHAR(30) NOT NULL DEFAULT 'tcp_pending',
            current_session_id VARCHAR(36) NULL,
            last_error TEXT NULL,
            last_used_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        "CREATE INDEX IF NOT EXISTS ix_slots_project_name ON slots (project_name)",
        "CREATE INDEX IF NOT EXISTS ix_slots_project_id ON slots (project_id)",
        "CREATE INDEX IF NOT EXISTS ix_slots_status ON slots (status)",
        "CREATE INDEX IF NOT EXISTS ix_slots_current_session_id ON slots (current_session_id)",
        r#"
        CREATE TABLE IF NOT EXISTS sessions (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            slot_id VARCHAR(36) NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
            status VARCHAR(30) NOT NULL DEFAULT 'active',
            client_local_port INTEGER NULL,
            proxy_name VARCHAR(120) NOT NULL,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ended_at TIMESTAMPTZ NULL
        )
        "#,
        "CREATE INDEX IF NOT EXISTS ix_sessions_user_id ON sessions (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_sessions_slot_id ON sessions (slot_id)",
        "CREATE INDEX IF NOT EXISTS ix_sessions_status ON sessions (status)",
        "CREATE INDEX IF NOT EXISTS ix_sessions_last_heartbeat_at ON sessions (last_heartbeat_at)",
        r#"
        CREATE TABLE IF NOT EXISTS audit_logs (
            id VARCHAR(36) PRIMARY KEY,
            actor VARCHAR(120) NOT NULL DEFAULT 'system',
            action VARCHAR(120) NOT NULL,
            details TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        "CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs (action)",
        r#"
        CREATE TABLE IF NOT EXISTS app_settings (
            key VARCHAR(120) PRIMARY KEY,
            value TEXT NOT NULL,
            is_secret BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    ];

    let mut res = Ok(());
    for sql in statements {
        if let Err(e) = sqlx::query(sql).execute(&mut *conn).await {
            res = Err(format!("Schema migration failed: {e}"));
            break;
        }
    }

    let _ = sqlx::query("SELECT pg_advisory_unlock(98234123)")
        .execute(&mut *conn)
        .await;

    res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_channel_binding_keeps_sslmode() {
        let raw = "postgresql://user:pass@ep-test-pooler.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
        let cleaned = sanitize_database_url(raw).expect("sanitize");
        assert!(cleaned.contains("sslmode=require"));
        assert!(!cleaned.contains("channel_binding"));
    }
}
