#!/usr/bin/env python3
"""Run the pinned CLI with conservative portable-diagnostic redaction only."""
from literate_ai.application import standard_project_lifecycle as lifecycle
from literate_ai.contracts.standard_lifecycle_membership import _PRIVATE_PATH, _SECRET

_original_diagnostic = lifecycle._portable_failure_diagnostic


def portable_diagnostic(cause):
    diagnostic = _original_diagnostic(cause)
    # Preserve the original code and phase. The old formatter occasionally
    # produces a diagnostic that its own contract rejects, obscuring the error.
    # Redact that text instead of weakening the contract or leaking its contents.
    diagnostic = _PRIVATE_PATH.sub("<private-path>", diagnostic)
    diagnostic = _SECRET.sub("<redacted>", diagnostic)
    if len(diagnostic) > 8192 or _PRIVATE_PATH.search(diagnostic) or _SECRET.search(diagnostic):
        return "Diagnostic omitted by portable redaction policy."
    return diagnostic


def main():
    lifecycle._portable_failure_diagnostic = portable_diagnostic
    from literate_ai.cli import main as cli_main
    return cli_main()


if __name__ == "__main__":
    raise SystemExit(main())
