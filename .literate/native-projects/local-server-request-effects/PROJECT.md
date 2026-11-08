# Request helper effects

This library provides the complete public helpers from Align's legacy and v2
request modules. The Component owns response mapping, input limits, credential
selection and effect order. The Node target binds existing configuration,
authentication, device, error, readiness and logging providers.

`create_legacy(resources)` returns `handle`, `requireJson` and `cappedJson`.
`create_v2(resources)` returns the fifteen existing v2 helpers. Construction
captures provider handles without invoking them. Authentication, database work,
configuration and endpoint implementations keep their own authority.

Source snapshot:
`sha256:c2abf43c27b37054c1e897e6cc071c46f7c4e529a5b04f3e37d88302b66e3f9b`.
Two distinct clean generations on macOS each pass all 46 independent batches.
Their six generated tests also pass in each run. Source observations match on
macOS and Linux. The verifier rejects 24 behavior, three binding and 19 ambient
controls on each host. A separate admitted generation passes six generated
tests and ordinary independent acceptance. Earlier rejected candidates are
preserved; none is used as the admitted implementation.

Qualification decision: `sha256:2fcd7ef6382d71c016322a93acc4d52c076e19905dd16b1bbaa111a70cb17ede`.
See [active work](docs/roadmap/active-work.md). Application integration, generated
consumer checks on both hosts and full application/image parity remain owned by
the consuming project. This local result does not complete its live tester gates.
