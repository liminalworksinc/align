"use client";
import { useEffect, useState, type ReactNode } from "react";
import { agreementStatus, launchState, recordFacts } from "@/components/launch";
import type { View, ViewProps } from "@/components/props";
import { accepted, changedToday, currentGoal, isToday } from "@/components/select";
import { Badge, STATE_LABEL, type Tone } from "@/components/ui";
import { companyMeasureId, dependencyId, labelsFor, poss, slotOf, type Labels } from "@/lib/labels";
import { LIMIT_WORDS, limitDrift } from "@/lib/limits";
import type { Actor, Ask, Limit, Proposal, StateView } from "@/lib/types";
import { api } from "@/components/useAlign";

// v6 "Your turn": the landing view for every role, built from state only. Waiting on you = proposals whose next action
// is the signed-in actor's (the same rules the server enforces in lib/flow.ts), each quoting the exact measure text with
// one CTA to the review view. Then what waits on others, and what changed today. No hand-off control: nothing on the
// server records a hand-off.

const OPEN = (p: Proposal) => !["RATIFIED", "REJECTED"].includes(p.state);

/** Who acts next on an open proposal, as lib/flow.ts allows it. DRAFT has no next actor. */
export function nextActor(p: Proposal): Actor | null {
  if (p.state === "PENDING_SECURITY" || p.state === "ACKNOWLEDGED_BY_PRODUCT") return p.recipient_owner;
  if (p.state === "COUNTERED") return p.proposing_owner;
  return null;
}

/** The measure text the next actor is deciding on: the proposal's, or the owning team's latest changes. */
function quotedText(p: Proposal) {
  if (p.state === "PENDING_SECURITY") return p.proposed_measure_text;
  return p.counter_versions.at(-1)?.proposed_measure_text ?? p.proposed_measure_text;
}

const avatar = (team: string) => {
  const w = team.split(/[\s/]+/).filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  return (w[0] ?? "").slice(0, 2).toUpperCase();
};

interface Item {
  key: string;
  team: string; // avatar source
  me?: boolean;
  title: ReactNode;
  quote?: string;
  sub?: ReactNode;
  cta: string;
  open: () => void;
  /** Inline choices instead of the one CTA (an ask: Accept or Decline, then Mark done). */
  actions?: { label: string; run: () => void; primary?: boolean }[];
}

/** Waiting-on-you sentence per state, from the viewer's side. */
function mineTitle(p: Proposal, L: Labels) {
  if (p.state === "PENDING_SECURITY") return `${L.person[p.proposing_owner]} asks to change your goal`;
  if (p.state === "COUNTERED") return `${L.person[p.recipient_owner]} asked for changes to your proposal`;
  return `${L.person[p.proposing_owner]} accepted your changes. Your final approval is next`;
}
/** Custom: the avatar is the person the card's sentence names (Priya Shah asks… → PS), matching the thread. Northstar
 *  keeps the viewer's team (its snapshots are frozen). */
function mineFrom(p: Proposal): Actor {
  return p.state === "COUNTERED" ? p.recipient_owner : p.proposing_owner;
}
function mineCta(p: Proposal) {
  if (p.state === "PENDING_SECURITY") return "Review the proposal";
  if (p.state === "COUNTERED") return "Review the changes";
  return "Review and approve";
}
function othersTitle(p: Proposal, who: Actor, L: Labels) {
  if (p.state === "PENDING_SECURITY") return `${L.person[who]} reviews the proposal`;
  if (p.state === "COUNTERED") return `${L.person[who]} reviews ${poss(L.team.security)} changes`;
  return `${L.person[who]} gives the final approval`;
}

