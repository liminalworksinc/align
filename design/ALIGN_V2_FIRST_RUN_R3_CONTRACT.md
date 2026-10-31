# Align v2 R3 — first run + one connected agent (D2 candidate)

**Friday October 30, 2026 · draft PR #34.** [Interactive R3 prototype](./prototypes/lim-2449-v2-first-run-r3.html). **Source pinned:** v2 PR #37 at `02f0e1ffc56fd10e6c035102c2041bfcf38fa1d6`. **Design intent:** reduce time to the **first truthful, useful result**, not optimize the approval flow, Spend, Asks, or the visual system. [Daily quality loop](./ALIGN_DAILY_PRODUCT_QUALITY_LOOP.md).

**Separate cleared baseline:** v2 R2 approval clickthrough D2 cleared at `00e0d25` (LIM-2449 comment `3e862278`). R3's browser D2 review was **CLEARED with three Medium fixes required before build** at `a3f3778` (LIM-2449 `45b71ab1`) and reconfirmed at `2e8ee8f` (`e199b71e`). The three fixes are now committed in the R3 branch; **that subsequent revision has not been browser-rechecked yet**. R2 remains separately cleared and unchanged.

## D2 Medium remediation · pending S0 rerun

**Reviewed finding:** LIM-2449 `45b71ab1-d2bb-4bba-9264-5bdda4c0d703`, recheck `e199b71e-4fc9-4cc9-bef7-1f1b3eb2aed5`. Both assessed earlier heads and rated R3 **CLEARED with three Medium fixes before implementation**. This note describes the **subsequent design patch**, not a new Chrome verification.

1. **CLI:** Sessions now shows `align share --dir . --workspace W --goal G` with a note to replace W/G. A directory rule shares new sessions started in that folder, not just one past session. The v2 specification at `02f0e1f` actually documents *both* a `<session|--latest>` single-session form **and** `--dir [<folder>]` folder rule; the change selects the requested folder-based first-run route. Do not misstate that `--latest` is absent from `local-agent.md`.
2. **Dual-entry:** Home now begins with a side-by-side **Work · Affected context** and **Decisions · Whose turn?** summary. Sample: a **separate fictional pending change request** waiting on Dev Patel, not a pending state for the already-approved goal in the mismatch. Own-work path: **Waiting on you: Not known** rather than inventing a request queue or eligible actor from an unavailable server response. There is still only one primary CTA on Home.
3. **Mismatch color:** both mismatch blocks use judgment amber (left border `#fdc237`, outline `#b38b42`, background `#30291b`), never action pink. The mismatch label is amber; pink remains for the single primary action. Source/state proof requirements have not changed.

**Low cleanup included:** internal reviewer phrases moved out of the prototype UI; Restart made secondary-weight on narrow screens; live region announces human screen labels instead of internal step IDs. Production font hosting is a future implementation question (prototype requests Space Grotesk and Space Mono via Google Fonts with fallbacks).

**Must recheck:** 1440/1024/900/390/320 sample and one-agent routes; 0px overflow; no errors; amber mismatch; meaningful decision summary at narrow width; primary action count; command semantics against `local-agent.md` and `workspaces.md`; WCAG contrast/focus. This source-only patch **does not** constitute S0 Chromium QA or independent tester completion.

## Operator promise and success condition

A new operator enters an eligible sample or connects **one** agent and, ideally within **10 minutes**, can answer three questions correctly:
1. **What changed?** Compare the recorded approved goal / requirement, with source, to older context.
2. **What work is affected?** Show the actual recorded goal↔shared-session link, last directive version, **and the limits of that evidence**.
3. **Who decides?** For change requests, show the **effective v2 goal approval set** (goal owner, eligible team lead or applicable workspace owner). **Launch authority is unresolved** and cannot be inferred from that approval set.

**Success is a participant observation, not a design claim:** `>=2/3` uncoached participants reach a true fact about *their own work* in `<=10m`; `>=2/3` correctly say the agent does **not switch just because the human agreed**, and actual switch remains **not observed unless supported by the relevant receipt**; `>=1/3` volunteers their current workaround and a plausible pricing unit. Track session start, exact first useful statement, source, latency, coaching, misunderstanding, workaround and pricing unit. These are *future* tests; R3 has none.

