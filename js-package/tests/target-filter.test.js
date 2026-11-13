"use strict";
const assert = require("assert");
const { createTargetFilter } = require("../PBZForewarn/target-filter");
let passed = 0;
function test(name, body) { body(); passed++; console.log("PASS " + name); }
function fixture() {
    const e = { reads: [], diagnostics: [], exact: true, child: false, hasTarget: true, soft: false, cameraEnabled: true };
    const obj = (key, props) => Object.assign({ key, valid: true }, props || {});
    e.target = obj("/World/EnemyA"); e.other = obj("/World/EnemyB");
    e.targetComponent = obj("/World/EnemyA/Mesh", { GetOwner: () => e.target });
    e.socket = { Component: e.targetComponent, SocketName: "head" };
    e.cameraComponent = obj("/World/EnemyA/LockPoint", { GetOwner: () => e.cameraTarget || e.target });
    e.camera = obj("/World/Player/Camera", { GetCurrentLockComponent() { e.reads.push("camera-lock"); return e.cameraComponent; } });
    e.tag = { TagName: "ActualGame.ConfiguredLockState" };
    e.softClass = obj("/Script/SGameCombatSystem.TargetingHandler_PlayerSoftLock");
    e.handlerClass = obj("/Game/Targeting/CombatHandler_C");
    e.actorState = obj("/World/Player/State", {
        InExactState(tag) { assert.strictEqual(tag, e.tag); e.reads.push("state-exact"); return e.exact; },
        InChildState(tag) { assert.strictEqual(tag, e.tag); e.reads.push("state-child"); return e.child; }
    });
    e.config = obj("/Config/Global", { GetTargetingLockStateTag() { e.reads.push("config-tag"); return e.tag; } });
    const noMutation = name => () => { throw Error("FORBIDDEN mutation/selection " + name); };
    e.targeting = obj("/World/Player/Targeting", {
        GlobalConfig: e.config, ActorState: e.actorState,
        CurrentHandler: obj("/World/Player/Handler", { GetClass: () => e.handlerClass }),
        HasLockTarget() { e.reads.push("has-lock"); return e.hasTarget; },
        GetLockTarget(ref) { assert(ref && ref.value instanceof ComponentSocket); e.reads.push("get-lock-out"); ref.value = e.socket; },
        FindTarget: noMutation("FindTarget"), SetLockTarget: noMutation("SetLockTarget"),
        TryLockTarget: noMutation("TryLockTarget"), StopLockTarget: noMutation("StopLockTarget")
    });
    e.asc = obj("/World/Player/ASC", { HasMatchingGameplayTag(tag) { assert.strictEqual(tag, e.tag); e.reads.push("asc-state"); return e.ascLocked === undefined ? e.exact : e.ascLocked; } });
    e.player = obj("/World/Player", {
        AbilitySystemComponent: e.asc, NBCamera: e.camera,
        GetTargetingComponent() { e.reads.push("holder"); return e.targeting; },
        GetTargetingGlobalConfig: () => e.config,
        GetActorStateComponent: () => e.actorState,
        GetComponentByClass(type) { e.reads.push("component:" + type); return type === "targeting-class" ? e.targeting : e.cameraEnabled ? e.camera : null; }
    });
    function ComponentSocket() { this.Component = null; this.SocketName = ""; }
    e.UE = {
        ComponentSocket, TargetingComponent: { StaticClass: () => "targeting-class" },
        NBCameraComponent: { StaticClass: () => "camera-class" },
        TargetingHandler_PlayerSoftLock: { StaticClass: () => e.softClass },
        ComponentSocketHelper: { GetActor(socket) { assert.strictEqual(socket, e.socket); e.reads.push("socket-actor"); return socket.Component.GetOwner(); } },
        KismetMathLibrary: { ClassIsChildOf(actual, base) { assert.strictEqual(actual, e.handlerClass); assert.strictEqual(base, e.softClass); return e.soft; } },
        BlueprintGameplayTagLibrary: { IsGameplayTagValid: t => !!t && typeof t.TagName === "string" && t.TagName.length > 0, GetTagName: t => t.TagName }
    };
    e.puerts = { $ref: value => ({ value }), $unref: ref => ref.value };
    e.adapter = { valid: o => !!o && o.valid === true, path: o => o.key || "" };
    e.filter = createTargetFilter(e.UE, e.puerts, e.adapter, (kind, data) => e.diagnostics.push({ kind, ...data }));
    e.read = enabled => e.filter.read(e.player, enabled === undefined ? true : enabled);
    return e;
}
function denied(e, status, reason) {
    const state = e.read(); assert.equal(state.mode, "locked"); assert.equal(state.status, status);
    assert.equal(state.reason, reason); assert.equal(state.target, null); assert.equal(state.key, "");
    assert.equal(e.filter.allows(e.target, state), false); return state;
}

