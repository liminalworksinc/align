#!/usr/bin/env python3
"""Local extension of the pinned runtime: attach an already-qualified native child.

This does not change conversion stages or relax promotion/qualification gates.
The shared framework installation stays unchanged. Generate a plan, inspect it,
then apply that exact plan. A journal preserves the prior metadata. An interrupted
publication fails the ordinary current-qualification check until recovered.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tempfile

from literate_ai._cache_lock import exclusive_cache_lock
from literate_ai.adapters.authority import FileAuthorityProjectionStore
from literate_ai.adapters.conversion_authority import (
    CONVERSION_AUTHORITY_FILE,
    NATIVE_PROJECTS_FILE,
    FilesystemConversionAuthorityStore,
    _native_project_roots,
    _register_native_project,
    evidence_for_conversion_stage,
    require_current_qualified_conversion_authority,
    require_native_project_path,
)
from literate_ai.contracts import canonical_identity, canonical_json_bytes
from literate_ai.contracts.operator_adoption import (
    ConversionAuthorityStage,
    ConversionAuthorityState,
)
from literate_ai.projects import load_project


def plan_addition(parent: Path, child: Path) -> dict:
    project = load_project(parent)
    require_native_project_path(project, child)
    if child.is_symlink() or child.parent != parent / ".literate/native-projects":
        raise ValueError("child must be a direct, non-symlink native project")
    registry_path = parent / NATIVE_PROJECTS_FILE
    require_native_project_path(project, registry_path)
    state = FilesystemConversionAuthorityStore(parent).load_optional()
    if state is None:
        raise ValueError("parent has no conversion authority")
    old_evidence = require_current_qualified_conversion_authority(project, state)
    native_roots = _native_project_roots(project)
    candidate = load_project(child)
    registry = json.loads(registry_path.read_bytes())
    if child in native_roots or any(
        e["project_id"] == candidate.definition.project_id for e in registry["projects"]
    ):
        raise ValueError("child path or project identity is already registered")
    seen = set()
    for root in (parent, *native_roots, child):
        for coordinate in FileAuthorityProjectionStore(root).coordinates():
            if coordinate in seen:
                raise ValueError("component coordinate occurs in multiple projects")
            seen.add(coordinate)
    child_evidence = evidence_for_conversion_stage(candidate, ConversionAuthorityStage.QUALIFIED)
    definition = json.loads((child / "literate.project.json").read_bytes())
    return {
        "schema": "align/local-qualified-native-addition@1",
        "child": child.relative_to(parent).as_posix(),
        "child_project_id": candidate.definition.project_id,
        "child_definition_identity": canonical_identity(definition).uri,
        "parent_authority_identity": state.identity.uri,
        "registry_identity": canonical_identity(registry).uri,
        "child_evidence": sorted(e.uri for e in child_evidence),
        "expected_evidence": sorted(e.uri for e in (*old_evidence, *child_evidence)),
    }


def apply_addition(parent: Path, child: Path, approved: dict) -> dict:
    project = load_project(parent)
    store = FilesystemConversionAuthorityStore(parent)
    registry_path = parent / NATIVE_PROJECTS_FILE
    # Use the same metadata locks as the framework. Do not call its public
    # registration/store wrappers while holding their non-reentrant locks.
    with exclusive_cache_lock(registry_path.with_suffix(".lock")):
        with exclusive_cache_lock(store.lock_path):
            if plan_addition(parent, child) != approved:
                raise ValueError("reviewed plan is stale")
            prior = store.load_optional()
            registry_before = registry_path.read_bytes()
            authority_before = store.path.read_bytes()
            journals = parent / ".literate/native-additions"
            require_native_project_path(project, journals)
            journals.mkdir(parents=True, exist_ok=True)
            journal = Path(tempfile.mkdtemp(
                prefix=canonical_identity(approved).digest[:16] + "-", dir=journals
            ))
            (journal / "plan.json").write_bytes(canonical_json_bytes(approved) + b"\n")
            (journal / "registry-before.json").write_bytes(registry_before)
            (journal / "authority-before.json").write_bytes(authority_before)
            try:
                _register_native_project(project, child)
                evidence = evidence_for_conversion_stage(project, ConversionAuthorityStage.QUALIFIED)
                if sorted(e.uri for e in evidence) != approved["expected_evidence"]:
                    raise ValueError("qualified evidence changed during registration")
                renewed = ConversionAuthorityState(
                    project_id=prior.project_id,
                    stage=ConversionAuthorityStage.QUALIFIED,
                    evidence_identities=evidence,
                    prior_state_identity=prior.identity,
                )
                store._atomic_write(store.path, canonical_json_bytes(renewed.to_dict()) + b"\n")
                require_current_qualified_conversion_authority(project, renewed)
                result = {"ok": True, "authority_identity": renewed.identity.uri, "plan": approved}
                (journal / "result.json").write_bytes(canonical_json_bytes(result) + b"\n")
                return result
            except BaseException:
                # Both framework locks are held, so rollback cannot overwrite a
                # concurrent operation using the supported metadata stores.
                store._atomic_write(registry_path, registry_before)
                store._atomic_write(store.path, authority_before)
                (journal / "rolled-back").write_text("Prior registry and authority restored.\n")
                raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--child", type=Path, required=True)
    parser.add_argument("--apply", type=Path, help="apply this exact reviewed plan")
    args = parser.parse_args()
    # Resolve the parent only. Resolving the child would hide its final symlink.
    parent = args.project.resolve(strict=True)
    child = args.child.absolute()
    result = (
        apply_addition(parent, child, json.loads(args.apply.read_bytes()))
        if args.apply else plan_addition(parent, child)
    )
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
