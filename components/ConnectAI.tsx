"use client";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import FirstRun from "@/components/FirstRun";
import { Button } from "@/components/ui";
import { api } from "@/components/useAlign";
import { claudeCodeLine, codexLine } from "@/lib/paste-lines";

// "Connected AI apps" in a custom workspace's sidebar: the one URL any AI app connects with (Align's read-only MCP
// endpoint, OAuth sign-in with a team passcode), the steps for each app, and the apps connected now. The signal is
// last_used_at: when Align last saw the app make any authenticated MCP request (app/api/mcp/route.ts noteGrantUse),
// stamped with the plan revision current at that moment (lib/plan-rev.ts). It says the app was seen while that plan
// was current, not that it read the plan. An approved app Align hasn't seen yet is listed as "Approved, not seen by Align yet".
// Align sees when an app connects, never what it does. The same poll feeds the first-run card (components/FirstRun.tsx).
// Home mounts exactly one ConnectAI (one poll) and only switches its variant: "rail" (the sidebar card, steps in a
// dialog) at md and up; "row" on a phone, one collapsed line rendered into `rowSlot` (the top of Work, when Work is
// open) whose button opens the same steps inline. Off Work the row renders nothing but the first-run card.

interface App {
  id: string;
  name: string;
  redirect_host: string;
  role: string;
  approved_at: string;
  last_used_at: string | null;
  on_current_plan?: boolean;
}

type Tab = "claude-code" | "codex" | "claude" | "chatgpt";
const TABS: { id: Tab; label: string }[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude app" },
  { id: "chatgpt", label: "ChatGPT" },
];
const TRY = "Check Align: what's our agreed plan, and is anything waiting on someone's approval?";

function Copy({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      kind="secondary"
      onClick={() =>
        void navigator.clipboard.writeText(value).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          },
          () => setDone(false),
        )
      }
    >
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

