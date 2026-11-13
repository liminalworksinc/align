# Public interface: server-workspace-admin-routes.create-workspace-admin-routes

## ADDED Requirements

### Requirement: server-workspace-admin-routes.create-workspace-admin-routes

# Workspace administration HTTP routes

This B19 library owns the current v2 workspace administration behavior at source pin `ba43c5b28cc0620472b4a09ab699fbc529c1afcb`. Its source contains the eleven canonical route files and sixteen method exports. The three existing v2 pods route modules remain Next re-exports of the corresponding team handlers. Their live callers and response behavior remain covered by the integration controls.

Preserve credential and workspace admission, path validation, request bounds, recent sign-in order, domain arguments and response formatting. Workspace ownership, membership, invite eligibility, workspace restoration, creation caps and sample creation stay with the current v2 services. Use the current v2 workspace creation service through the host interface.

The private profile contains 29 original canonical-handler observations. Three additional original controls compare the pods re-exports with their canonical team handlers. Check the generated package and actual typed Next entry points before the integrated application and image acceptance run.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:14afe48de58a79d82676`, `evidence:4273b6e0bb4982ee8b4e`, `evidence:45d6db1b24b6813aa141`, `evidence:46bf34d1700084ad904b`, `evidence:6253a11b48530890dd03`, `evidence:6ccd2d43d70707eb60fe`, `evidence:7763d2b1528bb0c1a93d`, `evidence:7ab9b9c3a4e3ff9a5d41`, `evidence:7bc54291cdaa90d9a9ff`, `evidence:bfb3e365d9ac57556bc0`, `evidence:cce4d5a27f8de38adc69`
