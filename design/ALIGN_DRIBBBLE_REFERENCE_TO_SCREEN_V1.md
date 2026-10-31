# Align · Dribbble reference atlas → D2 remaining screens (2026-10-29)

**Status:** visual exploration and a clickable **design-only** prototype, **not founder-approved nor production ready**. 
**Inspect:** [Remaining-screen gallery: intake / goals / old-plan work / record](./prototypes/lim-2450-2453-dribbble-surface-studies-v1.html) and [recognition-first entry v4](./prototypes/lim-2449-recognition-first-v4.html). 
**Baseline:** Align `liminalworksinc/align` draft PR #34; existing v3 review cleared on `e55baf1` but those results do **not** cover the new screens. Company, people and decisions in the gallery are **fictional**.

## What we actually looked at online

These are real publicly accessible Dribbble design references, linked here for visual review. Their compositions, structures and interaction insights are inspirations, **not copied screenshots, code, logos, colors or production permissions**.

| Design reference | Borrow for Align | Avoid |
| --- | --- | --- |
| **[Magdalena Hołowczak / Synergy Codes — Decision manager](https://dribbble.com/shots/26647190-Decision-manager-for-operation-risks-protocols-and-workflows)** | Clear priority/action hierarchy, name the responsible actor, show evidence within reach of the decision | Industrial risk imagery, fabricated severity scores and a generic risk-ops dashboard |
| **[Zofia Wojtach — Graphne Dependencies graph](https://dribbble.com/shots/23302282-Graphne-Dependencies-graph)** | Give one selected dependency chain its own focused canvas; selected node opens inspector; readable ownership | Massive spaghetti graph, Gantt + dependency canvas on the same view. Creator specifically separated them |
| **[Julia Rosich / Productboard — Roadmap dependencies](https://dribbble.com/shots/16929781-Productboard-roadmap-dependencies)** | Show a precise relation between changed priority, blocked/superseded goal and affected work | Complex portfolio roadmap or inferred unblock dates unsupported by Align's data |
| **[Magdalena Hołowczak — Hierarchical drilling diagram](https://dribbble.com/shots/26647139-Diagram-view-for-hierarchical-drilling-data-visualization)** | Structural, labelled topology and simple node emphasis; diagram communicates cause and ownership, not mere aesthetics | Pretending Align has engineering-like continuous sensor/agent monitoring |
| **[Juliette Lagache — Shown AI onboarding](https://dribbble.com/shots/20923456-Shown-AI-Onboarding-flow)** | Progressive setup, reusable input architecture and coherent arrival at the first meaningful workspace state | Requiring an elaborate configuration before user recognizes the issue; copying rounded pastel styling |
| **[Jakub — Audit Log](https://dribbble.com/shots/14468178-Audit-Log)** | Group and expand chronology; precise before/after details; keep important authorization events distinct from repetitive read metadata | Red/green as generic before/after; red in Liminal denotes a genuine error, not a legitimate decline |
| **[Yuri Gokoryan — AI Agent Observability Platform](https://dribbble.com/shots/27408472-AI-Agent-Observability-Platform-UI-Design)** | Clear distinction of overview / run detail / alerts as separate information classes *if evidence is actually captured* | Faking agent runs, cost graphs, live activity, usage statistics or completed sessions that hosted custom Align cannot observe |
| **[Kate Kondrateva — Task Manager Dark UI](https://dribbble.com/shots/27044001-Task-Manager-Dashboard-Dark-UI)** | Scannability and a focused task list at narrow widths | Progress donuts or completion metrics without measured data |

### Where each reference becomes an Align behavior

| Screen / ticket | Visual structure | Real operator question | Source-bound truth | Interactive design study |
| --- | --- | --- | --- | --- |
| **First-run intake · LIM-2452** | Progressive editorial form, contextual evidence rail, one primary input per stage | “What changed?” before “Which fields must I fill?” | Existing `/new` interviewer may assist; no auto-import of agent sessions. Preserve required goal/role/dependency/reciprocal data on real implementation | Three step tabs, editable local data, required check, summary preview |
| **Goals · LIM-2450** | Focused company→requester→owner dependency topology plus inspector | “Which owned target conflicts with the priority?” | Current goal and company priority can be shown. Only measure/target is editable in the existing proposal model; no full old company priority snapshot. No active-agent inference | Select goal nodes and see approved/proposed distinctions, objective frozen |
| **Old-plan work · LIM-2453** | Scannable declared-work table, explicit “not observed” boundary, selected evidence panel | “Which known work may need review?” | Work items are declared plan fixtures, not verified live tasks; last-read/whole-plan freshness is not a goal-version receipt or a session event | Filter known entries, inspect evidence limits, jump to goal topology |
| **Decision record · LIM-2451** | Cream-paper archival packet on warm black shell; grouped event timeline with expandable detail | “Who approved what, under which conditions, and was any action observed?” | Goal owner ratification, separate Leadership launch `not_yet`, condition `Not confirmed yet`, explicit untested state; no agent execution evidence | Filter events by human/read, expand decisions, compare four independent truth axes |

## Brand and material translation: Liminal, not Dribbble's default palette

Canonical source: private `liminal-creative/canon/DESIGN_SYSTEM.md`, `tokens/design-tokens.css`, `tokens/colors-and-type.css`. Warm-near-black `#0A0A0B` substrate, lower chrome and a rare `#F3F1EF` paper artifact. The **Brand 4 cool half**, according to the latest fluid founder direction, is Wholeness Pink `#E90095` (human judgment), Clarity `#8E66FB` (diligence/AI analysis), Cerulean `#197EEB` (synthesis/candidate/source), Connection `#31E682` (confirmed successful event). Expression Teal `#1E9692` remains recessive depth. Orchid is lifecycle pending. Amber is watch/caution. Red is alarm for actual errors. Coral Surge is deliberately unused; Agency yellow is retired from brand/register. No new binding is silently approved.

**Physical ink state:** proposals begin as translucent **wash**, active human consideration **stains**, and a decided record becomes muted, material **dry**; never make a timed color transition look like real agent compliance. The paper record uses the aged Wholeness dry mark, but no fabricated cryptographic seal.

**Typography:** editorial serif display *where a screen names a decision or a question*, Space Grotesk for dense product operations, Space Mono for provenance and state. The prototype declares the canonical families and browser fallbacks; no font binaries are committed.

## Keep / adapt / merge / delete

- **KEEP:** existing backend authorization model; independently authenticated requester/owner and Leadership; one open proposal; valid owner counter/accept-if/decline; explicit no-test acknowledgments; no execution/telemetry claims.
- **ADAPT:** first-run (make the recognizable issue first, preserve schema); goal map (focused inspector rather than giant graph); work list (evidence qualification rather than artificial activity feeds); decision record (grouping and historical material).
- **MERGE:** two founder-approved *work-first* and *decision-first* home paths into the same governed plan and record. Shared `GoalContext`, `DecisionAuthority`, `EvidenceLimit`, `MaterialState` primitives should consume canonical Liminal tokens in production.
- **DELETE / AVOID:** dashboards with made-up risk/confidence percentages, fake agent execution/status, decorative rainbow cards, AI chat with silent approval powers, marketing-shot glassmorphism, unrelated busy metrics.

## Production boundary and important gaps

The HTML gallery is standalone: local fictional values and scripted interactions only. Its 3-step intake does **not** constitute a real `/new` form; its topology does **not** imply an auto-mapped graph or editable objectives; its work list is a fictional declared list, not actual current app telemetry; its paper packet is an editorial readout, not a cryptographically verified receipt. It must not be wired directly to the production API without a schema and permission audit.

**Known implementation gates:** record exact server labels/actions and conditions; ensure only goal measure changes; explicit two-role auth, reviewer acknowledgments, independent Leadership decisions; true `on_current_plan` hash semantics; no invented sessions. Respect gating in LIM-2441. Scope every item separately in LIM-2455.

## Review checklist — not yet completed

1. **Rendered browser QA** of all four new views at 1440×900, 1024×768, 900×800, 390×844 and 320×740; include form validation, node selection, work-row filters, event expansion and keyboard flow. Verify no clipping/overflow, control contrast, visible focus, reduced motion and read-only copy.
2. Founder A/B screen review versus D0 screenshots. D0 private screenshots remain private and **must not be committed to this public PR**.
3. Cold operator test: can someone tell within ten seconds what is **known**, **unverified**, **unobserved**, and which actor can actually authorize? Which screens feel helpful vs merely beautiful?
4. Friday discovery: distinguish unprompted evidence from discussion after the concept is explained, and record disconfirming cases.
5. Founder `LIM-2454` rulings on each screen's information hierarchy, visual treatment, home routing and any requested backend expansion before `LIM-2455` implementation.

**QA conducted in this authoring pass:** JavaScript syntax + static source checks on the gallery, confirming all four views, navigation hooks, mobile CSS breakpoints and no network API usage. **No browser render or independent usability pass is claimed here.**
