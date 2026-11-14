"use strict";

// One supplementary cast warning, not a classification of every spell or a
// prediction that its later control/Success branch will happen. No UE access.
const RULE = Object.freeze({
    id: "yuzan-skill03-cast",
    actorClass: "bp_monster_femalevessel_yuzan_c",
    abilityClass: "ga_yuzan_skill_03_c",
    actionClass: "/SGameCombatSystem/Weapon/Action/GAAction_WeaponParticleFrame.GAAction_WeaponParticleFrame_C",
    effectPath: "/PBZVFXPack/VFX/BattleFX/YuZan/NS_YuZan_Warning_AOE_101.NS_YuZan_Warning_AOE_101",
    color: "black", phase: "cast",
    timingBasis: "cast-warning-resource-plan",
    interpretation: "dangerous-cast-starting-not-guaranteed-control-or-success"
});
function clean(value) {
    return typeof value === "string" ? value.trim().replace(/\\/g, "/").toLowerCase() : "";
}
function leaf(value) {
    const v = clean(value);
    return v.slice(Math.max(v.lastIndexOf("/"), v.lastIndexOf(".")) + 1);
}
function instance(value, name) {
    const v = leaf(value);
    return v === name || v.replace(/_\d+$/, "") === name;
}
function matchCastWarning(input = {}) {
    // Require this ability's own Main object, not an unrelated .Main path or a
    // role-layer binding. A suffix or directory containing the name won't match.
    const ability = clean(input.ability), timeline = clean(input.timeline);
    if (input.layer !== "main" || !instance(input.actor, RULE.actorClass) ||
        !instance(ability, RULE.abilityClass) || !ability || timeline !== ability + ".main" ||
        clean(input.actionClass) !== clean(RULE.actionClass) || clean(input.effectPath) !== clean(RULE.effectPath)) return null;
    return RULE;
}
module.exports = { RULE, matchCastWarning };
