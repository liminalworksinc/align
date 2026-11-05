'use strict';
const {object, count} = require('./helpers.js');
function claude_counts(usage) {
  if (!object(usage)) return null;
  const input = count(usage.input_tokens), output = count(usage.output_tokens);
  if (input === null || output === null || Number.isNaN(input) || Number.isNaN(output)) return null;
  const cache_read = count(usage.cache_read_input_tokens) ?? 0;
  const total = count(usage.cache_creation_input_tokens);
  let w5 = 0, w1 = 0, unsplit = 0;
  if (object(usage.cache_creation)) {
    w5 = count(usage.cache_creation.ephemeral_5m_input_tokens) ?? 0;
    w1 = count(usage.cache_creation.ephemeral_1h_input_tokens) ?? 0;
    if (total !== null) {
      if (Number.isNaN(total) || w5 + w1 > total) return null;
      unsplit = total - w5 - w1;
    }
  } else if (total !== null) unsplit = total;
  const result = {input, output, cache_read, cache_write_5m:w5, cache_write_1h:w1, cache_write_unsplit:unsplit};
  return Object.values(result).every(v => Number.isSafeInteger(v) && v >= 0) ? result : null;
}
module.exports = {claude_counts};
