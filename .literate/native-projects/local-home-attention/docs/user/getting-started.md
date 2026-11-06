# Getting started

[Project guide](../README.md) → getting started

Home attention is a dependency-free JavaScript library with eight functions and
one metadata capability. It preserves evidence attribution and the next action
and people shown for open changes, alignments and approved launches.

## Availability

This qualified specification project has no separately published installation.
[HOME-001](../roadmap/active-work.md) records the qualified and admitted package.
The parent consumes the verified package through typed public names and owns
complete application parity in ADOPT-002.
The qualification target is macOS with Node; other targets need their own proof.
There are no service credentials, network endpoints or persistent files.

## API

The logical package is `home_attention`. Each module exports the function named
below and uses ordinary JavaScript arguments and return values.

| Module and function | Result |
| --- | --- |
| `app_evidence(lastReadAt)` | A nonempty string gives `delivery_receipt`; otherwise `not_observed`. |
| `activity_evidence(activity)` | Session count or an activity time gives `agent_reported`. |
| `answer_evidence(state, autoAccepted?)` | Classifies a request answer without claiming execution. |
| `receipt_evidence(receipts)` | A positive receipt count gives `delivery_receipt`. |
| `app_status_words(app, at)` | Uses the first applicable read, connection or approval time and calls `at` once. |
| `change_waits(change)` | Returns the next action and the original requester or approver references. |
| `alignment_waits(alignment)` | Deduplicates pending approvers by id and sorts the retained people. |
| `launch_waits(value)` | Filters an approved, unlaunched change and copies valid launcher records. |
| `data()` | A fresh wrapper around the three shared mutable metadata objects. |

For example, `app_evidence("2026-11-05T12:00:00Z")` returns
`"delivery_receipt"`, while `app_evidence(null)` returns `"not_observed"`.
A connection alone never substitutes for a goal read. Status formatting callbacks
run synchronously; thrown callback objects propagate unchanged.

`data()` shares `EVIDENCE_CLASSES`, `EVIDENCE_WORDS` and `UNLAUNCHED_STATES`
between wrappers. In-place launch-state edits affect later `launch_waits` calls.
Do not freeze these values or substitute detached copies.

## Development

Read the [framework flow](framework-flow.md) and [project map](project-layout.md).
Validate the accepted authority with `litai project validate` and `litai lock --check`.
After execution authorization, use `CODING_CLI=codex litai rebuild
components/home-attention --target host --allow-host-execution --update-receipt`.
The reported artifact and locked import surface define the actual package files.
All nine independent acceptance batches must pass before the parent admits it.
