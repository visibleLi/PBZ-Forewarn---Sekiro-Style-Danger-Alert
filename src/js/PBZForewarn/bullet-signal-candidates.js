"use strict";

const { classifyEffect } = require("./core");

// Exact implementation identities verified in the 2026-11-22 pilot exports.
// This is observation, not a warning rule or an action/lifecycle timing contract.
const EFFECT = "/SGameCombatSystem/Bullet/Event/BP_BulletEvent_Effect.BP_BulletEvent_Effect_C";
const EXECUTION = "/SGameExecution/Bullet/Events/BP_BulletEvent_PlayExecution.BP_BulletEvent_PlayExecution_C";
const GRAB = "/SGameExecution/GA/GA_ExecutedAbilityBase_Grab.GA_ExecutedAbilityBase_Grab_C";
const FILTER = "/Script/SGameCombatSystem.BulletEvent_FilterEventActor";
const INTERVAL = "/Script/SGameCombatSystem.BulletEvent_Interval";
const ROOTS = ["InitializeEvents", "StartEvents", "PreAttackEvents"];
const CONTAINERS = ["Events", "SubEvents", "IntervalEvents"];
const CONDITIONS = ["TagRequirement", "RequireTags", "IgnoreTags", "TagQuery", "Target Required Tags",
    "Target Ignored Tags", "Only Grab Ability Target", "CheckSelfTag", "SelfTagRequirement",
    "Interval", "LoopCount", "Delay", "Chance", "Probability", "Random", "Filter"];
const DEPENDENCIES = ["BulletData", "Bullet Data", "RandomBulletData", "Random Bullet Data", "Branch"];
const LIMITS = Object.freeze({ maxDepth: 8, maxNodes: 128, maxEvents: 128, maxEventsPerContainer: 32,
    maxCandidates: 16, maxClassAncestry: 16, maxSnapshotDepth: 4, maxSnapshotNodes: 256,
    maxSnapshotItems: 16, maxString: 256, maxConditionLeaves: 32, maxConditionPath: 128, maxIssues: 24 });

function read(object, field) {
    try {
        const value = object == null ? undefined : object[field];
        return value == null ? { status: "missing" } : { status: "read", value };
    } catch (_) { return { status: "unreadable" }; }
}
function object(value) { return value !== null && typeof value === "object"; }

