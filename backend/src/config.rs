use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub backend_addr: String,
    pub app_secret: String,
    pub encryption_key: String,
    pub admin_token: String,
    pub session_ttl_seconds: i64,
    pub cleanup_interval_seconds: u64,
    pub railway_cli_path: String,
    pub slot_work_root: String,
    pub service_name: String,
    pub tcp_internal_port: u16,
    pub frp_version: String,
    pub client_script_path: String,
    pub cookie_secure: Option<bool>,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let database_url = env::var("DATABASE_URL")
            .map_err(|_| "DATABASE_URL is required".to_string())?;
        let app_secret = env::var("APP_SECRET")
            .map_err(|_| "APP_SECRET is required".to_string())?;
        let encryption_key = env::var("ENCRYPTION_KEY")
            .map_err(|_| "ENCRYPTION_KEY is required".to_string())?;
        let admin_token = env::var("ADMIN_TOKEN")
            .map_err(|_| "ADMIN_TOKEN is required".to_string())?;

        let backend_addr = env::var("BACKEND_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:8080".to_string());
        let session_ttl_seconds = env::var("SESSION_TTL_SECONDS")
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .filter(|&v| v > 0)
            .unwrap_or(90);
        let cleanup_interval_seconds = env::var("CLEANUP_INTERVAL_SECONDS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .filter(|&v| v > 0)
            .unwrap_or(30);
        let railway_cli_path = env::var("RAILWAY_CLI_PATH")
            .unwrap_or_else(|_| "railway".to_string());
        let slot_work_root = env::var("SLOT_WORK_ROOT")
            .unwrap_or_else(|_| "/tmp/nekotunnel-railway-slots".to_string());
        let service_name = env::var("SERVICE_NAME")
            .unwrap_or_else(|_| "final".to_string());
        let tcp_internal_port = env::var("TCP_INTERNAL_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(8080);
        let frp_version = env::var("FRP_VERSION")
            .unwrap_or_else(|_| "0.57.0".to_string());
        let client_script_path = env::var("CLIENT_SCRIPT_PATH")
            .unwrap_or_else(|_| "client/nekotunnel".to_string());
        let cookie_secure = env::var("COOKIE_SECURE")
            .ok()
            .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"));

        Ok(Self {
            database_url,
            backend_addr,
            app_secret,
            encryption_key,
            admin_token,
            session_ttl_seconds,
            cleanup_interval_seconds,
            railway_cli_path,
            slot_work_root,
            service_name,
            tcp_internal_port,
            frp_version,
            client_script_path,
            cookie_secure,
        })
    }
}
