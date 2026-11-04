// The record's words for where an approved change request stands toward agents (LAUNCH-001), shared by the web app's
// change request card and value card and the MCP text summaries, so a person and an agent read the same sentence.
// Align records which version it delivered, never what an agent did: none of these says an agent executed anything.
// Plain module (no server imports), so client components can load it.

export type LaunchWord = "pending" | "not_yet" | "launched" | "superseded";

/** "Approved, agents still on v<n> until launch" (n the request's base version, which the goal is still at), "Launched,
 *  agents on v<n+1>" (the launched version), or the superseded-before-launch line; null before approval. */
export function launchWords(launch: LaunchWord | null, baseVersion: number, version: number | null): string | null {
  if (launch === "pending" || launch === "not_yet") return `Approved, agents still on v${baseVersion} until launch`;
  if (launch === "launched") return `Launched, agents on v${version ?? baseVersion + 1}`;
  if (launch === "superseded") return "Superseded before launch: it never reached agents.";
  return null;
}
