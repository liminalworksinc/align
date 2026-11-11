// The terminal lines the Apps tab shows (app/app/w/[ws]/apps/view.tsx). A person pastes them into a shell, so nothing
// that comes from the request (the MCP URL, built from the Host header) may reach the shell as code: the URL is checked
// and single-quoted, and no workspace, team or company name goes into either line. The lines only add Align as an MCP
// server; they write no hooks, no settings file and no AGENTS.md rule (goal context inside sessions comes from the
// align CLI, `align install`). scripts/test-paste-lines.mjs runs them in sh, bash and zsh with hostile URLs.
// No imports, so Node runs this file as is in that test.

/** POSIX single quotes: nothing inside is expanded (no $, `, \, ! or newline handling) in sh, bash or zsh. */
export function shq(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

/**
 * The MCP URL the Apps tab shows, or null if it isn't one Align could have made: http(s), a host of letters, digits,
 * dots and dashes or a bracketed IPv6 address, an optional numeric port, and the path /api/mcp. Anything else (a
 * strict-Host refusal gives http(s)://invalid.invalid, which passes and reaches nothing) shows no command at all.
 */
export function safeMcpUrl(url: string): string | null {
  return /^https?:\/\/(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?\/api\/mcp$/.test(url) ? url : null;
}

/** Claude Code: add Align for this user (every folder), then start the sign-in. */
export function claudeCodeLine(url: string): string | null {
  const u = safeMcpUrl(url);
  return u ? `claude mcp add --transport http --scope user align ${shq(u)}; claude mcp login align` : null;
}

/** Codex (CLI, IDE extension and the ChatGPT desktop app's Codex mode): add Align; Codex starts the sign-in itself. */
export function codexLine(url: string): string | null {
  const u = safeMcpUrl(url);
  return u ? `codex mcp add align --url ${shq(u)}` : null;
}

/** The align CLI as a release asset (LIM-2504): one tarball, no runtime dependencies, Node 24 or later. The stable
 *  `latest/download` name resolves once a release carries the asset; publishing it is the founder's step. */
export const AGENT_TARBALL = "https://github.com/liminalworksinc/align/releases/latest/download/liminal-align-agent.tgz";
/** Where an installed `align` signs in by default (packages/align-agent/src/context.ts HOSTED_SERVER). */
export const HOSTED_ORIGIN = "https://align-pg-draft.fly.dev";

/** Install the align CLI, add its hooks, and pair this machine: on the hosted server a plain `align login`, anywhere
 *  else `--server` with this server's origin, taken from the checked MCP URL and single-quoted. */
export function agentInstallLine(url: string): string | null {
  const u = safeMcpUrl(url);
  if (!u) return null;
  const origin = u.slice(0, -"/api/mcp".length);
  return `npm install -g ${AGENT_TARBALL} && align install && align login${origin === HOSTED_ORIGIN ? "" : ` --server ${shq(origin)}`}`;
}