function Card({ it, hot }: { it: Item; hot?: boolean }) {
  if (it.actions)
    return (
      <div className={`flex w-full flex-wrap items-start gap-3.5 rounded-[14px] border bg-white px-[18px] py-4 ${hot ? "border-violet-700" : "border-zinc-200"}`}>
        <span aria-hidden className="grid size-[34px] shrink-0 place-items-center rounded-full border border-violet-700 bg-violet-50 text-[12px] font-bold text-violet-700">
          {avatar(it.team)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[16px] font-semibold leading-snug text-zinc-900">{it.title}</span>
          {it.quote && <span className="text-[15px] leading-snug text-zinc-700">“{it.quote}”</span>}
          {it.sub && <span className="text-[14px] leading-snug text-zinc-500">{it.sub}</span>}
        </span>
        <span className="flex shrink-0 gap-2 self-center">
          {it.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.run}
              className={`inline-flex min-h-[34px] items-center rounded-[10px] border px-3 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 ${a.primary ? "border-transparent bg-violet-700 text-black" : "border-zinc-300 text-zinc-900 hover:bg-zinc-100"}`}
            >
              {a.label}
            </button>
          ))}
        </span>
      </div>
    );
  return (
    <button
      type="button"
      onClick={it.open}
      className={`flex w-full items-start gap-3.5 rounded-[14px] border bg-white px-[18px] py-4 text-left transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 ${hot ? "border-violet-700" : "border-zinc-200"}`}
    >
      <span
        aria-hidden
        className={`grid size-[34px] shrink-0 place-items-center rounded-full border text-[12px] font-bold ${it.me ? "border-violet-700 bg-violet-50 text-violet-700" : "border-zinc-300 bg-zinc-100 text-zinc-700"}`}
      >
        {avatar(it.team)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[16px] font-semibold leading-snug text-zinc-900">{it.title}</span>
        {it.quote && <span className="text-[15px] leading-snug text-zinc-700">“{it.quote}”</span>}
        {it.sub && <span className="text-[14px] leading-snug text-zinc-500">{it.sub}</span>}
      </span>
      <span
        className={`inline-flex min-h-[34px] shrink-0 items-center self-center rounded-[10px] border px-3 text-[14px] font-semibold ${hot ? "border-transparent bg-violet-700 text-black" : "border-zinc-300 text-zinc-900"}`}
      >
        {it.cta}
      </span>
    </button>
  );
}

/** What waits on the signed-in actor. Exported so the shell's nav badge counts the same list. */
/** Where an ask came from, and how often it came up again. */
function askSub(a: Ask) {
  const later = a.history.at(-1);
  const again = a.history.length ? ` · came up again ${a.history.length === 1 ? "once" : `${a.history.length} times`}, last on ${later!.date} (${later!.source})` : "";
  return `${a.source.title}, ${a.source.date}${again}`;
}

/** Where a limit was said, and how often it came up again. */
function limitSub(l: Limit) {
  const [first, ...again] = l.sources;
  return `${first ? `${first.title}, ${first.date}` : ""}${again.length ? ` · came up again ${again.length === 1 ? "once" : `${again.length} times`}` : ""}`;
}

const HARNESS: Record<string, string> = { codex: "Codex", "claude-code": "Claude Code" };

type SetLimit = (id: string, action: "confirm" | "dismiss" | "clear", session?: string) => void;

