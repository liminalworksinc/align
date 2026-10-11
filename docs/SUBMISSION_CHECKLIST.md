# Align: Submission Checklist (SpeedHacks, Oct 11, 2026)

**Hard deadline: 5:00 PM PDT.** Saving a draft does **not** submit. Stopping the recording does **not** submit.

## Roster (do now)

- [ ] Every teammate is registered on HackerSquad **and** has accepted the team invite.
- [ ] Team roster on the project page matches who actually built it.

## Timeline (PDT)

### By 2:30: Click path works, code pushed
- [ ] Full click path works end to end in two windows: Goals → Brief → Scenario Studio → Propose → Counter → Acknowledge → Ratify → both see accepted → proof strip.
- [ ] Sparta evidence present for `p-throughput@1` normal, `p-beta@1` normal and `p-beta@1` interruption.
- [ ] Code pushed to GitHub.

### By 3:15: Backup recording + README
- [ ] Record a **backup** full-length demo (follow `docs/DEMO_SCRIPT.md`) and save it locally.
- [ ] README final: problem, flow, truth states, sponsor usage, quick start, Sparta repro, claims/non-claims.
- [ ] All `[fill from actual run]` values come from real runs, or the line is cut.

### 3:45: Feature freeze
- [ ] No more code changes except demo-breaking fixes.
- [ ] Final push. Confirm the repo builds from a clean clone (`npm install && npm run dev`).
- [ ] Repo is **public**. Check it in a logged-out/private window. No `.env`, `data/.secret` or API keys committed.

### 4:00: Save project + start recording
- [ ] On HackerSquad, create/save the project:
  - **Name:** Align
  - **Description:** AI agents finish tickets fast, but when the CEO changes priorities, agreeing on the right work still takes meetings. Align turns that into one owner-controlled decision backed by a real test. Product sees that Security's agents still chase ticket throughput, tests both plans in Sparta Worlds on the same tickets and checks (current plan: 5 of 5 runs failed and touched the protected security ticket; new plan: 6 of 6 passed), and proposes a change. Security edits and approves its own goal; only it can. Coding agents then read the approved plan from Align over MCP before they act. In-app time is measured; the manual baseline is an estimate. One-day prototype with a synthetic company.
  - **Technologies:** Next.js, TypeScript, Sparta Worlds, Alike, Jev (TypeSafe), Model Context Protocol, Claude Code, Vercel AI Gateway
  - **GitHub URL:** https://github.com/liminalworksinc/align (public repo)
- [ ] Demo reset done (see the pre-recording checklist in `docs/DEMO_SCRIPT.md`).
- [ ] **Start the final recording.** Target ~4:10, never over 5:00.

### By 4:40: Submit and verify
- [ ] Upload or link the video (final, or the 3:15 backup if the final isn't usable).
- [ ] Click **Submit**.
- [ ] Reload the project page and confirm the status reads **"submitted"**, not draft.
- [ ] Screenshot the submitted status.

### 5:00: Hard deadline
- [ ] Nothing left to do. If the status isn't "submitted" yet, fix that before anything else.

## Final honesty pass (before Submit)

- [ ] The manual baseline is labeled **ESTIMATE** everywhere it appears (video, README, UI).
- [ ] No claims of traction, ROI, production time savings or release verification.
- [ ] Alike is mentioned only if a decision was really retrieved in a fresh session.
- [ ] Jev/TypeSafe is described accurately: it classifies captured agent sessions against the goal registry via Vercel AI Gateway; matches are suggestions that need the goal owner's confirmation.
- [ ] "Company beta readiness is NOT verified by this test" is visible in the README and said in the video.
