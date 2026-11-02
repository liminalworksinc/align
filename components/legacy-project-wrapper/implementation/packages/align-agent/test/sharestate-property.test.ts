// Property: whatever order the events that end, block or bring back a share come in, the notice a session would be
// told now about its share and the session's deny, `::align status` and `align latch status` give the same way out
// (E2E-AGENT cycle 11: four rounds found notices that contradicted the deny, each in a new order of events). Sessions
// are driven through random sequences of sign-out, login (and a login that can't read the ended shares), sync, Stop
// sharing and stop/resume on the web, goal hold and release, the workspace lost (removed) and given back (Devices page,
// or a re-invite and a new login), `align stop-sharing`, `::align share` and prompts; after every step every session is
// checked. Cycle 12 added the device revoked on the web and heard by a sync (C12-2: that pass ends the shares), and
// `::align share --dir` and `align share` (C12-3: held back like `::align share` while the ended shares are unread),
// and the unread and signed-out ways out (section 6: `align sync` first; `align login` or `align stop-sharing`). Cycle 13
// added an older agent writing a notice about a share's state with no facts after the one-time migration ran (C13-1: never
// shown as stored). A fixed set of seeds runs every time, plus random ones (printed, so a failure can be run again with
// ALIGN_PROP_SEEDS=<seed>).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { renderHot } from "../src/hot.ts";
import { sessionKey } from "../src/keys.ts";
import * as handlers from "../src/hooks/handlers.ts";
import { readJson } from "../src/shared/fsx.ts";
import { localId, layout } from "../src/shared/layout.ts";
import { isShareStateNotice, noticeKind } from "../src/shared/notices.ts";
import type { HotState, InjectedState } from "../src/shared/types.ts";
import { FakeServer } from "./fake-server.ts";
import { ctxFor, makeEnv, runCli, runHook, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FIXED = [1, 2, 3, 5, 8, 13, 21];
const SEEDS = process.env.ALIGN_PROP_SEEDS
  ? process.env.ALIGN_PROP_SEEDS.split(",").map(Number)
  : [...FIXED, ...Array.from({ length: 2 }, () => Math.floor(Math.random() * 2 ** 31))];
const STEPS = Number(process.env.ALIGN_PROP_STEPS || 10);
const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const ACME = { id: "ws_acme", name: "Acme", role: "owner", teams: [{ id: "pod_core", name: "Core", role: "lead" }] };
const json = (s: string) => (s ? JSON.parse(s) : null);
/** What an agent from before notices were worded when shown stored, by notice kind: advice from the time of the event. */
const OLDER_WORDS: Record<string, string> = {
  signed_out_: 'Align: this session stopped sharing because this machine signed out of Align; its usage stays on this machine from now on. To share it again, run `align login` in a terminal, then type `::align share` here (it counts toward "Ship the v2 onboarding flow" again).',
  signed_in_: 'Align: this machine is signed in to Align again. To share this session again, type `::align share` here (it counts toward "Ship the v2 onboarding flow" again).',
  access_lost_ws_acme_: "Align: this session stopped sharing because you no longer have access to Acme in Align (you were removed from it or left it); its usage stays on this machine from now on.",
};

/** mulberry32: a small seeded generator, so a failing sequence can be run again. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type S = { sid: string; cwd: string; lid: string; key: string };
type Way = "sync" | "login" | "share" | "release" | "stop+release" | "stop";

/** The way out a text names for a share that ended: `align sync` first, then `::align share` (signed in again, the ended
 *  shares unread); a new sign-in and `::align share`, or `align stop-sharing` (signed out); `::align share` (shared
 *  again, then the web lifts it), a release (or `align stop-sharing`), `align stop-sharing` with the release lifting
 *  only the hold, or `align stop-sharing`. */
function wayOf(text: string): Way | null {
  if (/`align sync` (in a terminal )?first/.test(text)) return "sync";
  if (/shared again (once this machine is signed in|that way)/.test(text)) return "login";
  if (/`::align share` (here|in the session) shares it (there )?again|until it is shared again \((you|the user) can type `::align share`/.test(text)) return "share";
  if (/lifts only the hold/.test(text)) return "stop+release";
  if (/a release still reaches (this session though its sharing ended|it:)|is released from the web \(a release still reaches/.test(text)) return "release";
  if (/align stop-sharing [A-Za-z0-9_-]{8}`/.test(text)) return "stop";
  return null;
}

/** The deny's way out (the stop latch first, as `Bash` is denied), or null when no ended share speaks in it. */
const denyWay = (reason: string | undefined): Way | null => (reason && /Its sharing (has since )?ended/.test(reason) ? wayOf(reason.slice(reason.search(/Its sharing/))) : null);

/** The notice's latch sentence's way out (`It was ... from the web, so ...`), or null when it has none. */
function noticeWay(text: string): Way | null {
  const i = text.lastIndexOf(" It was ");
  return i >= 0 && / from the web, so /.test(text.slice(i)) ? wayOf(text.slice(i)) : null;
}

async function world() {
  const fake = new FakeServer();
  await fake.start();
  const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
  cleanups.push(() => fake.stop(), () => t.cleanup());
  const l = await runCli(t, ["login", "--name", "Prop Mac"]);
  assert.equal(l.code, 0, l.stderr);
  return { fake, t };
}

async function sessions(t: TestEnv): Promise<S[]> {
  const out: S[] = [];
  for (let i = 0; i < 3; i++) {
    const sid = `${String(i).padStart(8, "a")}-prop-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
    const cwd = path.join(t.root, `repo-${i}`);
    fs.mkdirSync(cwd, { recursive: true });
    runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd });
    runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `${sid}-p0`, prompt: "start", cwd });
    const lid = localId("claude-code", sid);
    const r = await runCli(t, ["share", lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    assert.equal(r.code, 0, r.stderr);
    const ctx = ctxFor(t);
    out.push({ sid, cwd, lid, key: sessionKey(ctx.secret, "ws_acme", "claude-code", sid) });
    ctx.db.close();
  }
  return out;
}

/** The notice about its share the session would be told at its next prompt (without telling it), or null. */
function wouldTell(t: TestEnv, s: S): { id: string; text: string } | null {
  const hot = readJson<HotState>(layout.hot(t.home, s.lid));
  if (!hot) return null;
  const inj = { notices_shown: [], applied: [], ...(readJson<InjectedState>(layout.injected(t.home, s.lid)) || {}) } as InjectedState;
  // An agent from before notices were worded when shown (to see this test fail there): its unseen notices as stored.
  const h = handlers as unknown as Record<string, (...a: unknown[]) => unknown>;
  if (!h.planNotices) {
    const told = h.currentNotices(hot, hot.notices.filter((n) => !inj.notices_shown.includes(n.id))) as { id: string; text: string }[];
    return told.find((n) => isShareStateNotice(noticeKind(n.id))) ?? null;
  }
  const plan = h.planNotices(hot, inj) as ReturnType<typeof handlers.planNotices>;
  return plan.told.find((n) => isShareStateNotice(noticeKind(n.id)) || n.id === plan.share_told?.id) ?? null;
}

/** How many checks compared a notice's way out with a deny's, by way: the run must have compared some (not vacuous). */
const compared: Record<string, number> = {};

test(`share-state notices agree with the deny and the status views, whatever the order of events (seeds ${SEEDS.join(", ")}; ${STEPS} steps each)`, async () => {
  for (const seed of SEEDS) {
    const rand = rng(seed);
    const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
    const { fake, t } = await world();
    const ss = await sessions(t);
    await runCli(t, ["sync"]);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [ss[1].key], goal: null, binding: null });
    fake.holdGoal("ws_acme", "g_ship", [ss[2].key]);
    await runCli(t, ["sync"]);
    const trail: string[] = [];
    const sync = () => runCli(t, ["sync"]);
    const live = () => ss.filter((s) => fake.sessions.get(s.key)?.state === "shared");
    const signedIn = () => {
      const c = readJson<{ signed_out?: boolean }>(layout.credentials(t.home));
      return !!c && !c.signed_out;
    };
    const events: Record<string, () => Promise<unknown>> = {
      logout: () => runCli(t, ["logout"]),
      login: () => runCli(t, ["login", "--name", "Prop Mac"]),
      "login, ended shares unread": async () => {
        fake.failCalls = (_m: string, p: string) => p === "/api/v2/directives";
        await runCli(t, ["login", "--name", "Prop Mac"]);
        fake.failCalls = null;
      },
      sync,
      "Stop sharing on the web": async () => {
        const s = live();
        if (s.length) fake.stopOnWeb(pick(s).key);
      },
      "stop from the web": async () => {
        const s = live();
        if (s.length) fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [pick(s).key], goal: null, binding: null });
        if (rand() < 0.5) await sync();
      },
      "resume from the web": async () => {
        fake.pushDirective({ ws: "ws_acme", kind: "resume", session_keys: [pick(ss).key], goal: null, binding: null });
        if (rand() < 0.5) await sync();
      },
      hold: async () => {
        fake.holdGoal("ws_acme", "g_ship", ss.map((s) => s.key));
        if (rand() < 0.5) await sync();
      },
      release: async () => {
        if (fake.holds.has("ws_acme/g_ship")) fake.releaseGoal("ws_acme", "g_ship", ss.map((s) => s.key));
        if (rand() < 0.5) await sync();
      },
      "held, then Stop sharing on the web": async () => {
        fake.holdGoal("ws_acme", "g_ship", ss.map((x) => x.key));
        await sync();
        const s = live();
        if (s.length) fake.stopOnWeb(pick(s).key);
        await sync();
      },
      "removed from the workspace": async () => {
        fake.workspaces = [];
        for (const [k, x] of fake.sessions) if (x.state === "shared") fake.removeAndReAdd(k);
        await sync();
      },
      "given back on the Devices page": async () => {
        fake.workspaces = [ACME];
        await sync();
      },
      "re-invited, then a new login": async () => {
        fake.workspaces = [ACME];
        await runCli(t, ["login", "--name", "Prop Mac"]);
      },
      "align stop-sharing": () => runCli(t, ["stop-sharing", pick(ss).lid.slice(0, 8)]),
      "::align share": async () => {
        const s = pick(ss);
        runHook(t, "claude", "UserPromptSubmit", { session_id: s.sid, prompt_id: `p${rand()}`, prompt: "::align share confirm", cwd: s.cwd });
        await sync();
      },
      // C12-3: the folder form shares the session too, and the terminal form; neither while the ended shares are unread.
      "::align share --dir": async () => {
        const s = pick(ss);
        runHook(t, "claude", "UserPromptSubmit", { session_id: s.sid, prompt_id: `p${rand()}`, prompt: "::align share --dir confirm", cwd: s.cwd });
        if (rand() < 0.5) await sync();
      },
      "align share": async () => {
        const s = pick(ss);
        await runCli(t, ["share", s.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
      },
      // C12-2: the device revoked on the Devices page, heard by the next pass, which ends the shares there and then.
      "device revoked on the web, then a sync": async () => {
        const c = readJson<{ device_id: string; signed_out?: boolean }>(layout.credentials(t.home));
        if (c && !c.signed_out) fake.revokeOnWeb(c.device_id);
        await sync();
      },
      // C13-1: an older `align` (a downgrade, or the hooks' older copy) writes a notice about a share's state with no
      // facts after this agent's one-time migration ran.
      "an older agent's notice, after the migration": async () => {
        const s = pick(ss);
        const kind = pick(Object.keys(OLDER_WORDS));
        const ctx = ctxFor(t);
        ctx.db.prepare("INSERT OR IGNORE INTO notices(id, local_id, text, created_at, facts) VALUES(?,?,?,?,NULL)").run(`${s.lid}/${kind}${Date.now()}_older`, s.lid, OLDER_WORDS[kind], new Date().toISOString());
        renderHot(ctx, s.lid);
        ctx.db.close();
      },
      prompt: async () => {
        const s = pick(ss);
        const planned = wouldTell(t, s);
        const out = json(runHook(t, "claude", "UserPromptSubmit", { session_id: s.sid, prompt_id: `p${rand()}`, prompt: "go on", cwd: s.cwd }).stdout);
        if (planned) assert.ok(String(out?.systemMessage ?? "").includes(planned.text), `seed ${seed} after ${trail.join(" > ")}: the prompt tells what was planned\n${planned.text}\n---\n${out?.systemMessage}`);
      },
    };
    const names = Object.keys(events);
    for (let step = 0; step < STEPS; step++) {
      const name = pick(names);
      trail.push(name);
      await events[name]();
      const where = `seed ${seed}, after ${trail.join(" > ")}`;
      // Signed out (a revocation a pass heard included): no share stays live here (C12-2).
      if (!signedIn()) {
        const ctx = ctxFor(t);
        const live = ctx.db.prepare("SELECT local_id FROM shares WHERE state IN ('shared','pending','suspended')").all();
        ctx.db.close();
        assert.equal(live.length, 0, `${where}: signed out with live shares`);
      }
      const latch = (await runCli(t, ["latch", "status"])).stdout;
      const listed = json((await runCli(t, ["sessions", "--json"])).stdout) as { local_id: string; shared: string }[];
      for (const s of ss) {
        const lid8 = s.lid.slice(0, 8);
        const reason = json(runHook(t, "claude", "PreToolUse", { session_id: s.sid, tool_name: "Bash", tool_input: { command: "true" }, cwd: s.cwd }).stdout)?.hookSpecificOutput?.permissionDecisionReason as string | undefined;
        const dw = denyWay(reason);
        const status = json(runHook(t, "claude", "UserPromptSubmit", { session_id: s.sid, prompt_id: `st${rand()}`, prompt: "::align status", cwd: s.cwd }).stdout)?.reason as string;
        const statusWays = status
          .split("\n")
          .filter((l) => /^ {2}(Stop latch: on|Goal hold:|Sharing ended)/.test(l))
          .map(wayOf)
          .filter((w): w is Way => !!w);
        const latchWays = latch
          .split("\n")
          .filter((l) => l.startsWith(lid8))
          .map(wayOf)
          .filter((w): w is Way => !!w);
        const row = listed.find((r) => r.local_id === s.lid)?.shared ?? "";
        const ctx = `${where}\nsession ${lid8}\ndeny: ${reason}\nstatus:\n${status}\nlatch:\n${latch}\nsessions: ${row}`;
        // While the ended shares are unread since this sign-in, no view offers plain `::align share` (section 6).
        const unread = readJson<HotState>(layout.hot(t.home, s.lid))?.share_now?.unread;
        if (unread && dw) assert.notEqual(dw, "share", `the deny offers \`::align share\` while the ended shares are unread\n${ctx}`);
        // The status views give the deny's way out (and none when the deny names none).
        for (const w of statusWays) assert.equal(w, dw, `::align status\n${ctx}`);
        for (const w of latchWays) assert.equal(w, dw, `align latch status\n${ctx}`);
        if (dw) assert.ok(statusWays.length && latchWays.length, `a way out in every view\n${ctx}`);
        const n = wouldTell(t, s);
        if (!n) continue;
        const nctx = `${ctx}\nnotice: ${n.text}`;
        // Its latch sentence is the deny's way out.
        const nw = noticeWay(n.text);
        if (nw) assert.equal(nw, dw, `the notice's latch sentence\n${nctx}`);
        if (nw) compared[nw] = (compared[nw] ?? 0) + 1;
        if (dw && /from the web, so /.test(n.text)) assert.ok(nw, nctx);
        // It offers `::align share` now only when that shares it again: the deny (if any) says so too, and so does
        // `align sessions`; never while the ended shares are unread since this sign-in.
        if (/type `::align share` here/.test(n.text) && !/run `align login`/.test(n.text)) {
          assert.ok(!dw || dw === "share", `offers \`::align share\`, the deny does not\n${nctx}`);
          assert.match(row, /`::align share` shares it again/, `offers \`::align share\`, \`align sessions\` does not\n${nctx}`);
          assert.ok(signedIn(), `offers \`::align share\` while signed out\n${nctx}`);
        }
        if (/run `align login`/.test(n.text)) assert.ok(!signedIn(), `says to sign in while signed in\n${nctx}`);
        if (/stays stopped|can't be shared (there )?again from here/.test(n.text)) assert.notEqual(dw, "share", nctx);
        if (dw === "share") assert.doesNotMatch(n.text, /until you run `align stop-sharing/, nctx);
        const hot = readJson<HotState>(layout.hot(t.home, s.lid));
        // A share its person stopped on the web, already read, stays stopped whatever is unread: its notice names the
        // earlier end only as what happened (`its share here had ended when this machine signed out of Align`).
        const forGood = /stays stopped and is not shared again from here \(its share here had ended when [^;]*\); its usage stays on this machine\.$/.test(n.text.split(" It was ")[0]);
        if (hot?.share_now?.unread && !forGood) assert.doesNotMatch(n.text, /signed (in to|out of) Align|`::align share`/, `told while the ended shares are unread\n${nctx}`);
        // A share its person stopped on the web is never asked for again, so it is never refused as stopped (C12-3).
        assert.doesNotMatch(n.text, /sharing failed \(sharing_stopped\)/, `a share path asked for a share stopped on the web\n${nctx}`);
      }
    }
    console.log(`seed ${seed}: ${trail.join(" > ")}`);
  }
  console.log(`notices compared with the deny, by way out: ${JSON.stringify(compared)}`);
  if (!process.env.ALIGN_PROP_SEEDS) assert.ok(Object.keys(compared).length >= 2, JSON.stringify(compared));
});
