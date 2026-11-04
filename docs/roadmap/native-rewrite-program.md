# Native rewrite program

- **Status:** active
- **Owning queue item:** [ADOPT-002](active-work.md#adopt-002)
- **Completion / archival evidence:** pending while ADOPT-002 remains open

The retained implementation at `components/legacy-project-wrapper/implementation` remains source-authority
until each boundary earns transfer under ADR 0002.

## Ordered work

1. [x] Produce a boundary inventory: deployables, public interfaces, data schemas,
   runtime state, build targets, tests, packages, CI/release jobs, assets, and target
   variance. Every row names source/test/document evidence and an owner.
   See [Boundary inventory](#boundary-inventory) (2026-11-04, main at `cff1d34`).
2. [ ] Classify each row as Component intent, Flavor requirement, conversion skill,
   immutable asset, repository-only harness, or intentionally retained source.
   Proposed classes are in the inventory's Class column; they need owner review.
3. [ ] Select the smallest independently buildable/testable boundary and author its
   native authority; leave later boundaries retained. B01 is done (see the inventory);
   the [proposed next boundary](#proposed-next-boundary) is B09.
4. [ ] Generate, build, test, execute, and package the candidate through the ordinary
   lifecycle; compare observable results with the Phase 1.2 parity record.
5. [ ] Independently accept and regeneratively qualify the candidate before authority
   transfer.
6. [ ] Remove only the replaced retained files (`git rm`/`rm`), rerun the full E2E
   workflow, record evidence, then repeat from step 3.
7. [ ] Prove no unclassified retained file remains; archive this program only after
   full parity and current project verification.

## Boundary inventory

Paths are relative to `components/legacy-project-wrapper/implementation/` unless they
start with `/`. Owner is the spec area in `/specs/align/` that states the boundary's
behavior. Class is one of: **intent** (a native Component specification), **flavor**
(target requirement), **skill** (conversion practice), **asset** (immutable input),
**harness** (repository-only), **retained** (intentionally retained source, with the
reason). "Pure" below means the module imports nothing, or only other pure modules and
types, and does not touch the database, files, network, clock or environment.

### Pure logic (native Component candidates)

| ID | Boundary | Files | Public interface | Evidence | Owner | Class |
|---|---|---|---|---|---|---|
| B01 | MCP paste lines | `lib/paste-lines.ts` | `shq`, `safeMcpUrl`, `claudeCodeLine`, `codexLine` | `scripts/test-paste-lines.mjs`; native child `/.literate/native-projects/local-paste-lines` (49 cases) | `mcp.md` | intent: transferred, release authority `specification` since #37. The retained copy is still in the tree; step 6 (remove it) is not done. |
| B02 | Wording helpers | `lib/v2/text-core.mts`, `plural.mts`, `money.mts`, `launch-words.ts`, `change-words.mts` | `cleanProse`, `isBlankText`, `dropInvisible`, `plural`, `count`, `usd`, `launchWords`, `changeWords`, `diffWords`, `counterSameAsBase` | direct imports in `scripts/test-v2.mjs:2271` (money), `:7337` and `:8203` (change-words), `:8225` (plural); text-core and launch-words only through the HTTP routes | `interface.md`, `goals-and-proposals.md` | intent: Component `local/wording` |
| B03 | Home attention and evidence classes | `lib/v2/home-core.mts` | `EVIDENCE_CLASSES`, `appEvidence`, `receiptEvidence`, `appStatusWords`, `changeWaits`, `alignmentWaits` | `scripts/test-v2.mjs:6456`, `:8118` | `workspaces.md`, `interface.md` | intent: Component `local/home-attention` |
| B04 | Share-again wording | `lib/v2/share-again.mts` | `shareAgainText`, `shareAgainWords`, `sharingStoppedText` | `scripts/test-v2.mjs:3417` | `local-agent.md` | intent: Component `local/share-again` |
| B05 | Authorization policy | `lib/v2/policy.ts` (no imports) | `WS_ROLES`, `POD_ROLES`, `WORKSPACE_ROLE_ACTIONS`, `POD_ROLE_ACTIONS`, `GOAL_READERS` and the role and visibility types | `scripts/test-v2.mjs:1009` | `workspaces.md`, `goals-and-proposals.md` | intent: Component `local/policy` |
| B06 | Input validation and error type | `lib/v2/validate.ts`, `lib/v2/errors.ts`, `lib/errors.ts` | `str`, `cleanName`, `oneLine`, `optStr`, `oneOf`, `nonNegInt`, `revisionRead`, `badRequest` | only through the HTTP routes in `test-v2.mjs` (no direct import) | `interface.md` | intent: Component `local/validate`, together with the error type it throws; needs direct probes first |
| B07 | Value card rules | `lib/v2/value-core.mts` (imports B02) | `estimateSaid`, `cleanValueText`, `safeFollowUpUrl`, `loiUrlOk`, `followUpUrl`, `spanWords` | `scripts/test-v2.mjs:5149` | `goals-and-proposals.md`, `metrics.md` | intent: Component `local/value-rules`. It reads `process.env` only as a default argument, which the spec can make an input. |
| B08 | Trust page Markdown renderer | `lib/trust/markdown.mts` | `parseMarkdown`, `parseInline`, `plain`, `slug`, `safeHref` | `scripts/test-v2.mjs:438` | `workspaces.md` (public trust pages) | intent: Component `local/trust-markdown` |
| B09 | Agent spend parsers and price table | `packages/align-agent/src/spend/*.ts` (4 files) | `PRICES`, `PRICE_TABLE_VERSION`, `priceRequest`, `priceRow`, `picoToMicros`, `parseClaudeLine`, `parseCodexLine`, `claudeCounts`, `codexCounts`, the `UsageEvent` family | `packages/align-agent/test/metering.test.ts`; consumed by `src/ledger.ts` and `src/tailer.ts` | `local-agent.md` | intent: Component `local/spend-meter`. Imports only types from `shared/types.ts`, and `node:path`. |
| B10 | Agent envelope and share-state wording | `packages/align-agent/src/shared/envelope.ts`, `ended.ts`, `types.ts`, `notices.ts` | `renderEnvelope`, `asksBlock`, `boundLimits`, `ENVELOPE_MAX`, `stateSituation`, `neverSentWords`, `SHARE_STATE_NOTICES`, the shared agent types | imported directly by the agent tests (12, 7, 23 and 1 import lines respectively) | `local-agent.md`, `directives.md` | intent: Component `local/agent-envelope` |
| B11 | Shell command parser | `packages/align-agent/src/hooks/shell.ts` (no imports) | `parseShell`, `commandWords` | through `hooks/siblings.ts`, which 9 agent test files import | `local-agent.md` | intent: Component `local/shell-words`; needs direct probes first |

### Server, agent and UI (retained for now)

| ID | Boundary | Files | Evidence | Owner | Class |
|---|---|---|---|---|---|
| B12 | Storage, configuration and request plumbing | `lib/v2/core.mts`, `db.ts`, `node-sqlite.d.ts`, `ids.ts`, `events.ts`, `init.ts`, `config.ts`, `limits.ts`, `http.ts`; `lib/config.ts`, `secret.ts`, `startup.ts`, `locks.ts`, `http.ts`, `ratelimit.ts` | `test-v2.mjs` (opens the database directly with `node:sqlite`) | `workspaces.md` (rate limits, local and hosted edges) | retained: `node:sqlite` schema and migrations (`db.ts`, 1139 lines), secrets and environment. Every server module depends on it; the schema has to become its own data contract before anything that touches the database can transfer. |
| B13 | Identity and sign-in | `lib/v2/auth.ts`, `captcha.ts`, `mail.ts`, `local-owner.ts`, `access.ts`, `creation.ts`, `disposable.ts`, `account.ts`, `lifecycle.ts` | `test-v2.mjs` | `workspaces.md` | retained: Better Auth, passkeys, email delivery and the bot check |
| B14 | Workspaces and the sample | `lib/v2/workspaces.ts`, `sample.ts` | `test-v2.mjs` | `workspaces.md`, `goals-and-proposals.md` (Northstar sample) | retained: database |
| B15 | Goals, change requests, alignments, reallocations, requests, asks | `lib/v2/goals.ts`, `goal-limits.ts`, `changes.ts`, `changes-read.ts`, `approval.ts`, `evidence.ts`, `value.ts`, `limit-suggest.ts`, `alignments.ts`, `reallocations.ts`, `requests.ts`, `asks.ts` | `test-v2.mjs` | `goals-and-proposals.md`, `directives.md` | retained: database transactions; the main product logic, a candidate after B12's data contract |
| B16 | Sessions, devices, directives, steering, spend, allocation, activity, Home | `lib/v2/sessions.ts`, `devices.ts`, `directives.ts`, `steering.ts`, `spend.ts`, `allocation.ts`, `activity.ts`, `goal-activity.ts`, `home.ts` | `test-v2.mjs`, `scripts/test-agent-live.mjs` | `workspaces.md`, `directives.md` | retained: database and device credentials |
| B17 | Product metrics and retention | `lib/v2/metrics-core.mts`, `retention-core.mts`, `retention.ts` | `test-v2.mjs:7187` (retention-core) | `metrics.md`, `workspaces.md` (retention schedule) | retained: both cores import database helpers and the `Sql` type from `core.mts`; candidates once they take rows as input |
| B18 | MCP server, OAuth and the stdio relay | `lib/mcp/*`, `lib/oauth/*`, `app/api/mcp/*`, `app/api/oauth/*`, `app/oauth/*`, `app/.well-known/*`, `packages/align-connect/align-connect.mjs` | `scripts/test-oauth.mjs`, `scripts/oauth-test-net.mjs` | `mcp.md` | retained: OAuth 2.1 server, client registration with DNS and HTTPS checks, MCP transport |
| B19 | HTTP API | `app/api/v2/**` (76 route handlers) | `test-v2.mjs` | `interface.md` (each action's endpoint) | retained: Next.js route handlers over B12 to B17. The endpoint list is the interface contract a native server would have to match. |
| B20 | Web UI | `app/app/**` (54 files), `app/page.tsx`, `layout.tsx`, `error.tsx`, `global-error.tsx`, `globals.css`, `proxy.ts`, `instrumentation.ts` | `test-v2.mjs` browser cases (Puppeteer, `:2694`, `:3439`) | `interface.md` | retained: React and Next.js pages; parity needs browser runs, not probes |
| B21 | Public trust pages | `app/_trust/*`, `app/trust/*`, `app/privacy/*`, `lib/trust/docs.ts`, `entity.ts`, `md.d.ts` | `test-v2.mjs` page checks | `workspaces.md`, `interface.md` | retained: Next.js pages over B08 and the B23 documents. `entity.ts` still has the legal entity to fill in (DEPLOY-001). |
| B22 | Local agent CLI and hooks | `packages/align-agent/src/**` except B09 to B11 (37 files: `cli.ts`, `api.ts`, `db.ts`, `sync.ts`, `ledger.ts`, `tailer.ts`, `hooks/handlers.ts`, `siblings.ts`, `evidence.ts`, `private.ts`, the rest of `shared/`) | `packages/align-agent/test/*` (36 files), `scripts/test-agent-live.mjs` | `local-agent.md` | retained: files under `ALIGN_HOME`, macOS LaunchAgents, Claude Code and Codex hook wiring, device keys |
| B28 | Operator scripts | `scripts/align-admin.mjs`, `retention.mjs`, `sign-in-link.mjs` | `docs/HOSTING.md`; `align-admin.mjs` is copied into the image | `workspaces.md` | retained: run by an operator against the live database |

### Data, packaging, targets and harness

| ID | Boundary | Files | Evidence | Class |
|---|---|---|---|---|
| B23 | Legal documents and disposable-domain list | `docs/trust/*` (6), `docs/RETENTION.md`, `lib/v2/disposable-domains.json` | imported by `lib/trust/docs.ts` and `lib/v2/disposable.ts`; copied into the image by `Dockerfile` | asset |
| B24 | Static files | `public/*.svg` (5), `app/favicon.ico` | Only `file.svg` is referenced, by a route check in `test-v2.mjs:11787`; `globe`, `next`, `vercel` and `window.svg` look like unused Next.js template files | asset |
| B25 | Node and Next.js packaging | `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`; `packages/align-agent/package.json`, `package-lock.json`, `tsconfig.json`, `scripts/postbuild.mjs` | `/litai.harness.mk` (`npm ci`, `npm run build`, `npm test`, `npm pack`) | flavor: `lang-typescript`, `ui-react`, `package-npm`, `build-make` (the project's current toolchain sources are `lang-javascript`, `package-npm`, `build-make`) |
| B26 | Container and hosting target | `Dockerfile`, `.dockerignore`, `fly.toml`, `docs/HOSTING.md` | `scripts/test-image.sh` | flavor: `deploy-docker`, `os-linux`. Target variance: Mode L serves `127.0.0.1:3100` for one person on macOS; hosted mode (`HOSTED=1`) runs the image on Fly with data in `/data` and secrets set by `fly secrets`. |
| B27 | Tests and test scripts | `scripts/test-*.mjs`, `test-all.sh`, `test-image.sh`, `oauth-test-net.mjs`, `packages/align-agent/test/**` | `/litai.harness.mk test`; the committed receipt (1798 passed, 0 failed) | harness |
| B29 | Documents | `README.md`, `AGENTS.md`, `SECURITY.md`, `docs/*.md`, `docs/archive/**`, `docs/v2/WIRE.md`, `packages/align-agent/README.md`, `HARNESS_FACTS.md`, `packages/align-connect/README.md` | | harness (documentation for the retained code; `docs/archive` is v1 history) |
| B30 | Repository metadata | `.gitignore`, `.claude/settings.json`, `packages/align-agent/.gitignore` | | harness |

### Runtime state, data schemas, CI and release

- **Server state:** one SQLite database under `ALIGN_DATA_DIR` (`/data` on Fly), with its schema and
  migrations in `lib/v2/db.ts` (B12) and the Better Auth tables created by `lib/v2/auth.ts` (B13).
  There is no separate schema file; extracting one is the prerequisite for B13 to B17.
- **Agent state:** the agent's database, ledger, keys and hook files under `ALIGN_HOME`
  (`packages/align-agent/src/paths.ts`), plus a macOS LaunchAgent (B22).
- **Wire formats:** the HTTP API (B19, endpoints listed in `interface.md`), the device and directive
  protocol (`docs/v2/WIRE.md`, `directives.md`), and the MCP tools (`mcp.md`).
- **CI:** `/.github/workflows/litai-verify.yml` (receipt, locks, authority, spec validation) and
  `/.github/workflows/rebased-on-main.yml`. Neither runs the test suite; the receipt records it.
- **Build entry point:** `/litai.harness.mk` (`build`, `test`, `run`, `package`).
- **Release and deploy:** no release or deploy job. Deploys follow `docs/HOSTING.md` by hand
  (DEPLOY-001).

A pattern check on 2026-11-04 mapped all 362 tracked files under the implementation to exactly one
row above (first matching row wins), with none left over. Rows B01 to B11 hold 23 files; B12 to
B22 and B28 hold 249; B23 to B30, excluding B28, hold 90.

Outside this inventory: `litai plan .` at the project root fails with
`component_lock.component_missing` even though every directory under `/components` has a
`component.md`. The cause is not yet known.

### Proposed next boundary

B09, the agent spend parsers and price table. It is pure apart from `node:path`, has a direct
test (`metering.test.ts`), can be checked with JSON line-in, counts-out probes like B01's, and is
the code SPEND-001 has to prove correct. B05 (authorization policy, no imports, directly tested
at `test-v2.mjs:1009`) is the alternative if spend work should wait for SPEND-001.
