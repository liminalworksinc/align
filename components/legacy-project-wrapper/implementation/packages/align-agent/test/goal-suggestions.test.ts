import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { DECISION_PROVIDERS, decideGoal, forkGoal, type DecisionProvider } from "../src/decision-model.ts";
import { inspectAnalysis, runAnalysis } from "../src/analysis.ts";
import { ruleChoices } from "../src/goal-suggestions.ts";
import { realDir } from "../src/shared/rules.ts";
import { sessionKey } from "../src/keys.ts";
import { localId } from "../src/shared/layout.ts";
import { ingestSpool, syncOnce } from "../src/sync.ts";
import { FakeServer } from "./fake-server.ts";
import { CLI, claudeAssistant, claudeUser, ctxFor, makeEnv, runCli, runHook, usage, writeLines } from "./helpers.ts";

const PROMPT = "CANARY-FIRST-PROMPT";
const REPLY = "CANARY-PRIVATE-REPLY";
const ALIAS = "CANARY-REPO-ALIAS";
const BRANCH = "CANARY-BRANCH";
const KEY = "CANARY-DECISION-KEY";

async function decisionStandIn(t: TestContext) {
  const requests: { url: string; headers: http.IncomingHttpHeaders; body: Record<string, any> }[] = [];
  let outcome = "fit";
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    requests.push({ url: req.url ?? "", headers: req.headers, body });
    if (outcome === "timeout") return;
    if (outcome === "redirect") {
      res.writeHead(307, { location: "/redirect-target" }).end();
      return;
    }
    const scores = { g_ship: outcome === "tie" ? 0.48 : 0.94, g_perf: outcome === "tie" ? 0.46 : 0.02, none: 0.04 };
    const malformedChoices = { array: ["g_ship"], object: { id: "g_ship" }, number: 123 };
    const choice = malformedChoices[outcome] ?? (outcome === "unknown" ? "g_theirs" : "g_ship");
    const goal = { choice, probabilities: scores };
    const confidence = outcome === "no-fit" ? 0.1 : 0.95;
    const answers = Array.isArray(body.questions)
      ? [{ name: "fit", type: "predicate", probability: confidence }, {
        ...goal, name: "goal", type: outcome === "refusal" ? "refusal" : "choice",
        probabilities: Object.entries(scores).map(([value, probability]) => ({ value, probability })),
      }]
      : { fit: { noul: confidence }, goal };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ answers }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address() as { port: number };
  return { requests, url: `http://127.0.0.1:${address.port}`, set: (value: string) => { outcome = value; } };
}

async function setup(t: TestContext) {
  const fake = new FakeServer();
  await fake.start();
  fake.requestBodies = [];
  const env = makeEnv({ ALIGN_SERVER: fake.url, ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_DECISION_WORKSPACE_KEY: KEY });
  t.after(() => fake.stop());
  t.after(() => env.cleanup());
  const cli = async (...args: string[]) => {
    const r = await runCli(env, args);
    assert.equal(r.code, 0, r.stderr);
    return r.stdout;
  };
  await cli("login");
  const ctx = ctxFor(env);
  t.after(() => ctx.db.close());
  const cwd = path.join(env.root, "CANARY-ABSOLUTE-PATH");
  fs.mkdirSync(path.join(cwd, ".git"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".git", "HEAD"), `ref: refs/heads/${BRANCH}\n`);
  fs.writeFileSync(path.join(cwd, ".git", "config"), '[remote "origin"]\n url = https://example.test/private/CANARY-REMOTE.git\n');
  const sync = () => syncOnce(ctx, {});
  const prompt = (sid: string, text: string, id = randomUUID(), file?: string) => {
    const r = runHook(env, "claude", "UserPromptSubmit", { session_id: sid, cwd, prompt_id: id, prompt: text, transcript_path: file });
    assert.equal(r.code, 0, r.stderr);
    return r.stdout ? JSON.parse(r.stdout) : {};
  };
  const turn = (sid: string) => {
    const id = randomUUID();
    const file = path.join(env.root, `${sid}-${id}.jsonl`);
    const at = new Date().toISOString();
    const user = claudeUser(sid, id, at, { message: { role: "user", content: PROMPT } });
    const assistant = claudeAssistant(sid, id, at, usage(10, 5));
    assistant.message.content[0].text = REPLY;
    writeLines(file, [user, assistant]);
    const out = prompt(sid, PROMPT, id, file);
    const ended = runHook(env, "claude", "Stop", { session_id: sid, cwd, prompt_id: id, transcript_path: file });
    assert.equal(ended.code, 0, ended.stderr);
    return out;
  };
  const start = (sid: string) => runHook(env, "claude", "SessionStart", { session_id: sid, cwd, source: "resume" });
  const inspect = (sid: string) => inspectAnalysis(ctx, localId("claude-code", sid));
  const epoch = (sid: string) => [...fake.epochs.values()].find((e) => e.session_key === sessionKey(ctx.secret, "ws_acme", "claude-code", sid));
  const configure = (url: string) => fake.decisionServices.set("ws_acme", { url, revision: randomUUID() });
  const enableDecision = (url: string) => {
    configure(url);
    return cli("data-sharing", "decision-model", "on", "workspace");
  };
  return { fake, env, ctx, cwd, cli, sync, prompt, turn, start, inspect, epoch, configure, enableDecision };
}

