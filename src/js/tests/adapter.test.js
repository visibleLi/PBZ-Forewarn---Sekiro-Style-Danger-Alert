"use strict";
// Behavioral mock checks only. These do not establish live Puerts/UE compatibility.
const assert = require("node:assert/strict");
const { createAdapter } = require("../PBZForewarn/adapter");
const { classifyEffect } = require("../PBZForewarn/core");
const { BLACK_ACTION_CLASS, BLACK_EFFECT_OBJECT, BLACK_EFFECT_PACKAGE, recognizeWarning } = require("../PBZForewarn/attack-recognition");
let passed = 0, writes = 0, loads = 0;
const diagnostics = [];
function test(name, run) {
    try { run(); passed++; console.log("PASS " + name); }
    catch (e) { console.error("FAIL " + name); throw e; }
}
function array(...items) { return { Num: () => items.length, Get: i => items[i] }; }
function object(path, props = {}) { return { ue: true, path, ...props }; }
function readOnly(value, cache = new WeakMap()) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return value;
    if (cache.has(value)) return cache.get(value);
    const proxy = new Proxy(value, {
        get: (o, k) => readOnly(Reflect.get(o, k), cache),
        apply: (o, receiver, args) => readOnly(Reflect.apply(o, receiver, args), cache),
        set() { writes++; throw Error("gameplay write refused"); },
        deleteProperty() { writes++; throw Error("gameplay deletion refused"); },
        defineProperty() { writes++; throw Error("gameplay definition refused"); }
    });
    cache.set(value, proxy); return proxy;
}
const UE = {
    KismetSystemLibrary: {
        IsValid: o => !!(o && o.ue && !o.invalid),
        GetPathName: o => o.path,
        Conv_SoftObjectReferenceToString: o => { if (o.conversionThrows) throw Error("bridge unavailable"); return o.softPath || ""; }
    },
    BlueprintGameplayTagLibrary: {
        Conv_ObjectToGameplayTagAssetInterface: asc => asc && !asc.noInterface ? asc : null,
        HasAllMatchingGameplayTags: (asc, required) => required.every(t => asc.tags.includes(t)),
        HasAnyMatchingGameplayTags: (asc, ignored) => ignored.some(t => asc.tags.includes(t)),
        IsTagQueryEmpty: q => !q.required,
        GetOwnedGameplayTags: asc => asc.tags,
        DoesContainerMatchTagQuery: (tags, q) => tags.includes(q.required)
    }
};
const adapter = createAdapter(UE, {}, (kind, detail) => diagnostics.push({ kind, detail }));
const redPath = "/PBZVFXPack/VFX/BattleFX/AttackAlert/NS_AttackAlert_Red_01.NS_AttackAlert_Red_01";
const bluePath = "/PBZVFXPack/VFX/BattleFX/LeiTing/NS_LeiTing_AttackAlert_Blue_02.NS_LeiTing_AttackAlert_Blue_02";
const asc = object("/World/Enemy.ASC", { tags: ["Combat.Alert", "Combat.Ready"] });
const emptyRequirements = () => ({ RequireTags: [], IgnoreTags: [], TagQuery: {} });
function action(name = "UnrelatedActionClass", effect = object(redPath)) {
    return object("/Timeline/" + name, { NiagaraEffect: effect, ActivationRequirements: emptyRequirements(),
        GetClass: () => object("/Script/OtherModule." + name) });
}
function event(overrides = {}) {
    return { StartTime: 1, duration: 0.2, TriggerTimeOffset: 0, EndTriggerTimeOffset: 0,
        Guid: { A: 0, B: 0, C: 0, D: 0 }, Action: action(), ...overrides };
}
function timeline(main = [], roles = []) {
    return object("/Timeline", { Actions: array(...main), RoleLayers: array(...roles.map((items, i) =>
        Array.isArray(items) ? { RoleName: "Role" + i, Actions: array(...items) } : items)) });
}
function collect(tl, task) { return adapter.events(tl, classifyEffect, asc, { actor: "/Enemy" }, task); }
test("hard Niagara resource resolves by UObject path", () => {
    assert.deepEqual(adapter.effectPath(action()), { path: redPath, source: "hard" });
});
test("unloaded soft Niagara resolves without loading", () => {
    const soft = { softPath: bluePath, LoadSynchronous() { loads++; throw Error("load forbidden"); } };
    assert.deepEqual(adapter.effectPath(action("Soft", soft)), { path: bluePath, source: "soft-path" });
});
test("already loaded soft Niagara is used if path conversion unavailable", () => {
    const soft = { conversionThrows: true, Get: () => object(redPath), LoadSynchronous() { loads++; } };
    assert.deepEqual(adapter.effectPath(action("LoadedSoft", soft)), { path: redPath, source: "soft-loaded" });
});
test("unresolved soft references remain diagnostic entries", () => {
    const r = collect(timeline([event({ Action: action("Unresolved", {}) })]));
    assert.equal(r.events.length, 0); assert.equal(r.inventory[0].effectSource, "soft-unresolved");
});
test("action without Niagara property does not become a warning", () => {
    const r = collect(timeline([event({ Action: object("/NoNiagara") })]));
    assert.equal(r.events.length, 0); assert.equal(r.inventory[0].reason, "non-niagara-action");
});
test("alternative action class and object name still recognize warning", () => {
    const r = collect(timeline([event({ Action: action("BossSpecialFXAction") })]));
    assert.equal(r.events.length, 1); assert.equal(r.events[0].color, "red");
    assert.match(r.inventory[0].actionClass, /OtherModule.BossSpecialFXAction/);
});
test("prefixed blue resource in role layer is recognized", () => {
    const r = collect(timeline([], [[event({ Action: action("RoleFX", { softPath: bluePath }) })]]));
    assert.equal(r.events.length, 1); assert.equal(r.events[0].color, "blue"); assert.equal(r.inventory[0].key, "role0/0");
});
test("lowercase duration is preferred and both trigger offsets applied", () => {
    const t = adapter.eventTimes(event({ StartTime: 2, duration: 0.5, Duration: 99, TriggerTimeOffset: -0.02, EndTriggerTimeOffset: 0.04 }));
    assert.equal(t.start, 1.98); assert.equal(t.end, 2.54); assert.equal(t.durationField, "duration");
});
test("legacy Duration fallback only when lowercase value unavailable", () => {
    const t = adapter.eventTimes(event({ duration: undefined, Duration: 0.5 }));
    assert.equal(t.end, 1.5); assert.equal(t.durationField, "Duration");
});
test("point event retains exact point timing", () => {
    const r = collect(timeline([event({ duration: 0 })]));
    assert.equal(r.events[0].start, 1); assert.equal(r.events[0].end, 1);
});
test("inverted interval is rejected and described", () => {
    const r = collect(timeline([event({ duration: -0.1 })]));
    assert.equal(r.events.length, 0); assert.equal(r.inventory[0].reason, "invalid-time");
});
test("nonfinite timing is rejected", () => {
    const r = collect(timeline([event({ StartTime: NaN })]));
    assert.equal(r.events.length, 0); assert.equal(r.inventory[0].reason, "invalid-time");
});
test("missing required tag leaves node mapped but ineligible", () => {
    const a = action(); a.ActivationRequirements.RequireTags = ["Combat.Missing"];
    const r = collect(timeline([event({ Action: a })]));
    assert.equal(r.events.length, 1); assert.equal(r.events[0].eligible, false); assert.equal(r.inventory[0].reason, "require-tags");
});
test("present required tag allows node", () => {
    const a = action(); a.ActivationRequirements.RequireTags = ["Combat.Alert"];
    assert.equal(adapter.requirements(a, asc).eligible, true);
});
test("present ignored tag rejects node", () => {
    const a = action(); a.ActivationRequirements.IgnoreTags = ["Combat.Ready"];
    assert.deepEqual(adapter.requirements(a, asc), { eligible: false, reason: "ignore-tags" });
});
test("absent ignored tag allows node", () => {
    const a = action(); a.ActivationRequirements.IgnoreTags = ["Combat.Missing"];
    assert.equal(adapter.requirements(a, asc).eligible, true);
});
test("tag query uses owned tags and rejects mismatches", () => {
    const a = action(); a.ActivationRequirements.TagQuery = { required: "Combat.Missing" };
    assert.equal(adapter.requirements(a, asc).reason, "tag-query");
    a.ActivationRequirements.TagQuery.required = "Combat.Ready";
    assert.equal(adapter.requirements(a, asc).eligible, true);
});
test("unreadable tag requirements fail closed", () => {
    assert.equal(adapter.requirements(object("/BareAction"), asc).reason, "requirements-unavailable");
    const a = action(); Object.defineProperty(a, "ActivationRequirements", { get() { throw Error("destroyed"); } });
    assert.equal(adapter.requirements(a, asc).reason, "requirements-error");
});
test("missing tag interface fails closed", () => {
    assert.equal(adapter.requirements(action(), { noInterface: true }).reason, "tag-interface-unavailable");
});
test("identical nonzero GUID/action/time deduplicates within execution context", () => {
    const e = event({ Guid: { A: 1, B: 2, C: 3, D: 4 } });
    const r = collect(timeline([e, e]));
    assert.equal(r.events.length, 1); assert.equal(r.inventory.length, 2); assert.equal(r.checks.size, 1);
});
test("same GUID in main and role contexts does not swallow role binding", () => {
    const e = event({ Guid: { A: 1, B: 2, C: 3, D: 4 } });
    const r = collect(timeline([e], [[e]]));
    assert.equal(r.events.length, 2); assert.equal(r.events[0].eligible, true); assert.equal(r.events[1].eligible, false);
});
test("unbound role retains recognized event with explicit reason", () => {
    const r = collect(timeline([], [[event()]]), { GetRoleActor: () => null });
    assert.equal(r.events.length, 1); assert.equal(r.events[0].eligible, false);
    assert.equal(r.inventory[0].reason, "role-unbound"); assert.equal(r.inventory[0].roleName, "Role0");
    assert.equal(r.contexts.get(r.events[0].key).actor, null);
});
test("bound role tags use its own ASC and disclose assumption", () => {
    const a = action(); a.ActivationRequirements.RequireTags = ["Combat.RoleOnly"];
    const roleASC = object("/Role.ASC", { tags: ["Combat.RoleOnly"] });
    const roleActor = object("/Role", { AbilitySystemComponent: roleASC });
    const r = collect(timeline([event({ Action: a })], [[event({ Action: a })]]), { GetRoleActor: name => name === "Role0" ? roleActor : null });
    assert.equal(r.events[0].eligible, false); assert.equal(r.events[1].eligible, true);
    const c = r.contexts.get(r.events[1].key); assert.equal(c.asc, roleASC); assert.equal(c.actor, roleActor);
    assert.equal(c.roleName, "Role0"); assert.equal(c.reason, null);
    assert.equal(r.inventory[1].eligibilitySource, "role-binding-asc-assumption");
    assert.equal(r.inventory[1].requirementsASC, "/Role.ASC");
    assert.equal(r.contexts.get(r.events[0].key).source, "main-asc");
});
test("bound role without ASC fails closed", () => {
    const r = collect(timeline([], [[event()]]), { GetRoleActor: () => object("/RoleWithoutASC") });
    assert.equal(r.events[0].eligible, false); assert.equal(r.inventory[0].reason, "role-asc-unavailable");
    assert.equal(r.contexts.get(r.events[0].key).asc, null);
});
test("missing role name cannot guess an actor or spawn one", () => {
    let lookups = 0;
    const layer = { RoleName: "", bAutoSpawnWhenNoBinding: true, Actions: array(event()) };
    const r = collect(timeline([], [layer]), { GetRoleActor: () => { lookups++; return object("/Unexpected"); } });
    assert.equal(r.events[0].eligible, false); assert.equal(r.inventory[0].reason, "role-name-unavailable"); assert.equal(lookups, 0);
});
test("unbound auto-spawn layer is not predicted before actual binding", () => {
    const layer = { RoleName: "Optional", bAutoSpawnWhenNoBinding: true, Actions: array(event()) };
    const r = collect(timeline([], [layer]), { GetRoleActor: () => null });
    assert.equal(r.events[0].eligible, false); assert.equal(r.inventory[0].reason, "role-unbound");
});
test("role context can recover after binding on later compilation", () => {
    const tl = timeline([], [[event()]]); let actor = null; const t = { GetRoleActor: () => actor };
    assert.equal(collect(tl, t).events[0].eligible, false);
    actor = object("/LateRole", { AbilitySystemComponent: asc });
    assert.equal(collect(tl, t).events[0].eligible, true);
});
test("same role GUID and actor deduplicate while different roles remain separate", () => {
    const e = event({ Guid: { A: 1, B: 2, C: 3, D: 4 } }), role = object("/Role", { AbilitySystemComponent: asc });
    const roles = ["A", "A", "B"].map(RoleName => ({ RoleName, Actions: array(e) }));
    const r = collect(timeline([], roles), { GetRoleActor: () => role });
    assert.equal(r.events.length, 2); assert.equal(r.inventory.length, 3);
});
test("same GUID with different action remains a different node", () => {
    const e = event({ Guid: { A: 1, B: 0, C: 0, D: 0 } });
    const r = collect(timeline([e, { ...e, Action: action("AnotherAction") }]));
    assert.equal(r.events.length, 2);
});
test("same GUID with different timing remains a different node", () => {
    const e = event({ Guid: { A: 1, B: 0, C: 0, D: 0 } });
    assert.equal(collect(timeline([e, { ...e, StartTime: 2 }])).events.length, 2);
});
test("zero GUID uses layer/index identity to preserve distinct nodes", () => {
    const e = event(); assert.equal(collect(timeline([e, e], [[e]])).events.length, 3);
});
test("invalid action is reported without dereferencing gameplay data", () => {
    const r = collect(timeline([event({ Action: null })]));
    assert.equal(r.events.length, 0); assert.equal(r.inventory[0].reason, "invalid-action");
});
function task(name, props = {}) { return object("/Tasks/" + name, { Timeline: timeline(), CurrentTime: 0.1, ...props }); }
function ability(name, props = {}) { return object("/Abilities/" + name, { bIsActive: true, bIsAbilityEnding: false, ...props }); }
test("current task plus simultaneous ActiveTasks are collected once each", () => {
    const one = task("one"), two = task("two"), a = ability("parallel", { GetPlayTimelineTask: () => one, ActiveTasks: array(one, two) });
    const r = adapter.abilityTasks(a); assert.equal(r.size, 2); assert.equal(r.get(one.path).source, "current");
    assert.equal(r.get(two.path).source, "active-tasks");
});
test("non-timeline and nonfinite-time tasks are not scheduled", () => {
    const a = ability("bad", { ActiveTasks: array(task("plain", { Timeline: null }), task("nan", { CurrentTime: NaN })) });
    assert.equal(adapter.abilityTasks(a).size, 0);
});
test("task collection works without singular GetPlayTimelineTask", () => {
    assert.equal(adapter.abilityTasks(ability("alternate", { ActiveTasks: array(task("active")) })).size, 1);
});
function spec(instances, extra = {}) { return { ActiveCount: 1, NonReplicatedInstances: array(...instances), ReplicatedInstances: array(), ...extra }; }
function ascWith(specs, ticking = []) { return object("/ASC", { ActivatableAbilities: { Items: array(...specs) }, TickingTasks: array(...ticking) }); }
test("both replicated and nonreplicated active ability instances included", () => {
    const a = ability("local"), b = ability("replicated");
    const r = adapter.collectAbilities(ascWith([spec([a], { ReplicatedInstances: array(b) })]));
    assert.deepEqual([...r.keys()].sort(), [a.path, b.path].sort());
});
test("active noninstanced ability falls back to spec.Ability", () => {
    const a = ability("noninstanced"); assert.equal(adapter.collectAbilities(ascWith([spec([], { Ability: a })])).get(a.path), a);
});
test("inactive specs and inactive or ending instances excluded", () => {
    const r = adapter.collectAbilities(ascWith([spec([ability("inactiveSpec")], { ActiveCount: 0 }),
        spec([ability("inactive", { bIsActive: false }), ability("ending", { bIsAbilityEnding: true })])]));
    assert.equal(r.size, 0);
});
test("ticking task reaches active ability absent from specs", () => {
    const a = ability("fromTick"); const r = adapter.collectAbilities(ascWith([], [task("tick", { Ability: a })]));
    assert.equal(r.get(a.path), a);
});
test("ticking task never reactivates inactive or ending abilities", () => {
    const r = adapter.collectAbilities(ascWith([], [task("one", { Ability: ability("off", { bIsActive: false }) }),
        task("two", { Ability: ability("end", { bIsAbilityEnding: true }) })])); assert.equal(r.size, 0);
});
test("same ability from specs and ticking tasks deduplicates by path", () => {
    const a = ability("shared"); assert.equal(adapter.collectAbilities(ascWith([spec([a])], [task("tick", { Ability: a })])).size, 1);
});
test("KnownTasks alone cannot revive a stale ability", () => {
    const a = ascWith([]); a.KnownTasks = array(task("old", { Ability: ability("stale") }));
    assert.equal(adapter.collectAbilities(a).size, 0);
});
test("activation counter records replay identity and safe fallback", () => {
    assert.equal(adapter.activation({ GetActivationCount: () => 7 }), "7");
    assert.equal(adapter.activation({}), "unknown");
});
test("TArray guard caps excessive counts and emits evidence", () => {
    const result = adapter.list(array(1, 2, 3), 2); assert.deepEqual(result, [1, 2]);
    assert.equal(diagnostics.at(-1).kind, "array-truncated"); assert.throws(() => adapter.list({ Num: () => -1 }));
});
test("adapter never synchronously loads or writes gameplay inputs", () => {
    const soft = { softPath: bluePath, LoadSynchronous() { loads++; throw Error("forbidden"); } };
    const tl = readOnly(timeline([event({ Action: action("ReadOnlyAction", soft) })], [[event()]]));
    const role = readOnly(object("/ReadOnlyRole", { AbilitySystemComponent: asc }));
    const result = adapter.events(tl, classifyEffect, readOnly(asc), {}, readOnly({ GetRoleActor: () => role }));
    assert.equal(result.events.length, 2); assert.equal(result.events[1].eligible, true);
    const a = ability("readOnly", { ActiveTasks: array(task("readonly")) });
    adapter.abilityTasks(readOnly(a)); adapter.collectAbilities(readOnly(ascWith([spec([a])])));
    assert.equal(loads, 0); assert.equal(writes, 0);
});
test("verified PowerAttackParticle and exact Post pair yields black with event offsets", () => {
    const a = action("Power", { softPath: BLACK_EFFECT_OBJECT });
    a.GetClass = () => object(BLACK_ACTION_CLASS);
    const r = collect(timeline([event({ Action: a, StartTime: 2, duration: 0.5, TriggerTimeOffset: -0.1, EndTriggerTimeOffset: 0.03 })]));
    assert.equal(r.events.length, 1); assert.equal(r.events[0].color, "black");
    assert.equal(r.events[0].eligible, true); assert.equal(r.events[0].start, 1.9); assert.equal(r.events[0].end, 2.53);
    assert.equal(r.inventory[0].recognition.source, "power-attack-post-pair");
});
test("verified black pair supports unloaded package-only reference without loading", () => {
    const a = action("Power", { softPath: BLACK_EFFECT_PACKAGE }); a.GetClass = () => object(BLACK_ACTION_CLASS);
    assert.equal(collect(timeline([event({ Action: a })])).events[0].color, "black");
    assert.equal(loads, 0);
});
test("Post alone and class-name lookalikes cannot create a black warning", () => {
    for (const wrongClass of ["/Script/Other.PowerAttack", "/Untrusted/GAAction_PowerAttackParticle.GAAction_PowerAttackParticle_C", BLACK_ACTION_CLASS + "_Child"]) {
        const a = action("Post", object(BLACK_EFFECT_OBJECT)); a.GetClass = () => object(wrongClass);
        const r = collect(timeline([event({ Action: a })]));
        assert.equal(r.events.length, 0); assert.equal(r.inventory[0].reason, "post-without-known-power-action");
    }
});
test("known PowerAttack class does not make missing unrelated or other Post assets schedulable", () => {
    for (const effect of [null, object("/Other/OrdinaryFX"), object(BLACK_EFFECT_OBJECT.replaceAll("Post_001", "Post_002")),
        object(BLACK_EFFECT_OBJECT.replace(".NS_AttackAlert_Post_001", ".Other"))]) {
        const a = action("Power", effect); a.GetClass = () => object(BLACK_ACTION_CLASS);
        const r = collect(timeline([event({ Action: a })]));
        assert.equal(r.events.length, 0); assert.equal(r.inventory[0].reason, "power-action-without-known-post");
    }
});
test("known red resource on a PowerAttack action retains red rather than being forced black", () => {
    const a = action("Power", object(redPath)); a.GetClass = () => object(BLACK_ACTION_CLASS);
    const r = collect(timeline([event({ Action: a })]));
    assert.equal(r.events.length, 1); assert.equal(r.events[0].color, "red");
    assert.equal(r.inventory[0].recognition.source, "niagara-warning-resource");
});
test("a path-only classifier cannot bypass the black pair requirement", () => {
    assert.equal(recognizeWarning({ effectPath: "/Other/Post", actionClass: "/Other/Action" }, () => "black").supported, false);
});
test("black warnings retain RequireTags checks rather than bypassing them", () => {
    const a = action("Power", object(BLACK_EFFECT_OBJECT)); a.GetClass = () => object(BLACK_ACTION_CLASS);
    a.ActivationRequirements.RequireTags = ["Combat.Missing"];
    const r = collect(timeline([event({ Action: a })]));
    assert.equal(r.events[0].color, "black"); assert.equal(r.events[0].eligible, false);
    assert.equal(r.inventory[0].reason, "require-tags");
});
test("native and blueprint attack enums with unknown clocks remain inventory only", () => {
    for (const [field, value, name] of [["DeflectBulletType", 2, "BlueEye"], ["DeflectType", 3, "RedEye"], ["Deflect Bullet Type", 4, "PowerAttack"]]) {
        const a = action("Dynamic", null); a[field] = value; a.PreHitPointDuration = 0.3;
        a.SendFrameTimes = array(0.1, 0.8); a.StartBulletTimes = [0.2]; a.EndBulletTimes = [0.7];
        const r = collect(timeline([event({ Action: a })]));
        assert.equal(r.events.length, 0); assert.equal(r.inventory[0].color, null);
        assert.equal(r.inventory[0].reason, "attack-semantics-timing-unverified");
        const evidence = r.inventory[0].attackSemantics;
        assert.equal(evidence.deflect.name, name); assert.equal(evidence.deflect.field, field);
        assert.deepEqual(evidence.arrays.SendFrameTimes.values, [0.1, 0.8]);
        assert.equal(evidence.timing.PreHitPointDuration.value, 0.3);
        assert.equal(evidence.timingBasis, "unverified-not-scheduled"); assert.equal(evidence.usedForScheduling, false);
    }
});
test("semantic conflict remains visible and does not overwrite a known warning resource", () => {
    const a = action(); a.DeflectBulletType = 4; a.DeflectType = 2;
    const r = collect(timeline([event({ Action: a })]));
    assert.equal(r.events[0].color, "red"); assert.equal(r.inventory[0].attackSemantics.deflect.conflict, true);
    assert.deepEqual(r.inventory[0].attackSemantics.deflect.candidates.filter(x => x.status === "read").map(x => x.value), [4, 2]);
});
test("missing required tags keep exact required ignored query and owned snapshots", () => {
    const a = action(); a.ActivationRequirements = { RequireTags: ["Combat.Missing"], IgnoreTags: ["Combat.Ready"],
        TagQuery: { required: "Combat.Other", TokenStreamVersion: 1, TagDictionary: array({ TagName: "Combat.Other" }),
            QueryTokenStream: array(1, 2, 0), UserDescription: "Only other", AutoDescription: "ALL(Combat.Other)" } };
    const r = collect(timeline([event({ Action: a })])); const e = r.inventory[0].requirementsEvidence;
    assert.equal(r.events[0].eligible, false); assert.equal(r.inventory[0].reason, "require-tags");
    assert.deepEqual(e.requireTags.tags.values, ["Combat.Missing"]); assert.deepEqual(e.ignoreTags.tags.values, ["Combat.Ready"]);
    assert.deepEqual(e.ownedTags.tags.values, ["Combat.Alert", "Combat.Ready"]);
    assert.deepEqual(e.tagQuery.tagDictionary.values, ["Combat.Other"]); assert.deepEqual(e.tagQuery.queryTokenStream.values, [1, 2, 0]);
    assert.equal(e.tagQuery.autoDescription, "ALL(Combat.Other)"); assert.equal(e.evaluations.requireAll, false);
    assert.equal(e.evaluations.ignoreAny, null); // not evaluated after first rejection, not silently 'false'
    assert.doesNotThrow(() => JSON.stringify(r.inventory));
});
test("query rejection evidence contains native evaluation and full owned tags", () => {
    const a = action(); a.ActivationRequirements.TagQuery = { required: "Combat.Missing" };
    const check = adapter.requirements(a, asc, { captureEvidence: true });
    assert.equal(check.reason, "tag-query"); assert.equal(check.evidence.evaluations.queryEmpty, false);
    assert.equal(check.evidence.evaluations.queryMatches, false); assert.equal(check.evidence.evaluations.requireAll, true);
    assert.deepEqual(check.evidence.ownedTags.tags.values, asc.tags);
});
test("per-tag evidence uses native hierarchical HasTag without changing decision", () => {
    const calls = [];
    const UE2 = { ...UE, BlueprintGameplayTagLibrary: { ...UE.BlueprintGameplayTagLibrary,
        HasAllMatchingGameplayTags: () => true,
        HasTag: (owned, tag, exact) => { calls.push(exact); return owned.some(t => t === tag || !exact && t.startsWith(tag + ".")); }
    } };
    const a = action(); a.ActivationRequirements.RequireTags = ["Combat"];
    const check = createAdapter(UE2, {}).requirements(a, asc, { captureEvidence: true });
    assert.equal(check.eligible, true); assert.deepEqual(check.evidence.requiredTagMatches.values, [{ tag: "Combat", matchesOwned: true }]);
    assert.deepEqual(calls, [false]);
});
test("reflected tag arrays and parent tags are copied with bounded query tokens", () => {
    const UE2 = { ...UE, BlueprintGameplayTagLibrary: { ...UE.BlueprintGameplayTagLibrary,
        HasAllMatchingGameplayTags: () => true, HasAnyMatchingGameplayTags: () => false,
        GetOwnedGameplayTags: () => ({ GameplayTags: array({ TagName: "Combat.Ready" }), ParentTags: array({ TagName: "Combat" }) })
    } };
    const a = action(); a.ActivationRequirements.RequireTags = { GameplayTags: array({ TagName: "Combat" }), ParentTags: array() };
    a.ActivationRequirements.TagQuery = { QueryTokenStream: array(...Array(300).fill(2)) };
    const e = createAdapter(UE2, {}).requirements(a, asc, { captureEvidence: true }).evidence;
    assert.deepEqual(e.requireTags.tags.values, ["Combat"]); assert.deepEqual(e.ownedTags.parentTags.values, ["Combat"]);
    assert.equal(e.tagQuery.queryTokenStream.values.length, 256); assert.equal(e.tagQuery.queryTokenStream.length, 300);
    assert.equal(e.tagQuery.queryTokenStream.truncated, true);
});
test("diagnostic getter failure cannot bypass tags or execute Blueprint predicates", () => {
    const a = action(); let called = 0;
    a.ActivationRequirements.RequireTags = ["Combat.Missing"];
    a.GetAbilitySystemComponent = () => { throw Error("pre-execution context unavailable"); };
    a.K2_CanActivateAction = () => { called++; return true; };
    a.Received_ActionBegin = () => { called++; };
    const check = adapter.requirements(readOnly(a), readOnly(asc), { captureEvidence: true });
    assert.equal(check.reason, "require-tags"); assert.equal(check.evidence.actionContext.actionASC.status, "unreadable");
    assert.equal(called, 0); assert.equal(writes, 0);
});
test("Skill12-shaped main-layer rejection retains enemy ASC even if action getter differs", () => {
    const a = action(); a.ActivationRequirements.RequireTags = ["Combat.RoleOnly"];
    const alternate = object("/Other.ASC", { tags: ["Combat.RoleOnly"] });
    a.GetAbilitySystemComponent = () => alternate; a.GetAvatarActor = () => object("/OtherActor");
    const r = collect(timeline([event({ Action: a })])); const e = r.inventory[0].requirementsEvidence;
    assert.equal(r.events[0].eligible, false); assert.equal(r.inventory[0].eligibilitySource, "main-asc");
    assert.equal(e.checkedASC, asc.path); assert.equal(e.actionContext.actionASC.path, alternate.path);
    assert.equal(e.actionContext.actionASCMatchesSelected, false);
    assert.deepEqual(e.ownedTags.tags.values, asc.tags);
});
test("role inventory records binding context and actual role tags separately from main ASC", () => {
    const roleASC = object("/Role.ASC", { tags: ["Role.Allowed"] }); const actor = object("/Role", { AbilitySystemComponent: roleASC });
    const a = action(); a.ActivationRequirements.RequireTags = ["Role.Allowed"];
    const r = collect(timeline([], [{ RoleName: "Guest", bAutoSpawnWhenNoBinding: true, RoleCharacterClass: object("/Class/Guest"), Actions: array(event({ Action: a })) }]),
        { GetRoleActor: () => actor });
    const info = r.inventory[0]; assert.equal(r.events[0].eligible, true);
    assert.deepEqual(info.requirementsEvidence.ownedTags.tags.values, ["Role.Allowed"]);
    assert.equal(info.roleContext.mainASC, asc.path); assert.equal(info.roleContext.boundASC, roleASC.path);
    assert.equal(info.roleContext.autoSpawnWhenUnbound, true); assert.equal(info.roleContext.roleCharacterClass, "/Class/Guest");
});
test("lightweight requirements calls do not collect diagnostic getters", () => {
    const a = action(); a.GetAbilitySystemComponent = () => { throw Error("must not be called in lightweight mode"); };
    const check = adapter.requirements(a, asc);
    assert.deepEqual(check, { eligible: true, reason: "eligible" });
});

