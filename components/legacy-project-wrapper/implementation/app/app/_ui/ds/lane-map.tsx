"use client";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

// One decision as lanes: one lane per role, in order, with the states it can be in as cards. Lanes are columns, so the
// map fits the review drawer. The caller says what connects to what; the map routes the lines, through the gutters and
// behind the cards, so a line never crosses text and carries no text itself (the action's words belong in a card's
// `action` slot). Below 42rem of its own width it is not shown; the caller keeps the one-sentence answer, and hides any
// disclosure around the map at the same point (`className="hidden md:block"`), so nothing opens onto nothing.

export type LaneCardState = "now" | "done" | "next" | "idle";
export type LaneLinkKind = "live" | "done" | "muted";

export type Lane = {
  id: string;
  label: string;
  role?: string;
  people?: ReactNode;
};
/** `row` is the card's place down the lane, from 0; rows line up across lanes. */
export type LaneCard = {
  id: string;
  lane: string;
  row: number;
  title: string;
  body?: ReactNode;
  state?: LaneCardState;
  action?: ReactNode;
};
/** live: a step this person may take now. done: the way the request came. muted: possible, not now. */
export type LaneLink = { from: string; to: string; kind?: LaneLinkKind };

const STATE_WORD: Partial<Record<LaneCardState, string>> = {
  now: "Now",
  done: "Done",
};
const CARD: Record<LaneCardState, string> = {
  now: "border-(--accent-text) bg-(--bg-raised)",
  done: "border-(--line-strong) bg-(--bg-panel)",
  next: "border-(--edge) bg-(--bg-panel)",
  idle: "border-dashed border-(--line-strong) bg-(--bg-inset)",
};
const STROKE: Record<LaneLinkKind, string> = {
  live: "var(--accent-text)",
  done: "var(--edge)",
  muted: "var(--edge)",
};

type Line = { key: string; d: string; kind: LaneLinkKind };

