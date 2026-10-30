# How long Align keeps data

This is Align's published retention schedule. It describes what the code does: the retention job in
`lib/v2/retention.ts`, account deletion in `lib/v2/account.ts`, workspace deletion in `lib/v2/workspaces.ts`, and the
volume snapshots in `fly.toml`. The contract is the "Data retention" requirement in `specs/align/workspaces.md`.

Align never stores prompt text, tool output or messages on the server. The `align` agent shares a session's harness, a
hashed repository key, an optional repository alias, its times and state, its goal binding and its token usage and
estimated cost. It sends no title.

## The schedule

| Data | Kept | Then |
|---|---|---|
| Prompt text, tool output, messages | Not stored on the server | Nothing to delete |
| Shared sessions: harness, hashed repo key, repo alias, times, state, goal binding, binding periods, usage (model, tokens, estimated cost), the person who shared it | 13 months after the session ends: when sharing stopped, or else its last activity (its last upload, binding change or update) | Rolled up into totals per workspace, goal, UTC day, model and billing basis, with no person and no session. The raw rows (session, binding periods, usage, directive deliveries and receipts) are deleted |
| Spend roll-ups (no person, no session) | The life of the workspace | Deleted with the workspace |
| Activity signals (in-flight edits, commits, tasks, claims) | 24 hours (claims 1 hour) | Deleted by the daily job, or with their session |
| Workspace audit log | 1 year | Deleted |
| A person who leaves or is removed | Their access ends at once: team places, device access and connected AI apps for that workspace. Their goals, sessions and history stay under their name for 30 days | After 30 days they are shown as "Former member #n" (numbered per workspace) in every row of that workspace, the audit log included; their sessions no longer point at their device, and invites to or accepted by them are deleted, so their email leaves the workspace. Their account stays until they delete it |
| Sessions of a removed member, if the owner ticks "Also delete their shared sessions in this workspace now" | Deleted at removal | Spend already rolled up stays |
| An account, when its owner deletes it (`/app/account`) | Deleted at once | Their memberships end as above, and in every workspace their rows become "Former member #n" at once. Their devices, sign-in sessions, linked sign-in methods, passkeys (with when each was last used), their answer to the "add a passkey" prompt, codes, access requests, unused creation codes bound to their email, email-keyed rate-limit counters and the account are deleted. A workspace where they were the only member is deleted with it (see the next row). The audit records that an account was deleted, with no name or email. Refused while they are the only owner of a workspace that has other members |
| A deleted workspace (by an owner, with the account of its only member, or by the operator) | 30 days, during which its owners can restore it from Your workspaces | Every row is deleted by the daily job on day 30 or within the 24 hours after, its audit included. The operator can erase one at once (`align-admin workspaces delete <ws> --purge --yes`) |
| Fly.io volume snapshots (hosted) | Daily snapshots, each kept 7 days (`fly.toml`: `scheduled_snapshots = true`, `snapshot_retention = 7`) | Expire, so deleted data leaves the snapshots within 7 days. A purged workspace is gone from every copy within 38 days of its deletion |
| Off-site backups | None are made | |
| Email sign-in codes | 5 minutes, 3 attempts | Deleted by the daily job once expired |
| Sign-in sessions (with the client IP address and user agent when hosted) | 7 days, extended while used, and never more than 30 days after the sign-in (`ALIGN_SESSION_MAX_DAYS`). Signing out everywhere ends them all at once | A session past the 30 days is deleted when it is next presented; the daily job deletes the rest once expired or past the 30 days |
| Pending invites | 7 days | Deleted 7 days after they expire. An accepted invite is kept while the person is a member, and deleted when they become a former member or with the workspace |
| Passkeys (name, public key, when added and last used) | Until the person deletes the passkey | Deleted at once, or with the account |
| Access requests (`/app/request-access`: email, name, company, team size, what for, interest) | Until the operator deletes them; the job does not trim them | Deleted when that email's Align account is deleted |
| Creation codes (an HMAC of the code, the email it is bound to, dates, the workspace it created) | Kept as the record of who could create what | An unused code bound to an account's email is deleted with that account; a used one then keeps no email or redeemer. Purging a workspace clears the code's workspace |
| Durable rate-limit counters (an HMAC of an email address or a client address, and a time) | 24 hours | Pruned as new calls are counted; the ones keyed by an account's email are deleted with the account |
| Paired devices (name, public key, last seen) | Until the person revokes the device; a revoked device's row stays, without working tokens | Deleted with the account |
| AI apps that registered themselves (`_oauth_clients.json`: an app's name and redirect addresses, nothing about people) | Kept | |
| Server logs | When hosted, Align logs no request body, path, address, email or code; a server error logs only its error name, and the retention job logs counts only | Fly.io keeps a machine's log output on its platform for a limited time; Align keeps no copy |
| Email provider message logs | The provider's own retention (set it to the shortest it offers) | The provider deletes them |
| Local mode (Mode L) | Everything stays in `data/v2/align.sqlite` on the person's own machine; nothing is sent to Align | The same job runs there, on that machine |

## When the job runs

- At every server start, and then every 24 hours while the server runs (`instrumentation.ts`). It never runs during a
  build.
- By hand, with the operator script: `node scripts/align-admin.mjs retention run` runs it now and prints what it did;
  `--dry-run` prints what it would do and changes nothing (`node scripts/retention.mjs [--dry-run]` is the same
  command). It reads `ALIGN_DATA_DIR` (default `./data`) and runs the same code as the server
  (`lib/v2/retention-core.mts`). Run it with the server's environment, because it reads `ALIGN_SESSION_MAX_DAYS` the
  way the server does: on the hosted machine, `fly ssh console -C "node scripts/align-admin.mjs retention run"` (the
  image carries the script) has that environment.
- The operator can also erase one workspace at once, without waiting for its restore window:
  `node scripts/align-admin.mjs workspaces delete <ws> --purge --yes`, the same purge the job does on day 30.
- Each step is its own short transaction and running the job again changes nothing.

Deleted data can't be recovered by Align once the job has removed it: Align keeps no other copy than the volume
snapshots above.
