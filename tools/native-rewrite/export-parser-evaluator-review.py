#!/usr/bin/env python3
"""Export the parser observer and judge as readable, hash-linked review files."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
relative = 'components/legacy-project-wrapper/implementation/native/trust-text-parser-split-contained-v3.cjs'
wrapper = root / relative
text = wrapper.read_text()
decoder = json.JSONDecoder()


def literal(name):
    marker = 'const ' + name + '='
    if text.count(marker) != 1:
        raise ValueError('Expected one embedded evaluator input: ' + name)
    value, end = decoder.raw_decode(text.split(marker, 1)[1])
    if not text.split(marker, 1)[1][end:].startswith(';'):
        raise ValueError('Embedded evaluator input is not a literal')
    return value


inputs = literal('OBSERVER_INPUTS')
judge = literal('JUDGE_SOURCE')
assert set(inputs) == {'current-documents.json', 'current-observations.cjs',
                      'historical-inputs.json', 'legacy-observations.cjs',
                      'observer.cjs', 'plain.js', 'safe_href.js', 'slug.js'}
assert all(isinstance(value, str) and 'expected_result' not in value
           for value in inputs.values())
assert isinstance(judge, str) and 'const GOLDENS=' in judge
goldens, _ = decoder.raw_decode(judge.split('const GOLDENS=', 1)[1])
for item in goldens['plans']:
    assert all(item['expected_result']['sha256'] not in value
               for value in inputs.values())
assert all(goldens['expected_result']['sha256'] not in value
           and goldens['additional_guard_sha256'] not in value
           for value in inputs.values())
files = {**{'observer/' + name: value.encode() for name, value in inputs.items()},
         'judge.cjs': judge.encode()}
manifest = {'schema': 'align/parser-evaluator-readable-review@1',
            'wrapper': relative,
            'wrapper_sha256': hashlib.sha256(wrapper.read_bytes()).hexdigest(),
            'candidate_mount': 'observer files and candidate package only',
            'judge_mount': 'judge.cjs, observations.gz and request.json only',
            'files': [{'path': name, 'sha256': hashlib.sha256(value).hexdigest(),
                       'bytes': len(value)} for name, value in sorted(files.items())]}
files['manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
destination = root / 'generated/native-evaluator-review/trust-text-parser-split-v3'
if args.check:
    actual = {p.relative_to(destination).as_posix() for p in destination.rglob('*')
              if p.is_file()}
    assert actual == set(files), 'Readable evaluator file inventory changed'
    assert all(not (destination / name).is_symlink()
               and (destination / name).read_bytes() == value
               for name, value in files.items()), 'Readable evaluator bytes changed'
else:
    for name, value in files.items():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(value)
print(json.dumps({'passed': True, 'check': args.check,
                  'readable_files': len(files) - 1,
                  'private_goldens_absent_from_observer': True}))
