"use client";

import Link from "next/link";
import { useState } from "react";
import { receiptFrom, type OutboxItem } from "@/lib/v2/transfer-preview";
import { Shell } from "../../../_ui/kit";
import { PAGE_H1 } from "../../../_ui/page-title";
import type { Me } from "../../../_ui/server";
import { useDecisions } from "../outbox/decisions";
import { Btn, Note } from "../sessions/parts";

export default function Receipt({ me, ws, items }: { me: Me; ws: string; items: OutboxItem[] }) {
  const decisions = useDecisions(ws);
  const [undone, setUndone] = useState<Record<string, true>>({});
  const rows = receiptFrom(items, decisions, me.name);
  const vendor = rows.filter((r) => r.vendor && !undone[r.id]).length;
  return (
    <Shell me={me} ws={ws} tab="Sessions">
      <p role="note" className="mb-4 rounded-(--radius-s) bg-(--bg-inset) p-3 text-[14px] text-(--text-2)">
        Preview with stand-in data. Nothing here is sent, saved or removed.
      </p>
      <h1 className={`${PAGE_H1} mb-2`}>What left your machines this week</h1>
      <p className="mb-2 text-[15px] text-(--text-2)">Every line names the person who allowed it. Undo removes it from everyone who could see it.</p>
      <p className="mb-4 text-[15px]">Sent to outside models this week: {vendor}</p>
      {rows.length === 0 && <Note>Nothing left any machine. Allow something in the outbox to see it here.</Note>}
      <ul className="min-w-0 divide-y divide-(--line)">
        {rows.map((row) => {
          const gone = !!undone[row.id];
          return (
            <li key={row.id} className="min-w-0 py-4 [overflow-wrap:anywhere]">
              <p className={gone ? "text-(--text-2) line-through" : "font-medium"}>{row.what}</p>
              <p className="my-1 text-[14px] text-(--text-2)">To {row.to}. Allowed by {row.allowedBy} ({row.how}).</p>
              {gone ? (
                // A vendor send has already happened: undo stops future ones and says so (spec #117, honest undo).
                <p role="status" className="text-[14px]">
                  {row.vendor ? "Future sends like this are off. This one was already sent and can’t be recalled." : "Removed for everyone who could see it."}
                </p>
              ) : (
                <Btn kind="danger" onClick={() => setUndone((u) => ({ ...u, [row.id]: true }))}>Undo</Btn>
              )}
            </li>
          );
        })}
      </ul>
      <Link href={`/app/w/${ws}/outbox`} className="mt-4 inline-block py-2 text-(--accent-text) underline">Back to the outbox</Link>
    </Shell>
  );
}
