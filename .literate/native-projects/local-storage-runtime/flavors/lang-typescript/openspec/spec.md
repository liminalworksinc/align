# Typescript implementation Flavor

## ADDED Requirements

### Requirement: language-binding Flavor proposal [flavor-statement:observation:language-javascript:787708d491164e85c333]

The typescript binding at lib/v2/core.mts declares no statically public symbols.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The typescript binding at lib/v2/core.mts declares no statically public symbols.

### Requirement: language-binding Flavor proposal [flavor-statement:observation:language-javascript:1d14e93e41a8f04becf2]

The typescript binding at lib/v2/db.ts declares V2Db, all, audit, connect, exec, get, lockDown, migrate, openDb, run, stmt, tx.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The typescript binding at lib/v2/db.ts declares V2Db, all, audit, connect, exec, get, lockDown, migrate, openDb, run, stmt, tx.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:7fec62e681f9df609859]

The binding declares the public symbol V2Db.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol V2Db.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:01f90bd8a4a8685defe3]

The binding declares the public symbol all.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol all.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:cf11a6bf90e2183e0c16]

The binding declares the public symbol audit.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol audit.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:ce040ea932b8dc5c59d6]

The binding declares the public symbol connect.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol connect.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:b52dc6a4931f0acd0f5b]

The binding declares the public symbol exec.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol exec.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:7ebe6b5ba6a74f3d272a]

The binding declares the public symbol get.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol get.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:714ce8bcc3eb84079b06]

The binding declares the public symbol lockDown.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol lockDown.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:9ced95d9d2757b97a3f4]

The binding declares the public symbol migrate.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol migrate.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:3ecbba3ce4cf761b2333]

The binding declares the public symbol openDb.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol openDb.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:aac1db065f4f1634c1d5]

The binding declares the public symbol run.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol run.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:23688d0affebf4cf54e0]

The binding declares the public symbol stmt.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol stmt.

### Requirement: public-api Flavor proposal [flavor-statement:observation:api-surface:ba22979f628f4857f4b8]

The binding declares the public symbol tx.

#### Scenario: Target-specific source behavior

- **WHEN** the Flavor is selected
- **THEN** The binding declares the public symbol tx.
