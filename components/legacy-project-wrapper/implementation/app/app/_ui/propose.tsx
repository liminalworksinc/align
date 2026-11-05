"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Drawer, FormField, FormSummary, SelectInput, TextArea, TextInput } from "./ds";
import { api, ApiError, useApi } from "./kit";
import type { ChangeRequest, Goal } from "./types";

// "I want to change the plan" (LIM-2472 round 2, rulings eaa5cf92 items 10 and 11): one "Propose a change" control in
// the shell, reachable from every workspace page, and a short form in a drawer. People propose; an agent can't (this is
// the web app only, and the server takes proposals from a signed-in person). The goal is pre-filled on a goal's page.
//
// The server takes a change as fields of the goal (title, measures, status), not free text, so "What should change"
// is one pick (the title, a measure, a new measure, achieved, dropped) and its new words. Limits and dependencies stay
// on the goal page's full form, which the drawer links to. Empty fields are checked here, in the form's own words,
// before anything is sent; what only the server can refuse (the goal moved, a request already open) is shown in its
// words beside the field it concerns. Evidence is optional until a goal can require it (server work): the form says
// so, and a link given here is added to the request right after it is created, as the person's own (Self-reported).
//
// Who decides, before sending: the goal read doesn't carry the approval set, so the summary names the goal's owner and,
// for a team goal, its leads, for a company goal the workspace owners. After sending, the request's own approvers are
// named exactly.

const WHY_MAX = 2000;
const TEXT_MAX = 300;

type Part = "" | "title" | "add" | "achieved" | "dropped" | `m:${string}`;

const outline =
  "inline-flex min-h-[40px] items-center justify-center rounded-(--radius-s) border border-(--line-strong) px-3.5 text-[14px] font-medium text-(--text-1) hover:bg-(--bg-raised) max-sm:min-h-[44px]";
const filled =
  "inline-flex min-h-[40px] items-center justify-center rounded-(--radius-s) bg-(--accent) px-3.5 text-[14px] font-medium text-(--text-on-accent) hover:bg-(--accent-hover) disabled:opacity-50 max-sm:min-h-[44px]";

/** Who usually decides, worded so it can't be wrong: the approval set drops the requester and can fall back to the
 *  workspace owners, which the goal read can't show (server ask 22), so the exact people are named only once it's sent. */
function deciders(g: Goal): string {
  const usual = g.level === "company" ? `${g.owner.name}, the goal's owner, or a workspace owner` : g.team ? `${g.owner.name}, the goal's owner, or a lead of ${g.team.name}` : `${g.owner.name}, the goal's owner`;
  return `Usually ${usual}. You can't decide your own request. The exact people are named when it is sent.`;
}

/** The change the server takes, from the pick and its words; null when it would change nothing. */
function changesFor(g: Goal, part: Part, text: string): ChangeRequest["changes"] | null {
  const t = text.trim();
  if (part === "title") return t === g.title ? null : { title: t };
  // A new measure goes without an id: the server gives it one.
  if (part === "add") return { measures: [...g.measures, { text: t, target: null } as Goal["measures"][number]] };
  if (part === "achieved" || part === "dropped") return g.status === part ? null : { status: part };
  if (part.startsWith("m:")) {
    const id = part.slice(2);
    const m = g.measures.find((x) => x.id === id);
    if (!m || m.text === t) return null;
    return { measures: g.measures.map((x) => (x.id === id ? { ...x, text: t } : x)) };
  }
  return null;
}

/** A label for the link, from its address: the host and path, at most 120 characters. */
const linkLabel = (u: URL) => `${u.host}${u.pathname === "/" ? "" : u.pathname}`.slice(0, 120);

