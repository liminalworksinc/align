# Getting started

[Project guide](../README.md)

## Purpose and API

This internal library supplies the pure formatting and share-state API used by
Align's agent. Its 49 functions cover goal envelopes and deltas, limits, accepted
asks, work cards, requests, holds and the current wording of a share's state.
The admitted package exposes one ordinary JavaScript function per capability.
The parent consumer preserves its existing TypeScript public names.

For example, `clean("[Align] hello\nworld", 100)` returns
`"(Align] hello world"`. `request_short_id("rq_abcdefgh")` returns `"abcdef"`.
The component's direct contracts define every function, input and exact string.

`envelope_data()` returns the public envelope constants, including `LIMIT_WORDS`
and `SAFE_REQUESTS`. Wrappers share the same mutable record and Set across calls.
Changing the limit-label record affects wording immediately. `ended_data()` returns
`SHARE_CHANGED`. Ordinary function calls preserve their inputs; `limit_change`
keeps references to the original added and removed entries.

## Consumption

Consumer integration is tracked by ADOPT-002 in the parent project. The build
obtains an admitted package from the verified local source cache and replays its
independent acceptance before installation. This internal child has no standalone
registry package, service, durable state, credentials or user command.

## Contributor verification

Use the exact non-editable framework distribution pinned in
`literate.project.json`. These commands assume that runtime's `litai` is on the
path. After host-execution authorization, rebuild the actual component:

```sh
CODING_CLI=codex litai rebuild components/agent-envelope --target host --allow-host-execution --update-receipt
litai verify
litai project validate
litai lock --check
litai plan components/agent-envelope
```

The independent oracle covers 563,717 source observations in 59 batches over all
51 callable/data capabilities. It checks exact return values, aliases, mutable
metadata, omitted defaults, clipping and share-state transitions. The corrected
baseline passed all 1,818 retained checks and 24 hosted image checks before this
acceptance. Change intent in the component and direct public contracts, then
repeat qualification and consumer verification.
