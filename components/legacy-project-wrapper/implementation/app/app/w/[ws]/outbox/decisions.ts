"use client";

import { useMemo, useSyncExternalStore } from "react";
import { decisionsKey, type Decision } from "@/lib/v2/transfer-preview";

// The preview's outbox decisions, kept in this browser tab so the receipt can follow them. Storage can be missing or
// blocked; then decisions simply aren't remembered and both pages still work.
const CHANGED = "align-preview-outbox";

function read(ws: string): string {
  try {
    return sessionStorage.getItem(decisionsKey(ws)) ?? "{}";
  } catch {
    return "{}";
  }
}

export function saveDecisions(ws: string, next: Record<string, Decision>): void {
  try {
    sessionStorage.setItem(decisionsKey(ws), JSON.stringify(next));
  } catch {
    /* not remembered; the page still shows the choice until it reloads */
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The stored decisions; the server render (and any storage failure) sees none. */
export function useDecisions(ws: string): Record<string, Decision> {
  const raw = useSyncExternalStore(subscribe, () => read(ws), () => "{}");
  return useMemo(() => {
    try {
      return JSON.parse(raw) as Record<string, Decision>;
    } catch {
      return {};
    }
  }, [raw]);
}
