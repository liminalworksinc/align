# Public interface: paste-lines.claude-code-line

## ADDED Requirements

### Requirement: paste-lines.claude-code-line

JavaScript module paste_lines/claude_code_line. It exports one function, claude_code_line(url), that returns the one terminal line a person pastes to add Align to Claude Code for their user (every folder) and start its sign-in.

claude_code_line(url) takes a string. When safe_mcp_url(url) (the paste-lines.safe-mcp-url capability) returns null, it returns null. Otherwise it returns the string claude mcp add --transport http --scope user align , followed by shq(url) (the paste-lines.shq capability), followed by ; claude mcp login align. The pieces are concatenated with no other characters: exactly one space before shq(url), and the text after shq(url) is a semicolon, one space, then claude mcp login align. Example: for http://localhost:3000/api/mcp it returns claude mcp add --transport http --scope user align 'http://localhost:3000/api/mcp'; claude mcp login align. No workspace, team or company name ever appears in the line. It has no side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:81632c69b2e209e90623`
