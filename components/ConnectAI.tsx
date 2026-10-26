"use client";
import { useCallback, useEffect, useState } from "react";
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

type Tab = "claude" | "chatgpt" | "claude-code" | "codex";
const TABS: { id: Tab; label: string }[] = [
  { id: "claude", label: "Claude app" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
];

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

function Steps({ tab, url }: { tab: Tab; url: string }) {
  if (tab === "claude")
    return (
      <div>
        <p>In the Claude desktop app, Cowork or claude.ai: open Customize, then Connectors. Choose Add custom connector, paste the URL above, then Connect.</p>
        <p className="mt-2 text-zinc-600">On a Team or Enterprise plan only an owner can add a connector. To test on your own, use a personal plan (Free allows one custom connector).</p>
      </div>
    );
  if (tab === "chatgpt")
    return (
      <div>
        <p>On chatgpt.com: open Plugins, choose +, then Add custom MCP server. Paste the URL above and sign in.</p>
        <p className="mt-2 text-zinc-600">This is on the web. Pro and Enterprise can add it; on Business only an admin can. It may not be on Plus yet.</p>
      </div>
    );
  if (tab === "claude-code")
    return (
      <div>
        <p>In a terminal:</p>
        <Command text={`claude mcp add --transport http align ${url}`} />
        <p>Then in Claude Code run /mcp, pick align and choose Authenticate.</p>
      </div>
    );
  return (
    <div>
      <p>In a terminal:</p>
      <Command text={`codex mcp add align --url ${url}`} />
      <Command text="codex mcp login align" />
      <p className="text-zinc-600">The Codex CLI, the IDE extension and the ChatGPT desktop app’s Codex mode share this setting.</p>
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function ConnectAI({ workspace, teamOf, actor }: { workspace: string; teamOf: (role: string) => string; actor: string }) {
  const [data, setData] = useState<{ url: string; apps: App[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("claude");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<{ url: string; apps: App[] }>("/api/workspaces/connections", { workspace }).then(
        (d) => setData(d),
        () => setData(null),
      ),
    [workspace],
  );

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 15000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

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
  return (
    <div className="mt-auto flex flex-col gap-2 rounded-[14px] border border-zinc-200 bg-white p-3.5 text-[14px]">
      <span className="al-lbl !text-violet-700">Your AI apps</span>
      <div className="text-[13px] text-zinc-600">{reading.length ? `${reading.length} reading this workspace` : "None connected"}</div>
      <Button kind="secondary" onClick={() => setOpen(true)}>
        Connect an AI app
      </Button>
      {open && data && (
        <div role="dialog" aria-modal="true" aria-label="Connect an AI app" className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-[14px] bg-white p-6 text-[16px] text-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-[22px] font-semibold">Connect an AI app</h2>
            <p className="mb-4 text-zinc-700">
              Your AI app can read this workspace’s goals, the agreed plan and decisions, and see when a goal changes. It can’t propose or approve anything. When you connect, you sign in with a team’s passcode.
            </p>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <code className="break-all rounded-[8px] bg-zinc-100 px-3 py-2 font-mono text-[14px]">{data.url}</code>
              <Copy value={data.url} />
            </div>
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
            <p className="mb-5 rounded-[10px] bg-zinc-50 p-3 text-[15px] text-zinc-700">
              Apps read Align when you send them a message. After a goal changes here, send your app another message and it will see the change.
            </p>
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
