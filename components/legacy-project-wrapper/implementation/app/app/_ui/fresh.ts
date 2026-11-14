"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// "Say what changed" (LIM-2516 S6): which rows a live re-read added or changed, so a list can mark them for a moment.
// A list arms it just before it reads again because the workspace's stream said its view moved; the next rows it is
// given are compared with the ones before. Any other read (the first one, or one after the person's own action) only
// takes the new rows as the baseline, so nothing is marked for what the person did themself.

export type Fresh = "new" | "changed";

/** Words for a mark, as a row shows it. */
export const FRESH_WORD: Record<Fresh, string> = { new: "New", changed: "Changed just now" };

/** How long a mark stays (the fade at its end is CSS, and none with reduced motion). */
export const FRESH_MS = 8000;

/**
 * `rows`: the list as read now, or undefined while a read is in flight (nothing is compared then). `key` and `sig` say
 * which row is which and what about it counts as a change; they are read through refs, so they needn't be stable.
 * `skip`: keys never marked (rows the person changed themself on this page).
 */
export function useFresh<T>(rows: readonly T[] | null | undefined, key: (r: T) => string, sig: (r: T) => string, skip?: ReadonlySet<string>) {
  const fns = useRef({ key, sig, skip });
  useEffect(() => {
    fns.current = { key, sig, skip };
  });
  const before = useRef<Map<string, string> | null>(null);
  const armed = useRef(false);
  const [marks, setMarks] = useState<ReadonlyMap<string, Fresh>>(new Map());
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!rows) return;
    const { key: k, sig: s, skip: sk } = fns.current;
    const now = new Map(rows.map((r) => [k(r), s(r)]));
    const prev = before.current;
    before.current = now;
    if (!prev || !armed.current) return;
    armed.current = false;
    const m = new Map<string, Fresh>();
    for (const [id, sg] of now) {
      if (sk?.has(id)) continue;
      const was = prev.get(id);
      if (was === undefined) m.set(id, "new");
      else if (was !== sg) m.set(id, "changed");
    }
    if (!m.size) return;
    // Marks from an earlier re-read that are still showing stay until their own time is up with these.
    const t = setTimeout(() => setMarks((old) => new Map([...old, ...m])), 0);
    if (clear.current) clearTimeout(clear.current);
    clear.current = setTimeout(() => setMarks(new Map()), FRESH_MS);
    return () => clearTimeout(t);
  }, [rows]);
  useEffect(() => () => void (clear.current && clearTimeout(clear.current)), []);
  /** Call just before reading again for a live change. */
  const arm = useCallback(() => {
    armed.current = true;
  }, []);
  return { marks, arm };
}

/** One sentence for assistive tech about what a live re-read marked, or "" for nothing. */
export function freshSentence(marks: ReadonlyMap<string, Fresh>, newWord: (n: number) => string, changedWord: (n: number) => string): string {
  let n = 0;
  let c = 0;
  for (const v of marks.values()) {
    if (v === "new") n++;
    else c++;
  }
  return [n ? newWord(n) : "", c ? changedWord(c) : ""].filter(Boolean).join(" ");
}
