# LIM-2472 workstream F: foundation report

Branch `agent/LIM-2472-foundation` from `origin/main` b16f8d1. Front end only. Specimen: `design/prototypes/lim-2472/foundation.html` (generated from the real components; open it in a browser, Light / Dark / System at the top right).

## What it gives the concepts

- **One semantic token set, two complete palettes** in `app/globals.css`: `:root[data-theme="dark"]` (also the default for `:root`) and `:root[data-theme="light"]`. The existing `--al-*` names and the Tailwind zinc/violet/amber/red/emerald/sky map now alias these tokens, so every untouched screen follows the theme (checked: v2 Home and Account in both themes).
- **Appearance: Light / Dark / System.** An inline script in `<head>` (`app/layout.tsx`, `app/app/_ui/ds/theme-script.ts`) sets `data-theme` and `data-theme-pref` before first paint; storage key `align-theme` (localStorage in try/catch). System on first use; an explicit choice persists and wins; System keeps following the device while the page is open. `ThemeSetting` (account page, Appearance card) and `ThemeSettingCompact` for shells; `useTheme()` reads one source (`<html data-theme-pref>`) through `useSyncExternalStore`.
- **Fonts:** Space Grotesk and Space Mono through `next/font/google` (as before). Anton is removed (ruling 0e0f6774). Display chain `"Nineties Headliner","Perfectly Nineties","Iowan Old Style",Georgia,serif`; Nineties Headliner comes only from `local()`. No font files added.
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

## Known rough edges

- `/app/account` at 320: "Ways you can sign in" wraps one letter per line. That layout predates this branch (only the Appearance card was added); not fixed here.
- `--between` and the pending/countered/held pills share orchid by ruling; they differ by word and shape only.
- The specimen is a static capture: its tables sort and drawer open only in the app. The theme switch works in the file.

## Files

ADDED: `app/app/_ui/ds/{data-table,drawer,empty-state,evidence-label,icons,index,kbd,panel,segmented,status-pill,theme,theme-script,timeline}.tsx|ts`, `design/prototypes/lim-2472/foundation.html`, this report. CHANGED: `app/globals.css`, `app/layout.tsx`, `app/app/account/view.tsx`. DELETED: none.
