'use strict';
const {safe_follow_up_url} = require('./safe_follow_up_url.js');
function follow_up_url(env = process.env) {
  const set = (env.ALIGN_FOLLOW_UP_URL ?? '').trim();
  if (set) return safe_follow_up_url(set);
  if (env.HOSTED !== '1') return null;
  try {
    const u = new URL(env.ALIGN_PUBLIC_ORIGIN ?? '');
    return u.protocol === 'https:' ? u.origin + '/app/request-access?interest=evaluate&via=value_card' : null;
  } catch { return null; }
}
module.exports = {follow_up_url};
