'use strict';

function create_creation_compatibility(resources) {
  const core = resources.core;
  const createHash = resources.createHash;
  const readDate = resources.readDate;
  const CODE_RE = core.CODE_RE;
  const codeHash = core.codeHash;
  const rand32 = core.rand32;
  const recordEvent = core.recordEvent;
  const V1_CODE_RE = /^[0-9a-f]{20}$/;

  function isCreationCode(code) {
    return CODE_RE.test(code) || V1_CODE_RE.test(code);
  }

  function importCreationCodes(db, secret, codes, spentOnV1, days, now = readDate().now()) {
    const counts = {imported: 0, present: 0, used: 0, spentOnV1: 0};
    for (const c of codes) {
      if (!V1_CODE_RE.test(c.code) || !(c.email === null || /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(c.email))) {
        throw new Error('Invalid import row');
      }
    }
    const at = new (readDate())(now).toISOString();
    const expires = new (readDate())(now + days * 86400000).toISOString();
    for (const {code, email} of codes) {
      const plain = createHash('sha256').update(code).digest('hex');
      if (spentOnV1.has(plain)) {
        counts.spentOnV1++;
        continue;
      }
      const hash = codeHash(secret, code);
      const result = db.run('INSERT OR IGNORE INTO v2_creation_codes (id, code_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        'cc_' + rand32(15), hash, email?.trim().toLowerCase() ?? null, at, expires);
      if (result === 1) {
        counts.imported++;
        recordEvent(db, 'code_created', {props: {source: 'operator'}, at});
      } else {
        counts.present++;
        if (db.get('SELECT 1 AS x FROM v2_creation_codes WHERE code_hash = ? AND redeemed_at IS NOT NULL', hash)) counts.used++;
      }
    }
    return counts;
  }

  function redeemCreationCode(db, secret, code, email, userId, wsId, now = readDate().now()) {
    if (!isCreationCode(code)) return false;
    const at = new (readDate())(now).toISOString();
    return db.run('UPDATE v2_creation_codes SET redeemed_at = ?, redeemed_by = ?, ws_id = ?\n       WHERE code_hash = ? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > ? AND (email IS NULL OR email = ?)',
      at, userId, wsId, codeHash(secret, code), at, email.toLowerCase()) === 1;
  }

  return {V1_CODE_RE, isCreationCode, importCreationCodes, redeemCreationCode};
}

module.exports = {create_creation_compatibility};
