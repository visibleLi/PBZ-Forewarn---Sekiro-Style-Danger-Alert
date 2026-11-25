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

const retiredOptionsAdapter = createAdapter(UE, {}, null, { genericAttack: false, semanticFallback: true, castWarning: true });
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

test("retired boss contexts cannot schedule legacy cues even when old options are true and generic is false", () => {
    const local = createAdapter(UE, {}, null, { genericAttack: false, semanticFallback: true, castWarning: true });
    const cases = [
        ...["/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C", "/Game/Boss/GA_Qishu_Huo_SkillAttack_F_AssaultEnd_C"].map(ability => ({
            a: semanticAction(ability, 3), context: qishuContext(ability)
        })),
        { a: object("/Retired/CastAction", {
            NiagaraEffect: object("/PBZVFXPack/VFX/BattleFX/YuZan/NS_YuZan_Warning_AOE_101.NS_YuZan_Warning_AOE_101"),
            ActivationRequirements: emptyRequirements(),
            GetClass: () => object("/SGameCombatSystem/Weapon/Action/GAAction_WeaponParticleFrame.GAAction_WeaponParticleFrame_C")
        }), context: { actor: "/World/BP_Monster_FemaleVessel_YuZan_C_1", ability: "/Abilities/GA_YuZan_Skill_03_C_1" } }
    ];
    for (const { a, context } of cases) {
        const tl = semanticTimeline(a); tl.path = context.ability + ".Main";
        for (const captureDiagnostics of [false, true]) {
            const r = local.events(tl, classifyEffect, asc, context, null, { captureDiagnostics });
            assert.deepEqual(r.events, []); assert.equal(r.checks.size, 0); assert.equal(r.contexts.size, 0);
            assert.equal(r.inventory.length, captureDiagnostics ? 1 : 0);
            if (captureDiagnostics) {
                assert.equal(r.inventory[0].semanticFallback, undefined); assert.equal(r.inventory[0].castWarning, undefined);
                assert.equal(r.inventory[0].attackSemantics.usedForScheduling, false);
                assert.equal(r.inventory[0].attackSemantics.timingBasis, "unverified-not-scheduled");
            }
        }
    }
});

test("retired semantic scopes keep non-RedEye conflict and renamed evidence diagnostic only", () => {
    const ability = "/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C";
    const conflict = semanticAction(ability, 3); conflict.DeflectType = 2;
    const cases = [
        { a: semanticAction(ability, 0), context: qishuContext(ability), value: 0, conflict: false },
        { a: conflict, context: qishuContext(ability), value: 3, conflict: true },
        { a: semanticAction(ability, 3), context: { actor: "/World/OtherEnemy", ability }, value: 3, conflict: false },
        { a: semanticAction(ability, 3, "OrdinaryAction"), context: qishuContext(ability), value: 3, conflict: false }
    ];
    for (const { a, context, value, conflict } of cases) {
        const result = retiredOptionsAdapter.events(semanticTimeline(a), classifyEffect, asc, context);
        assert.equal(result.events.length, 0);
        const evidence = result.inventory[0].attackSemantics;
        assert.equal(evidence.deflect.value, value); assert.equal(evidence.deflect.conflict, conflict);
        assert.equal(evidence.usedForScheduling, false); assert.equal(evidence.timingBasis, "unverified-not-scheduled");
        assert.equal(result.inventory[0].semanticFallback, undefined);
    }
});

test("ordinary red blue and black nodes remain physical warnings alongside retired boss semantics", () => {
    const ability = "/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C";
    for (const [color, effect] of [["red", redPath], ["blue", bluePath], ["black", BLACK_EFFECT_OBJECT]]) {
        const standard = action("Standard", object(effect));
        if (color === "black") standard.GetClass = () => object(BLACK_ACTION_CLASS);
        const tl = timeline([
            event({ Action: semanticAction(ability, 3), StartTime: 0.8, duration: 0.5 }),
            event({ Action: standard, StartTime: 2, duration: 0.5, TriggerTimeOffset: -0.1, EndTriggerTimeOffset: 0.03 })
        ]);
        for (const captureDiagnostics of [false, true]) {
            const result = retiredOptionsAdapter.events(tl, classifyEffect, asc, qishuContext(ability), null, { captureDiagnostics });
            assert.deepEqual(scheduling(result), [{ key: "main/1", color, start: 1.9, end: 2.53, eligible: true, leadSeconds: undefined }]);
            assert.equal(result.checks.get("main/1"), standard); assert.equal(result.contexts.get("main/1").asc, asc);
            assert.equal(result.events[0].meta.semanticFallback, undefined); assert.equal(result.events[0].meta.castWarning, undefined);
        }
    }
});

