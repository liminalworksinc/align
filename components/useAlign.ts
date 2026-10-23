"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { labelsFor } from "@/lib/labels";
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

/** This tab's team changed underneath it: another tab signed this browser in as another team of the same workspace. */
export interface Switched {
  from: string; // the team this tab was showing
  to: string; // the team the browser is signed in as now
}

export const SESSION_ENDED = "Your session ended. Sign in again.";
const SIGNED_OUT: Me = { actor: null, name: null, sid: null };
const isEnded = (e: unknown) => (e as { status?: number }).status === 401 && (e as Error).message === SESSION_ENDED;

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown; workspace?: string }): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body) headers["content-type"] = "application/json";
  if (init?.workspace) headers["x-align-workspace"] = init.workspace; // the server refuses a write for another workspace (409)
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; code?: string };
    throw Object.assign(new Error(d.error || `HTTP ${res.status}`), { status: res.status, code: d.code });
  }
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
  const [meError, setMeError] = useState<string | null>(null); // /api/session failed before we knew who is signed in
  const [switched, setSwitched] = useState<Switched | null>(null); // signed in as another team in another tab (Sean #6)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const live = useRef(!workspace); // may this page poll /api/state now?
  const meRef = useRef<Me | null>(null); // who this tab loaded with: its view and its writes belong to this team
  const switchedRef = useRef(false);
  const lastState = useRef<StateView | AnonStateView | null>(null); // for team names after the view is cleared
  const loadMeRef = useRef<() => Promise<void>>(async () => undefined);

  const endSession = useCallback(() => {
    live.current = !workspace;
    setState(null);
    meRef.current = SIGNED_OUT;
    setMe(SIGNED_OUT);
    setEnded(true);
  }, [workspace]);

  const refresh = useCallback(async () => {
    if (!live.current) return;
    try {
      const s = await api<StateView | AnonStateView>("/api/state");
      if (!live.current) return;
      // The cookie is per origin: signing in elsewhere in another tab (another workspace, Northstar, or another
      // role) changes what this tab's poll returns. Never render that here; ask who is signed in instead.
      const ws = (s as { workspace?: string }).workspace;
      const actor = meRef.current?.actor;
      if (ws !== workspace || (actor && s.me !== actor)) {
        live.current = false;
        setState(null);
        return void loadMeRef.current();
      }
      lastState.current = s;
      setState(s);
      setLoadError(null);
    } catch (e) {
      if (isEnded(e)) return endSession();
      setLoadError((e as Error).message);
    }
  }, [endSession, workspace]);

  const loadMe = useCallback(async () => {
    let m: Me;
    try {
      m = await api<Me>("/api/session");
    } catch (e) {
      if (isEnded(e)) return endSession();
      // Server down or a corrupt workspace: say so, with a retry, instead of "Loading Align…" forever.
      setMeError((e as Error).message);
      return;
    }
    setMeError(null);
    if (m.actor && m.workspace !== workspace) {
      live.current = false;
      setState(null);
      setElsewhere(m.workspace ?? "northstar");
      meRef.current = SIGNED_OUT;
      setMe(SIGNED_OUT);
      return;
    }
    setElsewhere(null);
    // Same workspace, another team: the cookie changed in another tab. This tab still shows its own team, so never
    // adopt the new one silently; stop and say so until the person chooses to continue as the new team.
    const was = meRef.current?.actor;
    if (m.actor && was && m.actor !== was) {
      live.current = false;
      switchedRef.current = true;
      const role = lastState.current ? labelsFor({ simulations: [], ...lastState.current }).role : null;
      setSwitched({ from: role?.[was] ?? was, to: role?.[m.actor] ?? m.actor });
      return;
    }
    if (m.actor) setEnded(false);
    const wasLive = live.current;
    live.current = !workspace || !!m.actor;
    if (!live.current) setState(null);
    meRef.current = m;
    setMe(m);
    if (live.current && !wasLive) refresh();
  }, [workspace, endSession, refresh]);
  useEffect(() => {
    loadMeRef.current = loadMe; // refresh (defined first) calls the current loadMe through this ref
  }, [loadMe]);

  useEffect(() => {
    // Subscribes to the server: state is set when the fetches resolve, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMe();
    refresh();
    timer.current = setInterval(refresh, 1500);
    // Coming back to this tab: check now rather than at the next poll (another tab may have signed in meanwhile).
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, loadMe]);

  /** "Continue as <new team>": adopt the session the browser now holds and load that team's view. */
  const continueAs = useCallback(() => {
    switchedRef.current = false;
    setSwitched(null);
    meRef.current = SIGNED_OUT; // this tab now loads with whoever is signed in
    void loadMe();
  }, [loadMe]);

  /** Before any write: is the browser still signed in as the team (and workspace) this tab loaded with? */
  const sameSession = useCallback(async (): Promise<boolean> => {
    if (switchedRef.current) return false;
    let m: Me;
    try {
      m = await api<Me>("/api/session");
    } catch (e) {
      if (isEnded(e)) endSession();
      else setError((e as Error).message);
      return false;
    }
    const was = meRef.current;
    if (was?.actor && m.actor === was.actor && m.workspace === was.workspace) return true;
    // Signed out, another workspace or another team: stop showing this view; loadMe says which (sign-in,
    // the Elsewhere notice, or the switched notice).
    live.current = false;
    await loadMe();
    return false;
  }, [endSession, loadMe]);

  const act = useCallback(
    async <T,>(path: string, body: unknown = {}): Promise<T | null> => {
      setError(null);
      if (!(await sameSession())) return null; // never send a write as a team this tab isn't showing
      try {
        const out = await api<T>(path, { body, workspace: workspace ?? "northstar" });
        await refresh();
        return out;
      } catch (e) {
        if (isEnded(e)) endSession();
        else if ((e as { code?: string }).code === "workspace_mismatch") {
          // Signed in to another workspace in another tab: stop showing this one and say so (the Elsewhere notice).
          // Only the stale-tab guard sends this code; any other 409 (an open proposal, a pending acceptance) is shown below.
          live.current = false;
          setState(null);
          void loadMe();
        } else setError((e as Error).message);
        return null;
      }
    },
    [refresh, endSession, loadMe, sameSession, workspace],
  );

  const mark = useCallback((action: string) => {
    if (switchedRef.current) return;
    api("/api/timer", { body: { action }, workspace: workspace ?? "northstar" }).catch(() => undefined);
  }, [workspace]);

  return { state, me, error, setError, loadError, meError, refresh, loadMe, act, mark, ended, elsewhere, switched, continueAs };
}
