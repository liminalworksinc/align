"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindingChecks = bindingChecks;
// Independent checks of the drafted binding contract. No original implementation.
const strict_1 = __importDefault(require("node:assert/strict"));
const server_auth_fixture_v1_mjs_1 = require("./server-auth-fixture-v1.mjs");
const server_auth_binding_v2_mjs_1 = require("./server-auth-binding-v2.mjs");
async function bindingChecks(factory) {
    const records = [];
    {
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)(), values = (0, server_auth_binding_v2_mjs_1.resources)(f), reads = [];
        const watched = new Proxy(values, { get(target, key) { (0, strict_1.default)(server_auth_binding_v2_mjs_1.RESOURCE_NAMES.includes(key)); reads.push(key); return target[key]; } });
        const result = factory(watched);
        strict_1.default.deepEqual(reads, server_auth_binding_v2_mjs_1.RESOURCE_NAMES);
        strict_1.default.deepEqual(Object.keys(result).sort(), server_auth_fixture_v1_mjs_1.PUBLIC);
        strict_1.default.deepEqual(f.trace.map(x => x[0]), ['middleware', 'middleware']);
        records.push({ name: 'capture-exact-order', reads: reads.length, middleware_calls: 2, other_effects: 0 });
    }
    {
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)({ env: { BETTER_AUTH_SECRET: 'owned-secret' } }), values = (0, server_auth_binding_v2_mjs_1.resources)(f), calls = [];
        for (const key of ['readEnvironment', 'readDate', 'readURL']) {
            const original = values[key];
            values[key] = function () { strict_1.default.equal(this, undefined); calls.push(key); return original(); };
        }
        const namespace = factory(values);
        strict_1.default.deepEqual(calls, [], 'No construction-time host resolution');
        namespace.authOptions();
        (0, strict_1.default)(calls.includes('readEnvironment'));
        records.push({ name: 'late-host-resolution', construction_resolutions: 0, operation_resolution_observed: true });
    }
    for (let index = 0; index < server_auth_binding_v2_mjs_1.RESOURCE_NAMES.length; index++) {
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)(), values = (0, server_auth_binding_v2_mjs_1.resources)(f), reads = [], fault = new Error('owned resource getter fault');
        const watched = new Proxy(values, { get(target, key) { (0, strict_1.default)(server_auth_binding_v2_mjs_1.RESOURCE_NAMES.includes(key)); reads.push(key); if (key === server_auth_binding_v2_mjs_1.RESOURCE_NAMES[index])
                throw fault; return target[key]; } });
        let caught;
        try {
            factory(watched);
        }
        catch (e) {
            caught = e;
        }
        strict_1.default.equal(caught, fault);
        strict_1.default.deepEqual(reads, server_auth_binding_v2_mjs_1.RESOURCE_NAMES.slice(0, index + 1));
        strict_1.default.equal(f.trace.length, 0);
        records.push({ name: 'capture-failure:' + server_auth_binding_v2_mjs_1.RESOURCE_NAMES[index], error_identity: true, read_count: reads.length, effects: 0 });
    }
    for (const at of [1, 2]) {
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)(), values = (0, server_auth_binding_v2_mjs_1.resources)(f), fault = new Error('owned middleware fault');
        let calls = 0;
        values.createAuthMiddleware = function (fn) { strict_1.default.equal(this, undefined); if (++calls === at)
            throw fault; return fn; };
        let caught;
        try {
            factory(values);
        }
        catch (e) {
            caught = e;
        }
        strict_1.default.equal(caught, fault);
        strict_1.default.equal(calls, at);
        strict_1.default.equal(f.trace.length, 0);
        records.push({ name: 'middleware-failure:' + at, error_identity: true, calls });
    }
    {
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)({ env: { BETTER_AUTH_SECRET: 'first-owned-secret' } }), values = (0, server_auth_binding_v2_mjs_1.resources)(f), namespace = factory(values);
        for (const key of server_auth_binding_v2_mjs_1.RESOURCE_NAMES)
            values[key] = () => { strict_1.default.fail('Read replaced resource ' + key); };
        const options = namespace.authOptions();
        strict_1.default.equal(options.secret, 'first-owned-secret');
        records.push({ name: 'captured-container-values', late_container_replacements_ignored: true });
    }
    {
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)({ env: { BETTER_AUTH_SECRET: 'first-owned-secret' } }), values = (0, server_auth_binding_v2_mjs_1.resources)(f), namespace = factory(values);
        const first = namespace.authOptions();
        f.globals.process.env = { BETTER_AUTH_SECRET: 'second-owned-secret', PORT: '7777' };
        const second = namespace.authOptions();
        strict_1.default.equal(first.secret, 'first-owned-secret');
        strict_1.default.equal(second.secret, 'second-owned-secret');
        strict_1.default.deepEqual([...second.baseURL.allowedHosts], ['localhost:7777', '127.0.0.1:7777', '[::1]:7777']);
        records.push({ name: 'current-environment', secrets_resolved_fresh: true, new_port: 7777 });
    }
    {
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)(), values = (0, server_auth_binding_v2_mjs_1.resources)(f), namespace = factory(values);
        const at = f.state.now;
        strict_1.default.equal(namespace.isRecentSignIn(new Date(at - 900000)), true);
        f.globals.Date = class extends Date {
            constructor(...args) { super(...(args.length ? args : [at + 1])); }
            static now() { return at + 1; }
        };
        strict_1.default.equal(namespace.isRecentSignIn(new Date(at - 900000)), false);
        records.push({ name: 'current-date-constructor', late_clock_change_observed: true });
    }
    {
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)({ hosted: true, origin: 'https://first.example.test' }), values = (0, server_auth_binding_v2_mjs_1.resources)(f), namespace = factory(values);
        strict_1.default.equal(namespace.passkeyParty().rpID, 'first.example.test');
        const fault = new Error('owned URL lookup fault');
        Object.defineProperty(f.globals, 'URL', { get() { throw fault; } });
        strict_1.default.throws(() => namespace.passkeyParty(), e => e === fault);
        records.push({ name: 'current-url-constructor', late_lookup_error_identity: true });
    }
    for (const value of [false, 0, '', {}, { api: { owned: true } }]) {
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)({ hosted: true }), values = (0, server_auth_binding_v2_mjs_1.resources)(f);
        f.globals.__alignV2Auth = value;
        const namespace = factory(values);
        f.trace.length = 0;
        strict_1.default.equal(namespace.getAuth(), value);
        strict_1.default.equal(f.trace.length, 0);
        records.push({ name: 'shared-cache:' + typeof value + ':' + (value === false ? 'false' : value === 0 ? 'zero' : value === '' ? 'empty' : Object.hasOwn(value, 'api') ? 'auth' : 'object'), same_value: true, no_option_effects: true });
    }
    {
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)({ env: { BETTER_AUTH_SECRET: 'owned-secret' } }), fault = new Error('owned first authentication failure');
        let calls = 0;
        f.modules['better-auth'].betterAuth = function (options) { strict_1.default.equal(this, undefined); if (++calls === 1)
            throw fault; return f.auth; };
        const namespace = factory((0, server_auth_binding_v2_mjs_1.resources)(f));
        strict_1.default.throws(() => namespace.getAuth(), e => e === fault);
        strict_1.default.equal(f.globals.__alignV2Auth, undefined);
        strict_1.default.equal(namespace.getAuth(), f.auth);
        strict_1.default.equal(namespace.getAuth(), f.auth);
        strict_1.default.equal(calls, 2);
        strict_1.default.equal(f.globals.__alignV2Auth, f.auth);
        records.push({ name: 'shared-cache-recovery', first_error_identity: true, uncached_failure: true, construction_calls: 2 });
    }
    {
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)({ env: { BETTER_AUTH_SECRET: 'owned-secret' } }), namespace = factory((0, server_auth_binding_v2_mjs_1.resources)(f));
        strict_1.default.equal(namespace.getAuth(), f.auth);
        const replacement = { api: { replaced: true } };
        f.globals.__alignV2Auth = replacement;
        strict_1.default.equal(namespace.getAuth(), replacement);
        records.push({ name: 'shared-cache-owner-update', replacement_observed: true });
    }
    {
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)({ env: { BETTER_AUTH_SECRET: 'owned-secret' } }), fault = new Error('owned first migration failure');
        let calls = 0;
        f.modules['better-auth/db/migration'].getMigrations = async () => ({ runMigrations: async function () { strict_1.default.equal(this, undefined); if (++calls === 1)
                throw fault; } });
        const namespace = factory((0, server_auth_binding_v2_mjs_1.resources)(f));
        await strict_1.default.rejects(namespace.migrateAuth(), e => e === fault);
        strict_1.default.equal(await namespace.migrateAuth(), undefined);
        strict_1.default.equal(calls, 2);
        records.push({ name: 'migration-recovery', first_error_identity: true, retry_calls: 2 });
    }
    strict_1.default.equal(new Set(records.map(x => x.name)).size, records.length);
    return records;
}
