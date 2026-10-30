---
name: Align
summary: Lets each person change a goal only with the approval of someone entitled to approve for it, and keeps the coding agents working toward that goal current with it.
kind: product
---

# Align

Align is a web application, a read-only MCP server and a local agent package. People in an organization sign
in as themselves, set goals that roll up from team goals to company goals, and change another team's goal
only with the approval of someone entitled to approve for it. Coding agents (Claude Code and Codex) that
people choose to share count toward a goal: they receive its current version and any change to it at the
next turn, their usage is metered locally and reported per goal, and their owner or a workspace owner can
stop them. Connected AI apps read the same goals and decision records through MCP, as the person who
connected them.

## Scope

This corpus specifies the target behavior of the implementation in
`components/legacy-project-wrapper/implementation/` after the owner's decisions of 2026-10-30: every feature
works for any organization, everyone signs in as a person (no shared passcodes), and the goal-sessions model
(formerly "v2") is the only model. The earlier Northstar demo, custom `w_` workspaces and their passcode,
proposal, directive and capture flows are retired; the corpus at commit `0933523` records that earlier
behavior. It describes observable behavior (HTTP and MCP interfaces, authorization rules, state transitions,
agent hooks and screens), not the framework, hosting, or language choices.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Person | A signed-in account (Google, GitHub or email one-time code). Nothing in Align is reached with a shared secret |
| Workspace | One organization's isolated space (`ws_…`), whose members have the role `owner`, `member` or `viewer` |
| Team | A named group of members inside a workspace (stored as a "pod"); each member of a team is a `lead` or a `member` |
| Goal | An objective with immutable versions, owned by one person and optionally by one team; a `company` goal belongs to the workspace owners |
| Approval set | The people any one of whom may approve on a goal's behalf: its owner, its team's leads, and for a company goal the workspace owners |
| Alignment | A consented link that makes a goal contribute to another goal, or makes chosen sessions work toward a goal |
| Change request | A proposed new version of someone else's goal, approved or rejected by the goal's approval set |
| Session | A coding-agent session (Claude Code or Codex) that its owner shared toward a goal, identified by a keyed `session_key` |
| Directive | A sequence-numbered message Align delivers to a person's running sessions: `goal_version`, `binding_changed`, `binding_suspended`, `stop` or `resume` |
| Mode L | The default local mode: the server answers only loopback requests on one machine, with a local owner account |
| Hosted | The internet-facing mode (`HOSTED=1`) |
| Sample workspace | "Northstar (sample)", an ordinary workspace any person can create to see Align's flows |

## Parts

- `goals-and-proposals` — goals and their versions, approval sets, alignments, change requests and the sample workspace
- `directives` — directives to running agents, receipts, and stopping and resuming an agent
- `mcp` — the read-only MCP server, its OAuth authorization server and the `align-connect` stdio relay
- `workspaces` — identity and sign-in, workspaces, members, teams, invites, devices, shared sessions, usage and spend, activity, and hosted mode
- `metrics` — content-free product events, operator-recorded LOIs and the operator's metrics report
- `local-agent` — the `align` CLI, its Claude Code and Codex hooks, the one-pass sync and local metering
- `interface` — the web app under `/app` and the OAuth consent page
