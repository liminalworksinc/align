'use strict';

function create_devices(resources) {
  const {createPublicKey, verify, randomInt, config, all, audit, get, LIVE_WS, run, tx,
    V2Error, badRequest, conflict, event, newId, nowIso, secretToken, sha256hex,
    retryAfterMs, take, takeAll, endSessions, readDate, readBuffer} = resources;
  const ACCESS_TTL_S = 3600, REFRESH_TTL_S = 2592000, CODE_TTL_S = 600, POLL_INTERVAL_S = 5;
  const alphabet = 'BCDFGHJKLMNPQRSTVWXZ';
  const WORKSPACES_PER_APPROVAL = 50;
  const WORKSPACES_UNREADABLE = "This approval doesn't say which of your workspaces the device may use, so nothing was approved. Tick your workspaces again.";
  const TOO_MANY_WORKSPACES = 'One approval can give a device at most 50 workspaces, so nothing was approved. Tick fewer workspaces.';
  const LONG_CODE = 'That code is too long. Enter the code shown by align login.';
  const EMPTY_CODE = 'Enter the code shown by align login.';
  const WORKSPACE_CHOSEN_NOT_YOURS = 'A workspace you ticked is not one of yours any more (it was deleted, or you left it or were removed from it), so nothing was approved. Tick your workspaces again.';
  const DEVICE_NOT_YOURS = 'A device you chose is not one of your paired devices any more (it may have been signed out), so nothing was joined.';
  const WORKSPACE_NOT_YOURS = 'This workspace is not one of yours any more (it was deleted, or you left it or were removed from it), so the device was given nothing.';

  function userById(id) {
    const row = get('SELECT id, name, email, emailVerified FROM ba_user WHERE id = ?', id);
    if (!row) return undefined;
    return {id:row.id, name:row.name, email:row.email, emailVerified:!!row.emailVerified};
  }
  function normalizeUserCode(input) {
    const s = input.toUpperCase().replace(/[^A-Z]/g, '');
    if (s.length !== 8 || [...s].some(c => !alphabet.includes(c))) return null;
    return s.slice(0,4) + '-' + s.slice(4);
  }
  function userCode() {
    const s = Array.from({length:8}, () => alphabet[randomInt(alphabet.length)]).join('');
    return s.slice(0,4) + '-' + s.slice(4);
  }
  function publicKey(value) {
    const raw = readBuffer().from(value, 'base64url');
    const message = 'public_key must be a base64url Ed25519 public key (32 bytes)';
    if (raw.length !== 32 || raw.toString('base64url') !== value) throw badRequest(message);
    try { return createPublicKey({key:{kty:'OKP',crv:'Ed25519',x:value},format:'jwk'}); }
    catch (_) { throw badRequest(message); }
  }
  async function authorize(input, client, origin) {
    publicKey(input.public_key);
    const limit = {key:`device-authorize:${client}`,max:10,windowMs:60*60*1000};
    if (!takeAll([limit])) {
      const waitMs = retryAfterMs([limit]);
      const minutes = Math.max(1, Math.ceil(waitMs / 60000));
      const wait = minutes === 1 ? '1 minute' : `${minutes} minutes`;
      const message = config().hosted
        ? `Too many device pairings were started from this network in the last hour (the limit is 10). Try again in ${wait}.`
        : `Align on this computer has started 10 device pairings in the last hour, its limit for everyone who pairs here. Try again in ${wait}, or restart Align to clear it.`;
      throw new V2Error(429,'rate_limited',message,{retry_after:Math.max(1,Math.ceil(waitMs/1000))});
    }
    const deviceCode = secretToken(32);
    const now = readDate().now();
    const code = await tx(() => {
      for (let i = 0; i < 10; i++) {
        const c = userCode();
        if (get('SELECT 1 AS x FROM v2_device_requests WHERE user_code = ?', c)) continue;
        run("DELETE FROM v2_device_requests WHERE expires_at < ? AND state <> 'approved'", new (readDate())(now - 3600_000).toISOString());
        run("INSERT INTO v2_device_requests (id, device_code_hash, user_code, device_name, public_key, created_at, expires_at, interval_s, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')", newId('dr'),sha256hex(deviceCode),c,input.device_name,input.public_key,new (readDate())(now).toISOString(),new (readDate())(now+CODE_TTL_S*1000).toISOString(),POLL_INTERVAL_S);
        return c;
      }
      throw new V2Error(503,'busy','Try again');
    });
    return {device_code:deviceCode,user_code:code,verification_uri:origin+'/app/device',expires_in:600,interval:5};
  }
  function issueTokens(deviceId, nowMs) {
    const access = 'alnd_' + secretToken(32);
    const refresh = 'alnr_' + secretToken(32);
    const at = new (readDate())(nowMs).toISOString();
    run("INSERT INTO v2_device_tokens (token_hash, device_id, kind, created_at, expires_at) VALUES (?, ?, 'access', ?, ?)",sha256hex(access),deviceId,at,new (readDate())(nowMs+ACCESS_TTL_S*1000).toISOString());
    run("INSERT INTO v2_device_tokens (token_hash, device_id, kind, created_at, expires_at) VALUES (?, ?, 'refresh', ?, ?)",sha256hex(refresh),deviceId,at,new (readDate())(nowMs+REFRESH_TTL_S*1000).toISOString());
    run('DELETE FROM v2_device_tokens WHERE device_id = ? AND expires_at < ?',deviceId,at);
    return {access,refresh};
  }
  function oauthError(code) { return new V2Error(400,code,code.replaceAll('_',' ')); }
  async function token(deviceCode, replaces = null) {
    const nowMs = readDate().now();
    const at = new (readDate())(nowMs).toISOString();
    const outcome = await tx(() => {
      const r = get('SELECT * FROM v2_device_requests WHERE device_code_hash = ?',sha256hex(deviceCode));
      if (!r) return {error:'invalid_grant'};
      if (r.state === 'consumed' || readDate().parse(r.expires_at) <= nowMs) return {error:'expired_token'};
      if (r.last_poll_at && nowMs - readDate().parse(r.last_poll_at) < r.interval_s*1000) {
        run('UPDATE v2_device_requests SET last_poll_at = ?, interval_s = interval_s + 5 WHERE id = ?',at,r.id);
        return {error:'slow_down'};
      }
      run('UPDATE v2_device_requests SET last_poll_at = ? WHERE id = ?',at,r.id);
      if (r.state === 'denied') return {error:'access_denied'};
      if (r.state === 'pending') return {error:'authorization_pending'};
      const user = r.user_id ? userById(r.user_id) : undefined;
      if (!user) return {error:'access_denied'};
      const deviceId = newId('dv');
      const replaced = replaces && get('SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL',replaces,user.id) ? replaces : null;
      run('INSERT INTO v2_devices (id, user_id, name, public_key, created_at, last_seen_at, replaces) VALUES (?, ?, ?, ?, ?, ?, ?)',deviceId,user.id,pairedName(user.id,r,replaces,nowMs),r.public_key,at,at,replaced);
      const granted = [];
      for (const ws of JSON.parse(r.ws_ids_json || '[]')) {
        if (get(`SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS('ws_id')}`,ws,user.id)) {
          run('INSERT OR IGNORE INTO v2_device_grants (device_id, ws_id) VALUES (?, ?)',deviceId,ws);
          granted.push(ws);
        }
      }
      run("UPDATE v2_device_requests SET state = 'consumed', device_id = ? WHERE id = ?",deviceId,r.id);
      audit(null,user.id,'device.paired',deviceId,at);
      for (const ws of granted) event('device_paired',{ws,user:user.id,props:{workspaces:granted.length},at});
      const pair = issueTokens(deviceId,nowMs);
      return {ok:{device_id:deviceId,access_token:pair.access,expires_in:ACCESS_TTL_S,refresh_token:pair.refresh,user:{id:user.id,name:user.name,email:user.email}}};
    });
    if ('error' in outcome) throw oauthError(outcome.error);
    return outcome.ok;
  }
  function distinctName(userId, requested, replaces, held) {
    const names = new Set(all('SELECT name FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL AND id <> ?',userId,replaces ?? '').map(d => d.name));
    for (const name of held) names.add(name);
    if (!names.has(requested)) return requested;
    for (let n = 2;; n++) { const name = `${requested} (${n})`; if (!names.has(name)) return name; }
  }
  function heldNames(userId, exceptRequest, nowMs) {
    return all("SELECT approved_name FROM v2_device_requests WHERE user_id = ? AND state = 'approved' AND id <> ? AND approved_name IS NOT NULL AND expires_at > ?",userId,exceptRequest,new (readDate())(nowMs).toISOString()).map(r => r.approved_name);
  }
  function nameNumber(base, other) {
    if (other === base) return 1;
    const m = /^(.*) \((\d+)\)$/.exec(other);
    return m && m[1] === base ? Number(m[2]) : null;
  }
  function pairedName(userId,r,replaces,nowMs) {
    const held = heldNames(userId,r.id,nowMs);
    const old = replaces ? get('SELECT name FROM v2_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL',replaces,userId) : undefined;
    if (old) {
      const free = distinctName(userId,r.device_name,replaces,held);
      if (free === r.device_name || nameNumber(r.device_name,old.name) === null) return free;
      const taken = held.includes(old.name) || get('SELECT 1 AS x FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL AND name = ? AND id <> ? AND (replaces IS NULL OR replaces <> ?)',userId,old.name,replaces,replaces);
      return taken ? free : old.name;
    }
    if (r.approved_name && !get('SELECT 1 AS x FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL AND name = ?',userId,r.approved_name)) return r.approved_name;
    return distinctName(userId,r.device_name,null,held);
  }
  const refreshMessage = (deviceId, refreshToken, ts) => `align-refresh\n${deviceId}\n${sha256hex(refreshToken)}\n${ts}`;
  async function refresh(input) {
    const invalid = reason => new V2Error(401,'invalid_grant','invalid grant',reason ? {reason} : undefined);
    const nowMs = readDate().now();
    const device = get('SELECT id, public_key, revoked_at, revoked_reason FROM v2_devices WHERE id = ?',input.device_id);
    if (!device) throw invalid('unknown_device');
    const signed = readDate().parse(input.ts);
    if (Number.isNaN(signed)) throw invalid();
    let ok = false;
    try {
      ok = verify(null,readBuffer().from(refreshMessage(input.device_id,input.refresh_token,input.ts),'utf8'),publicKey(device.public_key),readBuffer().from(input.sig,'base64url'));
    } catch (_) { ok = false; }
    if (device.revoked_at) throw invalid(ok ? device.revoked_reason || 'revoked' : undefined);
    if (!ok) throw invalid();
    if (Math.abs(signed-nowMs) > 5*60*1000) {
      const minutes = Math.round((signed-nowMs)/60000);
      throw new V2Error(400,'clock_skew',`This device's clock is ${Math.abs(minutes)} minutes ${minutes > 0 ? 'ahead of' : 'behind'} the server's`,{server_time:new (readDate())(nowMs).toISOString()});
    }
    const outcome = await tx(() => {
      const row = get("SELECT rotated_at, expires_at FROM v2_device_tokens WHERE token_hash = ? AND device_id = ? AND kind = 'refresh'",sha256hex(input.refresh_token),input.device_id);
      if (!row) return null;
      if (row.rotated_at) { revokeInTx(input.device_id,'refresh_reuse',null); return null; }
      if (readDate().parse(row.expires_at) <= nowMs) return null;
      run('UPDATE v2_device_tokens SET rotated_at = ? WHERE token_hash = ?',new (readDate())(nowMs).toISOString(),sha256hex(input.refresh_token));
      run('UPDATE v2_devices SET last_seen_at = ? WHERE id = ?',new (readDate())(nowMs).toISOString(),input.device_id);
      const pair = issueTokens(input.device_id,nowMs);
      return {access_token:pair.access,expires_in:ACCESS_TTL_S,refresh_token:pair.refresh};
    });
    if (!outcome) throw invalid();
    return outcome;
  }
  function revokeInTx(deviceId,reason,actor) {
    const at = nowIso();
    run('UPDATE v2_devices SET revoked_at = COALESCE(revoked_at, ?), revoked_reason = COALESCE(revoked_reason, ?) WHERE id = ?',at,reason,deviceId);
    run('DELETE FROM v2_device_tokens WHERE device_id = ?',deviceId);
    const rows = all("SELECT ws_id, session_key FROM v2_sessions WHERE device_id = ? AND state <> 'stopped'",deviceId);
    endSessions(rows,'device_signed_out',at);
    audit(null,actor,'device.revoked',deviceId,at);
  }
  function handoff(revokedId,nextId) {
    const gone = get('SELECT user_id, name FROM v2_devices WHERE id = ?',revokedId);
    const next = get('SELECT user_id, name, revoked_at FROM v2_devices WHERE id = ?',nextId);
    if (!gone || !next || next.user_id !== gone.user_id || next.revoked_at) return;
    const m = /^(.*) \((\d+)\)$/.exec(next.name);
    if (!m) return;
    const request = get('SELECT device_name FROM v2_device_requests WHERE device_id = ?',nextId);
    if (request?.device_name === next.name) return;
    const n = nameNumber(m[1],gone.name);
    if (n === null || n >= Number(m[2])) return;
    if (get('SELECT 1 AS x FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL AND name = ? AND id <> ?',gone.user_id,gone.name,nextId)) return;
    run('UPDATE v2_devices SET name = ? WHERE id = ?',gone.name,nextId);
  }
  async function revokeDevice(deviceId,reason,actor,replacedBy = null) {
    await tx(() => { revokeInTx(deviceId,reason,actor); if (replacedBy) handoff(deviceId,replacedBy); });
  }
  function revokeDevicesOf(userId,reason,actor) {
    const ids = all('SELECT id FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL',userId);
    for (const row of ids) revokeInTx(row.id,reason,actor);
    return ids.length;
  }
  function deviceFromAccessToken(tokenValue) {
    if (!/^alnd_[A-Za-z0-9_-]{20,100}$/.test(tokenValue)) return null;
    const row = get("SELECT t.device_id, t.expires_at, d.name, d.user_id, d.revoked_at, d.last_seen_at FROM v2_device_tokens t JOIN v2_devices d ON d.id = t.device_id\n     WHERE t.token_hash = ? AND t.kind = 'access'",sha256hex(tokenValue));
    if (!row || row.revoked_at || readDate().parse(row.expires_at) <= readDate().now()) return null;
    const user = userById(row.user_id);
    if (!user) return null;
    if (!row.last_seen_at || readDate().now()-readDate().parse(row.last_seen_at) > 5*60*1000) {
      try { run('UPDATE v2_devices SET last_seen_at = ? WHERE id = ?',nowIso(),row.device_id); } catch (_) {}
    }
    const grants = new Set(all(`SELECT g.ws_id FROM v2_device_grants g JOIN v2_members m ON m.ws_id = g.ws_id AND m.user_id = ? WHERE g.device_id = ? AND ${LIVE_WS('g.ws_id')}`,row.user_id,row.device_id).map(g => g.ws_id));
    return {kind:'device',user:{id:user.id,name:user.name,email:user.email},deviceId:row.device_id,deviceName:row.name,grants};
  }
  function userCodeOf(body) {
    const value = body.user_code;
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw badRequest(EMPTY_CODE);
    if (text.length > 20) throw badRequest(LONG_CODE);
    return text;
  }
  function workspaceIdsOf(body) {
    const ids = body.workspace_ids ?? [];
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || id.trim().length > 64)) throw badRequest(WORKSPACES_UNREADABLE);
    if (ids.length > WORKSPACES_PER_APPROVAL) throw badRequest(TOO_MANY_WORKSPACES);
    return [...new Set(ids.map(id => id.trim()).filter(Boolean))];
  }
  function pendingByCode(code, nowMs = readDate().now()) {
    const norm = normalizeUserCode(code);
    const r = norm ? get('SELECT * FROM v2_device_requests WHERE user_code = ?',norm) : undefined;
    if (!r || r.state !== 'pending' || readDate().parse(r.expires_at) <= nowMs) throw new V2Error(404,'not_found','No device is waiting for that code. Check it, or run align login again.');
    return r;
  }
  function lookupRequest(userId,code) {
    take(`device-lookup:${userId}`,20,10*60*1000);
    const r = pendingByCode(code);
    return {device_name:r.device_name,requested_at:r.created_at,age_seconds:Math.max(0,Math.round((readDate().now()-readDate().parse(r.created_at))/1000)),expires_at:r.expires_at};
  }
  function sameNames(userId,base) {
    return all('SELECT name FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL',userId).map(d => ({name:d.name,n:nameNumber(base,d.name)})).filter(d => d.n !== null).sort((a,b) => a.n-b.n).map(d => d.name);
  }
  async function decideRequest(userId,code,decision,wsIds) {
    take(`device-decide:${userId}`,20,10*60*1000);
    return tx(() => {
      const r = pendingByCode(code);
      if (decision === 'deny') {
        run("UPDATE v2_device_requests SET state = 'denied', user_id = ? WHERE id = ?",userId,r.id);
        return {state:'denied'};
      }
      if (!wsIds.length) throw badRequest('Choose at least one workspace for this device');
      for (const ws of wsIds) if (!get(`SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS('ws_id')}`,ws,userId)) throw new V2Error(404,'not_found',WORKSPACE_CHOSEN_NOT_YOURS);
      const name = distinctName(userId,r.device_name,null,heldNames(userId,r.id,readDate().now()));
      run("UPDATE v2_device_requests SET state = 'approved', user_id = ?, ws_ids_json = ?, approved_name = ? WHERE id = ?",userId,JSON.stringify(wsIds),name,r.id);
      return {state:'approved',device_name:name,asked_as:r.device_name,same_name:sameNames(userId,r.device_name)};
    });
  }
  function listDevices(userId) {
    return all('SELECT id, name, created_at, last_seen_at, revoked_at, revoked_reason FROM v2_devices WHERE user_id = ? ORDER BY created_at DESC',userId).map(d => ({...d,workspaces:all('SELECT w.id, w.name FROM v2_device_grants g JOIN v2_workspaces w ON w.id = g.ws_id WHERE g.device_id = ? AND w.deleted_at IS NULL ORDER BY w.name',d.id)}));
  }
  function liveDevicesOf(userId) {
    return all('SELECT id, name, created_at, last_seen_at FROM v2_devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY name COLLATE NOCASE, id',userId);
  }
  function addWorkspaceToDevices(userId,wsId,deviceIds,at) {
    for (const id of deviceIds) {
      if (!get('SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL',id,userId)) throw new V2Error(404,'not_found',DEVICE_NOT_YOURS);
      run('INSERT OR IGNORE INTO v2_device_grants (device_id, ws_id) VALUES (?, ?)',id,wsId);
      audit(wsId,userId,'device.workspace_added',id,at);
    }
    return deviceIds;
  }
  async function grantWorkspace(userId,deviceId,wsId) {
    const at = nowIso();
    await tx(() => {
      if (!get('SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL',deviceId,userId)) throw new V2Error(404,'not_found','This device is not one of your paired devices any more (it may have been signed out), so it was given nothing.');
      if (!get(`SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS('ws_id')}`,wsId,userId)) throw new V2Error(404,'not_found',WORKSPACE_NOT_YOURS);
      if (get('SELECT 1 AS x FROM v2_device_grants WHERE device_id = ? AND ws_id = ?',deviceId,wsId)) throw conflict('already_granted','This device already has this workspace');
      addWorkspaceToDevices(userId,wsId,[deviceId],at);
    });
    return {device_id:deviceId,workspace_id:wsId};
  }
  function deviceOwnedBy(deviceId,userId) {
    return !!get('SELECT 1 AS x FROM v2_devices WHERE id = ? AND user_id = ?',deviceId,userId);
  }
  return {ACCESS_TTL_S,REFRESH_TTL_S,CODE_TTL_S,POLL_INTERVAL_S,userById,normalizeUserCode,authorize,token,refreshMessage,refresh,revokeDevice,revokeDevicesOf,deviceFromAccessToken,userCodeOf,workspaceIdsOf,WORKSPACES_PER_APPROVAL,WORKSPACES_UNREADABLE,TOO_MANY_WORKSPACES,LONG_CODE,EMPTY_CODE,lookupRequest,decideRequest,WORKSPACE_CHOSEN_NOT_YOURS,listDevices,liveDevicesOf,DEVICE_NOT_YOURS,addWorkspaceToDevices,WORKSPACE_NOT_YOURS,grantWorkspace,deviceOwnedBy};
}

exports.create_devices = create_devices;
