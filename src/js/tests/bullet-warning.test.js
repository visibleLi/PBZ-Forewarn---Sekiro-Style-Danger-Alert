"use strict";
const assert = require("assert");
const { createBulletWarning } = require("../PBZForewarn/bullet-warning");
const DELAY = "/PBZDeflectSystem/Actions/GAA_DelayDeflectProjectileBullet.GAA_DelayDeflectProjectileBullet_C";
const DURATION = "/Script/PBZCombatAsset.LGAAction_DurationBulletWithDeflect";
const EFFECT = "/SGameCombatSystem/Bullet/Event/BP_BulletEvent_Effect.BP_BulletEvent_Effect_C";
const EXECUTION = "/SGameExecution/Bullet/Events/BP_BulletEvent_PlayExecution.BP_BulletEvent_PlayExecution_C";
const GRAB = "/SGameExecution/GA/GA_ExecutedAbilityBase_Grab.GA_ExecutedAbilityBase_Grab_C";
const FILTER = "/Script/SGameCombatSystem.BulletEvent_FilterEventActor";
const RED = "/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Red_001.NS_AttackAlert_Red_001";
const BLUE = "/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Blue_001.NS_AttackAlert_Blue_001";
let checks = 0, serial = 0;
function test(name, run) { run(); checks++; console.log("PASS " + name); }
function obj(props = {}, name) { return { _valid: true, _path: name || "/Renamed/Object" + (++serial), ...props }; }
function array(values = []) { return { Num: () => values.length, Get: i => values[i] }; }
function event(type, props = {}) { return obj({ GetClass: () => obj({}, type), ...props }); }
function container(names = []) { return { GameplayTags: array(names.map(TagName => ({ TagName }))) }; }
function req(names = []) { return { RequireTags: container(names), IgnoreTags: container(),
    TagQuery: { QueryTokenStream: array(), TagDictionary: array() } }; }
function effect(resource = RED) { return event(EFFECT, { Niagara: obj({}, resource) }); }
function grab(props = {}) { return event(EXECUTION, { "Executed Ability": obj({ GetSuperClass: () => obj({}, GRAB) }), ...props }); }
function input(events = [effect()], type = DELAY) {
    return event(type, { BulletData: obj({ [type === DELAY ? "StartEvents" : "PreAttackEvents"]: { Events: array(events) } }),
        DeflectBulletType: 0 });
}
const times = { start: 0.75, end: 0.8 };
let selfEligible = true, selfCalls = 0;
const warning = createBulletWarning({ valid: value => !!value && value._valid === true,
    path: value => value._path || "", list: value => Array.from({ length: value.Num() }, (_, i) => value.Get(i)),
    effectPath: value => ({ path: value.NiagaraEffect && value.NiagaraEffect._path }),
    requirements: (action, asc) => { selfCalls++; assert(action.ActivationRequirements); assert.equal(asc, "source"); return { eligible: selfEligible }; } });
const plan = action => warning.plan(action, times, "source");

