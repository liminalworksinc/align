"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.abi = exports.TOKEN = exports.NOW = void 0;
exports.fixture = fixture;
exports.normal = normal;
// Private supplied-service fixture. Contains no original application source.
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const abi = { "imports": [{ "name": "all" }, { "name": "audit" }, { "name": "get" }, { "name": "LIVE_WS" }, { "name": "run" }, { "name": "sql" }, { "name": "tx" }, { "name": "softDeleteWorkspace" }, { "name": "admitCreation" }, { "name": "checkMemberCap" }, { "name": "checkRestoreCaps" }, { "name": "precheckCreation" }, { "name": "V2Error" }, { "name": "badRequest" }, { "name": "conflict" }, { "name": "forbidden" }, { "name": "notFound" }, { "name": "newId" }, { "name": "nowIso" }, { "name": "secretToken" }, { "name": "sha256hex" }, { "name": "authorize" }, { "name": "config" }, { "name": "event" }, { "name": "take" }, { "name": "addWorkspaceToDevices" }, { "name": "liveDevicesOf" }, { "name": "deleteMemberSessions" }, { "name": "onMemberRemoved" }, { "name": "cancelDeparture" }, { "name": "noteDeparture" }, { "name": "personName" }, { "name": "RESTORE_DAYS" }, { "name": "workspaceSteering" }, { "name": "writeSteering" }, { "name": "oneLine" }], "exports": [{ "name": "principalIn", "length": 2, "async": false }, { "name": "memberPrincipal", "length": 2, "async": false }, { "name": "need", "length": 2, "async": false }, { "name": "enter", "length": 2, "async": false }, { "name": "workspacesFor", "length": 1, "async": false }, { "name": "otherWorkspacesFor", "length": 1, "async": false }, { "name": "createWorkspace", "length": 5, "async": true }, { "name": "workspaceDetail", "length": 1, "async": false }, { "name": "updateWorkspace", "length": 2, "async": true }, { "name": "deleteWorkspace", "length": 1, "async": true }, { "name": "deletedWorkspacesFor", "length": 1, "async": false }, { "name": "deletedWorkspaceOwnedBy", "length": 2, "async": false }, { "name": "restoreWorkspace", "length": 2, "async": true }, { "name": "setMemberRole", "length": 3, "async": true }, { "name": "removeMember", "length": 2, "async": true }, { "name": "auditTrail", "length": 1, "async": false }, { "name": "createInvite", "length": 3, "async": true }, { "name": "listInvites", "length": 1, "async": false }, { "name": "deleteInvite", "length": 2, "async": true }, { "name": "previewInvite", "length": 2, "async": false }, { "name": "acceptInvite", "length": 3, "async": true }, { "name": "createTeam", "length": 2, "async": true }, { "name": "setTeamMember", "length": 4, "async": true }, { "name": "removeTeamMember", "length": 3, "async": true }, { "name": "memberName", "length": 1, "async": false }, { "name": "nameTo", "length": 2, "async": false }] };
exports.abi = abi;
const NOW = Date.parse('2026-01-02T03:04:05.000Z');
exports.NOW = NOW;
const TOKEN = 'a'.repeat(43);
exports.TOKEN = TOKEN;
const deleted = { id: 'ws1', name: 'Workspace', deleted_at: '2026-01-01T00:00:00.000Z' };
const invite = { id: 'inv1', ws_id: 'ws1', email: 'user@example.test', role: 'member', team_id: null, team_role: null, expires_at: '2026-01-03T00:00:00.000Z', accepted_at: null };
function normal(value, seen = new Map()) {
    if (value === undefined)
        return { $undefined: true };
    if (typeof value === 'function')
        return { $function: value.length, kind: value.constructor.name };
    if (typeof value === 'number' && !Number.isFinite(value))
        return { $number: String(value) };
    if (value === null || typeof value !== 'object')
        return value;
    if (seen.has(value))
        return { $ref: seen.get(value) };
    const id = seen.size;
    seen.set(value, id);
    if (Object.prototype.toString.call(value) === '[object Map]')
        return { $id: id, $map: [...value].map(([k, v]) => [normal(k, seen), normal(v, seen)]) };
    if (Object.prototype.toString.call(value) === '[object Set]')
        return { $id: id, $set: [...value].map(v => normal(v, seen)) };
    if (value instanceof Error)
        return { $id: id, $error: value.name, message: value.message, ...Object.fromEntries(['status', 'code', 'detail'].filter(k => k in value).map(k => [k, normal(value[k], seen)])) };
    if (Array.isArray(value))
        return { $id: id, $array: value.map(v => normal(v, seen)) };
    return { $id: id, ...Object.fromEntries(Object.keys(value).sort().map(k => [k, normal(value[k], seen)])) };
}
function fixture(settings = {}, faultAt = 0) {
    const trace = [], gets = structuredClone(settings.getRows ?? []), alls = structuredClone(settings.allRows ?? []);
    const fault = new Error('owned workspace effect failure');
    let effects = 0, ids = 0;
    const note = (name, ...args) => { trace.push([name, ...args]); if (++effects === faultAt)
        throw fault; };
    const wrap = (name, fn) => function (...args) { strict_1.default.equal(this, undefined); note(name, ...args); return fn(...args); };
    class Clock extends Date {
        constructor(...args) { super(...(args.length ? args : [NOW])); }
        static now() { return NOW; }
    }
    class V2Error extends Error {
        constructor(status, code, message, detail) { super(message); this.name = 'V2Error'; Object.assign(this, { status, code, ...(detail === undefined ? {} : { detail }) }); }
    }
    const error = (status, code, message) => new V2Error(status, code, message);
    const resources = {
        all: wrap('all', () => alls.length ? alls.shift() : []),
        audit: wrap('audit', () => undefined),
        get: wrap('get', () => gets.length ? gets.shift() : undefined),
        LIVE_WS: wrap('LIVE_WS', field => 'OWNED_LIVE(' + field + ')'),
        run: wrap('run', () => settings.runResult ?? 1), sql: { ownedSql: true },
        tx: wrap('tx', async (fn) => { trace.push(['tx:begin']); try {
            const result = fn();
            trace.push(['tx:commit', result]);
            return result;
        }
        catch (e) {
            trace.push(['tx:rollback']);
            throw e;
        } }),
        softDeleteWorkspace: wrap('softDeleteWorkspace', () => undefined),
        admitCreation: wrap('admitCreation', () => settings.redeemed ?? false),
        checkMemberCap: wrap('checkMemberCap', () => undefined), checkRestoreCaps: wrap('checkRestoreCaps', () => undefined),
        precheckCreation: wrap('precheckCreation', async () => undefined), V2Error,
        badRequest: wrap('badRequest', message => error(400, 'bad_request', message)),
        conflict: wrap('conflict', (code, message) => error(409, code, message)),
        forbidden: wrap('forbidden', (code, message) => error(403, code, message)),
        notFound: wrap('notFound', () => error(404, 'not_found', 'Not found')),
        newId: wrap('newId', prefix => prefix + '_' + ++ids), nowIso: wrap('nowIso', () => new Date(NOW).toISOString()),
        secretToken: wrap('secretToken', () => TOKEN), sha256hex: wrap('sha256hex', value => node_crypto_1.default.createHash('sha256').update(value).digest('hex')),
        authorize: wrap('authorize', () => settings.decision ?? { ok: true }), config: wrap('config', () => ({ hosted: settings.hosted ?? false })),
        event: wrap('event', () => undefined), take: wrap('take', () => undefined),
        addWorkspaceToDevices: wrap('addWorkspaceToDevices', () => settings.grantedDevices ?? []),
        liveDevicesOf: wrap('liveDevicesOf', () => settings.devices ?? []),
        deleteMemberSessions: wrap('deleteMemberSessions', () => settings.deletedSessions ?? 0),
        onMemberRemoved: wrap('onMemberRemoved', () => undefined), cancelDeparture: wrap('cancelDeparture', () => undefined),
        noteDeparture: wrap('noteDeparture', () => undefined), personName: wrap('personName', (id, name) => name ?? 'Former ' + id), RESTORE_DAYS: 30,
        workspaceSteering: wrap('workspaceSteering', () => settings.steering ?? 'off'),
        writeSteering: wrap('writeSteering', (pp, value) => value),
        oneLine: wrap('oneLine', (body, key) => body[key].trim()),
    };
    strict_1.default.deepEqual(Object.keys(resources).sort(), abi.imports.map(x => x.name).sort());
    const pp = { userId: 'u1', wsId: 'ws1', wsRole: 'owner', pods: new Map([['pod1', 'lead']]) };
    const web = { kind: 'web', user: { id: 'u1', email: 'user@example.test' }, emailVerified: true };
    const device = { ...web, kind: 'device', grants: new Set(['ws1']) };
    return { resources, trace, fault, Clock, pp, web, device, settings, effects: () => effects, remaining: () => ({ get: gets.length, all: alls.length }) };
}
