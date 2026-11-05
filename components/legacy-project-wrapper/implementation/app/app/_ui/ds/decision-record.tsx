"use client";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useGoalTitles } from "../changes";
import type { ChangeRequest } from "../types";
import { Compare } from "./compare";
import { EmptyState } from "./empty-state";
import { EvidenceLabel } from "./evidence-label";
import { Panel } from "./panel";
import { ReviewActions, ReviewBody } from "./review";
import { useRead } from "./read";
import { auditEvents, changeRequestEvents, KIND_WORDS, type AuditRow, type Kind, type RecordEvent } from "./record-events";
import { Segmented } from "./segmented";
import { StatusPill, type StatusKind } from "./status-pill";
import { Timeline, type TimelineEvent, type TimelineSource } from "./timeline";

// The decision record as an inspectable timeline (LIM-2472 workstream S, item 1). Body only, no shell: A's and B's
// shells wrap it, and both link here (/app/w/<ws>/record, ?cr=<id> or ?goal=<id> to narrow it). Reads:
//  - GET …/change-requests (every member): the change requests on goals the reader can read, each with its revisions,
//    evidence, decision and launch decision;
//  - GET …/audit (workspace owners; a 403 for anyone else, said as such): the workspace's newest 200 audit rows.
// Only events Align recorded; the source of each is said as far as Align records it (record-events.ts).

const FIELD = "min-h-[36px] max-sm:min-h-[44px] rounded-(--radius-s) border border-(--edge) bg-(--bg-raised) px-2.5 text-[14px] text-(--text-1) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)";

const SUMMARY =
  "inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 text-[14px] font-medium text-(--accent-text) underline-offset-2 hover:underline max-sm:min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus) [&::-webkit-details-marker]:hidden before:content-['+'] before:inline-block before:w-3 before:font-mono group-open:before:content-['-']";

const TONE_STATUS: Partial<Record<NonNullable<RecordEvent["tone"]>, StatusKind>> = {
  pending: "pending",
  approved: "approved",
  launched: "launched",
  declined: "declined",
};

function source(e: RecordEvent): TimelineSource {
  if (e.source === "align") return { kind: "system" };
  if (e.source === "app") return { kind: "reported", detail: "connected app via MCP" };
  if (e.source === "device") return { kind: "reported", detail: "align CLI" };
  if (e.source === "unrecorded") return { kind: "person", detail: "source not recorded" };
  return { kind: "person" };
}

/** The card's detail, or null when there is none (the Timeline draws a box for any detail it gets). */
/** `openCompare`: the before/after tables start open (the workspace-wide record); closed when a ReviewBody for the same
 *  request is on the page, so its table isn't shown three times (open on click). */
function detail(e: RecordEvent, titleOf: (id: string) => string, openCompare: boolean): ReactNode {
  const parts: ReactNode[] = [];
  if (e.source === "unrecorded")
    parts.push(
      <p key="src" className="text-[13px] text-(--text-3)">
        Align recorded who, not how: this could have come from the browser, their device or their connected app.
      </p>,
    );
  if (e.quote)
    parts.push(
      <blockquote key="q" className="border-l-2 border-(--line-strong) pl-3 text-[14px] text-(--text-1) [overflow-wrap:anywhere]">
        {e.quote}
      </blockquote>,
    );
  if (e.link)
    parts.push(
      <p key="l" className="flex flex-wrap items-center gap-2 text-[14px]">
        {e.link.reported === "agent-reported" ? <EvidenceLabel kind="reported" size="s" /> : <span className="rounded-(--radius-s) border border-(--edge) px-1.5 text-[12px] leading-5 text-(--text-2)">Self-reported</span>}
        <a href={e.link.url} target="_blank" rel="noopener noreferrer" className="max-sm:inline-flex max-sm:min-h-[44px] max-sm:items-center text-(--accent-text) underline underline-offset-2 [overflow-wrap:anywhere]">
          {e.link.label || e.link.url}
        </a>
        <span className="text-[13px] text-(--text-3)">Align doesn&apos;t verify links.</span>
      </p>,
    );
  if (e.compare)
    parts.push(
      <details key="c" className="group" open={openCompare || undefined}>
        <summary className={SUMMARY}>
          {e.kind === "counter" ? "What this revision changed" : "What the plan was and what it would become"}
        </summary>
        <div className="mt-2">
          <Compare before={e.compare.before} after={e.compare.after} beforeLabel={e.compare.beforeLabel} afterLabel={e.compare.afterLabel} titleOf={titleOf} />
        </div>
      </details>,
    );
  if (e.kind === "decision" && e.cr?.state === "approved") {
    const cr = e.cr;
    parts.push(
      <details key="d" className="group" open={openCompare || undefined}>
        <summary className={SUMMARY}>What the plan was and what it became</summary>
        <div className="mt-2">
          <Compare before={cr.diff.before} after={cr.diff.after} hidden={cr.diff.hidden_depends_on ?? null} beforeLabel={`Version ${cr.base_version}`} afterLabel={cr.version ? `Version ${cr.version}` : "Approved"} titleOf={titleOf} />
        </div>
      </details>,
    );
    if (cr.launch === "pending" || cr.launch === "not_yet")
      parts.push(
        <p key="l" className="text-[13px] text-(--text-2)">
          Approval is not launch: {cr.launch === "not_yet" ? "a launcher decided not yet." : "the launch decision hasn't been made."}
        </p>,
      );
    if (cr.approved_without_evidence) parts.push(<p key="ne" className="text-[13px] text-(--text-2)">Approved without evidence.</p>);
  }
  return parts.length ? <div className="flex flex-col gap-2">{parts}</div> : null;
}

