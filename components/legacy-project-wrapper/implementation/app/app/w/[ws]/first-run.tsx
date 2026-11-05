"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
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
// LIM-2472 (ruling 9b5b870f; founder pick 9fae06af, "A at empty/first time, b after"): first run is the Home in its
// empty state, not a separate screen, and it ends by rule, never by a dismiss: the Home shows it only while the person
// can read no goal, and it yields once an app has connected. Viewers get no connect path (they can't connect one).
// The Home renders it where "Needs you" would lead, on the theme tokens so it reads in dark and light.

/** The name lib/v2/sample.ts gives the sample workspace. */
const SAMPLE_NAME = "Northstar (sample)";
const POLL_MS = 5000;

export interface FirstRunApp {
  id: string;
  name: string;
  approved_at: string;
  last_used_at: string | null;
  last_read_at: string | null;
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
export default function FirstRun({ ws, onSeen, always = false }: { ws: string; onSeen: () => void; always?: boolean }) {
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
          if (!always && d.apps.some(seenApp)) {
            onSeen(); // the Home reads again and shows the app in its own section; this card is done
            return;
          }
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
  }, [ws, onSeen, always]);

  if (!list) return null;
  if (!always && apps?.apps.some(seenApp)) return null;

  const self = list.find((w) => w.id === ws);
  const viewer = self?.role === "viewer";
  const sample = self?.name === SAMPLE_NAME ? self : list.find((w) => w.name === SAMPLE_NAME && w.id !== ws);
  const inSample = sample?.id === ws;
  const approvedOnly = apps?.apps.filter((a) => !seenApp(a)) ?? [];
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
        Once it connects, the Home and the Apps tab show when it last connected (any request to Align) and, separately, when it last read the goals. Connecting is not a read.
      </p>
      <Link href={`/app/w/${ws}/apps`} className="w-fit text-[14px] font-medium text-(--accent-text) underline">
        Using Codex or another app? See the Apps tab.
      </Link>
    </>
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
                <Link href={`/app/w/${ws}/requests`} className="w-fit text-[15px] font-medium text-(--accent-text) underline">
                  Open the sample&apos;s change request
                </Link>
              </>
            ) : (
              <>
                <p className="text-(--text-2)">Northstar is a made-up company in its own workspace, with two teams, their goals and one change request to try. Nothing in it is real.</p>
                <Link href={`/app/w/${sample.id}`} aria-label="Open the Northstar sample (fictional)" className="w-fit text-[15px] font-medium text-(--accent-text) underline" data-sample-link>
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
