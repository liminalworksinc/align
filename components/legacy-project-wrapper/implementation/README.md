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
- **MCP.** Connected AI apps read goals, change requests (with their evidence), decision records and directives
  through `/api/mcp`, as the person who connected them. The one write adds an agent-reported evidence link
  (`docs/MCP.md`).

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
`data/.secret`), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`.
`ALIGN_TEST_IDP=1` turns on email-and-password sign-up for tests only.

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

`ALIGN_FIRST_OWNER_EMAIL` lets one address make the first account by email code; after that, an email code signs in
only an existing account or someone with a pending invite. `docs/HOSTING.md` has the image, the volume and the deploy
steps.

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
`npm test` runs the lint and the agent package tests.

## Where things are

| Path | What |
| --- | --- |
| `app/app/` | The web app (`/app`) |
| `app/api/v2/` | The HTTP API; `docs/v2/WIRE.md` is the wire contract the CLI uses |
| `app/api/mcp`, `lib/mcp/` | The MCP endpoint (reads, plus agent-reported evidence links) |
| `app/oauth/`, `app/api/oauth/`, `app/.well-known/`, `lib/oauth/` | The OAuth authorization server for AI apps |
| `lib/v2/` | Identity, workspaces, goals, change requests, sessions, directives, spend, the database |
| `proxy.ts`, `lib/config.ts`, `lib/startup.ts` | The request edge, settings and startup checks |
| `packages/align-agent/` | The `align` CLI and hooks |
| `packages/align-connect/` | A stdio MCP bridge for clients without OAuth |
| `docs/archive/` | Pages about the retired v1 prototype |
