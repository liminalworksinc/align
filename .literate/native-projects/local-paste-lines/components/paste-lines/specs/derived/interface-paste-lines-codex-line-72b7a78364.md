# Public interface: paste-lines.codex-line

## ADDED Requirements

### Requirement: paste-lines.codex-line

JavaScript module paste_lines/codex_line. It exports one function, codex_line(url), that returns the one terminal line a person pastes to add Align to Codex (the CLI, the IDE extension and the desktop app's Codex mode); Codex starts the sign-in itself.

codex_line(url) takes a string. When safe_mcp_url(url) (the paste-lines.safe-mcp-url capability) returns null, it returns null. Otherwise it returns the string codex mcp add align --url , followed by shq(url) (the paste-lines.shq capability), with exactly one space before shq(url) and nothing after it. Example: for https://align.example.com/api/mcp it returns codex mcp add align --url 'https://align.example.com/api/mcp'. No workspace, team or company name ever appears in the line. It has no side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:81632c69b2e209e90623`
