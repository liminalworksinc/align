---
name: Identity and workspaces
summary: How people sign in as themselves (Google, GitHub, an emailed one-time code, printed locally in Mode L, or a passkey), how long a sign-in lasts, and how workspaces, roles, invites, teams, the audit trail, paired devices, shared sessions, usage and spend, activity, asks between teams, goal activity counts, account and workspace deletion, the data retention schedule, rate limits and the local and hosted edges work.
kind: area
---

# Identity and workspaces

Everyone who uses Align is a **person** with their own Better Auth account (`ba_user`). Nothing is reached with a
shared secret: there are no role passcodes, access codes or shared agent tokens. A person signs in with Google or
GitHub (each only when configured) or with a one-time code sent to their email address. When hosted, the code is
emailed; in **Mode L** (the default, loopback-only mode) it is printed to the server's terminal and written to a
private file, and the server creates one local owner account on first start. Once signed in, a person can add
**passkeys** and then sign in with one. A browser sign-in lasts 7 days from its last use and never more than 30 days;
sensitive actions need a **recent sign-in** (15 minutes), and **sign out everywhere** ends every sign-in at once.

Signed in, a person creates **workspaces** (`ws_…`) or joins one by an email-bound **invite**. In Mode L anyone
signed in may create one; a hosted server gates creation (by default a single-use **creation code**, which the
operator issues with `scripts/align-admin.mjs`, usually in answer to an **access request**), checks for bots with
Cloudflare Turnstile when configured, refuses disposable email domains where it costs something, and caps workspaces,
members and new shared sessions. Each member has one
workspace **role**: `owner`, `member` or `viewer`. Members are grouped into flat **teams** with a `lead` or `member`
team role. A person pairs a **device** (the `align` CLI on their machine) with a key-bound device-code flow, grants it
some of their workspaces, and the device then shares chosen coding-agent **sessions**, opens binding **epochs**,
uploads **usage** and posts **activity** signals. Members read **spend** reports and the workspace's people, teams
and devices; owners also read the **audit** trail. Members record **asks** (what a team was asked to do) and read each
goal's agent **activity** counts.