## First-use journey, one primary action per screen

| Screen | Primary next action | Recorded truth allowed | Boundary / important empty state |
| --- | --- | --- | --- |
| **00 Choose** | Open Northstar sample **or** enter the authorized workspace after picking a path | v2 `/app` workspaces, sample only when person has **zero workspaces and needs no creation code** | Under `ALIGN_CREATION=codes`, sample must not appear; request access/invite route instead. Sample data is illustrative, not the tester's work. |
| **01 Apps** (one-agent path) | Simulate connecting an OAuth app; *CLI-only path can skip* | Apps OAuth grant, `goals:read`, connected by, approved at | OAuth grant is **not** a paired CLI device or a shared session. No app last read implies work. |
| **02 Devices** | Pair one device through `align login` → `/app/device` | Device-code pairing under the signed-in person | This does **not** automatically share a session or install a hook. |
| **03 Sessions** | `align install`, then `align share --dir . --workspace W --goal G` (replace W/G with real refs) | Explicit sharing and bindable goal; current epoch/governing goal and last sync when present | No transcripts/prompts inferred. Idle sessions may not fetch directives until the next hook sync. No session = **Not known**. |
| **04 Home** | Inspect affected work | **One adaptive Home** with equally visible decision-first queue (fictional sample request waiting on Dev Patel, or Not known when queue unavailable) and work-first evidence; goal source + last *applied* directive snapshot source | Do **not** infer actual task execution, compliance, or stopping from `received` alone. When applied receipt missing, **Not known**. |
| **05 Affected work** | Inspect **Options** | Approved goal, bound session, prior directive receipt, and what is missing | Explicit `Not observed` for subsequent agent work and `Not known` for whether it switched; no green “all aligned.” |
| **06 Options** (secondary) | No first-run requirement; typed request/hold disclosure only | Requests `replan`, `checkpoint`, `switch_goal`, per-session `sent/received/accepted/declined/expired`, `auto_accepted`, goal `hold/release` | Safe `checkpoint` and draft-`replan` may be auto-reported; `switch_goal` **cannot** be auto-accepted, developer consent required. An accepted/declined receipt is only the agent/device's report. |

The standalone HTML uses fictionally labeled state toggles, no APIs, no actual workspace creation, authorization, usage or live session ingestion. Its Northstar fixture includes a **fictional historical applied receipt**, only to demonstrate the proposed *source-supported* mismatch anatomy. The **actual v2 Northstar sample is not asserted to contain any agent session or receipt**. A real customer requires a source trace, and the UI must withhold the mismatch when any required side is missing.

## E5/E6 — mismatch to affected work (provisional)

The supplied brief names Align Patterns **E5 and E6** but says their source is a **local fixed sheet**. That sheet was **not accessible in this session**, so this is a **proposed arrangement, not a claim to reproduce pattern wording**.

**Evidence qualification for the line “Agents are told to do ≠ now required”:**
- *Now required* — current authorized requirement/goal, with **goal ID, version, actor and changed time** where available.
- *Agent-effective context* — **last applied goal-version directive receipt** associated to a specifically shared/bound session, with session/version/device/source and receipt time.
- If the record is only `sent` or `received`, label **Not known whether applied**. If the goal is approved but unlaunched, under the founder-ruled **future** launch model the previous launched version remains effective; **current PR #37 does not implement this yet**. Never claim an agent is actively executing the old task or that code drift was automatically detected. When there is no old/new comparable pair, show **Not known** and the precise next step for gathering it.
- From a qualified mismatch, the affected-work drilldown names the bound session, last directive, and limitations. *Completed work*, *stuck*, *successful switch*, and *obsolete work actually continuing* are not automatically observed.

## New v2 capability placement, without turning it into the primary flow

