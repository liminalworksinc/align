"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, Btn, Err, useAction, useApi, when } from "./kit";
import type { ChangeRequest } from "./types";
import { ESTIMATE_WORDS, estimateSaid, VALUE_NOTE_MAX, VALUE_QUESTION, type EstimateId } from "@/lib/v2/value-core.mts";
import { launchWords } from "@/lib/v2/launch-words";
import { diffWords } from "@/lib/v2/change-words.mts";
import { receiptEvidence } from "@/lib/v2/home-core.mts";
import { EvidencePill } from "./evidence";

// The decision value card on an approved change request (PORT-004): the accepted change, who approved it, the goals
// and teams it affects, whether agents have the new version, the spans Align measured, the value reports (an estimate
// with an optional note, one per person) and the follow-up link. Everything comes from GET .../value
// (lib/v2/value.ts); the measured spans come from the request's own timestamps and receipts, apart from the estimates
// people give. changes.tsx renders it only for an approved request. "viewed" is recorded once the card is at least half
// on screen (or fills half the screen), once per page, workspace and person; the server keeps one per person anyway.
// Once launched, "Connected AI apps" names the apps Align sent the new version to when they read the goals (main #56):
// a delivery receipt of what Align sent, never what the app did with it.

interface Report {
  id: string;
  person: { id: string; name: string };
  estimate: EstimateId;
  note: string | null;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
}

interface ValueView {
  change_request_id: string;
  goal: { id: string; title: string; version: number | null; base_version: number; team: { id: string; name: string } | null };
  launch: "pending" | "not_yet" | "launched";
  launched_at: string | null;
  diff: Record<string, { before: unknown; after: unknown; hidden?: { before: number; after: number } | null }>;
  approved_by: { id: string; name: string };
  decided_at: string;
  created_at: string;
  approved_without_evidence: boolean | null;
  affected: { parents: { id: string; title: string }[]; dependents: { id: string; title: string }[] };
  delivery: { sessions: number; received: number; applied: number } | null;
  apps?: { everyone: boolean; items: { id: string; name: string; connected_by: { id: string; name: string }; sent_at: string }[] } | null;
  measured: { proposal_to_decision: string; decision_to_launch: string | null; decision_to_first_applied: string | null };
  my_report: Report | null;
  reports: Report[];
  sees_all_reports: boolean;
  follow_up_url: string | null;
}

const PITCH = "Align keeps teams and their agents on one approved plan as priorities change.";
const FOLLOW_UP = "Want to evaluate Align on a real workflow? Ask for a follow-up; it can end with an optional, non-binding letter of intent.";
const viewedSent = new Set<string>(); // per page: workspace and person, so a second card on the page sends nothing
// A view is the card's top seen for a second (LIM-2445, #38): the card is taller than the column it scrolls in, so a
// person who scrolls to it sees its heading and first rows, not half of it. The top TOP_PX (heading, the accepted change
// and who approved on a desktop; the heading and the change's first lines on a phone) must be mostly on screen
// (TOP_SEEN_RATIO) for VIEW_DWELL_MS; a shorter glance is not a view.
const TOP_PX = 240;
const TOP_SEEN_RATIO = 0.75;
const VIEW_DWELL_MS = 1000;

function Row({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-t border-zinc-200 pt-3" data-value-row={testId}>
      <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-zinc-500">{label}</span>
      <div className="min-w-0 text-[15px] leading-snug text-zinc-900">{children}</div>
    </div>
  );
}


function post(ws: string, cr: ChangeRequest, body: Record<string, unknown>) {
  return api<{ recorded: boolean; report: Report | null }>(`/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}/value`, { body });
}

