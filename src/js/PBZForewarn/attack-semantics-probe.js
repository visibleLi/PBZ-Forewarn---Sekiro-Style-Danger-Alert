"use strict";

// Diagnostic only. Reflected properties and TArray Num/Get are the only reads.
// No action execution, targeting, asset loading, tag writes, or cue decisions.
const TYPE_NAMES = Object.freeze({
    0: "CantDeflect", 1: "Normal", 2: "BlueEye", 3: "RedEye",
    4: "PowerAttack", 5: "HoldDeflect", 6: "EDeflectBulletType_MAX"
});
const TYPE_FIELDS = Object.freeze(["DeflectBulletType", "Deflect Bullet Type", "DeflectType"]);
const TIME_FIELDS = Object.freeze(["PreHitPointDuration", "RuntimePreHitPointDuration", "BulletDuration"]);
const ARRAY_FIELDS = Object.freeze(["SendFrameTimes", "StartBulletTimes", "EndBulletTimes"]);

function read(object, key) {
    try {
        if (object === null || object === undefined) return { status: "missing" };
        const value = object[key];
        return value === null || value === undefined ? { status: "missing" } : { status: "read", value };
    } catch (_) { return { status: "unreadable" }; }
}
function scalar(object, key) {
    const result = read(object, key);
    if (result.status !== "read") return result;
    if (typeof result.value !== "number" || !Number.isFinite(result.value)) return { status: "not-finite-number" };
    return { status: "read", value: result.value };
}
function times(object, key) {
    const field = read(object, key);
    if (field.status !== "read") return field;
    const value = field.value;
    let length, get;
    if (Array.isArray(value)) {
        try { length = value.length; } catch (_) { return { status: "unreadable-length" }; }
        get = index => value[index];
    } else {
        const count = read(value, "Num"), item = read(value, "Get");
        if (count.status !== "read" || item.status !== "read" ||
            typeof count.value !== "function" || typeof item.value !== "function") return { status: "not-array" };
        try { length = count.value.call(value); } catch (_) { return { status: "unreadable-length" }; }
        get = index => item.value.call(value, index);
    }
    if (!Number.isSafeInteger(length) || length < 0) return { status: "invalid-length" };
    const values = [], invalidIndices = [], unreadableIndices = [];
    for (let index = 0; index < Math.min(length, 64); index++) {
        try {
            const item = get(index);
            if (typeof item === "number" && Number.isFinite(item)) values.push(item);
            else { values.push(null); invalidIndices.push(index); }
        } catch (_) { values.push(null); unreadableIndices.push(index); }
    }
    return { status: "read", length, truncated: length > 64, values, invalidIndices, unreadableIndices };
}
function probeAttackSemantics(action) {
    const candidates = TYPE_FIELDS.map(field => {
        const result = scalar(action, field);
        if (result.status !== "read") return { field, status: result.status };
        const value = result.value;
        const name = Number.isInteger(value) && Object.prototype.hasOwnProperty.call(TYPE_NAMES, value) ? TYPE_NAMES[value] : null;
        return { field, status: "read", value, name, enumSource: "SDK-0.3.3/PBZDeflectSystem.EDeflectBulletType" };
    });
    // Field priority is a diagnostic convention, not a claim about execution.
    // Retain every candidate so disagreement remains visible to the caller.
    const available = candidates.filter(x => x.status === "read");
    const primary = available.length ? available[0] : null;
    const timing = {}, arrays = {};
    for (const field of TIME_FIELDS) timing[field] = scalar(action, field);
    for (const field of ARRAY_FIELDS) arrays[field] = times(action, field);
    return {
        schemaVersion: 1,
        deflect: {
            field: primary ? primary.field : null,
            value: primary ? primary.value : null,
            name: primary ? primary.name : null,
            conflict: available.some(x => x.value !== primary.value),
            candidates
        },
        timing,
        arrays
    };
}
module.exports = { probeAttackSemantics };
