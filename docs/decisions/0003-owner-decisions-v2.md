# ADR 0003: Owner Decisions for Align v2 (2026-10-30 and 2026-10-31)

- Status: Accepted, for review with the founders on LIM-2454
- Date: 2026-10-30 (decisions 1 to 4), 2026-10-31 (decision 5)
- Decision owner: Sean Nejad, author of PR #37, in the session that built it
- Where they apply: `specs/align/`, `docs/roadmap/active-work.md`, `CHANGELOG.md`

The spec, the roadmap and the changelog cite "owner decision 2026-10-30" (or 2026-10-31). This record lists
what each one decided, so a citation can be checked. Founder rulings on LIM-2454 are cited by their
comment id and are not restated here.

## 1. v2 is the only model, for any organization (2026-10-30)

Everyone signs in as a person; workspaces, teams and change requests replace shared team passcodes;
Northstar `w_` workspaces and the v1 proposal, directive and capture flows are retired. Northstar becomes a v2
sample workspace. Cited in `specs/align/spec.md` (Scope).

## 2. Porting main's v1 work to v2: D1 to D6 (2026-10-30)

Cited by PORT-001 to PORT-005.

| | Question | Decision |
|---|---|---|
| D1 | Where do limits live? | In the goal version, confirmed by the goal's approval set, delivered with the goal. No separate limits table. |
| D2 | Who reads limits over MCP? | The founder's 2026-10-29 ruling, restated for v2 people and teams (`specs/align/mcp.md`), even though limits follow goal visibility in the web app. |
| D3 | Do accepted asks reach agents? | Yes: the bound goal's limits and the team's accepted asks go into agent context as quoted, attributed data. |
| D4 | Codex AGENTS.md rule? | None. |
| D5 | Drift detection? | Only a local notice to the user, never to the model, and nothing uploaded. |
| D6 | Value feedback? | One estimate and an optional note per decision, in its own table. |

## 3. Between informing and instructing agents (2026-10-30)

Answers the spec's open question "may directives instruct agents?" with three levels (`specs/align/directives.md`):

- **Inform**: goal versions, limits and accepted asks, as data.
- **Request**: replan, checkpoint or switch goal, sent by a goal's approval set or a workspace owner, worded by
  Align and naming the sender. Safe ones run on their own: a checkpoint, and drafting (not adopting) a new plan.
  Switching goal waits for the developer. The developer is always told and can decline any request.
- **Enforce**: the per-session stop, plus a goal hold that blocks every agent's tools on a goal until released.

Cited by REQ-001 and REQ-002.

## 4. Waking idle agents stays out of scope (2026-10-30)

A stop or a new version takes effect at the session's next hook. Cited in `specs/align/directives.md`.

## 5. Launch and conditions, building on LIM-2454 33ad545d and 35376283 (2026-10-31)

- **Approving is not launching.** Approval records the decision; agents get the new version only at launch. This
  keeps v1's separate launch decision. The difference from v1 is who makes it: v1 had a leadership role, and v2
  has no such role, so launching is open to anyone in the goal's approval set or a workspace owner. Workspace
  owners are the nearest v2 equivalent of leadership. A separate launcher role is open for the founders to rule
  on.
- **Approve and launch** is one step when the same person may do both.
- **Superseded:** an approved change that has not launched is superseded if the goal gets a newer version or
  closes first, and never reaches agents.
- **Conditions:** a counter may carry an "Accept if…" condition. Only the requester acknowledges it, as a separate
  step from accepting the counter. It never gates approval or launch, and nothing is called verified.

Cited by LAUNCH-001 and LAUNCH-002.
