# Allocation experiment: does steering move agent time toward priorities?

The real test of allocation is the share of agent time per goal over weeks, not one session's answer. This is the
three-week A/B/A from the allocation spec, run first on one founder's own work.

## Setup (once)
1. Run a goal-sessions server (`ALIGN_GOAL_SESSIONS=1`) and sign in on the web.
2. Create one workspace and one goal per real goal, with target shares that add up to 100% or less.
3. `align login`, then `align share --dir <folder> --workspace <ws> --goal <goal>` for each working folder. For work
   with no folder of its own, use `::align bind <goal>` inside the session.
4. Hand-check 30 sessions' bindings (`align sessions`, the Sessions page) and record the error rate.

## Weeks
| Week | Steering | What to record |
|---|---|---|
| 1 | off | Baseline: share of fresh tokens per goal against target (`align allocation --week <monday>`). |
| 2 | on (Spend page switch, workspace owner) | Same, plus steering lines shown (`align steering status`). |
| 3 | off | Same. |

## Pass
- Push-goal share moves at least 15 points toward target in week 2 and falls back in week 3.
- Every goal with a target above 0 gets more than 0 in week 2.
- Work outside any shared goal falls below 3% of local agent time (`align allocation` prints it).
- Steering lines stay under 3 a day per person.

## Prior evidence
A one-shot check on Oct 27, 2026 (60 `claude -p` runs on Sonnet 5.5, usage seeded from a real 28-day baseline):
asked for the best use of a free hour, agents with the steering line named the under-target goal in 6 of 6 runs,
against 0 of 6 with no Align and 0 of 6 with the priority list pasted into the prompt (which picked the top-ranked goal
even though it was already over target). On a specific task they stayed on task in 6 of 6 and mentioned the gap as an
aside in 4 of 6. That shows the line is read and acted on; it does not show weekly allocation changes.
