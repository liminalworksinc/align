# Security overview

> Prepared 2026-10-30 from the code and configuration in this repository, for review before it is published. It says
> what Align does today and, at the end, what it does not do yet. [LEGAL ENTITY] publishes it. Report a security
> problem to [SECURITY CONTACT EMAIL].

Align keeps goals, who may change them, and the coding agents working toward them in step. It never needs to see
what people say to their agents: the server stores no prompt text, tool output, messages or code.

## In short

- One server on one Fly.io machine, behind Fly's HTTPS edge, with one SQLite database on a Fly volume that Fly
  encrypts at rest.
- No prompts, tool output, messages, code or file contents are stored on the server.
- People sign in as themselves: an emailed one-time code, Google, GitHub, or a passkey. There are no passwords.
- Sessions last 7 days from last use and never more than 30 days from sign-in. Sensitive actions need a sign-in from
  the last 15 minutes. "Sign out everywhere" ends every session at once.
- Every request is authorized in one policy module by workspace role, team role and goal visibility.
- Device, AI app and invite tokens are stored only as hashes. Refresh tokens rotate, and reusing an old one revokes
  the device or the app.
- Connected AI apps get read-only access to one workspace, as the person who connected them; adding evidence links
  needs a separate scope.
- Data is deleted on a published schedule ([retention](../RETENTION.md)), and an account can be deleted in the app.
- Local mode keeps everything on the person's own machine.
- Not yet: SOC 2, ISO 27001, a penetration test, SSO/SAML/SCIM. See "Not yet" below.

## Architecture

| Part | What it is |
| --- | --- |
| Server | One Next.js process on one Fly.io machine (region `sjc`, San Jose, California), 1 CPU and 1 GB. A second server on the same data refuses to start. <!-- fly.toml; lib/startup.ts pid file --> |
| Edge | Fly's proxy terminates TLS and redirects plain HTTP to HTTPS. Align answers only for its own host names, only for requests that came through Fly's edge over HTTPS, and only on an allowlist of paths: everything else is 404, so a route added later stays closed until it is listed. <!-- fly.toml force_https; proxy.ts --> |
| Database | One SQLite file, `/data/v2/align.sqlite`, file mode 0600 in a 0700 directory, on a Fly volume. Fly states that volumes are created with encryption at rest by default; that is Fly's control, not Align's. <!-- lib/v2/db.ts; https://fly.io/docs/volumes/overview/ --> |
| Image | Built from an allowlisted context: no tests, docs, local agent packages or `.env` files reach the image. It runs as the unprivileged `node` user. <!-- Dockerfile; .dockerignore --> |
| Secrets | `ALIGN_SECRET`, `BETTER_AUTH_SECRET` (32+ characters each), the email API key and any Google, GitHub or Turnstile secrets are set with `fly secrets`, never in the repository or the image. A server missing a required setting refuses to start. <!-- lib/config.ts; lib/v2/config.ts v2Problems --> |
| Outside services | Fly.io, the configured email API (Resend by default), Cloudflare Turnstile when enabled, and Google and GitHub for sign-in when configured. No AI model provider. See [subprocessors](subprocessors.md). |

## What Align stores, and what it does not

| Stored | Not stored |
| --- | --- |
| Account: email, name, profile picture address from Google or GitHub, linked sign-in methods, passkeys (public keys) | Passwords (there are none) |
| Workspace: members and roles, teams, invites, goals and their versions, alignments, change requests and decisions, directives | Prompt text, tool output, messages, code, file contents |
| Shared sessions: harness, a hashed repository key, an optional repository alias, times, state, goal binding, token usage and estimated cost | A session title: the `align` agent sends none <!-- docs/RETENTION.md --> |
| Work signals for 24 hours: keyed hashes of files touched; file paths and short text only if the person turns on "share work signals" | Anything from a session the person did not choose to share |
| Change request evidence: typed links (pull request, CI run, incident, dashboard, document or other) labelled self-reported or agent-reported, and a goal snapshot Align computes itself | Any claim that evidence is verified: Align labels it, it does not check it |
| Product events: an event name, the workspace, a keyed hash of the person, the time and a few allowlisted properties | Emails, names, titles, URLs or tokens in those events |
| Audit log: who did what to which object, and when | The content of goals or requests in the audit log |

## Signing in

- **Email one-time codes.** 6 digits, valid 5 minutes, 3 attempts, stored as a SHA-256 hash. Sends are limited
  per address and per client, durably when hosted (see "Rate limits"). The answer to a send never says whether an
  account exists. A code makes a new account only for a pending invite, an approved access request's creation code,
  or the server's first owner. <!-- lib/v2/auth.ts -->
- **Google and GitHub.** Standard OAuth sign-in through Better Auth, asking only for identity (Google `openid`,
  `email`, `profile`; GitHub `read:user`, `user:email`). Accounts are linked only explicitly, from the account page,
  never by a matching email. An account whose email the provider did not verify can't be taken over with an email
  code. <!-- lib/v2/auth.ts -->