export function waitingOnMe(
  s: StateView,
  actor: Actor,
  open: (v: View, p?: Proposal, compose?: boolean) => void,
  setAsk: (id: string, status: Ask["status"]) => void = () => undefined,
  setLimit: SetLimit = () => undefined,
): Item[] {
  const L = labelsFor(s);
  const items: Item[] = [];
  // Agent work that may cross a limit this team confirmed comes first: it may already be built on.
  for (const d of limitDrift(s)) {
    if (d.limit.team !== slotOf(actor)) continue;
    const agent = d.session ? (HARNESS[d.session.harness] ?? d.session.harness) : "An agent";
    const sessionId = d.session?.id ?? d.limit.flags?.find((f) => f.sentence === d.sentence)?.session ?? "";
    items.push({
      key: `drift:${d.limit.id}:${sessionId}`,
      team: L.role[actor],
      me: true,
      title: `${agent} may have crossed a limit on your goal`,
      quote: d.sentence,
      sub: `${LIMIT_WORDS[d.limit.type]}: ${d.limit.text} · reported ${(d.session?.last_at ?? d.at).slice(0, 10)}${d.session ? ` in ${d.session.repo}` : ""}. Approval from another AI doesn’t count; you decide.`,
      cta: "",
      open: () => undefined,
      actions: [{ label: "It’s within the limit", run: () => setLimit(d.limit.id, "clear", sessionId) }],
    });
  }
  // Suggested limits on this team's goal, from meetings and from what people told their agents.
  for (const l of (s.limits ?? []).filter((x) => x.state === "suggested" && x.team === slotOf(actor))) {
    items.push({
      key: `limit:${l.id}`,
      team: L.role[actor],
      me: true,
      title: "Suggested limit for your goal",
      quote: `${LIMIT_WORDS[l.type]}: ${l.text}`,
      sub: `${limitSub(l)}. Agents follow it once you confirm.`,
      cta: "",
      open: () => undefined,
      actions: [
        { label: "Confirm", run: () => setLimit(l.id, "confirm"), primary: true },
        { label: "Dismiss", run: () => setLimit(l.id, "dismiss") },
      ],
    });
  }
  // Asks of this team (custom workspaces, mostly from meetings): open ones to accept or decline, accepted ones to finish.
  // Open first (they need an answer), then accepted ones still to finish; newest first within each.
  const asks = [...(s.asks ?? [])].sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.source.date.localeCompare(a.source.date));
  for (const a of asks) {
    if (a.to !== slotOf(actor) || (a.status !== "open" && a.status !== "accepted")) continue;
    items.push({
      key: `ask:${a.id}`,
      team: L.role[actor],
      me: true,
      title: a.status === "open" ? `${a.from} asked you` : `You accepted this from ${a.from}`,
      quote: a.text,
      sub: askSub(a),
      cta: "",
      open: () => undefined,
      actions:
        a.status === "open"
          ? [
              { label: "Accept", run: () => setAsk(a.id, "accepted"), primary: true },
              { label: "Decline", run: () => setAsk(a.id, "declined") },
            ]
          : [{ label: "Mark done", run: () => setAsk(a.id, "done"), primary: true }],
    });
  }
  for (const p of [...s.proposals].reverse()) {
    if (!OPEN(p) || nextActor(p) !== actor) continue;
    items.push({
      key: p.id,
      team: L.northstar ? L.role[actor] : L.person[mineFrom(p)],
      me: true,
      title: mineTitle(p, L),
      quote: quotedText(p),
      sub: `${poss(L.team.security)} goal ${p.target_goal_version}`,
      cta: mineCta(p),
      open: () => open("proposals", p),
    });
  }
  // The asking team can propose once the company requirement is unresolved and nothing is open (createProposal).
  const rel = s.relations.find((r) => r.id === dependencyId(s));
  if (actor === "product" && rel?.status === "UNKNOWN" && !s.proposals.some(OPEN)) {
    const kr = currentGoal(s, "ceo")?.measures.find((m) => m.id === companyMeasureId(s));
    items.push({
      key: "propose",
      team: L.role.product,
      me: true,
      title: `The new company requirement needs ${L.team.security} to change its goal`,
      quote: kr?.text,
      // After a decline the asking team is told so here (ProposalsView tells the owner they will be).
      sub: [...s.proposals].reverse().find((p) => p.state !== "DRAFT")?.state === "REJECTED"
        ? `${L.person.security} declined your last proposal. ${L.team.product} and ${L.team.security} haven’t agreed yet`
        : `${L.team.product} and ${L.team.security} haven’t agreed yet`,
      cta: "Propose a change",
      open: () => open("proposals", undefined, true),
    });
  }
  // Northstar: the next company goal waits on leadership to approve and send it. Same rule as OrgView's button
  // (canPush: leadership, and a draft exists); the card opens that screen.
  if (actor === "leadership" && L.northstar && s.org_draft) {
    items.push({
      key: "push",
      team: L.role.leadership,
      me: true,
      title: "The next company goal is ready. Approve it and send it to every team",
      quote: s.org_draft.objective,
      sub: `Then ${L.team.product} and ${L.team.security} see what changed for their goals`,
      cta: "Review and send",
      open: () => open("company"),
    });
  }
  // Custom: leadership decides the launch once the teams agree (lib/flow.ts launch decision, custom only).
  const acc = accepted(s);
  if (actor === "leadership" && !L.northstar && acc && launchState(acc) !== "approved") {
    items.push({
      key: "launch",
      team: L.role.leadership,
      me: true,
      title: `${L.team.product} and ${L.team.security} agreed. The launch decision is yours`,
      quote: recordFacts(s, acc).target || undefined,
      sub: agreementStatus(acc),
      cta: "Decide the launch",
      open: () => open("company"),
    });
  }
  return items;
}

