"""Export review-only readable literals from three historical qualification profiles.

No JavaScript is evaluated. Accepted profiles and their recorded identities stay intact.
"""
from pathlib import Path
import base64
import hashlib
import json
import re
import sys
import zlib

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'generated/qualification-review'
WRITE = sys.argv[1:] == ['--write']
assert not sys.argv[1:] or WRITE, 'Usage: review-qualification-source.py [--write]'
WRAPPER = re.compile(r"^eval\(require\('node:zlib'\)\.gunzipSync\(Buffer\.from\('([A-Za-z0-9+/=]+)',\s*'base64'\)\)\.toString\((?:'utf8')?\)\);?")
LITERAL = re.compile(r'\b(BODIES|privateFiles|PLANS)\s*=\s*')
sha = lambda data: hashlib.sha256(data).hexdigest()
files = {}
profiles = []

def read(relative):
    current = ROOT
    for part in relative.split('/'):
        current = current / part
        assert not current.is_symlink()
    assert current.is_file()
    data = current.read_bytes()
    assert len(data) <= 8 * 1024 * 1024
    return data

def directory(relative):
    current = ROOT
    for part in relative.split('/'):
        current = current / part
        assert not current.is_symlink()
        if WRITE:
            current.mkdir(exist_ok=True)
        assert current.is_dir()

def add(relative, data):
    if relative in files:
        assert files[relative] == data, 'Different bytes at shared review path'
        return {'path': relative, 'sha256': sha(data), 'bytes': len(data)}
    assert all(part and part not in ('.', '..') and not re.search(r'[\\:<>"|?*\x00-\x1f]', part)
               for part in relative.split('/'))
    files[relative] = data
    return {'path': relative, 'sha256': sha(data), 'bytes': len(data)}

for component in ['server-auth', 'server-sample', 'server-workspaces']:
    relative = f'.literate/native-projects/local-{component}/components/{component}/qualification/profile.json'
    raw = read(relative)
    profile = json.loads(raw)
    record = {'component': component, 'profile': relative, 'profile_sha256': sha(raw), 'commands': []}
    for key in ['source_command', 'generated_command', 'build_command']:
        argv = profile[key]
        index = argv.index('-e') + 1
        text = argv[index]
        command = {'field': key, 'argv': argv[:index] + ['<readable exported code>'] + argv[index + 1:],
                   'original_code_sha256': sha(text.encode()), 'layers': []}
        for _ in range(5):
            match = WRAPPER.match(text)
            if not match:
                break
            inflater = zlib.decompressobj(31)
            decoded = inflater.decompress(base64.b64decode(match[1], validate=True), 8 * 1024 * 1024 + 1)
            assert len(decoded) <= 8 * 1024 * 1024 and inflater.eof and not inflater.unused_data
            command['layers'].append({'encoded_code_sha256': sha(text.encode()), 'decompressed_sha256': sha(decoded)})
            text = decoded.decode('utf8') + text[match.end():]
            assert len(text.encode()) <= 8 * 1024 * 1024
        assert not WRAPPER.match(text) and not re.search(r'eval\(|gunzipSync', text), 'Unexpanded executable wrapper'
        command['fully_decoded_sha256'] = sha(text.encode())
        command['literals'] = []
        replacements = []
        for match in LITERAL.finditer(text):
            try:
                value, consumed = json.JSONDecoder().raw_decode(text[match.end():])
            except json.JSONDecodeError:
                continue
            raw_literal = text[match.end():match.end() + consumed]
            literal = {'name': match[1], 'start_character': match.end(), 'length_characters': consumed,
                       'original_literal_sha256': sha(raw_literal.encode()), 'files': []}
            if match[1] == 'PLANS':
                assert isinstance(value, list)
                index = []
                for plan in value:
                    assert isinstance(plan, dict)
                    row = {k: v for k, v in plan.items() if k != 'golden'}
                    if 'golden' in plan:
                        golden = plan['golden']
                        row['golden_data'] = {'records': len(golden), 'sha256': sha(json.dumps(golden, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())}
                    index.append(row)
                literal['files'].append(add(f'{component}/cases.index.json', (json.dumps(index, indent=2) + '\n').encode()))
            else:
                assert isinstance(value, dict)
                for name, source in sorted(value.items()):
                    assert isinstance(source, str)
                    safe_name = name.removeprefix('./')
                    literal['files'].append(add(f'{component}/{match[1]}/{safe_name}', source.encode()))
            command['literals'].append(literal)
            replacements.append((match.end(), match.end() + consumed, 'REVIEW_LITERAL_' + match[1]))
        rendered = text
        for start, end, replacement in reversed(replacements):
            rendered = rendered[:start] + replacement + rendered[end:]
        # Prove every nonliteral executable segment is unchanged by rendering.
        reconstructed = rendered
        for start, end, replacement in replacements:
            assert reconstructed.count(replacement) == 1
            reconstructed = reconstructed.replace(replacement, text[start:end], 1)
        assert reconstructed == text
        header = ('// Review template only. Do not execute. Every executable segment is preserved.\n'
                  '// REVIEW_LITERAL names identify decoded JSON data in manifest.json.\n')
        command['readable_code'] = add(f'{component}/{key}.review.js', (header + rendered).encode())
        command['all_executable_segments_preserved'] = True
        record['commands'].append(command)
    profiles.append(record)

manifest = {'schema': 'align/readable-qualification-source@1', 'review_only': True,
            'javascript_evaluated': False, 'accepted_profiles_modified': False, 'profiles': profiles}
add('manifest.json', (json.dumps(manifest, indent=2) + '\n').encode())
add('README.md', b'''# Qualification source review

These are review copies of the historical authentication, sample and workspace
qualification commands. The accepted profiles remain unchanged so their evidence
identities are preserved. No file in this directory supplies generation authority.

Start with manifest.json. For each command it links the exact original profile,
its SHA-256, decompression hashes and a review.js template with compression
wrappers removed. Every executable segment is preserved. JSON literals are
replaced with named references: BODIES and privateFiles contain the exact
decoded module strings, while cases.index.json lists every case and hashes its
expected output data. Repeated expected output data stays in the immutable
profile. The exporter proves the template plus original JSON literals reproduces
the fully decoded command exactly. Do not execute these review templates.
The source command's
privateFiles include original baseline implementations, so keep this directory
outside every model generation input.

The exporter parses literals and decompresses bytes. It never evaluates a runner.
The copies are for reading and are not substituted for the historical commands.

Verify: python3 tools/native-rewrite/review-qualification-source.py
Refresh after a deliberate profile change: add --write to the same command.
''')

directory('generated/qualification-review')
if WRITE:
    for relative, data in files.items():
        file = OUTPUT / relative
        assert not file.is_symlink()
        directory(file.parent.relative_to(ROOT).as_posix())
        file.write_bytes(data)
actual = set()
for file in OUTPUT.rglob('*'):
    assert not file.is_symlink()
    if file.is_file():
        relative = file.relative_to(OUTPUT).as_posix()
        actual.add(relative)
        assert relative in files and file.read_bytes() == files[relative], 'Review copy differs: ' + relative
assert actual == set(files), 'Review copy membership differs'
print(json.dumps({'passed': True, 'profiles': len(profiles), 'readable_files': len(files),
                  'manifest_sha256': sha(files['manifest.json']), 'javascript_evaluated': False}))
