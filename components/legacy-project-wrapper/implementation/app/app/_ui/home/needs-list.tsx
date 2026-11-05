"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EvidenceLabel, EvidenceSummary, hasEvidence, NeedAction, NeedList, NeedRow, Segmented, type Delivery } from "../ds";
import { api, useApi } from "../kit";
import type { Alignment, ChangeRequest, Goal } from "../types";
import { buildNeeds, inPhase, KIND_WORDS, latestLaunches, rankNote, REQ_GOALS_MAX, SENT_GOALS_MAX, type AppLite, type AskLite, type EvidenceCounts, type Need, type NeedPhase, type NeedsInput, type RequestLite } from "./needs";

// LIM-2472 Home, section 1: the "Needs you" list (direction LIM-2472 9b5b870f). Four cookie reads, the model in needs.ts,
// and the foundation's NeedList / NeedRow / NeedAction. Filters: Needs you (default), Waiting on others, Done; search over
// what the reads returned. Rows carry only outlined actions; the one filled action lives in the review a row opens. A
// read that failed is named as unknown above the list, never shown as "nothing".

type Groups<T> = { waiting_on_me: T[]; mine: T[]; others: T[] };

const PHASES: { value: NeedPhase; label: string }[] = [
  { value: "needs_you", label: "Needs you" },
  { value: "waiting_on_others", label: "Waiting on others" },
  { value: "done", label: "Done" },
];

