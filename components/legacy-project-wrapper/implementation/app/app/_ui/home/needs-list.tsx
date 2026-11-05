"use client";
import { useMemo, useState } from "react";
import { EvidenceLabel, NeedAction, NeedList, NeedRow, Segmented } from "../ds";
import { useApi } from "../kit";
import type { Alignment, ChangeRequest } from "../types";
import { buildNeeds, inPhase, KIND_WORDS, RANK_NOTE, type AppLite, type AskLite, type EvidenceCounts, type Need, type NeedPhase } from "./needs";

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
  const m = Math.max(1, Math.floor(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Evidence counts as labelled chips; Self-reported (a person's link) as its own plain chip until EvidenceLabel has it. */
export function EvidenceChips({ e }: { e: EvidenceCounts }) {
  return (
    <>
      {e.receipt > 0 && <EvidenceLabel kind="receipt" detail={e.receipt > 1 ? String(e.receipt) : undefined} size="s" />}
      {e.agent_reported > 0 && <EvidenceLabel kind="reported" detail={String(e.agent_reported)} size="s" />}
      {e.not_observed > 0 && <EvidenceLabel kind="unobserved" size="s" />}
      {e.self_reported > 0 && (
        <span data-evidence="self-reported" className="inline-flex items-center gap-1 rounded-(--radius-s) border border-(--line-strong) px-1.5 py-0.5 text-[12px] text-(--text-2)">
          Self-reported <span className="font-mono">{e.self_reported}</span>
        </span>
      )}
    </>
  );
}

/** Where a row opens: a change request's review (`?review=<goal>.<id>`, on the page that mounts this list), else the tab
 *  that holds that kind. */
export function needHref(ws: string, n: Need, base = ""): string {
  if (n.review) return `${base}${n.review}`;
  const tab = n.kind === "team_ask" ? "asks" : n.kind === "alignment" ? "alignments" : n.kind === "app_behind" ? "apps" : "";
  return `/app/w/${ws}${tab ? `/${tab}` : ""}`;
}

export function NeedsList({ ws, me, selected, reviewBase = "" }: { ws: string; me: string; selected?: string | null; reviewBase?: string }) {
  const W = `/api/v2/workspaces/${ws}`;
  const cr = useApi<Groups<ChangeRequest>>(`${W}/change-requests`);
  const asks = useApi<{ asks: AskLite[] }>(`${W}/asks?state=open,accepted,done,declined`);
  const al = useApi<Groups<Alignment>>(`${W}/alignments`);
  const home = useApi<{ apps: { items: AppLite[] } | null }>(`${W}/home`);
  const [phase, setPhase] = useState<NeedPhase>("needs_you");
  const [q, setQ] = useState("");

  const loading = [cr, asks, al, home].some((r) => r.loading && !r.data && !r.error);
  const { rows, unknown } = useMemo(
    () =>
      buildNeeds({
        ws,
        me,
        crs: cr.data ? [...cr.data.waiting_on_me, ...cr.data.mine, ...cr.data.others] : null,
        asks: asks.data?.asks ?? null,
        alignments: al.data ? [...al.data.waiting_on_me, ...al.data.mine, ...al.data.others] : null,
        apps: home.data?.apps?.items ?? null,
      }),
    [ws, me, cr.data, asks.data, al.data, home.data],
  );
  const counts = Object.fromEntries(PHASES.map((p) => [p.value, inPhase(rows, p.value).length])) as Record<NeedPhase, number>;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inPhase(rows, phase).filter((n) => !needle || [n.goal?.title, n.cause, n.quote, n.who, KIND_WORDS[n.kind]].join(" ").toLowerCase().includes(needle));
  }, [rows, phase, q]);

  return (
    <section aria-labelledby="needs-h" data-needs className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="needs-h" className="text-[18px] font-semibold text-(--text-1)">
          Needs you
        </h2>
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <Segmented label="Show" hideLabel size="s" options={PHASES.map((p) => ({ value: p.value, label: `${p.label} ${loading ? "" : counts[p.value]}`.trim() }))} value={phase} onChange={setPhase} />
          <label className="flex min-w-[200px] flex-1">
            <span className="sr-only">Search what needs you</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search goal, person, words"
              className="min-h-[36px] w-full rounded-(--radius-s) border border-(--edge) bg-(--bg-inset) px-3 text-[14px] text-(--text-1) placeholder:text-(--text-3) max-sm:min-h-[44px]"
            />
          </label>
        </div>
      </div>
      {unknown.length > 0 && !loading && (
        <p role="status" className="rounded-(--radius-s) border border-(--st-retry)/50 bg-(--st-retry-soft) px-3 py-2 text-[13px] text-(--text-1)">
          Align couldn&apos;t read the {unknown.join(", ")} just now, so whether {unknown.length === 1 ? "it adds" : "they add"} anything here is unknown. Reload to try again.
        </p>
      )}
      {loading ? (
        <p className="text-[14px] text-(--text-2)">Reading what needs you…</p>
      ) : (
        <NeedList
          rankNote={RANK_NOTE}
          empty={q ? `Nothing here mentions "${q}".` : phase === "needs_you" ? "Nothing needs you." : phase === "waiting_on_others" ? "Nothing you're part of is waiting on someone else." : "Nothing decided yet."}
        >
          {shown.map((n) => (
            <NeedRow
              key={n.key}
              kind={KIND_WORDS[n.kind]}
              tone={n.tone}
              title={n.goal?.title ?? n.cause}
              sub={n.goal ? (n.who ? `${n.cause} · ${n.who}` : n.cause) : (n.who ?? undefined)}
              waited={n.since ? waited(n.since.at) : undefined}
              evidence={<EvidenceChips e={n.evidence} />}
              action={n.action ? <NeedAction href={needHref(ws, n, reviewBase)}>{n.action.label}</NeedAction> : undefined}
              href={needHref(ws, n, reviewBase)}
              selected={!!selected && n.key === selected}
            />
          ))}
        </NeedList>
      )}
    </section>
  );
}
