# Security questionnaire answers

> Prepared 2026-10-30, for review before it is sent or published. These answer common questions from CAIQ-Lite and
> VSA Core style questionnaires about hosted Align, each with a pointer to where it is shown. "No" means no.
> Answers marked [CONFIRM] depend on account settings outside this repository and must be checked before they are
> sent. [LEGAL ENTITY] publishes these answers; questions go to [SECURITY CONTACT EMAIL].

The pointers name sections of the [security overview](security-overview.md), the [privacy policy](privacy-policy.md),
the [subprocessor list](subprocessors.md), the [retention schedule](../RETENTION.md) and the [DPA note](dpa.md).

## Governance and assurance

| # | Question | Answer | Detail |
| --- | --- | --- | --- |
| 1 | Do you hold a SOC 2 report or ISO 27001 certification? | No | Neither yet. A SOC 2 Type I would start when a customer requires it. Security overview, "Not yet". |
| 2 | Has an independent penetration test been performed? | No | Not yet. Security overview, "Not yet". |
| 3 | Do you have documented security policies? | Partial | This answer set, the security overview, the retention schedule, the privacy policy and the DPA. No separate policy set. |
| 4 | Is someone accountable for security? | Yes | [LEGAL ENTITY]; security reports go to [SECURITY CONTACT EMAIL]. |
| 5 | Do staff have background checks and security training? | No | No formal program: [CONFIRM]. |
| 6 | Do you have a vulnerability disclosure process? | Yes | `SECURITY.md` and [SECURITY CONTACT EMAIL]. No bug bounty. |

## Data

| # | Question | Answer | Detail |
| --- | --- | --- | --- |
| 7 | Do you have an inventory of the customer data you hold? | Yes | Privacy policy, "What we collect"; security overview, "What Align stores". |
| 8 | Do you store customer source code, prompts or AI conversations? | No | The server stores no prompt text, tool output, messages, code or file contents. <!-- docs/RETENTION.md; lib/v2/db.ts --> |
| 9 | Do you process special categories of personal data? | No | Not by design. Align holds account details, workspace structure and usage metadata. |
| 10 | Is customer data used to train AI models? | No | Align's server calls no AI model provider and trains no model. Subprocessors, "Not subprocessors". |
| 11 | Is there a published retention schedule? | Yes | [RETENTION.md](../RETENTION.md), applied by a daily job. |
| 12 | Can customers delete their data? | Yes | People delete their accounts in the app; owners delete workspaces (30-day restore, then purged; gone from snapshots within 38 days). The operator can purge a workspace at once on request. |
| 13 | Is customer data logically separated between customers? | Yes | Workspace data is keyed by workspace, and every request is authorized against the caller's membership in one policy module; a workspace the caller can't see answers 404. <!-- lib/v2/policy.ts --> |
| 14 | Is customer data stored in a known location? | Yes | United States: one Fly.io machine and volume in region `sjc` (San Jose, California). No choice of region yet. |

## Identity and access

| # | Question | Answer | Detail |
| --- | --- | --- | --- |
| 15 | Does the product support SSO (SAML or OIDC)? | No | Google and GitHub sign-in are supported; enterprise SSO is available on request. |
| 16 | Does the product support SCIM provisioning? | No | Available on request. |
| 17 | Does the product support MFA or phishing-resistant sign-in? | Partial | Passkeys (WebAuthn) are supported and phishing-resistant. MFA cannot be required per workspace yet. |
| 18 | Does the product store passwords? | No | Sign-in is by email code, Google, GitHub or passkey. |
| 19 | Are sessions limited in time? | Yes | 7 days from last use, never more than 30 days from sign-in; sign out everywhere. Security overview, "Signing in". |
| 20 | Do sensitive actions require re-authentication? | Yes | A sign-in from the last 15 minutes for device and app approval, role changes, removal, deletion, passkeys and more. |
| 21 | Is access role-based with least privilege? | Yes | Workspace roles (owner, member, viewer), team roles (lead, member) and goal visibility (private, team, workspace). |
| 22 | Is access removed promptly when someone leaves? | Yes | Removal ends workspace access, team places, device access and connected apps at once. <!-- lib/v2/lifecycle.ts --> |
| 23 | Is production access restricted and protected by MFA? | Partial | Production is reached only through the Fly.io account (`fly ssh console`, `fly secrets`). MFA on the Fly.io and GitHub accounts: [CONFIRM]. |

