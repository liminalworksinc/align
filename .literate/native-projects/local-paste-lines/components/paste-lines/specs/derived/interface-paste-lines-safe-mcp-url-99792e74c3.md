# Public interface: paste-lines.safe-mcp-url

## ADDED Requirements

### Requirement: paste-lines.safe-mcp-url

JavaScript module paste_lines/safe_mcp_url. It exports one function, safe_mcp_url(url), that decides whether a string is an MCP URL the Align server could have built, so that only such a URL is ever shown inside a shell command.

safe_mcp_url(url) takes a string and returns url itself, unchanged, when the whole string has exactly this form, and null otherwise:
1. the scheme http:// or https://, in lower case exactly (HTTP://, Https:// and any other scheme give null);
2. a host that is either one or more characters each an ASCII letter A-Z or a-z, an ASCII digit 0-9, a dot or a hyphen, or a bracketed address: [ then one or more characters each an ASCII hexadecimal digit (0-9, a-f, A-F), a colon or a dot, then ];
3. optionally a colon followed by one to five ASCII digits (no range check: :0 and :99999 are accepted, :123456 is not);
4. the path /api/mcp exactly, ending the string: nothing may follow it, not a slash, query, fragment, space or newline.
No other character may appear anywhere: no user info (@), no whitespace, no percent-encoding, no non-ASCII letters, no underscore in the host. Matching is case-sensitive for the scheme and the path. The check is the ECMAScript regular expression /^https?:\/\/(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?\/api\/mcp$/ applied with test() and no flags, so ^ and $ anchor the start and end of the whole string. The function never trims, normalizes or rewrites its input; it returns the identical string or null. It has no side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:81632c69b2e209e90623`
