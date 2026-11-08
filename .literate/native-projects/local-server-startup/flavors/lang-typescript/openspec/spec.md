# Typescript implementation Flavor

## ADDED Requirements

### Requirement: TypeScript source binding with measured export visibility [authored:typescript-startup-public-scope-v1]

The captured TypeScript source binding exports only startup with zero required arguments. The alive and sweepLeftovers declarations are private implementation helpers. Preserve that public binding when this source-language target is selected; private helpers are not additional exports or capabilities.

#### Scenario: Public startup import

- **WHEN** the source-language binding is selected
- **THEN** Expose startup as the sole public source operation; keep alive and sweepLeftovers private.
