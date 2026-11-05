# Public interface: spend-meter.price-row

## ADDED Requirements

### Requirement: spend-meter.price-row

JavaScript module spend_meter/price_row. It exports one function, price_row(model), that returns the list-price row for a model name, or null.

price_row(model) takes a string and looks it up by exact, case-sensitive match among the 29 model names in the table below; there is no prefix, family or date-suffix fallback. A name not in the table returns null. (Behaviour for names that are properties of Object.prototype, such as constructor, is unspecified.) The returned value is a plain object. An Anthropic row has exactly the keys provider, input, output, cache_read, cache_write_5m, cache_write_1h, source and read; an OpenAI row has exactly provider, input, output, cache_write, cache_read, source and read. provider is the string anthropic or openai. The rate fields are integers: picodollars per token, which equals US dollars per million tokens times 1000000. source and read are the strings given. One row, claude-haiku-5-5, also has the key over, an object {input_tokens: 100000, rates: <a full Anthropic row object>} giving a second rate card for long prompts. Each call returns an object with these exact values (returning the same shared object each time is allowed). The table, one row per line, as name: fields:
- "claude-fable-5-1": provider anthropic; input 10000000; output 50000000; cache_read 250000; cache_write_5m 12500000; cache_write_1h 20000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "claude-opus-5-5": provider anthropic; input 4000000; output 20000000; cache_read 200000; cache_write_5m 5000000; cache_write_1h 8000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "claude-sonnet-5-5": provider anthropic; input 2000000; output 10000000; cache_read 200000; cache_write_5m 2500000; cache_write_1h 4000000; source "Claude API reference (claude-api skill, cached 2026-10-06): models table and Haiku 5.5 migration notes"; read "2026-10-22"
- "claude-haiku-5-5": provider anthropic; input 100000; output 500000; cache_read 10000; cache_write_5m 125000; cache_write_1h 200000; source "Claude API reference (claude-api skill, cached 2026-10-06): models table and Haiku 5.5 migration notes"; read "2026-10-22"; over {input_tokens 100000, rates {provider anthropic; input 500000; output 2500000; cache_read 50000; cache_write_5m 625000; cache_write_1h 1000000; source "Claude API reference (claude-api skill, cached 2026-10-06): models table and Haiku 5.5 migration notes"; read "2026-10-22"}}
- "claude-opus-5": provider anthropic; input 5000000; output 25000000; cache_read 500000; cache_write_5m 6250000; cache_write_1h 10000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "claude-sonnet-5": provider anthropic; input 3000000; output 15000000; cache_read 300000; cache_write_5m 3750000; cache_write_1h 6000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "claude-mythos-5": provider anthropic; input 10000000; output 50000000; cache_read 1000000; cache_write_5m 12500000; cache_write_1h 20000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "claude-opus-4-8": provider anthropic; input 5000000; output 25000000; cache_read 500000; cache_write_5m 6250000; cache_write_1h 10000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "claude-opus-4-7": provider anthropic; input 5000000; output 25000000; cache_read 500000; cache_write_5m 6250000; cache_write_1h 10000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "claude-opus-4-6": provider anthropic; input 5000000; output 25000000; cache_read 500000; cache_write_5m 6250000; cache_write_1h 10000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "claude-opus-4-5": provider anthropic; input 5000000; output 25000000; cache_read 500000; cache_write_5m 6250000; cache_write_1h 10000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "claude-sonnet-4-6": provider anthropic; input 3000000; output 15000000; cache_read 300000; cache_write_5m 3750000; cache_write_1h 6000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "claude-sonnet-4-5": provider anthropic; input 3000000; output 15000000; cache_read 300000; cache_write_5m 3750000; cache_write_1h 6000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "claude-haiku-4-5": provider anthropic; input 1000000; output 5000000; cache_read 100000; cache_write_5m 1250000; cache_write_1h 2000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "claude-haiku-4-5-20251001": provider anthropic; input 1000000; output 5000000; cache_read 100000; cache_write_5m 1250000; cache_write_1h 2000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "claude-fable-5": provider anthropic; input 10000000; output 50000000; cache_read 1000000; cache_write_5m 12500000; cache_write_1h 20000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "gpt-5": provider openai; input 1250000; output 10000000; cache_read 125000; cache_write 1250000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "gpt-5-codex": provider openai; input 1250000; output 10000000; cache_read 125000; cache_write 1250000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "gpt-5.5": provider openai; input 5000000; output 30000000; cache_read 500000; cache_write 5000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "gpt-5.5-pro": provider openai; input 30000000; output 180000000; cache_read 3000000; cache_write 30000000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "gpt-6-astra": provider openai; input 10000000; output 50000000; cache_read 1000000; cache_write 12500000; source "developers.openai.com/api/docs/pricing (per pricing.js)"; read "2026-10-09"
- "gpt-6-sol": provider openai; input 2000000; output 10000000; cache_read 200000; cache_write 2500000; source "developers.openai.com/api/docs/pricing (per pricing.js)"; read "2026-10-09"
- "gpt-6.1-sol": provider openai; input 2000000; output 10000000; cache_read 100000; cache_write 2500000; source "developers.openai.com/api/docs/pricing (per pricing.js)"; read "2026-10-09"
- "gpt-6-luna": provider openai; input 100000; output 500000; cache_read 10000; cache_write 125000; source "developers.openai.com/api/docs/pricing (per pricing.js)"; read "2026-10-09"
- "gpt-5.6-sol": provider openai; input 4000000; output 20000000; cache_read 400000; cache_write 5000000; source "developers.openai.com/api/docs/pricing (per pricing.js)"; read "2026-10-09"
- "gpt-5.6-terra": provider openai; input 2000000; output 12000000; cache_read 200000; cache_write 2500000; source "developers.openai.com/api/docs/pricing (per pricing.js)"; read "2026-10-09"
- "gpt-5.6-luna": provider openai; input 200000; output 1200000; cache_read 20000; cache_write 250000; source "developers.openai.com/api/docs/pricing (per pricing.js)"; read "2026-10-09"
- "o4": provider openai; input 15000000; output 60000000; cache_read 1500000; cache_write 18750000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
- "o4-mini": provider openai; input 1100000; output 4400000; cache_read 275000; cache_write 1100000; source "liminal ai-spend pricing.js (operator-maintained table)"; read "not re-verified for this table"
It has no side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7a2f440c0450396c9bf0`, `evidence:bc1a7bbe114555e06668`, `evidence:e0921928605de73f883b`, `evidence:e6ef2013d0e75c4a9803`
