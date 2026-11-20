const STYLES: Record<string, string> = {
  free: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  active: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  busy: "border-cyan-500/30 bg-cyan-500/15 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300",
  deploying: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  tcp_pending: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  failed: "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  disabled: "border-slate-400/40 bg-slate-200/70 text-slate-600 dark:border-slate-600/40 dark:bg-slate-700/30 dark:text-slate-400",
  closed: "border-slate-400/40 bg-slate-200/70 text-slate-600 dark:border-slate-600/40 dark:bg-slate-700/30 dark:text-slate-400",
  expired: "border-orange-500/30 bg-orange-500/15 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
  offline: "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

export function StatusBadge({ status }: { status: string }) {
  const cls =
    STYLES[status] ||
    "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}