test("a rule suggestion waits for the next turn and only a confirmed share sends the goal", async (t) => {
  const w = await setup(t);
  w.fake.bumpGoal("ws_acme", "g_ship", { anchors: { repos: [], branch_patterns: [BRANCH], issues: [] } });
  await w.cli("goals", "--refresh");
  assert.match(await w.cli("data-sharing"), /Session question \(proposed\)\. Off[\s\S]*Decision model \(proposed\)\. Off/);
  const sid = randomUUID();
  assert.doesNotMatch(w.start(sid).stdout, /looks like work/);
  assert.doesNotMatch(w.turn(sid).systemMessage ?? "", /looks like work/);
  await w.sync();
  const shown = w.prompt(sid, "next turn");
  assert.match(shown.systemMessage, /looks like work toward "Ship/);
  assert.equal(shown.hookSpecificOutput, undefined);
  assert.doesNotMatch(w.prompt(sid, "one more").systemMessage ?? "", /looks like work/);
  assert.match(w.prompt(sid, "::align share").reason, /nothing uploaded yet[\s\S]*::align share g_ship confirm/);
  assert.equal(w.epoch(sid), undefined);
  assert.equal(w.fake.sessions.size, 0);
  assert.equal(w.fake.log.filter(({ path }) => path.endsWith("/data-sharing")).length, 0);
  w.prompt(sid, "::align share g_ship confirm");
  await w.sync();
  assert.equal(w.epoch(sid)?.origin, "suggested_rule");
  assert.deepEqual(w.inspect(sid).suggestion_feedback.map((row) => [row.reply, row.chosen]), [["accepted", "g_ship"]]);
  assert.doesNotMatch(JSON.stringify(w.fake.requestBodies), /CANARY/);

  for (const [answer, expected] of [["::align share g_perf confirm", "changed"], ["::align not this", "wrong"], ["::align dismiss", "dismissed"], ["::align quiet", "quiet"]]) {
    const other = randomUUID();
    w.start(other);
    w.turn(other);
    await w.sync();
    assert.match(w.prompt(other, "second turn").systemMessage, /looks like work/);
    w.prompt(other, answer);
    await w.sync();
    assert.deepEqual(w.inspect(other).suggestion_feedback.map((row) => row.reply), [expected]);
    assert.doesNotMatch(w.prompt(other, "later turn").systemMessage ?? "", /looks like work/);
    assert.equal(w.epoch(other)?.origin, expected === "changed" ? "hand" : undefined);
  }
  const quiet = randomUUID();
  w.start(quiet);
  w.turn(quiet);
  await w.sync();
  assert.doesNotMatch(w.prompt(quiet, "second turn").systemMessage ?? "", /looks like work/);
  assert.match(w.prompt(quiet, "::align suggestions on").reason, /are on/);
  const newSession = randomUUID();
  w.start(newSession);
  w.turn(newSession);
  await w.sync();
  assert.match(w.prompt(newSession, "second turn").systemMessage, /looks like work/);
});

test("rules abstain on weak history and offer two matching anchors without choosing", () => {
  const fake = new FakeServer();
  const goals = fake.goals.get("ws_acme")!.slice(0, 2);
  const git = { toplevel: "/p", name: "repo", branch: "work", remotes: ["owner/repo"] };
  const one = { folder: "/p", repo: "owner/repo", branch: "work", goal: "g_ship" };
  assert.deepEqual(ruleChoices(goals, null, "/p", git, [one]), []);
  assert.deepEqual(ruleChoices(goals, null, "/other", git, [one, one]), ["g_ship"]);
  assert.deepEqual(ruleChoices(goals, "g_perf", "/p", git, [one, one]), ["g_perf"]);
  const anchored = goals.map((goal) => ({ ...goal, anchors: { repos: ["owner/repo"], branch_patterns: ["work"], issues: [] } }));
  assert.deepEqual(ruleChoices(anchored, null, "/p", git, []), ["g_ship", "g_perf"]);
  assert.deepEqual(ruleChoices(anchored, null, "/p", { ...git, branch: "different" }, []), []);
});

test("a decision provider gets only the opted-in fields and a current bindable goal list", async (t) => {
  const w = await setup(t);
  const service = await decisionStandIn(t);
  const url = `${service.url}/v1/systemone`;
  const start = async () => {
    const sid = randomUUID();
    w.start(sid);
    w.turn(sid);
    await w.sync();
    return sid;
  };
  const off = await start();
  assert.equal(service.requests.length, 0);
  assert.equal(w.fake.log.filter(({ path }) => path.endsWith("/data-sharing")).length, 0);
  assert.doesNotMatch(w.prompt(off, "a new turn").systemMessage ?? "", /looks like work/);
  assert.match(await w.enableDecision(url), /first prompt, branch when known, saved repo alias/);
  w.fake.blockedModelWorkspaces.add("ws_acme");
  await start();
  assert.equal(service.requests.length, 0);
  w.fake.blockedModelWorkspaces.clear();
  w.fake.failCalls = (_method, path) => path.endsWith("/data-sharing");
  await start();
  assert.equal(service.requests.length, 0);
  w.fake.failCalls = undefined;
  w.ctx.db.prepare("INSERT INTO repo_aliases (workspace_id, repo_root, alias) VALUES (?,?,?)").run("ws_acme", w.cwd, ALIAS);
  const sid = await start();
  assert.equal(service.requests.length, 1);
  const sent = service.requests[0];
  assert.equal(sent.headers.authorization, `Bearer ${KEY}`);
  assert.deepEqual(JSON.parse(sent.body.state), {
    repo_alias: ALIAS, branch: BRANCH, first_prompt: PROMPT,
    goals: [{ id: "g_ship", title: "Ship the v2 onboarding flow" }, { id: "g_perf", title: "Cut hook latency" }],
  });
  assert.doesNotMatch(JSON.stringify(sent.body), /PRIVATE-REPLY|ABSOLUTE-PATH|CANARY-REMOTE|g_theirs/);
  assert.equal(w.fake.sessions.size, 0);
  assert.match(w.prompt(sid, "second turn").systemMessage, /looks like work toward "Ship/);
  w.prompt(sid, "::align share g_ship confirm");
  await w.sync();
  assert.equal(w.epoch(sid)?.origin, "suggested_model");
  assert.doesNotMatch(JSON.stringify(w.fake.requestBodies), /FIRST-PROMPT|PRIVATE-REPLY|CANARY-BRANCH|DECISION-KEY|probabilities/);
  assert.doesNotMatch(JSON.stringify(w.inspect(sid)), /CANARY/);
  await w.cli("data-sharing", "decision-model", "off");
  await start();
  assert.equal(service.requests.length, 1);
});

test("the three vendor wire formats use the same fit, choice and abstention rules", async (t) => {
  const service = await decisionStandIn(t);
  const send: typeof fetch = (input, init) => fetch(service.url + new URL(String(input)).pathname, init);
  const input = { repo_alias: null, branch: null, first_prompt: PROMPT, goals: [{ id: "g_ship", title: "Ship" }, { id: "g_perf", title: "Speed" }] };
  for (const provider of ["typesafe", "openai", "google"] as DecisionProvider[]) {
    assert.equal(await decideGoal({ provider }, KEY, input, 2000, send), "g_ship");
    const { url, headers, body } = service.requests.at(-1)!;
    assert.equal(url, new URL(DECISION_PROVIDERS[provider].url).pathname);
    assert.equal(body.model, DECISION_PROVIDERS[provider].model);
    assert.deepEqual(JSON.parse(body.input ?? body.state), input);
    assert.equal(provider === "google" ? headers["x-goog-api-key"] : headers.authorization, provider === "google" ? KEY : `Bearer ${KEY}`);
  }
  for (const failure of ["tie", "no-fit", "unknown", "refusal", "redirect", "timeout", "array", "object", "number"]) {
    service.set(failure);
    assert.equal(await decideGoal({ provider: "openai" }, KEY, input, 75, send), null, failure);
  }
  assert.equal(service.requests.some(({ url }) => url === "/redirect-target"), false);
});

test("the fork adapter writes only the scoped question to stand-ins and the worker abstains without account proof", async (t) => {
  const w = await setup(t);
  const decision = await decisionStandIn(t);
  const bin = path.join(w.env.root, "bin");
  const capture = path.join(w.env.root, "test-harness-arguments.json");
  fs.mkdirSync(bin);
  for (const harness of ["claude", "codex"]) {
    fs.writeFileSync(path.join(bin, harness), `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
const schemaFlag = args.includes("--json-schema") ? "--json-schema" : "--output-schema";
const schemaArg = args[args.indexOf(schemaFlag) + 1];
const schema = JSON.parse(schemaFlag === "--json-schema" ? schemaArg : fs.readFileSync(schemaArg, "utf8"));
fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({args, schema, leakedKey: !!process.env.ALIGN_DECISION_WORKSPACE_KEY}));
if (schemaFlag === "--json-schema") console.log(JSON.stringify({structured_output:{goal: "g_ship"}}));
else fs.writeFileSync(args[args.indexOf("-o") + 1], JSON.stringify({goal: "g_ship"}));
`, { mode: 0o700 });
  }
  w.ctx.env.PATH = `${bin}:${w.ctx.env.PATH}`;
  await w.enableDecision(`${decision.url}/v1/systemone`);
  await w.cli("data-sharing", "session-question", "on");
  const sid = randomUUID();
  w.start(sid);
  assert.equal(w.turn(sid).hookSpecificOutput, undefined);
  await w.sync();
  assert.equal(fs.existsSync(capture), false);
  assert.equal(decision.requests.length, 0);
  const goals = [{ id: "g_ship", title: "Ship the v2 onboarding flow" }, { id: "g_perf", title: "Cut hook latency" }];
  assert.equal(await forkGoal("claude-code", sid, w.cwd, goals, 2000, w.ctx.env), "g_ship");
  const call = JSON.parse(fs.readFileSync(capture, "utf8"));
  assert.ok(call.args.includes("--fork-session") && call.args.includes(sid));
  assert.deepEqual(call.schema.properties.goal.enum, ["g_ship", "g_perf", "none"]);
  assert.match(call.args.at(-1), /Ship the v2 onboarding flow/);
  assert.doesNotMatch(JSON.stringify(call), /CANARY|g_theirs/);
  assert.equal(call.leakedKey, false);
  assert.equal(decision.requests.length, 0);
  const notice = w.prompt(sid, "next turn");
  assert.doesNotMatch(notice.systemMessage ?? "", /looks like work/);
  assert.equal(notice.hookSpecificOutput, undefined);
  assert.equal(w.fake.sessions.size, 0);
  assert.equal(w.epoch(sid), undefined);
  assert.doesNotMatch(JSON.stringify(w.fake.requestBodies), /CANARY|Eligible goals/);

  const cs = randomUUID();
  const root = randomUUID();
  const file = path.join(w.env.root, "test-rollout.jsonl");
  writeLines(file, [
    { type: "session_meta", payload: { id: cs } },
    { type: "event_msg", payload: { type: "task_started", turn_id: root } },
    { type: "event_msg", payload: { type: "user_message", message: PROMPT } },
    { type: "event_msg", payload: { type: "agent_message", message: REPLY } },
  ]);
  runHook(w.env, "codex", "SessionStart", { session_id: cs, cwd: w.cwd, source: "resume" });
  runHook(w.env, "codex", "UserPromptSubmit", { session_id: cs, turn_id: root, cwd: w.cwd, transcript_path: file, prompt: PROMPT });
  runHook(w.env, "codex", "Stop", { session_id: cs, turn_id: root, cwd: w.cwd, transcript_path: file });
  await w.sync();
  assert.deepEqual(JSON.parse(fs.readFileSync(capture, "utf8")), call);
  assert.equal(decision.requests.length, 0);
  assert.equal(await forkGoal("codex", cs, w.cwd, goals, 2000, w.ctx.env), "g_ship");
  const codex = JSON.parse(fs.readFileSync(capture, "utf8"));
  assert.ok(codex.args.includes("fork") && codex.args.includes("--ephemeral") && codex.args.includes(cs));
  assert.deepEqual(codex.schema.properties.goal.enum, ["g_ship", "g_perf", "none"]);
  assert.doesNotMatch(JSON.stringify(codex), /CANARY|g_theirs/);
});

test("a shared session hears a move only after three completed turns and this requires a binding command", async (t) => {
  const w = await setup(t);
  w.fake.bumpGoal("ws_acme", "g_ship", { anchors: { repos: [], branch_patterns: [BRANCH], issues: [] } });
  await w.cli("goals", "--refresh");
  const sid = randomUUID();
  w.start(sid);
  w.prompt(sid, "::align share g_perf confirm");
  await w.sync();
  for (let i = 0; i < 3; i++) {
    assert.doesNotMatch(w.turn(sid).systemMessage ?? "", /looks like work/);
    await w.sync();
  }
  const offer = w.prompt(sid, "next turn");
  assert.match(offer.systemMessage, /looks like work toward "Ship.*::align bind/);
  assert.doesNotMatch(JSON.stringify(offer.hookSpecificOutput ?? {}), /looks like work/);
  assert.equal(w.epoch(sid)?.goal_id, "g_perf");
  w.prompt(sid, "::align bind g_ship");
  w.prompt(sid, "use the new goal");
  await w.sync();
  assert.ok([...w.fake.epochs.values()].some((e) => e.goal_id === "g_ship" && e.origin === "suggested_rule"));
});

test("the weekly local note only offers a unanimous rule match and leaves unknown cost unknown", async (t) => {
  const { pastGoalSuggestion } = await import("../src/goal-suggestions.ts");
  const { unsharedNote } = await import("../src/shared/steering.ts");
  const { layout } = await import("../src/shared/layout.ts");
  const { writeJsonAtomic } = await import("../src/shared/fsx.ts");
  const w = await setup(t);
  w.fake.bumpGoal("ws_acme", "g_ship", { anchors: { repos: [], branch_patterns: [BRANCH], issues: [] } });
  await w.cli("goals", "--refresh");
  const sessions = [randomUUID(), randomUUID()];
  for (const sid of sessions) {
    w.start(sid);
    w.turn(sid);
    await w.sync();
  }
  const now = Date.now();
  const past = pastGoalSuggestion(w.ctx, [w.cwd], now);
  assert.ok(past && past.expires_at > now);
  assert.deepEqual({ ...past, expires_at: undefined }, {
    folder: w.cwd, workspace: "ws_acme", goal: "g_ship", sessions: 2, micros: null, expires_at: undefined,
  });
  writeJsonAtomic(layout.unsharedDigest(w.env.home), {
    computed_at: new Date(now).toISOString(), total_tokens: 300, unshared_tokens: 300, share: 100, top: [{ dir: w.cwd, tokens: 300 }], past_goal: past, past_offer_change: null,
  });
  assert.match(unsharedNote(w.env.home, now) ?? "", /2 private sessions.*Ship.*estimate unknown.*--past 7/);
  assert.equal(unsharedNote(w.env.home, now), null);
  w.ctx.db.prepare("UPDATE goal_suggestions SET candidates=? WHERE local_id=?").run('["g_perf"]', localId("claude-code", sessions[1]));
  assert.equal(pastGoalSuggestion(w.ctx, [w.cwd], now), undefined);
  assert.equal(w.fake.sessions.size, 0);
});

test("two rule choices require a clear pick before sharing", async (t) => {
  const w = await setup(t);
  const anchors = { repos: [], branch_patterns: [BRANCH], issues: [] };
  w.fake.bumpGoal("ws_acme", "g_ship", { anchors });
  w.fake.bumpGoal("ws_acme", "g_perf", { title: "Ship the faster hook", anchors });
  await w.cli("goals", "--refresh");
  const sid = randomUUID();
  w.start(sid);
  w.turn(sid);
  await w.sync();
  assert.match(w.prompt(sid, "next turn").systemMessage, /"Ship the v2 onboarding flow" or "Ship the faster hook"/);
  assert.match(w.prompt(sid, "::align share").reason, /more than one goal may fit/);
  assert.match(w.prompt(sid, "::align share Ship confirm").reason, /more than one goal matches that name/);
  await w.sync();
  assert.equal(w.epoch(sid), undefined);
  w.prompt(sid, "::align share g_perf confirm");
  await w.sync();
  assert.equal(w.epoch(sid)?.goal_id, "g_perf");
  assert.equal(w.epoch(sid)?.origin, "suggested_rule");
});

test("the decision request uses the original turn branch after a checkout", async (t) => {
  const w = await setup(t);
  const service = await decisionStandIn(t);
  await w.enableDecision(service.url);
  const sid = randomUUID();
  w.start(sid);
  w.turn(sid);
  fs.writeFileSync(path.join(w.cwd, ".git", "HEAD"), "ref: refs/heads/CANARY-LATER-BRANCH\n");
  await w.sync();
  assert.equal(service.requests.length, 1);
  assert.equal(JSON.parse(service.requests[0].body.state).branch, BRANCH);
  assert.doesNotMatch(JSON.stringify(service.requests[0].body), /CANARY-LATER-BRANCH/);
  const legacy = randomUUID();
  w.start(legacy);
  w.turn(legacy);
  ingestSpool(w.ctx);
  w.ctx.db.prepare("UPDATE analysis_jobs SET input=json_remove(input, '$.turn.git') WHERE local_id=?")
    .run(localId("claude-code", legacy));
  await w.sync();
  assert.equal(service.requests.length, 2);
  assert.equal(Object.hasOwn(JSON.parse(service.requests[1].body.state), "branch"), false);
  assert.doesNotMatch(JSON.stringify(service.requests[1].body), /CANARY-LATER-BRANCH/);
});

test("a restriction saved while eligible goals are loading prevents dispatch", async (t) => {
  const w = await setup(t);
  const service = await decisionStandIn(t);
  await w.enableDecision(service.url);
  const sid = randomUUID();
  w.start(sid);
  w.turn(sid);
  ingestSpool(w.ctx);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let received!: () => void;
  const goalRead = new Promise<void>((resolve) => { received = resolve; });
  w.fake.holdCalls = { match: (_, url) => url.endsWith("/goals"), release: hold };
  w.fake.beforeRequest = (_, url) => { if (url.endsWith("/goals")) received(); };
  const work = runAnalysis(w.ctx);
  await goalRead;
  await new Promise((resolve) => setTimeout(resolve, 75));
  w.fake.blockedModelWorkspaces.add("ws_acme");
  release();
  await work;
  assert.equal(service.requests.length, 0);
  assert.deepEqual(w.inspect(sid).suggestions, []);
});

test("a device cannot opt in to a member-supplied workspace address", async (t) => {
  const w = await setup(t);
  const service = await decisionStandIn(t);
  const selected = await runCli(w.env, ["data-sharing", "decision-model", "on", "workspace", service.url]);
  assert.notEqual(selected.code, 0);
  assert.match(selected.stderr, /workspace owner/i);
  const sid = randomUUID();
  w.start(sid);
  w.turn(sid);
  await w.sync();
  assert.equal(service.requests.length, 0);
});

test("a changed session profile cannot reuse the worker's account for a fork", async (t) => {
  const w = await setup(t);
  const bin = path.join(w.env.root, "switched-profile");
  const capture = path.join(w.env.root, "test-fork-started");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "claude"), `#!${process.execPath}
require("node:fs").writeFileSync(${JSON.stringify(capture)}, "Test fork stand-in");
`, { mode: 0o700 });
  await w.cli("data-sharing", "session-question", "on");
  const sid = randomUUID();
  w.start(sid);
  w.turn(sid);
  w.ctx.env.PATH = `${bin}:${w.ctx.env.PATH}`;
  w.ctx.env.CLAUDE_CONFIG_DIR = bin;
  await w.sync();
  assert.equal(fs.existsSync(capture), false);
  assert.deepEqual(w.inspect(sid).suggestions, []);
});

test("share confirmation must match the current preview after a suggestion was shown", async (t) => {
  const w = await setup(t);
  w.fake.bumpGoal("ws_acme", "g_ship", { anchors: { repos: [], branch_patterns: [BRANCH], issues: [] } });
  await w.cli("goals", "--refresh");
  const sid = randomUUID();
  w.start(sid);
  w.turn(sid);
  await w.sync();
  w.prompt(sid, "show suggestion");
  const preview = w.prompt(sid, "::align share").reason;
  assert.match(preview, /Workspace:[^\n]+[\s\S]*Goal: Ship[\s\S]*counts from session start[\s\S]*Work signals OFF/);
  assert.match(w.prompt(sid, "::align share --signals g_ship confirm").reason, /new preview/i);
  assert.match(w.prompt(sid, "::align share g_perf confirm").reason, /new preview/i);
  w.prompt(sid, "::align dismiss");
  assert.match(w.prompt(sid, "::align share confirm").reason, /new preview/i);
  assert.match(w.prompt(sid, "::align share g_ship confirm").reason, /new preview/i);
  await w.sync();
  assert.equal(w.epoch(sid), undefined);
  assert.match(w.prompt(sid, "::align share g_perf").reason, /Workspace:[^\n]+[\s\S]*Goal: Cut hook latency/);
  assert.match(w.prompt(sid, "::align share confirm").reason, /sharing requested toward "Cut hook latency"/);
  await w.sync();
  assert.equal(w.epoch(sid)?.goal_id, "g_perf");
  assert.equal(w.epoch(sid)?.origin, "hand");
  assert.deepEqual(w.inspect(sid).suggestion_feedback.map((row) => row.reply), ["dismissed"]);

  const deleted = randomUUID();
  w.start(deleted);
  w.turn(deleted);
  await w.sync();
  w.prompt(deleted, "show suggestion");
  assert.match(w.prompt(deleted, "::align share").reason, /Goal: Ship/);
  await w.cli("analysis", "delete", deleted);
  assert.match(w.prompt(deleted, "::align share confirm").reason, /new preview/i);
  await w.sync();
  assert.equal(w.epoch(deleted), undefined);
});

test("feedback, changing import eligibility and aging out each remove a cached weekly offer", async (t) => {
  const { computeUnsharedDigest } = await import("../src/allocation.ts");
  const { layout } = await import("../src/shared/layout.ts");
  const { readJson } = await import("../src/shared/fsx.ts");
  const { unsharedNote } = await import("../src/shared/steering.ts");
  const { pastSessions } = await import("../src/share.ts");
  const w = await setup(t);
  w.fake.bumpGoal("ws_acme", "g_ship", { anchors: { repos: [], branch_patterns: [BRANCH], issues: [] } });
  await w.cli("goals", "--refresh");
  const sessions = [randomUUID(), randomUUID(), randomUUID()];
  for (const sid of sessions) {
    w.start(sid);
    w.turn(sid);
    await w.sync();
    const at = new Date().toISOString();
    w.ctx.db.prepare(`INSERT INTO requests(request_key, provider, local_id, harness, ts, model, query_source, input, basis,
      price_table_version, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'main', 100, 'unknown', 't', 'transcript', ?, ?)`)
      .run(sid, "anthropic", localId("claude-code", sid), "claude-code", at, "test-meter", at, at);
  }
  // Give the first session a closer expiry so the other two are still eligible after it ages out.
  w.ctx.db.prepare("UPDATE sessions SET last_active=? WHERE local_id=?")
    .run(new Date(Date.now() - 6 * 86_400_000).toISOString(), localId("claude-code", sessions[0]));
  const now = Date.now();
  const digest = computeUnsharedDigest(w.ctx, now, true);
  assert.equal(digest?.past_goal?.sessions, 3);
  const weeklyFile = layout.unsharedShown(w.env.home);
  assert.doesNotMatch(unsharedNote(w.env.home, digest!.past_goal!.expires_at + 1) ?? "", /private sessions.*look like work toward/);
  fs.rmSync(weeklyFile, { force: true });
  w.prompt(sessions[2], "::align share g_ship confirm");
  assert.doesNotMatch(unsharedNote(w.env.home, now) ?? "", /private sessions.*look like work toward/);
  fs.rmSync(weeklyFile, { force: true });
  await w.sync();
  const refreshed = readJson(layout.unsharedDigest(w.env.home));
  assert.equal(refreshed.past_goal?.sessions, 2);
  assert.equal(refreshed.computed_at, digest?.computed_at);
  assert.equal(pastSessions(w.ctx, realDir(w.cwd), 7).take.length, 2);
  assert.match(await w.cli("share", "--dir", w.cwd, "--goal", "g_ship", "--past", "7"), /2 session\(s\)[\s\S]*Skipped 1 that were shared before/);
  w.prompt(sessions[1], "next turn");
  w.prompt(sessions[1], "::align dismiss");
  assert.doesNotMatch(unsharedNote(w.env.home, now) ?? "", /private sessions.*look like work toward/);
  fs.rmSync(weeklyFile, { force: true });
  await w.sync();
  assert.equal(readJson(layout.unsharedDigest(w.env.home)).past_goal, undefined);
  assert.doesNotMatch(unsharedNote(w.env.home, now) ?? "", /private sessions.*look like work toward/);
  assert.equal(w.fake.sessions.size, 1);
});

test("analysis inspection names the suggested goal, source and response", async (t) => {
  const w = await setup(t);
  w.fake.bumpGoal("ws_acme", "g_ship", { anchors: { repos: [], branch_patterns: [BRANCH], issues: [] } });
  await w.cli("goals", "--refresh");
  let sid = randomUUID();
  while (!localId("claude-code", sid).startsWith("-")) sid = randomUUID();
  w.start(sid);
  w.turn(sid);
  await w.sync();
  w.prompt(sid, "show suggestion");
  w.prompt(sid, "::align dismiss");
  await w.sync();
  const shown = await w.cli("analysis", "show", localId("claude-code", sid));
  assert.match(shown, /Ship the v2 onboarding flow[\s\S]*Local rules[\s\S]*Dismissed/);
  assert.doesNotMatch(shown, /suggestion_feedback|candidates|stage|suggested_rule|CANARY/);
  const report = JSON.parse(await w.cli("analysis", "show", sid, "--json"));
  assert.deepEqual(report, JSON.parse(JSON.stringify(w.inspect(sid))));
});

test("repeating consent keeps eligible turns and opting in again excludes earlier turns", async (t) => {
  const w = await setup(t);
  const service = await decisionStandIn(t);
  const pending = () => {
    const sid = randomUUID();
    w.start(sid);
    w.turn(sid);
    return sid;
  };
  const beforeConsent = pending();
  await w.enableDecision(service.url);
  const afterConsent = pending();
  await w.cli("data-sharing", "decision-model", "on", "workspace");
  await w.sync();
  assert.equal(service.requests.length, 1);
  assert.equal(w.inspect(beforeConsent).suggestions.length, 0);
  assert.equal(w.inspect(afterConsent).suggestions.length, 1);

  const beforeRenewal = pending();
  await w.cli("data-sharing", "decision-model", "off");
  await w.cli("data-sharing", "decision-model", "on", "workspace");
  const afterRenewal = pending();
  await w.sync();
  assert.equal(service.requests.length, 2);
  assert.equal(w.inspect(beforeRenewal).suggestions.length, 0);
  assert.equal(w.inspect(afterRenewal).suggestions.length, 1);
});

test("changing the owner's address requires new consent even if the old address returns", async (t) => {
  const w = await setup(t);
  const original = await decisionStandIn(t);
  const replacement = await decisionStandIn(t);
  assert.match(await w.enableDecision(original.url), /Workspace decision service at http:\/\/127\.0\.0\.1:/);
  w.configure(replacement.url);
  const submit = async () => {
    const sid = randomUUID();
    w.start(sid);
    w.turn(sid);
    await w.sync();
  };
  await submit();
  w.configure(original.url);
  await submit();
  assert.equal(original.requests.length, 0);
  assert.equal(replacement.requests.length, 0);
  await w.cli("data-sharing", "decision-model", "on", "workspace");
  await submit();
  assert.equal(original.requests.length, 1);
  assert.equal(replacement.requests.length, 0);
});

test("a terminal confirmation also expires when a visible suggestion is dismissed during the preview", async (t) => {
  const w = await setup(t);
  w.fake.bumpGoal("ws_acme", "g_ship", { anchors: { repos: [], branch_patterns: [BRANCH], issues: [] } });
  await w.cli("goals", "--refresh");
  const sid = randomUUID();
  w.start(sid);
  w.turn(sid);
  await w.sync();
  w.prompt(sid, "show suggestion");
  // Treat piped input as an interactive terminal for this test.
  const input = "data:text/javascript,Object.defineProperty(process.stdin,'isTTY',{value:true})";
  const child = spawn(process.execPath, ["--import", input, CLI, "share", sid, "--goal", "g_ship"], { env: w.env.env });
  let error = "";
  let output = "";
  let answered = false;
  child.stderr.on("data", (chunk) => { error += chunk; });
  child.stdout.on("data", (chunk) => {
    output += chunk;
    if (!answered && output.includes("Share this session?")) {
      answered = true;
      w.prompt(sid, "::align dismiss");
      child.stdin.end("y\n");
    }
  });
  t.after(() => { child.kill(); });
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(answered, true, output + error);
  assert.notEqual(code, 0, output);
  assert.match(error, /new preview/i);
  assert.equal(w.epoch(sid), undefined);
  assert.equal(w.fake.sessions.size, 0);
});
