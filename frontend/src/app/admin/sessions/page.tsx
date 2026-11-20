"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, XCircle } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { CopyButton } from "@/components/CopyButton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, Card, CardHeader, EmptyState, Notice } from "@/components/ui/primitives";
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
      title="Sessions"
      subtitle="Active client heartbeats, endpoints, and recent tunnel history"
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

      <Card className="overflow-hidden">
        <CardHeader title={`Recent Sessions (${sessions.length})`} />

        {!sessions.length ? (
          <EmptyState
            icon={<Activity className="h-4 w-4" />}
            title="No tunnel sessions yet"
            description="Run nekotunnel tcp 22 on your VM to open a live session."
          />
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80 md:hidden">
              {sessions.map((s) => (
                <div key={s.id} className="space-y-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {s.user_name}
                      </div>
                      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {s.slot_project_name} • Port {s.client_local_port ?? "—"}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>

                  {s.server_addr && s.server_port && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                      <code className="break-all text-xs text-zinc-800 dark:text-zinc-200">
                        {s.server_addr}:{s.server_port}
                      </code>
                      {s.status === "active" && (
                        <CopyButton
                          text={`ssh user@${s.server_addr} -p ${s.server_port}`}
                          label="Copy SSH"
                        />
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>HB: {formatTime(s.last_heartbeat_at)}</span>
                    {s.ended_at && <span>Ended: {formatTime(s.ended_at)}</span>}
                  </div>

                  {s.status === "active" && (
                    <Button variant="danger" size="sm" onClick={() => terminate(s.id)}>
                      <XCircle className="h-3.5 w-3.5" />
                      Terminate Session
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200/80 bg-zinc-50/80 text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">User</th>
                    <th className="px-4 py-2.5 font-medium">Slot & Endpoint</th>
                    <th className="px-4 py-2.5 font-medium">Local Port</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Heartbeat</th>
                    <th className="px-4 py-2.5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {s.user_name}
                        </div>
                        <div className="font-mono text-[11px] text-zinc-400">
                          {s.id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-zinc-700 dark:text-zinc-300">
                          {s.slot_project_name}
                        </div>
                        {s.server_addr && s.server_port && (
                          <div className="mt-1 flex items-center gap-2">
                            <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
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
                      <td className="px-4 py-3 font-mono text-zinc-700 dark:text-zinc-300">
                        {s.client_local_port ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                        <div>{formatTime(s.last_heartbeat_at)}</div>
                        {s.ended_at && (
                          <div className="text-[11px] text-zinc-400">
                            Ended: {formatTime(s.ended_at)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.status === "active" ? (
                          <Button variant="danger" size="sm" onClick={() => terminate(s.id)}>
                            <XCircle className="h-3.5 w-3.5" />
                            Terminate
                          </Button>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
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
