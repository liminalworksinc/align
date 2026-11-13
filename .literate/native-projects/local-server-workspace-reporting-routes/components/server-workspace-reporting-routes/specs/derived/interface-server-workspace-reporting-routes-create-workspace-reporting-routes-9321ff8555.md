# Public interface: server-workspace-reporting-routes.create-workspace-reporting-routes

## ADDED Requirements

### Requirement: server-workspace-reporting-routes.create-workspace-reporting-routes

# Workspace reporting HTTP routes

This B19 library owns the handler behavior for six workspace reporting route files at Align source pin `ba43c5b28cc0620472b4a09ab699fbc529c1afcb`. It preserves seven method exports for activity, allocation, goal activity, Home, spend and steering. The application keeps its typed Next route entry points and supplies the current HTTP wrapper, workspace admission, field validation, domain operations and web runtime constructors.

Preserve the authenticated principal, workspace admission and path validation order before query parsing, body parsing or domain calls. Keep the existing distinction between cookie-only views, device-only reads and writes, and the allocation view that accepts either credential. Preserve body limits, query defaults, date normalization, response headers, compatibility aliases and error text. Workspace policy, spend aggregation, activity visibility, and steering write authority stay in the domain services.

The private baseline checks all seven methods with 20 original behavior cases. Preserve status, headers, JSON response and the order and arguments of service calls. Compare the generated package against the same observations, type-check the actual Next entry points and include the integrated application and image checks before acceptance.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:140531acafffab6cbe0b`, `evidence:44160c3692dfa1215225`, `evidence:654ae14a9d6952fc01da`, `evidence:96490dc16bd9b6edec90`, `evidence:b57dd975f8f51f6be8a1`, `evidence:dd4f3ae7b1c70c2ecf52`
