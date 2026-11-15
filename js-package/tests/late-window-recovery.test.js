"use strict";
const assert = require("assert");
const { createLateWindowRecovery } = require("../PBZForewarn/late-window-recovery");
let passed = 0;
function test(name, run) { run(); passed++; console.log("PASS " + name); }
const miss = { reason: "past-window", actor: "/Enemy/A", ability: "/Enemy/A/GA_OnlyDodge",
    activation: "1", timeline: "/Enemy/A/GA_OnlyDodge.Main", action: "/Enemy/A/GA_OnlyDodge.Main.Action_1",
    task: "/Task/A", color: "black", resourceId: "resource-95" };
const frame = { id: "native-1", source: "receive-map", actor: miss.actor, ability: miss.ability,
    activation: 1, timeline: miss.timeline, action: miss.action, taskCandidate: miss.task, gameTime: 10, hitGameTime: 10.25,
    remainingGameSeconds: 0.25, isDodge: true, isHit: false };

test("an expired warning plus a matching dodge-only frame produces one coloured recovery", () => {
    const r = createLateWindowRecovery(); r.recordMiss(miss, 1000); r.recordFrame(frame, 1020);
    const samples = r.samples({ now: 10, wall: 1020 });
    assert.equal(samples.length, 1); assert.equal(samples[0].events[0].color, "black");
    assert.equal(samples[0].events[0].meta.source, "late-window-dodge-recovery");
    assert.equal(samples[0].events[0].meta.resourceId, "resource-95");
    assert.equal(samples[0].events[0].end, 10.25);
});
test("frame-before-miss ordering is retained and matched in the same tick", () => {
    const r = createLateWindowRecovery(); r.recordFrame(frame, 1000); r.recordMiss(miss, 1005);
    assert.equal(r.samples({ now: 10, wall: 1005 }).length, 1);
});
test("only past-window misses and IsDodge true frames are eligible", () => {
    const r = createLateWindowRecovery();
    assert.equal(r.recordMiss({ ...miss, reason: "ineligible-through-window" }, 1000), false);
    assert.equal(r.recordFrame({ ...frame, isDodge: false }, 1000), false);
    r.recordMiss(miss, 1000); r.recordFrame({ ...frame, isHit: true }, 1000);
    assert.equal(r.samples({ now: 10, wall: 1000 }).length, 0);
});
test("actor, ability, activation, timeline and current-task contradictions reject a match", () => {
    for (const changed of [{ actor: "/Enemy/B" }, { ability: "/Enemy/A/Other" },
        { activation: "2" }, { timeline: "/Enemy/A/Other.Main" }, { action: "/Enemy/A/Other.Action" },
        { taskCandidate: "/Task/B" }]) {
        const r = createLateWindowRecovery(); r.recordMiss(miss, 1000); r.recordFrame({ ...frame, ...changed }, 1000);
        assert.equal(r.samples({ now: 10, wall: 1000 }).length, 0);
    }
});
test("past hit time and insufficient remaining time cannot produce a cue", () => {
    for (const changed of [{ hitGameTime: 9.9, remainingGameSeconds: -0.1 },
        { hitGameTime: 10.05, remainingGameSeconds: 0.05 }]) {
        const r = createLateWindowRecovery(); r.recordMiss(miss, 1000); r.recordFrame({ ...frame, ...changed }, 1000);
        assert.equal(r.samples({ now: 10, wall: 1000 }).length, 0);
    }
});
test("target filtering keeps the match pending without emitting", () => {
    const r = createLateWindowRecovery(); r.recordMiss(miss, 1000); r.recordFrame(frame, 1000);
    assert.equal(r.samples({ now: 10, wall: 1000, allowActor: () => false }).length, 0);
    assert.equal(r.samples({ now: 10, wall: 1010, allowActor: actor => actor === miss.actor }).length, 1);
});
test("repeated frames and hits emit only once", () => {
    const r = createLateWindowRecovery(); r.recordMiss(miss, 1000);
    r.recordFrame(frame, 1000); r.recordFrame({ ...frame, id: "native-2" }, 1001);
    assert.equal(r.samples({ now: 10, wall: 1001 }).length, 1);
    r.recordFrame(frame, 1002); assert.equal(r.samples({ now: 10, wall: 1002 }).length, 0);
});
test("old misses and frames expire explicitly", () => {
    const r = createLateWindowRecovery({ ttlMs: 500 }); r.recordMiss(miss, 1000); r.recordFrame(frame, 1000);
    assert.equal(r.samples({ now: 10, wall: 1600 }).length, 0);
    assert(r.status().counters.expired >= 2);
});
console.log("RESULT " + passed + " late-window recovery scenarios passed.");
