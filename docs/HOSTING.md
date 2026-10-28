# Hosting Align for unmoderated tests (HOSTED=1)

**Status: approved for deploy (founder go 2026-10-26, final authority on code).** Not yet deployed as of this edit. The founder creates the Fly account, sets the secrets and runs the deploy; the smoke test below runs before any tester gets a link. This page goes with `Dockerfile`, `.dockerignore` and `fly.toml`.

**Purpose (founder ruling 10-21 "go C").** Every Proving Ground interviewee gets their own workspace and a link, and runs the test without a moderator. One server serves all the workspaces.

## Why Fly

- **One machine with a persistent volume.** The multi-workspace spec (rev 2, section 10) needs exactly one Node process on a host with a persistent disk, because state locks live in process memory.
  - A pid file on the volume (`/data/.pid`) refuses a second server.
  - A Fly volume attaches to a single machine.
  - `min_machines_running = 1`, with auto-stop off, keeps that one process alive.
- **HTTPS at the edge.** The Fly proxy terminates TLS (`force_https`), and sets `X-Forwarded-Proto` and `Fly-Client-IP`. The app trusts them only when `HOSTED=1`.
- **Secrets stay out of the repo and the image.** They're set with `fly secrets`.
- **Not serverless.** Serverless platforms are ruled out: they run many processes and have no shared disk.

## What HOSTED=1 changes

Without `HOSTED`, nothing changes. The loopback rules, cookie and Northstar behaviour stay as they are, gated by `scripts/test-all.sh`.

| Area | HOSTED=1 behaviour |
|---|---|
| Routes | Only the tester routes exist: `/new`, `/w/<id>`, `/api/workspaces` (create, config, login-info), `/api/session`, `/api/state`, `/api/timer`, `/api/reset`, `/api/proposals` and `/api/proposals/<id>/(accept|acknowledge|counter|reject)`, plus the connected-apps routes (see "Connected AI apps" below). `/` and `/setup` redirect to `/new`. **Every other path is 404**, so a route added later stays closed until it's added to `proxy.ts`. test-tenancy H6 checks every route in `app/`. |
| Northstar | **Off entirely** (go-C condition 1). Northstar sign-in is 404 and Northstar tokens are ignored. The Northstar store refuses every read and write (`lib/store.ts`). The image holds no fixture and no Sparta evidence. There's no override. |
| Hosts | Only the hostnames in `ALIGN_HOSTS` are served. Every other Host gets 421, loopback included. |
| Proxy | Without `X-Forwarded-Proto: https`, a request gets 403. Without `Fly-Client-IP`, it also gets 403, since it didn't come through Fly's edge. |
| Cookies | `__Host-align_session`, with `Secure; HttpOnly; SameSite=Strict; Path=/`. A cookie without the prefix isn't accepted. |
| Creation | **One single-use invite code per tester** (`ALIGN_SIGNUP_CODES`). A used code is refused, and used codes are kept only as SHA-256 hashes. Wrong codes: 10 per 10 minutes per client, then 429. 5 creates per rolling hour (fixed). `ALIGN_MAX_WORKSPACES` caps the total (default 25). |
| Sign-in | Passcode hashing runs at most 2 at a time, with 8 waiting; the rest get 429. Backoff is per workspace, role and client: after 5 wrong tries, that client waits. Another person's tries never lock you out. |
| Notice | `/new` says it's a test server, says not to enter confidential details, and gives the deletion date (`ALIGN_DELETE_BY`). The passcode card repeats the date (go-C condition 3). Shruti owns the wording. |
| Capture and AI | `/api/sessions/events` is 404. No AI key is used, even if one is set (startup refuses it too). A tester may connect their own AI app read-only ("Connected AI apps"); agent tokens and capture stay off. |
| Files | Workspace folders are 0700 and files 0600, owned by the `node` user. |
| Logs | Server errors log only the error's name, never a message, body or path (go-C condition 5). |
| Isolation | Each tester workspace is its own directory under `$ALIGN_DATA_DIR/workspaces/<id>/`. A workspace session can't read or write another workspace (test-tenancy A1 to A12, H7). |

## Startup refusals

The server won't serve until all of these hold. On `next start` it exits with the list of problems. If a platform ever kept a refused process up, `proxy.ts` would still answer 503 to everything.

