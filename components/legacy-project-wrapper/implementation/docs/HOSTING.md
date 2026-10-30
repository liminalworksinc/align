# Hosting Align (HOSTED=1)

One Align server behind Fly.io's HTTPS edge, for one public origin. This page goes with `Dockerfile`,
`.dockerignore` and `fly.toml`. The contract is `specs/align/workspaces.md` ("Hosted edge and route allowlist",
"Hosted startup checks", "Server data and single server") and `specs/align/mcp.md` for connected AI apps.

Not deployed yet. The server runs until it is stopped: there is no closing date. How long data is kept follows the
retention schedule in the spec.

## Why one machine

- **One server per data directory.** Rate limits, authorization codes and some locks live in process memory, so a
  pid file on the volume (`/data/.pid`) refuses a second server. A Fly volume attaches to a single machine, and
  `min_machines_running = 1` with auto-stop off keeps that one process alive.
- **HTTPS at the edge.** The Fly proxy terminates TLS (`force_https`) and sets `X-Forwarded-Proto` and
  `Fly-Client-IP`. The app trusts them only when `HOSTED=1`.
- **Secrets stay out of the repo and the image.** They're set with `fly secrets`.
- **Not serverless.** Many processes and no shared disk don't fit one SQLite file and in-memory limits.

## What HOSTED=1 changes

| Area | HOSTED=1 behaviour |
|---|---|
| Routes | Only `/app*`, `/api/v2/*`, `/api/mcp`, `/oauth/*`, `/.well-known/*`, `/api/oauth/*` and Next's static assets. `/` redirects to `https://<host>/app`. **Every other path is 404** `{"error":"Not found"}`, so a route added later stays closed until it is added to `proxy.ts`. |
| Hosts | Only the host names in `ALIGN_HOSTS` are served. Every other Host gets 421, loopback included. |
| Proxy | Without `X-Forwarded-Proto: https`, 403 `{"error":"Use https"}`. Without `Fly-Client-IP`, 403 `{"error":"Use the public address"}`. |
| Sign-in | Email one-time codes through an HTTPS email API, and Google or GitHub when configured. No account is made at startup. An email code creates an account only for a pending invite, or for `ALIGN_FIRST_OWNER_EMAIL` while the server has no account. The test identity provider is refused. |
| Cookies | `__Secure-align_v2.session_token`; every cookie-authenticated write must carry `Origin: https://<host>` exactly. |
| Logs | Server errors log only the error's name, never a message, body or path. Sign-in codes are never logged. |

## Startup refusals

The server won't serve until all of these hold. On `next start` it exits with the list of problems; if a platform
ever kept a refused process up, `proxy.ts` would still answer 503 to everything.

- `ALIGN_HOSTS`: the public host name(s), comma-separated, with no loopback names.
- `ALIGN_SECRET`: 32+ characters. It signs MCP access tokens and keys refresh-token hashes, so rotating it ends every
  connected AI app.
- `BETTER_AUTH_SECRET`: 32+ characters. Rotating it signs everyone out.
- `ALIGN_DATA_DIR`: an absolute path outside the app directory (the volume, `/data`).
- `ALIGN_PUBLIC_ORIGIN`: a bare `https://<host>` origin whose host is in `ALIGN_HOSTS`.
- A way to sign in: all three of `ALIGN_EMAIL_API_URL` (https), `ALIGN_EMAIL_API_KEY` and `ALIGN_EMAIL_FROM`, or
  Google's or GitHub's client id and secret (each pair together).
- These must be unset: `ALIGN_TEST_IDP`, `ALIGN_LOCAL_OWNER_EMAIL`. `ALIGN_PUBLIC=1` is refused in every mode.

`scripts/test-v2.mjs` checks every refusal on a production server, and `scripts/test-image.sh` checks one on the
built image.

## Environment

| Variable | Where it's set | Value |
|---|---|---|
| `HOSTED` | Dockerfile | `1` |
| `ALIGN_DATA_DIR` | Dockerfile / `fly.toml` | `/data` (the volume) |
| `ALIGN_HOSTS` | `fly.toml` | the app's host name, e.g. `align-pg-draft.fly.dev` |
| `ALIGN_PUBLIC_ORIGIN` | `fly.toml` | `https://<the ALIGN_HOSTS name>` |
| `ALIGN_FIRST_OWNER_EMAIL` | `fly.toml` | optional: the one address an email code may make an account for while the server has none |
| `ALIGN_EMAIL_FROM` | `fly.toml` | e.g. `Align <signin@example.com>` |
| `ALIGN_EMAIL_API_URL` | `fly.toml` | a Resend-compatible email API, https (e.g. `https://api.resend.com/emails`) |
| `ALIGN_EMAIL_API_KEY` | `fly secrets` | that API's key |
| `ALIGN_SECRET` | `fly secrets` | `openssl rand -hex 32` |
| `BETTER_AUTH_SECRET` | `fly secrets` | `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID`/`_SECRET`, `GITHUB_CLIENT_ID`/`_SECRET` | `fly secrets` | optional, each pair together. The callback URLs are `https://<host>/api/v2/auth/callback/google` and `/github`. |

