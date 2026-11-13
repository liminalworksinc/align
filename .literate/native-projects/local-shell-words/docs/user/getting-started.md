# Getting started

[Project guide](../README.md)

## Purpose and API

This internal library provides `parse(src)` and `command_words(words)` to Align
hooks. `parse` returns ordered objects with `words` and `redirs`. It reads local
strings without executing their commands. `command_words` returns a new suffix
array after the exact supported assignments and wrapper names.

For example, `parse("echo 'a > b' 2>>out")` returns
`[{words:["echo","a > b"],redirs:[{op:">>",target:"out"}]}]`.
`command_words(["VAR=x","sudo","env","echo","a"])` returns `["echo","a"]`.
Wrapper options are preserved: `["sudo","-u","person","echo"]` becomes
`["-u","person","echo"]`.

## Consumption

Application integration is tracked in the parent rewrite program. A consumer must
obtain an admitted package from a verified local source cache and replay its
independent acceptance before installation. There is no standalone registry
package, service, persistent state, configuration or user command for this child.

## Contributor verification

Use the exact non-editable framework distribution pinned in `literate.project.json`.
The following commands assume that runtime's `litai` is on the path. After
host-execution authorization, rebuild the actual component and record its receipt:

```sh
CODING_CLI=codex litai rebuild components/shell-words --target host --allow-host-execution --update-receipt
litai verify
litai project validate
litai lock --check
litai plan components/shell-words
```

The independent oracle covers 11,108 reference observations in 23 batches. It
preserves returned structures and argument state, including array properties.
Changes to behavior belong in the component and direct public contracts. Review
source-bound changes before repeating qualification and consumer integration.
