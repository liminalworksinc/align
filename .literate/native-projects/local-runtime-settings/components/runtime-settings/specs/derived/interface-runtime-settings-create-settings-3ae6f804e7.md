# Public interface: runtime-settings.create-settings

## ADDED Requirements

### Requirement: runtime-settings.create-settings

# Runtime settings

Capability `runtime-settings.create-settings` supplies one independently bound settings instance. The target binding defines its constructor, runtime representation and public names.

One settings instance reads an explicitly bound runtime environment. Local mode
is the default; hosted mode requires an explicit setting. Read current settings
when a method is called. A caller may supply an environment to methods that
support one. Those methods use that environment without merging it with the
runtime environment or modifying it.

Return the operating mode, data location, allowed hosts, sign-in readiness,
creation mode, operational caps, session lifetime and local send ceiling through
the existing public meanings. Operational caps constrain server use; they do not
represent financial budgets. Local mode allows creation and ignores hosted caps.
An unknown hosted creation mode closes creation. Invalid optional positive
integer limits use their existing defaults, while startup validation reports
invalid configured limits.

Hosted startup problems have a stable order and preserve every existing
diagnostic. Report host, secret, data-location and unsupported-mode problems
before identity, public-origin, sign-in, session, test-only and creation/abuse
problems. Warnings remain separate from startup refusal. The bot-check warning
precedes a follow-up warning. Delegate the latter to the bound qualified
dependency exactly once, with the original environment object.

The startup-problem method computes once per settings instance. Its first call
fixes the result even if the runtime environment later changes. Return that same
mutable array on every call, including mutations a caller makes to it. Startup
assertion performs a fresh validation independently of that cache. It refuses
unsupported public mode first, then refuses hosted startup when problems exist.

Configuration calls return fresh records and fresh allowed-host collections.
The instance's public loopback collection is shared and mutable at runtime;
future local configurations copy its current members. Earlier returned
collections remain independent. Cap, email and bot-check settings return fresh
records when present. Separate settings instances have independent caches and
loopback collections. Replacing a returned method property must not replace the
lexical method used by another method.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:251d3062a0652e62c745`, `evidence:35b31315fe73cd3a3e27`, `evidence:f7de566ee7f5e7a08e4e`
