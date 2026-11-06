// Typed public names for the independently qualified wording library.
import * as native from "../native/.bindings/wording.js";

// The record's words for where an approved change request stands toward agents (LAUNCH-001), shared by the web app's
// change request card and value card and the MCP text summaries, so a person and an agent read the same sentence.
// Align records which version it delivered, never what an agent did: none of these says an agent executed anything.
// Plain module (no server imports), so client components can load it.
export type LaunchWord = "pending" | "not_yet" | "launched" | "superseded";

export const launchWords = native.launch_words as (launch: LaunchWord | null, baseVersion: number, version: number | null) => string | null;