test("diagnostics off avoids semantic probes tag snapshots and native diagnostic getters", () => {
    let semanticReads = 0, ownedReads = 0, contextReads = 0;
    const UE2 = { ...UE, BlueprintGameplayTagLibrary: { ...UE.BlueprintGameplayTagLibrary,
        GetOwnedGameplayTags: a => { ownedReads++; return a.tags; }
    } };
    const a = action(), unrelated = action("NoWarning", null);
    for (const candidate of [a, unrelated]) Object.defineProperty(candidate, "DeflectBulletType",
        { get() { semanticReads++; return 2; } });
    a.GetAbilitySystemComponent = () => { contextReads++; return asc; };
    const tl = timeline([event({ Action: a }), event({ Action: unrelated })]);
    const local = createAdapter(UE2, {});
    const compact = local.events(tl, classifyEffect, asc, {}, null, { captureDiagnostics: false });
    assert.equal(compact.events.length, 1); assert.deepEqual(compact.inventory, []);
    assert.equal(semanticReads, 0); assert.equal(ownedReads, 0); assert.equal(contextReads, 0);
    assert.equal(compact.events[0].meta.attackSemantics, undefined);
    assert.equal(compact.events[0].meta.requirementsEvidence, undefined);
    assert.equal(compact.events[0].meta.roleContext, undefined);
    local.events(tl, classifyEffect, asc, {}, null, { captureDiagnostics: true });
    assert.equal(semanticReads, 2); assert(ownedReads > 0); assert(contextReads > 0);
});

