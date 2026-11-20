// Frozen from 9e618da3, the release before budgets, with no budget or stamp support.
// Type annotations and imports were adapted to inject real handlers in the listener-free compatibility test.
export function budgetBaseIntake({api, HttpError, cursor, advanceCursor, endSharesEndedOnServer, validEnded, endedRead, handleDirective}) {
  const PAGE = 100;
async function pollDirectives(ctx, onRefresh, onReach = () => undefined) {
  let n = 0;
  for (let i = 0; i < 20; i++) {
    const from = cursor(ctx);
    const r = await api(ctx, "GET", `/api/v2/directives?cursor=${from}`);
    if (r.status !== 200) {
      if (r.status >= 500 || r.status === 429) throw new HttpError(r.status, r.json?.error ?? null, r.json);
      return n;
    }
    if (i === 0 && Array.isArray(r.json?.workspaces)) onReach(r.json.workspaces.filter((w) => typeof w === "string"));
    // Shares the server ended (Stop sharing on the web, say), which no directive tells: they end here now (cycle 8).
    if (i === 0 && Array.isArray(r.json?.ended_sessions)) endSharesEndedOnServer(ctx, r.json.ended_sessions.filter(validEnded));
    if (i === 0) endedRead(ctx);
    const list = Array.isArray(r.json?.directives) ? r.json.directives : [];
    for (const d of list) {
      const h = handleDirective(ctx, d);
      h.refreshWorkspaces.forEach(onRefresh);
      if (h.stored) n++;
    }
    const next = Number(r.json?.next_cursor);
    if (/^\d{1,15}$/.test(String(r.json?.next_cursor ?? ""))) advanceCursor(ctx, next);
    if (list.length < PAGE || cursor(ctx) <= from) return n;
  }
  return n;
}

  return pollDirectives;
}
