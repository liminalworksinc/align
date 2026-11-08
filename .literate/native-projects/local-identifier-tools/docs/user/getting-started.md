# Getting started

[Project guide](../README.md) → getting started

## Purpose and availability

Identifier Tools supplies `rand32`, `newId`, `secretToken`, `sha256hex` and
`nowIso` through the `local/identifier-tools` library. The parent application
binds its actual crypto and date resources, retains its public TypeScript types,
and owns its database, files and operator commands.

There is no separately published npm package, standalone end-user command or
public service. This local provider is being integrated into its parent. The
remaining operator closure and onboarding gates are recorded in
[ONBOARD-001](../roadmap/active-work.md). Parent deployment is separate.

## Runtime and consumption

The selected target is `identifier-tools-host-v1`. Its package uses JavaScript
and the parent's Node 24 or newer runtime. It requires the actual
`randomBytes`, `createHash` and `newDate` callbacks. The library has no credentials,
persistent files, network service, startup daemon or database of its own.

The parent uses the normal qualified-package admission and native assembly
commands to materialize its accepted package and namespace binding. After that
assembly creates `lib/native/.bindings/identifier_tools.js`, a module under the
parent's `lib` directory can bind real resources:

```js
import { createHash, randomBytes } from "node:crypto";
import { create_identifiers } from "./native/.bindings/identifier_tools.js";

const ids = create_identifiers({
  randomBytes,
  createHash,
  newDate: () => new Date(),
});
const id = ids.newId("u");
if (!/^u_[a-z2-7]{24}$/.test(id)) throw new Error("Invalid identifier format");
```

The expected result is `u_` followed by 24 lowercase unpadded base32 characters.
Each call obtains fresh entropy. Construction makes no resource calls. The
parent keeps the same `rand32` function reference in its core and ID modules.
Actual typed consumers preserve all 143 original observations on macOS and
Linux; operator package acceptance is still open in the linked work item.

## Contributor workflow

Read `SKILL.md` and the Component before changing intent. Inspect
current authority without executing generated source:

```console
litai project validate
litai lock components/identifier-tools --target identifier-tools-host-v1 --check
litai plan components/identifier-tools --target identifier-tools-host-v1
litai verify --json
litai project agent-entrypoints .
```

An authorized lifecycle uses `litai rebuild components/identifier-tools --target
identifier-tools-host-v1` with the required host-execution acknowledgement. Use
the installed CLI's help for cache, output and receipt options. Keep generated
source replaceable and use normal CLI admission for every accepted package.
Do not repair generated code, locks, receipts, qualified heads or cache blobs by
hand. An upgrade or rollback belongs to the parent's reviewed package selection;
this project installs no global command or service to uninstall.

Read [framework flow](framework-flow.md), [project layout](project-layout.md) and
[security](security.md) for contributor responsibilities.
