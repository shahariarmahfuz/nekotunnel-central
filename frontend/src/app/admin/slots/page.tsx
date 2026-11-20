"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Rocket, Trash2, Unlock } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { CopyButton } from "@/components/CopyButton";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch } from "@/lib/api";

type AccountItem = {
  id: string;
  label: string;
  workspace: string;
  status: string;
};

type SlotItem = {
  id: string;
  account_label: string | null;
  project_name: string;
  service_name: string;
  server_addr: string | null;
  server_port: number | null;
  remote_port: number;
  status: string;
  last_error: string | null;
};

export default function SlotsPage() {
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [accountId, setAccountId] = useState("");
  const [count, setCount] = useState(1);

  const [projectName, setProjectName] = useState("");
  const [serverAddr, setServerAddr] = useState("");
  const [serverPort, setServerPort] = useState("");
  const [frpToken, setFrpToken] = useState("");
  const [serviceName, setServiceName] = useState("final");

  const load = useCallback(async () => {
    try {
      const [slotsRes, acctsRes] = await Promise.all([
        apiFetch<{ slots: SlotItem[] }>("/api/admin/slots"),
        apiFetch<{ accounts: AccountItem[] }>("/api/admin/accounts"),
      ]);
      setSlots(slotsRes.slots);
      const activeAccts = acctsRes.accounts.filter((a) => a.status === "active");
      setAccounts(activeAccts);
      if (activeAccts.length > 0 && !accountId) {
        setAccountId(activeAccts[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load slots");
    }
  }, [accountId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [load]);

  const handleCreateRailway = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiFetch("/api/admin/slots/create", {
        method: "POST",
        body: JSON.stringify({ account_id: accountId, count: Number(count) }),
      });
      setNotice(`Queued ${count} Railway CLI slot deployment(s). Refreshing status automatically...`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to queue deployment");
    }
  };

  const handleAddManual = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setCreatedToken(null);
    try {
      const res = await apiFetch<{ id: string; frp_token: string }>(
        "/api/admin/slots/manual",
        {
          method: "POST",
          body: JSON.stringify({
            project_name: projectName,
            server_addr: serverAddr,
            server_port: Number(serverPort),
            frp_token: frpToken || undefined,
            service_name: serviceName || "final",
          }),
        }
      );
      setNotice(`Added manual slot "${projectName}"`);
      if (!frpToken && res.frp_token) {
        setCreatedToken(res.frp_token);
      }
      setProjectName("");
      setServerAddr("");
      setServerPort("");
      setFrpToken("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add manual slot");
    }
  };

  const runSlotAction = async (
    id: string,
    action: "refresh" | "free" | "delete"
  ) => {
    setError(null);
    setNotice(null);
    try {
      if (action === "delete") {
        await apiFetch(`/api/admin/slots/${id}`, { method: "DELETE" });
      } else {
        await apiFetch(`/api/admin/slots/${id}/${action}`, { method: "POST" });
        if (action === "refresh") {
          setNotice("TCP Proxy synced successfully!");
        }
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Slot ${action} failed`);
    }
  };

  return (
    <AdminShell
      title="Tunnel Slots"
      subtitle="Deploy Railway FRP/SSLH endpoints via Railway CLI or register manual TCP Proxy slots"
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
      <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
        <strong>Railway TCP Proxy:</strong> CLI auto-deployment attempts{" "}
        <code className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono">
          railway tcp-proxy create --port 8080
        </code>
        . If a slot shows <code>tcp_pending</code>, enable TCP Proxy on port <code>8080</code> in Railway and click <strong>Refresh TCP</strong>.
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}
      {createdToken && (
        <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          <div className="mb-2 flex items-center justify-between">
            <strong>Generated FRP_TOKEN (set this in Railway Variables if using railway-slot/):</strong>
            <CopyButton text={createdToken} label="Copy FRP Token" />
          </div>
          <pre className="overflow-x-auto rounded bg-slate-900 p-2 font-mono text-emerald-300 dark:bg-slate-950">
            {createdToken}
          </pre>
        </div>
      )}

      {/* Forms */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-[#0b1120]">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Rocket className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Auto-Deploy Railway Slot
          </h2>
          <form onSubmit={handleCreateRailway} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
                Railway CLI Account
              </label>
              <select
                required
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {accounts.length === 0 ? (
                  <option value="">No active Railway CLI accounts</option>
                ) : (
                  accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} — {a.workspace || "default"}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
                Count (1–5)
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={accounts.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Rocket className="h-4 w-4" />
              Create & Deploy
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-[#0b1120]">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Plus className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            Add Manual Slot
          </h2>
          <form onSubmit={handleAddManual} className="mt-4 grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
                Project Name
              </label>
              <input
                required
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="my-railway-vm"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
                Service Name
              </label>
              <input
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="final"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
                Railway TCP Host
              </label>
              <input
                required
                value={serverAddr}
                onChange={(e) => setServerAddr(e.target.value)}
                placeholder="monorail.proxy.rlwy.net"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
                Railway TCP Port
              </label>
              <input
                required
                type="number"
                min={1}
                max={65535}
                value={serverPort}
                onChange={(e) => setServerPort(e.target.value)}
                placeholder="45678"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
                FRP Token (leave empty to auto-generate)
              </label>
              <input
                type="password"
                value={frpToken}
                onChange={(e) => setFrpToken(e.target.value)}
                placeholder="Optional custom token"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="col-span-2">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                <Plus className="h-4 w-4" />
                Add Manual Slot
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Slots Table */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800/90 dark:bg-[#0b1120]">
        <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800/80">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Slot Pool ({slots.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800/80 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Public TCP Endpoint</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Error</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {slots.length ? (
                slots.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {s.project_name}
                      </div>
                      <div className="text-[11px] text-slate-500">{s.service_name}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {s.account_label || "manual"}
                    </td>
                    <td className="px-4 py-3">
                      {s.server_addr && s.server_port ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="rounded bg-slate-100 px-2 py-1 text-emerald-700 dark:bg-slate-900 dark:text-emerald-300">
                            {s.server_addr}:{s.server_port}
                          </code>
                          <CopyButton
                            text={`ssh user@${s.server_addr} -p ${s.server_port}`}
                            label="Copy SSH"
                          />
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td
                      className="max-w-xs truncate px-4 py-3 text-rose-600 dark:text-rose-300/90"
                      title={s.last_error || ""}
                    >
                      {s.last_error || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {s.account_label && (
                          <button
                            type="button"
                            onClick={() => runSlotAction(s.id, "refresh")}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Refresh TCP
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => runSlotAction(s.id, "free")}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <Unlock className="h-3 w-3" />
                          Free
                        </button>
                        <button
                          type="button"
                          onClick={() => runSlotAction(s.id, "delete")}
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
                    No slots added yet.
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
