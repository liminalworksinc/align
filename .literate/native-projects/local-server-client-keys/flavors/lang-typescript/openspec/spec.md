# Typescript implementation Flavor

## ADDED Requirements

### Requirement: language-binding Flavor proposal [flavor-statement:observation:language-javascript:72d3ed3cc7d20582de5d]

The typescript binding at lib/ratelimit.ts declares clientNet, clientOf.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The typescript binding at lib/ratelimit.ts declares clientNet, clientOf.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:4aa87a2d3481578151a7]

The binding declares the public symbol clientNet.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol clientNet.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:8711b5fed3ca1e038f90]

The binding declares the public symbol clientOf.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol clientOf.
