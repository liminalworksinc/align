# Align: Demo Script (HackerSquad video)

**Hard limit:** 5:00. **Target:** ~4:15.
**Setup:** `scripts/run-of-show.sh` opens three browser windows (Leadership `leadership-demo`, Product `product-demo`, Security `security-demo`) and a tmux pane for the Claude Code operator session and the Align event stream. Server: `http://localhost:3100`.
**Rule:** anything marked `[fill from actual run]` is read from the screen or evidence on the day. If a run didn't happen or didn't pass, say what actually happened. Never read a number we didn't produce.

---

## Storyboard (~4:15, recorded in HackerSquad's recorder)

HackerSquad asks for three beats: **the problem**, **the tech stack and what it made possible**, then a **live demo plus the code**. This order follows them, shows the result in the first 30 seconds (per the pre-submission review), and ends on the agent replanning by itself.

**Screen layout:** browser windows for Leadership, Product and Security (`scripts/run-of-show.sh` opens them), plus the tmux pane with the Claude Code operator session (top) and the Align event stream (bottom). Camera on.
**Before recording:** `scripts/run-of-show.sh operator` has already run once: Claude ran the authorized plan (`p-throughput@1`, Sparta FAIL) and is on standby. Don't type to Claude during the take.

### Beat 1 · The problem (0:00–0:55)

**0:00–0:25 · Value first.** Screen: Next decision (or Test both plans), with the two results side by side.
> **Shruti:** "The company's goal changed. The agent's plan didn't. Our CEO now needs beta customers' issues handled first. Security's AI agent is still closing tickets oldest first. In a sandbox it fails 7 of 9 checks, and it posts a public reply on a protected security incident, then reports the job as done. The plan Security should be running passes 9 of 9."
>
> "I spent years as a product manager turning executive strategy into OKRs. With AI agents, teams finish tickets faster, but agreeing on the right work still happens at meeting speed."
>
> **Sean:** "[one sentence of his real security background]"

**0:25–0:55 · Why it matters.** Screen: the summary strip or README table, with **ESTIMATE** visible.
> "I'm Product. I can't edit Security's goal, and I shouldn't be able to. Today fixing this takes five steps: read the new goal, dig up evidence, write a proposal, chase a meeting, renegotiate both goals. **Our estimate**, not a measurement, is about 200 minutes. Align makes it one decision the owners make, and the agents follow."

### Beat 2 · Tech stack and what it enabled (0:55–1:25)

Screen: README "For judges" section, or a simple list. About 6 seconds each.
> "**Sparta Worlds** let us prove behavior, not describe it: the same practice tickets and the same nine checks for both plans. Eight runs each: the old plan failed every time, the new one passed every time."
>
> "**Claude Code and MCP**: agents ask Align which plan they're authorized to run, and running sessions get told when an owner approves a change."
>
> "**Alike** carried a team decision from one coding session into a fresh one. **Jev** matches agent sessions to goals, and the goal's owner confirms."
>
> "Next.js and TypeScript for the app. Without Sparta we'd only have a claim; without MCP the agreement would stay in a web page."

### Beat 3 · Live demo (1:25–3:25)

**1:25–1:45 · Leadership pushes the new goal.** Leadership window → Company goal → **Approve and send to teams**. Point at the tmux top pane.
> "Leadership approves the new company goal. Watch the agent: Align tells it within a second. It sees the conflict and **holds**. It doesn't rewrite its own plan, because Security owns it."

**1:45–2:00 · Where agent work is going.** Leadership → Work.
> "Align checks the running agent sessions against the new goals. This oldest-first session may now work against the goal."

**2:00–2:30 · Product tests both plans.** Product window → Goals → "Product needs Security" → See what to do next → Test both plans.
> "Same practice tickets, same nine checks, only the plan changes. Old plan: 2 of 9, critical security ticket touched. New plan: 9 of 9, critical ticket untouched."

**2:30–3:05 · Two owners agree.** Product: Add test results → Send proposal. Security: Proposals → Ask for changes. Product: Accept Security's changes. Security: Approve the change to my goal.
> "I propose, with the test attached. Security owns this goal, so Alex asks for one change, and I accept it. Only Security can approve. If I tried, the server returns 403."

**3:05–3:25 · The climax: the agent follows the people.** Point at the tmux panes. Nobody types.
> "Security just approved. Align tells the agent within milliseconds. It wakes, reads the newly approved plan from Align, runs it… **9 of 9**, critical ticket untouched. Nobody prompted the agent. The people who own the goal changed it, and the agent followed."

**If the live agent doesn't fire in the take:** don't fake it. Open `docs/LIVE_REPLAN.md` and say: "Here's the same sequence recorded uninterrupted earlier today: 2 of 9, hold, approval, 9 of 9."

### Beat 3, continued · The code (3:25–3:50)

Show the code for about 8 seconds each, zoomed to 18px or more.
1. `lib/flow.ts` lines 165–174: `if (who.actor !== target.owner_id) forbid("Only Security can approve changes to Security's goal")`, and stale test evidence can't silently become "tested".
   > "Ownership is enforced on the server, not in the UI."
