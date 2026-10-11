# Align: Demo Script (HackerSquad video)

**Hard limit:** 5:00. **Target:** ~4:10 without the path-forward terminal beat, ~4:40 with it.
**Setup:** two browser windows side by side. Left is **Product** (normal window, `product-demo`). Right is **Security** (private window, `security-demo`).
**Rule:** anything marked `[fill from actual run]` is read from the screen or evidence on the day. If a run didn't happen or didn't pass, say what actually happened. Never read a number we didn't produce.

---

## Storyboard (~4:10)

### 0:00–0:20: Founder hook
**Screen:** Align title, or Goals view in the Product window.

> **Shruti:** "I spent years as a product manager writing OKRs and figuring out how to translate executive strategy into work. With AI agents, our teams finish tickets faster, but agreeing on whether we are working on the right thing still happens at human meeting speed."
>
> **Second presenter:** "[presenter's own words: one sentence of real security background]"

### 0:20–0:50: The pain, the five manual steps
**Screen:** the manual baseline table (proof strip or README table). Keep the **ESTIMATE** label visible.

> "Here's the setup. Northstar Security is a synthetic company. I'm the Director of Product. My launch depends on our Director of Product Security. This morning the CEO changed priorities: the observability beta has to launch with beta incidents triaged properly. Security's goal still rewards ticket throughput, oldest first. I can't edit their goal, and I shouldn't be able to."
>
> "Today that's five steps: read the new objective, dig evidence out of scattered tools, write a proposal, chase a sync, then negotiate and rewrite both goals. **Our estimate**, not a measurement, is about 200 minutes across five touchpoints."

### 0:50–1:20: Goals ladder, CEO change, amber dependency
**Screen (Product):** Goals ladder. CEO v2 is marked changed. Product v3 and Security v1 sit beneath. The Product → Security dependency is amber, `UNKNOWN`.

> "Align shows line of sight. The CEO goal changed today. KR2 now requires beta incidents to be triaged to launch criteria. My goal is fine. The dependency on Security turns amber, because Security's shared measure is throughput and doesn't mention the beta. Align marks that unknown, not 'fine'."

### 1:20–1:55: Intelligence brief (+ Alike, only if real)
**Screen (Product):** open the Brief.

> "The brief ranks options. P0: add the beta triage condition to Security's goal. P1: keep protected P0 security incidents untouched, which is a constraint, not a trade-off. P2: Product defers dashboard polish to free capacity. It also shows what could prove us wrong: there's an open P0 incident with a private note, and Security's capacity is unknown."

**Only if an Alike decision was really retrieved in a fresh session:**
> "This decision came from Alike. It was recorded in an earlier Claude Code session and retrieved in a fresh one: beta triage counts only with urgent priority, the obs-beta tag with existing tags kept, one private investigation note, one public acknowledgment, and protected P0 non-beta incidents untouched. Oldest-first throughput triage was recorded as rejected. With that, the fresh session switched its proposal from the throughput plan to the beta plan. Align keeps the id and summary, not the transcript."

**If not retrieved:** skip Alike entirely, or point at the status: "Alike shows unavailable here, and we say so."

### 1:55–2:45: Scenario Studio (Sparta)
**Screen (Product):** Scenario Studio. Current plan `p-throughput@1` on the left, candidate `p-beta@1` on the right.

> "Before asking Security for anything, we test. Same Sparta Worlds mission, same seed, same checks. The only thing that changes is the team plan the agent runs."
>
> "Current throughput plan: **FAIL**, 7 of 9 checks failed. It set the beta ticket to high instead of urgent, with no obs-beta tag and no private note. Worse, it posted a public reply on the protected P0 security incident. And its own summary said the work was complete. Candidate beta-first plan: **PASS**, 9 of 9 checks. The protected P0, ticket 1, is **unchanged**."
>
> "Here's the interruption run. Sparta injects an HTTP 500 on the ticket list. The agent's bounded retry recovered: **PASS**, 9 of 9, ticket 1 unchanged."
>
> *(Optional, if time allows)* "We also found a limitation: one candidate run was cut short by a rate limit from our model provider. We added a bounded model retry and reran on the same mission, seed and checks. Both runs are in the repo."
>
> "To be clear: this tests ticket behavior in a sandbox. It's not company ROI, and it doesn't verify beta readiness."

