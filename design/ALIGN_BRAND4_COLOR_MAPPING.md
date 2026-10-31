# Align Intent Studio · Canon-grounded Brand 4 color mapping

**Design artifact only** — [PR #34](https://github.com/liminalworksinc/align/pull/34) · [interactive Intent Studio v3](./prototypes/lim-2449-intent-studio-v3.html). **Not an implemented Align theme.** Source of truth: private `liminalworksinc/liminal-creative` `main`, specifically `canon/DESIGN_SYSTEM.md`, `tokens/design-tokens.css`, `tokens/colors-and-type.css`. Checked 2026-10-29 against `main` commit `96e708ce4c4757cb984a50ceceb200204cd47c91`.

**Brand 4 is the latest recorded founder direction, explicitly NOT fully locked.** It supersedes the earlier violet-primary/orange-accent Brand 3. This PR does not lock the brand or introduce a thirteenth hue.

## Palette: established roles, not accent confetti

| Lane | Canonical token | Actual pigment | Assigned job in this prototype |
| --- | --- | --- | --- |
| Brand primary / judgment | `--wholeness` / `--judgment` | **Liminal Pink `#E90095`** | Brand glyph, deliberate human authorization surface, decision CTA |
| Brand second / diligence | `--clarity` / `--diligence` | **Ultramarine Violet `#8E66FB`** | AI analysis pane, suggested follow-up, keyboard focus |
| Brand third / synthesis | `--cerulean` / `--synthesis` | **Cerulean `#197EEB`** | Proposed changes, source-link chips, app read evidence. Small-source text uses canonical lighter cerulean lift for contrast |
| Brand fourth / connection | `--connection` / `--outreach` | **Connection Green `#31E682`** | Factual human authorization recorded / explicitly confirmed result. No green for unverified AI recommendation or merely connected app |
| Recessive/informational | `--expression` / `--ambient` / `--depth` | **Prussian Teal `#1E9692`** | Very low-chroma information wash behind current company priority |
| Lifecycle | `--liminal` | **Orchid `#CC24F5`** | Candidate pending, waiting, held, unsealed; **not amber**, because not a warning |
| Severity: attention | `--watch` | **Chrome Yellow `#FDC237`** | Explicit attention on approval without sandbox evidence, not ordinary pending state |
| Severity: error | `--alarm` | **Cadmium Red `#ED214F`** | Actual destructive/rejected error action, not a non-executed test |

**Foundation:** canonical `#0A0A0B` warm-near-black page; `#08080A` rail; `#0E0E11` frames, `#15161A` lifted cards; `#F3F1EF` cream **only** for the settled decision-record paper artifact, never a whole-page white-dashboard switch. The tiny 2px header rule uses the Brand 4 **pink → violet → blue → green** spectrum; it is a brand identity moment, not a generic SaaS gradient.

**Material state:** resting surfaces use `wash` (translucent), interaction uses the color's `stain`/register border, historical artifact uses matte/paper and `dry` values where applicable. The prototype inlines resolved CSS variables to remain self-contained, but production should **consume the upstream canonical tokens** and their semantic aliases rather than copying or maintaining local hex forks. The upstream pigment ramps include `wash`/`stain`/`dry`, `-edge`, `-soft`, etc.

## One color, one interpretation

- **Pink judgment:** human-authorized goal or launch decisions, not every clickable thing.
- **Violet diligence:** AI interpreted evidence, not human approval.
- **Blue synthesis:** draft/candidate/provenance/read facts; **blue does not mean a live agent completed execution**.
- **Connection green:** completed, validated event in the **actual workflow**; a speculative AI statement, proposed plan and read receipt never get green just for being upbeat.
- **Orchid liminal:** waiting / deliberating / not-yet decision, which is not necessarily bad. This corrects the previous prototype's amber pending badges.
- **Amber watch:** caution where a human must consciously accept risk/uncertainty (untested approval).
- **Red alarm:** real failures/destructive action; never the untested-but-not-failed state.

## Visual edits on the PR branch

- Replaced improvised violet/purple backgrounds with neutral warm-stone surfaces and the canonical four brand registers **where the task warrants them**.
- Replaced generic purple gradient mark with **solid Wholeness pink**.
- AI answer edge = **Diligence violet**; draft target card = **Synthesis cerulean**; confirmed human authorization = **Connection green**; pending state = **Orchid**; caution acknowledgment = **Watch amber**.
- Introduced canonical ink/paper duality in the decision record; no decorative rainbow cards.
- Retained existing fictional conversation, source-linked artifact, roles, transitions and human authorization requirements unchanged.

## QA & outstanding work

- Local headless Chromium observed **no script errors and no page horizontal overflow** at 1440×900, 1024×800, 390×844, 320×740. Simulated proposal → counter → requester acknowledgement → owner ratification → held → launch also passed after recolor.
- Contrast check of main brand bases against `#0A0A0B`: pink ~4.62:1, clarity ~5.13:1, cerulean ~4.92:1. **Small white text on cerulean fill was not sufficient** (~3.57:1), so blue action backgrounds use canonical `#1466C0` (cerulean -600, >5:1 with cream) and darker `#0F4F95` on hover.
- Actual visual diff screenshot exists locally for 1440 / 1024 / 390 / 320; production app screens, assistive technology, font availability and live AI capabilities remain out of scope for this design study.
- No font assets are shared or committed. Typography may fall back on devices lacking the canon's local faces; that is a separate type-system integration gate, not a reason to substitute a competing typography system.
- Real Align main has advanced independently from the Fly v13 audit; PR #34 remains a **draft design-only branch**. Founder signoff on visual treatment and product semantics still belongs to [LIM-2454](https://linear.app/liminal-space-io/issue/LIM-2454). Nothing in the PR should be merged as production UI.
