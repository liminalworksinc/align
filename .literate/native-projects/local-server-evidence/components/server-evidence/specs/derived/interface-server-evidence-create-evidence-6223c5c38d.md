# Public interface: server-evidence.create-evidence

## ADDED Requirements

### Requirement: server-evidence.create-evidence

# Evidence links and recorded goal snapshots

Validate and project advisory evidence links, and record the goal facts supplied
by the consuming service when a request revision is written. Link permission,
revision limits, persistence, approval and transaction ownership remain with that
service. No link is fetched, checked for truth or described as verified.

Keep the six link kinds and the ten-link constant. Accept only parsed HTTPS URLs
with a hostname, no user name or password, and the original raw/normalized length
checks. Preserve delegated kind and text validation, the one-line label rule and
the existing refusal messages. Query evidence in revision/time/id order, preserve
the original returned rows, and project each link with the supplied person name,
source label and caller-controlled remove flag.

A recorded snapshot contains its recording time, the preceding thirty-day
window, the supplied spend facts, current bound-session count and last activity
across usage, sessions and work signals. It takes none of these facts from a
request body. A read returns null for an absent legacy snapshot. Otherwise parse
it before authorization, preserve its window and other stored facts, and hide
only spend when the supplied workspace spend decision denies it.

Preserve eight runtime exports and five public types, names, arities, live arrays,
resource and property order, references, exact SQL contracts and failure behavior.
Clock and URL constructor lookups remain live caller resources. There is no
ambient IO, network, permission substitute, fallback snapshot or hidden cache.
This Component supplies no admission, B15 closure or public tester acceptance.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:220b62d362ae7c625735`
