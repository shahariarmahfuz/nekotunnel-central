"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({
  text,
  label,
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Fallback ignored if clipboard permission unavailable
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy: ${text}`}
      className={`inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-emerald-500/60 hover:bg-slate-50 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-emerald-500/50 dark:hover:bg-slate-800 dark:hover:text-emerald-300 ${className}`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 text-slate-400" />
          {label && <span>{label}</span>}
        </>
      )}
    </button>
  );
}
