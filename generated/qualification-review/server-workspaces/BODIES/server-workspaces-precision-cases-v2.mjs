"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.observeCase = observeCase;
exports.runCases = runCases;
exports.runChangingReads = runChangingReads;
// Private source-independent supplied-service and property-access cases.
const strict_1 = __importDefault(require("node:assert/strict"));
const server_workspaces_owned_fixture_v2_mjs_1 = require("./server-workspaces-owned-fixture-v2.mjs");
const server_workspaces_case_table_v1_mjs_1 = require("./server-workspaces-case-table-v1.mjs");
function observer(trace) {
    let active = true;
    const proxies = new WeakMap();
    const wrap = (value, label) => {
        if (!value || typeof value !== 'object')
            return value;
        if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
            return value;
        if (proxies.has(value))
            return proxies.get(value);
        const proxy = new Proxy(value, {
            get(target, key, receiver) { if (active)
                trace.push(['read', label, String(key)]); return wrap(Reflect.get(target, key, receiver), label + '.' + String(key)); },
            set(target, key, v, receiver) { if (active)
                trace.push(['write', label, String(key), v]); return Reflect.set(target, key, v, receiver); },
            ownKeys(target) { if (active)
                trace.push(['ownKeys', label]); return Reflect.ownKeys(target); },
            getOwnPropertyDescriptor(target, key) { if (active)
                trace.push(['descriptor', label, String(key)]); return Reflect.getOwnPropertyDescriptor(target, key); },
        });
        proxies.set(value, proxy);
        return proxy;
    };
    return { wrap, stop() { active = false; } };
}
async function observeCase(load, test, { faultAt = 0, properties = false } = {}) {
    const f = (0, server_workspaces_owned_fixture_v2_mjs_1.fixture)(test.settings, faultAt), reads = [];
    const spy = observer(reads);
    if (properties)
        for (const name of ['get', 'all']) {
            const original = f.resources[name];
            let calls = 0;
            f.resources[name] = function (...args) { strict_1.default.equal(this, undefined); return spy.wrap(original(...args), name + ':' + (++calls)); };
        }
    const ns = await load(f);
    strict_1.default.equal(f.trace.length, 0);
    const args = test.args(f).map((v, i) => properties ? spy.wrap(v, 'arg' + i) : v);
    let value, error;
    try {
        value = await ns[test.operation](...args);
    }
    catch (e) {
        error = e;
    }
    spy.stop();
    if (faultAt)
        strict_1.default.equal(error, f.fault, 'Injected effect error identity');
    else {
        strict_1.default.equal(error?.code, test.error, test.name + ': ' + error?.stack);
        strict_1.default.deepEqual(f.remaining(), { get: 0, all: 0 }, test.name);
    }
    return { name: test.name, operation: test.operation, fault_at: faultAt, effects: f.effects(), properties,
        observation: (0, server_workspaces_owned_fixture_v2_mjs_1.normal)({ args, value, error, error_identity: error === f.fault, trace: f.trace }), property_reads: (0, server_workspaces_owned_fixture_v2_mjs_1.normal)(reads) };
}
async function runCases(load, { properties = false, failures = true, labels } = {}) {
    const records = [];
    for (const test of server_workspaces_case_table_v1_mjs_1.cases) {
        if (labels && !labels.includes(test.name))
            continue;
        const base = await observeCase(load, test, { properties });
        records.push(base);
        if (failures)
            for (let i = 1; i <= base.effects; i++)
                records.push(await observeCase(load, test, { properties, faultAt: i }));
    }
    return records;
}
async function runChangingReads(load) {
    const records = [];
    for (const mode of ['update-name-and-steering', 'invite-team-id-role', 'policy-decision', 'principal-user']) {
        const f = (0, server_workspaces_owned_fixture_v2_mjs_1.fixture)(mode === 'update-name-and-steering' ? { getRows: [{ name: 'Stored' }] } : mode === 'invite-team-id-role' ? { getRows: [{ x: 1 }, undefined] } : mode === 'principal-user' ? { getRows: [{ role: 'member' }], allRows: [[]] } : {});
        const reads = [];
        let ns = await load(f), args, operation;
        const changing = (object, key, values) => { let n = 0; Object.defineProperty(object, key, { enumerable: true, configurable: true, get() { reads.push([key, n]); return values[Math.min(n++, values.length - 1)]; } }); };
        if (mode === 'update-name-and-steering') {
            const body = {};
            changing(body, 'name', [undefined, 'Renamed', 'Final name']);
            changing(body, 'steering', ['off', 'on', 'off']);
            args = [f.pp, body];
            operation = 'updateWorkspace';
        }
        else if (mode === 'invite-team-id-role') {
            const team = {};
            changing(team, 'role', [null, 'member', 'lead']);
            changing(team, 'id', ['pod1', 'pod1', 'pod2', 'pod3']);
            args = [f.pp, 'one@example.test', 'member', team];
            operation = 'createInvite';
        }
        else if (mode === 'policy-decision') {
            const decision = {};
            changing(decision, 'ok', [false]);
            changing(decision, 'status', [403]);
            changing(decision, 'code', ['owned_policy']);
            changing(decision, 'message', ['Owned policy']);
            f.resources.authorize = function () { strict_1.default.equal(this, undefined); return decision; };
            ns = await load(f);
            args = [f.pp, 'workspace.read'];
            operation = 'need';
        }
        else {
            const p = { kind: 'web' };
            changing(p, 'user', [{ id: 'first' }, { id: 'second' }]);
            args = [p, 'ws1'];
            operation = 'principalIn';
        }
        let value, error;
        try {
            value = await ns[operation](...args);
        }
        catch (e) {
            error = e;
        }
        records.push({ name: 'changing:' + mode, observation: (0, server_workspaces_owned_fixture_v2_mjs_1.normal)({ value, error, trace: f.trace, reads }) });
    }
    for (const operation of ['deletedWorkspacesFor', 'deletedWorkspaceOwnedBy', 'createInvite', 'previewInvite']) {
        const at = '2026-01-01T00:00:00.000Z';
        const settings = operation === 'deletedWorkspacesFor' ? { allRows: [[{ id: 'ws1', name: 'W', deleted_at: at }]] } : operation === 'deletedWorkspaceOwnedBy' ? { getRows: [{ id: 'ws1', name: 'W', deleted_at: at }] } : operation === 'previewInvite' ? { getRows: [{ id: 'i1', ws_id: 'ws1', email: 'user@example.test', role: 'member', team_id: null, expires_at: '2026-02-01T00:00:00.000Z', accepted_at: null }, { x: 1 }, { name: 'W' }] } : {};
        const f = (0, server_workspaces_owned_fixture_v2_mjs_1.fixture)(settings), reads = [];
        let clockReads = 0;
        const readDate = () => {
            const id = ++clockReads;
            reads.push(['Date', id]);
            class ChangingClock extends Date {
                constructor(...args) { reads.push(['construct', id, ...args]); super(...args); }
                static now() { reads.push(['now', id, this === ChangingClock]); return server_workspaces_owned_fixture_v2_mjs_1.NOW + id; }
                static parse(value) { reads.push(['parse', id, this === ChangingClock, value]); return Date.parse(value); }
            }
            return ChangingClock;
        };
        const ns = await load(f, { readDate });
        strict_1.default.equal(clockReads, 0, 'No clock read during module construction');
        const args = operation === 'deletedWorkspacesFor' ? ['u1'] : operation === 'deletedWorkspaceOwnedBy' ? ['u1', 'ws1'] : operation === 'createInvite' ? [f.pp, 'new@example.test', 'member'] : [server_workspaces_owned_fixture_v2_mjs_1.TOKEN, f.web.user];
        let value, error;
        try {
            value = await ns[operation](...args);
        }
        catch (e) {
            error = e;
        }
        records.push({ name: 'changing-clock:' + operation, observation: (0, server_workspaces_owned_fixture_v2_mjs_1.normal)({ value, error, trace: f.trace, reads }) });
    }
    return records;
}
