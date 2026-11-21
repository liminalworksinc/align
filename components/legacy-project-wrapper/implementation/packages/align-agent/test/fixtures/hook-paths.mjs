// Test-only faults exercise the built entry point and its actual deadline/failure handlers.
import { registerHooks } from "node:module";
import fs from "node:fs";
// The production deadline starts after module loading. Observe that same interval without changing the timer.
if (process.env.ALIGN_TEST_HOOK_TIMING) {
  const timer = globalThis.setTimeout;
  let started, deadline = false;
  globalThis.setTimeout = (callback, ms, ...args) => {
    if (started === undefined && ms === Number(process.env.ALIGN_HOOK_DEADLINE_MS || 300)) {
      started = performance.now();
      return timer((...values) => { deadline = true; callback(...values); }, ms, ...args);
    }
    return timer(callback, ms, ...args);
  };
  process.on("exit", () => fs.writeFileSync(process.env.ALIGN_TEST_HOOK_TIMING,
    JSON.stringify({ ms: started === undefined ? null : performance.now() - started, deadline })));
}
const mode = process.env.ALIGN_TEST_HOOK_PATH;
const RealDate = Date, at = "2026-11-18T12:00:00.000Z";
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [at])); }
  static now() { return RealDate.parse(at); }
};
if (mode === "unsupported") Object.defineProperty(process.versions, "node", { value: "22.0.0" });
registerHooks({
  load(url, context, next) {
    const loaded = next(url, context);
    if (mode === "deadline" && url.endsWith("/hooks/autostart.js")) {
      return { ...loaded, source: "export async function kickSync() { await new Promise(() => {}); }" };
    }
    if (mode === "failure" && url.endsWith("/hooks/handlers.js")) {
      const source = String(loaded.source);
      const replacement = source.replace(/(export function preToolUse\([^\n]+\) \{)/, '$1\nthrow new Error("forced handler failure");');
      if (replacement === source) throw new Error("failure fixture missed the handler");
      return { ...loaded, source: replacement };
    }
    return loaded;
  },
});
