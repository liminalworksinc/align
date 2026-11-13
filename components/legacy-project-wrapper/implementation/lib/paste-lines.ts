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

/** A published align CLI release (LIM-2504): its version and the sha256 of its tarball, from the release workflow's
 *  output (.github/workflows/agent-release.yml) after the founder checks its attestation. */
export interface AgentRelease {
  version: string;
  sha256: string;
}

/** THE SWITCH. null until a release `agent-v<version>` carrying `liminal-align-agent-<version>.tgz` exists; until then
 *  the Apps tab keeps its current steps (no step 4), never a link that 404s. Set it in the same change that follows the
 *  founder publishing the release (packages/align-agent/README.md, "Publishing a release"). */
export const AGENT_RELEASE: AgentRelease | null = null;

export const AGENT_REPO = "https://github.com/liminalworksinc/align";
/** Where an installed `align` signs in by default (packages/align-agent/src/context.ts HOSTED_SERVER). */
export const HOSTED_ORIGIN = "https://align-pg-draft.fly.dev";

const VERSION = /^\d+\.\d+\.\d+$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** The tarball's file name and pinned URL (never `latest`), or null for a release that isn't well formed. */
export function agentTarball(r: AgentRelease | null): { file: string; url: string } | null {
  if (!r || !VERSION.test(r.version) || !SHA256.test(r.sha256)) return null;
  const file = `liminal-align-agent-${r.version}.tgz`;
  return { file, url: `${AGENT_REPO}/releases/download/agent-v${r.version}/${file}` };
}

/**
 * The Apps tab's step 4 line, or null: no release set (or one that isn't well formed), or a URL Align couldn't have
 * made. Fetch the pinned tarball, check its sha256 (shasum stops the line on a mismatch, before npm runs), install
 * that file, add the hooks, pair: a plain `align login` on the hosted server, `--server '<origin>'` (from the checked
 * MCP URL, single-quoted) elsewhere.
 */
export function agentInstallLine(url: string, release: AgentRelease | null = AGENT_RELEASE): string | null {
  const u = safeMcpUrl(url);
  const t = agentTarball(release);
  if (!u || !t || !release) return null;
  const origin = u.slice(0, -"/api/mcp".length);
  const login = `align install && align login${origin === HOSTED_ORIGIN ? "" : ` --server ${shq(origin)}`}`;
  return `curl -fsSLO ${t.url} && echo '${release.sha256}  ${t.file}' | shasum -a 256 -c && npm install -g ./${t.file} && ${login}`;
}