test("diagnostics flag cannot change warning identity timing eligibility or execution binding", () => {
    const accepted = action("Allowed"), denied = action("Denied"), black = action("Black", object(BLACK_EFFECT_OBJECT));
    denied.ActivationRequirements.RequireTags = ["Combat.Missing"];
    black.GetClass = () => object(BLACK_ACTION_CLASS);
    const roleASC = object("/Role.ASC", { tags: ["Combat.Ready"] });
    const role = object("/Role", { AbilitySystemComponent: roleASC });
    const tl = timeline([event({ Action: accepted, Guid: { A: 1, B: 2, C: 3, D: 4 } }),
        event({ Action: denied, duration: 0 }), event({ Action: black, StartTime: 2, duration: 0.5, TriggerTimeOffset: -0.1 })],
        [[event({ Action: accepted })]]);
    const task = { GetRoleActor: () => role }, context = { actor: "/Enemy", ability: "/Ability", task: "/Task", activation: "7" };
    const full = adapter.events(tl, classifyEffect, asc, context, task);
    const compact = adapter.events(tl, classifyEffect, asc, context, task, { captureDiagnostics: false });
    const scheduling = result => result.events.map(({ key, color, start, end, eligible }) => ({ key, color, start, end, eligible }));
    assert.deepEqual(scheduling(compact), scheduling(full)); assert.deepEqual(compact.inventory, []);
    for (const e of full.events) {
        assert.equal(compact.checks.get(e.key), full.checks.get(e.key));
        const c = compact.contexts.get(e.key), f = full.contexts.get(e.key);
        for (const field of ["actor", "asc", "roleName", "source", "reason"]) assert.equal(c[field], f[field]);
        for (const field of ["actor", "ability", "task", "activation", "action", "actionClass", "effect", "roleActor", "reason"])
            assert.equal(compact.events.find(x => x.key === e.key).meta[field], e.meta[field]);
    }
});

