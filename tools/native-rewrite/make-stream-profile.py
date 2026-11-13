#!/usr/bin/env python3
"""Package state observations into the same verifier protocol used by acceptance."""
import argparse
from base64 import b64encode
from collections import defaultdict
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("cases", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
template = root / ".literate/native-projects/local-spend-meter/components/spend-meter/qualification/profile.json"
profile = json.loads(template.read_text())
harness = Path(__file__).with_name("stream-harness.cjs").read_bytes()
launcher = "eval(Buffer.from('" + b64encode(harness).decode() + "','base64').toString())"
groups = defaultdict(list)
raw = json.loads(args.cases.read_text())
for case in raw:
    groups[case["capability"]].append(case)
profile["cases"] = []
for capability, cases in sorted(groups.items()):
    for index in range(0, len(cases), 8):
        batch = cases[index:index + 8]
        profile["cases"].append({
            "case_id": f"{capability}-{index:03}",
            "arguments": [json.dumps(c["arguments"], separators=(",", ":"), ensure_ascii=False) for c in batch],
            "expected_result": [c["expected_result"] for c in batch],
        })
profile["profile_id"] = "align-spend-stream-host-v1"
profile["source_command"] = ["node", "-e", launcher, "--", "--baseline"]
profile["generated_command"] = ["node", "-e", launcher, "--", "--generated"]
profile["covered_surface_ids"] = sorted(groups)
args.output.write_text(json.dumps(profile, separators=(",", ":"), ensure_ascii=False) + "\n")
print(f"Packaged {len(raw)} inputs in {len(profile['cases'])} batches")