- `ALIGN_HOSTS`: the public hostname(s), comma-separated, with no loopback names.
- `ALIGN_SECRET`: 32+ characters. Session tokens are signed with it, so rotating it signs everyone out.
- `ALIGN_DATA_DIR`: an absolute path outside the app directory (the volume, `/data`).
- `ALIGN_SIGNUP_CODES`: one or more invite codes, each 12+ characters. `ALIGN_SIGNUP_CODE` (a single shared code) is refused.
- `ALIGN_DELETE_BY`: the deletion date, `YYYY-MM-DD`. Once that day ends (midnight Pacific), the server is closed: it answers 410 to every request, whatever its headers, and a restart comes back closed (it starts and logs `has passed: closed`, so it never crash-loops). Testers keep the whole day; the operator purges with `ws-admin` that evening (see "Deleting workspaces").
- `ALIGN_PRODUCT_PASSCODE`, `ALIGN_SECURITY_PASSCODE`, `ALIGN_LEADERSHIP_PASSCODE`: set, not the `*-demo` defaults, and 12+ characters. They serve nothing while Northstar is off; they're required so a mistake there could never expose the demo passcodes.
- These must be unset (any value is refused, `"0"` included): `AI_GATEWAY_API_KEY`, `ALIGN_CREATE_PER_HOUR`, `ALIGN_NORTHSTAR_PUBLIC`. These must be unset or off: `ALIGN_CAPTURE` (or `0`), `ALIGN_ALLOW_OPEN_CREATE` and `ALIGN_PUBLIC` (anything but `1`).

test-tenancy H1 checks every one of these on a production server: each must exit, or stay up answering only 503, and name its problem. `scripts/test-image.sh` checks a refusal on the built image.

## Environment

| Variable | Where it's set | Value |
|---|---|---|
| `HOSTED` | Dockerfile | `1` |
| `ALIGN_DATA_DIR` | Dockerfile / `fly.toml` | `/data` (the volume) |
| `ALIGN_HOSTS` | `fly.toml` | the app hostname, e.g. `align-pg-draft.fly.dev` |
| `ALIGN_MAX_WORKSPACES` | `fly.toml` | `25`. The cap exists for polling cost (spec section 10). `0`, a negative or a non-number falls back to 25; it can't close creation. |
| `ALIGN_DELETE_BY` | `fly.toml` | `2026-11-13` (founder ruling 2026-10-22; change it in one place) |
| `ALIGN_SECRET` | `fly secrets` | `openssl rand -hex 32` |
| `ALIGN_SIGNUP_CODES` | `fly secrets` | one code per planned tester, e.g. five of `openssl rand -hex 8`, comma-separated. To add testers later, set the list again with the new codes added. |
| `ALIGN_*_PASSCODE` (3) | `fly secrets` | random; unused while Northstar is off |

## The volume

**Layout of `/data`:**
- `/data/workspaces/<id>/` holds:
  - `state.json`;
  - `auth.json` (passcode hashes and epoch);
  - `scenario.json` (the setup input, used by Restart and never served);
  - `workspace.json`;
  - `audit-archive.jsonl`;
  - `oauth.json` (connected AI apps: app name, redirect host, role, hashed refresh token; no access token is stored).
- `/data/workspaces/_events.jsonl` logs creates and deletes, with ids only.
- `/data/workspaces/_used_invites.json` holds the hashes of spent invite codes.
- `/data/workspaces/_oauth_clients.json` holds AI apps that registered themselves (name and redirect URIs only). `ws-admin delete --all --yes` removes it.
- `/data/.pid` is the running server's pid.

No plaintext passcode or invite code is stored anywhere. Passcodes are shown once, at creation.

**Volume snapshots.** Fly takes daily snapshots of volumes and keeps them for several days by default, so deleting a workspace doesn't remove it from older snapshots.
- `fly.toml` sets `scheduled_snapshots = false` on the mount, which applies when the volume is created by a deploy. For a volume that already exists, also turn them off on the volume, and make sure any snapshot taken before that has expired by the stated date.
- Before deploying, check the current flags with `fly volumes update --help` and `fly volumes snapshots list <volume id>`. This page doesn't claim the exact defaults.

## Creating tester workspaces

One workspace per tester:

1. Open `https://<host>/new`, enter one unused invite code and the tester's two-team conflict, and create it. The card shows the link `/w/<id>` and the three passcodes, **once**. The open link waits for "I've saved all three passcodes" and opens a new tab.
2. Send the tester the link and the passcodes they need. In an unmoderated test, one tester plays all three roles in turn, and a browser profile holds one workspace session at a time.
3. Without the page, a JSON POST works too. It must carry the site's own Origin, exactly `https://<host>`: a hosted
   write with no Origin, an `http://` one or another port is refused (403).

   ```sh
   curl -sS https://<host>/api/workspaces -H 'content-type: application/json' -H 'Origin: https://<host>' \
     -d @tester.json   # the /setup body without "confirm", plus "signup_code": "<one invite code>"
   ```

   The response is 201 `{workspace:{id,name,path}, passcodes:{leadership,product,security}, shown_once:true}`.

