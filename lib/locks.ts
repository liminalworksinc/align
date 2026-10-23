// Per-key promise queues shared across route bundles in one Node process (like store.ts's __alignLock).
const g = globalThis as unknown as { __alignLocks?: Map<string, Promise<unknown>> };
const locks = (g.__alignLocks ??= new Map());

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  const tail = prev.then(() => next);
  locks.set(key, tail);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key); // nothing queued behind us
  }
}
