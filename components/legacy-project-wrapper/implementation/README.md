# Align

Align lets each person in an organization change a goal only with the approval of someone entitled to approve for
it, and keeps the coding agents working toward that goal current with it.

- **People, not passcodes.** Everyone signs in as themselves: Google, GitHub or an email one-time code. Workspaces
  have owners, members and viewers; teams have leads and members.
- **Goals with owners.** Goals have immutable versions and roll up from team goals to company goals. A goal changes
  only through its owner, or through a change request that someone in its approval set (the owner, the team's leads,
  and for a company goal the workspace owners) approves or rejects, with a decision record.
- **Agents that stay current.** The `align` CLI (`packages/align-agent`) pairs a machine, shares chosen Claude Code
  and Codex sessions toward a goal, meters their usage locally and delivers goal changes and stop directives at the
  next turn. Usage and estimated spend are reported per goal, team and session.
- **Evidence on change requests.** Each revision carries a snapshot Align records itself (the goal's 30-day spend,
  bound sessions, last activity). The requester and approvers attach typed links (PR, CI run, incident, dashboard,
  doc), labelled self-reported or agent-reported and never verified. Approving without evidence is allowed and audited.
- **Read-only MCP.** Connected AI apps read goals, change requests (with their evidence), decision records and
  directives through `/api/mcp`, as the person who connected them. An app the person allows the opt-in scope
  `changes:evidence` can also add agent-reported evidence links (`docs/MCP.md`).

The contract is the specification in `specs/align/*.md` at the repository root. This folder is its implementation:
a Next.js app (`app/`, `lib/`), the local agent package (`packages/align-agent`) and a stdio bridge for MCP clients
without OAuth (`packages/align-connect`).

## Run it locally (Mode L)

Needs Node 24 or later.

```sh
npm ci
npm run dev        # or: npm run build && npm start
```

The server binds `127.0.0.1:3100` and answers only loopback host names. On its first start with an empty data
directory it creates one account, **Local owner** (`owner@align.localhost`, or `ALIGN_LOCAL_OWNER_EMAIL`), and prints
a sign-in link:

```
Align sign-in for owner@align.localhost: http://127.0.0.1:3100/app/sign-in?email=owner%40align.localhost&code=123456
```

Open it, enter the code, then create a workspace or the Northstar sample on `/app`. The same line is written to
`data/v2/sign-in.txt`. A code lasts 5 minutes; for a fresh one, with the server running:

```sh
npm run sign-in-link            # or: npm run sign-in-link someone@example.com
```

The server prints the new link in its own terminal. Any address can sign in by email code in Mode L (the code is
printed, never sent), so you can add people by inviting them from a workspace's People tab.

