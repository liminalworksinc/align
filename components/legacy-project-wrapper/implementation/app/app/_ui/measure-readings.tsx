"use client";

import { useState } from "react";
import type { MeasureReading } from "@/lib/v2/readings";
import { isBlankText } from "@/lib/v2/text-core.mts";
import { api, Btn, Err, Field, Input, labelledFieldError, Loading, useAction, useApi, when } from "./kit";

export function readingWords(r: MeasureReading, me: string) {
  const value = `${r.value_text ?? "Unknown"}${r.stale ? " (stale)" : ""}`;
  const time = when(r.observed_at);
  if (r.source === "ci") {
    const d = r.details;
    return `${value}, reported with a CI credential, ${d.check} on ${d.repository} (${d.branch}), ${time}. Run ${d.run}, commit ${d.commit}.`;
  }
  if (r.source === "command") {
    const d = r.details;
    const status = d.exit_status === null ? "Exit status unknown" : `Exit status ${d.exit_status}`;
    return `${value}, reported from ${d.device_name ?? "an unknown machine"}, ${time}. ${status}.`;
  }
  return `${value}, self-reported by ${r.recorded_by.id === me ? "you" : r.recorded_by.name}, ${when(r.observed_at)}`;
}

export function MeasureReadings({ ws, goal, measure, latest, canRecord, onDone, me }: {
  ws: string;
  goal: string;
  measure: string;
  latest: MeasureReading | null | undefined;
  canRecord: boolean;
  onDone: () => void;
  me: string;
}) {
  const path = `/api/v2/workspaces/${ws}/goals/${goal}/measures/${measure}/readings`;
  const [showHistory, setShowHistory] = useState(false);
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const history = useApi<{ readings: MeasureReading[] }>(showHistory ? path : null);
  const act = useAction();
  const valueError = labelledFieldError(act.error, "value_text", "Reading value");
  return (
    <div className="mt-1 min-w-0 [overflow-wrap:anywhere]" data-measure-readings={measure}>
      <p className="text-[14px] text-(--text-2)">
        {latest === undefined ? "Reading unknown" : latest ? readingWords(latest, me) : "No reading yet"}
      </p>
      <div className="flex flex-wrap gap-2">
        {canRecord && <Btn kind="secondary" aria-expanded={adding} onClick={() => setAdding(!adding)}>{adding ? "Cancel reading" : "Add reading"}</Btn>}
        <Btn kind="secondary" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>{showHistory ? "Hide history" : "Reading history"}</Btn>
      </div>
      {adding && canRecord && (
        <form className="mt-2" onSubmit={(e) => {
          e.preventDefault();
          if (act.busy || isBlankText(value)) return;
          void act.run(() => api(path, { body: { value_text: value } }), () => {
            setValue("");
            setAdding(false);
            onDone();
            if (showHistory) history.reload();
          });
        }}>
          <Field label="Reading value" error={valueError}>
            <Input maxLength={80} value={value} onChange={(e) => {
              setValue(e.target.value);
              if (valueError) act.setError(null);
            }} required />
          </Field>
          <Btn type="submit" disabled={act.busy || isBlankText(value)}>Save reading</Btn>
          {!valueError && <Err>{act.error}</Err>}
        </form>
      )}
      {showHistory && (
        <div className="mt-2 text-[14px]" data-reading-history>
          {history.loading && <Loading />}
          {history.error ? <Err>Reading history is unknown. {history.error}</Err> : history.data && (
            history.data.readings.length ? (
              <ul className="space-y-1">
                {history.data.readings.map((r) => <li key={r.id}>{readingWords(r, me)}</li>)}
              </ul>
            ) : <p>No reading yet</p>
          )}
        </div>
      )}
    </div>
  );
}
