"""Check the project-local instruction and toolchain corrections on every child."""
from pathlib import Path
import importlib.util
import json

ROOT = Path(__file__).resolve().parents[2]
projects = [ROOT] + sorted((ROOT / '.literate/native-projects').iterdir())
assert 'explicit operator authorization covers that specific action' in (ROOT / 'AGENTS.md').read_text()
checked_skills = checked_realizations = 0
for project in projects:
    if not project.is_dir():
        continue
    assert not project.is_symlink()
    for relative, required in [
        ('skills/agent/record-user-directed-work/SKILL.md', 'explicit operator authorization covers that specific comment'),
        ('skills/agent/release-project/advance/SKILL.md', 'specific commit and the specific push before performing either action'),
        ('skills/specification-to-source/go-portable-application/SKILL.md', 'source/tests/'),
    ]:
        file = project / relative
        if file.exists():
            text = file.read_text()
            assert required in text, str(file.relative_to(ROOT))
            if 'go-portable' in relative:
                assert 'source/tests/litai_test.go' not in text
                assert 'source/tests/runtime_tests.go' in text or 'source/tests/litai_runtime.go' in text
            checked_skills += 1
spec = importlib.util.spec_from_file_location('align_host_tools', ROOT / 'tools/native-rewrite/check-host-tools.py')
host_tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host_tools)
effective, checked_realizations = host_tools.effective_requirements(ROOT)
assert effective['git'] == ((2, 47, 0), (3, 0, 0))
assert effective['git-lfs'] == ((3, 2, 0), (4, 0, 0))
assert 'python tools/native-rewrite/check-host-tools.py' in (ROOT / '.github/workflows/litai-verify.yml').read_text()
assert 'check-host-tools.py' in (ROOT / 'AGENTS.md').read_text()
assert not (ROOT / 'tools/native-rewrite/register-qualified-child.py').exists()
contract = (ROOT / '.literate/native-projects/local-spend-meter/components/spend-meter/specs/derived/interface-spend-meter-valid-counts-e1a5dfe9e7.md').read_text()
assert 'Number.isSafeInteger' in contract and '>= 0 and <= 1000000000000' in contract
confirmation = json.loads((ROOT / 'docs/architecture/authentication-transfer-confirmation.json').read_text())
ledger = json.loads((ROOT / 'docs/roadmap/native-boundary-transfers.json').read_text())
assert confirmation['final_deployed_tester_security_acceptance'] is False
assert confirmation['qualified_auth_source_sha256'] == ledger['operator_authentication_transfer_confirmation']['qualified_auth_source_sha256']
assert ledger['operator_security_accepted'] is False and not ledger['human_confirmation_required_for_transfer_closure']
print(json.dumps({'passed': True, 'instruction_files': checked_skills, 'base_tool_declarations': checked_realizations,
                  'private_registration_writer_absent': True, 'count_contract_has_explicit_bounds': True,
                  'security_acceptance_not_inferred': True}))
