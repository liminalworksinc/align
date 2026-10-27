#!/usr/bin/env node
// Direct route/domain tests. No HTTP listener, application launch, provider, model, or real profile.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import ts from "typescript";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
// The only framework substitution is connection(), which requires a running Next request scope.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/server") return { url: "data:text/javascript,export async function connection() {}", shortCircuit: true };
    if (specifier.startsWith("@/")) specifier = pathToFileURL(path.join(root, specifier.slice(2))).href;
    if ((specifier.startsWith(".") || specifier.startsWith("file:")) && context.parentURL?.startsWith("file:")) {
      const url = new URL(specifier, context.parentURL);
      if (!path.extname(url.pathname) && existsSync(fileURLToPath(url) + ".ts")) return { url: url.href + ".ts", shortCircuit: true };
    }
    if (process.env.ALIGN_TEST_DEPENDENCY_ROOT && (specifier === "better-auth" || specifier.startsWith("better-auth/"))) return next(specifier, { ...context, parentURL: pathToFileURL(path.join(process.env.ALIGN_TEST_DEPENDENCY_ROOT, "package.json")).href });
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith("file:") && url.endsWith(".ts") && !url.includes("/node_modules/")) return { format: "module", source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const probe = process.argv.includes("--probe");
const dataDir = probe ? process.env.ALIGN_DATA_DIR : mkdtempSync(path.join(tmpdir(), "align-registry-test-"));
if (!probe) process.once("exit",()=>rmSync(dataDir,{recursive:true,force:true}));
for (const key of ["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GITHUB_CLIENT_ID","GITHUB_CLIENT_SECRET","ALIGN_PUBLIC_ORIGIN"]) delete process.env[key];
Object.assign(process.env, { ALIGN_DATA_DIR: dataDir, ALIGN_GOAL_SESSIONS: "1", ALIGN_GOAL_REGISTRY: "1", ALIGN_GOAL_SESSIONS_TEST_IDP: "1", HOSTED: "0", BETTER_AUTH_SECRET: "isolated-registry-fixture-secret-at-least-32" });
const { ready } = await import("../lib/v2/init.ts");
await ready();
const { goalRegistry, registryInstanceId } = await import("../lib/v2/goal-registry.ts");
if (probe) { console.log(registryInstanceId()); process.exit(0); }
try {
  const { viewDigest, viewEncoding, projectionId } = await import("../lib/v2/goal-registry-codec.ts");
  const vectors = JSON.parse(readFileSync(path.join(root, "test/fixtures/align-goal-registry-v1.json"))).vectors;
  for (const v of vectors) {
    assert.equal(viewEncoding(v.registry_instance_id, v.workspace_id, v.goal), v.encoding, v.name);
    assert.equal(viewDigest(v.registry_instance_id, v.workspace_id, v.goal), v.view_digest, v.name);
    assert.equal(projectionId(v.registry_instance_id, v.workspace_id, v.goal.id), v.projection_id, v.name);
  }
  const v = vectors[0];
  for (const goal of [{ ...v.goal, version: Number.MAX_SAFE_INTEGER + 1 }, { ...v.goal, title: "bad\ud800" }, { ...v.goal, measures: [{id:"m",text:"bad\udfff",target:null}] }]) assert.throws(() => viewDigest(v.registry_instance_id, v.workspace_id, goal));
  const { GET } = await import("../app/api/v2/workspaces/[ws]/goal-registry/route.ts");
  const { getAuth } = await import("../lib/v2/auth.ts");
  const { createWorkspace, enter } = await import("../lib/v2/workspaces.ts");
  const { createGoal, newGoalVersion, goalsFeed } = await import("../lib/v2/goals.ts");
  const { run, get } = await import("../lib/v2/db.ts");
  const { sha256hex } = await import("../lib/v2/ids.ts");
  async function signup(name) {
    const res = await getAuth().handler(new Request("http://127.0.0.1:3999/api/v2/auth/sign-up/email", {method:"POST",headers:{"content-type":"application/json",origin:"http://127.0.0.1:3999"},body:JSON.stringify({name,email:name+"@fixture.invalid",password:"test-password-123"})}));
    assert.equal(res.status, 200, await res.clone().text());
    return { user: (await res.json()).user, cookie: res.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ") };
  }
  const owner = await signup("owner"); const other = await signup("other");
  const ws = await createWorkspace(owner.user.id,"Fixture workspace");
  const ws2 = await createWorkspace(other.user.id,"Other workspace");
  run("INSERT INTO v2_members(ws_id,user_id,role,created_at) VALUES (?,?,'member',?)",ws.id,other.user.id,new Date().toISOString());
  const pp = enter({kind:"web",user:owner.user,emailVerified:false},ws.id);
  const op = enter({kind:"web",user:other.user,emailVerified:false},ws.id);
  const hidden = await createGoal(pp,{title:"PRIVATE CANARY",visibility:"private"});
  const goal = await createGoal(pp,{title:"Public outcome",measures:[{text:"Pass",target:null}],depends_on:[hidden.id]});
  const call = (headers={}, id=ws.id) => GET(new Request("http://127.0.0.1/api/v2/workspaces/"+id+"/goal-registry",{headers:{host:"127.0.0.1:3999",...headers}}),{params:Promise.resolve({ws:id})});
  assert.equal((await call()).status,401);
  const response = await call({cookie:owner.cookie}); assert.equal(response.status,200); assert.equal(response.headers.get("cache-control"),"private, no-store");
  const snapshot = await response.json(); assert.equal(snapshot.goals.length,2);
  const otherResponse = await call({cookie:other.cookie}); const otherWire = await otherResponse.text(); assert.equal(otherResponse.status,200); assert.ok(!otherWire.includes(hidden.id)); assert.ok(!otherWire.includes("PRIVATE CANARY"));
  const otherGoal=JSON.parse(otherWire).goals[0]; assert.deepEqual(otherGoal.depends_on,[]);
  assert.notEqual(otherGoal.external_ref.view_digest,snapshot.goals.find(g=>g.id===goal.id).external_ref.view_digest);
  assert.equal((await call({cookie:owner.cookie},ws2.id)).status,404);
  const before = goalsFeed(pp); const versions = get("SELECT COUNT(*) n FROM v2_goal_versions WHERE goal_id=?",goal.id).n;
  const versionRoute = await import("../app/api/v2/workspaces/[ws]/goals/[goal]/versions/route.ts");
  const edit=await versionRoute.POST(new Request("http://127.0.0.1/api",{method:"POST",headers:{host:"127.0.0.1:3999",cookie:owner.cookie,"content-type":"application/json"},body:JSON.stringify({version:goal.version,title:"Changed outcome",measures:[{id:goal.measures[0].id,text:"Pass again",target:"2"}]})}),{params:Promise.resolve({ws:ws.id,goal:goal.id})});
  assert.equal(edit.status,201,await edit.clone().text());
  const changed=goalRegistry(pp).goals.find(g=>g.id===goal.id); assert.equal(changed.version,2); assert.equal(changed.measures[0].id,goal.measures[0].id); assert.equal(changed.measures[0].target,"2");
  assert.equal(get("SELECT COUNT(*) n FROM v2_goal_versions WHERE goal_id=?",goal.id).n,versions+1); assert.notEqual(goalsFeed(pp).version,before.version);
  const oldFeedRoute=await import("../app/api/v2/workspaces/[ws]/goals/route.ts");
  const oldFeed=await oldFeedRoute.GET(new Request("http://127.0.0.1/api",{headers:{host:"127.0.0.1:3999",cookie:owner.cookie}}),{params:Promise.resolve({ws:ws.id})});
  const legacyFeed=await oldFeed.json();
  assert.equal(legacyFeed.goals.find(g=>g.id===goal.id).version,changed.version);
  assert.ok(legacyFeed.goals.every(g=>!("external_ref" in g)));
  const cached=await oldFeedRoute.GET(new Request("http://127.0.0.1/api",{headers:{host:"127.0.0.1:3999",cookie:owner.cookie,"if-none-match":oldFeed.headers.get("etag")}}),{params:Promise.resolve({ws:ws.id})});
  assert.equal(cached.status,304);
  await assert.rejects(()=>newGoalVersion(op,goal.id,{title:"forged edit"}));
  const a=goalRegistry(pp,"2026-10-25T01:00:00.000Z"); const b=goalRegistry(pp,"2026-10-26T01:00:00.000Z");
  assert.deepEqual(a.goals.map(g=>g.external_ref.view_digest),b.goals.map(g=>g.external_ref.view_digest));
  const at = new Date().toISOString(); const exp=new Date(Date.now()+3600000).toISOString(); const token="alnd_fixture-access-token"; const device="dv_fixture";
  run("INSERT INTO v2_devices(id,user_id,name,public_key,created_at) VALUES (?,?,?,?,?)",device,owner.user.id,"fixture","fixture",at);
  run("INSERT INTO v2_device_grants(device_id,ws_id) VALUES (?,?)",device,ws.id);
  run("INSERT INTO v2_device_tokens(token_hash,device_id,kind,created_at,expires_at) VALUES (?,?,'access',?,?)",sha256hex(token),device,at,exp);
  const bearer={authorization:"Bearer "+token}; assert.equal((await call(bearer)).status,200);
  assert.equal((await call({...bearer,cookie:owner.cookie})).status,403); assert.equal((await call({...bearer,origin:"http://127.0.0.1"})).status,403);
  assert.equal((await call(bearer,ws2.id)).status,404);
  const deniedEdit=await versionRoute.POST(new Request("http://127.0.0.1/api",{method:"POST",headers:{...bearer,"content-type":"application/json"},body:JSON.stringify({title:"agent write"})}),{params:Promise.resolve({ws:ws.id,goal:goal.id})}); assert.equal(deniedEdit.status,403);
  run("UPDATE v2_devices SET revoked_at=? WHERE id=?",at,device); assert.equal((await call(bearer)).status,401);
  const instance=registryInstanceId(); await (await import("../lib/v2/goal-registry.ts")).initializeGoalRegistry(); assert.equal(registryInstanceId(),instance);
  const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),"--probe"],{env:{...process.env},encoding:"utf8"}); assert.equal(child.status,0,child.stderr); assert.equal(child.stdout.trim(),instance);
  // Reads leave historical goal hashes and session epochs alone.
  const hash=get("SELECT content_hash FROM v2_goal_versions WHERE goal_id=? AND version=1",goal.id).content_hash;
  goalRegistry(pp); assert.equal(get("SELECT content_hash FROM v2_goal_versions WHERE goal_id=? AND version=1",goal.id).content_hash,hash);
  assert.equal(get("SELECT COUNT(*) n FROM v2_epochs").n,0);
  run("UPDATE v2_goals SET version=? WHERE id=?",Number.MAX_SAFE_INTEGER+1,goal.id);
  assert.throws(()=>goalRegistry(pp));
  run("UPDATE v2_goals SET version=2 WHERE id=?",goal.id);
  const manyMeasures=JSON.stringify(Array.from({length:10},(_,i)=>({id:"m_"+i,text:"x".repeat(4000),target:null})));
  for(let i=0;i<60;i++) run("INSERT INTO v2_goals(id,ws_id,owner_id,visibility,version,title,measures_json,anchors_json,status,created_at,updated_at) VALUES (?,?,?,'workspace',1,'bounded',?,?,'active',?,?)","g_bound_"+i,ws.id,owner.user.id,manyMeasures,JSON.stringify({repos:[],branch_patterns:[],issues:[]}),at,at);
  assert.throws(()=>goalRegistry(pp),e=>e.code==="registry_too_large" && e.status===413);
  run("DELETE FROM v2_goals WHERE id LIKE 'g_bound_%'");
  for(let i=0;i<1001;i++) run("INSERT INTO v2_goals(id,ws_id,owner_id,visibility,version,title,measures_json,anchors_json,status,created_at,updated_at) VALUES (?,?,?,'workspace',1,'bounded','[]',?,'active',?,?)","g_count_"+i,ws.id,owner.user.id,JSON.stringify({repos:[],branch_patterns:[],issues:[]}),at,at);
  assert.throws(()=>goalRegistry(pp),e=>e.code==="registry_too_large" && e.status===413);
  run("DELETE FROM v2_goals WHERE id LIKE 'g_count_%'");
  process.env.ALIGN_GOAL_REGISTRY="0"; assert.equal((await call({cookie:owner.cookie})).status,404);
  process.env.ALIGN_GOAL_REGISTRY="1"; process.env.ALIGN_GOAL_SESSIONS="0"; assert.equal((await call({cookie:owner.cookie})).status,404);
  console.log("PASS registry vectors, Unicode/version refusal, cookie/device auth separation, privacy, owner edit, old feed, revocation, disabled mode, restart identity and immutable history");
} finally { rmSync(dataDir,{recursive:true,force:true}); }
