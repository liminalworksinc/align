"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESOURCE_NAMES = void 0;
exports.resources = resources;
// Private, source-independent mapping from owned fixture providers to the draft ABI.
const strict_1 = __importDefault(require("node:assert/strict"));
exports.RESOURCE_NAMES = [
    'createHash', 'randomBytes', 'chmodSync', 'existsSync', 'readFileSync', 'writeFileSync',
    'path', 'passkey', 'betterAuth', 'APIError', 'createAuthMiddleware', 'getSessionFromCtx',
    'isAPIError', 'getMigrations', 'emailOTP', 'genericOAuth', 'config', 'hostAllowed',
    'clientNet', 'captchaPlugin', 'emailSignInEnabled', 'githubConfigured',
    'googleConfigured', 'localCodesPerHour', 'localOwnerEmail', 'publicOrigin',
    'RECENT_SIGN_IN_MS', 'sessionMaxDays', 'testIdpEnabled', 'testOAuthUrl',
    'liveCodeFor', 'audit', 'authDb', 'dbDir', 'get', 'LIVE_WS', 'run', 'sql', 'tx', 'nowIso',
    'rand32', 'durableCount', 'durableRetryAfterMs', 'durableRoom', 'otpEmailKey',
    'retryAfterMs', 'takeAll', 'sendSignInCode', 'globalState', 'readEnvironment',
    'readDate', 'readURL',
];
strict_1.default.equal(exports.RESOURCE_NAMES.length, 52);
strict_1.default.equal(new Set(exports.RESOURCE_NAMES).size, 52);
function resources(f) {
    const values = {};
    for (const [module, names] of [
        ['node:crypto', ['createHash', 'randomBytes']],
        ['node:fs', ['chmodSync', 'existsSync', 'readFileSync', 'writeFileSync']],
        ['@better-auth/passkey', ['passkey']], ['better-auth', ['betterAuth']],
        ['better-auth/api', ['APIError', 'createAuthMiddleware', 'getSessionFromCtx', 'isAPIError']],
        ['better-auth/db/migration', ['getMigrations']], ['better-auth/plugins', ['emailOTP', 'genericOAuth']],
        ['../config', ['config', 'hostAllowed']], ['../ratelimit', ['clientNet']], ['./captcha', ['captchaPlugin']],
        ['./config', ['emailSignInEnabled', 'githubConfigured', 'googleConfigured', 'localCodesPerHour', 'localOwnerEmail', 'publicOrigin', 'RECENT_SIGN_IN_MS', 'sessionMaxDays', 'testIdpEnabled', 'testOAuthUrl']],
        ['./core.mts', ['liveCodeFor']], ['./db', ['audit', 'authDb', 'dbDir', 'get', 'LIVE_WS', 'run', 'sql', 'tx']],
        ['./ids', ['nowIso', 'rand32']], ['./limits', ['durableCount', 'durableRetryAfterMs', 'durableRoom', 'otpEmailKey', 'retryAfterMs', 'takeAll']],
        ['./mail', ['sendSignInCode']],
    ])
        for (const name of names) {
            (0, strict_1.default)(Object.hasOwn(f.modules[module], name));
            values[name] = f.modules[module][name];
        }
    values.path = f.modules['node:path'].default;
    Object.assign(values, { globalState: f.globals, readEnvironment: function () { strict_1.default.equal(this, undefined); return f.globals.process.env; }, readDate: function () { strict_1.default.equal(this, undefined); return f.globals.Date; }, readURL: function () { strict_1.default.equal(this, undefined); return f.globals.URL; } });
    strict_1.default.deepEqual(Object.keys(values).sort(), [...exports.RESOURCE_NAMES].sort());
    return Object.fromEntries(exports.RESOURCE_NAMES.map(name => [name, values[name]]));
}
