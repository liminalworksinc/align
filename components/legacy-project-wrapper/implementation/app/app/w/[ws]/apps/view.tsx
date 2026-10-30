"use client";
import { useState } from "react";
import { api, Btn, Card, Err, Loading, Note, Shell, useAction, useApi, when } from "../../../_ui/kit";
import type { Me } from "../../../_ui/server";

// The Apps tab: AI apps connected to this workspace through Align's OAuth server, and how to connect one. A person
// sees and disconnects their own connections; a workspace owner sees and disconnects everyone's.

interface App {
  id: string;
  name: string;
  redirect_host: string;
  user: { id: string; name: string };
  approved_at: string;
  last_used_at: string | null;
}

export default function AppsPage({ me, ws }: { me: Me; ws: string }) {
  const apps = useApi<{ url: string; apps: App[] }>(`/api/v2/workspaces/${ws}/apps`);
  const detail = useApi<{ role: "owner" | "member" | "viewer"; me: string }>(`/api/v2/workspaces/${ws}`);
  const act = useAction();
  const [copied, setCopied] = useState(false);
  const role = detail.data?.role;

  const disconnect = (a: App) => act.run(() => api(`/api/v2/workspaces/${ws}/apps/${a.id}`, { method: "DELETE" }), apps.reload);
  const copy = async (url: string) => {
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopied(true);
  };

  return (
    <Shell me={me} ws={ws} tab="Apps">
      <h1 className="mb-2 text-[26px] font-semibold text-zinc-900">Connected AI apps</h1>
      <p className="mb-5 text-[15px] text-zinc-600">Apps that read this workspace through Align&apos;s MCP server, each as the person who connected it. They can read; they can&apos;t change anything.</p>
      <Card title="Connect an AI app">
        {!apps.data || !role ? (
          <Loading />
        ) : role === "viewer" ? (
          <p className="text-[15px]">Viewers can&apos;t connect apps to this workspace.</p>
        ) : (
          <>
            <p className="mb-3 text-[15px]">Add this MCP server URL to your AI app. It will send you to Align to sign in and choose this workspace.</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-[8px] bg-zinc-100 px-2 py-1 font-mono text-[14px] text-zinc-900">{apps.data.url}</code>
              <Btn kind="secondary" onClick={() => void copy(apps.data!.url)}>
                {copied ? "Copied" : "Copy"}
              </Btn>
            </div>
          </>
        )}
      </Card>
      <Card title="Connections">
        {apps.loading && <Loading />}
        <Err>{apps.error ?? act.error}</Err>
        {apps.data && apps.data.apps.length === 0 && <Note>No AI apps are connected to this workspace.</Note>}
        {apps.data && apps.data.apps.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="text-left text-[13px] text-zinc-500">
                  <th className="py-2 pr-3 font-normal">App</th>
                  <th className="py-2 pr-3 font-normal">Sends you back to</th>
                  <th className="py-2 pr-3 font-normal">Connected by</th>
                  <th className="py-2 pr-3 font-normal">Approved</th>
                  <th className="py-2 pr-3 font-normal">Last read</th>
                  <th className="py-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {apps.data.apps.map((a) => (
                  <tr key={a.id} className="border-t border-zinc-200 align-top">
                    <td className="py-2 pr-3 text-zinc-900">{a.name}</td>
                    <td className="py-2 pr-3 font-mono text-[14px]">{a.redirect_host}</td>
                    <td className="py-2 pr-3">{a.user.name}</td>
                    <td className="py-2 pr-3">{when(a.approved_at)}</td>
                    <td className="py-2 pr-3">{a.last_used_at ? when(a.last_used_at) : "Never"}</td>
                    <td className="py-2 text-right">
                      {(role === "owner" || a.user.id === detail.data?.me) && (
                        <Btn kind="danger" onClick={() => void disconnect(a)} disabled={act.busy}>
                          Disconnect
                        </Btn>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Shell>
  );
}
