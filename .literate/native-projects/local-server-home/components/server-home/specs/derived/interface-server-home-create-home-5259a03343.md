# Public interface: server-home.create-home

## ADDED Requirements

### Requirement: server-home.create-home

# Workspace Home read model

Provide `server-home.create-home`, a library that reads the existing workspace
Home model through supplied services. It assembles what needs the reader, what
waits on others, the reader's latest declined requests on active goals, active
goals and connected applications. It writes no records and infers no delivery.

The caller owns principal identity, goal and connected-app readership, approval
and launch rules, existing domain views, names, configuration and logging. The
library preserves ordering, ownership classification, current request selection,
metadata and the boundary between a failed section and an empty successful read.
A section that cannot be read is unknown, represented by null. A logger or
configuration failure inside that failure handler keeps its original propagation.

Keep the supplied transition helpers authoritative. Preserve approval separately
from launch and connection use separately from an observed goal-content read.
Preserve all seven existing public caller types and the synchronous Home method.
The Node target defines the package, exact supplied resources, result shapes,
read order, query and failure behavior. No ambient database, network, subprocess,
clock or independent permission logic belongs in this library.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:e23fa20be0662ca611dd`
