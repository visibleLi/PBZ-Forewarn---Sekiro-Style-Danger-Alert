"use strict";

// Recognition is about a known warning action/resource, not screen RGB or the
// DeflectBulletType enum. The latter is diagnostic until its timing is proven.
// Paths verified in Gold's cooked assets and the reflection-generated SDK.
const BLACK_ACTION_CLASS = "/PBZCombatAsset/Prototypes/Actions/GAAction_PowerAttackParticle.GAAction_PowerAttackParticle_C";
const BLACK_EFFECT_PACKAGE = "/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Post_001";
const BLACK_EFFECT_OBJECT = BLACK_EFFECT_PACKAGE + ".NS_AttackAlert_Post_001";

function cleanPath(value) {
    return typeof value === "string" ? value.trim().replace(/\\/g, "/").toLowerCase() : "";
}
function recognizeWarning(input, classifyEffect) {
    const data = input || {};
    const effect = cleanPath(data.effectPath), actionClass = cleanPath(data.actionClass);
    const knownBlackEffect = effect === cleanPath(BLACK_EFFECT_PACKAGE) || effect === cleanPath(BLACK_EFFECT_OBJECT);
    const knownBlackAction = actionClass === cleanPath(BLACK_ACTION_CLASS);
    if (knownBlackEffect) {
        if (knownBlackAction) return {
            color: "black", source: "power-attack-post-pair", supported: true,
            timingBasis: "timeline-warning-event", reason: "recognized-black-pair"
        };
        return { color: null, supported: false, source: "unconfirmed-black-pair",
            timingBasis: "unverified-not-scheduled",
            reason: "post-without-known-power-action" };
    }
    const color = typeof classifyEffect === "function" ? classifyEffect(data.effectPath) : null;
    // In particular a caller cannot enable arbitrary Post resources by returning
    // black from its path-only classifier. Black requires the pair above.
    if (color === "red" || color === "blue") return {
        color, source: "niagara-warning-resource", supported: true,
        timingBasis: "timeline-warning-event", reason: "recognized-resource"
    };
    if (knownBlackAction) return { color: null, supported: false, source: "unconfirmed-black-pair",
        timingBasis: "unverified-not-scheduled", reason: "power-action-without-known-post" };
    return { color: null, supported: false, source: "unrecognized",
        timingBasis: "unverified-not-scheduled", reason: "unrecognized-effect" };
}

module.exports = { recognizeWarning, BLACK_ACTION_CLASS, BLACK_EFFECT_PACKAGE, BLACK_EFFECT_OBJECT };
