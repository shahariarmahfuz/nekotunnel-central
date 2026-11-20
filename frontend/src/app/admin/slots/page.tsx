"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Rocket, Server, Terminal, Trash2, Unlock, X } from "lucide-react";
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
  Select,
} from "@/components/ui/primitives";
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

type InspectData = {
  project_name: string;
  project_id: string | null;
  tcp_proxies: string;
  deployments: string;
  logs: string;
};

export default function SlotsPage() {
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [inspectData, setInspectData] = useState<InspectData | null>(null);
  const [inspectingId, setInspectingId] = useState<string | null>(null);
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
    const inspectSlot = async (s: SlotItem) => {
    setError(null);
    setInspectingId(s.id);
    try {
      const res = await apiFetch<Omit<InspectData, "project_name">>(
        `/api/admin/slots/${s.id}/inspect`
      );
      setInspectData({
        project_name: s.project_name,
        ...res,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to inspect Railway slot");
    } finally {
      setInspectingId(null);
    }
  };

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
      setNotice(`Queued ${count} Railway CLI slot deployment(s). Refreshing automatically.`);
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
    action: "refresh" | "redeploy" | "free" | "delete"
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
        } else if (action === "redeploy") {
          setNotice("Slot redeploy triggered with updated sslh-select image!");
        }
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Slot ${action} failed`);
    }
  };

  const inspectSlot = async (s: SlotItem) => {
    setError(null);
    setInspectingId(s.id);
    try {
      const res = await apiFetch<Omit<InspectData, "project_name">>(
        `/api/admin/slots/${s.id}/inspect`
      );
      setInspectData({
        project_name: s.project_name,
        ...res,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to inspect Railway slot");
    } finally {
      setInspectingId(null);
    }
  };

  return (
    <AdminShell
      title="Tunnel Slots"
      subtitle="Deploy Railway FRP/SSLH endpoints or register manual TCP Proxy slots"
      actions={
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      }
    >
      <Notice tone="warning" className="mb-4">
        <strong>Railway TCP Proxy:</strong> Auto-deploy runs{" "}
        <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono">
          railway tcp-proxy create --port 8080
        </code>
        . If a slot stays <code>tcp_pending</code>, enable TCP Proxy on internal port{" "}
        <code>8080</code> in Railway and tap <strong>Refresh TCP</strong>.
      </Notice>

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
      {createdToken && (
        <Card className="mb-4 border-emerald-500/30">
          <CardHeader
            title="Generated FRP_TOKEN"
            description="Set this variable in your Railway service if deploying railway-slot/ manually"
            action={<CopyButton text={createdToken} label="Copy Token" />}
          />
          <CardContent>
            <pre className="w-full max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-zinc-200 bg-zinc-950 p-3 text-xs text-emerald-300 dark:border-zinc-800">
              {createdToken}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Forms */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-zinc-500" />
                Auto-Deploy via Railway CLI
              </span>
            }
          />
          <CardContent>
            <form onSubmit={handleCreateRailway} className="space-y-3">
              <div>
                <FieldLabel>Railway CLI Account</FieldLabel>
                <Select
                  required
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
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
                </Select>
              </div>
              <div>
                <FieldLabel>Count (1–5)</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </div>
              <Button type="submit" disabled={accounts.length === 0} className="w-full sm:w-auto">
                <Rocket className="h-4 w-4" />
                Create & Deploy
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-zinc-500" />
                Add Manual Slot
              </span>
            }
          />
          <CardContent>
            <form onSubmit={handleAddManual} className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <FieldLabel>Project Name</FieldLabel>
                <Input
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="my-railway-vm"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <FieldLabel>Service Name</FieldLabel>
                <Input
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="final"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <FieldLabel>Railway TCP Host</FieldLabel>
                <Input
                  required
                  value={serverAddr}
                  onChange={(e) => setServerAddr(e.target.value)}
                  placeholder="monorail.proxy.rlwy.net"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <FieldLabel>Railway TCP Port</FieldLabel>
                <Input
                  required
                  type="number"
                  min={1}
                  max={65535}
                  value={serverPort}
                  onChange={(e) => setServerPort(e.target.value)}
                  placeholder="45678"
                />
              </div>
              <div className="col-span-2">
                <FieldLabel>FRP Token (optional)</FieldLabel>
                <Input
                  type="password"
                  value={frpToken}
                  onChange={(e) => setFrpToken(e.target.value)}
                  placeholder="Leave empty to auto-generate"
                />
              </div>
              <div className="col-span-2">
                <Button type="submit" variant="secondary" className="w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  Add Manual Slot
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Slot Pool */}
      <Card className="mt-5 overflow-hidden">
        <CardHeader title={`Slot Pool (${slots.length})`} />

        {!slots.length ? (
          <EmptyState
            icon={<Server className="h-4 w-4" />}
            title="No tunnel slots yet"
            description="Deploy a slot using Railway CLI or add a manual slot above."
          />
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80 md:hidden">
              {slots.map((s) => (
                <div key={s.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {s.project_name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {s.account_label || "manual"} • {s.service_name}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>

                  {s.server_addr && s.server_port && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                      <code className="break-all text-xs text-zinc-800 dark:text-zinc-200">
                        {s.server_addr}:{s.server_port}
                      </code>
                      <CopyButton
                        text={`ssh user@${s.server_addr} -p ${s.server_port}`}
                        label="Copy SSH"
                      />
                    </div>
                  )}

                  {s.last_error && (
                    <div className="break-words rounded-lg border border-rose-500/20 bg-rose-500/5 px-2.5 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
                      {s.last_error}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {s.account_label && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runSlotAction(s.id, "refresh")}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Refresh TCP
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => runSlotAction(s.id, "redeploy")}
                        >
                          <Rocket className="h-3.5 w-3.5" />
                          Redeploy
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={inspectingId === s.id}
                          onClick={() => inspectSlot(s)}
                        >
                          <Terminal className="h-3.5 w-3.5" />
                          {inspectingId === s.id ? "Loading..." : "Inspect"}
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => runSlotAction(s.id, "free")}
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      Free
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => runSlotAction(s.id, "delete")}
                    >
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
                    <th className="px-4 py-2.5 font-medium">Project</th>
                    <th className="px-4 py-2.5 font-medium">Account</th>
                    <th className="px-4 py-2.5 font-medium">Public Endpoint</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Error</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                  {slots.map((s) => (
                    <tr key={s.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {s.project_name}
                        </div>
                        <div className="text-[11px] text-zinc-400">{s.service_name}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {s.account_label || "manual"}
                      </td>
                      <td className="px-4 py-3">
                        {s.server_addr && s.server_port ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="rounded bg-zinc-100 px-2 py-1 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                              {s.server_addr}:{s.server_port}
                            </code>
                            <CopyButton
                              text={`ssh user@${s.server_addr} -p ${s.server_port}`}
                              label="SSH"
                            />
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td
                        className="max-w-xs truncate px-4 py-3 text-rose-600 dark:text-rose-300"
                        title={s.last_error || ""}
                      >
                        {s.last_error || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {s.account_label && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => runSlotAction(s.id, "refresh")}
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Refresh TCP
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={inspectingId === s.id}
                                onClick={() => inspectSlot(s)}
                              >
                                <Terminal className="h-3.5 w-3.5" />
                                {inspectingId === s.id ? "..." : "Inspect"}
                              </Button>
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => runSlotAction(s.id, "free")}
                          >
                            <Unlock className="h-3.5 w-3.5" />
                            Free
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => runSlotAction(s.id, "delete")}
                          >
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

      {inspectData && (
        <Card className="mt-5">
          <CardHeader
            title={`Railway Slot Diagnostics: ${inspectData.project_name}`}
            description={`Project ID: ${inspectData.project_id || "unknown"}`}
            action={
              <Button variant="ghost" size="sm" onClick={() => setInspectData(null)}>
                <X className="h-4 w-4" />
              </Button>
            }
          />
          <CardContent className="space-y-4">
            <div>
              <FieldLabel>TCP Proxies</FieldLabel>
              <pre className="w-full max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-zinc-200 bg-zinc-950 p-3 text-[11px] text-zinc-200 dark:border-zinc-800">
                {inspectData.tcp_proxies}
              </pre>
            </div>
            <div>
              <FieldLabel>Deployments</FieldLabel>
              <pre className="w-full max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-zinc-200 bg-zinc-950 p-3 text-[11px] text-zinc-200 dark:border-zinc-800">
                {inspectData.deployments}
              </pre>
            </div>
            <div>
              <FieldLabel>Container Logs</FieldLabel>
              <pre className="max-h-72 w-full max-w-full overflow-auto whitespace-pre-wrap break-all rounded-xl border border-zinc-200 bg-zinc-950 p-3 text-[11px] text-emerald-300 dark:border-zinc-800">
                {inspectData.logs}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </AdminShell>
  );
}
