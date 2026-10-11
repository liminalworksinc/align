# Limitations found while testing (kept, not ingested)

- `p-beta@1-normal-115057.json` — the candidate plan's run was cut short by an HTTP 429 from the model provider (free-tier AI Gateway rate limit) after the private note and before the public reply. Grade: FAIL (agent_failed). This was an agent limitation (no model-call retry), not a plan failure.
  **Fix:** bounded model retry with backoff (2s, 4s, 8s) on 429/5xx in `agent/goal-triage-agent.mjs`. The rerun on the same mission, seed and checks passed (`evidence/p-beta@1-normal-115116.json`).
