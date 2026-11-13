'use strict';

function create_auth(resources) {
  const {createHash, randomBytes, chmodSync, existsSync, readFileSync, writeFileSync,
    path, passkey, betterAuth, APIError, createAuthMiddleware, getSessionFromCtx,
    isAPIError, getMigrations, emailOTP, genericOAuth, config, hostAllowed,
    clientNet, captchaPlugin, emailSignInEnabled, githubConfigured,
    googleConfigured, localCodesPerHour, localOwnerEmail, publicOrigin,
    RECENT_SIGN_IN_MS, sessionMaxDays, testIdpEnabled, testOAuthUrl,
    liveCodeFor, audit, authDb, dbDir, get, LIVE_WS, run, sql, tx, nowIso,
    rand32, durableCount, durableRetryAfterMs, durableRoom, otpEmailKey,
    retryAfterMs, takeAll, sendSignInCode, globalState, readEnvironment,
    readDate, readURL} = resources;
  const beforeHandle = createAuthMiddleware(before);
  const afterHandle = createAuthMiddleware(after);
  const AUTH_BASE_PATH = '/api/v2/auth';
  const TEST_OAUTH_PROVIDER = 'align-test';
  const COOKIE_PREFIX = 'align_v2';
  const CANNOT_SIGN_IN = "This email can't sign in here yet. Ask a workspace owner to invite you.";
  const failedDeliveries = new WeakSet();
  const disabledPaths = ['/get-access-token','/refresh-token','/account-info','/unlink-account','/revoke-session','/revoke-sessions','/revoke-other-sessions','/passkey/list-user-passkeys','/passkey/update-passkey','/passkey/delete-passkey','/email-otp/check-verification-otp','/email-otp/verify-email','/email-otp/request-password-reset','/email-otp/reset-password','/forget-password/email-otp','/email-otp/request-email-change','/email-otp/change-email'];
  function currentNow() { const D = readDate(); return D.now(); }
  function isRecentSignIn(signedInAt, now = currentNow()) {
    const timestamp = new (readDate())(signedInAt).getTime();
    return Number.isFinite(timestamp) && now - timestamp <= RECENT_SIGN_IN_MS;
  }
  function reauthMessage(what) { return `Sign in again to ${what}. This needs a sign-in from the last 15 minutes.`; }
  function sessionCap(createdAt) {
    return new (readDate())(new (readDate())(createdAt).getTime() + sessionMaxDays() * 86400000);
  }
  function minutes(waitMs) { const n = Math.max(1, Math.ceil(waitMs / 60000)); return `${n} minute${n === 1 ? '' : 's'}`; }
  function tooManyCodesMessage(waitMs) { return `Too many codes were sent. Try again in ${minutes(waitMs)}.`; }
  function machineCeilingMessage(waitMs, max) { return `Align on this computer has sent ${max} sign-in codes in the last hour, its limit for everyone who signs in here. Try again in ${minutes(waitMs)}, or restart Align to clear it (ALIGN_LOCAL_CODES_PER_HOUR sets the limit).`; }
  function passkeyParty() {
    const origin = publicOrigin();
    if (config().hosted && origin) return {rpID: new (readURL())(origin).hostname, origin};
    return {rpID: 'localhost', origin: `http://localhost:${readEnvironment().PORT || '3100'}`};
  }
  function secret() {
    if (readEnvironment().BETTER_AUTH_SECRET) return readEnvironment().BETTER_AUTH_SECRET;
    if (config().hosted) throw new Error('BETTER_AUTH_SECRET must be set when hosted');
    const file = path.join(dbDir(), '.auth-secret');
    if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('hex'), {mode: 0o600});
    chmodSync(file, 0o600);
    return readFileSync(file, 'utf8').trim();
  }
  function deliveryOrigin(headers) {
    const origin = publicOrigin();
    if (origin) return origin;
    const host = headers?.get('host');
    if (host && hostAllowed(host)) return `http://${host}`;
    return `http://127.0.0.1:${readEnvironment().PORT || '3100'}`;
  }
  function refusal(status, code, message) { return new APIError(status, {code, message}); }
  async function limitSend(email, ctx) {
    const limits = [{key:`otp-email:${email}`, max:3, windowMs:600000}];
    let ceiling;
    if (ctx.request) {
      if (config().hosted) limits.push({key:`otp-client:ip:${clientNet(ctx.request.headers.get('fly-client-ip') ?? 'unknown')}`,max:10,windowMs:3600000});
      else if (email !== localOwnerEmail()) {
        ceiling = {key:'otp-client:local',max:localCodesPerHour(),windowMs:3600000};
        limits.push(ceiling);
      }
    }
    const durable = config().hosted ? [{key:otpEmailKey(email),max:5,windowMs:3600000}] : [];
    const {wait, ceilingWait} = await tx(() => {
      const now = currentNow();
      if (durableRoom(durable, now) && takeAll(limits, now)) {
        durableCount(durable, now);
        return {wait:0,ceilingWait:0};
      }
      const wait = Math.max(durableRetryAfterMs(durable, now), retryAfterMs(limits, now));
      const ceilingWait = ceiling ? retryAfterMs([ceiling], now) : 0;
      return {wait,ceilingWait};
    });
    if (wait > 0) throw new APIError('TOO_MANY_REQUESTS', {code:'rate_limited',message:ceiling && ceilingWait > 0 && ceilingWait >= wait ? machineCeilingMessage(wait, ceiling.max) : tooManyCodesMessage(wait)}, {'Retry-After':String(Math.max(1,Math.ceil(wait/1000)))});
  }
  async function before(ctx) {
    const cutoff = new (readDate())(currentNow() - sessionMaxDays() * 86400000);
    const token = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
    if (token) await ctx.context.adapter.deleteMany({model:'session',where:[{field:'token',value:token},{field:'createdAt',operator:'lt',value:cutoff}]});
    const action = ({'/passkey/generate-register-options':'add a passkey','/passkey/verify-registration':'add a passkey','/link-social':'link an account'})[ctx.path];
    if (action) {
      const session = await getSessionFromCtx(ctx);
      if (session && !isRecentSignIn(session.session.createdAt)) throw refusal('FORBIDDEN','reauth_required',reauthMessage(action));
      const name = ctx.body?.name;
      if (typeof name === 'string' && name.trim().length > 100) throw refusal('BAD_REQUEST','bad_request','A passkey name is at most 100 characters');
      return;
    }
    const body = ctx.body ?? {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (ctx.path === '/email-otp/send-verification-otp') {
      if (body.type !== 'sign-in') throw refusal('BAD_REQUEST','bad_request','Only sign-in codes are sent');
      if (!email) return;
      await limitSend(email, ctx);
      return;
    }
    if (ctx.path === '/sign-in/email-otp' && email && typeof body.otp === 'string') {
      const found = await ctx.context.internalAdapter.findUserByEmail(email);
      if (!found || found.user.emailVerified) return;
      const verification = await ctx.context.internalAdapter.findVerificationValue(`sign-in-otp-${email}`);
      if (!verification || verification.expiresAt < new (readDate())()) return;
      const index = verification.value.lastIndexOf(':');
      const hash = index < 0 ? verification.value : verification.value.slice(0,index);
      const attempts = index < 0 ? 0 : Number(verification.value.slice(index+1));
      if (attempts >= 3) return;
      if (hash !== createHash('sha256').update(body.otp).digest('base64url')) return;
      await ctx.context.internalAdapter.deleteVerificationByIdentifier(`sign-in-otp-${email}`);
      throw refusal('FORBIDDEN','email_unverified',"This account's email address is not verified, so an email code can't sign in to it.");
    }
  }
  async function after(ctx) {
    if (ctx.path === '/email-otp/send-verification-otp' && ctx.request && failedDeliveries.has(ctx.request)) throw refusal('INTERNAL_SERVER_ERROR','email_failed','The sign-in email could not be sent. Try again later.');
    if (ctx.path === '/passkey/verify-registration') {
      const result = ctx.context.returned;
      if (result && !(result instanceof Error) && typeof result.id === 'string' && typeof result.userId === 'string') {
        const id = result.id; const userId = result.userId;
        await tx(() => { const timestamp = nowIso(); return audit(null,userId,'passkey.added',id,timestamp); });
      }
    }
  }
  async function sendVerificationOTP({email,otp,type}, ctx) {
    if (type !== 'sign-in') throw refusal('BAD_REQUEST','bad_request','Only sign-in codes are sent');
    try {
      const origin = deliveryOrigin(ctx?.request?.headers ?? ctx?.headers);
      await sendSignInCode(email, otp, origin);
    } catch (error) {
      await ctx?.context.internalAdapter.deleteVerificationByIdentifier(`sign-in-otp-${email}`).catch(() => {});
      if (ctx?.request) failedDeliveries.add(ctx.request);
      else throw new Error('The sign-in code could not be delivered');
    }
  }
  async function afterVerification({clientData}) {
    if (typeof clientData.id === 'string') {
      const id = clientData.id;
      const timestamp = nowIso();
      await tx(() => run('INSERT INTO v2_passkey_use (passkey_id, last_used_at) SELECT id, ? FROM ba_passkey WHERE credentialID = ? ON CONFLICT (passkey_id) DO UPDATE SET last_used_at = excluded.last_used_at', timestamp, id));
    }
  }
  async function createSession(session) {
    const cap = sessionCap(session.createdAt ?? new (readDate())());
    if (session.expiresAt && new (readDate())(session.expiresAt) > cap) return {data:{...session,expiresAt:cap}};
  }
  async function updateSession(session, ctx) {
    const createdAt = ctx?.context.session?.session.createdAt;
    if (!session.expiresAt || !createdAt) return;
    const cap = sessionCap(createdAt);
    if (new (readDate())(session.expiresAt) > cap) return {data:{...session,expiresAt:cap}};
  }
  async function createUser(user, ctx) {
    if (ctx?.path !== '/sign-in/email-otp') return;
    const email = String(user.email).toLowerCase();
    if (config().hosted) {
      const timestamp = new (readDate())().toISOString();
      const livePredicate = LIVE_WS('ws_id');
      const invite = get(`SELECT 1 AS x FROM v2_invites WHERE email = ? AND accepted_at IS NULL AND expires_at > ? AND ${livePredicate}`, email, timestamp);
      if (!invite && !liveCodeFor(sql,email)) {
        const owner = (readEnvironment().ALIGN_FIRST_OWNER_EMAIL || '').trim().toLowerCase();
        if (!(owner && owner === email && !get('SELECT 1 AS x FROM ba_user LIMIT 1'))) throw refusal('FORBIDDEN','cannot_sign_in',CANNOT_SIGN_IN);
      }
    }
    if (!user.name) return {data:{...user,name:email.split('@')[0].slice(0,100)}};
  }
  function authOptions() {
    const hosted = config().hosted;
    const origin = publicOrigin();
    const socialProviders = {};
    if (googleConfigured()) socialProviders.google = {clientId:readEnvironment().GOOGLE_CLIENT_ID,clientSecret:readEnvironment().GOOGLE_CLIENT_SECRET};
    if (githubConfigured()) socialProviders.github = {clientId:readEnvironment().GITHUB_CLIENT_ID,clientSecret:readEnvironment().GITHUB_CLIENT_SECRET};
    const plugins = [];
    const captcha = captchaPlugin(); if (captcha) plugins.push(captcha);
    if (emailSignInEnabled()) plugins.push(emailOTP({otpLength:6,expiresIn:300,allowedAttempts:3,storeOTP:'hashed',disableSignUp:false,rateLimit:{window:60,max:10},sendVerificationOTP}));
    const testUrl = testOAuthUrl();
    if (testUrl) plugins.push(genericOAuth({config:[{providerId:TEST_OAUTH_PROVIDER,clientId:TEST_OAUTH_PROVIDER,clientSecret:'align-test-secret',authorizationUrl:`${testUrl}/authorize`,tokenUrl:`${testUrl}/token`,userInfoUrl:`${testUrl}/userinfo`,scopes:['email']}]}));
    const party = passkeyParty();
    plugins.push(passkey({rpID:party.rpID,rpName:'Align',origin:party.origin,authenticatorSelection:{residentKey:'required',userVerification:'preferred'},schema:{passkey:{modelName:'ba_passkey'}},authentication:{afterVerification}}));
    const port = readEnvironment().PORT || '3100';
    return {
      appName:'Align',database:authDb(),basePath:AUTH_BASE_PATH,secret:secret(),
      baseURL:hosted && origin ? origin : {allowedHosts:[`localhost:${port}`,`127.0.0.1:${port}`,`[::1]:${port}`],protocol:'http'},
      trustedOrigins:hosted && origin ? [origin] : [],socialProviders,plugins,disabledPaths,
      hooks:{before:beforeHandle,after:afterHandle},
      databaseHooks:{session:{create:{before:createSession},update:{before:updateSession}},user:{create:{before:createUser}}},
      emailAndPassword:{enabled:testIdpEnabled() && !hosted,autoSignIn:true,minPasswordLength:8,maxPasswordLength:128},
      account:{modelName:'ba_account',encryptOAuthTokens:true,accountLinking:{enabled:true,disableImplicitLinking:true}},
      user:{modelName:'ba_user'},session:{modelName:'ba_session',expiresIn:604800,updateAge:86400,freshAge:RECENT_SIGN_IN_MS/1000},verification:{modelName:'ba_verification'},
      rateLimit:{enabled:true,window:60,max:100,storage:hosted?'database':'memory',modelName:'ba_rate_limit',customRules:{'/sign-in/email':{window:60,max:10},'/sign-up/email':{window:60,max:10},'/sign-in/social':{window:60,max:20},'/email-otp/send-verification-otp':{window:60,max:3},'/sign-in/email-otp':{window:60,max:10},'/passkey/generate-authenticate-options':{window:60,max:20},'/passkey/verify-authentication':{window:60,max:10}}},
      telemetry:{enabled:false},advanced:{cookiePrefix:COOKIE_PREFIX,useSecureCookies:hosted,...(hosted?{ipAddress:{ipAddressHeaders:['fly-client-ip']}}:{ipAddress:{disableIpTracking:true}}),database:{generateId:({model}) => /user$/.test(model)?`u_${rand32(15)}`:rand32(20)}},
      logger:{level:'error'},onAPIError:{onError(error,ctx){if(isAPIError(error) && error.statusCode < 500)return;ctx.logger.error(error instanceof Error?error.message:'API error',error);}}
    };
  }
  function getAuth() { return globalState.__alignV2Auth ??= betterAuth(authOptions()); }
  async function migrateAuth() { const {runMigrations} = await getMigrations(authOptions()); await runMigrations(); }
  return {AUTH_BASE_PATH,TEST_OAUTH_PROVIDER,COOKIE_PREFIX,CANNOT_SIGN_IN,isRecentSignIn,reauthMessage,sessionCap,passkeyParty,tooManyCodesMessage,machineCeilingMessage,authOptions,getAuth,migrateAuth};
}
module.exports = {create_auth};
