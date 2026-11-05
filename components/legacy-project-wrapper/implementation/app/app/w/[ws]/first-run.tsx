"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, Btn, when, type WsSummary } from "../../_ui/kit";
import { READ_TOOLS } from "@/lib/mcp/read-tools";
import { claudeCodeLine } from "@/lib/paste-lines";

// The Home's first-run card (main #47, on v2): shown while Align has seen no AI app this person can see in this
// workspace make a request (a workspace owner sees everyone's apps, anyone else their own, as on the Apps tab). Two
// paths: explore the Northstar sample, which is fictional, and connect one agent (Claude Code), with what it can read
// (lib/mcp/read-tools.ts, checked against the server's tools/list), what it can't do, and its status as Align sees it.
// The sample is never created from here: it is offered on /app only to someone with no workspace who needs no creation
// code, so this card links to a sample the person already has (or says they are in it) and otherwise shows only the
// connect path. While shown it checks the Apps endpoint every few seconds (only
// while the tab is visible); once an app has made any request it yields to the Home's "Connected AI apps" section.
//
// LIM-2472 (ruling 9b5b870f; founder rulings 9fae06af and eaa5cf92): first run is part of the Home, not a separate
// screen, and it ends by rule, never by a dismiss: it stays until this person has connected an agent (an app they
// connected has made a request), whether or not goals exist. A waiting decision is never hidden behind setup: once the
// person can read a goal the Home puts this panel ABOVE its list, compact (two lines and the two actions). Viewers get
// no connect path (they can't connect one), and no panel at all once a goal exists. On the theme tokens throughout.

/** The name lib/v2/sample.ts gives the sample workspace. */
const SAMPLE_NAME = "Northstar (sample)";
const POLL_MS = 5000;

export interface FirstRunApp {
  id: string;
  name: string;
  approved_at: string;
  last_used_at: string | null;
  last_read_at: string | null;
  /** Who connected it (the grant's person); an owner sees everyone's apps. */
  user?: { id: string; name: string };
}

/** An app Align has seen make a request (a connection; a goal read is one too). */
export const seenApp = (a: { last_used_at: string | null; last_read_at: string | null }) => !!(a.last_used_at || a.last_read_at);

function Path({ title, tag, children, testId }: { title: string; tag: string; children: ReactNode; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-(--radius-m) border border-(--line) bg-(--bg-raised) p-4" data-first-run-path={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[17px] font-semibold text-(--text-1)">{title}</h3>
        <span className="inline-flex items-center rounded-full border border-(--line-strong) px-2 py-0.5 font-mono text-[12px] tracking-[0.04em] text-(--text-2)">{tag}</span>
      </div>
      {children}
    </div>
  );
}

function CopyLine({ line }: { line: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div>
        <Btn
          kind="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(line).catch(() => undefined);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Btn>
      </div>
      <code className="block max-h-36 overflow-y-auto break-all rounded-[8px] bg-(--bg-inset) px-3 py-2 font-mono text-[14px] text-(--text-1)" data-first-run-line>
        {line}
      </code>
    </div>
  );
}

/** `always`: the Connect drawer (LIM-2472 concept A) shows the connect paths even after an app has connected, and
 *  never hands off to the Home. */
/** `me`: the person; first run lasts until an app THEY connected has made a request (an owner sees everyone's apps,
 *  and someone else's agent doesn't end this person's setup). `hasGoals`: the person can read a goal, so this panel
 *  sits above Home's list and stays compact (two lines and the two actions); a viewer, who can't connect an agent,
 *  then gets no panel at all. */
