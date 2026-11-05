import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

from literate_ai.contracts import ContentIdentity
from literate_ai.contracts.standard_lifecycle_membership import StandardNodeFailureEvidence, StandardNodeFailurePhase

spec = importlib.util.spec_from_file_location("litai_local", Path(__file__).with_name("litai-local.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PortableDiagnosticTests(unittest.TestCase):
    def test_invalid_diagnostic_is_redacted_without_changing_failure(self):
        identity = ContentIdentity.parse_uri("sha256:" + "a" * 64)
        for text in ("secret: raw-value", "/private/workspace/file", "x" * 8193):
            with self.subTest(text=text[:40]), patch.object(module, "_original_diagnostic", return_value=text):
                evidence = StandardNodeFailureEvidence(
                    identity, StandardNodeFailurePhase.TEST, "test.failed", identity,
                    module.portable_diagnostic(ValueError("failure")),
                )
                self.assertEqual(evidence.code, "test.failed")
                self.assertNotIn("raw-value", evidence.diagnostic)
                self.assertNotIn("/private/", evidence.diagnostic)
                self.assertLessEqual(len(evidence.diagnostic), 8192)

    def test_public_diagnostic_is_preserved(self):
        with patch.object(module, "_original_diagnostic", return_value="Build failed: invalid export"):
            self.assertEqual(module.portable_diagnostic(ValueError()), "Build failed: invalid export")


if __name__ == "__main__":
    unittest.main()
