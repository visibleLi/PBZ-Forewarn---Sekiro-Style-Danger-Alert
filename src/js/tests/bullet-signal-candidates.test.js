"use strict";
const assert = require("assert");
const { createBulletSignalProbe } = require("../PBZForewarn/bullet-signal-candidates");
let count = 0;
function test(name, run) { run(); count++; console.log("PASS " + name); }
const EFFECT = "/SGameCombatSystem/Bullet/Event/BP_BulletEvent_Effect.BP_BulletEvent_Effect_C";
const EXECUTION = "/SGameExecution/Bullet/Events/BP_BulletEvent_PlayExecution.BP_BulletEvent_PlayExecution_C";
const GRAB = "/SGameExecution/GA/GA_ExecutedAbilityBase_Grab.GA_ExecutedAbilityBase_Grab_C";
const FILTER = "/Script/SGameCombatSystem.BulletEvent_FilterEventActor";
const INTERVAL = "/Script/SGameCombatSystem.BulletEvent_Interval";
const RED = "/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Red_001.NS_AttackAlert_Red_001";
const BLUE = "/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Blue_001.NS_AttackAlert_Blue_001";
function native(name, props = {}) { return { _valid: true, _path: name, ...props }; }
function array(values) { return { Num: () => values.length, Get: index => values[index] }; }
function event(klass, props = {}, name = "/Renamed/Bullet.Event") {
    return native(name, { GetClass: () => native(klass), ...props });
}
function effect(name = RED, props = {}) { return event(EFFECT, { Niagara: native(name), ...props }); }
function execution(ability = native("/Renamed/Reaction.Reaction_C", { GetSuperClass: () => native(GRAB) })) {
    return event(EXECUTION, { "Executed Ability": ability });
}
function action(events, lifecycle = "StartEvents") {
    return { BulletData: native("/Renamed/Bullet", { [lifecycle]: { Events: array(events) } }) };
}
function factory(overrides = {}) {
    return createBulletSignalProbe({
        valid: value => !!value && value._valid === true,
        path: value => value._path || "",
        list: (value, cap) => {
            const items = [];
            for (let i = 0; i < Math.min(value.Num(), cap); i++) items.push(value.Get(i));
            return items;
        },
        effectPath: value => ({ path: value.NiagaraEffect._path || "" }), ...overrides
    });
}
const probe = (input, times) => factory().probe(input, times);
function readonly(value) { return new Proxy(value, {
    set() { throw Error("write"); }, deleteProperty() { throw Error("delete"); }, defineProperty() { throw Error("define"); }
}); }
function unresolved(input, reason) {
    const result = probe(input);
    assert.equal(result.status, "unresolved"); assert.equal(result.unresolved, true);
    if (reason) assert(result.issues.includes(reason), JSON.stringify(result.issues));
    return result;
}

