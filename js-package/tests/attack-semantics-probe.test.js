"use strict";
const assert = require("assert");
const { probeAttackSemantics } = require("../PBZForewarn/attack-semantics-probe");
let count = 0;
function test(name, run) { run(); count++; console.log("PASS " + name); }
function readonly(object) {
    return new Proxy(object, {
        set() { throw Error("unexpected write"); },
        deleteProperty() { throw Error("unexpected delete"); },
        defineProperty() { throw Error("unexpected definition"); }
    });
}
test("native reflected enum values retain distinct SDK names", () => {
    const names = ["CantDeflect", "Normal", "BlueEye", "RedEye", "PowerAttack", "HoldDeflect"];
    names.forEach((name, value) => {
        const result = probeAttackSemantics(readonly({ DeflectBulletType: value }));
        assert.equal(result.deflect.value, value); assert.equal(result.deflect.name, name);
        assert.equal(result.deflect.field, "DeflectBulletType"); assert.equal(result.deflect.conflict, false);
        assert.equal(Object.hasOwn(result, "color"), false); assert.equal(Object.hasOwn(result, "cue"), false);
    });
});
test("blueprint property with spaces is a supported fallback", () => {
    const result = probeAttackSemantics(readonly({ "Deflect Bullet Type": 3 }));
    assert.equal(result.deflect.name, "RedEye"); assert.equal(result.deflect.field, "Deflect Bullet Type");
});
test("bullet-burst DeflectType is a supported independent field", () => {
    const result = probeAttackSemantics(readonly({ DeflectType: 2 }));
    assert.equal(result.deflect.name, "BlueEye"); assert.equal(result.deflect.field, "DeflectType");
});
test("unknown enum and sentinel remain visible without invented classification", () => {
    assert.equal(probeAttackSemantics({ DeflectType: 99 }).deflect.name, null);
    assert.equal(probeAttackSemantics({ DeflectType: 6 }).deflect.name, "EDeflectBulletType_MAX");
    assert.equal(probeAttackSemantics({ DeflectType: -1 }).deflect.name, null);
    assert.equal(probeAttackSemantics({ DeflectType: 2.5 }).deflect.name, null);
});
test("disagreeing fields retain all candidates and set conflict", () => {
    const result = probeAttackSemantics({ DeflectBulletType: 4, "Deflect Bullet Type": 3, DeflectType: 2 });
    assert.equal(result.deflect.name, "PowerAttack"); assert.equal(result.deflect.conflict, true);
    assert.deepEqual(result.deflect.candidates.map(x => x.value), [4, 3, 2]);
});
test("throwing missing reflected properties do not abort a readable fallback", () => {
    const action = new Proxy({ "Deflect Bullet Type": 2 }, { get(target, key) {
        if (key in target) return target[key]; throw Error("unknown reflected property");
    } });
    const result = probeAttackSemantics(action);
    assert.equal(result.deflect.name, "BlueEye"); assert.equal(result.deflect.candidates[0].status, "unreadable");
});
test("numeric strings and nonfinite timing are not coerced", () => {
    const result = probeAttackSemantics({ DeflectBulletType: "3", PreHitPointDuration: NaN, RuntimePreHitPointDuration: Infinity, BulletDuration: "0.5" });
    assert.equal(result.deflect.value, null);
    assert.equal(result.timing.PreHitPointDuration.status, "not-finite-number");
    assert.equal(result.timing.RuntimePreHitPointDuration.status, "not-finite-number");
    assert.equal(result.timing.BulletDuration.status, "not-finite-number");
});
test("timing data stays raw without assumptions about relative or absolute units", () => {
    const result = probeAttackSemantics(readonly({ PreHitPointDuration: -0.2, RuntimePreHitPointDuration: 0.3, BulletDuration: 0.6 }));
    assert.equal(result.timing.PreHitPointDuration.value, -0.2);
    assert.equal(result.timing.RuntimePreHitPointDuration.value, 0.3);
    assert.equal(result.timing.BulletDuration.value, 0.6);
});
test("ordinary arrays and reflected TArrays preserve ordering and cap at 64", () => {
    let maxRead = -1;
    const tarray = readonly({ Num() { return 80; }, Get(i) { maxRead = Math.max(maxRead, i); return i / 10; } });
    const result = probeAttackSemantics(readonly({ SendFrameTimes: readonly([0.1, 0.2]), StartBulletTimes: tarray, EndBulletTimes: [] }));
    assert.deepEqual(result.arrays.SendFrameTimes.values, [0.1, 0.2]);
    assert.equal(result.arrays.StartBulletTimes.values.length, 64); assert.equal(maxRead, 63);
    assert.equal(result.arrays.StartBulletTimes.length, 80); assert.equal(result.arrays.StartBulletTimes.truncated, true);
    assert.equal(result.arrays.EndBulletTimes.length, 0);
});
test("array errors retain indices without fabricating timing", () => {
    const result = probeAttackSemantics({ SendFrameTimes: [0.1, "0.2", NaN], StartBulletTimes: { Num: () => 2, Get: i => {
        if (i === 1) throw Error("read error"); return 0;
    } } });
    assert.deepEqual(result.arrays.SendFrameTimes.values, [0.1, null, null]);
    assert.deepEqual(result.arrays.SendFrameTimes.invalidIndices, [1, 2]);
    assert.deepEqual(result.arrays.StartBulletTimes.values, [0, null]);
    assert.deepEqual(result.arrays.StartBulletTimes.unreadableIndices, [1]);
});
test("invalid or throwing TArray lengths are bounded and contained", () => {
    assert.equal(probeAttackSemantics({ SendFrameTimes: { Num: () => -1, Get() { throw Error("must not get"); } } }).arrays.SendFrameTimes.status, "invalid-length");
    assert.equal(probeAttackSemantics({ SendFrameTimes: { Num() { throw Error("bad count"); }, Get() {} } }).arrays.SendFrameTimes.status, "unreadable-length");
    assert.equal(probeAttackSemantics({ SendFrameTimes: {} }).arrays.SendFrameTimes.status, "not-array");
    const brokenArray = new Proxy([], { get(target, key) { if (key === "length") throw Error("no length"); return target[key]; } });
    assert.equal(probeAttackSemantics({ SendFrameTimes: brokenArray }).arrays.SendFrameTimes.status, "unreadable-length");
});
test("no execution or loading methods are called or even read", () => {
    let executed = false;
    const action = readonly({ DeflectBulletType: 4, Received_ActionBegin() { executed = true; },
        LoadSynchronous() { executed = true; }, RequestLockTarget() { executed = true; },
        SendDeflectFrame() { executed = true; }, GetEffectiveBulletData() { executed = true; } });
    const result = probeAttackSemantics(action);
    assert.equal(result.deflect.name, "PowerAttack"); assert.equal(executed, false);
    const guarded = new Proxy(action, { get(target, key) {
        assert(!/Begin|Load|Request|SendDeflect|GetEffective/.test(String(key))); return target[key];
    } });
    assert.equal(probeAttackSemantics(guarded).deflect.name, "PowerAttack");
});
test("null and undefined inputs produce empty diagnostics without throwing", () => {
    for (const input of [null, undefined]) {
        const result = probeAttackSemantics(input); assert.equal(result.deflect.value, null);
        assert.equal(result.deflect.conflict, false); assert.equal(result.arrays.SendFrameTimes.status, "missing");
        assert.doesNotThrow(() => JSON.stringify(result));
    }
});
console.log("RESULT " + count + " read-only probe scenarios passed; Unreal objects are mocked, no game access.");
