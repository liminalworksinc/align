# Identifier Tools

This project supplies the `local/identifier-tools` library. It binds the existing
identifier helpers to caller-owned entropy, hashing and current-date resources.
The portable behavior is in [the Component](components/identifier-tools/component.md).
Implementation and acceptance progress is in [the work queue](docs/roadmap/active-work.md).

The Node import surface is `identifier_tools/create_identifiers`, exporting
`create_identifiers(context)`. The constructor takes the real `randomBytes`,
`createHash` and `newDate` callbacks and returns `rand32`, `newId`, `secretToken`,
`sha256hex` and `nowIso`. Construction makes no resource calls. The original
method names, required arities, byte-count defaults and resource failures remain
part of the contract.

Two distinct clean qualifications pass 51 cases and 166 observations each.
A separate freshly generated admitted package passes the same cases on macOS
and Linux. Actual proposed TypeScript consumers preserve all 143 original
observations, including the core and ID modules' shared function identity.
Their public types remain assignable in both directions under strict checking.

The Node-only operator assembles the three exact settings, value and identifier
packages. Fifteen real command scenarios match on macOS and Linux from read-only
non-root checkouts, including code creation, workspace purge and failure rollback.
SIGTERM, SIGINT and SIGHUP preserve their exit signals during preparation and a
database lock, with owned process groups stopped and temporary files removed.
The runtime image passes all 36 checks and matches the exact 29-file operator
closure. These fixtures use only synthetic data and deny network requests.

The parent application retains its other core responsibilities and complete
integration acceptance. Parent publication, the full native rewrite and public
tester readiness remain with the parent's ADOPT-002 program.

For contributor checks, use the installed runtime selected for this project:

```sh
litai project validate
litai lock components/identifier-tools --target identifier-tools-host-v1 --check
litai plan components/identifier-tools --target identifier-tools-host-v1
litai verify --json
litai project agent-entrypoints .
```

Read [SKILL.md](SKILL.md) before changing authority or running the generated host
lifecycle. Change the Component or selected Flavor to change behavior, and use
the normal CLI to refresh locks, generation, acceptance and receipts.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