export function ValueCard({ ws, cr, me, titles }: { ws: string; cr: ChangeRequest; me: string; titles?: Map<string, string> }) {
  // LIM-2472 defect 4: the card and its question are for the person who approved the request (cr.approved_by, already on
  // the page); everyone else reads the decision record without them, and nothing is fetched or recorded for them.
  const decider = cr.approved_by?.id === me;
  const v = useApi<ValueView>(decider ? `/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}/value` : null);
  const top = useRef<HTMLDivElement>(null);
  const loaded = !!v.data;

  useEffect(() => {
    const key = `${ws}:${me}`;
    const el = top.current;
    if (!loaded || viewedSent.has(key) || !el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        // "Seen": most of the top region on screen (clipped by the scroll column as well as the window).
        if (!e.isIntersecting || e.intersectionRatio < TOP_SEEN_RATIO) return stopTimer();
        if (timer !== undefined) return;
        timer = setTimeout(() => {
          timer = undefined;
          io.disconnect();
          if (viewedSent.has(key)) return;
          viewedSent.add(key);
          void post(ws, cr, { action: "viewed" }).catch(() => viewedSent.delete(key));
        }, VIEW_DWELL_MS);
      },
      { threshold: [0, 0.25, 0.5, TOP_SEEN_RATIO, 1] },
    );
    io.observe(el);
    return () => {
      stopTimer();
      io.disconnect();
    };
  }, [loaded, ws, me, cr]);

  if (!decider) return null;
  if (!v.data) return v.error ? <Err>{v.error}</Err> : null;
  const d = v.data;
  // Each changed field in words ("Arms shipped target 500 → 600"), the same lines as the MCP decision record.
  const changed = diffWords(d.diff ?? {}, { title: (id) => titles?.get(id) ?? "a goal" });
  const dl = d.delivery;
  const others = d.reports.filter((r) => r.person.id !== me);

  return (
    <section aria-label="What this decision gave you" data-value-card={d.change_request_id} className="relative mt-3 flex flex-col gap-3 rounded-[12px] border border-violet-200 bg-violet-50/40 p-4">
      <div ref={top} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0" style={{ height: TOP_PX }} />
      <h3 className="text-[17px] font-semibold text-zinc-900">What this decision gave you</h3>

      <Row label="Accepted change">
        {changed.length ? (
          <ul className="flex flex-col gap-0.5">
            {changed.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : (
          "No field changes are shown to you."
        )}
        {d.goal.version !== null ? (
          <span className="text-zinc-600">It became version {d.goal.version} of “{d.goal.title}”.</span>
        ) : (
          <span className="text-zinc-600">{launchWords(d.launch, d.goal.base_version, null)}.</span>
        )}
      </Row>

      <Row label="Who approved">
        {d.approved_by.id === me ? "You" : d.approved_by.name}, {when(d.decided_at)}
        {d.approved_without_evidence ? " (approved without evidence)" : ""}
      </Row>

      <Row label="Affected goals and teams">
        <ul className="flex flex-col gap-0.5">
          <li>
            {d.goal.title}
            {d.goal.team ? ` (team ${d.goal.team.name})` : ""}
          </li>
          {d.affected.parents.length > 0 && <li>Contributes to: {d.affected.parents.map((g) => g.title).join(", ")}</li>}
          {d.affected.dependents.length > 0 && <li>Goals that build on it: {d.affected.dependents.map((g) => g.title).join(", ")}</li>}
        </ul>
      </Row>

      {/* The checklist's §E2: the delivery line carries one evidence class, a delivery receipt only when a session's
          machine sent a received or applied receipt for the launched version. */}
      <Row label="Agents on the new version" testId="delivery">
        <div className="mb-1">
          <EvidencePill c={receiptEvidence(d.launch === "launched" && dl ? dl.received : 0)} />
        </div>
        {d.launch !== "launched" ? (
          `Not launched yet: agents stay on v${d.goal.base_version} until launch.`
        ) : !dl || dl.sessions === 0 ? (
          "No shared sessions work toward this goal yet."
        ) : (
          <ul className="flex flex-col gap-0.5">
            <li>
              {dl.applied} of {dl.sessions} shared {dl.sessions === 1 ? "session has" : "sessions have"} it in context
            </li>
            {dl.received - dl.applied > 0 && <li>{dl.received - dl.applied} received it but haven&apos;t used it yet</li>}
            {dl.sessions - dl.received > 0 && <li>{dl.sessions - dl.received} not reached yet</li>}
          </ul>
        )}
      </Row>

      {/* main #56: the connected apps Align sent the launched version to (an MCP goal read served it), one evidence
          class: a delivery receipt when Align sent it to any app the reader can see, else not observed. */}
      {d.apps && d.goal.version !== null && (
        <Row label="Connected AI apps" testId="apps">
          <div className="mb-1">
            <EvidencePill c={d.apps.items.length ? "delivery_receipt" : "not_observed"} />
          </div>
          {d.apps.items.length === 0 ? (
            `Align hasn't sent version ${d.goal.version} to ${d.apps.everyone ? "a connected app" : "an app you connected"} yet.`
          ) : (
            <>
              <ul className="flex flex-col gap-0.5" aria-label="Apps Align sent this version to">
                {d.apps.items.map((a) => (
                  <li key={a.id} data-value-app={a.id}>
                    <span className="font-medium">{a.name}</span> (connected by {a.connected_by.id === me ? "you" : a.connected_by.name}): Align sent it version {d.goal.version} on{" "}
                    {when(a.sent_at)}
                  </li>
                ))}
              </ul>
              <span className="text-[13.5px] text-zinc-500">Align sent it this version when it read the goals. Align can&apos;t see what the app does next.</span>
            </>
          )}
        </Row>
      )}

      <Row label="Measured in Align">
        <ul className="flex flex-col gap-0.5">
          <li>
            Proposal to approval: <span className="font-semibold">{d.measured.proposal_to_decision || "—"}</span>
          </li>
          <li>
            Approval to launch: <span className="font-semibold">{d.measured.decision_to_launch ?? "not yet"}</span>
          </li>
          <li>
            Approval to first agent context: <span className="font-semibold">{d.measured.decision_to_first_applied ?? "not yet"}</span>
          </li>
        </ul>
      </Row>

      <Feedback ws={ws} cr={cr} mine={d.my_report} measured={d.measured.proposal_to_decision} onSaved={v.reload} />

      {d.sees_all_reports && others.length > 0 && (
        <Row label="What others said">
          <ul className="flex flex-col gap-1.5" aria-label="Value reports">
            {others.map((r) => (
              <li key={r.id}>
                <span className="font-medium">{r.person.name}</span>: {estimateSaid(r.estimate)}
                {r.note && <span className="block text-zinc-700">“{r.note}”</span>}
              </li>
            ))}
          </ul>
        </Row>
      )}

      {d.follow_up_url && (
        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3">
          <p className="text-[15px] text-zinc-700">{PITCH}</p>
          <a
            href={d.follow_up_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void post(ws, cr, { action: "follow_up" }).catch(() => undefined)}
            className="text-[15px] text-violet-700 underline underline-offset-2"
          >
            {FOLLOW_UP}
          </a>
        </div>
      )}
    </section>
  );
}

/** The one optional question (an estimate and a note), or the reader's saved answer beside the measured time. */
function Feedback({ ws, cr, mine, measured, onSaved }: { ws: string; cr: ChangeRequest; mine: Report | null; measured: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<EstimateId | null>(mine?.estimate ?? null);
  const [note, setNote] = useState(mine?.note ?? "");
  const act = useAction();

  if (mine && !editing)
    return (
      <div aria-label="Your answer" className="flex flex-col gap-1.5 border-t border-zinc-200 pt-3 text-[15px]">
        <p>
          <span className="text-zinc-500">Your estimate:</span> <span className="font-semibold">{estimateSaid(mine.estimate)}</span>
          <span aria-hidden className="text-zinc-400">
            {" "}
            ·{" "}
          </span>
          <span className="text-zinc-500">Measured here:</span> <span className="font-semibold">{measured || "—"}</span>
        </p>
        {mine.note && <p className="text-zinc-700">“{mine.note}”</p>}
        {mine.can_edit && (
          <div>
            <Btn kind="secondary" onClick={() => setEditing(true)}>
              Change my answer
            </Btn>
          </div>
        )}
      </div>
    );

  const save = () =>
    void act.run(
      () => post(ws, cr, { action: "reported", estimate: choice, note: note.trim() ? note : null }),
      () => {
        setEditing(false);
        onSaved();
      },
    );

  return (
    <fieldset className="flex flex-col gap-2 border-t border-zinc-200 pt-3">
      <legend className="float-left mb-1 w-full text-[15px] font-semibold text-zinc-900">
        {VALUE_QUESTION} <span className="font-normal text-zinc-500">Optional</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {ESTIMATE_WORDS.map((e) => (
          <label key={e.id} className={`inline-flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-1.5 text-[14px] ${choice === e.id ? "border-violet-700 bg-violet-50" : "border-zinc-300"}`}>
            <input type="radio" name={`estimate-${cr.id}`} value={e.id} checked={choice === e.id} onChange={() => setChoice(e.id)} />
            {e.label}
          </label>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={VALUE_NOTE_MAX}
        aria-label="Anything to add (optional)"
        placeholder="Anything to add (optional). The people who asked for and approved this change see it."
        className="w-full rounded-[10px] border border-zinc-300 bg-white p-2.5 text-[14px] text-zinc-900"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Btn kind="secondary" disabled={!choice || act.busy} onClick={save}>
          Save my answer
        </Btn>
        {editing && (
          <Btn kind="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Btn>
        )}
      </div>
      <Err>{act.error}</Err>
    </fieldset>
  );
}
