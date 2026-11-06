# Getting started

[Project guide](../README.md) → getting started

Trust Markdown is a dependency-free JavaScript library with five capabilities.
It reads the trust documents' supported Markdown and returns structured values.
It performs no file or network access and keeps no mutable parsing state.

## Availability

This qualified specification project has no separately published installation.
[MARKDOWN-001](../roadmap/active-work.md) records the qualified and admitted package.
The parent consumes the verified package through typed public names and owns
complete application parity in ADOPT-002.
The qualification target is macOS with Node; other targets need their own proof.
There are no service credentials, network endpoints or persistent files.

## API

The logical package is `trust_markdown`; each module exports its same-named
function with ordinary JavaScript arguments and results.

| Module and function | Result |
| --- | --- |
| `slug(text)` | An exact lowercase heading slug, or `section` when empty. |
| `safe_href(href, options)` | The supported target or null, using the supplied document resolver. |
| `parse_inline(text, options)` | Text, code, emphasis and link nodes, with exact node boundaries. |
| `plain(inline)` | Flattened inline text with no separator. |
| `parse_markdown(text, options)` | Heading, paragraph, list, table, code, quote and rule blocks. |

For example, `slug("Hello, world!")` returns `"hello-world"`.
`safe_href("javascript:alert(1)", {prefix:"doc"})` returns null.
`parse_inline("**hello**", {prefix:"doc"})` returns a strong node with a
single `hello` text child.

Options contain a heading prefix, an optional relative-document resolver and an
optional placeholder map. Resolver calls preserve their original thrown objects.
Only own placeholder keys participate, in JavaScript property order. Parsed
arrays and nodes are fresh per call; caller objects and their references stay
unchanged. Raw HTML remains text data. Full-document parsing removes complete
HTML comments before parsing; inline parsing does not remove them.

## Development

Read the [framework flow](framework-flow.md) and [project map](project-layout.md).
Validate with `litai project validate` and `litai lock --check`.
After execution authorization, use `CODING_CLI=codex litai rebuild
components/trust-markdown --target host --allow-host-execution --update-receipt`.
The reported artifact and locked import surface define the actual package files.
All 21 independent acceptance batches must pass before the parent admits it.
