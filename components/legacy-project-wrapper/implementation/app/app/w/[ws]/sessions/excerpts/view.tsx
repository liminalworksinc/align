"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, Shell, useAction, useApi, when } from "../../../../_ui/kit";
import { PAGE_H1 } from "../../../../_ui/page-title";
import type { Me } from "../../../../_ui/server";
import { Btn, Err, Loading, Note } from "../parts";

type Summary = { id: string; shared_by: string; purpose: string; expires_at: string; can_revoke: boolean };
type OpenExcerpt = Summary & { text: string };

export default function Excerpts({ me, ws }: { me: Me; ws: string }) {
  const url = `/api/v2/workspaces/${ws}/excerpts`;
  const data = useApi<{ excerpts: Summary[] }>(url);
  const { reload } = data;
  const action = useAction();
  const [opened, setOpened] = useState<OpenExcerpt | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<Set<string>>(() => new Set());
  const [accessEnded, setAccessEnded] = useState(false);
  const rows = data.data?.excerpts.filter(({ id }) => !unavailable.has(id));

  function requestExcerpt(id: string, remove = false) {
    void action.run(async () => {
      setAccessEnded(false);
      try {
        if (remove) {
          await api(`${url}/${id}`, { method: "DELETE" });
        } else {
          setOpened(await api<OpenExcerpt>(`${url}/${id}`));
          return;
        }
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 404) throw e;
        setAccessEnded(true);
      }
      setUnavailable((current) => new Set(current).add(id));
      setOpened((current) => current?.id === id ? null : current);
      setRevoking(null);
      reload();
    });
  }

  useEffect(() => {
    function refresh() {
      setOpened(null);
      reload();
    }
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [reload]);

  useEffect(() => {
    if (!opened) return;
    const remaining = Date.parse(opened.expires_at) - Date.now();
    const timer = setTimeout(() => {
      setOpened(null);
      reload();
    }, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [opened, reload]);

  return (
    <Shell me={me} ws={ws} tab="Sessions">
      <Link href={`/app/w/${ws}/sessions`} className="mb-3 inline-block text-(--accent-text) underline">Back to sessions</Link>
      <h1 className={`${PAGE_H1} mb-2`}>Shared excerpts</h1>
      <p className="mb-4 text-[15px] text-(--text-2)">To share part of a session, run <code>align excerpt</code> on the machine that shared it.</p>
      {data.loading && <Loading />}
      <Err>{data.error ?? action.error}</Err>
      {accessEnded && <p role="status" className="my-3 text-[14px] text-(--text-2)">Access to this excerpt ended.</p>}
      {rows?.length === 0 && <Note>No active excerpts shared by or with you.</Note>}
      <ul className="min-w-0 divide-y divide-(--line)">
        {rows?.map((row) => (
          <li key={row.id} className="min-w-0 py-4 [overflow-wrap:anywhere]">
            <p className="font-medium">{row.purpose}</p>
            <p className="my-2 text-[14px] text-(--text-2)">
              Shared by {row.shared_by}. Expires <time dateTime={row.expires_at} title={row.expires_at}>{when(row.expires_at)}</time>.
            </p>
            <div className="flex flex-wrap gap-2">
              <Btn disabled={action.busy} onClick={() => {
                if (opened?.id === row.id) setOpened(null);
                else requestExcerpt(row.id);
              }}>{opened?.id === row.id ? "Close excerpt" : "Read excerpt"}</Btn>
              {row.can_revoke && <Btn kind="danger" disabled={action.busy} onClick={() => setRevoking(row.id)}>Revoke access</Btn>}
            </div>
            {revoking === row.id && (
              <div className="my-3">
                <p className="mb-2 text-[14px] text-(--text-2)">Remove this excerpt for everyone?</p>
                <div className="flex flex-wrap gap-2">
                  <Btn kind="danger" disabled={action.busy} onClick={() => requestExcerpt(row.id, true)}>Remove excerpt</Btn>
                  <Btn disabled={action.busy} onClick={() => setRevoking(null)}>Cancel</Btn>
                </div>
              </div>
            )}
            {opened?.id === row.id && <div className="mt-3 whitespace-pre-wrap rounded-(--radius-s) bg-(--bg-inset) p-3 [overflow-wrap:anywhere]">{opened.text}</div>}
          </li>
        ))}
      </ul>
    </Shell>
  );
}
