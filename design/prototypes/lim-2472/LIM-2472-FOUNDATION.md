# LIM-2472 workstream F: foundation report

Branch `agent/LIM-2472-foundation` from `origin/main` b16f8d1. Front end only. Specimen: `foundation.html` in this folder (generated from the real components; open it in a browser, Light / Dark / System at the top right).

## What it gives the concepts

- **One semantic token set, two complete palettes** in `app/globals.css`: `:root[data-theme="dark"]` (also the default for `:root`) and `:root[data-theme="light"]`. The existing `--al-*` names and the Tailwind zinc/violet/amber/red/emerald/sky map now alias these tokens, so every untouched screen follows the theme (checked: v2 Home and Account in both themes).
- **Appearance: Light / Dark / System.** An inline script in `<head>` (`app/layout.tsx`, `app/app/_ui/ds/theme-script.ts`) sets `data-theme` and `data-theme-pref` before first paint; storage key `align-theme` (localStorage in try/catch). System on first use; an explicit choice persists and wins; System keeps following the device while the page is open. `ThemeSetting` (account page, Appearance card) and `ThemeSettingCompact` for shells; `useTheme()` reads one source (`<html data-theme-pref>`) through `useSyncExternalStore`.
- **Fonts:** Space Grotesk and Space Mono through `next/font/google`. Anton is removed (ruling 0e0f6774). Display chain `"Nineties Headliner","Perfectly Nineties","Iowan Old Style",Georgia,serif`. Nineties Headliner loads from a private host once that exists (founder ruling, LIM-2454 1cb2b974); today it is `local()` only, and no font file is ever committed here.
- **Primitives** in `app/app/_ui/ds/` (import from `@/app/app/_ui/ds`): `Panel`, `StatusPill`, `EvidenceLabel`, `DataTable`, `Drawer`, `Timeline`, `Segmented`, `EmptyState`, `Kbd`, plus `ThemeSetting`, `ThemeSettingCompact`, `useTheme`. Props are in each file's signature; every state is a word plus a shape, never colour alone.

## Tokens

| Group | Names |
|---|---|
| Surfaces | `--bg-page --bg-inset --bg-panel --bg-raised --bg-overlay` |
| Text | `--text-1 --text-2 --text-3 --text-on-accent` |
| Lines | `--line --line-strong --edge` (control border) `--focus` |
| Brand | `--accent --accent-hover --accent-soft --accent-text` (pink as text) `--between --between-soft` (orchid) |
| Status | `--st-pending --st-approved --st-launched --st-declined --st-retry --st-urgent`, each with `-soft` |
| Evidence | `--ev-receipt --ev-reported --ev-unobserved`, each with `-soft` |
| Shape, type | `--radius-s 9px --radius-m 13px --radius-l 19px`, `--font-display --font-sans --font-mono`, `--shadow-pop` |

Hues (canon): accent wholeness `#BF0078` (hover `#94005C`) in both themes, ruled 2026-11-05; between orchid; approved connection green; **launched cerulean `#197EEB` (proposed)**, lifted to `#5aa7ff` on dark and `#0f62c0` on light, with its own arrow icon; declined stability red (`--alarm`); retry watch amber; urgent Surge coral; receipt expression teal; reported clarity violet; not observed neutral grey with a dashed shape.

## Focus

- Every Tab stop gets the 2px `--focus` ring (`:focus-visible:not([tabindex="-1"])`, unlayered).
- An element that only code focuses (`tabindex="-1"`: a heading after navigation, an error or confirm message, a dialog panel) gets no ring and not the browser's default one (`[tabindex="-1"]:focus { outline: none }` in `@layer base`, so a utility can still add a ring). No builder needs `outline-none` for these.
- Checked in Chrome by keyboard: Tab stops, the roving Segmented choice after an arrow key, a code-focused heading, the Drawer panel and a control inside it; the real goal page passes test-v2:3880's check (29 stops, all with a 2px ring).

## The hosted display face

`NINETIES_HEADLINER_URL` in `app/globals.css` is the one place the URL goes (a commented `src` line, because a CSS variable can't be used in `@font-face`). Before it is filled in: (1) the founder confirms the licence allows web embedding; (2) the private host is chosen; (3) `font-src` allows it in `next.config.ts` and `proxy.ts` (Sean's: deploy and security work). Until then, a tester sees Iowan Old Style on a Mac, Georgia on Windows and a generic serif on Linux or Android. Screenshots from a machine with the face installed do not show this.

## Evidence classes

Four, in `EvidenceLabel`: Receipt, Agent reported, Self-reported (`kind: "self"`) and Not observed. Self-reported means a person added the link in a web session and Align did not check it (`reported_as`, `lib/v2/evidence.ts:75`). It has no colour token on purpose: `--text-2` on `--line-strong` with a person icon, ranked below Agent reported, and it never reads as verified.

