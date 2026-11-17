"use strict";

// A presentation policy for one observed YuZan chain. These handoffs are NOT
// engine parent/strike IDs. Missing or competing stage records keep the cue.
const { BLACK_ACTION_CLASS, BLACK_EFFECT_OBJECT } = require("./attack-recognition");
const clean = x => typeof x === "string" ? x.trim().replace(/\\/g, "/").toLowerCase() : "";
const instance = (path, name) => {
    const s = clean(path), leaf = s.slice(Math.max(s.lastIndexOf("/"), s.lastIndexOf(".")) + 1);
    return leaf === name || leaf.replace(/_\d+$/, "") === name;
};
function stage(r) {
    if (!r || !instance(r.actor, "bp_monster_femalevessel_yuzan_c")) return null;
    const a = clean(r.ability), t = clean(r.timeline);
    if (instance(a, "ga_yuzan_skill_03_c") && t === a + ".main") return "cast";
    if (!["ga_yuzan_skill_03_a_l_start_c", "ga_yuzan_skill_03_a_r_start_c"].some(n => instance(a, n))) return null;
    return t === a + ".main" ? "main" : t === a + ".success" ? "success" : null;
}
function complete(r) {
    return r && ["world", "actor", "ability", "timeline", "key", "activation"].every(k =>
        typeof r[k] === "string" && !!r[k]) && /^\d+$/.test(r.activation) &&
        Number.isSafeInteger(Number(r.activation)) && Number.isSafeInteger(r.serial) && r.serial > 0;
}
const sameRecord = (a, b) => a.key === b.key && a.serial === b.serial && a.activation === b.activation;
const sameAbility = (a, b) => a.ability === b.ability && a.activation === b.activation;
function createCastFollowup() {
    const tokens = new Map();
    function clear() { tokens.clear(); }
    function recordCue(r, cueId) {
        if (!complete(r) || stage(r) !== "cast" || typeof cueId !== "string" || !cueId) return;
        // At most one candidate per actor. A fresh cast replaces old context.
        tokens.set(r.actor, { world: r.world, cast: { ...r }, cueId, phase: "cast" });
        if (tokens.size > 128) tokens.delete(tokens.keys().next().value);
    }
    function withdrawCue(id) {
        for (const [actor, t] of tokens) if (t.cueId === id) tokens.delete(actor);
    }
    function update(records) {
        for (const [actor, t] of tokens) {
            const rows = records.filter(r => complete(r) && r.actor === actor && r.world === t.world && stage(r));
            // A different observed cast invalidates the old chain even if it
            // never reached a warning window. No clock/nearest-time matching.
            if (rows.some(r => stage(r) === "cast" && !sameRecord(r, t.cast) && r.live)) { tokens.delete(actor); continue; }
            const mains = rows.filter(r => r.live && stage(r) === "main");
            const successes = rows.filter(r => r.live && stage(r) === "success");
            if (t.phase === "cast") {
                if (!rows.some(r => sameRecord(r, t.cast))) { tokens.delete(actor); continue; }
                if (mains.length > 1 || successes.length || rows.filter(r => r.live && stage(r) === "cast").length > 1) {
                    tokens.delete(actor); continue;
                }
                if (mains.length === 1) { t.main = { ...mains[0] }; t.phase = "main"; }
            } else if (t.phase === "main") {
                const main = rows.find(r => sameRecord(r, t.main));
                if (!main || mains.some(r => !sameRecord(r, t.main)) || successes.length > 1) { tokens.delete(actor); continue; }
                if (successes.length) {
                    if (!sameAbility(successes[0], t.main)) { tokens.delete(actor); continue; }
                    t.success = { ...successes[0] }; t.phase = "success";
                }
            } else if (!successes.some(r => sameRecord(r, t.success)) || successes.length !== 1 || mains.length) {
                tokens.delete(actor);
            }
        }
    }
    function suppression(r, event) {
        const t = r && tokens.get(r.actor), meta = event && event.meta;
        if (!complete(r) || !t || t.phase !== "success" || t.world !== r.world || !sameRecord(r, t.success) ||
            stage(r) !== "success" || !r.live || event.color !== "black" || event.eligible !== true || !meta || meta.roleName ||
            clean(meta.actionClass) !== clean(BLACK_ACTION_CLASS) || clean(meta.effect) !== clean(BLACK_EFFECT_OBJECT) ||
            clean(meta.action) !== clean(r.timeline) + ".gaaction_powerattackparticle_c_0") return null;
        return { reason: "yuzan-followup-after-cast-cue", castCueId: t.cueId,
            castRecordSerial: t.cast.serial, mainRecordSerial: t.main.serial,
            associationBasis: "observed-stage-handoffs-not-engine-parent-or-strike-id" };
    }
    return { recordCue, withdrawCue, update, suppression, clear };
}
module.exports = { stage, createCastFollowup };