function Form({ ws, me, goals, start, onClose }: { ws: string; me?: string; goals: Goal[]; start?: string; onClose: () => void }) {
  const mine = goals.filter((g) => g.status === "active" && g.owner.id !== me);
  const [goalId, setGoalId] = useState(start && mine.some((g) => g.id === start) ? start : "");
  const [part, setPart] = useState<Part>("");
  const [text, setText] = useState("");
  const [why, setWhy] = useState("");
  const [link, setLink] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"goal" | "part" | "text" | "why" | "link" | "form", string>>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ cr: ChangeRequest; linkError: string | null } | null>(null);
  const goalRef = useRef<HTMLSelectElement>(null);
  const partRef = useRef<HTMLSelectElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const whyRef = useRef<HTMLTextAreaElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const g = mine.find((x) => x.id === goalId) ?? null;
  const needsText = part === "title" || part === "add" || part.startsWith("m:");

  if (!mine.length)
    return (
      <p className="text-[15px] text-(--text-2)" data-propose="none">
        {goals.some((x) => x.status === "active")
          ? "You own every active goal you can see here. To change one, save a new version on its page."
          : (
            <>
              {/* Owners and members can set a goal (the Goals page's own rule); viewers never reach this drawer. */}
              There is no active goal here to propose a change to.{" "}
              <Link href={`/app/w/${ws}/goals`} className="font-medium text-(--text-1) underline underline-offset-2" onClick={onClose}>
                {goals.length ? "Set a new goal" : "Set the first goal"}
              </Link>
            </>
          )}
      </p>
    );

  if (sent)
    return (
      <div className="flex flex-col gap-3 text-[15px]" data-propose="sent" tabIndex={-1} ref={(e) => e?.focus()}>
        <p className="font-semibold text-(--text-1)">Sent for approval.</p>
        <p className="text-(--text-2)">
          {sent.cr.approvers.length ? `${sent.cr.approvers.map((p) => p.name).join(" or ")} can decide.` : "Align names who can decide on the request."} Nothing changes until they approve and someone
          launches.
        </p>
        {sent.linkError && <p className="text-(--st-retry)">The request was sent without its link: {sent.linkError} You can add it from the request.</p>}
        <div className="flex flex-wrap gap-3">
          <Link href={`/app/w/${ws}?review=${sent.cr.goal.id}.${sent.cr.id}`} className={outline} onClick={onClose}>
            Open the request
          </Link>
          <button type="button" className={outline} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );

  const check = () => {
    const e: typeof errors = {};
    if (!g) e.goal = "Choose a goal.";
    if (!part) e.part = "Choose what should change.";
    if (g && part && needsText && !text.trim()) e.text = part === "add" ? "Say what the new measure is." : "Say what it should say instead.";
    else if (g && part && !changesFor(g, part, text)) e.text = part === "achieved" || part === "dropped" ? "The goal is already marked that way." : "That's what it says now.";
    if (text.trim().length > TEXT_MAX) e.text = `Keep it to ${TEXT_MAX} characters.`;
    if (!why.trim()) e.why = "Say why this should change.";
    else if (why.length > WHY_MAX) e.why = `Keep it to ${WHY_MAX} characters.`;
    if (link.trim()) {
      try {
        const u = new URL(link.trim());
        if (u.protocol !== "https:") e.link = "A link starts with https://.";
      } catch {
        e.link = "That isn't a full link. Paste one that starts with https://.";
      }
    }
    return e;
  };

  const send = async () => {
    const e = check();
    setErrors(e);
    const first = (["goal", "part", "text", "why", "link"] as const).find((k) => e[k]);
    if (first) {
      ({ goal: goalRef, part: partRef, text: textRef, why: whyRef, link: linkRef })[first].current?.focus();
      return;
    }
    if (!g) return;
    setBusy(true);
    try {
      const cr = await api<ChangeRequest>(`/api/v2/workspaces/${ws}/goals/${g.id}/change-requests`, { body: { base_version: g.version, changes: changesFor(g, part, text), reason: why.trim() } });
      let linkError: string | null = null;
      if (link.trim()) {
        const u = new URL(link.trim());
        await api(`/api/v2/workspaces/${ws}/goals/${g.id}/change-requests/${cr.id}/evidence`, { body: { kind: "other", url: u.href, label: linkLabel(u), revision: cr.revision } }).catch(
          (x: Error) => {
            linkError = x.message;
          },
        );
      }
      setSent({ cr, linkError });
    } catch (x) {
      if (x instanceof ApiError && (x.code === "stale_version" || x.code === "already_open" || x.code === "own_goal" || x.code === "goal_not_active")) {
        setErrors({ goal: x.message });
        goalRef.current?.focus();
      } else setErrors({ form: x instanceof Error ? x.message : "Align couldn't send it just now." });
    } finally {
      setBusy(false);
    }
  };

  const evidence = link.trim() ? "1 link, from you (Self-reported)" : "None yet";
  return (
    <form
      className="flex flex-col gap-4"
      data-propose="form"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        void send();
      }}
    >
      <FormField label="Goal" error={errors.goal}>
        <SelectInput
          ref={goalRef}
          data-propose-field="goal"
          value={goalId}
          onChange={(ev) => {
            setGoalId(ev.target.value);
            setPart("");
            setText("");
          }}
        >
          <option value="">Choose a goal</option>
          {mine.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title} (v{x.version})
            </option>
          ))}
        </SelectInput>
      </FormField>
      <FormField
        label="What should change"
        error={errors.part}
        hint={
          g ? (
            <>
              Limits and dependencies are changed in{" "}
              <Link href={`/app/w/${ws}/goals/${g.id}#change-requests`} className="underline" onClick={onClose}>
                the goal page&apos;s full change form
              </Link>
              .
            </>
          ) : undefined
        }
      >
        <SelectInput
          ref={partRef}
          data-propose-field="part"
          value={part}
          disabled={!g}
          onChange={(ev) => {
            const p = ev.target.value as Part;
            setPart(p);
            setText(p === "title" ? (g?.title ?? "") : p.startsWith("m:") ? (g?.measures.find((m) => `m:${m.id}` === p)?.text ?? "") : "");
          }}
        >
          <option value="">{g ? "Choose what" : "Choose a goal first"}</option>
          {g && (
            <>
              <option value="title">The title</option>
              {g.measures.map((m) => (
                <option key={m.id} value={`m:${m.id}`}>
                  Measure: {m.text.length > 60 ? `${m.text.slice(0, 59)}…` : m.text}
                </option>
              ))}
              {g.measures.length < 10 && <option value="add">Add a measure</option>}
              <option value="achieved">Mark the goal achieved</option>
              <option value="dropped">Drop the goal</option>
            </>
          )}
        </SelectInput>
      </FormField>
      {needsText && (
        <FormField label={part === "add" ? "The new measure" : "It should say"} error={errors.text} count={{ value: text.length, max: TEXT_MAX }}>
          <TextInput ref={textRef} data-propose-field="text" value={text} onChange={(ev) => setText(ev.target.value)} />
        </FormField>
      )}
      {!needsText && errors.text && <p className="text-[13px] font-medium text-(--st-declined)">{errors.text}</p>}
      <FormField label="Why" error={errors.why} count={{ value: why.length, max: WHY_MAX }}>
        <TextArea ref={whyRef} data-propose-field="why" value={why} onChange={(ev) => setWhy(ev.target.value)} placeholder="Say why this should change." />
      </FormField>
      <FormField label="A link" optional error={errors.link} hint="A PR, a doc, a dashboard. Without one the request says it has no evidence.">
        <TextInput ref={linkRef} data-propose-field="link" type="url" inputMode="url" value={link} onChange={(ev) => setLink(ev.target.value)} placeholder="https://" />
      </FormField>
      <FormSummary
        rows={[
          { label: "Who decides", value: g ? deciders(g) : "The goal's owner, once you choose a goal" },
          { label: "Evidence", value: evidence },
        ]}
        note="Nothing changes until they approve and someone launches."
      />
      {errors.form && (
        <p role="alert" className="text-[13px] font-medium text-(--st-declined)">
          Not sent. {errors.form}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" className={outline} onClick={onClose}>
          Not now
        </button>
        <button type="submit" className={filled} disabled={busy} data-propose-send>
          {busy ? "Sending…" : "Send for approval"}
        </button>
      </div>
    </form>
  );
}

