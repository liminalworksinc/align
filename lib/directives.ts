import { acceptedPlan } from "./policy";

import { now } from "./store";
import type { AgentSession, AppState, Goal, Owner } from "./types";

/** An authority change pushed into an agent session as a replan instruction. */
export interface Directive {
  event_id: string;
  kind: "push" | "ratify";
  at: string; // when the authority acted
  authority: string; // who
  title: string; // one line
  text: string; // the full instruction Claude receives
}

const TEAM: Record<Owner, string> = { ceo: "Company", product: "Product", security: "Security" };
const ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000;
const t = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/Los_Angeles" });

interface AuthorityEventRow {
  event_id: string;
  kind: "push" | "ratify";
  at: string;
  goal: Goal | undefined;
  proposal_id?: string;
}

/** Every authority event on record: Leadership pushes and owner ratifications. Nothing else wakes an agent. */
export function authorityEvents(s: AppState): AuthorityEventRow[] {
  const rows: AuthorityEventRow[] = [];
  for (const p of s.pushes ?? []) rows.push({ event_id: `push:${p.id}`, kind: "push", at: p.pushed_at, goal: s.goals.find((g) => g.id === p.goal_id) });
  for (const a of s.acceptances ?? [])
    rows.push({ event_id: `accept:${a.proposal_id}`, kind: "ratify", at: a.ratified_at, goal: s.goals.find((g) => g.id === a.new_goal_id), proposal_id: a.proposal_id });
  return rows.sort((x, y) => x.at.localeCompare(y.at));
}

function sessionTeams(s: AppState, session: AgentSession): Set<Owner> {
  const teams = new Set<Owner>();
  const m = (s.mappings ?? []).find((x) => x.session_id === session.id);
  const g = m?.choice ? s.goals.find((x) => x.id === m.choice) : undefined;
  if (g) teams.add(g.owner_id);
  const text = [...session.prompts.map((p) => p.text), ...session.tools, session.last_message ?? ""].join(" ");
  if (/triage|p-throughput|p-beta|run-plan|security|align_get_accepted_plan/i.test(text)) teams.add("security");
  return teams;
}

function relevant(s: AppState, session: AgentSession, ev: AuthorityEventRow): boolean {
  if (ev.at < session.started_at) return false; // only changes that happened while this session existed
  if (ev.kind === "push") return Date.now() - Date.parse(session.last_at) < ACTIVE_WINDOW_MS;
  return !!ev.goal && sessionTeams(s, session).has(ev.goal.owner_id);
}

function measureDiff(prev: Goal | undefined, next: Goal): string[] {
  const before = new Map((prev?.measures ?? []).map((m) => [m.id, m.text]));
  return next.measures
    .filter((m) => before.get(m.id) !== m.text)
    .map((m) => `${before.has(m.id) ? "changed" : "new"} ${m.id}: ${m.text}`);
}

