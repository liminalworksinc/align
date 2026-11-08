# Public interface: server-identity-effects.create-effects

## ADDED Requirements

### Requirement: server-identity-effects.create-effects

# Sign-in delivery and configured verification

Provide one host-bound sign-in-effects service. It exposes the existing sign-in
link, local delivery location, code delivery, configured captcha integration and
direct captcha verification operations. Preserve the existing public content,
results, failure values and effect order. Authentication, account admission,
account lifecycle and provider implementations remain caller responsibilities.

## Public content

The sign-in subject is `Your Align sign-in code`. The captcha response header is
`x-captcha-response`. A sign-in link uses the supplied origin followed by
`/app/sign-in?`, with email then code encoded by the declared target's URL binding.
Preserve empty values, Unicode, reserved characters and a trailing origin slash.
The link fills the form; sign-in still requires the separate sign-in operation.

The local delivery line is `Align sign-in for ${email}: ${link}`. The persisted
form contains exactly that line followed by one LF. Hosted delivery text contains
these five lines, joined by LF with no terminal newline:

```text
Your Align sign-in code is ${code}. It works for 5 minutes.

Or open this link to fill it in, then press Sign in: ${link}

If you didn't ask to sign in to Align, ignore this email.
```

The placeholders denote the supplied values and constructed link. The hosted
delivery label is `Sign-in email`. Missing hosted email settings raise
`Email sign-in is not configured`.

## Delivery

Construct the link before reading the current local/hosted configuration. In
local mode, record the local delivery line before resolving and persisting its
delivery location. Enforce the target's local-file protection contract after the
replacement write. Keep completed partial effects when a later effect fails;
there is no rollback or silent retry. Do not read hosted mail settings or call
hosted delivery in this branch.

In hosted mode, perform no local logging or filesystem action. Read the current
email settings, refuse missing settings, then call the supplied delivery operation
with settings, recipient, exact subject/text and label. Wait for completion,
discard its returned value and complete without a public value. Retain the exact
supplied failure value if delivery refuses or fails. Do not wrap, clone, stringify
or redact a propagated failure value.

The local delivery-location operation resolves the current supplied data
location through its declared target path binding. It does not create anything.

## Configured verification

The supplied current captcha settings determine whether verification is enabled.
Neither verification operation adds an independent local/hosted-mode check.
When disabled, configured integration returns no plugin and direct verification
completes without inspecting request data or touching network, timeout or logging
providers. The configured integration also avoids host-name/provider access.

When enabled, configured integration delegates once to the supplied integration
provider with the exact current secret, verification endpoint, ordered configured
hosts and both email-code request and email-code sign-in endpoints. Return its
opaque result unchanged. Do not fabricate, clone or reinterpret the result.

Direct verification first reads the response token from the public response
header. A missing, empty or longer-than-4,096-UTF-16-code-unit token is refused
before transport. The required message is
`Complete the check that you are a person, then try again.`

For a valid-sized token, request verification with the configured secret, token
and optional originating address. An absent address is omitted; an empty address
is preserved. Apply the target's timeout, redirect and transport contract.

An unsuccessful response or falsy parsed verdict is unavailable. Transport,
timeout-construction and verdict-decoding failures record only the failure name,
with the target's nullish fallback, then become unavailable. If obtaining the
failure name or recording it itself fails, retain that exact failure instead.
The unavailable message is
`The check that you are a person isn't working right now. Try again in a minute.`

A parsed verdict passes only when success is exactly true, hostname is truthy,
and lowercasing that returned hostname produces an exact member of the current
configured host list. Do not normalize configured hosts, trim a hostname or accept
subdomains implicitly. Preserve the target binding's ordinary failure for a
malformed hostname value. A refused verdict uses
`The check that you are a person didn't pass. Try it again.`

Settings, host-configuration and public-error-construction failures outside the
transport conversion retain their original identity. Preserve host configuration
reads after the successful verdict, rather than freezing host names at service
construction.

Configured middleware remains delegated. Its current provider accepts a truthy
non-boolean success value and rejects a differently cased hostname. Do not apply
the direct operation's predicate to delegated middleware. Actual configured
integration acceptance remains mandatory in addition to resource-level tests.

## Construction and acceptance

Capture the declared supplied handles without invoking them at service
construction. Later caller-container replacements do not replace captured
handles. Read current host values through the target's supplied resolver handles
at the defined operation points. Preserve declared receiver and failure-identity
rules. Separate constructions produce separate service namespaces.

Regenerate from this reviewed intent and its target binding. Independent clean
qualification checks the complete public delivery/verification behavior, explicit
host bindings and protected local filesystem effects. A distinct admission must
also pass actual configured middleware acceptance before consuming source
authority changes. Do not infer whole-identity or public-tester completion from
this library's qualification.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:3d03dc5aa7a35427041d`, `evidence:4a59c0609edd2cce2007`
