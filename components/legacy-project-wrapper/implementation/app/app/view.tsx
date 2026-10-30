"use client";
import Link from "next/link";
import { useState } from "react";
import { api, go, Btn, Card, Err, Field, Input, Loading, Note, Pill, Shell, useAction, useApi, type WsSummary } from "./_ui/kit";
import type { CreationOptions, Me } from "./_ui/server";
import { useTurnstile } from "./_ui/turnstile";

export default function Home({ me, creation }: { me: Me; creation: CreationOptions }) {
  const list = useApi<{ workspaces: WsSummary[] }>("/api/v2/workspaces");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const act = useAction();
  const sample = useAction();
  // Hosted: the bot check (one token per create, reset after each try) and, in codes mode, a creation code.
  const bot = useTurnstile(creation.closed ? null : creation.captchaSiteKey);
  const create = (path: string, body: Record<string, string>) => api<{ id: string }>(path, { body, headers: bot.headers }).finally(bot.reset);
  return (
    <Shell me={me}>
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Your workspaces</h1>
      <Card>
        {list.loading && <Loading />}
        <Err>{list.error}</Err>
        {list.data && list.data.workspaces.length === 0 && <Note>You are not in a workspace yet. Create one, open an invite link someone sent you, or start from a sample.</Note>}
        <ul className="divide-y divide-zinc-200">
          {list.data?.workspaces.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-3 py-3">
              <Link href={`/app/w/${w.id}`} className="text-[17px] text-zinc-900 hover:underline">
                {w.name}
              </Link>
              <Pill>{w.role}</Pill>
              {w.teams.map((p) => (
                <Pill key={p.id} tone="violet">
                  {p.name}
                  {p.role === "lead" ? " (lead)" : ""}
                </Pill>
              ))}
            </li>
          ))}
        </ul>
      </Card>
      {/* Where a workspace needs a creation code, the code goes to the person's real workspace: no sample offer. */}
      {list.data && list.data.workspaces.length === 0 && !creation.closed && !creation.needsCode && (
        <Card title="Try Align with a sample">
          <p className="mb-3 text-[15px] text-zinc-600">
            Northstar is a made-up company with a company goal, two team goals that contribute to it and a change request waiting for a decision. You own all of it, so you can try every step. It is an ordinary workspace you can rename or delete.
          </p>
          <Btn
            disabled={sample.busy || !bot.ready}
            onClick={() =>
              void sample.run(async () => {
                const w = await create("/api/v2/workspaces/sample", {});
                go(`/app/w/${w.id}`);
              })
            }
          >
            Create the Northstar sample
          </Btn>
          {!bot.ready && <Note>Complete the check under &quot;Create a workspace&quot; first.</Note>}
          <Err>{sample.error}</Err>
        </Card>
      )}
      <Card title="Create a workspace">
        {creation.closed ? (
          <Note>New workspaces can&apos;t be created on this server right now. Contact its operator.</Note>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act.run(async () => {
                const w = await create("/api/v2/workspaces", creation.needsCode ? { name, creation_code: code.trim() } : { name });
                go(`/app/w/${w.id}`);
              });
            }}
          >
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
            </Field>
            {creation.needsCode && (
              <>
                <Field label="Creation code" hint="Each code creates one workspace. It came in the email that answered your access request.">
                  <Input name="creation_code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={100} autoComplete="off" placeholder="alc_…" required />
                </Field>
                <p className="mb-3 text-[14px] text-zinc-600">
                  No code yet?{" "}
                  <Link href="/app/request-access" className="underline">
                    Request access
                  </Link>
                </p>
              </>
            )}
            {bot.widget}
            <Btn type="submit" disabled={act.busy || !name.trim() || (creation.needsCode && !code.trim()) || !bot.ready}>
              Create
            </Btn>
            <Err>{act.error}</Err>
          </form>
        )}
      </Card>
      <Card title="Connect a device">
        <p className="text-[15px] text-zinc-600">
          Run <code className="font-mono">align login</code> on your machine, then enter the code it shows at{" "}
          <Link href="/app/device" className="underline">
            /app/device
          </Link>
          .
        </p>
      </Card>
    </Shell>
  );
}
