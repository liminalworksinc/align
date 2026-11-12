"use client";
import { PAGE_H1 } from "@/app/app/_ui/page-title";
import Link from "next/link";
import { Shell } from "./kit";
import { Panel } from "./ds";
import type { Me } from "./server";

/** A workspace page for someone who isn't in that workspace: it doesn't exist, was deleted, or they were never in it or
 *  were removed. The API answers 404 for all of these alike, and so does this page: no tabs, nothing to reload. */
export function NotInWorkspace({ me }: { me: Me }) {
  return (
    <Shell me={me}>
      <Panel className="mx-auto mt-6 max-w-[620px]">
        <h1 className={`${PAGE_H1} mb-2`} data-not-in-workspace>
          This workspace doesn&apos;t exist or you&apos;re not in it
        </h1>
        <p className="mb-3 text-[15px] text-(--text-2)">It may have been deleted, or you may have been removed from it. Ask a workspace owner for an invite if you should be in it.</p>
        <Link href="/app" className="inline-flex min-h-[44px] items-center font-medium text-(--accent-text) underline underline-offset-2">
          Go to your workspaces
        </Link>
      </Panel>
    </Shell>
  );
}
