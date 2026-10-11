# Alike retrieval evidence (session A → fresh session B)

**Session A** (Claude Code, this build session, 2026-10-11 ~11:34 PDT) recorded two decisions with the `alike` CLI `record_decision`, anchored to `agent/plans` and `agent/goal-triage-agent.mjs` in `liminalworksinc/align`:

- `urn:alike:decision:78eddb31af39fe7970cf47014f6ba26d9829f492e3e96f8df68e4167f9c7cfcb` (made): beta triage counts only with urgent priority, `obs-beta` tag (existing tags kept), one private investigation note, one public acknowledgment, and protected P0 non-beta incidents untouched.
- `urn:alike:decision:4b1a72b3aa27dfa67eefcaaeb34ada9ee4e109c7d9b6371165c84ae833097dba` (rejected): oldest-first throughput triage. (`…3e4972…` is an accidental duplicate of this rejected alternative.)

**Session B** (fresh headless Claude Code session `fbd65d8c-c5ff-40e6-b93b-548b6176fca0`, run in the repo with no prior context) was asked to propose the Security triage agent's plan for the beta queue and to report what Alike supplied. Its verbatim answer:

---

NAIVE PLAN (what you would propose from the ticket desk alone, one paragraph):
Work the open queue oldest first and get through as many tickets as possible. On each ticket, keep its existing tags and add `triaged`, set priority by how severe it looks (low, normal, high or urgent), post one public reply saying the team is on it, and mark routine questions as solved after replying. This is essentially `agent/plans/p-throughput@1.md`, which is measured by tickets triaged per day.

ALIKE DECISIONS RETRIEVED (urn, title, status, when recorded) or NONE:
- `urn:alike:decision:78eddb31af39fe7970cf47014f6ba26d9829f492e3e96f8df68e4167f9c7cfcb`, "Beta triage: don't mark triage complete unless priority, obs-beta…", status **made**, provenance confirmed. When recorded: unknown.
- `urn:alike:decision:4b1a72b3aa27dfa67eefcaaeb34ada9ee4e109c7d9b6371165c84ae833097dba`, "Rejected alternative for beta queue: oldest-first throughput triage", status **rejected**, provenance confirmed. When recorded: unknown.
- `urn:alike:decision:3e49726544ede126ff944babf9d2367709843a30837f3d9615b33d57e2929ad8`, "Rejected: oldest-first throughput triage for the beta queue", status **rejected**, provenance confirmed. When recorded: unknown.

These come only from the pointers Alike injected into this session. My `get_entity` and `search_entities` calls were blocked by a permissions prompt in this non-interactive session, so I couldn't read the full records, their sources or their history. I didn't try to get around that through the `alike` shell CLI. That's why the recording dates, who made each decision and the full outcome text of the "made" decision are all unknown.

REVISED PLAN (one paragraph):
Follow `agent/plans/p-beta@1.md`, not `p-throughput@1.md`. Handle observability-beta incidents first. For each one, keep the ticket open, set priority to urgent, and add `obs-beta` while keeping all existing tags. In that same update, add exactly one private note (public: false) saying what engineering should investigate. Then, in a separate update, post exactly one public acknowledgment (public: true) without revealing anything from the private note. Don't change P0 non-beta security incidents or their private notes at all. Leave every other ticket unchanged: no `triaged` tag, no blanket public replies, no closing tickets as solved. A beta ticket counts as triaged only when all of these conditions are met, not just when it has been touched.

WHAT CHANGED BECAUSE OF ALIKE (one sentence):
Alike shows the team confirmed a rejection of oldest-first throughput triage for the beta queue and confirmed a stricter definition of "triaged" (urgent priority, `obs-beta` added with existing tags kept, one private note…), so I dropped the throughput plan I'd have proposed from the ticket desk alone and chose the `p-beta@1` plan.

Alike: three confirmed decisions in the injected pointers (78eddb31… made; 4b1a72b3… and 3e497265… rejected) turned the proposal from `p-throughput@1` to `p-beta@1`. Who made them and when is unknown because the full-record reads were blocked by permissions.

---

Notes: session B received the decisions through Alike's injected coordination pointers; its follow-up `get_entity` reads were blocked by a non-interactive permission prompt, so it reported recording time and author as unknown. Align stores only the decision id, a summary, timestamps and the plan before/after, never raw transcripts.
