"use client";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { claudeCodeLine } from "@/lib/paste-lines";

// The first-run card at the top of a custom workspace's canvas. ConnectAI renders it (into a slot Home gives it), so
// it reads the one connections poll ConnectAI already runs and never fetches on its own.
// Until Align has seen an app: two paths, a fictional sample and one agent over MCP, with what Align itself has seen
// of the connection (approved, not seen by Align yet). Once any app has been seen (last_used_at: any authenticated MCP request)
// the card is gone. Every state is Align-observed (a grant, an app seen); nothing an agent says about itself is shown,
// and the one reported read (goal activity) is labelled as reported. Dismissed per workspace in localStorage.

interface FirstRunApp {
  id: string;
  name: string;
  last_used_at: string | null;
}

/** What an agent connected to a workspace can read: one line per tool in lib/mcp/register.ts, by its workspace title,
 *  except align_get_work_map and align_get_goal_activity. Both come from what Claude Code and Codex sessions reported
 *  through the capture hooks (agent-reported, not seen by Align), and capture is off when hosted, so their lines say so.
 *  scripts/test-first-run.mjs checks the count against the server's tools/list. */
const WORK_MAP = "Sessions that reported in, grouped by goal (the work map)";
const ACTIVITY = "What connected sessions reported on each goal";
const REPORTED = new Set([WORK_MAP, ACTIVITY]);
const AGENT_READS = [
  "The teams’ goals",
  "The agreed plan",
  WORK_MAP,
  "The latest request between teams",
  "What changed and what is waiting",
  "What’s asked of its team",
  ACTIVITY,
  "The goals’ limits",
  "A short brief for its team",
];

const hiddenKey = (ws: string) => `align.firstRun.hidden:${ws}`;

function Path({ title, tag, children }: { title: string; tag?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[12px] border border-zinc-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[17px] font-semibold text-zinc-900">{title}</h3>
        {tag && <span className="rounded-full border border-zinc-300 bg-zinc-50 px-2 py-0.5 text-[12.5px] font-semibold text-zinc-700">{tag}</span>}
      </div>
      {children}
    </div>
  );
}

export default function FirstRun({
  workspace,
  hosted,
  url,
  apps,
  failed,
  copy,
  openConnect,
}: {
  workspace: string;
  hosted: boolean;
  url: string | null;
  apps: FirstRunApp[] | null;
  failed: boolean;
  copy: (text: string) => ReactNode;
  openConnect: () => void;
}) {
  // Read after mount, so the server render and the first client render agree; blocked storage keeps the card shown.
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => {
    let v = false;
    try {
      v = localStorage.getItem(hiddenKey(workspace)) === "1";
    } catch {
      /* storage blocked: show the card */
    }
    const t = setTimeout(() => setHidden(v), 0);
    return () => clearTimeout(t);
  }, [workspace]);
  function hide() {
    setHidden(true);
    try {
      localStorage.setItem(hiddenKey(workspace), "1");
    } catch {
      /* storage blocked: hidden until the page reloads */
    }
  }
  if (hidden !== false) return null;
  if (failed && !apps)
    return (
      <section aria-label="Get started" data-state="error" className="mb-4 rounded-[14px] border border-amber-700 bg-amber-50 px-5 py-3.5 text-[15px] text-amber-900">
        ▲ Couldn’t check connected AI apps just now. Align tries again in a few seconds.
      </section>
    );
  if (!apps) return null; // first poll still in flight

  const seen = apps.filter((a) => a.last_used_at);
  const approved = apps.filter((a) => !a.last_used_at);
  // Once any app has been seen, the card yields: Home's "Connected AI apps" section and the sidebar show each app's
  // state from here on.
  if (seen.length > 0) return null;

  const line = url ? claudeCodeLine(url) : null;
  const connect = (
    <>
      <p className="text-zinc-700">Paste this into a terminal in the folder where you work, then choose Allow on the Align page that opens:</p>
      {line === null ? (
        url && <p className="text-zinc-600">This server’s address can’t be turned into a command. Use the Connect dialog below instead.</p>
      ) : (
        <>
          {/* Copy sits above the clamped line: the line is about 1.5 KB, so a button after it would scroll out of view. */}
          <div>{copy(line)}</div>
          <code className="block max-h-36 overflow-y-auto break-all rounded-[8px] bg-zinc-100 px-3 py-2 font-mono text-[14px]">{line}</code>
          <p className="text-[14px] text-zinc-600">
            It adds Align to Claude Code for your user account (every folder), and writes two brief hooks to .claude/settings.local.json in this folder.
          </p>
        </>
      )}
      <div>
        <div className="font-semibold">It can read</div>
        <ul aria-label="What the agent can read" className="ml-5 list-disc text-zinc-700">
          {AGENT_READS.map((r) => (
            <li key={r}>{REPORTED.has(r) && hosted ? `${r} (off on the test server)` : r}</li>
          ))}
        </ul>
      </div>
      <p className="text-zinc-700">
        <span className="font-semibold text-zinc-900">It can’t</span> propose, approve or change anything here, or decide a launch.
      </p>
      <p role="status" className={failed ? "text-amber-800" : "text-zinc-700"}>
        {failed
          ? "▲ Couldn’t check connected AI apps just now. Align tries again in a few seconds."
          : approved.length
            ? `○ ${approved.map((a) => `${a.name}: Approved, not seen by Align yet`).join(". ")}.`
            : "No AI app has connected yet."}
      </p>
      <button onClick={openConnect} className="w-fit text-[14px] font-semibold text-violet-700 underline">
        Using Codex, the Claude app or ChatGPT?
      </button>
    </>
  );
  // Hosted has no sample (Northstar is not served), so the card is the one path, titled for it.
  return (
    <section aria-label="Get started" data-state={failed ? "error" : approved.length ? "approved" : "none"} className="mb-4 rounded-[14px] border border-violet-700 bg-white p-5 text-[15px] text-zinc-900">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-semibold">{hosted ? "Connect one agent" : "Two ways to start"}</h2>
          <p className="text-zinc-600">{hosted ? "Connect Claude Code to this workspace. It can read the plan; it can’t change it." : "Look around a made-up company first, or connect one AI agent to this workspace."}</p>
        </div>
        <Button kind="ghost" onClick={hide}>
          Hide
        </Button>
      </div>
      {hosted ? (
        <div className="flex min-w-0 flex-col gap-2">{connect}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Path title="Explore a sample" tag="Sample (fictional)">
            <p className="text-zinc-700">
              Northstar Security, a made-up company where two teams need each other to change a goal. It opens in a new tab and asks for the demo passcode. Signing in there signs this
              browser out of this workspace.
            </p>
            <a href="/" target="_blank" rel="noopener" aria-label="Open the sample (fictional)" className="inline-flex min-h-11 w-fit items-center rounded-[10px] border border-zinc-300 px-4 text-[15px] font-semibold text-zinc-900 hover:bg-zinc-100">
              Open the sample
            </a>
          </Path>
          <Path title="Connect one agent" tag="Claude Code">
            {connect}
          </Path>
        </div>
      )}
    </section>
  );
}
