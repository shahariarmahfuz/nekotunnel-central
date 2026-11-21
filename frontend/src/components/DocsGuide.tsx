"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Cloud,
  HelpCircle,
  KeyRound,
  Layers,
  Server,
  Terminal,
} from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { Card, CardContent, CardHeader, Notice } from "@/components/ui/primitives";

function CodeBlock({ code, label = "Copy" }: { code: string; label?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <CopyButton text={code} label={label} />
      </div>
      <pre className="w-full max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-zinc-200 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-100 dark:border-zinc-800">
        {code}
      </pre>
    </div>
  );
}

export function DocsGuide({ mode }: { mode: "admin" | "public" }) {
  const [origin, setOrigin] = useState("https://nekotunnel-central.onrender.com");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const installCliCmd = `sudo curl -fsSL ${origin}/client/nekotunnel -o /usr/local/bin/nekotunnel && sudo chmod +x /usr/local/bin/nekotunnel`;
  const saveTokenCmd = `nekotunnel token YOUR_USER_TOKEN ${origin}`;
  const forwardSshCmd = `nekotunnel tcp 22`;
  const forwardAnyCmd = `nekotunnel tcp 3000`;
  const systemdInstallCmd = `sudo nekotunnel install 22 YOUR_USER_TOKEN ${origin}`;
  const systemdRemoveCmd = `sudo nekotunnel uninstall-service`;

  return (
    <div className="space-y-5">
      {/* Architecture & Quick Overview */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4 shrink-0 text-zinc-500" />
              How NekoTunnel Works
            </span>
          }
          description="Reverse TCP tunneling over a single Railway TCP Proxy port using sslh-select + frp"
        />
        <CardContent className="space-y-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                1. Control Plane (Render)
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                Assigns free Railway slots to authenticated <code className="text-zinc-700 dark:text-zinc-300">ntk_</code> tokens and tracks active heartbeats.
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                2. Relay Slot (Railway)
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                Runs <code className="text-zinc-700 dark:text-zinc-300">sslh-select</code> on port <code className="text-zinc-700 dark:text-zinc-300">8080</code> to route TLS tunnels to <code className="text-zinc-700 dark:text-zinc-300">frps</code> and SSH/TCP users to the forwarded port.
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                3. VM Client (nekotunnel)
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                Runs on your Linux VM (<code className="text-zinc-700 dark:text-zinc-300">amd64</code> / <code className="text-zinc-700 dark:text-zinc-300">arm64</code>) and exposes any local port on demand.
              </p>
            </div>
          </div>

          <pre className="w-full max-w-full overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-300 dark:border-zinc-800">
{`[Your Device: ssh user@proxy.rlwy.net -p PORT]
                    │
                    ▼
[Railway TCP Proxy (:8080)] ──► sslh-select
                                  ├── TLS (frpc) ──► frps (:7000)
                                  └── SSH / TCP  ──► frps (:6000) ──► [VM 127.0.0.1:<port>]`}
          </pre>
        </CardContent>
      </Card>

      {/* Admin Setup Steps */}
      {mode === "admin" && (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Cloud className="h-4 w-4 shrink-0 text-zinc-500" />
                Admin Setup Checklist
              </span>
            }
            description="Complete these 3 steps once from the dashboard before connecting your VM"
          />
          <CardContent className="space-y-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100">
                <Cloud className="h-3.5 w-3.5" />
                Step 1 — Connect Railway CLI Account
              </div>
              <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                Open <strong>Railway CLI</strong>, enter a label (e.g. <code>main</code>), and click <strong>Login with Railway CLI</strong>. Open the pairing link in your browser and approve it. Your encrypted CLI session is persisted in PostgreSQL across Render restarts.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100">
                <Server className="h-3.5 w-3.5" />
                Step 2 — Deploy or Register a Tunnel Slot
              </div>
              <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                Open <strong>Tunnel Slots</strong> and click <strong>Create &amp; Deploy</strong>. NekoTunnel deploys an Alpine container with <code>frps</code> + <code>sslh-select</code> and runs <code>railway tcp-proxy create --port 8080</code>. If a slot shows <code>tcp_pending</code>, enable TCP Proxy on port <code>8080</code> in Railway and click <strong>Refresh TCP</strong>.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100">
                <KeyRound className="h-3.5 w-3.5" />
                Step 3 — Generate a User Token
              </div>
              <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                Open <strong>User Tokens</strong>, create a token for your VM, and copy it. You can return anytime and click <strong>Reveal</strong> or <strong>Copy CLI</strong> to retrieve saved tokens.
              </p>
            </div>

            <Notice tone="warning">
              <strong>Important:</strong> Never change <code>ENCRYPTION_KEY</code> in Render environment variables after adding Railway accounts or tokens, or previously stored encrypted secrets cannot be decrypted.
            </Notice>
          </CardContent>
        </Card>
      )}

      {/* VM Client CLI Usage */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Terminal className="h-4 w-4 shrink-0 text-zinc-500" />
              VM Client Guide (On-Demand Mode)
            </span>
          }
          description="Install once on any Linux VM, save your token, and forward any port whenever you want"
        />
        <CardContent className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              1. Install the CLI on your VM (one time)
            </div>
            <CodeBlock code={installCliCmd} label="Copy Install" />
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              2. Save your token &amp; panel URL (one time)
            </div>
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              Credentials are stored securely in <code>~/.config/nekotunnel/config.env</code> (permission <code>600</code>).
            </p>
            <CodeBlock code={saveTokenCmd} label="Copy Token Setup" />
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="mb-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                3a. Forward SSH (Port 22)
              </div>
              <CodeBlock code={forwardSshCmd} label="Copy" />
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                Then connect from anywhere using the printed host &amp; port:
                <code className="mt-1 block break-all text-zinc-700 dark:text-zinc-300">
                  ssh &lt;vm_user&gt;@&lt;server_addr&gt; -p &lt;server_port&gt;
                </code>
              </p>
            </div>

            <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="mb-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                3b. Forward Any Other Port
              </div>
              <CodeBlock code={forwardAnyCmd} label="Copy" />
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                Works for any local TCP port (e.g. <code>3000</code>, <code>8080</code>, <code>5432</code>). Press <code>Ctrl+C</code> to disconnect and free the slot immediately.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Optional: Background 24/7 Systemd Service
            </div>
            <p className="mt-1 mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              If you want port 22 always online across VM reboots, use <code>install</code> (and <code>uninstall-service</code> to switch back to manual mode):
            </p>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <CodeBlock code={systemdInstallCmd} label="Copy Service Install" />
              <CodeBlock code={systemdRemoveCmd} label="Copy Uninstall" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 shrink-0 text-zinc-500" />
              Troubleshooting
            </span>
          }
          description="Quick fixes for common client and Railway slot errors"
        />
        <CardContent className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              HTTP 409: no_free_slot
            </div>
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">
              All slots are currently busy or pending. Stop an old client session, click <strong>Free</strong> on a stuck slot, or deploy an additional slot.
            </p>
          </div>

          <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              HTTP 409: max_sessions_reached
            </div>
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">
              Your token already has an active session (e.g. from systemd or another terminal). Terminate it from <strong>Sessions</strong>, run <code>uninstall-service</code>, or create a token with higher <code>max_sessions</code>.
            </p>
          </div>

          <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              connection reset by peer / session shutdown
            </div>
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">
              The Railway slot container may be crashed, sleeping, or misconfigured. Click <strong>Inspect</strong> on the slot to read live logs, or click <strong>Redeploy</strong> to push the latest <code>sslh-select</code> container.
            </p>
          </div>

          <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              Slot stays tcp_pending
            </div>
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">
              Open that service in Railway → <strong>Settings → Networking → TCP Proxy</strong>, set internal port to <code>8080</code>, then click <strong>Refresh TCP</strong> in NekoTunnel.
            </p>
          </div>
        </CardContent>
      </Card>

      {mode === "public" && (
        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-zinc-500 dark:text-zinc-400">
          <BookOpen className="h-3.5 w-3.5" />
          <span>NekoTunnel Central Public Guide</span>
        </div>
      )}
    </div>
  );
}
