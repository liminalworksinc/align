"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { GoalPresence, LiveView } from "@/lib/v2/live";
import { apiActivity } from "./kit";

// The page's side of the live workspace (LIM-2503; the server is lib/v2/live.ts). One EventSource per workspace per tab,
// shared by every component that asks for it, opened while one is mounted. The stream says which of this person's views
// moved; each page reads its own views again (useLiveReload), so what it shows still comes from the reads it already
// makes, scoped like them. When the stream can't be had (a refusal, five tabs, a proxy that drops it) the status is
// "off" and the pages keep today's behaviour: they read when they open, after an action, and Home's Since check.

export type LiveStatus = "connecting" | "live" | "reconnecting" | "off";
export type { GoalPresence, LiveView };

interface Hub {
  ws: string;
  es: EventSource | null;
  refs: number;
  status: LiveStatus;
  presence: GoalPresence[] | null;
  lastId: string | null;
  tries: number;
  retry: ReturnType<typeof setTimeout> | null;
  down: ReturnType<typeof setTimeout> | null;
  listeners: Set<(views: LiveView[] | "all") => void>;
  watchers: Set<() => void>;
  snap: { status: LiveStatus; presence: GoalPresence[] | null };
}
const hubs = new Map<string, Hub>();
const MAX_TRIES = 6;

function notify(h: Hub) {
  h.snap = { status: h.status, presence: h.presence };
  for (const w of h.watchers) w();
}
function setStatus(h: Hub, s: LiveStatus) {
  if (h.status === s) return;
  h.status = s;
  notify(h);
}
function emit(h: Hub, views: LiveView[] | "all") {
  if (views !== "all" && !views.length) return;
  for (const l of h.listeners) l(views);
}

function open(h: Hub) {
  if (typeof EventSource === "undefined") return setStatus(h, "off");
  const q = h.lastId ? `?last_event_id=${encodeURIComponent(h.lastId)}` : "";
  const es = new EventSource(`/api/v2/workspaces/${encodeURIComponent(h.ws)}/stream${q}`);
  h.es = es;
  const take = (e: MessageEvent) => {
    if (e.lastEventId) h.lastId = e.lastEventId;
    try {
      return JSON.parse(e.data) as { views?: LiveView[]; presence?: GoalPresence[] | null; resync?: boolean; status?: number };
    } catch {
      return {};
    }
  };
  es.addEventListener("hello", (e) => {
    const d = take(e as MessageEvent);
    h.tries = 0;
    if (h.down) clearTimeout(h.down);
    h.down = null;
    h.presence = d.presence ?? null;
    h.status = "live";
    notify(h);
    if (d.resync) emit(h, "all");
    else emit(h, d.views ?? []);
  });
  es.addEventListener("change", (e) => {
    const d = take(e as MessageEvent);
    if (d.presence !== undefined) {
      h.presence = d.presence;
      notify(h);
    }
    emit(h, d.views ?? []);
  });
  es.addEventListener("gone", () => {
    // Signed out or no longer in the workspace: every page reads again and shows what its read now says.
    close(h);
    h.presence = null;
    setStatus(h, "off");
    emit(h, "all");
  });
  es.onerror = () => {
    if (es.readyState === EventSource.CONNECTING) {
      // The browser reconnects by itself and sends Last-Event-ID; say so only if it takes more than a moment.
      if (!h.down) h.down = setTimeout(() => setStatus(h, "reconnecting"), 1500);
      return;
    }
    // Closed for good (a refusal or a server that went away): try again a few times, slower each time, then stay off.
    es.close();
    h.es = null;
    if (h.tries >= MAX_TRIES) {
      h.presence = null;
      return setStatus(h, "off");
    }
    setStatus(h, "reconnecting");
    const wait = Math.min(30_000, 1000 * 2 ** h.tries++);
    h.retry = setTimeout(() => {
      h.retry = null;
      if (h.refs > 0) open(h);
    }, wait);
  };
}

