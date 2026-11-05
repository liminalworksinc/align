"use client";
import { PAGE_H1 } from "@/app/app/_ui/page-title";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError, Btn, Err, Field, Input, Loading, Note, Pill, Select, sentence, Shell, TextArea, useAction, useApi } from "../../../_ui/kit";
import { Panel } from "../../../_ui/ds";
import { NoticeBox, useNotice } from "../../../_ui/crparts";
import type { Me } from "../../../_ui/server";
import type { Goal, WsDetail } from "../../../_ui/types";
import { isBlankText } from "@/lib/v2/text-core.mts";

// The Asks tab (PORT-003): what other people asked of teams, recorded from meetings or by hand (GET .../asks). Each card
// offers only the actions its `can` flags allow; people's text is shown quoted, as written.

type AskState = "open" | "accepted" | "done" | "declined" | "withdrawn";
interface Person {
  id: string;
  name: string;
}
interface Ask {
  id: string;
  state: AskState;
  team: { id: string; name: string };
  goal: { id: string; title: string } | null;
  text: string;
  from_label: string | null;
  requester: Person;
  source: { kind: "meeting" | "manual"; title: string | null; date: string };
  mentions: { n: number; date: string; text: string; source_title: string; added_by: Person }[];
  decided_by: Person | null;
  decided_at: string | null;
  waiting_on_me: boolean;
  can: { accept: boolean; decline: boolean; done: boolean; reopen: boolean; withdraw: boolean; mention: boolean };
}

// LIM-2472 (stream R): a disclosure is a full-height row on a phone, with a visible focus ring from the global style.
const SUMMARY = "cursor-pointer py-1 font-medium text-(--text-1) max-sm:flex max-sm:min-h-[44px] max-sm:items-center";
const TONE: Record<AskState, "amber" | "violet" | "green" | "neutral"> = { open: "amber", accepted: "violet", done: "green", declined: "neutral", withdrawn: "neutral" };
const today = () => new Date().toISOString().slice(0, 10);

/** "<meeting>, <date> · came up again N times, last on <date> (<source>)". */
function askSubline(a: Pick<Ask, "source" | "mentions">): string {
  const where = a.source.title ? `${a.source.title}, ${a.source.date}` : a.source.date;
  const last = a.mentions[a.mentions.length - 1];
  if (!last) return where;
  return `${where} · came up again ${a.mentions.length === 1 ? "once" : `${a.mentions.length} times`}, last on ${last.date} (${last.source_title})`;
}

function MentionForm({ ws, a, onDone }: { ws: string; a: Ask; onDone: () => void }) {
  const [date, setDate] = useState(today());
  const [text, setText] = useState("");
  const [where, setWhere] = useState("");
  const act = useAction();
  return (
    <div className="mt-3 rounded-(--radius-m) border border-(--edge) p-3">
      <p className="mb-2 text-[15px] text-(--text-2)">Record that this came up again.</p>
      <Field label="When">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="What was said">
        <TextArea rows={2} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field label="Where (the meeting or document)">
        <Input value={where} maxLength={120} onChange={(e) => setWhere(e.target.value)} />
      </Field>
      <Btn kind="secondary" disabled={act.busy || isBlankText(text) || isBlankText(where)} onClick={() => void act.run(() => api(`/api/v2/workspaces/${ws}/asks/${a.id}/mention`, { body: { date, text, source_title: where } }), onDone)}>
        Save
      </Btn>
      <Err>{act.error}</Err>
    </div>
  );
}

/** A person as the reader hears them: "you" for themself (c9 W3), never their own name. */
const said = (p: Person, me: string) => (p.id === me ? "you" : p.name);

