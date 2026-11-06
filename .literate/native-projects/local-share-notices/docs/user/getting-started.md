# Getting started

[Project guide](../README.md)

## Purpose and API

This internal library provides `kind(id)`, `is_share_state(kind)`,
`resumed_held(held, reader)` and `constants()` for Align session notices.
`kind("local/share_started_123")` returns `"share_started_123"`.
`is_share_state("share_started_123")` initially returns `true`.
`resumed_held` preserves the exact source wording for user and model readers.

`constants()` returns a fresh wrapper containing `SHARE_STATE_NOTICES` and
`RESUMED_NOTICE`. Its prefix array is the same mutable object across calls.
Changing that array in place changes subsequent prefix matching; restoring its
contents restores matching. Ordinary calls preserve argument and public state.

## Consumption

Application integration is tracked in the parent native rewrite program. A
consumer obtains an admitted package from the verified local source cache and
replays independent acceptance before installing it. This child has no standalone
registry package, service, persistent state, configuration or user command.

## Contributor verification

Use the exact non-editable framework distribution pinned in
`literate.project.json`. These commands assume that runtime's `litai` is on the
path. After host-execution authorization, rebuild the actual component:

```sh
CODING_CLI=codex litai rebuild components/share-notices --target host --allow-host-execution --update-receipt
litai verify
litai project validate
litai lock --check
litai plan components/share-notices
```

The independent oracle covers 1,099 source observations in 14 batches, including
eight public-state scenarios, both readers, opaque titles and older notice kinds.
Change intent in the component and direct public contracts. Review source-bound
changes before repeating qualification and consumer integration.
