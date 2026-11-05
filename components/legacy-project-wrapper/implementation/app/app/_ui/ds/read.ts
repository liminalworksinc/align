"use client";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../kit";

// A GET that keeps the server's status, so a surface can say what a 403 or a 404 means for this person (not theirs,
// or not there) instead of one generic error line. `path` null waits.

export interface Read<T> {
  data: T | null;
  /** 0 while loading or after success; the HTTP status of a refusal (403, 404, 409…) or 1 for a network failure. */
  status: number;
  message: string | null;
  loading: boolean;
  reload: () => void;
}

export function useRead<T>(path: string | null): Read<T> {
  const [s, set] = useState<{ data: T | null; status: number; message: string | null; loading: boolean }>({ data: null, status: 0, message: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path).then(
      (data) => live && set({ data, status: 0, message: null, loading: false }),
      (e: Error) => live && set((p) => ({ ...p, status: e instanceof ApiError ? e.status : 1, message: e.message, loading: false })),
    );
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...s, loading: path ? s.loading : false, reload };
}
