# Getting started

[Project guide](../README.md) -> getting started

HTTP errors provides the existing application error classes and status-specific
factories as five natural JavaScript capabilities.

## Availability

There is no separately published installation. [ERRORS-001](../roadmap/active-work.md)
records the two passing clean builds and admitted package. The parent owns consumer integration,
source retirement and complete application parity. No credentials, network service,
configuration or persistent files are needed. The qualification target is macOS;
the complete original baseline matrix also passes Linux Node 24.

## API

The logical package is `http_errors`. Each module exports the function below.

| Module and function | Result |
| --- | --- |
| `data()` | A fresh wrapper with the two shared mutable constructors, `HttpError` and `V2Error`. |
| `not_found()` | A new `V2Error` with status 404, code `not_found` and message `Not found`. |
| `bad_request(message, code?)` | A new `V2Error` with status 400; omitted or undefined code uses `bad_request`. |
| `forbidden(code, message)` | A new `V2Error` with status 403. |
| `conflict(code, message)` | A new `V2Error` with status 409. |

`new HttpError(status, message, code?)` retains status and an own code field,
including when code is undefined. `new V2Error(status, code, message?, extra?)`
uses `message ?? code` for the native Error message and retains status, code and
the exact extra-data reference. For example, `new V2Error(409, "conflict")` has
message `conflict`; an explicit empty message stays empty. Both classes inherit
Error's ordinary name and preserve native subclassing and field assignment.
Metadata wrappers are new, while constructors and prototypes are shared. Factory
instances use exactly that shared `V2Error` constructor.

## Development

Read the [framework flow](framework-flow.md) and [project map](project-layout.md).
Run `litai project validate` and `litai lock --check`. After host execution
authorization, use `CODING_CLI=codex litai rebuild components/http-errors --target
host --allow-host-execution --update-receipt`. The reported artifact and locked
import surface define the package files. All nine independent batches must pass.

Source qualification additionally requires TypeScript 5.9.3's `tsc` on PATH.
It compiles only the two immutable original files at the existing ES2017 target
inside a disposable directory. Use the retained application's installed compiler
when running qualification. The generated JavaScript API and independent package
acceptance do not invoke or require the TypeScript compiler. Physical stack frame
paths and built-in Error's static property order are host details; class identity,
inheritance, fields, descriptors, message behavior and original errors are checked.
