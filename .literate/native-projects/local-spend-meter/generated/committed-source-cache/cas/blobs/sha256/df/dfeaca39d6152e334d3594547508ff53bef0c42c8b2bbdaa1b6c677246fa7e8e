'use strict';
const {valid_counts} = require('./valid_counts.js');
const {price_row} = require('./price_row.js');
function price_request(model, counts, total_input) {
  const failure = unpriced => ({est_list_usd_micros:null,unpriced});
  if (!valid_counts(counts)) return failure('invalid_counters');
  if (model === 'codex-auto-review') return failure('auto_review_unpriced');
  const row = price_row(model);
  if (!row) return failure('unknown_model');
  const {input,output,cache_read,cache_write_5m,cache_write_1h,cache_write_unsplit} = counts;
  const prompt = input + cache_read + cache_write_5m + cache_write_1h + cache_write_unsplit;
  const r = row.over && prompt > row.over.input_tokens ? row.over.rates : row;
  let pico = BigInt(input)*BigInt(r.input) + BigInt(output)*BigInt(r.output) + BigInt(cache_read)*BigInt(r.cache_read);
  if (r.provider === 'anthropic') {
    if (cache_write_unsplit > 0) return failure('untyped_cache_write');
    pico += BigInt(cache_write_5m)*BigInt(r.cache_write_5m) + BigInt(cache_write_1h)*BigInt(r.cache_write_1h);
  } else {
    const total = total_input ?? input + cache_read + cache_write_unsplit;
    if (total > 272000) return failure('long_context_unmodeled');
    pico += BigInt(cache_write_unsplit + cache_write_5m + cache_write_1h)*BigInt(r.cache_write);
  }
  return {est_list_usd_micros:Number((pico+500000n)/1000000n),unpriced:null};
}
module.exports = {price_request};
