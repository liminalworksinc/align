"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceContention = workspaceContention;
// Private source-independent cap acceptance using real independent SQLite connections.
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_sqlite_1 = require("node:sqlite");
const server_workspaces_owned_fixture_v2_mjs_1 = require("./server-workspaces-owned-fixture-v2.mjs");
async function workspaceContention({ directory, dependencies, loadWorkspace }) {
    const { create_store, change_programs, apply_migrations, count, authorize, create_creation } = dependencies;
    (0, strict_1.default)(!node_fs_1.default.existsSync(directory));
    node_fs_1.default.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const makeStore = (owned, shared) => create_store({ dataDir: () => owned, shared, DatabaseSync: node_sqlite_1.DatabaseSync, join: node_path_1.default.join, existsSync: node_fs_1.default.existsSync, mkdirSync: node_fs_1.default.mkdirSync, chmodSync: node_fs_1.default.chmodSync, random: () => 0.25, setTimeout, schemaVersion: change_programs().length, changePrograms: change_programs, applyMigrations: apply_migrations, count });
    const close = shared => { if (shared.__alignV2Db) {
        shared.__alignV2Db.domain.close();
        shared.__alignV2Db.auth.close();
    } };
    const seedShared = {}, seed = makeStore(node_path_1.default.join(directory, 'seed'), seedShared), at = new Date(server_workspaces_owned_fixture_v2_mjs_1.NOW).toISOString();
    let seedFile;
    try {
        seed.authDb().exec('CREATE TABLE ba_user (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL)');
        seed.migrate();
        for (const id of ['u1', 'u2', 'u3'])
            seed.run('INSERT INTO ba_user (id,name,email) VALUES (?,?,?)', id, id, id + '@example.test');
        seed.run("INSERT INTO v2_workspaces (id,name,created_by,created_at) VALUES ('ws1','Owned cap control','u1',?)", at);
        for (const id of ['u1', 'u2', 'u3'])
            seed.run('INSERT INTO v2_members (ws_id,user_id,role,created_at) VALUES (?,?,?,?)', 'ws1', id, id === 'u1' ? 'owner' : 'member', at);
        seedFile = seed.dbFile();
    }
    finally {
        close(seedShared);
    }
    const records = [];
    for (let round = 0; round < 3; round++)
        for (const held of [false, true]) {
            const owned = node_path_1.default.join(directory, 'case-' + round + '-' + held);
            node_fs_1.default.mkdirSync(node_path_1.default.join(owned, 'v2'), { recursive: true, mode: 0o700 });
            node_fs_1.default.copyFileSync(seedFile, node_path_1.default.join(owned, 'v2/align.sqlite'));
            const states = [{}, {}], stores = states.map(shared => makeStore(owned, shared)), passed = { count: 0 };
            let holder;
            try {
                const subjects = [];
                for (let i = 0; i < stores.length; i++) {
                    const store = stores[i], f = (0, server_workspaces_owned_fixture_v2_mjs_1.fixture)({ hosted: true }), label = i ? 'y' : 'x';
                    store.openDb();
                    const creation = create_creation({ config: () => ({ hosted: true }), secret: () => 'owned-cap-control-secret', requireCaptcha: async () => undefined, caps: () => ({ workspaces: 10, owned: 10, members: 4 }), creationMode: () => 'open', CODE_RE: /^[A-Za-z0-9_-]+$/, redeemCreationCode: () => true, get: store.get, sql: store.sql, refuseDisposable: () => undefined, V2Error: f.resources.V2Error, conflict: f.resources.conflict, forbidden: f.resources.forbidden, count, readFirstOwnerEmail: () => undefined, memberCheckNow: () => at });
                    Object.assign(f.resources, { all: store.all, get: store.get, run: store.run, sql: store.sql, tx: store.tx, LIVE_WS: store.LIVE_WS, audit: store.audit, authorize, secretToken: () => label.repeat(43), newId: prefix => prefix + '_' + label,
                        checkMemberCap: (...args) => { creation.checkMemberCap(...args); passed.count++; } });
                    subjects.push(await loadWorkspace(f));
                }
                const store = stores[0], tally = () => ({ members: Number(store.get("SELECT COUNT(*) AS n FROM v2_members WHERE ws_id='ws1'").n), open_invites: Number(store.get("SELECT COUNT(*) AS n FROM v2_invites WHERE ws_id='ws1' AND accepted_at IS NULL AND expires_at>?", at).n) });
                strict_1.default.deepEqual(tally(), { members: 3, open_invites: 0 });
                if (held) {
                    holder = new node_sqlite_1.DatabaseSync(node_path_1.default.join(owned, 'v2/align.sqlite'));
                    holder.exec('BEGIN IMMEDIATE');
                }
                const principal = { userId: 'u1', wsId: 'ws1', wsRole: 'owner', pods: new Map() }, calls = subjects.map((subject, i) => subject.createInvite(principal, 'new-' + i + '@example.test', 'member'));
                if (held) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    strict_1.default.equal(passed.count, 2, 'Both early checks pass before lock release');
                    strict_1.default.equal(tally().open_invites, 0);
                    holder.exec('COMMIT');
                    holder.close();
                    holder = null;
                }
                const results = await Promise.allSettled(calls);
                strict_1.default.equal(results.filter(x => x.status === 'fulfilled').length, 1);
                strict_1.default.equal(results.find(x => x.status === 'rejected').reason.code, 'member_cap');
                strict_1.default.deepEqual(tally(), { members: 3, open_invites: 1 });
                strict_1.default.equal(passed.count, held ? 3 : 2, 'The losing early check refuses immediately when no lock delays the first transaction');
                records.push({ round, held, fulfilled: 1, refused: 'member_cap', members: 3, open_invites: 1, cap: 4, cap_invariant_preserved: true, passed_checks: held ? 3 : 2 });
            }
            finally {
                if (holder) {
                    try {
                        holder.exec('ROLLBACK');
                    }
                    finally {
                        holder.close();
                    }
                }
                for (const shared of states)
                    close(shared);
            }
        }
    return { records, record_count: records.length, independent_connections: true, owned_third_write_lock: true, corrected_cap_invariant: true };
}
