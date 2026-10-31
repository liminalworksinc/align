# Align

**Align is a command center for parallel AI work: one place to see what needs your decision and which AI apps have read the current plan or last read an older one. Underneath, only a goal's owner can approve a change, both versions are kept, and AI agents read the approved plan.**

Align is Liminal's wedge product, a working prototype. We built the first version in one day at SpeedHacks (Oct 11, 2026), where it won Best Use of Sparta, and rebuilt it during the Proving Ground founder sprint (Oct 21 to 23, 2026) so a team can set up its own two-team case without us. Built by Shayaun Nejad and Shruti Rajagopal Nejad.

## What it does today

- **Set up your own case.** One team (the asking team) proposes a change to another team's goal. Leadership sees it. On `/new`, an AI interviewer can fill in the setup form from a conversation, typed or spoken (the browser's own speech recognition); you review every field and press Create.
- **Only the owner decides.** Only the goal's owning team can counter, reject or approve. Anyone else is refused by the server (HTTP 403). "Accept if…" is a counter that keeps the target and adds conditions; the asking team accepts the counter before the owner approves.
- **Nothing is overwritten.** Approval creates a new goal version and keeps the old one, with an acceptance entry and an audit row. A plan with no sandbox test needs an explicit "accept untested". Leadership makes a separate launch decision.
- **Agents read the approved plan.** A read-only MCP server (9 tools, no write tools) serves the current approved plan. Claude Code (tested end to end) or another MCP client, such as Codex, the Claude app or ChatGPT, connects to a workspace with its MCP URL and a team passcode (OAuth), and reads only that team's data. Claude Code sessions connected to a workspace are notified when a plan is approved (local setup; see docs/MCP.md).
- **Limits from meeting notes.** Paste notes and Align suggests limits for the goal they name; agents can read a limit only once that goal's owner confirms it. No model is called for this.
- **What the decision gave you.** After approval, a value card shows the measured time from proposal to decision, with a tester's own estimate shown separately. Its follow-up is a waitlist form that ends with an optional, non-binding letter of intent.
- **Home shows what needs you.** What is waiting on you and on others, the active goals, and which connected AI apps have read the current plan. Align sees what an app last read, not what it does.

## What it does not do yet

- It does not stop an agent that ignores the approved plan. (A manual Stop is in testing behind a flag.)
- It does not sign records. Liminal's desktop app keeps signed, offline-verifiable decision records; connecting it to Align is next.
- It runs hosted for invited testers only, and no outside team has yet completed an evaluation on its own.

## The original SpeedHacks demo (Oct 11, 2026)

The walkthrough below is the one-day demo: the CEO changes a priority, a running Claude Code agent holds, the owning team approves, and the agent replans. That scenario pushes the approved plan into a connected session; custom scenarios set up in the app do not yet.

## The 60-second version

1. **The CEO changes the priority.** The observability beta now has to launch with beta incidents handled first. Product's launch depends on Security's AI triage agent.
2. **The running agent is still following the old plan.** Security's approved goal still rewards ticket throughput, oldest first. Run against a Sparta Worlds sandbox inbox, that plan **fails, passing only 2 of 9 checks**. The agent touches the protected security incident, then reports the job as done.
3. **Align alerts the agent, and the agent holds.** Leadership's push reaches the running Claude Code session within milliseconds. The agent sees the conflict but doesn't rewrite its own plan, because that goal belongs to Security.
4. **The owner decides.** Product tests both plans in Sparta, then proposes the change with the results attached. Security, which owns the goal, edits and approves it. The server enforces that only Security can (Product gets **HTTP 403**).
5. **The approved plan reaches the agent.** The agent is told, reads the newly approved plan from Align's read-only MCP server, and runs it: **9 of 9 checks pass**, and the protected ticket is untouched. Nobody prompted the agent after its first instruction.

**Watch it:** [`docs/LIVE_REPLAN.md`](docs/LIVE_REPLAN.md) is the timestamped record of that run, uninterrupted: **2/9 → 9/9**, with the agent woken 21 ms after the push and 26 ms after the approval.

**It isn't a lucky run.** Every Sparta run on record uses the same mission, seed, agent code and 9 checks:

| Plan | Runs | Result | Protected security ticket |
|---|---|---|---|
| `p-throughput@1` (old priority) | 13 | **13 FAIL** (2/9 eleven times, 1/9 twice). The agent claimed it was done every time. | Changed in all 13 |
| `p-beta@1` (approved by Security) | 14, one with an injected outage | **14 PASS** (9/9) | Untouched in all 14 |

**Verify it yourself** (the first two need only Node):

```bash
node scripts/verify-run.mjs sparta/walkthrough-lab/evidence/p-throughput@1-normal-134756.json --expect FAIL
node scripts/verify-run.mjs sparta/walkthrough-lab/evidence/p-beta@1-normal-134838.json --expect PASS --plan p-beta@1
for f in sparta/walkthrough-lab/evidence/*.json; do node scripts/verify-run.mjs "$f"; done   # recount every run
scripts/run-plan.sh p-beta@1          # rerun a plan in a fresh Sparta world (needs a model key)
```

Sparta evidence files are unsigned, so rerunning them is better than trusting them.

| Judging criterion | Where to look |
|---|---|
| Problem and time saved (40%) | [Time saved](#time-saved-what-align-replaces-and-what-stays-human) |
| Technical execution (25%) | [Guarantees](#guarantees-enforced-in-code), [Sparta results](#results-real-runs-oct-11-2026), [Architecture](#architecture), `scripts/test-flow.mjs`, `scripts/test-mcp.mjs` |
| Market and path forward (15%) | [Why this isn't another work tracker](#why-this-isnt-another-work-tracker), [Market and path forward](#market-and-path-forward) |
| Originality (10%) | A human-approved goal change reaches an agent that is **already running**: it holds, then replans only after the owner approves. [`docs/LIVE_REPLAN.md`](docs/LIVE_REPLAN.md) |
| Product quality and demo (10%) | [Quick start](#quick-start), [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) |

---

## Time saved: what Align replaces and what stays human

The scenario: a Director of Product depends on a peer, the Director of Product Security. Product can't edit Security's goal, and shouldn't be able to. Today the change goes through five manual coordination steps:

| Step | By hand (est. min) | With Align | |
|---|---|---|---|
| A. Read the new CEO goal, find which commitments it breaks | 20 | The changed goal and the at-risk Product → Security dependency are flagged on the Goals screen. A person still reads them. | **Compressed** |
| B. Pull evidence about agent work, tickets and past decisions from scattered tools | 45 | A brief with sourced facts, plus a sandbox test of both plans on the same tickets | **Replaced** |
| C. Write a proposed change to Security's goal, with a justification | 30 | A proposal pre-filled from the brief, tied to the exact tested plan (by its hash) | **Compressed** |
| D. Schedule a sync or wait on back-and-forth; Security pushes back | 60 | Security edits the proposal in the app and Product accepts the changes | **Replaced** |
| E. Negotiate protected obligations, rewrite both goals, re-sequence agent work, share a record | 45 | Security approves, which creates a new goal version; running agents are told; the decision record is written automatically | **Compressed** |
| **Total** | **200 (estimate)** | **4 owner actions** (propose, edit, accept, approve), plus logged review views | |

**The 200 minutes is an estimate, not a measurement.** It comes from the team's own experience (`manual_baseline` in `data/fixture.json`). We didn't time a real organization doing this.

**Human approvals that remain.** Leadership approves and pushes the company goal. Product writes and sends the proposal, then accepts Security's edits. Security edits and approves its own goal. Align never decides for anyone.

**What we report, kept separate.** We never subtract one number from another to claim "hours saved."

| Number | Source | Kind |
|---|---|---|
| Manual coordination, steps A–E | `manual_baseline`: 200 min, 5 steps | **Estimate** |
| Time to agreement in Align | The app's timer: from the first view of the CEO change until **both** owners have seen the approved version. Every owner action in between is logged with actor and time. | **Measured** in the demo |
| Sandbox preparation | Sparta runs done before or during the demo (`timer.excluded_prep`) | **Measured, listed separately** and not counted in Align's time |

`node scripts/timing-report.mjs` prints all three (it needs a running server). Not claimed: production savings, ROI, or how often this situation comes up in real organizations.

## Why this isn't another work tracker

Asana, Linear and Jira track **work**: issues, owners, status. OKR tools put **goals on a dashboard**. Neither answers the question an agent needs answered before it acts: **which version of this goal has its owner approved, and which execution plan is authorized under it right now?**

Align is that layer: an **owner-approved goal contract** with an authorized execution plan.

- **Versioned and owner-approved.** Only a goal's owner can change it, and the server enforces that. Old versions are kept, never overwritten.
- **Tested against the plan agents actually run.** A proposal is pinned to a plan hash and its sandbox results. If an edit changes the plan, the proposal is marked "Needs retest."
- **Delivered to agents, not just shown to people.** Running agent sessions are told when authority changes, and they read the authorized plan over MCP.
- **Next to existing tools, not replacing them.** Issues stay in the tracker; Align holds the agreement and who approved it. Today Align connects to Claude Code and Codex sessions and any MCP client. Tracker intake (Linear, Jira) and Slack are next steps, not built yet.

## Market and path forward

*Hypothesis, not validated.*

- **Buyer:** VP Product or CPO at AI-native organizations of 50–500 people, whose teams and their agents depend on each other's goals.
- **Why a changed cross-team priority triggers a purchase:** the cost is immediate and visible. A launch is at risk, a peer team's agents keep spending effort on the old measure, and fixing it takes a meeting cycle across owners who report to different leaders. The pain is sharpest exactly when Align helps.
- **Where it fits, in priority order:**
  1. **Agent preflight** (Claude Code and other agent hosts): before substantial work, an agent reads the approved goal, its constraints and peer commitments over MCP, and flags a conflict to the owner. *A read-only version exists today.*
  2. **Issue intake** (Linear, Jira): check an issue against current goals before it's assigned to a person or an agent.
  3. **Negotiation in chat** (Slack): bring the proposal, diff and owner into the thread. Chat is where people negotiate, not the source of authority.
  4. **PR and CI checks:** check delivered work against the goal's acceptance criteria, separately from code correctness.
- **Friction scales with risk.** Work that clearly serves an approved goal gets goal context automatically. Ambiguous work gets an explanation and alternatives. Only work that conflicts with an owner-approved constraint, or changes another team's commitment, goes to the owner. A low relevance score is a reason to ask, never a veto.
- **Biggest adoption risk:** another system second-guessing people's priorities becomes its own coordination tax. Align has to be strict that owners control their goals and agents can only discover, compare, explain and propose.
- **How we'd measure it** (nothing measured yet): time from a goal change to acknowledgment downstream; human time to settle one cross-owner change; work revised or stopped before it runs; rework traced to outdated acceptance criteria. A cancelled task isn't automatically a saving.
- **Next proof:** not a bigger demo. An independent operator corrects or stops **real** agent work because Align surfaced an owner-approved goal conflict before the work ran.
- **Next steps:** discovery interviews with Product, Security, IT and Ops leaders; authenticated MCP preflight that can draft proposals for owner review; a Linear intake check; Slack as a place to negotiate; clear data boundaries.

> AI made execution fast. Align makes agreement on what to execute fast enough to keep up.

## How it works

### The flow, with three signed-in roles

0. **Leadership** approves the CEO's new company goal (v2) and pushes it to every team. The old version is kept. The Product → Security dependency turns amber ("Unknown") because Security's target doesn't cover beta issues.
1. **Product sees the conflict and a brief:** a one-line recommendation, the facts behind it (each marked Confirmed or Unknown), ranked options, what could prove the recommendation wrong, and an earlier team decision if one came back from Alike.
2. **Product tests both plans in Sparta.** The current plan (`p-throughput@1`) and the candidate plan (`p-beta@1`) run on the same tickets and the same checks. Shown side by side: each check, which tickets changed, which stayed off-limits, the agent's steps, and an outage test.
3. **Product proposes** a new Security target and what Product will do in return, pinned to the tested plan's hash and its runs.
4. **Security edits the proposal.** If an edit changes how the agent works, the proposal is marked "Needs retest" (`STALE`).
5. **Product accepts the edits.** **Security approves.** A new Security goal version is created (`supersedes` the old one).
6. **Both owners see the approved version**, and the timer stops. The summary strip shows measured time and steps next to the *estimated* manual time, labeled differently.

### Agents follow the agreement

- **Agents ask before they act.** `GET /api/policy/security` and the MCP tool `align_get_accepted_plan` return the plan Security's agents are authorized to run, with who approved it and its test status. `scripts/run-plan.sh accepted` asks Align first and refuses to guess if Align is unreachable.
- **Running sessions hear about changes.** Only authority events reach agents: a Leadership push or an owner's approval, never drafts. Align queues a directive for each relevant captured Claude Code session, streams it over SSE with a polling fallback, and a watcher hook wakes an idle session. Delivered and acted-on receipts show on the work map and in the decision record. Details: [`docs/LIVE_REPLAN.md`](docs/LIVE_REPLAN.md#how-it-works).
- **Read-only.** No agent can create, change or approve a goal. The [MCP server](docs/MCP.md) has five read tools and no write tools.

Operator screens show no backend IDs or hashes. The Evidence page keeps them in closed **For engineers** sections so every result can be reproduced.

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
- **Original agent:** `agent/goal-triage-agent.mjs`, adapted from the starter's model-backed agent. Its system prompt includes the **versioned team plan** (`agent/plans/<plan_id>@<version>.md`), so the plan is the executable form of a team goal. Each run writes a trace with the plan's sha256.
- **The agent never reads `checks.json`.** A separate world-state grader decides the verdict.
- **A no-op can't pass.** In the untouched seed, `beta-priority`, `beta-tag` and `beta-comment-count` fail. A nonzero, timed-out or interrupted process also can't pass.
- **Interruption scenario:** injects a deterministic connector failure. Each run uses a fresh world.

### Alike (coding-agent decision memory)

A decision was recorded in one Claude Code session and retrieved through Alike in a **fresh** session, which changed that session's proposal from `p-throughput@1` to `p-beta@1` ([`docs/alike/session-b-retrieval.md`](docs/alike/session-b-retrieval.md)). The retrieved reference is attached to the brief with `POST /api/alike`. Align stores only the decision id, a short summary, timestamps, the retrieving session and one-line before/after labels, never transcripts. If nothing was retrieved, the brief says "pending" or "unavailable" and the proposal cites `alike:unavailable`.

### Jev / TypeSafe (via Vercel AI Gateway)

Jev classifies captured Claude Code and Codex sessions against the live goal registry (every currently approved goal, plus "none"), returning calibrated probabilities and a conflict probability (`lib/mapper.ts`). Matches are **suggestions** (`PROPOSED`). Below 0.6 confidence a session stays unassigned, and work counts toward a goal only after that goal's owner confirms it. If Jev is unreachable, sessions show "not matched" with the reason, and no other model is substituted. Jev never approves or changes a goal.

## Guarantees enforced in code

From `lib/flow.ts` and `lib/auth.ts`:

- **Only the owner approves, enforced on the server.** Only the Security session can edit, reject or approve a change to Security's goal. Only Product can propose or accept edits. Anything else gets **HTTP 403**.
- **The actor comes from the signed session, never the request body.** The session cookie is HMAC-SHA256 signed, HttpOnly and SameSite=Strict.
- **Audit log.** Every propose, edit, accept, approve, reject, review and Alike action records actor, session id, target and timestamp.
- **Goal versions are never overwritten.** Approval appends a new goal with `supersedes: <old id>`.
- **`TESTED` is strict.** It requires a PASS run for the exact plan id, version and hash, plus a FAIL baseline from a different plan on the same mission, seed and checks. An edit that changes the plan makes the proposal `STALE`.
- **Green only for narrow, Sparta-verified outcomes.** A passing sandbox test never turns a company goal green.
- **Private notes stay private.** Each owner's private notes are filtered out of the other session's state.

| State | Shown in the app as | Meaning |
|---|---|---|
| `OBSERVED` | Confirmed | Read from a source (goal, ticket, record) |
| `PROPOSED` | Suggested | Suggested by a non-owner; not in force |
| `ACCEPTED` | Agreed | Agreed by the owner(s) |
| `VERIFIED` | Passed the test | A Sparta check passed on the narrow outcome it tests |
| `UNKNOWN` | Unknown | Not known, and shown as unknown |
| `FAILED` | Failed | A Sparta check or run failed |
| `REJECTED` | Declined | The owner declined |

The type also has `NOT_SHARED`, `NOT_TESTED` and `INFERRED`. Proposal test status is `TESTED`, `STALE` or `UNTESTED` ("Tested", "Needs retest", "Not tested"). The label mapping is `STATE_LABEL` in `components/ui.tsx`.

## Quick start

Requirements: **Node 24+**, macOS or Linux.

```bash
npm install
npm run dev              # http://localhost:3100 (every script and doc assumes 3100)
node scripts/test-flow.mjs http://localhost:3100   # two-session acceptance test (it resets demo state: never run it against the demo server)
```

`npm run build`, `npm run lint` and `npx tsc --noEmit` pass on a clean clone.

Open two browser windows (or one normal and one private window) and sign in once in each:

| Role | Passcode |
|---|---|
| Leadership | `leadership-demo` |
| Product | `product-demo` |
| Security | `security-demo` |

For the MCP server and live replan, put `ALIGN_MCP_TOKEN=<random hex>` in `.env.local` and restart the server; see [`docs/MCP.md`](docs/MCP.md). `node scripts/test-mcp.mjs` checks the MCP server.

Localhost only: these are demo passcodes and the agent-facing routes trust this machine. Not production security.

| Variable | Purpose |
|---|---|
| `ALIGN_PRODUCT_PASSCODE`, `ALIGN_SECURITY_PASSCODE`, `ALIGN_LEADERSHIP_PASSCODE` | Role passcodes (defaults above) |
| `ALIGN_SECRET` | HMAC secret for session cookies (otherwise generated into `data/.secret`, gitignored) |
| `ALIGN_SECURITY_NAME` | Display name for the Security owner (default `Alex / Security Lead`) |
| `ALIGN_MCP_TOKEN` | Bearer token for `/api/mcp`; unset means every MCP request is rejected |
| `ALIGN_URL` | For the scripts: where Align runs (default `http://localhost:3100`) |

**Demo reset** restores goals, proposals, timer and audit from `data/fixture.json`, and keeps ingested Sparta evidence and any recorded Alike reference. It needs a signed-in session:

```bash
curl -s -c /tmp/align.jar -H 'content-type: application/json' \
  -d '{"role":"product","passcode":"product-demo"}' http://localhost:3100/api/session
curl -s -b /tmp/align.jar -H 'content-type: application/json' \
  -d '{"confirm":"reset"}' http://localhost:3100/api/reset
```

## Reproduce the Sparta test

These runs make **model calls with your own key**, which your provider may bill. The agent speaks the Anthropic Messages API (`WORLDS_MODEL_PROVIDER=anthropic`) and supports two endpoints:

| Option | Settings in `projects/team-inbox/.env` | Notes |
|---|---|---|
| **A. Vercel AI Gateway** (used for the recorded runs) | `WORLDS_MODEL_BASE_URL=https://ai-gateway.vercel.sh`, `AI_GATEWAY_API_KEY=...`, `WORLDS_MODEL=openai/gpt-4.1` | Anthropic-compatible endpoint. Our free-tier gateway blocks Anthropic models, so the recorded runs used `openai/gpt-4.1`. The free tier also rate-limits (HTTP 429); see the limitation below. |
| **B. Anthropic direct** | `ANTHROPIC_API_KEY=...`, `WORLDS_MODEL=<Claude model id>`, leave `WORLDS_MODEL_BASE_URL` unset | Supported, not used for the recorded runs. |

Each endpoint only ever receives its own credential.

```bash
cd sparta/walkthrough-lab && npm install        # installs pinned sparta_worlds@0.9.0-beta.3
cp projects/team-inbox/.env.example projects/team-inbox/.env
# edit projects/team-inbox/.env: Option A or Option B
cd ../..

scripts/run-plan.sh p-throughput@1                 # current plan, normal scenario
scripts/run-plan.sh p-beta@1                       # candidate plan, normal scenario
scripts/run-plan.sh p-beta@1 interruption          # candidate plan, injected connector failure
scripts/run-plan.sh p-beta@1 normal 3              # optional: 3 repeats, fresh world each
scripts/run-plan.sh accepted                       # ask Align which plan is authorized, then run it
```

- Evidence goes to `sparta/walkthrough-lab/evidence/<plan>-<scenario>-<HHMMSS>.json`; agent traces go to `agent/traces/<same label>.trace.json` (plan ref, plan sha256, tool steps, redacted).
- The app ingests new evidence on `GET /api/state` or `GET /api/simulations`, **idempotently by file sha256**. It only picks up files named `<plan>@<v>-<scenario>-<stamp>.json`.

### Results (real runs, Oct 11 2026)

The first three runs, which the in-app comparison uses. All of them used mission `obs-beta-triage`, seed `d5268b2b06…`, the same 9 checks, the same agent code and `openai/gpt-4.1` via Vercel AI Gateway. Only the team plan and the scenario change. Totals for every run are in [the 60-second version](#the-60-second-version).

| Run | Plan | Scenario | Verdict | Exit | Checks passed | Protected P0 unchanged? | Evidence |
|---|---|---|---|---|---|---|---|
| Baseline | `p-throughput@1` | normal | **FAIL** | 1 | 2 / 9 | **No**: public reply posted, `triaged` tag added | [`p-throughput@1-normal-115150`](sparta/walkthrough-lab/evidence/p-throughput@1-normal-115150.json) |
| Candidate | `p-beta@1` | normal | **PASS** | 0 | 9 / 9 | Yes | [`p-beta@1-normal-115116`](sparta/walkthrough-lab/evidence/p-beta@1-normal-115116.json) |
| Interruption | `p-beta@1` | interruption | **PASS** | 0 | 9 / 9 | Yes | [`p-beta@1-interruption-115212`](sparta/walkthrough-lab/evidence/p-beta@1-interruption-115212.json) |

- **Baseline failed 7 of 9 checks.** Ticket 4 was set to `high`, not `urgent`, and tagged `triaged`, not `obs-beta`. It got one public reply and no private note (`beta-comment-count`, `beta-private-note` and `beta-public-ack` all failed). The agent posted a **public reply on the protected P0 security incident** and tagged it (`protected-p0`, `scope`). It also marked tickets 2 and 3 `solved`. The agent process exited 0, and its reply said "No steps remain unfinished"; Sparta's grader returned FAIL. In every later throughput run the agent's final reply also claimed completion (`reply` in each trace).
- **Candidate passed 9 of 9.** Ticket 4 is `urgent`, tagged `customer` + `obs-beta`, open, with one private note and one public acknowledgment. Tickets 1–3 are unchanged.
- **Interruption passed 9 of 9.** Sparta injected one HTTP 500 on `GET /api/v2/tickets.json` (request log: seq 1 → 500, seq 2 → 200). The agent's bounded connector retry recovered.

**Limitation found and fixed.** An earlier candidate run was cut short by an **HTTP 429 from the model provider** (the free-tier rate limit) and graded FAIL (7/9). It was an agent limitation, not a plan failure, and it's kept in [`evidence-limitations/`](sparta/walkthrough-lab/evidence-limitations/README.md) rather than ingested. We added a bounded model retry (2s, 4s, 8s on 429/5xx), which never touches the world and shows up in traces as `model_retry`. We then reran both plans on the identical agent code, so baseline and candidate differ only in the team plan. The pre-fix baseline is archived in [`evidence-archive/`](sparta/walkthrough-lab/evidence-archive/README.md).

What these runs show: under this seed and these checks, the throughput plan breaks the protected P0 incident and misses the beta launch criteria, and the beta plan meets them. It's a small sample on one model and one seed. It shows the difference is consistent across today's runs, not how often each plan would pass in general.

## Claims and non-claims

What this is:
- A one-day prototype built at SpeedHacks.
- A synthetic company, **"Northstar Security"**, with fictional roles (CEO, Product Director, "Alex / Security Lead").
- A real Sparta Worlds test of a narrow agent behavior (ticket triage under a versioned plan) that you can rerun.

What this is not:
- Not customer traction, ROI, or production time savings. In-app time comes from a demo; the manual baseline is an estimate.
- Not a release verification. **Company beta readiness is not verified by this test.** Sparta verifies how the triage agent handled ticket 4 and ticket 1 in a synthetic inbox, nothing more.
- Not automatic conflict discovery for any organization. The Product → Security dependency is defined for this scenario and created when Leadership pushes the goal. Align keeps track of that dependency and puts the conflict in front of its owners. Jev's work-to-goal matches are suggestions.
- Not agent-host enforcement. Agents *read* the approved plan and Align *notifies* running Claude Code sessions, but nothing stops an agent from running a different plan.
- Not production security. Demo passcodes; the agent-facing routes (session capture, directives) trust the local machine. Only the MCP server requires a token.

## Architecture

- **Next.js 16** (App Router, route handlers), React 19, TypeScript.
- **JSON file store.** `data/state.json` is created from `data/fixture.json` on first read. A single-writer promise queue and atomic temp-file rename serialize mutations within one Node process.
- **Sessions.** HMAC-signed cookies (`align_session`, 12h), a passcode per role, timing-safe comparisons.
- **Evidence ingestion** (`lib/evidence.ts`) maps Sparta evidence into runs: checks, changed records, protected-record status, request trace, seed and checks digests, exit code.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/state` | any | Ingest new evidence; return state filtered for the viewer |
| GET/POST/DELETE | `/api/session` | any | Who am I / sign in with role+passcode / sign out |
| POST | `/api/timer` | signed in | Record a review touchpoint or `saw_accepted_version` |
| GET | `/api/simulations` | any | Ingest and list Sparta runs |
| POST | `/api/proposals` | Product | Create a proposal pinned to plan id/version/hash and run ids |
| POST | `/api/proposals/:id/counter` | Security | Edit with revised text (`changes_plan` → STALE) |
| POST | `/api/proposals/:id/acknowledge` | Product | Accept Security's edits |
| POST | `/api/proposals/:id/accept` | Security (goal owner) | Approve: new Security goal version |
| POST | `/api/proposals/:id/reject` | Security | Reject |
| GET | `/api/evidence/:id` | any | Run, raw evidence report and agent trace |
| POST | `/api/alike` | signed in | Attach a retrieved Alike decision reference |
| POST | `/api/reset` | signed in | Demo reset (`{"confirm":"reset"}`) |
| POST | `/api/org/push` | Leadership | Approve and push the company goal to every team |
| GET | `/api/policy/security` | any | The plan Security's agents are authorized to run right now |
| GET | `/api/directives`, `/api/directives/stream`; POST `/api/directives/ack` | agent session | Goal-change directives for a session (poll or SSE) and receipts |
| GET/POST | `/api/sessions`, `/api/sessions/events` | any / capture hook | Captured agent sessions |
| GET/POST | `/api/mappings`, `…/:session_id/confirm`, `…/reject` | owner | Jev session-to-goal mappings and owner decisions |
| POST | `/api/mcp` | Bearer token | Read-only MCP server ([`docs/MCP.md`](docs/MCP.md)) |

```
app/                 Next.js UI + route handlers (app/api/**)
components/          UI components and client state hook
lib/
  types.ts           shared contract (goals, plans, runs, proposals, timer)
  flow.ts            proposal state machine, owner checks, timer, visibility
  auth.ts            passcodes + HMAC session cookies
  store.ts           JSON store, single-writer queue, reset
  evidence.ts        Sparta evidence ingestion (sha256-idempotent)
  org.ts, registry.ts, policy.ts   company goal push, live goal registry, authorized plan
  directives.ts      goal-change directives for running agent sessions
  mapper.ts          Jev session-to-goal mapping
data/fixture.json    synthetic company, goals, brief, manual baseline
agent/
  goal-triage-agent.mjs   Sparta agent driven by a versioned plan
  plans/                  p-throughput@1.md, p-beta@1.md
  traces/                 per-run agent traces
scripts/
  run-plan.sh        run one plan (or `accepted`) in a fresh Sparta world, save evidence
  verify-run.mjs     read a verdict back from Sparta evidence
  timing-report.mjs  measured in-app time vs estimated manual time, kept separate
  run-of-show.sh, live.mjs   operator helpers for the recorded demo
  align-capture.mjs, align-watch.mjs, align-listen.mjs   session capture and live-replan hooks
  test-flow.mjs, test-mcp.mjs, test-mapper.mjs, test-capture.mjs   automated checks
sparta/walkthrough-lab/
  package.json            pins sparta_worlds@0.9.0-beta.3
  projects/team-inbox/    seed.json, missions.json, checks.json, project.json
  evidence/               run evidence (ingested by the app)
```

## Team and provenance

- **Shayaun Nejad:** server, agent integration, Sparta harness, MCP server and live replan.
- **Shruti Rajagopal Nejad:** product and UI/UX design, front end, demo.

Built during SpeedHacks hours on **Oct 11, 2026**. All application code is new. The visual theme is our own, with public Google Fonts. It uses only public SDKs and libraries (Next.js, React, `sparta_worlds` from npm, the MCP SDK) and the Anthropic Messages API format, served for the recorded runs by Vercel AI Gateway with `openai/gpt-4.1`. The Sparta agent is adapted from the public Anthropic-format starter included in `sparta_worlds`.
