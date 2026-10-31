"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, Loading, Note, Pill, Shell, useApi, when } from "../../_ui/kit";
import type { Me } from "../../_ui/server";
import FirstRun, { seenApp } from "./first-run";
import { appStatusWords, EVIDENCE_WORDS, type EvidenceClass, type HomeNext, type HomePerson } from "@/lib/v2/home-core.mts";

// The workspace Home, the workspace's landing view (PORT2-001, from v1's "Know what needs you", main #41/#42). One read
// of GET /api/v2/workspaces/<ws>/home: what waits on this person and on others, the active goals, and the connected AI
// apps with when each last read the goals (or only connected). Counts are only numbers Align has: a section the server
// couldn't read (null), or a failed read of the whole page, shows "unknown", never zero. Every agent-status item carries
// exactly one evidence class (delivery receipt, agent reported, not observed); nothing says what an agent is doing or
// which goal version an app has. A connection is never shown as a read (main #48).

interface Change {
  id: string;
  goal: { id: string; title: string; version: number };
  state: string;
  requester: HomePerson;
  reason: string;
  next: HomeNext;
  waiting_on: HomePerson[];
}
interface Ask {
  id: string;
  state: string;
  team: { id: string; name: string };
  goal: { id: string; title: string } | null;
  text: string;
  from_label: string | null;
  requester: HomePerson;
  next: HomeNext;
}
interface Alignment {
  id: string;
  state: string;
  requester: HomePerson;
  target_goal: { id: string | null; title: string | null; visible: boolean } | null;
  next: HomeNext;
  waiting_on: HomePerson[];
}
interface Goal {
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
  me: string;
  change_requests: { waiting_on_me: Change[]; waiting_on_others: Change[] } | null;
  asks: { waiting_on_me: Ask[] } | null;
  alignments: { waiting_on_me: Alignment[]; waiting_on_others: Alignment[] } | null;
  goals: Goal[] | null;
  apps: { everyone: boolean; items: App[] } | null;
}

/** A failed read of the whole Home: every section unknown. */
const UNREAD: HomeData = { me: "", change_requests: null, asks: null, alignments: null, goals: null, apps: null };

const names = (ps: HomePerson[], me: string) => ps.map((p) => (p.id === me ? "you" : p.name)).join(", ");

/** The one evidence class an agent-status item carries. */
function Evidence({ c }: { c: EvidenceClass }) {
  return (
    <span data-evidence-class={c}>
      <Pill>{EVIDENCE_WORDS[c].toLowerCase()}</Pill>
    </span>
  );
}

/** A count tile that jumps to its section. `n` null: Align couldn't read it, so it says unknown. */
function Tile({ n, label, href, hot }: { n: ReactNode | null; label: string; href: string; hot?: boolean }) {
  return (
    <a
      href={href}
      data-tile={label}
      className={`flex min-w-0 flex-col gap-1 rounded-[14px] border bg-white px-4 py-3 hover:bg-zinc-100 ${hot ? "border-violet-700" : "border-zinc-200"}`}
    >
      <span className={`font-semibold leading-none tabular-nums text-zinc-900 ${n === null ? "text-[17px]" : "text-[24px]"}`}>{n === null ? "unknown" : n}</span>
      <span className="text-[13px] leading-snug text-zinc-500">{label}</span>
    </a>
  );
}

/** One queue row: what it is, the quoted subject, what it needs and from whom, and where to act. */
function Row({ kind, title, quote, need, href, testId }: { kind: string; title: ReactNode; quote?: string; need: ReactNode; href: string; testId: string }) {
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3" data-home-item={testId}>
      <div className="min-w-0 flex-1 basis-64">
        <p className="al-lbl">{kind}</p>
        <p className="text-[16px] text-zinc-900">{title}</p>
        {quote && <p className="break-words text-[14px] text-zinc-600">&ldquo;{quote}&rdquo;</p>}
        <p className="text-[14px] text-zinc-700">{need}</p>
      </div>
      <Link href={href} className="text-[15px] font-medium text-violet-700 hover:underline">
        Open
      </Link>
    </li>
  );
}

const Unknown = ({ what }: { what: string }) => <Note>Align couldn&apos;t read {what} just now, so it is unknown. Reload the page to try again.</Note>;

