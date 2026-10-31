# align-connect

A local stdio MCP server that relays to Align's MCP endpoint, for apps that run MCP servers on this computer instead of
connecting to a URL from their own cloud: Claude Desktop's `claude_desktop_config.json`, or any stdio-only client.
One file, no dependencies, Node 20+.

```json
{
  "mcpServers": {
    "align": { "command": "/path/to/node", "args": ["/path/to/align-connect.mjs", "https://<align host>"] }
  }
}
```

The first time the app starts it, it opens the browser on Align's sign-in page (`/oauth/authorize`): paste the
workspace link, pick a team, enter that team's passcode, allow read-only access. It signs in the way Claude Code and
Codex do (protected resource metadata, dynamic registration of a loopback redirect, PKCE S256) and keeps the tokens in
`~/.align/connect/<host>.json` (0600), refreshing them when they expire. Restart or Disconnect in the workspace ends
the sign-in; the next start asks again.

- `ALIGN_HOME` moves the token folder (default `~/.align`).
- `ALIGN_CONNECT_NO_BROWSER=1` writes the sign-in URL to stderr (the app's MCP log) instead of opening a browser.
- stdout carries only MCP messages; diagnostics go to stderr.

Checked 2026-10-26 on a local server: Claude Desktop started it, signed in and loaded the five tools (its MCP log);
a Claude Code session using the same command held on a pending proposal and picked up the approved one.