export default function FirstRun({ ws, onSeen, always = false, me, hasGoals = false }: { ws: string; onSeen: () => void; always?: boolean; me?: string; hasGoals?: boolean }) {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<{ url: string; apps: FirstRunApp[]; at: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [list, setList] = useState<WsSummary[] | null>(null);

  useEffect(() => {
    let live = true;
    api<{ workspaces: WsSummary[] }>("/api/v2/workspaces").then(
      (d) => live && setList(d.workspaces),
      () => live && setList([]),
    );
    return () => {
      live = false;
    };
  }, []);

  // This mount has seen the person with no app that made a request: only then does a seen app mean Home changed.
  const sawUnseen = useRef(false);
  // The status: read now, then every few seconds while the card is shown and the tab visible.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        try {
          const d = await api<{ url: string; apps: FirstRunApp[] }>(`/api/v2/workspaces/${ws}/apps`);
          if (!live) return;
          setApps({ ...d, at: Date.now() });
          setFailed(false);
          if (!always && d.apps.some((a) => seenApp(a) && (!me || a.user?.id === me))) {
            // They just connected: the Home reads again. Already connected on load: nothing changed, just stop checking.
            if (sawUnseen.current) onSeen();
            return;
          }
          sawUnseen.current = true;
        } catch {
          if (!live) return;
          setFailed(true);
        }
      }
      timer = setTimeout(() => void check(), POLL_MS);
    };
    void check();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [ws, onSeen, always, me]);

  if (!list) return null;
  const connected = !!apps?.apps.some((a) => seenApp(a) && (!me || a.user?.id === me));
  const self = list.find((w) => w.id === ws);
  const viewer = self?.role === "viewer";
  // An empty workspace is its own state (below), shown whether or not this person has connected an agent: the first
  // goal is the step that matters, and it must not vanish with the connect panel.
  if (!always && hasGoals && connected) return null;
  if (!always && viewer && hasGoals) return null;
  const sample = self?.name === SAMPLE_NAME ? self : list.find((w) => w.name === SAMPLE_NAME && w.id !== ws);
  const inSample = sample?.id === ws;
  const approvedOnly = apps?.apps.filter((a) => !seenApp(a) && (!me || a.user?.id === me)) ?? [];
  const line = apps ? claudeCodeLine(apps.url) : null;

  const status = failed
    ? "Couldn't check connected AI apps just now. Align tries again in a few seconds."
    : !apps
      ? "Checking…"
      : approvedOnly.length
        ? `${approvedOnly.map((a) => `${a.name}: approved ${when(a.approved_at)}, Align hasn't seen it connect yet`).join(". ")}.`
        : self?.role === "owner"
          ? "No AI app is connected to this workspace yet."
          : "You haven't connected an AI app to this workspace yet.";

  const connect = (
    <>
      {viewer ? (
        <p className="text-(--text-2)">Viewers can&apos;t connect AI apps to this workspace. Ask a workspace owner to make you a member.</p>
      ) : (
        <>
          <p className="text-(--text-2)">Paste this into a terminal (sh, bash or zsh), then choose this workspace and Allow on the Align page that opens:</p>
          {apps && line === null && <p className="text-(--text-2)">This server&apos;s address can&apos;t be turned into a command. Copy the URL from the Apps tab instead.</p>}
          {line && <CopyLine line={line} />}
          <p className="text-[14px] text-(--text-2)">It adds Align to Claude Code for your user account (every folder) and starts the sign-in. It writes no hooks and no settings in your folder.</p>
        </>
      )}
      <div>
        <p className="font-semibold text-(--text-1)">It can read, as you</p>
        <ul aria-label="What a connected agent can read" className="ml-5 list-disc text-(--text-2)">
          {READ_TOOLS.map((t) => (
            <li key={t.name} data-tool={t.name}>
              {t.reads}
              {t.agentReported ? " (agent-reported, not observed by Align)" : ""}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-(--text-2)">
        <span className="font-semibold text-(--text-1)">It can&apos;t</span> propose, approve, launch or change anything here. If you allow it when you connect, it can add evidence links to change
        requests, labelled agent-reported.
      </p>
      <p
        role="status"
        aria-live="polite"
        className={failed ? "text-(--st-retry)" : "text-(--text-2)"}
        data-first-run-status={failed ? "error" : !apps ? "checking" : approvedOnly.length ? "approved" : "none"}
      >
        {status}
      </p>
      <p className="text-[14px] text-(--text-2)">
        Once it connects, the Apps tab shows when it last connected (any request to Align) and, separately, when it last read the goals. Connecting is not a read.
      </p>
      <Link href={`/app/w/${ws}/apps`} className="w-fit text-[14px] font-medium text-(--text-1) underline underline-offset-2">
        Using Codex or another app? See the Apps tab.
      </Link>
    </>
  );

  // A workspace with no goals (LIM-2472 round 2): what this person can do first. An owner or member: "Set the first goal"
  // is the one filled action, then the two paths (the sample, one agent) outlined, the connect steps folded behind
  // their action. A viewer, who can do neither, gets one line.
  if (!always && !hasGoals) {
    if (viewer)
      return (
        <p className="rounded-(--radius-m) border border-dashed border-(--line-strong) px-4 py-3 text-[14px] text-(--text-2)" data-first-run="viewer-empty">
          This workspace has no goals yet. A workspace owner or member sets them.
        </p>
      );
    const pathBtn =
      "inline-flex min-h-[40px] items-center justify-center rounded-(--radius-s) border border-(--line-strong) px-3.5 text-[14px] font-medium text-(--text-1) hover:bg-(--bg-raised) max-sm:min-h-[44px]";
    return (
      <section aria-label="Get started" className="min-w-0 rounded-(--radius-m) border border-(--line-strong) bg-(--bg-panel) px-4 py-4 text-[14px] text-(--text-1)" data-first-run="empty">
        <p className="text-[16px] font-semibold">Start with a goal</p>
        <p className="mt-1 max-w-prose text-(--text-2)">Agents read the goals you can read, as you. Set the first one{sample || !connected ? ", or look around first" : ""}.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            href={`/app/w/${ws}/goals`}
            className="inline-flex min-h-[40px] items-center justify-center rounded-(--radius-s) bg-(--accent) px-3.5 text-[14px] font-medium text-(--text-on-accent) hover:bg-(--accent-hover) max-sm:min-h-[44px]"
            data-first-goal
          >
            Set the first goal
          </Link>
          {sample && !inSample && (
            <Link href={`/app/w/${sample.id}`} className={pathBtn} aria-label="Explore the Northstar sample (fictional)" data-sample-link>
              Explore the sample
            </Link>
          )}
          {!connected && (
            <button type="button" className={pathBtn} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? "Hide the steps" : "Connect one agent"}
            </button>
          )}
        </div>
        {open && !connected && (
          <div className="mt-3 flex min-w-0 flex-col gap-2 border-t border-(--line) pt-3 text-[15px]" data-first-run-path="connect">
            {connect}
          </div>
        )}
      </section>
    );
  }

  // Above a list that has something in it: two lines and the two actions; the connect steps open in place.
  if (!always)
    return (
      <section aria-label="Get started" className="min-w-0 rounded-(--radius-m) border border-dashed border-(--line-strong) px-4 py-3 text-[14px] text-(--text-1)" data-first-run="compact">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-64">
            <p className="font-semibold">Connect your agent</p>
            <p className="text-(--text-2)">Your agent reads the goals you can read, as you. It can&apos;t approve or change a goal.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {sample && !inSample && (
              <Link
                href={`/app/w/${sample.id}`}
                className="inline-flex min-h-[40px] items-center text-[14px] text-(--text-2) hover:text-(--text-1) hover:underline max-sm:min-h-[44px]"
                data-sample-link
              >
                Explore the sample
              </Link>
            )}
            <Btn kind="secondary" onClick={() => setOpen((o) => !o)}>
              {open ? "Hide the steps" : "Connect an agent"}
            </Btn>
          </div>
        </div>
        {open && (
          <div className="mt-3 flex min-w-0 flex-col gap-2 border-t border-(--line) pt-3 text-[15px]" data-first-run-path="connect">
            {connect}
          </div>
        )}
      </section>
    );

  return (
    <section
      aria-label="Get started"
      className="min-w-0 rounded-(--radius-l) border border-(--line-strong) bg-(--bg-panel) p-5 text-[15px] text-(--text-1)"
      data-first-run={sample ? "two" : "connect"}
    >
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-60">
          <h2 className="text-[20px] font-semibold">{sample ? (viewer ? "Look around first" : "Two ways to start") : viewer ? "Nothing here yet" : "Connect one agent"}</h2>
          <p className="text-(--text-2)">
            {sample && viewer
              ? "Look around a made-up company while this workspace has no goals."
              : sample
                ? inSample
                  ? "Look around this made-up company, or connect one AI agent to it."
                  : "Look around a made-up company first, or connect one AI agent to this workspace."
                : viewer
                  ? "A workspace owner or member adds the goals."
                  : "Connect Claude Code to this workspace. It can read the goals; it can't change them."}
          </p>
        </div>
      </div>
      {sample ? (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <Path title="Explore a sample" tag="Fictional" testId="sample">
            {inSample ? (
              <>
                <p className="text-(--text-2)">
                  You are in the Northstar sample. Its company, teams, goals and change request are fictional: Align made them up so you can try each step. Its change request is waiting on you.
                </p>
                <Link href={`/app/w/${ws}/requests`} className="w-fit text-[15px] font-medium text-(--text-1) underline underline-offset-2">
                  Open the sample&apos;s change request
                </Link>
              </>
            ) : (
              <>
                <p className="text-(--text-2)">Northstar is a made-up company in its own workspace, with two teams, their goals and one change request to try. Nothing in it is real.</p>
                <Link href={`/app/w/${sample.id}`} aria-label="Open the Northstar sample (fictional)" className="w-fit text-[15px] font-medium text-(--text-1) underline underline-offset-2" data-sample-link>
                  Open the Northstar sample
                </Link>
              </>
            )}
          </Path>
          {!viewer && (
            <Path title="Connect one agent" tag="Claude Code" testId="connect">
              {connect}
            </Path>
          )}
        </div>
      ) : viewer ? (
        <p className="text-(--text-2)" data-first-run-path="viewer">
          Viewers can&apos;t connect AI apps here. This Home shows the goals once a workspace owner or member adds them.
        </p>
      ) : (
        <div className="flex min-w-0 flex-col gap-2" data-first-run-path="connect">
          {connect}
        </div>
      )}
    </section>
  );
}
