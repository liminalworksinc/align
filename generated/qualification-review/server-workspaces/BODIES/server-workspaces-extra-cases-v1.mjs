"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runExtra = runExtra;
// Private source-independent controls for callback results and skipped getters.
const strict_1 = __importDefault(require("node:assert/strict"));
const server_workspaces_owned_fixture_v2_mjs_1 = require("./server-workspaces-owned-fixture-v2.mjs");
async function runExtra(load) {
    const records = [];
    {
        const f = (0, server_workspaces_owned_fixture_v2_mjs_1.fixture)(), marker = { ownedDelegatedResult: true };
        f.resources.softDeleteWorkspace = function (...args) { strict_1.default.equal(this, undefined); f.trace.push(['softDeleteWorkspace', ...args]); return marker; };
        const ns = await load(f);
        let value, error;
        try {
            value = await ns.deleteWorkspace(f.pp);
        }
        catch (e) {
            error = e;
        }
        strict_1.default.equal(error, undefined);
        strict_1.default.equal(value, undefined);
        const commit = f.trace.filter(x => x[0] === 'tx:commit');
        strict_1.default.equal(commit.length, 1);
        strict_1.default.equal(commit[0][1], marker, 'The delegated result is the transaction callback result');
        records.push({ name: 'delete-delegation-callback-result', observation: (0, server_workspaces_owned_fixture_v2_mjs_1.normal)({ value, error, trace: f.trace, delegated_callback_result_identity: commit[0][1] === marker }) });
    }
    {
        const f = (0, server_workspaces_owned_fixture_v2_mjs_1.fixture)({ getRows: [{ x: 1 }, undefined, { role: 'member' }] }), original = f.resources.get;
        const fault = new Error('Unneeded workspace-role getter');
        let calls = 0, reads = 0;
        f.resources.get = function (...args) {
            strict_1.default.equal(this, undefined);
            const row = original(...args);
            if (++calls === 3)
                Object.defineProperty(row, 'role', { enumerable: true, get() { reads++; throw fault; } });
            return row;
        };
        const ns = await load(f);
        let value, error;
        try {
            value = await ns.setTeamMember(f.pp, 'pod1', 'u2', 'member');
        }
        catch (e) {
            error = e;
        }
        strict_1.default.equal(error, undefined);
        strict_1.default.equal(reads, 0, 'A non-lead request skips the workspace member role field');
        strict_1.default.equal(calls, 3);
        strict_1.default.deepEqual(f.remaining(), { get: 0, all: 0 });
        records.push({ name: 'non-lead-skips-workspace-role-getter', observation: (0, server_workspaces_owned_fixture_v2_mjs_1.normal)({ value, error, trace: f.trace, unneeded_role_reads: reads }) });
    }
    return records;
}
