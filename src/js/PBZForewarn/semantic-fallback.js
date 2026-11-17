"use strict";

// Narrow, evidence-backed fallback rules. A DeflectBulletType value alone is
// never enough: actor, ability, action class and a non-conflicting type must all
// match. This module never reads or writes game objects.
const RULES = Object.freeze([
    Object.freeze({
        id: "qishu-round-fire-ring",
        testedBuild: "26367565",
        actorClass: "bp_monster_qishu_huo_c",
        abilityClass: "ga_qishu_huo_roundskill_firering_c",
        actionClass: "gaa_delaydeflectprojectilebullet_c",
        typeValue: 3,
        typeName: "RedEye",
        color: "red",
        timingBasis: "timeline-action-start",
        interpretation: "supplementary-red-warning; plan timing not confirmed impact"
    }),
    Object.freeze({
        id: "qishu-assault-end",
        testedBuild: "26367565",
        actorClass: "bp_monster_qishu_huo_c",
        abilityClass: "ga_qishu_huo_skillattack_f_assaultend_c",
        actionClass: "gaa_delaydeflectprojectilebullet_c",
        typeValue: 3,
        typeName: "RedEye",
        color: "red",
        timingBasis: "timeline-action-start",
        interpretation: "supplementary-red-warning; plan timing not confirmed impact"
    })
]);

function clean(value) {
    return typeof value === "string" ? value.trim().replace(/\\/g, "/").toLowerCase() : "";
}

function objectLeaf(value) {
    const normalized = clean(value);
    return normalized.slice(Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf(".")) + 1);
}

function matchesInstance(leaf, className) {
    // GetPathName returns either the generated class name or that class's
    // numbered UObject instance. A directory name or a lookalike suffix is not
    // evidence that this is the observed class.
    return leaf === className || leaf.replace(/_\d+$/, "") === className;
}

function matchSemanticFallbackScope(input) {
    const data = input || {};
    const actor = objectLeaf(data.actor);
    const ability = objectLeaf(data.ability);
    const actionClass = objectLeaf(data.actionClass);
    if (!actor || !ability || !actionClass) return null;
    return RULES.find(rule =>
        matchesInstance(actor, rule.actorClass) &&
        matchesInstance(ability, rule.abilityClass) &&
        actionClass === rule.actionClass
    ) || null;
}

function matchSemanticFallback(input) {
    const data = input || {};
    const rule = matchSemanticFallbackScope(data);
    const semantics = data.semantics && data.semantics.deflect;
    if (!rule || !semantics || semantics.conflict !== false || !Number.isInteger(semantics.value)) return null;
    // The diagnostic probe derives RedEye from enum value 3. A caller that has
    // no display name may use that known value; an explicitly different name
    // remains contradictory evidence.
    return semantics.value === rule.typeValue &&
        (semantics.name == null || semantics.name === rule.typeName) ? rule : null;
}

module.exports = { RULES, matchSemanticFallbackScope, matchSemanticFallback };
