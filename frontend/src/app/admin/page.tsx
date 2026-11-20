"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Cloud, KeyRound, RefreshCw, Server, Terminal } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { CopyButton } from "@/components/CopyButton";
import { Button, Card, CardContent, CardHeader, EmptyState, Notice } from "@/components/ui/primitives";
import { apiFetch, formatTime } from "@/lib/api";

type OverviewResponse = {
  counts: {
    accounts: number;
    users: number;
    free_slots: number;
    busy_slots: number;
    pending_slots: number;
    deploying_slots: number;
    failed_slots: number;
    active_sessions: number;
  };
  logs: {
    id: string;
    actor: string;
    action: string;
    details: string | null;
    created_at: string;
  }[];
  system: {
    railway_cli: boolean;
    session_ttl_seconds: number;
    tcp_internal_port: number;
    frp_version: string;
  };
};

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("https://your-app.onrender.com");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<OverviewResponse>("/api/admin/overview");
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overview");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  const vmInstall = `sudo curl -fsSL ${origin}/client/nekotunnel -o /usr/local/bin/nekotunnel && sudo chmod +x /usr/local/bin/nekotunnel`;

  return (
    <AdminShell
      title="Overview"
      subtitle="Live tunnel pool capacity and control plane status"
      actions={
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      }
    >
      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Free Slots</span>
            <Server className="h-3.5 w-3.5" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              {data ? data.counts.free_slots : "—"}
            </span>
            {data && data.counts.busy_slots > 0 && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {data.counts.busy_slots} busy
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Active Tunnels</span>
            <Activity className="h-3.5 w-3.5" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {data ? data.counts.active_sessions : "—"}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Railway Accounts</span>
            <Cloud className="h-3.5 w-3.5" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {data ? data.counts.accounts : "—"}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>User Tokens</span>
            <KeyRound className="h-3.5 w-3.5" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {data ? data.counts.users : "—"}
          </div>
        </div>
      </div>

      {/* Bento Grid: VM CLI + Runtime Health */}
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-12">
        <Card className="min-w-0 lg:col-span-7">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Terminal className="h-4 w-4 shrink-0 text-zinc-500" />
                VM CLI Setup
              </span>
            }
            description="Install once on any Linux VM, save your token, then forward any port on demand"
            action={<CopyButton text={vmInstall} label="Copy Install" />}
          />
          <CardContent className="space-y-3">
            <pre className="w-full max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-zinc-200 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-100 dark:border-zinc-800">
              {vmInstall}
            </pre>
            <div className="grid min-w-0 gap-2 text-xs text-zinc-600 dark:text-zinc-400 sm:grid-cols-2">
              <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                <div className="text-[11px] text-zinc-400">1. Save token once</div>
                <code className="mt-0.5 block break-all text-zinc-800 dark:text-zinc-200">
                  nekotunnel token YOUR_TOKEN {origin}
                </code>
              </div>
              <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                <div className="text-[11px] text-zinc-400">2. Forward any port</div>
                <code className="mt-0.5 block text-zinc-800 dark:text-zinc-200">
                  nekotunnel tcp 22 <span className="text-zinc-400">or</span> 3000
                </code>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-5">
          <CardHeader
            title="Runtime Status"
            description="Backend worker & slot configuration"
          />
          <CardContent className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="text-zinc-500 dark:text-zinc-400">Railway CLI</div>
              <div className="mt-1 font-medium">
                {data?.system.railway_cli ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Ready</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">Unavailable</span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="text-zinc-500 dark:text-zinc-400">FRP Engine</div>
              <div className="mt-1 font-mono font-medium">
                v{data?.system.frp_version ?? "0.57.0"}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="text-zinc-500 dark:text-zinc-400">Pending / Failed</div>
              <div className="mt-1 font-medium tabular-nums">
                {data
                  ? `${data.counts.pending_slots + data.counts.deploying_slots} / ${data.counts.failed_slots}`
                  : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="text-zinc-500 dark:text-zinc-400">Heartbeat TTL</div>
              <div className="mt-1 font-medium tabular-nums">
                {data?.system.session_ttl_seconds ?? 90}s
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="mt-4 overflow-hidden">
        <CardHeader title="Recent Activity" />
        {!data?.logs.length ? (
          <EmptyState
            icon={<Activity className="h-4 w-4" />}
            title="No recent events"
            description="Slot deployments, token creations, and tunnel connections will appear here."
          />
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80 md:hidden">
              {data.logs.map((log) => (
                <div key={log.id} className="space-y-1 p-4 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                      {log.action}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {formatTime(log.created_at)}
                    </span>
                  </div>
                  <div className="text-zinc-500 dark:text-zinc-400">
                    Actor: <span className="text-zinc-700 dark:text-zinc-300">{log.actor}</span>
                  </div>
                  {log.details && (
                    <div className="break-all text-[11px] text-zinc-500 dark:text-zinc-400">
                      {log.details}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200/80 bg-zinc-50/80 text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Time</th>
                    <th className="px-4 py-2.5 font-medium">Actor</th>
                    <th className="px-4 py-2.5 font-medium">Action</th>
                    <th className="px-4 py-2.5 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                  {data.logs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40">
                      <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500 dark:text-zinc-400">
                        {formatTime(log.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium">
                        {log.actor}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-zinc-700 dark:text-zinc-300">
                        {log.action}
                      </td>
                      <td className="max-w-md truncate px-4 py-2.5 text-zinc-500 dark:text-zinc-400">
                        {log.details || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </AdminShell>
  );
}