## Encryption and secrets

| # | Question | Answer | Detail |
| --- | --- | --- | --- |
| 24 | Is data encrypted in transit? | Yes | HTTPS at Fly's edge, with plain HTTP redirected; calls to the email API and Turnstile are HTTPS. No HSTS header yet. |
| 25 | Is data encrypted at rest? | Yes | By Fly.io: volumes are encrypted at rest by default (Fly's control). In the application, Google and GitHub access and refresh tokens are also encrypted (XChaCha20-Poly1305); nothing else is encrypted at the application level. |
| 26 | Are credentials and tokens stored hashed? | Partial | Email codes, device tokens, refresh tokens, invite links and creation codes are stored only as hashes. Google and GitHub access and refresh tokens from sign-in are stored encrypted, though Align does not use them. Browser session tokens are stored as issued (Better Auth's default), and so is a Google ID token. |
| 27 | Are secrets kept out of source code? | Yes | Set with `fly secrets`; the image is built from an allowlisted context. |
| 28 | Are customer-managed encryption keys supported? | No | |

## Application security

| # | Question | Answer | Detail |
| --- | --- | --- | --- |
| 29 | Are requests protected against cross-site request forgery? | Yes | Cookie-authenticated writes must carry the server's exact `Origin`; cookies are `SameSite=Lax`. |
| 30 | Is there rate limiting and abuse protection? | Yes | Durable limits on sign-in codes, limits on creation, invites and pairing, caps, a disposable-domain block, and Cloudflare Turnstile when enabled. |
| 31 | Are dependencies locked and tracked? | Partial | `package-lock.json`, with the sign-in library pinned exactly; no automated dependency scanning yet. |
| 32 | Is code tested before release? | Partial | Integration tests start real servers and cover sign-in, authorization, the hosted edge and connected apps; they are run by developers, not yet in CI. |
| 33 | Is the access of connected AI apps limited? | Yes | Read one workspace, as the person who connected them, through five read-only tools. With the separate `changes:evidence` scope an app may also add agent-reported evidence links. |
| 34 | Are AI-agent prompt-injection risks addressed? | Partial | Text written by people is marked untrusted for AI apps; Align sends agents only facts and an enforced stop, and never wakes an idle agent. |

## Operations, logging and resilience

| # | Question | Answer | Detail |
| --- | --- | --- | --- |
| 35 | Are security events logged? | Yes | A per-workspace audit log (who, what, when), kept 1 year and readable by owners; it records approvals made without evidence. |
| 36 | Do logs avoid personal and secret data? | Yes | When hosted, the server logs no request body, path, address, email or code. |
| 37 | Are there backups? | Yes | Daily Fly.io volume snapshots, kept 7 days. No off-site backups. |
| 38 | Is there high availability or a disaster recovery plan? | No | One machine in one region, no standby; recovery is a restore from the latest snapshot. |
| 39 | Is there monitoring and alerting? | Partial | Fly checks the server's health every 30 seconds. No alerting on top of it yet: [CONFIRM]. |

## Incidents, vendors and privacy

| # | Question | Answer | Detail |
| --- | --- | --- | --- |
| 40 | Do you notify customers of a personal data breach? | Yes | Within 72 hours of becoming aware, under the DPA. No written incident runbook yet. |
| 41 | Do you publish your subprocessors and give notice of changes? | Yes | [Subprocessors](subprocessors.md); 30 days' notice with a right to object. |
| 42 | Do you offer a DPA with Standard Contractual Clauses? | Yes | The Common Paper DPA with the 2021 EU SCCs and the UK Addendum. [DPA note](dpa.md). |
| 43 | Do you use third-party analytics or advertising trackers? | No | Product events are content-free and kept in Align's own database for 13 months, for the operator only. |
| 44 | Can the product run without sending data to you? | Yes | Local mode keeps everything on the person's own machine. |
