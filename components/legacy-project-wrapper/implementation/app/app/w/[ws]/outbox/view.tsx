"use client";

import Link from "next/link";
import { useState } from "react";
import type { OutboxItem } from "@/lib/v2/transfer-preview";
import { Shell, when } from "../../../_ui/kit";
import { PAGE_H1 } from "../../../_ui/page-title";
import type { Me } from "../../../_ui/server";
import { Btn, Note } from "../sessions/parts";

type Decision = "once" | "always" | "no";

const DECIDED: Record<Decision, string> = {
  once: "Allowed once. Only this exact request can be sent, once.",
  always: "Allowed for this goal. Later requests like this are sent without asking, and each shows on your receipt.",
  no: "Not sent. The agent was told no and kept working.",
};

/** Show invisible characters so the person sees exactly what would be sent (as in the founder's mock). */
const visible = (s: string) => s.replace(/[​‌‍⁠﻿]/g, "·");

export default function Outbox({ me, ws, items }: { me: Me; ws: string; items: OutboxItem[] }) {
  const [decided, setDecided] = useState<Record<string, Decision>>({});
  const open = items.filter((i) => !decided[i.id]).length;
  return (
    <Shell me={me} ws={ws} tab="Sessions">
      <p role="note" className="mb-4 rounded-(--radius-s) bg-(--bg-inset) p-3 text-[14px] text-(--text-2)">
        Preview with stand-in data. Nothing here is sent or saved.
      </p>
      <h1 className={`${PAGE_H1} mb-2`}>Outbox · {open} waiting</h1>
      <p className="mb-4 text-[15px] text-(--text-2)">
        Agents keep working. Nothing here leaves until you decide, or a rule you set covers it. Agents can ask; only you can approve.
      </p>
      {items.length === 0 && <Note>Nothing is waiting for you.</Note>}
      <ul className="min-w-0 divide-y divide-(--line)">
        {items.map((item) => {
          const choice = decided[item.id];
          return (
            <li key={item.id} className="min-w-0 py-4 [overflow-wrap:anywhere]">
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-[14px] text-(--text-2)">On the goal “{item.goal}”. Expires <time dateTime={item.expiresAt} title={item.expiresAt}>{when(item.expiresAt)}</time>.</p>
              {item.lines.length > 0 && (
                <ul className="my-2 list-disc pl-5 text-[15px]">
                  {item.lines.map((line) => <li key={line}>{line}</li>)}
                </ul>
              )}
              {item.quote !== undefined && (
                <figure className="my-2">
                  <figcaption className="mb-1 text-[14px] text-(--text-2)">Exactly what would be shared, invisible characters shown as ·</figcaption>
                  <blockquote className="whitespace-pre-wrap rounded-(--radius-s) bg-(--bg-inset) p-3">{visible(item.quote)}</blockquote>
                </figure>
              )}
              <p className="text-[14px]">To: {item.recipient.label}</p>
              {item.redaction && <p className="text-[14px]">{item.redaction}</p>}
              {item.authorsWords && <p className="mt-1 text-[14px] text-(--text-2)">Your words, so only you decide, whatever the workspace allows.</p>}
              {choice ? (
                <p role="status" className="mt-3 text-[14px]">{DECIDED[choice]}</p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Decide: ${item.title}`}>
                  <Btn onClick={() => setDecided((d) => ({ ...d, [item.id]: "once" }))}>Allow once</Btn>
                  {item.canAlways && <Btn onClick={() => setDecided((d) => ({ ...d, [item.id]: "always" }))}>Always for this goal</Btn>}
                  <Btn kind="danger" onClick={() => setDecided((d) => ({ ...d, [item.id]: "no" }))}>Not this</Btn>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-3">
        {Object.keys(decided).length > 0 && <Btn onClick={() => setDecided({})}>Reset outbox</Btn>}
        <Link href={`/app/w/${ws}/receipt`} className="inline-block py-2 text-(--accent-text) underline">See the receipt</Link>
      </div>
    </Shell>
  );
}
