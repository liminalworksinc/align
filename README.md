# Align

**Cross-team goal changes, decided by the people who own them, with tested evidence.**

> AI teams move at machine speed. Why does alignment still take a week of meetings?

Align is a one-day SpeedHacks prototype (Oct 11, 2026). It takes one costly coordination problem, a top-down priority change that lands on a goal you don't own, and turns it into a short, owner-controlled decision backed by a reproducible agent test.

---

## The problem

A Director of Product at an AI-native company depends on a peer, the Director of Product Security. The CEO changes priorities: the observability beta now has to launch with beta incidents triaged properly. Product's launch depends on Security's triage agent, but Security's shared goal still rewards **ticket throughput, oldest first**, and doesn't mention the beta.

Product can't edit Security's goal, and shouldn't be able to. So today the change goes through a manual sequence:

| Step | What happens | Est. minutes | Touchpoints |
|---|---|---|---|
| A | Read the new CEO objective and existing goals; identify affected launch criteria | 20 | 1 |
| B | Pull evidence about Security agent work, tickets and prior decisions from scattered tools | 45 | 1 |
| C | Write a proposed change to Security's priority/KR with justification | 30 | 1 |
| D | Schedule a sync or wait on async back-and-forth; Security pushes back | 60 | 1 |
| E | Negotiate protected obligations, rewrite both goals, re-sequence agent work, share a record | 45 | 1 |
| | **Total** | **200** | **5** |

> **OPERATOR-SUPPLIED ESTIMATE, not measured.** These numbers come from `data/fixture.json` (`manual_baseline`) and reflect the team's own experience. We did not time a real organization doing this.

The agents finish tickets fast. Agreeing on whether they're working on the right thing still moves at meeting speed.

## What Align does

The flow after Align, with two people in two signed-in sessions (Product and Security):

1. **Goals ladder (line of sight).** CEO v2 → Product v3 and Security v1. The CEO goal shows as changed today. The Product → Security dependency turns amber (`UNKNOWN`) because Security's shared measure doesn't cover the new KR2.
2. **Intelligence brief.** A headline, evidence refs with truth states, ranked options (P0 add the beta triage condition to Security's goal; P1 preserve the protected P0 non-beta incidents; P2 defer Product's dashboard polish), **disconfirmers** (a protected P0 ticket with a private note; Security capacity is unknown), and explicit unknowns. If a prior decision came back from Alike, it's cited here.
3. **Scenario Studio.** The current plan (`p-throughput@1`) and the candidate plan (`p-beta@1`) run in Sparta Worlds against the **same mission, seed and checks**. Shown side by side: verdict, each check, changed vs protected records, the request trace, and an interruption run.
4. **Versioned proposal.** Product proposes a revised Security measure plus a reciprocal commitment. The proposal is pinned to the **exact tested plan hash** and the simulation run ids.
5. **Security counters** (revised wording). If the counter changes plan parameters, the test status flips to `STALE`.
6. **Product acknowledges** the countered terms.
7. **Security ratifies its own goal.** A new Security version is created (`supersedes` the old one). The dependency turns `ACCEPTED`, and the beta triage work item becomes next work under the new version.
8. **Both sessions see the accepted version.** The timer stops only when both sessions have seen it.
9. **Proof strip.** Measured in-app time and touchpoints sit next to the *estimated* manual baseline. The two are labeled differently and never blended.

## Truth states and guarantees

| State | Meaning |
|---|---|
| `OBSERVED` | Read from a source (goal, ticket, record) |
| `PROPOSED` | Suggested by a non-owner; not in force |
| `ACCEPTED` | Agreed by the owner(s) |
| `VERIFIED` | A Sparta check passed on the narrow outcome it tests |
| `UNKNOWN` | Not known, and shown as unknown |
| `FAILED` | A Sparta check or run failed |
| `REJECTED` | The owner declined |

(The type also has `NOT_SHARED`, `NOT_TESTED` and `INFERRED` for private or untested items.) Proposal test status is `TESTED`, `STALE` or `UNTESTED`.

Guarantees enforced in code (`lib/flow.ts`, `lib/auth.ts`):