function createBulletSignalProbe({ valid, path, list, effectPath }) {
    function probe(action, times) {
        const result = { status: "read", usedForScheduling: false, candidates: [], unresolved: false,
            limits: { ...LIMITS }, issues: [], visited: { nodes: 0, events: 0 } };
        const active = new Set();
        let snapshotNodes = 0;
        const text = value => typeof value === "string" ? value.slice(0, LIMITS.maxString) : "";
        function issue(reason) {
            result.unresolved = true;
            if (result.issues.length < LIMITS.maxIssues && !result.issues.includes(reason)) result.issues.push(reason);
        }
        function isValid(value) {
            try { return object(value) && valid(value) === true; } catch (_) { issue("validity-unreadable"); return false; }
        }
        function objectPath(value) {
            try { const name = path(value); return text(name); }
            catch (_) { issue("path-unreadable"); return ""; }
        }
        function field(value, key) {
            const found = read(value, key);
            if (found.status === "unreadable") issue("field-unreadable:" + key);
            return found;
        }
        function snapshot(value, depth = 0, seen = new Set()) {
            if (++snapshotNodes > LIMITS.maxSnapshotNodes) { issue("snapshot-node-cap"); return { status: "capped" }; }
            if (value == null || typeof value === "boolean") return value == null ? null : value;
            if (typeof value === "string") {
                if (value.length > LIMITS.maxString) issue("snapshot-string-cap");
                return text(value);
            }
            if (typeof value === "number") {
                if (Number.isFinite(value)) return value;
                issue("snapshot-nonfinite"); return { status: "nonfinite" };
            }
            if (!object(value)) { issue("snapshot-unsupported"); return { status: "unsupported" }; }
            if (seen.has(value)) { issue("snapshot-cycle"); return { status: "cycle" }; }
            if (depth >= LIMITS.maxSnapshotDepth) { issue("snapshot-depth-cap"); return { status: "capped" }; }
            const next = new Set(seen); next.add(value);
            if (isValid(value)) return { status: "object-reference", path: objectPath(value) };
            const num = field(value, "Num"), get = field(value, "Get");
            if (typeof num.value === "function" && typeof get.value === "function") {
                const values = array(value, LIMITS.maxSnapshotItems);
                return values === null ? { status: "unreadable" } : values.map(item => snapshot(item, depth + 1, next));
            }
            if (Array.isArray(value)) {
                let length;
                try { length = value.length; } catch (_) { issue("snapshot-unreadable"); return { status: "unreadable" }; }
                if (length > LIMITS.maxSnapshotItems) issue("snapshot-item-cap");
                const values = [];
                for (let i = 0; i < Math.min(length, LIMITS.maxSnapshotItems); i++) {
                    const item = field(value, i);
                    values.push(item.status === "read" ? snapshot(item.value, depth + 1, next) : { status: item.status });
                }
                return values;
            }
            let keys;
            try { keys = Object.keys(value); } catch (_) { issue("snapshot-unreadable"); return { status: "unreadable" }; }
            if (keys.length > LIMITS.maxSnapshotItems) issue("snapshot-item-cap");
            // Entries avoid assigning arbitrary native property names onto JS objects.
            return { fields: keys.slice(0, LIMITS.maxSnapshotItems).map(key => {
                const item = field(value, key);
                return { field: text(key), value: item.status === "read" ? snapshot(item.value, depth + 1, next) : { status: item.status } };
            }) };
        }
        function array(value, cap) {
            const num = field(value, "Num"), get = field(value, "Get");
            if (typeof num.value !== "function" || typeof get.value !== "function") { issue("unsupported-event-array"); return null; }
            try {
                const length = num.value.call(value);
                if (!Number.isSafeInteger(length) || length < 0) { issue("invalid-array-length"); return null; }
                if (length > cap) issue("array-cap");
                const values = list(value, cap);
                if (!Array.isArray(values) || values.length !== Math.min(length, cap)) { issue("array-changed-or-unsupported"); return null; }
                return values.slice(0, cap);
            } catch (_) { issue("array-unreadable"); return null; }
        }
        function enter(value, depth) {
            if (depth > LIMITS.maxDepth) { issue("depth-cap"); return false; }
            if (active.has(value)) { issue("identity-cycle"); return false; }
            if (result.visited.nodes >= LIMITS.maxNodes) { issue("node-cap"); return false; }
            result.visited.nodes++; active.add(value); return true;
        }
        function flatCondition(value) {
            if (value === null || typeof value !== 'object') return value;
            const leaves = Object.create(null);
            let entries = 0;
            function add(key, item) {
                if (entries >= LIMITS.maxConditionLeaves) { issue('condition-entry-cap'); return; }
                if (key.length > LIMITS.maxConditionPath) { issue('condition-path-cap'); return; }
                leaves[key || '/'] = item; entries++;
            }
            function visit(item, prefix) {
                if (item === null || typeof item !== 'object') { add(prefix, item); return; }
                if (Array.isArray(item)) {
                    if (!item.length) add(prefix, '[empty-array]');
                    else item.forEach((child, i) => visit(child, prefix + '/' + i));
                } else if (Array.isArray(item.fields)) {
                    if (!item.fields.length) add(prefix, '[empty-object]');
                    for (const child of item.fields) {
                        const key = child.field.replace(/~/g, '~0').replace(/\//g, '~1');
                        visit(child.value, prefix + '/' + key);
                    }
                } else {
                    for (const key of Object.keys(item)) visit(item[key], prefix + '/' + key);
                }
            }
            visit(value, '');
            return leaves;
        }
        function conditions(event) {
            const values = {};
            for (const key of CONDITIONS) {
                const item = field(event, key);
                if (item.status !== "missing") values[key] = item.status === "read" ? flatCondition(snapshot(item.value)) : { status: item.status };
            }
            return values;
        }
        function classPath(event) {
            const getter = field(event, "GetClass");
            if (typeof getter.value !== "function") { issue("event-class-unavailable"); return ""; }
            try {
                const klass = getter.value.call(event);
                if (!isValid(klass)) { issue("event-class-invalid"); return ""; }
                const name = objectPath(klass);
                if (!name) issue("event-class-path-unavailable");
                return name;
            } catch (_) { issue("event-class-unreadable"); return ""; }
        }
        function grabAncestry(klass) {
            const seen = new Set(), ancestry = [];
            for (let depth = 0; depth < LIMITS.maxClassAncestry; depth++) {
                if (!isValid(klass)) { issue("executed-ability-invalid"); return null; }
                if (seen.has(klass)) { issue("ancestry-cycle"); return null; }
                seen.add(klass);
                const name = objectPath(klass);
                if (!name) { issue("ancestry-path-unavailable"); return null; }
                ancestry.push(name);
                if (name === GRAB) return ancestry;
                let parent = { status: "missing" };
                for (const key of ["GetSuperClass", "GetSuperStruct"]) {
                    const getter = field(klass, key);
                    if (getter.status === "unreadable") return null;
                    if (typeof getter.value !== "function") continue;
                    try { parent = { status: "read", value: getter.value.call(klass) }; }
                    catch (_) { issue("ancestry-unreadable"); return null; }
                    break;
                }
                if (parent.status !== "read") {
                    for (const key of ["SuperStruct", "SuperClass"]) {
                        const found = field(klass, key);
                        if (found.status === "unreadable") return null;
                        if (found.status === "read") { parent = found; break; }
                    }
                }
                if (parent.status !== "read") { issue("ancestry-unavailable"); return null; }
                if (parent.value == null) return null; // Known end: not a grab class.
                klass = parent.value;
            }
            issue("ancestry-cap"); return null;
        }
        const actionTimes = {};
        for (const key of ["start", "end", "startRaw", "duration", "trigger", "endOffset", "durationField"]) {
            const item = field(times, key);
            if (item.status !== "missing") actionTimes[key] = item.status === "read" ? snapshot(item.value) : { status: item.status };
        }
        function candidate(data, lifecycle, route) {
            if (result.candidates.length >= LIMITS.maxCandidates) { issue("candidate-cap"); return; }
            result.candidates.push({ ...data, lifecycle, route,
                conditional: data.kind === "execution-capability" || route.some(step => Object.keys(step.conditions).length > 0),
                timing: { status: "unverified", basis: "bullet-lifecycle-action-execution-contract-unverified",
                    coordinateConfirmed: false, actionTimes }, usedForScheduling: false });
        }
        function visitEvent(event, lifecycle, route, depth, fieldName, index) {
            if (result.visited.events >= LIMITS.maxEvents) { issue("event-cap"); return; }
            result.visited.events++;
            if (!isValid(event)) { issue("event-invalid-or-unresolved"); return; }
            if (!enter(event, depth)) return;
            const implementation = classPath(event);
            const step = { field: fieldName, index, eventPath: objectPath(event), classPath: implementation, conditions: conditions(event) };
            const next = route.concat(step);
            if (implementation === EFFECT) {
                const niagara = field(event, "Niagara");
                if (niagara.status === "read") {
                    try {
                        const effect = effectPath({ NiagaraEffect: niagara.value });
                        const name = effect && typeof effect.path === "string" ? effect.path : "";
                        if (!name) issue("effect-unresolved");
                        const color = classifyEffect(name);
                        if (color) candidate({ kind: "standard-warning-resource", color, effectPath: text(name) }, lifecycle, next);
                    } catch (_) { issue("effect-unreadable"); }
                }
            } else if (implementation === EXECUTION) {
                const payload = field(event, "Executed Ability"), alias = field(event, "ExecutedAbility");
                if (payload.status === "unreadable" || alias.status === "unreadable") issue("executed-ability-unreadable");
                else if (payload.status === "read" && alias.status === "read" && payload.value !== alias.value) issue("executed-ability-alias-conflict");
                else {
                    const ability = payload.status === "read" ? payload.value : alias.value;
                    const ancestry = grabAncestry(ability);
                    if (ancestry) candidate({ kind: "execution-capability", color: null, executedAbilityPath: ancestry[0],
                        ancestry, executionStatus: "target-state-and-native-trigger-not-evaluated" }, lifecycle, next);
                }
            } else if (implementation !== FILTER && implementation !== INTERVAL) issue("unsupported-event-class");
            for (const key of DEPENDENCIES) {
                if (field(event, key).status === "read") issue("unresolved-dependency:" + key);
            }
            for (const key of CONTAINERS) {
                const child = field(event, key);
                if (child.status === "read") visitContainer(child.value, lifecycle, next, depth + 1, key);
            }
            active.delete(event);
        }
        function visitContainer(value, lifecycle, route, depth, fieldName) {
            if (!object(value)) { issue("unsupported-event-container"); return; }
            if (!enter(value, depth)) return;
            const num = field(value, "Num");
            if (typeof num.value === "function") {
                const values = array(value, LIMITS.maxEventsPerContainer);
                if (values) {
                    for (let i = 0; i < values.length; i++) {
                        if (result.visited.events >= LIMITS.maxEvents) { issue("event-cap"); break; }
                        visitEvent(values[i], lifecycle, route, depth + 1, fieldName, i);
                    }
                }
            } else {
                const events = field(value, "Events");
                if (events.status === "read") visitContainer(events.value, lifecycle, route, depth + 1, "Events");
                else issue("unsupported-event-container");
            }
            active.delete(value);
        }
        // Dynamic selection is evidence of an unresolved dependency, including
        // actions with no direct BulletData reference. Never guess its choice.
        for (const key of DEPENDENCIES.slice(2)) {
            if (field(action, key).status === "read") issue("unresolved-dependency:" + key);
        }
        const aliases = [field(action, "BulletData"), field(action, "Bullet Data")];
        const available = aliases.filter(item => item.status === "read");
        if (!available.length) result.status = result.unresolved ? "unresolved" : "no-bullet-data";
        else if (available.length === 2 && available[0].value !== available[1].value) issue("bullet-data-alias-conflict");
        else if (!isValid(available[0].value)) issue("bullet-data-invalid-or-unresolved");
        else {
            const bullet = available[0].value;
            let readableRoots = 0;
            active.add(bullet);
            for (const lifecycle of ROOTS) {
                const root = field(bullet, lifecycle);
                if (root.status === "read") {
                    // Roots are FBulletEventsData wrappers, not an export object table.
                    const events = field(root.value, "Events");
                    if (events.status === "read") {
                        readableRoots++;
                        visitContainer(events.value, lifecycle, [], 0, "Events");
                    } else issue("lifecycle-events-unavailable");
                }
            }
            if (!readableRoots) issue("lifecycle-roots-unavailable");
            active.delete(bullet);
        }
        if (result.unresolved) result.status = "unresolved";
        return result;
    }
    return { probe };
}

module.exports = { createBulletSignalProbe };
