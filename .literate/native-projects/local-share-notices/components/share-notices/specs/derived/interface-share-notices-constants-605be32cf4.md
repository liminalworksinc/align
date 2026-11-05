# Public interface: share-notices.constants

## ADDED Requirements

### Requirement: share-notices.constants

JavaScript module share_notices/constants exports constants(). These are synchronous JavaScript functions with no I/O, environment or clock access. Preserve arguments and their enumerable properties. All strings are opaque and case-sensitive, including empty, whitespace, Unicode, newlines, quotes and prototype-like text. Do not trim, normalize or escape strings. The only shared state is the public SHARE_STATE_NOTICES mutable array described by the constants capability. Ordinary function calls never change that array. Return exact raw strings and booleans, with no transport envelope. Return a fresh ordinary wrapper with exactly SHARE_STATE_NOTICES and RESUMED_NOTICE. RESUMED_NOTICE is exactly "Align: this session was resumed from its Align workspace, so its tools work again.". SHARE_STATE_NOTICES is one shared mutable string array, initially ["share_started_","share_err_","share_stopped_","upload_refused_","server_stopped_","signed_out_","signed_in_","access_lost_","workspace_back_"] in that order. Every constants() wrapper refers to the same array object, and is_share_state reads that same array on each call. Callers may mutate the array in place, including replacing its contents with an empty list or arbitrary string prefixes. Such changes must immediately affect matching, and restoring its contents restores matching. Do not return detached array copies, freeze the array, recreate its contents on calls, or use a private fixed prefix list for matching. Calling constants() itself never changes the shared array.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:4dc9c8e9b034c5bb4a92`