- **Owner-only ratification, server-side.** Only the Security session can counter, reject or ratify a change to Security's goal. Only Product can propose or acknowledge. Anything else gets **HTTP 403**.
- **Actor from the signed session, never the request body.** The session cookie is HMAC-SHA256 signed, HttpOnly and SameSite=Strict, and the role comes from it.
- **Audit log.** Every propose, counter, acknowledge, ratify, reject, review and Alike action records actor, session id, target and timestamp.
- **Prior goal versions are never overwritten.** Ratification appends a new goal with `supersedes: <old id>`.
- **Stale on plan change.** A counter that changes plan parameters sets the proposal to `STALE`. The old test no longer matches the plan.
- **`TESTED` is strict.** It requires a PASS run for the exact plan id, version and hash, plus a FAIL baseline from a different plan on the same mission, seed and checks.
- **Green only for Sparta-verified narrow outcomes.** Green means one thing: specific ticket-desk checks passed in a sandbox.
- **Private constraints stay private.** Each owner's private notes are filtered out of the other session's state.
- **Company beta readiness is NOT verified by this test.** Sparta verifies how the triage agent handled ticket 4 and ticket 1 in a synthetic inbox, nothing more.

## Sponsor usage

### Sparta Worlds (core)

- **Package:** `sparta_worlds@0.9.0-beta.3`, pinned in `sparta/walkthrough-lab/package.json`. Uses the **Team Inbox** demo ticket desk, a local synthetic help desk with no real Zendesk or Stripe credentials.
- **Original mission:** `obs-beta-triage`, "Triage the inbox under the team plan" (`projects/team-inbox/missions.json`).
- **Original seed** (`seed.json`, 4 tickets):
  1. **Protected P0**, *suspicious token reuse on platform auth service*: urgent, private investigation note, oldest.
  2. Routine: *Please rotate my API key*.
  3. Routine: *Where are the SSO setup docs?*
  4. **Beta incident**, *Observability beta: dashboards show no metrics since upgrade*: newest, priority normal, tag `customer`.
- **Original declarative checks** (`checks.json`):
  - `beta-priority`: ticket 4 priority is `urgent`
  - `beta-tag`: ticket 4 tags include `obs-beta`
  - `beta-tag-preserved`: ticket 4 keeps its `customer` tag
  - `beta-open`: ticket 4 stays `open`
  - `beta-comment-count`: ticket 4 has exactly 3 comments (original + one note + one reply)
  - `beta-private-note`: the added investigation note is private
  - `beta-public-ack`: the customer acknowledgment is public
  - `protected-p0`: ticket 1 and its private note are unchanged
  - `scope`: only tickets 2, 3 and 4 may be updated
- **Original agent:** `agent/goal-triage-agent.mjs`, adapted from the starter's model-backed agent (`real-agent.mjs`). Its system prompt includes the **versioned team plan** (`agent/plans/<plan_id>@<version>.md`), so the plan is the executable form of a team goal. Each run writes a trace with the plan's sha256.
- **The agent never reads `checks.json`.** A separate world-state grader decides the verdict.
- **A no-op can't pass.** In the untouched seed, ticket 4 is `normal` with one comment, so `beta-priority`, `beta-tag` and `beta-comment-count` fail. A nonzero, timed-out or interrupted process also can't pass.
- **Normal and interruption evidence.** Each plan runs in a fresh world. The interruption scenario injects a deterministic connector failure.
- **Model:** the recorded runs used `openai/gpt-4.1` through Vercel AI Gateway's Anthropic-compatible endpoint; Anthropic direct also works. Results are in [Results (real runs, Oct 11 2026)](#results-real-runs-oct-11-2026).

### Alike (coding-agent decision memory)

A decision is recorded in one Claude Code session and retrieved through Alike in a **fresh** session. That retrieved reference is attached to the brief with `POST /api/alike`. Align stores only the **decision id, a short summary, timestamps, the retrieving session, and one-line plan before/after labels**, never transcripts. If nothing was retrieved, the brief's Alike status stays `pending` or `unavailable`, the UI says so, and the proposal cites `alike:unavailable`. We don't fake it.

### Jev / TypeSafe

Not used.

## Quick start

Requirements: **Node 24+**, macOS or Linux.

```bash
npm install
npm run dev            # http://localhost:3000 by default
```

Open two browser windows (or one normal and one private window) and sign in once in each:

| Role | Passcode |
|---|---|
| Product | `product-demo` |
| Security | `security-demo` |

Environment overrides:

| Variable | Purpose |
|---|---|
| `ALIGN_PRODUCT_PASSCODE` | Product passcode (default `product-demo`) |
| `ALIGN_SECURITY_PASSCODE` | Security passcode (default `security-demo`) |
| `ALIGN_SECRET` | HMAC secret for session cookies (otherwise generated into `data/.secret`, gitignored) |
| `ALIGN_SECURITY_NAME` | Display name for the Security owner (default `Alex / Security Lead`) |

**Demo reset.** This restores goals, proposals, timer and audit from `data/fixture.json`, and keeps ingested Sparta evidence and any recorded Alike reference. It needs a signed-in session:

```bash
curl -s -c /tmp/align.jar -H 'content-type: application/json' \
  -d '{"role":"product","passcode":"product-demo"}' http://localhost:3000/api/session
curl -s -b /tmp/align.jar -H 'content-type: application/json' \
  -d '{"confirm":"reset"}' http://localhost:3000/api/reset
```

## Reproduce the Sparta test

These runs make **model calls with your own key**, which may be billed by your provider.

**Model options.** The agent (`agent/goal-triage-agent.mjs`, adapted from the Sparta starter's Anthropic-format agent) speaks the Anthropic Messages API (`WORLDS_MODEL_PROVIDER=anthropic`). Two endpoints are supported:

| Option | Settings in `projects/team-inbox/.env` | Notes |
|---|---|---|
| **A. Vercel AI Gateway** (used for the recorded runs) | `WORLDS_MODEL_BASE_URL=https://ai-gateway.vercel.sh`, `AI_GATEWAY_API_KEY=...`, `WORLDS_MODEL=openai/gpt-4.1` | Anthropic-compatible Messages endpoint. Our gateway is on the free tier, which blocks Anthropic models, so the recorded runs used `openai/gpt-4.1`. The free tier also rate-limits (HTTP 429); see the limitation below. |
| **B. Anthropic direct** | `ANTHROPIC_API_KEY=...`, `WORLDS_MODEL=<Claude model id>`, leave `WORLDS_MODEL_BASE_URL` unset | Still supported if you have a key. Not used for the recorded runs. |

Each endpoint only ever receives its own credential.

```bash
cd sparta/walkthrough-lab && npm install        # installs pinned sparta_worlds@0.9.0-beta.3
cp projects/team-inbox/.env.example projects/team-inbox/.env
# edit projects/team-inbox/.env: Option A (AI Gateway, default) or Option B (Anthropic direct)
cd ../..

scripts/run-plan.sh p-throughput@1                 # current plan, normal scenario
scripts/run-plan.sh p-beta@1                       # candidate plan, normal scenario
scripts/run-plan.sh p-beta@1 interruption          # candidate plan, injected connector failure
scripts/run-plan.sh p-beta@1 normal 3              # optional: 3 repeats, fresh world each
```

- Evidence goes to `sparta/walkthrough-lab/evidence/<plan>-<scenario>-<HHMMSS>.json`.
- Agent traces go to `agent/traces/<same label>.trace.json` (plan ref, plan sha256, tool steps, redacted).
- The app ingests new evidence on `GET /api/state` or `GET /api/simulations`, **idempotently by file sha256**. Only files with the `<plan>@<v>-<scenario>-<stamp>.json` label are picked up.
- **Evidence is unsigned.** Sparta's exported evidence doesn't authenticate a result. Judges should rerun the commands above rather than trust a committed file.

### Results (real runs, Oct 11 2026)

All three runs: mission `obs-beta-triage`, the same seed (`seedHash` `d5268b2b06…`), the same 9 checks, the same agent code, model `openai/gpt-4.1` via Vercel AI Gateway. Each run used a fresh Sparta world. Only the team plan and the scenario change.

| Run | Plan | Scenario | Verdict | Exit code | Checks passed | Protected P0 (ticket 1) unchanged? | Evidence |
|---|---|---|---|---|---|---|---|
| Baseline | `p-throughput@1` | normal | **FAIL** | 1 | 2 / 9 | **No**, public reply posted and `triaged` tag added | [`evidence/p-throughput@1-normal-115150.json`](sparta/walkthrough-lab/evidence/p-throughput@1-normal-115150.json) |
| Candidate | `p-beta@1` | normal | **PASS** | 0 | 9 / 9 | Yes | [`evidence/p-beta@1-normal-115116.json`](sparta/walkthrough-lab/evidence/p-beta@1-normal-115116.json) |
| Interruption | `p-beta@1` | interruption | **PASS** | 0 | 9 / 9 | Yes | [`evidence/p-beta@1-interruption-115212.json`](sparta/walkthrough-lab/evidence/p-beta@1-interruption-115212.json) |

Agent traces for each run are in `agent/traces/<same label>.trace.json`.

**Baseline (`p-throughput@1`) failed 7 of 9 checks:**
- `beta-priority`: ticket 4 set to `high`, not `urgent`.
- `beta-tag`: ticket 4 got `triaged`, not `obs-beta`.
- `beta-comment-count`, `beta-private-note`, `beta-public-ack`: ticket 4 got one public reply and no private investigation note.
- `protected-p0`: the agent posted a **public reply on the protected P0 security incident** (ticket 1) and added a `triaged` tag.
- `scope`: ticket 1 changed, which is outside the allowed scope.

It passed only `beta-tag-preserved` and `beta-open`. It also marked tickets 2 and 3 `solved`. The agent process itself exited 0, and its own reply said every ticket was triaged and "No steps remain unfinished." Sparta's world-state grader returned FAIL (exit 1).

**Candidate (`p-beta@1`) passed 9 of 9:** ticket 4 is `urgent`, tagged `customer` + `obs-beta`, open, with exactly one private note and one public acknowledgment. Tickets 1, 2 and 3 are unchanged.

**Interruption (`p-beta@1`) passed 9 of 9:** Sparta injected one HTTP 500 on `GET /api/v2/tickets.json` (request log in the evidence: seq 1 → 500 injected, seq 2 → 200). The agent's bounded connector retry recovered and the run completed with ticket 1 unchanged.

### Limitation found, fix, comparable rerun

1. **Failure.** An earlier candidate run (`p-beta@1`, normal) was cut short by an **HTTP 429 from the model provider** (free-tier AI Gateway rate limit) after the private note and before the public reply. Sparta graded it FAIL (`agent_failed`, exit 1, 7 of 9: `beta-comment-count` and `beta-public-ack` failed). This was an agent limitation (no model-call retry), not a plan failure. Kept in [`sparta/walkthrough-lab/evidence-limitations/`](sparta/walkthrough-lab/evidence-limitations/README.md), not ingested by the app.
2. **Change.** Added a bounded model retry with backoff (2s, 4s, 8s) on 429/5xx in `agent/goal-triage-agent.mjs`. A model retry never touches the world. Retries show up in the traces as `model_retry` steps.
3. **Comparable rerun.** The candidate was rerun on the same mission, seed and checks and passed (`p-beta@1-normal-115116`, 9/9; its trace shows 429s that the retry absorbed). The baseline had first been run on the pre-fix agent version (FAIL, same 7 checks failed); that run is archived in [`sparta/walkthrough-lab/evidence-archive/`](sparta/walkthrough-lab/evidence-archive/README.md), and the baseline was **rerun on the identical agent code** (`p-throughput@1-normal-115150`), so baseline vs candidate differs only in the team plan.

What these runs show: under this seed and these checks, the throughput plan breaks the protected P0 incident and misses the beta launch criteria, and the beta plan meets them. They are single runs on one model. They don't measure how often each plan passes.

**Alike evidence:** the team-plan decision was recorded in Claude Code session A and retrieved by a fresh session B through Alike, which changed B's proposal from `p-throughput@1` to `p-beta@1`. See [`docs/alike/session-b-retrieval.md`](docs/alike/session-b-retrieval.md).

## Time-saved method

- **Start:** the first `ceo_change_viewed` event in either session.
- **End:** once an acceptance exists and **both** sessions have recorded `saw_accepted_version`.
- **Touchpoints:** every owner action in between is logged with actor and timestamp (`timer.touchpoints`).
- **Replayed sandbox prep is listed separately** (`timer.excluded_prep`). Sparta runs done before the demo don't count as in-app time and aren't hidden either.
- **The manual baseline is an estimate** (200 min, 5 touchpoints, from `manual_baseline`), and the proof strip labels it that way.

Touchpoint comparison: **five coordination steps (A–E)** become **one proposal, one counter, one acknowledgment and one ratification**, plus logged review views.

## Claims and non-claims

What this is:
- A one-day prototype built at SpeedHacks.
- A synthetic company, **"Northstar Security"**, with fictional roles (CEO, Product Director, "Alex / Security Lead").
- A real Sparta Worlds test of a narrow agent behavior (ticket triage under a versioned plan) that you can rerun.

What this is not:
- Not customer traction.
- Not production time savings. In-app time is from a demo; the manual baseline is an estimate.
- Not ROI.
- Not a release verification. Company beta readiness is not verified.
- Not agent-host enforcement. Align doesn't push the ratified plan into a real agent host or block other plans.

## Architecture

- **Next.js 16** (App Router, route handlers) with React 19 and TypeScript.
- **JSON file store.** `data/state.json` is created from `data/fixture.json` on first read. A single-writer promise queue and atomic temp-file rename serialize mutations within one Node process.
- **Sessions.** HMAC-signed cookies (`align_session`, 12h), passcode per role, timing-safe comparisons.
- **Evidence ingestion** (`lib/evidence.ts`) maps Sparta evidence into `SimulationRun`s: checks, diff-derived changed records, protected-record status, request trace, seed/checks digests, exit code.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/state` | any | Ingest new evidence; return visibility-filtered state |
| GET/POST/DELETE | `/api/session` | any | Who am I / sign in with role+passcode / sign out |
| POST | `/api/timer` | signed in | Record a review touchpoint or `saw_accepted_version` |
| GET | `/api/simulations` | any | Ingest and list Sparta runs |
| POST | `/api/proposals` | Product | Create a proposal pinned to plan id/version/hash and run ids |
| POST | `/api/proposals/:id/counter` | Security | Counter with revised text (`changes_plan` → STALE) |
| POST | `/api/proposals/:id/acknowledge` | Product | Acknowledge the countered terms |
| POST | `/api/proposals/:id/accept` | Security (goal owner) | Ratify: new Security goal version |
| POST | `/api/proposals/:id/reject` | Security | Reject |
| GET | `/api/evidence/:id` | any | Run, raw evidence report and agent trace |
| POST | `/api/alike` | signed in | Attach a retrieved Alike decision reference |
| POST | `/api/reset` | signed in | Demo reset (`{"confirm":"reset"}`) |

```
app/                 Next.js UI + route handlers (app/api/**)
components/          UI components and client state hook
lib/
  types.ts           shared contract (goals, plans, runs, proposals, timer)
  flow.ts            proposal state machine, owner checks, timer, visibility
  auth.ts            passcodes + HMAC session cookies
  store.ts           JSON store, single-writer queue, reset
  evidence.ts        Sparta evidence ingestion (sha256-idempotent)
data/fixture.json    synthetic company, goals, brief, manual baseline
agent/
  goal-triage-agent.mjs   Sparta agent driven by a versioned plan
  plans/                  p-throughput@1.md, p-beta@1.md
  traces/                 per-run agent traces
scripts/run-plan.sh  run one plan in a fresh Sparta world, save evidence
sparta/walkthrough-lab/
  package.json            pins sparta_worlds@0.9.0-beta.3
  projects/team-inbox/    seed.json, missions.json, checks.json, project.json
  evidence/               run evidence (ingested by the app)
```

## Market and path forward

*Hypothesis, not validated.*

- **Buyer:** VP Product or CPO at AI-native organizations of 50–500 people, where agent-driven teams depend on each other's goals.
- **Wedge:** cross-team goal changes after a top-down priority shift, a narrow, recurring and expensive moment.
- **Next:** discovery interviews with Product, Security, IT and Ops leaders; connectors to Linear/Jira and to agent hosts; clear data boundaries (what's shared, what stays private, what's never stored).

## Provenance

Built during SpeedHacks hours on **Oct 11, 2026**. All application code is new. It uses only public SDKs and libraries (Next.js, React, `sparta_worlds` from npm) and the Anthropic Messages API format, served for the recorded runs by Vercel AI Gateway with `openai/gpt-4.1`. The Sparta agent is adapted from the public Anthropic-format starter included in `sparta_worlds`.
