"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runExtra = runExtra;
// Additional owned callback inputs. No implementation or expected results.
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const server_auth_fixture_v1_mjs_1 = require("./server-auth-fixture-v1.mjs");
const server_auth_scenarios_v4_mjs_1 = require("./server-auth-scenarios-v4.mjs");
const SIGN = '/sign-in/email-otp', SEND = '/email-otp/send-verification-otp';
const common = { env: { BETTER_AUTH_SECRET: 'owned-secret' } };
async function runExtra(load, { labels } = {}) {
    const selected = labels ? new Set(labels) : null, records = [];
    const getter = (f, object, key, read) => Object.defineProperty(object, key, { enumerable: true, configurable: true, get() { f.trace.push(['getter', key]); return read(); } });
    function clock(f) {
        const Base = f.globals.Date;
        class Clock extends Base {
            constructor(...args) { f.trace.push(['Date.construct', args.length, args.length ? typeof args[0] : 'none']); super(...args); }
        }
        Object.defineProperty(f.globals, 'Date', { configurable: true, get() { f.trace.push(['Date.resolve']); return Clock; } });
    }
    async function observe(name, settings, action, prepare = () => { }) {
        if (selected && !selected.has(name))
            return;
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)({ ...common, ...settings });
        f.sentinel = new Error('owned extra getter fault');
        prepare(f);
        const loaded = await load(f), n = loaded.namespace ?? loaded, o = n.authOptions();
        f.trace.length = 0;
        let value, error;
        try {
            value = await action(o, n, f);
        }
        catch (e) {
            error = e;
        }
        records.push({ name, value: (0, server_auth_scenarios_v4_mjs_1.normal)(value), error: error ? { name: error.name, owned_identity: error === f.sentinel,
                ...(error.name === 'TypeError' ? {} : { message: error.message }), ...(error.status ? { status: error.status, body: (0, server_auth_scenarios_v4_mjs_1.normal)(error.body) } : {}) } : null, trace: (0, server_auth_scenarios_v4_mjs_1.normal)(f.trace) });
    }
    for (const operation of ['create', 'update'])
        for (const kind of ['date', 'iso', 'number', 'numeric-string', 'invalid', 'null', 'zero', 'valueOf', 'primitive', 'throwing'])
            await observe('extra:session-expiry:' + operation + ':' + kind, {}, async (o, n, f) => {
                const future = f.state.now + 31 * 86400000;
                const value = kind === 'date' ? new Date(future) : kind === 'iso' ? new Date(future).toISOString() : kind === 'number' ? future :
                    kind === 'numeric-string' ? String(future) : kind === 'invalid' ? 'invalid' : kind === 'null' ? null : kind === 'zero' ? 0 :
                        kind === 'valueOf' ? { valueOf() { f.trace.push(['expiry.valueOf']); return future; } } :
                            { [Symbol.toPrimitive](hint) { f.trace.push(['expiry.primitive', hint]); if (kind === 'throwing')
                                    throw f.sentinel; return future; } };
                const session = { createdAt: new Date(f.state.now) };
                getter(f, session, 'expiresAt', () => value);
                return operation === 'create' ? o.databaseHooks.session.create.before(session) : o.databaseHooks.session.update.before(session, { context: { session: { session: { createdAt: new Date(f.state.now) } } } });
            }, clock);
    for (const route of ['/passkey/generate-register-options', '/passkey/verify-registration', '/link-social', SEND, SIGN, '/unrelated'])
        await observe('extra:before-path-reads:' + route, {}, async (o, n, f) => {
            const ctx = f.hookContext({ body: { email: 'one@example.test', otp: '123456', type: 'sign-in' } });
            getter(f, ctx, 'path', () => route);
            return o.hooks.before(ctx);
        });
    for (const sequence of [[SEND, SIGN], [SEND, '/unrelated'], ['/unrelated', SEND], [SIGN, SEND]])
        await observe('extra:before-changing-path:' + sequence.join(':'), {}, async (o, n, f) => {
            let reads = 0;
            const ctx = f.hookContext({ body: { email: 'one@example.test', otp: '123456', type: 'sign-in' } });
            getter(f, ctx, 'path', () => sequence[Math.min(reads++, sequence.length - 1)]);
            return o.hooks.before(ctx);
        });
    for (const hosted of [false, true])
        for (const changing of [false, true])
            await observe('extra:send-request-reads:' + hosted + ':' + changing, { hosted }, async (o, n, f) => {
                const req = new Request('http://localhost:3100' + SEND, { headers: { host: 'localhost:3100', 'fly-client-ip': '192.0.2.7' } });
                let reads = 0;
                const ctx = f.hookContext({ path: SEND, body: { email: 'one@example.test', type: 'sign-in' } });
                getter(f, ctx, 'request', () => changing && ++reads > 1 ? null : req);
                return o.hooks.before(ctx);
            });
    const hash = node_crypto_1.default.createHash('sha256').update('123456').digest('base64url');
    for (const suffix of ['', ':0', ':2', ':3', ':bad'])
        await observe('extra:verification-value-reads:' + suffix, { user: { user: { emailVerified: false } } }, async (o, n, f) => {
            const verification = { expiresAt: new Date(f.state.now + 1000) };
            getter(f, verification, 'value', () => hash + suffix);
            f.state.verification = verification;
            return o.hooks.before(f.hookContext({ path: SIGN, body: { email: 'one@example.test', otp: '123456' } }));
        });
    for (const reverse of [false, true])
        await observe('extra:verification-changing-value:' + reverse, { user: { user: { emailVerified: false } } }, async (o, n, f) => {
            let reads = 0;
            const values = [hash + ':0', hash + (reverse ? ':0' : ':3'), hash + (reverse ? ':3' : ':0')];
            const verification = { expiresAt: new Date(f.state.now + 1000) };
            getter(f, verification, 'value', () => values[Math.min(reads++, 2)]);
            f.state.verification = verification;
            return o.hooks.before(f.hookContext({ path: SIGN, body: { email: 'one@example.test', otp: '123456' } }));
        });
    strict_1.default.equal(new Set(records.map(x => x.name)).size, records.length);
    if (selected)
        strict_1.default.deepEqual(records.map(x => x.name).sort(), [...selected].sort());
    return records;
}
