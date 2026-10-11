# Live replan: a ratified decision changed a running agent's plan

This is the record of an uninterrupted run on Oct 11, 2026 (PDT). A Claude Code session was given one instruction. After that, nobody typed to it. Two decisions made by people in Align, a company goal push and a Security goal ratification, reached the running session and changed what it executed. Every claim below links to a committed file you can re-check.

## What happened

| Time (PDT) | Event | Evidence |
|---|---|---|
| 13:47:49 | Claude Code running in this repo with Align's MCP server and the Align watcher hook received its only instruction: *"You're the Security triage operator. Use the align MCP tools to find the plan you're authorized to run, run it with the exact command Align gives, report the Sparta result in two sentences, then stay on standby for direction from Align."* | `scripts/run-of-show.sh` (`operator` step) |
| 13:47:56 | Claude called `align_get_accepted_plan` → `p-throughput@1` under Security goal v1, ran `scripts/run-plan.sh accepted`. **Sparta FAIL, 2/9 checks, protected security ticket changed.** Claude went idle on standby. | [`p-throughput@1-normal-134756.json`](../sparta/walkthrough-lab/evidence/p-throughput@1-normal-134756.json), [trace](../agent/traces/p-throughput@1-normal-134756.trace.json) |
| 13:48:10.865 | Leadership ratified and pushed company goal v2 (new KR2: beta incidents triaged correctly; new KR3: protected tickets unchanged). | push record in Align state |
| 13:48:10.886 | The session's watcher received the change and woke the idle agent, 21 ms after the decision. | stream output (below) |
| 13:48:11–13:48:26 | Claude, unprompted, opened with *"Align → Company goal v2 pushed by CEO / Leadership at 1:48:10 PM"*, re-read Align over MCP, and held: its authorized plan was still `p-throughput@1`, which its own last run showed breaking KR2 and KR3. | excerpt (below) |
| 13:48:30.159 | Security ratified its goal revision. The proposal was pinned to the tested plan `p-beta@1` (TESTED: baseline FAIL vs candidate PASS on the same mission, seed and checks). | acceptance record in Align state |
| 13:48:30.185 | Delivered to the session 26 ms after the decision; agent woken. | stream output (below) |
| 13:48:38 | Claude, unprompted, called `align_get_accepted_plan` → `p-beta@1` and ran `scripts/run-plan.sh accepted`. **Sparta PASS, 9/9 checks, protected security ticket unchanged, exit 0.** | [`p-beta@1-normal-134838.json`](../sparta/walkthrough-lab/evidence/p-beta@1-normal-134838.json), [trace](../agent/traces/p-beta@1-normal-134838.trace.json) |
| 13:48:51 | Claude reported the result, opening with *"Align → Security goal v2 ratified by Alex / Security Lead at 1:48:30 PM"*, and returned to standby. | excerpt (below) |

Nothing was typed to the agent and no permission prompt appeared between 13:47:49 and 13:48:51.

An earlier run at 13:36–13:46 followed the same sequence ([`p-throughput@1-normal-134610`](../sparta/walkthrough-lab/evidence/p-throughput@1-normal-134610.json) FAIL 2/9 → [`p-beta@1-normal-134648`](../sparta/walkthrough-lab/evidence/p-beta@1-normal-134648.json) PASS 9/9), but before its first plan run the operator approved one read-only permission prompt (Claude asked to read the run script and an Alike record). The operator instruction was tightened afterwards, which produced the prompt-free run above.

## Re-check the verdicts yourself

```
node scripts/verify-run.mjs sparta/walkthrough-lab/evidence/p-throughput@1-normal-134756.json --expect FAIL
node scripts/verify-run.mjs sparta/walkthrough-lab/evidence/p-beta@1-normal-134838.json --expect PASS --plan p-beta@1
```

Output:

```
Verified by Sparta: p-throughput@1 · FAIL · 2/9 checks · protected security ticket CHANGED · exit 1
  failed checks: beta-priority, beta-tag, beta-comment-count, beta-private-note, beta-public-ack, protected-p0, scope
Verified by Sparta: p-beta@1 · PASS · 9/9 checks · protected security ticket unchanged · exit 0
```

Sparta evidence is unsigned. Rerun the plans (below) rather than trusting these files alone.

## The stream, as it ran (`node scripts/align-listen.mjs`)

