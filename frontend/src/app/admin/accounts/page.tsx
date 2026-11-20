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
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  FieldLabel,
  Input,
  Notice,
} from "@/components/ui/primitives";
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
      subtitle="Connect accounts via browserless Railway CLI login — encrypted session persists in Postgres"
      actions={
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      }
    >
      {error && (
        <Notice tone="error" className="mb-4 break-words">
          {error}
        </Notice>
      )}
      {notice && (
        <Notice tone="success" className="mb-4">
          {notice}
        </Notice>
      )}

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-zinc-500" />
              Connect Railway CLI
            </span>
          }
          description="Runs railway login --browserless inside the backend container (no API token required)"
        />
        <CardContent>
          <form onSubmit={handleStartCliLogin} className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Account Label</FieldLabel>
              <Input
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="main-railway"
              />
            </div>
            <div>
              <FieldLabel>Workspace Name or ID (optional)</FieldLabel>
              <Input
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="Leave blank for default workspace"
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={
                  startingLogin ||
                  loginJob?.status === "awaiting_user" ||
                  loginJob?.status === "starting"
                }
                className="w-full sm:w-auto"
              >
                <Cloud className="h-4 w-4" />
                <span>
                  {startingLogin ? "Starting Railway CLI..." : "Login with Railway CLI"}
                </span>
              </Button>
            </div>
          </form>

          {loginJob && loginJob.status !== "failed" && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
              {loginJob.status === "starting" && (
                <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Launching <code>railway login --browserless</code>...
                </div>
              )}

              {loginJob.status === "awaiting_user" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                    Waiting for browser authorization...
                  </div>

                  {loginJob.user_code && (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Code:
                      </span>
                      <code className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-base font-semibold tracking-widest text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
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
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
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
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Connected as {loginJob.railway_user || loginJob.label}!
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-5 overflow-hidden">
        <CardHeader title={`Connected Accounts (${accounts.length})`} />

        {!accounts.length ? (
          <EmptyState
            icon={<Cloud className="h-4 w-4" />}
            title="No Railway accounts connected"
            description="Click Login with Railway CLI above to pair your Railway workspace."
          />
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80 md:hidden">
              {accounts.map((a) => (
                <div key={a.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {a.label}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {a.railway_user || a.auth_mode} • {a.workspace || "default"}
                      </div>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Checked: {formatTime(a.last_checked_at || a.created_at)}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => verify(a.id)}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Verify
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toggle(a.id)}>
                      <Power className="h-3.5 w-3.5" />
                      {a.status === "active" ? "Disable" : "Enable"}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => remove(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200/80 bg-zinc-50/80 text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Label</th>
                    <th className="px-4 py-2.5 font-medium">Railway User</th>
                    <th className="px-4 py-2.5 font-medium">Workspace</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Checked</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                  {accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {a.label}
                        </div>
                        <div className="text-[11px] text-zinc-400">{a.auth_mode}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {a.railway_user || "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {a.workspace || "default"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                        {formatTime(a.last_checked_at || a.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => verify(a.id)}>
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Verify
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => toggle(a.id)}>
                            <Power className="h-3.5 w-3.5" />
                            {a.status === "active" ? "Disable" : "Enable"}
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => remove(a.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
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
