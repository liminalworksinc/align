#!/usr/bin/env python3
"""Pin qualified local libraries and their verifier inputs for the retained consumer."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil

from literate_ai.adapters.conversion_authority import evidence_for_conversion_stage
from literate_ai.application.library_artifacts import project_library_import_surface
from literate_ai.contracts import canonical_identity, ContentIdentity
from literate_ai.contracts.operator_adoption import ConversionAuthorityStage
from literate_ai.projects import load_project

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("project", type=Path)
p.add_argument("output", type=Path)
p.add_argument("components", nargs="+")
p.add_argument("--provider", action="append", default=[], metavar="COMPONENT=PATH",
               help="select an exact registered provider directory for a component")
args = p.parse_args()
root = args.project.resolve()
providers = {}
registry_path = root / ".literate/native-projects.json"
registry_bytes = None
selections = list(args.provider)
if registry_path.is_symlink():
    raise ValueError("native registry must be a direct regular file")
registry_bytes = registry_path.read_bytes()
registry = json.loads(registry_bytes)
if registry.get("schema") != "literate-ai/adopted-native-projects@1":
    raise ValueError("native registry schema mismatch")
explicit = {selection.partition("=")[0] for selection in selections}
for name in args.components:
    if name in explicit:
        continue
    entries = [entry for entry in registry["projects"]
               if entry["project_id"] == "local-" + name]
    if not entries:
        entries = [entry for entry in registry["projects"]
                   if entry["path"] == ".literate/native-projects/local-" + name]
    if len(entries) != 1:
        raise ValueError("component requires one registered provider or an explicit selection")
    selections.append(name + "=" + entries[0]["path"])
for selection in selections:
    component, separator, relative = selection.partition("=")
    parts = PurePosixPath(relative).parts
    if (not separator or component not in args.components or component in providers
            or parts[:2] != (".literate", "native-projects") or len(parts) != 3
            or PurePosixPath(relative).as_posix() != relative or ".." in parts
            or "\\" in relative or ":" in relative
            or any(ord(character) < 32 for character in relative)):
        raise ValueError("provider must name one selected component and direct native project")
    current = root
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("provider cannot follow a symbolic link")
    if registry_path.is_symlink():
        raise ValueError("native registry must be a direct regular file")
    observed = registry_path.read_bytes()
    if registry_bytes is not None and registry_bytes != observed:
        raise ValueError("native registry changed during provider selection")
    registry_bytes = observed
    registry = json.loads(observed)
    if registry.get("schema") != "literate-ai/adopted-native-projects@1":
        raise ValueError("native registry schema mismatch")
    entries = [entry for entry in registry["projects"] if entry["path"] == relative]
    if len(entries) != 1:
        raise ValueError("selected provider must be registered exactly once")
    manifest_path = root / relative / "literate.project.json"
    if manifest_path.is_symlink():
        raise ValueError("provider definition must be a direct regular file")
    definition = json.loads(manifest_path.read_bytes())
    if (entries[0]["project_id"] != definition["project_id"] or
            entries[0]["project_definition_identity"] != canonical_identity(definition).uri):
        raise ValueError("selected provider does not match its registered identity")
    providers[component] = relative
args.output.mkdir(parents=True, exist_ok=True)
libraries = []
for name in args.components:
    if not name.replace("-", "").isalnum():
        raise ValueError("component name must be a simple identifier")
    relative = providers[name]
    child = root / relative
    evidence = evidence_for_conversion_stage(load_project(child), ConversionAuthorityStage.QUALIFIED)
    if len(evidence) != 1:
        raise ValueError("expected one qualified component")
    heads = [p for p in (child / "provenance/component-authority").glob("*/current.json")
             if json.loads(p.read_bytes()).get("component_coordinate") == f"component://local/{name}"]
    if len(heads) != 1:
        raise ValueError("expected one current authority head")
    lock = json.loads((child / "components" / name / "component.lock.json").read_bytes())
    lock_identity = canonical_identity(lock).uri
    surface = project_library_import_surface(name, "javascript", tuple(sorted(
        (b["capability"], ContentIdentity.parse_uri(
            f"{b['interface_identity']['algorithm']}:{b['interface_identity']['digest']}"))
        for b in lock["nodes"][0]["interface_bindings"]
    )))
    cache = child / "generated/committed-source-cache"
    candidates = list((cache / "entries/sha256").glob("*.json"))
    if len(candidates) != 1:
        raise ValueError("select a unique exact accepted source entry before integration")
    entry_path = candidates[0]
    entry_bytes = entry_path.read_bytes()
    if hashlib.sha256(entry_bytes).hexdigest() != entry_path.stem:
        raise ValueError("cache entry digest mismatch")
    entry = json.loads(entry_bytes)
    locked = entry["derivation"]["component_lock_identity"]
    if f"{locked['algorithm']}:{locked['digest']}" != lock_identity:
        raise ValueError("cache entry does not match the current component lock")
    package = name.replace("-", "_")
    prefix = f"source/{package}/"
    files = [{"path": f["path"].removeprefix(prefix), **f["blob"]}
             for f in entry["source_files"] if f["path"].startswith(prefix)]
    if not files or len({f["path"] for f in files}) != len(files):
        raise ValueError("missing or duplicate native package files")
    oracle_path = child / "verification/acceptance" / (name + ".json")
    oracle = json.loads(oracle_path.read_bytes())
    verifier = oracle_path.parent / oracle["harness"]
    hashes = {}
    for source in (oracle_path, verifier):
        destination = args.output / source.name
        shutil.copyfile(source, destination)
        hashes[source.name] = hashlib.sha256(destination.read_bytes()).hexdigest()
    libraries.append({"component": name, "provider": relative, "package": package,
        "lock_identity": lock_identity, "lock": lock,
        "qualified_projection": next(iter(evidence)).uri,
        "authority_head": heads[0].relative_to(child).as_posix(),
        "entry": entry_path.stem, "source_tree": entry["derivation"]["source_tree_identity"]["digest"],
        "files": sorted(files, key=lambda f: f["path"]), "surface": surface.to_dict(),
        "oracle": oracle_path.name,
        "verifier": verifier.name, "verification_files": hashes})
if registry_bytes is not None and registry_path.read_bytes() != registry_bytes:
    raise ValueError("native registry changed while pinning its providers")
(args.output / "libraries.json").write_text(json.dumps({"schema": "align/native-libraries@1",
    "libraries": libraries}, indent=2) + "\n")
print("Pinned", len(libraries), "qualified libraries")