- **Passkeys.** WebAuthn passkeys, added from the account page after a recent sign-in, with the public host as the
  relying party. Signing in with a passkey is phishing-resistant. <!-- lib/v2/auth.ts passkey() -->
- **No passwords.** A password sign-in exists only as a local test switch, which a hosted server refuses to start
  with. <!-- lib/v2/config.ts v2Problems ALIGN_TEST_IDP -->
- **Sessions.** A random token in a signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie
  (`__Secure-align_v2.session_token`), kept in the database as Better Auth issues it.
  A session lasts 7 days, extended while it is used, and never more than 30 days after the sign-in that made it
  (`ALIGN_SESSION_MAX_DAYS`, 1 to 365). **Sign out everywhere** ends all of a person's sessions and can also unpair
  their devices and disconnect their AI apps. <!-- lib/v2/auth.ts; lib/v2/account.ts signOutEverywhere -->
- **Recent sign-in for sensitive actions.** A sign-in from the last 15 minutes is needed to approve a device or an AI
  app, change a role, remove a member, invite an owner, delete or restore a workspace, add a passkey, link an
  account, sign out everywhere, and delete the account. <!-- lib/v2/config.ts RECENT_SIGN_IN_MS; requireRecentSignIn callers -->

Email codes alone are a single factor (NIST AAL1). People who want a phishing-resistant sign-in can add a passkey.

## Who may do what

- **Workspace roles.** Owners manage the workspace (invites, teams, roles, removal, deletion, the audit log);
  members create goals and share sessions; viewers read. **Team roles:** leads manage their team's members and team
  goals. <!-- lib/v2/policy.ts WORKSPACE_ROLE_ACTIONS, POD_ROLE_ACTIONS -->
- **Goal visibility.** Private (its owner only), team, or workspace. A workspace owner does not read others' private
  goals. <!-- lib/v2/policy.ts -->
- **One decision point.** Every route asks the same policy module. Something the caller may not see answers 404, so
  its existence does not leak; something visible but not allowed answers 403. <!-- lib/v2/policy.ts -->
- **Leaving.** When a person leaves or is removed, their access ends at once: team places, device access and
  connected AI apps for that workspace. <!-- lib/v2/lifecycle.ts -->

## Tokens and keys

