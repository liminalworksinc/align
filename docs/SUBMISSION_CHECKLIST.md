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
  - **Description:** Cross-team goal changes, decided by the people who own them, with tested evidence. When the CEO changes priorities, Product proposes a change to a peer team's goal, tests the candidate agent plan in Sparta Worlds against the same mission, seed and checks, and the owning team counters and ratifies its own goal. In-app time is measured; the manual baseline is an estimate. One-day prototype with a synthetic company.
  - **Technologies:** Next.js, TypeScript, Sparta Worlds, Alike, Anthropic Claude
  - **GitHub URL:** paste the output of `git remote get-url origin` without `.git` (public repo)
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
