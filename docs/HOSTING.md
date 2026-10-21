# Hosting Align for unmoderated tests (HOSTED=1)

**Status: draft.** Nothing has been deployed: there's no app, volume, DNS record or account yet. Sean approves the hosted setup on LIM-2424 before any of it is created. This page goes with `Dockerfile`, `.dockerignore` and `fly.toml`.

Purpose (founder ruling 10-21 "go C"): every Proving Ground interviewee gets their own workspace and a link, and runs the test without a moderator. One server serves all the workspaces.

## Why Fly

- **One machine with a persistent volume.** The multi-workspace spec (rev 2, section 10) needs exactly one Node process on a host with a persistent disk, because state locks live in process memory and `data/.pid` refuses a second server. A Fly volume attaches to a single machine, and `min_machines_running = 1` with auto-stop off keeps that one process alive.
- **HTTPS at the edge.** The Fly proxy terminates TLS (`force_https`) and sets `X-Forwarded-Proto`, which the app trusts only when `HOSTED=1`.
- **Secrets stay off disk in the repo.** They're set with `fly secrets`.
- **Not serverless.** Serverless platforms (Vercel functions and the like) are ruled out as written: they run many processes and have no shared disk. Render or Railway with a single instance and a disk would also work; Fly was picked for the simplest volume plus single-machine setup.

## What HOSTED=1 changes

Without `HOSTED`, nothing changes: the loopback rules, cookie and Northstar behaviour stay byte-identical (gated by test-all).

| Area | HOSTED=1 behaviour |
|---|---|
| Hosts | Only the hostnames in `ALIGN_HOSTS` are served. Every other Host gets 421, loopback included. `requireJson` checks the same list in place of its loopback rule. |
| HTTPS | Requests whose `X-Forwarded-Proto` isn't `https` get 403. |
| Cookies | `__Host-align_session`, with `Secure; HttpOnly; SameSite=Strict; Path=/`. A cookie without the prefix isn't accepted. |
| Creation | Needs `ALIGN_SIGNUP_CODE`. `ALIGN_ALLOW_OPEN_CREATE` is refused. A global bucket allows 5 creates per hour, and `ALIGN_MAX_WORKSPACES` caps the total (default 25). |
| Capture | `/api/sessions/events` returns 404, and `ALIGN_CAPTURE` must be off. No AI key is allowed (`AI_GATEWAY_API_KEY` must be unset). |
| Northstar | Not served anonymously. `/api/state` without a session returns 404, and so do the routes that take no session (`/api/sessions`, `/api/directives*`, `/api/mappings`, `/api/policy`, `/api/simulations`, `/api/evidence`, `/api/mcp`). Northstar sign-in needs non-default passcodes. Northstar data lives in the image's `data/` and resets on each deploy; tester data lives only on the volume. |
| Isolation | Each tester workspace is its own directory under `$ALIGN_DATA_DIR/workspaces/<id>/`. A workspace session can't read or write another workspace or Northstar (test-tenancy A1–A12, H7). |

## Startup refusals

The server won't start, and exits with the list of problems, unless all of these hold:

- `ALIGN_HOSTS`: the public hostname(s), comma-separated, with no loopback names.
- `ALIGN_SECRET`: 32+ characters. Session tokens are signed with it, so rotating it signs everyone out.
- `ALIGN_DATA_DIR`: an absolute path outside the app directory (the volume, `/data`).
- `ALIGN_SIGNUP_CODE`: 12+ characters.
- `ALIGN_PRODUCT_PASSCODE`, `ALIGN_SECURITY_PASSCODE`, `ALIGN_LEADERSHIP_PASSCODE`: set, not the `*-demo` defaults, and 12+ characters.
- `AI_GATEWAY_API_KEY` unset, `ALIGN_CAPTURE` off, `ALIGN_ALLOW_OPEN_CREATE` unset.
- `ALIGN_PUBLIC` unset. The spec's full Mode P isn't in this build.

## Environment

| Variable | Where it's set | Value |
|---|---|---|
| `HOSTED` | `fly.toml` / Dockerfile | `1` |
| `ALIGN_DATA_DIR` | `fly.toml` | `/data` (the volume) |
| `ALIGN_HOSTS` | `fly.toml` | the app hostname, e.g. `align-pg-draft.fly.dev` |
| `ALIGN_MAX_WORKSPACES` | `fly.toml` | `25`. The cap exists for polling cost (spec section 10). |
| `ALIGN_SECRET` | `fly secrets` | `openssl rand -hex 32` |
| `ALIGN_SIGNUP_CODE` | `fly secrets` | a random code, given only to whoever creates tester workspaces |
| `ALIGN_*_PASSCODE` (3) | `fly secrets` | random, for the Northstar demo roles |
| `ALIGN_CREATE_PER_HOUR` | not set | Defaults to 5. **Don't raise it in hosted mode without Sean's approval.** It exists so the local tests can create more than five workspaces. |
| `ALIGN_NORTHSTAR_PUBLIC` | not set | Leave unset. Setting it to `1` reopens the Northstar no-session routes. |

## The volume

- Layout: `/data/workspaces/<id>/` holds `state.json`, `auth.json` (0600: passcode hashes and epoch), `scenario.json` (0600: the setup input, used by Restart and never served), `workspace.json` and `audit-archive.jsonl`. `/data/workspaces/_events.jsonl` logs creates and deletes, with no names or hashes.
- No plaintext passcode is stored anywhere. Passcodes are shown once at creation.
- Backup means copying `/data/workspaces`. What we promise testers about retention, deletion and backups is still open (spec Q4, Shruti). Answer it before the first real tester.

## Creating tester workspaces

One workspace per tester:

1. Open `https://<host>/new` (being built by S1 on `build-a/L0-new`), enter the signup code and the tester's two-team conflict, and create it. The success card shows the link `/w/<id>` and the three passcodes, **once**.
2. Send the tester the link and the passcodes they need. The creator receives all three; in an unmoderated test, one tester plays all three roles in turn, and a browser profile holds one workspace session at a time.
3. Without the page, a JSON POST works too:

   ```sh
   curl -sS https://<host>/api/workspaces -H 'content-type: application/json' \
     -d @tester.json   # the /setup body without "confirm", plus "signup_code"
   ```

   The response is 201 `{workspace:{id,name,path}, passcodes:{leadership,product,security}, shown_once:true}`.

Leadership can restart a tester's scenario from the header ("Restart this scenario"). Passcode rotation, export and delete aren't in this build. Until they are, a host admin removes a workspace with `fly ssh console`: rename `/data/workspaces/<id>` to `.deleting-<id>`, then remove it. That's the same procedure the app uses, and its tokens fail from then on.

## Deploy steps (for after Sean approves; not run)

```sh
fly apps create align-pg-draft
fly volumes create align_data --size 1 --region sjc
fly secrets set ALIGN_SECRET=... ALIGN_SIGNUP_CODE=... \
  ALIGN_PRODUCT_PASSCODE=... ALIGN_SECURITY_PASSCODE=... ALIGN_LEADERSHIP_PASSCODE=...
fly deploy
fly scale count 1
```

Check after the deploy, with a synthetic workspace only:

- `curl -sI https://<host>/api/state` returns 404 (Northstar closed).
- Creating without the code returns 403.
- Creating with the code returns 201.
- The `/w/<id>` sign-in works, and the cookie is `__Host-align_session` with `Secure`.

## Local test

`node scripts/test-tenancy.mjs <port>` runs the hosted phase on a local dev server. It sends `Host: align.test` and `X-Forwarded-Proto: https`, the way the platform proxy forwards requests. `scripts/test-all.sh` runs it as its last step.
