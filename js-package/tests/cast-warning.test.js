"use strict";
const assert = require("node:assert/strict");
const { RULE, matchCastWarning } = require("../PBZForewarn/cast-warning");
let passed = 0;
function test(name, run) { run(); passed++; console.log("PASS " + name); }
const ability = "/World/Enemy.GA_YuZan_Skill_03_C_42";
const input = { actor: "/World/BP_Monster_FemaleVessel_YuZan_C_17", ability, timeline: ability + ".Main",
    actionClass: RULE.actionClass, effectPath: RULE.effectPath, layer: "main" };
test("exact YuZan cast scope returns a supplementary danger rule rather than an enum classification", () => {
    assert.equal(matchCastWarning(input), RULE);
    assert.equal(RULE.color, "black"); assert.equal(RULE.phase, "cast");
    assert.equal(RULE.timingBasis, "cast-warning-resource-plan");
    assert(!("typeValue" in RULE));
    assert.equal(matchCastWarning({ ...input, actor: "/World/" + RULE.actorClass }), RULE);
});
test("wrong actors abilities resources classes and role layers fail closed", () => {
    const bad = [
        { actor: input.actor + "_lookalike" }, { actor: "/World/BP_Monster_Other_C_1" },
        { actor: "/" + RULE.actorClass + "/Other_C_1" },
        { ability: ability + "_Extra", timeline: ability + "_Extra.Main" },
        { timeline: ability + ".Success" }, { timeline: "/Other.Main" },
        { timeline: ability + "2.Main" }, { layer: "role0" },
        { actionClass: RULE.actionClass + "_Other" }, { effectPath: RULE.effectPath + "_Other" },
        { effectPath: RULE.effectPath.split(".")[0] }, { effectPath: RULE.effectPath.replaceAll("AOE", "Big") },
        { effectPath: "" }, { ability: "" }, { actor: null }
    ];
    for (const changed of bad) assert.equal(matchCastWarning({ ...input, ...changed }), null, JSON.stringify(changed));
});
test("normalization preserves full scope without substring matches", () => {
    const normalized = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v.toUpperCase().replaceAll("/", "\\")]));
    normalized.layer = "main";
    assert.equal(matchCastWarning(normalized), RULE);
    assert.equal(matchCastWarning(), null);
});
test("sanitized live fixture matches the scoped rule without claiming control or assuming tag conditions", () => {
    const p = require('./fixtures/yuzan-cast-plan.json');
    const ability = '/Fixture/' + p.actorClass + '_1.' + p.abilityClass + '_1';
    assert.equal(matchCastWarning({ actor: '/Fixture/' + p.actorClass + '_1', ability,
        timeline: ability + '.' + p.timeline, actionClass: p.actionClass, effectPath: p.effectPath, layer: 'main' }), RULE);
    assert.equal(p.start, p.end); assert.equal(p.requirementsCaptured, false);
});
console.log("Cast rule: " + passed + " scenarios passed; no game execution.");
