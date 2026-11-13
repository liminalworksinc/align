"""Enforce effective host requirements without changing qualified input snapshots."""
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
MINIMUMS = {'git': ((2, 47, 0), (3, 0, 0)), 'git-lfs': ((3, 2, 0), (4, 0, 0))}


def version(text):
    if not re.fullmatch(r'\d+(?:\.\d+){0,2}', text):
        raise ValueError('Unsupported version: ' + text)
    parts = tuple(map(int, text.split('.')))
    return parts + (0,) * (3 - len(parts))


def effective_requirements(root=ROOT):
    requirements = dict(MINIMUMS)
    projects = [root] + sorted((root / '.literate/native-projects').iterdir())
    declarations = 0
    for project in projects:
        file = project / 'flavors/os-base/toolchain.cdx.json'
        if not file.is_file():
            continue
        for item in json.loads(file.read_text()).get('components', []):
            props = {p['name']: p['value'] for p in item.get('properties', [])}
            name = props.get('literate-ai:base-toolchain:capability')
            if name not in requirements:
                continue
            match = re.fullmatch(r'>=([\d.]+),<([\d.]+)', item['version'])
            if not match:
                raise ValueError('Unsupported host requirement in ' + str(file))
            lower, upper = requirements[name]
            requirements[name] = max(lower, version(match[1])), min(upper, version(match[2]))
            if requirements[name][0] >= requirements[name][1]:
                raise ValueError('Conflicting host requirements: ' + name)
            declarations += 1
    return requirements, declarations


def check_versions(observed, requirements):
    for name, (lower, upper) in requirements.items():
        if name not in observed or not lower <= version(observed[name]) < upper:
            raise ValueError('Missing or unsupported host tool: ' + name)


def main():
    requirements, declarations = effective_requirements()
    observed = {}
    for name in requirements:
        args = ['git', '--version'] if name == 'git' else ['git-lfs', 'version']
        output = subprocess.check_output(args, text=True, timeout=10)
        pattern = r'git version (\d+\.\d+(?:\.\d+)?)' if name == 'git' else r'git-lfs/(\d+\.\d+(?:\.\d+)?)'
        match = re.match(pattern, output)
        if not match:
            raise ValueError('Unrecognized tool version: ' + name)
        observed[name] = match[1]
    check_versions(observed, requirements)
    print(json.dumps({'passed': True, 'versions': observed,
                      'effective_ranges': requirements, 'base_declarations_checked': declarations,
                      'qualified_snapshots_unchanged': True}))


if __name__ == '__main__':
    main()
