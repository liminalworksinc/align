# LIM-2472 integration base: report

Branch `agent/LIM-2472-integration`. App at `components/legacy-project-wrapper/implementation` (paths below are relative to it unless they start with `design/`). Base of the whole set: `main` at `b16f8d1`.

What the base holds: foundation (`e6ea124`), Stream R (rest of app, `3cc0f71`), shared surfaces (`db544d3`, which contains `d1d0ca1`, `a6ff222` and foundation `e6ea124`), and the Requests tab moved onto the shared review. No concept is merged. Home and the workspace shell (header, tab nav, workspace select) are left to the concept the founder picks: their screens and findings are marked "pending the concept".

## Merges and resolutions

| Merge | Into | Result |
|---|---|---|
| branch created from `origin/agent/LIM-2472-rest-of-app` `3cc0f7107b8abc537017f2e6fcf45394d88a94fd` | new branch | – |
| `origin/agent/LIM-2472-shared-surfaces` `a6ff222774145a9173744c73eacd93a48e8d3f24` | `b866da046c2abbf961b1f3b953221f24f5ee9d88` | clean. R changed 39 files, S 22, none in common (merge base `6b76a16`) |
| `origin/agent/LIM-2472-foundation` `e6ea12458ce318b6661c5573fdf6be37438f66ef` (kit `Btn`/`Input`/`Select`/`TextArea`) | `519ad538c5b447feda1f9e664ee87bb75b905e1a` | clean, `app/app/_ui/kit.tsx` only |
| `origin/agent/LIM-2472-shared-surfaces` `db544d3e17dea486e5d1e64946eb068d12e95817` (contains `d1d0ca1`: ReviewActions returns to the choices after Cancel or a decision; compact phone confirmation on one row; one consequence line) | `010789001fecb7878e482e059d6de531067f0b10` | clean, `_ui/ds/review.tsx` and `_ui/ds/decision-record.tsx` only |

No conflicts, so no file needed a side chosen. No rebase, no force push, no stash.

## ADDED / REPLACED / DELETED (whole base against main `b16f8d1`)

78 files: 33 added, 45 modified, 0 deleted. No file under `app/api/**`, `lib/**`, `proxy.ts`, migrations or tests is touched.

### Foundation
- ADDED: `app/app/_ui/ds/{data-table,drawer,empty-state,evidence-label,icons,kbd,panel,segmented,status-pill,theme,theme-script,timeline}.tsx|ts`, `app/app/_ui/ds/index.ts` (one import path, `@/app/app/_ui/ds`), `LIM-2472-FOUNDATION.md` (repo root), `design/prototypes/lim-2472/foundation.html` (specimen).
- REPLACED: `app/globals.css` (semantic tokens for both themes: surfaces, text, lines, `--accent`, `--st-*` states, `--focus`, radii), `app/layout.tsx` (theme script before first paint, fonts), `app/app/_ui/kit.tsx` (kit on tokens; `Btn` primary on `--accent`; secondary and `Input`/`Select`/`TextArea` on `--edge` with a 44px phone minimum), `app/app/account/view.tsx` (Appearance setting: System, Light, Dark).

### Stream R (rest of app)
REPLACED (restyle; requests and logic unchanged, see `design/prototypes/lim-2472/r/LIM-2472-REPORT-R.md`): `app/app/view.tsx`, `sign-in/view.tsx`, `request-access/view.tsx`, `account/view.tsx`, `device/view.tsx`, `devices/view.tsx`, `invite/[token]/view.tsx`, `w/[ws]/people/view.tsx`, `w/[ws]/alignments/view.tsx`, `w/[ws]/asks/view.tsx`, `w/[ws]/spend/{view,allocation}.tsx`, `_ui/{reallocations,limits,requests,goalform,missing,error-notice,turnstile}.tsx`, `_ui/value.tsx` (only the value-card approver gate), `app/global-error.tsx`, `app/oauth/authorize/{AuthorizeForm,page}.tsx` (class names only), `app/trust/page.tsx`, `app/_trust/doc.tsx`, and every owned `page.tsx` (loading fallback colour). ADDED: `design/prototypes/lim-2472/r/LIM-2472-REPORT-R.md`.