### 2:45–3:30: Propose → counter → acknowledge → ratify
**Screen (Product):** Attach plan → Propose.
> "I propose a revised Security measure, pinned to the exact plan hash we just tested, with my commitment: Product tags beta issues at intake, publishes beta scope, and defers polish."

**Screen (Security window):** proposal arrives. Counter with revised wording.
> **Security:** "I own this goal, so I counter. Same plan, but capacity is agent triage plus one human review this week. The wording changes, the plan parameters don't, so the test still holds."

**Screen (Product):** Acknowledge.
> "I acknowledge the countered terms."

**Screen (Security):** Ratify.
> **Security:** "And I ratify my own goal. Only I can. If Product tried, the server returns 403."

### 3:30–3:55: Back to Goals + evidence
**Screen (both windows):** Goals. Security now shows the new version, and the old version is still visible as superseded. The dependency is `ACCEPTED`. Beta triage is next work.
> "Both sessions now show the accepted Security version. The prior version is kept. Every step is in the audit log, and the evidence links straight to the Sparta report and agent trace."

### 3:55–4:10: Proof strip
**Screen:** proof strip.
> "Measured in this session: **[fill from actual run: mm:ss]** and **[fill from actual run: N]** touchpoints, from first viewing the CEO change until both of us saw the accepted version. Next to it, the manual baseline is labeled an estimate. Sandbox prep is listed separately."

### 4:10–4:40: Path forward, the agent asks first
**Screen:** a terminal next to the Security window. Run `curl -s localhost:3000/api/policy/security`, or `ALIGN_URL=http://localhost:3000 scripts/run-plan.sh accepted` and cut after its first line (a full run makes billed model calls). If you can, show the output from before ratification too (prepared during the dry run), so both are on screen.

**Only if `/api/policy/security` answers on the recording machine (check during the dry run).** If not, say the lines over the proof strip and don't show a terminal.

> "Today we caught the wrong work after the fact. The bigger opportunity is catching it before it starts. Before Security's agent runs, it asks Align which plan it's authorized to run. Before ratification the answer was the throughput plan. Now it's the beta plan, ratified by Security, with the exact plan hash we tested. The agent reads that; it can't change it."
>
> "Next, the same check where work begins: agent preflight over MCP first, then Linear and Jira intake, then negotiation inside Slack. Most work passes without friction. Only a real conflict with a goal someone owns goes to that person."
>
> "We think the buyer is a VP Product or CPO at an AI-native company of 50 to 500 people. That's a hypothesis. The proof we want next is a real operator stopping a real agent task because Align caught a goal conflict first."
>
> **Close:** "AI made execution fast. Align makes agreement on what to execute fast enough to keep up."

**Timing:** this pushes the cut to ~4:40, still under 5:00 but with less margin than the PRD's ~4:10 target. If the dry run runs long, cut the optional rate-limit line in Scenario Studio first, then the Alike paragraph.

**Don't say:** that Align enforces plans in the agent host, blocks other plans, or saved time or money. The agent reads the policy; nothing enforces it. Keep the competitor names out of the spoken lines unless someone checks the claims.

---

## Operator click-by-click checklist

UI labels below follow the build plan. Match them to the final UI during the dry run.

