"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { KeyRound, Power, RefreshCw, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { CopyButton } from "@/components/CopyButton";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, formatTime } from "@/lib/api";

type UserItem = {
  id: string;
  name: string;
  token_prefix: string;
  status: string;
  max_sessions: number;
  active_sessions: number;
  created_at: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [name, setName] = useState("");
  const [maxSessions, setMaxSessions] = useState(1);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("https://your-app.onrender.com");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ users: UserItem[] }>("/api/admin/users");
      setUsers(res.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
    load();
  }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ id: string; token: string }>(
        "/api/admin/users",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            max_sessions: Number(maxSessions),
          }),
        }
      );
      setNewToken(res.token);
      setName("");
      setMaxSessions(1);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user token");
    }
  };

  const toggle = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${id}/toggle`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle user");
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const installCmd = newToken
    ? `sudo curl -fsSL ${origin}/client/nekotunnel -o /usr/local/bin/nekotunnel && sudo chmod +x /usr/local/bin/nekotunnel && nekotunnel token ${newToken} ${origin} && nekotunnel tcp 22`
    : "";

  return (
    <AdminShell
      title="User Tokens"
      subtitle="Issue scoped ntk_ client tokens for your VMs and devices"
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

      {newToken && (
        <div className="mb-5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 dark:bg-emerald-950/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm text-emerald-800 dark:text-emerald-300">
              Copy this token now (it will not be shown again):
            </strong>
            <CopyButton text={newToken} label="Copy Token" />
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-emerald-200 dark:bg-slate-950">
            {newToken}
          </pre>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-700 dark:text-slate-300">
              Install CLI, save token once, and forward any port (e.g. <code>nekotunnel tcp 22</code> or <code>nekotunnel tcp 3000</code>):
            </span>
            <CopyButton text={installCmd} label="Copy CLI Setup" />
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-cyan-300 dark:bg-slate-950">
            {installCmd}
          </pre>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-[#0b1120]">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <KeyRound className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Create User Token
        </h2>
        <form onSubmit={handleCreate} className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
              Label / VM Name
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-ubuntu-vm"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
              Max Active Sessions
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={maxSessions}
              onChange={(e) => setMaxSessions(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Generate Token
            </button>
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800/90 dark:bg-[#0b1120]">
        <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800/80">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Issued Tokens ({users.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800/80 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Prefix</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sessions</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {users.length ? (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      {u.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                      {u.token_prefix}...
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {u.active_sessions} / {u.max_sessions}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {formatTime(u.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggle(u.id)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <Power className="h-3 w-3" />
                          {u.status === "active" ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(u.id)}
                          className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No user tokens created yet.
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