The three email settings go together: all three or none. With none, sign-in is Google or GitHub only.

## The volume

- `/data/v2/align.sqlite` (WAL, 0600, in a 0700 folder): every account, workspace, goal, change request, session,
  usage row, directive, audit row and connected-app grant.
- `/data/workspaces/_oauth_clients.json`: AI apps that registered themselves (name and redirect URIs only).
- `/data/.pid`: the running server's pid.

**Volume snapshots.** `fly.toml` keeps daily volume snapshots for 7 days (`scheduled_snapshots = true`,
`snapshot_retention = 7`), so deleted data is gone from snapshots within 7 days. These apply when a deploy creates the
volume; for an existing volume, set them on the volume too. Check the flags with `fly volumes update --help` before
relying on this.

**Deleting data.** A workspace owner deletes a workspace from the app (`DELETE /api/v2/workspaces/<ws>`), which
removes everything in it. The v1 operator tool (`ws-admin`) was retired with v1 and has no v2 replacement yet
(an open question in the spec). Until there is one, removing all data means stopping the machine and destroying the
volume (`fly volumes destroy`).

## Deploy steps

```sh
fly apps create align-pg-draft
fly volumes create align_data --size 1 --region sjc
fly secrets set ALIGN_SECRET=$(openssl rand -hex 32) BETTER_AUTH_SECRET=$(openssl rand -hex 32) ALIGN_EMAIL_API_KEY=...
fly deploy --ha=false     # one machine: in-memory limits, and the volume attaches to one machine
fly scale count 1
```

Then open `https://<host>/app`, sign in as `ALIGN_FIRST_OWNER_EMAIL`, create a workspace and invite people from its
People tab.

**The image** (`Dockerfile`):
- The build context is an allowlist (`.dockerignore`): only the app's own source goes in.
- The runtime has production dependencies and the build output only: no scripts, tests, docs or `.env` file.
- The container hands `/data` to the `node` user (`chown -R` as root on every start), then `setpriv` execs the server
  as `node`, so the server itself is PID 1 with no shell, npx or root parent (`scripts/test-image.sh` checks this).
  The kernel gives PID 1 no default signal action: Fly's SIGINT/SIGTERM stop the server only because `next start`
  installs its own handlers, so `NEXT_MANUAL_SIG_HANDLE` must stay unset.

**The health check** (`fly.toml`) calls `/api/v2/auth/get-session` with the Host, `X-Forwarded-Proto` and
`Fly-Client-IP` headers Fly's edge would send; without them the app answers 421 or 403.

## Smoke test on the live URL

1. A wrong Host gets 421; plain http gets 403.
2. `/` redirects to `https://<host>/app`; `/setup` and `/api/state` are 404.
3. The server refuses to start without `ALIGN_PUBLIC_ORIGIN` (redeploy with it unset, then put it back).
4. `/api/mcp` without a token is 401 with a `resource_metadata` link to
   `https://<host>/.well-known/oauth-protected-resource/api/mcp`, and with an `Origin` header it is 403.
5. Sign in, create a workspace, invite a second address, and check that each sees only its own workspaces.
6. Connect one real app (the URL on the workspace's Apps tab), ask it for the goals, then disconnect it on the Apps
   tab and check the app is refused.

## Limits worth knowing

- **Fly-Client-IP is only a presence check against other machines on Fly's private network.** Fly's edge sets it,
  but a machine inside the same Fly organization could forge it. Keep this app the only app in its organization.
- **Rate limits live in process memory.** A restart clears them.

## Local test

`node scripts/test-v2.mjs <port>` builds once and runs every phase on `next start`, the way Fly runs it. Its hosted
phase sends `Host: align.test`, `X-Forwarded-Proto: https` and `Fly-Client-IP`, the way Fly's edge forwards
requests. `node scripts/test-oauth.mjs <port>` does the same for connected AI apps.
