// Typed connection to the qualified migration coordinator; no storage algorithm.
import * as native from "./native/.bindings/migration_coordinator.js";

export interface MigrationContext {
  changeCount: number;
  readVersion(): number;
  setReferences(enabled: boolean): void;
  begin(): void;
  apply(version: number): void;
  brokenReferences(): number;
  referenceError(version: number, count: number): unknown;
  writeVersion(version: number): void;
  commit(): void;
  rollback(): void;
  complete(): void;
}

export const applyMigrations = native.apply_migrations as (context: MigrationContext) => void;
