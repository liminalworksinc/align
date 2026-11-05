# LIM-2472 integration base: report

Branch `agent/LIM-2472-integration`. App at `components/legacy-project-wrapper/implementation` (paths below are relative to it unless they start with `design/`). Base of the whole set: `main` at `b16f8d1`.

What the base holds at `a5fbe8e`: foundation (through `d0f6dbe`), Stream R (`3cc0f71`), shared surfaces (through `f98dd2a`), concept A's rail shell, review drawer and Home parts (through `b2c02dc`), and Mini S1's list and desk taken by path (`f4a7609`). Home follows the founder's direction of 2026-11-05 (`~/liminal/.private/align-lim2472/brief/DIRECTION.md`): one ranked "needs a human" list with evidence, then Since you last looked, then Goals. Requests is the decision desk, and both open the same review drawer.

Read the sections in order of date. "Direction: Home and Requests" below is the current state. The D2 walk sections, including the coverage table, were run on earlier bases: Home and the shell were out of scope there, and Requests was still the review list, so they do not describe Home or the Desk. The final state is in "Final head" just below; read that first.

## Final head (on top of `67db56b`)

### What this last push changed
- **Work, failed reads (`_ui/ds/work.tsx`).** A failed read no longer reads as an absence. `useLaunched` now says when the launched-request read or the `…/value` read failed.
  - `…/value` fails: "Align sent it to" says "Not read just now. Reload to try again." It used to say "No app yet…", which was false. The per-app rows already stayed silent on a failed read: they show a receipt only for a listed app and never a negative. The panel's note now says the same "not read" line.
  - A real empty list still says "No app yet…". A non-empty list is unchanged.
  - Same trap, also fixed: when the approved change-request read fails, the Launched row said "Nothing launched…" and the Connected apps note said "Nothing is launched on this goal yet…". Both now say "not read".
  - Same trap, also fixed: the note "…none is connected" showed while `/apps` was loading or had failed. It now needs an answered `/apps` read, and the note waits for the launch reads.
- **Home, viewer link.** "Create a goal" is hidden for viewers on the empty goals state. `view.tsx` passes `role` to `GoalLines`. It reads `/api/v2/workspaces` only when the goals list is empty, so a normal Home makes no extra read. Unknown role: no link. Owners and members keep it, and it reaches the New goal form on `/goals`.
- **Checks added:** `design/prototypes/lim-2472/integration/work-delivery.check.mjs` and `goal-line-delivery.check.mjs`. `b/needs-check.mts` updated to the `b0d47c8` version.

**One commit on top of `d20857c`:** a non-owner's app lists are their own, so Work, Apps and the evidence facts no longer make whole-workspace claims from them; the goal page says when its sessions read failed; "you can see" wording on Dependencies and the record. `work-delivery.check`: 12 failed on `d20857c`, all 34 rules pass after. The audits below were not re-run on it.

### Results
- `work-delivery.check`: 9 failed on `67db56b`, all 19 rules pass on this tree.
  - Failed read: owner and member, no "No app yet", no "not sent", no receipt, and it says not read.
  - Real empty list: viewer still sees "No app yet".
  - No goals: viewer has no "Create a goal"; owner and member keep it.
- `goal-line-delivery.check`: pass. With `…/value` held for 2 s a cold load shows no delivery fact; a soft return keeps the earlier true Receipt and never shows Not observed; a 500 shows no delivery fact. So the suspected truth flash does not exist: `goalFacts` adds delivery facts only for a truthy value, and no fix was made.
- `first-run-load.check`: pass. `needs-check`: exit 0, 25 PASS. tsc and eslint clean.
- On `5fa3297`: `chips-320` 298 chips; partial heading 10 of 10; five real-POST writes (Accept if…, Suggest a change, Decline, Withdraw, Not yet), each with its notice and timeline event; light focus return from Home and the Desk. No console errors. These were not re-run after the two later commits, which touch only the first-run sentence, Work's delivery rows and the viewer link.

### Audit on production `67db56b` (replaces the "ran on `0107890`" limit)
`next build`, then `next start`. 22 signed-in routes x 3 roles + 4 signed-out = 70 pages, both themes, 1440, 390, 320: 420 rows. Taken one commit before this head.
- Original 64 pages: 384 rows, 366 at 200 and 18 at 404 (all the deliberate `err-route-404` page). Sideways scroll 0, page errors 0.
- Home and the review link (6 pages): 36 rows, all 200. Sideways scroll 0, page errors 0.
- Under 44px on phones, original 64: the logo (45x24), the "Apps" and "Work" header links (34x44) and "Trust" (35x44). None new against the earlier audit.

### Tap areas on Home, 390 and 320 (`elementFromPoint` at 21px from centre)
- Pass all four ways: "All goals" (tap area 68x44) and the goal-line pill.
- Short by one dimension, left for round 2: the goal line's "Work" link (39x44) and the logo (45x24).

### Reads on Home's first paint, production `67db56b`, owner, agent-only seed (3 goals, 1 launch)
16 API reads, `…/value` 2 for 1 unique URL. `/home`, `/change-requests`, `/goals` and `/workspaces` 2 each; `/goals/<g>/requests` 3; `/asks`, `/alignments`, `/apps` 1 each. Measured, and it replaces the estimates under "Checks on this head". `NeedsList` still reads `…/value` itself rather than through the shared cache, which accounts for the repeat.

### Fonts, production `67db56b`
- Space Grotesk and Space Mono are self-hosted: files come from `/_next/static/media/`, and the only host contacted across sign-in and Home was the app's own. No request to `fonts.googleapis.com` or `fonts.gstatic.com`.
- A build that can't reach Google fails (tried with a dead proxy: exit 1, "Failed to fetch Space Grotesk from Google Fonts"). `next dev` instead logs the error and renders the fallback (read from Next's loader, not tried). The deploy's build needs Google once; the running site never does. Whether the Fly build has that network access is not checked.

### Corrections to earlier sections
- Merged since this report's last update: `6b88db7`, `b0d47c8`, `3ba2276`, `2c5dee1`, `b0fb5a6`, `14ec06c`, `08e39c9`.
- The `onCount` local delta on `needs-list.tsx` is gone: it is upstream in Mini S1's file.
- Removed from Home since: the Connect drawer and the role note. First run stays: a compact panel above the list when goals exist, the full panel when none do, and "Hide the steps" is a local toggle, not a dismiss. Home's only `data-home-*` hook left is `data-home-count`.
- First run calls `onSeen` only when this mount first saw no app, which ended the double load (`/home` reads 7 to 4 in dev).
- Consent page: main's files plus `PAGE_H1` and its import only. Files outside `app/app/**` are seven: `app/globals.css`, `app/layout.tsx`, `app/global-error.tsx`, `app/_trust/doc.tsx`, `app/trust/page.tsx`, `app/oauth/authorize/page.tsx`, `app/oauth/authorize/AuthorizeForm.tsx`.
- Restoring the consent restyle: `a356ca9` on `agent/LIM-2472-consent-restyle` is an ancestor of this branch, so a PR from it shows no diff. After this merges, branch from main and run `git checkout a356ca9 -- ` on those two files.
- `test-v2`: "You have not proposed a change" is gone (4201 breaks). 5660, 8939 and 8952 don't break. 3774, 3843 and 4194 do. Full list: `~/liminal/.private/align-lim2472/pr/TEST-DELTAS.md` (33 checks).
- The CSP note on the display face stands.

## Merges and resolutions

| Merge | Into | Result |
|---|---|---|
| branch created from `origin/agent/LIM-2472-rest-of-app` `3cc0f7107b8abc537017f2e6fcf45394d88a94fd` | new branch | – |
| `origin/agent/LIM-2472-shared-surfaces` `a6ff222774145a9173744c73eacd93a48e8d3f24` | `b866da046c2abbf961b1f3b953221f24f5ee9d88` | clean. R changed 39 files, S 22, none in common (merge base `6b76a16`) |
| `origin/agent/LIM-2472-foundation` `e6ea12458ce318b6661c5573fdf6be37438f66ef` (kit `Btn`/`Input`/`Select`/`TextArea`) | `519ad538c5b447feda1f9e664ee87bb75b905e1a` | clean, `app/app/_ui/kit.tsx` only |
| `origin/agent/LIM-2472-shared-surfaces` `db544d3e17dea486e5d1e64946eb068d12e95817` (contains `d1d0ca1`: ReviewActions returns to the choices after Cancel or a decision; compact phone confirmation on one row; one consequence line) | `010789001fecb7878e482e059d6de531067f0b10` | clean, `_ui/ds/review.tsx` and `_ui/ds/decision-record.tsx` only |
| `340ead6cc6b4a1c5d7ef9e39073dce35af64d657` (notices: retry amber, refused red, done neutral; unknown `cr` on the record says so; 44px evidence and object links on phones, rel `noopener noreferrer`; Add evidence back in ReviewBody behind `onDone`) | `eeed05cf3c9cde9a75419901466e303452f8e37c` | clean, `_ui/ds/review.tsx`, `_ui/ds/decision-record.tsx`, `_ui/ds/work.tsx` |

