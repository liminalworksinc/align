"use client";
import { useState } from "react";
import { api, Shell, useAction, useApi, when } from "../../../_ui/kit";
import { EmptyState, EvidenceLabel, Panel } from "../../../_ui/ds";
import type { Me } from "../../../_ui/server";
import { claudeCodeLine, codexLine } from "@/lib/paste-lines";

// The Apps tab (LIM-2472 workstream S, item 3): AI apps connected to this workspace through Align's OAuth server, as
// self-contained panels: how to connect one, what Align can and can't tell about an app, and the connections. A
// person sees and disconnects their own connections; a workspace owner sees and disconnects everyone's. The Claude Code
// and Codex lines are built from the URL alone by lib/paste-lines.ts, which quotes it and shows no line for a URL Align
// could not have made; no workspace or company name goes into them. The table keeps its column names and cell labels
// (test-v2 reads them): Last connected is not a read; only Last read the goals is a receipt.

const BTN =
  "inline-flex min-h-[36px] max-sm:min-h-[44px] items-center justify-center rounded-(--radius-s) border px-3 text-[14px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus) disabled:opacity-60";
const CODE =
  "min-w-0 flex-1 rounded-(--radius-s) border border-(--line) bg-(--bg-inset) px-2.5 py-1.5 font-mono text-[13px] text-(--text-1) [overflow-wrap:anywhere]";

