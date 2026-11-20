"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Cloud, Power, RefreshCw, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, formatTime } from "@/lib/api";

type AccountItem = {
  id: string;
  label: string;
  workspace: string;
  status: string;
  created_at: string;
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [label, setLabel] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ accounts: AccountItem[] }>("/api/admin/accounts");
      setAccounts(res.accounts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounts");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiFetch("/api/admin/accounts", {
        method: "POST",
        body: JSON.stringify({
          label,
          workspace,
          api_token: apiToken,
        }),
      });
      setNotice(`Saved encrypted Railway account "${label}"`);
      setLabel("");
      setWorkspace("");
      setApiToken("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add account");
    }
  };

  const toggle = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/admin/accounts/${id}/toggle`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle account");
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/admin/accounts/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    }
  };

  return (
    <AdminShell
      title="Railway Accounts"
      subtitle="Store AES-256-GCM encrypted Railway API tokens for automated slot deployments"
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
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}

      <section className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Cloud className="h-4 w-4 text-emerald-400" />
          Add Railway API Token
        </h2>
        <form onSubmit={handleAdd} className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Label</label>
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="pro1"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Workspace Name or ID
            </label>
            <input
              required
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="My Workspace"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Railway API Token
            </label>
            <input
              required
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="rw_..."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Save Encrypted Account
            </button>
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-slate-800/90 bg-[#0b1120]">
        <div className="border-b border-slate-800/80 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-white">
            Configured Accounts ({accounts.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800/80 bg-slate-900/40 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Workspace</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {accounts.length ? (
                accounts.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-900/30">
                    <td className="px-4 py-3 font-medium text-white">{a.label}</td>
                    <td className="px-4 py-3 text-slate-300">{a.workspace}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatTime(a.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggle(a.id)}
                          className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
                        >
                          <Power className="h-3 w-3" />
                          {a.status === "active" ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(a.id)}
                          className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No Railway accounts configured yet.
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
