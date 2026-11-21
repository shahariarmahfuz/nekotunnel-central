"use client";

import Link from "next/link";
import { ArrowLeft, Radio } from "lucide-react";
import { DocsGuide } from "@/components/DocsGuide";
import { ThemeToggle } from "@/components/ThemeProvider";

export default function PublicDocsPage() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/85">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950">
              <Radio className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              NekoTunnel Docs
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <Link
              href="/"
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Admin Login</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
            User Guide &amp; CLI Documentation
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 sm:text-sm">
            Everything you need to install nekotunnel on your VM and forward any TCP port
          </p>
        </div>

        <DocsGuide mode="public" />
      </main>
    </div>
  );
}
