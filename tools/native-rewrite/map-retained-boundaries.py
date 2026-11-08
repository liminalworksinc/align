#!/usr/bin/env python3
"""Check retained scope membership against the reviewed boundary inventory rows.

Usage: map-retained-boundaries.py SCOPE_PLAN_JSON OUTPUT_JSON
This maps file ownership only. It does not ratify pending authority classes.
"""

import json
from pathlib import Path
import sys
from collections import Counter


EXACT = {}


def assign(boundary, paths):
    for path in paths:
        if path in EXACT:
            raise ValueError("duplicate explicit boundary path: " + path)
        EXACT[path] = boundary


def v2(boundary, names):
    assign(boundary, ["lib/v2/" + name for name in names.split()])


assign("B01", ["lib/paste-lines.ts"])
v2("B02", "text-core.mts plural.mts money.mts launch-words.ts change-words.mts")
v2("B03", "home-core.mts")
v2("B04", "share-again.mts")
v2("B05", "policy.ts")
v2("B06", "validate.ts errors.ts")
assign("B06", ["lib/errors.ts"])
v2("B07", "value-core.mts")
assign("B08", ["lib/trust/markdown.mts"])
assign(
    "B09",
    ["packages/align-agent/src/spend.ts", "packages/align-agent/src/spend-types.ts"],
)
assign(
    "B10",
    [
        "packages/align-agent/src/shared/" + n
        for n in ["envelope.ts", "ended.ts", "types.ts", "notices.ts"]
    ],
)
assign("B11", ["packages/align-agent/src/hooks/shell.ts"])
v2(
    "B12",
    "core.mts db.ts node-sqlite.d.ts ids.ts events.ts init.ts config.ts limits.ts http.ts",
)
assign(
    "B12",
    [
        "lib/" + n
        for n in [
            "config.ts",
            "secret.ts",
            "startup.ts",
            "locks.ts",
            "migration-coordinator.mts",
            "runtime-settings.mts",
            "identifier-tools.mts",
            "storage-schema.mts",
            "server-secret-tools.mts",
            "http.ts",
            "ratelimit.ts",
        ]
    ],
)
v2(
    "B13",
    "auth.ts captcha.ts mail.ts local-owner.ts access.ts creation.ts disposable.ts account.ts lifecycle.ts",
)
v2("B14", "workspaces.ts sample.ts")
v2(
    "B15",
    "goals.ts goal-limits.ts changes.ts changes-read.ts approval.ts evidence.ts value.ts limit-suggest.ts alignments.ts reallocations.ts requests.ts asks.ts",
)
v2(
    "B16",
    "sessions.ts devices.ts directives.ts steering.ts spend.ts allocation.ts activity.ts goal-activity.ts home.ts",
)
v2("B17", "metrics-core.mts retention-core.mts retention.ts")
assign("B18", ["packages/align-connect/align-connect.mjs"])
assign(
    "B20",
    [
        "app/" + n
        for n in [
            "page.tsx",
            "layout.tsx",
            "error.tsx",
            "global-error.tsx",
            "globals.css",
        ]
    ]
    + ["proxy.ts", "instrumentation.ts"],
)
assign("B21", ["lib/trust/docs.ts", "lib/trust/entity.ts", "lib/trust/md.d.ts"])
assign("B23", ["docs/RETENTION.md", "lib/v2/disposable-domains.json"])
assign("B24", ["app/favicon.ico"])
assign(
    "B25",
    [
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "next.config.ts",
        "eslint.config.mjs",
    ]
    + [
        "packages/align-agent/" + n
        for n in [
            "package.json",
            "package-lock.json",
            "tsconfig.json",
            "scripts/postbuild.mjs",
        ]
    ],
)
assign("B26", ["Dockerfile", ".dockerignore", "fly.toml", "docs/HOSTING.md"])
assign(
    "B27",
    ["scripts/test-all.sh", "scripts/test-image.sh", "scripts/test-operator-image.mjs", "scripts/oauth-test-net.mjs"],
)
assign(
    "B28",
    ["scripts/align-admin.mjs", "scripts/align-admin-main.mjs", "scripts/retention.mjs", "scripts/sign-in-link.mjs"],
)
assign(
    "B29",
    [
        "README.md",
        "AGENTS.md",
        "SECURITY.md",
        "HARNESS_FACTS.md",
        "packages/align-agent/README.md",
        "packages/align-agent/HARNESS_FACTS.md",
        "packages/align-connect/README.md",
    ],
)
assign(
    "B30", [".gitignore", ".claude/settings.json", "packages/align-agent/.gitignore"]
)
assign("B31", ["scripts/native-libraries.mjs", "scripts/prepare-operator.mjs", "native/libraries.json"])

PREFIXES = [
    (
        "B18",
        [
            "lib/mcp/",
            "lib/oauth/",
            "app/api/mcp/",
            "app/api/oauth/",
            "app/oauth/",
            "app/.well-known/",
        ],
    ),
    ("B19", ["app/api/v2/"]),
    ("B20", ["app/app/"]),
    ("B21", ["app/_trust/", "app/trust/", "app/privacy/"]),
    ("B22", ["packages/align-agent/src/"]),
    ("B23", ["docs/trust/"]),
    ("B24", ["public/"]),
    ("B27", ["packages/align-agent/test/", "native/"]),
    ("B29", ["docs/"]),
]


def boundary(path):
    if path in EXACT:
        return EXACT[path]
    if path.startswith("scripts/test-") and path.endswith(".mjs"):
        return "B27"
    for owner, prefixes in PREFIXES:
        if any(path.startswith(prefix) for prefix in prefixes):
            return owner
    raise ValueError("unmapped retained path: " + path)


def main():
    plan = json.loads(Path(sys.argv[1]).read_text())
    plan = plan.get("result", plan)
    members = plan["source_members"]
    paths = [member["path"] for member in members]
    if len(paths) != len(set(paths)):
        raise ValueError("duplicate retained source member")
    mapped = {path: boundary(path) for path in sorted(paths)}
    counts = dict(sorted(Counter(mapped.values()).items()))
    groups = {
        "pure_boundaries_and_their_typed_bindings": sum(
            n for row, n in counts.items() if int(row[1:]) <= 11
        ),
        "server_agent_ui_operator": sum(
            n for row, n in counts.items() if 12 <= int(row[1:]) <= 22 or row == "B28"
        ),
        "assets_targets_packaging_harness_metadata": sum(
            n for row, n in counts.items() if 23 <= int(row[1:]) <= 31 and row != "B28"
        ),
    }
    assert sum(groups.values()) == len(paths)
    result = {
        "schema": "align/retained-boundary-coverage@1",
        "scope_plan_identity": plan["plan_identity"],
        "member_count": len(paths),
        "pending_authority_class_review": True,
        "boundary_counts": counts,
        "groups": groups,
        "files": mapped,
    }
    Path(sys.argv[2]).write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"members": len(paths), "groups": groups, "unmapped": 0}))


if __name__ == "__main__":
    main()