test("captured retired QiShu plans retain observed type and authored timing without scheduling", () => {
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
        for (const captureDiagnostics of [false, true]) {
            const result = retiredOptionsAdapter.events(value, classifyEffect, asc, context, null, { captureDiagnostics });
            assert.equal(result.events.length, 0); assert.equal(result.checks.size, 0); assert.equal(result.contexts.size, 0);
            if (captureDiagnostics) {
                const evidence = result.inventory[index];
                assert.equal(evidence.key, fact.key); assert.equal(evidence.start, fact.start);
                assert(Math.abs(evidence.end - fact.end) < 1e-12);
                assert.equal(evidence.attackSemantics.deflect.value, fact.attackSemantics.deflect.value);
                assert.equal(evidence.attackSemantics.usedForScheduling, false); assert.equal(evidence.semanticFallback, undefined);
            } else assert.deepEqual(result.inventory, []);
        }
    }
});
// Generic paths and fields from the 2026-11-22 static export research.
// These mocks do not establish native execution or runtime timing.
const BULLET_ACTION_CLASS = "/PBZDeflectSystem/Actions/GAA_DelayDeflectProjectileBullet.GAA_DelayDeflectProjectileBullet_C";
const BULLET_EFFECT_CLASS = "/SGameCombatSystem/Bullet/Event/BP_BulletEvent_Effect.BP_BulletEvent_Effect_C";
const EXECUTION_EVENT_CLASS = "/SGameExecution/Bullet/Events/BP_BulletEvent_PlayExecution.BP_BulletEvent_PlayExecution_C";
const GRAB_CLASS = "/SGameExecution/GA/GA_ExecutedAbilityBase_Grab.GA_ExecutedAbilityBase_Grab_C";
const nestedRedPath = "/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Red_001.NS_AttackAlert_Red_001";
function typedObject(name, classPath, props = {}) {
    return object(name, { GetClass: () => object(classPath), ...props });
}
function redBullet(name = "/Arbitrary/Bullet") {
    const effect = typedObject(name + "/Effect", BULLET_EFFECT_CLASS, { Niagara: object(nestedRedPath) });
    return object(name, { StartEvents: { Events: array(effect) } });
}
function bulletAction(bullet = redBullet(), name = "/Arbitrary/Action") {
    return typedObject(name, BULLET_ACTION_CLASS, { NiagaraEffect: null, BulletData: bullet,
        ActivationRequirements: emptyRequirements() });
}
function scheduling(result) {
    return result.events.map(({ key, color, start, end, eligible, leadSeconds }) => ({ key, color, start, end, eligible, leadSeconds }));
}
const observationAdapter = createAdapter(UE, {}, null, { genericAttack: false });
function observe(tl) { return observationAdapter.events(tl, classifyEffect, asc, { actor: "/Enemy" }); }
test("nested standard red bullet resource is inventory only and JSON serializable when generic is disabled", () => {
    const r = observe(timeline([event({ Action: bulletAction() })]));
    const evidence = r.inventory[0].bulletSignalCandidates;
    assert.equal(evidence.status, "read"); assert.equal(evidence.usedForScheduling, false);
    assert.equal(evidence.unresolved, false); assert.equal(r.candidateScanUnresolved, false);
    assert.equal(evidence.candidates.length, 1);
    assert.equal(evidence.candidates[0].kind, "standard-warning-resource");
    assert.equal(evidence.candidates[0].color, "red");
    assert.equal(r.events.length, 0); assert.equal(r.checks.size, 0); assert.equal(r.contexts.size, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(evidence)), evidence);
});
test("disabled generic candidates survive renamed enemy ability and non-generic object paths", () => {
    const outcomes = ["QiShu", "RenamedEnemy"].map(name => {
        const a = bulletAction(redBullet("/Changed/" + name + "/Data"), "/Changed/" + name + "/Action");
        const r = observationAdapter.events(timeline([event({ Action: a })]), classifyEffect, asc,
            { actor: "/World/" + name, ability: "/Changed/" + name + "/Ability" });
        assert.equal(r.events.length, 0);
        return r.inventory[0].bulletSignalCandidates.candidates.map(c => ({ kind: c.kind, color: c.color }));
    });
    assert.deepEqual(outcomes[0], outcomes[1]);
    assert.deepEqual(outcomes[0], [{ kind: "standard-warning-resource", color: "red" }]);
});
test("unloaded soft bullet data requests retry and later resolution is observed", () => {
    let referenceCalls = 0;
    const soft = { Get() { referenceCalls++; throw Error("unknown soft API"); },
        LoadSynchronous() { loads++; throw Error("forbidden"); } };
    const a = bulletAction(soft), tl = timeline([event({ Action: a })]);
    const pending = observe(tl);
    assert.equal(pending.events.length, 0); assert.equal(pending.candidateScanUnresolved, true);
    assert.equal(pending.inventory[0].bulletSignalCandidates.unresolved, true);
    a.BulletData = redBullet(); // native reference becomes readable on a later compile
    const resolved = observe(tl);
    assert.equal(resolved.candidateScanUnresolved, false);
    assert.equal(resolved.inventory[0].bulletSignalCandidates.candidates.length, 1);
    assert.equal(resolved.events.length, 0); assert.equal(loads, 0); assert.equal(referenceCalls, 0);
});
test("ordinary actions omit absent bullet metadata without retry", () => {
    const r = collect(timeline([event()]));
    assert.equal(r.inventory[0].bulletSignalCandidates, undefined);
    assert.equal(r.candidateScanUnresolved, false); assert.equal(r.events.length, 1);
});
test("disabled generic diagnostics off performs zero bullet reads or candidate scheduling", () => {
    let bulletReads = 0, graphReads = 0;
    const bullet = redBullet(), a = bulletAction(bullet);
    Object.defineProperty(a, "BulletData", { get() { bulletReads++; return bullet; } });
    Object.defineProperty(bullet, "PreAttackEvents", { get() { graphReads++; throw Error("observation only"); } });
    const tl = timeline([event({ Action: a }), event()]);
    const compact = observationAdapter.events(tl, classifyEffect, asc, {}, null, { captureDiagnostics: false });
    assert.equal(bulletReads, 0); assert.equal(graphReads, 0);
    assert.equal(compact.events.length, 1); assert.deepEqual(compact.inventory, []);
    assert.equal(compact.candidateScanUnresolved, false);
    assert.equal(compact.events[0].meta.bulletSignalCandidates, undefined);
    const full = observe(tl);
    assert(bulletReads > 0); assert(graphReads > 0);
    assert.deepEqual(scheduling(full), scheduling(compact));
});
test("conditional capture capability keeps conditions without executing or mutating native objects", () => {
    let nativeCalls = 0;
    const forbidden = () => { nativeCalls++; throw Error("native execution forbidden"); };
    const grab = object(GRAB_CLASS);
    const payload = object("/Renamed/Reaction.Reaction_C", { GetSuperClass: () => grab });
    const execution = typedObject("/Renamed/Execution", EXECUTION_EVENT_CLASS,
        { "Executed Ability": payload, Trigger: forbidden, Execute: forbidden });
    const filter = typedObject("/Renamed/Filter", "/Script/SGameCombatSystem.BulletEvent_FilterEventActor", {
        SubEvents: array(execution), TagRequirement: { RequireTags: array("Combat.ArbitraryCondition") },
        Trigger: forbidden, Evaluate: forbidden
    });
    const bullet = object("/Renamed/Overlap", { PreAttackEvents: { Events: array(filter) } });
    const a = bulletAction(bullet);
    a.K2_CanActivateAction = forbidden; a.Received_ActionBegin = forbidden; a.IsSingleFrame = forbidden;
    const r = collect(readOnly(timeline([event({ Action: a })])));
    const evidence = r.inventory[0].bulletSignalCandidates, candidate = evidence.candidates[0];
    assert.equal(evidence.candidates.length, 1); assert.equal(evidence.usedForScheduling, false);
    assert.equal(candidate.kind, "execution-capability"); assert.equal(candidate.color, null);
    assert.equal(candidate.conditional, true); assert.equal(candidate.usedForScheduling, false);
    assert.equal(candidate.lifecycle, "PreAttackEvents");
    assert.equal(candidate.timing.coordinateConfirmed, false);
    assert.equal(candidate.route[0].conditions.TagRequirement["/RequireTags/0"],
        "Combat.ArbitraryCondition");
    assert.deepEqual(Object.keys(candidate.route[0].conditions.TagRequirement), ["/RequireTags/0"]);
    assert.equal(r.events.length, 0); assert.equal(r.checks.size, 0); assert.equal(r.contexts.size, 0);
    assert.equal(nativeCalls, 0); assert.equal(writes, 0); assert.equal(loads, 0);
    assert.doesNotThrow(() => JSON.stringify(evidence));
});
test("bullet observation cannot revive retired semantics or change ordinary cue keys timing tags or binding", () => {
    const ability = "/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C";
    const legacy = semanticAction(ability, 3); legacy["Bullet Data"] = redBullet();
    const standard = action("Standard"); standard.BulletData = redBullet();
    standard.ActivationRequirements.RequireTags = ["Combat.Missing"];
    const black = action("Black", object(BLACK_EFFECT_OBJECT)); black.GetClass = () => object(BLACK_ACTION_CLASS);
    black.BulletData = redBullet();
    const extra = bulletAction();
    const tl = timeline([event({ Action: standard, Guid: { A: 1, B: 2, C: 3, D: 4 } }),
        event({ Action: legacy, StartTime: 0.8, duration: 0.5 }), event({ Action: black }), event({ Action: extra })]);
    const context = qishuContext(ability);
    const full = retiredOptionsAdapter.events(tl, classifyEffect, asc, context);
    const compact = retiredOptionsAdapter.events(tl, classifyEffect, asc, context, null, { captureDiagnostics: false });
    assert.equal(full.events.length, 2); assert.deepEqual(scheduling(full), scheduling(compact));
    assert.equal(full.events[0].eligible, false); assert.equal(full.inventory[1].semanticFallback, undefined);
    assert.equal(full.inventory[1].attackSemantics.usedForScheduling, false);
    assert.deepEqual(full.events.map(e => e.color), ["red", "black"]);
    assert(!full.events.some(e => e.key === "main/1"));
    assert.deepEqual([...full.checks.keys()], [...compact.checks.keys()]);
    assert.deepEqual([...full.contexts.entries()], [...compact.contexts.entries()]);
    for (const e of full.events) {
        assert.equal(full.checks.get(e.key), compact.checks.get(e.key));
        assert.equal(e.meta.bulletSignalCandidates.usedForScheduling, false);
    }
    assert.equal(full.inventory[3].bulletSignalCandidates.candidates.length, 1);
    assert(!full.events.some(e => e.key === "main/3"));
});
test("probe factory is created once and probe faults cannot swallow standard cue compilation", () => {
    const probeId = require.resolve("../PBZForewarn/bullet-signal-candidates");
    const adapterId = require.resolve("../PBZForewarn/adapter");
    const probeExports = require.cache[probeId].exports, adapterModule = require.cache[adapterId];
    let factories = 0, probes = 0, local;
    try {
        require.cache[probeId].exports = { createBulletSignalProbe() {
            factories++; return { probe() { probes++; throw Error("diagnostic failure"); } };
        } };
        delete require.cache[adapterId];
        local = require(adapterId).createAdapter(UE, {});
    } finally {
        require.cache[probeId].exports = probeExports; require.cache[adapterId] = adapterModule;
    }
    const tl = timeline([event(), event({ StartTime: 2 })]);
    const compact = local.events(tl, classifyEffect, asc, {}, null, { captureDiagnostics: false });
    assert.equal(factories, 1); assert.equal(probes, 0);
    const full = local.events(tl, classifyEffect, asc, {});
    assert.equal(factories, 1); assert.equal(probes, 2);
    assert.deepEqual(scheduling(full), scheduling(compact)); assert.equal(full.events.length, 2);
    assert.equal(full.checks.size, 2); assert.equal(full.contexts.size, 2);
    assert.equal(full.candidateScanUnresolved, true);
    for (const info of full.inventory) {
        assert.equal(info.reason, "eligible");
        assert.deepEqual(info.bulletSignalCandidates, { status: "unresolved", usedForScheduling: false,
            candidates: [], unresolved: true, limits: {}, issues: ["probe-error"] });
    }
});
test("compile-wide bullet probe budget caps graph reads without dropping main or role cues", () => {
    let bulletReads = 0, graphReads = 0;
    const nodes = Array.from({ length: 40 }, (_, i) => {
        const a = action("Budget" + i), bullet = redBullet("/Budget/" + i);
        const root = bullet.StartEvents;
        Object.defineProperty(a, "BulletData", { get() { bulletReads++; return bullet; } });
        Object.defineProperty(bullet, "StartEvents", { get() { graphReads++; return root; } });
        return event({ Action: a, StartTime: i });
    });
    const role = object("/Budget/Role", { AbilitySystemComponent: asc });
    const tl = timeline(nodes.slice(0, 20), [nodes.slice(20)]), task = { GetRoleActor: () => role };
    const full = adapter.events(tl, classifyEffect, asc, {}, task);
    const compact = adapter.events(tl, classifyEffect, asc, {}, task, { captureDiagnostics: false });
    assert.equal(bulletReads, 32); assert.equal(graphReads, 32);
    assert.equal(full.events.length, 40); assert.deepEqual(scheduling(full), scheduling(compact));
    assert.deepEqual([...full.checks.entries()], [...compact.checks.entries()]);
    assert.deepEqual([...full.contexts.keys()], [...compact.contexts.keys()]);
    for (const [key, context] of full.contexts) {
        for (const field of ["asc", "actor", "roleName", "source", "reason"])
            assert.equal(context[field], compact.contexts.get(key)[field]);
    }
    assert.equal(full.candidateScanUnresolved, true); assert.equal(compact.candidateScanUnresolved, false);
    for (const info of full.inventory.slice(0, 32)) {
        assert.equal(info.bulletSignalCandidates.candidates.length, 1);
        assert.equal(info.bulletSignalCandidates.unresolved, false);
    }
    for (const info of full.inventory.slice(32)) assert.deepEqual(info.bulletSignalCandidates, {
        status: "unresolved", usedForScheduling: false, candidates: [], unresolved: true,
        limits: { maxActions: 32 }, issues: ["timeline-probe-cap"]
    });
});
const DURATION_BULLET_CLASS = "/Script/PBZCombatAsset.LGAAction_DurationBulletWithDeflect";
function genericAdapter() {
    const local = createAdapter(UE, {});
    local.configureGenericAttack(true);
    return local;
}
function genericCollect(local, a, options = { captureDiagnostics: false }, context = {}) {
    return local.events(timeline([event({ Action: a })]), classifyEffect, asc, context, null, options);
}
function grabBulletAction() {
    const payload = object("/Renamed/GrabReaction_C", { GetSuperClass: () => object(GRAB_CLASS) });
    const execution = typedObject("/Renamed/Execution", EXECUTION_EVENT_CLASS, { "Executed Ability": payload });
    return typedObject("/Renamed/GrabAction", DURATION_BULLET_CLASS, { DeflectBulletType: 0,
        BulletData: object("/Renamed/GrabBullet", { PreAttackEvents: { Events: array(execution) } }),
        ActivationRequirements: emptyRequirements() });
}
test("generic preparation defaults on for renamed sources while explicit false leaves ordinary nodes and candidates", () => {
    const a = bulletAction(redBullet("/Renamed/Default/Data"), "/Renamed/Default/Action"), ordinary = action("Ordinary", object(bluePath));
    const tl = timeline([event({ Action: a }), event({ Action: ordinary })]);
    const context = { actor: "/World/RenamedEnemy", ability: "/Renamed/Default/Ability" };
    for (const [options, enabled] of [[undefined, true], [{}, true], [{ genericAttack: true }, true],
        [{ semanticFallback: true, castWarning: true }, true], [{ genericAttack: false }, false]]) {
        const local = createAdapter(UE, {}, null, options);
        for (const captureDiagnostics of [false, true]) {
            const result = local.events(tl, classifyEffect, asc, context, null, { captureDiagnostics });
            assert.deepEqual(result.events.map(e => e.key), enabled ? ["main/0", "main/1"] : ["main/1"]);
            assert.equal(result.events.at(-1).color, "blue");
            assert.equal(result.events.at(-1).meta.recognition.source, "niagara-warning-resource");
            if (enabled) {
                const e = result.events[0];
                assert.equal(e.color, "red"); assert.equal(e.eligible, true);
                assert.equal(e.meta.recognition.source, "bullet-preparation");
                assert.equal(local.bulletWarningEligibility(a, e.meta, asc, e.meta.bulletWarning).eligible, true);
            }
            if (captureDiagnostics) {
                assert.equal(result.inventory[0].bulletSignalCandidates.candidates[0].color, "red");
                assert.equal(result.inventory[0].bulletSignalCandidates.usedForScheduling, false);
                assert.equal(result.inventory[0].attackSemantics.usedForScheduling, false);
            } else assert.deepEqual(result.inventory, []);
        }
    }
});

