use chrono::Utc;
use rand::RngCore;
use serde_json::Value;
use sqlx::PgPool;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;
use uuid::Uuid;

use crate::{
    config::Config,
    models::{RailwayAccountSecret, SlotSecretRow},
    security::{decrypt_secret, encrypt_secret},
    services::audit::record_audit,
};

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

async fn run_railway_cmd(
    cli_path: &str,
    args: &[&str],
    token: &str,
    cwd: Option<&Path>,
    timeout_secs: u64,
) -> Result<String, String> {
    let mut cmd = Command::new(cli_path);
    cmd.args(args);
    cmd.env_remove("RAILWAY_TOKEN");
    cmd.env("RAILWAY_API_TOKEN", token);
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

    // Fallback scan for UUID after project/ or project=
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

async fn collect_tcp_link(
    cli_path: &str,
    api_token: &str,
    service_name: &str,
    project_id: Option<&str>,
) -> Result<(Option<String>, Option<i32>, Option<String>), String> {
    let mut args = vec!["run", "-s", service_name];
    if let Some(pid) = project_id {
        args.push("-p");
        args.push(pid);
    }
    args.push("sh");
    args.push("-c");
    args.push(r#"printf "%s:%s" "$RAILWAY_TCP_PROXY_DOMAIN" "$RAILWAY_TCP_PROXY_PORT""#);

    let out = run_railway_cmd(cli_path, &args, api_token, None, 120).await?;
    let trimmed = out.trim();
    if let Some((host, port_str)) = trimmed.rsplit_once(':') {
        let valid_host = !host.is_empty()
            && host
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
        if valid_host {
            if let Ok(port) = port_str.parse::<i32>() {
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
    let api_token = decrypt_secret(&config.encryption_key, &account.api_token_cipher)?;
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
        let init_out = run_railway_cmd(
            &config.railway_cli_path,
            &["init", "-n", &project_name, "-w", &account.workspace, "--json"],
            &api_token,
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
            &api_token,
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
            &api_token,
            Some(&slot_dir),
            900,
        )
        .await?;

        tokio::time::sleep(Duration::from_secs(10)).await;

        match collect_tcp_link(
            &config.railway_cli_path,
            &api_token,
            &config.service_name,
            project_id.as_deref(),
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

    let api_token = decrypt_secret(&config.encryption_key, &acct.api_token_cipher)?;
    match collect_tcp_link(
        &config.railway_cli_path,
        &api_token,
        &slot.service_name,
        slot.project_id.as_deref(),
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
