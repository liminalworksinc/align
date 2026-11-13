# Getting started

[Project guide](../README.md) → getting started

Wording is a dependency-free JavaScript library with sixteen functions and one
metadata capability. It preserves the original text cleaners, count and currency
formatters, launch sentences and field-by-field change descriptions.

## Availability

This accepted specification project has no separately published installation.
[WORDING-001](../roadmap/active-work.md) records two passing clean qualification builds and the admitted
package. The parent owns application integration and original source retirement.
The qualification target is macOS with Node; other targets need their own proof.
There are no service credentials, network endpoints or persistent files.

## API

The logical package is `wording`. Each module exports its same-named function
with ordinary JavaScript arguments and return values.

| Modules and functions | Purpose |
| --- | --- |
| `drop_controls`, `drop_invisible`, `clean_prose`, `is_blank_text` | Clean text with exact Unicode properties and retained emoji spans. |
| `plural`, `count` | Choose a noun and format its count, with an optional formatter. |
| `usd` | Format micro-dollars at the original rounding boundaries. |
| `launch_words` | Describe an approved change's launch or supersession. |
| `depends_on_full`, `hidden_goals`, `with_hidden` | Count hidden dependencies without naming them. |
| `change_words`, `diff_words` | Render changes in the original field and callback order. |
| `counter_no_change`, `counter_same_as_base`, `counter_same_as_request` | Explain a counter that changes nothing. |
| `wording_data` | Return a fresh wrapper with three immutable scalar values. |

For example, `plural(1, "session")` returns `"session"`,
`count(2, "session")` returns `"2 sessions"`, and `usd(1000)` returns `"$0.0010"`.
Cleaning retains supported emoji joiner and tag sequences. It never normalizes
visible words. Quoting, title and count formatters run synchronously; their errors
propagate as the original thrown objects.

`wording_data()` returns `BLANK_FILLERS`, `DEPENDS_ON_MAX` and
`COUNTER_SAME_AS_PROPOSAL` in a fresh ordinary object. Mutating a wrapper never
changes another call or any function's behavior. Inputs and nested references are
preserved across every capability.

## Development

Read the [framework flow](framework-flow.md) and [project map](project-layout.md).
Validate with `litai project validate` and `litai lock --check`.
After execution authorization, use `CODING_CLI=codex litai rebuild
components/wording --target host --allow-host-execution --update-receipt`.
The reported artifact and locked import surface define the actual package files.
All 49 independent acceptance batches must pass before the parent admits it.
