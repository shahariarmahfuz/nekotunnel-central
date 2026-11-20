# Stage 1: Build internal Rust Axum backend
FROM rust:1-bookworm AS rust-builder

WORKDIR /build/backend
COPY backend ./
RUN cargo build --release

# Stage 2: Build public Next.js standalone frontend
FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./
RUN mkdir -p public && npm run build

# Stage 3: Minimal runtime image (Frontend Public on $PORT + Backend Internal on 127.0.0.1:8080)
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && npm install -g @railway/cli --no-audit --no-fund \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=rust-builder /build/backend/target/release/nekotunnel-backend /app/nekotunnel-backend
COPY --from=frontend-builder /build/frontend/.next/standalone /app/frontend
COPY --from=frontend-builder /build/frontend/.next/static /app/frontend/.next/static
COPY --from=frontend-builder /build/frontend/public /app/frontend/public
COPY client /app/client
COPY start.sh /app/start.sh

RUN chmod +x /app/start.sh /app/client/nekotunnel /app/nekotunnel-backend

ENV NODE_ENV=production \
    BACKEND_ADDR=127.0.0.1:8080 \
    BACKEND_INTERNAL_URL=http://127.0.0.1:8080 \
    CLIENT_SCRIPT_PATH=/app/client/nekotunnel \
    FRONTEND_HOST=0.0.0.0 \
    PORT=3000

EXPOSE 3000

CMD ["/app/start.sh"]
