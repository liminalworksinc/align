# LIM-2472 Concept A: agent-work-first command center

Branch `agent/LIM-2472-concept-a-agent-work`, from main b16f8d1, with foundation (e6ea124) and shared surfaces (a6ff222) merged.
Front end only. No PR, nothing deployed.

## The concept in 10 lines

1. Home leads with the work. Each goal the person can read is a group showing:
   - the plan state as a pill: "Launched v2", or "Change approved, not launched";
   - what Align delivered for that launch: "Align sent v2 · 1 of 1 received", as a Receipt;
   - 7-day agent time against target, as Agent reported;
   - the person's sessions bound to the goal.
2. A right rail, "Needs you", holds next-step cards. Only the first card has a pink action; the rest are outlined.
3. A decision opens in a review drawer over Home (`?review=<goal>.<id>`, so Back, reload and shared links work). Closing it returns to the same picture.
4. The drawer body is the shared `ReviewBody`. Its footer is the shared `ReviewActions` (compact), so the decision is always on screen:
   - "Approve and launch" leads; Approve only and the rest are secondary;
   - otherwise it shows "Not yours: <who> can …".
5. "Review and launch" on an approved, unlaunched card opens the drawer straight at Launch (`initialChoice`). "Review" opens it neutral.
6. A "Read it as" strip shows the three states the founder's test asks to tell apart, each by word, shape and colour: Pending, Launched, Not observed.
7. Rows for unbound sessions and for teammates' sessions (owners only) keep the full picture. Each claim carries one evidence class.
8. "Connected apps" shows when each app last *read* the goals (`last_read_at`). A connection alone is Not observed.
9. Empty and role states tell the truth:
   - an owner of an empty workspace gets "No agent is sharing work here yet" with one Connect action;
   - a member or viewer with nothing connected is told that others' agents are shown to owners only.
10. The shell is a dense left rail, replacing the old tab bar on every page: grouped navigation (Command, Plan, Work, Team), workspace switcher, Devices, Account and Light/Dark/System. Below 1024px it becomes a top bar with a Menu sheet.

## ADDED / REPLACED / DELETED (concept A only; foundation and shared-surface files are theirs)

| | File |
|---|---|
| ADDED | `app/app/w/[ws]/review-drawer.tsx`: the drawer, mounting ReviewBody and ReviewActions; `crStatus` |
| ADDED | `design/prototypes/lim-2472/a/shots.mjs`: the journey by real clicks, with a content check on every screen |
| ADDED | `design/prototypes/lim-2472/a/seed.mjs`: concept A's first seed. Superseded by `../s/seed-agent.mjs`, kept for reference |
| REPLACED | `app/app/w/[ws]/view.tsx`: Home, rewritten as the command center |
| REPLACED | `app/app/_ui/kit.tsx` `Shell`: rail navigation. The rest of kit is untouched by A |
| CHANGED | `app/app/w/[ws]/first-run.tsx`: an `always` prop, so the Connect drawer shows the paths after an app has connected |
| DELETED | `app/app/_ui/a/compact-review.tsx` (my interim review), replaced by the shared ReviewBody and ReviewActions |
| RESTORED | `_ui/changes.tsx`, `_ui/decide.tsx`: back to main |

## test-v2 UI checks this likely breaks (not run; I didn't edit tests)

| Lines | What changed |
|---|---|
| 4184/4187, 6621–6623 | the "Know what needs you" heading and the "Waiting on others" / "Active goals" titles are gone |
| 6608, 6671 | `data-tile` count tiles are gone |
| 5447–5448 | the apps card title is now "When each app last read the goals" |
| 3808/3820 | the switcher's first option reads "All workspaces", not "Workspaces" |
| 3768, 6614, 7465, 7642 | nav `aria-label="Workspace"` still exists, but as a rail, not a tab row |
| 5877–5895 | `data-first-run`: first run lives in the Connect drawer and in the empty state, not inline on Home |
| 6762–6763 | the "Your declined requests" panel keeps its title; its items render differently |
| 5660 | button order is now Approve and launch first (inside ReviewActions, per the ruling) |

Kept on purpose: `data-home-item`, `data-home-app`, `data-home-goal`, `data-home-summary`.

## Server asks (data wanted, no API for it)

1. **Per-session delivery.** Which approved version Align sent each session, and that session's receipt. The value read gives counts per launch only, so rows say "binding" and the receipt lives on the goal row.
2. **Goal labels for owners' all-sessions list.** `GET …/sessions` → `all[]` has no goal, so teammates' rows say "goal not shown to owners yet".
3. **A workspace-wide session count for members and viewers.** Non-owners see only their own sessions, so their Home can't say how much agent work exists.
4. **A web-readable recent-activity summary for the Home.** `GET …/activity` is device-only.
5. **Per-app per-version delivery outside a launched change.** Only `…/value` → `apps.items[].sent_at` has it, so the apps panel shows `last_read_at` only.

## Rough edges

- **Mini dev server.** A corrupt `.next` cache made every page live-reload in a loop. Deleting `.next` fixed it.
  - `ALIGN_SHOTS_STUB_HMR=1` is opt-in only, because without the socket some setups never hydrate.
- **Drawer footer on a phone.** With a choice open (Approve and launch, or a note), the footer takes about half of a 390×844 screen. Body content scrolls above it. A drawer-native note field would help.
- **"Needs you" cards.** They use the Home read's queue, so asks and alignments still link out to their own pages.
- **Light theme.** Checked at 1440 and 390. The legend and receipt line read clearly. Contrast was not measured with a tool.

## How to boot it

```
cd components/legacy-project-wrapper/implementation && npm ci
ALIGN_TEST_IDP=1 ALIGN_DATA_DIR=<fresh dir outside the repo> npx next dev -H 127.0.0.1 -p 3801
node ../../../design/prototypes/lim-2472/s/seed-agent.mjs http://127.0.0.1:3801 <seed.json>
node ../../../design/prototypes/lim-2472/a/shots.mjs http://127.0.0.1:3801 <out dir> <seed.json>
```

Sign in at /app/sign-in with an account from seed.json. Home is `/app/w/<ws>`.

The script writes 33 PNGs:

| Screen | Dark | Light |
|---|---|---|
| 00 three states | 1440 | 1440 |
| 01 Home | 1440, 390, 320 | 1440, 390 |
| 02 decision drawer | 1440, 390, 320 | 1440 |
| 03 Approve and launch confirm | 1440, 390, 320 | |
| 04 Not yours (viewer) | 1440, 390, 320 | |
| 05 record | 1440, 390, 320 | |
| 06 Work and evidence | 1440, 390, 320 | |
| 07 first run | 1440, 390, 320 | |
| 08 Connect an agent | 1440, 390, 320 | |
| 09 Home as member | 1440, 390 | |
| 10 Home as viewer | 1440, 390 | |
