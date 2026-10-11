"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentSession, Goal, RegistryEntry, SessionMapping, StateView } from "@/lib/types";
import type { ViewProps } from "./props";
import { api } from "./useAlign";
import { Badge, Button, Mono, fmtTime } from "./ui";

const TEAM: Record<string, string> = { ceo: "Company", product: "Product", security: "Security" };
const OWNER_ACTOR: Record<string, string> = { ceo: "leadership", product: "product", security: "security" };
const ACTOR_NAME: Record<string, string> = { leadership: "CEO / Leadership", product: "Product Director", security: "Alex / Security Lead" };
const HARNESS: Record<AgentSession["harness"], string> = { "claude-code": "Claude Code", codex: "Codex" };
const LANE_MAX = 6;

interface MappingsResponse {
  registry: RegistryEntry[];
  registry_version: string;
  mappings: SessionMapping[];
}

/** Client-side mirror of lib/registry activeRegistry: current goals ordered company, product, security, plus "none". */
function fallbackRegistry(s: StateView): RegistryEntry[] {
  const superseded = new Set(s.goals.map((g) => g.supersedes).filter(Boolean));
  const order = { ceo: 0, product: 1, security: 2 } as const;
  const entries: RegistryEntry[] = s.goals
    .filter((g) => !superseded.has(g.id))
    .sort((a, b) => order[a.owner_id] - order[b.owner_id])
    .map((g) => ({ key: g.id, goal_id: g.id, version: g.version, label: g.objective, owner: g.owner_id, team: TEAM[g.owner_id], org: s.company }));
  entries.push({ key: "none", goal_id: null, version: null, label: "Does not clearly serve any accepted goal", owner: null, team: "Unassigned", org: s.company });
  return entries;
}

