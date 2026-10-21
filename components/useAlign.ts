"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Actor, AnonStateView, StateView } from "@/lib/types";

export type Selection =
  | { kind: "goal"; id: string }
  | { kind: "relation"; id: string }
  | { kind: "work"; id: string }
  | { kind: "sim"; id: string }
  | { kind: "proposal"; id: string };

export interface Me {
  actor: Actor | null;
  name: string | null;
  sid: string | null;
  workspace?: string; // custom workspace sessions only
}

export const SESSION_ENDED = "Your session ended. Sign in again.";
const SIGNED_OUT: Me = { actor: null, name: null, sid: null };
const isEnded = (e: unknown) => (e as { status?: number }).status === 401 && (e as Error).message === SESSION_ENDED;

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error || `HTTP ${res.status}`), { status: res.status });
  return data as T;
}

/**
 * `workspace` is the /w/<id> slug; omit it for the Northstar app at /. A session for a different workspace (or a
 * custom session on /) counts as signed out here, and a /w page never polls /api/state before sign-in.
 */
export function useAlign(workspace?: string) {
  // Signed out, /api/state carries only the sign-in labels (B1-6), so the page checks state.me before rendering.
  const [state, setState] = useState<StateView | AnonStateView | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false); // a custom session expired or was revoked
  const [elsewhere, setElsewhere] = useState<string | null>(null); // the workspace this browser is signed in to instead
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const live = useRef(!workspace); // may this page poll /api/state now?

  const endSession = useCallback(() => {
    live.current = !workspace;
    setState(null);
    setMe(SIGNED_OUT);
    setEnded(true);
  }, [workspace]);

  const refresh = useCallback(async () => {
    if (!live.current) return;
    try {
      const s = await api<StateView | AnonStateView>("/api/state");
      if (!live.current) return;
      setState(s);
      setLoadError(null);
    } catch (e) {
      if (isEnded(e)) return endSession();
      setLoadError((e as Error).message);
    }
  }, [endSession]);

  const loadMe = useCallback(async () => {
    let m: Me;
    try {
      m = await api<Me>("/api/session");
    } catch (e) {
      if (isEnded(e)) return endSession();
      throw e;
    }
    if (m.actor && m.workspace !== workspace) {
      live.current = false;
      setState(null);
      setElsewhere(m.workspace ?? "northstar");
      setMe(SIGNED_OUT);
      return;
    }
    setElsewhere(null);
    if (m.actor) setEnded(false);
    const wasLive = live.current;
    live.current = !workspace || !!m.actor;
    if (!live.current) setState(null);
    setMe(m);
    if (live.current && !wasLive) refresh();
  }, [workspace, endSession, refresh]);

  useEffect(() => {
    // Subscribes to the server: state is set when the fetches resolve, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMe();
    refresh();
    timer.current = setInterval(refresh, 1500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh, loadMe]);

  const act = useCallback(
    async <T,>(path: string, body: unknown = {}): Promise<T | null> => {
      setError(null);
      try {
        const out = await api<T>(path, { body });
        await refresh();
        return out;
      } catch (e) {
        if (isEnded(e)) endSession();
        else setError((e as Error).message);
        return null;
      }
    },
    [refresh, endSession],
  );

  const mark = useCallback((action: string) => {
    api("/api/timer", { body: { action } }).catch(() => undefined);
  }, []);

  return { state, me, error, setError, loadError, refresh, loadMe, act, mark, ended, elsewhere };
}
