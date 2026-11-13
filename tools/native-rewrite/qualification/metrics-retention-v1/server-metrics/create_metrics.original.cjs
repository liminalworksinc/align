"use strict";
// Derived original test adapter. Never a generation input.
function create_metrics(resources) {
const {ESTIMATES,NOTE_REF_RE,recordEvent,readDate} = resources;
// The operator's metrics (PRESEED-007): `node scripts/align-admin.mjs report [--since YYYY-MM-DD] [--json]` and the
// operator-recorded LOI events (`events record loi_sent|loi_signed`). Like lib/v2/core.mts, Node runs this file
// directly (type stripping): it imports only core.mts and takes its database as an argument. It reads the product
// events (v2_events) for the funnel and the existing tables for activity and goal binding; it never reads or prints a
// name, email, title or other content.
//
// Definitions (also in specs/align/metrics.md):
//   - Weeks run Monday 00:00 UTC to the next Monday.
//   - A sample workspace (workspace_created with kind sample) is left out of every workspace count.
//   - The workspace funnel follows the workspaces created on or after --since (all kept ones without it) and counts
//     those that ever reached each step.
//   - A workspace is active in a week when in that week a session was shared to it, opened a binding epoch or uploaded
//     usage (v2_sessions.created_at, v2_epochs.created_at, v2_usage.received_at), or a person did something its audit
//     log records (a v2_audit row of that workspace with an actor). Operator actions (no actor) don't count.
//   - Week-n retention of a creation cohort: the share of the workspaces created in week W that are active in week
//     W+n; it is shown only once week W+n has ended.
//   - Percentiles are nearest-rank.
//   - Decision value (PORT-004): over the workspaces that are not samples, in the period. The value events are kept
//     once per person per workspace, so "people" counts person-workspace pairs; the reported estimate is the one the
//     person gave first in that workspace. Access requests from the value card are those with via value_card.
const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** Monday 00:00 UTC of the week holding `t`. */
function weekStart(t) {
    const d = new (readDate())(t);
    const day = (d.getUTCDay() + 6) % 7; // Monday 0
    return readDate().UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY_MS;
}
const isoDay = (t) => new (readDate())(t).toISOString().slice(0, 10);
/** The nearest-rank percentile (p from 0 to 1) of numbers; null for none. */
function percentile(values, p) {
    if (!values.length)
        return null;
    const v = [...values].sort((a, b) => a - b);
    return v[Math.max(0, Math.ceil(p * v.length) - 1)];
}
const share = (n, of) => (of > 0 ? Math.round((n / of) * 10000) / 10000 : null);
// ---- LOIs, recorded only by the operator ----
const LOI_EVENTS = ["loi_sent", "loi_signed"];
/** Record that an LOI was sent to, or signed by, a workspace's organisation (inside the caller's transaction). Only the
 *  operator does this; nothing in the app asserts it. `loi_signed` needs `verifiedOriginal`: the operator has the
 *  countersigned original in hand, so a form or a claim never counts as signed. Once per workspace each. `noteRef` is
 *  the operator's own opaque reference (NOTE_REF_RE), never the document itself. */
function recordLoi(db, name, wsId, o, now = readDate().now()) {
    if (name === "loi_signed" && !o.verifiedOriginal)
        return { ok: false, reason: "verified_original_required" };
    if (o.noteRef != null && !NOTE_REF_RE.test(o.noteRef))
        return { ok: false, reason: "bad_note_ref" };
    if (!db.get("SELECT 1 AS x FROM v2_workspaces WHERE id = ?", wsId))
        return { ok: false, reason: "no_workspace" };
    const prior = db.get("SELECT at FROM v2_events WHERE name = ? AND ws_id = ?", name, wsId);
    if (prior)
        return { ok: false, reason: "already_recorded", at: prior.at };
    const at = new (readDate())(now).toISOString();
    const props = {};
    if (o.noteRef)
        props.note_ref = o.noteRef;
    if (name === "loi_signed")
        props.verified_original = "yes";
    recordEvent(db, name, { ws: wsId, props, at });
    return { ok: true, at };
}
// ---- the report ----
/** The workspace funnel's steps, in order; a step is reached when any of its events is recorded for the workspace. */
const FUNNEL = [
    { step: "workspace created", events: ["workspace_created"] },
    { step: "device paired", events: ["device_paired"] },
    { step: "first session captured", events: ["first_session_captured"] },
    { step: "first session bound to a goal", events: ["first_session_bound"] },
    { step: "second member joined", events: ["second_member_joined"] },
    { step: "first change request", events: ["first_change_request"] },
    { step: "first approval or directive", events: ["first_approval", "first_directive"] },
    { step: "first MCP read", events: ["first_mcp_read"] },
];
const WAW_WEEKS = 8;
const COHORT_WEEKS = 12;
const timing = (minutes) => {
    const round = (v) => (v === null ? null : Math.round(v * 10) / 10);
    return { workspaces: minutes.length, median_minutes: round(percentile(minutes, 0.5)), p75_minutes: round(percentile(minutes, 0.75)) };
};
/** The report as of `now`, from `since` (YYYY-MM-DD, UTC) when given. Reads only. */
function buildReport(db, { since = null, now = new (readDate())() } = {}) {
    const from = since ?? "";
    const nowMs = now.getTime();
    const count = (name, extra = "", ...p) => db.get(`SELECT COUNT(*) AS n FROM v2_events WHERE name = ? AND at >= ? ${extra}`, name, from, ...p)?.n ?? 0;
    const sample = new Set(db.all("SELECT ws_id FROM v2_events WHERE name = 'workspace_created' AND json_extract(props, '$.kind') = 'sample'").map((r) => r.ws_id));
    // First time of each event per workspace.
    const firsts = new Map();
    for (const r of db.all("SELECT ws_id, name, MIN(at) AS at FROM v2_events WHERE ws_id IS NOT NULL GROUP BY ws_id, name")) {
        if (!firsts.has(r.ws_id))
            firsts.set(r.ws_id, new Map());
        firsts.get(r.ws_id).set(r.name, r.at);
    }
    const reached = (ws, events) => events.some((e) => firsts.get(ws)?.has(e));
    // ---- access ----
    const access = {
        requested: count("access_requested"),
        requested_try: count("access_requested", "AND json_extract(props, '$.interest') = ?", "try"),
        requested_evaluate: count("access_requested", "AND json_extract(props, '$.interest') = ?", "evaluate"),
        approved: count("access_approved"),
        declined: count("access_declined"),
        codes_created: count("code_created"),
        codes_from_requests: count("code_created", "AND json_extract(props, '$.source') = ?", "request"),
        codes_redeemed: count("code_redeemed"),
    };
    // ---- the workspace funnel ----
    const cohort = db
        .all("SELECT ws_id, at FROM v2_events WHERE name = 'workspace_created' AND ws_id IS NOT NULL AND at >= ? ORDER BY at", from)
        .filter((r) => !sample.has(r.ws_id));
    const funnel = [];
    for (const [i, s] of FUNNEL.entries()) {
        const n = cohort.filter((w) => reached(w.ws_id, s.events)).length;
        funnel.push({ step: s.step, workspaces: n, of_previous: i ? share(n, funnel[i - 1].workspaces) : null, of_created: i ? share(n, cohort.length) : null });
    }
    // ---- time to first value ----
    const minutesTo = (startEvent) => cohort.flatMap((w) => {
        const start = firsts.get(w.ws_id)?.get(startEvent);
        const bound = firsts.get(w.ws_id)?.get("first_session_bound");
        return start && bound ? [Math.max(0, (readDate().parse(bound) - readDate().parse(start)) / 60000)] : [];
    });
    // ---- activity by week ----
    const thisWeek = weekStart(nowMs);
    const cohortStart = since ? weekStart(readDate().parse(`${since}T00:00:00Z`)) : thisWeek - (COHORT_WEEKS - 1) * WEEK_MS;
    const activityFrom = Math.min(thisWeek - WAW_WEEKS * WEEK_MS, cohortStart);
    const active = new Map();
    for (const r of db.all(`SELECT DISTINCT ws_id, substr(at, 1, 10) AS day FROM (
       SELECT ws_id, created_at AS at FROM v2_sessions
       UNION ALL SELECT ws_id, created_at FROM v2_epochs
       UNION ALL SELECT ws_id, received_at FROM v2_usage
       UNION ALL SELECT ws_id, at FROM v2_audit WHERE ws_id IS NOT NULL AND actor_id IS NOT NULL
     ) WHERE at >= ?`, new (readDate())(activityFrom).toISOString())) {
        if (sample.has(r.ws_id))
            continue;
        const w = weekStart(readDate().parse(`${r.day}T00:00:00Z`));
        if (!active.has(w))
            active.set(w, new Set());
        active.get(w).add(r.ws_id);
    }
    const activeIn = (w) => active.get(w)?.size ?? 0;
    const weekly = [];
    for (let i = WAW_WEEKS - 1; i >= 0; i--) {
        const w = thisWeek - i * WEEK_MS;
        const n = activeIn(w);
        const prev = activeIn(w - WEEK_MS);
        weekly.push({ week: isoDay(w), active: n, growth: prev > 0 ? Math.round(((n - prev) / prev) * 10000) / 10000 : null, complete: w + WEEK_MS <= nowMs });
    }
    // ---- retention by creation cohort ----
    const retention = [];
    const byWeek = new Map();
    for (const w of cohort) {
        const k = weekStart(readDate().parse(w.at));
        if (k < cohortStart)
            continue;
        if (!byWeek.has(k))
            byWeek.set(k, []);
        byWeek.get(k).push(w.ws_id);
    }
    for (const [k, wss] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) {
        const kept = (n) => {
            const w = k + n * WEEK_MS;
            if (w + WEEK_MS > nowMs)
                return null;
            return wss.filter((ws) => active.get(w)?.has(ws)).length;
        };
        const w1 = kept(1);
        const w4 = kept(4);
        retention.push({ cohort: isoDay(k), workspaces: wss.length, week1: w1, week1_share: w1 === null ? null : share(w1, wss.length), week4: w4, week4_share: w4 === null ? null : share(w4, wss.length) });
    }
    // ---- goal binding, from the session and usage tables ----
    const sess = db.get(`SELECT COUNT(*) AS n, SUM(EXISTS (SELECT 1 FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key AND e.goal_id IS NOT NULL)) AS bound
     FROM v2_sessions s WHERE s.created_at >= ?`, from);
    const live = db.get(`SELECT COUNT(*) AS requests, SUM(e.goal_id IS NOT NULL) AS bound_requests, SUM(u.est_list_usd_micros) AS usd,
            SUM(CASE WHEN e.goal_id IS NOT NULL THEN u.est_list_usd_micros END) AS bound_usd
     FROM v2_usage u LEFT JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     WHERE u.ts >= ?`, from);
    const rolled = db.get(`SELECT SUM(requests) AS requests, SUM(CASE WHEN goal_id <> '' THEN requests END) AS bound_requests,
            SUM(est_list_usd_micros) AS usd, SUM(CASE WHEN goal_id <> '' THEN est_list_usd_micros END) AS bound_usd
     FROM v2_spend_rollups WHERE day >= ?`, from);
    const requests = (live?.requests ?? 0) + (rolled?.requests ?? 0);
    const boundRequests = (live?.bound_requests ?? 0) + (rolled?.bound_requests ?? 0);
    const usd = (live?.usd ?? 0) + (rolled?.usd ?? 0);
    const boundUsd = (live?.bound_usd ?? 0) + (rolled?.bound_usd ?? 0);
    // ---- LOIs ----
    const lois = new Map();
    for (const r of db.all("SELECT ws_id, name, at FROM v2_events WHERE name IN ('loi_sent', 'loi_signed') AND at >= ? ORDER BY at", from)) {
        const e = lois.get(r.ws_id) ?? { ws_id: r.ws_id, sent_at: null, signed_at: null };
        if (r.name === "loi_sent")
            e.sent_at = r.at;
        else
            e.signed_at = r.at;
        lois.set(r.ws_id, e);
    }
    // ---- decision value (PORT-004) ----
    const sampleList = [...sample];
    const notSample = sampleList.length ? `AND ws_id NOT IN (${sampleList.map(() => "?").join(",")})` : "";
    const wsEvents = (name, extra = "", ...p) => db.all(`SELECT ws_id FROM v2_events WHERE name = ? AND at >= ? AND ws_id IS NOT NULL ${notSample} ${extra}`, name, from, ...sampleList, ...p);
    const viewedRows = wsEvents("value_card_viewed");
    const byEstimate = Object.fromEntries(ESTIMATES.map((e) => [e, wsEvents("value_reported", "AND json_extract(props, '$.estimate') = ?", e).length]));
    const value = {
        workspaces_with_approved_request: db.get(`SELECT COUNT(DISTINCT ws_id) AS n FROM v2_change_requests WHERE state = 'approved' AND decided_at >= ? ${notSample}`, from, ...sampleList)?.n ?? 0,
        viewed: { people: viewedRows.length, workspaces: new Set(viewedRows.map((r) => r.ws_id)).size },
        reported: { people: Object.values(byEstimate).reduce((a, b) => a + b, 0), by_estimate: byEstimate },
        follow_up_clicked: wsEvents("follow_up_clicked").length,
        access_from_value_card: {
            try: count("access_requested", "AND json_extract(props, '$.via') = ? AND json_extract(props, '$.interest') = ?", "value_card", "try"),
            evaluate: count("access_requested", "AND json_extract(props, '$.via') = ? AND json_extract(props, '$.interest') = ?", "value_card", "evaluate"),
        },
        first_ask: wsEvents("first_ask").length,
        first_limit: wsEvents("first_limit").length,
    };
    return {
        generated_at: now.toISOString(),
        since,
        access,
        funnel,
        other: {
            sample_workspaces_created: count("workspace_created", "AND json_extract(props, '$.kind') = ?", "sample"),
            invites_sent: count("invite_sent"),
            invites_accepted: count("invite_accepted"),
            people_with_a_first_session: count("member_first_session_captured"),
        },
        time_to_first_value: { from_workspace_created: timing(minutesTo("workspace_created")), from_code_redeemed: timing(minutesTo("code_redeemed")) },
        weekly_active_workspaces: weekly,
        retention,
        goal_binding: {
            sessions: sess?.n ?? 0,
            bound_sessions: sess?.bound ?? 0,
            sessions_share: share(sess?.bound ?? 0, sess?.n ?? 0),
            requests,
            bound_requests: boundRequests,
            requests_share: share(boundRequests, requests),
            est_list_usd_micros: usd,
            bound_est_list_usd_micros: boundUsd,
            spend_share: share(boundUsd, usd),
        },
        lois: { sent: count("loi_sent"), signed: count("loi_signed"), workspaces: [...lois.values()] },
        value,
    };
}
// ---- plain text ----
const pct = (v) => (v === null ? "-" : `${Math.round(v * 1000) / 10}%`);
const dur = (m) => {
    if (m === null)
        return "-";
    if (m < 60)
        return `${Math.round(m)}m`;
    if (m < 48 * 60)
        return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
    return `${Math.floor(m / 1440)}d ${Math.round((m % 1440) / 60)}h`;
};
const usdOf = (micros) => `$${(micros / 1e6).toFixed(2)}`;
function table(rows, head) {
    const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
    return [head.map((h, i) => h.padEnd(w[i])).join("  "), ...rows.map((r) => r.map((c, i) => String(c).padEnd(w[i])).join("  "))].map((l) => l.trimEnd());
}
/** The report as plain text tables. */
function formatReport(r) {
    const a = r.access;
    const g = r.goal_binding;
    const t = r.time_to_first_value;
    const out = [
        `Align report, ${r.generated_at}${r.since ? `, since ${r.since}` : ""} (weeks start Monday 00:00 UTC; sample workspaces left out)`,
        "",
        "Access",
        ...table([
            ["requested", a.requested, `${a.requested_try} try, ${a.requested_evaluate} evaluate`],
            ["approved", a.approved, pct(share(a.approved, a.requested))],
            ["declined", a.declined, pct(share(a.declined, a.requested))],
            ["codes created", a.codes_created, `${a.codes_from_requests} from requests`],
            ["codes redeemed", a.codes_redeemed, pct(share(a.codes_redeemed, a.codes_created))],
        ], ["step", "count", "detail"]),
        "",
        "Workspace funnel (workspaces created in the period that reached each step)",
        ...table(r.funnel.map((f) => [f.step, f.workspaces, pct(f.of_previous), pct(f.of_created)]), ["step", "workspaces", "of previous", "of created"]),
        "",
        "Time to first value (to the first session bound to a goal)",
        ...table([
            ["from workspace created", t.from_workspace_created.workspaces, dur(t.from_workspace_created.median_minutes), dur(t.from_workspace_created.p75_minutes)],
            ["from code redeemed", t.from_code_redeemed.workspaces, dur(t.from_code_redeemed.median_minutes), dur(t.from_code_redeemed.p75_minutes)],
        ], ["from", "workspaces", "median", "p75"]),
        "",
        "Weekly active workspaces (a shared session, epoch or usage upload, or a member's audited action, that week)",
        ...table(r.weekly_active_workspaces.map((w) => [w.complete ? w.week : `${w.week} (so far)`, w.active, w.growth === null ? "-" : `${w.growth >= 0 ? "+" : ""}${pct(w.growth)}`]), ["week", "active", "week on week"]),
        "",
        "Retention by creation week (active in week 1 and week 4 after it; - until that week ends)",
        ...(r.retention.length
            ? table(r.retention.map((c) => [c.cohort, c.workspaces, c.week1 === null ? "-" : `${c.week1} (${pct(c.week1_share)})`, c.week4 === null ? "-" : `${c.week4} (${pct(c.week4_share)})`]), ["cohort", "workspaces", "week 1", "week 4"])
            : ["(none)"]),
        "",
        "Bound to goals (sessions shared, and usage, in the period)",
        ...table([
            ["sessions", g.bound_sessions, g.sessions, pct(g.sessions_share)],
            ["requests", g.bound_requests, g.requests, pct(g.requests_share)],
            ["estimated spend", usdOf(g.bound_est_list_usd_micros), usdOf(g.est_list_usd_micros), pct(g.spend_share)],
        ], ["", "bound", "total", "share"]),
        "",
        "Other",
        ...table([
            ["sample workspaces created", r.other.sample_workspaces_created],
            ["invites sent", r.other.invites_sent],
            ["invites accepted", r.other.invites_accepted],
            ["people with a first shared session in a workspace", r.other.people_with_a_first_session],
        ], ["", "count"]),
        "",
        "Decision value (approved change requests and their value card; one per person per workspace)",
        ...table([
            ["workspaces with an approved request", r.value.workspaces_with_approved_request, ""],
            ["value card viewed", r.value.viewed.people, r.value.viewed.workspaces === 1 ? "1 workspace" : `${r.value.viewed.workspaces} workspaces`],
            ["value reported", r.value.reported.people, ESTIMATES.map((e) => `${r.value.reported.by_estimate[e]} ${e}`).join(", ")],
            ["follow-up clicked", r.value.follow_up_clicked, ""],
            ["access requested from the card", r.value.access_from_value_card.try + r.value.access_from_value_card.evaluate, `${r.value.access_from_value_card.try} try, ${r.value.access_from_value_card.evaluate} evaluate`],
            ["workspaces with a first ask", r.value.first_ask, ""],
            ["workspaces with a first limit", r.value.first_limit, ""],
        ], ["", "count", "detail"]),
        "",
        `LOIs (operator-recorded): ${r.lois.sent} sent, ${r.lois.signed} signed (verified originals only)`,
        ...(r.lois.workspaces.length
            ? table(r.lois.workspaces.map((l) => [l.ws_id, l.sent_at ? l.sent_at.slice(0, 10) : "-", l.signed_at ? l.signed_at.slice(0, 10) : "-"]), ["workspace", "sent", "signed"])
            : []),
    ];
    return out.join("\n");
}

return {weekStart,percentile,LOI_EVENTS,recordLoi,FUNNEL,WAW_WEEKS,buildReport,formatReport};
}
module.exports = {create_metrics};
