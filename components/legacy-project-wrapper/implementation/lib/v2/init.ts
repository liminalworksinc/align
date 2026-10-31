import { migrateAuth } from "./auth";
import { migrate, openDb } from "./db";

// Opens the v2 database and applies Better Auth's migrations, then ours. Called at every startup
// (instrumentation.ts) and awaited by every v2 route, so a request never runs against an unmigrated file.
const g = globalThis as unknown as { __alignV2Ready?: Promise<void> };

export function ready(): Promise<void> {
  return (g.__alignV2Ready ??= (async () => {
    openDb();
    await migrateAuth();
    migrate();
  })().catch((e) => {
    g.__alignV2Ready = undefined;
    throw e;
  }));
}
