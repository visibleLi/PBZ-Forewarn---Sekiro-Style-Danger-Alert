"use strict";
// Regenerates the gold snapshot used by src/js/tests/generic-attack-gold.test.js.
//
// Run this ONLY when a classification change is intentional, and say why in the
// commit message. The snapshot records current behaviour, not ground truth.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const fixture = path.join(root, "src/js/tests/fixtures/trial1-generic-attack-evidence.json");
const target = path.join(root, "src/js/tests/fixtures/trial1-generic-attack-evidence.gold.json");
const { classifyGenericAttack, matchGenericEvidencePolicy } = require(path.join(root, "src/js/PBZForewarn/generic-attack"));

const evidence = JSON.parse(fs.readFileSync(fixture, "utf8").replace(/^\uFEFF/, ""));
const rows = evidence.items.map((item, index) => {
    const classification = classifyGenericAttack({
        semantics: { deflect: { value: item.typeValue, name: item.typeName, conflict: item.typeConflict } }
    });
    const policy = matchGenericEvidencePolicy({ actionClass: item.actionClass });
    return {
        index,
        kind: item.kind || null,
        color: classification ? classification.color : null,
        typeName: classification ? classification.typeName : null,
        evidencePolicy: policy ? policy.id : null,
        timingBasis: policy ? policy.timingBasis : null,
        cueEnabled: policy ? policy.cueEnabled : null
    };
});
const gold = {
    note: "Generated from the current implementation. This records observed behaviour, not verified ground truth; see generic-attack-gold.test.js.",
    source: "trial1-generic-attack-evidence.json",
    build: evidence.build,
    rows
};
fs.writeFileSync(target, JSON.stringify(gold, null, 1) + "\n");
console.log(`wrote ${rows.length} rows to ${path.relative(root, target)}`);
