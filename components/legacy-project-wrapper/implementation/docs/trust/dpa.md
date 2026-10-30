# Data processing agreement

> **Draft for counsel review.** Prepared 2026-10-30. It is not legal advice and is not yet offered for signature. The
> bracketed placeholders are filled in when it is.

Align adopts the **Common Paper Data Processing Agreement, version 1.1**, as its DPA. The agreement is this Cover Page
plus the Common Paper DPA Standard Terms, published at
<https://commonpaper.com/standards/data-processing-agreement/>. This page does not copy the Standard Terms; it fills in
the Cover Page for hosted Align. Common Paper's standard agreements are licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Align refers to the Standard Terms as Common Paper
publishes them; the Cover Page and the changes listed under "Changes to the Standard Terms" below are Align's.

The Standard Terms incorporate the European Commission's 2021 Standard Contractual Clauses (Decision 2021/914) for
transfers from the EEA, the UK Addendum to them for transfers from the UK, and adjustments for transfers under Swiss
law. To sign, write to [PRIVACY CONTACT EMAIL].

## Cover Page

| Key term | Align's entry |
| --- | --- |
| Agreement | The agreement under which the Customer uses hosted Align, named when the DPA is signed |
| Provider | [LEGAL ENTITY], [ADDRESS] |
| Provider Security Contact | [SECURITY CONTACT EMAIL] |
| Approved Subprocessors | The [subprocessor list](subprocessors.md): Fly.io (hosting, United States), the configured email API (Resend in the default configuration, United States), and Cloudflare Turnstile (bot check, when enabled) |
| Security Policy | The [security overview](security-overview.md), summarized in Annex II below. Certifications: none |
| Governing Law and Chosen Courts | To be set by counsel |
| Service Provider Relationship (CCPA) | Applies: Align acts as a service provider and does not sell or share Customer Personal Data |
| Restricted Transfers: Governing Member State | To be set by counsel |

## Changes to the Standard Terms

These change the Standard Terms in the Customer's favour or say how they apply to Align. Counsel to confirm the
wording.

- **Subprocessor notice.** Align gives at least **30 days'** written notice before a new subprocessor starts processing
  Customer Personal Data, in place of the Standard Terms' 10 business days, and the Customer may object within those
  30 days under the Standard Terms' objection process. If the objection can't be resolved, the Customer may stop
  using hosted Align and delete its workspaces.
- **Security incidents.** Align notifies the Customer within **72 hours** of becoming aware of a Security Incident, as
  the Standard Terms require, and without undue delay where it can be sooner.
- **Deletion on termination.** Customer Personal Data is deleted as the [retention schedule](../RETENTION.md)
  describes: an owner can delete a workspace at any time; it can be restored for 30 days, is then purged by a daily
  job, and leaves the 7-day volume snapshots within 38 days of its deletion. On request, Align purges a workspace at
  once. Align keeps no other copy.
- **Audits.** Align has no third-party audit report to provide. It meets audit requests by answering security and
  audit questionnaires and providing documentation (see the [questionnaire answers](questionnaire.md)), at most once
  a year unless a Security Incident or a supervisory authority requires more. Any inspection beyond that is on
  reasonable notice and agreed in advance.

## Annex I(A): Parties

| | Data exporter | Data importer |
| --- | --- | --- |
| Who | The Customer, as named when the DPA is signed | [LEGAL ENTITY], [ADDRESS] |
| Contact | The Customer's contact, as named when signed | [PRIVACY CONTACT EMAIL] |
| Role | Controller (or processor, for its own customers) | Processor (or subprocessor) |

## Annex I(B): Processing details

| Item | Details |
| --- | --- |
| Service | Hosted Align: goals with owners and approval, the coding-agent sessions people choose to share toward them, and connected AI apps that read them |
| Subject matter | Customer Personal Data in the Customer's Align workspaces |
| Categories of data subjects | The Customer's personnel and contractors who use its workspaces, and people they invite by email |
| Categories of personal data | Names, email addresses and roles; goals, change requests and decisions and who made them; evidence links on change requests; for shared agent sessions, the agent used, a hashed repository key, an optional repository alias, times, the goal it works toward, and token usage and estimated cost; for 24 hours, hashes of files touched (and, only if a person turns it on, file paths and short task text); paired device names; connected app names; audit log entries |
| Not processed | Prompt text, agent replies and tool output, code and file contents |
| Special category data | No |
| Frequency of transfer | Continuous, while the Customer uses the Service |
| Nature of processing | Storing, organizing, showing to authorized people, sending to the Customer's paired devices and connected AI apps, rolling up into totals, and deleting |
| Purpose of processing | Providing the Service to the Customer |
| Duration of processing | The term of the Agreement, then until deletion as described above |

## Annex I(C): Competent supervisory authority

As the Standard Terms set out.

## Annex II: Technical and organizational measures

A summary of the [security overview](security-overview.md):

- **Encryption.** HTTPS at the hosting provider's edge; the database volume is encrypted at rest by the hosting
  provider.
- **Access control.** People sign in individually (email codes, Google, GitHub or passkeys; no passwords). Sessions
  last 7 days from last use and at most 30 days. Sensitive actions require a sign-in from the last 15 minutes. Every
  request is authorized by workspace role, team role and goal visibility.
- **Credentials.** Device, AI app and invite tokens are stored as hashes; refresh tokens rotate and reuse revokes them; devices hold their own
  keys; connected AI apps are read-only and limited to one workspace, except for adding agent-reported evidence links
  with the separate `changes:evidence` scope.
- **Data minimization.** No prompts, agent output or code on the server.
- **Abuse prevention.** Rate limits, creation codes and caps, a disposable-domain block, and a bot check.
- **Logging.** A per-workspace audit log kept 1 year; server logs hold no request bodies, addresses, emails or codes.
- **Availability.** Daily volume snapshots kept 7 days and a health check every 30 seconds.
- **Deletion.** A published retention schedule applied by a daily job, and in-app deletion of accounts and
  workspaces.
- **Subprocessors.** A published list with 30 days' notice of changes.
