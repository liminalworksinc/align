# Align Intent Studio · Pigment physics: wash → stain → dry

**Design / no production changes.** [PR #34](https://github.com/liminalworksinc/align/pull/34) · [interactive standalone concept](./prototypes/lim-2449-intent-studio-v3.html) · [previous Brand 4 color map](./ALIGN_BRAND4_COLOR_MAPPING.md).

**Upstream visual contract:** private `liminalworksinc/liminal-creative` `main` (checked 2026-10-29), `canon/DESIGN_SYSTEM.md`, `tokens/design-tokens.css`, `tokens/colors-and-type.css`, `color-lab/src/lib/palettes/slate-tokens.ts`. Brand 4 (pink/violet/blue/green) is the latest founder direction, **still fluid**. The twelve-wheel is closed. No new pigments were added.

## Thesis: not a rainbow of dashboard badges

A **register** identifies *what kind of evidence or authority* produced an element. A **material state** identifies *what is happening to the mark*. They are independent axes, and the surface's visual behavior must track actual application state, not a decorative timeout.

| Material state | Visual grammar | Align event | What it does **not** claim |
| --- | --- | --- | --- |
| **WASH** | ~8–10% pigment in dark substrate, quiet edge, no shine | Candidate suggested, unapproved; AI explanation at rest | The AI has authority or its proposal is true |
| **STAIN** | Canonical saturated edge and deep `-800` ink, intent-named 350 ms engage motion | Request sent to authorized owner, counter under review, requester acknowledgment, or user actively inspects AI sources | A sandbox ran or the agent executed the plan |
| **DRY** | Low-chroma `-dry` accent, matte archival/paper record, 320 ms settle | A decision event has been recorded: approved, declined, held or launch-approved. Approval and launch are **separate decisions** | Success of the actual work. A declined change is also a valid, settled record |

**The key axis separation:** After goal ratification the **goal-change artifact** dries, but Leadership's **launch** can independently remain queued (orchid), be recorded as not yet (held), or later be approved. An app's current-plan flag is computed from the **whole-plan hash**, which changes on proposal, counter, acknowledgement and launch events—not just goal ratification. The server does **not** store which goal version the app read. The prototype reports only whole-plan freshness and last-read metadata. An AI answer can be actively inspected (diligence stain) while still unapproved.

### Palette/job contract (all 12 canonical positions)

| Pigment / base | Semantic job | Current Align usage / deliberate reservation |
| --- | --- | --- |
| Stability / `#ED214F` | Foundation factor, `--alarm` severity when an actual destructive error exists | **Reserved** for actual error/factor datum, not rejection as a legitimate owner decision |
| Coral / `#FA552B` | `--surge` is deliberately unused in the canon | **Unbound** in Align. Urgency/attention is a possible future use, not an approved product state; atlas is exploratory only |
| Vitality / `#FF9549` | Factor metric. **Retired from Brand 4** | Not used as a generic attention color |
| Amber / `#FDC237` | `--watch` conscious caution | Explicit approval-without-sandbox-test acknowledgment, never generic pending |
| Agency / `#FEF059` | Historical factor hue; retired from Brand 4 and from agent-register roles | **Unbound** in Align. A future factor measurement or renewed product role requires an explicit founder ruling; human approval remains Judgment pink |
| Lime / `#70F32F` | `--signal` truly live operation | **Reserved**: Fly v13 does not capture running agent sessions |
| Connection / `#31E682` | `--outreach` register, `--ui-state-success` for verified successful event | A human goal authorization recorded, not connected-app read or model speculation |
| Expression / `#1E9692` | `--ambient`/`--depth` recessive background | Quiet company context/wash |
| Cerulean / `#197EEB` | `--synthesis` draft, sources and versioned app-read facts | Proposed target / source details; material transitions with approvals |
| Clarity / `#8E66FB` | `--diligence` AI analysis | AI answer wash; source inspection stain; never authoritative goal approval |
| Orchid / `#CC24F5` | `--liminal` queue/hold/deliberation | Pending lifecycle without severity warning |
| Wholeness / `#E90095` | `--judgment` human decision | Human action panel engages pink; settled judgment becomes a quieter dry mark |

No color should appear merely because a surface needs decoration. An unused wheel entry is a design-system capability, **not a fabricated product state**.

### Canon token discipline

- Factor material values (`wash`, `stain`, `dry`) follow the upstream CSS, with `stain` resolving to canonical `-800` stops (e.g. Stability `#7B0E29`, Agency `#7C7029`, Clarity `#3E2A85`, Wholeness `#6E0044`).
- Ornament washes and dry-like values for Coral, Lime, Cerulean and Orchid in the **atlas** are sourced from the color-lab slate pigment reference, **not** represented as upstream `design-tokens.css` semantic aliases where none exist. The production token sync must keep this distinction explicit.
- The prototype self-inlines tokens because its HTML is downloadable without a private repo, but **production components must consume canonical imports** from `liminal-creative`, not copy hex values into new local forks.
- The canonical physical ink behavior is **wash → stain → dry**; animated transforms are only played on an actual interaction/state change, with `prefers-reduced-motion` disabling them. Stage color does not override the register; lifecycle and severity always remain distinct.
- A declined proposal is a **valid human Judgment event**, not an Alarm. The design removes bright red from normal Decline controls; reserve Alarm for actual failed writes/validation or destructive actions.

## What changed in the clickable PR prototype

1. The primary change artifact, the candidate target, AI explanation and human authorization panel now use independently assigned pigment/material states.
2. The actual simulated workflow advances the artifact from **draft wash → owner review stain → recorded dry**. There is no auto-cycle after a timer.
3. A compact, inspectable **Material history / wash · stain · dry** track appears beside the candidate diff, keyed to the actual simulation phase.
4. Added **Ink** navigation: an interactive material proof where the operator selects any of the twelve wheel entries and toggles Wash, Stain, Dry to understand how a register evolves.
5. The existing company-goal, AI-read, owner/counter/approve and leadership-launch semantics remain unchanged. The UI remains a **scripted design study**, not a live AI agent product.

## QA record / limitations

Tested the local exact prototype at **1440×900, 1024×800, 390×844 and 320×740** in headless Chromium. At each width the main workspace and Ink atlas had **no horizontal page overflow and no JS page errors**. At 1440, verified actual simulated transitions `draft → pending → countered → acknowledged → agreed → held → launched`, with material properties **wash → stain → dry** matching the phase. Verified the Ink atlas shows **12 pigments**, and changing a pigment plus Wash/Stain/Dry actually changes the example's `data-hue` and `data-material-state`.

Not verified: reduced-motion browser screenshot behavior, all keyboard/assistive-tech states, live backend authorization, real AI, full font loading, independent tester interpretation or the production token-sync/build pipeline. Do **not** merge PR #34 or deploy to Fly from this design prototype. Production UI belongs to a separate approved implementation PR after founder rulings in [LIM-2454](https://linear.app/liminal-space-io/issue/LIM-2454).
