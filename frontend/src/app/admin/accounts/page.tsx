"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  ExternalLink,
  Loader2,
  Power,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { CopyButton } from "@/components/CopyButton";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, formatTime } from "@/lib/api";

type AccountItem = {
  id: string;
  label: string;
  workspace: string;
  auth_mode: string;
  railway_user: string | null;
  status: string;
  last_checked_at: string | null;
  created_at: string;
};

type LoginJob = {
  job_id: string;
  label: string;
  workspace: string;
  status: "starting" | "awaiting_user" | "completed" | "failed";
  activation_url: string | null;
  user_code: string | null;
  railway_user: string | null;
  account_id: string | null;
  error: string | null;
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [label, setLabel] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [loginJob, setLoginJob] = useState<LoginJob | null>(null);
  const [startingLogin, setStartingLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleStartCliLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    stopPolling();
    setStartingLogin(true);
    try {
      const res = await apiFetch<{ job_id: string }>("/api/admin/accounts/login", {
        method: "POST",
        body: JSON.stringify({
          label,
          workspace: workspace.trim() || undefined,
        }),
      });

      const jobId = res.job_id;
      const poll = async () => {
        try {
          const job = await apiFetch<LoginJob>(`/api/admin/accounts/login/${jobId}`);
          setLoginJob(job);
          if (job.status === "completed") {
            stopPolling();
            setNotice(
              `Connected Railway CLI account "${job.label}"${
                job.railway_user ? ` (${job.railway_user})` : ""
              }`
            );
            setLabel("");
            setWorkspace("");
            load();
          } else if (job.status === "failed") {
            stopPolling();
            setError(job.error || "Railway CLI login failed");
          }
        } catch (err) {
          stopPolling();
          setError(err instanceof Error ? err.message : "Failed to poll login status");
        }
      };

      await poll();
      pollRef.current = setInterval(poll, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Railway CLI login");
    } finally {
      setStartingLogin(false);
    }
  };

  const verify = async (id: string) => {
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ ok: boolean; railway_user: string }>(
        `/api/admin/accounts/${id}/verify`,
        { method: "POST" }
      );
      setNotice(`CLI session verified: ${res.railway_user}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "CLI session verification failed");
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
      title="Railway CLI Accounts"
      subtitle="Connect Railway accounts directly via Railway CLI browserless login — no API token needed"
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
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-[#0b1120]">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <Cloud className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Connect Railway Account via CLI
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Runs <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">railway login --browserless</code> inside the backend container and saves your encrypted CLI session in PostgreSQL so it persists across restarts.
        </p>

        <form onSubmit={handleStartCliLogin} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
              Account Label
            </label>
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="main-railway"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
              Workspace Name or ID (optional)
            </label>
            <input
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="Leave blank for default workspace"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={startingLogin || loginJob?.status === "awaiting_user" || loginJob?.status === "starting"}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Cloud className="h-4 w-4" />
              <span>{startingLogin ? "Starting Railway CLI..." : "Login with Railway CLI"}</span>
            </button>
          </div>
        </form>

        {loginJob && loginJob.status !== "failed" && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 dark:bg-emerald-950/20">
            {loginJob.status === "starting" && (
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                Launching <code>railway login --browserless</code>...
              </div>
            )}

            {loginJob.status === "awaiting_user" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for your browser authorization...
                </div>

                {loginJob.user_code && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-slate-600 dark:text-slate-400">Pairing Code:</span>
                    <code className="rounded-lg border border-emerald-500/40 bg-white px-3 py-1.5 text-base font-bold tracking-widest text-emerald-700 dark:bg-slate-950 dark:text-emerald-300">
                      {loginJob.user_code}
                    </code>
                    <CopyButton text={loginJob.user_code} label="Copy Code" />
                  </div>
                )}

                {loginJob.activation_url && (
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={loginJob.activation_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open Railway Activation Page
                    </a>
                    <CopyButton text={loginJob.activation_url} label="Copy Link" />
                  </div>
                )}
              </div>
            )}

            {loginJob.status === "completed" && (
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Railway CLI login complete! Connected as {loginJob.railway_user || loginJob.label}.
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800/90 dark:bg-[#0b1120]">
        <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800/80">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Connected Accounts ({accounts.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800/80 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Railway User</th>
                <th className="px-4 py-3 font-medium">Workspace</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Checked</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {accounts.length ? (
                accounts.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">{a.label}</div>
                      <div className="text-[11px] text-slate-500">{a.auth_mode}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {a.railway_user || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {a.workspace || <span className="text-slate-400">default</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {formatTime(a.last_checked_at || a.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => verify(a.id)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          Verify
                        </button>
                        <button
                          type="button"
                          onClick={() => toggle(a.id)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <Power className="h-3 w-3" />
                          {a.status === "active" ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(a.id)}
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
                    No Railway CLI accounts connected yet.
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
