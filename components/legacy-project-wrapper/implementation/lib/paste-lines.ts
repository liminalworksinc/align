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
