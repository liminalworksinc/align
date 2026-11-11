# Public interface: operator-shortcuts.create-operator-shortcuts

## ADDED Requirements

### Requirement: operator-shortcuts.create-operator-shortcuts

# Operator retention and local sign-in commands

Preserve the current v2 retention and local sign-in-link shortcut behavior
through one operator-shortcuts capability. The host supplies process,
console, fetch, AbortSignal and the existing admin delegate. The two command
entrypoints keep their current Node and npm invocation forms.

Retention admits the existing dry-run argument, preserves duplicates and
refuses every other argument with the current usage text and exit code.
It updates the existing argv array and delegates to the current admin
entrypoint with retention run prepended. The delegate owns database and
retention authority.

The local sign-in shortcut selects and normalizes the existing email,
uses the current loopback origin and request path, and sends the same
bounded request. Preserve rate-limit precedence, response-message and
JSON-failure behavior, exit codes, and output. It reads the response's
message field on refusal. It does not read a success response body or
print the separate code field.

The independent controls preserve the ten existing observations and add
coverage for message fallbacks, argument edge cases, successful 204
responses, code-field privacy and the response JSON method receiver.
All nineteen original records agree between the original modules and
the supplied-port factory transport on macOS and SSD-backed Linux.

The host entrypoints must prepare their selected native package before
importing it in a cold checkout. Integrated command acceptance includes
the actual native admin delegate, invalid-argument refusal before domain
execution, bootstrap cleanup and signal handling, packaged script paths
and image entrypoints. These checks remain part of B28 closure.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:8193f3aa7fccde639c9e`, `evidence:ec0b704c42dac3c71d99`
