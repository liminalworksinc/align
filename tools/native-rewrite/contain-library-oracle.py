#!/usr/bin/env python3
"""Create a readable process-contained oracle without editing its historical verifier."""
import argparse
import hashlib
import json
from pathlib import Path
import re

def render_verifier(component, content, package_members, maximum_cases):
    """Render authored verification bytes; this does not grant specification authority."""
    assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', component)
    assert 1 <= maximum_cases <= 10000
    assert len(set(package_members)) == len(package_members)
    assert all(re.fullmatch(r'[A-Za-z0-9_.-]+', name) and name not in ['.', '..']
               for name in package_members)
    assert 'package.json' in package_members
    settings = {'inner_sha256': hashlib.sha256(content).hexdigest(),
                'package': component.replace('-', '_'), 'package_files': package_members,
                'maximum_cases': maximum_cases,
                'image': 'node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9'}
    template = (Path(__file__).parent / 'contained-oracle-template.cjs').read_text()
    assert template.count('/* SETTINGS */ null') == 1
    assert template.count('/* HISTORICAL VERIFIER */') == 1
    result = template.replace('/* SETTINGS */ null', json.dumps(settings, separators=(',', ':')))
    return result.replace('/* HISTORICAL VERIFIER */', content.decode('utf-8'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('oracle', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--package-member', action='append', required=True)
    args = parser.parse_args()
    oracle = json.loads(args.oracle.read_text())
    assert oracle['schema'] == 'literate-ai/library-acceptance-oracle@1'
    assert Path(oracle['harness']).name == oracle['harness']
    inner = args.oracle.parent / oracle['harness']
    assert inner.is_file() and not inner.is_symlink()
    content = inner.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    assert oracle['harness_identity'] == 'sha256:' + digest
    result = render_verifier(oracle['component'], content, args.package_member, len(oracle['cases']))
    assert args.output.parent.is_dir()
    with args.output.open('x') as file:
        file.write(result)
    print(json.dumps({'contained_oracle': str(args.output), 'historical_bytes_preserved': digest,
                      'oracle_binding_unchanged': True, 'normal_current_acceptance_pending': True}))


if __name__ == '__main__':
    main()
