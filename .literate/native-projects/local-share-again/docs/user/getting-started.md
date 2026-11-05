# Getting started

[Project guide](../README.md)

## Purpose and API

This internal library provides three ordinary JavaScript functions:

- `text(parts)` joins strings, `{device: name}` and `{devices_page: words}` parts
  into plain text, preserving the exact text and order.
- `words(device, who)` returns structured instructions for sharing again. `who`
  is null for the reader or another person's name. The device is null or carries
  `name`, `signed_out` and `has_workspace`.
- `stopped(who, options)` explains why a stop or resume cannot reach a session
  whose person stopped sharing, including the deleted-account case.

Strings remain opaque. Calls preserve input arrays and objects. There is no
service, persistent state, configuration, public registry package or user command.

## Consumption and authority

The specification is release implementation authority after both clean
qualification builds and the separately admitted build pass. The original
algorithm is retired. The parent consumes the exact accepted package from the
verified source cache and replays all 13 independent batches before installation.
Its typed consumer preserves all 1,163 observations; complete application and
hosted image gates pass. The parent ADOPT-002 queue owns the continuing full
rewrite and application parity.

## Contributor verification

Use the exact non-editable framework distribution pinned in
`literate.project.json`. With host execution authorized, rebuild the real component:

```sh
CODING_CLI=codex litai rebuild components/share-again --target host --allow-host-execution --update-receipt
litai verify
litai project validate
litai lock --check
litai plan components/share-again
```

The independent oracle has 1,163 source observations in 13 batches, covering all
device states, reader identities, optional arguments, exact sentence parts and
input preservation. Change intent in the component and public contracts, review
source-bound changes, and repeat qualification before retiring source.
