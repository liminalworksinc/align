// LIM-2472 round 2: unit-style checks for "Next" after a decision (app/app/_ui/ds/next-core.mts).
//   node design/prototypes/lim-2472/s/next-core.check.mjs
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { pickNext, NEXT_WORDS } = await import(pathToFileURL(resolve("components/legacy-project-wrapper/implementation/app/app/_ui/ds/next-core.mts")).href);
let failed = 0;
const it = (key, o = {}) => ({ key, kind: "Decision", title: key, href: `?review=g.${key}`, review: true, actionable: true, ...o });
function expect(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(got)}`);
  if (!ok) console.log(`     expected ${JSON.stringify(want)}`);
}
const snap = ["a", "b", "c"];
expect("next item, list unchanged", pickNext("a", snap, [it("b"), it("c")]), { kind: "next", item: it("b"), changed: false });
expect("decided row still listed (e.g. now waiting to launch) is skipped", pickNext("a", snap, [it("a"), it("b"), it("c")]), { kind: "next", item: it("b"), changed: false });
expect("not actionable skipped", pickNext("a", snap, [it("b", { actionable: false }), it("c")]), { kind: "next", item: it("c"), changed: false });
expect("crosses kinds", pickNext("a", ["a", "t"], [it("t", { kind: "Team ask", href: "/app/w/x/asks", review: false })]), { kind: "next", item: it("t", { kind: "Team ask", href: "/app/w/x/asks", review: false }), changed: false });
expect("list changed: fresh order wins, said once", pickNext("a", snap, [it("c"), it("b")]), { kind: "next", item: it("c"), changed: true });
expect("new row arrived", pickNext("a", snap, [it("b"), it("c"), it("d")]), { kind: "next", item: it("b"), changed: true });
expect("only rows the person can't act on", pickNext("a", snap, [it("b", { actionable: false }), it("c", { actionable: false })]), { kind: "none_actionable", changed: false });
expect("nothing left", pickNext("a", ["a"], []), { kind: "last", changed: false });
expect("fresh read failed: no guess from the snapshot", pickNext("a", snap, null), { kind: "unread" });
expect("still reading", pickNext("a", snap, undefined), { kind: "reading" });
expect("no snapshot: never 'changed'", pickNext("a", null, [it("b")]), { kind: "next", item: it("b"), changed: false });
const BANNED = /\b(approve|launch|decide for you|automatically)\b/i;
for (const [k, v] of Object.entries(NEXT_WORDS)) if (BANNED.test(v)) (failed++, console.log(`FAIL words ${k}: ${v}`));
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
