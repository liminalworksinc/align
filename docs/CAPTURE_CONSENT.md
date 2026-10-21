# Capture consent: the grant step

Align refuses captured agent activity (`POST /api/sessions/events` returns 403 and writes nothing) unless leadership has
granted consent for that harness and repo. There is no consent screen yet; this file is the grant step.

## What consent covers

- One record per **harness + repo**. Harness is `claude-code` or `codex`. Repo is the **basename** of the git top-level
  folder the agent runs in (`basename "$(git rev-parse --show-toplevel)"`), not a path or a remote.
- Because the key is the basename, every folder with the same name shares one consent: a grant for `align` also covers
  any other checkout or worktree folder named `align`, and a grant for `api` covers every `api` folder. Grant the
  narrowest name you can.
- Do not set `ALIGN_CAPTURE=1` globally. It turns capture on for every repo whose hooks run `align-capture`, not just
  the one you meant. Without it, capture runs only where a repo's own `.claude/settings.json` names `align-capture`.
- Granting is **leadership only**. Any signed-in role can list consents. Each grant and revoke is an audit row holding
  only `harness/repo`.

## Commands (local server)

Set these in the shell you run the commands from. Nothing is exported.

```sh
ALIGN=http://127.0.0.1:3211   # the local Align server
JAR=$(mktemp)                 # cookie jar for this shell
HARNESS=claude-code           # or codex
REPO=my-repo                  # basename of the repo's git top-level folder
PASS=leadership-demo          # leadership passcode (ALIGN_LEADERSHIP_PASSCODE if the server sets one)
```

Sign in as leadership:

```sh
curl -sS -c "$JAR" -H 'content-type: application/json' -H "Origin: $ALIGN" \
  -d "{\"role\":\"leadership\",\"passcode\":\"$PASS\"}" "$ALIGN/api/session"
```

Grant (expect `"ok":true` and the record):

```sh
curl -sS -b "$JAR" -X POST -H 'content-type: application/json' -H "Origin: $ALIGN" \
  -d "{\"harness\":\"$HARNESS\",\"repo\":\"$REPO\"}" "$ALIGN/api/sessions/consent"
```

Check (expect exactly one record for that harness and repo):

```sh
curl -sS -b "$JAR" "$ALIGN/api/sessions/consent"
```

Revoke (expect `"revoked":true` and `purged_sessions`):

```sh
curl -sS -b "$JAR" -X DELETE -H 'content-type: application/json' -H "Origin: $ALIGN" \
  -d "{\"harness\":\"$HARNESS\",\"repo\":\"$REPO\"}" "$ALIGN/api/sessions/consent"
```

Without the leadership cookie the grant and revoke return 401 (signed out) or 403 (another role). A foreign `Origin`
returns 403. A repo that is not a plain folder name returns 400.

## What revoke and reset do

- **Revoke** deletes the record and purges every captured session for that harness and repo, plus their mappings.
  Nothing of that repo is shown, mapped or sent to a model again. Later events from it get 403.
- **Reset** (leadership, `POST /api/reset`) keeps only captured sessions whose harness and repo still have consent;
  the rest are purged. Mappings are cleared either way. Consent records survive a reset and a custom scenario setup.

## What leaves the machine

- The external model is **off** unless the server was started with `ALIGN_MAPPER_EXTERNAL=1` **and** an
  `AI_GATEWAY_API_KEY` in its environment. No `.env` file is read for it. Check without printing the key:

  ```sh
  curl -sS -b "$JAR" "$ALIGN/api/mappings" | jq -c .mapper
  ```

  `{"status":"off",...}` or `{"status":"no-key",...}` means nothing is sent. Never echo, log or paste the key; to see
  whether your own shell has one, use `[ -n "$AI_GATEWAY_API_KEY" ] && echo set || echo unset`.
- Signed-out callers cannot see sessions (B1-6). `GET /api/state` without a session returns only the sign-in labels:

  ```sh
  curl -sS "$ALIGN/api/state" | jq -c keys   # ["company","me"] for Northstar; plus "scenario","teams" for a custom scenario
  ```

## Before the first real capture

1. Hooks run in the one repo only: that repo's `.claude/settings.json` names `align-capture`, every other worktree has
   `.claude/settings.local.json` = `{"disableAllHooks": true}`, and `ALIGN_CAPTURE` is unset in your shell profile.
2. Grant consent for exactly that harness and repo basename (above). Pick a basename no other folder on the machine uses.
3. Verify with the check command: one record, the right harness, the right repo.
4. Confirm the external model status is what you intend (`off` unless you meant otherwise).
5. Capture: start the agent in that repo, with its hook pointed at this server (`ALIGN_URL` set for that agent only).
6. Revoke when done. This purges the captured sessions for that repo.
