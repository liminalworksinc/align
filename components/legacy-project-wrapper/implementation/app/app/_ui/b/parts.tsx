"use client";
import type { ReactNode } from "react";
import { EvidenceLabel, StatusPill } from "../ds";
import { KIND_WORD } from "../crparts";
import { changeLines } from "../decide";
import { when } from "../kit";
import type { ChangeRequest, Evidence } from "../types";
import { crStatus, nameList, versions, waitsOn } from "./model";
import { Who } from "./shell";

// Pieces the desk's drawer and the decision page share: the facts of a request, what it would change (the request's own
// words, decide.tsx changeLines), and its evidence links. A link is what a person or an agent says supports the change:
// never verified, labelled with who reported it.

export function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-3)">{k}</dt>
      <dd className="min-w-0 text-[14px] text-(--text-1)">{children}</dd>
    </div>
  );
}

export function Facts({ cr, me }: { cr: ChangeRequest; me: string }) {
  const s = crStatus(cr);
  const w = waitsOn(cr);
  const v = versions(cr);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      <Fact k="State">
        <StatusPill kind={s.kind} label={s.label} />
      </Fact>
      <Fact k="Waiting on">{w ? `${nameList(w.people, me)} (${w.for})` : "Nobody: it's decided"}</Fact>
      <Fact k="Asked by">
        <Who p={cr.requester} me={me} /> <span className="text-[12px] text-(--text-3)">{when(cr.created_at)}</span>
      </Fact>
      <Fact k="Approvers">{cr.approvers.length ? cr.approvers.map((p) => (p.id === me ? "You" : p.name)).join(", ") : "Nobody yet"}</Fact>
      <Fact k="Launched">{v.launched}</Fact>
      <Fact k="Approved">{v.approved}</Fact>
      {cr.approved_by && <Fact k="Approved by">{cr.approved_by.id === me ? "You" : cr.approved_by.name}</Fact>}
      {cr.rejected_by && <Fact k="Declined by">{cr.rejected_by.id === me ? "You" : cr.rejected_by.name}</Fact>}
      {cr.launch_decided_by && (
        <Fact k={cr.launch === "launched" ? "Launched by" : "Launch decided by"}>
          {cr.launch_decided_by.id === me ? "You" : cr.launch_decided_by.name} <span className="text-[12px] text-(--text-3)">{when(cr.launch_decided_at)}</span>
        </Fact>
      )}
    </dl>
  );
}

export function Reason({ cr }: { cr: ChangeRequest }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-3)">Why, in {cr.requester.name}&apos;s words</p>
      <blockquote className="border-l-2 border-(--line-strong) pl-3 text-[14px] text-(--text-1)">{cr.reason}</blockquote>
      {cr.rejection_reason && (
        <>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-3)">Reason for declining</p>
          <blockquote className="border-l-2 border-(--st-declined) pl-3 text-[14px] text-(--text-1)">{cr.rejection_reason}</blockquote>
        </>
      )}
      {cr.condition && (
        <>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-3)">Accept if</p>
          <blockquote className="border-l-2 border-(--between) pl-3 text-[14px] text-(--text-1)">
            {cr.condition.text}
            <span className="block text-[12px] text-(--text-3)">{cr.condition.acknowledged_by ? `Confirmed by ${cr.condition.acknowledged_by.name}` : "Not confirmed by the person asking yet"}</span>
          </blockquote>
        </>
      )}
    </div>
  );
}

export function WouldChange({ cr, titles }: { cr: ChangeRequest; titles: Map<string, string> }) {
  const lines = changeLines(cr, titles);
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-3)">What it would change, from the request</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-[14px] text-(--text-1)">
        {lines.length ? lines.map((l, i) => <li key={i}>{l}</li>) : <li>Nothing that differs from the goal now.</li>}
      </ul>
    </div>
  );
}

function host(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export function EvidenceList({ items, me }: { items: Evidence[]; me: string }) {
  if (!items.length)
    return <p className="text-[13px] text-(--text-2)">No evidence links on this revision. Approving without them is allowed, and the record says so.</p>;
  return (
    <ul className="flex flex-col divide-y divide-(--line)">
      {items.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-(--radius-s) border border-(--line-strong) px-1.5 py-0.5 font-mono text-[11px] text-(--text-2)">{KIND_WORD[e.kind]}</span>
            <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-[14px] text-(--accent-text) underline-offset-4 hover:underline">
              {e.label}
            </a>
            <span className="text-[12px] text-(--text-3)">{host(e.url)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-(--text-3)">
            {e.source === "agent" ? (
              <EvidenceLabel kind="reported" size="s" />
            ) : (
              <span className="rounded-(--radius-s) border border-(--line-strong) px-1.5 py-0.5 text-(--text-2)">Self-reported</span>
            )}
            <span>
              added by {e.added_by.id === me ? "you" : e.added_by.name}, {when(e.added_at)}. Align doesn&apos;t check what a link shows.
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The current revision's evidence links. */
export const currentEvidence = (cr: ChangeRequest) => cr.revisions.find((r) => r.revision === cr.revision)?.evidence ?? [];
