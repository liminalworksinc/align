# Getting started

[Project guide](../README.md) -> getting started

This library preserves the existing value card's seven functions and four data
exports through eight natural JavaScript capabilities.

## Availability

There is no separately published installation. [VALUE-RULES-001](../roadmap/active-work.md)
records two passing clean qualification builds and the admitted package. The parent owns
consumer integration, source retirement and complete application checks. No service
credentials are required. The qualification target is macOS. All 1,168,597 original
observations also match Linux Node 24 without network access.

## API

The logical package is `value_rules`. Each module exports its named function.

| Function | Result |
| --- | --- |
| `estimate_said(id)` | The first matching estimate's current wording, or the unchanged identifier. |
| `clean_value_text(text)` | The existing Unicode-cleaned, collapsed one-line note, without a length cap. |
| `safe_follow_up_url(value)` | A normalized accepted HTTPS or mailto URL, or null. |
| `loi_url_ok(url)` | Whether that same URL check accepts the link. |
| `follow_up_url(env?)` | An explicit safe override, hosted request-access link, or null. |
| `follow_up_problem(env?)` | The existing warning for an invalid explicit override, or null. |
| `span_words(milliseconds)` | Rounded seconds, minutes, hours or days with the existing lower-unit rule. |
| `value_data()` | A fresh wrapper with `ESTIMATE_WORDS`, `VALUE_QUESTION`, `VALUE_NOTE_MAX` and `VALUE_EDIT_DAYS`. |

Every metadata wrapper retains the same mutable estimate array and row objects.
In-place changes affect later estimate lookup. Replacing a wrapper's fields does
not change later wrappers. The scalar values remain the existing question, 500
and seven days. The accepted public contracts define exact wording and boundaries.

An explicit nonempty `ALIGN_FOLLOW_UP_URL` takes precedence, including hiding an
invalid override. Otherwise hosted mode `HOSTED=1` uses `ALIGN_PUBLIC_ORIGIN` for
the request-access link. The warning depends only on the explicit override.
Pass an environment record to either API to avoid process defaults. Omitted or
undefined arguments read those named process fields afresh. No environment values
are captured in the baseline checks. HTTPS explicit links reject non-default ports
and nonempty credentials; the hosted origin uses its ordinary URL origin.

## Development

Read the [framework flow](framework-flow.md) and [project map](project-layout.md).
Run `litai project validate` and `litai lock --check`. After host execution
authorization, use `CODING_CLI=codex litai rebuild components/value-rules --target
host --allow-host-execution --update-receipt`. The reported artifact and locked
surface define the package files. Every independent acceptance batch must pass.
