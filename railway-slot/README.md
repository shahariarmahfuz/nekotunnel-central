# Railway Slot Worker (`sslh` + `frps`)

Each Railway slot service runs:

1. `frps` internally on `127.0.0.1:7000` (TLS enforced, multiplexed, forwarding remote port `6000`).
2. `sslh` publicly on `0.0.0.0:$PORT` (default `8080`), routing:
   - TLS connections (`frpc` with `tls.disableCustomTLSFirstByte = true`) -> `127.0.0.1:7000`
   - SSH / raw TCP connections (including 2s fallback timeout) -> `127.0.0.1:6000`

## Railway Settings

- Set environment variable `FRP_TOKEN=<secret>`
- Enable **TCP Proxy** targeting container internal port `8080`