test("diagnostics off still reads owned tags when a live tag query needs them", () => {
    let ownedReads = 0;
    const UE2 = { ...UE, BlueprintGameplayTagLibrary: { ...UE.BlueprintGameplayTagLibrary,
        GetOwnedGameplayTags: a => { ownedReads++; return a.tags; }
    } };
    const local = createAdapter(UE2, {}), a = action(); a.ActivationRequirements.TagQuery = { required: "Combat.Ready" };
    const tl = timeline([event({ Action: a })]);
    const accepted = local.events(tl, classifyEffect, asc, {}, null, { captureDiagnostics: false });
    assert.equal(accepted.events[0].eligible, true); assert.equal(ownedReads, 1);
    a.ActivationRequirements.TagQuery.required = "Combat.Missing";
    const denied = local.events(tl, classifyEffect, asc, {}, null, { captureDiagnostics: false });
    assert.equal(denied.events[0].eligible, false); assert.equal(denied.events[0].meta.reason, "tag-query");
    assert.equal(ownedReads, 2);
});

test("disabled inventory does not read optional role diagnostic fields", () => {
    let optionalReads = 0;
    const layer = { RoleName: "Guest", Actions: array(event()) };
    for (const field of ["bAutoSpawnWhenNoBinding", "RoleCharacterClass"]) Object.defineProperty(layer, field,
        { get() { optionalReads++; throw Error("diagnostic-only role field"); } });
    const r = adapter.events(timeline([], [layer]), classifyEffect, asc, {}, { GetRoleActor: () => null }, { captureDiagnostics: false });
    assert.equal(optionalReads, 0); assert.equal(r.events[0].eligible, false); assert.equal(r.events[0].meta.reason, "role-unbound");
    assert.deepEqual(r.inventory, []);
});

