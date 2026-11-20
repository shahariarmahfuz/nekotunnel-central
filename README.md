# NekoTunnel Central

Rust (`axum` + `sqlx`) + Next.js control plane for managing self-hosted Railway FRP/SSLH reverse TCP tunnel slots.

## Architecture (Single Public Port for Render)

Render exposes only a single public HTTP port (`$PORT`). Inside the Docker container:

- **Public Gateway (`0.0.0.0:$PORT`)**: Next.js standalone App Router server (`frontend/`). Serves the admin dashboard and proxies `/api/*`, `/client/*`, and `/health` internally.
- **Internal Backend (`127.0.0.1:8080`)**: Rust Axum server (`backend/`). Bound strictly to `127.0.0.1` so it is never exposed directly to the public internet.
- **Database**: PostgreSQL (Neon or Render Postgres) with automatic advisory-locked table initialization on startup.
- **Railway Slots (`railway-slot/`)**: Each slot container runs `sslh` + `frps` on one Railway TCP Proxy port (`8080`), multiplexing TLS-wrapped `frpc` tunnel traffic (`127.0.0.1:7000`) and incoming SSH/TCP user traffic (`127.0.0.1:6000`).

## Environment Variables

Copy `.env.example` to `.env` for local development or configure these in Render:

```env
DATABASE_URL=postgresql://user:password@host/db?sslmode=require
APP_SECRET=long-random-secret
ENCRYPTION_KEY=long-random-encryption-key
ADMIN_TOKEN=long-random-admin-password
SESSION_TTL_SECONDS=90
CLEANUP_INTERVAL_SECONDS=30
```

Keep `ENCRYPTION_KEY` permanent — changing it prevents decrypting previously saved Railway CLI sessions and FRP slot tokens.

## Features

- **Railway CLI Browserless Login**: Connect Railway accounts directly via `railway login --browserless` from the dashboard (no manual Railway API token needed). Encrypted `.railway/config.json` sessions persist in PostgreSQL across Render restarts.
- **Auto TCP Proxy**: Slot deployment automatically runs `railway tcp-proxy create --port 8080` to provision the public endpoint.
- **Dark / Light Dual Mode**: Switchable UI theme persisted in `localStorage`.

## Local Development

1. Start the internal Rust backend (`127.0.0.1:8080`):
   ```bash
   cd backend
   cargo run
   ```
2. Start the Next.js frontend (`http://localhost:3000`):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Deploy to Render

1. Push this repository to GitHub.
2. Create a Web Service on Render using **Docker** (or Blueprint from `render.yaml`).
3. Set `DATABASE_URL` (Neon or Render Postgres), `APP_SECRET`, `ENCRYPTION_KEY`, and `ADMIN_TOKEN`.
4. Open your Render URL and sign in with `ADMIN_TOKEN`.

## VM Client Usage

Download and run on your target Linux VM:

```bash
curl -fsSL https://your-render-app.onrender.com/client/nekotunnel -o nekotunnel
chmod +x nekotunnel
./nekotunnel tcp 22 YOUR_USER_TOKEN https://your-render-app.onrender.com
```

Or install as a 24/7 `systemd` service:

```bash
sudo ./nekotunnel install 22 YOUR_USER_TOKEN https://your-render-app.onrender.com
```

## Manual Railway Slot Deployment (`railway-slot/`)

If you prefer creating a slot directly in Railway without Railway CLI automation:

1. Deploy the `railway-slot/` directory as a Railway service.
2. Set `FRP_TOKEN` in Railway service variables (or let the manual slot form generate one, then copy it into Railway).
3. Enable **TCP Proxy** in Railway Networking pointing to internal port `8080`.
4. Register the generated `<host>:<port>` and `FRP_TOKEN` under **Tunnel Slots → Add Manual Slot**.