## Measured contrast (WCAG ratio, lowest across all five surface tiers)

| | text-1 | text-2 | text-3 | edge | focus | status and evidence inks |
|---|---|---|---|---|---|---|
| Dark | 14.37 | 8.22 | 5.46 | 3.19 | 6.23 | 5.03 or more |
| Light | 15.43 | 7.82 | 4.83 | 3.07 | 4.79 | 4.61 or more |

**Ruled 2026-11-05 (founder, option c):** the primary action is a white label on `#BF0078` in both themes (dark `--accent: #bf0078`, `--accent-hover: #94005c`; light was already this). White on `#BF0078` is 6.02:1 and on the hover `#94005c` 8.70:1. As a non-text colour, `#BF0078` is 3.26 on page, 3.32 on inset and 3.08 on panel, but 2.89 on raised and 2.67 on overlay: a pink fill there is told apart by its label, and any pink state marker on raised or overlay surfaces should use `--accent-text` (`#ff3db4`, 5.03:1 or more on every tier). `--accent-soft` is unchanged (text-1 on it 13.31:1 or more; `--accent-text` on it 4.66:1 or more).

## Checked in Chrome (local dev, real clicks)

- System follows the device both ways on first visit; `data-theme` is already set when `<body>` first exists (no flash); clicking Light persists across a reload with the device on dark; arrow keys move the choice.
- Drawer, both themes: focus moves in on open, Tab stays inside, Esc closes and focus returns to the opener.
- Specimen and Account at 390 and 320, both themes: no sideways scroll, no control under 44px. A long `EvidenceLabel` detail overflowed at 320 and was fixed (labels now wrap inside their container).
- Screenshots: `~/liminal/.private/align-lim2472/F/` (`00-three-states-{dark,light}-1440.png`, specimen, drawer, Home and Account).

## Tests (read, not run: shared cores)

Predicted to stay green: the 390px 44px check counts only bordered buttons in `<main>` (the Appearance options have no border and are 44px on phones); the 2px focus-ring check uses the unchanged global `:focus-visible`; the account text checks ("Your account", "Ways you can sign in", the email) are unchanged. Nothing in `scripts/test-v2.mjs` pins fonts, colours or the `<html>` attributes.

## Specimen wording (truth check)

- Pills say what Align released or sent ("Launched v4"), never what agents are on or doing.
- "Receipt · applied v3" in the Timeline sample is a real receipt state on main: `RECEIPT_STATES = ["received", "applied", "enforced", "accepted", "declined"]` (`lib/v2/directives.ts:186` at b16f8d1).
- Main's own record copy still says "Launched, agents on v…" (`lib/v2/launch-words.ts:12` at b16f8d1). That over-claims the same way, but `lib/` is out of scope for the front end: a server copy ask.

## The Needs-you row (direction 2026-11-05)

`NeedRow`, `NeedList` and `NeedAction` in `app/app/_ui/ds/need.tsx`; specimen `need-list.html` in this folder.

- **One target plus one action.** The title is the row's link (its `::after` covers the row); the action sits above it. `NeedAction` is always outlined; the one filled action in a view is the review's.
- **No table header.** Columns align through CSS subgrid, so one row is a row, not a hollow table; the list stacks on its own width (container query at `@3xl`), so it works beside any shell. On phones the action sits beside the evidence, 44px tall.
- **Rank note** above the list, shown with two or more rows. No rows: one line (`empty`, default "Nothing needs you.").
- **Checked in Chrome, both themes, at 1440, 390 and 320:** twelve rows fit at 1440x900 even under a 200px header (50-52px each; the goal was eight); no sideways scroll; the action and the row are separate hit targets; Tab goes title, action, next title with the 2px ring. At wide widths title and sub truncate to one line, so keep them short; evidence never truncates. Phone rows are 140-180px, so 3 to 4 show at once.

## Known rough edges

- `/app/account` at 320: "Ways you can sign in" wraps one letter per line. That layout predates this branch (only the Appearance card was added); not fixed here.
- `--between` and the pending/countered/held pills share orchid by ruling; they differ by word and shape only.
- The specimen is a static capture: its tables sort and drawer open only in the app. The theme switch works in the file.

## Files

ADDED: `app/app/_ui/ds/{data-table,drawer,empty-state,evidence-label,icons,index,kbd,panel,segmented,status-pill,theme,theme-script,timeline}.tsx|ts`, `design/prototypes/lim-2472/foundation.html`, this report. CHANGED: `app/globals.css`, `app/layout.tsx`, `app/app/account/view.tsx`. DELETED: none.
