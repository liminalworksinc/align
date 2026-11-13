'use strict';

const locks = globalThis.__alignLocks ?? (globalThis.__alignLocks = new Map());

async function with_lock(key, fn) {
  const previous = locks.get(key) ?? Promise.resolve();
  let release;
  const releasePromise = new Promise(resolve => { release = resolve; });
  const tail = previous.then(() => releasePromise);
  locks.set(key, tail);
  try {
    await previous.catch(() => undefined);
    return await fn();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}

module.exports = { with_lock };
