"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Timeline, type EvidenceKind, type TimelineEvent } from "../ds";
import { api, when } from "../kit";
import type { ChangeRequest } from "../types";
import type { EvidenceClass } from "@/lib/v2/home-core.mts";

// Home, second section (LIM-2472 ruling 9b5b870f): "Since you last looked". What changed since this person's last visit
// on this device, built only from reads that already respect what they may see: the change requests on goals they can
// read (created, decided, launched, withdrawn), each readable goal's versions, and when each app they can see last read
// the goals. Each line carries its source: a person's action as Align recorded it, Align itself, or an app's goal read
// as its evidence class. Nothing here says what an agent did with a goal.
//
// The last visit is kept per workspace and person in this browser only (localStorage), so the wording always says "on
// this device". The baseline for this tab is held in sessionStorage, so a reload or a trip to a review and back keeps
// the same list instead of emptying it. With no earlier visit on this device, it says what the list will show rather
// than inventing a history. Storage can be blocked: every access is guarded, and blocked storage reads as a first visit.

export interface SinceGoal {
  id: string;
  title: string;
}
export interface SinceApp {
  id: string;
  name: string;
  last_read_at: string | null;
  evidence_class: EvidenceClass;
}

const EV: Record<EvidenceClass, EvidenceKind> = { delivery_receipt: "receipt", agent_reported: "reported", not_observed: "unobserved" };
const SHOWN = 8;
const MAX_GOALS = 24;
const key = (ws: string, me: string) => `align.lastVisit:${ws}:${me}`;

function read(store: () => Storage, k: string): string | null {
  try {
    return store().getItem(k);
  } catch {
    return null;
  }
}
function write(store: () => Storage, k: string, v: string) {
  try {
    store().setItem(k, v);
  } catch {
    /* storage blocked: the next visit reads as a first one */
  }
}

/** This tab's baseline: the visit before this one on this device ("none" for a first visit), fixed for the tab's life;
 *  the stored last visit moves to now. null until read after mount, so the server and first client render agree. */
function useLastVisit(ws: string, me: string): { ready: boolean; since: string | null } {
  const [v, setV] = useState<{ ready: boolean; since: string | null }>({ ready: false, since: null });
  useEffect(() => {
    const k = key(ws, me);
    let base = read(() => sessionStorage, k);
    if (base === null) {
      base = read(() => localStorage, k) ?? "none";
      write(() => sessionStorage, k, base);
    }
    write(() => localStorage, k, new Date().toISOString());
    const t = setTimeout(() => setV({ ready: true, since: base === "none" || Number.isNaN(Date.parse(base)) ? null : base }), 0);
    return () => clearTimeout(t);
  }, [ws, me]);
  return v;
}

type Versions = Map<string, { version: number; created_at: string }[]>;

/** Each readable goal's versions (GET …/goals/:id, newest first), for versions saved since the last visit. */
function useVersions(ws: string, goals: SinceGoal[] | null, on: boolean): Versions | null {
  const [v, setV] = useState<Versions | null>(null);
  const ids = goals?.slice(0, MAX_GOALS).map((g) => g.id).join(",") ?? null;
  useEffect(() => {
    if (!on || ids === null) return;
    let live = true;
    Promise.all(
      ids
        .split(",")
        .filter(Boolean)
        .map((id) =>
          api<{ versions?: { version: number; created_at: string }[] }>(`/api/v2/workspaces/${ws}/goals/${id}`).then(
            (d) => [id, d.versions ?? []] as const,
            () => [id, null] as const,
          ),
        ),
    ).then((rows) => {
      if (!live) return;
      const m: Versions = new Map();
      for (const [id, vs] of rows) if (vs) m.set(id, vs);
      setV(m);
    });
    return () => {
      live = false;
    };
  }, [ws, ids, on]);
  return v;
}

const after = (iso: string | null | undefined, since: string) => !!iso && iso > since;
const same = (a: string | null, b: string | null) => !!a && !!b && Math.abs(Date.parse(a) - Date.parse(b)) < 2000;

