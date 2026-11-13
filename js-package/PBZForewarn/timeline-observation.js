"use strict";

// Read-only per-execution snapshots. Resource catalog/template deduplication is
// deliberately not used as execution identity. Nothing here schedules a cue.
const { probeAttackSemantics } = require("./attack-semantics-probe");

function captureTimelineActions(adapter, timeline, task, context = {}, maximum = 256) {
    const limit = Math.max(1, Math.min(512, Number.isInteger(maximum) ? maximum : 256));
    const plans = [];
    const status = { scanned: 0, truncated: false, unreadable: 0, layers: 0 };
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
            const semantics = probeAttackSemantics(action);
            const hasType = semantics.deflect.candidates.some(item => item.status === "read");
            const hasTiming = Object.values(semantics.timing).some(item => item.status === "read") ||
                Object.values(semantics.arrays).some(item => item.status === "read");
            if (!hasType && !hasTiming) continue;
            const actionPath = adapter.path(action);
            plans.push({ ...context, actor: group.name === "main" ? context.actor : null,
                ability: group.name === "main" ? context.ability : null,
                activation: group.name === "main" ? context.activation : null,
                ownerActorCandidate: context.actor || null,
                eventKey: group.name + "/" + index, action: actionPath,
                actionClass: adapter.path(safe(() => action.GetClass(), null)),
                timeline: adapter.path(timeline), task: adapter.path(task),
                start: Number.isFinite(times.start) ? times.start : null,
                end: Number.isFinite(times.end) ? times.end : null,
                typeValue: semantics.deflect.value, typeName: semantics.deflect.name,
                typeConflict: semantics.deflect.conflict, attackSemantics: semantics,
                layer: group.name, roleActorUnresolved: group.name !== "main",
                source: "timeline-action-read", timingBasis: "timeline-coordinates",
                usedForScheduling: false, executableBranchConfirmed: false });
        }
        if (status.truncated) break;
    }
    return { plans, status };
}

module.exports = { captureTimelineActions };