| Credential | How it works |
| --- | --- |
| Device pairing (the `align` CLI) | A device makes an Ed25519 key pair and a person approves its code in the browser after a recent sign-in. Access tokens last 1 hour. Refresh tokens last 30 days, rotate on every use, and each refresh is signed with the device's private key. Presenting a refresh token that was already used revokes the device. Only SHA-256 hashes of tokens are stored. <!-- lib/v2/devices.ts --> |
| Connected AI apps (OAuth 2.1) | Authorization code with PKCE (S256) only, public clients, refresh token rotation, resource binding. A person approves one app for one workspace after a recent sign-in. Access tokens last 1 hour and are checked against the grant and the person's membership on every call. Refresh tokens last 7 days from the grant and are never extended; reusing an old one deletes the grant. Refresh tokens are stored only as keyed hashes. <!-- lib/oauth/server.ts; lib/oauth/grants.ts --> |
| What an app may do | Read only, through nine tools: goals, a goal, change requests, decision records, directives, goal limits, asks between teams, agent activity counts toward goals and a short brief. An app may add agent-reported evidence links to change requests through a tenth tool only if the person grants the separate `changes:evidence` scope, and each grant records the scopes it was given. <!-- lib/mcp/register.ts --> |
| Invite links, device pairing secrets, creation codes | Stored only as hashes (creation codes as an HMAC under `ALIGN_SECRET`). <!-- lib/v2/db.ts token_hash, device_code_hash, code_hash --> |
| Server secrets | Rotating `ALIGN_SECRET` ends every connected app and unused creation code; rotating `BETTER_AUTH_SECRET` signs everyone out. <!-- lib/secret.ts; docs/HOSTING.md --> |
| Google and GitHub tokens | Better Auth keeps the access and refresh tokens the provider issued at sign-in or linking in the database, encrypted (XChaCha20-Poly1305 under the server's `BETTER_AUTH_SECRET`). An ID token (Google issues one: a signed, short-lived statement of who signed in) is stored as issued. Align does not use these tokens after sign-in, and no route returns them: Better Auth's routes that would hand out, refresh or describe them (and the one that unlinks a provider) are turned off. <!-- lib/v2/auth.ts account.encryptOAuthTokens, DISABLED_PATHS --> |

## Requests from browsers and AI apps

- A write made with the sign-in cookie must carry this server's exact `Origin`, so another site can't make one.
  <!-- lib/v2/http.ts -->
- Device and MCP routes refuse requests from browsers. <!-- lib/v2/http.ts; specs/align/mcp.md -->
- The AI app consent page can't be framed, cached or leaked in a `Referer`. <!-- next.config.ts -->
- Text written by people comes back to AI apps marked as untrusted, so an agent can tell data from instructions.
  <!-- lib/mcp/register.ts -->
- Align sends agents only facts and an enforced stop: no free-text instructions, and nothing wakes an idle agent.
- When Align fetches an AI app's client document, it refuses private network addresses, limits size and time, and
  caches the result. <!-- lib/oauth/clients.ts -->

## Rate limits and abuse controls

- Email-code sends: 3 per address per 10 minutes, 10 per client per hour, and, hosted, 5 per address per hour and
  3 per client per minute, counted in the database so a restart doesn't reset them. <!-- lib/v2/auth.ts -->
- Better Auth's own limits on sign-in routes when hosted, also counted in the database. <!-- lib/v2/auth.ts rateLimit -->
- Limits on workspace creation, invites, device pairing and device-code lookups. <!-- specs/align/workspaces.md -->
- Hosted workspace creation needs a single-use creation code by default, and the operator can close creation
  entirely. Caps on workspaces (100), workspaces per person (2), members per workspace (25) and new shared sessions
  per device per day (500), each configurable. <!-- lib/v2/config.ts caps(), creationMode() -->
- Disposable email domains can't request access or create a workspace. <!-- lib/v2/disposable.ts -->
- Cloudflare Turnstile on email-code sign-in, access requests and workspace creation, when its keys are set. A
  hosted server without them starts and logs a warning. <!-- lib/v2/captcha.ts; lib/startup.ts -->

## Logging and the audit log

- When hosted, the server logs no request body, path, address, email or code. A server error logs only the error's
  name. Email failures log only the HTTP status. The retention job logs counts only. <!-- lib/v2/http.ts; lib/v2/core.mts postEmail; lib/v2/retention.ts -->
- Fly.io keeps the machine's log output on its platform for a limited time; Align keeps no copy.
- Each workspace has an audit log of who did what to which object, and when: membership and roles, invites, teams,
  goal versions, change requests and alignments and their decisions, devices, connected apps, passkeys, stopped
  agents, deletions and restores. Owners can read it. It is kept 1 year. A change request approved without evidence
  is recorded as such. <!-- lib/v2/db.ts v2_audit; docs/RETENTION.md -->
- Content-free product events are kept 13 months and are visible to the operator only.

## Backups and recovery

- Fly.io takes a daily snapshot of the volume, kept 7 days. <!-- fly.toml scheduled_snapshots, snapshot_retention = 7 -->
- Align makes no other backup, off-site or otherwise. Restoring from a snapshot would lose the changes since it was
  taken, up to a day.
- One machine in one region: if it fails, Align is down until it is restored. There is no standby.
- Fly checks the server's health every 30 seconds. <!-- fly.toml http_service.checks -->

## Deletion and retention

The full schedule is [RETENTION.md](../RETENTION.md). In short: shared session rows are rolled up without the person
after 13 months; the audit log is kept 1 year; removed members are shown as "Former member" after 30 days; a deleted
workspace can be restored for 30 days and is then purged, and is gone from every snapshot within 38 days; an account
deleted in the app is deleted at once. Approved and declined access requests are deleted 13 months after the
decision, pending ones 13 months after they were made. Product events are kept 13 months.

## Local mode

Align also runs on a person's own machine (Mode L). The database stays in `data/v2/align.sqlite` there and nothing is
sent to [LEGAL ENTITY]. The local server answers only to loopback host names, so another website can't reach it under
its own name. It prints sign-in codes instead of emailing them. It reaches the internet only for Google or GitHub
sign-in, if configured, and to read the client document of an AI app the person connects. <!-- proxy.ts; lib/v2/mail.ts -->

## How the code is made

- The code is in git. Dependencies are locked with `package-lock.json`, and the sign-in library (Better Auth and its
  passkey plugin) is pinned to an exact version. <!-- package.json -->
- Integration tests start real servers and cover sign-in, authorization, the hosted edge, connected apps and the
  retention job (`scripts/test-v2.mjs`, `scripts/test-oauth.mjs`), and the hosted image has its own test
  (`scripts/test-image.sh`). They are run by developers; no CI service runs them yet.

## Reporting a vulnerability

Email [SECURITY CONTACT EMAIL]. See `SECURITY.md` in the repository for what to include and what to expect.

## Not yet

These are not in place. Each is available to discuss for a specific customer.

- No SOC 2 report and no ISO 27001 certification.
- No independent penetration test.
- No SSO (SAML or OIDC) and no SCIM provisioning. Available on request.
- No per-workspace settings for session length or retention.
- No customer-managed keys, and no encryption of the database beyond Fly's volume encryption, except Google and
  GitHub access and refresh tokens, which are encrypted.
- Browser session tokens are stored as issued, not hashed, and so is a Google ID token.
- No off-site backups, no standby machine, and one region.
- No site-wide Content-Security-Policy or HSTS header yet (the consent page has its own framing protections).
- No automated dependency or secret scanning in CI, and no CI test run.
- No bug bounty.
- No written incident-response runbook; the commitment to customers is in the [DPA](dpa.md): notice within 72 hours.
