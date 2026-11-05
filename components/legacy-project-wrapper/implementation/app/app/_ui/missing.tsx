"use client";
import Link from "next/link";
import { Card, Shell } from "./kit";
import type { Me } from "./server";

/** A workspace page for someone who isn't in that workspace: it doesn't exist, was deleted, or they were never in it or
 *  were removed. The API answers 404 for all of these alike, and so does this page: no tabs, nothing to reload. */
export function NotInWorkspace({ me }: { me: Me }) {
  return (
    <Shell me={me}>
      <Card>
        <h1 className="mb-2 text-[22px] font-semibold text-(--text-1)" data-not-in-workspace>
          This workspace doesn&apos;t exist or you&apos;re not in it
        </h1>
        <p className="mb-3 text-[15px] text-(--text-2)">It may have been deleted, or you may have been removed from it. Ask a workspace owner for an invite if you should be in it.</p>
        <Link href="/app" className="font-medium text-(--accent-text) underline">
          Go to your workspaces
        </Link>
      </Card>
    </Shell>
  );
}
