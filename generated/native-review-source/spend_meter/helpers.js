'use strict';
const object = v => v !== null && typeof v === 'object';
const str = v => typeof v === 'string' && v.length > 0 ? v : null;
function count(v) {
  if (v == null) return null;
  if (typeof v === 'string' && /^[0-9]+$/.test(v)) v = Number(v);
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1000000000000 ? v : NaN;
}
function iso(v) {
  if (!str(v)) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
module.exports = {object, str, count, iso};
