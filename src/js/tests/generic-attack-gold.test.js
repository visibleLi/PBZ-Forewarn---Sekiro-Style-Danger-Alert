"use strict";
// Regression guard for the generic-attack classifier against real in-game frames.
//
// IMPORTANT: the gold file records what the current implementation produces on
// the frames captured during the trial.1 session. It is a behaviour snapshot,
// not verified ground truth: nobody has confirmed that every classification
// below is the right answer for that frame. Its only job is to make an
// unintended change in classification visible, so a deliberate change must also
// regenerate the snapshot:
//
//     node tools/regen-gold.js
//
// A failure here means "classification changed", not "the code is now wrong".
const assert = require("node:assert/strict");
const {
    classifyGenericAttack, matchGenericEvidencePolicy
} = require("../PBZForewarn/generic-attack");

const evidence = require("./fixtures/trial1-generic-attack-evidence.json");
const gold = require("./fixtures/trial1-generic-attack-evidence.gold.json");

let checks = 0;
function test(name, run) {
    run(); checks++; console.log("PASS " + name);
}

function classify(item) {
    const classification = classifyGenericAttack({
        semantics: { deflect: { value: item.typeValue, name: item.typeName, conflict: item.typeConflict } }
    });
    const policy = matchGenericEvidencePolicy({ actionClass: item.actionClass });
    return {
        color: classification ? classification.color : null,
        typeName: classification ? classification.typeName : null,
        evidencePolicy: policy ? policy.id : null,
        timingBasis: policy ? policy.timingBasis : null,
        cueEnabled: policy ? policy.cueEnabled : null
    };
}

test("gold snapshot covers every captured frame, in order", () => {
    assert.equal(gold.rows.length, evidence.items.length);
    gold.rows.forEach((row, index) => assert.equal(row.index, index));
});

test("gold snapshot came from the same game build as the evidence", () => {
    assert.equal(gold.build, evidence.build);
    assert.equal(gold.source, "trial1-generic-attack-evidence.json");
});

test("every captured frame classifies exactly as the gold snapshot records", () => {
    const mismatches = [];
    evidence.items.forEach((item, index) => {
        const actual = classify(item);
        const expected = gold.rows[index];
        for (const key of ["color", "typeName", "evidencePolicy", "timingBasis", "cueEnabled"]) {
            if (actual[key] !== expected[key]) {
                mismatches.push(`frame ${index} ${key}: gold=${JSON.stringify(expected[key])} actual=${JSON.stringify(actual[key])}`);
            }
        }
    });
    assert.deepEqual(mismatches, []);
});

test("a colour is only produced from a non-conflicting 2 or 3 type value", () => {
    for (const item of evidence.items) {
        const result = classify(item);
        if (result.color === null) continue;
        assert.equal(item.typeConflict, false);
        assert.ok(item.typeValue === 2 || item.typeValue === 3);
        assert.ok(result.color === "red" || result.color === "blue");
    }
});

test("the captured set actually exercises both a red and a blue frame", () => {
    // Guards against a silently empty fixture: if this fails, the evidence file
    // stopped containing the cases the classifier was written for.
    const colours = new Set(evidence.items.map(item => classify(item).color).filter(Boolean));
    assert.deepEqual([...colours].sort(), ["blue", "red"]);
});

test("no captured frame is eligible for a generic cue", () => {
    // ACTION_TIMING_POLICIES is intentionally empty until an action's timing is
    // correlated in-game, so nothing may become cued merely because its type is known.
    for (const item of evidence.items) {
        const policy = matchGenericEvidencePolicy({ actionClass: item.actionClass });
        if (policy) assert.equal(policy.cueEnabled, false);
    }
});

console.log(`RESULT ${checks} checks passed against ${evidence.items.length} captured frames`);