const fallbackUE = UE;
const fallbackAdapter = createAdapter(fallbackUE, {}, () => {}, { semanticFallback: true });
const qishuActor = "/World/BP_Monster_QiShu_Huo_C_1";
const qishuContext = (ability) => ({ actor: qishuActor, ability, task: "/Task/QiShu", activation: "1" });
function semanticAction(ability, typeValue, className = "GAA_DelayDeflectProjectileBullet_C") {
    const a = object("/Action/QiShu", {
        "Deflect Bullet Type": typeValue,
        NiagaraEffect: null,
        ActivationRequirements: emptyRequirements(),
        GetClass: () => object("/Script/PBZDeflectSystem." + className)
    });
    return a;
}
function semanticTimeline(a, start = 0.8) {
    return timeline([event({ Action: a, StartTime: start, duration: 0.5 })]);
}

test("Qishu fire-ring RedEye semantic action becomes a supplementary red warning", () => {
    const ability = "/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C";
    const result = fallbackAdapter.events(semanticTimeline(semanticAction(ability, 3)), classifyEffect, asc,
        qishuContext(ability), null, { captureDiagnostics: false });
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].color, "red");
    assert.equal(result.events[0].meta.semanticFallback.ruleId, "qishu-round-fire-ring");
    assert.equal(result.events[0].meta.semanticFallback.status, "scheduled");
    assert.equal(result.checks.size, 1); assert.equal(result.contexts.size, 1);
});

