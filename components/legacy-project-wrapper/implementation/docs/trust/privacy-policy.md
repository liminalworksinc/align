# Privacy policy

> **Draft for counsel review.** Prepared 2026-10-30 from the code and configuration of Align. It is not legal advice
> and is not yet in force. The bracketed placeholders are filled in when it is published.

This policy explains what personal data Align collects, why, how long it is kept, who else handles it, and the
choices and rights you have. "Align", "we" and "us" mean [LEGAL ENTITY], [ADDRESS]. Write to us at
[PRIVACY CONTACT EMAIL].

<!-- Counsel: decide whether an EU (GDPR Art. 27) or UK representative is needed, and add it here. -->

## Our two roles

- **Controller** for your account, for this website and its sign-in, for the request-access form, for security and
  abuse prevention, and for product events. We decide why and how that data is used, and this policy covers it.
- **Processor** for workspace data: the goals, members, teams, change requests, shared sessions and everything else
  people put in a workspace. We process it on behalf of the organization the workspace belongs to (our customer),
  under our agreement with them and the [data processing agreement](dpa.md). That organization's own privacy notice
  governs it; we help them answer requests about it.
- **Local mode.** Align can run on your own computer instead of on our servers. Then everything stays on your
  computer, and we receive none of it.

## What we collect