export function LaneMap({
  lanes,
  cards,
  links = [],
  caption,
}: {
  lanes: Lane[];
  cards: LaneCard[];
  links?: LaneLink[];
  caption: string;
}) {
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  // Live (LIM-2503): when the "now" card moves while the map is shown (a decision in another window, or here), the card
  // it moved to lights up after the line it came along draws itself: cause, then effect. Reduced motion: no movement.
  const nowId = cards.find((c) => c.state === "now")?.id ?? null;
  const prevNow = useRef(nowId);
  const [arrived, setArrived] = useState<{
    from: string | null;
    to: string;
  } | null>(null);
  useEffect(() => {
    const from = prevNow.current;
    prevNow.current = nowId;
    if (from === nowId || !nowId) return;
    const on = setTimeout(() => setArrived({ from, to: nowId }), 0);
    const off = setTimeout(() => setArrived(null), 2400);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [nowId]);

  const measure = useCallback(() => {
    const root = box.current;
    if (!root || !root.offsetWidth) return setLines([]);
    const o = root.getBoundingClientRect();
    const at = (id: string) => {
      const el = root.querySelector<HTMLElement>(
        `[data-lane-card="${CSS.escape(id)}"]`,
      );
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        l: r.left - o.left,
        r: r.right - o.left,
        t: r.top - o.top,
        b: r.bottom - o.top,
        m: (r.top + r.bottom) / 2 - o.top,
      };
    };
    const laneOf = new Map(
      cards.map((c) => [c.id, lanes.findIndex((l) => l.id === c.lane)]),
    );
    const inGutter = new Map<number, number>(); // Lines sharing a gutter sit side by side, not on top of each other.
    const out: Line[] = [];
    links.forEach(({ from, to, kind = "muted" }, i) => {
      const a = at(from);
      const b = at(to);
      const la = laneOf.get(from);
      const lb = laneOf.get(to);
      if (!a || !b || la === undefined || lb === undefined) return;
      const key = `${from}-${to}-${i}`;
      if (la === lb) {
        const down = b.t >= a.b;
        // Next door: straight through the gap. Further: round the outside of the cards between.
        const next = Math.abs(down ? b.t - a.b : a.t - b.b) < 48;
        const x = a.l + 20;
        out.push({
          key,
          kind,
          d: next
            ? `M${x},${down ? a.b : a.t} V${down ? b.t - 3 : b.b + 3}`
            : `M${a.r},${a.m} h8 V${b.m} H${b.r + 3}`,
        });
        return;
      }
      const rightward = lb > la;
      const gutter = Math.min(la, lb);
      const n = inGutter.get(gutter) ?? 0;
      inGutter.set(gutter, n + 1);
      const x1 = rightward ? a.r : a.l;
      const x2 = rightward ? b.l - 3 : b.r + 3;
      const step = ((n % 3) - 1) * 6;
      // Cards side by side: a straight line through the height they share.
      const top = Math.max(a.t, b.t) + 12;
      const bottom = Math.min(a.b, b.b) - 12;
      if (top <= bottom && Math.abs(lb - la) === 1) {
        const y = Math.round((top + bottom) / 2 + step);
        out.push({ key, kind, d: `M${x1},${y} H${x2}` });
        return;
      }
      // Otherwise along the source side's gutter, stepped per line; a line that skips a lane runs behind its cards.
      const gx =
        (rightward ? a.r + 12 : a.l - 12) +
        (rightward ? 1 : -1) * ((n % 3) * 6);
      out.push({
        key,
        kind,
        d: `M${x1},${a.m + step} H${gx} V${b.m + step} H${x2}`,
      });
    });
    setLines(out);
  }, [cards, lanes, links]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [measure]);

  const columns = {
    gridTemplateColumns: `repeat(${lanes.length}, minmax(0, 1fr))`,
  } as CSSProperties;
  return (
    <div className="@container min-w-0">
      <div className="hidden @2xl:block">
        <p className="sr-only">{caption}</p>
        <p className="sr-only" aria-live="polite">
          {arrived
            ? `Moved just now: ${cards.find((c) => c.id === arrived.to)?.title ?? ""}.`
            : ""}
        </p>
        <div ref={box} className="relative">
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          >
            <defs>
              {(["live", "done", "muted"] as const).map((k) => (
                <marker
                  key={k}
                  id={`${uid}-${k}`}
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 z" fill={STROKE[k]} />
                </marker>
              ))}
            </defs>
            {lines.map((l) => (
              <path
                key={l.key}
                data-link={l.kind}
                d={l.d}
                {...(arrived &&
                l.key.startsWith(`${arrived.from}-${arrived.to}-`)
                  ? { className: "al-draw", pathLength: 1 }
                  : {
                      strokeDasharray: l.kind === "muted" ? "3 4" : undefined,
                    })}
                fill="none"
                stroke={STROKE[l.kind]}
                strokeWidth={l.kind === "live" ? 1.75 : 1}
                strokeLinejoin="round"
                markerEnd={`url(#${uid}-${l.kind})`}
              />
            ))}
          </svg>
          <div className="relative grid gap-x-8 gap-y-6" style={columns}>
            {lanes.map((l, i) => (
              <header
                key={l.id}
                className="min-w-0 border-b border-(--line-strong) pb-2"
                style={{ gridColumn: i + 1, gridRow: 1 }}
              >
                <h4 className="font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">
                  {l.label}
                </h4>
                {l.role && (
                  <p className="text-[12px] text-(--text-2)">{l.role}</p>
                )}
                {l.people && (
                  <div className="mt-0.5 text-[13px] text-(--text-1)">
                    {l.people}
                  </div>
                )}
              </header>
            ))}
            {cards.map((c) => {
              const state = c.state ?? "idle";
              const word = STATE_WORD[state];
              return (
                <div
                  key={c.id}
                  data-lane-card={c.id}
                  data-state={state}
                  data-arrived={arrived?.to === c.id ? "1" : undefined}
                  aria-current={state === "now" ? "step" : undefined}
                  className={`relative min-w-0 self-start rounded-(--radius-s) border p-2.5 ${CARD[state]}${arrived?.to === c.id ? " al-arrive" : ""}`}
                  style={{
                    gridColumn: lanes.findIndex((l) => l.id === c.lane) + 1,
                    gridRow: c.row + 2,
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className={`text-[13px] font-semibold ${state === "idle" ? "text-(--text-2)" : "text-(--text-1)"}`}
                    >
                      {c.title}
                    </p>
                    {word && (
                      <span
                        className={`font-mono text-[10px] uppercase tracking-[0.1em] ${state === "now" ? "text-(--accent-text)" : "text-(--text-3)"}`}
                      >
                        {word}
                      </span>
                    )}
                  </div>
                  {c.body && (
                    <div className="mt-0.5 text-[12px] leading-snug text-(--text-2)">
                      {c.body}
                    </div>
                  )}
                  {c.action && <div className="mt-2">{c.action}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