test("Qishu assault-end RedEye semantic action becomes a supplementary red warning", () => {
    const ability = "/Game/Boss/GA_Qishu_Huo_SkillAttack_F_AssaultEnd_C";
    const result = fallbackAdapter.events(semanticTimeline(semanticAction(ability, 3), 3.8), classifyEffect, asc,
        qishuContext(ability), null, { captureDiagnostics: false });
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].color, "red");
    assert.equal(result.events[0].meta.semanticFallback.ruleId, "qishu-assault-end");
});

test("semantic fallback rejects non-RedEye and conflicting type fields", () => {
    const ability = "/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C";
    const cantDeflect = semanticAction(ability, 0);
    const conflict = semanticAction(ability, 3); conflict.DeflectType = 2;
    for (const a of [cantDeflect, conflict]) {
        const result = fallbackAdapter.events(semanticTimeline(a), classifyEffect, asc,
            qishuContext(ability), null, { captureDiagnostics: false });
        assert.equal(result.events.length, 0);
    }
});

test("semantic fallback is scoped to QiShu ability and action class", () => {
    const otherActor = fallbackAdapter.events(semanticTimeline(semanticAction(
        "/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C", 3)), classifyEffect, asc,
        { actor: "/World/OtherEnemy", ability: "/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C", task: "/Task/Other" },
        null, { captureDiagnostics: false });
    const otherClass = fallbackAdapter.events(semanticTimeline(semanticAction(
        "/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C", 3, "OrdinaryAction")), classifyEffect, asc,
        qishuContext("/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C"), null, { captureDiagnostics: false });
    assert.equal(otherActor.events.length, 0); assert.equal(otherClass.events.length, 0);
});

