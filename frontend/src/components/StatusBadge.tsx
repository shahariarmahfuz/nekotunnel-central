const STYLES: Record<string, string> = {
  free: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  busy: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  deploying: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  tcp_pending: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  disabled: "border-slate-600/40 bg-slate-700/30 text-slate-400",
  closed: "border-slate-600/40 bg-slate-700/30 text-slate-400",
  expired: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  offline: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

export function StatusBadge({ status }: { status: string }) {
  const cls =
    STYLES[status] || "border-slate-700 bg-slate-800 text-slate-300";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}
