"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReceiptRow } from "@/lib/v2/transfer-preview";
import { Shell, when } from "../../../_ui/kit";
import { PAGE_H1 } from "../../../_ui/page-title";
import type { Me } from "../../../_ui/server";
import { Btn, Note } from "../sessions/parts";

export default function Receipt({ me, ws, rows }: { me: Me; ws: string; rows: ReceiptRow[] }) {
  const [undone, setUndone] = useState<Record<string, true>>({});
  const vendor = rows.filter((r) => r.vendor).length;
  return (
    <Shell me={me} ws={ws} tab="Sessions">
      <p role="note" className="mb-4 rounded-(--radius-s) bg-(--bg-inset) p-3 text-[14px] text-(--text-2)">
        Preview with stand-in data. Nothing here is sent, saved or removed.
      </p>
      <h1 className={`${PAGE_H1} mb-2`}>What left your machines this week</h1>
      <p className="mb-2 text-[15px] text-(--text-2)">Every line names the person who allowed it. Undo removes it from everyone who could see it.</p>
      <p className="mb-4 text-[15px]">Sent to outside models this week: {vendor}</p>
      {rows.length === 0 && <Note>Nothing left any machine this week.</Note>}
      <ul className="min-w-0 divide-y divide-(--line)">
        {rows.map((row) => {
          const gone = !!undone[row.id];
          return (
            <li key={row.id} className="min-w-0 py-4 [overflow-wrap:anywhere]">
              <p className={gone ? "text-(--text-2) line-through" : "font-medium"}>{row.what}</p>
              <p className="my-1 text-[14px] text-(--text-2)">
                To {row.to}. Allowed by {row.allowedBy} ({row.how}), <time dateTime={row.when} title={row.when}>{when(row.when)}</time>.
              </p>
              {gone ? (
                <p role="status" className="text-[14px]">
                  {row.undo === "remove" ? "Removed for everyone who could see it." : "Future sends like this are off. This one was already sent and can’t be recalled."}
                </p>
              ) : (
                <Btn kind="danger" onClick={() => setUndone((u) => ({ ...u, [row.id]: true }))}>
                  {row.undo === "remove" ? "Undo" : "Stop future sends"}
                </Btn>
              )}
            </li>
          );
        })}
      </ul>
      <Link href={`/app/w/${ws}/outbox`} className="mt-4 inline-block py-2 text-(--accent-text) underline">Back to the outbox</Link>
    </Shell>
  );
}
