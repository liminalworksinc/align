'use strict';
function safe_follow_up_url(v) {
  if (!v) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol === 'https:') {
      return u.username || u.password || u.port || !u.hostname ? null : u.toString();
    }
    if (u.protocol !== 'mailto:') return null;
    for (const key of u.searchParams.keys()) if (key.toLowerCase() !== 'subject') return null;
    const address = decodeURIComponent(u.pathname);
    if (!/^[^@\s,;<>"?&]+@[^@\s,;<>"?&]+\.[^@\s,;<>"?&]+$/u.test(address)) return null;
    return u.toString();
  } catch { return null; }
}
module.exports = {safe_follow_up_url};
