"""Failure cases for the local metadata transaction, using framework stores."""
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from literate_ai.adapters.conversion_authority import FilesystemConversionAuthorityStore
from literate_ai.contracts import ContentIdentity, canonical_json_bytes
from literate_ai.contracts.operator_adoption import ConversionAuthorityStage, ConversionAuthorityState

spec = importlib.util.spec_from_file_location(
    "register_child", Path(__file__).with_name("register-qualified-child.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RegistrationTransactionTests(unittest.TestCase):
    def setUp(self):
        self.scratch = TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name).resolve()
        self.child = self.root / ".literate/native-projects/child"
        self.child.mkdir(parents=True)
        self.project = SimpleNamespace(root=self.root)
        self.registry = self.root / ".literate/native-projects.json"
        self.registry.write_bytes(b'{"projects":[],"schema":"literate-ai/adopted-native-projects@1"}\n')
        self.state = ConversionAuthorityState(
            project_id="parent", stage=ConversionAuthorityStage.QUALIFIED,
            evidence_identities=(ContentIdentity.parse_uri("sha256:" + "a" * 64),),
            prior_state_identity=ContentIdentity.parse_uri("sha256:" + "b" * 64),
        )
        self.store = FilesystemConversionAuthorityStore(self.root)
        self.store.path.write_bytes(canonical_json_bytes(self.state.to_dict()) + b"\n")
        self.before = (self.registry.read_bytes(), self.store.path.read_bytes())
        self.approved = {"expected_evidence": ["sha256:" + "a" * 64]}
        self.load = patch.object(module, "load_project", return_value=self.project)
        self.load.start()
        self.addCleanup(self.load.stop)

    def assert_unchanged(self):
        self.assertEqual(self.before, (self.registry.read_bytes(), self.store.path.read_bytes()))

    def test_stale_plan_cannot_change_metadata(self):
        with patch.object(module, "plan_addition", return_value={"different": True}):
            with self.assertRaisesRegex(ValueError, "stale"):
                module.apply_addition(self.root, self.child, self.approved)
        self.assert_unchanged()
        self.assertFalse((self.root / ".literate/native-additions").exists())

    def test_registration_failure_restores_both_metadata_files(self):
        def fail_after_write(*args):
            self.registry.write_text('{"partially-written":true}\n')
            raise RuntimeError("injected registration failure")
        with patch.object(module, "plan_addition", return_value=self.approved):
            with patch.object(module, "_register_native_project", side_effect=fail_after_write):
                with self.assertRaisesRegex(RuntimeError, "registration failure"):
                    module.apply_addition(self.root, self.child, self.approved)
        self.assert_unchanged()
        self.assertEqual(len(list((self.root / ".literate/native-additions").glob("*/rolled-back"))), 1)

    def test_revalidation_failure_restores_both_metadata_files(self):
        def register(*args):
            self.registry.write_text('{"new-registry":true}\n')
        with patch.object(module, "plan_addition", return_value=self.approved):
            with patch.object(module, "_register_native_project", side_effect=register):
                with patch.object(module, "evidence_for_conversion_stage", side_effect=ValueError("unqualified child")):
                    with self.assertRaisesRegex(ValueError, "unqualified"):
                        module.apply_addition(self.root, self.child, self.approved)
        self.assert_unchanged()

    def test_retry_preserves_each_rolled_back_attempt(self):
        def fail_after_write(*args):
            self.registry.write_text('{"partial":true}\n')
            raise RuntimeError("transient registration failure")
        with patch.object(module, "plan_addition", return_value=self.approved):
            with patch.object(module, "_register_native_project", side_effect=fail_after_write):
                for _ in range(2):
                    with self.assertRaisesRegex(RuntimeError, "transient"):
                        module.apply_addition(self.root, self.child, self.approved)
                    self.assert_unchanged()
        self.assertEqual(len(list((self.root / ".literate/native-additions").glob("*/rolled-back"))), 2)

    def test_postpublication_failure_restores_prior_authority(self):
        with patch.object(module, "plan_addition", return_value=self.approved):
            with patch.object(module, "_register_native_project"):
                with patch.object(module, "evidence_for_conversion_stage", return_value=self.state.evidence_identities):
                    with patch.object(module, "require_current_qualified_conversion_authority", side_effect=ValueError("invalid renewal")):
                        with self.assertRaisesRegex(ValueError, "invalid renewal"):
                            module.apply_addition(self.root, self.child, self.approved)
        self.assert_unchanged()


if __name__ == "__main__":
    unittest.main()
