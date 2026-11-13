# Server secret helpers

This project owns the bound server-secret and HMAC helpers used by Align. The
Component defines secret selection, persistence and message authentication. The
Node Flavor maps those behaviors to nine caller-owned environment, path,
filesystem and cryptographic resources.

The public service has two operations: `serverSecret(dataDir, env?)` and
`hmac(secret, payload)`. The configured web facade, authentication's separate
secret, domain prefixes and application/operator integration keep their existing
owners.

Source snapshot:
`sha256:95815013418db1690bae9ad59e34d5e7344f1a5cf63fe0328c86d7fdd92290f6`.
Two distinct clean generations pass 36 independent cases each. Thirty-five
preserve the original helper observations on macOS and Linux; one checks resource
capture and current environment reads for the new binding. A separate admitted
generation passes six generated checks and the ordinary independent acceptance.

Qualification decision:
`sha256:97f9007452de38d31fa88e0726147d132fd55ef5de9ceb28cbb165a54bb5f351`.
Local contributor readiness is tracked in [active work](docs/roadmap/active-work.md).
Application-wide acceptance and publication belong to the consuming project.