test("a distinct standard red node does not suppress a QiShu semantic node", () => {
    const ability = "/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C";
    const standard = action("StandardRed", object(redPath));
    const semantic = semanticAction(ability, 3);
    const result = fallbackAdapter.events(timeline([
        event({ Action: standard, StartTime: 0.5, duration: 0.2 }),
        event({ Action: semantic, StartTime: 0.8, duration: 0.5 })
    ]), classifyEffect, asc, qishuContext(ability), null, { captureDiagnostics: false });
    assert.equal(result.events.length, 2);
    assert.equal(result.events[0].meta.semanticFallback, undefined);
    assert.equal(result.events[1].meta.semanticFallback.ruleId, "qishu-round-fire-ring");
});

test("standard blue warning does not suppress a distinct QiShu red fallback", () => {
    const ability = "/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C";
    const blue = object("/BlueAction", {
        NiagaraEffect: object("/PBZVFXPack/VFX/BattleFX/Test/NS_AttackAlert_Blue_01.NS_AttackAlert_Blue_01"),
        ActivationRequirements: emptyRequirements(),
        GetClass: () => object("/Class/BlueAction")
    });
    const result = fallbackAdapter.events(timeline([
        event({ Action: blue, StartTime: 0.5, duration: 0.2 }),
        event({ Action: semanticAction(ability, 3), StartTime: 0.8, duration: 0.5 })
    ]), classifyEffect, asc, qishuContext(ability), null, { captureDiagnostics: false });
    assert.equal(result.events.length, 2);
    assert.deepEqual(result.events.map(item => item.color).sort(), ["blue", "red"]);
});

