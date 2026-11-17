"use strict";

const assert = require("node:assert/strict");
const { createAdapter } = require("../PBZForewarn/adapter");
const { classifyEffect } = require("../PBZForewarn/core");
const { matchSemanticFallback, RULES } = require("../PBZForewarn/semantic-fallback");
let passed = 0;
function test(name, run) {
    try { run(); passed++; console.log("PASS " + name); }
    catch (error) { console.error("FAIL " + name); throw error; }
}
function array(...items) { return { Num: () => items.length, Get: index => items[index] }; }
function object(path, props = {}) { return { ue: true, path, ...props }; }
const actor = "/Game/Test.PersistentLevel.BP_Monster_QiShu_Huo_C_1";
const ability = "/Game/Test.PersistentLevel.GA_Qishu_Huo_RoundSkill_FireRing_C_1";
const actionClass = "/PBZDeflectSystem/Actions/GAA_DelayDeflectProjectileBullet.GAA_DelayDeflectProjectileBullet_C";
const requirements = () => ({ RequireTags: [], IgnoreTags: [], TagQuery: {} });
const UE = {
    KismetSystemLibrary: {
        IsValid: value => !!(value && value.ue && !value.invalid),
        GetPathName: value => value.path,
        Conv_SoftObjectReferenceToString: () => ""
    },
    BlueprintGameplayTagLibrary: {
        Conv_ObjectToGameplayTagAssetInterface: asc => asc,
        HasAllMatchingGameplayTags: (target, required) => required.every(tag => target.tags.includes(tag)),
        HasAnyMatchingGameplayTags: (target, ignored) => ignored.some(tag => target.tags.includes(tag)),
        IsTagQueryEmpty: query => !query.required,
        GetOwnedGameplayTags: asc => asc.tags,
        DoesContainerMatchTagQuery: (tags, query) => tags.includes(query.required)
    }
};
const asc = object("/Game/Test.ASC", { tags: [] });
function action(options = {}) {
    const a = object("/Game/Test.Action", {
        NiagaraEffect: options.effect === undefined ? null : options.effect,
        ActivationRequirements: options.requirements || requirements(),
        GetClass: () => object(options.classPath || actionClass)
    });
    if (options.type !== null) a["Deflect Bullet Type"] = options.type === undefined ? 3 : options.type;
    if (options.conflict) a.DeflectType = 2;
    return a;
}
function event(overrides = {}) {
    return { Action: action(), StartTime: 0.8, duration: 0.5, TriggerTimeOffset: 0,
        EndTriggerTimeOffset: 0, Guid: { A: 1, B: 2, C: 3, D: 4 }, ...overrides };
}
function timeline(events) { return object("/Game/Test.Timeline", { Actions: array(...events), RoleLayers: array() }); }
function collect(events, options = {}) {
    const adapter = createAdapter(UE, {}, null, { semanticFallback: options.enabled !== false });
    const result = adapter.events(timeline(events), classifyEffect, asc,
        { actor, ability, task: "/Game/Test.Task", activation: "1" },
        { GetRoleActor: () => null }, { captureDiagnostics: options.diagnostics !== false });
    return { adapter, result };
}

