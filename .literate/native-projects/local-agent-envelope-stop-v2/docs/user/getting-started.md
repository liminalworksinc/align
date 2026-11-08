# Getting started

[Agent Envelope guide](../README.md)

This library supplies Align's session envelope and sharing notices. It includes
persistent workspace stop wording, goal holds, sign-in recovery and lost
workspace notices. Its public interface contracts define optional arguments,
message precedence, mutable data and exact output behavior.

This child is part of Align's native rewrite. It has no separately released
installer or public service. A generated package becomes eligible for Align
consumption only after ordinary source qualification and a current admitted
build pass. Use `litai status` and `litai verify` to inspect that evidence.

From the project root, validate and inspect the declared host recipe:

```sh
litai project validate .
litai lock components/agent-envelope --target host --check
CODING_CLI=codex litai plan components/agent-envelope --target host
litai verify
```

The project defaults select JavaScript and macOS. Host execution requires the
operator's acknowledgement. With that acknowledgement, run the ordinary test
lifecycle:

```sh
litai test components/agent-envelope --target host --allow-host-execution
```

Qualification compares independent clean generations with a separate retained
reference through the pinned profile. The application and public tester checks
remain parent gates. Contributor lifecycle commands do not install or deploy
Align.
