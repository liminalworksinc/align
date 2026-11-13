// Public generic signature for the independently qualified shared promise queue.
import * as native from "./native/.bindings/promise_queues.js";

export const withLock = native.with_lock as <T>(key: string, fn: () => Promise<T>) => Promise<T>;
