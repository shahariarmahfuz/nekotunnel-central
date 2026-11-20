"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Cloud,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Radio,
  Server,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeProvider";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/slots", label: "Tunnel Slots", icon: Server },
  { href: "/admin/accounts", label: "Railway CLI Accounts", icon: Cloud },
  { href: "/admin/users", label: "User Tokens", icon: KeyRound },
  { href: "/admin/sessions", label: "Live Sessions", icon: Activity },
];

export function AdminShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/me", { credentials: "same-origin" })
      .then((res) => {
        if (!active) return;
        if (!res.ok) {
          router.replace("/");
        } else {
          setCheckedAuth(true);
        }
      })
      .catch(() => {
        if (active) router.replace("/");
      });
    return () => {
      active = false;
    };
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    router.replace("/");
  };

  if (!checkedAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#070b14]">
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-emerald-500 dark:bg-emerald-400" />
          Verifying admin session...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#070b14] dark:text-slate-100 lg:flex">
      {/* Mobile Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800/80 dark:bg-[#0b1120] lg:hidden">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <Radio className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <span>NekoTunnel</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg border border-slate-300 p-1.5 text-slate-700 dark:border-slate-800 dark:text-slate-300"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={`${
          mobileOpen ? "block" : "hidden"
        } w-full shrink-0 border-b border-slate-200 bg-white dark:border-slate-800/80 dark:bg-[#0b1120] lg:flex lg:min-h-screen lg:w-64 lg:flex-col lg:border-b-0 lg:border-r`}
      >
        <div className="hidden items-center justify-between border-b border-slate-200 px-5 py-5 dark:border-slate-800/80 lg:flex">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
              <Radio className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                NekoTunnel
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Rust + Next.js Central
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-800/80">
          <div className="hidden items-center justify-between px-2 py-1 lg:flex">
            <span className="text-xs text-slate-500 dark:text-slate-400">Theme</span>
            <ThemeToggle />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-300"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
          <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800/80 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
