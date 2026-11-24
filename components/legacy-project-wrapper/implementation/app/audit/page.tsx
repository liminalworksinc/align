import type { Metadata } from "next";
import { AuditFlow } from "./audit-flow";

// /audit: the agent audit, release A (specs/align/agent-audit.md). Public, no sign-in (founder ruling 2026-11-24:
// anyone with the link). Listed exactly in proxy.ts HOSTED_ROUTES. Stores nothing.
export const metadata: Metadata = {
  title: "Agent audit · Liminal",
  description: "Paste your agent's last runs and get one change to try, backed by counts from your own runs.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="min-h-full bg-(--bg-page) text-(--text-1)">
      <div className="mx-auto flex max-w-[880px] flex-col gap-8 px-4 pt-8 pb-16 sm:px-6">
        <AuditFlow />
      </div>
    </main>
  );
}
