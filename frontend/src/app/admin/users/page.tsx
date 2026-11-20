"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Power, RefreshCw, Terminal, Trash2 } from "lucide-react";
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

type UserItem = {
  id: string;
  name: string;
  token_prefix: string;
  has_token: boolean;
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
  const [revealedTokens, setRevealedTokens] = useState<Record<string, string>>({});
  const [loadingTokenId, setLoadingTokenId] = useState<string | null>(null);
  const [copiedUserCmdId, setCopiedUserCmdId] = useState<string | null>(null);
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
      setRevealedTokens((prev) => ({ ...prev, [res.id]: res.token }));
      setName("");
      setMaxSessions(1);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user token");
    }
  };

  const fetchToken = async (id: string): Promise<string | null> => {
    if (revealedTokens[id]) return revealedTokens[id];
    setLoadingTokenId(id);
    setError(null);
    try {
      const res = await apiFetch<{ token: string }>(`/api/admin/users/${id}/token`);
      setRevealedTokens((prev) => ({ ...prev, [id]: res.token }));
      return res.token;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reveal token");
      return null;
    } finally {
      setLoadingTokenId(null);
    }
  };

  const toggleReveal = async (id: string) => {
    if (revealedTokens[id]) {
      setRevealedTokens((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    await fetchToken(id);
  };

  const copyCliSetupForUser = async (id: string) => {
    const tok = await fetchToken(id);
    if (!tok) return;
    const cmd = `nekotunnel token ${tok} ${origin}`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedUserCmdId(id);
      setTimeout(() => setCopiedUserCmdId(null), 1600);
    } catch {
      // ignore
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
      subtitle="Issue, reveal, and manage VM client tokens anytime"
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

      {newToken && (
        <Card className="mb-5 border-emerald-500/30 dark:border-emerald-500/30">
          <CardHeader
            title="Token Created"
            description="Saved encrypted in database — you can reveal or copy it anytime below."
            action={<CopyButton text={newToken} label="Copy Token" />}
          />
          <CardContent className="space-y-3">
            <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-950 p-3 text-xs text-emerald-300 dark:border-zinc-800">
              {newToken}
            </pre>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Full one-time VM setup + forward port 22:
              </span>
              <CopyButton text={installCmd} label="Copy Full Setup" />
            </div>
            <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-200 dark:border-zinc-800">
              {installCmd}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Create User Token"
          description="Each token lets your VM connect and forward any TCP port on demand"
        />
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <FieldLabel>Label / VM Name</FieldLabel>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-ubuntu-vm"
              />
            </div>
            <div>
              <FieldLabel>Max Sessions</FieldLabel>
              <Input
                type="number"
                min={1}
                max={50}
                value={maxSessions}
                onChange={(e) => setMaxSessions(Number(e.target.value))}
              />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit">
                <KeyRound className="h-4 w-4" />
                Generate Token
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-5 overflow-hidden">
        <CardHeader title={`Issued Tokens (${users.length})`} />

        {!users.length ? (
          <EmptyState
            icon={<KeyRound className="h-4 w-4" />}
            title="No user tokens yet"
            description="Create a token above to connect your VM with nekotunnel."
          />
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80 md:hidden">
              {users.map((u) => {
                const revealed = revealedTokens[u.id];
                return (
                  <div key={u.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {u.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                          Sessions: {u.active_sessions}/{u.max_sessions} • {formatTime(u.created_at)}
                        </div>
                      </div>
                      <StatusBadge status={u.status} />
                    </div>

                    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/70">
                      <code className="block break-all text-xs text-zinc-800 dark:text-zinc-200">
                        {revealed || `${u.token_prefix}••••••••••••••••`}
                      </code>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {u.has_token ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={loadingTokenId === u.id}
                            onClick={() => toggleReveal(u.id)}
                          >
                            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            {revealed ? "Hide" : "Reveal"}
                          </Button>
                          {revealed && <CopyButton text={revealed} label="Copy" />}
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={loadingTokenId === u.id}
                            onClick={() => copyCliSetupForUser(u.id)}
                          >
                            <Terminal className="h-3.5 w-3.5" />
                            {copiedUserCmdId === u.id ? "Copied CLI!" : "Copy CLI"}
                          </Button>
                        </>
                      ) : (
                        <span className="text-[11px] text-zinc-400">
                          Legacy token (created before reveal support)
                        </span>
                      )}
                      <Button variant="outline" size="sm" onClick={() => toggle(u.id)}>
                        <Power className="h-3.5 w-3.5" />
                        {u.status === "active" ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => remove(u.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200/80 bg-zinc-50/80 text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Token</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Sessions</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                  {users.map((u) => {
                    const revealed = revealedTokens[u.id];
                    return (
                      <tr key={u.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40">
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">
                            {u.name}
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            {formatTime(u.created_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <code className="max-w-xs truncate rounded bg-zinc-100 px-2 py-1 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                              {revealed || `${u.token_prefix}••••••••`}
                            </code>
                            {revealed && <CopyButton text={revealed} />}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={u.status} />
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-300">
                          {u.active_sessions} / {u.max_sessions}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {u.has_token && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={loadingTokenId === u.id}
                                  onClick={() => toggleReveal(u.id)}
                                >
                                  {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  {revealed ? "Hide" : "Reveal"}
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={loadingTokenId === u.id}
                                  onClick={() => copyCliSetupForUser(u.id)}
                                >
                                  <Terminal className="h-3.5 w-3.5" />
                                  {copiedUserCmdId === u.id ? "Copied!" : "CLI"}
                                </Button>
                              </>
                            )}
                            <Button variant="outline" size="sm" onClick={() => toggle(u.id)}>
                              <Power className="h-3.5 w-3.5" />
                              {u.status === "active" ? "Disable" : "Enable"}
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => remove(u.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </AdminShell>
  );
}