test("two narrowly scoped QiShu RedEye rules are present", () => {
    assert.equal(RULES.length, 2);
    assert(RULES.every(rule => rule.testedBuild === "26367565" && rule.typeValue === 3 && rule.color === "red"));
});
test("matching QiShu fire-ring action becomes a red fallback event", () => {
    const { result } = collect([event()]);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].color, "red");
    assert.equal(result.events[0].eligible, true);
    assert.equal(result.events[0].meta.semanticFallback.ruleId, "qishu-round-fire-ring");
    assert.equal(result.events[0].meta.semanticFallback.status, "scheduled");
    assert.equal(result.events[0].meta.recognition.source, "semantic-fallback");
});
test("fallback still works when diagnostics sampling is disabled", () => {
    const { result } = collect([event()], { diagnostics: false });
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].color, "red");
    assert.deepEqual(result.inventory, []);
});
test("disabled fallback preserves the old no-warning behavior", () => {
    const { result } = collect([event()], { enabled: false });
    assert.equal(result.events.length, 0);
    assert.equal(result.inventory[0].reason, "attack-semantics-timing-unverified");
});
test("wrong type, conflicting type, actor, ability or action class never fall back", () => {
    const cases = [
        event({ Action: action({ type: 0 }) }),
        event({ Action: action({ conflict: true }) }),
        event({ Action: action({ type: null }) }),
        event({ Action: action({ classPath: "/Other/UnrelatedAction_C" }) })
    ];
    for (const input of cases) assert.equal(collect([input]).result.events.length, 0);
    const otherActor = createAdapter(UE, {}, null, { semanticFallback: true }).events(
        timeline([event()]), classifyEffect, asc,
        { actor: "/Game/OtherEnemy", ability, task: "/Task" }, { GetRoleActor: () => null });
    assert.equal(otherActor.events.length, 0);
    const otherAbility = createAdapter(UE, {}, null, { semanticFallback: true }).events(
        timeline([event()]), classifyEffect, asc,
        { actor, ability: "/Game/GA_Other_C", task: "/Task" }, { GetRoleActor: () => null });
    assert.equal(otherAbility.events.length, 0);
});
test("missing action requirements fail closed without dropping the fallback event", () => {
    const denied = action();
    denied.ActivationRequirements.RequireTags = ["Combat.Missing"];
    const { result } = collect([event({ Action: denied })]);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].color, "red");
    assert.equal(result.events[0].eligible, false);
    assert.equal(result.events[0].meta.reason, "require-tags");
});
test("same-task same-color nodes remain separate without verified same-strike evidence", () => {
    const redEffect = object("/PBZVFXPack/VFX/BattleFX/Test/NS_AttackAlert_Red_01.NS_AttackAlert_Red_01");
    const standard = action({ effect: redEffect, classPath: "/Game/StandardWarningAction_C" });
    const { result } = collect([event({ Action: standard, StartTime: 1 }), event({ StartTime: 2 })]);
    assert.equal(result.events.length, 2);
    assert(result.events.every(item => item.color === "red"));
    const fallback = result.inventory.find(item => item.semanticFallback);
    assert.equal(fallback.semanticFallback.status, "scheduled");
});
test("a standard blue warning cannot suppress a separate red fallback", () => {
    const blueEffect = object("/PBZVFXPack/VFX/BattleFX/Test/NS_AttackAlert_Blue_01.NS_AttackAlert_Blue_01");
    const standard = action({ effect: blueEffect, classPath: "/Game/StandardWarningAction_C" });
    const { result } = collect([event({ Action: standard, StartTime: 1 }), event({ StartTime: 2 })]);
    assert.equal(result.events.length, 2);
    assert.deepEqual(result.events.map(item => item.color).sort(), ["blue", "red"]);
});
test("physical node key is recognition-source independent; task activation is retained in metadata", () => {
    const adapter = createAdapter(UE, {}, null, { semanticFallback: true });
    const timelineValue = timeline([event()]);
    const run = activation => adapter.events(timelineValue, classifyEffect, asc,
        { actor, ability, task: "/Game/Test.Task", activation }, { GetRoleActor: () => null },
        { captureDiagnostics: false });
    assert.equal(run("1").events[0].key, run("2").events[0].key);
    assert.notEqual(run("1").events[0].meta.activation, run("2").events[0].meta.activation);
});
test("strict object leaves reject lookalike actor ability and action class names", () => {
    const valid = { actor, ability, actionClass,
        semantics: { deflect: { value: 3, name: "RedEye", conflict: false } } };
    for (const field of ["actor", "ability", "actionClass"]) {
        for (const suffix of ["_Unrelated", "_2Extra", "_2_3", "/Unrelated"]) {
            assert.equal(matchSemanticFallback({ ...valid, [field]: valid[field] + suffix }), null,
                field + suffix);
        }
        assert.equal(matchSemanticFallback({ ...valid, [field]: valid[field] + ".Other_C" }), null);
    }
    assert.equal(matchSemanticFallback({ ...valid, actor: actor.replace("Huo_C", "Huo_Clone_C") }), null);
    assert(matchSemanticFallback({ ...valid, actor: actor.toUpperCase(), ability: ability.toUpperCase() }));
});
test("type matching requires explicit conflict false and the confirmed numeric RedEye enum", () => {
    for (const deflect of [
        { value: 3, name: "RedEye" }, { value: 3, name: "RedEye", conflict: null },
        { value: 3, name: "RedEye", conflict: true }, { value: "3", name: "RedEye", conflict: false },
        { value: 3, name: "BlueEye", conflict: false }
    ]) assert.equal(matchSemanticFallback({ actor, ability, actionClass, semantics: { deflect } }), null);
    assert.equal(matchSemanticFallback({ actor, ability, actionClass,
        semantics: { deflect: { value: 3, conflict: false } } }).typeName, "RedEye");
});
test("both confirmed ability leaves are accepted with or without a numeric instance", () => {
    for (const [name, id] of [
        ["GA_Qishu_Huo_RoundSkill_FireRing_C", "qishu-round-fire-ring"],
        ["GA_Qishu_Huo_SkillAttack_F_AssaultEnd_C", "qishu-assault-end"]
    ]) {
        for (const suffix of ["", "_2147390242"]) assert.equal(matchSemanticFallback({ actor,
            ability: "/Game/Any." + name + suffix, actionClass,
            semantics: { deflect: { value: 3, name: "RedEye", conflict: false } } }).id, id);
    }
});
test("duplicate GUID physical nodes are deduplicated and array reorder retains their key", () => {
    const node = event();
    const { result } = collect([node, { ...node }]);
    assert.equal(result.events.length, 1);
    const another = event({ Action: object("/Unrelated") });
    assert.equal(collect([another, node]).result.events[0].key, result.events[0].key);
});
test("standard recognition wins on the same physical node and keeps its key", () => {
    const node = event();
    const before = collect([node]).result.events[0];
    node.Action.NiagaraEffect = object("/PBZVFXPack/VFX/BattleFX/Test/NS_AttackAlert_Red_01.NS_AttackAlert_Red_01");
    const after = collect([node]).result.events[0];
    assert.equal(before.key, after.key);
    assert.equal(after.meta.semanticFallback, undefined);
    assert.equal(after.meta.recognition.source, "niagara-warning-resource");
});
test("ineligible or distant standard node cannot discard an eligible fallback", () => {
    const standard = action({ effect: object("/PBZVFXPack/VFX/BattleFX/Test/NS_AttackAlert_Red_01.NS_AttackAlert_Red_01"),
        requirements: { RequireTags: ["Combat.Missing"], IgnoreTags: [], TagQuery: {} } });
    const { result } = collect([event({ Action: standard, StartTime: 8 }), event()]);
    assert.equal(result.events.length, 2);
    assert.equal(result.events[0].eligible, false);
    assert.equal(result.events[1].eligible, true);
    assert.equal(result.events[1].meta.semanticFallback.ruleId, "qishu-round-fire-ring");
});
test("a standard role warning from another actor cannot discard the owner fallback", () => {
    const adapter = createAdapter(UE, {}, null, { semanticFallback: true });
    const value = timeline([event()]);
    value.RoleLayers = array({ RoleName: "Other", Actions: array(event({ Action: action({
        effect: object("/PBZVFXPack/VFX/BattleFX/Test/NS_AttackAlert_Red_01.NS_AttackAlert_Red_01") }) })) });
    const other = object("/Game/Test.OtherActor", { AbilitySystemComponent: asc });
    const result = adapter.events(value, classifyEffect, asc, { actor, ability, task: "/Task", activation: "1" },
        { GetRoleActor: () => other });
    assert.equal(result.events.length, 2);
    assert.equal(result.events.filter(item => item.meta.semanticFallback).length, 1);
    assert.equal(result.events[1].meta.roleActor, other.path);
});
test("fallback keys preserve two distinct attacks at different timeline times", () => {
    const { result } = collect([event({ StartTime: 0.8 }), event({ StartTime: 3.8 })]);
    assert.equal(result.events.length, 2);
    assert.notEqual(result.events[0].key, result.events[1].key);
});
test("configuration can disable fallback after adapter construction", () => {
    const adapter = createAdapter(UE, {}, null, { semanticFallback: true });
    adapter.configureSemanticFallback(false);
    const result = adapter.events(timeline([event()]), classifyEffect, asc,
        { actor, ability, task: "/Task" }, { GetRoleActor: () => null });
    assert.equal(result.events.length, 0);
});
test("rule matcher is path/type based and does not infer colour from CantDeflect", () => {
    assert.equal(matchSemanticFallback({ actor, ability, actionClass,
        semantics: { deflect: { value: 3, name: "RedEye", conflict: false } } }).id,
        "qishu-round-fire-ring");
    assert.equal(matchSemanticFallback({ actor, ability, actionClass,
        semantics: { deflect: { value: 0, name: "CantDeflect", conflict: false } } }), null);
});

console.log("Semantic fallback tests: " + passed + " passed. No game access.");