type Order = "newest" | "oldest";

export function DecisionRecord({ ws, me, goalId, crId }: { ws: string; me: string; goalId?: string; crId?: string }) {
  const crs = useRead<{ waiting_on_me: ChangeRequest[]; mine: ChangeRequest[]; others: ChangeRequest[] }>(`/api/v2/workspaces/${ws}/change-requests`);
  // Workspace owners only; anyone else gets a 403, which is shown as what it means, not as an error.
  const audit = useRead<{ audit: AuditRow[] }>(goalId || crId ? null : `/api/v2/workspaces/${ws}/audit`);
  const titles = useGoalTitles(ws);
  const titleOf = (id: string) => titles.get(id) ?? "A goal";
  const [actor, setActor] = useState("all");
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [order, setOrder] = useState<Order>("newest");

  const all = useMemo(() => {
    const list = crs.data ? [...crs.data.waiting_on_me, ...crs.data.mine, ...crs.data.others] : [];
    const scoped = list.filter((c) => (!crId || c.id === crId) && (!goalId || c.goal.id === goalId));
    const events = scoped.flatMap((c) => changeRequestEvents(ws, c));
    if (audit.data) events.push(...auditEvents(audit.data.audit, new Set(list.map((c) => c.id))));
    return events;
  }, [crs.data, audit.data, ws, crId, goalId]);

  const actors = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of all) m.set(e.actor?.id ?? "align", e.actor?.name ?? "Align");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const kinds = useMemo(() => [...new Set(all.map((e) => e.kind))], [all]);

  const shown = all
    .filter((e) => (actor === "all" || (e.actor?.id ?? "align") === actor) && (kind === "all" || e.kind === kind))
    .sort((a, b) => (order === "newest" ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)));

  const events: TimelineEvent[] = shown.map((e) => {
    const status = e.tone ? TONE_STATUS[e.tone] : undefined;
    return {
      id: e.id,
      who: e.actor ? (e.actor.id === me ? `${e.actor.name} (you)` : e.actor.name) : "Align",
      what: (
        <span className="inline-flex flex-wrap items-center gap-2">
          {e.what}
          {status && <StatusPill kind={status} size="s" />}
        </span>
      ),
      when: e.at,
      object: e.object.href ? (
        <Link href={e.object.href} className="max-sm:inline-flex max-sm:min-h-[44px] max-sm:items-center text-(--accent-text) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-(--focus)">
          {e.object.label}
        </Link>
      ) : (
        <span>
          {e.object.label}
          {e.object.id && (titles.get(e.object.id) ? <span className="text-(--text-1)"> {titles.get(e.object.id)}</span> : <span className="font-mono text-[12px] text-(--text-3)"> {e.object.id}</span>)}
        </span>
      ),
      source: source(e),
      detail: detail(e, titleOf, !crId),
    };
  });

  const scope = crId ? "this change request" : goalId ? "this goal" : "this workspace";
  const reviewing = crId && crs.data ? [...crs.data.waiting_on_me, ...crs.data.mine, ...crs.data.others].find((c) => c.id === crId) : undefined;
  const loading = crs.loading || (!goalId && !crId && audit.loading);

  return (
    <div data-surface="decision-record" className="flex min-w-0 flex-col gap-4">
      <Panel
        eyebrow="Decision record"
        title={crId ? "One change request, step by step" : goalId ? "Everything decided on this goal" : "Everything Align recorded here"}
        actions={
          (crId || goalId) && (
            <Link href={`/app/w/${ws}/record`} className="inline-flex min-h-[36px] items-center rounded-(--radius-s) border border-(--edge) px-3 text-[14px] text-(--text-1) max-sm:min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)">
              Whole workspace
            </Link>
          )
        }
      >
        <p className="max-w-prose text-[14px] text-(--text-2)">
          Who did what, when, to which object, and where it came from, as Align recorded it. Nothing here is inferred from what agents wrote.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-(--text-2)">
            Who
            <select className={FIELD} value={actor} onChange={(e) => setActor(e.target.value)}>
              <option value="all">Everyone ({all.length})</option>
              {actors.map(([id, name]) => (
                <option key={id} value={id}>
                  {id === me ? `${name} (you)` : name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-(--text-2)">
            What
            <select className={FIELD} value={kind} onChange={(e) => setKind(e.target.value as Kind | "all")}>
              <option value="all">Every kind</option>
              {(Object.keys(KIND_WORDS) as Kind[])
                .filter((k) => kinds.includes(k))
                .map((k) => (
                  <option key={k} value={k}>
                    {KIND_WORDS[k]}
                  </option>
                ))}
            </select>
          </label>
          <Segmented<Order>
            label="Order"
            size="s"
            options={[
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
            ]}
            value={order}
            onChange={setOrder}
          />
        </div>
      </Panel>

      {reviewing && (
        <Panel eyebrow="Review" title={`Change to ${reviewing.goal.title}`}>
          <div className="flex flex-col gap-4">
            <ReviewBody ws={ws} cr={reviewing} me={me} titleOf={titleOf} onDone={crs.reload} />
            <div className="border-t border-(--line) pt-3">
              <ReviewActions key={reviewing.id} ws={ws} cr={reviewing} me={me} onDone={crs.reload} compact />
            </div>
          </div>
        </Panel>
      )}
      {audit.status === 403 && (
        <p role="status" className="rounded-(--radius-m) border border-(--line) bg-(--bg-inset) px-4 py-2.5 text-[14px] text-(--text-2)">
          You see the change requests on goals you can read. The workspace&apos;s full audit log (invites, roles, devices, apps) is for workspace owners.
        </p>
      )}
      {audit.status !== 0 && audit.status !== 403 && audit.message && (
        <p role="alert" className="text-[14px] text-(--st-declined)">
          The audit log didn&apos;t load: {audit.message}
        </p>
      )}

      <Panel title={`${shown.length} ${shown.length === 1 ? "event" : "events"}`} eyebrow={scope}>
        {loading && <p className="text-[14px] text-(--text-2)">Loading the record…</p>}
        {crs.status !== 0 && <EmptyState title={crs.status === 404 ? "Not found" : "The record didn't load"} body={crs.message} />}
        {!loading && crs.status === 0 && crId && !reviewing && (
          <EmptyState title="No such request in this workspace" body="Align has no change request with this address here that you can read. It may be in another workspace, or on a goal you can't see." action={<Link href={`/app/w/${ws}/record`} className="text-(--accent-text) underline">Whole workspace record</Link>} />
        )}
        {!loading && crs.status === 0 && !(crId && !reviewing) && (
          <Timeline
            events={events}
            empty={
              <EmptyState
                title={all.length ? "No events match these filters" : "Nothing recorded yet"}
                body={all.length ? "Choose Everyone and Every kind to see the whole record." : `When someone proposes a change, decides one or launches it, it is recorded here with who did it and when. Nothing has happened on ${scope} yet.`}
              />
            }
          />
        )}
      </Panel>
      <p className="text-[12.5px] text-(--text-3)">
        &quot;Recorded in Align&quot; is an action a person took that Align recorded. Agent reported is what a connected app or the align CLI sent. Evidence links are as their author gave them; Align doesn&apos;t verify them.
      </p>
    </div>
  );
}