function close(h: Hub) {
  h.es?.close();
  h.es = null;
  if (h.retry) clearTimeout(h.retry);
  if (h.down) clearTimeout(h.down);
  h.retry = h.down = null;
}

function hubFor(ws: string): Hub {
  let h = hubs.get(ws);
  if (!h) {
    h = { ws, es: null, refs: 0, status: "connecting", presence: null, lastId: null, tries: 0, retry: null, down: null, listeners: new Set(), watchers: new Set(), snap: { status: "connecting", presence: null } };
    hubs.set(ws, h);
  }
  return h;
}
/** The first stream opens once the page's own reads have been quiet for QUIET_MS (or after OPEN_LATEST_MS at the
 *  latest): it never competes with them, and "the network is idle" still means the page has loaded (a stream is one
 *  long request). */
const QUIET_MS = 1000;
const OPEN_LATEST_MS = 8000;
/** Count every fetch the page makes (some reads don't go through api()), so "quiet" means the whole page is quiet. */
let fetchCounted = false;
function countFetches() {
  if (fetchCounted || typeof window === "undefined" || typeof window.fetch !== "function") return;
  fetchCounted = true;
  const real = window.fetch.bind(window);
  window.fetch = (...args: Parameters<typeof fetch>) => {
    apiActivity.inflight++;
    return real(...args).finally(() => {
      apiActivity.inflight--;
      apiActivity.settledAt = Date.now();
    });
  };
}
function acquire(h: Hub) {
  countFetches();
  h.refs++;
  if (h.refs !== 1 || h.es || h.retry) return;
  const began = Date.now();
  const tick = () => {
    h.retry = null;
    if (h.refs <= 0) return;
    const quiet = apiActivity.inflight === 0 && Date.now() - Math.max(apiActivity.settledAt, began) >= QUIET_MS;
    if (quiet || Date.now() - began >= OPEN_LATEST_MS) open(h);
    else h.retry = setTimeout(tick, 200);
  };
  h.retry = setTimeout(tick, 200);
}
function release(h: Hub) {
  h.refs--;
  if (h.refs > 0) return;
  // A page change mounts the next page's hook right after this one unmounts: keep the stream for that moment.
  setTimeout(() => {
    if (h.refs > 0) return;
    close(h);
    hubs.delete(h.ws);
  }, 1000);
}

const OFF = { status: "off" as LiveStatus, presence: null };
// The server render and the first client render, before the stream opens: "Connecting", not "Updates when you act or
// reload", so a page that is about to go live never first says it won't (LIM-2513 journey pass).
const CONNECTING = { status: "connecting" as LiveStatus, presence: null };

/** The live status and presence for a workspace; holds the stream open while mounted. `ws` null: nothing. */
export function useLive(ws: string | null): { status: LiveStatus; presence: GoalPresence[] | null } {
  useEffect(() => {
    if (!ws) return;
    const h = hubFor(ws);
    acquire(h);
    return () => release(h);
  }, [ws]);
  return useSyncExternalStore(
    (cb) => {
      if (!ws) return () => undefined;
      const h = hubFor(ws);
      h.watchers.add(cb);
      return () => h.watchers.delete(cb);
    },
    () => (ws ? hubFor(ws).snap : OFF),
    () => (ws ? CONNECTING : OFF),
  );
}

/** Read again when one of `views` moves for this person (or everything must be read again). Holds the stream open. */
export function useLiveReload(ws: string | null, views: readonly LiveView[], reload: () => void) {
  const fn = useRef(reload);
  useEffect(() => {
    fn.current = reload;
  }, [reload]);
  const key = views.join(",");
  useEffect(() => {
    if (!ws) return;
    const h = hubFor(ws);
    acquire(h);
    const want = new Set(key.split(","));
    const l = (moved: LiveView[] | "all") => {
      if (moved === "all" || moved.some((v) => want.has(v))) fn.current();
    };
    h.listeners.add(l);
    return () => {
      h.listeners.delete(l);
      release(h);
    };
  }, [ws, key]);
}
