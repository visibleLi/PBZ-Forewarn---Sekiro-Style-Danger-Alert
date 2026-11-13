"use strict";
const assert = require("assert");
const vm = require("vm");
const { createObservationStore } = require("../PBZForewarn/observation-store");
let passed = 0;
function test(name, run) { run(); passed++; console.log("PASS " + name); }
const identity = { worldKey: "/World/A", player: "/Player/A", clockEpoch: 1, actor: "/Enemy/A", ability: "/Enemy/A/GA_1",
    activation: 1, action: "/Enemy/A/GA_1/Action_2", task: "/Task/1", timeline: "/Timeline/Main" };
function addPair(store, plan = {}, frame = {}) {
    store.record("warning-plan", { ...identity, eventKey: "main/2", start: 0.5, end: 0.8, ...plan });
    store.record("native-frame", { ...identity, handle: 4, hitGameTime: 8.2, gameTime: 7.9, ...frame });
    return store.snapshot();
}
const plans = snapshot => snapshot.correlations.filter(x => x.kind === "warning-plan");

test("observation has no confirmed outcome even for a unique shared source", () => {
    const s = addPair(createObservationStore({ session: "test" }));
    assert.equal(s.mode, "observe-only"); assert.equal(s.schemaVersion, 1);
    assert.equal(plans(s)[0].status, "suggested-unique-source"); assert.equal(plans(s)[0].perStrikeIdentity, false);
    assert.equal(plans(s)[0].confirmedHit, false); assert.equal(plans(s)[0].confirmedWarningBegin, false);
    assert.equal(s.summary.kindCounts["native-frame"], 1);
});
test("same event key supplies per-strike evidence without claiming execution", () => {
    const s = addPair(createObservationStore(), {}, { eventKey: "main/2" });
    assert.equal(plans(s)[0].identityEvidence, "shared-eventKey"); assert.equal(plans(s)[0].perStrikeIdentity, true);
    assert.equal(plans(s)[0].confirmedWarningBegin, false);
});
test("two enemies using the same class never share instance evidence", () => {
    const store = createObservationStore();
    store.record("warning-plan", { ...identity, eventKey: "main/2" });
    store.record("native-frame", { ...identity, actor: "/Enemy/B", ability: "/Enemy/B/GA_1", handle: 1 });
    assert.equal(plans(store.snapshot())[0].status, "unlinked");
});
test("the same ability reused with a different activation remains unlinked", () => {
    const s = addPair(createObservationStore(), {}, { activation: 2 });
    assert.equal(plans(s)[0].status, "unlinked");
});
test("two players cannot borrow one another's received frame", () => {
    const s = addPair(createObservationStore(), {}, { player: "/Player/B" });
    assert.equal(plans(s)[0].status, "unlinked");
});
test("multiple hits from one action stay ambiguous without per-strike identity", () => {
    const store = createObservationStore(); addPair(store);
    store.record("native-frame", { ...identity, handle: 5, hitGameTime: 8.4, gameTime: 7.9 });
    assert.equal(plans(store.snapshot())[0].status, "ambiguous");
});
test("one frame shared by two warning nodes is ambiguous", () => {
    const store = createObservationStore(); addPair(store);
    store.record("warning-plan", { ...identity, eventKey: "main/3", start: 0.6 });
    assert(plans(store.snapshot()).every(x => x.status === "ambiguous"));
});
test("explicit event identities separate two hits sharing the same action", () => {
    const store = createObservationStore(); addPair(store, {}, { eventKey: "main/2" });
    store.record("warning-plan", { ...identity, eventKey: "main/3" });
    store.record("native-frame", { ...identity, eventKey: "main/3", handle: 5, hitGameTime: 8.4 });
    assert(plans(store.snapshot()).every(x => x.status === "suggested-unique-source" && x.perStrikeIdentity));
});
test("a matching attack ID cannot conceal a contradictory event key", () => {
    const s = addPair(createObservationStore(), { attackId: "attack-1" }, { attackId: "attack-1", eventKey: "main/OTHER" });
    assert.equal(plans(s)[0].status, "unlinked");
});
test("empty or unknown identities cannot create source correlations", () => {
    for (const value of ["", "unknown", "unavailable", null]) {
        const s = addPair(createObservationStore(), { activation: value }, { activation: value });
        assert.equal(plans(s)[0].status, "unlinked"); assert(plans(s)[0].reason.includes("activation"));
    }
});
test("numeric object identity is not accepted as an engine instance path", () => {
    const s = addPair(createObservationStore(), { actor: 42 }, { actor: 42 });
    assert.equal(plans(s)[0].status, "unlinked");
});
test("missing clock epoch prevents accidental cross-reset association", () => {
    const s = addPair(createObservationStore(), { clockEpoch: null }, { clockEpoch: null });
    assert.equal(plans(s)[0].reason, "missing-identity:clockEpoch");
});
test("same world and activation after clock reset still stay distinct", () => {
    const s = addPair(createObservationStore(), {}, { clockEpoch: 2, gameTime: 0.1 });
    assert.equal(plans(s)[0].status, "unlinked");
});
test("out-of-order records preserve evidence without deriving a new epoch", () => {
    const store = createObservationStore();
    store.record("native-frame", { ...identity, handle: 4, hitGameTime: 8.2, gameTime: 7.9 });
    store.record("warning-plan", { ...identity, eventKey: "main/2", gameTime: 7.0 });
    assert.equal(plans(store.snapshot())[0].status, "suggested-unique-source");
});
test("repeated observations remain in history but do not invent extra attacks", () => {
    const store = createObservationStore(); addPair(store);
    store.record("warning-plan", { ...identity, eventKey: "main/2", start: 0.5, end: 0.8 });
    store.record("native-frame", { ...identity, handle: 4, hitGameTime: 8.2, gameTime: 8.0 });
    const s = store.snapshot(); assert.equal(s.events.length, 4); assert.equal(plans(s).length, 1);
    assert.equal(plans(s)[0].observationSeqs.length, 2); assert.equal(plans(s)[0].nativeObservationSeqs.length, 2);
});
test("task or timeline mismatch blocks otherwise identical sources", () => {
    for (const mismatch of [{ task: "/Task/2" }, { timeline: "/Timeline/Other" }]) {
        const s = addPair(createObservationStore(), {}, mismatch);
        assert.equal(plans(s)[0].status, "unlinked");
    }
});
test("wall time and relative timeline offsets are never compared to game time", () => {
    const s = addPair(createObservationStore(), { start: 0.02484, TriggerTimeOffset: 2.0, wallTime: 1800000000000 },
        { gameTime: 7.9, hitGameTime: 8.2, wallTime: 20 });
    const row = plans(s)[0];
    assert(Math.abs(row.reportedFrameLeadToHitMs - 300) < 0.001);
    assert.equal(row.frameBeforePlannedWarningMs, undefined);
});
test("explicit absolute warning game time allows a labelled same-clock comparison", () => {
    const s = addPair(createObservationStore(), { warningGameTime: 8.0 });
    assert(Math.abs(plans(s)[0].frameBeforePlannedWarningMs - 100) < 0.001);
});
test("power attack is retained verbatim and never relabelled red", () => {
    const s = addPair(createObservationStore(), {}, { typeName: "PowerAttack", typeValue: 4 });
    assert.equal(s.events[1].typeName, "PowerAttack"); assert.equal(s.events[1].typeValue, 4);
    assert.equal(s.events[1].color, undefined); assert.equal(plans(s)[0].color, undefined);
});
test("non-finite timing is explicit sanitized data, never a fabricated zero", () => {
    const s = addPair(createObservationStore(), {}, { hitGameTime: NaN, gameTime: Infinity });
    assert.equal(s.events[1].hitGameTime, null); assert.equal(s.events[1].gameTime, null);
    assert.equal(plans(s)[0].reportedFrameLeadToHitMs, undefined); assert.equal(s.counters.sanitizedValues, 2);
    assert.doesNotThrow(() => JSON.stringify(s));
});
test("getter, engine object, function, cycle, and hostile proxy are never invoked or retained", () => {
    let calls = 0; const cycle = {}; cycle.self = cycle;
    class EngineObject { IsValid() { calls++; throw Error("engine access"); } }
    const data = { ...identity, obj: new EngineObject(), fn() { calls++; }, cycle,
        hostile: new Proxy({}, { ownKeys() { throw Error("bad wrapper"); } }) };
    Object.defineProperty(data, "accessor", { get() { calls++; throw Error("getter"); }, enumerable: true });
    const store = createObservationStore(); assert.equal(store.record("native-frame", data), true);
    const s = store.snapshot(); assert.equal(calls, 0); assert.equal(s.events[0].obj, null);
    assert.equal(s.events[0].fn, null); assert.equal(s.events[0].cycle.self, null);
    assert.equal(s.events[0].accessor, null); assert.equal(s.events[0].hostile, null);
});
test("foreign-realm plain data is copied and later source mutations do not leak", () => {
    const data = vm.runInNewContext('({actor:"/A", values:[1,{v:2}]})');
    const store = createObservationStore(); store.record("timeline-call", data); data.values[1].v = 9;
    assert.equal(store.snapshot().events[0].values[1].v, 2);
});
test("invalid or truncated identity cannot become a matching source", () => {
    const actor = "/Enemy/" + "x".repeat(5000);
    const s = addPair(createObservationStore(), { actor }, { actor });
    assert.equal(plans(s)[0].status, "unlinked"); assert.equal(plans(s)[0].reason, "invalid-identity:actor");
});
test("truncated optional strike identity cannot manufacture a unique link", () => {
    const eventKey = "main/" + "x".repeat(5000);
    const s = addPair(createObservationStore(), { eventKey }, { eventKey });
    assert.equal(plans(s)[0].status, "unlinked"); assert.equal(plans(s)[0].reason, "invalid-identity:eventKey");
});
test("strict UTF-8 array byte budget and FIFO losses are observable", () => {
    const store = createObservationStore({ maxRecords: 3, maxBytes: 220 });
    for (let i = 0; i < 15; i++) store.record("timeline-call", { text: "危😀", i });
    const s = store.snapshot(), bytes = Buffer.byteLength(JSON.stringify(s.events), "utf8");
    assert.equal(s.counters.bytes, bytes); assert(bytes <= 220); assert(s.events.length <= 3);
    assert(s.counters.evicted > 0); assert.equal(s.counters.accepted, 15); assert.equal(s.summary.completeHistory, false);
});
test("oversized data is rejected without evicting useful history", () => {
    const store = createObservationStore({ maxBytes: 220 }); store.record("timeline-call", { small: true });
    assert.equal(store.record("native-frame", { large: "x".repeat(1000) }), false);
    const s = store.snapshot(); assert.equal(s.events.length, 1); assert.equal(s.counters.oversized, 1);
    assert.equal(s.counters.evicted, 0);
});
test("disabled capture never reads the data argument", () => {
    const store = createObservationStore({ enabled: false });
    assert.equal(store.record("native-frame", new Proxy({}, { getPrototypeOf() { throw Error("read"); } })), false);
    const s = store.snapshot(); assert.equal(s.events.length, 0); assert.equal(s.counters.disabled, 1);
    assert.equal(s.summary.completeHistory, false);
});
test("limits cannot exceed the maximum and invalid envelopes are rejected", () => {
    const store = createObservationStore({ maxRecords: 999999, maxBytes: 9999999 });
    for (const [kind, data] of [["", {}], [" bad ", {}], ["native-frame", undefined], ["native-frame", []]])
        assert.equal(store.record(kind, data), false);
    const s = store.snapshot(); assert.equal(s.counters.maxRecords, 2048); assert.equal(s.counters.maxBytes, 1024 * 1024);
    assert.equal(s.counters.rejected, 4);
});
test("frame end and native begin observations do not fabricate outcomes or new frames", () => {
    const store = createObservationStore();
    store.record("native-frame-ended", { ...identity, handle: 4, reason: "no-longer-present" });
    store.record("native-warning-begin", { ...identity, eventKey: "main/2" });
    const s = store.snapshot(); assert.equal(s.correlations.length, 0);
    assert.equal(s.summary.kindCounts["native-warning-begin"], 1);
    assert(!JSON.stringify(s).includes('"confirmedHit":true'));
});
test("attack-plan has its own source-only suggestion and summary", () => {
    const store = createObservationStore();
    store.record("attack-plan", { ...identity, eventKey: "damage/2", start: 0.7, end: 0.8 });
    store.record("native-frame", { ...identity, handle: 4, hitGameTime: 8.2, gameTime: 7.9 });
    const s = store.snapshot(), row = s.correlations.find(x => x.kind === "attack-plan");
    assert.equal(row.status, "suggested-unique-source"); assert.equal(row.perStrikeIdentity, false);
    assert.equal(row.confirmedHit, false); assert.equal(row.confirmedWarningBegin, false);
    assert.equal(s.summary.planCorrelations["attack-plan"].suggestedUniqueSources, 1);
    assert.equal(s.summary.planCorrelations["warning-plan"].count, 0);
});
test("nearby FX and damage timing never substitutes for exact action identity", () => {
    const store = createObservationStore();
    store.record("warning-plan", { ...identity, action: "/Action/FX", eventKey: "fx/2", start: 0.5 });
    store.record("attack-plan", { ...identity, action: "/Action/Damage", eventKey: "damage/2", start: 0.50001 });
    store.record("native-frame", { ...identity, action: "/Action/Damage", handle: 4 });
    const s = store.snapshot();
    assert.equal(plans(s)[0].status, "unlinked");
    assert.equal(s.correlations.find(x => x.kind === "attack-plan").status, "suggested-unique-source");
    assert.equal(s.summary.planCorrelations["warning-plan"].unlinked, 1);
});
test("warning-plan and attack-plan are not collapsed if both describe one action", () => {
    const store = createObservationStore(); addPair(store);
    store.record("attack-plan", { ...identity, eventKey: "main/2", start: 0.5, end: 0.8 });
    const s = store.snapshot();
    assert.equal(s.summary.planCorrelations["warning-plan"].ambiguous, 1);
    assert.equal(s.summary.planCorrelations["attack-plan"].ambiguous, 1);
});
test("many ambiguous candidates expose counts without quadratic serialized sequence expansion", () => {
    const store = createObservationStore({ maxRecords: 200 });
    store.record("attack-plan", { ...identity, eventKey: "damage/2" });
    for (let i = 0; i < 80; i++) store.record("native-frame", { ...identity, handle: i, hitGameTime: i });
    const row = store.snapshot().correlations[0];
    assert.equal(row.status, "ambiguous"); assert.equal(row.nativeCandidateCount, 80);
    assert.equal(row.nativeObservationSeqs.length, 64); assert.equal(row.nativeObservationSeqsOmitted, 16);
});
test("an oversized source bucket cannot create false uniqueness from partial evaluation", () => {
    const store = createObservationStore({ maxCorrelationComparisons: 3 });
    for (let i = 0; i < 2; i++) store.record("attack-plan", { ...identity, eventKey: "hit/" + i });
    for (let i = 0; i < 2; i++) store.record("native-frame", { ...identity, handle: i });
    const s = store.snapshot();
    assert.equal(s.analysis.comparisons, 0); assert.equal(s.analysis.unanalysedPlanUnits, 2);
    assert.equal(s.analysis.unanalysedObservationRecords, 4); assert.equal(s.analysis.complete, false);
    assert(s.correlations.every(x => x.status === "unlinked" && x.reason === "analysis-budget-exceeded"));
    assert.equal(s.summary.suggestedUniqueSources, 0); assert.equal(s.summary.completeHistory, true);
});
test("source bucket index avoids comparing every plan to every unrelated frame", () => {
    const store = createObservationStore();
    for (let i = 0; i < 100; i++) {
        const id = { ...identity, actor: "/Enemy/" + i, ability: "/Enemy/" + i + "/Ability", action: "/Action/" + i };
        store.record("attack-plan", { ...id, eventKey: "hit" });
        store.record("native-frame", { ...id, handle: 1 });
    }
    const s = store.snapshot();
    assert.equal(s.analysis.sourceBuckets, 100); assert.equal(s.analysis.comparisons, 100);
    assert.equal(s.summary.planCorrelations["attack-plan"].suggestedUniqueSources, 100);
    assert.equal(s.analysis.complete, true);
});
test("exhausted comparison budget leaves remaining plans explicitly unanalyzed", () => {
    const store = createObservationStore({ maxCorrelationComparisons: 1 });
    addPair(store);
    const id = { ...identity, actor: "/Other/Enemy", ability: "/Other/Ability", action: "/Other/Action" };
    store.record("attack-plan", { ...id, eventKey: "hit" }); store.record("native-frame", { ...id, handle: 1 });
    const s = store.snapshot();
    assert.equal(s.analysis.comparisons, 1); assert.equal(s.analysis.analyzedPlanUnits, 1);
    assert.equal(s.analysis.unanalysedPlanUnits, 1);
    assert.equal(s.correlations.find(x => x.kind === "attack-plan").reason, "analysis-budget-exceeded");
});
test("row output limit preserves complete event history and full summary counts", () => {
    const store = createObservationStore({ maxCorrelationRows: 2 });
    for (let i = 0; i < 3; i++) {
        const id = { ...identity, actor: "/Enemy/" + i };
        store.record("attack-plan", { ...id, eventKey: "hit" }); store.record("native-frame", { ...id, handle: 1 });
    }
    const s = store.snapshot();
    assert.equal(s.events.length, 6); assert.equal(s.correlations.length, 2);
    assert.equal(s.summary.planCorrelations["attack-plan"].suggestedUniqueSources, 3);
    assert.equal(s.analysis.totalRows, 3); assert.equal(s.analysis.omittedRows, 1);
    assert.equal(s.analysis.omittedObservationRecords, 1); assert.equal(s.analysis.rowsTruncated, true);
    assert.equal(s.analysis.complete, false); assert.equal(s.summary.completeHistory, true);
});
test("maximum retained history keeps candidate work and row count bounded", () => {
    const store = createObservationStore({ maxRecords: 2048, maxBytes: 1048576 });
    for (let i = 0; i < 1024; i++) store.record("attack-plan", { ...identity, eventKey: "hit/" + i });
    for (let i = 0; i < 1024; i++) store.record("native-frame", { ...identity, handle: i });
    const s = store.snapshot();
    assert.equal(s.events.length, 2048); assert(s.analysis.comparisons <= 4096);
    assert.equal(s.analysis.unanalysedPlanUnits, 1024); assert.equal(s.analysis.unanalysedNativeFrameUnits, 1024);
    assert.equal(s.analysis.unanalysedObservationRecords, 2048); assert.equal(s.correlations.length, 128);
    assert.equal(s.analysis.omittedRows, 1920); assert.equal(s.analysis.truncated, true);
    assert.equal(s.summary.planCorrelations["attack-plan"].count, 1024);
    assert.equal(s.summary.suggestedUniqueSources, 0);
});
test("analysis limits cannot exceed their hard caps", () => {
    const s = createObservationStore({ maxCorrelationComparisons: 999999, maxCorrelationRows: 9999 }).snapshot();
    assert.equal(s.analysis.maxComparisons, 8192); assert.equal(s.analysis.maxRows, 256);
});
console.log("RESULT " + passed + " observation store scenarios passed.");
