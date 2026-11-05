#!/usr/bin/env python3
"""Check Align's real gate runner with synthetic command results and stage failures."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile

SHIM = r'''#!/bin/bash
stage=""
case "${0##*/}:$1:$2" in
 npm:run:lint) stage=lint;;
 npx:next:typegen|npx:tsc:--noEmit) stage=typecheck;;
 node:--check:*) stage=syntax;;
 node:scripts/test-paste-lines.mjs:*) stage=paste-lines;;
 node:scripts/test-v2.mjs:*) stage=test-v2;;
 node:scripts/test-oauth.mjs:*) stage=test-oauth;;
 node:scripts/test-agent-live.mjs:*) stage=test-agent-live;;
 npm:test:*) stage=align-agent;;
 *) exit 0;;
esac
failed=0
[ "$FIXTURE_FAIL_STAGE" = "$stage" ] && failed=1
case "$stage" in
 paste-lines) echo "test-paste-lines: $((3-failed)) passed, $failed failed";;
 test-v2) echo "$((7-failed)) passed, $failed failed";;
 test-oauth) echo "test-oauth: $((11-failed)) passed, $failed failed";;
 test-agent-live) echo "$((13-failed)) passed, $failed failed";;
 align-agent) printf 'ℹ tests 17\nℹ pass %s\nℹ fail %s\nℹ skipped 0\n' "$((17-failed))" "$failed";;
 *) echo "synthetic fixture: $stage";;
esac
exit "$failed"
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    runner = args.project / 'components/legacy-project-wrapper/implementation/scripts/test-all.sh'
    source = runner.read_bytes()
    expected_total = 3 + 3 + 7 + 11 + 13 + 17  # Three static gates plus five fixture suites.
    stages = ['', 'lint', 'typecheck', 'syntax', 'paste-lines', 'test-v2', 'test-oauth', 'test-agent-live', 'align-agent']
    report = {'schema': 'align/aggregate-runner-fixture@1', 'synthetic_fixture_only': True,
              'runner_sha256': hashlib.sha256(source).hexdigest(), 'cases': []}
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = str(sock.getsockname()[1])
    with tempfile.TemporaryDirectory(prefix='align-aggregate-fixture-') as directory:
        root = Path(directory)
        (root / 'scripts').mkdir()
        (root / 'packages/align-connect').mkdir(parents=True)
        (root / 'packages/align-agent/node_modules').mkdir(parents=True)
        (root / 'scripts/test-all.sh').write_bytes(source)
        (root / 'scripts/test-image.sh').write_text('#!/bin/bash\nexit 0\n')
        for name in ['test-paste-lines', 'test-v2', 'test-oauth', 'test-agent-live']:
            (root / f'scripts/{name}.mjs').write_text('// Synthetic command fixture.\n')
        (root / 'packages/align-connect/align-connect.mjs').write_text('// Synthetic command fixture.\n')
        shims = root / 'bin'
        shims.mkdir()
        for name in ['npm', 'npx', 'node']:
            shim = shims / name
            shim.write_text(SHIM)
            shim.chmod(0o755)
        env = {**os.environ, 'PATH': str(shims) + os.pathsep + os.environ['PATH'], 'TMPDIR': str(root) + '/'}
        for stage in stages:
            result = subprocess.run(['bash', str(root / 'scripts/test-all.sh'), port],
                                    env={**env, 'FIXTURE_FAIL_STAGE': stage}, capture_output=True, timeout=15)
            failed = int(bool(stage))
            expected = (expected_total - failed, failed)
            summaries = re.findall(rb'^(\d+) passed, (\d+) failed$', result.stdout, re.MULTILINE)
            actual = [tuple(map(int, row)) for row in summaries]
            if result.returncode != failed or actual != [expected]:
                raise AssertionError({'stage': stage, 'exit': result.returncode, 'summaries': actual,
                                      'stdout': result.stdout.decode(), 'stderr': result.stderr.decode()})
            report['cases'].append({'failed_stage': stage or None, 'exit_code': result.returncode,
                                    'passed': expected[0], 'failed': expected[1]})
    report.update(passed=True, fixture_cases=len(stages), failed_stage_controls=len(stages) - 1)
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
