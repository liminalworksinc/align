import { initializeGoalRegistry } from "./goal-registry";
import { migrateAuth } from "./auth";
import { migrate, openDb } from "./db";

// Opens the v2 database and applies Better Auth's migrations, then ours. Called at startup when ALIGN_GOAL_SESSIONS=1
// (instrumentation.ts) and awaited by every v2 route, so a request never runs against an unmigrated file.
const g = globalThis as unknown as { __alignV2Ready?: Promise<void> };

export function ready(): Promise<void> {
  return (g.__alignV2Ready ??= (async () => {
    openDb();
    await migrateAuth();
    migrate();
    await initializeGoalRegistry();
  })().catch((e) => {
    g.__alignV2Ready = undefined;
    throw e;
  }));
}
