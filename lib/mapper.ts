// Jev mapper: classifies captured agent sessions against the live goal registry.
// Contract (implementation owned by the mapper worker):
//   scheduleMapping(sessionId)  -- debounced, fire-and-forget; maps one session against the current registry
//   remapAll()                  -- re-map every session (called when registry_version changes)
// Both must never throw into callers and must persist SessionMapping rows via mutate().

export function scheduleMapping(sessionId: string): void {
  void sessionId;
}

export function remapAll(): void {}