Goals, goal visibility, approval sets, alignments and change requests are specified in `goals-and-proposals`.
Directives (including stop and resume) are in `directives`, the MCP endpoint and OAuth consent in `mcp`, the CLI in
`local-agent`, and the screens under `/app` in `interface`.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Person | A Better Auth user (`ba_user`, id `u_…`). Signs in with Google, GitHub or an email one-time code |
| Mode L | The default mode: `npm start` binds `127.0.0.1:3100`, and the server answers only loopback `Host` names |
| Hosted | `HOSTED=1`: one public origin (`ALIGN_PUBLIC_ORIGIN`) behind an HTTPS edge, with a route allowlist |
| Web route | An `/api/v2` route authenticated by the Better Auth session cookie (a browser) |
| Device route | An `/api/v2` route authenticated by a device access token `Bearer alnd_…` (the `align` CLI) |
| Workspace | `ws_…`: one organization's goals, people, teams, sessions and usage |
| Workspace role | `owner`, `member` or `viewer`; viewers can read but never change anything |
| Team | A named group of workspace members (stored as `pod`, id `pod_…`); team role `lead` or `member` |
| Invite | A single-use, 7-day link for one email address, optionally naming a team |
| Device | A paired machine (`dv_…`) with an Ed25519 key, workspace grants, a 1-hour access token and a rotating 30-day refresh token |
| Shared session | A coding-agent session a device chose to share, addressed by a 43-character `session_key` |
| Epoch | A period of a shared session bound to one goal (or none); usage counts under its epoch's goal |
| Ask | `ask_…`: something a person recorded that a team was asked to do (by "Faculty", in a meeting or by hand), owned by the team asked; `open`, `accepted`, `done`, `declined` or `withdrawn` |
| Mention | A later time an ask came up again (date, what was said, where), at most 10 per ask |
| Goal activity | Counts of the sessions bound to a goal over the last 14 days, from bindings, usage times and work signals, never from what agents wrote |
| Creation code | `alc_…`: a single-use, expiring code that lets one hosted workspace be created, optionally bound to one email address; only its HMAC is stored |
| Access request | `ar_…`: someone's request, from the public `/app/request-access` form, for a creation code; pending, approved or declined by the operator |
| Operator | Whoever runs the hosted server; `scripts/align-admin.mjs` is their tool for codes, requests and workspaces |
| Audit row | `{at, actor, action, object_id}` written by each change a person makes (and by a few automatic events); `actor` is null only for system actions |
| Deleted workspace | A workspace its owner deleted: unreachable to everyone, restorable by its owners for 30 days, then purged |
| Former member | A person who left, was removed or deleted their account, shown in a workspace's rows as "Former member #n" (id `fm_<n>`, numbered per workspace) once pseudonymised |
| Retention job | `runRetention` in `lib/v2/retention-core.mts`: applies the data retention schedule, at every start, every 24 hours and from `align-admin retention run` (alias `scripts/retention.mjs`) |
| Passkey | A WebAuthn credential (Better Auth's `ba_passkey`) that signs one person in; its relying party is the public host when hosted and `localhost` in Mode L |
| Recent sign-in | A Better Auth session created within the last 15 minutes; a passkey sign-in makes one like any other sign-in |

**Person lifecycle.** Sign in (provider or email code) → create a workspace or accept an invite → pair a device →
share sessions → change role, leave or be removed (team memberships, device grants and OAuth grants for that
workspace end; goals, sessions and history stay attributed to the person for 30 days, then to "Former member #n") →
delete their account (every membership ends and their rows become "Former member #n" at once).

**Device lifecycle.** `POST /api/v2/device/authorize` → the person approves the user code at `/app/device` (with a
recent sign-in) → the device polls `POST /api/v2/device/token` and receives tokens once → it refreshes with a
signature → it is revoked by itself, by its owner, by refresh-token reuse, or loses a workspace when its owner leaves
that workspace.

## Requirements

### Requirement: Sign-in providers

The server SHALL mount Better Auth at `/api/v2/auth/*`, offer Google sign-in only when `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are both set, GitHub sign-in only when `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are both
set, email one-time-code sign-in always in Mode L and, when hosted, whenever the email settings are set, and passkey
sign-in in both modes for passkeys people have added.

#### Scenario: Only configured providers

- **WHEN** a Mode L server starts with GitHub's client id and secret set and no Google settings
- **THEN** the sign-in page offers GitHub, email code and passkeys, a Google sign-in request is refused by Better Auth, and no other sign-in method exists

#### Scenario: Hosted without email settings

- **WHEN** a hosted server has Google configured and none of the email settings
- **THEN** sign-in is Google only, and a request to send an email code is refused with 404 (the email-code routes are not mounted) without sending anything

### Requirement: Email one-time codes

The server SHALL implement email sign-in with Better Auth `emailOtp` (type `sign-in`) using 6-digit codes that are
stored hashed, are valid for 5 minutes and allow 3 attempts, and SHALL sign a person in only by a POST that presents
the code.

#### Scenario: Requesting and using a code

- **WHEN** a client POSTs `{email, type:"sign-in"}` to `/api/v2/auth/email-otp/send-verification-otp` and then, within 5 minutes, POSTs `{email, otp}` with that code to `/api/v2/auth/sign-in/email-otp`
- **THEN** the second request sets the Better Auth session cookie, the code is spent, and the database holds only a hash of the code, never the code itself

#### Scenario: Wrong, expired or exhausted code

- **WHEN** a wrong code is presented, or the code is older than 5 minutes, or a fourth attempt is made after 3 wrong ones
- **THEN** Better Auth refuses with 400 `INVALID_OTP`, 400 `OTP_EXPIRED`, or 403 `TOO_MANY_ATTEMPTS` (the code is deleted after the third wrong attempt) and nobody is signed in

#### Scenario: Link in the message only fills the form

- **WHEN** a browser opens `/app/sign-in?email=<email>&code=<code>`
- **THEN** the page shows the email and code filled in and a button to sign in; no session is created until the person submits the form, because no GET signs anyone in

### Requirement: Email code send limits

The server SHALL send at most 3 sign-in codes per email address per 10 minutes and at most 10 per client per hour
and, when hosted, at most 5 per email address per hour, counted in the database (keyed by an HMAC of the address, never
the address) so that a restart does not reset it, refusing further sends with 429 and sending nothing.

#### Scenario: Too many codes for one address

- **WHEN** a fourth code is requested for the same email address within 10 minutes, from any clients
- **THEN** the server responds 429, sends and prints nothing, and the earlier codes stay as they were

#### Scenario: Too many codes from one client

- **WHEN** one client (hosted: its `Fly-Client-IP`, IPv6 keyed by its /64) requests an 11th code within an hour, for any addresses
- **THEN** the server responds 429 and sends nothing

#### Scenario: Hourly limit across a restart

- **WHEN** a hosted server sent 3 codes to one address, restarts within the hour, and is then asked for 3 more for that address
- **THEN** the first two are sent and the third is refused with 429, and the stored counter keys hold no email address

### Requirement: Email code delivery when hosted

The server SHALL, when hosted, deliver each sign-in code through `lib/v2/mail.ts` (called by Better Auth's
`sendVerificationOTP`) as one HTTPS POST of JSON `{from, to, subject, text}` to `ALIGN_EMAIL_API_URL` with
`Authorization: Bearer <ALIGN_EMAIL_API_KEY>` and `from` equal to `ALIGN_EMAIL_FROM`, never print or log the code, and
answer the send request the same way whether or not an account exists for the address.

#### Scenario: Code email

- **WHEN** a hosted client requests a code for an address
- **THEN** the email API receives `to` equal to that address, the subject `Your Align sign-in code`, and a text holding the 6-digit code, the link `<ALIGN_PUBLIC_ORIGIN>/app/sign-in?email=<email>&code=<code>` and the 5-minute expiry

#### Scenario: Unknown address

- **WHEN** a hosted client requests a code for an address with no account and no pending invite
- **THEN** the response is the same success response as for an address with an account, so the send request never reveals whether an account exists

#### Scenario: Email API failure

- **WHEN** the email API answers a non-2xx status, or does not answer within 10 seconds
- **THEN** the send request fails with a server error, the code it made cannot be used, and the server log names only the HTTP status or error name, never the address, code or key

### Requirement: Email code delivery in Mode L

The server SHALL, in Mode L, email nothing and instead print each sign-in link to its standard output as
`Align sign-in for <email>: <url>` and write the same line to `<data>/v2/sign-in.txt` with mode 0600, for any email
address.

#### Scenario: Printed link

- **WHEN** a Mode L client requests a code for `ana@example.com`
- **THEN** stdout shows `Align sign-in for ana@example.com: http://<this request's host>/app/sign-in?email=ana%40example.com&code=<6 digits>`, and `sign-in.txt` (replaced on every send, mode 0600 in the 0700 `v2` directory) holds that line

#### Scenario: Loopback is not a credential

- **WHEN** a browser on the same machine calls any web route without a Better Auth session cookie
- **THEN** the server responds 401 `unauthorized`; being on loopback never signs anyone in, and only someone who can read the server's terminal or `sign-in.txt` can use a printed code

### Requirement: Accounts created by email code

The server SHALL, on a valid email code, sign in the account whose verified email equals the code's address
(compared case-insensitively), and create a new account only when none exists and the address has a pending invite,
or the server is in Mode L, or the address has a usable creation code bound to it (an approved access request), or the
server is hosted with no account yet and the address equals `ALIGN_FIRST_OWNER_EMAIL` (the hosted server's first
person); a new account's email is marked verified.

#### Scenario: New person with an invite

- **WHEN** a hosted client signs in with a valid code for an address that has no account but a pending invite
- **THEN** an account is created with that verified email and signed in, and the person can then accept the invite

#### Scenario: New person without an invite

- **WHEN** a hosted client presents a valid code for an address with no account and no pending invite
- **THEN** the sign-in fails with 403 and the message `This email can't sign in here yet. Ask a workspace owner to invite you.`, no account is created and nobody is signed in

#### Scenario: Approved access request

- **WHEN** a hosted client presents a valid code for an address with no account and no invite, but with an unused, unrevoked, unexpired creation code bound to it
- **THEN** the account is created with that verified email and signed in, so the person can create their workspace

#### Scenario: First person on a hosted server

- **WHEN** a hosted server with no accounts and `ALIGN_FIRST_OWNER_EMAIL=ops@example.com` receives a valid code for `ops@example.com`
- **THEN** the account is created and signed in, and the same address gets no such exception once any account exists

#### Scenario: Unverified match

- **WHEN** the only account holding the code's address has an unverified email
- **THEN** the server refuses with 403 `email_unverified` and does not sign in or change that account

### Requirement: Mode L local owner account

The server SHALL, on its first start in Mode L when no Better Auth user exists, create one account named
`Local owner` with the email `ALIGN_LOCAL_OWNER_EMAIL` (default `owner@align.localhost`) and send it a sign-in code,
printed as for any Mode L code.

#### Scenario: First start

- **WHEN** a Mode L server starts on an empty data directory
- **THEN** `ba_user` holds exactly one account, `Local owner` <`owner@align.localhost`>, belonging to no workspace, and stdout shows `Align sign-in for owner@align.localhost: http://127.0.0.1:<PORT or 3100>/app/sign-in?…`

#### Scenario: Later starts

- **WHEN** the server starts and at least one Better Auth user exists
- **THEN** no account is created and no code is sent

### Requirement: Sign-in link script

The command `npm run sign-in-link [email]` SHALL ask the running Mode L server at `http://127.0.0.1:<PORT or 3100>`
to send a fresh sign-in code for the given email (default `ALIGN_LOCAL_OWNER_EMAIL` or `owner@align.localhost`)
through the ordinary send request, so the server prints the link.

#### Scenario: Fresh link

- **WHEN** the owner's first code expired and they run `npm run sign-in-link`
- **THEN** the server prints a new `Align sign-in for owner@align.localhost: …` line and rewrites `sign-in.txt`, and the script exits 0 telling them where the link was printed

#### Scenario: Server not running

- **WHEN** no server answers at that address, or it answers 429
- **THEN** the script exits 1 with a message saying the server is not running or that too many codes were sent, and prints no code itself

### Requirement: Explicit account linking

The server SHALL keep implicit account linking off and let a signed-in person link Google or GitHub to their own
account only by an explicit request from `/app/account`.

#### Scenario: Same email, no link

- **WHEN** a person who signed up with an email code later signs in with GitHub whose email is the same address, without linking first
- **THEN** Better Auth does not attach the GitHub account to the existing account, and the person is not signed in to it through GitHub

#### Scenario: Linking from the account page

- **WHEN** a signed-in person chooses Link GitHub on `/app/account` and completes GitHub's consent
- **THEN** that GitHub account is linked to their account and can sign them in afterwards; a GitHub account already linked to another Align account is refused and stays where it was

### Requirement: Provider tokens encrypted at rest

The server SHALL store the access and refresh tokens a sign-in provider (Google, GitHub) issues at sign-in or linking
only encrypted (Better Auth's `account.encryptOAuthTokens`: XChaCha20-Poly1305 under `BETTER_AUTH_SECRET`), never as
issued; an ID token and browser session tokens are stored as issued. Align does not use provider tokens after sign-in,
and SHALL keep Better Auth's routes that would return, refresh or describe them or unlink a provider
(`/api/v2/auth/get-access-token`, `/refresh-token`, `/account-info`, `/unlink-account`) off.

#### Scenario: Provider sign-in

- **WHEN** a person signs in through a provider, or links one, and the provider issues an access token and a refresh token
- **THEN** `ba_account` holds neither as issued (the database file does not contain them), the sign-in or link works as before, and Better Auth's decrypt helper with the server's key opens them

#### Scenario: No route returns them

- **WHEN** a signed-in person calls `/api/v2/auth/get-access-token`, `/refresh-token`, `/account-info` or `/unlink-account`
- **THEN** each answers 404 and nothing changes: no provider token leaves the server, and the provider stays linked

### Requirement: Test identity provider

The server SHALL offer Better Auth email-and-password sign-up and sign-in only when `ALIGN_TEST_IDP=1` and the server
is not hosted, for tests, and with it, when `ALIGN_TEST_OAUTH_URL` names a loopback OAuth 2.0 stub, an `align-test`
sign-in provider that signs in and links through the same Better Auth routes as Google and GitHub; a hosted server
refuses to start with `ALIGN_TEST_OAUTH_URL` set.

#### Scenario: Off by default

- **WHEN** `ALIGN_TEST_IDP` is unset and a client POSTs to `/api/v2/auth/sign-up/email`
- **THEN** Better Auth refuses the request and no account is created

#### Scenario: Never hosted

- **WHEN** a hosted server's environment sets `ALIGN_TEST_IDP` to any value
- **THEN** the server refuses to start and names `ALIGN_TEST_IDP is not allowed when hosted`

### Requirement: Recent sign-in for sensitive actions

The server SHALL require a sign-in no older than 15 minutes, and otherwise refuse with 403 `reauth_required` and change
nothing, for: approving a device on `POST /api/v2/device/approve`; approving an MCP app at `/oauth/authorize`; an
owner changing a member's role (making someone an owner included) on `POST /api/v2/workspaces/{ws}/members/{user}`;
an owner removing another member; an owner creating an invite with role `owner`; an owner deleting a workspace or
restoring a deleted one; a person deleting their account (`DELETE /api/v2/me`); adding a passkey (`/api/v2/auth/passkey/generate-register-options` and `/verify-registration`); deleting a passkey;
linking a Google or GitHub account (`/api/v2/auth/link-social`); and signing out everywhere. Better Auth's own
fresh-session age SHALL be the same 15 minutes.

#### Scenario: Old session approving a device

- **WHEN** a person whose Better Auth session was created 20 minutes ago POSTs `/api/v2/device/approve`
- **THEN** the server responds 403 `reauth_required` and approves nothing, and `/app/device` asks them to sign in again and then shows the same code

#### Scenario: Fresh session

- **WHEN** the same person signs in again and approves within 15 minutes
- **THEN** the approval succeeds; looking up a code and denying it need no recent sign-in

#### Scenario: Old session on an owner action

- **WHEN** a workspace owner whose session was created 20 minutes ago changes a role, makes someone an owner, removes a member, invites someone as an owner, deletes the workspace or restores a deleted one
- **THEN** the server responds 403 `{error:"reauth_required", message:"Sign in again to <action>. This needs a sign-in from the last 15 minutes."}` and nothing changes; a member or viewer attempting the same still gets `owner_only` or `read_only`, and leaving a workspace, inviting a member or viewer, renaming a workspace, creating one (with or without a creation code) and revoking one's own device or app need no recent sign-in

#### Scenario: Old session on account actions

- **WHEN** a person whose session was created 20 minutes ago asks to add a passkey, delete a passkey, link a provider, sign out everywhere or delete their account
- **THEN** the server responds 403 `reauth_required` (in Better Auth's `{code, message}` shape on `/api/v2/auth/*`, in `{error, message}` elsewhere) and nothing is added, deleted, linked or ended

### Requirement: Session lifetime and absolute cap

The server SHALL keep a browser session for 7 days, extended to 7 days from now at most once a day when it is used,
and SHALL never let a session outlive `ALIGN_SESSION_MAX_DAYS` days (a whole number from 1 to 365, default 30) after
the sign-in that created it: a session older than that is refused by every session read (Better Auth's
`/api/v2/auth/get-session`, the `/api/v2` web routes and the `/app` pages) and its row is deleted, and its expiry is
never set past that limit.

#### Scenario: Older than the cap

- **WHEN** a browser presents a session created 31 days ago that was used yesterday
- **THEN** `GET /api/v2/auth/get-session` answers `null`, `/api/v2/me` 401 `unauthorized`, an `/app` page sends the person to sign-in, and the session's row is gone

#### Scenario: Extended up to the cap

- **WHEN** a session created 29 days ago, with 5 days left, is used
- **THEN** it still works and its expiry moves to exactly 30 days after its creation, not 7 days from now; a new session expires 7 days after it was made, or at the cap if `ALIGN_SESSION_MAX_DAYS` is shorter

#### Scenario: Never presented again

- **WHEN** sessions older than the cap are never presented again
- **THEN** the retention job deletes them on its next run (at most 24 hours later), with the expired ones

### Requirement: Passkeys

The server SHALL let a signed-in person add passkeys through Better Auth's passkey plugin
(`@better-auth/passkey`, the same version as `better-auth`) at `/api/v2/auth/passkey/*`, with the relying party
`Align`, id the `ALIGN_PUBLIC_ORIGIN` host and origin `ALIGN_PUBLIC_ORIGIN` when hosted, and id `localhost` and origin
`http://localhost:<port>` in Mode L; SHALL require discoverable credentials so a passkey signs in with no email typed;
SHALL list the person's passkeys on `GET /api/v2/account/passkeys`, rename one on `PATCH /api/v2/account/passkeys/{id}
{name}` and delete one on `DELETE /api/v2/account/passkeys/{id}`; and SHALL keep Better Auth's own passkey list,
update and delete routes off.

#### Scenario: Adding a passkey

- **WHEN** a person with a recent sign-in gets `/api/v2/auth/passkey/generate-register-options` and posts the authenticator's answer to `/api/v2/auth/passkey/verify-registration`
- **THEN** the passkey is stored for them in `ba_passkey`, the audit (no workspace) records `passkey.added` with them as actor and the passkey's id, and the authenticator labels it with their email; a name over 100 characters is 400

#### Scenario: Listing, renaming and deleting

- **WHEN** a person calls `GET /api/v2/account/passkeys`, then `PATCH .../passkeys/{id} {name}` and `DELETE .../passkeys/{id}`
- **THEN** the list is `{passkeys:[{id, name, created_at, last_used_at}], prompt}` (their own only, oldest first, `last_used_at` null until the passkey first signs them in), the rename answers `{id, name}` (1 to 100 characters), and the delete answers 204 and records `passkey.deleted`; another person's passkey, an unknown id or a malformed one is 404 `not_found`

#### Scenario: Signing in with a passkey

- **WHEN** someone posts a valid assertion from a registered passkey to `/api/v2/auth/passkey/verify-authentication` (after `generate-authenticate-options`, which needs no session)
- **THEN** the server creates a new session for the passkey's person, which is a recent sign-in, and records the passkey's last use; an unknown credential is 401 `PASSKEY_NOT_FOUND`; when hosted, Better Auth allows 20 option requests and 10 verifications per client per minute

#### Scenario: Mode L at 127.0.0.1

- **WHEN** a Mode L server is opened at `http://127.0.0.1:<port>`
- **THEN** passkeys cannot be added or used there (WebAuthn needs a domain name, and the relying party is `localhost`); they work at `http://localhost:<port>`

### Requirement: Add-a-passkey prompt state

The server SHALL report, as `prompt` on `GET /api/v2/account/passkeys` and to the `/app` pages, that a person should be
offered a passkey when they have none and have not dismissed the offer, and SHALL remember a dismissal per person on
`DELETE /api/v2/account/passkey-prompt` (204).

#### Scenario: Dismissed

- **WHEN** a person with no passkey dismisses the prompt
- **THEN** `prompt` is false for them from then on, on every browser; adding a passkey also ends the prompt

### Requirement: Sign out everywhere

The server SHALL, on `POST /api/v2/account/sign-out-everywhere {devices?, apps?}` from a person with a recent sign-in,
delete every Better Auth session of that person (the calling one included) and clear the caller's session cookie;
with `devices: true` also revoke every paired device of theirs (reason `signed_out_everywhere`); with `apps: true`
also delete every OAuth grant of theirs in every workspace; all in one transaction, answering
`{sessions, devices, apps}` with how many ended. Better Auth's own `/revoke-session`, `/revoke-sessions` and
`/revoke-other-sessions` SHALL be off.

#### Scenario: Everything

- **WHEN** a person signed in on three browsers, with a paired device and a connected AI app, signs out everywhere with `{devices:true, apps:true}`
- **THEN** the response is 200 with `devices:1` and `apps` counting the live grants ended, each browser's next request is 401, the device's token is 401, the app's access token is 401 and its refresh `invalid_grant`, and the audit records `account.signed_out_everywhere` (no workspace) plus `device.revoked` and, in each workspace, `oauth.app_revoked`, each with the person as actor

#### Scenario: Sessions only

- **WHEN** a person signs out everywhere with `{}`
- **THEN** only their web sessions end; their devices and apps keep working; an option that is not a boolean is 400

### Requirement: Web and device credentials

The server SHALL accept only the Better Auth session cookie `align_v2.session_token` (`__Secure-align_v2.session_token`
when hosted) on web routes and only `Bearer alnd_…` device access tokens on device routes, with the pairing routes
`device/authorize`, `device/token` and `device/refresh` taking no token but still refusing browsers.

#### Scenario: Wrong credential kind

- **WHEN** a web route (including `/api/v2/auth/*`) receives an `Authorization` header, or a device route receives an `Origin` or `Cookie` header
- **THEN** the server responds 403 `bearer_not_allowed`, `browser_not_allowed` or `cookies_not_allowed` respectively

#### Scenario: Missing credential or cross-site write

- **WHEN** a device route gets no valid `alnd_` token (missing, unknown, expired or revoked), a web route has no Better Auth session, or a cookie-authenticated write carries an `Origin` other than this server (hosted: not exactly `https://<Host>`, or no `Origin` at all) or a `Sec-Fetch-Site` other than `same-origin` or `none`
- **THEN** the server responds 401 `invalid_token`, 401 `unauthorized`, or 403 `cross_site` (checked before the session is read) respectively

### Requirement: v2 request bodies and error envelope

The server SHALL answer every `/api/v2` error (outside Better Auth's own routes) as `{error:<code>, message}`, accept
only JSON object bodies up to each route's size cap, and reject reserved keys anywhere in a body.

#### Scenario: Body refusals

- **WHEN** a non-empty body is not `application/json`, exceeds the route's cap (declared or streamed), is not a JSON object, or contains a `__proto__`, `constructor` or `prototype` key at any depth
- **THEN** the server responds 415 `unsupported_media_type`, 413 `too_large`, 400 `bad_request`, or 400 `bad_request` respectively, and changes nothing

#### Scenario: Unexpected failure

- **WHEN** a route throws an unexpected error
- **THEN** the response is 500 `{error:"server_error", message:"Server error"}`, and when hosted the log names only the error's name

### Requirement: Local edge in Mode L

The server SHALL, in Mode L, bind `127.0.0.1` on `npm start`, answer only requests whose `Host` is a loopback name
(`localhost`, `127.0.0.1` or `[::1]`, any port), let Better Auth trust only this server's own loopback origins (those three
names on its own `PORT`, default 3100), refuse
cross-origin cookie writes including those from another localhost port, and refuse any browser `Origin` on `/api/mcp`.

#### Scenario: DNS-rebound host

- **WHEN** a Mode L request arrives with `Host: evil.example`
- **THEN** the server responds 421 `Misdirected request: this server answers to localhost only`

#### Scenario: Another local port

- **WHEN** a cookie-authenticated write arrives with `Origin: http://localhost:5555` while `Host` is `localhost:3100`
- **THEN** the server responds 403 `cross_site`, and Better Auth rejects the same origin on its own routes

#### Scenario: Browser calling the MCP endpoint

- **WHEN** a request to `/api/mcp` carries any `Origin` header, in either mode
- **THEN** the server responds 403 without reading its token

### Requirement: Served paths in both modes

The server SHALL redirect `/` to `/app`, serve every path under `/app`, and answer every path under `/api/v2`, in
both modes and without any feature flag.

#### Scenario: Root

- **WHEN** a browser requests `/` on a Mode L or hosted server
- **THEN** the server responds 307 with `Location` ending in `/app`

#### Scenario: Retired paths

- **WHEN** a Mode L client requests `/setup`, `/new`, `/w/<id>`, `/api/session` or `/api/proposals`
- **THEN** the server responds 404

### Requirement: Hosted edge and route allowlist

The server SHALL, when `HOSTED=1`, answer at the request edge 503 when misconfigured, 421 for a `Host` not in `ALIGN_HOSTS`, 403 without `X-Forwarded-Proto: https` or
without `Fly-Client-IP`, and 404 `{"error":"Not found"}` for every path outside `/app*`, `/api/v2/*`, `/api/mcp`,
`/oauth/*`, `/.well-known/*`, `/api/oauth/*`, exactly `/privacy` and `/trust` (the public trust pages), and the
static assets.

#### Scenario: Paths outside the allowlist

- **WHEN** a hosted server receives `GET /api/state`, `POST /api/sessions/events`, `GET /setup`, `GET /trust/security`, `GET /privacy/x` or `GET /SECURITY.md`
- **THEN** it responds 404 `{"error":"Not found"}`

#### Scenario: Public trust pages when hosted

- **WHEN** a hosted server receives `GET /privacy` or `GET /trust` through the edge checks
- **THEN** it serves the page (200) without sign-in

#### Scenario: Edge checks

- **WHEN** a hosted request has `Host: other.example`, or lacks `X-Forwarded-Proto: https`, or lacks `Fly-Client-IP`
- **THEN** the server responds 421 `Misdirected request: this server answers to its own host name only`, 403 `{"error":"Use https"}`, or 403 `{"error":"Use the public address"}` respectively

#### Scenario: No closing date

- **WHEN** a hosted server starts with a past `ALIGN_DELETE_BY` left in its environment
- **THEN** it ignores the setting and serves normally: a hosted server never shuts itself down, and how long data is kept follows the retention schedule

### Requirement: Hosted startup checks

The server SHALL refuse to start when hosted, naming each problem, unless `ALIGN_HOSTS` lists the public host names
(no loopback names), `ALIGN_SECRET` and `BETTER_AUTH_SECRET` each have 32+ characters, `ALIGN_DATA_DIR` is an absolute
path outside the app directory, `ALIGN_PUBLIC_ORIGIN` is a bare `https://host`
origin whose host is in `ALIGN_HOSTS`, sign-in is possible (all three of `ALIGN_EMAIL_API_URL` (https),
`ALIGN_EMAIL_API_KEY` and `ALIGN_EMAIL_FROM` are set, or Google's or GitHub's client id and secret are),
`ALIGN_SESSION_MAX_DAYS`, when set, is a whole number from 1 to 365, `ALIGN_CREATION` is unset or one of `codes`,
`open` and `closed`, each cap that is set (`ALIGN_MAX_WORKSPACES`, `ALIGN_MAX_OWNED_WORKSPACES`, `ALIGN_MAX_MEMBERS`,
`ALIGN_MAX_SESSIONS_PER_DEVICE_DAY`) is a positive whole number, `ALIGN_TURNSTILE_SITE_KEY` and
`ALIGN_TURNSTILE_SECRET_KEY` are set together or not at all, and `ALIGN_TURNSTILE_VERIFY_URL`, when set, is an https
URL; and SHALL log one warning when it starts hosted without the Turnstile keys.

#### Scenario: No way to sign in

- **WHEN** a hosted server starts with none of the email settings and neither provider's id and secret
- **THEN** it refuses to start and names that it needs the email settings or a Google or GitHub client

#### Scenario: Partial or unsafe settings

- **WHEN** a hosted server starts with only some of the three email settings, an `http:` `ALIGN_EMAIL_API_URL`, a Google or GitHub client id without its secret (or the reverse), an `ALIGN_SESSION_MAX_DAYS` that is not a whole number from 1 to 365, `ALIGN_TEST_IDP`, `ALIGN_TEST_NOW`, `ALIGN_TEST_OAUTH_URL` or `ALIGN_LOCAL_OWNER_EMAIL` set, or `ALIGN_PUBLIC=1`
- **THEN** it refuses to start and names each problem; any mode refuses `ALIGN_PUBLIC=1`

#### Scenario: Creation and bot-check settings

- **WHEN** a hosted server starts with `ALIGN_CREATION=invite-only`, `ALIGN_MAX_MEMBERS=0`, only `ALIGN_TURNSTILE_SITE_KEY`, or an `http:` `ALIGN_TURNSTILE_VERIFY_URL`
- **THEN** it refuses to start and names each problem

#### Scenario: No Turnstile keys

- **WHEN** a hosted server starts with every required setting and neither Turnstile key
- **THEN** it starts and logs exactly one warning that sign-in, access requests and workspace creation have no bot check

#### Scenario: Email only

- **WHEN** a hosted server starts with all three email settings and no Google or GitHub settings, and every other check passes
- **THEN** it starts, and sign-in is by email code only

### Requirement: Server data and single server

The server SHALL keep its database (people, sessions, workspaces and everything in them) in one SQLite file (WAL) at
`<ALIGN_DATA_DIR or ./data>/v2/align.sqlite` in a 0700 directory with the file at 0600, generate Better Auth's secret into `.auth-secret` (0600) in that directory in Mode L
when `BETTER_AUTH_SECRET` is unset, migrate the database before serving, and run only one server per data directory.

#### Scenario: Second server

- **WHEN** a second process starts on the same data directory while the pid file `<data>/.pid` names a live process
- **THEN** it exits with `Another Align server (pid <n>) is using <dir>. Stop it first.` and does not serve

#### Scenario: First request during migration

- **WHEN** a request reaches an `/api/v2` route before the database has been opened and migrated
- **THEN** the route waits for the migration to finish and never runs against an unmigrated file

### Requirement: Workspace creation

The server SHALL let a signed-in person create a workspace on `POST /api/v2/workspaces {name, creation_code?}` (name
1 to 100 characters) as its only owner: in Mode L always, and when hosted only through the hosted creation gate.

#### Scenario: Create

- **WHEN** a signed-in person on a Mode L server POSTs `{name:"Acme"}`
- **THEN** the response is 201 `{id:"ws_…", name:"Acme", role:"owner"}`, and the audit records `workspace.created` with them as actor

#### Scenario: Creation rate

- **WHEN** the person creates an 11th workspace within an hour, counting workspaces made with `POST /api/v2/workspaces/sample`
- **THEN** the server responds 429 `rate_limited`

#### Scenario: Mode L ignores the hosted settings

- **WHEN** a Mode L server runs with `ALIGN_CREATION=closed`, every cap set to 1 and both Turnstile keys set
- **THEN** a signed-in person still creates several workspaces and the sample with no code or token, invites past the member cap and shares sessions freely; no page shows a code field, a bot check or a request-access link

### Requirement: Hosted creation gate

The server SHALL, when hosted, decide who may create a workspace (including the sample) by `ALIGN_CREATION`: `codes`
(the default) requires a valid creation code in `creation_code`, except for the first workspace on a server that has
none when the caller's email equals `ALIGN_FIRST_OWNER_EMAIL`; `open` admits any signed-in person; `closed` refuses
everyone with 403 `creation_closed`. Before redeeming a code it SHALL check, in this order, the mode, the global and
per-account caps, the caller's email domain, the code's presence and the Turnstile token, and it SHALL redeem the code in
the same transaction that creates the workspace.

#### Scenario: Code required

- **WHEN** a hosted person in `codes` mode creates a workspace without `creation_code`
- **THEN** the server responds 403 `creation_code_required` with a message that says to request access, and creates nothing

#### Scenario: First owner

- **WHEN** `ALIGN_FIRST_OWNER_EMAIL` signs in on a hosted server that has no workspace and creates one without a code
- **THEN** the response is 201; their next create without a code is 403 `creation_code_required`

#### Scenario: Kill switch

- **WHEN** the operator restarts a hosted server with `ALIGN_CREATION=closed`
- **THEN** every create, with or without a valid code, is 403 `creation_closed`, no code is spent, and `/app` says new workspaces can't be created right now

#### Scenario: Open creation

- **WHEN** a hosted server runs with `ALIGN_CREATION=open`
- **THEN** any signed-in person creates a workspace without a code (the caps, the domain check and the Turnstile token still apply), and no page asks for a code or links to request access

### Requirement: Creation codes

The server SHALL accept a creation code (`alc_` and 32 base32 characters) only once, only before it expires (14 days
after it was made unless the operator chose otherwise), only if it was not revoked and, for a code bound to an email
address, only from a signed-in person whose verified email is that address; it SHALL store only an HMAC of the code
under `ALIGN_SECRET` and record which workspace the code created.

#### Scenario: Code spent

- **WHEN** a person creates a workspace with a valid code and then tries to create another with the same code
- **THEN** the first create is 201 and the code records that workspace; the second is 403 `creation_code_invalid`

#### Scenario: Unusable codes

- **WHEN** a create names a malformed code, a revoked code, an expired code, or a code bound to another address
- **THEN** the server responds 403 `creation_code_invalid` and spends no code

#### Scenario: Nothing in clear

- **WHEN** the database files are searched for a code that was issued
- **THEN** the code is not found in them

### Requirement: Access requests

The server SHALL accept, without sign-in, a same-site `POST /api/v2/access-requests {email, name, company?,
team_size?, use_case, interest}` where `team_size` is one of `1`, `2-10`, `11-50`, `51-200`, `201+`, `use_case` is 1 to
500 characters and `interest` is `try` or `evaluate`, store it with `status` pending and `created_at`, answer 201
`{received:true}` whether or not that address already has a pending request (which it updates), and allow at most 5
requests per client per hour and 3 per email address per day, counted in the database.

#### Scenario: Request stored

- **WHEN** someone signed out submits the form at `/app/request-access`
- **THEN** the request is stored as `ar_…` with the lowercased email, name, company, team size, use, interest, status `pending` and `created_at`, and the answer is 201 `{received:true}`

#### Scenario: Invalid or cross-site request

- **WHEN** the interest is unknown, the email is not an address, the use is empty or longer than 500 characters, the team size is unknown, or the Origin is another site
- **THEN** the server responds 400, or 403 `cross_site`, and stores nothing

#### Scenario: Too many requests

- **WHEN** a fourth request for one address arrives within a day, or a sixth from one client within an hour
- **THEN** the server responds 429 `rate_limited` and stores nothing

### Requirement: Operator script

The repository SHALL provide `scripts/align-admin.mjs` (`npm run admin -- …`), shipped in the hosted image, which runs
against `ALIGN_DATA_DIR` beside the running server and offers `codes create [--email] [--days] [--count]` (each new code
printed once), `codes list` and `codes revoke <id>`, `requests list [--status]`, `requests approve <id> [--days]
[--print]` and `requests decline <id>`, `workspaces list`, `workspaces delete <id> --yes` and `workspaces delete <id>
--purge --yes`, `retention run [--dry-run]` (`scripts/retention.mjs [--dry-run]` is the same command), and the metrics
commands `report [--since] [--json]` and `events record loi_sent|loi_signed` (specified in `metrics`); it SHALL
never print a secret other than a code it has just made, SHALL delete a workspace through the same (soft) deletion
path as the app and purge one through the same purge as the retention job, SHALL run the retention job with the same
code as the server, reading `ALIGN_SESSION_MAX_DAYS` from its environment as the server does, and SHALL refuse a
database whose schema version is not the one it was written for.

#### Scenario: Approving a request

- **WHEN** the operator approves a pending request on a server with the email settings
- **THEN** the script makes a code bound to the request's address, marks the request approved with that code's id, emails the code with a sign-in link through the email API, and prints only the code's id; without the email settings, or with `--print`, it prints the code instead; if the email fails, the code is revoked and the request stays pending

#### Scenario: Listing without secrets or people

- **WHEN** the operator runs `codes list` or `workspaces list`
- **THEN** codes show id, state (live, used, revoked or expired), binding and dates but never a code; workspaces show id, name, created date, when it was deleted (`-` for a live one, a deleted one included until it is purged) and member and owner counts but no person's name or email

#### Scenario: Deleting a workspace

- **WHEN** the operator runs `workspaces delete <id>` without `--yes`, then with it
- **THEN** the first deletes nothing and exits 1; the second deletes the workspace exactly as `DELETE /api/v2/workspaces/{ws}` does (soft: the running server answers 404 for it at once, its connected AI apps are revoked, its owners can restore it for 30 days, and the audit records `workspace.deleted` with no actor); deleting a deleted workspace again exits 1 and points at `--purge`

#### Scenario: Purging a workspace

- **WHEN** the operator runs `workspaces delete <id> --purge`, then `--purge --yes`
- **THEN** the first changes nothing and exits 1; the second deletes every row of the workspace at once, live or deleted, through the retention job's own purge, so it can no longer be restored; an unknown id exits 1

#### Scenario: Retention by hand

- **WHEN** the operator runs `retention run` or `retention run --dry-run` on the server's machine with its environment
- **THEN** the script applies, or reports without changing anything, the same schedule the server runs (see Data retention), with the same `ALIGN_SESSION_MAX_DAYS`

#### Scenario: Hosted secret

- **WHEN** the script runs with `HOSTED=1` but without `ALIGN_SECRET`
- **THEN** it refuses to make or approve codes, since codes made under another key could not be checked by the server

### Requirement: Bot check

The server SHALL, when hosted with both `ALIGN_TURNSTILE_SITE_KEY` and `ALIGN_TURNSTILE_SECRET_KEY` set (never in Mode
L), require a Cloudflare Turnstile token in the `x-captcha-response` header on the email-code send and sign-in routes
(Better Auth's captcha plugin), on `POST /api/v2/access-requests` and on workspace creation, verify each token
server-side with the secret key at Cloudflare's siteverify URL (or `ALIGN_TURNSTILE_VERIFY_URL`), and accept only a
token solved on a host in `ALIGN_HOSTS`; the sign-in, request-access and create-workspace pages SHALL render the widget.

#### Scenario: Email-code routes

- **WHEN** a code is requested, or a code presented, without a token, with a rejected token, or with a token solved on another host
- **THEN** Better Auth responds 400 `MISSING_RESPONSE` or 403 `VERIFICATION_FAILED`, sends nothing and does not count the attempt against the code

#### Scenario: Access requests and creation

- **WHEN** an access request or a create arrives without a token, with a rejected one, or while the verify API is failing
- **THEN** the server responds 400 `captcha_required`, 403 `captcha_failed` or 503 `captcha_unavailable`, and stores or creates nothing

### Requirement: Disposable email domains

The server SHALL, when hosted, refuse workspace creation and access requests from an address whose domain, or any
parent domain of it, is on the vendored CC0 `disposable-email-domains` list (`lib/v2/disposable-domains.json`, which
names its source commit) with 403 `disposable_email`, and SHALL NOT check the list at sign-in or in Mode L.

#### Scenario: Disposable address

- **WHEN** a hosted access request names `temp@mailinator.com` or `temp@x.mailinator.com`, or a person signed in as `temp@mailinator.com` creates a workspace with a valid code
- **THEN** the server responds 403 `disposable_email` and spends no code

#### Scenario: Not at sign-in

- **WHEN** someone invited as `temp@mailinator.com` signs in with an email code
- **THEN** they sign in and can accept the invite

### Requirement: Hosted caps

The server SHALL, when hosted, refuse with 403 and a message that says to contact the operator to raise the limit: a
create once the server holds `ALIGN_MAX_WORKSPACES` live workspaces (default 100) with `workspace_cap`; a create by a
person who already owns `ALIGN_MAX_OWNED_WORKSPACES` (default 2) live workspaces with `owned_workspace_cap`; a new invite once a workspace's
members plus open invites reach `ALIGN_MAX_MEMBERS` (default 25), and accepting an invite once its members reach it,
with `member_cap`; and a new shared session once a device has shared `ALIGN_MAX_SESSIONS_PER_DEVICE_DAY` (default 500)
new sessions in the last 24 hours (counted in the database, so deleting a session gives no slot back) with
`session_cap`. A deleted workspace waiting out its restore window does not count toward the workspace caps, and
restoring one that would pass either cap (for the person restoring it) SHALL be refused with 409 and the same code.
Mode L has none of these caps.

#### Scenario: Workspace caps

- **WHEN** a person who owns 2 workspaces creates another with a valid code, or anyone creates one on a server at its `ALIGN_MAX_WORKSPACES`
- **THEN** the server responds 403 `owned_workspace_cap` or 403 `workspace_cap` respectively, and the code is not spent

#### Scenario: Deleted workspaces and restoring

- **WHEN** an owner at both workspace caps deletes one of their workspaces, creates another with a code, and then restores the deleted one
- **THEN** the create succeeds (the deleted one no longer counts), and the restore is refused with 409 `workspace_cap` while the server is at its cap, or 409 `owned_workspace_cap` while they own the maximum, and succeeds once there is room under both

#### Scenario: Member cap

- **WHEN** a workspace with `ALIGN_MAX_MEMBERS=3` has its owner and 2 open invites and the owner invites a third person
- **THEN** the server responds 403 `member_cap`; accepting one of the open invites still works

#### Scenario: Session cap

- **WHEN** a device with `ALIGN_MAX_SESSIONS_PER_DEVICE_DAY=2` shares a third new session within 24 hours
- **THEN** the server responds 403 `session_cap`, and updating a session the device already shares still works

### Requirement: Workspace rename and deletion

The server SHALL let a workspace owner rename the workspace on `PATCH /api/v2/workspaces/{ws} {name}` and delete it on
`DELETE /api/v2/workspaces/{ws}`, where deletion marks the workspace deleted, makes it unreachable to everyone at once
and revokes every OAuth grant for it, and SHALL let an owner of a deleted workspace with a sign-in from the last 15
minutes restore it on `POST /api/v2/workspaces/{ws}/restore` within 30 days of its deletion.

#### Scenario: Rename

- **WHEN** an owner PATCHes `{name:"Acme Robotics"}`
- **THEN** the response is `{id, name:"Acme Robotics"}` and the audit records `workspace.renamed`; a member gets 403 `owner_only`, a viewer 403 `read_only`

#### Scenario: Delete

- **WHEN** an owner DELETEs the workspace
- **THEN** the server responds 204, the audit records `workspace.deleted`, every later request for it (members, owners, devices granted it, invite links to it) is 404 `not_found` as if it did not exist, it leaves `GET /api/v2/workspaces` and `GET /api/v2/me`, devices keep their grant for it but reach nothing, its OAuth grants are deleted, and its rows stay until the retention job purges them 30 days later

#### Scenario: Restore

- **WHEN** an owner of a workspace deleted fewer than 30 days ago POSTs `.../restore` with a sign-in from the last 15 minutes
- **THEN** the response is 200 `{id, name, role:"owner"}`, the audit records `workspace.restored`, and members and their granted devices reach it again as before (connected AI apps must be connected again); a member who is not an owner, anyone after 30 days, or a purged workspace gets 404 `not_found`, an older sign-in 403 `reauth_required`, a workspace that is not deleted 409 `not_deleted`, and, hosted, a restore that would pass a workspace cap 409 `workspace_cap` or `owned_workspace_cap` (see Hosted caps)

### Requirement: Workspace visibility and roles

The server SHALL decide every workspace action from the caller's workspace role and team roles, answering 404
`not_found` for a workspace the caller is not a member of (or a device was not granted) and 403 with a code for a
visible action the role does not allow.

#### Scenario: Hidden workspace

- **WHEN** a non-member, or a device without a grant for that workspace, requests any route under `/api/v2/workspaces/{ws}`
- **THEN** the server responds 404 `not_found`, the same as for a workspace that does not exist

#### Scenario: Role refusals

- **WHEN** a viewer attempts any change other than leaving, a member attempts an owner-only action (invites, creating teams, member roles and removal, renaming or deleting the workspace, reading the audit trail), or a member who is neither owner nor that team's lead changes a team's membership
- **THEN** the server responds 403 `read_only`, `owner_only` or `not_team_lead` respectively

### Requirement: Workspace and account read views

The server SHALL serve, to a signed-in browser session, the caller's workspaces on `GET /api/v2/workspaces`, one
workspace on `GET /api/v2/workspaces/{ws}`, and the caller's paired devices on `GET /api/v2/devices`, and to either
credential the caller's identity on `GET /api/v2/me`.

#### Scenario: Workspace views

- **WHEN** a member calls `GET /api/v2/workspaces` and `GET /api/v2/workspaces/{ws}`
- **THEN** the responses are `{workspaces:[{id, name, role, teams:[{id, name, role}]}], deleted:[{id, name, deleted_at, restore_until}]}` (`deleted` lists only workspaces the caller owns that can still be restored, newest first, with `restore_until` 30 days after `deleted_at`) and `{workspace:{id, name, created_at}, role, me, members:[{id, name, email, role}], teams:[{id, name, my_role, members:[{id, name, role}]}]}`

#### Scenario: Who am I

- **WHEN** a device token or a browser session calls `GET /api/v2/me`
- **THEN** the response is `{user:{id, name, email}, device, workspaces}`, where `device` is `{id, name}` only for a device token, and for a device `workspaces` lists only the workspaces granted to it while the person is still a member

#### Scenario: Devices list

- **WHEN** a person calls `GET /api/v2/devices`
- **THEN** the response is `{devices:[{id, name, created_at, last_seen_at, revoked_at, revoked_reason, workspaces:[{id, name}]}]}` listing only their own devices

### Requirement: Email-bound invites

The server SHALL let workspace owners create invites on `POST /api/v2/workspaces/{ws}/invites {email, role}`, list them
on `GET`, and withdraw an unaccepted one on `DELETE .../invites/{id}`, each invite being a single-use link valid for 7
days that only the invited email address can accept.

#### Scenario: Creating an invite

- **WHEN** an owner invites a new email address
- **THEN** the response is 201 `{id, email, role, team_id, team_role, path:"/app/invite/<token>", token}` with the email lowercased; an existing member's email is 409 `already_member`, an invalid address 400, and more than 50 invites per workspace per hour 429 `rate_limited`

#### Scenario: Previewing an invite

- **WHEN** a signed-in person calls `GET /api/v2/invites/{token}`
- **THEN** the response is `{workspace:{id, name}, role, team, team_role, email_matches, invited_email}` (`team` is `{id, name}` or null), or 404 `not_found` for an unknown, accepted, withdrawn or expired token

#### Scenario: Accepting an invite

- **WHEN** a signed-in person POSTs `/api/v2/invites/{token}/accept`
- **THEN** they join with the invited role and the response is `{workspace_id, role, team_id}`; another email is 403 `email_mismatch`, an unverified email when hosted 403 `email_unverified`, an existing member 409 `already_member`, and an unknown, accepted or expired token 404 `not_found`

### Requirement: Invites that name a team

The server SHALL accept an optional `team_id` and `team_role` (`lead` or `member`, default `member`) on an invite and,
when the invite is accepted, add the person to that team with that role in the same transaction as the membership.

#### Scenario: Team invite accepted

- **WHEN** an owner invites `bo@example.com` with `{role:"member", team_id:<Product>}` and Bo accepts
- **THEN** Bo is a workspace member and a `member` of the Product team, and the audit records `invite.accepted` with Bo as actor

#### Scenario: Invalid team on an invite

- **WHEN** the invite names a team that is not in this workspace, or a `team_role` other than `lead` or `member`, or a `team_role` without a `team_id`
- **THEN** the server responds 404 `not_found`, 400 `bad_request` or 400 `bad_request` respectively and creates no invite

### Requirement: Teams and team membership

The server SHALL let workspace owners create teams on `POST /api/v2/workspaces/{ws}/teams {name}` (1 to 100
characters), let an owner or the team's lead add, change or remove team members on `.../teams/{team}/members`, and
allow a person in any number of teams, with no team inside another.

#### Scenario: Create a team

- **WHEN** an owner POSTs `{name:"Security"}`
- **THEN** the response is 201 `{id:"pod_…", name:"Security"}` and the audit records `team.created`

#### Scenario: Team members

- **WHEN** an owner or the team's lead POSTs `{user_id, role:"member"}` to `.../teams/{team}/members` or DELETEs `.../teams/{team}/members/{user}`
- **THEN** the member is set (`{team_id, user_id, role}`) or removed (204); a person who is not a workspace member, an unknown team or a missing team member is 404 `not_found`

#### Scenario: Several teams

- **WHEN** an owner adds the same person to the Product and Security teams
- **THEN** both memberships exist, and `GET /api/v2/workspaces/{ws}` lists the person under both teams

### Requirement: Team lead rules

The server SHALL let only a workspace owner make someone a team lead, change a lead's team role, or remove another
person who is a lead, while a lead may add and remove the team's members and remove themselves.

#### Scenario: Lead promoting someone

- **WHEN** a team lead who is not a workspace owner POSTs `{user_id, role:"lead"}`, or changes another lead to `member`, or removes another lead
- **THEN** the server responds 403 `owner_only` and changes nothing

#### Scenario: Lead leaving the team

- **WHEN** a lead DELETEs their own team membership
- **THEN** the server responds 204 and they are no longer in the team

### Requirement: Team naming and pod aliases

The server SHALL call a team "Team" in everything a person or agent sees (UI, API paths and JSON keys, MCP and CLI
text), using JSON keys `team`, `team_id` and `teams`, while storage keeps its `pod` names and ids keep the `pod_`
prefix, and SHALL answer the old `/api/v2/workspaces/{ws}/pods…` paths as aliases of `/teams…`.

#### Scenario: Old path

- **WHEN** a client POSTs `{user_id, role}` to `/api/v2/workspaces/{ws}/pods/{team}/members`
- **THEN** the result and response are exactly those of `/teams/{team}/members`, including the `team_id` key

#### Scenario: Visible words

- **WHEN** a person reads any `/api/v2` response, error message or audit action about teams
- **THEN** it says team (for example `not_team_lead`, `Only a workspace owner can make someone a team lead`, `team.member_set`), never pod; audit rows stored as `pod.*` are shown as `team.*`

### Requirement: Member role changes and removal

The server SHALL let a workspace owner change a member's role on `POST /api/v2/workspaces/{ws}/members/{user} {role}`
and remove a member on `DELETE .../members/{user}`, let any member (viewers included) leave by deleting their own
membership, and on removal or leaving delete the person's team memberships and revoke their device grants and OAuth
grants for that workspace while keeping their goals, sessions and history attributed to them until the retention job
makes them a former member 30 days later; `DELETE .../members/{user}?delete_sessions=1` also deletes the person's
shared sessions in that workspace at once.

#### Scenario: Change a role

- **WHEN** an owner POSTs `{role:"viewer"}` for a member
- **THEN** the response is `{user_id, role:"viewer"}` and the audit records `member.role_changed`; a non-owner gets 403 (`owner_only` or `read_only`) and an unknown person 404 `not_found`

#### Scenario: Remove a member

- **WHEN** an owner DELETEs another member who has a paired device granted this workspace and an approved MCP app for it
- **THEN** the server responds 204, the person is in no team of the workspace, their device gets 404 for the workspace while keeping its other grants, their MCP app's tokens for the workspace stop working, their goals and shared sessions remain under their name, and the audit records `member.removed`

#### Scenario: Remove and delete their sessions now

- **WHEN** an owner DELETEs `.../members/{user}?delete_sessions=1`
- **THEN** the removal happens as above, the person's shared sessions in this workspace (with their epochs, usage, directive deliveries and receipts) are deleted at once so spend totals drop by them, spend already rolled up stays, and the audit also records `member.sessions_deleted`

#### Scenario: Back within 30 days

- **WHEN** a removed person accepts a new invite to the workspace before 30 days have passed
- **THEN** they are a member again under their own name, and the retention job does not make them a former member

#### Scenario: Leave

- **WHEN** a member or viewer DELETEs `.../members/{their own id}`
- **THEN** the server responds 204 with the same effects and the audit records `member.left`; a member removing someone else gets 403 `owner_only`

### Requirement: Last owner protection

The server SHALL refuse, with 409 `last_owner`, any role change, removal or leaving that would leave a workspace with no
owner.

#### Scenario: Only owner leaves

- **WHEN** the workspace's only owner tries to leave, demote themselves, or be removed
- **THEN** the server responds 409 `last_owner` and nothing changes

#### Scenario: Second owner exists

- **WHEN** a workspace has two owners and one of them demotes themselves to member
- **THEN** the change succeeds

### Requirement: Connected apps per workspace

The server SHALL list a workspace's connected MCP apps (OAuth grants, each bound to one person and this workspace) on
`GET /api/v2/workspaces/{ws}/apps` and revoke one on `DELETE /api/v2/workspaces/{ws}/apps/{grant}`, where workspace
owners see and revoke every grant and other members only their own.

#### Scenario: Member revokes their app

- **WHEN** a member DELETEs one of their own grants
- **THEN** the server responds 204, that app's access and refresh tokens stop working, and the audit records `oauth.app_revoked` with the member as actor

#### Scenario: Someone else's grant

- **WHEN** a member who is not an owner lists apps or DELETEs another person's grant
- **THEN** the list holds only their own grants and the DELETE is 404 `not_found`; an owner's DELETE of any grant succeeds

### Requirement: Workspace audit trail

The server SHALL write an audit row naming its actor for every change a person makes to a workspace's settings,
members, invites, teams, goals, alignments, change requests, asks, connected-app revocations and session controls (stop sharing, history
deletion, agent stop and resume), with actor null only for system actions and the row that records an account
deletion, show a former member as `{id:"fm_<n>", name:"Former member #<n>"}`, and serve the newest 200 rows of that
workspace to workspace owners only on `GET /api/v2/workspaces/{ws}/audit`. Device uploads (sharing a session, opening an
epoch, usage and activity) write no audit row, and device pairing and revocation, passkeys added and deleted, and
signing out everywhere are recorded without a workspace, so they never appear in a workspace's audit.

#### Scenario: Reading the audit

- **WHEN** an owner calls `GET /api/v2/workspaces/{ws}/audit`
- **THEN** the response is `{audit:[{at, actor:{id, name}|null, action, object_id}]}`, newest first, at most 200 rows; a member gets 403 `owner_only`, a viewer 403 `read_only`

#### Scenario: Attributed actions

- **WHEN** an owner withdraws an invite, a lead changes a team member, or a person revokes their own device
- **THEN** each writes a row (`invite.withdrawn` and `team.member_set` in the workspace's audit, `device.revoked` with no workspace) whose actor is that person; only automatic events such as revocation for refresh-token reuse have a null actor

#### Scenario: Ask actions in the audit

- **WHEN** a person records, imports, accepts, declines, finishes, reopens, withdraws or mentions an ask
- **THEN** the workspace's audit gets `ask.created`, `ask.imported` (object: the number created and merged), `ask.accepted`, `ask.declined`, `ask.done`, `ask.reopened`, `ask.withdrawn` or `ask.mentioned` with that person as actor and the ask as object; a refused action writes nothing

### Requirement: Device pairing flow

The server SHALL pair a device by a key-bound device-code flow: `POST /api/v2/device/authorize {device_name,
public_key}` (a 32-byte base64url Ed25519 key, name at most 100 characters) returns a code for the person to approve,
and `POST /api/v2/device/token` returns the tokens exactly once after approval.

#### Scenario: Starting a pairing

- **WHEN** the CLI POSTs `/api/v2/device/authorize`
- **THEN** the response is `{device_code, user_code:"XXXX-XXXX", verification_uri:"<origin>/app/device", expires_in:600, interval:5}`, where the user code uses only the letters `BCDFGHJKLMNPQRSTVWXZ`; more than 10 requests per client per hour get 429 `rate_limited`

#### Scenario: Polling before and after a decision

- **WHEN** a device polls with `grant_type` `urn:ietf:params:oauth:grant-type:device_code` and its `device_code`
- **THEN** a pending code answers 400 `authorization_pending`, a denied code 400 `access_denied`, an expired (10-minute) code 400 `expired_token`, an unknown device code 400 `invalid_grant`, another `grant_type` 400 `unsupported_grant_type`, and a poll sooner than the interval 400 `slow_down` with 5 seconds added to the interval

#### Scenario: Tokens once

- **WHEN** a device polls an approved code
- **THEN** the response is `{device_id, access_token:"alnd_…", expires_in:3600, refresh_token:"alnr_…", user:{id, name, email}}` with grants for the approved workspaces the person still belongs to, and the next poll gets 400 `expired_token`; only SHA-256 hashes of the tokens are stored

### Requirement: Device approval, refresh and revocation

The server SHALL let a signed-in person look up a pending code on `GET /api/v2/device/requests/{code}`, approve it for
workspaces they belong to on `POST /api/v2/device/approve {user_code, workspace_ids}` or deny it on
`POST /api/v2/device/deny {user_code}`, rotate refresh tokens on `POST /api/v2/device/refresh` only with an Ed25519
signature from the paired key, and revoke a device on `DELETE /api/v2/devices/self` (its own token) or
`DELETE /api/v2/devices/{id}` (its owner's browser session).

#### Scenario: Approving a code

- **WHEN** a person with a recent sign-in approves a pending, unexpired code (in any letter case, with or without the hyphen)
- **THEN** the response is `{state:"approved"}`; an empty `workspace_ids` is 400 `Choose at least one workspace for this device`, a workspace they are not a member of or an unknown, expired or decided code 404, and more than 20 lookups, or more than 20 decisions, per person in 10 minutes 429 `rate_limited`

#### Scenario: Refresh token reuse

- **WHEN** a device presents, with a valid signature, a refresh token that was already rotated
- **THEN** the server responds 401 `invalid_grant` and revokes the whole device; a bad signature, a timestamp more than 5 minutes off, an expired token or a revoked device also get 401 `invalid_grant`

#### Scenario: Revoking a device

- **WHEN** a device calls `DELETE /api/v2/devices/self`, or its owner calls `DELETE /api/v2/devices/{id}` from the browser
- **THEN** the server responds 204, every token of that device stops working, and the audit records `device.revoked` with the person as actor; another person's device id is 404

### Requirement: Shared session ownership

The server SHALL accept a shared session on `PUT /api/v2/workspaces/{ws}/sessions/{key} {harness, repo_key,
repo_alias?, started_at, title?}` only from a device granted that workspace (members and owners, never viewers), keep
every session private to the device and person that shared it, let that person stop sharing on
`POST .../sessions/{key}/stop-sharing` or hard-delete the history on `DELETE .../sessions/{key}`, and list sessions on
`GET /api/v2/workspaces/{ws}/sessions` as `{mine, all}`.

#### Scenario: Sharing

- **WHEN** a device PUTs a new session key with `harness` `claude-code` or `codex` and a 43-character base64url `repo_key`
- **THEN** the response is `{session_key, state:"shared", current_epoch:null}`; the same key with another harness or repo is 409 `session_conflict`, a stopped session 409 `sharing_stopped`, and a key shared by another person or device 404

#### Scenario: Stop sharing and delete

- **WHEN** the session's person stops sharing, then deletes it
- **THEN** stop-sharing returns `{session_key, state:"stopped"}`, ends the open epoch and refuses later uploads with 409 `sharing_stopped`; the delete returns 204 and removes the session, its epochs, usage, directive deliveries and receipts, so spend totals change

#### Scenario: Session list

- **WHEN** a member calls `GET .../sessions`
- **THEN** `mine` lists their own sessions in full (state, current epoch and goal, governing goal, stop status, conflicts and token totals), and `all` is null except for workspace owners, for whom it lists every non-stopped session's alias, owner, harness, state and stop status, never its title or usage

### Requirement: Binding epochs

The server SHALL let the sharing device open a binding epoch on `POST .../sessions/{key}/epochs {epoch_id, goal_id,
starts_at, root_turn?, cause}`, closing the previous epoch at `starts_at`, only toward a goal the person has authority
to bind (as defined in `goals-and-proposals`).

#### Scenario: Opening an epoch

- **WHEN** a device POSTs `{epoch_id:"ep_…", goal_id|null, starts_at, cause:"manual"|"directive:<dir id>"}`
- **THEN** the response is `{epoch_id, goal_id, goal_version_at_start, starts_at, ends_at:null}` and the previous epoch ends at `starts_at`; the session becomes `shared` again if it was suspended

#### Scenario: Epoch refusals

- **WHEN** the epoch id is reused with other values, `starts_at` is before the open epoch's start or the last epoch's end, `starts_at` is more than 5 minutes ahead or before the session started, the goal cannot be bound, the goal is not active, `cause` names a directive not sent to this session, or sharing stopped
- **THEN** the server responds 409 `epoch_conflict`, 409 `epoch_overlap`, 400, 403 `alignment_required`, 409 `goal_not_active`, 400, or 409 `sharing_stopped` respectively; the same epoch sent again returns it unchanged

### Requirement: Usage upload

The server SHALL accept usage from the sharing device on `POST .../sessions/{key}/usage {rows}` (at most 500 rows and
256 KB), store each row once by its `request_key`, and never overwrite a stored row.

#### Scenario: Usage batch

- **WHEN** a device POSTs rows for its session
- **THEN** the response is `{accepted, duplicates, conflicts}`, where a repeated `request_key` with identical values is a duplicate, and one with other values or a row for an epoch this session does not have is a conflict that is counted on the session and never stored

#### Scenario: Oversized batch

- **WHEN** a batch has 501 rows, or its body exceeds 256 KB
- **THEN** the server responds 413 `too_many_rows`, or 413 `too_large`, and stores nothing

### Requirement: Spend report

The server SHALL report token usage and estimated list cost on
`GET /api/v2/workspaces/{ws}/spend?by=goal|team|session&from&to` (browser session) to every workspace member, viewers
included, counting each request under the goal of the epoch it was uploaded with and never naming a goal or session
the caller may not see.

#### Scenario: Spend by goal

- **WHEN** a member requests spend by goal
- **THEN** the response is `{by, from, to, note, total, unallocated, unpriced_requests, rows}`, `note` says costs are list-price estimates, not a bill, usage in epochs without a goal is `unallocated`, and usage on goals the caller cannot read is one `Private goals` row

#### Scenario: Spend by team and session

- **WHEN** a member requests `by=team` or `by=session`
- **THEN** team rows carry `team:{id, name}` with goals that have no team in one `Goals without a team` row, and session rows name only the caller's own sessions with everyone else's in one `Other people's sessions` row; `by=pod` is accepted as `by=team`, and another `by` or a `from` not before `to` is 400

#### Scenario: Rolled-up spend

- **WHEN** the workspace has sessions the retention job rolled up
- **THEN** their usage counts in `total`, `unallocated` and the goal, team and private rows exactly as before, filtered by `from` and `to` by its UTC day (a day counts when its start is at or after `from` and before `to`), and `by=session` shows it as one `{kind:"rolled_up", label:"Older sessions (rolled up)"}` row; the invariant `total = rows + unallocated` still holds

### Requirement: Activity signals

The server SHALL accept in-flight work signals from a device on `POST /api/v2/workspaces/{ws}/activity {items}` (at
most 200 items and 128 KB; kinds `edit`, `commit`, `task`, `claim`) and serve unexpired ones to devices on
`GET .../activity?after=<seq>` (at most 500, oldest first) only for goals the caller may read and, for unbound
sessions, only the caller's own.

#### Scenario: Posting activity

- **WHEN** a device posts items for its own shared sessions
- **THEN** the response is `{accepted}`; items for sessions it did not share or that are not `shared`, or dated more than 5 minutes ahead or more than 24 hours back, are skipped; an invalid kind, `repo_id`, `path_hash` or a path that is absolute or climbs with `..` is 400; items expire after 24 hours (claims after 1 hour)

#### Scenario: Reading activity

- **WHEN** a device calls `GET .../activity?after=<seq>`
- **THEN** the response is `{cursor, items}`, each item with `seq, session_key, harness, user:{id, name}, mine, goal_id, repo_id, kind, path_hash, path, text, at, expires_at`, leaving out items on goals the caller cannot read and other people's unbound sessions

### Requirement: Asks between teams

The server SHALL store asks of a team on `POST /api/v2/workspaces/{ws}/asks {team_id, text, from_label?, goal_id?,
source:{kind, title?, date}}` (browser session, same-site; workspace owners and members, viewers 403 `read_only`),
with `text` 1..400, `from_label` up to 80, `source.kind` `meeting` (title 1..120 required) or `manual` (title
optional), `source.date` `YYYY-MM-DD`, control characters in people's text replaced by spaces, and an optional
`goal_id` that the person can read (else 404) and that belongs to the team asked (else 400); it SHALL let read an ask
only its requester, the members and leads of the team asked and workspace owners (404 for anyone else), show its goal
as null to a reader who can't read that goal, refuse a 501st open or accepted ask in a workspace (409
`too_many_asks`) and a 61st ask recorded in a workspace in an hour (429 `rate_limited`), and record `first_ask` once
per workspace (`metrics`).

#### Scenario: Record an ask

- **WHEN** a member posts an ask of another team
- **THEN** the response is 201 with the AskView `{id, state:"open", team:{id, name}, goal:{id, title}|null, text, from_label, requester:{id, name}, source:{kind, title, date}, mentions:[], decided_by:null, decided_at:null, created_at, updated_at, waiting_on_me, can:{accept, decline, done, reopen, withdraw, mention}}`

#### Scenario: Who reads an ask

- **WHEN** the requester, a lead, member or viewer of the team asked, a workspace owner, another member, or a member in no team reads `GET .../asks/{id}`
- **THEN** the first five get 200 and the last two 404, and only the first five find it in `GET .../asks`

#### Scenario: Goal checks

- **WHEN** the `goal_id` is another team's goal, or a goal the person can't read
- **THEN** the server responds 400, or 404, and stores nothing

### Requirement: Ask actions

The server SHALL change an ask on `POST /api/v2/workspaces/{ws}/asks/{id}/{action}` (browser session, same-site) only
for a reader of it (404 otherwise) who is not a viewer (403 `read_only`): `accept` and `decline` from `open`, and
`reopen` from `done` or `declined` back to `open`, by a lead of the team asked or a workspace owner (403
`not_team_lead`); `done` from `accepted` by a member or lead of the team asked or a workspace owner (403
`not_in_team`); `withdraw` from `open` or `accepted` by its requester (403 `not_requester`); and `mention {date, text
1..300, source_title 1..120}` on an `open` or `accepted` ask by any owner or member who reads it, at most 10 per ask (409
`too_many_mentions`); any other state is 409 `wrong_state`, and a person gets at most 30 ask actions a minute (429).
Each change records who made it (`decided_by`, `decided_at`), and a mention its author.

#### Scenario: State machine

- **WHEN** the team's lead accepts an open ask, a member marks it done, the lead reopens it and a workspace owner declines it
- **THEN** each answers the AskView in its new state (`accepted`, `done`, `open`, `declined`) with `decided_by` that person, and withdrawing or mentioning the declined ask is 409 `wrong_state`

#### Scenario: Can flags and waiting on me

- **WHEN** a person reads an ask
- **THEN** `can` holds exactly the actions the server would accept from them (all false for a viewer), and `waiting_on_me` is true for an open ask of a team they lead, or an accepted ask of a team they are in, and for a workspace owner outside the team only when the team has no lead (open) or no members (accepted)

### Requirement: Ask import

The server SHALL let workspace owners import asks on `POST /api/v2/workspaces/{ws}/asks/import {asks:[…]}` (members 403
`owner_only`, viewers 403 `read_only`), at most 60 a call, each an ask as in "Asks between teams" plus an optional
`state` (`open`, `accepted`, `done` or `declined`, recorded as decided by the importer) and up to 10 earlier `mentions`,
all validated before anything is stored (400 naming the item); it SHALL append and merge, never replace: an item whose
team, text (ignoring case and runs of spaces) and source date equal an existing ask changes nothing, one whose team and
text match an open or accepted ask with another date becomes a mention of it, and anything else is created, within the
caps of "Asks between teams" (an import that would pass one stores nothing), answering 201 `{created, merged,
unchanged}`.

#### Scenario: Merge on import

- **WHEN** an owner imports an exact duplicate of an ask, the same text on a new date, and two new asks
- **THEN** the response is `{created:2, merged:1, unchanged:1}`, the existing ask gains one mention dated the new date from the item's meeting, and the audit records `ask.imported` with object `3`

#### Scenario: Refused import

- **WHEN** an import has 61 items, or one invalid item among valid ones
- **THEN** the server responds 400 and stores nothing

### Requirement: Asks feed

The server SHALL serve the asks a person reads on `GET /api/v2/workspaces/{ws}/asks?state=&team_id=&limit=` to a
browser session or a device token with a grant for the workspace, as `{version, asks:[AskView]}` with an `ETag` of the
version and 304 with no body for a matching `If-None-Match`, where `state` is one state or a comma-separated list (else
400), `team_id` keeps one team's asks (a malformed id is 400), `limit` is 1..500 (default 500), and the order is the
person's own (their teams' asks and the asks they recorded) first, then open, accepted and closed, then the newest
source date.

#### Scenario: Accepted asks of a team for the agent

- **WHEN** a device asks for `?state=accepted&team_id=<team>` and then again with the `ETag` it got
- **THEN** the first response holds only that team's accepted asks the person reads and the second is 304; a device gets exactly what the same person's browser gets

### Requirement: Goal activity counts

The server SHALL serve `GET /api/v2/workspaces/{ws}/goals/{goal}/activity` (browser session) to readers of the goal
(404 otherwise) as `{window_days:14, sessions, active_now, by_harness:{claude-code, codex}, last_activity_at, detail}`,
counting the distinct shared sessions with an epoch bound to the goal (or governed by it) that overlaps the last 14
days, of those the ones shared, with the agent not stopped, still on the goal and with usage or a binding in the last
90 minutes (`active_now`), and the latest usage, epoch start or work signal on the goal; `detail` SHALL be
`{files, files_hidden, mine}` (the top 4 repo-relative paths of unexpired work signals on the goal, the number of
distinct path hashes with no path, and the person's own counted sessions with harness, state and last activity) only
for the goal's owner, members and leads of its team and workspace owners, else null; the response SHALL never hold
prompts, replies, task labels, commit subjects, claim reasons, session titles, tokens or cost.

#### Scenario: Counts from bindings

- **WHEN** two sessions are bound to the goal, a Claude Code one with usage 30 minutes ago and a Codex one with usage 3 hours ago, and a third was bound to it only 20 to 15 days ago
- **THEN** a reader gets `sessions:2, active_now:1, by_harness:{claude-code:1, codex:1}`; stopping the first session's agent makes `active_now` 0

#### Scenario: Detail only for the goal's team

- **WHEN** a member of the goal's team and a member of another team read the activity of a workspace-visible team goal with work signals
- **THEN** the first gets the files, the hidden count and their own sessions; the second gets the counts with `detail:null`; neither response holds the commit subjects, task labels or claim reasons those signals carried

### Requirement: Account deletion

The server SHALL let a signed-in person with a sign-in from the last 15 minutes delete their own account on
`DELETE /api/v2/me {email}` (browser session, same-site), where `email` is the account's email in any case, and SHALL
in one transaction end every membership the way member removal does, delete (as a workspace deletion) each workspace
where they were the only member, replace their identity with "Former member #n" in every workspace's rows at once,
delete their devices, pairing requests, Better Auth sessions, linked accounts, passkeys (and when each was last used),
their dismissal of the add-a-passkey prompt, codes, access requests, unused creation codes bound to their email, the
durable rate-limit counters keyed by their email and the user row, clear their email and id from used creation codes
and their actor hash from product events (`metrics`), and keep the rows other people rely on (goals, change requests
with the evidence links they added, alignments, sessions and their spend, asks they recorded or decided, the mentions
they added and their value reports) without their name or email.

#### Scenario: Delete my account

- **WHEN** a member with goals, a change request, a paired device, shared sessions with usage and a passkey, who once signed out everywhere and dismissed the passkey prompt, and who has an access request and creation codes bound to their email, DELETEs `/api/v2/me` with their email
- **THEN** the response is 204, their cookie and device tokens are refused with 401, their goals, change requests, sessions, asks (as requester or decider), mentions and value reports show `{id:"fm_<n>", name:"Former member #<n>"}`, their sessions keep their usage but no device, spend totals are unchanged, no row in any table holds their id or email (a used creation code stays, with neither), no rate-limit counter is keyed by their email, each workspace's audit records `member.account_deleted` by the former member, and one audit row with no workspace, actor or object records `account.deleted`

#### Scenario: Only owner with other members

- **WHEN** the person is the only owner of a workspace (not deleted) that has other members
- **THEN** the server responds 409 `last_owner` naming the workspace, and nothing changes

#### Scenario: Only member

- **WHEN** the person is the only member of a workspace
- **THEN** that workspace is deleted with the account (soft, as an owner's deletion), nobody can restore it, and the retention job purges it 30 days later

#### Scenario: Refusals

- **WHEN** the sign-in is older than 15 minutes, the typed `email` is not the account's, the request is cross-site, or it carries a device token
- **THEN** the server responds 403 `reauth_required`, 400, 403 `cross_site`, or 403 `bearer_not_allowed` respectively, and nothing changes

### Requirement: Data retention

The server SHALL apply the retention schedule published in `docs/RETENTION.md` with an idempotent job, `runRetention`
in `lib/v2/retention-core.mts`, that runs at every server start and every 24 hours (never during a build) and from
`node scripts/align-admin.mjs retention run [--dry-run]` (or its alias `node scripts/retention.mjs [--dry-run]`), each
step in its own transaction, logging counts only; it purges a workspace with the same function as the operator's
`workspaces delete --purge`, deletes product events (`v2_events`, specified in `metrics`) after 13 months, deletes
asks that are `done`, `declined` or `withdrawn` with their mentions 13 months after their last change (`asks_deleted`),
and deletes value reports on approved change requests 13 months after their last change
(`value_reports_deleted`).

#### Scenario: Deleted workspaces

- **WHEN** the job runs 30 days or more after a workspace was deleted
- **THEN** every row of the workspace is deleted (its audit rows, roll-ups, former members, change-request evidence, asks and their mentions, value reports and devices' grants included, and pairing requests and the creation code that made it forget it, and its content-free product events carry a random `wsx_` id instead of its id), so no row anywhere mentions it and restoring it is 404

#### Scenario: Session roll-up

- **WHEN** the job runs more than 13 months after a shared session ended (its `stopped_at`, or else its last activity: its last update, usage upload or epoch)
- **THEN** its usage is added to `v2_spend_rollups` per workspace, goal (none for unbound), UTC day of the request, model and basis, with request, token and estimated-cost sums and no person or session, and the session, its epochs, usage, alignment links, directive deliveries and receipts are deleted, as are directives left with no recipient; running the job again adds nothing

#### Scenario: Former members

- **WHEN** the job runs 30 days or more after a person left or was removed and they are not a member again
- **THEN** in that workspace every row naming them (goals and goal versions, alignments, their revisions, approval requirements and approvals, sessions, activity, change requests, their revisions and the evidence links they added, asks they recorded or last decided and the mentions they added, their value reports, invites they created, directive goal snapshots, the workspace's creator and its audit rows) names `fm_<n>` instead, numbered in the order people left and stable in that workspace, their sessions no longer point at a device, invites to or accepted by them are deleted, that workspace's product events no longer carry their actor hash (`metrics`), nothing records which person `fm_<n>` was, and their account itself is untouched

#### Scenario: Audit log

- **WHEN** the job runs
- **THEN** audit rows older than one year are deleted, and younger ones are kept

#### Scenario: Codes, sign-in sessions, activity and invites

- **WHEN** the job runs
- **THEN** expired Better Auth verification values (email codes), Better Auth sessions that have expired or are older than the absolute cap (`ALIGN_SESSION_MAX_DAYS`) and expired activity signals are deleted, and invites still pending 7 days after their expiry are deleted

#### Scenario: Access requests

- **WHEN** the job runs 13 months after an access request was approved or declined, or 13 months after a still-pending request was made
- **THEN** that request is deleted (email, name, company, team size, use and interest); a request decided more recently stays, and a creation code made for it stays as it was

#### Scenario: Product events

- **WHEN** the job runs
- **THEN** product events older than 13 months are deleted and younger ones are kept

#### Scenario: Closed asks and value reports

- **WHEN** the job runs 12 months, and then 13 months and 2 days, after asks in every state and a value report last changed
- **THEN** the first run deletes nothing; the second deletes the `done`, `declined` and `withdrawn` asks with their mentions (`asks_deleted` 3) and the value report (`value_reports_deleted`), keeps the `open` and `accepted` asks, and a dry run before it reports the same counts and changes nothing

#### Scenario: Operator run and dry run

- **WHEN** an operator runs `node scripts/align-admin.mjs retention run` or `node scripts/retention.mjs` (reading `ALIGN_DATA_DIR`, default `./data`, and `ALIGN_SESSION_MAX_DAYS` from the server's environment) or adds `--dry-run`
- **THEN** it prints `Did` or `Would` with the time it ran as and one count per rule, then the same as one JSON line; a dry run does every step in one transaction and rolls it back, so it changes nothing; a missing database, or one whose schema version is not this version's, is refused with exit status 1

#### Scenario: Test clock

- **WHEN** `ALIGN_TEST_NOW` holds an ISO time and `ALIGN_TEST_IDP=1` is set (never hosted)
- **THEN** the job, in the server and in the script, runs as of that time; without `ALIGN_TEST_IDP=1` the setting is ignored, and a hosted server refuses to start with it

### Requirement: Account and workspace rate limits

The server SHALL limit v2 requests and email-code sends with in-memory sliding windows (at most 10,000 keys, oldest
evicted first) and, where a limit must survive a restart (hosted email-code sends per address, access requests, new
shared sessions per device), with windows counted in the database; it SHALL key clients by `Fly-Client-IP` when hosted
(IPv6 by its /64) and as one local client in Mode L, and answer a v2 limit with 429 `rate_limited`; Better Auth's own
per-path limits apply only when hosted, since Mode L turns off its IP tracking, and are then counted in the database
(`ba_rate_limit`).

#### Scenario: Better Auth limits

- **WHEN** a hosted client exceeds 3 requests per minute to `/api/v2/auth/email-otp/send-verification-otp`, 10 to `/sign-in/email-otp`, `/sign-in/email` or `/sign-up/email`, 20 to `/sign-in/social`, or 100 per minute elsewhere under `/api/v2/auth`, including across a server restart
- **THEN** Better Auth refuses the request with 429; a Mode L server applies none of these, only the email-code send limits and the v2 limits

#### Scenario: v2 limits

- **WHEN** a person creates an 11th workspace in an hour, a workspace gets a 51st invite in an hour, a client starts an 11th device pairing in an hour, or a person makes a 21st device-code lookup, or a 21st approve-or-deny decision, in 10 minutes (lookups and decisions are counted separately)
- **THEN** the server responds 429 `rate_limited` and does nothing else

## Open questions

- SSO (OIDC or SAML) and SCIM are out of scope and offered on request: which comes first, and whether to build it
  on Better Auth or buy it, waits for the first deal that names it.
- Unlinking a Google or GitHub account is out of scope (there is no control on `/app/account`, and Better Auth's `/unlink-account` is off); should a person be able to unlink a provider while another sign-in method remains?
- Removing or leaving keeps a person's goals and sessions (as a former member after 30 days). Their open alignments, change requests and pending approvals, and goals they own that others depend on, are not reassigned; whether an owner can transfer goal ownership is not decided.
- The retention periods are fixed in code (`lib/v2/retention-core.mts`); a per-workspace setting (for example a shorter audit log or longer spend history) waits for a customer who needs it.

## Sources

- proxy.ts
- instrumentation.ts
- package.json
- lib/config.ts
- lib/startup.ts
- lib/http.ts
- lib/secret.ts
- lib/ratelimit.ts
- lib/oauth/grants.ts
- lib/v2/config.ts
- lib/v2/auth.ts
- lib/v2/mail.ts
- lib/v2/local-owner.ts
- lib/v2/http.ts
- lib/v2/limits.ts
- lib/v2/errors.ts
- lib/v2/ids.ts
- lib/v2/init.ts
- lib/v2/db.ts
- lib/v2/policy.ts
- lib/v2/validate.ts
- lib/v2/workspaces.ts
- lib/v2/account.ts
- lib/v2/core.mts
- lib/v2/creation.ts
- lib/v2/access.ts
- lib/v2/captcha.ts
- lib/v2/disposable.ts
- lib/v2/disposable-domains.json
- scripts/align-admin.mjs
- Dockerfile
- app/api/v2/access-requests/route.ts
- app/api/v2/workspaces/sample/route.ts
- lib/v2/lifecycle.ts
- lib/v2/retention.ts
- lib/v2/retention-core.mts
- scripts/retention.mjs
- docs/RETENTION.md
- fly.toml
- lib/v2/devices.ts
- lib/v2/sessions.ts
- lib/v2/activity.ts
- lib/v2/spend.ts
- scripts/sign-in-link.mjs
- docs/v2/WIRE.md
- docs/HOSTING.md
- app/page.tsx
- app/app/sign-in/page.tsx
- app/app/account/page.tsx
- app/api/v2/auth/[...all]/route.ts
- app/api/v2/me/route.ts
- app/api/v2/workspaces/route.ts
- app/api/v2/workspaces/[ws]/route.ts
- app/api/v2/workspaces/[ws]/restore/route.ts
- app/api/v2/workspaces/[ws]/audit/route.ts
- app/api/v2/workspaces/[ws]/apps/route.ts
- app/api/v2/workspaces/[ws]/apps/[grant]/route.ts
- app/api/v2/workspaces/[ws]/members/[user]/route.ts
- app/api/v2/workspaces/[ws]/invites/route.ts
- app/api/v2/workspaces/[ws]/invites/[id]/route.ts
- app/api/v2/invites/[token]/route.ts
- app/api/v2/invites/[token]/accept/route.ts
- app/api/v2/workspaces/[ws]/teams/route.ts
- app/api/v2/workspaces/[ws]/teams/[team]/members/route.ts
- app/api/v2/workspaces/[ws]/teams/[team]/members/[user]/route.ts
- app/api/v2/workspaces/[ws]/pods/route.ts
- app/api/v2/workspaces/[ws]/pods/[pod]/members/route.ts
- app/api/v2/workspaces/[ws]/pods/[pod]/members/[user]/route.ts
- app/api/v2/device/authorize/route.ts
- app/api/v2/device/token/route.ts
- app/api/v2/device/approve/route.ts
- app/api/v2/device/deny/route.ts
- app/api/v2/device/refresh/route.ts
- app/api/v2/device/requests/[code]/route.ts
- app/api/v2/devices/route.ts
- app/api/v2/devices/self/route.ts
- app/api/v2/devices/[id]/route.ts
- app/api/v2/account/passkeys/route.ts
- app/api/v2/account/passkeys/[id]/route.ts
- app/api/v2/account/passkey-prompt/route.ts
- app/api/v2/account/sign-out-everywhere/route.ts
- app/api/v2/workspaces/[ws]/sessions/route.ts
- app/api/v2/workspaces/[ws]/sessions/[key]/route.ts
- app/api/v2/workspaces/[ws]/sessions/[key]/epochs/route.ts
- app/api/v2/workspaces/[ws]/sessions/[key]/usage/route.ts
- app/api/v2/workspaces/[ws]/sessions/[key]/stop-sharing/route.ts
- app/api/v2/workspaces/[ws]/spend/route.ts
- app/api/v2/workspaces/[ws]/activity/route.ts
- lib/v2/asks.ts
- lib/v2/goal-activity.ts
- app/api/v2/workspaces/[ws]/asks/route.ts
- app/api/v2/workspaces/[ws]/asks/import/route.ts
- app/api/v2/workspaces/[ws]/asks/[id]/route.ts
- app/api/v2/workspaces/[ws]/asks/[id]/[action]/route.ts
- app/api/v2/workspaces/[ws]/goals/[goal]/activity/route.ts
