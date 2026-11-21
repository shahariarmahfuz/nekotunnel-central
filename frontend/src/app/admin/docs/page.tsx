"use client";

import { AdminShell } from "@/components/AdminShell";
import { DocsGuide } from "@/components/DocsGuide";

export default function AdminDocsPage() {
  return (
    <AdminShell
      title="Docs & User Guide"
      subtitle="Setup walkthrough, CLI reference, and troubleshooting"
    >
      <DocsGuide mode="admin" />
    </AdminShell>
  );
}
