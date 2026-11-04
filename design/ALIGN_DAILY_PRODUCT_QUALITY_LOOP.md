# Align · Daily product-quality loop

**Established as a review/measurement proposal, 2026-10-30.** This is a working operating contract for improving Align every day, not an approval to merge, deploy, add agent telemetry, or implement unapproved design. Reuse the existing Linear chain D0 → D1 → D2 → founder review (LIM-2454) → D3 (LIM-2455); do not create another project-management system.

## Target outcome

Every cycle should make **one user-visible task** easier to comprehend, complete, or trust. The central metric is **time to first *truthful, useful result***—a real plan, an authorized next decision, or an evidence-qualified view of potentially affected work—not the number of PRs or the appearance of a dashboard.

**Two founder-approved entry experiences:**
- **Work-first:** "Is any work still following the old plan?" Distinguish declared work and whole-plan app-read status from actual observed execution, which custom hosted v15 workspaces generally do not capture.
- **Decision-first:** "What changed, who has authority, what can I decide now?" Respect the server's state machine for propose / counter / conditional acceptance / rejection / ratification / separately authorized leadership launch.

**Post-decision sequence already shipped on Fly v15:** after RATIFIED custom proposals, preserve `DecisionValueCard`: before/after target, approving actor, work split, measured proposal→decision time, separately labelled optional user estimate, waitlist and optional *nonbinding* LOI link. A click is not a signed LOI or completed independent test.

## 90–120-minute operating cadence

| Timebox | Work | Evidence output |
|---|---|---|
| 10–15 min | Observe one fresh or currently blocked task from v15, an actual tester recording, or a verified issue. Reproduce the failure; identify exact role and source. | Pin branch/build SHA, scenario, measured baseline, screenshot, and what was **not observed**. |
| 40–50 min | Fix the **single highest-impact friction point**: blocked functionality first, then confusing next action, then visual hierarchy. | Smallest coherent patch and explicit user benefit. No unrelated design tweaks. |
| 20–25 min | Make before/after behavior legible and implement/adjust the accessible visual state. | Desktop + mobile screenshots at consistent scenario, semantics of goal/decision/evidence intact. |
| 20–30 min | Verify contract and regressions, not just a green build. | Behavior test, relevant role/permissions/empty/error/slow cases, screenshots and recorded result. |
| 5 min | Log decision: ship, hold, or revert; capture today's one improvement and next unblocking action. | Existing issue/PR review comment, not a new reporting tracker. |

The earlier suggested 40/30/20/10 split is too light on verification for an authorization/provenance product. Verification is a **minimum gate**, not optional leftovers. An independently blocked tester takes precedence over aesthetic polishing.

## Daily candidate selection (strict)

1. **P0 blocker:** a real tester cannot enter, understand, or complete their first truthful workflow or is blocked by hosting/permission/error state.
2. **P1 time-to-value:** remove one unnecessary step between recognizing a change/connecting an app and seeing a real approved plan, the pending owner action, or grounded evidence.
3. **P2 trustworthy interpretation:** repair confusing distinctions among proposed, approved, launched, read, tested, completed, and signed LOI.
4. **P3 fit and finish:** improve information hierarchy, keyboard focus, contrast, material tokens and motion on a screen that already works.

Do not invent new metrics, task feeds, goal-to-session mappings or live-agent claims merely to make a mockup look compelling. A prototype can be visually reviewed without changing production. Prefer a screenshot-backed improvement to a new screen concept unless field evidence demands it.

## Daily release scorecard (5 binary gates)

Score a **specific candidate change**, not the entire company, and do not pre-fill it as `0/5` without running the checks.

