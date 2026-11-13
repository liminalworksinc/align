#!/usr/bin/env python3
"""Encode verifier inputs without changing their JSON values or expected results."""
import argparse
from base64 import b64encode
from collections import defaultdict
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
profile = json.loads(args.source.read_text())
probe = Path(__file__).with_name("spend-probe.mjs").read_text()
profile["profile_id"] = "align-spend-meter-host-v3"
grouped = defaultdict(list)
for case in profile["cases"]:
    grouped[case["arguments"][0]].append(case)
profile["cases"] = []
for op, cases in sorted(grouped.items()):
    for index in range(0, len(cases), 16):
        batch = cases[index:index + 16]
        profile["cases"].append({
            "case_id": f"{op}-{index:03}",
            "arguments": [json.dumps(c["arguments"], separators=(",", ":"), ensure_ascii=False) for c in batch],
            "expected_result": [c["expected_result"] for c in batch],
        })
for mode in ("source", "generated"):
    kind = "baseline" if mode == "source" else "generated"
    encoded_probe = b64encode(probe.encode()).decode()
    launcher = "await import('data:text/javascript;base64," + encoded_probe + "')"
    profile[f"{mode}_command"] = ["node", "--input-type=module", "-e", launcher, "--", f"--{kind}"]
profile["build_command"] = ["node", "-e", """
const fs = require('fs'), p = require('path'), cp = require('child_process');
const files = [];
(function walk(d) {
  for (const n of fs.readdirSync(d).sort()) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const f = p.join(d, n);
    if (fs.statSync(f).isDirectory()) walk(f);
    else if (/\\.(c|m)?js$/.test(n)) files.push(f);
  }
})('.');
if (!files.length) throw new Error('no JavaScript source');
for (const f of files) cp.execFileSync(process.execPath, ['--check', f], {stdio: 'inherit'});
"""]
# The command schema interprets brace-delimited words as placeholders. Encode
# embedded JavaScript so its ordinary object literals stay literal verifier code.
encoded_build = b64encode(profile["build_command"][-1].encode()).decode()
profile["build_command"][-1] = "eval(Buffer.from('" + encoded_build + "','base64').toString())"
args.output.write_text(json.dumps(profile, indent=2, ensure_ascii=False) + "\n")