function Command({ text }: { text: string | null }) {
  if (text === null) return <div className="my-2 text-zinc-600">This server’s address can’t be turned into a command. Copy the URL from the Claude or ChatGPT tab instead.</div>;
  return (
    <div className="my-2 flex flex-wrap items-center gap-2">
      <code className="break-all rounded-[8px] bg-zinc-100 px-3 py-2 font-mono text-[14px]">{text}</code>
      <Copy value={text} />
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-50 text-[14px] font-semibold text-violet-700">{n}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

// One paste for the terminal apps: the command adds Align and starts the sign-in. The chat apps take the URL. The lines
// are built in lib/paste-lines.ts, which quotes every value; a URL Align could not have made shows no command.
function Steps({ tab, url }: { tab: Tab; url: string }) {
  const allow = <Step n={2}>Your browser opens an Align page. Check the workspace and team, then choose Allow.</Step>;
  if (tab === "claude-code")
    return (
      <ol className="space-y-3">
        <Step n={1}>
          Paste this into a sh, bash or zsh terminal, in the folder where you work on these goals:
          <Command text={claudeCodeLine(url)} />
          <span className="text-zinc-600">
            Align works in every folder. In this one, Claude Code also gets a short brief (limits, what isn’t agreed, your goal, open asks) on its first prompt and
            again after it compacts its context. Already in Claude Code? Run the same line with ! in front.
          </span>
        </Step>
        {allow}
      </ol>
    );
  if (tab === "codex")
    return (
      <ol className="space-y-3">
        <Step n={1}>
          Paste this into a sh, bash or zsh terminal:
          <Command text={codexLine(url)} />
          <span className="text-zinc-600">It adds Align and one line to Codex’s instructions so Codex checks Align before planning your teams’ work. The Codex CLI, IDE extension and the ChatGPT desktop app’s Codex mode all use it.</span>
        </Step>
        {allow}
      </ol>
    );
  // The chat apps' own screens, as seen live on 10-26 (claude.ai on Max, chatgpt.com).
  if (tab === "claude")
    return (
      <ol className="space-y-3">
        <Step n={1}>
          Copy the URL:
          <Command text={url} />
          In the Claude app, Cowork or claude.ai: Customize, then Connectors, then Add, then Add custom connector. Name it Align, paste the URL, choose Continue, then Add.
          <div className="mt-1 text-zinc-600">On a Team or Enterprise plan only an owner can add connectors. Free allows one custom connector.</div>
        </Step>
        <Step n={2}>Choose Connect. An Align page opens: check the workspace and team, then choose Allow.</Step>
        <Step n={3}>Back in Claude, set Read-only tools to Always allow. Every Align tool only reads, and otherwise Claude asks before each one.</Step>
      </ol>
    );
  return (
    <ol className="space-y-3">
      <Step n={1}>
        Copy the URL:
        <Command text={url} />
        On chatgpt.com: Plugins, then Add, then Add custom MCP server. Name it Align, paste the URL, leave Authentication on OAuth, tick I understand and want to continue, then Create as a plugin.
        <div className="mt-1 text-zinc-600">On Business only an admin can add it.</div>
      </Step>
      <Step n={2}>An Align page opens. Check the workspace and team, then choose Allow.</Step>
    </ol>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// `slot` is where Home wants the first-run card (components/FirstRun.tsx). It is rendered from here, so the card and this
// sidebar share the one poll below.
export default function ConnectAI({
  workspace,
  teamOf,
  actor,
  hosted = false,
  slot = null,
  variant = "rail",
  rowSlot = null,
}: {
  workspace: string;
  teamOf: (role: string) => string;
  actor: string;
  hosted?: boolean;
  slot?: HTMLElement | null;
  variant?: "rail" | "row";
  rowSlot?: HTMLElement | null;
}) {
  const [data, setData] = useState<{ url: string; apps: App[]; plan?: { changed_at: string | null }; at: number } | null>(null);
  const [open, setOpen] = useState(false); // the dialog
  const [inline, setInline] = useState(false); // the phone row's steps, opened in place
  const [tab, setTab] = useState<Tab>("claude-code");
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    () =>
      api<{ url: string; apps: App[]; plan?: { changed_at: string | null } }>("/api/workspaces/connections", { workspace }).then(
        (d) => {
          setData({ ...d, at: Date.now() });
          setFailed(false);
        },
        () => {
          setData(null);
          setFailed(true);
        },
      ),
    [workspace],
  );

  // Every 3 s while the steps are open (the dialog, or inline under the phone row), so a newly connected app shows up while the person is still looking.
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), open || inline ? 3000 : 15000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, open, inline]);



  async function disconnect(id?: string) {
    setError(null);
    try {
      await api("/api/workspaces/connections", { method: "DELETE", body: id ? { id } : {}, workspace });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const reading = data?.apps.filter((a) => a.last_used_at) ?? [];
  // Just connected: approved in the last 15 minutes and seen by Align since. Then the dialog says so and suggests
  // a first question.
  const fresh = reading.filter((a) => data && data.at - Date.parse(a.approved_at) < 15 * 60 * 1000);
  // The first-run card, wherever Home put its slot.
  const firstRun =
    slot &&
    createPortal(
      <FirstRun
        workspace={workspace}
        hosted={hosted}
        url={data?.url ?? null}
        apps={data?.apps ?? null}
        failed={failed}
        copy={(text) => <Copy value={text} />}
        openConnect={() => (variant === "row" && rowSlot ? setInline(true) : setOpen(true))}
      />,
      slot,
    );
  // The setup steps and the connected list: in a dialog from the rail, inline under the phone row.
  const panel = data && (
    <>
      <h2 className="mb-1 text-[22px] font-semibold">Connect an AI app</h2>
      <p className="mb-4 text-zinc-700">It can read this workspace’s goals, the agreed plan and decisions. It can’t propose or approve anything.</p>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-[10px] px-3 py-1.5 text-[15px] font-semibold ${tab === t.id ? "bg-violet-50 text-zinc-900 ring-1 ring-violet-700" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mb-4">
        <Steps tab={tab} url={data.url} />
      </div>
      {fresh.length > 0 ? (
        <div role="status" className="mb-5 rounded-[10px] border border-violet-700 bg-violet-50 p-3 text-[15px] text-zinc-900">
          <div className="font-semibold">
            {fresh.map((a) => `${a.name} is connected as ${teamOf(a.role)}`).join(". ")}.
          </div>
          Ask it:
          <Command text={TRY} />
          Align sees when each app last contacted it, not what it read or does.
        </div>
      ) : (
        <p className="mb-5 rounded-[10px] bg-zinc-50 p-3 text-[15px] text-zinc-700">
          Once it’s connected you’ll see it here. Then ask it: “{TRY}” Apps can check Align when you send them a message.
        </p>
      )}
      <h3 className="mb-2 text-[18px] font-semibold">Connected</h3>
      {data.apps.length === 0 ? (
        <p className="mb-4 text-zinc-600">No apps yet.</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {data.apps.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-zinc-200 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {a.name} <span className="font-normal text-zinc-500">({a.redirect_host})</span>
                </div>
                <div className="text-[14px] text-zinc-600">
                  As {teamOf(a.role)} · {a.last_used_at ? `last seen by Align ${when(a.last_used_at)}` : "Approved, not seen by Align yet"}
                </div>
                {a.last_used_at && (
                  <div className={`mt-1 text-[14px] ${a.on_current_plan ? "text-zinc-700" : "text-amber-800"}`}>
                    {a.on_current_plan
                      ? "✓ Seen on the current plan."
                      : `▲ Last seen on an older plan: Align hasn’t seen it since the plan changed${data.plan?.changed_at ? ` at ${when(data.plan.changed_at)}` : ""}.`}
                  </div>
                )}
              </div>
              {(a.role === actor || actor === "leadership") && (
                <Button kind="ghost" onClick={() => void disconnect(a.id)}>
                  Disconnect
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mb-3 text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setOpen(false);
            setInline(false);
          }}
        >
          Done
        </Button>
        {actor === "leadership" && data.apps.length > 0 && (
          <Button kind="danger" onClick={() => void disconnect()}>
            Disconnect all
          </Button>
        )}
      </div>
    </>
  );
  const dialog = open && data && (
    <div role="dialog" aria-modal="true" aria-label="Connect an AI app" className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setOpen(false)}>
      <div className="max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-[14px] bg-white p-6 text-[16px] text-zinc-900" onClick={(e) => e.stopPropagation()}>
        {panel}
      </div>
    </div>
  );
  if (variant === "row") {
    // Phones: one line. "connected" counts only apps Align has seen; "seen on the current plan" counts only the
    // server's on_current_plan. The open row shows the same steps and Connected list as the dialog, once.
    const current = reading.filter((a) => a.on_current_plan).length;
    return (
      <>
        {rowSlot &&
          createPortal(
            <section data-connect-ai="row" aria-label="Connected AI apps" className="mb-4 flex flex-col gap-3 rounded-[14px] border border-zinc-200 bg-white p-3.5 text-[14px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="min-w-0 flex-[1_1_12rem] text-[14px] leading-snug text-zinc-700">
                  <span className="font-semibold text-violet-700">Connected AI apps</span>
                  {data && (data.apps.length === 0 ? " · No AI app has connected yet" : ` · ${reading.length} connected · ${current} seen on the current plan`)}
                </p>
                <Button kind="secondary" onClick={() => setInline((o) => !o)}>
                  Connect an AI app
                </Button>
              </div>
              {inline && data && <div className="border-t border-zinc-200 pt-3 text-[16px] text-zinc-900">{panel}</div>}
            </section>,
            rowSlot,
          )}
        {firstRun}
        {/* Off Work, the first-run card's "connect" opens the same steps in the dialog. */}
        {dialog}
      </>
    );
  }
  return (
    <div data-connect-ai="rail" className="mt-auto flex flex-col gap-2 rounded-[14px] border border-zinc-200 bg-white p-3.5 text-[14px]">
      <span className="al-lbl !text-violet-700">Connected AI apps</span>
      {!data ? (
        <div className="text-[13px] text-zinc-600">{"\u00a0"}</div>
      ) : data.apps.length === 0 ? (
        <div className="text-[13px] text-zinc-600">No AI app has connected yet.</div>
      ) : (
        <ul aria-label="Connected AI apps" className="space-y-1">
          {reading.map((a) => (
            <li key={a.id} className="flex items-start gap-1.5 text-[13px] leading-snug">
              <span aria-hidden className={a.on_current_plan ? "text-violet-700" : "text-amber-700"}>
                {a.on_current_plan ? "✓" : "▲"}
              </span>
              <span className="min-w-0">
                <span className="font-semibold text-zinc-900">{a.name}</span>{" "}
                <span className={a.on_current_plan ? "text-zinc-700" : "text-amber-800"}>{a.on_current_plan ? "Seen on the current plan" : "Last seen on an older plan"}</span>
              </span>
            </li>
          ))}
          {data.apps
            .filter((a) => !a.last_used_at)
            .map((a) => (
              <li key={a.id} className="flex items-start gap-1.5 text-[13px] leading-snug text-zinc-500">
                <span aria-hidden>○</span>
                <span className="min-w-0">
                  <span className="font-semibold text-zinc-700">{a.name}</span> Approved, not seen by Align yet
                </span>
              </li>
            ))}
        </ul>
      )}
      <Button kind="secondary" onClick={() => setOpen(true)}>
        Connect an AI app
      </Button>
      {firstRun}
      {dialog}
    </div>
  );
}
