# Public interface: share-notices.is-share-state

## ADDED Requirements

### Requirement: share-notices.is-share-state

JavaScript module share_notices/is_share_state exports is_share_state(kind:string):boolean. These are synchronous JavaScript functions with no I/O, environment or clock access. Preserve arguments and their enumerable properties. All strings are opaque and case-sensitive, including empty, whitespace, Unicode, newlines, quotes and prototype-like text. Do not trim, normalize or escape strings. The only shared state is the public SHARE_STATE_NOTICES mutable array described by the constants capability. Ordinary function calls never change that array. Return exact raw strings and booleans, with no transport envelope. Return whether kind starts with any current prefix in the public SHARE_STATE_NOTICES array. Read its current contents on each call. Match JavaScript startsWith semantics, without parsing slashes, lowercasing, substring matching, or interpreting patterns. An empty array matches nothing; an empty prefix matches every string. All nine initial prefixes, including older signed_in_ and workspace_back_ kinds, are supported.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:4dc9c8e9b034c5bb4a92`