function AskCard({ ws, a, me, onDone }: { ws: string; a: Ask; me: string; onDone: () => void }) {
  const act = useAction();
  const [mentioning, setMentioning] = useState(false);
  // The card is keyed by its state, so a decision remounts it: the notice outlives that.
  const [notice, setNotice] = useNotice(`ask:${a.id}`);
  /** An action, refused like a decision on a change request (c9 W4): a 409 (the ask was decided meanwhile, in another
   *  tab) is the card's focused "Not recorded. <the server's words>", and the card reloads to show the ask as it is. */
  const doIt = (action: string) =>
    act.run(async () => {
      setNotice(null);
      try {
        await api(`/api/v2/workspaces/${ws}/asks/${a.id}/${action}`, { body: {} });
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 409) throw e;
        setNotice({ kind: "refused", text: `Not recorded. ${sentence(e.message)}` });
      }
      onDone();
    });
  return (
    <div className="ask-card mb-3 rounded-(--radius-m) border border-(--line) bg-(--bg-raised) p-4 last:mb-0" data-ask={a.id}>
      {notice && <NoticeBox notice={notice} />}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="min-w-0 text-[15px] font-semibold text-(--text-1)">
          {a.from_label ?? (a.requester.id === me ? "You" : a.requester.name)} asked {a.team.name}
        </span>
        <Pill tone={TONE[a.state]}>{a.state}</Pill>
        {a.goal && (
          <Link href={`/app/w/${ws}/goals/${a.goal.id}`} className="inline-flex min-h-[28px] items-center text-[14px] font-medium text-(--accent-text) underline-offset-2 hover:underline max-sm:min-h-[44px]">
            {a.goal.title}
          </Link>
        )}
      </div>
      <blockquote className="my-2 border-l-2 border-(--edge) pl-3 text-[15px] text-(--text-1)">“{a.text}”</blockquote>
      <p className="text-[14px] text-(--text-2)">{askSubline(a)}</p>
      {/* Who last decided it, in the refusal's words: "marked done by <name>", never the bare "done by" (c10 W3). */}
      <p className="text-[13px] text-(--text-3)">
        Recorded by {said(a.requester, me)}
        {a.decided_by && a.state !== "open" ? ` · ${a.state === "done" ? "marked done" : a.state} by ${said(a.decided_by, me)}` : ""}
      </p>
      {a.mentions.length > 0 && (
        <details className="mt-1 text-[14px] text-(--text-2)">
          <summary className={SUMMARY}>When it came up again</summary>
          {a.mentions.map((m) => (
            <p key={m.n}>
              {m.date}, {m.source_title}: “{m.text}” ({said(m.added_by, me)})
            </p>
          ))}
        </details>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {a.can.accept && (
          <Btn disabled={act.busy} onClick={() => void doIt("accept")}>
            Accept
          </Btn>
        )}
        {a.can.done && (
          <Btn disabled={act.busy} onClick={() => void doIt("done")}>
            Mark done
          </Btn>
        )}
        {a.can.decline && (
          <Btn kind="danger" disabled={act.busy} onClick={() => void doIt("decline")}>
            Decline
          </Btn>
        )}
        {a.can.reopen && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => void doIt("reopen")}>
            Reopen
          </Btn>
        )}
        {a.can.mention && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => setMentioning((m) => !m)}>
            Came up again
          </Btn>
        )}
        {a.can.withdraw && (
          <Btn kind="danger" disabled={act.busy} onClick={() => void doIt("withdraw")}>
            Withdraw
          </Btn>
        )}
      </div>
      {mentioning && <MentionForm ws={ws} a={a} onDone={onDone} />}
      <Err>{act.error}</Err>
    </div>
  );
}

function RecordAsk({ ws, teams, goals, onDone }: { ws: string; teams: WsDetail["teams"]; goals: Goal[]; onDone: () => void }) {
  const [team, setTeam] = useState(teams[0]?.id ?? "");
  const [text, setText] = useState("");
  const [from, setFrom] = useState("");
  const [kind, setKind] = useState<"meeting" | "manual">("meeting");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [goal, setGoal] = useState("");
  const act = useAction();
  const teamGoals = goals.filter((g) => g.team?.id === team && g.status === "active");
  if (!teams.length) return <Note>This workspace has no teams yet. A workspace owner adds them on the People tab.</Note>;
  const save = () =>
    act.run(
      () => api(`/api/v2/workspaces/${ws}/asks`, { body: { team_id: team, text, from_label: from || null, goal_id: goal || null, source: { kind, title: title || null, date } } }),
      () => {
        setText("");
        setFrom("");
        setGoal("");
        onDone();
      },
    );
  return (
    <div id="record-ask">
      <Field label="Team asked">
        <Select
          value={team}
          onChange={(e) => {
            setTeam(e.target.value);
            setGoal("");
          }}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="What they were asked">
        <TextArea rows={2} value={text} maxLength={400} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field label="Who asked (optional)" hint='As people say it, like "Faculty" or "Legal"'>
        <Input value={from} maxLength={80} onChange={(e) => setFrom(e.target.value)} />
      </Field>
      <Field label="Where it was asked">
        <Select value={kind} onChange={(e) => setKind(e.target.value as "meeting" | "manual")}>
          <option value="meeting">In a meeting</option>
          <option value="manual">Recorded by hand</option>
        </Select>
      </Field>
      <Field label={kind === "meeting" ? "Meeting" : "Note (optional)"}>
        <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Goal it concerns (optional)">
        <Select value={goal} onChange={(e) => setGoal(e.target.value)}>
          <option value="">None</option>
          {teamGoals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </Select>
      </Field>
      <Btn disabled={act.busy || !team || isBlankText(text) || !date || (kind === "meeting" && isBlankText(title))} onClick={() => void save()}>
        Record ask
      </Btn>
      <Err>{act.error}</Err>
    </div>
  );
}

function ImportAsks({ ws, teams, onDone }: { ws: string; teams: { id: string; name: string }[]; onDone: () => void }) {
  const [json, setJson] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const act = useAction();
  const run = () =>
    act.run(async () => {
      // A new import's outcome stands alone: the last one's counts never sit beside its error (W6).
      setResult(null);
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        throw new Error("Paste valid JSON: a list of asks, or {\"asks\": [...]}");
      }
      const asks = Array.isArray(parsed) ? parsed : (parsed as { asks?: unknown })?.asks;
      const r = await api<{ created: number; merged: number; unchanged: number }>(`/api/v2/workspaces/${ws}/asks/import`, { body: { asks } });
      setResult(`Imported: ${r.created} new, ${r.merged} came up again, ${r.unchanged} already recorded.`);
      setJson("");
    }, onDone);
  return (
    <details id="import-asks">
      <summary className={`${SUMMARY} text-[15px]`}>Import asks (JSON, at most 60)</summary>
      <p className="my-2 text-[14px] text-(--text-3)">
        Each ask: {"{"}team (the team&apos;s name) or team_id, text, from_label, goal_id, source: {"{"}kind: &quot;meeting&quot; or &quot;manual&quot;, title, date{"}"}, state, mentions{"}"}. An import adds to the asks here and never replaces them: an ask already recorded for that team with the same text and date is skipped, and one with a new date is recorded as having come up again.
      </p>
      {teams.length > 0 && (
        <p className="my-2 text-[14px] text-(--text-3)" data-import-teams>
          Teams here: {teams.map((t) => `${t.name} (team_id ${t.id})`).join(", ")}.
        </p>
      )}
      <TextArea rows={6} value={json} onChange={(e) => setJson(e.target.value)} />
      <div className="mt-2">
        <Btn kind="secondary" disabled={act.busy || !json.trim()} onClick={() => void run()}>
          Import
        </Btn>
      </div>
      {result && <Note>{result}</Note>}
      <Err>{act.error}</Err>
    </details>
  );
}

