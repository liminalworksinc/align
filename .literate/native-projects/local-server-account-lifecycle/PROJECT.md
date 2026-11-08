# Account and membership lifecycle

This library preserves the complete public account and membership-cleanup
surfaces. The Component owns account decisions, transactional cleanup, session
revocation and exact failure propagation. Its Node target owns resource capture,
synchronous and asynchronous calling conventions, SQL bindings and packaging.

`create_account` captures 21 caller-owned resources and exposes seven operations.
`create_lifecycle` captures six resources and exposes two synchronous operations.
Construction reads each resource once without invoking or validating it. Callers
retain the SQL handle, transaction owner, public errors and dependent services.

Source snapshot:
`sha256:541500cb8d88351f40572a2945b8fb9af63f20749abb3db658f5058bed83446c`.
Two independent clean macOS generations passed four acceptance batches each.
Both actual requests were inspected while live. Retained evidence hashes and
the typed materialization audit were verified. The materialization audit covers
the promoted read closure and does not prove identical provider prompts.

A distinct forced generation passes 8 generated smoke tests and ordinary
independent acceptance. Its admitted package passes 50 public observations,
77 binding checks and seven adaptive fault operations on macOS and Linux. The
50 observations include eleven provider-table boundary and rollback cases.
All 47 reviewed authority files remain exact.
The verifier rejects 18 binding, ten semantic, fourteen package, 23 protocol and
three provider-table controls on each host. Four positive module formats pass.

Qualification decision: `sha256:4c8e427f7b52740ab0c888a752aa9f49d1921ff6b50f9f2a02f2a0e3e68e4211`.
See [active work](docs/roadmap/active-work.md). The consuming project still owns
ready-child registration, actual typed imports, cyclic module loading, configured
authentication/store/dependency composition and full application/image acceptance
before original source authority is retired. Complete identity, all 31 native
boundaries and public tester/security/live smoke requirements remain open.