export function YourTurnView(props: ViewProps) {
  const { s, me, go, select, mark } = props;
  const L = labelsFor(s);
  const actor = me.actor as Actor;
  // The server allows one open proposal, and ProposalsView opens it (activeProposal) when nothing else is selected,
  // so a card only re-points a selection left on a different proposal. Other selections (the rail's dependency
  // details by default) stay as they are.
  const open = (v: View, p?: Proposal, compose?: boolean) => {
    if (p && props.selection?.kind === "proposal" && props.selection.id !== p.id) select({ kind: "proposal", id: p.id });
    go(v);
    if (compose) props.setCompose?.(true); // after go(), which clears any earlier request
  };
  const setAsk = (id: string, status: Ask["status"]) =>
    void api("/api/workspaces/asks", { method: "PATCH", body: { id, status }, workspace: props.workspace }).catch(() => undefined);
  const setLimit: SetLimit = (id, action, session) =>
    void api("/api/workspaces/limits", { method: "PATCH", body: { id, action, session }, workspace: props.workspace }).catch(() => undefined);
  const mine = waitingOnMe(s, actor, open, setAsk, setLimit);

  const others: Item[] = [];
  for (const p of [...s.proposals].reverse()) {
    const who = nextActor(p);
    if (!OPEN(p) || !who || who === actor) continue;
    others.push({
      key: p.id,
      team: L.northstar ? L.role[who] : L.person[who],
      title: othersTitle(p, who, L),
      quote: quotedText(p),
      sub: `${poss(L.team.security)} goal ${p.target_goal_version}`,
      cta: "Open",
      open: () => open("proposals", p),
    });
  }
  for (const l of (s.limits ?? []).filter((x) => x.state === "suggested" && x.team !== slotOf(actor))) {
    const who = (["leadership", "product", "security"] as Actor[]).find((a) => slotOf(a) === l.team)!;
    others.push({
      key: `limit:${l.id}`,
      team: L.role[who],
      title: `${L.person[who]} confirms a suggested limit`,
      quote: `${LIMIT_WORDS[l.type]}: ${l.text}`,
      sub: limitSub(l),
      cta: "Open",
      open: () => go("goals"),
    });
  }
  const acc = accepted(s);
  if (acc && !L.northstar && launchState(acc) !== "approved" && actor !== "leadership") {
    others.push({
      key: "launch",
      team: L.role.leadership,
      title: `${L.person.leadership} decides the launch`,
      sub: agreementStatus(acc),
      cta: "Open",
      open: () => go("decision"),
    });
  }

  const ceo = currentGoal(s, "ceo");
  const kr = ceo?.measures.find((m) => m.id === companyMeasureId(s));
  const rel = s.relations.find((r) => r.id === dependencyId(s));
  // Landing here while the company change is unresolved is seeing that change: start the time-to-agreement clock,
  // as DecisionView does (the landing view moved from "decision" to "turn").
  const ceoChangeOpen = Boolean(kr && rel?.status === "UNKNOWN" && !s.timer?.started_at);
  useEffect(() => {
    if (ceoChangeOpen) mark("ceo_change_viewed");
  }, [ceoChangeOpen, mark]);
  const depStatus: { text: string; tone: Tone } | null = !rel
    ? null
    : rel.status === "ACCEPTED"
      ? { text: L.northstar ? STATE_LABEL.ACCEPTED : agreementStatus(acc), tone: "neutral" }
      : rel.status === "UNKNOWN"
        ? { text: "Not agreed yet", tone: "amber" }
        : { text: "Proposal in progress", tone: "violet" };
  const decided = acc ? recordFacts(s, acc) : null;

  return (
    <div className="flex max-w-[880px] flex-col gap-[22px]">
      <div>
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">Your turn</h1>
        <p className="mt-1.5 text-[16px] text-zinc-500">
          {mine.length ? `${mine.length} thing${mine.length === 1 ? "" : "s"} waiting on you.` : "Nothing waiting on you."}
        </p>
      </div>

      <section aria-label="Waiting on you" className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <h2 className="al-lbl">Waiting on you</h2>
          <span className={`grid h-[22px] min-w-[22px] place-items-center rounded-full px-1.5 text-[12px] font-bold ${mine.length ? "bg-violet-700 text-black" : "bg-zinc-100 text-zinc-900"}`}>
            {mine.length}
          </span>
        </div>
        {mine.map((it) => (
          <Card key={it.key} it={it} hot />
        ))}
        {mine.length === 0 && <div className="rounded-[14px] border border-dashed border-zinc-300 p-5 text-[15px] text-zinc-500">Nothing is waiting on you.</div>}
      </section>

      {others.length > 0 && (
        <section aria-label="Waiting on others" className="flex flex-col gap-2.5">
          <h2 className="al-lbl">Waiting on others</h2>
          {others.map((it) => (
            <Card key={it.key} it={it} />
          ))}
        </section>
      )}

      {!L.northstar && <LimitNotes workspace={props.workspace} />}

      {(kr || (acc && decided)) && (
        <section aria-label="What changed" className="flex flex-col gap-2.5">
          <h2 className="al-lbl">{changedToday(ceo) || isToday(acc?.ratified_at) ? "Changed today" : "What changed"}</h2>
          {kr && (
            <div className="flex items-start gap-3.5 rounded-[14px] border border-zinc-200 bg-white px-[18px] py-4">
              <Badge tone="amber" icon={false}>
                {L.northstar ? "CEO" : L.team.ceo}
              </Badge>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-[16px] font-semibold leading-snug text-zinc-900">{kr.text}</span>
                <span className="flex flex-wrap items-center gap-2 text-[14px] text-zinc-500">
                  Affects {poss(L.team.security)} goal and what {L.team.product} needs from {L.team.security}
                  {depStatus && <Badge tone={depStatus.tone}>{depStatus.text}</Badge>}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  mark("ceo_change_viewed");
                  if (ceo) select({ kind: "goal", id: ceo.id });
                  go("goals");
                }}
                className="inline-flex min-h-[34px] shrink-0 items-center self-center rounded-[10px] px-3 text-[14px] font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
              >
                See goals
              </button>
            </div>
          )}
          {acc && decided && (
            <Card
              it={{
                key: "decided",
                team: L.northstar ? L.role.security : L.person.security,
                title: `${L.team.product} and ${L.team.security} agreed on ${poss(L.team.security)} goal ${acc.accepted_version}`,
                quote: decided.target || undefined,
                // Neutral like every other agreement-status chip (the company card above, the decision record); the
                // amber ▲ here made one status look like two.
                sub: <Badge tone="neutral">{L.northstar ? STATE_LABEL.ACCEPTED : agreementStatus(acc)}</Badge>,
                cta: "See the decision",
                open: () => go("decision"),
              }}
            />
          )}
        </section>
      )}
    </div>
  );
}

