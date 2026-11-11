"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.samplePopulated = samplePopulated;
// Private source-independent composition controls. Goal service ports are owned controls.
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_sqlite_1 = require("node:sqlite");
const server_workspaces_owned_fixture_v2_mjs_1 = require("./server-workspaces-owned-fixture-v2.mjs");
async function samplePopulated({ directory, dependencies, loadWorkspace, loadSample }) {
    const { create_store, change_programs, apply_migrations, count, authorize, create_creation } = dependencies;
    (0, strict_1.default)(!node_fs_1.default.existsSync(directory));
    node_fs_1.default.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const records = [];
    let scenario = 0;
    const execute = async ({ failAt = -1, after = false, mode = 'open', caps = { workspaces: 10, owned: 10, members: 10 }, code = null, expected } = {}) => {
        const owned = node_path_1.default.join(directory, 'case-' + scenario++), shared = {};
        const store = create_store({ dataDir: () => owned, shared, DatabaseSync: node_sqlite_1.DatabaseSync, join: node_path_1.default.join, existsSync: node_fs_1.default.existsSync, mkdirSync: node_fs_1.default.mkdirSync, chmodSync: node_fs_1.default.chmodSync, random: () => 0.25, setTimeout, schemaVersion: change_programs().length, changePrograms: change_programs, applyMigrations: apply_migrations, count });
        try {
            store.authDb().exec('CREATE TABLE ba_user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL)');
            store.migrate();
            const at = new Date(server_workspaces_owned_fixture_v2_mjs_1.NOW).toISOString();
            store.run('INSERT INTO ba_user (id,name,email) VALUES (?,?,?)', 'u1', 'Owned person', 'u1@example.test');
            store.run("INSERT INTO v2_workspaces (id,name,created_by,created_at) VALUES ('existing','Existing owned workspace','u1',?)", at);
            store.run("INSERT INTO v2_members (ws_id,user_id,role,created_at) VALUES ('existing','u1','owner',?)", at);
            const tables = store.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(x => x.name);
            const snapshot = () => JSON.stringify(tables.map(name => [name, store.all('SELECT * FROM "' + name.replaceAll('"', '""') + '"').map(x => JSON.stringify(x)).sort()]));
            const f = (0, server_workspaces_owned_fixture_v2_mjs_1.fixture)({ hosted: true });
            let ids = 0, called = 0, captcha = 0, redeemed = 0;
            Object.assign(f.resources, { all: store.all, get: store.get, run: store.run, sql: store.sql, tx: store.tx, LIVE_WS: store.LIVE_WS, audit: store.audit, authorize, newId: prefix => prefix + '-owned-' + (++ids) });
            const creation = create_creation({ config: () => ({ hosted: true }), secret: () => 'owned-sample-control-secret', requireCaptcha: async () => { captcha++; }, caps: () => caps, creationMode: () => mode, CODE_RE: /^[A-Za-z0-9_-]+$/, redeemCreationCode: () => { redeemed++; return true; }, get: store.get, sql: store.sql, refuseDisposable: () => undefined, V2Error: f.resources.V2Error, conflict: f.resources.conflict, forbidden: f.resources.forbidden, count, readFirstOwnerEmail: () => undefined, memberCheckNow: () => at });
            for (const name of ['precheckCreation', 'admitCreation', 'checkMemberCap', 'checkRestoreCaps'])
                f.resources[name] = creation[name];
            const workspace = await loadWorkspace(f), trace = [], fault = new Error('Owned sample seed failure');
            const ports = {
                audit: store.audit, run: store.run, newId: f.resources.newId, newLimitId: () => 'limit-owned-' + (++ids),
                createWorkspace: workspace.createWorkspace,
                insertGoal: (pp, body, time) => {
                    const id = 'goal-owned-' + (++ids);
                    store.run("INSERT INTO v2_goals (id,ws_id,owner_id,pod_id,visibility,level,version,title,measures_json,anchors_json,depends_on_json,limits_json,target_share,status,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?,?,?,?,NULL,'active',?,?)", id, pp.wsId, pp.userId, body.podId, body.visibility, body.level, body.title, JSON.stringify(body.measures), JSON.stringify(body.anchors), JSON.stringify(body.dependsOn), JSON.stringify(body.limits ?? []), time, time);
                    return id;
                },
                goalRow: (ws, id) => store.get('SELECT * FROM v2_goals WHERE ws_id=? AND id=?', ws, id),
                insertAlignment: (pp, target, source, choice, sessions, note, time) => {
                    strict_1.default.equal(choice, 'contribution');
                    strict_1.default.equal(sessions.length, 0);
                    strict_1.default.equal(note, null);
                    const id = 'alignment-owned-' + (++ids);
                    store.run("INSERT INTO v2_alignments (id,ws_id,requester_id,target_goal_id,source_goal_id,state,revision,created_at,updated_at) VALUES (?,?,?,?,?,'approved',1,?,?)", id, pp.wsId, pp.userId, target.id, source.id, time, time);
                    return id;
                },
                insertChangeRequest: (pp, goal, changes, reason, time) => {
                    const id = 'request-owned-' + (++ids);
                    store.run("INSERT INTO v2_change_requests (id,ws_id,goal_id,requester_id,state,revision,base_version,changes_json,reason,created_at,updated_at) VALUES (?,?,?,?,'pending',1,?,?,?,?,?)", id, pp.wsId, goal.id, pp.userId, goal.version, JSON.stringify(changes), reason, time, time);
                    return id;
                },
            };
            for (const [name, operation] of Object.entries(ports))
                ports[name] = function (...args) {
                    strict_1.default.equal(this, undefined);
                    const index = called++;
                    trace.push(name);
                    if (index === failAt && !after)
                        throw fault;
                    const value = operation(...args);
                    if (index === failAt && after)
                        throw fault;
                    return value;
                };
            const sample = await loadSample({ resources: ports, Clock: f.Clock });
            f.web.user.email = 'u1@example.test';
            const before = snapshot();
            let value, error;
            try {
                value = await sample.createSampleWorkspace({ ownedRequest: true }, f.web, code);
            }
            catch (e) {
                error = e;
            }
            if (failAt >= 0) {
                strict_1.default.equal(error, fault);
                strict_1.default.equal(snapshot(), before, 'Every database row and sequence must roll back');
                strict_1.default.equal(called, failAt + 1);
            }
            else if (expected) {
                strict_1.default.equal(error?.code, expected);
                strict_1.default.equal(snapshot(), before);
                strict_1.default.equal(called, 1);
            }
            else {
                strict_1.default.equal(error, undefined);
                strict_1.default.equal(value.name, 'Northstar (sample)');
                strict_1.default.equal(value.role, 'owner');
                strict_1.default.equal(store.get('SELECT COUNT(*) AS n FROM v2_workspaces').n, 2);
                strict_1.default.equal(store.get('SELECT COUNT(*) AS n FROM v2_members WHERE ws_id=?', value.id).n, 1);
                strict_1.default.deepEqual(store.all('SELECT name FROM v2_pods WHERE ws_id=? ORDER BY name', value.id).map(x => x.name), ['Product', 'Security']);
                strict_1.default.equal(store.get("SELECT COUNT(*) AS n FROM v2_pod_members WHERE ws_id=? AND user_id='u1' AND role='lead'", value.id).n, 2);
                const goals = store.all('SELECT title,measures_json,depends_on_json,limits_json,created_at FROM v2_goals WHERE ws_id=? ORDER BY created_at', value.id);
                strict_1.default.deepEqual(goals.map(x => x.title), ['Expand to regulated customers', 'Ship self-serve onboarding', 'Pass the security review']);
                strict_1.default.equal(store.get("SELECT COUNT(*) AS n FROM v2_alignments WHERE ws_id=? AND state='approved'", value.id).n, 2);
                const change = store.get('SELECT changes_json,reason FROM v2_change_requests WHERE ws_id=?', value.id);
                strict_1.default.equal(JSON.parse(change.changes_json).measures.length, 3);
                strict_1.default.equal(store.all('PRAGMA foreign_key_check').length, 0);
                strict_1.default.equal(called, 27);
                strict_1.default.equal(captcha, 1);
                if (mode === 'codes')
                    strict_1.default.equal(redeemed, 1);
            }
            records.push({ failAt, after, mode, expected_code: expected ?? null, calls: called, trace, error_identity: error === fault, database_unchanged: failAt >= 0 || !!expected, captcha, redeemed });
            return called;
        }
        finally {
            if (shared.__alignV2Db) {
                shared.__alignV2Db.domain.close();
                shared.__alignV2Db.auth.close();
            }
        }
    };
    const n = await execute();
    strict_1.default.equal(n, 27);
    for (let i = 0; i < n; i++)
        await execute({ failAt: i });
    for (let i = 1; i < n; i++)
        await execute({ failAt: i, after: true });
    await execute({ mode: 'closed', expected: 'creation_closed' });
    await execute({ caps: { workspaces: 1, owned: 10, members: 10 }, expected: 'workspace_cap' });
    await execute({ caps: { workspaces: 10, owned: 1, members: 10 }, expected: 'owned_workspace_cap' });
    await execute({ mode: 'codes', expected: 'creation_code_required' });
    await execute({ mode: 'codes', code: 'invalid code', expected: 'creation_code_invalid' });
    await execute({ mode: 'codes', code: 'owned-valid-code' });
    return { records, record_count: records.length, real_qualified_two_connection_store: true, real_qualified_schema_and_creation_gate: true,
        all53_seed_failure_positions_rollback_database_and_sequences: true, hosted_admission_controls: 6,
        goal_alignment_and_change_service_ports: 'Owned controls write real constrained tables. They do not qualify those separate service algorithms.',
        identity_scope: 'Minimal owned account rows only. No authentication qualification or external account access.',
        external_delivery_or_provider_requests: false };
}
