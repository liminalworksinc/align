# Security policy

## Reporting a vulnerability

Email **[SECURITY CONTACT EMAIL]**. Please don't open a public issue or pull request for a security problem.

Include what you can:

- what is affected: the hosted service (its address), the web app, the API, the MCP endpoint, the `align` CLI
  (`packages/align-agent`) or `align-connect`;
- the steps to reproduce it, and what an attacker could gain;
- any proof of concept, and the version or commit you tested.

We will acknowledge your report, keep you told of progress, and credit you when the fix ships if you want to be
credited. There is no bug bounty.

## Testing in good faith

Test only against your own account and workspaces, or a server you run yourself (local mode runs on your own machine:
see `README.md`). Don't access or change other people's data, don't degrade the service for others (no denial of
service or load tests), and don't use social engineering or physical attacks. Give us a reasonable time to fix a
problem before you disclose it. We will not pursue anyone who follows these rules in good faith.

## Supported versions

The hosted service and the latest commit of the default branch. Fixes are not backported.

## More

How Align protects data, and what it does not do yet: `docs/trust/security-overview.md` (also published at `/trust`).
