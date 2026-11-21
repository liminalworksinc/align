"use client";

import { useState } from "react";
import { Btn, Err, Input, Note } from "../../../_ui/kit";
import { Panel } from "../../../_ui/ds";

export function SpendExport({ ws }: { ws: string }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/v2/workspaces/${ws}/spend/export?month=${encodeURIComponent(month)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Try again.");
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `align-spend-${month}.csv`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(`Could not download. ${e instanceof Error ? e.message : "Try again."}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Export by team" className="mb-4">
      <Note>Estimates at list price, not a bill. Each month uses UTC.</Note>
      <form data-spend-export onSubmit={download} className="flex min-w-0 flex-wrap items-end gap-3">
        <label className="block min-w-0 max-w-full text-[14px] text-(--text-2)">
          <span className="mb-1 block">Export month (UTC)</span>
          <Input aria-label="Export month (UTC)" type="month" min="0001-01" max="9999-12" value={month} required disabled={busy} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <Btn type="submit" disabled={busy}>{busy ? "Downloading…" : "Download team CSV"}</Btn>
      </form>
      <Err>{error}</Err>
    </Panel>
  );
}
