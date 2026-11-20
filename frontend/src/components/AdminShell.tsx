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
  Radio,
  Server,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeProvider";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview", shortLabel: "Home", icon: LayoutDashboard },
  { href: "/admin/slots", label: "Tunnel Slots", shortLabel: "Slots", icon: Server },
  { href: "/admin/accounts", label: "Railway CLI", shortLabel: "Railway", icon: Cloud },
  { href: "/admin/users", label: "User Tokens", shortLabel: "Tokens", icon: KeyRound },
  { href: "/admin/sessions", label: "Sessions", shortLabel: "Sessions", icon: Activity },
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
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex items-center gap-2.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="h-2 w-2 animate-ping rounded-full bg-zinc-900 dark:bg-zinc-200" />
          Loading workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 lg:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-zinc-200/80 lg:bg-white dark:lg:border-zinc-800/80 dark:lg:bg-zinc-950">
        <div className="flex h-14 items-center gap-2.5 border-b border-zinc-200/80 px-5 dark:border-zinc-800/80">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950">
            <Radio className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">NekoTunnel</span>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition ${
                  active
                    ? "bg-zinc-900 text-white shadow-2xs dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-zinc-200/80 p-3 dark:border-zinc-800/80">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Appearance</span>
            <ThemeToggle />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-zinc-600 transition hover:bg-rose-50 hover:text-rose-700 dark:text-zinc-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Wrapper */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Sticky Top Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200/80 bg-white/85 px-4 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/85 lg:hidden">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950">
              <Radio className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-semibold tracking-tight">NekoTunnel</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:text-rose-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-rose-300"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-24 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 sm:text-sm">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {actions}
              </div>
            )}
          </div>
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/90 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-950/95 lg:hidden"
      >
        <div className="grid grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  active
                    ? "text-zinc-900 dark:text-white"
                    : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "stroke-[2.2]" : ""}`} />
                <span>{item.shortLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
