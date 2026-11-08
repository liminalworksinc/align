# Storage runtime

This project owns the bound storage service used by Align. The Component defines
resource binding, shared connections, prepared operations, atomic callbacks,
migration delegation, live-workspace conditions and audit recording. The selected
Node SQLite Flavor supplies the existing database adapter's thirteen public
exports and concrete backend requirements.

The qualified schema provider, migration coordinator and wording provider retain
their own authority. The service captures those dependencies through ordinary
resource callbacks. Other application responsibilities remain with their owners.

The source snapshot is
`sha256:96bcbb919830a6d4d68bb501560b7bf27acccc2d17eeeef9bcd1f015f005cc7a`.
Two distinct clean source-free generations pass all 44 independent cases each.
The original 43 source cases include real filesystem and SQLite operations on
macOS and Linux; the additional case verifies constructor resource capture and
binding-local transaction state. Private full-record digests preserve fractional
retry observations in the canonical public oracle.

The local qualification decision is
`sha256:e0ce553b77b0759accd231fb4332ba2da10b3f1d63f5637bdfe8a7e7d28a2f76`.
Separate admitted generation, current-receipt and onboarding checks are tracked
in [active work](docs/roadmap/active-work.md). Application-wide acceptance and
publication belong to the consuming project.
