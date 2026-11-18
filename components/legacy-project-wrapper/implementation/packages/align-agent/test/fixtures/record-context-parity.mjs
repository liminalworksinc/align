// Recording and replay share explicit scripts and the contract observer. No loader or I/O log is needed.
import { runParity } from "./context-parity.mjs";
export const recordContextParity = (reference) => runParity(undefined, reference);