Leadership can restart a tester's scenario from the header ("Restart this scenario"). Passcode rotation and export aren't in this build.

## Deleting workspaces (go-C condition 4)

On the machine (`fly ssh console`), as the `node` user. As root, the tool could leave a root-owned file that the app can't write:

```sh
cd /app
alias wsa='setpriv --reuid=node --regid=node --init-groups node scripts/ws-admin.mjs'
wsa list
wsa delete <workspace id>
wsa delete --all --yes   # the end-of-test purge
```

It deletes the way the app does:
1. It renames the folder aside, and from that moment every request for the workspace gets 404.
2. It removes the folder.
3. It appends a `deleted` row to `_events.jsonl`.

You can run it while the server runs (test-tenancy H11), with these limits:
- The rename is atomic, and the server never recreates a workspace folder (a write to a missing workspace is refused). So once the rename lands, nothing new is written for that workspace.
- A request for that workspace that is already in flight fails (404, or a server error if it was mid-write) instead of finishing. A tester using it at that moment loses that one action.
- ws-admin doesn't take the server's locks (they live in the server's memory). Run one ws-admin at a time.

### After the deletion date (closed mode)

Once `ALIGN_DELETE_BY` has ended the machine keeps running, closed: every request gets 410, and a restart or deploy comes back closed rather than refusing to start. `fly ssh console` and the purge above still work (test-tenancy H12). Fly's health check also gets 410 then, so Fly marks the machine unhealthy; that's expected and harmless, because Fly doesn't restart a machine for a failing `http_service` check. Purge, then stop the machine:

```sh
fly ssh console -C "sh -c 'cd /app && setpriv --reuid=node --regid=node --init-groups node scripts/ws-admin.mjs delete --all --yes'"
fly machine stop <machine id>
```

If the machine won't run at all (a bad image or config), purge from a one-off machine that mounts the volume instead. A volume attaches to one machine at a time, so stop the app's machine first. Not run yet (no app exists); check the flags against `fly machine run --help` before use:

```sh
fly machine stop <machine id>
fly machine run <the app's image, from fly image show> node scripts/ws-admin.mjs delete --all --yes \
  --volume align_data:/data --env ALIGN_DATA_DIR=/data --user node --rm
```

Wiping the volume (`fly volumes destroy`) is the last resort.

## Deploy steps (founder go 2026-10-26)

```sh
fly apps create align-pg-draft
fly volumes create align_data --size 1 --region sjc
fly secrets set ALIGN_SECRET=... ALIGN_SIGNUP_CODES=code1,code2,... \
  ALIGN_PRODUCT_PASSCODE=... ALIGN_SECURITY_PASSCODE=... ALIGN_LEADERSHIP_PASSCODE=...
fly deploy --ha=false     # one machine: locks are in process memory, and the volume attaches to one machine
fly scale count 1
```

**The image** (`Dockerfile`):
- The build context is an allowlist (`.dockerignore`), so only the app's own source goes in.
- The runtime has production dependencies, the build output and `scripts/ws-admin.mjs`. It has no `data/`, `sparta/`, `agent/` or test scripts, and no `.env` file.
- The container hands `/data` to the `node` user (`chown -R` as root on every start), then `setpriv` execs the server as `node`. So the server itself is PID 1, with no shell, npx or root parent (`scripts/test-image.sh` checks this).
- What PID 1 means here:
  - The kernel gives PID 1 no default signal action. Fly's SIGINT/SIGTERM stop the server only because `next start` installs its own handlers: it finishes in-flight requests, then exits. `NEXT_MANUAL_SIG_HANDLE` must stay unset.
  - No init reaps orphaned child processes. The server starts none while serving, so none build up.

**The health check** (`fly.toml`) calls `/api/workspaces/config` with the Host, `X-Forwarded-Proto` and `Fly-Client-IP` headers Fly's edge would send. Without them the app answers 421 or 403.

## Smoke test on the live URL (go-C condition 6)

Run this before the first tester gets a link, and post the results on LIM-2424:
1. A wrong Host gets 421.
2. Plain http gets 403.
3. The server refuses to start with default passcodes (redeploy with one unset, then put it back).
4. Capture (`/api/sessions/events`) is 404.
5. `/api/state` without a session is 404.
6. Northstar sign-in and `/api/policy/security`: 404, and `/` redirects to `/new`. `/api/mcp` without a token is 401 with a `resource_metadata` link to `https://<host>/.well-known/oauth-protected-resource/api/mcp`, and with an `Origin` header it is 403.
7. Two synthetic workspaces can't read each other.
8. Connect one real app (Claude Code: the one line in the workspace's "Connect an AI app" dialog) to a synthetic workspace, ask it for the goals, and check the workspace's "Your AI apps" card lists it. Disconnect it there and check the app is refused.

Delete the synthetic workspaces afterwards with `ws-admin.mjs`.

## Connected AI apps (founder ruling 2026-10-26, amending go-C)

Testers can point the AI they already use at their own workspace. The app gets read-only access to one workspace, approved with that workspace's role passcode. Agent tokens (`agt.`), `ALIGN_MCP_TOKEN`, capture and wake-ups stay closed when hosted.

- **One URL for every app:** `https://<host>/api/mcp` (Streamable HTTP, the five read-only tools in `lib/mcp/register.ts`). Claude (desktop, Cowork, claude.ai), ChatGPT, Claude Code and Codex all add it as a remote MCP server; the steps for each are in the workspace under "Your AI apps", "Connect an AI app".
- **OAuth 2.1 in the app** (`lib/oauth/`): authorization code with PKCE S256 only, public clients, client metadata documents (Claude Code's is `https://claude.ai/oauth/claude-code-client-metadata`) or dynamic registration, refresh token rotation with reuse detection, tokens bound to the resource (RFC 8707), `iss` on every redirect (RFC 9207). Metadata: `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/api/mcp`.
- **Consent page** `/oauth/authorize`: names the app and where it sends the person back, says it is read-only and which company receives what it reads, then asks for the workspace link, a team and that team's passcode (or uses the session the browser already has). Sign-in goes through the same backoff and scrypt slots as `/api/session`. Never framed, never cached.
- **Tokens:** access tokens are `alm.` (1 hour, HMAC with `ALIGN_SECRET`, checked against the grant on every call). Refresh tokens last 7 days and never past the end of `ALIGN_DELETE_BY`; only an HMAC of each, keyed with `ALIGN_SECRET`, is stored.
- **Revoking:** the team that connected an app, or leadership, disconnects it from the workspace; leadership can disconnect all. Restart disconnects every app. Rotating `ALIGN_SECRET` ends every token, refresh tokens included, in every workspace.
- **Client documents** (an app whose client_id is a URL): fetched from public addresses only (an IPv6 address that carries an IPv4 one is refused), 3 s in all, at most 5 KB, at most 8 at once across the server. The consent page allows 30 views a minute per client, and says "This app named itself" for every app except a client document on Anthropic's or OpenAI's own sites.
- **What leaves Align:** what the app reads is sent to that app's AI provider (Anthropic or OpenAI). The consent page says so. Claude and ChatGPT call the URL from their own servers, so the machine has to stay up (a paid Fly org; the trial stops machines).
- **Copy check:** the steps shown for ChatGPT and the Claude app come from their docs on 2026-10-26. Claude Code 2.1.311 was connected end to end against this code on a local server (add, sign in through the consent page, call the tools); the other apps, and any app against the Fly URL, are not checked yet (smoke test item 8 covers one app).
- Tests: `node scripts/test-oauth.mjs <port>` (70 checks, local and hosted phases).

## Limits worth knowing

- **Fly-Client-IP is only a presence check against other machines on Fly's private network.** Fly's edge sets it, but a machine inside the same Fly organization could forge it. Keep this app the only app in its organization.
- **The rate limits and invite checks live in process memory, apart from used invites, which are on disk.** A restart clears the hourly create bucket and the wrong-code counts.
- Sign-ins: at most 2 in flight per client and 2+8 scrypt slots overall, so about five client IPs can delay every tenant's sign-ins (creation is unaffected); NAT64 clients (64:ff9b::/96) share one rate-limit bucket.

## Local test

`node scripts/test-tenancy.mjs <port>` builds once and runs every phase on `next start`, the way Fly runs it. Its hosted phase sends `Host: align.test`, `X-Forwarded-Proto: https` and `Fly-Client-IP`, the way Fly's edge forwards requests. `scripts/test-all.sh` runs it after the dev-server gates, before `ui-northstar`.
