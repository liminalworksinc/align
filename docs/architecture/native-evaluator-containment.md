# Native evaluator containment

The normal review of checkpoint `51dd7e5e4c8ead355655f865987da415750abfcd`
reported host-function escapes in the workspace-administration and
goals/deliberation evaluators. A benign reproduction recovered a newly owned
public environment canary through `require`, `module` and resource function
constructors. Both historical evaluators remain readable and unchanged.

All 68 registered libraries now have authored acceptance oracles selecting the
project-owned contained adapter. The existing 1,259 batches pass against their
unchanged accepted packages. The workspace-administration SDK rebuild reused its
qualified source and passed current acceptance. The other 67 current receipts
and the application verification copies remain pending. The first older-library
rebuild did not match its historical derivation key and began generation; that
attempt was stopped before any receipt update. The documented accepted-source
mode then refused that historical member. No cache key, framework pin, receipt
or acceptance result was rewritten to bypass either gate. This remains a local
authored correction until normal integrated acceptance and publication pass.

The adapter copies only the declared two-file candidate package into a fresh
snapshot, preserves the historical verifier bytes under their SHA-256 identity,
and runs its standard CLI in an official Node image pinned by a multi-platform
image digest. Candidate JavaScript executes only in the container. The host adapter
does not load or compile candidate code.

The container has no network, a read-only root and input mount, user 65532, no
Linux capabilities, no permission escalation and 64 processes. Ordinary libraries
are capped at two CPUs and 768 MiB of memory. The exhaustive, stateless field
validators retain their existing eight test threads and use up to four available
CPUs and 1,536 MiB. These limits use existing daemon capacity without changing VM
settings. Writable temporary storage is bounded to 128 MiB; the original SQLite
sample fixture exceeds the initial 16 MiB limit. No host
environment variables, home directory, credentials or Docker socket are mounted
or forwarded. A separate PID 1 timeout process enforces a 50-second worker
deadline, or 120 seconds for the exhaustive validators. The SDK
independently retains its 60-second acceptance-command deadline. The validator
run took 50.375 seconds on the existing four-core VM; a slower host may fail that
SDK gate. The adapter bounds output to four MiB, removes its owned container and
snapshot, and fails closed when its pinned
image or Docker is unavailable. It has no host-execution fallback. Provision the
pinned image explicitly; verification never pulls it silently.

The SDK removes `DOCKER_HOST` from independent-verifier environments. This session
uses a private task-local Docker client wrapper on `PATH` to select the existing
SSD-backed default daemon. The active Docker context and global configuration
remain unchanged. Endpoint and executable paths are not committed.

The shared source is
[`contained-oracle-template.cjs`](../../tools/native-rewrite/contained-oracle-template.cjs).
[`contain-library-oracle.py`](../../tools/native-rewrite/contain-library-oracle.py)
creates each self-contained readable verifier. The existing project oracle
authoring command binds its identity to the unchanged typed cases. Accepted
source entries and historical qualification receipts are never rewritten.

[`test-contained-oracle.mjs`](../../tools/native-rewrite/test-contained-oracle.mjs)
executes all three workspace-administration batches and all four
goals/deliberation batches. The batches retain their 45 and 69 original-backed
observations. Additional candidate probes use the actual historical loaders and
attempt to recover only newly created public canaries. Through all three
constructor paths, the host environment canary is absent; the outside canary
file and Docker socket are absent; a candidate write fails with `EROFS`; and the
process reports UID 65532. The controls also verify that missing Docker and
symlink candidates fail closed. CI provisions the exact image and runs these
controls.

New qualification profiles can load the readable, hash-pinned
[`contained-profile-bootstrap.cjs`](../../tools/native-rewrite/contained-profile-bootstrap.cjs)
through their existing short loader and relative command arguments. It snapshots only hash-pinned
driver/manifest inputs and declared package members. Generated mode excludes the
original implementation and source references. Source mode additionally copies
the explicitly pinned original reference and raw source. The profile adapter has
a 50-second independent worker deadline, a 60-second client deadline, and uses
the same restricted image. The current-main
directive profile has passed its build, original-source and generated-reference
modes with 84 observations in this container. Its owned public probes verify
three absent host environment values, an absent outside file, absent original
algorithm in generated mode, an absent Docker socket, read-only candidate input,
loopback-only interfaces and UID 65532. Missing Docker and symlink input fail
closed. These checks exercised the macOS launcher with Linux compute; a separate
Linux launcher run is not claimed.

This change does not retrospectively isolate historical qualification, generated
tests or Standard build commands. Future qualification of the two reported route
components must use contained profile execution before it is described as
isolated. VM checks still supply behavioral
restrictions inside the evaluator; they are not a security boundary. A candidate
that compromises its evaluator process may read that container's public test
inputs. This design does not claim resistance to forged acceptance evidence from
a deliberately malicious candidate or protection against container-engine/kernel
defects.

Owned deadline controls also verified that an infinite loop, including one that
tries to stop its PID 1 monitor, is killed and its container removed. The Linux
[PID namespace contract](https://man7.org/linux/man-pages/man7/pid_namespaces.7.html)
describes the init process and signal restrictions used here.

Current integrated application/image acceptance, normal review and operator
security review remain pending. The three newest findings, and all 23 earlier
findings, remain undecided.

References: [Node VM documentation](https://nodejs.org/api/vm.html) and
[Docker container execution](https://docs.docker.com/engine/containers/run/).
