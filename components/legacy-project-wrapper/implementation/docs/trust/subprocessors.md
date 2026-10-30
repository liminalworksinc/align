# Subprocessors

> Draft for counsel review, prepared 2026-10-30. It lists the services hosted Align uses to process personal data, as
> the code and configuration in this repository set them up. [LEGAL ENTITY] publishes it; questions go to
> [PRIVACY CONTACT EMAIL].

A subprocessor is a company that processes personal data for Align when Align processes data for a customer. This page
covers hosted Align only. Align in local mode (Mode L) runs on your own machine, and Align sends nothing from it to
anyone (see "Local mode" below).

## Subprocessors

| Subprocessor | What it does for Align | Personal data it processes | Location | When it is used |
| --- | --- | --- | --- | --- |
| Fly.io, Inc. | Hosting: runs Align's one server, stores its database on an encrypted volume with daily snapshots kept 7 days, terminates HTTPS at its edge, and keeps the machine's log output | Everything hosted Align stores (see the privacy policy) | United States: region `sjc`, San Jose, California | Always, when hosted <!-- fly.toml: primary_region = "sjc", [[mounts]] snapshot_retention = 7 --> |
| The configured email API: Resend in the default configuration | Sends sign-in codes and creation-code messages | The recipient's email address and the message: a sign-in code and link, or a creation code with the recipient's name | United States | When the email settings are set (`ALIGN_EMAIL_API_URL`, `ALIGN_EMAIL_API_KEY`, `ALIGN_EMAIL_FROM`); the default configuration points at `https://api.resend.com/emails` <!-- fly.toml; lib/v2/core.mts postEmail --> |
| Cloudflare, Inc. (Turnstile) | The check that a visitor is a person, on email-code sign-in, access requests and workspace creation | What the Turnstile widget collects in the browser, the token it issues, and the visitor's IP address, which Align passes with the token | Global network; Cloudflare, Inc. is in the United States | Only when both `ALIGN_TURNSTILE_SITE_KEY` and `ALIGN_TURNSTILE_SECRET_KEY` are set <!-- lib/v2/config.ts turnstile(); lib/v2/captcha.ts sends remoteip from Fly-Client-IP --> |

## Authentication providers

Google and GitHub are used for sign-in only, and only when a person chooses them. Align asks each for the person's
identity and nothing more: Google for `openid`, `email` and `profile`; GitHub for `read:user` and `user:email`
(Better Auth's default scopes). Align receives a name, an email address, a profile picture address and the
provider's account id. It reads no other data from either service.

| Provider | Used for | Hosts the server calls | When it is used |
| --- | --- | --- | --- |
| Google LLC | "Continue with Google" | `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com` | Only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set <!-- lib/v2/config.ts googleConfigured; @better-auth/core social-providers/google --> |
| GitHub, Inc. | "Continue with GitHub" | `github.com`, `api.github.com` | Only when `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set <!-- lib/v2/config.ts githubConfigured; @better-auth/core social-providers/github --> |

## Not subprocessors

- **AI model providers.** Align's server calls no AI model: not Anthropic, not OpenAI, not any other. It sends no
  workspace data to one, and it trains no model. <!-- no model-provider host anywhere in app/, lib/ or proxy.ts; test-v2 checks -->
- **AI apps you connect.** When a person connects an AI app (Claude, ChatGPT, Claude Code, Codex) to Align, the app
  reads one workspace through Align's MCP endpoint, as that person and with their permissions. The app is that
  person's or their organization's own tool, under their own agreement with its maker, not a service Align uses.
  To learn an app's name and its allowed return addresses, Align fetches the app's public client document from the
  address the app gives (for Claude, an address on `claude.ai`). That request carries no personal data.
  <!-- lib/oauth/clients.ts CIMD; specs/align/mcp.md -->
- **Font hosting.** Align's fonts are downloaded when the app is built and served from Align's own address, so a
  page view sends nothing to a font service. <!-- app/layout.tsx next/font/google self-hosts at build -->
- **Analytics.** Align uses no third-party analytics, tracking or advertising service. Its product funnel events are
  counted in its own database. <!-- PRESEED-007 -->

## Every external host the hosted server can call

| Host | Who | Why |
| --- | --- | --- |
| `api.resend.com` | Resend | Sending email, in the default configuration (any https email API can be configured instead) |
| `challenges.cloudflare.com` | Cloudflare | Checking a Turnstile token (the browser also loads the widget from here) |
| `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com` | Google | Google sign-in |
| `github.com`, `api.github.com` | GitHub | GitHub sign-in |
| The address an AI app names as its client document | The app's maker | Reading the app's public name and return addresses, never sending personal data |

## Local mode

In local mode the database stays in `data/v2/align.sqlite` on the person's own machine. Sign-in codes are printed on
that machine, not emailed, and the bot check is off. The local server reaches the internet only to sign in with
Google or GitHub, if the person configured them, and to read the client document of an AI app the person connects.
[LEGAL ENTITY] receives nothing from a local server. <!-- lib/v2/mail.ts; lib/v2/config.ts turnstile() is hosted only -->

## Changes to this list

[LEGAL ENTITY] will update this page at least 30 days before a new subprocessor starts processing personal data, and
will email customers who have signed the DPA, or who ask for notice at [PRIVACY CONTACT EMAIL]. A customer may object
within those 30 days, as the DPA describes. In an emergency (for example, to keep the service running when a
provider fails), a replacement may start sooner; customers are then told as soon as possible, with the same right to
object.
