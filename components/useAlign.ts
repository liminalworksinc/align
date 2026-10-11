"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StateView } from "@/lib/types";

export type Selection =
  | { kind: "goal"; id: string }
  | { kind: "relation"; id: string }
  | { kind: "work"; id: string }
  | { kind: "sim"; id: string }
  | { kind: "proposal"; id: string };

export interface Me {
  actor: "product" | "security" | null;
  name: string | null;
  sid: string | null;
}

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

export function useAlign() {
  const [state, setState] = useState<StateView | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api<StateView>("/api/state");
      setState(s);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  const loadMe = useCallback(async () => setMe(await api<Me>("/api/session")), []);

  useEffect(() => {
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
        setError((e as Error).message);
        return null;
      }
    },
    [refresh],
  );

  const mark = useCallback((action: string) => {
    api("/api/timer", { body: { action } }).catch(() => undefined);
  }, []);

  return { state, me, error, setError, loadError, refresh, loadMe, act, mark };
}
