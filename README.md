# Align

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->

**Align is a command center for parallel AI work: one place to see what needs your decision and which connected AI apps have read the goals or only connected. Underneath, only the people entitled to approve for a goal can change it, every version is kept, and AI agents read the approved version.**

Align is Liminal's wedge product, a working prototype. We built the first version in one day at SpeedHacks (Oct 11, 2026), where it won Best Use of Sparta, and rebuilt it during the Proving Ground founder sprint (Oct 21 to 23, 2026). This repository holds Align v2: everyone signs in as themselves, and workspaces, teams and change requests replace the first version's shared team passcodes. Built by Shayaun Nejad and Shruti Rajagopal Nejad.

## What it does today

- **Home shows what needs you.** A workspace opens on its Home: the change requests, asks and alignment requests waiting on you, what you are part of that waits on someone else (and on whom), the active goals, and each connected AI app with when it last read the goals, or, if Align has seen no goal read from it, when it last connected. A goal read counts as a delivery receipt; an app that only connected is not observed, since connecting is not reading. Every agent-status item is labelled delivery receipt, agent reported or not observed. A read that fails shows unknown, never zero.
- **People, not passcodes.** Everyone signs in as themselves with Google or GitHub (when the server has them set up), a one-time email code (printed on the machine in Mode L) or a passkey. Workspaces have owners, members and viewers; teams have leads and members. Sensitive actions need a sign-in from the last 15 minutes.
- **Goals with versions.** Company and team goals have measures, limits (must, must not, out of scope) and dependencies, and team goals can contribute to company goals. Every change makes a new version; earlier versions are kept.
- **Only the approval set decides.** A member proposes a change to a goal they don't own. The goal's owner, its team's leads and, for a company goal, the workspace owners can approve it, suggest a change, or decline it with a reason. One approval is enough, and the server refuses anyone else (HTTP 403). An approved request stays as its decision record. An approver can attach an "Accept if…" condition to a suggested change, which only the requester confirms; it is never a gate and never called verified.
- **Approving is not launching.** Approving records the decision; agents stay on the goal's current version until someone in the approval set, or a workspace owner, launches it, which publishes the next version to the bound sessions. They can also say "Not yet", or approve and launch in one step. If the goal gets a newer version or closes first, the approved change is superseded before launch and never reaches agents. The record reads "Approved, agents still on v<n> until launch" and then "Launched, agents on v<n+1>".
- **Evidence, labelled as what it is.** Each revision of a change request carries a snapshot Align records itself (the goal's 30-day spend, bound sessions, last activity). People and connected apps attach typed links (pull request, CI run, incident, dashboard, doc), labelled self-reported or agent-reported and never verified. Approving without evidence is allowed and recorded.
- **Agents stay current.** The `align` CLI pairs a machine, shares the Claude Code and Codex sessions you choose toward a goal, meters their token usage locally, and delivers goal changes into running sessions at their next turn. The people who can approve for a goal can send its sessions a replan, checkpoint or switch-goal request, or hold every agent on the goal. A hold, or **Stop agent** on the Sessions tab, blocks the session's tools until it is released or resumed, and the session reports each directive back as received, applied or enforced.
- **Read-only MCP for AI apps.** Connected AI apps read goals with their limits, change requests with their evidence, decision records, directives, asks between teams, agent activity and a short brief through `/api/mcp`, as the person who connected them, after that person approves the app in Align (OAuth). No tool can create, change, propose or approve anything. An app the person allows the opt-in `changes:evidence` scope can also add agent-reported evidence links. The Apps tab gives the URL and a line to paste for Claude Code and for Codex.
- **Asks between teams.** Record what a team was asked to do, by hand or imported, and each time it came up again. The team's lead accepts or declines it, and the team marks it done.
- **Alignments.** Ask for a goal, and chosen sessions, to count toward another goal. Every affected goal's approvers consent before it takes effect.
- **Limits from meeting notes.** Paste notes and Align suggests limits for the goals they name, using plain sentence rules and no model. A suggested limit takes effect only through a new version by the goal's owner or an approved change request.
- **Spend by goal.** Token usage and estimated list cost by goal, team or your own sessions. Costs are estimates at list price, not a bill.
- **What the decision gave you.** An approved change request shows a value card with the measured time from proposal to decision, from decision to launch, and from decision to the first session applying the launched version. A person's own estimate of how long it would have taken is kept separate.
- **Fits a phone.** Every `/app` page fits a 390-pixel-wide screen without sideways scrolling.
- **Runs locally or hosted.** Mode L runs on one machine for one person with no setup. A hosted server sends email codes, can require a creation code and a bot check before someone creates a workspace, and serves public privacy and trust pages.

## What it does not do yet

- **It doesn't verify evidence or outcomes.** Evidence links are labelled by who added them and never checked. Align records goal reads and delivery receipts, not whether an agent's work met the goal.
- **It reaches only agents running the `align` CLI.** Goal changes, requests, stops and holds reach Claude Code and Codex sessions shared through the CLI's hooks. An AI app connected only through MCP can read; Align can't stop it.
- **It doesn't know which goal version an app has.** The Home and the Apps tab show when an app last connected and when it last read the goals, not which version it read or what it did with it.
- **It does not sign records.** Decision records live in Align's database, unsigned.
- **No outside team has used this version yet.** It has not been deployed for outside teams, and no outside team has completed an evaluation on its own.

## Run it

The app, its local agent and its MCP bridge are in [`components/legacy-project-wrapper/implementation`](components/legacy-project-wrapper/implementation). Its [README](components/legacy-project-wrapper/implementation/README.md) covers running it locally (Mode L), pairing the `align` CLI, connecting an AI app, hosting it, and the test gate. The contract is the specification in [`specs/align`](specs/align).
