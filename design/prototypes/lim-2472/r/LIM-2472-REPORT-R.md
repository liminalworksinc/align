# LIM-2472 stream R report: the rest of the app

Branch `agent/LIM-2472-rest-of-app` from `origin/agent/LIM-2472-foundation` 6b76a16. Front end only. Every screen the
two concepts don't own now uses the foundation's semantic tokens and ds primitives, in dark and light. Behaviour and
every API call are unchanged, except defect 4 (below), which removes one read for people who did not approve.

Paths below are relative to `components/legacy-project-wrapper/implementation/`.

## Defects fixed

| # | Defect | Fix | Before (`~/liminal/.private/align-lim2472-before/`) | After (`~/liminal/.private/align-lim2472/R/{dark,light}/`) |
|---|---|---|---|---|
| 1 | Pending-invite row breaks at 320, one or two letters per line | The row wraps: the email takes its own line on a phone, then the role and team pills, the expiry, Withdraw | `47-people-invite-link-created-320.png` | `47-people-invite-link-created-320.png` |
| 2 | Sample card says "an ordinary workspace you can rename or delete"; there is no rename | "It is an ordinary workspace you can delete from its People tab." (true: owners delete it there) | `07-app-first-run-empty-1440.png` | `07-app-first-run-empty-1440.png` |
| 3 | Off-domain example "The three models must not all fit on the GPU" | Example and placeholder are now "Spend on the launch must stay under $40,000" | `10-goals-sample-list-and-new-goal-form-1440.png`, `11-goal-detail-security-v1-owner-1440.png` (placeholder in the limit editor) | not in my after-set (goal screens belong to the concepts); the string is in `app/app/_ui/limits.tsx:18,194` |
| 4 | Decision value card and its "Before Align, how long would…" question show for every viewer | `ValueCard` renders (and reads `…/value`) only when `cr.approved_by.id === me`, data already on the page | `51-goal-detail-security-v2-member-view-1440.png` (Ben, not the approver, sees the card) | `24-requests-launched-decision-record-1440.png` (Ada approved: card shown); `51-goal-detail-security-v2-member-view-1440.png` (Ben: no card) |
| 5 | `/app/account` at 320: "Ways you can sign in" rows wrap one letter per line | Each row is a name over its detail and wraps; checkbox labels keep their text in one span | `33-account-default-320.png` | `33-account-default-320.png` |

## Files

ADDED: `design/prototypes/lim-2472/r/LIM-2472-REPORT-R.md` (this file).

REPLACED (restyled; logic and requests unchanged):
- `app/app/view.tsx`: two-column landing (workspaces lead; create and connect a device beside), ds `Panel` and `EmptyState`, 44px workspace rows, "Fictional" label on the sample card. Defect 2.
- `app/app/sign-in/view.tsx`, `app/app/request-access/view.tsx`: token card, display H1, test sign-in modes as one segmented control (`aria-pressed`), interest choices as 44px whole-row radios.
- `app/app/account/view.tsx`: `Panel`s, wrapping rows, 44px checkbox rows. Defect 5.
- `app/app/device/view.tsx`, `app/app/devices/view.tsx`, `app/app/invite/[token]/view.tsx`: `Panel`s, display H1, 44px choice rows.
- `app/app/w/[ws]/people/view.tsx`: `Panel`s, member rows (name over email), team boxes, `EmptyState` for no teams, quiet text buttons for Remove/Withdraw. Defect 1.
- `app/app/w/[ws]/alignments/view.tsx`, `app/app/_ui/reallocations.tsx`: states as ds `StatusPill` in the product's own words (pending/countered orchid, approved green, declined red, launched cerulean); raised cards.
- `app/app/w/[ws]/asks/view.tsx`: raised cards, 44px disclosures on phones.
- `app/app/w/[ws]/requests/view.tsx`: sections are a heading with a count over the request cards (no box inside a box); `section[aria-label]`.
- `app/app/w/[ws]/spend/view.tsx`, `spend/allocation.tsx`: mono table headers, the share bar neutral (a quantity, not a state), steering pill neutral.
- `app/app/_ui/limits.tsx`: limit kinds are neutral pills (content, not a state). Defect 3.
- `app/app/_ui/requests.tsx`: hold banner orchid (held is an in-between state), "waiting"/"pending" orchid, "answered" neutral (the agent's answer is not a human authorization).
- `app/app/_ui/goalform.tsx`, `missing.tsx`, `error-notice.tsx`, `turnstile.tsx`, `app/error.tsx` (unchanged), `app/global-error.tsx`: tokens; the error notice and the not-in-workspace page are centred cards.
- `app/oauth/authorize/AuthorizeForm.tsx`, `page.tsx`: class names only (tokens, pink primary link, 44px rows). No form logic, headers, handlers or security code touched.
- `app/trust/page.tsx`, `app/privacy/page.tsx` (unchanged), `app/_trust/doc.tsx`: tokens, 44px nav and contents links on phones, a long URL breaks instead of scrolling the page sideways at 320.
- Every owned `page.tsx`: the loading fallback's colour class only.
- `app/app/_ui/value.tsx`: ONLY the defect 4 gate (6 lines).

DELETED: none.

## test-v2 UI checks these changes would break (read, not run)

- `scripts/test-v2.mjs:5430`, `:5437`, `:5446` (value card on the goal page at 1000px): the browser signs in as V1, but V3 approved the request (`:5215`), so after defect 4 V1 gets no `[data-value-card]` and `waitForSelector` at `:5415` times out. The phone check at `:5461-5475` signs in as V3 (the approver) and should still pass. The "What others said" row the check expects (`:5432`) is now seen only by an approver who also sees all reports.
- No other pinned string or selector was changed: section names, empty sentences, button labels, `#test-idp`, `#passkeys`, `[data-*]` attributes, "Sign in again to …" and "(you)" text are as before. Buttons keep plain text labels (tests match `textContent`).

## Needed outside my files (listed, not changed)

- `app/app/_ui/kit.tsx` `Btn` primary is `violet-700` (orchid via `--al-accent`), so every primary button on these screens is orchid, not wholeness pink. One-line fix: primary `border-(--accent) bg-(--accent) text-(--text-on-accent) hover:bg-(--accent-hover)`.
- `kit.tsx` `Input`/`Select`/`TextArea` are 39px tall at 390 (44px rule) and their border is `zinc-300` (`--line-strong`, under 3:1); `--edge` and `max-sm:min-h-[44px]` would fix both.
- `kit.tsx` header links (Align, Devices, Account) are 22-26px tall at 390.
- `app/app/_ui/decide.tsx` "Details" summary is 19px tall at 390 (Requests tab).
- `kit.tsx` `Card` and `Note` are still used by `decide.tsx`/`crparts.tsx` inside the Requests tab, so a request card keeps the old card shape there.
- Server: none new. `lib/v2/launch-words.ts:12` "Launched, agents on v2" still renders inside the request record (SERVER_ASKS 6).

## After-set

`~/liminal/.private/align-lim2472/R/dark/` and `.../R/light/`, from `capture.mjs` (fresh data dir, `ALIGN_TEST_IDP=1`), same screen numbers as the before-set. Only screens I own are kept (see the table in INDEX order: 01-07, 09, 12-24, 27, 29-31, 33-37, 40-42, 44-45, 47-49, 55, 57-68, 71, 73-74). Removed as not mine: 08, 10, 11, 25, 26, 28, 32, 38, 39, 43, 46, 50-54, 56, 69, 70, 72 (Home, goals, sessions, apps), except 51 kept in dark as defect 4 evidence. The capture's THEME only emulates the device scheme; Account stays on System.