### Shared surfaces (S)
- ADDED: `_ui/ds/compare.tsx` (Compare, VersionsCompare), `_ui/ds/decision-record.tsx`, `_ui/ds/record-events.ts`, `_ui/ds/read.ts`, `_ui/ds/review.tsx` (ReviewBody, ReviewActions), `_ui/ds/work.tsx` (WorkPanels), `_ui/ds/dependencies.tsx`; routes `w/[ws]/record/{page,view}.tsx`, `w/[ws]/work/{page,view}.tsx`, `w/[ws]/dependencies/{page,view}.tsx`; `w/[ws]/sessions/parts.tsx`; `design/prototypes/lim-2472/s/{LIM-2472-REPORT-S.md,seed-agent.mjs,shots.mjs}`.
- REPLACED: `w/[ws]/apps/view.tsx` (set-up panels, `#connect` anchor), `w/[ws]/sessions/view.tsx` (panel system), `_ui/evidence.tsx`, `_ui/activity.tsx` ("Reported activity", not "Active").

### This step (integration)
- REPLACED: `app/app/w/[ws]/requests/view.tsx`. Each change request is now the shared review from `@/app/app/_ui/ds` in a ds `Panel`: `ReviewBody {ws, cr, me, titleOf}` over `ReviewActions {ws, cr, me, onDone: reload, compact}`, with "Goal" and "Record" links (44px on phones). The tab no longer imports `_ui/decide.tsx`, `_ui/crparts.tsx` or `_ui/changes.tsx` (those files are unchanged; the goal page still uses them).
  - Same two reads as before: `GET /api/v2/workspaces/<ws>/change-requests` and `GET /api/v2/workspaces/<ws>/goals` (the goal titles that `useGoalTitles` read, now read in the tab itself for `titleOf`). No new API call. Every decision is the shared review's own POST to `…/change-requests/<id>/<action>`.
  - The three sections are headings in ONE flat keyed list, so a request that moves section after a decision keeps its `ReviewActions` mounted and its "Recorded: …" or "Not recorded. …" notice stays on screen (main's card kept notices in a module map, `crparts.tsx:496`; the shared review keeps them in component state). Cost: the sections are no longer `<section aria-label>` landmarks; each is an `h2` with an id.
  - Fields: the shared review needs nothing the tab doesn't fetch (`ChangeRequest` from the list carries `can`, `revisions`, `diff`, `condition`, `launch`, `behind`).
- ADDED: this report.

## test-v2 checks likely broken (read, not run)

`scripts/test-v2.mjs`, by reading only:

| Line | Check | Why |
|---|---|---|
| 4140-4175 | first run: sample request approved and launched from the Requests tab | clicks `[data-decision="Approve"]` (now "Approve only" for an owner who may launch), waits for "Approve without evidence?", "Add evidence"/"Add link" (the shared review has no add-evidence control), "Recorded by Align at revision 1", "Approved, agents still on v1 until launch", "Launch version 2 to agents", "Launched, agents on v2" |
| 7538-7542 | B9: approve then not yet, owner sees it under Waiting on you | reads `main section` whose `h2` is "Waiting on you" (sections are now headings in one list) and expects "Not launched yet: Fran Lead decided not yet" (the review says "Approved, not yet launched" and "Approval is not launch: …") |
| 7618-7624 | B12: sample Requests tab | expects "You proposed a change"; the review says "You asked to change". "No other requests of yours. Yours that need you are under Waiting on you." is kept verbatim |
| 5415, 5430, 5437, 5446 | value card on the goal page at 1000px (R) | after R's defect-4 gate only the approver (V3) sees `[data-value-card]`; the browser is V1, so `waitForSelector` at 5415 times out |
| 5088 | goal activity card (S) | matches `/Active now\s+1/`; the label is now "Reported activity, last 90 min" |
| 3783-3797 | 44px buttons at 390 incl. Requests | expected to pass: review buttons are `max-sm:min-h-[44px]`; hidden secondaries have height 0 |
| 4204 | empty Requests says "You have not proposed a change" | kept verbatim, should pass |

The goal page's own request cards (`5506-5543` and the U/B checks that call `cardText` on a goal page) still render main's `ChangeRequestCard`: unchanged here.

## After-set (both themes)

`~/liminal/.private/align-lim2472/I-base/dark/` and `…/light/`: 74 screens each, 438 PNGs each, same numbers and framing as the before set (`shots.jsonl` in each folder), all 74 `ok:true` in both themes. The theme comes from `prefers-color-scheme` (the build's default is System); the capture script found no theme `<select>`, so it set none.

- Produced with a copy of the before set's `capture.mjs` adapted to the shared review (kept outside the repo at `/tmp`, deleted at clean-up): "Approve only" instead of "Approve", "Confirm: Approve only", Launch and Not yet through their confirmation, cards found by "asked to change <goal>", phone secondaries via the main row. The unmodified script on this base logs `ok:false` for 13-26, 53-56, 58-63 and 65-67, because it clicks main's `[data-decision="Approve"]` and waits for "Approve without evidence?".
- State names that differ from the before set: 13 `approve-only-chosen-no-evidence` (no "Approve without evidence?" prompt; the confirmation says it), 19 `no-add-evidence-control` (the shared review has no Add evidence; the link in 20 was added through the API as the owner), 21 `confirm-approve-only`. 18 is Approve and launch chosen; 17 Withdraw.
- Pending the concept: Home (08, 25, 38, 50, 56, 69, 72) and the workspace shell on every signed-in screen. These are this base's rendering only, not the after.

## D2 walk on the base

How: one `next dev` at a time (Mode L, `ALIGN_TEST_IDP=1`, fresh `ALIGN_DATA_DIR` per pass) on the final base `0107890`, seeded with `design/prototypes/lim-2472/s/seed-agent.mjs` (owner Mara, member Theo, viewer Ines). Real Chrome through Playwright: real clicks, real Tab and Enter presses, real POSTs. Per theme: 20 signed-in routes x 3 roles + 4 signed-out routes, each at 1440x900, 390x844 and 320x640 (192 page reads, each with a full-page screenshot; keyboard walk at 1440 and 390), plus the review flows. Screenshots and raw results (`audit-<theme>.json`, `flows-<theme>.json`, `err-dark-light.json`) are in `~/liminal/.private/align-lim2472/I-base/walk/`. Verified = measured or seen in the walk; Suspected = a reading, or something the walk could not settle.

Routes: `/app`, account, devices, device, people, alignments, asks, spend, requests, record (workspace, `?cr=`, `?goal=`), work (all, `?goal=`), apps, sessions, dependencies, a missing workspace, a missing route, a bad invite; signed out: sign-in, request-access, trust, privacy.

### What held (both themes, Verified)
- Choices come only from `cr.can`. On Requests and on the record, for owner, member and viewer, at 1440 and 390, the offered choices equal `choicesFor(cr.can)`: 42 of 42 checks per theme. Owner on a pending request: Approve and launch (pink, dominant), then Approve only, Accept if…, Suggest a change, Decline. Member (requester): Withdraw. Viewer: no buttons, and "Not yours: Mara Quill can decide on it." / "Not yours: Mara Quill can launch it."
- Approve only on Requests: "Recorded: you approved revision 1. It is not launched yet." (green), then Launch v2 and Not yet appear in place, and Launch v2 records "you launched version 2". Approve and launch on the record: "Recorded: you approved revision 1 and launched version 3."
- Choose, Cancel, the choices return, choose another, its input shows: on Requests and the record, at 1440 and 390, both themes (at 390 on Requests the second choice comes from More actions). Back from Launch or Not yet returns the choices. This was broken on `a6ff222` (the action row vanished); `d1d0ca1` fixed it and the walk confirms the fix.
- Phone consequence line at 390 (Requests and record): Approve only reads "Approves revision 1. Nothing is released until someone launches it."; Approve and launch reads "Approves revision 1 and releases version 2." (the goal was at version 1).
- Refusals are red (`--st-declined`) and take focus:
  - a stale second tab: "Not recorded. You declined this request, so nothing changes. Nothing was sent. …" (the client re-read caught it, no POST);
  - a 404 when the workspace was deleted under a staged decision: "Not recorded. Not found. Nothing changed.";
  - a 403 when the member was made a viewer under a staged Withdraw: "Not recorded. Viewers can look but not change anything. Nothing changed." (dark; see I2 for light).
- No sideways scroll at 320 on any read. No positive `tabindex`. Every Tab stop shows a 2px focus ring, except the one in L4. The page's `data-theme` matched the theme on every read.

### Findings

| # | Sev | Tag | Flow | Width | Theme | Role | Issue | File:line | Screenshot |
|---|---|---|---|---|---|---|---|---|---|
| H1 | High | Verified | Shared review, retryable failure (network drop; a 503) | 1440 | both | owner | The retry notice is orchid/purple, not amber. Its border is `--st-pending` (dark 217,117,255; light 147,18,184). The foundation has `--st-retry` (amber) for this, and the brief says retryable errors are amber. The copy is right ("Not recorded yet. … Nothing changed; try again."). | `app/app/_ui/ds/review.tsx:492` (`NoticeLine`) | `dark-flow-48-retry-amber-1440.png`, `light-flow-48-retry-amber-1440.png` |
| M1 | Medium | Verified | Record with another workspace's request id (`/record?cr=<ws2 id>`) | 1440 | both | owner | There is no not-found message. The page shows an empty single-request record, "Everyone (0)", and "Nothing has happened on this change request yet". That is false: this is not this workspace's request. Nothing from the other workspace leaks. | `app/app/_ui/ds/decision-record.tsx:249` (and how the record treats an unknown `cr`) | `dark-flow-54-record-other-ws-cr-1440.png`, `light-flow-54-record-other-ws-cr-1440.png` |
| M2 | Medium | Verified | Primary and selected controls in dark: Approve and launch, Launch v2, Withdraw, Sign in, Create invite link, Newest first, Appearance "Dark" | all | dark | all | White on `--accent` #e90095 is 4.29:1 for 13-15px labels (4.5 needed). Light (#bf0078) passes. | `app/globals.css:35,42` | `dark-owner-requests-1440.png`, `dark-owner-account-1440.png` |
| M3 | Medium | Verified | Evidence links in the review and the record; the record's "Change to …" links | 390 | both | all | 18-20px tall at 390, under the 44px rule. They are list-row links, not words inside a sentence, so the inline-text exception does not apply. | `app/app/_ui/ds/review.tsx:91`, `app/app/_ui/ds/decision-record.tsx:65,147` | `dark-owner-requests-390.png`, `dark-owner-record-390.png` |
| M4 | Medium | Verified | Requests tab, adding evidence | all | both | owner, member | The shared review has no Add evidence control (`cr.can.add_evidence` is never used). The Requests tab lost main's "Add evidence / Add link", so evidence can only be added from the goal page. | `app/app/_ui/ds/review.tsx` (ReviewBody evidence section) | `I-base/dark/19-requests-no-add-evidence-control-1440.png` |
| M5 | Medium | Verified | Sample request text on Requests and the record | all | both | all | "…approve it (then launch it, which is when agents get the new version)…". Align releases a version; it does not see agents get it. Server copy. | `lib/v2/sample.ts:26` (server) | `dark-owner-requests-390.png` |
| M6 | Medium | Verified, pending the concept | Workspace shell on every signed-in page | 390 | both | all | Header links Align, Devices and Account are 22-26px tall; tab links are 37-38px. The workspace select's border is 1.64:1 (dark) and 1.34:1 (light), under 3:1. | `app/app/_ui/kit.tsx:156-157,171,188` | `dark-owner-people-390.png`, `light-owner-people-390.png` |
| L1 | Low | Verified | Compare on the record and on Requests (light) | all | light | all | "Added"/"Changed" marks are 4.45:1 at 12px. A changed row's " · target …" (`--text-3` on `--accent-soft`) is 4.18:1 at 14px. | `app/app/_ui/ds/compare.tsx:26,62` | `light-owner-record-goal-security-1440.png` |
| L2 | Low | Verified | Evidence label detail on Work (light) | all | light | owner, member | The `opacity-90` detail text ("read the goals …", "no goal read yet") is 4.27-4.47:1 at 12px. | `app/app/_ui/ds/evidence-label.tsx:25` | `light-owner-work-1440.png` |
| L3 | Low | Verified | Work "Apps", dependencies "Work", trust/privacy "Trust" | 390 | both | all, signed out | 44px tall but only 34-35px wide. | `app/app/_ui/ds/work.tsx:234`, `app/app/_ui/ds/dependencies.tsx:73`, `app/_trust/doc.tsx:138` | `dark-owner-work-390.png`, `dark-owner-dependencies-390.png`, `dark-signed-out-trust-390.png` |
| L4 | Low | Suspected | Asks, date input | 1440, 390 | both | owner, member | Tabbing to the date input reports `outline: none` on it. Chrome highlights the date segment instead; not checked by eye. | `app/app/w/[ws]/asks/view.tsx:57,217` (kit `Input`) | `dark-owner-asks-1440.png` |
| L5 | Low | Verified | Phone one-row confirmation | 390 | both | owner | On a request with no evidence, Approve only and Approve and launch no longer say "No evidence: the record will say it was approved without evidence." It is shown at 1440 only. | `app/app/_ui/ds/review.tsx:467` | `dark-flow-45-phone-consequence-requests-Approve-only-390.png` |
| L6 | Low | Suspected | Tab order at 1440: Work, Work?goal, dependencies; Sessions (owner) | 1440 | both | all | Focus moves up 166-275px because the right column follows the left (reading order of a two-column layout, probably fine). On Sessions, "Delete shared history" is followed by a "Stop agent" 200px higher. | `app/app/_ui/ds/work.tsx`, `app/app/w/[ws]/sessions/view.tsx:209,247` | `dark-owner-work-1440.png`, `dark-owner-sessions-1440.png` |
| I1 | Info | Verified | Real server 409 | 1440 | both | owner | Not reached through the UI. A stale tab's Decline after the goal moved to a new version was accepted (200): the server allows declining a request that is behind. While a request is open, the owner's new version of that goal is itself refused (409), so the goal can't be moved under a staged approve. The 409 branch (red, "Here it is as it stands now.") is the same `catch` as 403/404 in `send`; read, not run. The files named `*-409-*` show these 200s. | `app/app/_ui/ds/review.tsx` (`send`) | `dark-409-Decline-1440.png`, `dark-flow-49-stale-409-1440.png` |
| I2 | Info | Verified | 403 in light | 1440 | light | member | Not set up: the dark run's refused Withdraw left Theo's request open, so the second request on that goal was refused. The 403 tone and copy come from the same tokens in both themes; dark is Verified above. | – | `dark-403-1440.png` |

Counts: High 1, Medium 6 (one pending the concept), Low 6 (two Suspected), Info 2.

## Needed outside my files (listed, not changed)

- `_ui/ds/review.tsx` (S): retry notice on `--st-retry` (H1); an Add evidence control driven by `cr.can.add_evidence` (M4); 44px evidence links on phones (M3); the no-evidence line in the phone confirmation (L5).
- `_ui/ds/decision-record.tsx` (S): a real not-found for an unknown `cr` (M1); 44px object and evidence links on phones (M3).
- `_ui/ds/compare.tsx`, `_ui/ds/evidence-label.tsx` (S/foundation): light-theme contrast (L1, L2). `_ui/ds/work.tsx:234`, `_ui/ds/dependencies.tsx:73`, `app/_trust/doc.tsx:138`: 44px width (L3).
- `app/globals.css` (foundation): dark `--accent` vs `--text-on-accent` at 4.29:1 (M2).
- `_ui/kit.tsx` shell: header links, tab links, workspace select (M6), pending the concept.
- Server: `lib/v2/sample.ts:26` sample copy (M5); `lib/v2/launch-words.ts:12` "Launched, agents on v…" is still the MCP record's wording (SERVER_ASKS 6; not shown on the screens walked here).
- Fields: none. The shared review needed nothing the Requests tab doesn't already fetch.
