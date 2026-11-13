"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPrecision = runPrecision;
// Owned callback inputs and effect observations. No original algorithms.
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const server_auth_fixture_v1_mjs_1 = require("./server-auth-fixture-v1.mjs");
const server_auth_scenarios_v4_mjs_1 = require("./server-auth-scenarios-v4.mjs");
const SIGN = '/sign-in/email-otp', SEND = '/email-otp/send-verification-otp';
const common = { env: { BETTER_AUTH_SECRET: 'owned-secret' } };
async function runPrecision(load, { labels } = {}) {
    const selected = labels ? new Set(labels) : null, records = [];
    async function observe(name, settings, action, prepare = () => { }) {
        if (selected && !selected.has(name))
            return;
        const f = (0, server_auth_fixture_v1_mjs_1.fixture)({ ...common, ...settings });
        f.sentinel = new Error('owned getter failure');
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
        records.push({ name, value: (0, server_auth_scenarios_v4_mjs_1.normal)(value), error: error ? {
                name: error.name, owned_identity: error === f.sentinel,
                ...(error.name === 'TypeError' ? {} : { message: error.message }),
                ...(error.status ? { status: error.status, body: (0, server_auth_scenarios_v4_mjs_1.normal)(error.body) } : {}),
            } : null, trace: (0, server_auth_scenarios_v4_mjs_1.normal)(f.trace) });
    }
    const getter = (f, object, key, value, { fault = false } = {}) => Object.defineProperty(object, key, { configurable: true, get() { f.trace.push(['getter', key]); if (fault)
            throw f.sentinel; return typeof value === 'function' ? value() : value; } });
    for (const path of ['/passkey/generate-register-options', '/passkey/verify-registration', '/link-social'])
        await observe('precision:recent-no-email:' + path, {}, async (o, n, f) => {
            const body = { name: 'owned' };
            getter(f, body, 'email', undefined, { fault: true });
            const ctx = f.hookContext({ path, body });
            getter(f, ctx, 'body', body);
            return o.hooks.before(ctx);
        });
    for (const path of ['/unrelated', SEND, SIGN])
        for (const changing of [false, true])
            await observe('precision:body-once:' + path + ':' + changing, {}, async (o, n, f) => {
                const first = { email: ' ONE@Example.Test ', type: 'sign-in', otp: '123456' };
                const second = { email: 'second@example.test', type: 'verify-email', otp: 4 };
                let count = 0;
                const ctx = f.hookContext({ path });
                getter(f, ctx, 'body', () => changing && ++count > 1 ? second : first);
                return o.hooks.before(ctx);
            });
    const code = '123456', hash = node_crypto_1.default.createHash('sha256').update(code).digest('base64url');
    for (const kind of ['future-number', 'future-string', 'null', 'valueOf', 'toPrimitive', 'throwing'])
        await observe('precision:verification-expiry:' + kind, { user: { user: { emailVerified: false } } }, async (o, n, f) => {
            const future = f.state.now + 1000;
            const expiry = kind === 'future-number' ? future : kind === 'future-string' ? String(future) : kind === 'null' ? null :
                kind === 'valueOf' ? { valueOf() { f.trace.push(['expiry.valueOf']); return future; } } :
                    { [Symbol.toPrimitive](hint) { f.trace.push(['expiry.primitive', hint]); if (kind === 'throwing')
                            throw f.sentinel; return future; } };
            const verification = { value: hash };
            getter(f, verification, 'expiresAt', expiry);
            f.state.verification = verification;
            return o.hooks.before(f.hookContext({ path: SIGN, body: { email: 'one@example.test', otp: code } }));
        });
    for (const kind of ['missing-context', 'null-context', 'missing-adapter', 'null-adapter', 'missing-method', 'sync-throw', 'non-promise', 'rejected-promise', 'absent-ctx'])
        await observe('precision:delivery-cleanup:' + kind, { sendError: new Error('owned send failure') }, async (o, n, f) => {
            const fn = o.plugins.find(x => x.id === 'emailOTP').options.sendVerificationOTP;
            let ctx = { headers: new Headers({ host: 'localhost:3100' }), context: { internalAdapter: {} } };
            const adapter = ctx.context.internalAdapter;
            if (kind === 'missing-context')
                delete ctx.context;
            else if (kind === 'null-context')
                ctx.context = null;
            else if (kind === 'missing-adapter')
                delete ctx.context.internalAdapter;
            else if (kind === 'null-adapter')
                ctx.context.internalAdapter = null;
            else if (kind === 'sync-throw')
                adapter.deleteVerificationByIdentifier = () => { f.trace.push(['cleanup.sync']); throw f.sentinel; };
            else if (kind === 'non-promise')
                adapter.deleteVerificationByIdentifier = () => { f.trace.push(['cleanup.non-promise']); return undefined; };
            else if (kind === 'rejected-promise')
                adapter.deleteVerificationByIdentifier = () => { f.trace.push(['cleanup.rejection']); return Promise.reject(f.sentinel); };
            else if (kind === 'absent-ctx')
                ctx = undefined;
            return fn({ email: 'one@example.test', otp: code, type: 'sign-in' }, ctx);
        });
    for (const kind of ['absent-ctx', 'missing-context', 'null-context', 'missing-session', 'null-session', 'missing-inner', 'null-inner', 'missing-createdAt', 'valid'])
        await observe('precision:session-update-chain:' + kind, {}, async (o, n, f) => {
            const ctx = kind === 'absent-ctx' ? undefined : kind === 'missing-context' ? {} : kind === 'null-context' ? { context: null } :
                { context: kind === 'missing-session' ? {} : { session: kind === 'null-session' ? null : kind === 'missing-inner' ? {} :
                            { session: kind === 'null-inner' ? null : kind === 'missing-createdAt' ? {} : { createdAt: new Date(f.state.now) } } } };
            return o.databaseHooks.session.update.before({ expiresAt: new Date(f.state.now + 31 * 86400000) }, ctx);
        });
    for (const owner of ['', '   ', 'one@example.test'])
        for (const email of ['', 'one@example.test'])
            await observe('precision:first-owner:' + JSON.stringify(owner) + ':' + email, { hosted: true, env: { ...common.env, ALIGN_FIRST_OWNER_EMAIL: owner } }, async (o, n, f) => o.databaseHooks.user.create.before({ email }, { path: SIGN }));
    await observe('precision:hosted-invite-clock-order', { hosted: true }, async (o, n, f) => o.databaseHooks.user.create.before({ email: 'one@example.test' }, { path: SIGN }), f => {
        const Base = f.globals.Date;
        class Clock extends Base {
            constructor(...args) { f.trace.push(['Date.construct', args.length]); super(...args); }
            toISOString() { f.trace.push(['Date.toISOString']); return super.toISOString(); }
        }
        Object.defineProperty(f.globals, 'Date', { get() { f.trace.push(['Date.resolve']); return Clock; } });
    });
    for (const origin of [null, 'https://public.example.test'])
        for (const kind of ['request', 'fallback', 'request-throws', 'headers-throws'])
            await observe('precision:delivery-header-order:' + String(origin) + ':' + kind, { origin }, async (o, n, f) => {
                const headers = new Headers({ host: 'localhost:3100' }), req = {};
                getter(f, req, 'headers', kind === 'fallback' ? undefined : headers, { fault: kind === 'headers-throws' });
                const ctx = { context: f.hookContext().context };
                getter(f, ctx, 'request', req, { fault: kind === 'request-throws' });
                getter(f, ctx, 'headers', headers);
                return o.plugins.find(x => x.id === 'emailOTP').options.sendVerificationOTP({ email: 'one@example.test', otp: code, type: 'sign-in' }, ctx);
            });
    strict_1.default.equal(new Set(records.map(x => x.name)).size, records.length);
    if (selected)
        strict_1.default.deepEqual(records.map(x => x.name).sort(), [...selected].sort());
    return records;
}
