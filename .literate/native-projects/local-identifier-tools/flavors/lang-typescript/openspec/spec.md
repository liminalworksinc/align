# Typescript implementation Flavor

## ADDED Requirements

### Requirement: language-binding Flavor proposal [flavor-statement:observation:language-javascript:a47cecda91b9e7a8870f]

The typescript binding at lib/v2/core.mts declares rand32.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The typescript binding at lib/v2/core.mts declares rand32.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:85678d04468ada84dd28]

The binding declares the public symbol rand32.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol rand32.

### Requirement: language-binding Flavor proposal [flavor-statement:observation:language-javascript:98f33ea7c07ded96d3fc]

The typescript binding at lib/v2/ids.ts declares no statically public symbols.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The typescript binding at lib/v2/ids.ts declares no statically public symbols.