test("default nearby mode performs no Unreal reads and bypasses lock filtering", () => {
    const e = fixture(); const state = e.filter.read(null);
    assert.deepEqual(state, { mode: "nearby", target: null, key: "", status: "bypass", reason: "only-locked-target-disabled" });
    assert.equal(e.filter.allows(e.other, state), true); assert.deepEqual(e.reads, []);
});
test("confirmed game lock returns actor identity through OUT ComponentSocket", () => {
    const e = fixture(), state = e.read();
    assert.equal(state.status, "locked"); assert.strictEqual(state.target, e.target); assert.equal(state.key, e.target.key);
    assert(e.reads.includes("get-lock-out")); assert(e.reads.includes("socket-actor"));
    assert.equal(e.filter.allows(e.target, state), true); assert.equal(e.filter.allows(e.other, state), false);
});
test("current child lock state is accepted using the configured tag", () => {
    const e = fixture(); e.exact = false; e.child = true;
    assert.equal(e.read().status, "locked"); assert(e.reads.includes("state-child"));
    assert.equal(e.diagnostics[0].lockStateTag, "ActualGame.ConfiguredLockState");
});
test("manual unlock suppresses both the old target and camera soft focus", () => {
    const e = fixture(); assert.equal(e.read().status, "locked"); e.hasTarget = false;
    denied(e, "unlocked", "no-lock-target");
});
test("soft selection with target and camera but no configured lock state is rejected", () => {
    const e = fixture(); e.exact = false; denied(e, "soft-lock", "target-present-without-lock-state");
    assert(!e.reads.includes("get-lock-out"));
});
test("soft handler is rejected even while a stale lock-state tag remains", () => {
    const e = fixture(); e.soft = true; denied(e, "soft-lock", "soft-targeting-handler");
});
test("target reselection takes effect immediately without keeping the old actor", () => {
    const e = fixture(), first = e.read(); e.target = e.other;
    const next = e.read(); assert.equal(next.status, "locked"); assert.notEqual(first.key, next.key);
    assert.equal(e.filter.allows(first.target, next), false); assert.equal(e.filter.allows(e.other, next), true);
});
test("camera and targeting disagreement is closed during target switching", () => {
    const e = fixture(); e.cameraTarget = e.other; denied(e, "ambiguous", "camera-target-mismatch");
    e.cameraTarget = e.target; assert.equal(e.read().status, "locked");
});
test("camera-only lock never substitutes for targeting component evidence", () => {
    const e = fixture(); e.targeting.valid = false; denied(e, "unavailable", "targeting-component-unavailable");
});
test("absent optional camera permits independently confirmed state and target", () => {
    const e = fixture(); e.player.NBCamera = null; e.cameraEnabled = false;
    assert.equal(e.read().status, "locked"); assert.equal(e.diagnostics[0].cameraTarget, "unavailable-optional");
});
test("readable camera without a live lock component waits for agreement", () => {
    const e = fixture(); e.cameraComponent = null; denied(e, "ambiguous", "camera-lock-not-ready");
});
test("destroyed target component is rejected", () => {
    const e = fixture(); e.targetComponent.valid = false; denied(e, "invalid-target", "target-component-invalid");
});
test("destroyed target actor is rejected and previous state cannot authorize it", () => {
    const e = fixture(), previous = e.read(); e.target.valid = false;
    denied(e, "invalid-target", "target-actor-invalid"); assert.equal(e.filter.allows(e.target, previous), false);
});
test("self targeting is rejected", () => {
    const e = fixture(); e.target = e.player; denied(e, "invalid-target", "target-is-player");
});
test("actor without stable identity cannot authorize other actors", () => {
    const e = fixture(); e.target.key = ""; denied(e, "invalid-target", "target-actor-invalid");
});
test("targeting holder absence uses the reflected component query", () => {
    const e = fixture(); delete e.player.GetTargetingComponent; assert.equal(e.read().status, "locked");
    assert(e.reads.includes("component:targeting-class")); assert.equal(e.diagnostics[0].targetingSource, "component");
});
test("global config holder fallback provides the actual lock state tag", () => {
    const e = fixture(); e.targeting.GlobalConfig = null; assert.equal(e.read().status, "locked");
    assert.equal(e.diagnostics[0].configSource, "holder-global-config");
});
test("unavailable config fails closed without guessing a gameplay tag", () => {
    const e = fixture(); e.config.valid = false; denied(e, "unavailable", "lock-state-config-unavailable");
});
test("invalid configured lock tag fails closed", () => {
    const e = fixture(); e.tag.TagName = ""; denied(e, "unavailable", "lock-state-tag-unavailable");
});
test("ASC fallback is used only when the actor-state reader is absent", () => {
    const e = fixture(); e.actorState.valid = false; assert.equal(e.read().status, "locked");
    assert(e.reads.includes("asc-state")); assert.equal(e.diagnostics[0].stateSource, "player-asc");
});
test("negative authoritative actor state is not overridden by a stale ASC tag", () => {
    const e = fixture(); e.exact = false; e.ascLocked = true;
    denied(e, "soft-lock", "target-present-without-lock-state"); assert(!e.reads.includes("asc-state"));
});
test("state read exception does not fall back to a possibly stale ASC tag", () => {
    const e = fixture(); e.actorState.InExactState = () => { throw Error("stale state"); };
    denied(e, "unavailable", "lock-state-unreadable"); assert(!e.reads.includes("asc-state"));
});
test("unknown handler ancestry cannot be called hard lock", () => {
    const e = fixture(); e.UE.KismetMathLibrary.ClassIsChildOf = () => undefined;
    denied(e, "unavailable", "handler-kind-unreadable");
});
test("missing handler cannot be called hard lock", () => {
    const e = fixture(); e.targeting.CurrentHandler = null; denied(e, "unavailable", "handler-kind-unavailable");
});
test("GetLockTarget exception is contained and cannot reuse a prior target", () => {
    const e = fixture(); assert.equal(e.read().status, "locked");
    e.targeting.GetLockTarget = () => { throw Error("stale component"); }; denied(e, "unavailable", "lock-target-unreadable");
});
test("non-boolean HasLockTarget cannot accidentally enable filtering", () => {
    const e = fixture(); e.hasTarget = 1; denied(e, "unavailable", "lock-presence-unreadable");
});
test("missing player fails closed", () => {
    const e = fixture(); e.player.valid = false; denied(e, "unavailable", "player-unavailable");
});
test("camera exception cannot escape the main game tick", () => {
    const e = fixture(); e.camera.GetCurrentLockComponent = () => { throw Error("unavailable"); };
    denied(e, "unavailable", "camera-lock-unreadable");
});
test("diagnostics emit changes once, including target reselection", () => {
    const e = fixture(); e.read(); e.read(); assert.equal(e.diagnostics.length, 1);
    e.target = e.other; e.read(); assert.equal(e.diagnostics.length, 2);
    e.hasTarget = false; e.read(); e.read(); assert.equal(e.diagnostics.length, 3);
});
test("diagnostic errors cannot change filter behavior", () => {
    const e = fixture(); const filter = createTargetFilter(e.UE, e.puerts, e.adapter, () => { throw Error("sink failed"); });
    assert.equal(filter.read(e.player, true).status, "locked");
});
test("default bypass after disabling immediately clears stale target identity", () => {
    const e = fixture(); e.read(); const state = e.read(false);
    assert.equal(state.status, "bypass"); assert.equal(state.target, null); assert.equal(state.key, "");
    assert.equal(e.filter.allows(e.other, state), true);
});
test("missing or malformed state cannot authorize an actor", () => {
    const e = fixture(); assert.equal(e.filter.allows(e.target, null), false);
    assert.equal(e.filter.allows(e.target, { mode: "locked", status: "locked", key: e.target.key }), false);
});
console.log("Target filter: " + passed + " tests passed. Unreal APIs are mocked; manual-input semantics require in-game validation.");
