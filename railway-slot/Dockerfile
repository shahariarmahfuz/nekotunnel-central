FROM alpine:latest

RUN apk add --no-cache sslh wget tar ca-certificates

ENV FRP_VERSION=0.57.0

RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then FRP_ARCH="arm64"; else FRP_ARCH="amd64"; fi && \
    wget -q "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_${FRP_ARCH}.tar.gz" && \
    tar xzf "frp_${FRP_VERSION}_linux_${FRP_ARCH}.tar.gz" && \
    mv "frp_${FRP_VERSION}_linux_${FRP_ARCH}" /frp && \
    rm "frp_${FRP_VERSION}_linux_${FRP_ARCH}.tar.gz"

COPY frps.toml /frp/frps.toml
COPY start.sh /start.sh

RUN chmod +x /start.sh

CMD ["/start.sh"]
