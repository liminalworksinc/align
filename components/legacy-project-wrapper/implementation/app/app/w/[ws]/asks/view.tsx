"use client";
import Link from "next/link";
import { useState } from "react";
import { api, Btn, Card, Err, Field, Input, Loading, Note, Pill, Select, Shell, TextArea, useAction, useApi } from "../../../_ui/kit";
import type { Me } from "../../../_ui/server";
import type { Goal, WsDetail } from "../../../_ui/types";

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
    <div className="mt-3 rounded-[12px] border border-zinc-300 p-3">
      <p className="mb-2 text-[15px] text-zinc-700">Record that this came up again.</p>
      <Field label="When">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="What was said">
        <TextArea rows={2} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field label="Where (the meeting or document)">
        <Input value={where} maxLength={120} onChange={(e) => setWhere(e.target.value)} />
      </Field>
      <Btn kind="secondary" disabled={act.busy || !text.trim() || !where.trim()} onClick={() => void act.run(() => api(`/api/v2/workspaces/${ws}/asks/${a.id}/mention`, { body: { date, text, source_title: where } }), onDone)}>
        Save
      </Btn>
      <Err>{act.error}</Err>
    </div>
  );
}

function AskCard({ ws, a, onDone }: { ws: string; a: Ask; onDone: () => void }) {
  const act = useAction();
  const [mentioning, setMentioning] = useState(false);
  const doIt = (action: string) => act.run(() => api(`/api/v2/workspaces/${ws}/asks/${a.id}/${action}`, { body: {} }), onDone);
  return (
    <div className="ask-card mb-4 rounded-[12px] border border-zinc-200 p-4" data-ask={a.id}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-[16px] text-zinc-900">
          {a.from_label ?? a.requester.name} asked {a.team.name}
        </span>
        <Pill tone={TONE[a.state]}>{a.state}</Pill>
        {a.goal && (
          <Link href={`/app/w/${ws}/goals/${a.goal.id}`} className="text-[14px] text-violet-700 hover:underline">
            {a.goal.title}
          </Link>
        )}
      </div>
      <blockquote className="my-2 border-l-2 border-zinc-300 pl-3 text-[15px] text-zinc-800">“{a.text}”</blockquote>
      <p className="text-[14px] text-zinc-500">{askSubline(a)}</p>
      <p className="text-[13px] text-zinc-500">
        Recorded by {a.requester.name}
        {a.decided_by && a.state !== "open" ? ` · ${a.state} by ${a.decided_by.name}` : ""}
      </p>
      {a.mentions.length > 0 && (
        <details className="mt-1 text-[14px] text-zinc-500">
          <summary className="cursor-pointer">When it came up again</summary>
          {a.mentions.map((m) => (
            <p key={m.n}>
              {m.date}, {m.source_title}: “{m.text}” ({m.added_by.name})
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
      <Btn disabled={act.busy || !team || !text.trim() || !date || (kind === "meeting" && !title.trim())} onClick={() => void save()}>
        Record ask
      </Btn>
      <Err>{act.error}</Err>
    </div>
  );
}

function ImportAsks({ ws, onDone }: { ws: string; onDone: () => void }) {
  const [json, setJson] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const act = useAction();
  const run = () =>
    act.run(async () => {
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
      <summary className="cursor-pointer text-[15px] text-zinc-700">Import asks (JSON, at most 60)</summary>
      <p className="my-2 text-[14px] text-zinc-500">
        Each ask: {"{"}team_id, text, from_label, goal_id, source: {"{"}kind: &quot;meeting&quot; or &quot;manual&quot;, title, date{"}"}, state, mentions{"}"}. An import adds to the asks here and never replaces them: an ask already recorded for that team with the same text and date is skipped, and one with a new date is recorded as having come up again.
      </p>
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
      {asks.length === 0 && <Note>{empty}</Note>}
      {asks.map((a) => (
        <AskCard key={`${a.id}:${a.state}:${a.mentions.length}`} ws={ws} a={a} onDone={d.reload} />
      ))}
    </>
  );
  return (
    <Shell me={me} ws={ws} tab="Asks">
      <h1 className="mb-2 text-[26px] font-semibold text-zinc-900">Asks</h1>
      <p className="mb-5 text-[15px] text-zinc-600">What people asked of a team, from meetings or recorded by hand. An open ask is not an agreed goal until a lead of the team accepts it.</p>
      {d.loading && <Loading />}
      <Err>{d.error}</Err>
      {d.data && (
        <>
          <Card title="Waiting on you">{list(waiting, "Nothing is waiting on you.")}</Card>
          <Card title="Asked of your teams">{list(ofTeams, "No asks yet.")}</Card>
          <Card title="Your asks">{list(mine, "No asks yet.")}</Card>
          {role === "owner" && <Card title="Others">{list(others, "No asks yet.")}</Card>}
        </>
      )}
      {role && role !== "viewer" && w.data && (
        <Card title="Record an ask">
          <RecordAsk ws={ws} teams={w.data.teams} goals={goals.data?.goals ?? []} onDone={d.reload} />
        </Card>
      )}
      {role === "owner" && (
        <Card>
          <ImportAsks ws={ws} onDone={d.reload} />
        </Card>
      )}
    </Shell>
  );
}