function CopyRow({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className={CODE}>{text}</code>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        className={`${BTN} border-(--edge) bg-(--bg-raised) text-(--text-1) hover:bg-(--bg-overlay)`}
        onClick={() => {
          void navigator.clipboard?.writeText(text).catch(() => undefined);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** One terminal line with its own Copy button, or the reason there is none. */
function PasteLine({ label, line }: { label: string; line: string | null }) {
  return (
    <div className="flex flex-col gap-1.5" data-paste-line={label}>
      <p className="text-[14px] font-medium text-(--text-1)">{label}</p>
      {line === null ? (
        <p className="text-[14px] text-(--text-2)">
          This server&apos;s address can&apos;t be turned into a command. Copy
          the URL instead.
        </p>
      ) : (
        <CopyRow text={line} label={`the ${label} command`} />
      )}
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 border-t border-(--line) py-3 first:border-t-0 first:pt-0">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-(--edge) font-mono text-[12px] text-(--text-2)"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-[14px] font-semibold text-(--text-1)">{title}</p>
        {children}
      </div>
    </li>
  );
}

interface App {
  id: string;
  name: string;
  redirect_host: string;
  user: { id: string; name: string };
  approved_at: string;
  /** The last MCP request from the app (initialize and tools/list included): it connected. Not a read. */
  last_used_at: string | null;
  /** The last tool call that returned goals to the app: the only read Align observes. */
  last_read_at: string | null;
  /** "goals:read", plus "changes:evidence" when the person let it add evidence links. */
  scopes: string[];
}

export default function AppsPage({ me, ws }: { me: Me; ws: string }) {
  const apps = useApi<{ url: string; apps: App[] }>(
    `/api/v2/workspaces/${ws}/apps`,
  );
  const detail = useApi<{ role: "owner" | "member" | "viewer"; me: string }>(
    `/api/v2/workspaces/${ws}`,
  );
  const act = useAction();
  const role = detail.data?.role;
  const list = apps.data?.apps ?? [];
  const read = list.filter((a) => a.last_read_at).length;

  const disconnect = (a: App) =>
    act.run(
      () => api(`/api/v2/workspaces/${ws}/apps/${a.id}`, { method: "DELETE" }),
      apps.reload,
    );

  return (
    <Shell me={me} ws={ws} tab="Apps">
      <div data-surface="apps" className="flex min-w-0 flex-col gap-4">
        <div>
          <h1 className="mb-1 text-[26px] font-semibold text-(--text-1)">
            Connected AI apps
          </h1>
          <p className="max-w-prose text-[15px] text-(--text-2)">
            Apps connected to this workspace through Align&apos;s MCP server,
            each reading as the person who connected it. They can read; they
            can&apos;t change anything.
          </p>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
          {/* Stable anchor: Home and first run in both concepts link to /app/w/<ws>/apps#connect. */}
          <div
            id="connect"
            className="min-w-0 scroll-mt-4 lg:col-span-2 xl:col-span-1"
          >
            <Panel
              eyebrow="Set up"
              title="Connect an AI app"
              className="h-full"
            >
              {!apps.data || !role ? (
                <p className="text-[14px] text-(--text-2)">
                  {apps.error ?? "Loading…"}
                </p>
              ) : role === "viewer" ? (
                <p className="text-[15px] text-(--text-1)">
                  Viewers can&apos;t connect apps to this workspace. A member or
                  an owner can.
                </p>
              ) : (
                <ol className="flex flex-col">
                  <Step n={1} title="Add Align's MCP server to your AI app">
                    <p className="text-[14px] text-(--text-2)">
                      It sends you to Align to sign in and choose this
                      workspace.
                    </p>
                    <CopyRow text={apps.data.url} label="the MCP server URL" />
                  </Step>
                  <Step n={2} title="Or add it from a terminal">
                    <p className="text-[14px] text-(--text-2)">
                      Paste into a sh, bash or zsh terminal:
                    </p>
                    <PasteLine
                      label="Claude Code"
                      line={claudeCodeLine(apps.data.url)}
                    />
                    <PasteLine label="Codex" line={codexLine(apps.data.url)} />
                  </Step>
                  <Step n={3} title="Approve it in Align">
                    <p className="text-[14px] text-(--text-2)">
                      Your app opens Align&apos;s approval page. Once you
                      approve, it is listed under Connections below. For goal
                      context inside Claude Code and Codex sessions, install the
                      align CLI (
                      <code className="font-mono text-[13px]">align login</code>
                      ,{" "}
                      <code className="font-mono text-[13px]">
                        align install
                      </code>
                      ).
                    </p>
                  </Step>
                </ol>
              )}
            </Panel>
          </div>

          <Panel
            eyebrow="What Align can tell"
            title="Connected is not the same as read"
          >
            <dl className="flex flex-col gap-3 text-[14px]">
              <div className="flex flex-col gap-1">
                <dt className="font-semibold text-(--text-1)">
                  Last connected
                </dt>
                <dd className="text-(--text-2)">
                  The app&apos;s last request to Align, connecting and listing
                  tools included. It says the app reached Align, not that it
                  read anything.
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="flex flex-wrap items-center gap-2 font-semibold text-(--text-1)">
                  Last read the goals <EvidenceLabel kind="receipt" size="s" />
                </dt>
                <dd className="text-(--text-2)">
                  The app&apos;s last call that returned goals: Align served
                  them and recorded it.
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="flex flex-wrap items-center gap-2 font-semibold text-(--text-1)">
                  Never read <EvidenceLabel kind="unobserved" size="s" />
                </dt>
                <dd className="text-(--text-2)">
                  Connected, but Align hasn&apos;t served it goals yet.
                </dd>
              </div>
              <p className="border-t border-(--line) pt-3 text-[13px] text-(--text-3)">
                Align doesn&apos;t see which goal version an app has or what it
                does with it.
              </p>
            </dl>
          </Panel>

          <Panel
            eyebrow="This workspace"
            title={role === "owner" ? "Everyone's apps" : "Your apps"}
          >
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-[14px]">
              <dt className="text-(--text-2)">Connected</dt>
              <dd className="font-mono tabular-nums text-(--text-1)">
                {apps.data ? list.length : "–"}
              </dd>
              <dt className="text-(--text-2)">Have read the goals</dt>
              <dd className="font-mono tabular-nums text-(--text-1)">
                {apps.data ? read : "–"}
              </dd>
              <dt className="text-(--text-2)">Never read</dt>
              <dd className="font-mono tabular-nums text-(--text-1)">
                {apps.data ? list.length - read : "–"}
              </dd>
            </dl>
            <p className="mt-3 text-[13px] text-(--text-3)">
              {role === "owner"
                ? "As a workspace owner you see every connection here."
                : "You see the apps you connected. Owners see everyone's."}
            </p>
          </Panel>
        </div>

        <Panel
          eyebrow="Connections"
          title={
            apps.data
              ? `${list.length} ${list.length === 1 ? "app" : "apps"}`
              : "Connections"
          }
          padded={false}
        >
          <div className="p-4">
            {apps.loading && (
              <p className="text-[14px] text-(--text-2)">Loading…</p>
            )}
            {(apps.error ?? act.error) && (
              <p role="alert" className="text-[14px] text-(--st-declined)">
                {apps.error ?? act.error}
              </p>
            )}
            {apps.data && list.length === 0 && (
              <EmptyState
                title="No AI apps are connected to this workspace."
                body={
                  role === "viewer"
                    ? "Nothing is reading this workspace's goals through an app."
                    : "Nothing is reading this workspace's goals through an app yet. Connect one above; it is listed here once you approve it, and its first goal read is recorded under Last read the goals."
                }
              />
            )}
            {list.length > 0 && (
              <div>
                <table className="w-full border-collapse text-[14px] max-md:block">
                  <thead className="max-md:sr-only">
                    <tr className="border-b border-(--line) text-left text-[12.5px] text-(--text-3)">
                      <th className="py-2 pr-3 font-medium">App</th>
                      <th className="py-2 pr-3 font-medium">
                        Sends you back to
                      </th>
                      <th className="py-2 pr-3 font-medium">Connected by</th>
                      <th className="py-2 pr-3 font-medium">Approved</th>
                      <th className="py-2 pr-3 font-medium">Last connected</th>
                      <th className="py-2 pr-3 font-medium">
                        Last read the goals
                      </th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="max-md:flex max-md:flex-col max-md:gap-3">
                    {list.map((a) => {
                      const mine = a.user.id === detail.data?.me;
                      const cell =
                        "py-2.5 pr-3 align-top text-(--text-1) max-md:flex max-md:gap-2 max-md:py-0.5 max-md:before:min-w-[10.5rem] max-md:before:text-(--text-3) max-md:before:content-[attr(data-label)]";
                      return (
                        <tr
                          key={a.id}
                          className="border-b border-(--line) last:border-b-0 max-md:flex max-md:flex-col max-md:rounded-(--radius-m) max-md:border max-md:border-(--line) max-md:bg-(--bg-raised) max-md:p-3"
                        >
                          <td className="py-2.5 pr-3 align-top max-md:pb-2">
                            <span className="font-semibold text-(--text-1)">
                              {a.name}
                            </span>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-(--text-2)">
                              <EvidenceLabel
                                kind={a.last_read_at ? "receipt" : "unobserved"}
                                size="s"
                              />
                              {a.scopes.includes("changes:evidence")
                                ? "Reads, and adds evidence links"
                                : "Reads only"}
                            </div>
                          </td>
                          <td
                            data-label="Sends you back to"
                            className={`${cell} font-mono text-[13px]`}
                          >
                            {a.redirect_host}
                          </td>
                          <td data-label="Connected by" className={cell}>
                            {mine ? `${a.user.name} (you)` : a.user.name}
                          </td>
                          <td data-label="Approved" className={cell}>
                            {when(a.approved_at)}
                          </td>
                          <td data-label="Last connected" className={cell}>
                            {a.last_used_at ? when(a.last_used_at) : "Never"}
                          </td>
                          <td data-label="Last read the goals" className={cell}>
                            {a.last_read_at
                              ? when(a.last_read_at)
                              : "Not seen yet"}
                          </td>
                          <td className="py-2.5 text-right align-top max-md:pt-2 max-md:text-left">
                            {role === "owner" || mine ? (
                              <button
                                type="button"
                                className={`${BTN} border-(--st-declined) text-(--st-declined) hover:bg-(--st-declined-soft)`}
                                onClick={() => void disconnect(a)}
                                disabled={act.busy}
                              >
                                Disconnect
                              </button>
                            ) : (
                              <span className="text-[13px] text-(--text-3)">
                                Only {a.user.name} or an owner can disconnect it
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-[13px] text-(--text-3)" data-apps-times>
                  Last connected is the app&apos;s last request to Align,
                  connecting and listing tools included. Last read the goals is
                  its last call that returned goals. Each is recorded at most
                  every 5 minutes. Align doesn&apos;t see which goal version an
                  app has or what it does with it.
                </p>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </Shell>
  );
}
