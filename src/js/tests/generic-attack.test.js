"use strict";

const assert = require("node:assert/strict");
const {
    classifyGenericAttack, matchGenericTimingPolicy, matchGenericEvidencePolicy,
    planGenericAttack, ACTION_TIMING_POLICIES, EVIDENCE_POLICIES
} = require("../PBZForewarn/generic-attack");
let passed = 0;
function test(name, run) {
    try { run(); passed++; console.log("PASS " + name); }
    catch (error) { console.error("FAIL " + name); throw error; }
}
const semantics = (value, name, conflict = false) => ({ deflect: { value, name, conflict } });

test("only unambiguous BlueEye and RedEye classifications map to a colour", () => {
    assert.deepEqual(classifyGenericAttack({ semantics: semantics(3, "RedEye") }),
        { color: "red", typeValue: 3, typeName: "RedEye", typeClass: "deflect" });
    assert.deepEqual(classifyGenericAttack({ semantics: semantics(2, "BlueEye") }),
        { color: "blue", typeValue: 2, typeName: "BlueEye", typeClass: "deflect" });
    for (const input of [
        semantics(0, "CantDeflect"), semantics(1, "Normal"), semantics(4, "PowerAttack"),
        semantics(3, "BlueEye"), semantics(2, "RedEye"), semantics(3, "RedEye", true),
        semantics("3", "RedEye"), semantics(3, null, null)
    ]) assert.equal(classifyGenericAttack({ semantics: input }), null);
});

test("no timing policy is enabled without an in-game verified action class", () => {
    assert.deepEqual(ACTION_TIMING_POLICIES, {});
    assert.equal(matchGenericTimingPolicy({ actionClass:
        "/PBZDeflectSystem/Actions/GAA_DelayDeflectProjectileBullet.GAA_DelayDeflectProjectileBullet_C" }), null);
    assert.equal(matchGenericTimingPolicy({ actionClass:
        "/Script/PBZCombatAsset.LGAAction_DurationBulletWithDeflect" }), null);
});
test("generic cue planning fails closed until a timing policy is explicitly registered", () => {
    assert.deepEqual(ACTION_TIMING_POLICIES, {});
    assert.equal(planGenericAttack({
        actionClass: "/PBZDeflectSystem/Actions/GAA_DelayDeflectProjectileBullet.GAA_DelayDeflectProjectileBullet_C",
        semantics: semantics(3, "RedEye"), times: { start: 1, end: 1.2 }
    }), null);
});
test("generic planning respects standard-resource precedence and invalid windows", () => {
    // No policy is currently registered, so each input is rejected before a
    // timing window can accidentally schedule a cue.
    for (const standardRecognition of [true, false]) assert.equal(planGenericAttack({
        actionClass: "/unregistered", standardRecognition, semantics: semantics(3, "RedEye"),
        times: standardRecognition ? { start: 1, end: 0 } : { start: 1, end: 1.2 }
    }), null);
});
test("duration-bullet evidence policy collects timing without enabling a cue", () => {
    const policy = matchGenericEvidencePolicy({
        actionClass: "/Script/PBZCombatAsset.LGAAction_DurationBulletWithDeflect"
    });
    assert.equal(policy.id, "duration-bullet-observe");
    assert.equal(policy.cueEnabled, false);
    assert.deepEqual(policy.nativeTimingFields,
        ["PreHitPointDuration", "RuntimePreHitPointDuration", "BulletDuration"]);
    assert.deepEqual(EVIDENCE_POLICIES[policy.actionClass].nativeTimingFields, policy.nativeTimingFields);
    assert.equal(matchGenericEvidencePolicy({ actionClass:
        "/Script/PBZCombatAsset.LGAAction_DurationBulletWithDeflect_Unrelated" }), null);
});

console.log("Generic attack tests: " + passed + " passed. No game access.");
