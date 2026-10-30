"use client";
import Link from "next/link";
import { useState } from "react";
import { api, go, Btn, Card, Err, Field, Input, Loading, Note, Pill, Shell, useAction, useApi, type WsSummary } from "./_ui/kit";
import type { Me } from "./_ui/server";

export default function Home({ me }: { me: Me }) {
  const list = useApi<{ workspaces: WsSummary[] }>("/api/v2/workspaces");
  const [name, setName] = useState("");
  const act = useAction();
  return (
    <Shell me={me}>
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Your workspaces</h1>
      <Card>
        {list.loading && <Loading />}
        <Err>{list.error}</Err>
        {list.data && list.data.workspaces.length === 0 && <Note>You are not in a workspace yet. Create one, or open an invite link someone sent you.</Note>}
        <ul className="divide-y divide-zinc-200">
          {list.data?.workspaces.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-3 py-3">
              <Link href={`/app/w/${w.id}`} className="text-[17px] text-zinc-900 hover:underline">
                {w.name}
              </Link>
              <Pill>{w.role}</Pill>
              {w.pods.map((p) => (
                <Pill key={p.id} tone="violet">
                  {p.name}
                  {p.role === "lead" ? " (lead)" : ""}
                </Pill>
              ))}
            </li>
          ))}
        </ul>
      </Card>
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
