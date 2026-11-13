"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SAMPLE_RESOURCES = exports.WORKSPACE_RESOURCES = void 0;
exports.checkWorkspaceBindings = checkWorkspaceBindings;
exports.checkSampleBindings = checkSampleBindings;
// Private source-independent factory ABI acceptance.
const strict_1 = __importDefault(require("node:assert/strict"));
const server_workspaces_owned_fixture_v2_mjs_1 = require("./server-workspaces-owned-fixture-v2.mjs");
exports.WORKSPACE_RESOURCES = [...server_workspaces_owned_fixture_v2_mjs_1.abi.imports.map(x => x.name), 'readDate'];
exports.SAMPLE_RESOURCES = ['audit', 'run', 'newId', 'insertAlignment', 'insertChangeRequest', 'goalRow', 'insertGoal', 'newLimitId', 'createWorkspace', 'readDate'];
function checkWorkspaceBindings(factory) {
    strict_1.default.equal(typeof factory, 'function');
    strict_1.default.equal(factory.length, 1);
    strict_1.default.equal(factory.constructor.name, 'Function');
    const records = [];
    for (let fail = -1; fail < exports.WORKSPACE_RESOURCES.length; fail++) {
        const f = (0, server_workspaces_owned_fixture_v2_mjs_1.fixture)(), names = [], fault = new Error('Owned resource getter failure'), resources = {};
        for (const [index, name] of exports.WORKSPACE_RESOURCES.entries())
            Object.defineProperty(resources, name, { enumerable: true, get() {
                    names.push(name);
                    if (index === fail)
                        throw fault;
                    return name === 'readDate' ? () => f.Clock : f.resources[name];
                } });
        if (fail >= 0) {
            strict_1.default.throws(() => factory(resources), error => error === fault);
            strict_1.default.deepEqual(names, exports.WORKSPACE_RESOURCES.slice(0, fail + 1));
        }
        else {
            const value = factory(resources);
            strict_1.default.deepEqual(names, exports.WORKSPACE_RESOURCES);
            strict_1.default.deepEqual(f.trace, []);
            strict_1.default.deepEqual(Object.keys(value).sort(), server_workspaces_owned_fixture_v2_mjs_1.abi.exports.map(x => x.name).sort());
            for (const item of server_workspaces_owned_fixture_v2_mjs_1.abi.exports) {
                strict_1.default.equal(value[item.name].length, item.length);
                strict_1.default.equal(value[item.name].constructor.name, item.async ? 'AsyncFunction' : 'Function');
            }
            f.resources.get = () => { throw new Error('Resources must be captured once'); };
            strict_1.default.equal(value.nameTo('u2', 'u1'), 'Former u2');
            strict_1.default.equal(names.length, exports.WORKSPACE_RESOURCES.length);
        }
        records.push({ kind: 'workspace', fail, reads: names, identity_preserved: fail >= 0, constructor_service_effects: 0 });
    }
    return records;
}
function checkSampleBindings(factory) {
    strict_1.default.equal(typeof factory, 'function');
    strict_1.default.equal(factory.length, 1);
    strict_1.default.equal(factory.constructor.name, 'Function');
    const records = [];
    for (let fail = -1; fail < exports.SAMPLE_RESOURCES.length; fail++) {
        const names = [], fault = new Error('Owned resource getter failure'), resources = {};
        const unused = () => { throw new Error('Sample construction must not call a supplied service'); };
        for (const [index, name] of exports.SAMPLE_RESOURCES.entries())
            Object.defineProperty(resources, name, { enumerable: true, get() { names.push(name); if (index === fail)
                    throw fault; return unused; } });
        if (fail >= 0) {
            strict_1.default.throws(() => factory(resources), e => e === fault);
            strict_1.default.deepEqual(names, exports.SAMPLE_RESOURCES.slice(0, fail + 1));
        }
        else {
            const value = factory(resources);
            strict_1.default.deepEqual(names, exports.SAMPLE_RESOURCES);
            strict_1.default.deepEqual(Object.keys(value).sort(), ['SAMPLE_LIMIT_TEXT', 'SAMPLE_NAME', 'SAMPLE_REASON', 'createSampleWorkspace'].sort());
            for (const name of ['SAMPLE_LIMIT_TEXT', 'SAMPLE_NAME', 'SAMPLE_REASON'])
                strict_1.default.equal(typeof value[name], 'string');
            strict_1.default.equal(value.createSampleWorkspace.length, 3);
            strict_1.default.equal(value.createSampleWorkspace.constructor.name, 'AsyncFunction');
        }
        records.push({ kind: 'sample', fail, reads: names, identity_preserved: fail >= 0, constructor_service_effects: 0 });
    }
    return records;
}