export default function Asks({ me, ws }: { me: Me; ws: string }) {
  const d = useApi<{ asks: Ask[] }>(`/api/v2/workspaces/${ws}/asks`);
  const w = useApi<WsDetail>(`/api/v2/workspaces/${ws}`);
  const goals = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const role = w.data?.role;
  const myTeams = new Set((w.data?.teams ?? []).filter((t) => t.my_role).map((t) => t.id));
  const all = d.data?.asks ?? [];
  const waiting = all.filter((a) => a.waiting_on_me);
  const ofTeams = all.filter((a) => !a.waiting_on_me && myTeams.has(a.team.id));
  const mine = all.filter((a) => !a.waiting_on_me && !myTeams.has(a.team.id) && a.requester.id === me.id);
  const others = all.filter((a) => !a.waiting_on_me && !myTeams.has(a.team.id) && a.requester.id !== me.id);
  const list = (asks: Ask[], empty: string) => (
    <>
      {asks.length === 0 && <p className="text-[15px] text-(--text-2)">{empty}</p>}
      {asks.map((a) => (
        <AskCard key={`${a.id}:${a.state}:${a.mentions.length}`} ws={ws} a={a} me={me.id} onDone={d.reload} />
      ))}
    </>
  );
  return (
    <Shell me={me} ws={ws} tab="Asks">
      <h1 className={`${PAGE_H1} mb-2`}>Asks</h1>
      <p className="mb-5 max-w-prose text-[15px] text-(--text-2)">What people asked of a team, from meetings or recorded by hand. An open ask is not an agreed goal until a lead of the team accepts it.</p>
      {d.loading && <Loading />}
      <Err>{d.error}</Err>
      {d.data && (
        <>
          <Panel className="mb-4" title="Waiting on you">{list(waiting, "Nothing is waiting on you.")}</Panel>
          {/* An ask that waits on this person is listed once, under Waiting on you: the sections below say so. */}
          <Panel className="mb-4" title="Asked of your teams">{list(ofTeams, waiting.some((a) => myTeams.has(a.team.id)) ? "No other asks of your teams. The ones that need you are under Waiting on you." : "No asks yet.")}</Panel>
          <Panel className="mb-4" title="Your asks">{list(mine, waiting.some((a) => !myTeams.has(a.team.id) && a.requester.id === me.id) ? "No other asks of yours. The ones that need you are under Waiting on you." : "No asks yet.")}</Panel>
          {role === "owner" && <Panel className="mb-4" title="Others">{list(others, "No asks yet.")}</Panel>}
        </>
      )}
      {role && role !== "viewer" && w.data && (
        <Panel className="mb-4" title="Record an ask">
          <RecordAsk ws={ws} teams={w.data.teams} goals={goals.data?.goals ?? []} onDone={d.reload} />
        </Panel>
      )}
      {role === "owner" && (
        <Panel className="mb-4">
          <ImportAsks ws={ws} teams={w.data?.teams ?? []} onDone={d.reload} />
        </Panel>
      )}
    </Shell>
  );
}
