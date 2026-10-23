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
**Screen:** the README table (the "Doing it by hand · estimate" tile only appears in the summary strip on **Goals** once the teams agree). Keep the word **estimate** visible.

> "Here's the setup. Northstar Security is a made-up company. I'm the Director of Product. My launch depends on our Security Lead. This morning the CEO changed priorities: the beta of our new monitoring product has to launch with beta customers' issues handled first. Security's goal still rewards closing as many tickets as possible, oldest first. I can't edit their goal, and I shouldn't be able to."
>
> "Today that's five steps: read the new goal, dig facts out of scattered tools, write a proposal, chase a meeting, then negotiate and rewrite both goals. **Our estimate**, not a measurement, is about 200 minutes across five steps."

### 0:50–1:20: How the goals connect, the CEO change, the amber card
**Screen (Product):** **Goals** in the left rail (Everything selected). The CEO's goal (v2) shows "KR2 changed today". Product v3 and Security v1 sit beneath, Security's target marked "Clashes with KR2". The "Product → Security" link between them reads "Unknown". The Details panel on the right shows "Where the goals clash": Security's current target (v1) next to the CEO's new requirement.

> "Align shows how the goals connect. The CEO's goal changed today: beta customers' issues now have to be handled first. My goal is fine. But my launch needs Security, and that card turns amber, because Security's target is still 'close as many tickets as possible' and doesn't mention the beta. Align marks that unknown, not 'fine'."

### 1:20–1:55: "What to do next" (+ Alike, only if real)
**Screen (Product):** in the Details panel ("Product needs Security"), click **Review the conflict with Security**.

> "Align suggests options, in order, and I choose. First: add 'handle beta issues first' to Security's goal. Second: keep the critical security ticket off-limits, which is a rule, not a trade-off. Third: Product postpones dashboard polish to free up time. It also shows what could prove us wrong: there's an open critical security ticket with a private note, and we don't know how much time Security has."

**Only if an Alike decision was really retrieved in a fresh session:**
> "This earlier team decision came from Alike, our AI-agent memory tool. It was saved in an earlier Claude Code session and found again by a fresh one: a beta issue only counts as handled when it's marked urgent, tagged as beta, gets a private note for engineers and a reply to the customer, and the critical security ticket stays untouched. Handling tickets oldest first was recorded as rejected. With that, the fresh session switched from the oldest-first plan to the beta-first plan. Align keeps a short summary, not the conversation."

**If not retrieved:** skip Alike entirely, or point at the status: "Alike shows 'not available' here, and we say so."

### 1:55–2:45: Which plan follows the new priority? (Sparta practice test)
**Screen (Product):** **Goals** → **See ways forward** → **Test in Scenario Studio**. The baseline (`p-throughput@1 · current`) and the candidate (`p-beta@1`) run against the same Sparta mission, seed and checks; pick **p-beta@1 + interruption** for the outage test. Read the pass counts off the cards (the latest baseline run on record shows **FAIL · 1 / 9**; older runs showed 2 / 9).

> "Before asking Security for anything, we test. This is a practice test in Sparta, a sandbox with sample tickets. Same practice tickets, same pass/fail checks. The only thing that changes is the plan the AI agent follows."
>
> "Current plan, oldest tickets first: **Failed**, only **[fill from actual run: N]** of 9 checks passed. It marked the beta customer's issue 'high' instead of 'urgent', didn't tag it as beta, and left no note for engineers. Worse, it posted a public reply on the critical security ticket it was supposed to leave alone. And the agent's own summary said everything was done. New plan, beta issues first: **Passed**, 9 of 9 checks. The critical security ticket was **left alone**."
>
> "Here's the outage test. Sparta makes the ticket system fail mid-run on purpose. The agent retried safely and recovered: **Passed**, 9 of 9, the critical security ticket untouched."
>
> *(Optional, if time allows)* "We also hit a limit: one run of the new plan was cut short because our AI provider throttled us. We added a careful retry and ran it again on the same practice tickets and checks. Both runs are in the repo."
>
> "To be clear: this checks how tickets get handled on sample tickets. It doesn't predict the launch or any business result."

### 2:45–3:30: Propose → Security asks for changes → Product accepts → Security approves
**Screen (Product):** in Scenario Studio, **Attach to proposal** → **Send proposal to Alex / Security Lead**.
> "I propose a new target for Security, tied to the exact plan we just tested, plus what Product will do in return: tag beta issues as they come in, publish what's in the beta, and postpone the dashboard polish."

