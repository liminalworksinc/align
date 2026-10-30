# Align UX — D0 as-is audit (public summary)

**Ticket:** LIM-2446 (D0), project P-LIM-99, Liminal Align Product Design & Operator UX. Accepted 2026-10-29.
**Baseline audited:** main `5b74d8683592eeea4ae0850156ea7b9759b23258`, the build deployed to the hosted test environment on 2026-10-29.
**Scope:** every screen a first-time operator meets. That covers creating a workspace (including the AI intake interviewer), signing in, deciding on a proposed change, the decision record, goals, work, and connecting AI agents. It covers all three roles, at 1440, 1024 and 900 px, plus 390 px for setup and action screens.

**Evidence:**
- 2 public pages were captured from the hosted environment, signed out and read-only.
- 93 signed-in states were captured locally in a fictional workspace at the same commit.
- 10 states couldn't be captured; each is logged with steps to reproduce it.
- The full screenshot archive and the detailed findings are held privately by the Liminal team.

## Themes that feed the redesign (D1/D2)

1. **Decision placement.** Put the action a reviewer came to take in the first view, and make the difference between agreeing to a change and approving it explicit.
2. **Responsive shell.** The signed-in layout should adapt to narrow screens the way the setup screens already do.
3. **Consistent state after a decision.** Every surface should show the same current plan and the same launch status once a decision is recorded.

These themes are inputs to the redesign, not approved changes. Design proposals and founder rulings are tracked in LIM-2447 to LIM-2454; implementation (LIM-2455) waits on those rulings.
