'use strict';

/** @typedef {{key: string, max: number, windowMs: number}} Limit */

function create_limiter(context) {
  const { hits, now, signPayload, get, all, run, V2Error } = context;

  function live(key, windowMs, time) {
    return (hits.get(key) || []).filter(at => time - at < windowMs);
  }

  function record(key, previous, time) {
    hits.delete(key);
    while (hits.size >= 10000) hits.delete(hits.keys().next().value);
    hits.set(key, [...previous, time]);
  }

  function take(key, max, windowMs, time = now()) {
    const previous = live(key, windowMs, time);
    if (previous.length >= max) {
      throw new V2Error(429, 'rate_limited', 'Too many requests, try again later');
    }
    record(key, previous, time);
  }

  function takeAll(limits, time = now()) {
    const pending = [];
    for (const { key, max, windowMs } of limits) {
      const previous = live(key, windowMs, time);
      if (previous.length >= max) return false;
      pending.push({ key, previous });
    }
    for (const { key, previous } of pending) record(key, previous, time);
    return true;
  }

  function retryAfterMs(limits, time = now()) {
    let wait = 0;
    for (const { key, max, windowMs } of limits) {
      const previous = live(key, windowMs, time);
      if (previous.length >= max) {
        previous.sort((a, b) => b - a);
        wait = Math.max(wait, previous[max - 1] + windowMs - time);
      }
    }
    return wait;
  }

  function otpEmailKey(email) {
    return 'otp-email-hour:' + signPayload('alo.' + email);
  }

  function accessEmailKey(email) {
    return 'access-email:' + signPayload('ala.' + email);
  }

  function durableRoom(limits, time = now()) {
    for (const { key, max, windowMs } of limits) {
      const row = get('SELECT COUNT(*) AS n FROM v2_rate_hits WHERE key = ? AND at > ?', key, time - windowMs);
      if ((row?.n ?? 0) >= max) return false;
    }
    return true;
  }

  function durableCount(limits, time = now()) {
    run('DELETE FROM v2_rate_hits WHERE at <= ?', time - 86400000);
    for (const { key } of limits) {
      run('INSERT INTO v2_rate_hits (key, at) VALUES (?, ?)', key, time);
    }
  }

  function durableRetryAfterMs(limits, time = now()) {
    let wait = 0;
    for (const { key, max, windowMs } of limits) {
      const rows = all('SELECT at FROM v2_rate_hits WHERE key = ? AND at > ? ORDER BY at DESC LIMIT ?', key, time - windowMs, max);
      if (rows.length >= max) {
        wait = Math.max(wait, rows[rows.length - 1].at + windowMs - time);
      }
    }
    return wait;
  }

  function takeDurable(limits, time = now()) {
    if (!durableRoom(limits, time)) return false;
    durableCount(limits, time);
    return true;
  }

  return { take, takeAll, retryAfterMs, otpEmailKey, accessEmailKey,
    durableRoom, durableCount, durableRetryAfterMs, takeDurable };
}

module.exports = { create_limiter };
