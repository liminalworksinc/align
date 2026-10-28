"use client";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { api } from "@/components/useAlign";

// "Your AI apps" in a custom workspace's sidebar: the one URL any AI app connects with (Align's read-only MCP
// endpoint, OAuth sign-in with a team passcode), the steps for each app, and the apps connected now. An app shows as
// connected only after its first successful read (last_used_at), never just because someone approved it.

interface App {
  id: string;
  name: string;
  redirect_host: string;
  role: string;
  approved_at: string;
  last_used_at: string | null;
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

function Command({ text }: { text: string }) {
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

// One paste for the terminal apps: the command adds Align and starts the sign-in. The chat apps take the URL.
function Steps({ tab, url }: { tab: Tab; url: string }) {
  const allow = <Step n={2}>Your browser opens an Align page. Check the workspace and team, then choose Allow.</Step>;
  if (tab === "claude-code")
    return (
      <ol className="space-y-3">
        <Step n={1}>
          Paste this in a terminal:
          <Command text={`claude mcp add --transport http --scope user align ${url}; claude mcp login align`} />
          <span className="text-zinc-600">It works in every folder. Already in Claude Code? Run the same line with ! in front, or type /mcp.</span>
        </Step>
        {allow}
      </ol>
    );
  if (tab === "codex")
    return (
      <ol className="space-y-3">
        <Step n={1}>
          Paste this in a terminal:
          <Command text={`codex mcp add align --url ${url}`} />
          <span className="text-zinc-600">The Codex CLI, IDE extension and the ChatGPT desktop app’s Codex mode all use it.</span>
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

export default function ConnectAI({ workspace, teamOf, actor }: { workspace: string; teamOf: (role: string) => string; actor: string }) {
  const [data, setData] = useState<{ url: string; apps: App[]; at: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("claude-code");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<{ url: string; apps: App[] }>("/api/workspaces/connections", { workspace }).then(
        (d) => setData({ ...d, at: Date.now() }),
        () => setData(null),
      ),
    [workspace],
  );

  // Every 3 s while the dialog is open, so a newly connected app shows up while the person is still looking.
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), open ? 3000 : 15000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, open]);



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
  // Just connected: approved in the last 15 minutes and has read the workspace. Then the dialog says so and suggests
  // a first question.
  const fresh = reading.filter((a) => data && data.at - Date.parse(a.approved_at) < 15 * 60 * 1000);
  return (
    <div className="mt-auto flex flex-col gap-2 rounded-[14px] border border-zinc-200 bg-white p-3.5 text-[14px]">
      <span className="al-lbl !text-violet-700">Your AI apps</span>
      <div className="text-[13px] text-zinc-600">{!data ? "\u00a0" : reading.length ? `${reading.length} reading this workspace` : "None connected"}</div>
      <Button kind="secondary" onClick={() => setOpen(true)}>
        Connect an AI app
      </Button>
      {open && data && (
        <div role="dialog" aria-modal="true" aria-label="Connect an AI app" className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-[14px] bg-white p-6 text-[16px] text-zinc-900" onClick={(e) => e.stopPropagation()}>
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
                After a goal changes here, send it another message and it will see the change.
              </div>
            ) : (
              <p className="mb-5 rounded-[10px] bg-zinc-50 p-3 text-[15px] text-zinc-700">
                Once it’s connected you’ll see it here. Then ask it: “{TRY}” Apps check Align each time you send a message.
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
                        As {teamOf(a.role)} · {a.last_used_at ? `last read ${when(a.last_used_at)}` : "approved, hasn’t read anything yet"}
                      </div>
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
              <Button onClick={() => setOpen(false)}>Done</Button>
              {actor === "leadership" && data.apps.length > 0 && (
                <Button kind="danger" onClick={() => void disconnect()}>
                  Disconnect all
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
