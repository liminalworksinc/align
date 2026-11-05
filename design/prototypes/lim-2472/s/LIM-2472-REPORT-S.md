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
| `_ui/ds/dependencies.tsx` | `GoalDependencies`: goals as an indented list under the goal each contributes to, depends-on counts, stale contributions flagged, selected goal's details and a `VersionsCompare` drilldown. |
| `w/[ws]/dependencies/` | `/app/w/<ws>/dependencies` (`?goal=<id>`). |
| `w/[ws]/sessions/parts.tsx` | The Sessions tab's Btn, Note, Err, Pill, Loading on the tokens, same names and words as the kit pieces. |

Outside the app: `design/prototypes/lim-2472/s/shots.mjs` (screenshots) and this report.

## REPLACED

| Path | What |
|---|---|
| `w/[ws]/apps/view.tsx` | The Apps tab as self-contained panels: Set up (MCP URL, Claude Code and Codex lines, approve), What Align can tell (Last connected vs Last read the goals, with Receipt / Not observed), counts, and Connections. The table keeps its column names, `data-label` cells, `data-paste-line`, `data-apps-times` and the empty sentence, so the existing Apps checks should still read it. Disconnect is shown only to the app's person or an owner; anyone else reads who can. |

| `w/[ws]/sessions/view.tsx` | Sessions in the panel system (Yours | Everyone's); behaviour, API calls, button labels, `data-session-row`, `data-session-detail`, `data-row-refusal` and the `main li` structure unchanged; useful empty states. |
| `_ui/evidence.tsx` | `EvidencePill` on the evidence tokens (words unchanged, Not observed dashed). |
| `_ui/activity.tsx` | The goal card says "Reported activity, last 90 min" and "Last reported activity" (was "Active now", "Last activity"). |

## DELETED

Nothing. Work links to Sessions for stop and resume.

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
3. Which goal an app's read returned. (Correction: the per-app "Align sent it v<n>" receipt exists for launched changes, `GET …/change-requests/<id>/value` → `apps.items[].sent_at`, and Work now shows it; outside a launched change Work says nothing was sent.)
4. `GET …/activity` is device-bearer only; a cookie read (or the goal activity read already used) is enough for the web, so no ask unless a concept wants the in-flight items.
5. Audit is owners only and capped at the newest 200 rows; a paged read would let the record go further back.

## test-v2 UI checks this may break

Not run here (the brief says no `npm test` / `next build`). By reading `scripts/test-v2.mjs`:

- Apps phone check (`3734-3753`): reads body text for "Sends you back to", "Last connected", "Last read the goals" at 390. The table head is `sr-only` below 768px (as the old `PHONE_TABLE` did below 640px) and the cells keep their `data-label`s, so it should pass; the stacked layout now starts at 768px, not 640px.
- Apps columns (`6633-6653`): headings, cell labels and the `data-apps-times` sentence unchanged; the App cell now also holds an evidence label, so a row's text starts with the app's name as before.
- Apps empty (`4204`): "No AI apps are connected to this workspace." kept verbatim.
- Buttons at 390 (`3780-3797`): every bordered button on Apps is 44px below 640px.
- Goal activity card (`5088`): matches `/Active now\s+1/` on `#goal-activity`; the label is now "Reported activity, last 90 min" on purpose (an "Active" label reads as Align observing the session). The check needs the new label.
- Sessions: the restyle keeps every string and hook the checks at `2997-3021`, `3432-3470`, `8886-8893` and `10688-10693` read; not run.
- No check covers `/record`, `/work` or `/dependencies` (new pages).

## Seeded data (seed-agent.mjs)

`design/prototypes/lim-2472/s/seed-agent.mjs <BASE> <out.json>` fills a Mode L server started with `ALIGN_TEST_IDP=1`
and a fresh `ALIGN_DATA_DIR`, through the real HTTP API only: three test-IdP people (owner Mara Quill, member Theo
Vance, viewer Ines Park, all @example.test), the Northstar sample, a paired device each (device flow), shared sessions
bound to goals with usage rows (onboarding 65% and security 35% of the 7-day agent time), one change request approved
and launched with its directive receipt received then applied, one approved not launched, one pending, a
self-reported evidence link and an agent-reported one (added by the connected app over MCP), one OAuth app that reads
the goals after the launch (Apps: Last connected and Last read the goals; `…/value` `apps.items[].sent_at`) and a second
that only connects (Not observed). Writes ids and the throwaway test passwords to out.json, mode 600. One Next dev
server runs per folder, so a seeded server beside a clean one needs a second worktree.

```sh
ALIGN_TEST_IDP=1 ALIGN_DATA_DIR=/tmp/align-seed npx next dev -H 127.0.0.1 -p 3804   # in the implementation folder
node design/prototypes/lim-2472/s/seed-agent.mjs http://127.0.0.1:3804 /tmp/align-seed.json
node design/prototypes/lim-2472/s/shots.mjs http://127.0.0.1:3804 /tmp/shots --seed /tmp/align-seed.json   # full set, 00-three-states first
node design/prototypes/lim-2472/s/shots.mjs http://127.0.0.1:3803 /tmp/shots --clean                     # clean sample, dark 1440 and 390
```

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

## Work and Sessions truth additions

- Work: "Launched v<n>" from the goal's newest launched change request; per app "Align sent it v<n>" (Receipt) with its time; agent time over 7 days against target (Agent reported, from align CLI usage) with held; your sessions "bound at v<n>" (the version at binding, never "applied").

## Not done

- A graph view of dependencies: deliberately not built; the indented list is the view while plans are small.
