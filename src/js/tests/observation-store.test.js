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
function checkEvidence(snapshot) {
    const e = snapshot.evidence;
    assert(e.retention.bytes <= e.retention.maxBytes);
    assert(e.retention.dictionaryBytes <= e.retention.maxDictionaryBytes);
    assert(e.records.length <= e.retention.maxRecords);
    assert.equal(e.retention.recordBytes, Buffer.byteLength(JSON.stringify(e.records)));
    assert.equal(e.retention.dictionaryBytes, Buffer.byteLength(JSON.stringify(e.dictionary)));
    for (const record of e.records) for (const id of Object.values(record.refs || {}))
        assert.equal(typeof e.dictionary[id], "string", "every retained dictionary reference must resolve");
    return e;
}
test("compact priority evidence survives a long stream of low priority plans", () => {
    const s = createObservationStore({ maxBytes: 2048 });
    s.record("warning-cue", { ...identity, id: "important", color: "black", gameTime: 4 });
    for (let i = 0; i < 9000; i++) s.record("attack-plan", { ...identity, task: "/Task/" + i, eventKey: "hit/" + i,
        attackSemantics: { timing: { PreHitPointDuration: { value: 0.35, status: "read" } } } });
    const snapshot = s.snapshot(), e = checkEvidence(snapshot);
    assert.equal(snapshot.events.some(x => x.id === "important"), false);
    assert.equal(e.records.some(x => x.id === "important"), true);
    assert.equal(e.counters.kindCounts["attack-plan"], 9000);
    assert(e.counters.evicted > 0);
});
test("stable plan duplicates do not displace distinct attacks or lifecycle events", () => {
    const s = createObservationStore();
    for (let i = 0; i < 1000; i++) s.record("warning-plan", { ...identity, eventKey: "one", start: 0.5, end: 1 });
    s.record("warning-plan", { ...identity, eventKey: "two", start: 0.6, end: 1.1 });
    s.record("warning-plan", { ...identity, activation: 2, eventKey: "one", start: 0.5, end: 1 });
    for (const phase of ["first-observed", "timeline-rewind-observed", "record-retired"])
        s.record("task-lifecycle", { ...identity, phase, recordSerial: 4 });
    const e = checkEvidence(s.snapshot());
    assert.equal(e.counters.deduplicated, 999); assert.equal(e.records.length, 6);
    assert.equal(e.records.filter(x => x.kind === "task-lifecycle").length, 3);
});
test("incomplete identity and repeated cues never silently deduplicate", () => {
    const s = createObservationStore();
    for (let i = 0; i < 2; i++) {
        s.record("warning-plan", { ...identity, clockEpoch: null, eventKey: "same" });
        s.record("warning-cue", { ...identity, id: "same", color: "red" });
    }
    const e = checkEvidence(s.snapshot()); assert.equal(e.records.length, 4); assert.equal(e.counters.deduplicated, 0);
});
test("changed timing semantics or unreadable sampling states remain distinct evidence", () => {
    const s = createObservationStore();
    for (const value of [0.1, 0.2]) s.record("attack-plan", { ...identity, eventKey: "same",
        attackSemantics: { timing: { RuntimePreHitPointDuration: { status: "read", value } } } });
    for (const unreadable of [0, 1]) s.record("timeline-observer-status", { ...identity, scanned: 3, unreadable });
    const e = checkEvidence(s.snapshot()); assert.equal(e.records.length, 4);
});
test("scan counters survive compact retention with their explanatory fields",()=>{
    const s=createObservationStore();
    s.record("timeline-observer-status",{...identity,scanned:35,typed:0,timed:0,
        standard:1,generic:0,ignored:34,truncated:false,unreadable:0,layers:1});
    const row=checkEvidence(s.snapshot()).records[0];
    assert.equal(row.kind,"timeline-observer-status");assert.equal(row.scanned,35);
    assert.equal(row.typed,0);assert.equal(row.timed,0);assert.equal(row.standard,1);
    assert.equal(row.generic,0);assert.equal(row.ignored,34);
    assert.equal(row.priority,2);
});
test("main-to-success transition keeps both timeline identities without claiming a hit",()=>{
    const s=createObservationStore();
    s.record("timeline-branch-transition",{...identity,phase:"main-to-success",
        previousTimeline:"/Ability.Main",nextTimeline:"/Ability.Success",
        previousAbility:"/Enemy/GA_YuZan_Skill_03_A_R_Start_C_1",nextAbility:"/Enemy/GA_YuZan_Skill_03_A_R_Start_C_1",
        transitionObservedWallTime:1000,branchConfirmed:false,
        interpretation:"observed-timeline-switch-not-proof-of-successful-hit"});
    const evidence=checkEvidence(s.snapshot()),row=evidence.records[0];
    assert.equal(row.kind,"timeline-branch-transition");
    assert.equal(evidence.dictionary[row.refs.previousTimeline],"/Ability.Main");
    assert.equal(evidence.dictionary[row.refs.nextTimeline],"/Ability.Success");
    assert.equal(evidence.dictionary[row.refs.previousAbility],"/Enemy/GA_YuZan_Skill_03_A_R_Start_C_1");
    assert.equal(evidence.dictionary[row.refs.nextAbility],"/Enemy/GA_YuZan_Skill_03_A_R_Start_C_1");
    assert.equal(row.branchConfirmed,false);assert.equal(row.priority,2);
});
test("spell-warning candidates survive as high-priority evidence with cue disabled",()=>{
    const s=createObservationStore();
    s.record("attack-plan",{...identity,eventKey:"main/179",
        spellWarningCandidate:"yuzan-warning-aoe-observe",cueEnabled:false,
        effect:"/PBZVFXPack/VFX/BattleFX/YuZan/NS_YuZan_Warning_AOE_101.NS_YuZan_Warning_AOE_101"});
    const row=checkEvidence(s.snapshot()).records[0];
    assert.equal(row.spellWarningCandidate,"yuzan-warning-aoe-observe");
    assert.equal(row.cueEnabled,false);assert.equal(row.priority,3);
});
test("different spell candidates on one execution are not collapsed",()=>{
    const s=createObservationStore();
    for(const candidate of ["yuzan-warning-aoe-observe","yuzan-warning-big-observe"])
        s.record("attack-plan",{...identity,eventKey:"main/1",spellWarningCandidate:candidate,cueEnabled:false});
    const e=checkEvidence(s.snapshot());
    assert.equal(e.records.length,2);assert.equal(e.counters.deduplicated,0);
});
test("spell warning observations retain cast phase without enabling a cue",()=>{
    const s=createObservationStore();
    s.record("spell-warning-observation",{...identity,eventKey:"main/7",
        spellWarningCandidate:"yuzan-warning-aoe-observe",spellPhase:"cast",cueEnabled:false});
    const row=checkEvidence(s.snapshot()).records[0];
    assert.equal(row.kind,"spell-warning-observation");
    assert.equal(row.spellPhase,"cast");assert.equal(row.cueEnabled,false);
    assert.equal(row.priority,3);
});
test("dictionary storage and UTF8 budgets remain exact through repeated eviction", () => {
    const s = createObservationStore({ maxEvidenceBytes: 4096, maxEvidenceDictionaryBytes: 2000, maxEvidenceRecords: 5 });
    for (let i = 0; i < 100; i++) {
        s.record("warning-cue", { ...identity, actor: "/敌人/" + i, ability: "/技能/" + i, id: "danger/" + i, color: "black" });
        if (i % 7 === 0) checkEvidence(s.snapshot());
    }
    const e = checkEvidence(s.snapshot()); assert(e.counters.evicted > 0);
    const used = new Set(e.records.flatMap(x => Object.values(x.refs || {})).map(String));
    assert.equal(Object.keys(e.dictionary).length, used.size);
});
test("past snapshots remain readable and detached after dictionary IDs expire", () => {
    const s = createObservationStore({ maxEvidenceRecords: 1 });
    s.record("warning-cue", { actor: "/old", id: "old" });
    const before = s.snapshot().evidence, ref = before.records[0].refs.actor;
    s.record("warning-cue", { actor: "/new", id: "new" });
    const after = checkEvidence(s.snapshot());
    assert.equal(before.dictionary[ref], "/old"); assert.equal(after.dictionary[ref], undefined);
    assert.throws(() => { before.dictionary[ref] = "/modified"; }, TypeError);
});
test("dictionary exhaustion cannot evict protected danger records for sampling noise", () => {
    const s = createObservationStore({ maxEvidenceDictionaryEntries: 1 });
    s.record("warning-cue", { actor: "/protected", id: "p" });
    s.record("attack-plan", { actor: "/other", action: "/another" });
    const e = checkEvidence(s.snapshot());
    assert.equal(e.records.length, 1); assert.equal(e.records[0].id, "p"); assert(e.counters.dictionaryDrops > 0);
});
test("impossible large evidence does not erase useful retained evidence", () => {
    const s = createObservationStore({ maxEvidenceBytes: 2500, maxEvidenceDictionaryBytes: 800 });
    s.record("warning-cue", { actor: "/protected", id: "p" });
    s.record("task-lifecycle", { actor: "/" + "x".repeat(3000), phase: "first-observed" });
    const e = checkEvidence(s.snapshot());
    assert.equal(e.records.length, 1); assert.equal(e.records[0].id, "p"); assert.equal(e.counters.oversized, 1);
});
test("important compact evidence can survive rejection by the raw history byte limit", () => {
    const s = createObservationStore({ maxBytes: 500 });
    assert.equal(s.record("warning-missed", { ...identity, time: 4, start: 2, end: 3, unrelated: "x".repeat(2000) }), false);
    const e = checkEvidence(s.snapshot());
    assert.equal(e.records[0].kind, "warning-missed"); assert.equal(e.records[0].time, 4);
    assert.equal(e.counters.kindCounts["warning-missed"], 1);
});
test("focused Lua summaries retain scoped call IDs, first and last start offsets and unknown clocks", () => {
    const s = createObservationStore();
    s.record("focused-call-summary", { actor: "/enemy", ability: "/skill", hookSession: "lua-session-A", hookSeq: 9,
        clockEpoch: null, capture: { callId: "call-4", firstSeq: 8, lastSeq: 9, hookPath: "/Function/PlayTimeline", abiVerified: false,
            activation: { status: "read", value: 2 },
            first: { phase: "pre", task: "/old/task", taskTime: { status: "read", value: 2 },
                params: { StartTimeSeconds: { status: "read", value: 2.8 } } },
            last: { phase: "post", task: "/new/task", taskTime: { status: "read", value: 2.8 } } } });
    const e = checkEvidence(s.snapshot()), r = e.records[0];
    assert.equal(r.hookSession, "lua-session-A"); assert.equal(r.capture.callId, "call-4");
    assert.equal(r.capture.first.params.StartTimeSeconds.value, 2.8);
    assert.equal(e.dictionary[r.refs["capture.last.task"]], "/new/task");
    assert.equal(r.clockEpoch, null); assert.equal(r.capture.abiVerified, false);
});
test("lifecycle summaries preserve local identity and timestamps without synthesizing hit evidence", () => {
    const s = createObservationStore();
    s.record("task-lifecycle", { ...identity, phase: "first-observed", observationRun: 3, recordSerial: 7,
        firstObservedTimelineTime: 3.7, firstObservedGameTime: 20, firstObservedWallTime: 1234,
        discoverySource: "ticking-tasks", identityBasis: "local-task-only" });
    const r = checkEvidence(s.snapshot()).records[0];
    assert.equal(r.firstObservedTimelineTime, 3.7); assert.equal(r.observationRun, 3);
    assert.equal(r.identityBasis, "local-task-only"); assert.equal(r.confirmedHit, undefined);
});
test("cumulative kind statistics cannot grow without bound through arbitrary kind names", () => {
    const s = createObservationStore({ maxEvidenceRecords: 4 });
    for (let i = 0; i < 1000; i++) s.record("kind" + i, { value: i });
    const e = checkEvidence(s.snapshot());
    assert.equal(Object.keys(e.counters.kindCounts).length, 64); assert.equal(e.counters.kindOverflow, 936);
});
test("disabled observation keeps both histories empty without reading caller values", () => {
    const s = createObservationStore({ enabled: false });
    s.record("warning-cue", new Proxy({}, { ownKeys() { throw new Error("must not read"); } }));
    const e = checkEvidence(s.snapshot()); assert.equal(e.records.length, 0); assert.equal(e.counters.observed, 0);
});
test("ordinary task churn cannot evict earlier danger cues or the focused starting evidence", () => {
    const s = createObservationStore({ maxEvidenceBytes: 8192 });
    s.record("warning-cue", { ...identity, id: "important", color: "black" });
    s.record("task-lifecycle", { ...identity, ability: "/Enemy/GA_FeiZei_SpecialAttack_07", phase: "first-observed", taskTimelineTime: 3.7 });
    for (let i = 0; i < 2000; i++) s.record("task-lifecycle", { ...identity, task: "/Task/" + i, phase: "first-observed" });
    const e = checkEvidence(s.snapshot());
    assert(e.records.some(x => x.id === "important"));
    assert(e.records.some(x => x.taskTimelineTime === 3.7)); assert(e.counters.evicted > 0);
});
test("a rewind observation run does not deduplicate the replayed plan", () => {
    const s = createObservationStore();
    for (const observationRun of [0, 1]) s.record("warning-plan", { ...identity, observationRun, eventKey: "same", start: 1, end: 2 });
    const e = checkEvidence(s.snapshot()); assert.equal(e.records.length, 2); assert.equal(e.counters.deduplicated, 0);
});
test("native placeholder timing and unverified bullet lifecycle survive compact projection", () => {
    const s = createObservationStore();
    s.record("native-frame", { ...identity, hitGameTime: null, reportedHitGameTime: -3.4e38,
        hitTimeUsableForFutureComparison: false, bullet: "/Bullet/asset-or-instance", bulletReferenceStatus: "asset-reference",
        bulletInstancePresent: false, bulletLifecycleVerified: false, bulletDangerEndedVerified: false });
    const r = checkEvidence(s.snapshot()).records[0];
    assert.equal(r.reportedHitGameTime, -3.4e38); assert.equal(r.hitGameTime, null);
    assert.equal(r.hitTimeUsableForFutureComparison, false); assert.equal(r.bulletDangerEndedVerified, false);
});
test("truncated paths are omitted rather than presented as complete dictionary identities", () => {
    const s = createObservationStore();
    s.record("timeline-call", { actor: "/" + "x".repeat(5000), capture: { hookPath: "/" + "y".repeat(5000),
        context: { ability: "/" + "z".repeat(5000) } } });
    const e = checkEvidence(s.snapshot());
    assert.equal(e.records[0].refs, undefined); assert.equal(Object.keys(e.dictionary).length, 0);
    assert.equal(e.counters.omittedPaths, 3); assert.equal(e.records[0].sanitizedValues, 3);
});
test("compact fallback evidence preserves the rule and timing without claiming native execution",()=>{
    const s=createObservationStore();
    s.record('warning-cue',{...identity,id:'qishu-cue',source:'semantic-fallback',fallbackRule:'qishu-round-fire-ring',
        timingBasis:'timeline-action-start',usedForScheduling:true,executionVerified:false});
    const cue=checkEvidence(s.snapshot()).records[0];
    assert.equal(cue.source,'semantic-fallback');assert.equal(cue.fallbackRule,'qishu-round-fire-ring');
    assert.equal(cue.timingBasis,'timeline-action-start');assert.equal(cue.usedForScheduling,true);
    assert.equal(cue.executionVerified,false);
});
test("compact facts retain the fields needed to explain late discovery and a seek",()=>{
    const s=createObservationStore();
    s.record('warning-cue',{...identity,id:'cue',plannedStart:2.75,observedTimelineTime:2.42,
        estimatedLeadGameSeconds:0.33,soundSubmitted:false});
    s.record('task-lifecycle',{...identity,phase:'forward-discontinuity-candidate',deltaTimelineTime:2,
        deltaGameTime:0.016,cause:'unknown-seek-rate-or-sampling',replacesRecordSerial:7,startTimeVerified:false});
    s.record('warning-missed',{...identity,generation:645,executionVerified:false,interpretation:'not-confirmed-miss'});
    const records=checkEvidence(s.snapshot()).records;
    assert.equal(records[0].plannedStart,2.75);assert.equal(records[0].estimatedLeadGameSeconds,0.33);
    assert.equal(records[0].soundSubmitted,false);assert.equal(records[1].deltaGameTime,0.016);
    assert.equal(records[1].cause,'unknown-seek-rate-or-sampling');assert.equal(records[1].replacesRecordSerial,7);
    assert.equal(records[2].generation,645);assert.equal(records[2].executionVerified,false);
});
test("encounter totals survive raw and compact detail eviction",()=>{
    const s=createObservationStore({maxBytes:1200,maxEvidenceBytes:1800,maxEvidenceDictionaryBytes:900,maxEvidenceRecords:8});
    const onlyDodge="/Enemy/GA_Luanshi_SpecialAttack_08_OnlyDodge";
    for(let i=0;i<24;i++)s.record("warning-cue",{...identity,id:"cue-"+i,
        color:["red","blue","black"][i%3],gameTime:i});
    for(const generation of [19,39])s.record("warning-missed",{...identity,ability:onlyDodge,
        color:"black",generation,reason:"past-window",start:0.33798766136169434,end:0.9526950716972351,
        firstObservedTimelineTime:1.25,taskTimelineTime:1.25,recordSerial:generation+1,executionVerified:false});
    const result=s.snapshot(),actor=result.encounterSummary.actors[0];
    assert(result.counters.evicted>0);assert(result.evidence.counters.evicted>0);
    assert.equal(actor.counts.warningCue,24);assert.equal(actor.counts.warningMissed,2);
    assert.equal(actor.colors.red,8);assert.equal(actor.colors.blue,8);assert.equal(actor.colors.black,8);
    const ability=actor.abilities.find(x=>x.ability===onlyDodge);
    assert.equal(ability.counts.warningMissed,2);
    assert.equal(ability.colors.black,0);
    assert.equal(ability.missedReasons["past-window"],2);
    assert.equal(ability.lastFact.generation,39);
    assert.equal(ability.lastFact.firstObservedTimelineTime,1.25);
    assert.equal(ability.lastFact.taskTimelineTime,1.25);
    assert.equal(ability.lastFact.executionVerified,false);
    assert.equal(result.encounterSummary.retention.complete,true);
});
test("encounter summaries remain bounded and prefer warnings over unrelated churn",()=>{
    const s=createObservationStore({maxEncounterActors:2,maxEncounterAbilities:1});
    s.record("task-lifecycle",{...identity,actor:"/Enemy/Noise",ability:"/Ability/Noise",phase:"first-observed"});
    s.record("warning-cue",{...identity,actor:"/Enemy/Boss",ability:"/Ability/Red",id:"red",color:"red"});
    s.record("warning-missed",{...identity,actor:"/Enemy/Boss",ability:"/Ability/Black",id:"black",color:"black",reason:"past-window"});
    s.record("warning-cue",{...identity,actor:"/Enemy/Another",ability:"/Ability/Blue",id:"blue",color:"blue"});
    const summary=s.snapshot().encounterSummary;
    assert.equal(summary.actors.length,2);
    assert(summary.counters.actorsEvicted>0);assert(summary.counters.abilitiesEvicted>0);
    assert.equal(summary.retention.complete,false);
    assert(summary.actors.some(x=>x.actor==="/Enemy/Boss"));
});
test("disabled observation does not run encounter summaries",()=>{
    const s=createObservationStore({enabled:false});
    s.record("warning-cue",{...identity,id:"cue"});
    const summary=s.snapshot().encounterSummary;
    assert.equal(summary.counters.observed,0);assert.equal(summary.actors.length,0);
});
test("long path ability churn keeps both boss counts and bounds the retained summary at write time",()=>{
    const s=createObservationStore({maxEncounterBytes:16000,maxRecords:1});
    const prefix='/Game/Maps/'+('长名字😀'.repeat(40));
    for(let i=0;i<2;i++) {
        const actor=prefix+'.Boss_P'+i;
        s.record('warning-cue',{...identity,actor,ability:actor+'.Danger',id:'cue'+i,color:'red'});
        for(let n=0;n<100;n++)s.record('task-lifecycle',{...identity,actor,
            ability:actor+'.Passive'+n,timeline:actor+'.Passive'+n+'.Main',phase:'first-observed'});
    }
    const a=s.snapshot().encounterSummary,b=s.snapshot().encounterSummary;
    assert.equal(a.actors.length,2);assert.equal(a.actors.reduce((n,x)=>n+x.counts.warningCue,0),2);
    assert.equal(a.sessionCounts.warningCue,2);assert(a.counters.abilitiesEvicted>0);
    assert.equal(a.counters.actorsEvicted,0);assert.equal(a.counters.snapshotRowsOmitted,0);
    assert.equal(a.retention.bytes,Buffer.byteLength(JSON.stringify(a.actors)));
    assert(a.retention.bytes<=a.retention.maxBytes);assert.deepEqual(a,b);
});
test("summary snapshots neither reserialize accumulated actors nor change eviction counters",()=>{
    const source=require('fs').readFileSync(require.resolve('../PBZForewarn/observation-store'),'utf8');
    let serializations=0;
    const ctx=vm.createContext({module:{exports:{}},JSON:{stringify(...args){
        serializations++;return JSON.stringify(...args);
    }}});
    vm.runInContext(source+'\nmodule.exports.summary=createEncounterStore;',ctx);
    const s=ctx.module.exports.summary({maxEncounterBytes:16000});
    for(let i=0;i<12;i++)for(let j=0;j<24;j++)s.record({seq:i*24+j+1,kind:j?'task-lifecycle':'warning-cue',
        actor:'/Enemy/'+i,ability:'/Enemy/'+i+'/Ability/'+j,color:'blue'});
    serializations=0;const a=s.snapshot();for(let i=0;i<20;i++)s.snapshot();const b=s.snapshot();
    assert.equal(serializations,0);assert.deepEqual(a.counters,b.counters);
    assert(a.retention.bytes<=a.retention.maxBytes);
});
test("missing or sanitized execution actor cannot borrow an owner or role candidate",()=>{
    const s=createObservationStore();
    s.record('warning-cue',{...identity,actor:null,ownerActorCandidate:'/Enemy/A',roleActorCandidate:'/Enemy/B'});
    s.record('warning-cue',{...identity,actor:'/'+('x'.repeat(5000))});
    const x=s.snapshot().encounterSummary;
    assert.equal(x.actors.length,0);assert.equal(x.sessionCounts.warningCue,2);assert.equal(x.counters.unattributed,2);
});
test("last warning fact survives passive lifecycle noise and detached snapshots keep earlier facts",()=>{
    const s=createObservationStore();
    s.record('warning-missed',{...identity,color:'black',reason:'past-window',time:1.25,wallTime:100});
    const before=s.snapshot().encounterSummary;
    s.record('task-lifecycle',{...identity,phase:'record-retired',wallTime:200});
    const after=s.snapshot().encounterSummary;
    assert.equal(after.actors[0].abilities[0].lastFact.reason,'past-window');
    assert.equal(after.actors[0].abilities[0].lastWall,200);assert.equal(before.actors[0].abilities[0].lastWall,100);
    assert.throws(()=>{after.actors[0].counts.warningCue=999;},TypeError);
    assert.equal(s.snapshot().encounterSummary.sessionCounts.warningCue,0);
});
test("summary byte eviction preserves cumulative session counts and reports lost actors",()=>{
    const s=createObservationStore({maxEncounterBytes:100});
    s.record('warning-cue',{...identity,id:'cue',color:'red'});
    const x=s.snapshot().encounterSummary;
    assert.equal(x.actors.length,0);assert.equal(x.sessionCounts.warningCue,1);
    assert.equal(x.retention.bytes,2);assert(x.counters.actorsEvicted>0);assert.equal(x.retention.complete,false);
});
console.log("RESULT " + passed + " observation store scenarios passed.");
