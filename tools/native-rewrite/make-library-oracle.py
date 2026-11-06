#!/usr/bin/env python3
"""Bind capability-named profile batches to one locked native library."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

from literate_ai.application.library_artifacts import project_library_import_surface
from literate_ai.adapters.component_acceptance import load_library_acceptance
from literate_ai.contracts import ContentIdentity, canonical_json_bytes
from literate_ai.source_to_specification.host_qualification import LocalQualificationProfile

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("child", type=Path)
p.add_argument("component")
p.add_argument("harness", type=Path)
args = p.parse_args()
if not args.component.replace("-", "").isalnum() or not args.harness.is_file() or args.harness.is_symlink():
    raise ValueError("expected a simple component name and a direct verifier file")
component = args.child / "components" / args.component
nodes = json.loads((component / "component.lock.json").read_bytes())["nodes"]
if len(nodes) != 1:
    raise ValueError("the helper requires one locked Component")
node = nodes[0]
bindings = node["interface_bindings"]


def uri(value):
    return f"{value['algorithm']}:{value['digest']}"


surface = project_library_import_surface(args.component, "javascript", tuple(sorted(
    (b["capability"], ContentIdentity.parse_uri(uri(b["interface_identity"]))) for b in bindings
)))
profile = json.loads((component / "qualification/profile.json").read_bytes())
if [c["case_id"] for c in profile["cases"]] != sorted(c["case_id"] for c in profile["cases"]):
    raise ValueError("profile case order must be canonical before spec accept; do not edit a promoted profile")
caps = {b["capability"] for b in bindings}
cases = []
for case in profile["cases"]:
    cap = case["case_id"].rsplit("-", 1)[0]
    if cap not in caps:
        raise ValueError("case references an undeclared capability")
    cases.append({**case, "capability": cap})
cases.sort(key=lambda case: case["case_id"])
if {c["capability"] for c in cases} != caps or len({c["case_id"] for c in cases}) != len(cases):
    raise ValueError("missing capability coverage or duplicate case identifiers")
acceptance = args.child / "verification/acceptance"
acceptance.mkdir(parents=True, exist_ok=True)
shutil.copyfile(args.harness, acceptance / args.harness.name)
document = {"schema": "literate-ai/library-acceptance-oracle@1", "component": args.component,
    "specification_set_identity": uri(node["revision"]["specification_set_identity"]),
    "public_interface_identities": sorted(uri(b["interface_identity"]) for b in bindings),
    "import_surface_identity": surface.identity.uri, "language": "javascript",
    "harness": args.harness.name, "harness_identity": "sha256:" + hashlib.sha256(args.harness.read_bytes()).hexdigest(),
    "cases": cases}
(acceptance / (args.component + ".json")).write_text(json.dumps(document, separators=(",", ":")) + "\n")
parsed = load_library_acceptance(acceptance / (args.component + ".json"), args.component)
typed_profile = LocalQualificationProfile.from_dict(profile)
if canonical_json_bytes([[c.case_id, c.arguments, c.expected_result] for c in parsed.cases]) != canonical_json_bytes([
    [c.case_id, list(c.arguments), c.expected_result] for c in typed_profile.cases
]):
    raise ValueError("typed profile and independent library oracle differ")
print(f"Bound {len(cases)} cases across {len(caps)} capabilities to {surface.identity.uri}")
