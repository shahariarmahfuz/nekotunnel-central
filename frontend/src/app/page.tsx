"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, BookOpen, Lock, Radio } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeProvider";
import { Button, Input, Notice } from "@/components/ui/primitives";

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
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-950">
            <Radio className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            NekoTunnel Central
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Sign in with your control plane admin token
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900/60">
          {error && (
            <Notice tone="error" className="mb-4">
              {error}
            </Notice>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Admin Token
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  type="password"
                  required
                  autoFocus
                  disabled={checking || loading}
                  value={adminToken}
                  onChange={(e) => setAdminToken(e.target.value)}
                  placeholder="Enter ADMIN_TOKEN"
                  className="pl-9"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={checking || loading}
              className="w-full"
            >
              <span>{loading ? "Signing in..." : "Continue"}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/docs"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Read User Guide &amp; CLI Docs</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