| `d482bc1e2da23654f275d9999127640637172923` (Add evidence's refusal kept in ReviewBody outside the `add_evidence` gate; record events for withdraw, supersede and accepted counters; unknown goal on the record) | `dd0bca27ffb1bb3be1f9f507da946e2252e5d676` | clean: `review.tsx`, `record-events.ts`, `decision-record.tsx` |
| `327ec1c0ae7a704d7912f6d33f155aacc35f6e67` (44px phone minimum on every input, select and textarea in the review) | `246df2fdbf2a175e05cbfdb3eba1b348a69345f0` | clean: `review.tsx` |
| foundation `6a97ca9144bb31531239da65fe56eb6b5f9f3830` (dark `--accent` #BF0078, `--accent-hover` #94005C) | `b797d8286d7422e2d23dc058a9642f1ce30f8627` | clean: `globals.css`, `LIM-2472-FOUNDATION.md`, `foundation.html` |
| `46cd27f58bca85b6d4a14fc474bce336d4f42e2e` (contains `6a97ca9`; thin marks to `--accent-text`: Work and Dependencies selected goal, Confirm panel border) | `7f74d799219016ea932fdcca8fa5fed945d3a926` | clean: `work.tsx`, `dependencies.tsx`, `review.tsx` |
| `45bfc92b8a736e19967616b5a39e64336b28b389` (contains foundation `da51b0c`: the ring is `:focus-visible:not([tabindex="-1"])`, plus a base-layer `[tabindex="-1"]:focus { outline: none }`) | `50a8dc7fb41d6db202352960cd6c5f8ec61cf72c` | clean: `globals.css`, `ds/data-table.tsx`, `LIM-2472-FOUNDATION.md`, `foundation.html` |
| `4c7cd1532534ba016a251eeaedb7c198c1d9d2d3` (contains foundation `3b90f1a`: DataTable `th` nowrap; EvidenceLabel icon and word kept together) | `9a4c3a82ea3f3799ecfae651804ecab171e97787` | clean: `ds/data-table.tsx`, `ds/evidence-label.tsx` |
| `eb1b357221b6be23b68325f152eaa1b2727bad14` (contains `4c7cd15` and foundation `1a4e6d7`: no outline-colour transition on Segmented and kit `Btn`) | `4ba62b0ad85f87e1599911f9d0ae1cda63f5ef7a` | clean: `ds/segmented.tsx`, `kit.tsx` |
| concept A `3f90b9cad56136c17a11b27b060788c2396242f7` (rail shell, review drawer, first run, A's Home as the starting file) | `1ce4a1a1e8dd3adb62355af7151867775dae78ff` | clean: `kit.tsx`, `w/[ws]/view.tsx`, `w/[ws]/first-run.tsx`, `w/[ws]/review-drawer.tsx`, `design/prototypes/lim-2472/a/*` |
| foundation `27a686b5c541db46d457f121acc0dd0d62336d04` (`NeedRow`, `NeedList`, `NeedAction`) | `9645fcd3364f7c2c4fcf737101a378e1996e187c` | clean: `_ui/ds/need.tsx`, `_ui/ds/index.ts` |
| foundation `b69d7e1dfac3778b3c76261d2a8dd03fcc729085` (finished NeedRow, `EvidenceLabel kind="self"`, `need-list.html` specimen) | `01c06a33ab6e58da7ff691b91f1902273f685932` | clean; the merge followed the foundation note's rename |
| concept A `7b77ae26ea918db53abc2e4291850f1b8e89ad9d` (`_ui/home/since.tsx`, `goal-lines.tsx`, `cr-status.ts`; drawer's Not found and Try again states) | `2605b8161ebf56138b80592a74b19e11222bb767` | clean, one auto-merged hunk in `review-drawer.tsx` |
| foundation `13fcfe802e982db218404d3f4520e9484c75789e` (foundation report at the design/ path at the source) | `8e0d5dde4537c68715d860a806a2111a39368856` | clean; the root file did not come back |
| shared surfaces `7413f0b20df22e8cca32b4c4531cc5f0ef00110d` (`EvidenceSummary`, `changeFacts`, `goalFacts`) | `4b9fd0e657c98d5f34ef5a9ab74eaa820a381c17` | clean |
| foundation `66795179b83f560edf17d1b533286767e80612e6` (specimen only) | `cbb085f88f8d4dbfbdacd252b446ec96c02311cf` | clean |
| shared surfaces `b2de51e0f693d3a11d495f9ae0c423c73bd7fd33` (`DecisionLinks`; the review as a cold arrival at `/record?cr=`; two audit Lows) | `bb8a9c981730b8f548c4f630147f7e7d4fb5f60c` | clean |
| shared surfaces `968bbac2e7dbc882a7ec60af3a7a3028060f0403` (absence chips removed at the source; `hasEvidence`) | `9e6af787e9a72a73c698667d3aefd08a848c228f` | clean |
| foundation `d0f6dbee2af5f6d3157fea1c9cc3f72f18d36896` (`rankNote` optional, `empty={null}` renders nothing, row fixes at 320) | `c474a734b077cf1724631c52808801ec4d677765` | clean |
| shared surfaces `f98dd2aa68659846fe193bf184da2698ab8d7a58` (review columns named by state; the two post-decision notes; plain seed names) | `d9a06d90c8822cbc38645af8b4e67f08a737f86d` | clean |
| concept A `b2c02dc7393b401bf702fc150636ddf13b9fc7f9` (quiet goal lines; Since leaves out the person's own events; Menu sheet focus) | `9d43944983c9b1d3d2abfb67d8fb40239dc46782` | clean; the drawer's duplicate-link removal survived |

Taken by path from concept B, never merged (its DeskShell, its Home and its DecisionDrawer are not in this base):

| From | Files | In commit |
|---|---|---|
| `5bfa593ad357c5c79b7bfa0c1bd857435db4c637` | `_ui/home/needs.ts`, `design/prototypes/lim-2472/b/needs-check.mts`, `b/seed.mjs` (the check imports it) | `9029dc6b3c5e3d7ceeb269326798b6eb42578e46` |
| `56cfe50c70a5a4804c9fca4019a601b67b1e23a9` | `_ui/home/needs.ts`, `needs-list.tsx`, `_ui/b/{desk.tsx,act.tsx,model.ts,parts.tsx}`, then `needs-check.mts` | `df54c65d7d24aeb5814604188342b16a951766b2`, `bb4ff18c73ce84c9b48a2c56bb1971699e26febd` |
| `d539b486b3caa2501033c6bb3ca263dff09b1309` | `_ui/home/needs.ts`, `needs-list.tsx` | `e55c668a913deda6d5d47d37776bad18b819806c` |
| `f4a7609c39a333459bf13467485ebf275646d90e` | `_ui/home/needs.ts`, `needs-list.tsx`, then `needs-check.mts` | `5888636816de2b57315f38fd390a4dc57b8b4a45`, this report's commit |

No conflicts, so no file needed a side chosen. No rebase, no force push, no stash.

## ADDED / REPLACED / DELETED (whole base against main `b16f8d1`)

110 files on the final head: 61 added, 49 modified, 0 deleted (`git diff --name-status origin/main...HEAD`; main unmoved at `b16f8d1`). No file under `app/api/**`, `lib/**`, `proxy.ts`, migrations or tests is touched.

### Foundation
- ADDED: `app/app/_ui/ds/{data-table,drawer,empty-state,evidence-label,icons,kbd,panel,segmented,status-pill,theme,theme-script,timeline}.tsx|ts`, `app/app/_ui/ds/index.ts` (one import path, `@/app/app/_ui/ds`), `design/prototypes/lim-2472/LIM-2472-FOUNDATION.md`, `design/prototypes/lim-2472/foundation.html` (specimen).
- REPLACED: `app/globals.css` (semantic tokens for both themes: surfaces, text, lines, `--accent`, `--st-*` states, `--focus`, radii), `app/layout.tsx` (theme script before first paint, fonts), `app/app/_ui/kit.tsx` (kit on tokens; `Btn` primary on `--accent`; secondary and `Input`/`Select`/`TextArea` on `--edge` with a 44px phone minimum), `app/app/account/view.tsx` (Appearance setting: System, Light, Dark).

### Stream R (rest of app)
REPLACED (restyle; requests and logic unchanged, see `design/prototypes/lim-2472/r/LIM-2472-REPORT-R.md`): `app/app/view.tsx`, `sign-in/view.tsx`, `request-access/view.tsx`, `account/view.tsx`, `device/view.tsx`, `devices/view.tsx`, `invite/[token]/view.tsx`, `w/[ws]/people/view.tsx`, `w/[ws]/alignments/view.tsx`, `w/[ws]/asks/view.tsx`, `w/[ws]/spend/{view,allocation}.tsx`, `_ui/{reallocations,limits,requests,goalform,missing,error-notice,turnstile}.tsx`, `_ui/value.tsx` (only the value-card approver gate), `app/global-error.tsx`, `app/trust/page.tsx`, `app/_trust/doc.tsx`, and every owned `page.tsx` (loading fallback colour). ADDED: `design/prototypes/lim-2472/r/LIM-2472-REPORT-R.md`.

### Shared surfaces (S)
- ADDED: `_ui/ds/compare.tsx` (Compare, VersionsCompare), `_ui/ds/decision-record.tsx`, `_ui/ds/record-events.ts`, `_ui/ds/read.ts`, `_ui/ds/review.tsx` (ReviewBody, ReviewActions), `_ui/ds/work.tsx` (WorkPanels), `_ui/ds/dependencies.tsx`; routes `w/[ws]/record/{page,view}.tsx`, `w/[ws]/work/{page,view}.tsx`, `w/[ws]/dependencies/{page,view}.tsx`; `w/[ws]/sessions/parts.tsx`; `design/prototypes/lim-2472/s/{LIM-2472-REPORT-S.md,seed-agent.mjs,shots.mjs}`.
- REPLACED: `w/[ws]/apps/view.tsx` (set-up panels, `#connect` anchor), `w/[ws]/sessions/view.tsx` (panel system), `_ui/evidence.tsx`, `_ui/activity.tsx` ("Reported activity", not "Active").

### Concept A and the Needs parts
- ADDED: `w/[ws]/review-drawer.tsx`; `_ui/ds/need.tsx`, `evidence-summary.tsx`, `evidence-facts.mts`, `decision-links.tsx`; `_ui/home/{needs.ts,needs-list.tsx,since.tsx,goal-lines.tsx,cr-status.ts}`; `_ui/b/{desk.tsx,act.tsx,model.ts,parts.tsx}`; `design/prototypes/lim-2472/need-list.html`; `design/prototypes/lim-2472/a/{LIM-2472-REPORT-A.md,seed.mjs,shots.mjs}`; `design/prototypes/lim-2472/b/{needs-check.mts,seed.mjs}`; `design/prototypes/lim-2472/s/evidence-facts.check.mjs`.
- REPLACED: `_ui/kit.tsx` (Shell: the rail, and a top bar with Menu on phones), `w/[ws]/view.tsx` (see "Direction" below), `w/[ws]/first-run.tsx`.

### This step (integration)
- MOVED: `LIM-2472-FOUNDATION.md`, repo root → `design/prototypes/lim-2472/LIM-2472-FOUNDATION.md`. Every branch adds it at the root, which is outside the allowed paths. A later merge of a foundation branch that edits it should follow the rename; check that it does.
- The review drawer's "Work and evidence for this goal" link went to `/app/w/<ws>/work?goal=<goal>` at `768bda9`, and was later dropped with the drawer's other link: `DecisionLinks` in ReviewBody carries both now.
- REPLACED (first step, since superseded by the Desk; see "Direction" below): `app/app/w/[ws]/requests/view.tsx`. Each change request was the shared review from `@/app/app/_ui/ds` in a ds `Panel`: `ReviewBody {ws, cr, me, titleOf}` over `ReviewActions {ws, cr, me, onDone: reload, compact}`, with "Goal" and "Record" links (44px on phones). The tab no longer imports `_ui/decide.tsx`, `_ui/crparts.tsx` or `_ui/changes.tsx` (those files are unchanged; the goal page still uses them).
  - Same two reads as before: `GET /api/v2/workspaces/<ws>/change-requests` and `GET /api/v2/workspaces/<ws>/goals` (the goal titles that `useGoalTitles` read, now read in the tab itself for `titleOf`). No new API call. Every decision is the shared review's own POST to `…/change-requests/<id>/<action>`.
  - The three sections are headings in ONE flat keyed list, so a request that moves section after a decision keeps its `ReviewActions` mounted and its "Recorded: …" or "Not recorded. …" notice stays on screen (main's card kept notices in a module map, `crparts.tsx:496`; the shared review keeps them in component state). Cost: the sections are no longer `<section aria-label>` landmarks; each is an `h2` with an id.
  - Fields: the shared review needs nothing the tab doesn't fetch (`ChangeRequest` from the list carries `can`, `revisions`, `diff`, `condition`, `launch`, `behind`).
- `f0d3def30adabc91bcd340c32af226c92f1763d9`: the tab passes `onDone` to `ReviewBody`, so people that `cr.can.add_evidence` allows get Add evidence on the Requests tab again (main's POST, https only, label up to 120).
- ADDED: this report.

## test-v2 checks likely broken (read, not run)

Superseded: the current list is `~/liminal/.private/align-lim2472/pr/TEST-DELTAS.md` (33 checks). See "Final head" for what changed from the table below.

`scripts/test-v2.mjs`, by reading only:

| Line | Check | Why |
|---|---|---|
| 4140-4175 | first run: sample request approved and launched from the Requests tab | clicks `[data-decision="Approve"]` (now "Approve only" for an owner who may launch), waits for "Approve without evidence?" (the "Add evidence" / "Add link" buttons, url input and 120-character label input are back since `340ead6`, so that part should pass), "Recorded by Align at revision 1", "Approved, agents still on v1 until launch", "Launch version 2 to agents", "Launched, agents on v2" |
| 7538-7542 | B9: approve then not yet, owner sees it under Waiting on you | reads `main section` whose `h2` is "Waiting on you" (sections are now headings in one list) and expects "Not launched yet: Fran Lead decided not yet" (the review says "Approved, not yet launched" and "Approval is not launch: …") |
| 7618-7624 | B12: sample Requests tab | expects "You proposed a change"; the review says "You asked to change". "No other requests of yours. Yours that need you are under Waiting on you." is kept verbatim |
| 5415, 5430, 5437, 5446 | value card on the goal page at 1000px (R) | after R's defect-4 gate only the approver (V3) sees `[data-value-card]`; the browser is V1, so `waitForSelector` at 5415 times out |
| 5088 | goal activity card (S) | matches `/Active now\s+1/`; the label is now "Reported activity, last 90 min" |
| 4135-4175, 7537, 7618 (again) | the same Requests checks | since the Desk replaced the review list, these read a table: "Waiting on you", section `h2`s and the review cards are gone from the tab until a row opens the drawer |
| 4184-4187, 6621-6623 | new workspace opens on Home, "Know what needs you", tiles | Home no longer has that heading or the tiles |
| 5876, 6611-6617, 6658-6659, 6682, 6714, 6749-6751 | `[data-home-summary]`, `[data-home-app]`, `[data-home-item]`, `#waiting` | those hooks left with A's Home and the panels removed for the direction |
| 5905-5906 | first run "Two ways to start" on the owner's Home | not read against the new Home; first run is Mini S0's lane |
| 3783-3797 | 44px buttons at 390 incl. Requests | expected to pass: review buttons are `max-sm:min-h-[44px]`; hidden secondaries have height 0 |
| 4201 | empty Requests says "You have not proposed a change" | breaks: the Desk says "No change requests yet" |

The goal page's own request cards (`5506-5543` and the U/B checks that call `cardText` on a goal page) still render main's `ChangeRequestCard`: unchanged here.

## Direction: Home and Requests (current state, `a5fbe8e`)

### What changed
- **Home (`w/[ws]/view.tsx`).** In this order: the H1 count ("5 things need you", "1 thing needs you", "Nothing needs you"; "Needs you" while reads are in flight or when a failed read leaves zero unknown), `NeedsList` with `heading={false}`, `Since`, `GoalLines`. The connect note appears only when nothing is connected. The header has "Connect an agent" only when no app is connected and that note isn't carrying it.
- **Removed from Home (code deleted):** A's Needs-you cards and rail, `NextCard`, `changeCard`, "Work by goal", `GoalGroup`, `SessionRow`, `Delivered`, teammates' sessions, the connected-apps panel, the "Command center" kicker, the subline with its apps clause, the "Read it as" legend, and my interim `NeedRow` rendering and `app_behind` filter.
- **404 on Home's read.** The page checks membership on the server before Home mounts. If Home's own read returns 404 (removed while Home is open), Home now renders `NotInWorkspace`.
- **Requests (`w/[ws]/requests/view.tsx`).** The tab is `Desk`, with the same `ReviewDrawer` Home uses. `RequestReview`, its Panel list and the goal-titles read are deleted. The flat keyed list from `19b27b9` went with them; the drawer stays mounted through a decision, so the notice still survives.
- **Review drawer (`w/[ws]/review-drawer.tsx`).** `useReview` moved here and now reads `useSearchParams`, so a plain link from a row opens the drawer on any page. It honours `&choice=`, passed to `ReviewActions` as `initialChoice`. The drawer's own record and work links are gone: `DecisionLinks` in ReviewBody is the one set. One drawer in the app; B's DecisionDrawer is not in the base.
- **Stable `onClose` on Home and Requests.** `ds/drawer.tsx` re-takes focus whenever `onClose` changes, which pulled focus off a notice that had just taken it. The hosts pass a stable callback; the Drawer itself is unchanged.

### One screen H1 (`bfaa8f5`; founder ruling LIM-2454 0e0f6774, item 4)
`PAGE_H1` in `app/app/_ui/page-title.ts` is the one class (display face, 32px, 28px on phones). The foundation has no primitive for this. Screens add only their own spacing beside it; don't re-add a face, size or colour to an `h1`. This edit touched the H1 class only.
- **Screens on it, outside integration's own files, so owners don't re-diverge:**
  - S: `w/[ws]/sessions/view.tsx`, `apps/view.tsx`, `record/view.tsx`, `dependencies/view.tsx`, `work/view.tsx`
  - R: `app/view.tsx`, `sign-in`, `request-access`, `invite/[token]`, `account`, `device`, `devices`, `w/[ws]/people`, `alignments`, `asks`, `spend`, `_ui/missing.tsx`, `app/trust/page.tsx`, `app/oauth/authorize/{page,AuthorizeForm}.tsx`
  - Main's: `w/[ws]/goals/view.tsx`, `goals/[goal]/view.tsx`
  - Ours: `w/[ws]/view.tsx` (the count, its neutral reading state and "Nothing needs you"), `w/[ws]/requests/view.tsx`
- **Measured** on 21 screens at 1440, 390 and 320 (owner, and signed out): 32px / 28px / 28px, `"Nineties Headliner"` first in the computed family, no sideways scroll. Read, not rendered: `invite/[token]` (needs a real token) and `AuthorizeForm` (needs a real client).
- **The face does NOT load as a webfont.** `--font-display` resolves to `"Nineties Headliner", "Perfectly Nineties", "Iowan Old Style", Georgia, serif`, with no Anton (`globals.css` names it only in a comment). But `globals.css:8-12` is `@font-face { src: local(...) }`, the comment says the font is "NEVER committed to this public repo", there is no font file in the repo, and `next/font` loads only Space Grotesk and Space Mono. The ruling's words are "load Nineties Headliner as a webfont". On this Mac the face is installed, so it renders; on a machine without it the H1 falls through to Perfectly Nineties or a serif. Foundation's to resolve, and the two statements need a founder ruling.

**Viewer connect.** Home no longer offers a viewer "Connect your agent" or the header "Connect an agent" (`AuthorizeForm.tsx:15,119`: viewers can't connect apps). Nothing is offered until the role is known, from `GET /api/v2/workspaces`, the read the shell already makes, so Home adds one read. A viewer keeps the note's second sentence. A freshly invited member still gets the offer. `NeedsList`'s notice says "See apps", which is not a connect offer.

### Notes for the PR body
**OAuth consent page (read this one on its own).** `app/oauth/authorize/page.tsx` and `AuthorizeForm.tsx` are main's files plus one change each: the `h1` takes `PAGE_H1` and the file gains that import. No wrapper, no wordmark, no token swaps, no logic, form, handler or header change. The fuller restyle is saved on `agent/LIM-2472-consent-restyle` (`a356ca9`). It depends on the theme tokens, so it can only merge after this candidate, as its own PR.

Rendered on the new tokens, dark and light, 1440 and 390: consent, signed out and the unknown-client error. Readable, no text under 4.5:1, no sideways scroll. Main's `--al-bg` and zinc classes resolve through the theme. One visible difference: the signed-out "Sign in" link stays `bg-violet-700`, which renders orchid (dark `#d975ff`, light `#9312b8`), not the pink primary. "Allow access" is pink. Screenshots: `I-compose/consent/`.

**Other files outside `app/app/**`:**
- `app/globals.css`: the semantic theme tokens for dark and light, `--focus` and the focus ring rule, `--al-display` without Anton, `@font-face` for the display face.
- `app/layout.tsx`: drops the Anton `next/font` import; adds `THEME_SCRIPT` before first paint, `data-theme` and `suppressHydrationWarning` on `<html>`.
- `app/global-error.tsx`: the `<body>` takes `bg-(--bg-page)` and `text-(--text-1)`.
- `app/_trust/doc.tsx`: theme tokens, 44px nav and contents links on phones, long URLs break instead of scrolling sideways.
- `app/trust/page.tsx`: theme tokens, and the `h1` takes `PAGE_H1`.

**The display face.** Screenshots from this iMac show the real Nineties Headliner because it is installed here. A tester's machine won't show it until the private host lands (LIM-2454 1cb2b974); until then it falls through to Iowan Old Style or Georgia. The current CSP is only `frame-ancestors` (`proxy.ts:37`, `next.config.ts:16`), so `font-src` blocks nothing today.

### Local delta on Mini S1's file
`_ui/home/needs-list.tsx` carries one addition on top of `f4a7609`: an `onCount?: (n: number | null) => void` prop and one `useEffect`, marked "Local delta (integration)". It reports Needs-you rows only, and null while reading or when a read failed and the rest found nothing. Home's H1 reads it. A by-path re-take drops it, and the H1 then stays on "Needs you". It has been asked for upstream.

### Checks on this head
- **`needs-check` on `f4a7609`'s `needs.ts`** (fresh server, real API, its `needs-check.mts` from `f4a7609`): exit 0, 22 PASS, 0 FAIL. Owner 13 rows and 1 notice; member 9 rows and 1 notice; viewer 9 rows and 0 notices. Owner by phase: Needs you 5 (2 launch, 2 decide, 1 app_behind), Waiting on others 3, Done 5. Home's filters show the same 5, 3, 5. The earlier 14 / 10 / 9 counted the never-read app as a row; it is a notice now.
- **Reads on Home's first paint** (dev server, 1440, owner; waited for the H1 count, then 1.5s):

| Read | Dev count | Production estimate |
|---|---|---|
| `…/value` | 4 (2 unique URLs) | 4 |
| `…/goals/<g>/change-requests?state=approved` | 18 | 9 |
| `…/goals/<g>/requests` | 9 | 9 |
| `/change-requests`, `/home`, `/goals` | 4 each | 2 each |
| `/asks`, `/alignments`, `/sessions`, `/workspaces` | 2 each | 1 each |
| All API reads | 51 | about 32 |

  Member and viewer: `…/value` 4, all reads 48. The estimate rests on dev mode doubling effects that fire on mount only: reads that start on mount double, and reads that start after another read resolves don't. No production build was run, so these are estimates. An earlier note of about 3 `…/value` reads was wrong: by the code, the 4 are the same 2 URLs read twice, once by NeedsList's send check and once by the goal lines (the count itself was measured; which component made each read was not). That is not per row: `…/value` stays 4 with 13 rows. The `?state=approved` read is one per goal, from the goal lines' EvidenceSummary. Passing `launched` from Home's change-request read would remove both repeats (Mini S0's file).
- **Quick pass on `a5fbe8e`** (fresh `.next`, re-seeded, dark): owner, member and viewer Home at 1440, owner at 390 and 320, a real non-member at 1440, and one decision through the drawer. No console errors, no sideways scroll. Non-member: "This workspace doesn't exist or you're not in it", never "Nothing needs you". The decision showed exactly "Recorded: you approved revision 1." (focused) and "Approval is not launch: version 2 is released only when you launch it.", with one set of links. Both notes come from `ds/review.tsx`. Screenshots: `~/liminal/.private/align-lim2472/I-compose/`.

### Open, with Mini S1 (`needs-list.tsx`)
1. The full rank note always shows under its disclosure: line 219 still passes `rankNote`, and the wrapper's CSS no longer hides it after `d0f6dbe`. First row's title: y=204 at 1440, 365 at 390, 429 at 320 (target about 160). Home is 2,097px tall at 390 (target about 1,400).
2. With zero rows, a "Nothing needs you." box still shows under the H1.
3. The same box shows when a source couldn't be read and nothing else was found; the H1 stays neutral there.
4. `onCount` upstream, as above.

Unwalked: `data-needs="unreadable"` never rendered in the pass, because Home's own 404 handling shows first. Supersede on the record is read only.

## After-set (both themes)

`~/liminal/.private/align-lim2472/I-base/dark/` and `…/light/`: 74 screens each, 438 PNGs each, same numbers and framing as the before set (`shots.jsonl` in each folder), all 74 `ok:true` in both themes. The theme comes from `prefers-color-scheme` (the build's default is System); the capture script found no theme `<select>`, so it set none.

- Produced with a copy of the before set's `capture.mjs` adapted to the shared review (kept outside the repo at `/tmp`, deleted at clean-up): "Approve only" instead of "Approve", "Confirm: Approve only", Launch and Not yet through their confirmation, cards found by "asked to change <goal>", phone secondaries via the main row. The unmodified script on this base logs `ok:false` for 13-26, 53-56, 58-63 and 65-67, because it clicks main's `[data-decision="Approve"]` and waits for "Approve without evidence?".
- State names that differ from the before set: 13 `approve-only-chosen-no-evidence` (no "Approve without evidence?" prompt; the confirmation says it), 19 `no-add-evidence-control` (the shared review has no Add evidence; the link in 20 was added through the API as the owner), 21 `confirm-approve-only`. 18 is Approve and launch chosen; 17 Withdraw.
- Pending the concept: Home (08, 25, 38, 50, 56, 69, 72) and the workspace shell on every signed-in screen. These are this base's rendering only, not the after.

## D2 walk on the base

How: one `next dev` at a time (Mode L, `ALIGN_TEST_IDP=1`, fresh `ALIGN_DATA_DIR` per pass) on the final base `0107890`, seeded with `design/prototypes/lim-2472/s/seed-agent.mjs` (owner Mara, member Theo, viewer Ines). Real Chrome through Playwright: real clicks, real Tab and Enter presses, real POSTs. Per theme: 20 signed-in routes x 3 roles + 4 signed-out routes, each at 1440x900, 390x844 and 320x640 (192 page reads, each with a full-page screenshot; keyboard walk at 1440 and 390), plus the review flows. Screenshots and raw results (`audit-<theme>.json`, `flows-<theme>.json`, `err2.json`, `writes-<theme>-<width>.json`) are in `~/liminal/.private/align-lim2472/I-base/walk/`. Verified = measured or seen in the walk; Suspected = a reading, or something the walk could not settle.

Routes: `/app`, account, devices, device, people, alignments, asks, spend, requests, record (workspace, `?cr=`, `?goal=`), work (all, `?goal=`), apps, sessions, dependencies, a missing workspace, a missing route, a bad invite; signed out: sign-in, request-access, trust, privacy.

### What held (both themes, Verified)
- Choices come only from `cr.can`. On Requests and on the record, for owner, member and viewer, at 1440 and 390, the offered choices equal `choicesFor(cr.can)`: 42 of 42 checks per theme. Owner on a pending request: Approve and launch (pink, dominant), then Approve only, Accept if…, Suggest a change, Decline. Member (requester): Withdraw. Viewer: no buttons, and "Not yours: Mara Quill can decide on it." / "Not yours: Mara Quill can launch it."
- Approve only on Requests: "Recorded: you approved revision 1. It is not launched yet." (green), then Launch v2 and Not yet appear in place, and Launch v2 records "you launched version 2". Approve and launch on the record: "Recorded: you approved revision 1 and launched version 3."
- Choose, Cancel, the choices return, choose another, its input shows: on Requests and the record, at 1440 and 390, both themes (at 390 on Requests the second choice comes from More actions). Back from Launch or Not yet returns the choices. This was broken on `a6ff222` (the action row vanished); `d1d0ca1` fixed it and the walk confirms the fix.
- Phone consequence line at 390 (Requests and record): Approve only reads "Approves revision 1. Nothing is released until someone launches it."; Approve and launch reads "Approves revision 1 and releases version 2." (the goal was at version 1).
- Refusals are red (`--st-declined`) and take focus:
  - a stale second tab: "Not recorded. You declined this request, so nothing changes. Nothing was sent. …" (the client re-read caught it, no POST);
  - a 404 when the workspace was deleted under a staged decision: "Not recorded. Not found. Nothing changed.";
  - a 403 when the member was made a viewer under a staged Withdraw: "Not recorded. Viewers can look but not change anything. Nothing changed." (both themes; see "403" under "Write path").
- No sideways scroll at 320 on any read. No positive `tabindex`. Every Tab stop shows a 2px focus ring, except the one in L4. Re-checked after `45bfc92`: see "Focus ring after `45bfc92`" below. The page's `data-theme` matched the theme on every read.

### Findings

| # | Sev | Tag | Flow | Width | Theme | Role | Issue | File:line | Screenshot |
|---|---|---|---|---|---|---|---|---|---|
| H1 | Fixed in `340ead6`, re-walked | Verified | Shared review, retryable failure (network drop; a 503) | 1440 | both | owner | The retry notice is orchid/purple, not amber. Its border is `--st-pending` (dark 217,117,255; light 147,18,184). The foundation has `--st-retry` (amber) for this, and the brief says retryable errors are amber. The copy is right ("Not recorded yet. … Nothing changed; try again."). | `app/app/_ui/ds/review.tsx:492` (`NoticeLine`) | `dark-flow-48-retry-amber-1440.png`, `light-flow-48-retry-amber-1440.png` |
| M1 | Fixed in `340ead6`, re-walked | Verified | Record with another workspace's request id (`/record?cr=<ws2 id>`) | 1440 | both | owner | There is no not-found message. The page shows an empty single-request record, "Everyone (0)", and "Nothing has happened on this change request yet". That is false: this is not this workspace's request. Nothing from the other workspace leaks. | `app/app/_ui/ds/decision-record.tsx:249` (and how the record treats an unknown `cr`) | `dark-flow-54-record-other-ws-cr-1440.png`, `light-flow-54-record-other-ws-cr-1440.png` |
| M2 | Fixed (founder ruling: dark `--accent` #BF0078, hover #94005C; `6a97ca9` via `46cd27f`), re-measured | Verified | Primary and selected controls in dark: Approve and launch, Launch v2, Withdraw, Sign in, Create invite link, Newest first, Appearance "Dark" | all | dark | all | White on `--accent` #e90095 is 4.29:1 for 13-15px labels (4.5 needed). Light (#bf0078) passes. | `app/globals.css:35,42` | `dark-owner-requests-1440.png`, `dark-owner-account-1440.png` |
| M3 | Fixed in `340ead6`, re-walked | Verified | Evidence links in the review and the record; the record's "Change to …" links | 390 | both | all | 18-20px tall at 390, under the 44px rule. They are list-row links, not words inside a sentence, so the inline-text exception does not apply. | `app/app/_ui/ds/review.tsx:91`, `app/app/_ui/ds/decision-record.tsx:65,147` | `dark-owner-requests-390.png`, `dark-owner-record-390.png` |
| M4 | Fixed (`340ead6` + `f0d3def`), re-walked | Verified | Requests tab, adding evidence | all | both | owner, member | The shared review has no Add evidence control (`cr.can.add_evidence` is never used). The Requests tab lost main's "Add evidence / Add link", so evidence can only be added from the goal page. | `app/app/_ui/ds/review.tsx` (ReviewBody evidence section) | `I-base/dark/19-requests-no-add-evidence-control-1440.png` |
| M5 | Medium | Verified | Sample request text on Requests and the record | all | both | all | "…approve it (then launch it, which is when agents get the new version)…". Align releases a version; it does not see agents get it. Server copy. | `lib/v2/sample.ts:26` (server) | `dark-owner-requests-390.png` |
| M6 | Medium | Verified, pending the concept | Workspace shell on every signed-in page | 390 | both | all | Header links Align, Devices and Account are 22-26px tall; tab links are 37-38px. The workspace select's border is 1.64:1 (dark) and 1.34:1 (light), under 3:1. | `app/app/_ui/kit.tsx:156-157,171,188` | `dark-owner-people-390.png`, `light-owner-people-390.png` |
| H2 | Fixed in `d482bc1`, re-walked | Verified | Add evidence refused with 409 (the request was declined in another session while the form was open) | 1440, 390 | both | owner | The POST gets 409 ("You declined this request, so nothing changes.") but no notice is ever shown: `AddEvidence` sets its red notice and calls `onDone`, the re-read request no longer allows `add_evidence`, and ReviewBody unmounts `AddEvidence` along with its notice. The person sees the form vanish and nothing else. | `app/app/_ui/ds/review.tsx:103` (and 196-199) | `w-dark-1440-409-Add-evidence.png` (and light, 390) |
| M7 | Fixed in `d482bc1` (limit: only the latest counter is detected as accepted), re-walked | Verified | Record timeline after Withdraw and after Accept the change | 1440, 390 | both | member (and anyone reading `?cr=`) | Withdraw and Accept the change both POST 200, but the single-request record gains no event. A withdrawn request has `decided_at: null`, so `changeRequestEvents` adds no "withdrew the request". Accepting a counter keeps the revision, and no event kind covers it. With `?cr=` the audit log isn't read, so owners don't see these either. | `app/app/_ui/ds/record-events.ts:125`; server `decided_at` on withdraw | `w-dark-1440-write-Withdraw.png`, `w-dark-1440-write-Accept-the-change.png` |
| M8 | Medium | Verified | 409 on Not yet (server copy) | 1440, 390 | both | owner | The refusal reads "…so nothing changes: agents stay on version 4 until someone launches version 5." Align releases versions; it doesn't know which version agents are on. | `lib/v2/changes.ts:540` (server) | `w-dark-1440-409-Not-yet-after-another-session-decided-not-yet.png` |
| M9 | Fixed in `327ec1c`, re-measured | Verified | Add evidence form on a phone | 320 (same class at 390) | dark | owner | The "Link (https)" and "What it shows" inputs are 37px tall (the Kind select is 44px through the base-layer rule). `FIELD` has no phone minimum. | `app/app/_ui/ds/review.tsx:29` (`FIELD`) | `320-dark-add-evidence-1-form-filled.png` |
| L1 | Low | Verified | Compare on the record and on Requests (light) | all | light | all | "Added"/"Changed" marks are 4.45:1 at 12px. A changed row's " · target …" (`--text-3` on `--accent-soft`) is 4.18:1 at 14px. | `app/app/_ui/ds/compare.tsx:26,62` | `light-owner-record-goal-security-1440.png` |
| L2 | Low | Verified | Evidence label detail on Work (light) | all | light | owner, member | The `opacity-90` detail text ("read the goals …", "no goal read yet") is 4.27-4.47:1 at 12px. | `app/app/_ui/ds/evidence-label.tsx:25` | `light-owner-work-1440.png` |
| L3 | Low | Verified | Work "Apps", dependencies "Work", trust/privacy "Trust" | 390 | both | all, signed out | 44px tall but only 34-35px wide. | `app/app/_ui/ds/work.tsx:234`, `app/app/_ui/ds/dependencies.tsx:73`, `app/_trust/doc.tsx:138` | `dark-owner-work-390.png`, `dark-owner-dependencies-390.png`, `dark-signed-out-trust-390.png` |
| L4 | Low | Suspected | Asks, date input | 1440, 390 | both | owner, member | Tabbing to the date input reports `outline: none` on it. Chrome highlights the date segment instead; not checked by eye. | `app/app/w/[ws]/asks/view.tsx:57,217` (kit `Input`) | `dark-owner-asks-1440.png` |
| L5 | Low | Verified | Phone one-row confirmation | 390 | both | owner | On a request with no evidence, Approve only and Approve and launch no longer say "No evidence: the record will say it was approved without evidence." It is shown at 1440 only. | `app/app/_ui/ds/review.tsx:467` | `dark-flow-45-phone-consequence-requests-Approve-only-390.png` |
| L6 | Low | Suspected | Tab order at 1440: Work, Work?goal, dependencies; Sessions (owner) | 1440 | both | all | Focus moves up 166-275px because the right column follows the left (reading order of a two-column layout, probably fine). On Sessions, "Delete shared history" is followed by a "Stop agent" 200px higher. | `app/app/_ui/ds/work.tsx`, `app/app/w/[ws]/sessions/view.tsx:209,247` | `dark-owner-work-1440.png`, `dark-owner-sessions-1440.png` |
| I1 | Info | Verified | Server-side: a request that fell behind can still be declined | 1440 | both | owner | After the owner saved a new version of the goal, a stale tab's Decline on a request asked against the old version was accepted (200), not refused. That may be intended (declining changes nothing). The real 409 is walked in "Write path" below. | server (decline route) | `dark-flow-49-stale-409-1440.png` |

Counts after the dark-accent ruling: open High 0, Medium 3 (M5, M6 pending the concept, M8), Low 6 (two Suspected), Info 1. Fixed and re-walked: H1, H2, M1, M2, M3, M4, M7, M9.

## Write path: every write as a real POST (`f0d3def`, after `340ead6`)

One `next dev` with a fresh data dir and the same seed. Four passes: dark 1440, light 1440, light 390, dark 390. In each pass the member (Theo) proposes on the seeded goals, the owner (Mara) decides in the browser, and a second owner session moves requests on through the real API when a step needs it. For every write the walk records the POST status, the request's state afterwards (read from the API), the notice text, and the event count on `/record?cr=<id>` before and after. Raw rows: `I-base/walk/writes-<theme>-<width>.json`. Screenshots: `I-base/walk/w-<theme>-<width>-*.png`.

"First walk" says whether the first walk (`f9189b8`) had already posted this write for real.

| Write | Who, where | POST | State after | Notice (exact, all four passes) | Record timeline | First walk |
|---|---|---|---|---|---|---|
| Approve only | owner, Requests | 200 `approve` | approved, launch pending | "Recorded: you approved revision 1. It is not launched yet." | 1 → 2 | yes (flows, 1440) |
| Approve and launch | owner, record | 200 `approve_and_launch` | approved, launched | "Recorded: you approved revision 1 and launched version <n>." | 1 → 3 (approved, launched) | yes (record, 1440) |
| Decline | owner, Requests | 200 `reject` | rejected | "Recorded: you declined this request." | 1 → 2 | yes (stale-tab setup) |
| Suggest a change | owner, Requests | 200 `counter` | countered, revision 2 | "Recorded: you suggested a change to Theo Vance." | 1 → 2 | yes (after-set 58-60) |
| Accept the change | member, Requests | 200 `accept_counter` | pending, revision 2 | "Recorded: you accepted the suggested change. It waits for approval again." | 2 → 2: **no event** (M7) | yes (after-set 65-66) |
| Accept if… | owner, Requests | 200 `counter` with condition | countered, revision 3, condition open | "Recorded: you accepted it if Theo Vance acknowledges your condition." | 2 → 3 | no |
| Accept the change (with a condition) | member, Requests | 200 `accept_counter` | pending, revision 3, condition open | as Accept the change | 3 → 3: **no event** (M7) | no |
| Confirm the condition is met (Acknowledge) | member, Requests | 200 `acknowledge` | pending, condition acknowledged | "Recorded: you acknowledged the condition." | 3 → 4 | no |
| Add evidence | owner, Requests tab | 201 `evidence` | evidence 0 → 1 | "Recorded: your link was added, shown as self-reported." With an http:// link the form shows "Use an https:// link…" and Add link is disabled. The new link has `target="_blank"` and rel "noopener noreferrer" | 4 → 5 | no (the tab had no control) |
| Update to version n (rebase) | member, Requests, after the owner saved a new goal version | 200 `rebase` | pending, revision 2 | "Recorded: you updated your request to version <n>. It waits for approval again." | 1 → 2 | no |
| Withdraw | member, Requests | 200 `withdraw` | withdrawn | "Recorded: you withdrew your request." | 2 → 2: **no event** (M7) | yes (403 setup) |
| Launch | owner, Requests | 200 `launch` | launched | "Recorded: you launched version 2." | – | yes (flows, 1440, both themes) |
| Not yet | owner, Requests | 200 `not_yet` | approved, not yet | "Recorded: you decided not yet." | – | yes (after-set 23, both themes) |

Every successful notice is neutral (`--line-strong` border), focused, and kept after the reload. All 11 new rows passed in all four passes (dark/light x 1440/390).

### Real 409 (browser-only interception)

The page's re-read is `GET …/goals/<goal>/change-requests/<id>`. The walk:
1. reads that URL as the page shows it;
2. stages the choice up to its confirmation;
3. moves the request on through the real API in another session;
4. routes that one GET (GET only) to the copy the page shows;
5. presses Confirm.

The POST reaches the server. Every run expects:
- 409;
- `data-notice="refused"` with the red `--st-declined` border;
- focus on the notice;
- notice text exactly "Not recorded. <server message> Here it is as it stands now.";
- the choice cleared;
- `onDone` called (the list re-fetched once);
- the choices equal to `choicesFor(cr.can)` afterwards.

| Choice pressed | Moved on by the other session | Server message (verbatim) | Result (d1440, d390, l1440, l390) |
|---|---|---|---|
| Approve only | declined | "You declined this request, so nothing changes." | pass x4 |
| Suggest a change | approved | "You already approved this request." | pass x4 (choices became Launch v<n>, Not yet) |
| Not yet | decided not yet | "You already decided not yet, so nothing changes: agents stay on version 4 until someone launches version 5." (`lib/v2/changes.ts:540`, see M8) | pass x4 (choices became Launch v<n>) |
| Launch v<n> | launched | "This change is already launched as version 5." | pass x4 |
| Withdraw (member) | the owner declined | "This request was declined by Mara Quill, so nothing changes." | pass x4 |
| Decline (first gap walk, `f9189b8`) | approved | "You already approved this request." | pass x8 (Requests and record) |
| Add evidence (no interception: the form is open, the other session declines, Add link) | declined | POST 409 "You declined this request, so nothing changes." | **fail x4: no notice is shown (H2)** |

Example notice: "Not recorded. You already decided not yet, so nothing changes: agents stay on version 4 until someone launches version 5. Here it is as it stands now."

### Retry branch (amber)

`page.route` on the POST was used three ways: abort it (network failure), answer 503 "Align is restarting.", and answer 429 "Too many requests. Wait a minute.". This ran on Approve only and on Add evidence, in all four passes, 24 runs, all passed:
- the notice is `data-notice="retry"` with the amber `--st-retry` border, focused, and reads "Not recorded yet. <message> Nothing changed; try again.";
- the confirmation (or the evidence form) stays open, so pressing Confirm (or Add link) again is the retry;
- after the 429 the route was removed and the same button pressed again: "Recorded: you approved revision 1. It is not launched yet." / "Recorded: your link was added, shown as self-reported.", and the server state matched.

### Re-walk of the four fixed findings
- **H1 (retry colour):** amber `--st-retry` now; see above.
- **M1 (unknown id):** `/record?cr=<made-up id>` and `/record?cr=<another workspace's request>` both say "No such request in this workspace" and link to `/app/w/<ws>/record`. Both themes, 1440 and 390.
- **M3 (link targets):** at 390, every evidence link and "Change to …" link on Requests, the workspace record and `?goal=` is at least 44px tall (0 under 44), and every `target="_blank"` link has rel "noopener noreferrer". Both themes.
- **M4 (Add evidence):** it is back on the Requests tab for people `cr.can.add_evidence` allows; see the write table.

### 403 (light and dark)
The member stages Withdraw, a second owner session makes him a viewer, and he confirms. The POST gets 403. The notice is red, focused, and reads "Not recorded. Viewers can look but not change anything. Nothing changed.". Withdraw is gone, and the choices equal `cr.can` (none; "Not yours: Mara Quill can decide on it."). This passed at 1440 and 390 in both themes on the `f9189b8` gap walk (Requests and record, 8 runs; `403-<theme>-…png`) and again on `f0d3def` (4 runs; `w-<theme>-<width>-403.png`).

### Walk coverage

Columns are theme x width. Each cell says:
- **walked**: in a real browser, with clicks or key presses (for writes, a real POST), plus the page audit of targets, sideways scroll, contrast and copy;
- **read only**: rendered and screenshotted, or code read, with no interaction or checks;
- **not reached**: with the reason.

The keyboard (Tab) pass ran at 1440 and 390 only; 320 got the page audit without it. Roles: O owner, M member, V viewer, S signed out.

| Flow | Roles | Dark 1440 | Dark 390 | Dark 320 | Light 1440 | Light 390 | Light 320 |
|---|---|---|---|---|---|---|---|
| Shared review choices from `cr.can` (Requests + record) | O, M, V | walked | walked | read only: page audit, no clicks | walked | walked | read only: page audit, no clicks |
| Cancel path (choose, Cancel, choices return, choose another) | O | walked | walked | not reached: flows at 1440/390 only | walked | walked | not reached: flows at 1440/390 only |
| Consequence line (Approve only vs Approve and launch) | O | walked | walked | not reached: flows at 1440/390 only | walked | walked | not reached: flows at 1440/390 only |
| Write: Approve only | O | walked | walked | not reached: write passes at 1440/390 | walked | walked | not reached: write passes at 1440/390 |
| Write: Approve and launch | O | walked | walked | walked (320 pass, keyboard only) | walked | walked | not reached: write passes at 1440/390 |
| Write: Accept if… | O | walked | walked | not reached: write passes at 1440/390 | walked | walked | not reached: write passes at 1440/390 |
| Write: Suggest a change | O | walked | walked | not reached: write passes at 1440/390 | walked | walked | not reached: write passes at 1440/390 |
| Write: Decline | O | walked | walked | walked (320 pass, keyboard only) | walked | walked | not reached: write passes at 1440/390 |
| Write: Acknowledge | M | walked | walked | not reached: write passes at 1440/390 | walked | walked | not reached: write passes at 1440/390 |
| Write: Accept the change | M | walked | walked | not reached: write passes at 1440/390 | walked | walked | not reached: write passes at 1440/390 |
| Write: Update to version n | M | walked | walked | not reached: write passes at 1440/390 | walked | walked | not reached: write passes at 1440/390 |
| Write: Withdraw | M | walked | walked | not reached: write passes at 1440/390 | walked | walked | not reached: write passes at 1440/390 |
| Write: Add evidence (Requests tab) | O | walked | walked | walked (320 pass, keyboard only) | walked | walked | not reached: write passes at 1440/390 |
| Write: Launch | O | walked | not reached: the successful POST ran at 1440; at 390 only its 409 | not reached | walked | not reached: as dark 390 | not reached |
| Write: Not yet | O | walked | not reached: the successful POST ran at 1440; at 390 only its 409 | not reached | walked | not reached: as dark 390 | not reached |
| 409, real (Approve only, Suggest a change, Not yet, Launch, Withdraw, Decline) | O, M | walked | walked | not reached: 1440/390 only | walked | walked | not reached: 1440/390 only |
| 409 on Add evidence | O | walked (fails, H2) | walked (fails) | not reached: 1440/390 only | walked (fails) | walked (fails) | not reached: 1440/390 only |
| Retry: abort, 503, 429 (Approve only, Add evidence) | O | walked | walked | not reached: 1440/390 only | walked | walked | not reached: 1440/390 only |
| 403 (member made a viewer mid-decision) | M | walked | walked | not reached: 1440/390 only | walked | walked | not reached: 1440/390 only |
| 404 (workspace deleted under a staged decision) | O | walked | not reached: run at 1440 only | not reached: run at 1440 only | walked | not reached: run at 1440 only | not reached: run at 1440 only |
| Unknown `cr` on the record (made-up id; another workspace's) | O | walked | walked | not reached: 1440/390 only | walked | walked | not reached: 1440/390 only |
| Stale second tab, client re-read refusal | O | walked | not reached: run at 1440 only | not reached: run at 1440 only | walked | not reached: run at 1440 only | not reached: run at 1440 only |
| Decision record (workspace, `?cr=`, `?goal=`) | O, M, V | walked | walked | walked | walked | walked | walked |
| Compare (on the record and Requests; disclosure not toggled) | O, M, V | walked | walked | walked | walked | walked | walked |
| Work (all goals, `?goal=`) | O, M, V | walked | walked | walked | walked | walked | walked |
| Apps (connect flow not clicked) | O, M, V | walked | walked | walked | walked | walked | walked |
| Sessions (Stop agent and Delete shared history not clicked: destructive) | O, M, V | walked | walked | walked | walked | walked | walked |
| Dependencies | O, M, V | walked | walked | walked | walked | walked | walked |
| R: sign-in (incl. test account create) | S | walked | walked | walked | walked | walked | walked |
| R: request access | S | walked | walked | walked | walked | walked | walked |
| R: trust, privacy | S | walked | walked | walked | walked | walked | walked |
| R: /app list, create workspace | O, M, V | walked | walked | walked | walked | walked | walked |
| R: invite (create link, accept) | O creates; M, V accept | walked (after-set capture clicks) | walked | walked | walked | walked | walked |
| R: account | O, M, V | walked | walked | walked | walked | walked | walked |
| R: device, devices | O, M, V | walked | walked | walked | walked | walked | walked |
| R: people | O, M, V | walked | walked | walked | walked | walked | walked |
| R: alignments | O, M, V | walked | walked | walked | walked | walked | walked |
| R: asks | O, M, V | walked | walked | walked | walked | walked | walked |
| R: spend | O, M, V | walked | walked | walked | walked | walked | walked |
| R: error pages (missing workspace, missing route, bad invite) | O, M, V | walked | walked | walked | walked | walked | walked |
| R: OAuth authorize (no params) | S | read only: after-set screenshot | read only | read only | read only | read only | read only |
| Home and workspace shell | all | not reached: pending the concept | not reached: pending the concept | not reached: pending the concept | not reached: pending the concept | not reached: pending the concept | not reached: pending the concept |

Totals over 42 flows x 6 columns = 252 cells: **walked 191, read only 8, not reached 53** (after the 320 dark pass below). Of the 53, 6 are Home and the shell (pending the concept) and most of the rest are 320 cells for flows that only ran at 1440 and 390. The shell's targets and contrast were still measured; see M6. The page audit of the routes above was run on `0107890`; the four shared-surface files that changed after it (`review.tsx`, `decision-record.tsx`, `work.tsx`) were re-walked on `f0d3def` through the write, 409, retry, unknown-id and link rows.

### 320 x 640, dark: three writes, keyboard only (`da9c33b`)

Fresh data dir, one `next dev`, the same seed. The owner works keyboard only: Tab to reach each control, Enter to press it, typing into fields. Every write is a real POST. Raw rows: `I-base/walk/320-dark-writes.json`; screenshots: `I-base/walk/320-dark-*.png`.

| Write | POST, state | Sideways scroll | Controls under 44px | Focus ring | Confirmation's consequence line | Notice (exact) | Timeline |
|---|---|---|---|---|---|---|---|
| Approve and launch, through the one-row confirmation | 200, approved and launched | 0px at every step | none in the review | 2px solid on every stop in the card | "Approves revision 1 and releases version 2.": 14px, 8.89:1, not clipped, inside the viewport | "Recorded: you approved revision 1 and launched version 2." (focused) | 1 → 3 |
| Decline with a typed reason (from More actions) | 200, rejected | 0px at every step | none in the menu, input or confirmation | 2px solid on every stop | "The goal stays at version 2. Theo Vance sees your reason." (14px, 8.89:1), then "Your reason: Walk at 320: not this quarter (fictional)." | "Recorded: you declined this request." (focused) | 1 → 2 |
| Add evidence: kind, https link, label | 201, evidence 0 → 1 | 0px | **the url and label inputs are 37px tall (M9)**; the Kind select is 44px | 2px solid on every stop | – (no confirmation step) | "Recorded: your link was added, shown as self-reported." (focused). The new link is 44px tall with rel "noopener noreferrer" | 1 → 2 |

Remaining unwalked 320 cells: no rule in `app/` separates 320 from 390. Every width rule there is a Tailwind breakpoint at 640px or above, the `width < 40rem` button and select minimum in `globals.css`, or the `max-width: 639.98px` phone query in `review.tsx`, so it applies to both widths or to neither. Those cells therefore render the same components and CSS as their walked 390 cells. The exceptions are the 404 (workspace deleted under a staged decision) and stale-tab rows, walked at 1440 only, and the successful Launch and Not yet POSTs, walked at 1440 only (at 390 only their 409s). No sideways scroll at 320 was measured on:
- all 64 audited pages per theme (20 signed-in routes x 3 roles, plus 4 signed-out; document `scrollWidth`, 0px over);
- the three 320 writes above;
- 72 of the 74 after-set screens per theme (full-page screenshot width exactly 320px). Not measured: 72 and 73 (the loading screens, captured viewport-only).

### Re-walk after `327ec1c` (H2, M7, unknown goal, M9), dark

Fresh data dir, one `next dev`, the same seed. Raw rows: `I-base/walk/re-dark.json`. Screenshots: `I-base/walk/re-dark-*.png`. The 64-page audit was not re-run; it still stands on base `0107890`.

**H2: Add evidence's 409 on the Requests tab.** Add evidence was opened and filled, the owner declined the request through the API, then Add link was pressed. All four runs passed, at 1440 and 390:
- The POST got 409. The notice is red (`--st-declined`), focused, inside the request's card, and the form is gone.
- **Member:** "Not recorded. This request was declined by Mara Quill, so nothing changes. Here it is as it stands now." His request stayed under "Your requests".
- **Owner:** "Not recorded. You declined this request, so nothing changes. Here it is as it stands now." The server names the decider as "You" here, because the owner both declined it and reads it.
- **Section move:** the owner's request moved from "Waiting on you" to "Others", and the notice survived the move. The keyed flat list (`19b27b9`) keeps the review mounted, so `requests/*` needed no change.

**Notice survives a section move (runtime check, `e51b594`).** Owner on the Requests tab, dark, at 1440 and 390, 4 of 4 passed. Before acting, the walk marked the card's DOM nodes. After the request moved from "Waiting on you" to "Others", the same nodes were still in place: the card content, the ReviewBody and the actions slot were not remounted. The notice was in the DOM, visible and focused:
- **Success** (Decline): "Recorded: you declined this request."
- **Refusal** (a forced 409: the re-read was replayed with the copy the page showed, after another session declined): "Not recorded. You declined this request, so nothing changes. Here it is as it stands now."

Inside the same ReviewActions, the slot switches from the choices branch to the "Not yours" branch, and the notice moves with it. `RequestReview` is keyed on `cr.id` only (`requests/view.tsx`), so `requests/*` needed no change. Screenshots: `keep-dark-{success,409}-{1440,390}.png`; raw rows: `keep-dark.json`.

**M7: record events on `/record?cr=`, 1440.**

| Event | Owner sees | Member sees |
|---|---|---|
| Withdraw | "Theo Vance withdrew the request" with a time, and "Time of the request's last change: withdrawing closed it, so nothing changed after." | the same, as "Theo Vance (you) …" |
| Accept the change | "Theo Vance accepted the suggested change (revision 2)" with a time (from the `change_request.counter_accepted` audit row) | the same event with no time, and "Time not recorded in what you can read: the request doesn't carry it, and the audit log that does is for workspace owners." |

Known limit (by design in `d482bc1`): only the latest counter is detected as accepted. Supersede is read only (code), not walked: the seed can't make the goal change another way first without new setup.

**Unknown goal:** `/record?goal=<made-up id>` says "No such goal in this workspace" and links to `/app/w/<ws>/record`, for owner and member.

**M9: field heights at 320.**
- Add evidence: Kind select, link input and label input are 44px each.
- Decline's reason textarea is 58px.
- No sideways scroll (0px).

### Dark accent ruling (M2), re-measured

Founder ruling: the dark primary is white on #BF0078, hover #94005C. Merged as foundation `6a97ca9` and shared surfaces `46cd27f`. Measured in dark at 1440 with computed styles in a real browser, on a fresh `next dev` and seed. Raw: `I-base/walk/m2-dark.json`; screenshots: `I-base/walk/m2-dark-*.png`.

| What | Colours | Ratio |
|---|---|---|
| Primary label on a panel (the real "Approve and launch" on a Requests card), rest | white on #BF0078 | **6.02:1** |
| same, hover | white on #94005C | **8.70:1** |
| Primary label on the overlay surface, rest (no Drawer is mounted in the base, so the real button was cloned into a box painted `--bg-overlay` on the live page: a browser-only fixture) | white on #BF0078 | **6.02:1** |
| same, hover | white on #94005C | **8.70:1** |
| Button fill against its surface (for the record; the label carries the meaning) | #BF0078 on panel #121316 / overlay #202126; hover #94005C on the same | 3.08 / 2.67; hover 2.14 / 1.85 |
| Work: selected goal marker (2px left border, `46cd27f`) | #FF3DB4 on panel #121316 | 5.82:1 |
| Dependencies: selected goal marker (2px left border, `46cd27f`) | #FF3DB4 on panel #121316 | 5.82:1 |
| Confirm panel border (1px, `46cd27f`) | #FF3DB4 against the panel outside it (#121316) / its own raised fill (#191A1E) | 5.82 / 5.45:1 |
| Request access: selected choice row border and radio (switched in this commit) | #FF3DB4 on panel #121316 | 5.82:1 |

For comparison, `--accent` as a mark measured 3.08 on the panel, 2.89 on raised and 2.67 on overlay. `--accent-text` measures 5.82, 5.45 and 5.03 on the same surfaces.

**Marks switched to `--accent-text` in R's files (this commit):**
- Native radio and checkbox fills (`accent-(--accent)` → `accent-(--accent-text)`):
  - `app/app/request-access/view.tsx` (2 radios)
  - `app/oauth/authorize/AuthorizeForm.tsx` (workspace radio): since moved to `agent/LIM-2472-consent-restyle`; the candidate keeps main's file plus `PAGE_H1`
  - `app/app/device/view.tsx` (workspace checkbox)
  - `app/app/_ui/requests.tsx` (request-type radio, session checkbox)
  - `app/app/_ui/limits.tsx` (limit checkbox)
  - `app/app/account/view.tsx` (2 checkboxes)
  - `app/app/w/[ws]/people/view.tsx` (delete-sessions checkbox)
  - `app/app/w/[ws]/alignments/view.tsx` (2 radios, session checkbox)
- `app/app/request-access/view.tsx`, the selected choice row's border (`CHOICE_ON`). It had also never shown before: the base classes already set `border-(--line-strong) bg-(--bg-inset)` on the same element, and the CSS order picked those. The row now takes either `CHOICE_ON` or `CHOICE_OFF`, never both, and the walk measured the pink border and soft fill on the selected row.
- In light, `--accent-text` is #BF0078, the same as light `--accent`, so light is unchanged.

Outside R's set I found three thin marks (Work selected marker, Dependencies selected marker, Confirm border). They were already switched in `46cd27f`. `kit.tsx` `Btn` primary and `segmented.tsx` selected use `--accent` as a fill behind white text, which is the ruled 6.02:1 case, so they need no switch.


### Focus ring after `45bfc92`, keyboard only

Fresh `next dev` and seed; owner; dark and light at 1440 and 390, Tab, Shift+Tab, Enter and Escape only. The outline was read from computed style on every stop inside `<main>`. Raw: `I-base/walk/focus.json`; screenshots: `I-base/walk/focus-<theme>-<width>-{confirm,notice}.png`.

**Code-focused targets draw no ring** (4 of 4 runs):
- The confirmation heading (`h4`, `tabindex="-1"`) takes focus after Review this decision with `outline-style: none`.
- The notice (`tabindex="-1"`) takes focus after Confirm ("Recorded: you declined this request.") with `outline-style: none`.

**Every real Tab stop draws the 2px ring** (4 of 4 runs, 0 stops without it). The ring is 2px solid `--focus`: rgb(180,140,255) in dark, rgb(111,77,218) in light.

| Where | Dark 1440 | Dark 390 | Light 1440 | Light 390 |
|---|---|---|---|---|
| Requests, whole page | 22 stops | 23 | 36 | 31 |
| Add evidence form (select, link, label, Add link, Cancel, then the next stop) | 6 | 6 | 6 | 6 |
| More actions (summary and menu items, phones) | – | 5 | – | 5 |
| Decline input (reason, Review this decision, Cancel) | 3 | 3 | 3 | 3 |
| Confirm and Cancel | 2 | 2 | 2 | 2 |
| Record (`?cr=`), whole page | 12 | 9 | 12 | 9 |

The light Requests page has more stops than dark because each pass's data set differs (light runs after dark on the same server), not because the theme changes the controls.

**Transient white ring: closed in `eb1b357`.** Before, the selected Segmented option read a white `outline-color` right after Tab; its `transition-colors` animated the outline from `currentColor`. Re-checked in light, 1440, keyboard only, on a fresh `.next`, server and seed. The outline colour was read inside the `focusin` event (the first frame), on the next animation frame, and 500ms later:
- selected "Newest first" on the record: rgb(111,77,218) / rgb(111,77,218) / rgb(111,77,218), 2px solid;
- kit `Btn` "Create invite link" on People: rgb(111,77,218) at all three samples, 2px solid.

That is `--focus` (#6f4dda) every time, never white. Raw: `I-base/walk/ring-light.json`; screenshots: `ring-light-{segmented,kit-btn}-1440.png`.

**Hydration (`4c7cd15` + `eb1b357`, EvidenceLabel):** fresh `.next`, `next dev` and seed. I opened Requests, the record for the pending request (3 evidence labels), the record for the launched request and the workspace record (2 labels), in dark and light at 1440 and 390: 16 page loads. Every console error and warning was captured, and none appeared: no hydration warning and nothing else. The server log had no errors either. Raw: `I-base/walk/hydration.json`; screenshots: `hyd-*.png`.


## Needed outside my files (listed, not changed)

Current list: "Open, with Mini S1" under "Direction" above, plus the items here. The Add evidence and record items below were written on earlier bases.


- `_ui/ds/review.tsx` (S): the no-evidence line in the phone confirmation (L5). H1, H2, M3, M4 and M9 are fixed.
- Server: record the time of accepting a suggested change on the request, so non-owners see it, and detect every accepted counter, not only the latest (M7's remaining limit). M1 and M7 are fixed in the front end.
- `_ui/ds/compare.tsx`, `_ui/ds/evidence-label.tsx` (S/foundation): light-theme contrast (L1, L2). `_ui/ds/work.tsx:234`, `_ui/ds/dependencies.tsx:73`, `app/_trust/doc.tsx:138`: 44px width (L3).
- `_ui/kit.tsx` shell: header links, tab links, workspace select (M6), pending the concept.
- Server: `lib/v2/sample.ts:26` sample copy (M5); `lib/v2/changes.ts:540` "agents stay on version N" (M8); `lib/v2/launch-words.ts:12` "Launched, agents on v…" is still the MCP record's wording (SERVER_ASKS 6; not shown on the screens walked here).
- Fields: none. The shared review needed nothing the Requests tab doesn't already fetch.
