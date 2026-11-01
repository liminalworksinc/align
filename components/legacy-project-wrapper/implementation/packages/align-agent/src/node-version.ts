// The supported Node version (package.json engines). Hook-safe: no imports.

export const MIN_NODE = 24;

/**
 * Null on a supported Node; otherwise one sentence saying which Node runs and what is needed. ALIGN_ALLOW_UNSUPPORTED_NODE=1
 * skips the check (development and CI on an older Node; the agent is not supported there).
 */
export function unsupportedNode(env: NodeJS.ProcessEnv = process.env): string | null {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= MIN_NODE || env.ALIGN_ALLOW_UNSUPPORTED_NODE === "1") return null;
  return `Align needs Node ${MIN_NODE} or later, and ${process.execPath} is Node ${process.version}`;
}
