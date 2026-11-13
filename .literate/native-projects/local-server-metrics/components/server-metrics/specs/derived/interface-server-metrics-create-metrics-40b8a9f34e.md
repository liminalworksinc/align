# Public interface: server-metrics.create-metrics

## ADDED Requirements

### Requirement: server-metrics.create-metrics

# Operator metrics

The component supplies content-free operator reports and explicit records of letters
of intent. It preserves the existing report definitions and refused operations.
Reports do not establish project outcomes, product effectiveness or a signed
agreement. A signed-letter record requires the caller to affirm possession of the
verified original. No browser submission or ordinary claim supplies that authority.

The caller supplies the data store, event recorder, accepted estimate categories,
reference grammar and clock. Reporting reads existing records and changes nothing.
Letter recording occurs inside the caller's transaction and records each event at
most once for a workspace. Missing workspaces, invalid references, unverified signed
letters and duplicate records retain their distinct results and refusal precedence.

Workspace funnels and retention cohorts exclude sample workspaces. Weeks begin at
Monday 00:00 UTC. A workspace is active when a session, binding epoch or usage upload,
or an audited action by a person, occurs in that week. An operator action without a
person is excluded from activity. Cohort retention remains unknown until its target
week has ended. Nearest-rank percentiles, null denominators, rounding and date-boundary
semantics remain observable parts of the report.

Report sections preserve their existing populations. In particular, the global
session and usage totals used for goal binding are not silently narrowed to the
workspace creation cohort. Live usage and anonymous retained rollups both contribute.
Workspace-scoped decision-value event counts preserve person/workspace recording
semantics and the first estimate recorded by that person. Value-card access requests
remain global period counts, including requests with no workspace. They use the
same access-event population as the access funnel, without sample or workspace
filters. Estimated spending keeps its existing label.

No report reads or emits a person's name, email, goal title, source note, project
content or agreement document. Opaque workspace identifiers and operator note
references retain their existing limited uses. A caller owns any authentication and
permission to run operator commands; this component creates no public endpoint.

The public report schema, text grammar, supplied-resource interactions and exact
target bindings are specified by the selected target contract. Independent original
observations and mutations are private verification inputs, never generation input.


This capability binds operator metrics, explicit letter recording and the existing report format.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:b50c69eccb263c3e6a7c`
