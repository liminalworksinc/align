"use client";
import { useEffect, useState } from "react";
import type { AgentSession, SimulationRun, StateView } from "@/lib/types";
import { StateBadge } from "./ui";

/**
 * "Security's AI agent", live. Shows what the captured agent session actually did: listening, woken by
 * an authority change (from the directive wire and its recorded deliveries), acted, and the verified
 * Sparta result of the run it made afterwards. Nothing here is inferred from goals alone.
 */
type Wire = { at: string; text: string; kind: "authority" | "delivered" | "info" };

const clock = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—";
const PLAN: Record<string, string> = { "p-beta": "beta issues first", "p-throughput": "oldest tickets first" };

function eventTitle(s: StateView, id: string) {
  if (id.startsWith("push:")) {
    const p = s.pushes?.find((x) => `push:${x.id}` === id);
    return `CEO sent company goal ${p?.version ?? ""}`.trim();
  }
  if (id.startsWith("accept:")) {
    const a = s.acceptances.find((x) => `accept:${x.proposal_id}` === id);
    return `Security approved its goal ${a?.accepted_version ?? ""}`.trim();
  }
  return "Authority change";
}

function agentSession(s: StateView): AgentSession | undefined {
  const all = [...(s.sessions ?? [])].filter((x) => x.harness === "claude-code");
  const withDirectives = all.filter((x) => x.directives?.length);
  const pick = (xs: AgentSession[]) => xs.sort((a, b) => (a.last_at < b.last_at ? 1 : -1))[0];
  return pick(withDirectives) ?? pick(all);
}

function runLine(r: SimulationRun) {
  const ok = r.checks.filter((c) => c.passed).length;
  const p0 = r.checks.find((c) => c.id.replace(/^assertion:/, "") === "protected-p0");
  return { plan: PLAN[r.plan_id] ?? "team plan", ok, total: r.checks.length, p0: p0 ? (p0.passed ? "untouched" : "CHANGED") : "not checked" };
}

export function AgentPane({ s }: { s: StateView }) {
  const [wire, setWire] = useState<Wire[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/directives/stream?session=*");
    } catch {
      return;
    }
    const add = (w: Wire) => setWire((xs) => [...xs.slice(-7), w]);
    es.addEventListener("hello", () => setConnected(true));
    es.addEventListener("authority", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      const n = (d.recipients?.length ?? 0) as number;
      add({ at: d.at ?? new Date().toISOString(), kind: "authority", text: `Align → ${d.title ?? d.event_id} · ${n ? `pushed to ${n} running agent${n === 1 ? "" : "s"}` : "no agent listening"}` });
    });
    es.addEventListener("delivered", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      add({ at: d.at, kind: "delivered", text: "Agent received it" });
    });
    es.onerror = () => setConnected(false);
    return () => es?.close();
  }, []);

  const sess = agentSession(s);
  const ds = [...(sess?.directives ?? [])].sort((a, b) => (a.delivered_at < b.delivered_at ? -1 : 1));
  const last = ds.at(-1);
  const after = last?.acted_at ?? last?.delivered_at;
  const runs = [...s.simulations].filter((r) => r.scenario === "normal").sort((a, b) => (a.ingested_at < b.ingested_at ? 1 : -1));
  const result = after ? runs.find((r) => r.ingested_at > after) : undefined;
  const status = !sess
    ? { label: "No agent connected" }
    : !last
      ? { label: "Listening for decisions" }
      : !last.acted_at
        ? { label: `Woken by: ${eventTitle(s, last.event_id)}` }
        : result
          ? { label: "Ran the plan it is allowed to run" }
          : { label: "Acting on it · running the plan" };

  return (
    <section aria-label="Security's AI agent" className="flex h-full flex-col gap-4">
      <div>
        <div className="al-lbl !text-violet-700">Live · Security&apos;s AI agent</div>
        <div className="mt-1 text-[18px] font-semibold text-zinc-900">Claude Code triage agent</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-zinc-500">
          <span aria-hidden className={`size-2 rounded-full ${connected ? "bg-violet-700" : "bg-zinc-400"}`} />
          {connected ? "Connected to Align's live feed" : "Live feed not connected"}
        </div>
      </div>

      <div className="rounded-[12px] border border-zinc-200 bg-white p-4">
        <div className="al-lbl mb-1.5">Now</div>
        <div className="text-[18px] font-semibold text-zinc-900">{status.label}</div>
        {sess && <div className="text-[13px] text-zinc-500">Last activity {clock(sess.last_at)}</div>}
      </div>

      <ol className="flex flex-col gap-3 border-l border-zinc-300 pl-4">
        <li className="text-[14px]">
          <div className="font-semibold text-zinc-900">Agent started</div>
          <div className="text-zinc-500">{sess ? clock(sess.started_at) : "Start the agent to see it here"}</div>
        </li>
        {ds.map((d) => (
          <li key={d.event_id} className="text-[14px]">
            <div className="font-semibold text-zinc-900">Woken by: {eventTitle(s, d.event_id)}</div>
            <div className="text-zinc-600">Received {clock(d.delivered_at)}</div>
            <div className={d.acted_at ? "text-zinc-600" : "text-amber-700"}>{d.acted_at ? `Acted ${clock(d.acted_at)}` : "Not acted on yet"}</div>
          </li>
        ))}
        {result && (() => {
          const r = runLine(result);
          return (
            <li className="text-[14px]">
              <div className="font-semibold text-zinc-900">Ran: {r.plan}</div>
              <div className="flex items-center gap-2">
                <StateBadge state={result.verdict} />
                <span className={result.verdict === "PASS" ? "text-emerald-700" : "text-red-700"}>
                  {r.ok}/{r.total} checks
                </span>
              </div>
              <div className={r.p0 === "CHANGED" ? "text-red-700" : "text-zinc-600"}>Critical security ticket {r.p0} · {clock(result.ingested_at)}</div>
            </li>
          );
        })()}
      </ol>

      {wire.length > 0 && (
        <div className="mt-auto">
          <div className="al-lbl mb-1">Live feed</div>
          <ul className="flex flex-col gap-1 font-mono text-[12.5px] text-zinc-700">
            {wire.map((w, i) => (
              <li key={i}>
                <span className="text-zinc-500">{clock(w.at)}</span> {w.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[12.5px] text-zinc-500">Read-only. The agent reads approved goals; only owners can change them.</p>
    </section>
  );
}
