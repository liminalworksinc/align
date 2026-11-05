"use client";
import { useCallback, useEffect, useState } from "react";
import { Drawer, EmptyState, EvidenceLabel, EvidenceSummary, NeedAction, NeedList, NeedRow, StatusPill, type ReviewChoice } from "../../_ui/ds";
import GoalLines from "../../_ui/home/goal-lines";
import { buildNeeds, inPhase, KIND_WORDS, RANK_NOTE, type AskLite, type Need } from "../../_ui/home/needs";
import Since from "../../_ui/home/since";
import { Loading, Note, Shell, useApi } from "../../_ui/kit";
import type { Me } from "../../_ui/server";
import type { Alignment, AnySession, ChangeRequest, MySession } from "../../_ui/types";
import FirstRun, { seenApp } from "./first-run";
import { ReviewDrawer } from "./review-drawer";
import type { EvidenceClass, HomePerson } from "@/lib/v2/home-core.mts";

// Home (LIM-2472 direction, 2026-11-05), in this order: Needs you, one ranked list of what needs a human (_ui/home/needs.ts
// in NeedRow, its evidence from the one EvidenceSummary); Since you last looked (_ui/home/since.tsx); Goals, one line per
// goal (_ui/home/goal-lines.tsx). Sessions live on Work and apps on Apps. A change request opens in the review drawer over
// the Home, and closing it returns to the same picture. Only what Align knows is shown, each with its evidence class.
// Nothing says what an agent is doing, whether it follows the plan, or how far along it is.
//
// Reads: GET …/home (goals, apps), GET …/sessions (whether the person has connected anything), GET …/change-requests,
// GET …/asks and GET …/alignments (the list). Since and GoalLines make their own further reads.

