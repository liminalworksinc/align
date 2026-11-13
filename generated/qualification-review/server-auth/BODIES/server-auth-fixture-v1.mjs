"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBLIC = void 0;
exports.fixture = fixture;
// Private source-independent owned resources. No implementation import.
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_path_1 = __importDefault(require("node:path"));
exports.PUBLIC = ['AUTH_BASE_PATH', 'TEST_OAUTH_PROVIDER', 'COOKIE_PREFIX', 'CANNOT_SIGN_IN', 'isRecentSignIn', 'reauthMessage', 'sessionCap', 'passkeyParty', 'tooManyCodesMessage', 'machineCeilingMessage', 'authOptions', 'getAuth', 'migrateAuth'].sort();
// Resources here belong to the verifier. No real email, network or identity provider.
function fixture(options = {}) {
    const state = { hosted: false, origin: null, maxDays: 30, emailEnabled: true, google: false, github: false, testIdp: false, testOAuth: null,
        localOwner: 'owner@example.test', localMax: 60, now: Date.parse('2026-01-02T03:04:05.000Z'), session: null, token: null,
        room: true, take: true, durableWait: 0, memoryWait: 0, ceilingWait: 0, user: null, verification: null,
        query: () => undefined, sendError: null, deleteError: null, adapterError: null, ...options };
    const trace = [], files = new Map(Object.entries(options.files ?? {}));
    const env = Object.assign(Object.create(null), options.env ?? {});
    const note = (name, ...args) => trace.push([name, ...args]);
    class Clock extends Date {
        constructor(...args) { super(...(args.length ? args : [state.now])); }
        static now() { return state.now; }
    }
    class OwnedAPIError extends Error {
        constructor(status, body, headers) { super(body.message); Object.assign(this, { status, body, headers, statusCode: { BAD_REQUEST: 400, FORBIDDEN: 403, TOO_MANY_REQUESTS: 429, INTERNAL_SERVER_ERROR: 500 }[status] }); }
    }
    const api = { ownedApi: true }, auth = { api, $context: Promise.resolve({ ownedContext: true }) }, database = { ownedDatabase: true };
    const fsPorts = {
        existsSync(file) { note('exists', file); return files.has(file); },
        writeFileSync(file, value, options) { note('write', file, value, options); files.set(file, value); },
        chmodSync(file, mode) { note('chmod', file, mode); },
        readFileSync(file, encoding) { note('read', file, encoding); return files.get(file); },
    };
    const plugin = (name) => (options) => { note(name, options); return { id: name, options }; };
    const modules = {
        'node:crypto': { createHash: node_crypto_1.default.createHash, randomBytes(n) { note('randomBytes', n); return Buffer.alloc(n, 0x7a); } },
        'node:fs': fsPorts, 'node:path': { default: node_path_1.default.posix },
        '@better-auth/passkey': { passkey: plugin('passkey') },
        'better-auth': { betterAuth(options) { note('betterAuth', options); return auth; } },
        'better-auth/api': {
            APIError: OwnedAPIError, createAuthMiddleware(fn) { note('middleware', fn); return fn; },
            async getSessionFromCtx(ctx) { note('getSession', ctx.path); return state.session; },
            isAPIError: e => e instanceof OwnedAPIError,
        },
        'better-auth/db/migration': { async getMigrations(options) { note('getMigrations', options); if (state.adapterError)
                throw state.adapterError; return { async runMigrations() { note('runMigrations'); } }; } },
        'better-auth/plugins': { emailOTP: plugin('emailOTP'), genericOAuth: plugin('genericOAuth') },
        '../config': { config() { note('config'); return { hosted: state.hosted }; }, hostAllowed(host) { note('hostAllowed', host); return state.allowedHosts?.includes(host) ?? ['localhost:3100', '127.0.0.1:3100'].includes(host); } },
        '../ratelimit': { clientNet(ip) { note('clientNet', ip); return 'net:' + ip; } },
        './captcha': { captchaPlugin() { note('captchaPlugin'); return state.captcha ?? null; } },
        './config': {
            emailSignInEnabled() { note('emailEnabled'); return state.emailEnabled; }, githubConfigured() { note('github'); return state.github; },
            googleConfigured() { note('google'); return state.google; }, localCodesPerHour() { note('localMax'); return state.localMax; },
            localOwnerEmail() { note('localOwner'); return state.localOwner; }, publicOrigin() { note('publicOrigin'); return state.origin; },
            RECENT_SIGN_IN_MS: 15 * 60 * 1000, sessionMaxDays() { note('maxDays'); return state.maxDays; },
            testIdpEnabled() { note('testIdp'); return state.testIdp; }, testOAuthUrl() { note('testOAuth'); return state.testOAuth; },
        },
        './core.mts': { liveCodeFor(sql, email) { note('liveCodeFor', sql, email); return state.liveCode ?? null; } },
        './db': {
            audit(...args) { note('audit', ...args); }, authDb() { note('authDb'); return database; }, dbDir() { note('dbDir'); return '/owned/data/v2'; },
            get(...args) { note('get', ...args); return state.query(...args); }, LIVE_WS(x) { note('LIVE_WS', x); return 'OWNED_LIVE(' + x + ')'; },
            run(...args) { note('run', ...args); return 1; }, sql: { ownedSql: true }, async tx(fn) { note('tx:begin'); try {
                const value = fn();
                note('tx:commit', value);
                return value;
            }
            catch (e) {
                note('tx:rollback');
                throw e;
            } },
        },
        './ids': { nowIso() { note('nowIso'); return new Date(state.now).toISOString(); }, rand32(n) { note('rand32', n); return 'r'.repeat(n); } },
        './limits': {
            durableCount(...args) { note('durableCount', ...args); }, durableRetryAfterMs(...args) { note('durableWait', ...args); return state.durableWait; },
            durableRoom(...args) { note('durableRoom', ...args); return state.room; }, otpEmailKey(email) { note('otpEmailKey', email); return 'email-hmac:' + email; },
            retryAfterMs(limits, now) { note('memoryWait', limits, now); return limits.length === 1 && limits[0].key === 'otp-client:local' ? state.ceilingWait : state.memoryWait; },
            takeAll(...args) { note('takeAll', ...args); return state.take; },
        },
        './mail': { async sendSignInCode(...args) { note('sendSignInCode', ...args); if (state.sendError)
                throw state.sendError; } },
    };
    const globals = { Date: Clock, Error, URL, process: { env }, console: { error(...args) { note('console.error', ...args); } } };
    function hookContext({ path = '/', body, request = null, returned } = {}) {
        const ctx = { path, body, request, headers: undefined,
            async getSignedCookie(...args) { note('getSignedCookie', ...args); return state.token; },
            context: { secret: 'owned-auth-secret', authCookies: { sessionToken: { name: 'owned-cookie' } }, returned,
                adapter: { async deleteMany(args) { note('deleteMany', args); if (state.adapterError)
                        throw state.adapterError; } },
                internalAdapter: {
                    async findUserByEmail(email) { note('findUserByEmail', email); return state.user; },
                    async findVerificationValue(identifier) { note('findVerificationValue', identifier); return state.verification; },
                    async deleteVerificationByIdentifier(identifier) { note('deleteVerification', identifier); if (state.deleteError)
                        throw state.deleteError; },
                },
            } };
        return ctx;
    }
    return { state, trace, files, env, modules, globals, hookContext, OwnedAPIError, auth, database };
}
