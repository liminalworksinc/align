# Align v2 · R4 one connected experience · map and D2 gates

**2026-10-30 PT.** [Open the single clickable R4 prototype](./prototypes/lim-2449-v2-command-center-e2e.html) · [Founder Align Patterns (33 Rule/Was specimens)](./prototypes/align-patterns-v2.html). On draft [PR #34](https://github.com/liminalworksinc/align/pull/34). **R4 design-only**, no v2 app backend or production release. R2 and R3 independently **D2 CLEARED**; this complete R4 composition needs its **own D2 verdict**.

## Product frame

**LIM-2454 ruling 3770c6c4**: open Align to **understand and direct all AI work**; governing one approved plan across agents, versions, decisions and evidence is the differentiator underneath the command center. Never imply live observation of a running agent, autonomous drift detection, or execution correctness without a real supported source. The first useful result must qualify its source and current unknowns.

## Screen → binding rulings / source

| Order | Screen | Primary action | Governing ruling / source | Truth boundary |
| --- | --- | --- | --- | --- |
| 01 | First run / eligible Northstar sample or one-agent preview | Open sample / Begin setup | R3 cleared; LIM-2452 sample eligibility; `02f0e1f` v2 workspace gate | Sample only without existing workspace or creation code. The scenario and receipts are fictional |
| 02 | Apps | Simulate app grant | R3 cleared; #37 v2 `interface.md` Apps + OAuth | App OAuth does not pair device, share session, or prove agent execution |
| 03 | Devices | Simulate device pairing | R3 cleared; #37 `local-agent.md` | Device code is separate authorization |
| 04 | Sessions | Install hooks → share to goal | R3; #37 `local-agent.md` | Uses `align share --dir . --workspace W --goal G` with placeholders; a session/goal bind alone is not an applied goal version |
| 05 | Adaptive Home / command center | Review change request | LIM-2454 **3770c6c4** positioning; **35376283** one adaptive Home; **e3a14f87** both recognition-first entries | Work evidence plus a typed next decision visible together, approval owner from permissions (fictional only here); mismatches require comparable goal+bound-applied receipt |
| 06 | Change request | Approve / counter / conditional counter / decline | R2 D2 cleared; **35376283** requester acknowledgment; `02f0e1f` change requests | Decline reason 1–2000; counter note 1–2000; separate condition; counter acceptance goes back to pending then eligible approval |
| 07 | Launch | Open record after previewing held / release | **33ad545d**: approval records a new goal, launch releases it to agents; LIM-2454 launcher permission **unresolved** | “Agreed, launch not yet” leaves previous v1 effective; launch releases v2 but receiving/applying not established without receipt. No invented launcher role. Current v2 #37 still needs a separate gated publication implementation |
| 08 | Decision record | Inspect Work | R2; **35376283** requester-only named/time acknowledgment; **33ad545d** launch split | Canonical request projection; no independent condition verification; no second mutable decision |
| 09 | Work/evidence | See value / ROI | R3 + Patterns E5/E6/E7; #37 directive receipts `received/applied/enforced`, typed agent request responses | Distinguish **Receipt**, **Agent reported**, **Not observed**. “Applied” is device-reported; not proof of completed work |
| 10 | Value and ROI | Preview waitlist | v15 `lib/value.ts`, `DecisionValueCard.tsx`, LIM-2445; v2 metrics contract | Measure only valid timestamp spans; sample timestamps fictional. User baseline is an estimate, not measured time saved. No inferred productivity or monetary ROI |
| Optional | Options | Simulate typed agent request | PR #37 `02f0e1f` REQ-001/2 and goal Hold/Release; Patterns D9/S5 | `switch_goal` needs developer acceptance. Goal hold differs from per-session Stop and does not itself implement Leadership launch |

**Final CTA semantics:** validated HTTPS Google Forms waitlist link is configured by the app; optional LOI link may lead to form or independent verified destination. `value_card_viewed`, `value_reported`, `waitlist_clicked`, `loi_cta_clicked` are engagement events, not signups/signatures. R4 deliberately opens no external links and sends no funnel events.

## Slice handoff and local verification

| Slice | Git commit | What changed | Author check / D2 |
| --- | --- | --- | --- |
| A · Connected route | `86ac5d159c605b0d7d82ba9a3695afd0c5d213f5` | Single file includes setup → Home → review/launch → record/Work → ROI | JavaScript syntax validated; independent D2 **NOT RUN** |
| B · Correctness | `25f4745df3f7cf38e01a6e65ddd7e3a5de42a287` | Work follows release and new receipt state; R2 form validation drafts/focus; timestamp-based sample spans | 71/71 scripted state/branch checks PASS, one enabled primary action per screen in tested states. Independent D2 **NOT RUN** |
| C · Evidence and map | This map plus PR-description correction | Explicit screen→ruling contract, verification handoff | Source/readback after commit; independent D2 **NOT RUN** |
| D · Canon polish | `d621050a72821245ae0fe5c8ffce852822b02d50` | Pink reserved for the primary button, brand mark violet; mono 10px uppercase tags with 2px tracking | Source and JS syntax checked; independent D2 **NOT RUN** |

### Required S0 D2 checks on the **final R4 head**

- Run **isolated headless Chromium** (no external requests) at **1440, 1024, 900, 390, 320**; measure document scrollWidth−clientWidth **0px**, page errors **0**, focus/keyboard, canon fonts Space Grotesk / Space Mono, 10px uppercase 2px mono tags, semantic tokens: pink primary only; amber need-judgment; failure red only.
- Drive **sample first-run → dual-entry Home → direct Approve → Not yet → record → Work → ROI → waitlist preview**.
- Drive **Accept if… with separate note/condition → requester accepts revision → eligible final approval → requester acknowledged by name/time → launch sim → receipt → ROI**. Countered request can be declined with a required reason. After invalid note/reason, draft and focus remain on the failed field.
- Drive **one-agent Apps → Devices → install → share → Home with no old applied receipt (Not known) → simulated applied receipt**. No fake agent execution; Work must not claim switched/success solely from launch/receipt.
- Verify **launch authority unresolved** in prose and interaction: simulated choices are clearly not actual granted permission; v2 goal Hold/Release must **not** silently stand in for launch version-release transaction.
- Verify value card measured spans are produced from *fictional sample* event timestamps; real one-agent path says **Not measured**; baseline estimate has five v15 `value.ts` choices and is never used to calculate ROI. Waitlist/LOI preview does not contact any external service.
- Verify the in-file **Align Patterns** link opens the 33-specimen sheet and every screen has **at most one enabled primary action**.
- Post **a separate verdict for A/B final composition** to LIM-2449 with screenshot provenance. Do not borrow R2/R3 cleared status to assert new R4 D2 clearance. Every slice needs its own review result; this document does **not** schedule or guarantee a verifier's response within an hour.

## Outstanding launch implementation requirement

**Who may launch in v2 remains unresolved.** The 33ad545d ruling specifies what launch *does*, not who can perform it. PR #37 at `02f0e1f` currently publishes goal-version directives on approval, while goal Hold/Release controls tools; Hold/Release is **not** yet an authorized version-publication transaction. This prototype explicitly simulates proposed held/release outcomes. No backend action or new role may be inferred from it.

## Release and customer evidence

R2 was independently D2 cleared at `00e0d25` (LIM-2449 `3e862278`). R3 was cleared in its later S0 D2 review; these are **component scope** verdicts. The new end-to-end R4 has not been browser-tested or independently user-tested here. No customer connection or signable LOI was created; no PR was merged or deployed.
