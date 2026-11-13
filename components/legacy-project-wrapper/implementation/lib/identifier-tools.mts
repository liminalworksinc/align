// Bind actual host resources once; the qualified service supplies the helper algorithms.
import { createHash, randomBytes } from "node:crypto";
import * as native from "./native/.bindings/identifier_tools.js";

type IdentifierTools = {
  rand32: (bytes?: number) => string;
  newId: (prefix: string) => string;
  secretToken: (bytes?: number) => string;
  sha256hex: (value: string | Buffer) => string;
  nowIso: () => string;
};

export const identifierTools = native.create_identifiers({
  randomBytes: (bytes: number) => randomBytes(bytes),
  createHash: (algorithm: string) => createHash(algorithm),
  newDate: () => new Date(),
}) as IdentifierTools;
