# Typescript implementation Flavor

## ADDED Requirements

### Requirement: language-binding Flavor proposal [flavor-statement:observation:language-javascript:65f87451ed7b56b40178]

The typescript binding at lib/v2/core.mts declares serverSecret.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The typescript binding at lib/v2/core.mts declares serverSecret.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:54e981d59e19364b9f2d]

The binding declares the public symbol serverSecret.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol serverSecret.
