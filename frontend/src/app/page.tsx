"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Lock, Radio, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeProvider";

export default function LoginPage() {
  const router = useRouter();
  const [adminToken, setAdminToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/admin/me", { credentials: "same-origin" })
      .then((res) => {
        if (res.ok) {
          router.replace("/admin");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ admin_token: adminToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Invalid admin token");
        return;
      }
      router.replace("/admin");
    } catch {
      setError("Could not reach internal backend");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 dark:bg-[#070b14]">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 dark:border-slate-800 dark:bg-[#0b1120] dark:shadow-2xl dark:shadow-black/60">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
            <Radio className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              NekoTunnel Central
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Railway TCP Tunnel Control Plane
            </p>
          </div>
        </div>

        <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
          Enter your{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-emerald-700 dark:bg-slate-800 dark:text-emerald-300">
            ADMIN_TOKEN
          </code>{" "}
          to manage Railway CLI accounts, tunnel slots, and active SSH tunnels.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Admin Token
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="password"
                required
                autoFocus
                disabled={checking || loading}
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder="Enter ADMIN_TOKEN"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900/90 dark:text-white dark:placeholder-slate-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={checking || loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{loading ? "Signing in..." : "Sign in to Control Panel"}</span>
          </button>
        </form>

        <div className="mt-6 border-t border-slate-200 pt-4 text-center text-xs text-slate-500 dark:border-slate-800/80">
          Next.js public gateway • Internal Rust Axum backend
        </div>
      </div>
    </div>
  );
}
