# Typescript implementation Flavor

## ADDED Requirements

### Requirement: language-binding Flavor proposal [flavor-statement:observation:language-javascript:4e15e69d82ba99174883]

The typescript binding at lib/errors.ts declares HttpError.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The typescript binding at lib/errors.ts declares HttpError.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:48e230f2391c812d2e40]

The binding declares the public symbol HttpError.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol HttpError.

### Requirement: language-binding Flavor proposal [flavor-statement:observation:language-javascript:69fc32c4d754294c13f9]

The typescript binding at lib/v2/errors.ts declares V2Error.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The typescript binding at lib/v2/errors.ts declares V2Error.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:5251c3b2dd0101ba337a]

The binding declares the public symbol V2Error.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol V2Error.