2. `lib/policy.ts` line 16, `acceptedPlan`:
   > "This is what agents read: the latest plan the owner approved, with who approved it and its test status."
3. Terminal: `node scripts/verify-run.mjs sparta/walkthrough-lab/evidence/p-beta@1-normal-134838.json --expect PASS --plan p-beta@1`
   > "And anyone can re-check a verdict from Sparta's evidence."

### Close (3:50–4:15)

Screen: the summary strip, or `node scripts/timing-report.mjs`.
> "Measured in Align today: **[fill from actual run: mm:ss]** and **[fill from actual run: N]** human decisions. Sandbox prep is listed separately. The 200 minutes by hand is our estimate. We don't subtract one from the other."
>
> "This is a synthetic company, and the test covers ticket handling in a sandbox, not whether the beta launch is ready."
>
> "Next: the same check wherever work starts, in agent preflight, Linear and Jira intake, and Slack. AI made execution fast. Align makes agreement on what to execute fast enough to keep up."

**Timing:** ~4:15. If the dry run runs long, cut the Jev/Alike line in Beat 2, then the Work view (1:45–2:00). Never cut the result in the opening, the owner-only approval, or the climax.

**Don't say:** "saved X hours", "enforces", "detects any conflict", or that the company's beta is ready. Don't name competitors.

---

## Operator click-by-click checklist

UI labels below match the app as of commit 2d8b38f. Re-check them during the dry run.

| # | Window | Action | Expect |
|---|---|---|---|
| 1 | Product | Already signed in. Open **Goals** | CEO goal v2 marked "Changed today"; the clock starts the first time the CEO's change is viewed |
| 2 | Product | Point at the **Product needs Security** card | Amber, "Unknown" |
| 3 | Product | Click the card → **Review the conflict with Security** | Three options in order, "What could prove this wrong", "What we don't know yet", earlier team decision (Alike) |
| 4 | Product | **Test which plan follows the new priority** | Current plan Failed, new plan Passed, "Same practice tickets, same pass/fail checks"; outage test listed |
| 5 | Product | **See full results in Evidence** (optional) | Test run detail opens |
| 6 | Product | **Add test results to the proposal** → Proposals form (text is pre-filled) → **Send proposal to Alex / Security Lead** | "Waiting for Security", "Tested" (if both runs exist) |
| 7 | Security | Refresh if needed → **Review and decide** → **Ask for changes**. **Leave "These changes alter how the agent works" unticked** | "Security asked for changes"; still "Tested" |
| 8 | Product | **Review Security's changes** → **Accept Security's changes and confirm what Product will do** | "Product accepted changes" |
| 9 | Security | **Approve the change to my goal** | "Approved"; new Security goal version (v2) |
| 10 | Security | Open **Goals** | Agreed version shown |
| 11 | Product | Open **Goals** | Agreed version shown; the clock stops |
| 12 | Either | Show the **summary strip** | Measured time and steps next to the labelled estimate |

The proposal form is pre-filled with this text (paste only if it was cleared):
- **New target for Security (Product):** "Beta customers' issues are handled first: marked urgent, tagged as beta, a private note for engineers, and a reply to the customer. The critical security ticket is not touched"
- **What Product will do in return:** "Product will tag every beta issue as beta when it comes in and publish exactly what is in the beta by Wednesday. Product will postpone the ticket dashboard polish."
- **Ask for changes (Security):** the form adds ", and its private notes stay untouched too" to the target. To show the capacity trade-off instead, write: "Beta customers' issues handled first by the AI agent, with one human review a day this week; the critical security ticket and its private notes stay untouched."

Optional "only the owner can approve" beat (only if time allows): from the Product window, try to approve. Expect "Only Security can approve changes to Security's goal".

## Pre-recording reset checklist

- [ ] `npm run dev` running; both windows load `http://localhost:3100`.
- [ ] Sparta evidence exists for `p-throughput@1` normal, `p-beta@1` normal and `p-beta@1` interruption in `sparta/walkthrough-lab/evidence/`. "Which plan follows the new priority?" shows all three after a refresh.
- [ ] Confirm "Which plan follows the new priority?" matches the recorded runs used in the script: `p-throughput@1-normal-115150` FAIL (exit 1, 2/9, ticket 1 changed), `p-beta@1-normal-115116` PASS (exit 0, 9/9), `p-beta@1-interruption-115212` PASS (exit 0, 9/9). If you rerun and get different results, say what actually happened.
- [ ] Alike: if a decision was actually retrieved in a fresh session, it's attached (`POST /api/alike`). If not, cut the Alike line.
- [ ] Demo reset: **Start the demo over** in the sidebar, or `POST /api/reset {"confirm":"reset"}` (see README). Test results and the Alike decision survive the reset.
- [ ] After reset: no proposals, clock not started, Security on v1, "Product needs Security" card amber.
- [ ] Product signed in on the left window, Security on the right (private window, so cookies are separate).
- [ ] **Don't open Goals in either window until recording starts**, so the clock starts on camera.
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
