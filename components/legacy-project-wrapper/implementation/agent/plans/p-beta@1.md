# Team triage plan p-beta v1

Source: proposed Security goal v2, which adds "observability-beta incidents triaged per launch-readiness policy" and protects P0 non-beta incidents.

Ordering: handle observability-beta incidents first.

For each observability-beta incident:
1. Keep the ticket open.
2. Set priority to urgent.
3. Set tags to the ticket's existing tags plus `obs-beta`.
4. In the same update as steps 2 and 3, add exactly one private investigation note (public: false) describing what engineering should investigate.
5. Then, in a separate update, add exactly one public acknowledgment (public: true) telling the customer the team is investigating. Never reveal private notes.

Protected: do not modify P0 non-beta security incidents or their private notes in any way (no tag, priority, status or comment changes).

Out of scope for this run: leave all other tickets unchanged.
