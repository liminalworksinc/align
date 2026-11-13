# Shell reader

Internal heuristic shell reader for Align hooks. It returns simple command words
and redirections while excluding heredoc bodies and opaque expansions. A second
function removes the exact supported assignment and wrapper prefixes.

The specification and public contracts are in `components/shell-words`. The
independent profile captures 11,108 reference observations across 23 batches.
Specification release authority requires two clean qualification runs. Consumer
integration, source retirement and the complete application receipt follow that
qualification.

See [the project guide](docs/README.md) and [getting started](docs/user/getting-started.md).

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
