'use strict';
function count(v) {
  if (v === undefined || v === null) return null;
  const n = typeof v === 'string' && /^[0-9]+$/.test(v) ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 1000000000000 ? n : NaN;
}
module.exports = {count};