test("real lifecycle wrapper reads generic effect Niagara through synthetic adapter input", () => {
    let synthetic;
    const result = factory({ effectPath: value => { synthetic = value; return { path: value.NiagaraEffect._path }; } })
        .probe(action([effect()]), { start: 0.8, end: 1.3, duration: 0.5 });
    assert.equal(result.status, "read"); assert.equal(result.unresolved, false);
    assert.deepEqual(Object.keys(synthetic), ["NiagaraEffect"]);
    assert.equal(result.candidates.length, 1);
    const item = result.candidates[0];
    assert.equal(item.kind, "standard-warning-resource"); assert.equal(item.color, "red");
    assert.equal(item.lifecycle, "StartEvents"); assert.equal(item.route[0].classPath, EFFECT);
    assert.equal(item.timing.status, "unverified"); assert.equal(item.timing.coordinateConfirmed, false);
    assert.equal(item.timing.actionTimes.duration, 0.5);
});
test("all three roots read their own Events without unioning unrelated properties", () => {
    const input = action([effect()]);
    input.BulletData.InitializeEvents = { Events: array([effect(BLUE)]) };
    input.BulletData.PreAttackEvents = { Events: array([execution()]) };
    input.BulletData.HitTargetEvents = { Events: array([effect()]) };
    input.BulletData.Unrelated = effect();
    const result = probe(input);
    assert.deepEqual(result.candidates.map(item => item.lifecycle), ["InitializeEvents", "StartEvents", "PreAttackEvents"]);
    assert.deepEqual(result.candidates.map(item => item.color), ["blue", "red", null]);
});
test("space alias is accepted and identical aliases do not duplicate candidates", () => {
    const bullet = action([effect()]).BulletData;
    assert.equal(probe({ "Bullet Data": bullet }).candidates.length, 1);
    assert.equal(probe({ BulletData: bullet, "Bullet Data": bullet }).candidates.length, 1);
});
test("conflicting bullet aliases never promote either graph even with equal paths", () => {
    const result = unresolved({ BulletData: action([effect()]).BulletData, "Bullet Data": action([effect()]).BulletData }, "bullet-data-alias-conflict");
    assert.equal(result.candidates.length, 0);
});
test("ordinary actions without bullet data are complete empty observations", () => {
    for (const input of [null, undefined, {}, { NiagaraEffect: native(RED), DeflectType: 3 }]) {
        const result = probe(input);
        assert.equal(result.status, "no-bullet-data"); assert.equal(result.unresolved, false);
        assert.deepEqual(result.candidates, []);
    }
});
test("soft bullet references are unresolved without calling Get or load methods", () => {
    const result = unresolved({ BulletData: { Get() { throw Error("must not call Get"); }, LoadSynchronous() { throw Error("load"); } } },
        "bullet-data-invalid-or-unresolved");
    assert.deepEqual(result.candidates, []);
});
test("throwing alias and lifecycle getters remain explicit unresolved", () => {
    const input = action([effect()]);
    Object.defineProperty(input, "Bullet Data", { get() { throw Error("alias"); } });
    unresolved(input, "field-unreadable:Bullet Data");
    const bullet = native("/Renamed/Bullet");
    Object.defineProperty(bullet, "StartEvents", { get() { throw Error("root"); } });
    unresolved({ BulletData: bullet }, "field-unreadable:StartEvents");
});
test("export tables and ordinary arrays are not live native event graphs", () => {
    assert.equal(unresolved({ BulletData: [{ Type: "BP_BulletEvent_Effect_C", Properties: { Niagara: RED } }] }).candidates.length, 0);
    assert.equal(unresolved({ BulletData: native("/Bullet", { StartEvents: { Events: [effect()] } }) }).candidates.length, 0);
});
test("exact implementation identity is required even for a standard effect", () => {
    const input = action([event("/Other/BP_BulletEvent_Effect.BP_BulletEvent_Effect_C", { Niagara: native(RED) }),
        event("/Other/Warning_C", { NiagaraEffect: native(RED) })]);
    assert.equal(unresolved(input, "unsupported-event-class").candidates.length, 0);
});
test("standard classifier is reused without boss VFX or player resource guesses", () => {
    for (const name of ["/PBZVFXPack/VFX/BattleFX/Renamed/NS_Renamed_Warning_AOE_101",
        "/PBZVFXPack/VFX/BattleFX/Hun/NS_AttackAlert_Red_001",
        "/Other/NS_AttackAlert_Red_001", "/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Black_001"]) {
        assert.deepEqual(probe(action([effect(name)])).candidates, []);
    }
});
test("enum and duration never create warning candidates or single frame assumptions", () => {
    const input = action([]); input.DeflectType = 3; input.duration = 0;
    const result = probe(input, { duration: 0 });
    assert.equal(result.candidates.length, 0); assert.equal(JSON.stringify(result).includes("singleFrame"), false);
});
test("grab payload requires valid class ancestry and has no inferred color", () => {
    const item = probe(action([execution()], "PreAttackEvents")).candidates[0];
    assert.equal(item.kind, "execution-capability"); assert.equal(item.color, null);
    assert.deepEqual(item.ancestry, ["/Renamed/Reaction.Reaction_C", GRAB]);
    assert.equal(item.conditional, true); assert.equal(item.executionStatus, "target-state-and-native-trigger-not-evaluated");
});
test("GetSuperStruct and reflected SuperStruct are bounded ancestry fallbacks", () => {
    for (const ability of [native("/Other/A", { GetSuperStruct: () => native(GRAB) }),
        native("/Other/A", { SuperStruct: native(GRAB) }), native(GRAB)]) {
        assert.equal(probe(action([execution(ability)])).candidates.length, 1);
    }
});
test("known ancestry false never becomes a grab candidate", () => {
    const result = probe(action([execution(native("/Other/NotGrab", { GetSuperClass: () => null }))]));
    assert.equal(result.candidates.length, 0); assert.equal(result.unresolved, false);
});
test("missing invalid and unavailable executed class references are unresolved", () => {
    for (const ability of [null, {}, { ObjectPath: GRAB }, native("/Unknown/Ability")]) {
        assert.equal(unresolved(action([execution(ability)])).candidates.length, 0);
    }
});
test("conflicting executed ability aliases do not promote a valid grab payload", () => {
    const item = execution(); item.ExecutedAbility = native(GRAB);
    assert.equal(unresolved(action([item]), "executed-ability-alias-conflict").candidates.length, 0);
});
test("throwing class and ancestry access never invoke gameplay callbacks", () => {
    const badClass = event(EFFECT); badClass.GetClass = () => { throw Error("class"); };
    assert.equal(unresolved(action([badClass]), "event-class-unreadable").candidates.length, 0);
    const badParent = native("/Other/A", { GetSuperClass() { throw Error("parent"); } });
    assert.equal(unresolved(action([execution(badParent)]), "ancestry-unreadable").candidates.length, 0);
});
test("real filter SubEvents preserves tag predicate without evaluating it", () => {
    const filter = event(FILTER, { TagRequirement: { RequireTags: array([{ TagName: "State.Custom.Condition" }]) },
        SubEvents: array([execution()]) });
    const result = probe(action([filter], "PreAttackEvents"));
    assert.equal(result.unresolved, false); assert.equal(result.candidates.length, 1);
    const item = result.candidates[0];
    assert.equal(item.route.length, 2); assert.equal(item.conditional, true);
    assert(JSON.stringify(item.route[0].conditions).includes("State.Custom.Condition"));
    assert.equal(item.route[1].field, "SubEvents");
});
test("interval wrapper retains delay loop and primitive condition snapshots", () => {
    const interval = event(INTERVAL, { Interval: 0.5, LoopCount: 1, Chance: 0.2,
        IntervalEvents: { Events: array([effect()]) } });
    const item = probe(action([interval])).candidates[0];
    assert.deepEqual(item.route[0].conditions, { Interval: 0.5, LoopCount: 1, Chance: 0.2 });
    assert.equal(item.conditional, true); assert.equal(item.timing.coordinateConfirmed, false);
    assert.equal(Object.hasOwn(item, "at"), false);
});
test("generic Events containers are walked but unknown event semantics remain unresolved", () => {
    const result = unresolved(action([event("/Unknown/Container", { Events: { Events: array([effect()]) } })]), "unsupported-event-class");
    assert.equal(result.candidates.length, 1);
});
test("dynamic subbullet and random dependencies are not recursively guessed", () => {
    const result = unresolved(action([event("/Script/SGameCombatSystem.BulletEvent_SubBullet", {
        BulletData: action([effect()]).BulletData, "Random Bullet Data": [action([effect()]).BulletData] })]));
    assert.equal(result.candidates.length, 0);
    assert(result.issues.includes("unresolved-dependency:BulletData"));
    assert(result.issues.includes("unresolved-dependency:Random Bullet Data"));
});
test("event identity cycles stop before repeated native visits", () => {
    const item = event(FILTER); item.SubEvents = array([item]);
    const result = unresolved(action([item]), "identity-cycle");
    assert(result.visited.events <= 2); assert.equal(result.candidates.length, 0);
});
test("container identity and ancestry cycles are bounded", () => {
    const container = {}; container.Events = container;
    unresolved({ BulletData: native("/Bullet", { StartEvents: { Events: container } }) }, "identity-cycle");
    const klass = native("/Other/Cycle"); klass.GetSuperClass = () => klass;
    unresolved(action([execution(klass)]), "ancestry-cycle");
});
test("depth and class ancestry caps remain visibly incomplete", () => {
    let item = effect();
    for (let i = 0; i < 15; i++) item = event(FILTER, { SubEvents: array([item]) });
    assert.equal(unresolved(action([item]), "depth-cap").candidates.length, 0);
    let klass = native(GRAB);
    for (let i = 0; i < 20; i++) { const parent = klass; klass = native("/Other/Class" + i, { GetSuperClass: () => parent }); }
    assert.equal(unresolved(action([execution(klass)]), "ancestry-cap").candidates.length, 0);
});
test("container event and candidate caps bound reads and output", () => {
    let reads = 0;
    const input = { BulletData: native("/Bullet", { StartEvents: { Events: { Num: () => 100000,
        Get(index) { reads++; assert(index < 32); return effect(); } } } }) };
    const result = unresolved(input, "array-cap");
    assert.equal(reads, result.limits.maxEventsPerContainer);
    assert.equal(result.candidates.length, result.limits.maxCandidates);
    assert(result.issues.includes("candidate-cap"));
});
test("global node and event counts bound wide nested graphs", () => {
    const children = Array.from({ length: 32 }, () => event(FILTER, { SubEvents: array(Array.from({ length: 32 }, () => effect())) }));
    const result = unresolved(action(children));
    assert(result.visited.nodes <= result.limits.maxNodes); assert(result.visited.events <= result.limits.maxEvents);
    assert(result.issues.includes("node-cap") || result.issues.includes("event-cap"));
});
test("throwing invalid and changing TArray APIs remain unresolved", () => {
    for (const values of [{ Num() { throw Error("count"); }, Get() {} },
        { Num: () => -1, Get() {} }, { Num: () => 1, Get() { throw Error("item"); } }]) {
        assert.equal(unresolved({ BulletData: native("/Bullet", { StartEvents: { Events: values } }) }).candidates.length, 0);
    }
    const result = factory({ list: () => [] }).probe(action([effect()]));
    assert.equal(result.unresolved, true); assert(result.issues.includes("array-changed-or-unsupported"));
});
test("throwing effect and condition getters are contained and disclosed", () => {
    const item = effect(); Object.defineProperty(item, "Niagara", { get() { throw Error("effect"); } });
    assert.equal(unresolved(action([item]), "field-unreadable:Niagara").candidates.length, 0);
    const filter = event(FILTER, { SubEvents: array([effect()]) });
    Object.defineProperty(filter, "TagRequirement", { get() { throw Error("condition"); } });
    const result = unresolved(action([filter]), "field-unreadable:TagRequirement");
    assert.equal(result.candidates[0].route[0].conditions.TagRequirement.status, "unreadable");
});
test("snapshot cycles and large values remain bounded plain JSON", () => {
    const condition = { note: "x".repeat(10000), number: Infinity }; condition.self = condition;
    const result = unresolved(action([event(FILTER, { TagRequirement: condition, SubEvents: array([effect()]) })]));
    const json = JSON.stringify(result); assert(json.length < 20000);
    assert(json.includes("snapshot-cycle")); assert(json.includes("snapshot-string-cap"));
    assert.deepEqual(JSON.parse(json), result);
});
test("boss skill and nonstandard resource renaming cannot change recognition", () => {
    function fixture(prefix) {
        const item = effect(); item._path = prefix + "/AnyEvent";
        const input = action([item]); input.BulletData._path = prefix + "/AnyBullet";
        input.GetClass = () => native(prefix + "/AnyAction"); input.Boss = prefix; input.Skill = prefix;
        return probe(input);
    }
    assert.deepEqual(fixture("/First").candidates.map(x => [x.kind, x.color, x.lifecycle]),
        fixture("/Second").candidates.map(x => [x.kind, x.color, x.lifecycle]));
});
test("read only probe never reads gameplay callbacks or loading capabilities", () => {
    let forbiddenReads = 0, writes = 0;
    const wrap = value => new Proxy(value, { get(target, key) {
        if (/Trigger$|Load|Received_|Dispatch|IsSingleFrame|GetEffective|CreateBullet|LaunchBullet/.test(String(key))) {
            forbiddenReads++; throw Error("forbidden");
        }
        return target[key];
    }, set() { writes++; throw Error("write"); }, deleteProperty() { writes++; throw Error("delete"); } });
    const item = wrap(effect());
    const bullet = wrap(native("/Bullet", { StartEvents: readonly({ Events: readonly(array([item])) }) }));
    const result = probe(wrap({ BulletData: bullet }));
    assert.equal(result.candidates.length, 1); assert.equal(forbiddenReads, 0); assert.equal(writes, 0);
});
test("every probe rereads mutable native data and returns detached snapshots", () => {
    const item = effect(), input = action([item]), inspector = factory();
    const first = inspector.probe(input, { start: 1 });
    item.Niagara = native(BLUE);
    const second = inspector.probe(input, { start: 2 });
    assert.equal(first.candidates[0].color, "red"); assert.equal(second.candidates[0].color, "blue");
    assert.equal(first.candidates[0].timing.actionTimes.start, 1);
    assert.equal(second.candidates[0].timing.actionTimes.start, 2);
});
test("dynamic only actions remain unresolved without a fixed BulletData alias", () => {
    for (const input of [{ "Random Bullet Data": array([]) }, { RandomBulletData: {} }, { Branch: {} }]) {
        const result = unresolved(input); assert.deepEqual(result.candidates, []);
        assert(result.issues.some(reason => reason.startsWith("unresolved-dependency:")));
    }
});
test("valid bullet with unavailable lifecycle roots remains unresolved", () => {
    assert.equal(unresolved({ BulletData: native("/Bullet") }, "lifecycle-roots-unavailable").candidates.length, 0);
    assert.equal(probe(action([])).unresolved, false);
});
test("unreadable payload alias or ancestry getter cannot fall through to capture", () => {
    const item = execution();
    Object.defineProperty(item, "ExecutedAbility", { get() { throw Error("alias"); } });
    assert.equal(unresolved(action([item]), "executed-ability-unreadable").candidates.length, 0);
    const klass = native("/Other/Reaction", { GetSuperStruct: () => native(GRAB) });
    Object.defineProperty(klass, "GetSuperClass", { get() { throw Error("getter"); } });
    assert.equal(unresolved(action([execution(klass)])).candidates.length, 0);
});
test("missing Niagara is ordinary nonvisual event but unreadable effect paths remain unresolved", () => {
    assert.equal(probe(action([event(EFFECT)])).unresolved, false);
    const unresolvedPath = factory({ effectPath: () => ({ path: "", source: "soft-unresolved" }) }).probe(action([effect()]));
    assert.equal(unresolvedPath.unresolved, true); assert.equal(unresolvedPath.candidates.length, 0);
    const throwingPath = factory({ effectPath() { throw Error("path"); } }).probe(action([effect()]));
    assert.equal(throwingPath.unresolved, true); assert.equal(throwingPath.candidates.length, 0);
});
test("diagnostic candidates never leak cue or scheduler event shape", () => {
    const result = probe(action([effect(), execution()]));
    assert.equal(result.usedForScheduling, false);
    for (const item of result.candidates) {
        assert.equal(item.usedForScheduling, false);
        for (const key of ["cue", "at", "start", "end", "action", "event", "source"]) assert.equal(Object.hasOwn(item, key), false);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
test("flattened predicate keys never exceed the resource catalog key limit", () => {
    const condition = {}; condition['x'.repeat(129)] = 'must-not-silently-truncate';
    const result = unresolved(action([event(FILTER, { TagRequirement: condition, SubEvents: array([effect()]) })]), "condition-path-cap");
    const saved = result.candidates[0].route[0].conditions.TagRequirement;
    assert(Object.keys(saved).every(key => key.length <= 128));
    assert.equal(result.limits.maxConditionPath, 128);
});
test("flattened predicate leaf limit marks incomplete evidence instead of claiming complete", () => {
    const condition = {};
    for (let i=0;i<16;i++) condition['group'+i] = { first:i, second:i+1, third:i+2 };
    const result = unresolved(action([event(FILTER, { TagRequirement: condition, SubEvents: array([effect()]) })]), "condition-entry-cap");
    assert(Object.keys(result.candidates[0].route[0].conditions.TagRequirement).length <= 32);
    assert.equal(result.candidates[0].usedForScheduling, false);
});
console.log("RESULT " + count + " bullet signal candidate scenarios passed; native objects mocked, no game access.");