- **Typed Requests** belong in the goal detail **Agents / Options** panel and in the source-linked work drilldown, not a new home-level “inbox.” Sender: effective approval set or workspace owner; v2 service reports actual permission. Valid types `checkpoint`, `replan`, `switch_goal`; state per target session `sent`, `received`, `accepted`, `declined`, `expired`. `auto_accepted` applies to safe checkpoint or drafting a replan only. For `switch_goal`, developer acceptance is required before a binding change. **Do not say the agent completed the requested outcome.**
- **Goal Hold / Release** belongs visibly beside those per-goal Agents controls and appears as a banner on Goals/Sessions; an authorized approver or workspace owner may hold/release (with recent sign-in). Hold `enforced` locally blocks agent tools on *all sessions for that goal*, including newly bound ones. Release reports `applied`. **Stop** remains per-session with a separate latch, and a goal release does not undo a session Stop. Avoid danger red unless actual failures; human Pause or Decline is not a system error.
- **Launch mapping: OPEN PROPOSAL, NOT RULED.** Founder ruling `33ad545d`: approval records the new goal version; **launch** releases it to agents. Current PR #37 `02f0e1f` instead **writes a `goal_version` directive on approval**, while Hold/Release only pauses/unpauses agents. Therefore **simply holding before approval and releasing afterward does not guarantee “Agreed, launch not yet”**: the new version may already have been delivered. A safe mapping would require (a) deferring executable goal_version publication until launch, (b) version-specific atomic release, (c) launcher permission (still **unruled**) and (d) tests for stale versions/idle or already-running sessions. Prototype labels this as an *unapproved* backend/product proposal. It does not introduce a fake Leadership role.

## Binding rulings and D2 verification

- **Keep R2 unchanged**: approval ≠ launch; condition `Accept if…` requires one requester-only named/timestamped acknowledgment, not external verification; one adaptive Home, work-first plus decision-first, no chooser.
- **Canon**: Space Grotesk + Space Mono, violet focus, no Agency/Surge pigment, no fabricated failure-red, no composite green all-aligned status; no horizontal overflow at **320 or 390**.
- **D2 input for S0:** Run **real Chromium** at `1440, 1024, 900, 390, 320` with sample/own paths, no-created-workspace + code-gated sample, app grant with/without CLI pairing, before and after a bound session and an applied receipt, mismatch→work, typed safe request vs switch_goal, goal Hold/Release vs session Stop. Confirm first useful action in viewport; no sideways scroll; visible keyboard focus; font fallback and semantic status labels; no invented session/agent execution.
- **Status as of the Medium-fix revision:** original R3 browser D2 **CLEARED WITH MEDIUMS** at `a3f3778` and again `2e8ee8f`; fixes pushed afterward need S0 **real-browser D2 RECHECK** before build. Latest simulated JS reducer **30/30 PASS**, static command, dual-entry and amber-source checks PASS; no independent-user usability evidence. Real external tester outcome **NOT RUN**. The Monday 11/2 independent sessions use **live v1**, which **cannot connect an agent in custom workspaces**; only sample/first-action comprehension can be learned there. Move the *connect an agent* test to a later **v2** round with real consented device/session records.
- Do not optimize approval-flow polish, pricing UI, or secondary Spend/Asks in R3. The requested pricing unit is an **interview observation**, not a tab.

## Source cross-check at PR #37 `02f0e1f`

`specs/align/interface.md` (workspace gate, routes, Apps/Devices/Sessions); `local-agent.md` (CLI `login/install/share`, hooks, request answers); `directives.md` (request types, receipt states, hold/release/stop and current approval delivery); `goals-and-proposals.md` (approval set, request permissions, hold); `lib/v2/requests.ts` (`canSend`, required target sessions, hold/release); `app/app/_ui/requests.tsx` (goal Agents controls); `app/app/w/[ws]/apps/view.tsx`; `app/app/w/[ws]/sessions/view.tsx`. Future launch authorization and conditions remain governed by LIM-2454 and LIM-2463/2464.

**No v2 source code, migration, device permissions, real app integration, or deployed user experience is changed by this design PR.**