**Passkeys.** Once signed in, add a passkey on `/app/account`; then **Sign in with a passkey** (or pick it from the
email field's suggestions) signs you in. In Mode L passkeys work only at `http://localhost:3100`, not
`http://127.0.0.1:3100`: a passkey needs a domain name.

**Sessions.** A browser sign-in lasts 7 days, extended each day it is used, and never more than 30 days
(`ALIGN_SESSION_MAX_DAYS`) after you signed in. Approving a device or an AI app, changing roles, removing someone,
inviting an owner, deleting a workspace, adding or deleting a passkey, linking an account and **Sign out everywhere**
(on `/app/account`) need a sign-in from the last 15 minutes; the page asks you to sign in again and brings you back.

To connect a machine's coding agents, build the CLI and pair it:

```sh
cd packages/align-agent && npm ci && npm run build
node dist/cli.js login --server http://127.0.0.1:3100   # approve the code at /app/device
node dist/cli.js install                                # Claude Code and Codex hooks
```

See `packages/align-agent/README.md` for the commands, and `docs/MCP.md` to connect an AI app.

**Data.** Everything is in one SQLite file, `data/v2/align.sqlite` (or `$ALIGN_DATA_DIR/v2/align.sqlite`), with a
generated Better Auth secret beside it. One server runs per data directory: a second one exits with
`Another Align server (pid <n>) is using <dir>. Stop it first.` Delete `data/` to start over.

**Mode L settings** (all optional): `ALIGN_DATA_DIR`, `ALIGN_LOCAL_OWNER_EMAIL`, `ALIGN_SECRET` (else generated into
`data/.secret`), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`,
`ALIGN_SESSION_MAX_DAYS` (the absolute session cap, 1 to 365 days, default 30; Mode L ignores a bad value).
`ALIGN_TEST_IDP=1` turns on email-and-password sign-up for tests only; with it, `ALIGN_TEST_NOW` (an ISO time) is the
retention job's clock, for tests only (both are refused when hosted).

**Retention.** The server applies the retention schedule in [docs/RETENTION.md](docs/RETENTION.md) at every start and
every 24 hours: deleted workspaces are purged after 30 days, people who left become "Former member #n" after 30 days,
audit rows go after a year, shared sessions are rolled up into per-goal daily totals after 13 months, and expired
sign-in sessions (including any past `ALIGN_SESSION_MAX_DAYS`) are deleted.
`npm run admin -- retention run [--dry-run]` (or `node scripts/retention.mjs [--dry-run]`, the same command) runs it by
hand against `ALIGN_DATA_DIR` (default `./data`); run it with the server's environment, since it reads
`ALIGN_SESSION_MAX_DAYS` as the server does.

## Hosted (HOSTED=1)

One server behind an HTTPS edge (Fly.io), for one public origin. Only `/app*`, `/api/v2/*`, `/api/mcp`, `/oauth/*`,
`/.well-known/*`, `/api/oauth/*` and static assets are served; `/` redirects to `/app` and everything else is 404.
The server refuses to start unless these are set:

| Setting | Value |
| --- | --- |
| `ALIGN_HOSTS` | The public host name(s), no loopback names |
| `ALIGN_PUBLIC_ORIGIN` | `https://<host>`, a host in `ALIGN_HOSTS` |
| `ALIGN_SECRET`, `BETTER_AUTH_SECRET` | 32+ characters each |
| `ALIGN_DATA_DIR` | An absolute path outside the app directory (the volume) |
| Sign-in | `ALIGN_EMAIL_API_URL` (https), `ALIGN_EMAIL_API_KEY` and `ALIGN_EMAIL_FROM`, or a Google or GitHub client |

`ALIGN_FIRST_OWNER_EMAIL` lets one address make the first account by email code, and its first workspace needs no
creation code; after that, an email code signs in only an existing account, someone with a pending invite, or someone
with an unused creation code bound to their address. `ALIGN_SESSION_MAX_DAYS` (optional, 1 to 365, default 30) caps
how long a sign-in lasts; hosted startup refuses any other value. Passkeys use the public host as their relying party,
so changing `ALIGN_PUBLIC_ORIGIN`'s host makes existing passkeys unusable. `docs/HOSTING.md` has the image, the volume
and the deploy steps.

**Who may create a workspace, and abuse controls** (hosted only; Mode L ignores all of these):

| Setting | Default | What it does |
| --- | --- | --- |
| `ALIGN_CREATION` | `codes` | `codes`: creating a workspace needs a single-use creation code; `open`: any signed-in person; `closed`: nobody (the kill switch) |
| `ALIGN_MAX_WORKSPACES` | 100 | Live workspaces on the server (`workspace_cap`); a deleted one waiting out its restore window doesn't count, and restoring it must fit again (409) |
| `ALIGN_MAX_OWNED_WORKSPACES` | 2 | Live workspaces one person owns (`owned_workspace_cap`; the same for a restore, 409) |
| `ALIGN_MAX_MEMBERS` | 25 | Members of one workspace, open invites included (`member_cap`) |
| `ALIGN_MAX_SESSIONS_PER_DEVICE_DAY` | 500 | New shared sessions per device in any 24 hours (`session_cap`) |
| `ALIGN_TURNSTILE_SITE_KEY`, `ALIGN_TURNSTILE_SECRET_KEY` | unset | Cloudflare Turnstile on email-code sign-in, access requests and workspace creation (both or neither; without them the server logs one warning) |
| `ALIGN_TURNSTILE_VERIFY_URL` | Cloudflare's | The siteverify URL (https; tests point it at a stub) |

People without a code ask for one at `/app/request-access`. The operator answers with the operator script, on the
server (`fly ssh console -C "node scripts/align-admin.mjs …"`, which has the server's environment) or locally with the
server's settings:

```sh
npm run admin -- requests list --status pending
npm run admin -- requests approve ar_…          # an email-bound code, emailed when the email settings are set
npm run admin -- codes create --email someone@example.com --days 14
npm run admin -- codes list                     # never shows a code
npm run admin -- workspaces list                # counts only, no people; deleted ones show when
npm run admin -- workspaces delete ws_… --yes   # the app's own (soft) deletion: its owners can restore it for 30 days
npm run admin -- workspaces delete ws_… --purge --yes   # every row, now and for good
npm run admin -- retention run --dry-run        # the retention schedule: what it would do now
```

Disposable email domains (`lib/v2/disposable-domains.json`, the CC0 disposable-email-domains list) can't request access
or create a workspace; they can still sign in when invited.

## Tests

```sh
npm run lint
npx next typegen && npx tsc --noEmit
node scripts/test-v2.mjs <port>       # the server: sign-in, workspaces, goals, change requests, devices, sessions,
                                      # directives, spend, the web UI (needs Chrome: CHROME_PATH), the edge, hosted mode
node scripts/test-oauth.mjs <port>    # connected AI apps: the OAuth server, consent, grants, /api/mcp, align-connect
cd packages/align-agent && npm test   # the align CLI and hooks
scripts/test-all.sh <port>            # all of the above in order, one summary line each
scripts/test-image.sh                 # the hosted Docker image (needs Docker)
```

`test-v2` and `test-oauth` build the app and start their own production servers on `<port>` with temporary data
directories (`test-v2` also uses `<port>+1`). They refuse port 3100 and a port that is already in use.
`npm test` runs `scripts/test-all.sh` on port `$ALIGN_TEST_PORT` (default 3600) and ends with one node:test-style total
(`ℹ tests`, `ℹ pass`, `ℹ fail`) over every step, which is what the literate-ai test receipt records. Running as root
(for example in a container), point `CHROME_PATH` at a Chrome wrapper that adds `--no-sandbox`.

## Where things are

| Path | What |
| --- | --- |
| `app/app/` | The web app (`/app`) |
| `app/api/v2/` | The HTTP API; `docs/v2/WIRE.md` is the wire contract the CLI uses |
| `app/api/mcp`, `lib/mcp/` | The read-only MCP endpoint (plus the opt-in evidence tool) |
| `app/oauth/`, `app/api/oauth/`, `app/.well-known/`, `lib/oauth/` | The OAuth authorization server for AI apps |
| `lib/v2/` | Identity, workspaces, goals, change requests, sessions, directives, spend, the database |
| `proxy.ts`, `lib/config.ts`, `lib/startup.ts` | The request edge, settings and startup checks |
| `scripts/align-admin.mjs`, `lib/v2/core.mts` | The operator script and the code it shares with the app |
| `packages/align-agent/` | The `align` CLI and hooks |
| `packages/align-connect/` | A stdio MCP bridge for clients without OAuth |
| `docs/archive/` | Pages about the retired v1 prototype |
