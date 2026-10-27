# Goal registry bridge v1

The read-only bridge is off by default. Set both `ALIGN_GOAL_SESSIONS=1` and `ALIGN_GOAL_REGISTRY=1` to enable `GET /api/v2/workspaces/[ws]/goal-registry`. Disabled requests return 404. Existing v2 cookie or device credentials are required, with the same credential separation and workspace grants as the goals feed. Device credentials cannot edit goals. Normal human edits continue through the existing owner version route.

The response is `{contract,registry_instance_id,workspace_id,observed_at,goals}`. `contract` is `liminal.align_goal_registry.v1`. Every goal retains the existing v2 Goal wire fields and adds `external_ref` with `registry_instance_id`, `workspace_id`, `goal_id`, `goal_version`, `owner_id`, `view_digest`, and `observed_at`. The UUID registry instance is generated once and stored in an additive singleton table in the v2 database. Preserve this database to preserve registry identity across restarts. An unrelated instance or workspace has a different identity even when a goal ID matches.

The snapshot contains only goals and relations authorized for the requesting principal. Dependencies and parents are sorted by ID. No stored unfiltered content hash is returned. Up to 1,000 goals and 2 MiB of UTF-8 JSON are allowed; oversized snapshots refuse with 413 rather than truncating. Invalid Unicode scalar strings, unsafe versions, or malformed fields refuse rather than generating a digest. Responses use `Cache-Control: private, no-store`.

`view_digest` is lowercase SHA-256 over UTF-8 compact JSON of this ordered array:

```text
["liminal.align_goal_view.v1",registry_instance_id,workspace_id,goal_id,
 goal_version,owner_id,title,status,visibility,pod_id,measures,anchors,
 depends_on,contributes_to,bindable]
```

Each measure is `[id,text,target]` in registry order, with nullable target. Anchors are `[repos,branch_patterns,issues]`, retaining each list's order. Only visible dependencies appear, sorted lexicographically. Visible parent references are sorted by ID and encoded `[id,title,version,reviewed_version,stale]`. Strings retain exact Unicode with JSON escaping and no normalization. Observation time, owner display name, digest itself, credentials and transport headers are excluded. Permission changes can change the view digest without changing the canonical version.

A local projection ID is `align:` plus SHA-256 of UTF-8 compact JSON `["liminal.align_goal_identity.v1",registry_instance_id,workspace_id,goal_id]`. Version and observation time are excluded. Consumers must pin origin, registry instance and workspace and verify both the current content version and authorized digest before authorizing current context. A successful fetch describes that observation only.

The cross-language fixtures are `test/fixtures/align-goal-registry-v1.json`. Run direct isolated route and domain checks with `node scripts/test-goal-registry.mjs`. They use a private temporary database and local test identity provider without opening a listener. The test substitutes only Next's request-scope `connection()` hook. If a borrowed dependency root lacks Better Auth, `ALIGN_TEST_DEPENDENCY_ROOT` can point to an existing compatible installation for test-only package resolution; it does not change runtime configuration.
