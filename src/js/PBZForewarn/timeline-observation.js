"use strict";

// Read-only per-execution snapshots. Resource catalog/template deduplication is
// deliberately not used as execution identity. Nothing here schedules a cue.
const { probeAttackSemantics } = require("./attack-semantics-probe");
const { recognizeWarning } = require("./attack-recognition");
const { classifyEffect } = require("./core");
const { classifyGenericAttack, matchGenericEvidencePolicy } = require("./generic-attack");

const SPELL_WARNING_CANDIDATES = Object.freeze({
    "/pbzvfxpack/vfx/battlefx/yuzan/ns_yuzan_warning_aoe_101.ns_yuzan_warning_aoe_101": Object.freeze({
        id: "yuzan-warning-aoe-observe",
        abilityIncludes: Object.freeze(["ga_yuzan_skill_03_c"])
    }),
    "/pbzvfxpack/vfx/battlefx/yuzan/ns_yuzan_warning_big_101.ns_yuzan_warning_big_101": Object.freeze({
        id: "yuzan-warning-big-observe",
        abilityIncludes: Object.freeze(["ga_yuzan_skill_03_a_r_start_c"])
    })
});

function spellWarningCandidate(effectPath, abilityPath = "") {
    const key = typeof effectPath === "string" ? effectPath.trim().replace(/\\/g, "/").toLowerCase() : "";
    const candidate = SPELL_WARNING_CANDIDATES[key];
    if (!candidate) return null;
    const ability = typeof abilityPath === "string" ? abilityPath.replace(/\\/g, "/").toLowerCase() : "";
    return candidate.abilityIncludes.some(value => ability.includes(value)) ? candidate : null;
}

function captureTimelineActions(adapter, timeline, task, context = {}, maximum = 256) {
    const limit = Math.max(1, Math.min(512, Number.isInteger(maximum) ? maximum : 256));
    const plans = [];
    const status = { scanned: 0, truncated: false, unreadable: 0, layers: 0,
        typed: 0, timed: 0, standard: 0, generic: 0, ignored: 0 };
    const safe = adapter.safe;
    const main = safe(() => timeline.Actions, null);
    const groups = [{ name: "main", events: main }];
    for (const [index, layer] of adapter.list(safe(() => timeline.RoleLayers, null)).entries())
        groups.push({ name: "role" + index, events: safe(() => layer.Actions, null) });
    for (const group of groups) {
        status.layers++;
        const count = safe(() => group.events.Num(), NaN);
        if (!Number.isSafeInteger(count) || count < 0) { status.unreadable++; continue; }
        for (let index = 0; index < count; index++) {
            if (status.scanned >= limit) { status.truncated = true; break; }
            status.scanned++;
            const event = safe(() => group.events.Get(index), null);
            const action = safe(() => event.Action, null);
            if (!adapter.valid(action)) { status.unreadable++; continue; }
            const times = adapter.eventTimes(event);
            const actionClass = adapter.path(safe(() => action.GetClass(), null));
            const effect = adapter.effectPath(action);
            const recognition = recognizeWarning({ effectPath: effect.path, actionClass }, classifyEffect);
            const spellCandidate = spellWarningCandidate(effect.path, context.ability);
            const semantics = probeAttackSemantics(action);
            const generic = classifyGenericAttack({ semantics });
            const hasType = semantics.deflect.candidates.some(item => item.status === "read");
            const hasTiming = Object.values(semantics.timing).some(item => item.status === "read") ||
                Object.values(semantics.arrays).some(item => item.status === "read");
            if (hasType) status.typed++;
            if (hasTiming) status.timed++;
            if (recognition.color) status.standard++;
            if (generic) status.generic++;
            if (!hasType && !hasTiming && !spellCandidate) { status.ignored++; continue; }
            const actionPath = adapter.path(action);
            plans.push({ ...context, actor: group.name === "main" ? context.actor : null,
                ability: group.name === "main" ? context.ability : null,
                activation: group.name === "main" ? context.activation : null,
                ownerActorCandidate: context.actor || null,
                eventKey: group.name + "/" + index, action: actionPath,
                actionClass,
                timeline: adapter.path(timeline), task: adapter.path(task),
                start: Number.isFinite(times.start) ? times.start : null,
                end: Number.isFinite(times.end) ? times.end : null,
                authoredStartTime: safe(() => Number.isFinite(event.StartTime) ? event.StartTime : null, null),
                triggerTimeOffset: safe(() => Number.isFinite(event.TriggerTimeOffset) ? event.TriggerTimeOffset : null, null),
                endTriggerTimeOffset: safe(() => Number.isFinite(event.EndTriggerTimeOffset) ? event.EndTriggerTimeOffset : null, null),
                typeValue: semantics.deflect.value, typeName: semantics.deflect.name,
                typeConflict: semantics.deflect.conflict, attackSemantics: semantics,
                genericColor: generic ? generic.color : null,
                genericTypeValue: generic ? generic.typeValue : null,
                genericTypeName: generic ? generic.typeName : null,
                genericTimingPolicy: null,
                genericEvidencePolicy: matchGenericEvidencePolicy({ actionClass }),
                spellWarningCandidate: spellCandidate ? spellCandidate.id : null,
                spellPhase: spellCandidate && /\.Success$/i.test(adapter.path(timeline)) ? "control-success" :
                    spellCandidate ? "cast" : null,
                cueEnabled: false,
                standardColor: recognition.color || null,
                recognitionSource: recognition.source || "unrecognized",
                effectPath: effect.path || null,
                sameNodeGenericSuppressed: !!recognition.color,
                layer: group.name, roleActorUnresolved: group.name !== "main",
                source: "timeline-action-read", timingBasis: "timeline-coordinates",
                usedForScheduling: false, executableBranchConfirmed: false });
        }
        if (status.truncated) break;
    }
    return { plans, status };
}

module.exports = { captureTimelineActions, spellWarningCandidate, SPELL_WARNING_CANDIDATES };
