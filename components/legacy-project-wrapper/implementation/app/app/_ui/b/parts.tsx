"use client";
import type { ReactNode } from "react";
import { StatusPill } from "../ds";
import { when } from "../kit";
import type { ChangeRequest } from "../types";
import { crStatus, nameList, versions, waitsOn } from "./model";
import { Who } from "./shell";

// The facts of a request the desk's drawer and the decision page show beside the shared ReviewBody: state, who it
// waits on, who asked, who approves, and the launched and approved versions, all from the change-request read.

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
