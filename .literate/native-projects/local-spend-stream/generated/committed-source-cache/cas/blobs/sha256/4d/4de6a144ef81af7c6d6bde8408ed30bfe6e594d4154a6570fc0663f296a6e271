'use strict';
const {count} = require('./count.js');
const object = v => v !== null && typeof v === 'object';
const str = v => typeof v === 'string' && v.length > 0 ? v : null;
function totals(u) {
  if (!object(u)) return null;
  const t = {input: count(u.input_tokens ?? u.prompt_tokens), cached: count(u.cached_input_tokens ?? u.cache_read_input_tokens ?? u.cached_tokens) ?? 0, cache_write: count(u.cache_write_input_tokens) ?? 0, output: count(u.output_tokens ?? u.completion_tokens)};
  return Object.values(t).every(Number.isSafeInteger) ? t : null;
}
function claude_counts(u) {
  if (!object(u)) return null;
  const input = count(u.input_tokens), output = count(u.output_tokens);
  if (input === null || output === null || Number.isNaN(input) || Number.isNaN(output)) return null;
  const cache_read = count(u.cache_read_input_tokens) ?? 0;
  const total = count(u.cache_creation_input_tokens);
  let w5 = 0, w1 = 0, unsplit = 0;
  if (object(u.cache_creation)) {
    w5 = count(u.cache_creation.ephemeral_5m_input_tokens) ?? 0;
    w1 = count(u.cache_creation.ephemeral_1h_input_tokens) ?? 0;
    if (total !== null) {
      if (Number.isNaN(total) || w5 + w1 > total) return null;
      unsplit = total - (w5 + w1);
    }
  } else if (total !== null) unsplit = total;
  const result = {input, output, cache_read, cache_write_5m: w5, cache_write_1h: w1, cache_write_unsplit: unsplit};
  return Object.values(result).every(v => Number.isSafeInteger(v) && v >= 0) ? result : null;
}
function append_cwd(state, c) {
  const other = state.other_cwds ?? [];
  if (other.includes(c) || other.length >= 8) return false;
  if (!state.other_cwds) state.other_cwds = other;
  other.push(c);
  return true;
}
module.exports = {object, str, totals, claude_counts, append_cwd};