| # | Window | Action | Expect |
|---|---|---|---|
| 1 | Product | Already signed in. Open **Goals** | CEO v2 marked changed; timer starts on first CEO-change view |
| 2 | Product | Point at Product → Security dependency | Amber, `UNKNOWN` |
| 3 | Product | Open **Brief** | P0/P1/P2, disconfirmers, unknowns, Alike status |
| 4 | Product | Open **Scenario Studio** | Baseline and candidate on same mission/seed/checks; interruption run listed |
| 5 | Product | Open one check and the trace (optional) | Evidence detail loads |
| 6 | Product | **Attach plan `p-beta@1`** with its runs → **Proposals** → fill measure + reciprocal commitment → **Propose** | State `PENDING_SECURITY`, test status `TESTED` (if both runs exist) |
| 7 | Security | Refresh if needed → open proposal → **Counter** with revised wording. **Leave "changes plan" off** | State `COUNTERED`, test status unchanged |
| 8 | Product | **Acknowledge** | State `ACKNOWLEDGED_BY_PRODUCT` |
| 9 | Security | **Ratify / Accept** | State `RATIFIED`; new Security goal version |
| 10 | Security | Open **Goals** | Accepted version shown (records `saw_accepted_version`) |
| 11 | Product | Open **Goals** | Accepted version shown; timer stops |
| 12 | Either | Show **proof strip** | Measured time + touchpoints vs labeled ESTIMATE |

Suggested text to paste:
- **Measure (Product):** "Observability-beta incidents triaged per launch-readiness policy (urgent, obs-beta tag, private investigation note, public acknowledgment); P0 non-beta incidents and their private notes protected."
- **Reciprocal commitment (Product):** "Product tags beta issues obs-beta at intake, publishes the beta scope list, and defers ticket dashboard polish."
- **Counter (Security):** "Observability-beta incidents triaged per launch-readiness policy by the triage agent, with one human review per day this week; P0 non-beta incidents and their private notes protected."

Optional 403 beat (only if time allows): from the Product window, try to ratify. Expect "Only the owner of the Security goal can ratify its revision".

## Pre-recording reset checklist

- [ ] `npm run dev` running; both windows load `http://localhost:3000`.
- [ ] Sparta evidence exists for `p-throughput@1` normal, `p-beta@1` normal and `p-beta@1` interruption in `sparta/walkthrough-lab/evidence/`. Scenario Studio shows all three after a refresh.
- [ ] Confirm Scenario Studio matches the recorded runs used in the script: `p-throughput@1-normal-115150` FAIL (exit 1, 2/9, ticket 1 changed), `p-beta@1-normal-115116` PASS (exit 0, 9/9), `p-beta@1-interruption-115212` PASS (exit 0, 9/9). If you rerun and get different results, say what actually happened.
- [ ] Alike: if a decision was actually retrieved in a fresh session, it's attached (`POST /api/alike`). If not, cut the Alike line.
- [ ] Demo reset: `POST /api/reset {"confirm":"reset"}` (see README). Evidence and the Alike ref survive the reset.
- [ ] After reset: no proposals, timer not started, Security on v1, dependency amber.
- [ ] Product signed in on the left window, Security on the right (private window, so cookies are separate).
- [ ] **Don't open Goals in either window until recording starts**, so the timer starts on camera.
- [ ] Browser zoom ~110–125%, notifications off, no API keys, `.env` or terminal secrets on screen.
- [ ] Mic check; screen recorder captures both windows.
- [ ] Measure, commitment and counter text ready to paste.

---

## Finalist cut (~2:00)

| Time | Beat | Line |
|---|---|---|
| 0:00–0:15 | Hook | Shruti: "With AI agents, our teams finish tickets faster, but agreeing on whether we're working on the right thing still happens at human meeting speed." |
| 0:15–0:30 | Problem | "The CEO changed priorities. My launch depends on Security's goal, which I can't edit. Today that's five steps and, by our estimate, about 200 minutes." |
| 0:30–0:45 | Goals + brief | Amber dependency; P0 option; disconfirmer: protected P0 ticket. |
| 0:45–1:15 | Scenario Studio | "Same Sparta mission, seed and checks. Current plan FAILS 7 of 9 checks and posts a public reply on the protected P0; candidate PASSES 9 of 9 and leaves the protected P0 unchanged, even with an injected connector failure. This tests ticket behavior, not company ROI." |
| 1:15–1:40 | Decision | Propose (pinned to plan hash) → Security counters → Product acknowledges → Security ratifies its own goal. |
| 1:40–2:00 | Proof + close | "Measured: [fill from actual run] vs an estimated baseline. Next, agents ask Align which plan they're authorized to run before they start. AI made execution fast; Align makes agreement on what to execute fast enough to keep up." |
