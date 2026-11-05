# Shell reader project guide

This internal library reads shell command strings as data for hook hints. It
preserves the existing parser's command order, word pieces, redirections,
heredoc exclusion, expansion markers and malformed-input behavior. It also returns
the command suffix after supported assignments and wrapper names.

Start with [getting started](user/getting-started.md). See
[active work](roadmap/active-work.md) for local work records, the
[framework flow](user/framework-flow.md) for the specification lifecycle and the
[project map](user/project-layout.md) for authority ownership.

The component and its two public contracts live in `components/shell-words`.
Generated source is disposable. Qualification and the independent library oracle
must pass before an application consumes an admitted package.

Contributor references cover [readable specifications](user/specifications.md),
[models and generation](user/models-and-generation.md),
[private test matrices](user/test-matrix.md), [security](user/security.md),
[skill boundaries](architecture/skills.md), the
[authority learning loop](architecture/authority-learning-loop.md), the
[mission-specification map](architecture/mission-specification-composition.md)
and the [traceability rule](architecture/design-traceability.md).