function ago(iso: string, now: number) {
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  if (ms < 2 * 60_000) return "active";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function originLabel(o: AgentSession["origin"]) {
  if (o.kind === "linear") return `Linear ${o.ref ?? ""}`.trim();
  if (o.kind === "github") return o.ref ? `GitHub ${o.ref}` : "GitHub";
  if (o.kind === "slack") return "Slack";
  if (o.kind === "align-push") return "Org push";
  return "Ad hoc";
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

interface Ctx {
  props: ViewProps;
  teamOf: (key: string | null) => string;
  goalOf: (key: string | null) => Goal | undefined;
  now: number;
}

function MatchLine({ m, ctx }: { m: SessionMapping; ctx: Ctx }) {
  if (m.confidence == null) return null;
  const next = Object.entries(m.probabilities)
    .filter(([k]) => k !== m.choice)
    .sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between text-[14px]">
        <span className="font-semibold text-violet-800">
          Jev · {ctx.teamOf(m.choice)} {pct(m.confidence)}
        </span>
        {next && <span className="text-zinc-500">next: {ctx.teamOf(next[0])} {pct(next[1])}</span>}
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-zinc-100">
        <div className="h-1.5 rounded-full bg-violet-600" style={{ width: pct(Math.min(1, Math.max(0, m.confidence))) }} />
      </div>
    </div>
  );
}

function StatusBadges({ m, ctx }: { m: SessionMapping | undefined; ctx: Ctx }) {
  if (!m || m.state === "MAPPER_UNAVAILABLE")
    return (
      <div>
        <Badge tone="amber">Not matched</Badge>
        {m?.error && <p className="mt-1 text-[13px] text-zinc-500">{m.error}</p>}
      </div>
    );
  const owner = ctx.goalOf(m.choice)?.owner_name ?? (m.confirmed_by ? ACTOR_NAME[m.confirmed_by] : "owner");
  return (
    <div className="flex flex-wrap gap-1.5">
      {m.state === "PROPOSED" && <Badge tone="violet">Suggested</Badge>}
      {m.state === "CONFIRMED" && <Badge tone="neutral">Confirmed by {owner}</Badge>}
      {m.state === "REJECTED" && <Badge tone="neutral">Rejected by owner</Badge>}
      {m.state === "PENDING" && <Badge tone="amber">Re-matching…</Badge>}
      {m.conflict?.flagged && <Badge tone="red">Conflicts with a protected goal · {pct(m.conflict.probability)}</Badge>}
    </div>
  );
}

function Detail({ session, m, ctx }: { session: AgentSession; m: SessionMapping | undefined; ctx: Ctx }) {
  const row = "grid grid-cols-[110px_1fr] gap-2 text-[14px]";
  return (
    <div className="space-y-3 border-t border-zinc-200 px-4 py-3">
      <div>
        <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-zinc-500">Prompts</div>
        <ol className="space-y-1">
          {session.prompts.map((p, i) => (
            <li key={i} className="text-[14px] text-zinc-800">
              <span className="mr-2 font-mono text-[12px] text-zinc-500">{fmtTime(p.at)}</span>
              {p.text}
            </li>
          ))}
        </ol>
      </div>
      <div className={row}>
        <span className="text-zinc-500">Files</span>
        <span className="break-all font-mono text-[13px] text-zinc-700">{session.files.join(", ") || "—"}</span>
      </div>
      <div className={row}>
        <span className="text-zinc-500">Tools</span>
        <span className="text-zinc-700">{[...new Set(session.tools)].join(", ") || "—"}</span>
      </div>
      <div className={row}>
        <span className="text-zinc-500">Origin</span>
        <span className="text-zinc-700">{originLabel(session.origin)}</span>
      </div>
      {m && (
        <>
          <table className="w-full text-[14px]">
            <tbody>
              {Object.entries(m.probabilities)
                .sort((a, b) => b[1] - a[1])
                .map(([k, p]) => (
                  <tr key={k} className={k === m.choice ? "font-semibold text-violet-800" : "text-zinc-700"}>
                    <td className="py-0.5 pr-2 font-mono text-[12px] text-zinc-500">{k}</td>
                    <td className="py-0.5 pr-2">{ctx.teamOf(k)}</td>
                    <td className="py-0.5 text-right tabular-nums">{pct(p)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className={row}>
            <span className="text-zinc-500">Model</span>
            <span className="font-mono text-[13px] text-zinc-700">{m.model ?? "—"}</span>
          </div>
          <div className={row}>
            <span className="text-zinc-500">Matched at</span>
            <span className="text-zinc-700">{fmtTime(m.mapped_at)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function SessionCard({ session, m, ctx }: { session: AgentSession; m: SessionMapping | undefined; ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  const { props } = ctx;
  const goal = ctx.goalOf(m?.choice ?? null);
  const actor: string | null = props.me.actor;
  const canAct = m?.state === "PROPOSED" && !!goal && !!actor && OWNER_ACTOR[goal.owner_id] === actor;
  const last = session.prompts.at(-1)?.text ?? session.last_message ?? "";
  const when = ago(session.last_at, ctx.now);
  const base = `/api/mappings/${encodeURIComponent(session.id)}`;
  return (
    <article className={`rounded-xl bg-white shadow-sm ring-1 ${m?.conflict?.flagged ? "ring-red-300" : "ring-zinc-300"}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="block w-full rounded-t-xl px-4 py-3 text-left hover:bg-zinc-50">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[15px] font-bold text-zinc-900">{HARNESS[session.harness] ?? session.harness}</span>
          <Badge tone="neutral" icon={false}>
            {originLabel(session.origin)}
          </Badge>
        </div>
        <div className="mb-1.5 truncate">
          <Mono>
            {session.repo || session.cwd_name}@{session.branch || "—"}
          </Mono>
        </div>
        <p className="truncate text-[16px] text-zinc-900" title={last}>
          {last || <span className="text-zinc-400">No prompt captured</span>}
        </p>
        <div className="mt-1 flex gap-3 text-[13px] text-zinc-500">
          <span>{session.files.length} files</span>
          <span>{session.tools.length} tools</span>
          <span className={when === "active" ? "font-semibold text-violet-700" : ""}>{when}</span>
        </div>
        {m && m.state !== "MAPPER_UNAVAILABLE" && <MatchLine m={m} ctx={ctx} />}
        <div className="mt-2">
          <StatusBadges m={m} ctx={ctx} />
        </div>
      </button>
      {canAct && (
        <div className="flex gap-2 border-t border-zinc-200 px-4 py-2.5">
          <Button onClick={() => props.act(`${base}/confirm`)}>Confirm</Button>
          <Button kind="secondary" onClick={() => props.act(`${base}/reject`)}>
            Not this goal
          </Button>
        </div>
      )}
      {open && <Detail session={session} m={m} ctx={ctx} />}
    </article>
  );
}

function Lane({ entry, items, ctx }: { entry: RegistryEntry; items: { session: AgentSession; m?: SessionMapping }[]; ctx: Ctx }) {
  const [all, setAll] = useState(false);
  const goal = ctx.goalOf(entry.key);
  const shown = all ? items : items.slice(0, LANE_MAX);
  return (
    <div className="flex min-w-0 flex-1 basis-0 flex-col rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
      <header className="mb-3 px-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[18px] font-bold text-zinc-900">{entry.team}</h3>
          <span className="text-[13px] text-zinc-500">
            {entry.version ?? ""} · {items.length}
          </span>
        </div>
        <p className="line-clamp-2 min-h-[2.75em] text-[15px] leading-snug text-zinc-700">{goal?.objective ?? "Work that does not clearly serve any ratified goal"}</p>
        {goal && <div className="mt-0.5 text-[13px] text-zinc-500">Owner: {goal.owner_name}</div>}
      </header>
      <div className="space-y-3">
        {shown.map(({ session, m }) => (
          <SessionCard key={session.id} session={session} m={m} ctx={ctx} />
        ))}
        {!items.length && <p className="px-1 text-[14px] text-zinc-400">No sessions</p>}
        {items.length > LANE_MAX && (
          <button onClick={() => setAll((a) => !a)} className="w-full rounded-lg py-1.5 text-[14px] font-semibold text-violet-700 hover:bg-violet-50">
            {all ? "Show fewer" : `+${items.length - LANE_MAX} more`}
          </button>
        )}
      </div>
    </div>
  );
}

export function WorkMap(props: ViewProps) {
  const { s } = props;
  const [remote, setRemote] = useState<MappingsResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState(false);
  const prevVersion = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => {
      setNow(Date.now());
      api<MappingsResponse>("/api/mappings")
        .then((r) => live && setRemote(r))
        .catch(() => live && setRemote(null)); // route missing or failing: fall back to state
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [s.registry_version]);

  // State polls faster than the mappings route, so prefer its mappings and version; take the registry from the route when present.
  const version = s.registry_version ?? remote?.registry_version ?? "";
  const mappings = useMemo(() => s.mappings ?? remote?.mappings ?? [], [s.mappings, remote]);
  const registry = useMemo(() => {
    const r = remote?.registry?.length ? remote.registry : fallbackRegistry(s);
    return [...r.filter((e) => e.key !== "none"), ...r.filter((e) => e.key === "none")];
  }, [remote, s]);

  useEffect(() => {
    if (prevVersion.current !== null && prevVersion.current !== version) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 2000);
      prevVersion.current = version;
      return () => clearTimeout(t);
    }
    prevVersion.current = version;
  }, [version]);

  const goalById = useMemo(() => new Map(s.goals.map((g) => [g.id, g])), [s.goals]);
  const ctx: Ctx = {
    props,
    now,
    goalOf: (key) => (key ? goalById.get(key) : undefined),
    teamOf: (key) => registry.find((e) => e.key === key)?.team ?? TEAM[goalById.get(key ?? "")?.owner_id ?? ""] ?? "Unassigned",
  };

  const lanes = useMemo(() => {
    const byId = new Map(mappings.map((m) => [m.session_id, m]));
    const keys = new Set(registry.map((e) => e.key));
    // A stale choice (prior goal version) lands in the lane of the same owner's current goal.
    const laneFor = (m?: SessionMapping) => {
      if (!m?.choice || !["PROPOSED", "CONFIRMED", "PENDING"].includes(m.state)) return "none";
      if (keys.has(m.choice)) return m.choice;
      const owner = goalById.get(m.choice)?.owner_id;
      return registry.find((e) => owner && e.owner === owner)?.key ?? "none";
    };
    const out = new Map<string, { session: AgentSession; m?: SessionMapping }[]>(registry.map((e) => [e.key, []]));
    for (const session of [...(s.sessions ?? [])].sort((a, b) => b.last_at.localeCompare(a.last_at))) {
      const m = byId.get(session.id);
      out.get(laneFor(m))?.push({ session, m });
    }
    return out;
  }, [mappings, registry, s.sessions, goalById]);

  const rematching = mappings.some((m) => m.registry_version !== version || m.state === "PENDING");
  const push = s.pushes?.at(-1);
  const sessions = s.sessions ?? [];

  return (
    <div className="mx-auto max-w-[1600px]">
      <h1 className="text-[28px] font-bold tracking-tight text-zinc-900">Where agent work is going</h1>
      <p className="mb-5 max-w-4xl text-[17px] text-zinc-600">
        Claude Code and Codex sessions, captured automatically and matched to the goals your org has ratified. Matches are suggestions until the goal&apos;s owner confirms them.
      </p>

      <div className={`mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-white px-4 py-3 ring-1 transition ${flash ? "ring-2 ring-violet-500" : "ring-zinc-200"}`}>
        {registry.map((e) => (
          <span key={e.key} className="rounded-md bg-zinc-100 px-2.5 py-1 text-[15px] font-semibold text-zinc-800">
            {e.team}
            {e.version ? ` ${e.version}` : ""}
          </span>
        ))}
        <span className="ml-1 text-[14px] text-zinc-500">
          registry <Mono>{version.slice(0, 7) || "—"}</Mono>
        </span>
        {push && (
          <span className="text-[14px] text-zinc-600">
            Company goal {push.version} pushed by CEO / Leadership at {fmtTime(push.pushed_at)}
          </span>
        )}
        {rematching && <span className="ml-auto text-[15px] font-semibold text-violet-700">Goals changed — re-matching sessions…</span>}
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-zinc-200">
          <p className="mb-2 text-[18px] text-zinc-800">No agent sessions captured yet. Sessions in repos with Align capture enabled appear here automatically.</p>
          <p className="text-[15px] text-zinc-500">
            <Mono>node scripts/align-capture.mjs</Mono> is wired via <Mono>.claude/settings.json</Mono>.
          </p>
        </div>
      ) : (
        <div className="flex gap-3 pb-4">
          {registry.map((e) => (
            <Lane key={e.key} entry={e} items={lanes.get(e.key) ?? []} ctx={ctx} />
          ))}
        </div>
      )}
    </div>
  );
}
