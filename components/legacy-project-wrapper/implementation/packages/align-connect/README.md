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

The first time the app starts it, it opens the browser on Align's consent page (`/oauth/authorize`): sign in to
Align if you aren't (a sign-in from the last 15 minutes), choose one of your workspaces, allow read-only access. The app
then reads that workspace as you. It signs in the way Claude Code and Codex do (protected resource metadata, dynamic
registration of a loopback redirect, PKCE S256) and keeps the tokens in `~/.align/connect/<host>.json` (0600),
refreshing them when they expire. Disconnecting the app on the workspace's Apps tab, or leaving the workspace, ends the
sign-in; the next start asks again.

Before it signs in it checks that the Align URL and every OAuth endpoint use https (plain http only on `localhost`,
`127.0.0.1` or `[::1]`) and that the authorization server's `issuer` is exactly the server Align's resource metadata
names. A URL that fails the scheme rule exits with code 2; a metadata check that fails answers the pending request
with JSON-RPC error `-32603` naming the check, and leaves the token file as it was.

- `ALIGN_HOME` moves the token folder (default `~/.align`).
- `ALIGN_CONNECT_NO_BROWSER=1` writes the sign-in URL to stderr (the app's MCP log) instead of opening a browser.
- stdout carries only MCP messages; diagnostics go to stderr.

Checked 2026-10-26 on a local server: Claude Desktop started it, signed in and loaded the five tools (its MCP log);
a Claude Code session using the same command held on a pending proposal and picked up the approved one.