/** How long a row has waited, from its `since` time. */
export function waited(iso: string | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Evidence counts as labelled chips, one per class present. */
export function EvidenceChips({ e }: { e: EvidenceCounts }) {
  return (
    <>
      {e.receipt > 0 && <EvidenceLabel kind="receipt" detail={e.receipt > 1 ? String(e.receipt) : undefined} size="s" />}
      {e.agent_reported > 0 && <EvidenceLabel kind="reported" detail={String(e.agent_reported)} size="s" />}
      {e.not_observed > 0 && <EvidenceLabel kind="unobserved" size="s" />}
      {e.self_reported > 0 && <EvidenceLabel kind="self" detail={String(e.self_reported)} size="s" />}
    </>
  );
}

/** Where a row opens: a change request's review (`?review=<goal>.<id>`, on the page that mounts this list), else the tab
 *  that holds that kind. */
export function needHref(ws: string, n: Need, base = ""): string {
  if (n.review) return `${base}${n.review}`;
  if (n.kind === "agent_declined" && n.goal) return `/app/w/${ws}/goals/${n.goal.id}#agents-on-goal`;
  const tab = n.kind === "team_ask" ? "asks" : n.kind === "alignment" ? "alignments" : n.kind === "app_behind" ? "apps" : "";
  return `/app/w/${ws}${tab ? `/${tab}` : ""}`;
}

/** REQ: the requests to agents on up to REQ_GOALS_MAX active goals this person reads, their own goals first, read in
 *  parallel. `unchecked` counts the active goals past the cap; `groups` is null when the goals couldn't be read. A goal
 *  whose requests read fails is counted as unchecked too. */
function useRequestsToAgents(W: string, me: string, goals: Goal[] | null, failed: boolean) {
  const [state, setState] = useState<{ key: string; groups: NonNullable<NeedsInput["requests"]>; unchecked: number } | null>(null);
  const list = useMemo(
    () => (goals ? goals.filter((g) => g.status === "active").sort((a, b) => Number(b.owner.id === me) - Number(a.owner.id === me) || a.id.localeCompare(b.id)) : null),
    [goals, me],
  );
  const key = list ? list.map((g) => g.id).join(",") : null;
  useEffect(() => {
    if (!list || key === null) return;
    let live = true;
    const pick = list.slice(0, REQ_GOALS_MAX);
    void Promise.all(pick.map((g) => api<{ requests: RequestLite[] }>(`${W}/goals/${g.id}/requests`).then((r) => ({ goal: { id: g.id, title: g.title }, requests: r.requests }), () => null))).then((res) => {
      if (!live) return;
      const ok = res.filter((x): x is NonNullable<typeof x> => !!x);
      setState({ key, groups: ok, unchecked: list.length - pick.length + (res.length - ok.length) });
    });
    return () => {
      live = false;
    };
  }, [W, list, key]);
  if (failed) return { groups: null, unchecked: 0, loading: false };
  const ready = state && state.key === key;
  return { groups: ready ? state.groups : undefined, unchecked: ready ? state.unchecked : 0, loading: !ready };
}

/** The value read's delivery fields (ds/evidence-facts.mts Delivery): sessions with receipts, and apps sent the version. */
type ValueLite = Delivery;

/** SENT: for the latest launch on up to SENT_GOALS_MAX goals (newest first), the value read's list of apps Align sent
 *  that version. `values` keeps each read for the rows' evidence summaries, so a row and the review never disagree.
 *  A read that fails, and every launch past the cap, counts as unsent-unchecked. */
function useSends(W: string, crs: ChangeRequest[] | null, failed: boolean) {
  const launches = useMemo(() => (crs ? latestLaunches(crs) : null), [crs]);
  const key = launches ? launches.map((c) => `${c.id}:${c.version}`).join(",") : null;
  const [state, setState] = useState<{ key: string; sends: NonNullable<NeedsInput["sends"]>; values: Map<string, ValueLite>; unchecked: number } | null>(null);
  useEffect(() => {
    if (!launches || key === null) return;
    let live = true;
    const pick = launches.slice(0, SENT_GOALS_MAX);
    void Promise.all(pick.map((c) => api<ValueLite>(`${W}/goals/${c.goal.id}/change-requests/${c.id}/value`).then((v) => ({ c, v }), () => null))).then((res) => {
      if (!live) return;
      const ok = res.filter((x): x is NonNullable<typeof x> => !!x);
      setState({
        key,
        sends: ok.map(({ c, v }) => ({ goal: { id: c.goal.id, title: c.goal.title }, cr: c.id, version: c.version!, launched_at: c.launch_decided_at!, apps: v.apps?.items ?? [], current_version: c.goal.version })),
        values: new Map(ok.map(({ c, v }) => [c.id, v])),
        unchecked: launches.length - pick.length + (res.length - ok.length),
      });
    });
    return () => {
      live = false;
    };
  }, [W, launches, key]);
  if (failed) return { sends: null, values: new Map<string, ValueLite>(), unchecked: 0, loading: false };
  const ready = state && state.key === key;
  return { sends: ready ? state.sends : undefined, values: ready ? state.values : new Map<string, ValueLite>(), unchecked: ready ? state.unchecked : 0, loading: !ready };
}

/** Search shows only when a phase has more rows than this. */
const SEARCH_FROM = 8;

export function NeedsList({ ws, me, selected, reviewBase = "", heading = true, onCount }: { ws: string; me: string; selected?: string | null; reviewBase?: string; heading?: boolean; onCount?: (n: number | null) => void }) {
  const W = `/api/v2/workspaces/${ws}`;
  const cr = useApi<Groups<ChangeRequest>>(`${W}/change-requests`);
  const asks = useApi<{ asks: AskLite[] }>(`${W}/asks?state=open,accepted,done,declined`);
  const al = useApi<Groups<Alignment>>(`${W}/alignments`);
  const home = useApi<{ apps: { items: AppLite[] } | null }>(`${W}/home`);
  const goals = useApi<{ goals: Goal[] }>(`${W}/goals`);
  const reqs = useRequestsToAgents(W, me, goals.data?.goals ?? null, !!goals.error);
  const crList = useMemo(() => (cr.data ? [...cr.data.waiting_on_me, ...cr.data.mine, ...cr.data.others] : null), [cr.data]);
  const sent = useSends(W, crList, !!cr.error);
  const [phase, setPhase] = useState<NeedPhase>("needs_you");
  const [q, setQ] = useState("");

  const loading = [cr, asks, al, home].some((r) => r.loading && !r.data && !r.error) || reqs.loading || sent.loading;
  const { rows, unknown, notices } = useMemo(
    () =>
      buildNeeds({
        ws,
        me,
        crs: crList,
        asks: asks.data?.asks ?? null,
        alignments: al.data ? [...al.data.waiting_on_me, ...al.data.mine, ...al.data.others] : null,
        apps: home.data?.apps?.items ?? null,
        requests: reqs.groups,
        sends: sent.sends,
      }),
    [ws, me, crList, asks.data, al.data, home.data, reqs.groups, sent.sends],
  );
  const counts = Object.fromEntries(PHASES.map((p) => [p.value, inPhase(rows, p.value).length])) as Record<NeedPhase, number>;
  // Local delta (integration): for the page's heading. Needs-you rows only; null while reading, and when a read failed
  // and the rest found nothing (zero isn't known then).
  useEffect(() => {
    onCount?.(loading || (unknown.length > 0 && counts.needs_you === 0) ? null : counts.needs_you);
  }, [onCount, loading, unknown.length, counts.needs_you]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inPhase(rows, phase).filter((n) => !needle || [n.goal?.title, n.cause, n.quote, n.who, KIND_WORDS[n.kind]].join(" ").toLowerCase().includes(needle));
  }, [rows, phase, q]);

  // Every read refused or failed (a signed-in non-member gets 404 on all of them): say so, never "Nothing needs you".
  const unreadable = !loading && cr.error !== null && asks.error !== null && al.error !== null && home.error !== null;
  if (unreadable)
    return (
      <section aria-label="Needs you" data-needs="unreadable" className="flex min-w-0 flex-col gap-2">
        <p role="status" className="rounded-(--radius-m) border border-(--line) bg-(--bg-panel) px-3 py-2.5 text-[14px] text-(--text-2)">
          Align couldn&apos;t read this workspace for you, so what needs you here is unknown. If you aren&apos;t a member, ask a workspace owner for an invite.
        </p>
      </section>
    );

  return (
    <section aria-labelledby={heading ? "needs-h" : undefined} aria-label={heading ? undefined : "Needs you"} data-needs="list" className="@container/needs flex min-w-0 flex-col gap-2">
      {heading && (
        <h2 id="needs-h" className="text-[18px] font-semibold text-(--text-1)">
          Needs you
        </h2>
      )}
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <Segmented
          label="Show"
          hideLabel
          size="s"
          options={PHASES.map((p) => ({ value: p.value, label: loading ? p.label : `${p.label} ${counts[p.value]}` }))}
          value={phase}
          onChange={(v) => {
            setPhase(v);
            setQ("");
          }}
        />
        {!loading && counts[phase] > SEARCH_FROM && (
          <label className="flex min-w-[200px] flex-1 sm:max-w-[320px]">
            <span className="sr-only">Search what needs you</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="min-h-[36px] w-full rounded-(--radius-s) border border-(--edge) bg-(--bg-inset) px-3 text-[14px] text-(--text-1) placeholder:text-(--text-3) max-sm:min-h-[44px]"
            />
          </label>
        )}
      </div>
      {unknown.length > 0 && !loading && (
        <p role="status" className="rounded-(--radius-s) border border-(--st-retry)/50 bg-(--st-retry-soft) px-3 py-2 text-[13px] text-(--text-1)">
          Align couldn&apos;t read the {unknown.join(", ")} just now, so whether {unknown.length === 1 ? "it adds" : "they add"} anything here is unknown. Reload to try again.
        </p>
      )}
      {loading ? (
        <p className="text-[14px] text-(--text-2)" data-needs-loading>
          {sent.loading && !reqs.loading ? "Checking what Align sent…" : "Reading what needs you…"}
        </p>
      ) : (
        <div className="min-w-0 [&>div>p:first-child]:hidden">
        {shown.length > 1 && (
          <details className="mb-1.5 px-1 text-[12px] text-(--text-3)" data-rank-note>
            <summary className="inline-flex min-h-[44px] cursor-pointer items-center">Ranked by kind, oldest first. How it&apos;s ranked</summary>
            <p className="pb-1">{rankNote(reqs.unchecked, sent.unchecked)}</p>
          </details>
        )}
        <NeedList
          rankNote={rankNote(reqs.unchecked, sent.unchecked)}
          empty={q ? `Nothing here mentions "${q}".` : phase === "needs_you" ? "Nothing needs you." : phase === "waiting_on_others" ? "Nothing you're part of is waiting on someone else." : "Nothing decided yet."}
        >
          {shown.map((n) => (
            <NeedRow
              key={n.key}
              kind={KIND_WORDS[n.kind]}
              tone={n.tone}
              title={n.goal?.title ?? n.cause}
              sub={n.goal ? (n.who ? `${n.cause} · ${n.who}` : n.cause) : (n.who ?? undefined)}
              waited={n.since ? waited(n.since.at) : "time not recorded"}
              evidence={
                n.kind === "decide" && n.phase === "needs_you" && n.cr && !hasEvidence(n.cr) ? (
                  <span className="text-[12px] text-(--text-3)">No evidence attached</span>
                ) : n.cr ? (
                  // The shared summary, from the same value read the review uses; none for a request not launched.
                  <EvidenceSummary ws={ws} cr={n.cr} variant="inline" max={2} value={n.cr.launch === "launched" ? sent.values.get(n.cr.id) : null} />
                ) : (
                  <EvidenceChips e={n.evidence} />
                )
              }
              action={n.action ? <NeedAction href={needHref(ws, n, reviewBase)}>{n.action.label}</NeedAction> : undefined}
              href={needHref(ws, n, reviewBase)}
              selected={!!selected && n.key === selected}
            />
          ))}
        </NeedList>
        </div>
      )}
      {!loading && notices.length > 0 && (
        <p data-needs-notice className="px-1 text-[12px] text-(--text-3)">
          Align has recorded no goal read from {notices[0]!.app.name}
          {notices[0]!.connected_by.id === me ? "" : ` (connected by ${notices[0]!.connected_by.name})`}
          {notices.length > 1 ? ` or ${notices.length - 1} other app${notices.length === 2 ? "" : "s"}` : ""}.{" "}
          <Link href={`/app/w/${ws}/apps`} className="text-(--text-2) underline underline-offset-4 hover:text-(--text-1)">
            See apps
          </Link>
        </p>
      )}
    </section>
  );
}
