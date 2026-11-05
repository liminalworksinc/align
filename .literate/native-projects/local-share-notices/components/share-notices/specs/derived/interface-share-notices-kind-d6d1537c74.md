# Public interface: share-notices.kind

## ADDED Requirements

### Requirement: share-notices.kind

JavaScript module share_notices/kind exports kind(id:string):string. These are synchronous JavaScript functions with no I/O, environment or clock access. Preserve arguments and their enumerable properties. All strings are opaque and case-sensitive, including empty, whitespace, Unicode, newlines, quotes and prototype-like text. Do not trim, normalize or escape strings. The only shared state is the public SHARE_STATE_NOTICES mutable array described by the constants capability. Ordinary function calls never change that array. Return exact raw strings and booleans, with no transport envelope. Return the suffix after the first slash in id. With no slash return the entire id. An initial slash is removed, a final slash produces the empty suffix, and any subsequent slashes remain in the result. Empty input returns the empty string.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:4dc9c8e9b034c5bb4a92`