interface HomeGoal {
  id: string;
  title: string;
  version: number;
  level: "company" | "team";
  team: { id: string; name: string } | null;
  owner: HomePerson;
  mine: boolean;
}
interface App {
  id: string;
  name: string;
  connected_by: HomePerson;
  approved_at: string;
  last_used_at: string | null;
  last_read_at: string | null;
  evidence_class: EvidenceClass;
}
interface HomeData {
  goals: HomeGoal[] | null;
  apps: { everyone: boolean; items: App[] } | null;
}
interface Groups {
  waiting_on_me: ChangeRequest[];
  mine: ChangeRequest[];
  others: ChangeRequest[];
}
const UNREAD: HomeData = { goals: null, apps: null };
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/** The review drawer's place in the URL (?review=<goal>.<id>), so Back, a reload and a shared link reopen it. */
function useReview(): [{ goal: string; id: string; choice?: ReviewChoice } | null, (r: { goal: string; id: string; choice?: ReviewChoice } | null) => void] {
  const [r, setR] = useState<{ goal: string; id: string; choice?: ReviewChoice } | null>(null);
  useEffect(() => {
    const read = () => {
      const v = new URLSearchParams(window.location.search).get("review");
      const [goal, id] = (v ?? "").split(".");
      setR(goal && id ? { goal, id } : null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const set = useCallback((next: { goal: string; id: string; choice?: ReviewChoice } | null) => {
    const u = new URL(window.location.href);
    if (next) u.searchParams.set("review", `${next.goal}.${next.id}`);
    else u.searchParams.delete("review");
    window.history[next ? "pushState" : "replaceState"](null, "", u);
    setR(next);
  }, []);
  return [r, set];
}

const primaryBtn =
  "inline-flex min-h-[40px] items-center justify-center rounded-(--radius-s) bg-(--accent) px-3.5 text-[14px] font-medium text-(--text-on-accent) hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus) max-sm:min-h-[44px]";
const outlineBtn =
  "inline-flex min-h-[40px] items-center justify-center rounded-(--radius-s) border border-(--line-strong) px-3.5 text-[14px] font-medium text-(--text-1) hover:bg-(--bg-raised) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus) max-sm:min-h-[44px]";

/** A row's evidence: the one renderer. A launched request reads its …/value when the row mounts; others have none. */
function NeedEvidence({ ws, cr }: { ws: string; cr: ChangeRequest | undefined }) {
  if (!cr) return null;
  return <EvidenceSummary ws={ws} cr={cr} variant="inline" max={2} value={cr.launch === "launched" ? undefined : null} />;
}
const waited = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
/** One row of the list: its action opens the review drawer for a change request, or the tab that holds the rest. */
function NeedItem({ r, ws, cr, onReview }: { r: Need; ws: string; cr: ChangeRequest | undefined; onReview: (r: Need) => void }) {
  const label = r.action?.label ?? "View";
  const tab = r.action?.opens ?? (r.kind === "team_ask" ? "asks" : r.kind === "alignment" ? "alignments" : "apps");
  return (
    <NeedRow
      kind={KIND_WORDS[r.kind]}
      tone={r.tone}
      title={r.goal?.title ?? r.quote ?? r.cause}
      sub={[r.cause, r.who].filter(Boolean).join(" · ")}
      waited={r.since ? (r.phase === "done" ? ago(r.since.at) : waited(r.since.at)) : undefined}
      evidence={<NeedEvidence ws={ws} cr={cr} />}
      action={r.review ? <NeedAction onClick={() => onReview(r)}>{label}</NeedAction> : <NeedAction href={`/app/w/${ws}/${tab}`}>{label}</NeedAction>}
    />
  );
}

/** A phase the list's filters will replace. Its rows mount only once it is opened, so their evidence reads wait too. */
function ClosedPhase({ title, id, rows, children }: { title: string; id: string; rows: number; children: () => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!rows) return null;
  return (
    <details id={id} data-needs={id} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="inline-flex min-h-[36px] cursor-pointer items-center text-[14px] text-(--text-2) max-sm:min-h-[44px]">
        {title} · {rows}
      </summary>
      {open && children()}
    </details>
  );
}

export default function Home({ me, ws }: { me: Me; ws: string }) {
  const d = useApi<HomeData>(`/api/v2/workspaces/${ws}/home`);
  const s = useApi<{ mine: MySession[]; all: AnySession[] | null }>(`/api/v2/workspaces/${ws}/sessions`);
  const c = useApi<Groups>(`/api/v2/workspaces/${ws}/change-requests`);
  const asks = useApi<{ asks: AskLite[] }>(`/api/v2/workspaces/${ws}/asks?state=open,accepted,done,declined`);
  const al = useApi<{ waiting_on_me: Alignment[]; mine: Alignment[]; others: Alignment[] }>(`/api/v2/workspaces/${ws}/alignments`);
  const [review, setReview] = useReview();
  const [connect, setConnect] = useState(false);
  const h = d.data ?? (d.error ? UNREAD : null);
  const reloadAll = useCallback(() => {
    d.reload();
    s.reload();
    c.reload();
    asks.reload();
    al.reload();
  }, [d, s, c, asks, al]);

  const allCrs = c.data ? [...c.data.waiting_on_me, ...c.data.mine, ...c.data.others] : [];
  const crById = new Map(allCrs.map((x) => [x.id, x]));
  const mine = s.data?.mine.filter((x) => x.state !== "stopped") ?? [];
  const mineKeys = new Set(mine.map((x) => x.session_key));
  const teammates = s.data?.all?.filter((x) => !mineKeys.has(x.session_key)) ?? null;

  // The list waits for its four reads; one that failed is null, which buildNeeds reports as unknown.
  const needsRead = !!h && !c.loading && !asks.loading && !al.loading;
  const needs = needsRead
    ? buildNeeds({ ws, me: me.id, crs: c.data ? allCrs : null, asks: asks.data?.asks ?? null, alignments: al.data ? [...al.data.waiting_on_me, ...al.data.mine, ...al.data.others] : null, apps: h?.apps?.items ?? null })
    : null;
  // Audit (Medium, Mini S3): app_behind is wrong across goals: last_read_at is one time per app, so a read of goal A can
  // hide goal B's row. Left out until Mini S1's rebuilt model lands; remove this line then.
  const rows = needs ? needs.rows.filter((r) => r.kind !== "app_behind") : [];
  const needsYou = inPhase(rows, "needs_you");
  const waitingOthers = inPhase(rows, "waiting_on_others");
  const done = inPhase(rows, "done");
  const apps = h?.apps ?? null;
  const readers = apps?.items.filter((a) => a.last_read_at).length ?? 0;
  /** The person has connected nothing here. Only an owner sees everyone's apps and sessions, so only for an owner does
   *  "no agent is sharing work here" hold for the whole workspace; anyone else is told what their role can't see. */
  const nothingOfMine = !!apps && !apps.items.some(seenApp) && s.data !== null && mine.length === 0 && !teammates?.length;
  const ownerView = !!apps?.everyone;
  const noAgents = nothingOfMine && ownerView;
  const open = (goal: string, id: string, choice?: ReviewChoice) => setReview({ goal, id, choice });

  const openNeed = (r: Need) => {
    const [goal, id] = (r.review ?? "").replace("?review=", "").split(".");
    open(goal, id, r.phase === "needs_you" && r.kind === "launch" ? "launch" : undefined);
  };

  return (
    <Shell me={me} ws={ws} tab="Home">
      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">Command center</p>
            <h1 tabIndex={-1} className="text-[24px] font-semibold leading-tight text-(--text-1)">
              The work, and what needs you
            </h1>
            {h && (
              <p className="mt-1 text-[14px] text-(--text-2)" data-home-summary>
                {needs ? (needs.unknown.length ? "What waits on you is partly unknown." : needsYou.length ? `${needsYou.length} need${needsYou.length === 1 ? "s" : ""} your judgment.` : "Nothing needs your judgment.") : ""}{" "}
                {s.data ? `You share ${mine.length} session${mine.length === 1 ? "" : "s"}` : "Your sessions are unknown"}
                {h.goals ? ` · ${h.goals.length} active goal${h.goals.length === 1 ? "" : "s"}` : ""}
                {apps ? (apps.items.length ? ` · ${readers} of ${apps.items.length} connected app${apps.items.length === 1 ? "" : "s"} read the goals.` : " · no connected apps.") : "."}
              </p>
            )}
          </div>
          {/* With nothing of theirs connected yet, the note below carries this action, so it appears once. */}
          {!nothingOfMine && (
            <button
              type="button"
              onClick={() => setConnect(true)}
              className="inline-flex min-h-[40px] items-center rounded-(--radius-s) border border-(--line-strong) px-3 text-[14px] text-(--text-1) hover:bg-(--bg-raised) max-sm:min-h-[44px]"
              data-connect-open
            >
              Connect an agent
            </button>
          )}
        </header>

        <section id="waiting" aria-label="Needs you" data-needs="needs_you" className="flex min-w-0 flex-col gap-2">
          {!needs ? (
            <Loading />
          ) : (
            <>
              {needsYou.length > 0 && <h2 className="text-[16px] font-semibold text-(--text-1)">Needs you · {needsYou.length}</h2>}
              {needs.unknown.length > 0 && <Note>Align couldn&apos;t read {needs.unknown.join(", ")} just now, so this list may be missing what they hold.</Note>}
              <NeedList rankNote={RANK_NOTE} empty={needs.unknown.length ? "Nothing else Align could read needs you." : undefined}>
                {needsYou.map((r) => (
                  <NeedItem key={r.key} r={r} ws={ws} cr={crById.get(r.key.slice(3))} onReview={openNeed} />
                ))}
              </NeedList>
              {/* Until the list's filters land, the other two phases stay reachable here. */}
              <ClosedPhase title="Waiting on others" id="others" rows={waitingOthers.length}>
                {() => (
                  <NeedList rankNote={RANK_NOTE}>
                    {waitingOthers.map((r) => (
                      <NeedItem key={r.key} r={r} ws={ws} cr={crById.get(r.key.slice(3))} onReview={openNeed} />
                    ))}
                  </NeedList>
                )}
              </ClosedPhase>
              <ClosedPhase title="Done" id="done" rows={done.length}>
                {() => (
                  <NeedList rankNote="Newest first.">
                    {done.map((r) => (
                      <NeedItem key={r.key} r={r} ws={ws} cr={crById.get(r.key.slice(3))} onReview={openNeed} />
                    ))}
                  </NeedList>
                )}
              </ClosedPhase>
            </>
          )}
        </section>

        {noAgents && (
          <EmptyState
            title="No agent is sharing work here yet"
            body="Align shows the work once an agent connects: which goal each session is bound to, which version Align sent it, and whether a receipt came back. Connect one agent to see your first goal read in about a minute."
            action={
              <button type="button" className={primaryBtn} onClick={() => setConnect(true)} data-connect-empty>
                Connect an agent
              </button>
            }
          />
        )}
        {nothingOfMine && !ownerView && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-m) border border-dashed border-(--line-strong) px-4 py-3" data-home-role-note>
            <p className="min-w-0 flex-1 basis-64 text-[14px] text-(--text-2)">
              You haven&apos;t connected an agent here. Other people&apos;s sessions and apps are shown to workspace owners only, so this Home shows the plan and what Align released, not their agents.
            </p>
            <button type="button" className={outlineBtn} onClick={() => setConnect(true)} data-connect-empty>
              Connect your agent
            </button>
          </div>
        )}

        {!h ? (
          <Loading />
        ) : (
          <>
            <Since ws={ws} me={me.id} changes={c.data ? allCrs : null} goals={h.goals} apps={h.apps?.items ?? null} onReview={(goal, id) => open(goal, id)} />
            <GoalLines ws={ws} me={me.id} goals={h.goals} changes={c.data ? allCrs : null} onReview={(goal, id) => open(goal, id)} />
          </>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-(--radius-m) border border-(--line) bg-(--bg-inset) px-4 py-2.5 text-[13px] text-(--text-2) [overflow-wrap:break-word]" data-three-states>
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">Read it as</span>
          <span className="flex items-center gap-2">
            <StatusPill kind="pending" size="s" /> waiting on a decision
          </span>
          <span className="flex items-center gap-2">
            <StatusPill kind="launched" size="s" /> Align released this version to agents
          </span>
          <span className="flex items-center gap-2">
            <EvidenceLabel kind="unobserved" size="s" /> Align has no record
          </span>
        </div>

        {/* The drawers break words only where needed, so a short label ("Close", "Esc") never splits at 320. */}
        <div className="[overflow-wrap:break-word]">
          {review && <ReviewDrawer key={`${review.id}:${review.choice ?? ""}`} ws={ws} goal={review.goal} id={review.id} me={me.id} choice={review.choice} onClose={() => setReview(null)} onChanged={reloadAll} />}
          <Drawer open={connect} onClose={() => setConnect(false)} title="Connect an agent" eyebrow="Get started">
            <FirstRun ws={ws} onSeen={reloadAll} always />
          </Drawer>
        </div>
      </div>
    </Shell>
  );
}
