# LIM-2472 workstream S: shared surfaces

Branch `agent/LIM-2472-shared-surfaces`, from main b16f8d1, with `agent/LIM-2472-foundation` merged (up to 6b76a16).
Front end only: every change is under `components/legacy-project-wrapper/implementation/app/app/**`. No API, lib,
schema, spec or script changes; `globals.css` untouched (tokens come from foundation).

## ADDED

| Path (under `app/app/`) | What |
|---|---|
| `_ui/ds/compare.tsx` | `Compare` (a plan before and after, field by field, changes marked Added / Removed / Changed in words, the record's change lines under each field) and `VersionsCompare` (two goal version rows). Exported from `_ui/ds`. |
| `_ui/ds/decision-record.tsx` | `DecisionRecord`: the decision record as a timeline on the foundation `Timeline`, filters by who and what, order newest/oldest, change detail through `Compare`. |
| `_ui/ds/record-events.ts` | Builds the record's events from a change request (revisions, evidence, condition acknowledgement, decision, launch decision) and from audit rows; says each event's source only as far as Align records it. |
| `_ui/ds/work.tsx` | `WorkPanels`: goals, sessions shared toward the chosen goal, evidence on its change requests, connected apps' goal reads. |
| `_ui/ds/read.ts` | `useRead`: a GET that keeps the HTTP status, so 403 and 404 are said as what they mean. |
| `w/[ws]/record/` | `/app/w/<ws>/record` (`?cr=<id>`, `?goal=<id>`), the record body inside today's `Shell`. |
| `w/[ws]/work/` | `/app/w/<ws>/work` (`?goal=<id>`), the Work body inside today's `Shell`. |

Outside the app: `design/prototypes/lim-2472/s/shots.mjs` (screenshots) and this report.

## REPLACED

| Path | What |
|---|---|
| `w/[ws]/apps/view.tsx` | The Apps tab as self-contained panels: Set up (MCP URL, Claude Code and Codex lines, approve), What Align can tell (Last connected vs Last read the goals, with Receipt / Not observed), counts, and Connections. The table keeps its column names, `data-label` cells, `data-paste-line`, `data-apps-times` and the empty sentence, so the existing Apps checks should still read it. Disconnect is shown only to the app's person or an owner; anyone else reads who can. |

## DELETED

Nothing. Sessions and the goal page's activity card are unchanged; Work links to Sessions for stop and resume.

## Truth rules as built

- Sources: "Recorded in Align" for actions only a signed-in browser can take; "Recorded in Align · source not recorded" when the audit row can't say whether the browser, the person's device or their connected app did it (evidence added/removed, sharing stopped, anything unlisted); "Align" when no actor is recorded; "Agent reported · connected app via MCP" for agent evidence; "Agent reported · align CLI" for `session.shared_again` and goal activity.
- Connected apps: a Receipt only from `last_read_at`; `last_used_at` is shown as "Last connected" and said not to be a read. Never "which version an app has".
- Evidence links: "Self-reported" or "Agent reported", always with "Align doesn't verify links".
- Approval is not launch: an approved, unlaunched change says so on the record and reads "Approved, not launched" on Work.
- Sessions: "Active in the last 90 minutes" (the server's definition), never "live" or "running".
- No `launchWords` output anywhere.

## Server asks (nothing faked in their place)

1. `GET …/goals/<goal>/versions/<n>` (or full content in the goal GET's `versions`): a version's measures, limits and dependencies, so `VersionsCompare` can compare more than title, status and target share.
2. A channel on audit rows (browser, device, MCP), so the record can drop "source not recorded".
3. The per-app "Align sent it the approved plan (vN)" receipt (backed by `v2_oauth_goal_sends`) exposed on `GET …/apps`, and which goal a read returned. Work says "Not recorded per goal yet" until then.
4. `GET …/activity` is device-bearer only; a cookie read (or the goal activity read already used) is enough for the web, so no ask unless a concept wants the in-flight items.
5. Audit is owners only and capped at the newest 200 rows; a paged read would let the record go further back.

## test-v2 UI checks this may break

Not run here (the brief says no `npm test` / `next build`). By reading `scripts/test-v2.mjs`:

- Apps phone check (`3734-3753`): reads body text for "Sends you back to", "Last connected", "Last read the goals" at 390. The table head is `sr-only` below 768px (as the old `PHONE_TABLE` did below 640px) and the cells keep their `data-label`s, so it should pass; the stacked layout now starts at 768px, not 640px.
- Apps columns (`6633-6653`): headings, cell labels and the `data-apps-times` sentence unchanged; the App cell now also holds an evidence label, so a row's text starts with the app's name as before.
- Apps empty (`4204`): "No AI apps are connected to this workspace." kept verbatim.
- Buttons at 390 (`3780-3797`): every bordered button on Apps is 44px below 640px.
- No check covers `/record` or `/work` (new pages).

## How to boot and see it

```sh
cd components/legacy-project-wrapper/implementation
npm ci
ALIGN_DATA_DIR=$HOME/liminal/.private/lim2472/s-data npx next dev -H 127.0.0.1 -p 3803
# open the printed sign-in link, then Create the Northstar sample on /app
# /app/w/<ws>/record   /app/w/<ws>/record?cr=<id>   /app/w/<ws>/work   /app/w/<ws>/apps
```

Screenshots (dark 1440/390/320, light 1440; flags any sideways scroll):

```sh
(cd components/legacy-project-wrapper/implementation && ALIGN_DATA_DIR=… PORT=3803 npm run sign-in-link)
ALIGN_DATA_DIR=… node design/prototypes/lim-2472/s/shots.mjs http://127.0.0.1:3803 /tmp/lim-2472-s
```

## Not done

- P1 goal dependencies view: not started.
- The Sessions page itself was not reworked; Work carries the goal-scoped session panel and links to Sessions for stop and resume.
