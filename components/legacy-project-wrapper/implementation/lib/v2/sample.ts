import { audit, run } from "./db";
import { newId } from "./ids";
import { insertAlignment } from "./alignments";
import { insertChangeRequest } from "./changes";
import { goalRow, insertGoal, type Measure } from "./goals";
import type { PodRole, PolicyPrincipal } from "./policy";
import { createWorkspace } from "./workspaces";

// The Northstar sample: an ordinary workspace, owned by the person who asks for it, filled in the transaction that
// creates it so every flow can be tried at once. The caller leads both teams and owns every goal, so they can act on
// every part. It counts toward the same limits as any new workspace, and can be renamed or deleted like one.
//   teams Product and Security (caller lead of both)
//   company goal "Expand to regulated customers"
//   "Ship self-serve onboarding" (Product) and "Pass the security review" (Security), visible to the workspace, each
//   contributing to the company goal through an approved contribution; onboarding depends on the security review
//   one pending change request on the security goal. The caller owns that goal, and an owner can't propose a change
//   to their own goal through the API, so it is seeded directly; its reason says why it is there.

export const SAMPLE_NAME = "Northstar (sample)";

export const SAMPLE_REASON =
  "This is a sample change request. Onboarding can't launch to regulated customers until a pen test is booked, so this asks the security goal to measure that too. In a real workspace a teammate proposes changes to a goal they don't own and the goal's owner or team lead decides. Here you own the goal, so you can approve it, suggest a change, reject it, withdraw it or update it to try each step.";

const measure = (text: string, target: string | null): Measure => ({ id: newId("m"), text, target });
const NO_ANCHORS = { repos: [], branch_patterns: [], issues: [] };

export async function createSampleWorkspace(userId: string) {
  return createWorkspace(userId, SAMPLE_NAME, (wsId, at) => {
    // Goals a millisecond apart, so the feed (oldest first) lists the company goal first.
    const tick = (n: number) => new Date(Date.parse(at) + n).toISOString();
    const pods = new Map<string, PodRole>();
    const pp: PolicyPrincipal = { userId, wsId, wsRole: "owner", pods };
    const team = (name: string) => {
      const id = newId("pod");
      run("INSERT INTO v2_pods (id, ws_id, name, created_at) VALUES (?, ?, ?, ?)", id, wsId, name, at);
      audit(wsId, userId, "team.created", id, at);
      run("INSERT INTO v2_pod_members (ws_id, pod_id, user_id, role, created_at) VALUES (?, ?, ?, 'lead', ?)", wsId, id, userId, at);
      audit(wsId, userId, "team.member_set", id, at);
      pods.set(id, "lead");
      return id;
    };
    const product = team("Product");
    const security = team("Security");
    const company = insertGoal(
      pp,
      { title: "Expand to regulated customers", level: "company", podId: null, visibility: "workspace", measures: [measure("Regulated customers live", "3 this year")], anchors: NO_ANCHORS, dependsOn: [] },
      tick(0),
    );
    const review = insertGoal(
      pp,
      {
        title: "Pass the security review",
        level: "team",
        podId: security,
        visibility: "workspace",
        measures: [measure("Open high-severity findings", "0"), measure("Review signed off", "end of quarter")],
        anchors: NO_ANCHORS,
        dependsOn: [],
      },
      tick(2),
    );
    const onboarding = insertGoal(
      pp,
      { title: "Ship self-serve onboarding", level: "team", podId: product, visibility: "workspace", measures: [measure("New teams set up without help", "80%")], anchors: NO_ANCHORS, dependsOn: [review] },
      tick(1),
    );
    const target = goalRow(wsId, company)!;
    for (const source of [onboarding, review]) insertAlignment(pp, target, goalRow(wsId, source)!, "contribution", [], null, at);
    const reviewGoal = goalRow(wsId, review)!;
    const measures = [...(JSON.parse(reviewGoal.measures_json) as Measure[]), measure("Pen test window booked", "before launch")];
    insertChangeRequest(pp, reviewGoal, { measures }, SAMPLE_REASON, at);
  });
}
