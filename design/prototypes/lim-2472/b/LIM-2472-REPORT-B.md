# LIM-2472 Concept B: decision desk

Branch `agent/LIM-2472-concept-b-decision-desk`, built from main `b16f8d1`, with the `agent/LIM-2472-foundation` and `agent/LIM-2472-shared-surfaces` branches merged in. Front end only. No deploy and no PR.

## The concept in 10 lines

1. Home is a decision desk: one dense table of every change request this person can read (`GET …/change-requests`).
2. The table filters client-side into Waiting on me, Waiting on others, Decided and All, each with its count. It is searchable by goal, person, reason or state. With no filter picked, it opens on Waiting on me.
3. Each row shows:
   - the goal and a one-line summary of what changes;
   - who asked;
   - the state in the product's words, as a StatusPill;
   - who it waits on, from `changeWaits`, or the launchers for an approved request that isn't launched;
   - the launched version and the approved version;
   - the evidence count and when it was updated.
4. A row's actions come only from its `can` flags. One filled pink button per view; the others are outlined or quiet. Anything that isn't this person's says "Not yours" or "No action".
5. A row opens a drawer that reads the request by id. The drawer stays open on the done or refused notice after the row moves to another filter behind it.
6. The decision page leads with a role-lane state map:
   - three lanes: the person asking, the approvers, and the launchers (approvers plus workspace owners);
   - the request's current state is lit;
   - connectors are labelled with the real action names.
7. Each connector is one of three kinds:
   - live, when it is this person's to take now;
   - inert, saying "<names> can";
   - hidden behind "Show every state and transition".
   States that aren't passed, current or one step away fold into one-line chips.
8. One implementation sends every decision: the shared `ReviewActions`. A live connector or a row button only picks its `initialChoice`. The shared `ReviewBody` shows the reason, Compare, evidence, Add evidence and the snapshot.
9. Approval is not launch:
   - "Approve and launch" is the dominant choice and "Approve only" the secondary.
   - The launch lane shows "Approved, not launched" as its own lit state, with who can launch.
   - "Not yet" shows as a visible outcome with who chose it and when.
   - The only reach figure before launch is the snapshot's `bound_sessions`, labelled as recorded by Align, not a delivery.
10. Work and agents sit one layer down:
    - Decision record goes to `/record?cr=`, in the desk shell.
    - Work and evidence goes to `/work?goal=`.
    - Goal dependencies goes to `/dependencies`.
    - The only agent facts shown are the connected apps' evidence classes: Receipt when Align served a goal read, Not observed otherwise.

## Files

ADDED (concept B):
- `app/app/_ui/b/shell.tsx`: the desk shell.
  - Icon rail, with labels at 1400px and up.
  - Breadcrumb with the workspace switcher.
  - Appearance control, and a slot for one primary action.
  - Below 640px, a Menu sheet.
  - Also exports `Who` (initials and name).
- `app/app/_ui/b/model.ts`: per-row model. State words, filter phase, who it waits on (`changeWaits`), launched and approved versions, the one-line summary, age and links.
- `app/app/_ui/b/act.tsx`:
  - choice labels and order, matching ReviewActions;
  - `DOMINANT`, `notYours` and the buttons;
  - no POSTs.
- `app/app/_ui/b/lanes.tsx`: the role-lane state map (`LaneMap`, `LaneLegend`, the snapshot reach note).
- `app/app/_ui/b/agents.tsx`: the connected apps' evidence classes from the Home read.
- `app/app/_ui/b/parts.tsx`: the facts grid (state, waits on, asked by, approvers, versions, who approved, declined or launched).
- `app/app/w/[ws]/decisions/[goal]/[id]/page.tsx` and `view.tsx`: the decision page.
- `design/prototypes/lim-2472/b/seed.mjs`, `shots.mjs` and this report.

REPLACED:
- `app/app/w/[ws]/view.tsx`: the workspace Home ("Know what needs you", with tiles and queues) is now the decision desk.

