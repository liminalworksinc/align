"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspacePopulated = workspacePopulated;
// Private source-independent workspace database and concurrency controls.
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_sqlite_1 = require("node:sqlite");
const server_workspaces_owned_fixture_v2_mjs_1 = require("./server-workspaces-owned-fixture-v2.mjs");
async function workspacePopulated({ directory, dependencies, loadWorkspace }) {
    const { create_store, change_programs, apply_migrations, count, authorize, create_creation } = dependencies;
    (0, strict_1.default)(!node_fs_1.default.existsSync(directory));
    node_fs_1.default.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const shared = {}, store = create_store({ dataDir: () => directory, shared, DatabaseSync: node_sqlite_1.DatabaseSync, join: node_path_1.default.join, existsSync: node_fs_1.default.existsSync, mkdirSync: node_fs_1.default.mkdirSync, chmodSync: node_fs_1.default.chmodSync, random: () => 0.25, setTimeout, schemaVersion: change_programs().length, changePrograms: change_programs, applyMigrations: apply_migrations, count });
    const records = [];
    try {
        store.authDb().exec('CREATE TABLE ba_user (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL)');
        store.migrate();
        for (const [id, name] of [['u1', 'One'], ['u2', 'Two'], ['u3', 'Three']])
            store.run('INSERT INTO ba_user (id,name,email) VALUES (?,?,?)', id, name, id + '@example.test');
        let caps = { workspaces: 2, owned: 2, members: 5 };
        const f = (0, server_workspaces_owned_fixture_v2_mjs_1.fixture)({ hosted: true });
        Object.assign(f.resources, { all: store.all, get: store.get, run: store.run, sql: store.sql, tx: store.tx, LIVE_WS: store.LIVE_WS, audit: store.audit, authorize });
        const creation = create_creation({ config: () => ({ hosted: true }), secret: () => 'owned-creation-secret', requireCaptcha: async () => undefined, caps: () => caps, creationMode: () => 'open', CODE_RE: /^[A-Za-z0-9_-]+$/, redeemCreationCode: () => true, get: store.get, sql: store.sql, refuseDisposable: () => undefined, V2Error: f.resources.V2Error, conflict: f.resources.conflict, forbidden: f.resources.forbidden, count, readFirstOwnerEmail: () => undefined, memberCheckNow: () => new Date(server_workspaces_owned_fixture_v2_mjs_1.NOW).toISOString() });
        for (const name of ['precheckCreation', 'admitCreation', 'checkMemberCap', 'checkRestoreCaps'])
            f.resources[name] = creation[name];
        f.web.user.email = 'u1@example.test';
        const original = await loadWorkspace(f);
        const tables = store.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(x => x.name);
        const snapshot = () => JSON.stringify(tables.map(name => [name, store.all('SELECT * FROM "' + name.replaceAll('"', '""') + '"').map(x => JSON.stringify(x)).sort()]));
        const capture = async (name, action) => { const result = await action(); records.push({ name, ...result }); };
        let first;
        await capture('ordinary-create-through-qualified-cap-port', async () => { first = await original.createWorkspace({ ownedRequest: true }, f.web, 'First', null); strict_1.default.equal(first.role, 'owner'); strict_1.default.equal(store.get('SELECT COUNT(*) AS n FROM v2_members WHERE ws_id=?', first.id).n, 1); return { workspace: first, stored_owner: true }; });
        const pp1 = { userId: 'u1', wsId: first.id, wsRole: 'owner', pods: new Map() };
        await capture('last-owner-demotion-refused', async () => { const before = snapshot(); await strict_1.default.rejects(original.setMemberRole(pp1, 'u1', 'member'), e => e.code === 'last_owner'); strict_1.default.equal(snapshot(), before); return { refused: 'last_owner', database_unchanged: true }; });
        await capture('competing-owner-demotions-retain-an-owner', async () => {
            store.run("INSERT INTO v2_members (ws_id,user_id,role,created_at) VALUES (?,?,'owner',?)", first.id, 'u2', new Date(server_workspaces_owned_fixture_v2_mjs_1.NOW).toISOString());
            const pp2 = { ...pp1, userId: 'u2' };
            const results = await Promise.allSettled([original.setMemberRole(pp1, 'u1', 'member'), original.setMemberRole(pp2, 'u2', 'member')]);
            strict_1.default.equal(results.filter(x => x.status === 'fulfilled').length, 1);
            strict_1.default.equal(results.find(x => x.status === 'rejected').reason.code, 'last_owner');
            strict_1.default.equal(store.get("SELECT COUNT(*) AS n FROM v2_members WHERE ws_id=? AND role='owner'", first.id).n, 1);
            return { fulfilled: 1, refused: 'last_owner', remaining_owners: 1 };
        });
        await capture('competing-workspace-creations-recheck-cap-in-transaction', async () => {
            const results = await Promise.allSettled([original.createWorkspace({ ownedRequest: true }, f.web, 'Second', null), original.createWorkspace({ ownedRequest: true }, f.web, 'Third', null)]);
            strict_1.default.equal(results.filter(x => x.status === 'fulfilled').length, 1);
            strict_1.default.equal(results.find(x => x.status === 'rejected').reason.code, 'workspace_cap');
            strict_1.default.equal(store.get('SELECT COUNT(*) AS n FROM v2_workspaces WHERE deleted_at IS NULL').n, 2);
            return { fulfilled: 1, refused: 'workspace_cap', live_workspaces: 2 };
        });
        caps = { workspaces: 10, owned: 10, members: 5 };
        await capture('seed-failure-rolls-back-real-workspace-owner-and-audit', async () => { const before = snapshot(), fault = new Error('owned seed failure'); await strict_1.default.rejects(original.createWorkspace({ ownedRequest: true }, f.web, 'Refused seed', null, () => { throw fault; }), e => e === fault); strict_1.default.equal(snapshot(), before); return { original_error_identity: true, all_database_rows_unchanged: true }; });
        const pp2 = { ...pp1, userId: 'u2' };
        let invitation;
        await capture('create-invite-counts-real-members', async () => { invitation = await original.createInvite(pp2, ' U3@Example.Test ', 'member'); strict_1.default.equal(invitation.email, 'u3@example.test'); return { normalized_email: invitation.email, stored_invite: true }; });
        await capture('device-grant-failure-rolls-back-join-invite-and-audit', async () => {
            const fault = new Error('owned device grant failure'), before = snapshot();
            const failedFixture = (0, server_workspaces_owned_fixture_v2_mjs_1.fixture)({ hosted: true });
            Object.assign(failedFixture.resources, f.resources, { addWorkspaceToDevices: () => { throw fault; } });
            const failureSource = await loadWorkspace(failedFixture);
            await strict_1.default.rejects(failureSource.acceptInvite(invitation.token, { id: 'u3', email: 'u3@example.test' }, true, ['owned-device'], () => undefined), e => e === fault);
            strict_1.default.equal(snapshot(), before);
            return { original_error_identity: true, all_database_rows_unchanged: true };
        });
        await capture('successful-join-and-repeat-acceptance', async () => { const joined = await original.acceptInvite(invitation.token, { id: 'u3', email: 'u3@example.test' }, true); strict_1.default.equal(joined.workspace_id, first.id); await strict_1.default.rejects(original.acceptInvite(invitation.token, { id: 'u3', email: 'u3@example.test' }, true), e => e.code === 'already_member' && e.detail.workspace_id === first.id); strict_1.default.equal(store.get('SELECT COUNT(*) AS n FROM v2_members WHERE ws_id=? AND user_id=?', first.id, 'u3').n, 1); return { joined_once: true, repeat_code: 'already_member', workspace_detail_preserved: true }; });
        await capture('steering-failure-rolls-back-rename-and-audit', async () => {
            const fault = new Error('owned steering failure'), before = snapshot();
            const failedFixture = (0, server_workspaces_owned_fixture_v2_mjs_1.fixture)({ hosted: true });
            Object.assign(failedFixture.resources, f.resources, { writeSteering: () => { store.run("UPDATE v2_workspaces SET steering='on' WHERE id=?", first.id); throw fault; } });
            const failureSource = await loadWorkspace(failedFixture);
            await strict_1.default.rejects(failureSource.updateWorkspace(pp2, { name: 'Must roll back', steering: 'on' }), e => e === fault);
            strict_1.default.equal(snapshot(), before);
            return { original_error_identity: true, all_database_rows_unchanged: true };
        });
        await capture('real-deleted-workspace-restoration', async () => { store.run('UPDATE v2_workspaces SET deleted_at=? WHERE id=?', new Date(server_workspaces_owned_fixture_v2_mjs_1.NOW - 1000).toISOString(), first.id); const restored = await original.restoreWorkspace('u2', first.id); strict_1.default.equal(restored.id, first.id); strict_1.default.equal(restored.role, 'owner'); strict_1.default.equal(store.get('SELECT deleted_at FROM v2_workspaces WHERE id=?', first.id).deleted_at, null); return { restored_identity: first.id, owner_role: true, live_again: true }; });
        strict_1.default.equal(records.length, 10);
        strict_1.default.equal(store.all('PRAGMA foreign_key_check').length, 0);
        return { records, record_count: records.length, real_qualified_store_schema_caps_and_policy: true, real_two_connection_transaction_provider: true,
            identity_scope: 'Minimal owned account rows only; separate authentication qualification is unchanged.',
            controlled_surrounding_services: ['captcha approval', 'creation configuration', 'device lifecycle retention steering event ports outside each named control'] };
    }
    finally {
        if (shared.__alignV2Db) {
            shared.__alignV2Db.domain.close();
            shared.__alignV2Db.auth.close();
        }
    }
}
