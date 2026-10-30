# Changelog

## Unreleased

- Pre-seed build list (PRESEED-001 … 008):
  - Hosted Align no longer has a closing date (`ALIGN_DELETE_BY` is ignored); Fly volume snapshots are kept 7 days.
  - Hosted workspace creation is gated (`ALIGN_CREATION` = codes, open or closed): single-use creation codes, a global
    workspace cap, a public request-access page with a separate follow-up/LOI interest choice, and `align-admin`, the
    operator script for codes, requests, workspaces, retention, LOIs and the funnel report.
  - Abuse controls when hosted: Cloudflare Turnstile on email codes, access requests and creation; durable rate limits;
    a disposable-domain block; caps on owned workspaces, members and sessions per device per day.
  - Account deletion; workspace soft delete with a 30-day restore; a daily retention job (session roll-ups after 13
    months, audit log 1 year, former members pseudonymised after 30 days, purge of deleted workspaces, access requests
    and product events after 13 months), published in `docs/RETENTION.md`.
  - Passkeys, a 30-day absolute session cap, sign out everywhere, a fresh sign-in on every sensitive action, provider
    tokens encrypted at rest, and Better Auth's unused token and unlink routes turned off.
  - Evidence on change requests: typed links labelled self- or agent-reported, an Align-computed goal snapshot per
    revision, an audited approval without evidence, and an opt-in `changes:evidence` MCP scope (MCP stays read-only by
    default).
  - Content-free product funnel events and the operator report (time to first value, weekly active workspaces,
    retention, share of work bound to goals).
  - Security pack drafts for counsel review (privacy policy, DPA, subprocessors, security overview, questionnaire),
    `SECURITY.md`, and public `/privacy` and `/trust` pages.
  - `npm test` runs the full suite (lint, typecheck, syntax, test-v2, test-oauth, align-agent) with one exact count, so
    the retained test receipt covers the web app.
- Initialized the project with Literate AI's specification-led lifecycle and durable
  user-directed work queue.
