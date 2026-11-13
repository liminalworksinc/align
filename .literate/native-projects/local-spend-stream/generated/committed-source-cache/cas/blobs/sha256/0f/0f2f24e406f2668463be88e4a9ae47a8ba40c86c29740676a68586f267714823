'use strict';
function codex_counts(t) {
  if (t === null) return null;
  const fresh = t.input - t.cached - t.cache_write;
  if (fresh < 0) return null;
  return {input: fresh, output: t.output, cache_read: t.cached, cache_write_5m: 0, cache_write_1h: 0, cache_write_unsplit: t.cache_write};
}
module.exports = {codex_counts};
