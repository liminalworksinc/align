---
name: Align
summary: Gets the right owner's approval when priorities change, and delivers the approved plan to coding agents that are already running.
kind: product
---

# Align

Align is a web application, a read-only MCP server and a local agent package. When
leadership changes a priority, Align identifies the goals and cross-team dependencies
the change puts at risk, lets the affected team propose a change to the owning team's
goal with sandbox-tested evidence attached, and lets only the goal's owner approve it.
Approval creates a new goal version, records the decision, and notifies running coding
agents, which read the newly approved plan from the MCP server before acting.

## Scope

This corpus specifies the behavior of the current retained implementation in
`components/legacy-project-wrapper/implementation/`. It describes observable behavior
(HTTP and MCP interfaces, authorization rules, state transitions, agent hooks and
screens), not the framework, hosting, or language choices.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Workspace | One organization's isolated Align instance, addressed by a slug |
| Goal | A team-owned objective with versioned, approved plans |
| Owner | The team (and its leader) entitled to change a goal |
| Proposal | A requested change to another team's goal, with evidence |
| Directive | A message Align pushes to running agents (hold, replan, resume) |
| Plan | A versioned, hashed agent plan such as `p-beta@1` |
| Session | A coding-agent session (Claude Code or Codex) observed by the local agent |

## Parts

- `goals-and-proposals` — goals, dependencies, proposals and the approval flow
- `directives` — pushes from Align to running agents and their acknowledgement
- `mcp` — the read-only MCP server and its OAuth authorization
- `workspaces` — workspace setup, onboarding interview, access and session capture
- `local-agent` — the `align` CLI, daemon, hooks and local metering
- `interface` — the screens people use
