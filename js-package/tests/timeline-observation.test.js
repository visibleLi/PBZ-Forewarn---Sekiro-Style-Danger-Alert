"use strict";
const assert = require("assert");
const { captureTimelineActions } = require("../PBZForewarn/timeline-observation");
const { createAdapter } = require("../PBZForewarn/adapter");
let passed = 0;
function test(name, run) { run(); passed++; console.log("PASS " + name); }
const arr = values => ({ Num: () => values.length, Get: index => values[index] });
const safe = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };
const adapter = { safe, valid: x => !!x && x.valid !== false,
    path: x => x && x.path || "", list: x => x ? [...Array(x.Num())].map((_, index) => x.Get(index)) : [],
    eventTimes: createAdapter({}, {}).eventTimes };
function action(path, props) { return Object.freeze({ path, ...props, GetClass: () => ({ path: "/Class/Attack" }) }); }
function event(a, props) { return Object.freeze({ Action: a, StartTime: 1, duration: 0.2, ...props }); }
function timeline(events, layers = []) { return Object.freeze({ path: "/Timeline", Actions: arr(events), RoleLayers: arr(layers) }); }
const task = Object.freeze({ path: "/Task" });

test("reads attack type without writing immutable engine objects", () => {
    const a = action("/Action", { DeflectBulletType: 3 });
    const result = captureTimelineActions(adapter, timeline([event(a)]), task, { activation: "1" });
    assert.equal(result.plans[0].typeName, "RedEye"); assert.equal(result.plans[0].action, "/Action");
    assert.equal(result.plans[0].usedForScheduling, false); assert.equal(a.DeflectBulletType, 3);
});
test("burst field stays distinct and power attack is not invented as red", () => {
    const result = captureTimelineActions(adapter, timeline([event(action("/Burst", { DeflectType: 4 }))]), task);
    assert.equal(result.plans[0].typeName, "PowerAttack"); assert(!("color" in result.plans[0]));
});
test("conflicting fields remain explicit unverified evidence", () => {
    const p = captureTimelineActions(adapter, timeline([event(action("/A", { DeflectType: 2, DeflectBulletType: 3 }))]), task).plans[0];
    assert.equal(p.typeConflict, true); assert.equal(p.executableBranchConfirmed, false);
});
test("event offsets remain timeline coordinates rather than game-clock timestamps", () => {
    const p = captureTimelineActions(adapter, timeline([event(action("/A", { DeflectType: 2 }),
        { TriggerTimeOffset: 0.1, EndTriggerTimeOffset: 0.2 })]), task).plans[0];
    assert.equal(p.start, 1.1); assert.equal(p.end, 1.4); assert(!("warningGameTime" in p));
});
test("ordinary non-attack action produces no semantic plan", () => {
    assert.equal(captureTimelineActions(adapter, timeline([event(action("/A", {}))]), task).plans.length, 0);
});
test("timing-only candidates are retained without inferred colour", () => {
    const p = captureTimelineActions(adapter, timeline([event(action("/A", { PreHitPointDuration: 0.3 }))]), task).plans[0];
    assert.equal(p.typeName, null); assert(!("color" in p));
});
test("same template in different executions retains caller activation and actor", () => {
    const t = timeline([event(action("/A", { DeflectType: 2 }))]);
    const p = captureTimelineActions(adapter, t, task, { actor: "/Enemy1", activation: "1" }).plans[0];
    const q = captureTimelineActions(adapter, t, task, { actor: "/Enemy2", activation: "2" }).plans[0];
    assert.equal(p.actor, "/Enemy1"); assert.equal(q.actor, "/Enemy2"); assert.notEqual(p.activation, q.activation);
});
test("role layer is captured with unresolved role ownership explicitly marked", () => {
    const p = captureTimelineActions(adapter, timeline([], [{ Actions: arr([event(action("/RoleAction", { DeflectType: 2 }))]) }]), task).plans[0];
    assert.equal(p.layer, "role0"); assert.equal(p.roleActorUnresolved, true);
    assert.equal(p.actor, null); assert.equal(p.ability, null); assert.equal(p.activation, null);
});
test("unreadable arrays and invalid actions are visible without crashing", () => {
    const t = timeline([event(null)]); const result = captureTimelineActions(adapter, t, task);
    assert.equal(result.plans.length, 0); assert.equal(result.status.unreadable, 1);
    assert.equal(captureTimelineActions(adapter, {}, task).status.unreadable, 1);
});
test("bounded scans report truncation rather than imply complete coverage", () => {
    const t = timeline(Array.from({ length: 5 }, (_, i) => event(action("/A" + i, { DeflectType: 2 }))));
    const r = captureTimelineActions(adapter, t, task, {}, 2);
    assert.equal(r.plans.length, 2); assert.equal(r.status.scanned, 2); assert.equal(r.status.truncated, true);
});
test("invalid times remain null rather than substitute current time", () => {
    const p = captureTimelineActions(adapter, timeline([event(action("/A", { DeflectType: 2 }), { StartTime: NaN })]), task).plans[0];
    assert.equal(p.start, null); assert.equal(p.end, null);
});
test("two nodes sharing the same action preserve node identity", () => {
    const a = action("/A", { DeflectType: 2 });
    const r = captureTimelineActions(adapter, timeline([event(a), event(a, { StartTime: 2 })]), task);
    assert.equal(r.plans.length, 2); assert.notEqual(r.plans[0].eventKey, r.plans[1].eventKey);
});
console.log("RESULT " + passed + " timeline observation scenarios passed");
