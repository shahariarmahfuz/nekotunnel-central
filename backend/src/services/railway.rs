use chrono::Utc;
use rand::RngCore;
use serde_json::Value;
use sqlx::PgPool;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::RwLock;
use tokio::time::timeout;
use uuid::Uuid;

use crate::{
    config::Config,
    models::{RailwayAccountSecret, SlotSecretRow},
    security::{decrypt_secret, encrypt_secret},
    services::audit::record_audit,
    state::RailwayLoginJob,
};

#[derive(Clone)]
pub enum RailwayAuth {
    CliHome(PathBuf),
    LegacyApiToken(String),
}

fn tail_chars(input: &str, max_chars: usize) -> String {
    let total = input.chars().count();
    if total <= max_chars {
        return input.to_string();
    }
    input.chars().skip(total - max_chars).collect()
}

fn sanitize_slug(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        let lower = ch.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            out.push(lower);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "acct".to_string()
    } else {
        trimmed
    }
}

pub fn random_frp_token() -> String {
    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

pub async fn check_railway_cli_available(cli_path: &str) -> bool {
    let Ok(res) = timeout(
        Duration::from_secs(5),
        Command::new(cli_path).arg("--version").output(),
    )
    .await
    else {
        return false;
    };
    matches!(res, Ok(out) if out.status.success())
}

fn write_cli_config(home_dir: &Path, config_json: &str) -> Result<(), String> {
    let railway_dir = home_dir.join(".railway");
    std::fs::create_dir_all(&railway_dir)
        .map_err(|e| format!("failed to create .railway dir: {e}"))?;
    let config_path = railway_dir.join("config.json");
    std::fs::write(&config_path, config_json)
        .map_err(|e| format!("failed to write .railway/config.json: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&config_path, std::fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

pub fn prepare_account_auth(
    config: &Config,
    account: &RailwayAccountSecret,
) -> Result<RailwayAuth, String> {
    let secret = decrypt_secret(&config.encryption_key, &account.api_token_cipher)?;
    let trimmed = secret.trim();
    if trimmed.starts_with('{') {
        let home_dir = PathBuf::from(&config.slot_work_root)
            .join("_homes")
            .join(&account.id);
        write_cli_config(&home_dir, trimmed)?;
        Ok(RailwayAuth::CliHome(home_dir))
    } else {
        Ok(RailwayAuth::LegacyApiToken(trimmed.to_string()))
    }
}

async fn run_railway_cmd(
    cli_path: &str,
    args: &[&str],
    auth: &RailwayAuth,
    cwd: Option<&Path>,
    timeout_secs: u64,
) -> Result<String, String> {
    let mut cmd = Command::new(cli_path);
    cmd.args(args);
    cmd.stdin(Stdio::null());
    cmd.env_remove("RAILWAY_TOKEN");
    cmd.env_remove("RAILWAY_API_TOKEN");

    match auth {
        RailwayAuth::CliHome(home_dir) => {
            cmd.env("HOME", home_dir);
        }
        RailwayAuth::LegacyApiToken(token) => {
            cmd.env("RAILWAY_API_TOKEN", token);
        }
    }

    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    let output = timeout(Duration::from_secs(timeout_secs), cmd.output())
        .await
        .map_err(|_| format!("railway {:?} timed out after {timeout_secs}s", args))?
        .map_err(|e| format!("failed to spawn railway CLI ({cli_path}): {e}"))?;

    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stderr.is_empty() {
        if !combined.is_empty() {
            combined.push('\n');
        }
        combined.push_str(&stderr);
    }

    if !output.status.success() {
        return Err(tail_chars(&combined, 3000));
    }

    Ok(combined)
}

fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for ch in chars.by_ref() {
                    if ('@'..='~').contains(&ch) {
                        break;
                    }
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

fn parse_activation_line(line: &str) -> (Option<String>, Option<String>) {
    let clean = strip_ansi(line);
    let mut url: Option<String> = None;
    let mut code: Option<String> = None;

    for word in clean.split_whitespace() {
        let trimmed = word.trim_matches(|c: char| matches!(c, '"' | '\'' | ',' | ')'));
        if trimmed.starts_with("https://railway.com/activate")
            || trimmed.starts_with("https://railway.app/activate")
        {
            url = Some(trimmed.to_string());
            if let Some(pos) = trimmed.find("user_code=") {
                let c = &trimmed[pos + "user_code=".len()..];
                let code_part = c.split('&').next().unwrap_or("");
                if !code_part.is_empty() {
                    code = Some(code_part.to_string());
                }
            }
        } else if trimmed.len() == 9
            && trimmed.as_bytes().get(4) == Some(&b'-')
            && trimmed
                .chars()
                .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
        {
            code = Some(trimmed.to_string());
        }
    }

    (url, code)
}

fn parse_whoami_user(output: &str) -> Option<String> {
    let clean = strip_ansi(output).trim().to_string();
    if let Ok(val) = serde_json::from_str::<Value>(&clean) {
        if let Some(email) = val.get("email").and_then(|v| v.as_str()) {
            return Some(email.to_string());
        }
        if let Some(name) = val.get("name").and_then(|v| v.as_str()) {
            return Some(name.to_string());
        }
        if let Some(user) = val.get("user") {
            if let Some(email) = user.get("email").and_then(|v| v.as_str()) {
                return Some(email.to_string());
            }
            if let Some(name) = user.get("name").and_then(|v| v.as_str()) {
                return Some(name.to_string());
            }
        }
    }
    let first_line = clean.lines().next()?.trim();
    if first_line.is_empty() {
        None
    } else {
        Some(tail_chars(first_line, 180))
    }
}

pub async fn fetch_whoami(cli_path: &str, auth: &RailwayAuth) -> Result<String, String> {
    match run_railway_cmd(cli_path, &["whoami", "--json"], auth, None, 20).await {
        Ok(out) => Ok(parse_whoami_user(&out).unwrap_or_else(|| "railway-user".to_string())),
        Err(_) => {
            let out = run_railway_cmd(cli_path, &["whoami"], auth, None, 20).await?;
            Ok(parse_whoami_user(&out).unwrap_or_else(|| "railway-user".to_string()))
        }
    }
}

pub fn spawn_railway_cli_login(
    pool: PgPool,
    config: Config,
    login_jobs: Arc<RwLock<HashMap<String, RailwayLoginJob>>>,
    label: String,
    workspace: String,
) -> String {
    let job_id = Uuid::new_v4().to_string();
    let initial = RailwayLoginJob {
        job_id: job_id.clone(),
        label: label.clone(),
        workspace: workspace.clone(),
        status: "starting".to_string(),
        activation_url: None,
        user_code: None,
        railway_user: None,
        account_id: None,
        error: None,
    };

    let jid = job_id.clone();
    tokio::spawn(async move {
        {
            let mut map = login_jobs.write().await;
            map.insert(jid.clone(), initial);
        }

        let login_home = PathBuf::from(&config.slot_work_root)
            .join("_login_homes")
            .join(&jid);
        if let Err(e) = std::fs::create_dir_all(&login_home) {
            let mut map = login_jobs.write().await;
            if let Some(job) = map.get_mut(&jid) {
                job.status = "failed".to_string();
                job.error = Some(format!("failed to create login dir: {e}"));
            }
            return;
        }

        let mut cmd = Command::new(&config.railway_cli_path);
        cmd.args(["login", "--browserless"])
            .env("HOME", &login_home)
            .env_remove("RAILWAY_TOKEN")
            .env_remove("RAILWAY_API_TOKEN")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let mut map = login_jobs.write().await;
                if let Some(job) = map.get_mut(&jid) {
                    job.status = "failed".to_string();
                    job.error = Some(format!("failed to spawn railway CLI: {e}"));
                }
                return;
            }
        };

        let jobs_stdout = login_jobs.clone();
        let jid_out = jid.clone();
        let stdout_task = child.stdout.take().map(|out| {
            tokio::spawn(async move {
                let mut lines = BufReader::new(out).lines();
                let mut collected = String::new();
                while let Ok(Some(line)) = lines.next_line().await {
                    let clean = strip_ansi(&line);
                    collected.push_str(&clean);
                    collected.push('\n');
                    let (url, code) = parse_activation_line(&clean);
                    if url.is_some() || code.is_some() {
                        let mut map = jobs_stdout.write().await;
                        if let Some(job) = map.get_mut(&jid_out) {
                            if let Some(u) = url {
                                job.activation_url = Some(u);
                            }
                            if let Some(c) = code {
                                job.user_code = Some(c);
                            }
                            if job.status == "starting" {
                                job.status = "awaiting_user".to_string();
                            }
                        }
                    }
                }
                collected
            })
        });

        let jobs_stderr = login_jobs.clone();
        let jid_err = jid.clone();
        let stderr_task = child.stderr.take().map(|err| {
            tokio::spawn(async move {
                let mut lines = BufReader::new(err).lines();
                let mut collected = String::new();
                while let Ok(Some(line)) = lines.next_line().await {
                    let clean = strip_ansi(&line);
                    collected.push_str(&clean);
                    collected.push('\n');
                    let (url, code) = parse_activation_line(&clean);
                    if url.is_some() || code.is_some() {
                        let mut map = jobs_stderr.write().await;
                        if let Some(job) = map.get_mut(&jid_err) {
                            if let Some(u) = url {
                                job.activation_url = Some(u);
                            }
                            if let Some(c) = code {
                                job.user_code = Some(c);
                            }
                            if job.status == "starting" {
                                job.status = "awaiting_user".to_string();
                            }
                        }
                    }
                }
                collected
            })
        });

        let wait_res = timeout(Duration::from_secs(300), child.wait()).await;
        let out_text = match stdout_task {
            Some(t) => t.await.unwrap_or_default(),
            None => String::new(),
        };
        let err_text = match stderr_task {
            Some(t) => t.await.unwrap_or_default(),
            None => String::new(),
        };

        let exit_ok = match wait_res {
            Ok(Ok(status)) => status.success(),
            Ok(Err(e)) => {
                let mut map = login_jobs.write().await;
                if let Some(job) = map.get_mut(&jid) {
                    job.status = "failed".to_string();
                    job.error = Some(format!("railway login wait error: {e}"));
                }
                let _ = std::fs::remove_dir_all(&login_home);
                return;
            }
            Err(_) => {
                let _ = child.kill().await;
                let mut map = login_jobs.write().await;
                if let Some(job) = map.get_mut(&jid) {
                    job.status = "failed".to_string();
                    job.error = Some("Railway CLI login timed out (5 minutes).".to_string());
                }
                let _ = std::fs::remove_dir_all(&login_home);
                return;
            }
        };

        if !exit_ok {
            let combined = format!("{out_text}\n{err_text}");
            let mut map = login_jobs.write().await;
            if let Some(job) = map.get_mut(&jid) {
                job.status = "failed".to_string();
                job.error = Some(tail_chars(combined.trim(), 1000));
            }
            let _ = std::fs::remove_dir_all(&login_home);
            return;
        }

        let cfg_path = login_home.join(".railway").join("config.json");
        let cfg_json = match std::fs::read_to_string(&cfg_path) {
            Ok(c) if !c.trim().is_empty() => c,
            Ok(_) | Err(_) => {
                let mut map = login_jobs.write().await;
                if let Some(job) = map.get_mut(&jid) {
                    job.status = "failed".to_string();
                    job.error = Some("Login succeeded but ~/.railway/config.json was not found.".to_string());
                }
                let _ = std::fs::remove_dir_all(&login_home);
                return;
            }
        };

        let railway_user = fetch_whoami(&config.railway_cli_path, &RailwayAuth::CliHome(login_home.clone()))
            .await
            .ok();

        let cipher = match encrypt_secret(&config.encryption_key, &cfg_json) {
            Ok(c) => c,
            Err(e) => {
                let mut map = login_jobs.write().await;
                if let Some(job) = map.get_mut(&jid) {
                    job.status = "failed".to_string();
                    job.error = Some(e);
                }
                let _ = std::fs::remove_dir_all(&login_home);
                return;
            }
        };

        let account_id = Uuid::new_v4().to_string();
        let insert_res = sqlx::query(
            r#"
            INSERT INTO railway_accounts
                (id, label, workspace, api_token_cipher, auth_mode, railway_user, status, last_checked_at, created_at, updated_at)
            VALUES ($1, $2, $3, $4, 'cli_login', $5, 'active', NOW(), NOW(), NOW())
            "#,
        )
        .bind(&account_id)
        .bind(&label)
        .bind(&workspace)
        .bind(&cipher)
        .bind(&railway_user)
        .execute(&pool)
        .await;

        if let Err(e) = insert_res {
            let mut map = login_jobs.write().await;
            if let Some(job) = map.get_mut(&jid) {
                job.status = "failed".to_string();
                job.error = Some(format!("DB insert failed: {e}"));
            }
            let _ = std::fs::remove_dir_all(&login_home);
            return;
        }

        let target_home = PathBuf::from(&config.slot_work_root)
            .join("_homes")
            .join(&account_id);
        let _ = write_cli_config(&target_home, &cfg_json);
        let _ = std::fs::remove_dir_all(&login_home);

        let _ = record_audit(
            &pool,
            "admin",
            "railway_cli_account_connected",
            Some(&format!(
                "label={label} user={}",
                railway_user.as_deref().unwrap_or("unknown")
            )),
        )
        .await;

        let mut map = login_jobs.write().await;
        if let Some(job) = map.get_mut(&jid) {
            job.status = "completed".to_string();
            job.account_id = Some(account_id);
            job.railway_user = railway_user;
        }
    });

    job_id
}

pub fn write_slot_files(slot_dir: &Path, frp_token: &str, frp_version: &str) -> Result<(), String> {
    std::fs::create_dir_all(slot_dir)
        .map_err(|e| format!("failed to create slot dir: {e}"))?;

    let dockerfile = format!(
        r#"FROM alpine:latest

RUN apk add --no-cache sslh wget tar ca-certificates

ENV FRP_VERSION={frp_version}

RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then FRP_ARCH="arm64"; else FRP_ARCH="amd64"; fi && \
    wget -q "https://github.com/fatedier/frp/releases/download/v${{FRP_VERSION}}/frp_${{FRP_VERSION}}_linux_${{FRP_ARCH}}.tar.gz" && \
    tar xzf "frp_${{FRP_VERSION}}_linux_${{FRP_ARCH}}.tar.gz" && \
    mv "frp_${{FRP_VERSION}}_linux_${{FRP_ARCH}}" /frp && \
    rm "frp_${{FRP_VERSION}}_linux_${{FRP_ARCH}}.tar.gz"

COPY frps.toml /frp/frps.toml
COPY start.sh /start.sh

RUN chmod +x /start.sh

CMD ["/start.sh"]
"#
    );

    let frps_toml = format!(
        r#"bindAddr = "127.0.0.1"
bindPort = 7000

proxyBindAddr = "127.0.0.1"

auth.method = "token"
auth.token = "{frp_token}"

[transport]
heartbeatTimeout = 90
tcpMux = true
tcpMuxKeepaliveInterval = 30
tcpKeepalive = 7200
tls.force = true

[[allowPorts]]
single = 6000
"#
    );

    let start_sh = r#"#!/bin/sh
set -eu

cleanup() {
    kill -TERM "$SSLH_PID" "$FRPS_PID" 2>/dev/null || true
    wait "$SSLH_PID" 2>/dev/null || true
    wait "$FRPS_PID" 2>/dev/null || true
}

term() {
    cleanup
    exit 0
}

trap term INT TERM
trap cleanup EXIT

/frp/frps -c /frp/frps.toml &
FRPS_PID=$!

if sslh -h 2>&1 | grep -q -- '--tls'; then
    TLS_OPT="--tls"
else
    TLS_OPT="--ssl"
fi

sslh -f -u root \
  -p "0.0.0.0:${PORT:-8080}" \
  --ssh "127.0.0.1:6000" \
  "$TLS_OPT" "127.0.0.1:7000" \
  --on-timeout ssh \
  --timeout 2 &
SSLH_PID=$!

while kill -0 "$FRPS_PID" 2>/dev/null && kill -0 "$SSLH_PID" 2>/dev/null; do
    sleep 2
done

exit 1
"#;

    std::fs::write(slot_dir.join("Dockerfile"), dockerfile)
        .map_err(|e| format!("failed to write Dockerfile: {e}"))?;
    std::fs::write(slot_dir.join("frps.toml"), frps_toml)
        .map_err(|e| format!("failed to write frps.toml: {e}"))?;
    std::fs::write(slot_dir.join("start.sh"), start_sh)
        .map_err(|e| format!("failed to write start.sh: {e}"))?;
    std::fs::write(slot_dir.join(".railwayignore"), ".git\nnode_modules\n*.log\n")
        .map_err(|e| format!("failed to write .railwayignore: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(
            slot_dir.join("start.sh"),
            std::fs::Permissions::from_mode(0o755),
        )
        .map_err(|e| format!("failed to chmod start.sh: {e}"))?;
    }

    Ok(())
}

fn extract_project_id(output: &str) -> Option<String> {
    if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(output.trim()) {
        for key in ["projectId", "project_id", "id"] {
            if let Some(Value::String(val)) = map.get(key) {
                if !val.is_empty() {
                    return Some(val.clone());
                }
            }
        }
    }

    for line in output.lines() {
        if let Some(idx) = line.find("project") {
            let slice = &line[idx..];
            for token in slice.split(|c: char| !c.is_ascii_alphanumeric() && c != '-') {
                if token.len() >= 16 && token.contains('-') {
                    return Some(token.to_string());
                }
            }
        }
    }
    None
}

fn extract_tcp_proxy_from_json(output: &str) -> Option<(String, i32)> {
    let parsed: Value = serde_json::from_str(output.trim()).ok()?;
    let mut stack = vec![&parsed];
    while let Some(node) = stack.pop() {
        match node {
            Value::Object(map) => {
                let domain = map
                    .get("domain")
                    .or_else(|| map.get("proxyDomain"))
                    .or_else(|| map.get("host"))
                    .and_then(|v| v.as_str());
                let port = map
                    .get("proxyPort")
                    .or_else(|| map.get("port"))
                    .or_else(|| map.get("externalPort"))
                    .and_then(|v| v.as_i64())
                    .map(|p| p as i32);
                if let (Some(d), Some(p)) = (domain, port) {
                    if !d.is_empty() && (1..=65535).contains(&p) {
                        return Some((d.to_string(), p));
                    }
                }
                for v in map.values() {
                    stack.push(v);
                }
            }
            Value::Array(arr) => {
                for v in arr {
                    stack.push(v);
                }
            }
            _ => {}
        }
    }
    None
}

async fn ensure_and_collect_tcp_link(
    cli_path: &str,
    auth: &RailwayAuth,
    service_name: &str,
    project_id: Option<&str>,
    internal_port: u16,
    create_if_missing: bool,
) -> Result<(Option<String>, Option<i32>, Option<String>), String> {
    let port_str = internal_port.to_string();

    if create_if_missing {
        let mut create_args = vec![
            "tcp-proxy",
            "create",
            "--port",
            &port_str,
            "-s",
            service_name,
            "--json",
        ];
        if let Some(pid) = project_id {
            create_args.push("-p");
            create_args.push(pid);
        }
        if let Ok(out) = run_railway_cmd(cli_path, &create_args, auth, None, 60).await {
            if let Some((host, port)) = extract_tcp_proxy_from_json(&out) {
                return Ok((Some(host), Some(port), None));
            }
        }
    }

    let mut list_args = vec!["tcp-proxy", "list", "-s", service_name, "--json"];
    if let Some(pid) = project_id {
        list_args.push("-p");
        list_args.push(pid);
    }
    if let Ok(out) = run_railway_cmd(cli_path, &list_args, auth, None, 60).await {
        if let Some((host, port)) = extract_tcp_proxy_from_json(&out) {
            return Ok((Some(host), Some(port), None));
        }
    }

    let mut args = vec!["run", "-s", service_name];
    if let Some(pid) = project_id {
        args.push("-p");
        args.push(pid);
    }
    args.push("sh");
    args.push("-c");
    args.push(r#"printf "%s:%s" "$RAILWAY_TCP_PROXY_DOMAIN" "$RAILWAY_TCP_PROXY_PORT""#);

    let out = run_railway_cmd(cli_path, &args, auth, None, 120).await?;
    let trimmed = out.trim();
    if let Some((host, p_str)) = trimmed.rsplit_once(':') {
        let valid_host = !host.is_empty()
            && host
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
        if valid_host {
            if let Ok(port) = p_str.parse::<i32>() {
                if (1..=65535).contains(&port) {
                    return Ok((Some(host.to_string()), Some(port), None));
                }
            }
        }
    }

    Ok((None, None, Some(tail_chars(trimmed, 500))))
}

pub async fn create_and_deploy_slot(
    pool: &PgPool,
    config: &Config,
    account: &RailwayAccountSecret,
) -> Result<String, String> {
    let auth = prepare_account_auth(config, account)?;
    let stamp = Utc::now().timestamp();
    let label_slug = sanitize_slug(&account.label);
    let mut project_name = format!("nekotunnel-{label_slug}-{stamp}");
    if project_name.len() > 120 {
        project_name.truncate(120);
    }

    let frp_token = random_frp_token();
    let frp_token_cipher = encrypt_secret(&config.encryption_key, &frp_token)?;
    let slot_dir = PathBuf::from(&config.slot_work_root).join(&project_name);
    write_slot_files(&slot_dir, &frp_token, &config.frp_version)?;

    let slot_id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO slots (id, railway_account_id, project_name, service_name, frp_token_cipher, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'deploying', NOW(), NOW())
        "#,
    )
    .bind(&slot_id)
    .bind(&account.id)
    .bind(&project_name)
    .bind(&config.service_name)
    .bind(&frp_token_cipher)
    .execute(pool)
    .await
    .map_err(|e| format!("failed to insert deploying slot: {e}"))?;

    let _ = record_audit(
        pool,
        "admin",
        "slot_create_started",
        Some(&format!("project={project_name}")),
    )
    .await;

    let deploy_result: Result<(), String> = async {
        let mut init_args = vec!["init", "-n", &project_name];
        let ws = account.workspace.trim();
        if !ws.is_empty() {
            init_args.push("-w");
            init_args.push(ws);
        }
        init_args.push("--json");

        let init_out = run_railway_cmd(
            &config.railway_cli_path,
            &init_args,
            &auth,
            Some(&slot_dir),
            300,
        )
        .await?;

        let project_id = extract_project_id(&init_out);
        if let Some(ref pid) = project_id {
            sqlx::query("UPDATE slots SET project_id = $1, updated_at = NOW() WHERE id = $2")
                .bind(pid)
                .bind(&slot_id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }

        if let Err(err) = run_railway_cmd(
            &config.railway_cli_path,
            &["add", "-s", &config.service_name],
            &auth,
            Some(&slot_dir),
            180,
        )
        .await
        {
            if !err.to_lowercase().contains("already") {
                return Err(err);
            }
        }

        run_railway_cmd(
            &config.railway_cli_path,
            &["up", "-s", &config.service_name, "--detach"],
            &auth,
            Some(&slot_dir),
            900,
        )
        .await?;

        tokio::time::sleep(Duration::from_secs(5)).await;

        match ensure_and_collect_tcp_link(
            &config.railway_cli_path,
            &auth,
            &config.service_name,
            project_id.as_deref(),
            config.tcp_internal_port,
            true,
        )
        .await
        {
            Ok((Some(addr), Some(port), _)) => {
                sqlx::query(
                    r#"
                    UPDATE slots
                    SET server_addr = $1,
                        server_port = $2,
                        status = 'free',
                        last_error = NULL,
                        updated_at = NOW()
                    WHERE id = $3
                    "#,
                )
                .bind(&addr)
                .bind(port)
                .bind(&slot_id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            }
            Ok((_, _, err)) => {
                let msg = err.unwrap_or_else(|| {
                    format!(
                        "TCP proxy missing. Enable internal port {} in Railway.",
                        config.tcp_internal_port
                    )
                });
                sqlx::query(
                    "UPDATE slots SET status = 'tcp_pending', last_error = $1, updated_at = NOW() WHERE id = $2",
                )
                .bind(&msg)
                .bind(&slot_id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            }
            Err(exc) => {
                let msg = format!("Deployed, but TCP link not found yet: {exc}");
                sqlx::query(
                    "UPDATE slots SET status = 'tcp_pending', last_error = $1, updated_at = NOW() WHERE id = $2",
                )
                .bind(&msg)
                .bind(&slot_id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            }
        }

        Ok(())
    }
    .await;

    if let Err(err) = deploy_result {
        let short_err = tail_chars(&err, 3000);
        let _ = sqlx::query(
            "UPDATE slots SET status = 'failed', last_error = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(&short_err)
        .bind(&slot_id)
        .execute(pool)
        .await;
        let _ = record_audit(
            pool,
            "admin",
            "slot_create_failed",
            Some(&format!("project={project_name} error={short_err}")),
        )
        .await;
    } else {
        let _ = record_audit(
            pool,
            "admin",
            "slot_create_finished",
            Some(&format!("project={project_name}")),
        )
        .await;
    }

    Ok(slot_id)
}

pub async fn refresh_slot_tcp(
    pool: &PgPool,
    config: &Config,
    slot: &SlotSecretRow,
    account: Option<&RailwayAccountSecret>,
) -> Result<(), String> {
    let Some(acct) = account else {
        let msg = "No Railway account attached.";
        let _ = sqlx::query("UPDATE slots SET last_error = $1, updated_at = NOW() WHERE id = $2")
            .bind(msg)
            .bind(&slot.id)
            .execute(pool)
            .await;
        return Err(msg.to_string());
    };

    let auth = prepare_account_auth(config, acct)?;
    match ensure_and_collect_tcp_link(
        &config.railway_cli_path,
        &auth,
        &slot.service_name,
        slot.project_id.as_deref(),
        config.tcp_internal_port,
        true,
    )
    .await
    {
        Ok((Some(addr), Some(port), _)) => {
            sqlx::query(
                r#"
                UPDATE slots
                SET server_addr = $1,
                    server_port = $2,
                    status = CASE
                        WHEN status IN ('tcp_pending', 'offline', 'failed', 'deploying') THEN 'free'
                        ELSE status
                    END,
                    last_error = NULL,
                    updated_at = NOW()
                WHERE id = $3
                "#,
            )
            .bind(&addr)
            .bind(port)
            .bind(&slot.id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

            let _ = record_audit(
                pool,
                "admin",
                "slot_tcp_refreshed",
                Some(&format!("{} => {}:{}", slot.project_name, addr, port)),
            )
            .await;
            Ok(())
        }
        Ok((_, _, err)) => {
            let msg = err.unwrap_or_else(|| {
                format!(
                    "TCP proxy missing. Enable internal port {}.",
                    config.tcp_internal_port
                )
            });
            let _ = sqlx::query("UPDATE slots SET last_error = $1, updated_at = NOW() WHERE id = $2")
                .bind(&msg)
                .bind(&slot.id)
                .execute(pool)
                .await;
            let _ = record_audit(pool, "admin", "slot_tcp_missing", Some(&slot.project_name)).await;
            Err(msg)
        }
        Err(exc) => {
            let short_err = tail_chars(&exc, 3000);
            let _ = sqlx::query("UPDATE slots SET last_error = $1, updated_at = NOW() WHERE id = $2")
                .bind(&short_err)
                .bind(&slot.id)
                .execute(pool)
                .await;
            Err(short_err)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_and_project_id_helpers() {
        assert_eq!(sanitize_slug("My Pro Account!"), "my-pro-account");
        assert_eq!(sanitize_slug("___"), "acct");
        assert_eq!(
            extract_project_id(r#"{"projectId":"abc12345-6789-4def-9012-abcdef123456"}"#),
            Some("abc12345-6789-4def-9012-abcdef123456".to_string())
        );
        assert_eq!(
            extract_project_id("Created project/11112222-3333-4444-5555-666677778888 ok"),
            Some("11112222-3333-4444-5555-666677778888".to_string())
        );
    }

    #[test]
    fn activation_and_tcp_proxy_parsing() {
        let (url, code) =
            parse_activation_line("  https://railway.com/activate?user_code=CXDB-FQZH");
        assert_eq!(
            url.as_deref(),
            Some("https://railway.com/activate?user_code=CXDB-FQZH")
        );
        assert_eq!(code.as_deref(), Some("CXDB-FQZH"));

        let (_, code2) = parse_activation_line("  \x1b[36mABCD-1234\x1b[0m  ");
        assert_eq!(code2.as_deref(), Some("ABCD-1234"));

        let proxy = extract_tcp_proxy_from_json(
            r#"[{"id":"tp_1","domain":"monorail.proxy.rlwy.net","proxyPort":45123}]"#,
        );
        assert_eq!(
            proxy,
            Some(("monorail.proxy.rlwy.net".to_string(), 45123))
        );
    }

    #[test]
    fn write_slot_files_generates_expected_templates() {
        let dir = std::env::temp_dir().join(format!("nekotunnel-test-{}", Uuid::new_v4()));
        write_slot_files(&dir, "secret_frp_tok", "0.57.0").expect("write files");
        let df = std::fs::read_to_string(dir.join("Dockerfile")).expect("Dockerfile");
        let frps = std::fs::read_to_string(dir.join("frps.toml")).expect("frps.toml");
        let start = std::fs::read_to_string(dir.join("start.sh")).expect("start.sh");

        assert!(df.contains("FRP_VERSION=0.57.0"));
        assert!(frps.contains("auth.token = \"secret_frp_tok\""));
        assert!(frps.contains("tls.force = true"));
        assert!(start.contains("--ssh \"127.0.0.1:6000\""));
        assert!(start.contains("\"$TLS_OPT\" \"127.0.0.1:7000\""));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