test("disabling semantic fallback leaves the original warning set unchanged", () => {
    const ability = "/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C";
    const disabled = createAdapter(UE, {}, () => {}, { semanticFallback: false });
    const result = disabled.events(semanticTimeline(semanticAction(ability, 3)), classifyEffect, asc,
        qishuContext(ability), null, { captureDiagnostics: false });
    assert.equal(result.events.length, 0);
});
test("captured QiShu plans retain observed type and authored timing and disappear when fallback is disabled", () => {
    const captured = require("./fixtures/qishu-captured-plans.json");
    assert.equal(captured.evidenceBuild, "26367565");
    assert.equal(captured.rules.length, 2);
    for (const fact of captured.rules) {
        const attack = object("/Captured/" + fact.action, {
            NiagaraEffect: null,
            GetClass: () => object(fact.actionClass),
            ActivationRequirements: {
                RequireTags: fact.requirements.requireTags.tags.values.slice(),
                IgnoreTags: fact.requirements.ignoreTags.tags.values.slice(),
                TagQuery: fact.requirements.tagQuery.empty ? {} : { required: "unconfirmed-query" }
            }
        });
        for (const candidate of fact.attackSemantics.deflect.candidates) {
            if (candidate.status === "read") attack[candidate.field] = candidate.value;
        }
        const index = Number(fact.key.split("/")[1]);
        const nodes = Array.from({ length: index }, (_, i) => event({ Action: object("/Captured/Unused" + i) }));
        nodes.push(event({ Action: attack, StartTime: fact.start, duration: fact.end - fact.start }));
        const value = timeline(nodes), context = qishuContext("/Captured/" + fact.ability + "_1");
        const enabled = fallbackAdapter.events(value, classifyEffect, asc, context, null, { captureDiagnostics: false });
        assert.equal(enabled.events.length, 1);
        const warning = enabled.events[0];
        assert.equal(warning.meta.key, fact.key);
        assert.equal(warning.meta.semanticFallback.typeValue, fact.attackSemantics.deflect.value);
        assert.equal(warning.color, "red");
        assert.equal(warning.start, fact.start);
        assert(Math.abs(warning.end - fact.end) < 1e-12);
        assert.equal(warning.eligible, true);
        const disabled = createAdapter(UE, {}, () => {}, { semanticFallback: false })
            .events(value, classifyEffect, asc, context, null, { captureDiagnostics: false });
        assert.equal(disabled.events.length, 0);
    }
});
console.log("Adapter mock tests: " + passed + " passed. No game launched; no gameplay writes; no synchronous loads.");