**Screen (Security window):** **Your turn** → **Review the proposal**. Choose **Counter**, then **Ask for changes**.
> **Security:** "I own this goal, so I ask for a change. Same plan, but this week we can only do the AI agent plus one human review a day. The wording changes, how the agent works doesn't, so the test still counts."

**Screen (Product):** **Your turn** → **Review the changes** → **Accept Security's changes and confirm what Product will do**.
> "I accept Security's changes."

**Screen (Security):** **Your turn** → **Review and approve** → **Approve the change to my goal**.
> **Security:** "And I approve the change to my own goal. Only I can. If Product tried, Align would refuse."

### 3:30–3:55: Back to Goals + evidence
**Screen (both windows):** **Goals**. Security now shows the new version (v2), and the old version is kept. The "Product → Security" link shows it is agreed. Then **Decisions** → **Agreement reached** opens the decision record (tabs: Summary, Receipts, How to read this).
> "Both of us now see the agreed Security goal. The old version is kept. Every step is recorded in the decision record, under Receipts, with the full practice-test results one click away."

### 3:55–4:10: Summary strip
**Screen:** the summary strip on **Goals** (or the decision record's "In Align · measured" tile).
> "Measured in this session: **[fill from actual run: mm:ss]** and **[fill from actual run: N]** steps, from first seeing the CEO's change until both of us saw the agreed goal. Next to it, doing it by hand is labeled an estimate. The practice tests we ran beforehand are listed separately and not counted."

### 4:10–4:40: Path forward, the agent asks first
**Screen:** a terminal next to the Security window. Run `curl -s localhost:3100/api/policy/security`, or `scripts/run-plan.sh accepted` and cut after its first line (a full run makes billed model calls). If you can, show the output from before Security approved too (prepared during the dry run), so both are on screen.

**Only if `/api/policy/security` answers on the recording machine (check during the dry run).** If not, say the lines over the summary strip and don't show a terminal.

> "Today we caught the wrong work after the fact. The bigger opportunity is catching it before it starts. Before Security's agent runs, it asks Align which plan it's allowed to run. Before Security approved, the answer was the oldest-first plan. Now it's the beta-first plan, approved by Security, exactly the version we tested. The agent reads that; it can't change it."
>
> "Next, the same check where work begins: agent preflight over MCP first, then Linear and Jira intake, then negotiation inside Slack. Most work passes without friction. Only a real conflict with a goal someone owns goes to that person."
>
> "We think the buyer is a VP Product or CPO at an AI-native company of 50 to 500 people. That's a hypothesis. The proof we want next is a real operator stopping a real agent task because Align caught a goal conflict first."
>
> **Close:** "AI made execution fast. Align makes agreement on what to execute fast enough to keep up."

**Timing:** this pushes the cut to ~4:40, still under 5:00 but with less margin than the PRD's ~4:10 target. If the dry run runs long, cut the optional throttling line in "Which plan follows the new priority?" first, then the Alike paragraph.

**Don't say:** that Align enforces plans in the agent host, blocks other plans, or saved time or money. The agent reads the policy; nothing enforces it. Keep the competitor names out of the spoken lines unless someone checks the claims.

---

## Operator click-by-click checklist

UI labels below match the v6 app (PR #7 at a54570f plus the follow-up fix PR), taken from the click path in `scripts/autopilot.mjs`. Re-check them during the dry run.

| # | Window | Action | Expect |
|---|---|---|---|
| 1 | Product | Sign in on camera. **Your turn** opens; then **Goals** | Your turn shows the CEO's change (this starts the clock); Goals shows CEO goal v2 "KR2 changed today" |
| 2 | Product | Point at the **Product → Security** link and the Details panel | "Unknown"; "Where the goals clash" |
| 3 | Product | Details → **Review the conflict with Security** | Three options in order, "What could prove this wrong", "What we don't know yet", earlier team decision (Alike) |
| 4 | Product | **Goals** → **See ways forward** → **Test in Scenario Studio** | Baseline FAIL, candidate PASS 9 / 9, same mission, seed and checks; **p-beta@1 + interruption** for the outage test |
| 5 | Product | Open a run's checks (optional) | The nine checks, passed or failed |
| 6 | Product | **Attach to proposal** → proposal form (text is pre-filled) → **Send proposal to Alex / Security Lead** | "Waiting for Security", "Tested" (if both runs exist) |
| 7 | Security | **Your turn** → **Review the proposal** → **Counter** → **Ask for changes**. **Leave "These changes alter how the agent works" unticked** | "Security asked for changes"; still "Tested" |
| 8 | Product | **Your turn** → **Review the changes** → **Accept Security's changes and confirm what Product will do** | "Product accepted changes" |
| 9 | Security | **Your turn** → **Review and approve** → **Approve the change to my goal** | "Approved"; new Security goal version (v2) |
| 10 | Security | Open **Goals** | Agreed version shown |
| 11 | Product | Open **Goals** | Agreed version shown; the clock stops |
| 12 | Either | Show the **summary strip** on Goals, or **Decisions** → **Agreement reached** | Measured time and steps next to the labelled estimate; the record's "In Align · measured" tile |

The proposal form is pre-filled with this text (paste only if it was cleared):
- **New target for Security (Product):** "Beta customers' issues are handled first: marked urgent, tagged as beta, a private note for engineers, and a reply to the customer. The critical security ticket is not touched"
- **What Product will do in return:** "Product will tag every beta issue as beta when it comes in and publish exactly what is in the beta by Wednesday. Product will postpone the ticket dashboard polish."
- **Ask for changes (Security):** the form adds ", and its private notes stay untouched too" to the target. To show the capacity trade-off instead, write: "Beta customers' issues handled first by the AI agent, with one human review a day this week; the critical security ticket and its private notes stay untouched."

Optional "only the owner can approve" beat (only if time allows): while the proposal waits on Security, Product's proposal page shows **Try to approve (only Security can)**. Click it. Expect "Handed back: only Security can approve this" (the server's 403), with nothing changed.

## Pre-recording reset checklist

- [ ] `npm run dev` running; both windows load `http://localhost:3100`.
- [ ] Sparta evidence exists for `p-throughput@1` normal, `p-beta@1` normal and `p-beta@1` interruption in `sparta/walkthrough-lab/evidence/`. "Which plan follows the new priority?" shows all three after a refresh.
- [ ] Confirm "Which plan follows the new priority?" matches the recorded runs used in the script: `p-throughput@1-normal-115150` FAIL (exit 1, 2/9, ticket 1 changed), `p-beta@1-normal-115116` PASS (exit 0, 9/9), `p-beta@1-interruption-115212` PASS (exit 0, 9/9). If you rerun and get different results, say what actually happened.
- [ ] Alike: if a decision was actually retrieved in a fresh session, it's attached (`POST /api/alike`). If not, cut the Alike line.
- [ ] Demo reset: open Align with `?ops` and click **Start the demo over** in the header (then **Click again to reset**), or `POST /api/reset {"confirm":"reset"}` (see README). Test results and the Alike decision survive the reset.
- [ ] After reset: no proposals, clock not started, Security on v1, the "Product → Security" link "Unknown".
- [ ] Product signed in on the left window, Security on the right (private window, so cookies are separate).
- [ ] **Don't sign in to either window until recording starts.** Since v6 the clock starts the first time a team's **Your turn** shows the CEO's change, so signing in early starts it off camera.
- [ ] Browser zoom ~110–125%, notifications off, no API keys, `.env` or terminal secrets on screen.
- [ ] Mic check; screen recorder captures both windows.
- [ ] Proposal text is pre-filled; backup copies of the target, commitment and change request ready to paste.

---

## Finalist cut (~2:00)

| Time | Beat | Line |
|---|---|---|
| 0:00–0:15 | Hook | Shruti: "With AI agents, our teams finish tickets faster, but agreeing on whether we're working on the right thing still happens at human meeting speed." |
| 0:15–0:30 | Problem | "The CEO changed priorities. My launch depends on Security's goal, which I can't edit. Today that's five steps and, by our estimate, about 200 minutes." |
| 0:30–0:45 | Goals + what to do next | Amber "Product needs Security" card; first option: add "beta issues first" to Security's goal; what could prove it wrong: the critical security ticket. |
| 0:45–1:15 | Which plan follows the new priority? (open the drawer for the outage line) | "Same practice tickets, same checks. The current plan fails, only 2 of 9 checks pass, and it posts a public reply on the critical security ticket; the new plan passes 9 of 9 and leaves that ticket alone, even when the ticket system fails mid-run. This checks ticket handling, not business results." |
| 1:15–1:40 | Decision | Propose (tied to the tested plan) → Security asks for changes → Product accepts → Security approves its own goal. |
| 1:40–2:00 | Proof + close | "Measured: [fill from actual run] vs an estimated baseline. Next, AI agents ask Align which plan they're allowed to run before they start. AI made execution fast; Align makes agreement on what to execute fast enough to keep up." |