export default function Since({
  ws,
  me,
  changes,
  goals,
  apps,
  onReview,
}: {
  ws: string;
  me: string;
  /** Every change request the person can read (GET …/change-requests, all groups), or null when that read failed. */
  changes: ChangeRequest[] | null;
  /** The goals on the Home (GET …/home → goals), or null when that read failed. */
  goals: SinceGoal[] | null;
  /** The apps the person can see (GET …/home → apps.items), or null when that read failed. */
  apps: SinceApp[] | null;
  /** Opens a change request in the review drawer; without it a line links to the request's record. */
  onReview?: (goal: string, id: string) => void;
}) {
  const visit = useLastVisit(ws, me);
  const since = visit.since;
  const versions = useVersions(ws, goals, !!since);
  const [all, setAll] = useState(false);

  const events = useMemo(() => {
    if (!since) return [];
    const who = (p: { id: string; name: string } | null | undefined, fallback: string) => (p ? (p.id === me ? "You" : p.name) : fallback);
    const out: TimelineEvent[] = [];
    const object = (cr: ChangeRequest): ReactNode =>
      onReview ? (
        <button type="button" className="text-left text-(--accent-text) hover:underline" onClick={() => onReview(cr.goal.id, cr.id)} data-since-open={cr.id}>
          {cr.goal.title}
        </button>
      ) : (
        <Link href={`/app/w/${ws}/record?cr=${cr.id}`} className="text-(--accent-text) hover:underline">
          {cr.goal.title}
        </Link>
      );
    const theirs = (cr: ChangeRequest) => (cr.requester.id === me ? "your" : `${cr.requester.name}'s`);
    const launched = new Set<string>();
    for (const cr of changes ?? []) {
      const person = { kind: "person" as const };
      if (after(cr.created_at, since))
        out.push({ id: `${cr.id}:asked`, who: who(cr.requester, "Someone"), what: "asked to change the goal", when: cr.created_at, object: object(cr), source: person });
      const bothAtOnce = cr.launch === "launched" && same(cr.decided_at, cr.launch_decided_at);
      if (cr.decided_at && after(cr.decided_at, since)) {
        if (cr.state === "rejected") out.push({ id: `${cr.id}:declined`, who: who(cr.rejected_by, "An approver"), what: `declined ${theirs(cr)} request`, when: cr.decided_at, object: object(cr), source: person });
        else if (cr.approved_by)
          out.push({
            id: `${cr.id}:approved`,
            who: who(cr.approved_by, "An approver"),
            what: bothAtOnce ? `approved ${theirs(cr)} request and launched v${cr.version}` : `approved ${theirs(cr)} request`,
            when: cr.decided_at,
            object: object(cr),
            source: person,
          });
      }
      if (cr.launch === "launched" && cr.version !== null) launched.add(`${cr.goal.id}:${cr.version}`);
      if (cr.launch_decided_at && after(cr.launch_decided_at, since) && !bothAtOnce) {
        if (cr.launch === "launched")
          out.push({ id: `${cr.id}:launched`, who: who(cr.launch_decided_by, "A launcher"), what: `launched v${cr.version}`, when: cr.launch_decided_at, object: object(cr), source: person });
        else if (cr.launch === "not_yet")
          out.push({ id: `${cr.id}:not_yet`, who: who(cr.launch_decided_by, "A launcher"), what: "chose not to launch it yet", when: cr.launch_decided_at, object: object(cr), source: person });
      }
      if (cr.state === "withdrawn" && after(cr.updated_at, since))
        out.push({ id: `${cr.id}:withdrawn`, who: who(cr.requester, "The requester"), what: "withdrew the request", when: cr.updated_at, object: object(cr), source: person });
      if (cr.state === "superseded" && after(cr.updated_at, since))
        out.push({ id: `${cr.id}:superseded`, who: "Align", what: "closed the request: the goal has a newer version", when: cr.updated_at, object: object(cr), source: { kind: "system" } });
    }
    for (const g of goals ?? []) {
      for (const v of versions?.get(g.id) ?? []) {
        // A launch writes its version too; that line is already above.
        if (!after(v.created_at, since) || launched.has(`${g.id}:${v.version}`)) continue;
        // The goal read doesn't say who saved a version, so the line doesn't either.
        out.push({
          id: `${g.id}:v${v.version}`,
          who: "Someone",
          what: v.version === 1 ? "created the goal" : `saved v${v.version}`,
          when: v.created_at,
          object: (
            <Link href={`/app/w/${ws}/goals/${g.id}`} className="text-(--accent-text) hover:underline">
              {g.title}
            </Link>
          ),
          source: { kind: "person", detail: "who not shown" },
        });
      }
    }
    for (const a of apps ?? []) {
      if (!after(a.last_read_at, since)) continue;
      out.push({ id: `app:${a.id}`, who: a.name, what: "read the goals", when: a.last_read_at!, source: { kind: EV[a.evidence_class], detail: "last read" } });
    }
    return out.sort((x, y) => y.when.localeCompare(x.when));
  }, [since, changes, goals, versions, apps, me, ws, onReview]);

  const reading = !!since && goals !== null && versions === null;
  const missing = [changes === null && "change requests", goals === null && "goals", apps === null && "connected apps"].filter(Boolean) as string[];
  const shown = all ? events : events.slice(0, SHOWN);

  return (
    <section aria-labelledby="since-title" className="flex min-w-0 flex-col gap-3" data-since={!visit.ready || reading ? "reading" : since ? events.length : "first"}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="since-title" className="text-[16px] font-semibold text-(--text-1)">
          Since you last looked
        </h2>
        {since && <p className="text-[13px] text-(--text-3)">Since your last visit on this device, {when(since)}</p>}
      </div>
      {!visit.ready ? null : !since ? (
        <p className="rounded-(--radius-m) border border-dashed border-(--line-strong) px-4 py-3 text-[14px] text-(--text-2)" data-since-first>
          This is your first visit on this device, so there is nothing to compare with yet. From your next visit, this lists what changed in between: requests made, decided, launched or
          withdrawn on goals you can read, new goal versions, and when connected apps read the goals.
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-(--radius-m) border border-(--line) bg-(--bg-panel) px-4 py-3">
          {missing.length > 0 && <p className="text-[13px] text-(--text-2)">Align couldn&apos;t read the {missing.join(" or ")} just now, so this list may be missing changes.</p>}
          {/* Requests and app reads show at once; new goal versions join when their reads land. */}
          <Timeline events={shown} empty={<p className="text-[14px] text-(--text-2)">{reading ? "Reading what changed…" : "Nothing changed on what you can see since then."}</p>} />
          {reading && events.length > 0 && <p className="text-[13px] text-(--text-3)">Still reading new goal versions.</p>}
          {events.length > SHOWN && (
            <button type="button" onClick={() => setAll((x) => !x)} className="inline-flex min-h-[40px] w-fit items-center text-[14px] font-medium text-(--accent-text) hover:underline max-sm:min-h-[44px]" aria-expanded={all}>
              {all ? "Show fewer" : `Show all ${events.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
