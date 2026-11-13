# Shared promise queues

A JavaScript callback queue shared across modules in one process. Requests with
the same key run in order; different keys can progress independently. The API
preserves callback results, original errors and queue cleanup without I/O.

See the [project guide](docs/README.md), [API and availability](docs/user/getting-started.md)
and [qualification queue](docs/roadmap/active-work.md). Both clean qualification
builds and the admitted build pass all independent batches. Application
integration and source retirement remain with the parent ADOPT-002 queue.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