test("direct standard resource uses explicit unverified authored preparation", () => {
    const result = plan(input());
    assert.equal(result.color, "red"); assert.equal(result.start, times.start); assert.equal(result.end, times.end);
    assert.equal(result.kind, "standard-warning-resource"); assert.equal(result.timingBasis, "authored-action-preparation-candidate");
    assert.equal(result.executionVerified, false); assert.equal(result.nativeLaunchCoordinateConfirmed, false);
    assert.equal(result.lifecycle, "StartEvents"); assert.equal(Object.hasOwn(result, "singleFrame"), false);
});
test("initialization and blue standard resources are supported", () => {
    const a = input([effect(BLUE)]); a.BulletData.InitializeEvents = a.BulletData.StartEvents; delete a.BulletData.StartEvents;
    assert.equal(plan(a).color, "blue"); assert.equal(plan(a).lifecycle, "InitializeEvents");
});
test("renaming actor ability bullet and event cannot affect recognition", () => {
    const a = input(), before = plan(a); a.Boss = "Other"; a.Ability = "Other";
    a._path = "/Different/Action"; a.BulletData._path = "/Different/Bullet";
    const after = plan(a); assert.equal(after.color, before.color); assert.equal(after.kind, before.kind);
});
test("empty random maps and neutral reflected Name branches permit fixed bullet", () => {
    for (const Branch of [undefined, null, "", "None"]) {
        const a = input(); a.Branch = Branch; a["Random Bullet Data"] = { Num: () => 0 }; assert(plan(a));
    }
});
test("dynamic malformed and unreadable selection fails closed", () => {
    for (const value of [{ Num: () => 1 }, {}, { Num: () => -1 }, { Num() { throw Error(); } }]) {
        const a = input(); a.RandomBulletData = value; assert.equal(plan(a), null);
    }
    for (const Branch of ["Success", false, true, {}]) { const a = input(); a.Branch = Branch; assert.equal(plan(a), null); }
    const a = input(); Object.defineProperty(a, "Branch", { get() { throw Error(); } }); assert.equal(plan(a), null);
});
test("aliases agree by native path but genuine conflicts reject", () => {
    const a = input(); a["Bullet Data"] = a.BulletData; assert(plan(a));
    a["Bullet Data"] = obj(); assert.equal(plan(a), null);
    const b = input([grab()], DURATION); b.DeflectType = 3; assert.equal(plan(b), null);
});
test("soft and invalid bullet references never load", () => {
    const a = input(); a.BulletData = { Get() { throw Error("must not call"); }, LoadSynchronous() { throw Error("must not call"); } };
    assert.equal(plan(a), null);
});
test("exact action event and standard resource identities required", () => {
    const a = input(); a.GetClass = () => obj({}, "/Other/GAA_DelayDeflectProjectileBullet_C"); assert.equal(plan(a), null);
    assert.equal(plan(input([event("/Other/Effect", { Niagara: obj({}, RED) })])), null);
    assert.equal(plan(input([effect("/PBZVFXPack/VFX/BattleFX/Other/NS_Warning_AOE")])), null);
});
test("unknown interval and subbullet siblings do not veto direct warning", () => {
    const interval = event("/Script/SGameCombatSystem.BulletEvent_Interval", { Interval: 0.5,
        IntervalEvents: array([effect(BLUE)]) });
    assert.equal(plan(input([interval, effect()])).color, "red");
    assert.equal(plan(input([interval])), null);
});
test("multiple direct signals and conflicting colors reject one-node ambiguity", () => {
    assert.equal(plan(input([effect(), effect()])), null); assert.equal(plan(input([effect(), effect(BLUE)])), null);
});
test("CantDeflect plus verified grab ancestry creates black capability risk", () => {
    const result = plan(input([grab()], DURATION)); assert.equal(result.color, "black");
    assert.equal(result.kind, "execution-capability"); assert.equal(result.interpretation, "conditional-grab-capability-risk");
    for (const type of [undefined, 1, 3, 4, NaN]) { const a = input([grab()], DURATION); a.DeflectBulletType = type; assert.equal(plan(a), null); }
    assert.equal(plan(input([grab()])), null);
});
test("wellformed native filter retains future overflow conditions without gating risk", () => {
    const filter = event(FILTER, { TagRequirement: req(["State.Future.Condition"]), SubEvents: array([grab()]) });
    const before = selfCalls, result = plan(input([filter], DURATION));
    assert(result); assert.equal(result.riskConditions[0].require[0], "State.Future.Condition");
    assert.equal(selfCalls, before); assert.equal(result.route.length, 2);
});
test("malformed filter and unknown ancestors cannot authorize their descendants", () => {
    for (const filter of [event(FILTER, { TagRequirement: {}, SubEvents: array([grab()]) }),
        event("/Other/Container", { SubEvents: array([grab()]) }), event(FILTER, { TagRequirement: req(), Delay: 0.5, SubEvents: array([grab()]) })])
        assert.equal(plan(input([filter], DURATION)), null);
});
test("target tags remain risk evidence and true target identity flag rejects", () => {
    const result = plan(input([grab({ "Target Required Tags": container(["Target.Required"]),
        "Target Ignored Tags": container(["Target.Ignored"]), "Only Grab Ability Target": false })], DURATION));
    assert.equal(result.riskConditions[0].targetRequired[0], "Target.Required");
    assert.equal(plan(input([grab({ "Only Grab Ability Target": true })], DURATION)), null);
});
test("self requirements recheck source state before execution", () => {
    const a = input([grab({ CheckSelfTag: true, SelfTagRequirement: req() })], DURATION);
    selfEligible = true; const expected = plan(a); assert(expected);
    assert.equal(warning.eligibility(a, times, "source", expected).eligible, true);
    selfEligible = false; assert.equal(warning.eligibility(a, times, "source", expected).eligible, false); selfEligible = true;
});
test("execution recheck rejects changed bullet signal condition or timing", () => {
    const a = input(), expected = plan(a); assert(warning.eligibility(a, times, "source", expected).eligible);
    a.BulletData = input().BulletData; assert.equal(warning.eligibility(a, times, "source", expected).eligible, false);
    const b = input(), prior = plan(b); b.BulletData.StartEvents.Events = array([effect(BLUE)]);
    assert.equal(warning.eligibility(b, times, "source", prior).eligible, false);
    const c = input(), old = plan(c); assert.equal(warning.eligibility(c, { start: 0.8, end: 0.9 }, "source", old).eligible, false);
    assert.equal(warning.eligibility(c, times, "source", { ...old }).eligible, false);
});
test("bounded arrays routes and ancestry reject unresolved descendants", () => {
    assert.equal(plan(input(Array.from({ length: 33 }, () => effect()))), null);
    let nested = grab(); for (let i = 0; i < 6; i++) nested = event(FILTER, { TagRequirement: req(), SubEvents: array([nested]) });
    assert.equal(plan(input([nested], DURATION)), null);
    const cycle = event(FILTER, { TagRequirement: req() }); cycle.SubEvents = array([cycle]);
    assert.equal(plan(input([cycle], DURATION)), null);
    const ability = obj(); ability.GetSuperClass = () => ability;
    assert.equal(plan(input([grab({ "Executed Ability": ability })], DURATION)), null);
});
test("invalid timeline and throwing native fields never escape", () => {
    assert.equal(warning.plan(input(), { start: NaN, end: 1 }, "source"), null);
    assert.equal(warning.plan(input(), { start: 2, end: 1 }, "source"), null);
    const a = input(); Object.defineProperty(a, "BulletData", { get() { throw Error(); } }); assert.equal(plan(a), null);
});
console.log("checks " + checks);
