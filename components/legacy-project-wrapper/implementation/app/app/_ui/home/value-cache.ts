"use client";
import { useEffect, useState } from "react";
import type { Delivery } from "../ds/evidence-facts.mts";
import { api } from "../kit";

// One read per launched change's delivery (GET …/change-requests/:id/value) for everything on the Home: the goal lines
// and any other part that needs the same launch's delivery ask this cache, so a launch is read once per page load,
// not once per place it appears. Entries live for a short while, so a decision's re-read still sees fresh counts.

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; p: Promise<Delivery | null> }>();

const url = (ws: string, goal: string, cr: string) => `/api/v2/workspaces/${ws}/goals/${goal}/change-requests/${cr}/value`;

/** The launch's delivery, or null when it couldn't be read (the caller then shows no delivery fact). */
export function readValue(ws: string, goal: string, cr: string): Promise<Delivery | null> {
  const k = url(ws, goal, cr);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p;
  const p = api<Delivery>(k).then(
    (d) => d,
    () => null,
  );
  cache.set(k, { at: Date.now(), p });
  return p;
}

/** readValue as a hook: `loading` until the shared read lands. A null `cr` reads nothing. */
export function useValue(ws: string, goal: string, cr: string | null): { value: Delivery | null; loading: boolean } {
  const [v, setV] = useState<{ key: string | null; value: Delivery | null }>({ key: null, value: null });
  const key = cr ? url(ws, goal, cr) : null;
  useEffect(() => {
    if (!cr) return;
    let live = true;
    void readValue(ws, goal, cr).then((value) => live && setV({ key: url(ws, goal, cr), value }));
    return () => {
      live = false;
    };
  }, [ws, goal, cr]);
  return { value: v.key === key ? v.value : null, loading: !!key && v.key !== key };
}
