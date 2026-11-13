# Public interface: server-directives.create-directives

## ADDED Requirements

### Requirement: server-directives.create-directives

# Session directives and delivery receipts

Provide `server-directives.create-directives`, a library for writing structured
session directives, reading a device's feed and ended sessions, and recording
delivery or request-answer receipts. Preserve saved ratified goal snapshots,
binding metadata, typed request and hold payloads, visibility and original wire
shapes. Delivery receipts alone do not establish accepted work or completion.

The application supplies persistence, transaction ownership, identity, workspace
grants, goal readership, request transitions, event recording and clocks. The
library preserves those supplied decisions and their failure identities. It adds
no policy, content read, external IO or independent clock. Writers remain inside
the caller's transaction; receipt processing owns the original supplied
transaction boundaries. A stopped-session answer commits expiry before refusing
the answer, while ordinary delivery receipts remain possible.

Preserve all ten public runtime values and five caller-owned TypeScript types.
The Node target defines their exact import surface, resource capture, function
metadata, default arguments, JavaScript observations and nine SQL programs.
Fresh generation, package and actual application acceptance remain required.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:ca75464d645dc6733292`
