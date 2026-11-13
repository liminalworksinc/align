# Rate Limits

Rate-limit decisions over caller-owned memory and durable stores. The portable
Component defines admission, retry, ordering, key construction and failure
behavior. The Node and SQLite Flavor defines the concrete service and database
mapping.

`rate_limits/create_limiter` exports `create_limiter(context)`. The context
supplies the shared hit Map, clock, signer, database helpers and existing error
constructor. Construction captures those references without invoking them.

The returned service provides `take`, `takeAll`, `retryAfterMs`, `otpEmailKey`,
`accessEmailKey`, `durableRoom`, `durableCount`, `durableRetryAfterMs` and
`takeDurable`. Time arguments remain optional. The caller owns database
transactions. A successful memory admission remains recorded when a later
database operation rolls back.

Successful key admissions restore the 10,000-key memory bound even when the
owner preloads a larger Map. Refusals and retry queries preserve stored state.
The independent acceptance profile covers 45 scenarios and 193 observations,
including original cutoff, duplicate-key, clock, callback and SQLite behavior.

- [Portable Component](components/rate-limits/component.md)
- [Node and SQLite target](flavors/sqlite-rate-limits/flavor.md)
- [Independent acceptance profile](components/rate-limits/qualification/profile.json)
- [Qualification decision](provenance/qualification/5dd64105de9b1f6e659aa3d1f3c0baadf100c102b1ad171973a7d0804a1c7203.json)
- [Current project verification](verification/current.json)
- [Work queue](docs/roadmap/active-work.md)

Use `litai verify --json` for the current declared gates. Align integration and
the complete native rewrite remain tracked under the parent ADOPT-002 program.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
