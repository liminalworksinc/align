"use client";
import { useEffect, useRef, useState } from "react";
import type { BriefOption } from "@/lib/types";
import type { ViewProps } from "./props";
import { Badge, Button, Mono, OWNER_LABEL, Section, StateBadge, fmtTime } from "./ui";

export function BriefDrawer(props: ViewProps & { onClose: () => void }) {
  const { s, me, onClose, mark } = props;
  const b = s.brief;
  const [choice, setChoice] = useState<BriefOption["rank"]>("P0");
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    mark("brief_reviewed");
  }, [mark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const alike = b.alike_status === "retrieved" && b.alike_ref ? b.alike_ref : null;
  const isProduct = me.actor === "product";

  return (
    <div aria-labelledby="brief-title" className="flex h-full w-full flex-col bg-white">
      <header className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-4">
        <div>
          <div className="al-lbl">Intelligence Brief</div>
          <div className="mt-0.5 text-[14px] text-zinc-500">
            Re: <Mono>{b.goal_ref}</Mono>
          </div>
        </div>
        <Button kind="ghost" onClick={onClose}>
          <span aria-hidden>✕</span> Close
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5 text-[16px]">
        <h2 id="brief-title" className="mb-6 text-[24px] font-bold leading-snug text-zinc-900">
          {b.headline}
        </h2>

        <Section title="Cited evidence">
          <ul className="space-y-2">
            {b.evidence_refs.map((e) => (
              <li key={`${e.ref}-${e.label}`} className="flex items-start gap-3 rounded-lg bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-200">
                <StateBadge state={e.state} />
                <div className="min-w-0 flex-1 leading-snug">
                  <div className="text-[16px] text-zinc-900">{e.label}</div>
                  <div className="mt-0.5 text-[13px] text-zinc-500">
                    <Mono>{e.ref}</Mono>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-3">
            {alike ? (
              <div className="rounded-lg p-3 ring-1 ring-zinc-300">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <StateBadge state="OBSERVED" />
                  <span className="text-[16px] font-semibold text-zinc-900">
                    Alike decision <Mono>{alike.decision_id}</Mono>
                  </span>
                </div>
                <p className="mb-1 text-[15px] leading-snug text-zinc-800">{alike.summary}</p>
                <p className="mb-3 text-[13px] text-zinc-500">
                  Recorded ~{alike.recorded_at.slice(0, 10)} {fmtTime(alike.recorded_at)} (session A&apos;s own account) · retrieved in session <Mono>{alike.retrieved_in_session}</Mono>
                </p>
                <div className="rounded-md bg-violet-50/60 p-3 ring-1 ring-violet-200">
                  <div className="mb-1 al-lbl !text-violet-700">Steered a fresh session&apos;s plan choice</div>
                  <p className="mb-2 text-[13px] text-zinc-600">p-beta@1 was written before this decision was recorded. Alike carried the decision to a new session; it did not author the plan.</p>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 text-[15px] leading-snug">
                    <div>
                      <div className="al-lbl">Before</div>
                      <div className="text-zinc-700">{alike.plan_before}</div>
                    </div>
                    <div className="pt-4 text-zinc-400" aria-hidden>
                      →
                    </div>
                    <div>
                      <div className="al-lbl">After</div>
                      <div className="text-zinc-900">{alike.plan_after}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[15px] text-amber-900 ring-1 ring-amber-300">
                <Badge tone="amber">{b.alike_status === "pending" ? "PENDING" : "UNAVAILABLE"}</Badge>
                Alike decision: not retrieved (no claim made)
              </div>
            )}
          </div>
        </Section>

        <Section title="Ways forward (ranked proposal — you choose)">
          <p className="mb-2 text-[14px] text-zinc-600">Ranking is a suggestion. The owner decides.</p>
          <div role="radiogroup" aria-label="Ways forward" className="space-y-2">
            {b.priorities.map((o) => {
              const on = choice === o.rank;
              return (
                <label
                  key={o.rank}
                  className={`block cursor-pointer rounded-lg p-3 ring-1 transition ${on ? "bg-violet-50/60 ring-2 ring-violet-500" : "bg-white ring-zinc-200 hover:ring-zinc-400"}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="brief-way-forward"
                      value={o.rank}
                      checked={on}
                      onChange={() => setChoice(o.rank)}
                      className="mt-1.5 h-4 w-4 accent-violet-700"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="violet" icon={false}>
                          {o.rank}
                        </Badge>
                        <span className="text-[16px] font-semibold leading-snug text-zinc-900">{o.label}</span>
                      </div>
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px] leading-snug">
                        <dt className="text-zinc-500">Owner</dt>
                        <dd className="text-zinc-900">{OWNER_LABEL[o.owner] ?? o.owner}</dd>
                        <dt className="text-zinc-500">Evidence</dt>
                        <dd>
                          <Mono>{o.evidence_ref}</Mono>
                        </dd>
                        <dt className="text-zinc-500">Capacity</dt>
                        <dd>{o.capacity === "unknown" ? <StateBadge state="UNKNOWN" /> : <span className="text-zinc-900">known</span>}</dd>
                        <dt className="text-zinc-500">If delayed</dt>
                        <dd className="text-zinc-900">{o.delay_consequence}</dd>
                        <dt className="text-zinc-500">Reason</dt>
                        <dd className="text-zinc-900">{o.reason}</dd>
                      </dl>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </Section>

        <Section title="What could disprove this">
          <ul className="list-disc space-y-1.5 pl-5 text-[16px] leading-snug text-zinc-800">
            {b.disconfirmers.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </Section>

        <Section title="Unknowns">
          <ul className="space-y-1.5">
            {b.unknowns.map((u) => (
              <li key={u} className="flex items-center gap-2 text-[16px] text-zinc-800">
                <StateBadge state="UNKNOWN" /> {u}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-zinc-200 px-6 py-4">
        <Button onClick={() => props.openDrawer("scenario")}>Compare ways forward in Sparta</Button>
        {isProduct ? (
          <Button
            kind="secondary"
            onClick={() => {
              onClose();
              props.go("proposals");
            }}
          >
            Propose goal change
          </Button>
        ) : (
          <span className="text-[14px] text-zinc-600">Security receives proposals in Proposals.</span>
        )}
      </footer>
    </div>
  );
}
