# Native finding remediation

- **Status:** active
- **Owning queue item:** [ADOPT-002](active-work.md#adopt-002)
- **Completion / archival evidence:** pending implementation and normal review

The operator requested: "fix the open findings fully", followed by "then finish
as many of the remaining boundaries as possible." This authorizes remediation
within Align. Shruti's sign-off is not a build dependency. The earlier instruction
to leave findings undecided does not prevent implementing these corrections.
Operator security acceptance, upstream framework changes and deployment remain
outside this work. No accept or dismiss override is used.

The [preserved operator confirmation](../architecture/authentication-transfer-confirmation.json)
records the B13 transfer decision and explicitly excludes final tester security
acceptance. It supplies no sign-off from another person.

The [readable source manifest](../../generated/native-review-source/manifest.json)
is checked against all 68 accepted libraries and 270 package files. The
[qualification review manifest](../../generated/qualification-review/manifest.json)
links three unchanged historical profiles to 62 readable exported files. Run
the two exporters in check mode and `tools/native-rewrite/check-review-policy.py`
to verify their bytes and instruction constraints. Re-run the focused service
acceptance with `node --no-warnings --experimental-vm-modules --max-old-space-size=768 tools/native-rewrite/check-relocated-guards.mjs`.
CI runs the four review checks and the effective host tool preflight.
The project enforces Git >=2.47,<3 and Git LFS >=3.2,<4 before migration
qualification, generation and acceptance. Those ranges intersect all child base
requirements. Historical macOS declarations remain exact because qualification
audits bind them. Run `python3 tools/native-rewrite/check-host-tools.py`; missing
or unsupported tools fail closed. This changes no qualification audit or bound.

Fresh package checks pass 214 independent batches across validation, storage,
migrations and the six High-finding services. Four altered review projections
(changed bytes, a symlink, an extra file and a missing file) all fail closed.
The Go compiler rejects the original excluded filename; the corrected filename
builds, runs its runtime tests and detects an intentionally broken callback.
The actual admitted count helper passes eleven boundary cases. No application
Go code, generated runtime algorithm or framework source is changed.

The accepted B19 application and image results remain preserved. Its normal push
was stopped before upload at commit `cd8ba1a6`; the remote remains `9f73aa62`.
Do not restart that push against an outdated tree. Complete the corrections and
their relevant checks before a new normal review.

The current parent receipt also binds documentation. Its original B19 identity
does not attest the later instruction and documentation changes. Combine these
corrections with B28's actual caller integration for one complete application
and image acceptance run, followed by normal publication. The original B19
acceptance remains preserved. No receipt is patched or reattributed.

The corrections below are implemented and have focused local evidence. Their
normal publication and the combined checkpoint's full acceptance remain pending.
The historical reviewer ledger still has 23 entries. Its API has only human
accept/dismiss overrides, so no override is written to represent a code fix.
These entries remain available alongside the correction evidence.
The [current correction record](../../generated/native-checkpoints/finding-remediation.json)
contains the exact counts and reproducible focused checks. The
[combined checkpoint result](../../generated/native-checkpoints/b19-b28.json)
records preparation, acceptance and publication as those gates actually finish.

| Finding | Required correction and evidence | State |
| --- | --- | --- |
| f_c741821f2f4a | Correct the excluded Go runtime-test filename instruction in the Align project copy; prove a compiled runtime includes its tests. | Verified locally; combined acceptance and normal review pending |
| f_b36c3d29ef7c | Verify the private registration writer is removed and ordinary locked registration is the only current path. | Verified locally; combined acceptance and normal review pending |
| f_2f5c23666cec | Verify the public count contract states both numeric bounds and generated code rejects negative, unsafe and excessive counts. | Verified locally; combined acceptance and normal review pending |
| f_e35fa336a9f8 | Enforce the stricter Git base floor in the owning project preflight and CI; preserve audited migration snapshots. | Verified locally; combined acceptance and normal review pending |
| f_5054419f9a29 | Commit readable, hash-checked validation source and verify its full guard behavior. | Verified locally; combined acceptance and normal review pending |
| f_745f52b800ff | Require explicit action authorization before issue-comment publication in the Align skill copy. | Verified locally; combined acceptance and normal review pending |
| f_84ce9f54c701 | Commit readable, hash-checked store and migration source, including the schema programs. | Verified locally; combined acceptance and normal review pending |
| f_4c9283b5ecab | Expose exact authentication source and inspect enforcement and callers. | Verified locally; combined acceptance and normal review pending |
| f_456d34de6a82 | Expose the authentication qualification command and every embedded module as readable, hash-linked files without altering historical evidence. | Verified locally; combined acceptance and normal review pending |
| f_622b2d74e48e | Enforce the stricter Git and Git LFS base floors in the owning project preflight and CI; preserve audited authentication snapshots. | Verified locally; combined acceptance and normal review pending |
| f_fcab81184174 | Separate corrected historical premature closure from the later actual operator confirmation. | Verified locally; combined acceptance and normal review pending |
| f_202c48750557 | Bind approval prose to the preserved operator message and its narrow scope. | Verified locally; combined acceptance and normal review pending |
| f_2c1e50b9c263 | Make the ledger distinguish functional transfer acceptance from operator security acceptance. | Verified locally; combined acceptance and normal review pending |
| f_2e78693505d1 | Expose exact workspace source and inspect membership, invitation, owner and deletion guards. | Verified locally; combined acceptance and normal review pending |
| f_09aa12209ec2 | Expose sample qualification command and embedded modules with exact hashes. | Verified locally; combined acceptance and normal review pending |
| f_eacf8a5e6d43 | Expose workspace qualification command and embedded modules with exact hashes. | Verified locally; combined acceptance and normal review pending |
| f_3c2e305a94d7 | Expose exact suggestion source and inspect viewer, visibility, input and quota guards. | Verified locally; combined acceptance and normal review pending |
| f_4bd94fac41bd | Expose exact goal source and inspect authorization, validation, caps and stale writes. | Verified locally; combined acceptance and normal review pending |
| f_5a0e064cc7ff | Expose exact device source and inspect signatures, expiry, replay and identity scope. | Verified locally; combined acceptance and normal review pending |
| f_d943ad9dd8d1 | Expose exact directive source and inspect device/user/goal scope. | Verified locally; combined acceptance and normal review pending |
| f_a53163d0b124 | Enforce the stricter Git base floor in the owning project preflight and CI; preserve audited metrics snapshots. | Verified locally; combined acceptance and normal review pending |
| f_dd723ad9bd62 | Require explicit commit and push authorization in the retention child's advance instructions. | Verified locally; combined acceptance and normal review pending |
| f_5c5fc40549da | Require explicit commit and push authorization in the metrics child's advance instructions. | Verified locally; combined acceptance and normal review pending |

Work in this order: source visibility and guard review; qualification readability;
tooling and approval corrections; focused verification and normal review; the
remaining B19, B22, B28 and B18 boundary work. Reuse accepted source when its
recorded inputs remain unchanged. Do not repeat application acceptance for a
documentation-only correction.