function textFor(s: AppState, session: AgentSession, ev: AuthorityEventRow): Directive {
  const plan = acceptedPlan(s);
  const footer = "Align is the record of goals that people ratified. You cannot change goals; use the align MCP tools to read them.";
  if (ev.kind === "push" && ev.goal) {
    const prev = ev.goal.supersedes ? s.goals.find((g) => g.id === ev.goal!.supersedes) : undefined;
    const diff = measureDiff(prev, ev.goal);
    const m = (s.mappings ?? []).find((x) => x.session_id === session.id);
    const risk = (m?.conflict?.probability ?? 0) >= 0.4 || /throughput|oldest-first|p-throughput/i.test(plan.plan);
    const title = `Company goal ${ev.goal.version} pushed by CEO / Leadership at ${t(ev.at)}`;
    const text = [
      `ALIGN · AUTHORITY CHANGE — ${title}.`,
      `Objective: ${ev.goal.objective}`,
      ...diff.map((d) => `• ${d}`),
      `Your team's authorized plan is still ${plan.plan} under Security goal ${plan.goal_version}${risk ? ", which may conflict with the new KR3 (protected tickets unchanged)" : ""}.`,
      `Action: start your reply with the line "Align → ${title}". Add a task to your built-in task list (Claude Code task tools, not Alike): "Hold: current plan vs company goal ${ev.goal.version} — awaiting Security goal decision". Do not switch plans on your own; summarize the risk in two sentences and wait for the Security goal owner to ratify a change.`,
      footer,
    ].join("\n");
    return { event_id: ev.event_id, kind: "push", at: ev.at, authority: "CEO / Leadership", title, text };
  }
  const acc = s.acceptances.find((a) => a.proposal_id === ev.proposal_id);
  const prop = s.proposals.find((p) => p.id === ev.proposal_id);
  const team = ev.goal ? TEAM[ev.goal.owner_id] : "Team";
  const owner = ev.goal?.owner_name ?? "the goal owner";
  const runs = (prop?.simulation_refs ?? []).map((id) => s.simulations.find((r) => r.id === id)).filter(Boolean);
  const evidence = runs.filter((r) => r!.scenario === "normal").map((r) => `${r!.plan_id}@${r!.plan_version} ${r!.verdict}`).join(" vs ");
  const title = `${team} goal ${acc?.accepted_version ?? ev.goal?.version ?? ""} ratified by ${owner} at ${t(ev.at)}`;
  const text = [
    `ALIGN · AUTHORITY CHANGE — ${title}.`,
    `Proposal ${ev.proposal_id}: ${prop?.counter_versions.at(-1)?.proposed_measure_text ?? prop?.proposed_measure_text ?? ""}`,
    `Accepted plan: ${plan.plan} (${plan.test_status ?? "untested"}${evidence ? `; Sparta: ${evidence}` : ""}).`,
    `REPLAN: start your reply with the line "Align → ${title}". Add a task to your built-in task list (Claude Code task tools, not Alike): "Replan under ${team} goal ${acc?.accepted_version ?? ""}". Call align_get_accepted_plan, then run exactly "scripts/run-plan.sh accepted" as a single command (you are already in the repo root: no cd prefix), report the Sparta result in two sentences, then mark the task done.`,
    footer,
  ].join("\n");
  return { event_id: ev.event_id, kind: "ratify", at: ev.at, authority: owner, title, text };
}

/** Directives this session has not received yet, oldest first. */
export function pendingFor(s: AppState, sessionId: string): Directive[] {
  const session = (s.sessions ?? []).find((x) => x.id === sessionId || x.session_id === sessionId);
  if (!session) return [];
  const delivered = new Set((session.directives ?? []).map((d) => d.event_id));
  return authorityEvents(s)
    .filter((ev) => !delivered.has(ev.event_id) && relevant(s, session, ev))
    .map((ev) => textFor(s, session, ev));
}

/** All directives that any session would receive for one event (used by the wire listener). */
export function recipientsFor(s: AppState, eventId: string): string[] {
  const ev = authorityEvents(s).find((e) => e.event_id === eventId);
  if (!ev) return [];
  return (s.sessions ?? []).filter((x) => relevant(s, x, ev) && !(x.directives ?? []).some((d) => d.event_id === eventId)).map((x) => x.id);
}

export function markDelivered(s: AppState, sessionId: string, eventId: string): boolean {
  const session = (s.sessions ?? []).find((x) => x.id === sessionId || x.session_id === sessionId);
  if (!session) return false;
  session.directives ??= [];
  if (session.directives.some((d) => d.event_id === eventId)) return false;
  session.directives.push({ event_id: eventId, delivered_at: now() });
  return true;
}

/** Called from the capture route: the session read the accepted plan or ran it after a delivery. */
export function markActed(session: AgentSession) {
  const last = [...(session.directives ?? [])].reverse().find((d) => !d.acted_at);
  if (last) last.acted_at = now();
}


/** One-line description of an authority event for the wire view. */
export function describeEvent(s: AppState, eventId: string): string {
  const ev = authorityEvents(s).find((e) => e.event_id === eventId);
  if (!ev?.goal) return eventId;
  if (ev.kind === "push") return `Company goal ${ev.goal.version} pushed by CEO / Leadership`;
  const acc = s.acceptances.find((a) => a.proposal_id === ev.proposal_id);
  return `${TEAM[ev.goal.owner_id]} goal ${acc?.accepted_version ?? ev.goal.version} ratified by ${ev.goal.owner_name}`;
}
