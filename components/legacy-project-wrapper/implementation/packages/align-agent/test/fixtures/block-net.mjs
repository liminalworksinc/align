// Preload for hook tests: any network use or networking-module import throws.
import { registerHooks } from "node:module";
const blocked = /^(node:)?(net|http|https|http2|tls|dgram|dns|dns\/promises|child_process|worker_threads)$/;
registerHooks({
  resolve(specifier, context, next) {
    if (blocked.test(specifier)) throw new Error(`blocked import in hook: ${specifier}`);
    return next(specifier, context);
  },
});
globalThis.fetch = () => {
  throw new Error("network blocked in hook");
};
