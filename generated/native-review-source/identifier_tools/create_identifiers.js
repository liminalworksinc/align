'use strict';

function create_identifiers(context) {
  const { randomBytes, createHash, newDate } = context;

  function rand32(bytes = 15) {
    const data = randomBytes(bytes);
    const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
    let pending = 0;
    let bits = 0;
    let result = '';
    for (const byte of data) {
      pending = (pending << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        result += alphabet[(pending >>> bits) & 31];
      }
      pending &= (1 << bits) - 1;
    }
    if (bits) result += alphabet[(pending << (5 - bits)) & 31];
    return result;
  }

  function newId(prefix) {
    return `${prefix}_${rand32()}`;
  }

  function secretToken(bytes = 32) {
    return randomBytes(bytes).toString('base64url');
  }

  function sha256hex(input) {
    return createHash('sha256').update(input).digest('hex');
  }

  function nowIso() {
    return newDate().toISOString();
  }

  return { rand32, newId, secretToken, sha256hex, nowIso };
}

module.exports = { create_identifiers };