function changeNeed(c: Change, mine: boolean, me: string) {
  const who = names(c.waiting_on, me);
  switch (c.next) {
    case "decide":
      return mine ? "Approve it, suggest a change or decline it." : c.waiting_on.length ? `Waiting on ${who} to decide.` : "Nobody can approve this yet.";
    case "accept_counter":
      return mine ? "An approver suggested a change: accept it or withdraw your request." : `Waiting on ${who} to accept the suggested change.`;
    case "rebase":
      return mine ? `The goal moved on: update your request to version ${c.goal.version} before anyone can approve it.` : `Waiting on ${who} to update it to version ${c.goal.version}.`;
    case "launch":
      // LAUNCH-001: approved, not launched. Agents keep the goal's previous version until someone launches it.
      return mine ? `Approved, not launched: agents are still on version ${c.goal.version} until you launch it.` : `Approved, not launched: agents are still on version ${c.goal.version}. Waiting on ${who || "nobody yet"} to launch it.`;
    default:
      return "";
  }
}

function alignmentNeed(a: Alignment, mine: boolean, me: string) {
  if (a.next === "accept_counter") return mine ? "An approver suggested a change: accept it or withdraw your request." : `Waiting on ${names(a.waiting_on, me)} to accept the suggested change.`;
  return mine ? "Approve it, suggest a change or decline it." : a.waiting_on.length ? `Waiting on ${names(a.waiting_on, me)} to approve.` : "Nobody can approve this yet.";
}

const goalName = (g: Alignment["target_goal"]) => (g?.visible && g.title ? g.title : "a goal you can't see");

