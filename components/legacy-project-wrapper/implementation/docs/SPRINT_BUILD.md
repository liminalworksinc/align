# Align · Proving Ground Sprint build (Oct 21–23)

Start here. This file points to the spec; it does not restate it.

1. Build spec: Sean's Build A plan, amended by review rounds 1 and 2 (Linear LIM-2424 comments 93a73357, 1f7e37fa).
   https://docs.google.com/document/d/1Kdk1j3uzz3__IVdMb1gSRYPTgnY7elXx_c_iR-A9fXg/edit
2. Rulings and status: Linear LIM-2424 (latest founder-rulings comment wins).
3. Clock, cut list, never-cut and the 30-day roadmap rule: Sprint Brief §4.10.
   https://docs.google.com/document/d/1LNZbtfbHNzkClQXSe5T3HBJHFMzlZJtgpa3eWCwPsI4/edit

Rules
- Minimum slice first (plan §7), one-shot, evaluate, fix. 6:00 PM Wed gate: minimum slice end to end + Sean's sign-off.
- Every lane worktree gets a gitignored .claude/settings.local.json with {"disableAllHooks": true} before Claude starts there (verified: it stops align-capture and align-watch).
- Ports 3200 (baseline), 3201+ (lanes). Never 3100. `npm run dev` and `npm start` both bind 127.0.0.1; the Docker image binds 0.0.0.0 explicitly.
- Never git stash. Draft PRs only. Shruti approves every merge; Sean reviews the plan's §10 files.
- Build B only after the 6:00 PM gate passes, B1 privacy gates first; otherwise it is Shruti's Thu 1:00–2:30 call.
- Capture consent is granted by leadership through the API, per harness and repo: follow docs/CAPTURE_CONSENT.md before the first real capture.
- Honesty: "Not sandbox-tested" for custom scenarios; untested approvals need accept_untested; one number per surface. Not shipped by Fri noon = the 30-day roadmap, never "shipped".
