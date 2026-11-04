# Align v2 R2 · D2 delta QA and independent verification status

**2026-10-30 · R2 head source pinned in draft PR #34.** [Prototype R2](./prototypes/lim-2449-v2-sample-e2e-r2.html) · [current founder-ruled R2 contract](./ALIGN_V2_E2E_DESIGN_CONTRACT_R2.md). R1 founder/D2 verdict was **NOT CLEARED** at `8435338` (LIM-2449 comment `8abad2c0`). This is a revision **submitted for re-verification**, not a replacement for that negative browser verdict.

| Check | R2 result | Scope / remaining gate |
|---|---|---|
| Embedded JS syntax | **PASS** | Fetched R2 HTML from GitHub and compiled its embedded script using JavaScript `new Function` |
| Reducer state transitions | **35/35 PASS** | Ran actual embedded reducer with stub DOM, including pending/countered decline, note/reason validation, invalid-field IDs, requester-only attestation, exact approval/launch split, queued/received/applied sequence, value/CTA states, decline, direct approve and unsupported actor rejection |
| Static CSS responsive rule | **PRESENT, NOT RENDERED** | At width ≤800: `.shell{grid-template-columns:minmax(0,1fr)}`; added `min-width:0` to key containers and mobile scroll confinement. **Do not report 161px/91px overflow fixed without actual screenshots** |
| Paper eyebrow contrast | **8.38:1 calculated** | WCAG luminance math on declared paper eyebrow `#6e3152` against `#f3f1ef`; actual computed styles in browser not measured |
| Typography | **SOURCE PASS / RENDER NOT RUN** | CSS requests Space Grotesk and Space Mono via Google Fonts and sets corresponding families; network success and rendered metrics need browser inspection |
| Required field focus | **SOURCE + REDUCER PASS / DOM NOT RUN** | `focusField` sets `#target`, `#condition`, `#counter-note`, or `#decline-reason`; real browser focus and error announced behavior need D2 |
| Countered decline | **PASS (reducer)** | Eligible approver can decline even while countered; no requester acceptance needed, reason 1–2000 |
| Requester condition acknowledgment | **PASS (reducer)** | One requester-only action sets `acknowledged_by=Maya Ortiz`, `acknowledged_at` timestamp; no verifier, evidence field or condition-verified state; no launch block |
| Post-decision conversion | **SOURCE + REDUCER PASS** | Value card shown after approved request; separate waitlist/LOI previews and local baseline estimate; **no real outbound link/funnel writes** |
| Real browser · 1440/1024/900/390/320 | **NOT RUN here** | iMac S0 must execute headless Chromium again, screenshot/measure overflow and demonstrate no clipped controls |
| Keyboard and assistive-tech / focus | **NOT RUN here** | Need actual tab order, focus after invalid submit, SR event wording, focus outline, 320px primary controls |
| Independent external usability | **NOT RUN** | No participant contacted, scheduled or observed; Dhivya is returning informed operator, not a naïve usability test |
| Actual v2 backend / MCP / identity / session hooks | **NOT RUN** | #37 lacks these ruled launch and condition semantics; PR #39 acceptance tests and launcher authority ruling required |

### Scripted reducer test paths exercised

(1) sample starts and enters Home; (2) review; (3) missing counter note rejects and points to note; (4) missing condition points to condition; (5) missing target points to target; (6) note over 2000 rejects; (7) Accept-if stores distinct condition and note; (8) countered request cannot auto approve; (9) approver can decline from countered but requires reason; (10) countered decline stores reason and emits no directive; (11) requester accepts counter; (12) requester cannot approve; (13) approver approves; (14) approved goal v2 not agent-effective and no directive; (15) neither old fictional verifier nor fixed Leadership actor exists; (16) ordinary approver cannot launch; (17) launch preview explicitly holds; (18) hold leaves old effective version; (19) launch can proceed with condition unacknowledged (ruling: no verification gate); (20) received; (21) applied; (22) requester acknowledges condition after approval; (23) approver cannot acknowledge; (24) repeat acknowledgment refused; (25) record shows requester name, timestamp and approver; (26) value card after approval; (27) separate waitlist and LOI local previews; (28) estimate stored locally; (29) missing decline reason blocked with focus; (30) direct approval; (31) no-condition branch; (32) no-condition launch; (33) declined has no value card; (34) unconditional counter; (35) normal sample state.

### Mandatory iMac S0 recheck

Rerun the **same baseline**: R1 verdict `8abad2c0` used four flows × six pages × five widths, 40 saved captures, no outside requests. On **R2**, inspect 320/390 body scrollWidth vs clientWidth (previously +161/+91 px), visual fold and expanded rail; note/reason inputs and focus, countered decline, counter acceptance→approver→separate launch, condition attestation regardless of launch, record text on paper, value/waitlist/LOI CTA on mobile, and fonts. Check source against **founder LIM-2454 rulings `33ad545d`, `35376283`**, and specifically **leave v2 launcher permission as OPEN**, not implemented. Post PASS/FAIL plus screenshots in LIM-2449; update this report with observed evidence or new follow-ups.

### D0 visual comparison still blocked on bytes

Original D0 commit `26402c0` contains 427 WebP capture paths and audit notes, but the GitHub API in this session did not supply renderable binary. Do not claim pixel-diff review; archived private images should be viewed by authorized reviewers. [Original test report](./ALIGN_V2_E2E_R1_TEST_REPORT_AND_RESEARCH.md) remains historical.

**D2 VERDICT: NOT CLEARED pending new actual Chromium/keyboard, source-truth, founder final launch-authority and user validation gates.** No production code changed or deployment requested.