export default function Home({ me, ws }: { me: Me; ws: string }) {
  const d = useApi<HomeData>(`/api/v2/workspaces/${ws}/home`);
  const h = d.data ?? (d.error ? UNREAD : null);
  const base = `/app/w/${ws}`;

  const changeRow = (c: Change, mine: boolean) => (
    <Row
      key={`cr:${c.id}`}
      testId={`change_request:${c.id}`}
      kind={c.next === "launch" ? "Approved change" : "Change request"}
      title={
        <>
          {c.requester.id === me.id ? "Your request" : `${c.requester.name}'s request`} on <b className="font-semibold">{c.goal.title}</b>
        </>
      }
      quote={c.reason}
      need={changeNeed(c, mine, me.id)}
      href={`${base}/goals/${c.goal.id}#change-requests`}
    />
  );
  const askRow = (a: Ask) => (
    <Row
      key={`ask:${a.id}`}
      testId={`ask:${a.id}`}
      kind="Ask"
      title={
        <>
          {a.from_label ?? a.requester.name} asked <b className="font-semibold">{a.team.name}</b>
          {a.goal ? ` (${a.goal.title})` : ""}
        </>
      }
      quote={a.text}
      need={a.next === "accept" ? "Accept it or decline it for your team." : "Your team accepted it: mark it done once it is."}
      href={`${base}/asks`}
    />
  );
  const alignmentRow = (a: Alignment, mine: boolean) => (
    <Row
      key={`al:${a.id}`}
      testId={`alignment:${a.id}`}
      kind="Alignment"
      title={
        <>
          {a.requester.id === me.id ? "You ask" : `${a.requester.name} asks`} to align with <b className="font-semibold">{goalName(a.target_goal)}</b>
        </>
      }
      need={alignmentNeed(a, mine, me.id)}
      href={`${base}/alignments`}
    />
  );

  // Counts: null when any source of the count couldn't be read.
  const onMe = h && h.change_requests && h.asks && h.alignments ? h.change_requests.waiting_on_me.length + h.asks.waiting_on_me.length + h.alignments.waiting_on_me.length : null;
  const onOthers = h && h.change_requests && h.alignments ? h.change_requests.waiting_on_others.length + h.alignments.waiting_on_others.length : null;
  const apps = h?.apps ?? null;
  const read = apps?.items.filter((a) => a.evidence_class === "delivery_receipt").length ?? 0;

  return (
    <Shell me={me} ws={ws} tab="Home">
      <h1 tabIndex={-1} className="text-[26px] font-semibold text-zinc-900 focus:outline-none">
        Know what needs you
      </h1>
      {!h ? (
        <Loading />
      ) : (
        <>
          <p className="mb-5 mt-1 text-[16px] text-zinc-600" data-home-summary>
            {onMe === null ? "Align couldn't read everything that may be waiting on you, so how much is waiting is unknown." : onMe ? `${onMe} thing${onMe === 1 ? "" : "s"} waiting on you.` : "Nothing is waiting on you."}
          </p>
          {/* First run (main #47): until Align has seen an app this person can see here; never when that is unknown. */}
          {apps && !apps.items.some(seenApp) && <FirstRun ws={ws} onSeen={d.reload} />}
          <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Tile n={onMe} label="Waiting on you" href="#waiting" hot={!!onMe} />
            <Tile n={onOthers} label="Waiting on others" href="#others" />
            <Tile n={h.goals ? h.goals.length : null} label="Active goals" href="#goals" />
            <Tile n={apps ? (apps.items.length ? `${read} of ${apps.items.length}` : 0) : null} label={apps && apps.items.length ? "Connected apps that read the goals" : "Connected apps"} href="#apps" />
          </div>

          <section id="waiting" aria-label="Waiting on you" className="scroll-mt-4">
            <Card title="Waiting on you">
              {!h.change_requests && <Unknown what="change requests" />}
              {!h.asks && <Unknown what="asks" />}
              {!h.alignments && <Unknown what="alignments" />}
              {onMe === 0 && <Note>Nothing is waiting on you.</Note>}
              <ul className="divide-y divide-zinc-200">
                {h.change_requests?.waiting_on_me.map((c) => changeRow(c, true))}
                {h.asks?.waiting_on_me.map(askRow)}
                {h.alignments?.waiting_on_me.map((a) => alignmentRow(a, true))}
              </ul>
            </Card>
          </section>

          <section id="others" aria-label="Waiting on others" className="scroll-mt-4">
            <Card title="Waiting on others">
              {!h.change_requests && <Unknown what="change requests" />}
              {!h.alignments && <Unknown what="alignments" />}
              {onOthers === 0 && <Note>Nothing you are part of is waiting on someone else.</Note>}
              <ul className="divide-y divide-zinc-200">
                {h.change_requests?.waiting_on_others.map((c) => changeRow(c, false))}
                {h.alignments?.waiting_on_others.map((a) => alignmentRow(a, false))}
              </ul>
            </Card>
          </section>

          <section id="goals" aria-label="Active goals" className="scroll-mt-4">
            <Card title="Active goals">
              {!h.goals && <Unknown what="the goals" />}
              {h.goals?.length === 0 && (
                <Note>
                  No active goals you can see.{" "}
                  <Link href={`${base}/goals`} className="underline">
                    Create one on the Goals tab.
                  </Link>
                </Note>
              )}
              <ul className="divide-y divide-zinc-200">
                {h.goals?.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-2 py-3" data-home-goal={g.id}>
                    <Link href={`${base}/goals/${g.id}`} className="min-w-0 break-words text-[16px] text-zinc-900 hover:underline">
                      {g.title}
                    </Link>
                    {g.level === "company" && <Pill tone="violet">company</Pill>}
                    {g.team && <Pill tone="violet">{g.team.name}</Pill>}
                    <span className="text-[14px] text-zinc-500">
                      {g.owner.id === me.id ? "Yours" : g.owner.name}, version {g.version}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section id="apps" aria-label="Connected AI apps" className="scroll-mt-4">
            <Card title="Connected AI apps · when they last read the goals">
              {!apps ? (
                <Note>Align couldn&apos;t read the connected apps just now, so whether any of them read the goals is unknown. Reload the page to try again.</Note>
              ) : apps.items.length === 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-[15px] text-zinc-600" data-home-app="none">
                  <Evidence c="not_observed" />
                  <span>
                    {apps.everyone ? "No AI app is connected to this workspace" : "You have not connected an AI app to this workspace"}, so Align has observed no goal reads.{" "}
                    <Link href={`${base}/apps`} className="underline">
                      Connect one on the Apps tab.
                    </Link>
                  </span>
                </div>
              ) : (
                <ul className="divide-y divide-zinc-200">
                  {apps.items.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3" data-home-app={a.id}>
                      <span className="min-w-0 break-words font-semibold text-zinc-900">{a.name}</span>
                      <span className="text-[14px] text-zinc-500">connected by {a.connected_by.id === me.id ? "you" : a.connected_by.name}</span>
                      <Evidence c={a.evidence_class} />
                      <span className="text-[14px] text-zinc-700">{appStatusWords(a, when)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {apps && (
                <p className="mt-2 text-[13px] text-zinc-500">
                  {apps.everyone ? "" : "Your own connections; a workspace owner sees everyone's. "}A delivery receipt here is a goal read Align served to the app: a call that returned goals (recorded at most every 5 minutes). Connecting is not a read, so an app that only connected is not observed. Align sees when an app last read the goals, not which version it has or what it does with them.
                </p>
              )}
            </Card>
          </section>
        </>
      )}
    </Shell>
  );
}
