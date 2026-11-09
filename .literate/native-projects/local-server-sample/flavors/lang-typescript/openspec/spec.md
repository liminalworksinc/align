# Typescript implementation Flavor

## ADDED Requirements

### Requirement: language-binding Flavor proposal [flavor-statement:observation:language-javascript:b45441eccd3ba9b98c7c]

The typescript binding at lib/v2/sample.ts declares createSampleWorkspace.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The typescript binding at lib/v2/sample.ts declares createSampleWorkspace.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:2fae3130c33320f2b584]

The binding declares the public symbol createSampleWorkspace.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol createSampleWorkspace.