test("generic preparation produces renamed nested standard cues independently of diagnostics", () => {
    const local = genericAdapter(), a = bulletAction(redBullet("/Renamed/NoBoss/Data"), "/Renamed/NoBoss/Action");
    const tl = timeline([event({ Action: a, StartTime: 2, duration: 0.5, TriggerTimeOffset: -0.1, EndTriggerTimeOffset: 0.03 })]);
    const context = { actor: "/World/Unrelated", ability: "/Renamed/NoBoss/Ability" };
    const compact = local.events(tl, classifyEffect, asc, context, null, { captureDiagnostics: false });
    const full = local.events(tl, classifyEffect, asc, context);
    assert.equal(compact.events.length, 1); assert.deepEqual(scheduling(compact), scheduling(full));
    const e = compact.events[0], proof = e.meta.bulletWarning;
    assert.equal(e.color, "red"); assert.equal(e.start, 1.9); assert.equal(e.end, 2.53);
    assert.equal(e.meta.recognition.source, "bullet-preparation");
    assert.equal(proof.kind, "standard-warning-resource");
    assert.equal(proof.timingBasis, "authored-action-preparation-candidate");
    assert.equal(proof.executionVerified, false); assert.equal(proof.nativeLaunchCoordinateConfirmed, false);
    assert.deepEqual(compact.inventory, []);
    for (const field of ["attackSemantics", "requirementsEvidence", "roleContext", "bulletSignalCandidates"])
        assert.equal(e.meta[field], undefined);
    assert.equal(full.inventory[0].bulletSignalCandidates.usedForScheduling, false);
    assert(full.inventory[0].bulletSignalCandidates.candidates.every(c => c.usedForScheduling === false));
    assert.deepEqual(JSON.parse(JSON.stringify(proof)), proof);
    assert.equal(compact.checks.get(e.key), a); assert.equal(compact.contexts.get(e.key).asc, asc);
});
test("generic CantDeflect grab capability maps to black authored preparation", () => {
    const local = genericAdapter(), a = grabBulletAction(), r = genericCollect(local, a);
    assert.equal(r.events.length, 1); assert.equal(r.events[0].color, "black");
    assert.equal(r.events[0].meta.bulletWarning.kind, "execution-capability");
    assert.equal(r.events[0].meta.bulletWarning.executedAbilityPath, "/Renamed/GrabReaction_C");
    assert.equal(r.events[0].meta.bulletWarning.interpretation, "conditional-grab-capability-risk");
    assert.equal(local.bulletWarningEligibility(a, r.events[0].meta, asc, r.events[0].meta.bulletWarning).eligible, true);
});
test("generic preparation preserves source require ignore and query rejection", () => {
    for (const [field, value, reason] of [["RequireTags", ["Combat.Missing"], "require-tags"],
        ["IgnoreTags", ["Combat.Ready"], "ignore-tags"], ["TagQuery", { required: "Combat.Missing" }, "tag-query"]]) {
        const local = genericAdapter(), a = bulletAction(); a.ActivationRequirements[field] = value;
        const r = genericCollect(local, a);
        assert.equal(r.events.length, 1); assert.equal(r.events[0].eligible, false);
        assert.equal(r.events[0].meta.reason, reason);
    }
});
test("generic preparation never bypasses missing role bindings or role source tags", () => {
    const local = genericAdapter(), a = bulletAction(); a.ActivationRequirements.RequireTags = ["Role.Only"];
    const tl = timeline([], [[event({ Action: a })]]);
    const unbound = local.events(tl, classifyEffect, asc, {}, { GetRoleActor: () => null }, { captureDiagnostics: false });
    assert.equal(unbound.events.length, 0);
    const roleASC = object("/Role/Generic.ASC", { tags: ["Role.Only"] });
    const role = object("/Role/Generic", { AbilitySystemComponent: roleASC });
    const bound = local.events(tl, classifyEffect, asc, {}, { GetRoleActor: () => role }, { captureDiagnostics: false });
    assert.equal(bound.events.length, 1); assert.equal(bound.events[0].eligible, true);
    assert.equal(bound.contexts.get(bound.events[0].key).asc, roleASC);
    assert.equal(bound.events[0].meta.eligibilitySource, "role-binding-asc-assumption");
});
test("generic mode toggles only preparation and never restores retired boss warnings", () => {
    const local = createAdapter(UE, {}, null, { genericAttack: false, semanticFallback: true, castWarning: true });
    const context = qishuContext("/Game/Boss/GA_Qishu_Huo_RoundSkill_FireRing_C");
    const cast = typedObject("/Retired/CastAction",
        "/SGameCombatSystem/Weapon/Action/GAAction_WeaponParticleFrame.GAAction_WeaponParticleFrame_C", {
            NiagaraEffect: object("/PBZVFXPack/VFX/BattleFX/YuZan/NS_YuZan_Warning_AOE_101.NS_YuZan_Warning_AOE_101"),
            ActivationRequirements: emptyRequirements()
        });
    const castContext = { actor: "/World/BP_Monster_FemaleVessel_YuZan_C_1", ability: "/Abilities/GA_YuZan_Skill_03_C_1" };
    const castTimeline = timeline([event({ Action: cast })]); castTimeline.path = castContext.ability + ".Main";
    const standard = action(), candidate = bulletAction();
    const tl = timeline([event({ Action: semanticAction(context.ability, 3) }), event({ Action: candidate }), event({ Action: standard })]);
    for (const enabled of [false, true, false]) {
        local.configureGenericAttack(enabled);
        for (const captureDiagnostics of [false, true]) {
            const r = local.events(tl, classifyEffect, asc, context, null, { captureDiagnostics });
            assert.deepEqual(r.events.map(e => e.key), enabled ? ["main/1", "main/2"] : ["main/2"]);
            assert.equal(r.events.at(-1).meta.recognition.source, "niagara-warning-resource");
            if (enabled) assert.equal(r.events[0].meta.recognition.source, "bullet-preparation");
            for (const e of r.events) {
                assert.equal(e.meta.semanticFallback, undefined); assert.equal(e.meta.castWarning, undefined);
            }
            assert.equal(local.events(castTimeline, classifyEffect, asc, castContext, null, { captureDiagnostics }).events.length, 0);
        }
    }
});
test("generic preparation shares physical node keys dedupe and ordinary priority", () => {
    const local = genericAdapter(), a = bulletAction();
    const e = event({ Action: a, Guid: { A: 7, B: 1, C: 2, D: 3 } }), tl = timeline([e, e]);
    const first = local.events(tl, classifyEffect, asc, {}, null, { captureDiagnostics: false });
    assert.equal(first.events.length, 1); assert.equal(first.checks.size, 1); assert.equal(first.contexts.size, 1);
    a.NiagaraEffect = object(bluePath);
    const ordinary = local.events(tl, classifyEffect, asc, {}, null, { captureDiagnostics: false });
    assert.equal(ordinary.events.length, 1); assert.equal(ordinary.events[0].color, "blue");
    assert.equal(ordinary.events[0].key, first.events[0].key); assert.equal(ordinary.events[0].meta.bulletWarning, undefined);
    assert.equal(ordinary.events[0].meta.recognition.source, "niagara-warning-resource");
});
test("ordinary black recognition remains executable metadata without diagnostic capture", () => {
    const local = genericAdapter(), a = object("/OrdinaryBlack", {
        NiagaraEffect: object(BLACK_EFFECT_OBJECT), ActivationRequirements: emptyRequirements(),
        GetClass: () => object(BLACK_ACTION_CLASS)
    }), tl = timeline([event({ Action: a })]);
    for (const captureDiagnostics of [true, false]) {
        const result = local.events(tl, classifyEffect, asc, {}, null, { captureDiagnostics });
        assert.equal(result.events.length, 1);
        assert.equal(result.events[0].color, "black");
        assert.equal(result.events[0].meta.recognition.source, "power-attack-post-pair");
        assert.equal(result.events[0].meta.recognition.supported, true);
        assert.equal(result.inventory.length, captureDiagnostics ? 1 : 0);
    }
});
test("generic diagnostics off skips unrelated semantic and bullet graph reads", () => {
    const local = genericAdapter(), a = action("NotBullet", null); let reads = 0;
    for (const field of ["DeflectBulletType", "BulletData", "SendFrameTimes", "PreHitPointDuration"])
        Object.defineProperty(a, field, { get() { reads++; throw Error("heavy unrelated read"); } });
    assert.equal(genericCollect(local, a).events.length, 0); assert.equal(reads, 0);
});
test("generic malformed unknown ambiguous and capped graphs fail closed", () => {
    const local = genericAdapter(), malformed = bulletAction(), unknown = bulletAction(), capped = bulletAction(), ambiguous = bulletAction();
    Object.defineProperty(malformed, "BulletData", { get() { throw Error("bridge failed"); } });
    unknown.GetClass = () => object("/Other/GAA_DelayDeflectProjectileBullet_C");
    const effect = redBullet().StartEvents.Events.Get(0);
    capped.BulletData.StartEvents.Events = array(...Array(33).fill(effect));
    ambiguous.BulletData.StartEvents.Events = array(effect, effect);
    for (const a of [malformed, unknown, capped, ambiguous]) assert.equal(genericCollect(local, a).events.length, 0);
});
test("generic selected signal recheck rejects bullet color and runtime mode changes", () => {
    const local = genericAdapter(), a = bulletAction(), r = genericCollect(local, a), e = r.events[0];
    const check = () => local.bulletWarningEligibility(a, e.meta, asc, e.meta.bulletWarning);
    assert.equal(check().eligible, true);
    const original = a.BulletData; a.BulletData = redBullet("/Replacement/Bullet");
    assert.equal(check().eligible, false); a.BulletData = original;
    const signal = original.StartEvents.Events.Get(0), resource = signal.Niagara;
    signal.Niagara = object(bluePath); assert.equal(check().eligible, false); signal.Niagara = resource;
    assert.equal(check().eligible, true); local.configureGenericAttack(false); assert.equal(check().eligible, false);
    assert.equal(loads, 0); assert.equal(writes, 0);
});
test("ordinary actions cannot exhaust the supported preparation candidate budget", () => {
    const local = genericAdapter(), supported = bulletAction();
    const nodes = Array.from({ length: 32 }, (_, i) => event({ Action: action("Ordinary" + i, null) }));
    nodes.push(event({ Action: supported }));
    for (const captureDiagnostics of [false, true]) {
        const r = local.events(timeline(nodes), classifyEffect, asc, {}, null, { captureDiagnostics });
        assert.equal(r.events.length, 1); assert.equal(r.events[0].color, "red");
        assert.equal(r.checks.get(r.events[0].key), supported);
        assert.equal(r.events[0].meta.recognition.source, "bullet-preparation");
    }
});
test("generic compile bounds preparation graph reads and never drops ordinary nodes", () => {
    let reads = 0;
    const nodes = Array.from({ length: 40 }, (_, i) => {
        const a = bulletAction(redBullet("/Budget/Preparation" + i), "/Budget/Action" + i), bullet = a.BulletData;
        Object.defineProperty(a, "BulletData", { get() { reads++; return bullet; } });
        return event({ Action: a });
    });
    nodes.push(event());
    const r = genericAdapter().events(timeline(nodes), classifyEffect, asc, {}, null, { captureDiagnostics: false });
    assert.equal(reads, 32); assert.equal(r.events.length, 33);
    assert.equal(r.events.at(-1).meta.bulletWarning, undefined); assert.equal(r.events.at(-1).color, "red");
});
test("generic factory faults fail closed without swallowing an ordinary warning", () => {
    const warningId = require.resolve("../PBZForewarn/bullet-warning"), adapterId = require.resolve("../PBZForewarn/adapter");
    const warningExports = require.cache[warningId].exports, adapterModule = require.cache[adapterId];
    let factories = 0, calls = 0, local;
    try {
        require.cache[warningId].exports = { ...warningExports, createBulletWarning() {
            factories++; return { plan() { calls++; throw Error("plan bridge failed"); }, eligibility() { throw Error("recheck bridge failed"); } };
        } };
        delete require.cache[adapterId]; local = require(adapterId).createAdapter(UE, {}, null, { genericAttack: true });
    } finally {
        require.cache[warningId].exports = warningExports; require.cache[adapterId] = adapterModule;
    }
    const r = local.events(timeline([event({ Action: bulletAction() }), event()]), classifyEffect, asc, {}, null, { captureDiagnostics: false });
    assert.equal(factories, 1); assert.equal(calls, 1); assert.equal(r.events.length, 1);
    assert.equal(r.events[0].color, "red");
    assert.equal(local.bulletWarningEligibility(bulletAction(), { start: 1, end: 1.2 }, asc, {}).eligible, false);
});
// Independent cooked-asset shape: overlap EffectData particle explicitly selects
// Start (SDK enum 1), not a bullet event. Sanitized paths, no game asset copied.
function lifecycleParticleAction() {
    const particle = { Particle: object("/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Red_001.NS_AttackAlert_Red_001"),
        ActivateMoment: 1 };
    const bullet = typedObject("/Renamed/LifecycleBullet",
        "/PBZCombatAsset/Prototypes/Bullet/BulletData/BP_PBZ_OverlapBulletData.BP_PBZ_OverlapBulletData_C",
        { StartDelay: 0.7, EffectData: { ParticleData: array(particle) } });
    return { a: bulletAction(bullet), particle };
}
test("generic overlap lifecycle Start resource yields authored preparation without inventing delay", () => {
    const local = genericAdapter(), { a } = lifecycleParticleAction();
    const compact = genericCollect(local, a), full = genericCollect(local, a, { captureDiagnostics: true });
    assert.equal(compact.events.length, 1); assert.deepEqual(scheduling(compact), scheduling(full));
    const e = compact.events[0], proof = e.meta.bulletWarning;
    assert.equal(e.color, "red"); assert.equal(e.eligible, true);
    assert.equal(e.start, 1); assert.equal(e.end, 1.2);
    assert.equal(proof.lifecycle, "EffectData.Start");
    assert.equal(proof.timingBasis, "authored-action-preparation-candidate");
    assert.equal(proof.executionVerified, false); assert.equal(proof.nativeLaunchCoordinateConfirmed, false);
    assert.equal(local.bulletWarningEligibility(a, e.meta, asc, proof).eligible, true);
});
test("lifecycle preparation rejects unknown moments ambiguous signals and unproven data classes", () => {
    for (const moment of [undefined, 0, 2, "Start", NaN]) {
        const { a, particle } = lifecycleParticleAction(); particle.ActivateMoment = moment;
        assert.equal(genericCollect(genericAdapter(), a).events.length, 0);
    }
    const { a, particle } = lifecycleParticleAction();
    a.BulletData.EffectData.ParticleData = array(particle, particle);
    assert.equal(genericCollect(genericAdapter(), a).events.length, 0);
    a.BulletData.EffectData.ParticleData = array(particle);
    a.BulletData.StartEvents = redBullet().StartEvents;
    assert.equal(genericCollect(genericAdapter(), a).events.length, 0);
    delete a.BulletData.StartEvents;
    a.BulletData.GetClass = () => object("/Other/Overlap");
    assert.equal(genericCollect(genericAdapter(), a).events.length, 0);
});
test("lifecycle preparation keeps source tags mode bounds and fresh resource proof", () => {
    const local = genericAdapter(), { a, particle } = lifecycleParticleAction();
    const first = genericCollect(local, a).events[0];
    const check = () => local.bulletWarningEligibility(a, first.meta, asc, first.meta.bulletWarning).eligible;
    particle.ActivateMoment = 0; assert.equal(check(), false);
    assert.equal(genericCollect(local, a).events.length, 0);
    particle.ActivateMoment = 1; assert.equal(check(), true);
    const original = particle.Particle;
    particle.Particle = object(bluePath); assert.equal(check(), false);
    particle.Particle = original;
    a.ActivationRequirements.RequireTags = ["Combat.Missing"];
    assert.equal(genericCollect(local, a).events[0].eligible, false);
    a.ActivationRequirements = emptyRequirements();
    a.BulletData.EffectData.ParticleData = array(...Array(33).fill(particle));
    assert.equal(genericCollect(local, a).events.length, 0);
    a.BulletData.EffectData.ParticleData = array(particle);
    local.configureGenericAttack(false); assert.equal(genericCollect(local, a).events.length, 0);
    assert.equal(loads, 0); assert.equal(writes, 0);
});
console.log("Adapter mock tests: " + passed + " passed. No game launched; no gameplay writes; no synchronous loads.");