| Data | What it is | Where it comes from |
| --- | --- | --- |
| Account | Your email address and name; if you sign in with Google or GitHub, the provider's account id, your profile picture address and the tokens the provider issued at sign-in (kept by our sign-in software, the access and refresh tokens encrypted; we do not use them afterwards). If you sign in with an email code and give no name, your name starts as the part of your email before the @ | You, Google or GitHub <!-- lib/v2/auth.ts; Better Auth ba_user, ba_account --> |
| Passkeys | Each passkey's public key, its name, when it was added and when it was last used, and whether you dismissed the "add a passkey" prompt | You <!-- lib/v2/account.ts --> |
| Sign-in sessions | A session token in a cookie and, on our servers, your IP address and browser's user agent | Your browser <!-- docs/RETENTION.md --> |
| Email sign-in codes | A hash of each code, for 5 minutes | Us <!-- lib/v2/auth.ts --> |
| Devices | The name you give a computer that runs the `align` agent, its public key, when it was last seen, and hashes of its tokens | You <!-- lib/v2/devices.ts --> |
| Connected AI apps | For each app you connect: its name and return address as it gives them, the workspace, when you connected it and last used it, a hash of its refresh token, and the scopes you granted | You and the app <!-- lib/oauth/grants.ts --> |
| Workspace data (we are processor) | Workspace name, members and their roles, teams, invites (the invitee's email), goals and their versions, alignments, change requests with their notes and decisions, evidence links on change requests, labelled self-reported or agent-reported, and goal snapshots Align computes, directives, and the audit log | People in the workspace <!-- lib/v2/db.ts --> |
| Shared sessions (we are processor) | For each agent session a person chooses to share: which agent it was (Claude Code or Codex), a hashed repository key, an optional repository alias, times, state, the goal it works toward, and token usage with estimated cost | The `align` agent on the person's computer <!-- docs/RETENTION.md --> |
| Work signals (we are processor) | For 24 hours: hashes of files a shared session touched, and, only if the person turns on "share work signals", file paths and short text such as a task or commit title | The `align` agent <!-- lib/v2/activity.ts --> |
| Access requests | Email, name, company, team size, what you want to use Align for, and your interest (try or evaluate) | You, on the request-access form <!-- app/app/request-access/view.tsx --> |
| Creation codes | A keyed hash of each code, the email it is for, its dates, and the workspace it created | Us <!-- lib/v2/db.ts v2_creation_codes --> |
| Abuse prevention | Rate-limit counters keyed by a keyed hash of an email address or network address; when the bot check is on, what Cloudflare Turnstile collects in your browser and your IP address | Your browser <!-- lib/v2/limits.ts; lib/v2/captcha.ts --> |
| Product events | An event name (such as "workspace created" or "first session shared"), the workspace, a keyed hash that stands for the person, the time, and a few allowlisted properties such as the interest chosen on the request form. Never an email, name, title, address or token | Our server |
| Messages we send | Sign-in codes and creation codes, sent to your email address | Us |

**What we never collect on our servers:** the prompts you or your colleagues write to coding agents, the agents'
replies and tool output, your code and file contents, or a session's title. **Cookies:** only the ones needed to
sign in: your session cookie and short-lived cookies set during a Google, GitHub or passkey sign-in. We use no
analytics, advertising or tracking cookies and no third-party analytics.

## Why we use it, and our legal bases

| Purpose | Data | Legal basis (EU and UK GDPR) |
| --- | --- | --- |
| Create your account, sign you in, keep you signed in | Account, passkeys, sessions, codes, devices | Contract |
| Provide workspaces to our customers | Workspace data, shared sessions, work signals, connected apps | Contract with our customer (as processor, on their instructions) |
| Answer a request for access and send a creation code | Access requests, creation codes | Steps before a contract, at your request; legitimate interests in choosing whom to onboard |
| Keep Align secure and stop abuse | Sessions (IP address, user agent), rate-limit counters, the bot check, the audit log | Legitimate interests in security, and the customer's interest in an audit trail |
| Understand whether people get value from Align, in aggregate | Product events, which hold no content and no direct identifiers | Legitimate interests in improving the product |
| Meet legal obligations | Any of the above, as required | Legal obligation |

We do not sell personal data, share it for advertising, or use it to train AI models. Align's server sends no data to
any AI model provider.

## Who else handles it

- **Our subprocessors**: Fly.io (hosting), our email provider (Resend in the default configuration) and, when the bot
  check is on, Cloudflare Turnstile. See the [subprocessor list](subprocessors.md).
- **Google and GitHub**, if you choose to sign in with them.
- **People in your workspace**, according to their role and the visibility of each goal.
- **AI apps you connect**, which read one workspace as you, with your permissions. You choose them, and their makers
  handle what they read under their own terms.
- **Authorities**, when the law requires it, and a successor if [LEGAL ENTITY] is merged or sold, under this policy.

## How long we keep it

Our full retention schedule is published at [RETENTION.md](../RETENTION.md) and applied by a daily job. In short:

- Sign-in sessions: 7 days from last use, never more than 30 days from sign-in. Email codes: 5 minutes.
- Shared session details: 13 months after the session ends, then only totals with no person attached.
- Work signals: 24 hours.
- Workspace audit log: 1 year.
- People who leave a workspace: shown as "Former member" there after 30 days.
- A deleted workspace: restorable for 30 days, then deleted, and gone from our backups within 38 days.
- Access requests: deleted 13 months after we approve or decline them, or 13 months after they were made if still
  pending.
- Product events: 13 months.
- Your account: until you delete it.
- Backups: daily snapshots of our database, each kept 7 days.

## Your rights

You can ask us for a copy of your personal data, to correct it, to delete it, to restrict or object to its use, and
to receive it in a portable form; where we rely on consent, you can withdraw it. You can also complain to your data
protection authority.

- **Delete your account yourself** at `/app/account` (it asks you to sign in again first). The account, its devices,
  sessions, passkeys and sign-in methods are deleted at once, and your name is replaced with "Former member" in every
  workspace you belonged to. Your access requests are deleted with it. If you are the only owner of a workspace that
  has other members, make someone else an owner or delete the workspace first. <!-- lib/v2/account.ts deleteAccount -->
- **Everything else:** email [PRIVACY CONTACT EMAIL]. We answer within one month.
- **Workspace data:** ask the organization that owns the workspace; we will help them answer.

If you live in California, you have similar rights to know, delete and correct, and we do not sell or share your
personal information as California law defines those terms.

## International transfers

Hosted Align runs in the United States (Fly.io region `sjc`), and our subprocessors are in the United States. When we
transfer personal data from the EEA, the UK or Switzerland, we rely on the European Commission's 2021 Standard
Contractual Clauses, with the UK Addendum and the Swiss adjustments, as the [DPA](dpa.md) sets out.

## Security

How we protect data is described in our [security overview](security-overview.md).

## Children

Align is a tool for work. It is not meant for anyone under 16, and we do not knowingly collect their data. If you
think a child has given us personal data, write to [PRIVACY CONTACT EMAIL] and we will delete it.

## Changes to this policy

We will post any change here with a new date. If a change matters to how we use your data, we will tell account
holders by email before it takes effect.

## Contact

[LEGAL ENTITY], [ADDRESS]. Privacy questions and requests: [PRIVACY CONTACT EMAIL].
