#!/usr/bin/env python3
"""Bind the incremental verifier's exact batches to the locked native interfaces."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

from literate_ai.application.library_artifacts import project_library_import_surface
from literate_ai.contracts import ContentIdentity

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("child", type=Path)
args = parser.parse_args()
name = "spend-stream"
component = args.child / "components" / name
node = json.loads((component / "component.lock.json").read_text())["nodes"][0]
bindings = node["interface_bindings"]


def uri(identity):
    return f"{identity['algorithm']}:{identity['digest']}"


surface = project_library_import_surface(name, "javascript", tuple(sorted(
    (b["capability"], ContentIdentity.parse_uri(uri(b["interface_identity"]))) for b in bindings
)))
profile = json.loads((component / "qualification/profile.json").read_text())
acceptance = args.child / "verification/acceptance"
acceptance.mkdir(parents=True, exist_ok=True)
harness = Path(__file__).with_name("stream-harness.cjs")
shutil.copyfile(harness, acceptance / harness.name)
caps = {b["capability"] for b in bindings}
cases = []
for case in profile["cases"]:
    capability = case["case_id"].rsplit("-", 1)[0]
    if capability not in caps:
        raise ValueError("case references an undeclared capability")
    cases.append({**case, "capability": capability})
document = {"schema": "literate-ai/library-acceptance-oracle@1", "component": name,
    "specification_set_identity": uri(node["revision"]["specification_set_identity"]),
    "public_interface_identities": sorted(uri(b["interface_identity"]) for b in bindings),
    "import_surface_identity": surface.identity.uri, "language": "javascript",
    "harness": harness.name, "harness_identity": "sha256:" + hashlib.sha256(harness.read_bytes()).hexdigest(),
    "cases": cases}
(acceptance / f"{name}.json").write_text(json.dumps(document, separators=(",", ":")) + "\n")
print(f"Bound {sum(len(c['arguments']) for c in cases)} inputs to {surface.identity.uri}")