/** The goal a page is about, for the pre-fill: /app/w/<ws>/goals/<id> or …/work?goal=<id>. */
function goalHere(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const m = window.location.pathname.match(/\/goals\/([^/]+)/);
  return m?.[1] ?? new URLSearchParams(window.location.search).get("goal") ?? undefined;
}

/** The shell's control and its drawer. Not shown to a viewer (the server refuses viewers' proposals). */
export function ProposeControl({ ws, me, className }: { ws: string; me?: string; className?: string }) {
  const [open, setOpen] = useState<{ start?: string } | null>(null);
  return (
    <>
      <button type="button" className={className ?? outline} onClick={() => setOpen({ start: goalHere() })} data-propose-open>
        Propose a change
      </button>
      {open && <ProposeDrawer ws={ws} me={me} start={open.start} onClose={() => setOpen(null)} />}
    </>
  );
}

function ProposeDrawer({ ws, me, start, onClose }: { ws: string; me?: string; start?: string; onClose: () => void }) {
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  return (
    <div className="[overflow-wrap:break-word]">
      <Drawer open onClose={onClose} eyebrow="Change the plan" title="Propose a change">
        {feed.data ? (
          <Form ws={ws} me={me} goals={feed.data.goals} start={start} onClose={onClose} />
        ) : feed.error ? (
          <p className="text-[15px] text-(--text-2)">Align couldn&apos;t read the goals just now: {feed.error}</p>
        ) : (
          <p className="text-[15px] text-(--text-3)">Reading the goals…</p>
        )}
      </Drawer>
    </div>
  );
}
