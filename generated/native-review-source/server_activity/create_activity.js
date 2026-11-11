'use strict';

function create_activity(resources) {
  const { all, run, tx, badRequest, nowIso, goalObj, goalRow, canReadGoal,
    openEpoch, sessionRow, need, cleanProse, isBlankText, personName,
    SESSION_KEY_RE, readDate } = resources;

  return {
    async ingestActivity(pp, device, body) {
      need(pp, 'session.share');
      const items = body.items;
      if (!Array.isArray(items)) throw badRequest('items must be a list');
      if (items.length > 200) throw badRequest('items: at most 200');
      const now = readDate().now();
      let accepted = 0;
      const refused = [];
      await tx(() => {
        for (const [index, it] of items.entries()) {
          if (!it || typeof it !== 'object' || Array.isArray(it)) throw badRequest('each item must be an object');
          const key = typeof it.session_key === 'string' && SESSION_KEY_RE.test(it.session_key) ? it.session_key : null;
          if (!key) throw badRequest('session_key is invalid');
          const kind = it.kind;
          if (!['edit', 'commit', 'task', 'claim'].includes(kind)) throw badRequest('kind must be edit, commit, task or claim');
          const at = typeof it.at === 'string' ? readDate().parse(it.at) : NaN;
          if (!Number.isFinite(at)) throw badRequest('at must be an ISO time');
          if (typeof it.repo_id !== 'string' || !/^[a-f0-9]{16,64}$/.test(it.repo_id)) throw badRequest('repo_id must be a hex hash');
          const pathHash = it.path_hash === undefined || it.path_hash === null ? null :
            typeof it.path_hash === 'string' && /^[a-f0-9]{16,64}$/.test(it.path_hash) ? it.path_hash : null;
          if (it.path_hash != null && !pathHash) throw badRequest('path_hash must be a hex hash');
          const path = it.path ?? null;
          if (path !== null && (typeof path !== 'string' || !path || path.length > 300 || path.startsWith('/') || path.split('/').includes('..') || /[\x00-\x1f]/.test(path))) throw badRequest('path must be a repo-relative path');
          let text = it.text ?? null;
          if (text !== null) {
            if (typeof text !== 'string') throw badRequest('text must be a string');
            text = cleanProse(text.replace(/[\x00-\x1f\x7f]/g, ' '));
            text = isBlankText(text) ? null : text.slice(0, 120);
          }
          if (at > now + 5 * 60 * 1000) { refused.push({ index, reason: 'clock_skew' }); continue; }
          if (at < now - 24 * 60 * 60 * 1000) { refused.push({ index, reason: 'too_old' }); continue; }
          const s = sessionRow(pp.wsId, key);
          if (!s || s.device_id !== device.deviceId || s.state !== 'shared') { refused.push({ index, reason: 'not_shared' }); continue; }
          const life = kind === 'claim' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
          run('INSERT INTO v2_activity (ws_id, session_key, user_id, goal_id, repo_id, kind, path_hash, path, text, at, expires_at)\n         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            pp.wsId, key, s.user_id, openEpoch(pp.wsId, key)?.goal_id ?? null, it.repo_id, kind, pathHash, path, text,
            new (readDate())(at).toISOString(), new (readDate())(at + life).toISOString());
          accepted++;
        }
        run('DELETE FROM v2_activity WHERE ws_id = ? AND expires_at < ?', pp.wsId, nowIso());
      });
      return { accepted, refused, server_time: new (readDate())(now).toISOString() };
    },
    activityFor(pp, after) {
      need(pp, 'workspace.read');
      const rows = all('SELECT a.seq, a.session_key, a.user_id, a.goal_id, a.repo_id, a.kind, a.path_hash, a.path, a.text, a.at, a.expires_at, s.harness, u.name\n     FROM v2_activity a JOIN v2_sessions s ON s.ws_id = a.ws_id AND s.session_key = a.session_key LEFT JOIN ba_user u ON u.id = a.user_id\n     WHERE a.ws_id = ? AND a.seq > ? AND a.expires_at > ? ORDER BY a.seq LIMIT 500', pp.wsId, after, nowIso());
      const readable = new Map();
      const items = rows.filter(row => {
        const id = row.goal_id;
        const uid = row.user_id;
        if (!id) return uid === pp.userId;
        if (!readable.has(id)) {
          const goal = goalRow(pp.wsId, id);
          readable.set(id, goal ? canReadGoal(pp, goalObj(goal)) : false);
        }
        return readable.get(id);
      }).map(row => ({
        seq: row.seq, session_key: row.session_key, harness: row.harness,
        user: { id: row.user_id, name: personName(row.user_id, row.name) },
        mine: row.user_id === pp.userId, goal_id: row.goal_id, repo_id: row.repo_id,
        kind: row.kind, path_hash: row.path_hash, path: row.path, text: row.text,
        at: row.at, expires_at: row.expires_at
      }));
      return { cursor: rows.length ? rows[rows.length - 1].seq : after, items };
    }
  };
}

exports.create_activity = create_activity;
