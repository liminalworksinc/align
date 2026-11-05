"use client";
import { PAGE_H1 } from "@/app/app/_ui/page-title";
import Link from "next/link";
import { useState } from "react";
import { api, go, Btn, Err, Field, Input, Loading, Note, Pill, Shell, SignInAgain, useAction, useApi, when, type WsSummary } from "./_ui/kit";
import { EmptyState, Panel } from "./_ui/ds";
import type { CreationOptions, Me } from "./_ui/server";
import { useTurnstile } from "./_ui/turnstile";
import { firstRunWords } from "./_ui/words";
import { isBlankText } from "@/lib/v2/text-core.mts";

// LIM-2472 (stream R): the signed-in landing, token-only in both themes. The workspaces lead (left, or first on a
// phone); creating one and connecting a device sit beside them. Behaviour and every request are unchanged.
const H1 = PAGE_H1;

interface DeletedWs {
  id: string;
  name: string;
  deleted_at: string;
  restore_until: string;
}

export default function Home({ me, creation }: { me: Me; creation: CreationOptions }) {
  const list = useApi<{ workspaces: WsSummary[]; deleted: DeletedWs[] }>("/api/v2/workspaces");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const act = useAction();
  const sample = useAction();
  // Restoring needs a sign-in from the last 15 minutes: a 403 reauth_required shows Sign in again (useAction keeps it).
  const restore = useAction();
  // Hosted: the bot check (one token per create, reset after each try) and, in codes mode, a creation code.
  const bot = useTurnstile(creation.closed ? null : creation.captchaSiteKey);
  const create = (path: string, body: Record<string, string>) => api<{ id: string }>(path, { body, headers: bot.headers }).finally(bot.reset);
  // Someone with no workspace yet gets the same two paths as a workspace's first run (founder pick 9fae06af, "A at
  // empty/first time"): look around the sample, the one filled action, or start their own. Connecting a device needs a
  // workspace first, so it is not offered as a first step.
  const newcomer = !!list.data && list.data.workspaces.length === 0;
  const sampleOffered = newcomer && !creation.closed && !creation.needsCode;
  return (
    <Shell me={me}>
      <h1 className={`${H1} mb-5`}>Your workspaces</h1>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
      <Panel title="Workspaces" padded={false}>
        <div className="px-4 py-3 empty:hidden">
          {list.loading && <Loading />}
          <Err>{list.error}</Err>
          {list.data && list.data.workspaces.length === 0 && <EmptyState title="No workspaces yet" body={firstRunWords(creation)} />}
        </div>
        {!!list.data?.workspaces.length && (
          <ul className="divide-y divide-(--line)">
            {list.data.workspaces.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 hover:bg-(--bg-raised)">
                <Link href={`/app/w/${w.id}`} className="inline-flex min-h-[44px] min-w-0 flex-1 basis-[12rem] items-center text-[16px] font-medium text-(--text-1) hover:underline">
                  {w.name}
                </Link>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Pill>{w.role}</Pill>
                  {w.teams.map((p) => (
                    <Pill key={p.id} tone="violet">
                      {p.name}
                      {p.role === "lead" ? " (lead)" : ""}
                    </Pill>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {/* Where a workspace needs a creation code, the code goes to the person's real workspace: no sample offer. */}
      {list.data && list.data.workspaces.length === 0 && !creation.closed && !creation.needsCode && (
        <Panel title="Try Align with a sample" actions={<Pill tone="violet">Fictional</Pill>}>
          <p className="mb-3 max-w-prose text-[15px] text-(--text-2)">
            Northstar is a made-up company with a company goal, two team goals that contribute to it and a change request waiting for a decision. You own all of it, so you can try every step. It is an ordinary workspace you can delete from its People tab.
          </p>
          <Btn
            disabled={sample.busy || !bot.ready}
            kind="primary"
            onClick={() =>
              void sample.run(async () => {
                const w = await create("/api/v2/workspaces/sample", {});
                go(`/app/w/${w.id}`);
              })
            }
          >
            Create the Northstar sample
          </Btn>
          {!bot.ready && <Note>Complete the check under &quot;Or start your own&quot; first.</Note>}
          <Err>{sample.error}</Err>
        </Panel>
      )}
      {restore.reauth && (
        <SignInAgain me={me} next="/app">
          {restore.reauth}
        </SignInAgain>
      )}
      {!!list.data?.deleted.length && (
        <Panel title="Deleted workspaces">
          <ul className="divide-y divide-(--line)">
            {list.data.deleted.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0">
                <span className="basis-full text-[16px] font-medium text-(--text-1)">{w.name}</span>
                <span className="min-w-0 flex-1 basis-[16rem] text-[14px] text-(--text-2)">
                  Deleted {when(w.deleted_at)}. You can restore it until {when(w.restore_until)}; then it is erased. Restoring brings back its members and history, but not its connected AI apps: each one has to connect again.
                </span>
                <span>
                  <Btn
                    kind="secondary"
                    disabled={restore.busy}
                    onClick={() => void restore.run(() => api(`/api/v2/workspaces/${w.id}/restore`, { body: {} }), list.reload)}
                  >
                    Restore
                  </Btn>
                </span>
              </li>
            ))}
          </ul>
          <Err>{restore.error}</Err>
        </Panel>
      )}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
      <Panel title={sampleOffered ? "Or start your own" : "Create a workspace"}>
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
                <p className="mb-3 text-[14px] text-(--text-2)">
                  No code yet?{" "}
                  <Link href="/app/request-access" className="font-medium text-(--accent-text) underline underline-offset-2">
                    Request access
                  </Link>
                </p>
              </>
            )}
            {bot.widget}
            <Btn type="submit" kind={sampleOffered ? "secondary" : "primary"} disabled={act.busy || isBlankText(name) || (creation.needsCode && !code.trim()) || !bot.ready}>
              Create
            </Btn>
            <Err>{act.error}</Err>
          </form>
        )}
      </Panel>
      {list.data && !newcomer && (
        <Panel title="Connect a device">
          <p className="text-[15px] text-(--text-2)">
            Run <code className="rounded-[6px] bg-(--bg-inset) px-1.5 py-0.5 font-mono text-[13px] text-(--text-1)">align login</code> on your machine, then enter the code it shows on the device page.
          </p>
          <Link href="/app/device" className="mt-2 inline-flex min-h-[44px] items-center text-[15px] font-medium text-(--text-1) underline underline-offset-2 sm:min-h-[36px]">
            Enter a device code
          </Link>
        </Panel>
      )}
      </div>
      </div>
    </Shell>
  );
}
