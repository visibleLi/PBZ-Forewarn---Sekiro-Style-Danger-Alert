"use strict";

// Read-only classification shared by diagnostics and the opt-in generic cue.
// A type value never becomes a cue unless a timing source and an execution
// path have been established for that action class.
const TYPE_COLORS = Object.freeze({ 2: "blue", 3: "red" });
const TYPE_NAMES = Object.freeze({ 2: "BlueEye", 3: "RedEye" });
const ACTION_TIMING_POLICIES = Object.freeze({
    // A complete Type is registered only after the action's own timing fields
    // and the original warning path have been correlated in-game.
});
const EVIDENCE_POLICIES = Object.freeze({
    // This class exposes finite plan timing, bullet interval arrays and native
    // frame timing. They remain separate until the original warning node and
    // the actual attack branch are correlated for one execution.
    "lgaaction_durationbulletwithdeflect": Object.freeze({
        id: "duration-bullet-observe",
        timingBasis: "authored-action-coordinates",
        cueEnabled: false,
        nativeTimingFields: Object.freeze(["PreHitPointDuration", "RuntimePreHitPointDuration", "BulletDuration"])
    })
});

function leaf(value) {
    const text = typeof value === "string" ? value.trim().replace(/\\/g, "/").toLowerCase() : "";
    return text.slice(Math.max(text.lastIndexOf("/"), text.lastIndexOf(".")) + 1);
}

function typeClass(value) {
    return Object.prototype.hasOwnProperty.call(TYPE_COLORS, value) ? "deflect" : null;
}

function classifyGenericAttack(input) {
    const data = input || {};
    const semantics = data.semantics && data.semantics.deflect;
    if (!semantics || semantics.conflict !== false || !Number.isInteger(semantics.value)) return null;
    if (semantics.name != null && semantics.name !== TYPE_NAMES[semantics.value]) return null;
    const color = TYPE_COLORS[semantics.value];
    return color ? { color, typeValue: semantics.value, typeName: TYPE_NAMES[semantics.value], typeClass: typeClass(semantics.value) } : null;
}

function matchGenericTimingPolicy(input) {
    const data = input || {};
    const actionClass = leaf(data.actionClass);
    const policy = ACTION_TIMING_POLICIES[actionClass];
    if (!policy) return null;
    return { ...policy, actionClass, timingBasis: policy.timingBasis };
}

function matchGenericEvidencePolicy(input) {
    const actionClass = leaf((input || {}).actionClass);
    const policy = EVIDENCE_POLICIES[actionClass];
    return policy ? { ...policy, actionClass } : null;
}

function planGenericAttack(input) {
    const data = input || {};
    const classification = classifyGenericAttack({ semantics: data.semantics });
    const policy = matchGenericTimingPolicy(data);
    if (!classification || !policy || data.standardRecognition === true) return null;
    const times = data.times;
    if (!times || ![times.start, times.end].every(Number.isFinite) || times.end < times.start) return null;
    return {
        color: classification.color, typeValue: classification.typeValue, typeName: classification.typeName,
        timingBasis: policy.timingBasis, start: times.start, end: times.end,
        status: "eligible-for-cue", executionVerified: false
    };
}

module.exports = {
    TYPE_COLORS, TYPE_NAMES, ACTION_TIMING_POLICIES, EVIDENCE_POLICIES, classifyGenericAttack,
    matchGenericTimingPolicy, matchGenericEvidencePolicy, planGenericAttack
};
