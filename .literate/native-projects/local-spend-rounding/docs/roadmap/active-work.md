# Active work

Release scope is recorded in the [release-goal manifest](release-goals.json).

## P0

### [x] DOCS-001 - Reflect the qualified library in its contributor queue

- **Priority:** P1
- **Owner:** components/spend-rounding
- **Direction:** Remove the onboarding placeholder and keep the actual component status and contributor commands accurate.
- **Conclusion:** The library is already qualified and integrated. Preserve its exact lock, protected profile, qualified projection and committed package bytes while repairing owned documentation.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Replace the starter queue with the actual component status, guide links and contributor commands.
- **Evidence:**
  - [x] The normal cached rebuild, verification, project validation and entrypoint audit pass with every protected input and committed cache byte unchanged.

## Qualified component

`local/spend-rounding` is already regeneratively qualified and consumed by the parent.
Its independent profile has 31 batches or direct cases.
Qualified projection: `sha256:87803acf18fc3958f568ae2286ec87ffac8d47021d4661b3c8734963ed4db807`.

See the [API guide](../user/getting-started.md). Contributor checks use the actual component:

```console
litai project validate
litai lock --check
CODING_CLI=codex litai rebuild components/spend-rounding --target host --allow-host-execution --update-receipt
```

The parent owns application integration, source retirement and complete application parity.
