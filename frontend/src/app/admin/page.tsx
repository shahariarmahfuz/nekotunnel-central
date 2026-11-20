"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Terminal } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { CopyButton } from "@/components/CopyButton";
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

  const vmCommand = `curl -fsSL ${origin}/client/nekotunnel -o nekotunnel && chmod +x nekotunnel && ./nekotunnel tcp 22 YOUR_USER_TOKEN ${origin}`;

  const cards = data
    ? [
        { label: "Free Slots", value: data.counts.free_slots, tone: "text-emerald-600 dark:text-emerald-400" },
        { label: "Busy Slots", value: data.counts.busy_slots, tone: "text-cyan-600 dark:text-cyan-400" },
        { label: "Active Sessions", value: data.counts.active_sessions, tone: "text-emerald-700 dark:text-emerald-300" },
        { label: "TCP Pending", value: data.counts.pending_slots, tone: "text-amber-600 dark:text-amber-400" },
        { label: "Deploying", value: data.counts.deploying_slots, tone: "text-amber-600 dark:text-amber-300" },
        { label: "Failed Slots", value: data.counts.failed_slots, tone: "text-rose-600 dark:text-rose-400" },
        { label: "Railway Accounts", value: data.counts.accounts, tone: "text-slate-900 dark:text-slate-200" },
        { label: "User Tokens", value: data.counts.users, tone: "text-slate-900 dark:text-slate-200" },
      ]
    : [];

  return (
    <AdminShell
      title="Dashboard Overview"
      subtitle="Live pool capacity, internal system status, and recent activity"
      actions={
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800/90 dark:bg-[#0b1120]"
          >
            <div className={`text-2xl font-bold tabular-nums ${c.tone}`}>
              {c.value}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      {/* System Status + Quick VM Command */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-[#0b1120]">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Runtime Health
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-slate-500 dark:text-slate-400">Railway CLI</div>
              <div className="mt-1 font-semibold">
                {data?.system.railway_cli ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Installed & Ready</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">Not found (manual slots OK)</span>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-slate-500 dark:text-slate-400">FRP Version</div>
              <div className="mt-1 font-mono font-semibold text-slate-900 dark:text-slate-200">
                v{data?.system.frp_version ?? "0.57.0"}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-slate-500 dark:text-slate-400">Session Heartbeat TTL</div>
              <div className="mt-1 font-semibold text-slate-900 dark:text-slate-200">
                {data?.system.session_ttl_seconds ?? 90}s
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-slate-500 dark:text-slate-400">Railway Internal Port</div>
              <div className="mt-1 font-mono font-semibold text-slate-900 dark:text-slate-200">
                {data?.system.tcp_internal_port ?? 8080}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-[#0b1120]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Terminal className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              VM Quick Connect Command
            </h2>
            <CopyButton text={vmCommand} label="Copy Command" />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Run on your target VM to expose SSH (port 22) through an available Railway slot:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-3 text-xs text-emerald-300 dark:border-slate-800 dark:bg-slate-950">
            {vmCommand}
          </pre>
        </section>
      </div>

      {/* Audit Logs */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800/90 dark:bg-[#0b1120]">
        <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800/80">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Recent Audit Logs
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800/80 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {data?.logs.length ? (
                data.logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500 dark:text-slate-400">
                      {formatTime(log.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-900 dark:text-slate-200">
                      {log.actor}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-emerald-700 dark:text-emerald-300">
                      {log.action}
                    </td>
                    <td className="max-w-md truncate px-4 py-2.5 text-slate-600 dark:text-slate-400">
                      {log.details || "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No activity logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