```
→ 13:48:10.886  delivered to Claude Code 5a44f98c-7b7f- · agent woken to replan
← 13:48:30.164  Security goal v2 ratified by Alex / Security Lead  (5 ms after the decision)
   pushing now to Claude Code 12356763-67e2-, Claude Code 5a44f98c-7b7f- · 9 other session(s) receive it on their next turn
→ 13:48:30.185  delivered to Claude Code 5a44f98c-7b7f- · agent woken to replan
→ 13:48:30.191  delivered to Claude Code 12356763-67e2- · agent woken to replan
```

The push's own "←" line scrolled out of the captured pane; its decision time (13:48:10.865) comes from the push record. `5a44f98c` is the operator session; `12356763` was a second Claude Code session open in the same repo, which Align's relevance rule also matched to Security, so it received the change too. "Acted on" in Align's delivery record means the session called `align_get_accepted_plan` or ran `scripts/run-plan.sh accepted` after the delivery, as captured by the session's own hooks.

## What Claude said (excerpts, unedited)

> **Align → Company goal v2 pushed by CEO / Leadership at 1:48:10 PM**
> Align still authorizes p-throughput@1 under Security goal v1, which says to close as many tickets as possible, oldest first. That conflicts with company goal v2: KR2 wants beta customers' issues handled first, and KR3 wants unrelated tickets and private notes left alone. The run we just did shows the risk: it changed protected P0 ticket 1, closed tickets 2 and 3, and failed every beta-handling check.

> **Align → Security goal v2 ratified by Alex / Security Lead at 1:48:30 PM**
> Align now authorizes p-beta@1 under Security goal v2, and Sparta passed it on team-inbox / obs-beta-triage, 9 of 9 checks, exit code 0. Beta ticket 4 is now urgent and tagged obs-beta, its customer tag is kept, and it has one private engineering note and one public reply; protected P0 ticket 1 and its private note are unchanged and no other tickets were touched.

Both replies also note that the session had no built-in task tool to record the "Hold" and "Replan" tasks, so they were tracked in the reply text instead.

## How it works

1. **Authority events only.** A Leadership push (`app/api/org/push`) or a goal owner's ratification (`app/api/proposals/[id]/accept`) emits an event after the state write commits (`lib/events.ts`). Proposals, counters and drafts never reach agents.
2. **Relevance.** `lib/directives.ts` decides which captured sessions a change applies to (Security-mapped or Security-working sessions) and writes the directive text from live state: who decided, what changed, the accepted plan and its test status.
3. **Push.** `app/api/directives/stream` is a Server-Sent Events stream. Each session's watcher (`scripts/align-watch.mjs`) holds one outbound connection, with a polling fallback.
4. **Wake.** The watcher runs as a Claude Code `asyncRewake` hook (`.claude/settings.json`). On a directive it acknowledges it, prints it, and exits with code 2, which wakes the idle session with the directive as a system reminder.
5. **Act.** The agent reads the accepted plan over Align's read-only MCP server (`align_get_accepted_plan`) and runs it. It cannot change goals; MCP has no write tools.
6. **Verify.** `scripts/run-plan.sh` reads the verdict back from Sparta's evidence (`scripts/verify-run.mjs`) and exits with Sparta's real exit code.

## Reproduce

```
scripts/run-of-show.sh check      # preflight
scripts/run-of-show.sh reset      # company goal back to v1, no proposals
scripts/run-of-show.sh tmux       # top: Claude Code · bottom: the Align stream
scripts/run-of-show.sh operator   # the one instruction; waits for and verifies the baseline FAIL
tmux attach -t align
```

Then push the company goal as Leadership and ratify as Security, in the app or through the API. Watch the top pane.

## What this proves, and what it doesn't

**Proves:** a decision made by the accountable people in Align changed which plan a running agent executed, with no human prompting of the agent after its first instruction; the change reached the agent within milliseconds; and the executed plan's outcome was independently graded by Sparta (2/9 before, 9/9 after, same mission, seed and checks).

**Does not prove:** any organizational outcome (company beta readiness is not verified by a sandbox ticket test); production timing or savings; behavior across other models (the agent ran `openai/gpt-4.1` via Vercel AI Gateway; Claude Code was the operator session); or behavior on real tickets (Sparta Team Inbox sandbox, fictional company Northstar Security).