- [ ] **Complete workflow:** one correct requester → goal owner → (where applicable) leadership → decision record path, including before/after and ratification semantics, passes on the targeted build.
- [ ] **Unaided first action:** at least one appropriately recruited, uncoached person identifies the relevant first action and reaches the first useful result; internal walkthrough counts as internal, not external validation.
- [ ] **Visual comparison:** identical scenario/role screenshots before and after, desktop and phone, reviewed for action hierarchy and responsiveness.
- [ ] **State integrity:** empty, loading, timeout/error, unauthorized, stale plan and keyboard focus are checked, with truthful labels, contrast and no invented agent execution.
- [ ] **Release integrity:** targeted tests, regression checks and actual hosted result verified; flag/rollout and rollback boundary documented.

**5/5 is the preferred release gate**, but some daily sessions end as **HOLD (not deployed)** if any test is inconclusive. A design-only PR must never be counted as a hosted release pass. When no external tester is available, the unaided test remains **NOT RUN**, not "passed".

## Instrument four outcomes without conflating them

1. **Time to first useful result** — begin at new-workspace entry or first authorized app connection; end when an actual, role-appropriate actionable plan/evidence/owner decision is displayed. Log build/version; distinguish hosted v15, scripted prototype, and future v2.
2. **Unaided workflow completion** — numerator: qualified people who complete the agreed workflow without founder explanation; denominator: all qualified attempts; report small sample sizes and barriers.
3. **Decision-to-reentry** — goal approval, leadership launch decision, app's last whole-plan read, and *observed* execution are independent events. Do not infer reentry or completion from a read.
4. **Defect escapes** — incidents from hosted testing traceable to a candidate release; distinguish open, corrected, regressed and unverifiable.

Optional funnel metrics from #36 (`value_card_viewed`, `value_reported`, `waitlist_clicked`, `loi_cta_clicked`) track interest and engagement only; verify form submissions and signed LOIs from the relevant source systems separately.

## Current product lanes and design constraints (as checked Oct 30)

- **Now / production**: Fly **v15**, merged PR #36 on main `e044f11`. Daily usability/quality fixes should be proposed against the real v15 behavior; no silent merge.
- **Design review**: draft [PR #34](https://github.com/liminalworksinc/align/pull/34) and [LIM-2454](https://linear.app/liminal-space-io/issue/LIM-2454). v3 had a successful source/browser design review; later v4 and gallery need their own rendering and cold-operator gates. Founder has chosen **both** work-first and decision-first paths, not yet exact routing.
- **Future system**: [PR #37](https://github.com/liminalworksinc/align/pull/37) has since been marked **non-draft**, but is **not merged**. It is a v2-only replacement, not protected by the old `ALIGN_GOAL_SESSIONS` rollout flag after merging. Latest PR body reports **766 passing retained tests**; do not treat that as an independently verified Docker image, hosted rollout or migration. Preserve functionality equivalent to merged #32 and #36 before approving this replacement.
- **Experiment**: [PR #29](https://github.com/liminalworksinc/align/pull/29) remains a separate flagged v2 allocation/steering experiment, not present in Fly v15.

### First recommended improvement cycle

**Target:** from a real, uncoached tester's first click to **the first accurate next action** in a custom v15 workspace. Collect a baseline of the first-run steps, timestamp of first useful result, first hesitation or blocked step, viewport, and user role. If independent test evidence is not yet available, start with an explicitly *internal* blind walkthrough and keep the external validation gate open.

**Candidate improvement:** make the current signed-in "Your turn" / Decision Desk reliably answer four questions in the first view: *What changed? What is known to be affected? Who is allowed to decide? What should I do next?* This is a behavior/IA specification, not authorization to alter the backend. Verify no degradation of #36's after-decision value and optional follow-up path.

**Daily change record template (append on the existing Linear/PR ticket):** `Build/role/scenario | baseline and observed problem | change | before/after image links | behavior + a11y + hosted gate results (PASS/FAIL/NOT RUN) | first-useful-result time | user impact | disposition | next blocker`.

No recurring automation is created by this file. A daily scheduled report should reuse existing founder brief/audit where possible rather than duplicating them.
