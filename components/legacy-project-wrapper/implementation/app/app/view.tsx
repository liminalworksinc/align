"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError, go, Btn, Card, Err, Field, Input, Loading, Note, Pill, Shell, SignInAgain, useAction, useApi, when, type WsSummary } from "./_ui/kit";
import type { Me } from "./_ui/server";

interface DeletedWs {
  id: string;
  name: string;
  deleted_at: string;
  restore_until: string;
}

export default function Home({ me }: { me: Me }) {
  const list = useApi<{ workspaces: WsSummary[]; deleted: DeletedWs[] }>("/api/v2/workspaces");
  const [name, setName] = useState("");
  const act = useAction();
  const sample = useAction();
  const restore = useAction();
  const [reauth, setReauth] = useState(false);
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
      {list.data && list.data.workspaces.length === 0 && (
        <Card title="Try Align with a sample">
          <p className="mb-3 text-[15px] text-zinc-600">
            Northstar is a made-up company with a company goal, two team goals that contribute to it and a change request waiting for a decision. You own all of it, so you can try every step. It is an ordinary workspace you can rename or delete.
          </p>
          <Btn
            disabled={sample.busy}
            onClick={() =>
              void sample.run(async () => {
                const w = await api<{ id: string }>("/api/v2/workspaces/sample", { body: {} });
                go(`/app/w/${w.id}`);
              })
            }
          >
            Create the Northstar sample
          </Btn>
          <Err>{sample.error}</Err>
        </Card>
      )}
      {reauth && (
        <SignInAgain me={me} next="/app">
          Sign in again to restore a workspace. Restoring needs a sign-in from the last 15 minutes.
        </SignInAgain>
      )}
      {!!list.data?.deleted.length && (
        <Card title="Deleted workspaces">
          <ul className="divide-y divide-zinc-200">
            {list.data.deleted.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="text-[17px] text-zinc-900">{w.name}</span>
                <span className="text-[14px] text-zinc-500">
                  Deleted {when(w.deleted_at)}. You can restore it until {when(w.restore_until)}; then it is erased.
                </span>
                <span className="ml-auto">
                  <Btn
                    kind="secondary"
                    disabled={restore.busy}
                    onClick={() =>
                      void restore.run(async () => {
                        try {
                          await api(`/api/v2/workspaces/${w.id}/restore`, { body: {} });
                        } catch (e) {
                          if (e instanceof ApiError && e.code === "reauth_required") setReauth(true);
                          throw e;
                        }
                      }, list.reload)
                    }
                  >
                    Restore
                  </Btn>
                </span>
              </li>
            ))}
          </ul>
          <Err>{restore.error}</Err>
        </Card>
      )}
      <Card title="Create a workspace">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act.run(async () => {
              const w = await api<{ id: string }>("/api/v2/workspaces", { body: { name } });
              go(`/app/w/${w.id}`);
            });
          }}
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
          </Field>
          <Btn type="submit" disabled={act.busy || !name.trim()}>
            Create
          </Btn>
          <Err>{act.error}</Err>
        </form>
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