EDITED OUTSIDE THE B LIST:
- `app/app/w/[ws]/record/view.tsx` (Mini S2's): wrapped in the desk shell. A one-line change, reported to the align session.

DELETED: nothing.

Not touched:
- `page.tsx` and `first-run.tsx`: the desk mounts the existing FirstRun card in its empty state.
- `_ui/decide.tsx`, `_ui/crparts.tsx` and `_ui/changes.tsx`: only read, for `useGoalTitles`.
- `app/api/**`, `lib/**`, `proxy.ts`, `next.config.ts`, `scripts/**` and the specs.

## test-v2 UI checks this breaks

I didn't run them: test-v2 runs `next build`, which the brief rules out. I didn't edit them either. This list comes from reading `scripts/test-v2.mjs`.
- `:4184-4187`: a new workspace opens on "Know what needs you". It now opens on "Decision desk".
- `:5876-5963` and `:7827`: these look for `[data-home-summary]`. The desk's summary is `[data-desk-summary]`, so these fail at their first wait.
  - The FirstRun card itself is unchanged.
  - On the desk it shows only when the workspace has no change requests (it used to show whenever no app had been seen), so the checks' workspace may not show it.
- `:6608-6700`: the Home tiles (`[data-tile]`), `[data-home-app]`, `[data-home-item]`, `#waiting` and `#others`. The desk has no tiles, and asks and alignments appear only as counts in "Also waiting on you".
- `:6749-6756`: a declined row, `[data-home-item="declined:…"]`. Declined requests are now rows under Decided.
- `:10679-10681`: the alignment detail on Home, `[data-home-detail]`.
- `:5660`: this pins the goal page's old choice order. B doesn't change the goal page, so it is unaffected here, though concept A or integration may change it.

## Server asks (nothing here needs a new server change to work)

1. A per-app or per-session delivery count for a change request before launch. Today only the snapshot's `bound_sessions` exists, and delivery counts appear only after launch through the value read. The launch lane shows exactly that.
2. A `GET` of a goal's versions, so the lane map could name the launched version's author and time without going through Compare.
3. The `?state=` filter on the change-request feed takes one state. The desk loads everything and filters client-side, which is fine at this size.
   - Paging and a server search would matter past a few hundred requests.
4. No priority, due date, comments or reviewer-seen fields exist (truth map §8.1). The desk shows none, by design.

## Rough edges

- DataTable's sortable header buttons wrap at 1440 ("LIN KS", "UPDATE D"). They need `whitespace-nowrap` in the primitive; I asked iMac S2 through the align session.
- Lane connectors can still run close together in one column gap when a state has four live exits (the approvers' "Waiting for a decision").
- Most screens outside the desk, decision page and record still use main's Shell (Goals, People, Alignments, Asks, Spend, Account). The journey leaves the desk frame there until integration.
- "Suggest a change" and "Accept if…" open in ReviewActions. Their forms are the shared component's.
- Fonts fall back to system faces on this mini when Google Fonts can't be reached. That is the font loader's fallback, not a design choice.

## Boot it

From `components/legacy-project-wrapper/implementation`, on a free port with a fresh data dir and the test identity provider:

```
ALIGN_DATA_DIR=/tmp/align-b ALIGN_TEST_IDP=1 npx next dev -H 127.0.0.1 -p 3802
```

From the repo root:

```
node design/prototypes/lim-2472/b/shots.mjs http://127.0.0.1:3802 /tmp/b-shots
```

Round 2 removed `shots.mjs` from this folder. It walked concept B's own shell (the "Decision desk" Home), which was not integrated, so on the integrated pages it stopped at its first screen. The round-1 commits keep it in git history. What it checked on the integrated pages is now in `r2-checks.mjs` (Home's ranked list, the Requests desk and "Approve only", "See who decides") and `next-checks.mjs` ("Next" after a decision), and the screens are in `../s/shots.mjs`.

This runs `design/prototypes/lim-2472/s/seed-agent.mjs` first, then `seed.mjs` on top of it in the same workspace. Every write is a real API call made as the person it names.

To sign in by hand:
- run `node design/prototypes/lim-2472/b/seed.mjs <BASE>`, which prints the throwaway test-IdP accounts;
- or use `--on <seed-agent out.json>` to layer onto the shared seed.

The shots use the side-by-side numbering: 00-three-states, 01-home, 02-decision, 03-approve-and-launch-confirm, 04-not-yours, 05-record, 06-work-evidence, 07-first-run and 08-connect-agent. The extras are 09-drawer, 10-launched, 11-home-member, 12-home-viewer and 13-decision-viewer.

The script makes 8 asserted click checks:
- a live connector opens its confirmation;
- Back then Cancel sends nothing;
- a different connector opens its own input;
- Approve and launch gives a done notice and lights Launched;
- not-yours is inert and names who can;
- the drawer stays open on the done notice after Approve only;
- the drawer stays open on the refused notice after a decline made elsewhere;
- a viewer has no live connector.

Every screen also waits for its own text and throws when it's missing.

On the last run, all 8 checks passed with no sideways scroll at 1440, 390 or 320. `npx tsc --noEmit` and eslint are clean on everything B touches.
