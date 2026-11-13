# Literate AI agent entry point

Read and follow `SKILL.md` before changing this framework or any project that uses its
canonical taxonomy. Treat that file as the provider-neutral onboarding authority.

## Project action authorization

Before any commit, push, issue comment, post, send, publication, upload or launch,
verify that explicit operator authorization covers that specific action. If it
does not, draft and stage the work, then ask. Existing authorization remains valid
within its stated scope and does not need to be requested again. Workflow and
release instructions never grant outbound-action authority on their own.

Before migration qualification, generation or acceptance, run
`python3 tools/native-rewrite/check-host-tools.py` at this owning project root.
Use the stricter effective base requirements: Git >=2.47,<3 and Git LFS >=3.2,<4.
Qualified child toolchain files are historical generation inputs. Preserve them
byte for byte; their older host declarations do not relax this project preflight.
