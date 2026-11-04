# Prototype status (Gate D2)

What each prototype in this folder is, and whether it passed Gate D2 (independent design-truth check against the v2 spec at align PR 37 `02f0e1f` and the founder rulings on LIM-2454). Only CLEARED files are design canon. Everything else is history: read it, don't build from it. Verdicts are on LIM-2449.

| File | Status | Verdict |
|---|---|---|
| `lim-2449-v2-command-center-e2e.html` (R4, map: `../ALIGN_V2_R4_CONNECTED_FLOW_MAP.md`) | **CLEARED** at `f86a160` | NOT CLEARED at `00029a1` (LIM-2449 `3e526c16`, 5 blockers); fixed in `f86a160`; re-verified with real input, 192/192 |
| `align-patterns-v2.html` | **CLEARED** at `45f1377` | LIM-2449 `053fad1b` |
| `lim-2449-v2-first-run-r3.html` (R3) | **CLEARED** at `213c992` | LIM-2449, R3 verdict |
| `lim-2449-v2-sample-e2e-r2.html` (R2) | **CLEARED** at `00e0d25`; superseded by R4 for the full flow | LIM-2449, R2 verdict |
| `lim-2449-v2-sample-e2e-r1.html` | Superseded by R2 | not cleared |
| `lim-2449-recognition-first-v4.html` | Superseded | not cleared |
| `lim-2449-intent-studio-v3.html` | Superseded | not cleared |
| `lim-2449-decision-desk.html` | Superseded | not cleared |
| `lim-2449-priority-change-v2.html` | Superseded | not cleared |
| `lim-2450-2453-dribbble-surface-studies-v1.html` | Reference gallery | not checked |
| `lim-2450-2453-dribbble-surfaces-v2-v15.html` | Reference gallery | not checked |

The rules every CLEARED file holds:
- Approval is not launch.
- Who may launch in v2 is unresolved.
- Conditions are the requester's acknowledgment, by name and time; they are never verified.
- The owner may Decline while a counter waits.
- One adaptive Home, leading "Understand and direct all AI work."
- Truth labels: Receipt / Agent reported / Not observed.
- One primary action per screen; Space Grotesk / Space Mono.
- No overflow at 320px.

A change to a CLEARED file needs a new D2 check before it counts as canon. Run that check with real clicks and typing, never only scripted calls.
