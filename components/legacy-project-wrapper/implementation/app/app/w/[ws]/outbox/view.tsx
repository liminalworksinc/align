"use client";

import Link from "next/link";
import { AGENT_APPROVE_ATTEMPT, GENERIC_CONFIRM, type Decision, type OutboxItem } from "@/lib/v2/transfer-preview";
import { Shell, when } from "../../../_ui/kit";
import { PAGE_H1 } from "../../../_ui/page-title";
import type { Me } from "../../../_ui/server";
import { Btn, Note } from "../sessions/parts";
import { saveDecisions, useDecisions } from "./decisions";

/** Show invisible characters so the person sees exactly what would be sent (as in the founder's mock). */
const visible = (s: string) => s.replace(/[​‌‍⁠﻿]/g, "·");

export default function Outbox({ me, ws, items }: { me: Me; ws: string; items: OutboxItem[] }) {
  const decided = useDecisions(ws);
  const decide = (next: Record<string, Decision>) => saveDecisions(ws, next);
  const open = items.filter((i) => !decided[i.id]).length;
  return (
    <Shell me={me} ws={ws} tab="Sessions">
      <p role="note" className="mb-4 rounded-(--radius-s) bg-(--bg-inset) p-3 text-[14px] text-(--text-2)">
        Preview with stand-in data. Nothing here is sent or saved.
      </p>
      <h1 className={`${PAGE_H1} mb-2`}>Outbox · {open} waiting</h1>
      <p className="mb-4 text-[15px] text-(--text-2)">
        Agents keep working. Nothing here leaves until you decide, or a rule you set covers it.
      </p>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0">
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
                      <figcaption className="mb-1 text-[14px] text-(--text-2)">Exactly what Sean would see, invisible characters shown as ·</figcaption>
                      <blockquote className="whitespace-pre-wrap rounded-(--radius-s) bg-(--bg-inset) p-3">{visible(item.quote)}</blockquote>
                    </figure>
                  )}
                  <p className="text-[14px]">To: {item.recipient}</p>
                  {item.redaction && <p className="text-[14px]">{item.redaction}</p>}
                  {item.note && <p className="mt-1 text-[14px] text-(--text-2)">{item.note}</p>}
                  {choice ? (
                    <p role="status" className="mt-3 text-[14px]">{item.confirm[choice] ?? GENERIC_CONFIRM[choice]}</p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Decide: ${item.title}`}>
                      <Btn onClick={() => decide({ ...decided, [item.id]: "once" })}>Allow once</Btn>
                      {item.canAlways && <Btn onClick={() => decide({ ...decided, [item.id]: "always" })}>Always for this goal</Btn>}
                      <Btn kind="danger" onClick={() => decide({ ...decided, [item.id]: "no" })}>Not this</Btn>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            {Object.keys(decided).length > 0 && <Btn onClick={() => decide({})}>Reset outbox</Btn>}
            <Link href={`/app/w/${ws}/receipt`} className="inline-block py-2 text-(--accent-text) underline">See the receipt</Link>
          </div>
        </div>
        <aside aria-label="What the agent sees" className="min-w-0 self-start rounded-(--radius-s) bg-(--bg-inset) p-4">
          <h2 className="mb-1 text-[15px] font-medium">What the agent sees</h2>
          <p className="mb-3 text-[14px] text-(--text-2)">
            It can only ask. Every decision happens in Align, signed in as a person. The server turns each yes into a one-time pass, used up on send.
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[13px] leading-6 [overflow-wrap:anywhere]">
            {items.map((item) => [item.terminal.command, ...item.terminal[decided[item.id] ?? "pending"]].join("\n")).join("\n\n")}
            {`\n\n${AGENT_APPROVE_ATTEMPT.command}\n${AGENT_APPROVE_ATTEMPT.answer}`}
          </pre>
        </aside>
      </div>
    </Shell>
  );
}
