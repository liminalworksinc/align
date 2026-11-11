"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sampleCase = sampleCase;
exports.runSampleCases = runSampleCases;
exports.sampleInstanceIsolation = sampleInstanceIsolation;
// Private source-independent sample service fixture. No implementation import.
const strict_1 = __importDefault(require("node:assert/strict"));
const ASSET = {
    "workspace_name": "Northstar (sample)",
    "change_request_reason": "This is a sample change request. Onboarding can't launch to regulated customers until a pen test is booked, so this asks the security goal to measure that too. In a real workspace a teammate proposes changes to a goal they don't own and the goal's owner or team lead decides. Here you own the goal, so you can approve it (then launch it, which is when agents get the new version), suggest a change, reject it, withdraw it or update it to try each step.",
    "limit_text": "Push the pen-test window past May",
    "limit_source_title": "Security review kickoff",
    "team_names": [
        "Product",
        "Security"
    ],
    "goals": [
        {
            "title": "Expand to regulated customers",
            "measures": [
                {
                    "text": "Regulated customers live",
                    "target": "3 this year"
                }
            ]
        },
        {
            "title": "Pass the security review",
            "measures": [
                {
                    "text": "Open high-severity findings",
                    "target": "0"
                },
                {
                    "text": "Review signed off",
                    "target": "end of quarter"
                }
            ]
        },
        {
            "title": "Ship self-serve onboarding",
            "measures": [
                {
                    "text": "New teams set up without help",
                    "target": "80%"
                }
            ]
        }
    ],
    "pending_measure": {
        "text": "Pen test window booked",
        "target": "before launch"
    }
};
async function sampleCase(load, { failAt = -1, mode = 'ordinary', changingClock = false } = {}) {
    const effects = [], goals = [], alignments = [], changes = [], teamRows = [];
    let id = 0, seed, seedResult, received, called = 0;
    const injected = new Error('owned source effect failure');
    const at = '2026-01-02T03:04:05.000Z';
    const result = { id: 'workspace-owned', name: 'Northstar (sample)', role: 'owner' };
    const req = {}, principal = { user: { id: 'owned-person' } };
    const effect = (name, args) => { effects.push({ name, args: JSON.parse(JSON.stringify(args)) }); if (called++ === failAt)
        throw injected; };
    const rows = new Map();
    const services = {
        audit: (...args) => effect('audit', args),
        run: (...args) => { effect('run', args); teamRows.push(args); return 1; },
        newId: (prefix) => { effect('newId', [prefix]); return prefix + '-' + (++id); },
        newLimitId: () => { effect('newLimitId', []); return 'limit-' + (++id); },
        insertGoal: (pp, body, time) => { effect('insertGoal', [pp, body, time]); const key = 'goal-' + (++id); goals.push({ pp, body, time, key }); rows.set(key, { id: key, measures_json: JSON.stringify(body.measures) }); return key; },
        goalRow: (ws, key) => { effect('goalRow', [ws, key]); if (mode === 'missing-row')
            return undefined; if (mode === 'invalid-json')
            return { id: key, measures_json: '{' }; return rows.get(key); },
        insertAlignment: (...args) => { effect('insertAlignment', args); alignments.push(args); },
        insertChangeRequest: (...args) => { effect('insertChangeRequest', args); changes.push(args); },
        createWorkspace: (...args) => { effect('createWorkspace', args.slice(0, 4)); received = args; seed = args[4]; seedResult = seed('workspace-owned', mode === 'invalid-date' ? 'invalid' : at); return result; },
    };
    for (const [name, original] of Object.entries(services))
        services[name] = function (...args) { strict_1.default.equal(this, undefined, 'Bare supplied service receiver: ' + name); return original(...args); };
    const clockReads = [];
    let counter = 0;
    const readDate = () => {
        const n = ++counter;
        clockReads.push(['Date', n]);
        class Clock extends Date {
            constructor(...args) { clockReads.push(['construct', n, ...args]); super(...args); }
            static parse(value) { clockReads.push(['parse', n, this === Clock, value]); return Date.parse(value); }
        }
        return Clock;
    };
    const ns = await load({ resources: services, Clock: Date }, changingClock ? { readDate } : {});
    strict_1.default.equal(effects.length, 0);
    strict_1.default.equal(counter, 0, 'No constructor-time date reads');
    strict_1.default.equal(ns.createSampleWorkspace.length, 3);
    const assets = ASSET;
    strict_1.default.equal(ns.SAMPLE_NAME, assets.workspace_name);
    strict_1.default.equal(ns.SAMPLE_REASON, assets.change_request_reason);
    strict_1.default.equal(ns.SAMPLE_LIMIT_TEXT, assets.limit_text);
    try {
        const value = await ns.createSampleWorkspace(req, principal, 'owned-code');
        strict_1.default.equal(value, result);
        strict_1.default.equal(received[0], req);
        strict_1.default.equal(received[1], principal);
        strict_1.default.equal(seed.length, 2);
        strict_1.default.equal(seedResult, undefined);
        strict_1.default.equal(goals.length, 3);
        strict_1.default.equal(alignments.length, 2);
        strict_1.default.equal(changes.length, 1);
        strict_1.default.equal(goals[0].pp.pods.size, 2);
        strict_1.default.deepEqual([...goals[0].pp.pods.values()], ['lead', 'lead']);
        strict_1.default.equal(goals[0].pp, goals[1].pp);
        strict_1.default.equal(goals[1].pp, goals[2].pp);
        strict_1.default.equal(goals[0].body.anchors, goals[1].body.anchors);
        strict_1.default.equal(goals[1].body.anchors, goals[2].body.anchors);
        strict_1.default.deepEqual(goals.map(g => g.time), [at, '2026-01-02T03:04:05.002Z', '2026-01-02T03:04:05.001Z']);
        strict_1.default.equal(changes[0][2].measures.length, 3);
        const anchor = goals[0].body.anchors;
        anchor.repos.push('owned-marker');
        await ns.createSampleWorkspace(req, principal, null);
        strict_1.default.equal(goals[3].body.anchors, anchor);
        strict_1.default.equal(goals[3].body.anchors.repos[0], 'owned-marker');
        strict_1.default.equal(failAt, -1);
        strict_1.default.equal(mode, 'ordinary');
        return { kind: 'success', effects: effects.slice(0, effects.length / 2), single_call_effects: effects.length / 2, shared_anchors_across_calls: true, shared_principal_within_seed: true, seed_arity: seed.length, seed_returns_undefined: true, result_identity_preserved: true, export_texts_equal_asset: true, ...(changingClock ? { clockReads } : {}) };
    }
    catch (error) {
        if (failAt >= 0) {
            strict_1.default.equal(error, injected);
            strict_1.default.equal(effects.length, failAt + 1);
            return { kind: 'injected-failure', position: failAt, effect: effects.at(-1).name, error_identity_preserved: true, effects };
        }
        strict_1.default.notEqual(mode, 'ordinary');
        return { kind: 'malformed-input-observation', mode, error: { name: error.name, message: error.message }, effects };
    }
}
async function runSampleCases(load) {
    const records = [], baseline = await sampleCase(load);
    records.push(baseline);
    for (let i = 0; i < baseline.single_call_effects; i++) {
        const row = await sampleCase(load, { failAt: i });
        strict_1.default.deepEqual(row.effects, baseline.effects.slice(0, i + 1));
        records.push(row);
    }
    for (const mode of ['missing-row', 'invalid-json', 'invalid-date'])
        records.push(await sampleCase(load, { mode }));
    return records;
}
async function sampleInstanceIsolation(load) {
    const anchors = [];
    const observed = async (f, options) => {
        const original = f.resources.insertGoal;
        f.resources.insertGoal = function (...args) { anchors.push(args[1].anchors); return original(...args); };
        return load(f, options);
    };
    await sampleCase(observed);
    await sampleCase(observed);
    strict_1.default.equal(anchors.length, 12);
    for (let i = 0; i < 6; i++)
        strict_1.default.equal(anchors[i], anchors[0]);
    for (let i = 6; i < 12; i++)
        strict_1.default.equal(anchors[i], anchors[6]);
    strict_1.default.notEqual(anchors[0], anchors[6]);
    strict_1.default.deepEqual([...anchors[0].repos], ['owned-marker']);
    strict_1.default.deepEqual([...anchors[6].repos], ['owned-marker']);
    return { calls: 4, goals: 12, anchors_shared_within_instance: true, anchors_isolated_across_instances: true };
}