/** Paste meeting notes, or type one limit: the sentences that state a limit become suggestions for the goal they are
 *  about, and that goal's owner confirms each one above. Folded away until opened. */
function LimitNotes({ workspace }: { workspace?: string }) {
  // The hosted test server keeps /api/workspaces/limits closed (proxy.ts), so the entry point isn't shown there at all
  // rather than leading to a form that can't be sent. Hidden until the config answers, so it never flashes in.
  const [closed, setClosed] = useState(true);
  useEffect(() => {
    let live = true;
    api<{ test_server?: unknown }>("/api/workspaces/config", { method: "GET" })
      .then((c) => live && setClosed(!!c.test_server))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const [openForm, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ touched: number }>("/api/workspaces/limits", { body: { notes, source: { title: title.trim() || "Typed in Align", date } }, workspace });
      setMsg(r.touched ? `${r.touched} limit${r.touched === 1 ? "" : "s"} suggested. Each goal's owner confirms them in Your turn.` : "No limits found. Write them as rules, like “The three models must not all fit on the GPU.”");
      if (r.touched) setNotes("");
    } catch (e) {
      // The hosted test server keeps this route closed (proxy.ts) until it is ruled open, as with asks.
      setMsg((e as { status?: number }).status === 404 ? "Adding limits isn’t open on this test server yet." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (closed) return null;
  if (!openForm)
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-[14px] font-semibold text-violet-700 hover:underline">
        Add a limit or paste meeting notes
      </button>
    );
  return (
    <section aria-label="Add limits" className="flex flex-col gap-2.5 rounded-[14px] border border-zinc-200 bg-white px-[18px] py-4">
      <h2 className="al-lbl">Add a limit or paste meeting notes</h2>
      <p className="text-[14px] text-zinc-500">Align picks out sentences like “must”, “must not” and “out of scope”, matches each to a goal, and asks that goal’s owner to confirm it. Nothing reaches agents before then.</p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={5}
        maxLength={20000}
        aria-label="Notes or a limit"
        className="w-full rounded-[10px] border border-zinc-300 p-3 text-[15px] text-zinc-900"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Where it was said, e.g. Lab meeting" aria-label="Where it was said" className="min-w-[220px] flex-1 rounded-[10px] border border-zinc-300 px-3 py-2 text-[14px]" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="When" className="rounded-[10px] border border-zinc-300 px-3 py-2 text-[14px]" />
        <button
          type="button"
          disabled={busy || !notes.trim()}
          onClick={send}
          className="inline-flex min-h-[34px] items-center rounded-[10px] border border-transparent bg-violet-700 px-3 text-[14px] font-semibold text-black disabled:opacity-50"
        >
          Suggest limits
        </button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-[34px] items-center rounded-[10px] px-3 text-[14px] font-semibold text-zinc-700 hover:bg-zinc-100">
          Close
        </button>
      </div>
      {msg && <p role="status" className="text-[14px] text-zinc-700">{msg}</p>}
    </section>
  );
}
