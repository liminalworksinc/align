'use strict';
const maintained = 'liminal ai-spend pricing.js (operator-maintained table)';
const cached = 'Claude API reference (claude-api skill, cached 2026-10-06): models table and Haiku 5.5 migration notes';
const official = 'developers.openai.com/api/docs/pricing (per pricing.js)';
const unread = 'not re-verified for this table';
function anthropic(input, output, cache_read, cache_write_5m, cache_write_1h, source=maintained, read=unread) {
  return {provider:'anthropic',input,output,cache_read,cache_write_5m,cache_write_1h,source,read};
}
function openai(input, output, cache_read, cache_write, source=maintained, read=unread) {
  return {provider:'openai',input,output,cache_write,cache_read,source,read};
}
const table = Object.create(null);
table['claude-fable-5-1'] = anthropic(10000000,50000000,250000,12500000,20000000);
table['claude-opus-5-5'] = anthropic(4000000,20000000,200000,5000000,8000000);
table['claude-sonnet-5-5'] = anthropic(2000000,10000000,200000,2500000,4000000,cached,'2026-10-22');
table['claude-haiku-5-5'] = {...anthropic(100000,500000,10000,125000,200000,cached,'2026-10-22'),over:{input_tokens:100000,rates:anthropic(500000,2500000,50000,625000,1000000,cached,'2026-10-22')}};
for (const name of ['claude-opus-5','claude-opus-4-8','claude-opus-4-7','claude-opus-4-6','claude-opus-4-5']) table[name] = anthropic(5000000,25000000,500000,6250000,10000000);
for (const name of ['claude-sonnet-5','claude-sonnet-4-6','claude-sonnet-4-5']) table[name] = anthropic(3000000,15000000,300000,3750000,6000000);
for (const name of ['claude-mythos-5','claude-fable-5']) table[name] = anthropic(10000000,50000000,1000000,12500000,20000000);
for (const name of ['claude-haiku-4-5','claude-haiku-4-5-20251001']) table[name] = anthropic(1000000,5000000,100000,1250000,2000000);
for (const name of ['gpt-5','gpt-5-codex']) table[name] = openai(1250000,10000000,125000,1250000);
table['gpt-5.5'] = openai(5000000,30000000,500000,5000000);
table['gpt-5.5-pro'] = openai(30000000,180000000,3000000,30000000);
for (const [name, input, output, read, write] of [
  ['gpt-6-astra',10000000,50000000,1000000,12500000],
  ['gpt-6-sol',2000000,10000000,200000,2500000],
  ['gpt-6.1-sol',2000000,10000000,100000,2500000],
  ['gpt-6-luna',100000,500000,10000,125000],
  ['gpt-5.6-sol',4000000,20000000,400000,5000000],
  ['gpt-5.6-terra',2000000,12000000,200000,2500000],
  ['gpt-5.6-luna',200000,1200000,20000,250000]
]) table[name] = openai(input,output,read,write,official,'2026-10-09');
table.o4 = openai(15000000,60000000,1500000,18750000);
table['o4-mini'] = openai(1100000,4400000,275000,1100000);
function price_row(model) { return table[model] ?? null; }
module.exports = {price_row};
