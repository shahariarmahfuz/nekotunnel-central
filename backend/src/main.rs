mod config;
mod db;
mod models;
mod routes;
mod security;
mod services;
mod state;

use std::time::Duration;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    config::Config,
    db::{create_pool, init_schema},
    services::sessions::cleanup_stale_sessions,
    state::AppState,
};

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "nekotunnel_backend=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env().unwrap_or_else(|err| {
        tracing::error!("Configuration error: {err}");
        std::process::exit(1);
    });

    let pool = create_pool(&config.database_url)
        .await
        .unwrap_or_else(|err| {
            tracing::error!("Database connection error: {err}");
            std::process::exit(1);
        });

    init_schema(&pool).await.unwrap_or_else(|err| {
        tracing::error!("Schema initialization error: {err}");
        std::process::exit(1);
    });

    tracing::info!("PostgreSQL schema initialized");

    let cleanup_pool = pool.clone();
    let cleanup_interval = config.cleanup_interval_seconds;
    let session_ttl = config.session_ttl_seconds;
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(cleanup_interval));
        loop {
            ticker.tick().await;
            match cleanup_stale_sessions(&cleanup_pool, session_ttl).await {
                Ok(n) if n > 0 => tracing::info!("Cleaned up {n} stale session(s)"),
                Ok(_) => {}
                Err(err) => tracing::warn!("Stale session cleanup error: {err}"),
            }
        }
    });

    let bind_addr = config.backend_addr.clone();
    let app = routes::build_router(AppState { pool, config }).layer(TraceLayer::new_for_http());

    let listener = TcpListener::bind(&bind_addr).await.unwrap_or_else(|err| {
        tracing::error!("Failed to bind {bind_addr}: {err}");
        std::process::exit(1);
    });

    tracing::info!("NekoTunnel Rust backend listening internally on http://{bind_addr}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap_or_else(|err| {
            tracing::error!("Server error: {err}");
            std::process::exit(1);
        });
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut sig) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            sig.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("Shutdown signal received");
}
