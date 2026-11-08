# Project guide

This library supplies the ordered SQL programs for Align's SQLite store. It
preserves the observed schema, stored data and upgrade behavior of the retained
implementation. The caller owns the database connection and executes the programs.

Start with [getting started](user/getting-started.md) for the callable interface and contributor commands.
See [active work](roadmap/active-work.md) for current development status.

## Development

This project is built with [Literate AI](https://github.com/jordanhubbard/literate-ai).
The [framework flow](user/framework-flow.md) explains the specification-led lifecycle,
and the [project map](user/project-layout.md) identifies the authority for a change.

```mermaid
flowchart LR
    Spec[Component specification] --> Plan[Resolved plan]
    Flavor[Selected Flavors] --> Plan
    Parent[Exact repository ancestor DAG] --> Plan
    Default[Removable +make preference] -.-> Plan
    Skill[Exact skills] --> Plan
    Plan --> Generate[Disposable source]
    Generate --> Verify[Validate, build, and test]
```

See [readable specifications](user/specifications.md),
[models and generation](user/models-and-generation.md),
[private test matrices](user/test-matrix.md),
[security](user/security.md), [skill boundaries](architecture/skills.md), and the
[authority learning loop](architecture/authority-learning-loop.md), the
[mission-specification map](architecture/mission-specification-composition.md), and the
[traceability rule](architecture/design-traceability.md) when those concerns apply.

Initialize from an organization or product repository with
`litai init PATH --from URL[#REVISION]`. Literate AI resolves every ancestor without
executing repository code, then records exact commits and inherited catalog provenance.
Use `litai update` to re-resolve that chain and `litai reparent URL|none` to review an
explicit parent change.
