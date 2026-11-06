'use strict';
const path = require('node:path');

function create_settings(context) {
  const environment = context.environment;
  const cwd = context.cwd;
  const followUpProblem = context.followUpProblem;
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
  const capKeys = ['ALIGN_MAX_WORKSPACES', 'ALIGN_MAX_OWNED_WORKSPACES', 'ALIGN_MAX_MEMBERS', 'ALIGN_MAX_SESSIONS_PER_DEVICE_DAY'];
  const emailKeys = ['ALIGN_EMAIL_API_URL', 'ALIGN_EMAIL_API_KEY', 'ALIGN_EMAIL_FROM'];
  const modes = ['codes', 'open', 'closed'];
  const positive = value => /^\s*[1-9]\d{0,8}\s*$/.test(value);
  const limit = (value, fallback) => positive(value) ? Number(value) : fallback;
  const hosted = env => env.HOSTED === '1';
  const hosts = env => new Set((env.ALIGN_HOSTS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
  const parsed = value => { try { return new URL(value); } catch { return null; } };
  const https = value => { const url = parsed(value); return !!url && url.protocol === 'https:'; };
  function config() {
    const env = environment();
    return {hosted: hosted(env), dataDir: path.resolve(cwd(), env.ALIGN_DATA_DIR || 'data'), allowedHosts: hosted(env) ? hosts(env) : new Set(LOOPBACK)};
  }
  function hostName(host) {
    if (!host) return '';
    const value = host.toLowerCase();
    if (value.startsWith('[')) { const end = value.indexOf(']'); return end < 0 ? '' : value.slice(0, end + 1); }
    return value.split(':')[0];
  }
  function hostAllowed(host) {
    const name = hostName(host);
    return !!name && /^(?::\d{1,5})?$/.test(host.slice(name.length)) && config().allowedHosts.has(name);
  }
  function testIdpEnabled(env = environment()) { return !hosted(env) && env.ALIGN_TEST_IDP === '1'; }
  function validMaxDays(value) { return /^\d{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= 365; }
  function sessionMaxDays(env = environment()) { const value = (env.ALIGN_SESSION_MAX_DAYS || '').trim(); return validMaxDays(value) ? Number(value) : 30; }
  function testOAuthUrl(env = environment()) {
    if (!testIdpEnabled(env) || !env.ALIGN_TEST_OAUTH_URL) return null;
    const url = parsed(env.ALIGN_TEST_OAUTH_URL);
    return url && ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? url.origin : null;
  }
  function googleConfigured(env = environment()) { return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET); }
  function githubConfigured(env = environment()) { return !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET); }
  function emailApi(env = environment()) { return emailKeys.every(key => env[key]) && https(env.ALIGN_EMAIL_API_URL) ? {url: env.ALIGN_EMAIL_API_URL, key: env.ALIGN_EMAIL_API_KEY, from: env.ALIGN_EMAIL_FROM} : null; }
  function emailSignInEnabled(env = environment()) { return !hosted(env) || !!emailApi(env); }
  function localOwnerEmail(env = environment()) { return (env.ALIGN_LOCAL_OWNER_EMAIL || 'owner@align.localhost').trim().toLowerCase(); }
  function localCodesPerHour(env = environment()) { return limit(env.ALIGN_LOCAL_CODES_PER_HOUR, 60); }
  function creationMode(env = environment()) { if (!hosted(env)) return 'open'; const value = (env.ALIGN_CREATION || 'codes').trim().toLowerCase(); return modes.includes(value) ? value : 'closed'; }
  function caps(env = environment()) { return hosted(env) ? {workspaces: limit(env[capKeys[0]], 100), owned: limit(env[capKeys[1]], 2), members: limit(env[capKeys[2]], 25), sessionsPerDeviceDay: limit(env[capKeys[3]], 500)} : null; }
  function turnstile(env = environment()) { return hosted(env) && env.ALIGN_TURNSTILE_SITE_KEY && env.ALIGN_TURNSTILE_SECRET_KEY ? {siteKey: env.ALIGN_TURNSTILE_SITE_KEY, secretKey: env.ALIGN_TURNSTILE_SECRET_KEY, verifyUrl: env.ALIGN_TURNSTILE_VERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify'} : null; }
  function publicOrigin(env = environment()) { if (!hosted(env) || !env.ALIGN_PUBLIC_ORIGIN) return null; const url = parsed(env.ALIGN_PUBLIC_ORIGIN); return url ? url.origin : null; }
  function v2Warnings(env = environment()) {
    const result = [];
    if (hosted(env) && !turnstile(env)) result.push('Warning: ALIGN_TURNSTILE_SITE_KEY and ALIGN_TURNSTILE_SECRET_KEY are not set, so sign-in, access requests and workspace creation have no bot check.');
    const follow = followUpProblem(env);
    if (follow) result.push(follow);
    return result;
  }
  function v2Problems(env = environment()) {
    const result = [];
    if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) result.push('BETTER_AUTH_SECRET must be set (32+ characters)');
    const origin = parsed(env.ALIGN_PUBLIC_ORIGIN);
    if (!origin || origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) result.push('ALIGN_PUBLIC_ORIGIN must be an https origin (https://host)');
    else if (!hosts(env).has(origin.hostname)) result.push("ALIGN_PUBLIC_ORIGIN's host must be listed in ALIGN_HOSTS");
    const count = emailKeys.filter(key => env[key]).length;
    if (count && count !== 3) result.push('Set all of ALIGN_EMAIL_API_URL, ALIGN_EMAIL_API_KEY, ALIGN_EMAIL_FROM or none (missing ' + emailKeys.filter(key => !env[key]).join(', ') + ')');
    if (env.ALIGN_EMAIL_API_URL && !https(env.ALIGN_EMAIL_API_URL)) result.push('ALIGN_EMAIL_API_URL must be an https URL');
    if (!!env.GOOGLE_CLIENT_ID !== !!env.GOOGLE_CLIENT_SECRET) result.push('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together');
    if (!!env.GITHUB_CLIENT_ID !== !!env.GITHUB_CLIENT_SECRET) result.push('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set together');
    if (!count && !googleConfigured(env) && !githubConfigured(env)) result.push('Sign-in needs the email settings (ALIGN_EMAIL_API_URL, ALIGN_EMAIL_API_KEY, ALIGN_EMAIL_FROM) or a Google or GitHub client (id and secret)');
    const days = (env.ALIGN_SESSION_MAX_DAYS || '').trim();
    if (days && !validMaxDays(days)) result.push('ALIGN_SESSION_MAX_DAYS must be a whole number of days from 1 to 365');
    for (const [key, message] of [
      ['ALIGN_TEST_IDP', 'ALIGN_TEST_IDP is not allowed when hosted'],
      ['ALIGN_TEST_NOW', 'ALIGN_TEST_NOW is not allowed when hosted (tests only)'],
      ['ALIGN_TEST_OAUTH_URL', 'ALIGN_TEST_OAUTH_URL is not allowed when hosted (tests only)'],
      ['ALIGN_LOCAL_OWNER_EMAIL', 'ALIGN_LOCAL_OWNER_EMAIL is not allowed when hosted (Mode L only)']
    ]) if (env[key]) result.push(message);
    if (env.ALIGN_CREATION && !modes.includes(env.ALIGN_CREATION.trim().toLowerCase())) result.push('ALIGN_CREATION must be codes, open or closed');
    for (const key of capKeys) if (env[key] !== undefined && env[key] !== '' && !positive(env[key])) result.push(key + ' must be a positive whole number');
    if (!!env.ALIGN_TURNSTILE_SITE_KEY !== !!env.ALIGN_TURNSTILE_SECRET_KEY) result.push('ALIGN_TURNSTILE_SITE_KEY and ALIGN_TURNSTILE_SECRET_KEY must be set together');
    if (env.ALIGN_TURNSTILE_VERIFY_URL && !https(env.ALIGN_TURNSTILE_VERIFY_URL)) result.push('ALIGN_TURNSTILE_VERIFY_URL must be an https URL');
    return result;
  }
  function hostedProblems(env = environment(), applicationDirectory = cwd()) {
    const result = [];
    const allowed = hosts(env);
    if (!allowed.size) result.push('ALIGN_HOSTS must list the public hostname(s)');
    if ([...allowed].some(host => LOOPBACK.has(host) || host === '::1')) result.push('ALIGN_HOSTS must not include loopback names');
    if (!env.ALIGN_SECRET || env.ALIGN_SECRET.length < 32) result.push('ALIGN_SECRET must be set (32+ characters)');
    const data = env.ALIGN_DATA_DIR;
    if (!data || !path.isAbsolute(data)) result.push('ALIGN_DATA_DIR must be an absolute path on the persistent volume');
    else {
      const app = path.isAbsolute(applicationDirectory) ? path.resolve(applicationDirectory) : path.resolve(cwd(), applicationDirectory);
      const relative = path.relative(app, path.resolve(data));
      if (relative === '' || (!path.isAbsolute(relative) && relative.split(path.sep)[0] !== '..')) result.push('ALIGN_DATA_DIR must be outside the app directory');
    }
    if (env.ALIGN_PUBLIC === '1') result.push('Public mode is not supported in this build');
    return result.concat(v2Problems(env));
  }
  let cached;
  function startupProblems() { if (cached === undefined) { const env = environment(); cached = hosted(env) ? hostedProblems(env) : []; } return cached; }
  function assertStartupConfig() {
    const env = environment();
    if (env.ALIGN_PUBLIC === '1') throw new Error('Public mode is not supported in this build');
    if (hosted(env)) { const problems = hostedProblems(env); if (problems.length) throw new Error('HOSTED=1 refused to start:\n- ' + problems.join('\n- ')); }
  }
  return {config, hostName, hostAllowed, hostedProblems, startupProblems, assertStartupConfig, testIdpEnabled, validMaxDays, sessionMaxDays, testOAuthUrl, googleConfigured, githubConfigured, emailApi, emailSignInEnabled, localOwnerEmail, localCodesPerHour, creationMode, caps, turnstile, v2Warnings, v2Problems, publicOrigin, LOOPBACK, RECENT_SIGN_IN_MS: 900000};
}
module.exports = {create_settings};
