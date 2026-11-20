"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, XCircle } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { CopyButton } from "@/components/CopyButton";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, formatTime } from "@/lib/api";

type SessionItem = {
  id: string;
  user_name: string;
  slot_project_name: string;
  server_addr: string | null;
  server_port: number | null;
  status: string;
  client_local_port: number | null;
  proxy_name: string;
  started_at: string;
  last_heartbeat_at: string;
  ended_at: string | null;
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ sessions: SessionItem[] }>("/api/admin/sessions");
      setSessions(res.sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [load]);

  const terminate = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/admin/sessions/${id}/terminate`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to terminate session");
    }
  };

  return (
    <AdminShell
      title="Live & Recent Sessions"
      subtitle="Monitor active client heartbeats, assigned Railway endpoints, and terminate stale tunnels"
      actions={
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-800/90 bg-[#0b1120]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800/80 bg-slate-900/40 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Session</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Slot & Endpoint</th>
                <th className="px-4 py-3 font-medium">Local Port</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Heartbeat</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sessions.length ? (
                sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-900/30">
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {s.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 font-medium text-white">
                      {s.user_name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-200">{s.slot_project_name}</div>
                      {s.server_addr && s.server_port && (
                        <div className="mt-1 flex items-center gap-2">
                          <code className="rounded bg-slate-900 px-1.5 py-0.5 text-emerald-300">
                            {s.server_addr}:{s.server_port}
                          </code>
                          {s.status === "active" && (
                            <CopyButton
                              text={`ssh user@${s.server_addr} -p ${s.server_port}`}
                              label="SSH"
                            />
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {s.client_local_port ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      <div>Last: {formatTime(s.last_heartbeat_at)}</div>
                      {s.ended_at && (
                        <div className="text-[11px] text-slate-500">
                          Ended: {formatTime(s.ended_at)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => terminate(s.id)}
                          className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Terminate
                        </button>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No tunnel sessions recorded yet.
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
