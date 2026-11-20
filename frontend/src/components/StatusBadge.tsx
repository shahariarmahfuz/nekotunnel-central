const DOT_COLORS: Record<string, string> = {
  free: "bg-emerald-500",
  active: "bg-emerald-500",
  busy: "bg-sky-500",
  deploying: "bg-amber-500 animate-pulse",
  tcp_pending: "bg-amber-500",
  failed: "bg-rose-500",
  offline: "bg-rose-500",
  expired: "bg-orange-500",
  disabled: "bg-zinc-400 dark:bg-zinc-500",
  closed: "bg-zinc-400 dark:bg-zinc-500",
};

const PILL_STYLES: Record<string, string> = {
  free: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  active: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  busy: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  deploying: "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  tcp_pending: "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  failed: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  offline: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  expired: "border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  disabled: "border-zinc-300/60 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
  closed: "border-zinc-300/60 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
};

export function StatusBadge({ status }: { status: string }) {
  const dot = DOT_COLORS[status] || "bg-zinc-400";
  const pill =
    PILL_STYLES[status] ||
    "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-tight whitespace-nowrap ${pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}
