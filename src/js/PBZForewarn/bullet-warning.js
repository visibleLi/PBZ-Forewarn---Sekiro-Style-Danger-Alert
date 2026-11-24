"use strict";
const { classifyEffect } = require("./core");
const DELAY = "/PBZDeflectSystem/Actions/GAA_DelayDeflectProjectileBullet.GAA_DelayDeflectProjectileBullet_C";
const DURATION = "/Script/PBZCombatAsset.LGAAction_DurationBulletWithDeflect";
const EFFECT = "/SGameCombatSystem/Bullet/Event/BP_BulletEvent_Effect.BP_BulletEvent_Effect_C";
const EXECUTION = "/SGameExecution/Bullet/Events/BP_BulletEvent_PlayExecution.BP_BulletEvent_PlayExecution_C";
const GRAB = "/SGameExecution/GA/GA_ExecutedAbilityBase_Grab.GA_ExecutedAbilityBase_Grab_C";
const FILTER = "/Script/SGameCombatSystem.BulletEvent_FilterEventActor";

function supportsActionClass(actionClass) { return actionClass === DELAY || actionClass === DURATION; }

// Candidate policy: authored preparation, not native launch/VFX timing. Filters
// describe potential victim execution; their future target state is not predicted.
function createBulletWarning({ valid, path, list, effectPath, requirements }) {
    const proofs = new WeakMap();
    function read(value, key) {
        const found = value == null ? undefined : value[key];
        return found == null ? undefined : found; // Throwing getters fail closed.
    }
    function alias(value, names) {
        const found = names.map(key => read(value, key)).filter(item => item !== undefined);
        if (found.some(item => item !== found[0] && !same(item, found[0]))) throw Error("alias-conflict");
        return found[0];
    }
    function same(a, b) {
        return a === b || (valid(a) && valid(b) && !!path(a) && path(a) === path(b));
    }
    function count(value) {
        if (!value || typeof value.Num !== "function") throw Error("native-container-unavailable");
        const n = value.Num();
        if (!Number.isSafeInteger(n) || n < 0) throw Error("native-container-invalid");
        return n;
    }
    function array(value, cap = 32) {
        const n = count(value);
        if (n > cap || typeof value.Get !== "function") throw Error("array-cap-or-unavailable");
        const values = list(value, cap);
        if (!Array.isArray(values) || values.length !== n || count(value) !== n) throw Error("array-changed");
        return values;
    }
    function tags(value) {
        return array(read(value, "GameplayTags")).map(tag => {
            const name = read(tag, "TagName");
            if (typeof name !== "string" || !name || name.length > 256) throw Error("tag-unreadable");
            return name;
        });
    }
    function tagRequirements(value) {
        if (!value) throw Error("tag-requirements-unavailable");
        const query = read(value, "TagQuery");
        const tokens = array(read(query, "QueryTokenStream"));
        if (tokens.some(token => !Number.isInteger(token))) throw Error("query-unreadable");
        return { require: tags(read(value, "RequireTags")), ignore: tags(read(value, "IgnoreTags")),
            queryTokens: tokens, queryTags: tags({ GameplayTags: read(query, "TagDictionary") }) };
    }
    function flag(value, key) {
        const item = read(value, key);
        if (item !== undefined && typeof item !== "boolean") throw Error("flag-unreadable");
        return item === true;
    }
    function klass(value) { return valid(value) ? path(value.GetClass()) : ""; }
    function ancestry(value) {
        const seen = new Set();
        for (let i = 0; i < 16; i++) {
            if (!valid(value) || seen.has(value)) return null;
            seen.add(value);
            const name = path(value);
            if (!name) return null;
            if (name === GRAB) return name;
            let parent;
            for (const key of ["GetSuperClass", "GetSuperStruct"]) {
                const getter = read(value, key);
                if (typeof getter === "function") { parent = getter.call(value); break; }
            }
            if (parent === undefined) parent = alias(value, ["SuperStruct", "SuperClass"]);
            value = parent;
        }
        return null;
    }
    function neutralSelection(action) {
        for (const key of ["RandomBulletData", "Random Bullet Data"]) {
            const value = read(action, key);
            if (value !== undefined && count(value) !== 0) return false;
        }
        // Branch is a reflected NameProperty, not a boolean branch flag.
        const branch = read(action, "Branch");
        return branch === undefined || branch === "" || branch === "None";
    }
    function noDelay(event) {
        for (const key of ["Delay", "Interval", "LoopCount", "Chance", "Probability", "Random", "Branch"]) {
            const value = read(event, key);
            if (value !== undefined) return false; // No execution contract for these routes.
        }
        return true;
    }
    function plan(action, times, sourceASC) {
        try {
            const actionClass = klass(action);
            if (!supportsActionClass(actionClass) || !neutralSelection(action) || !times ||
                ![times.start, times.end].every(Number.isFinite) || times.end < times.start) return null;
            const bullet = alias(action, ["BulletData", "Bullet Data"]);
            if (!valid(bullet) || !path(bullet)) return null;
            if (actionClass === DURATION) {
                const type = alias(action, ["DeflectBulletType", "Deflect Bullet Type", "DeflectType"]);
                if (type !== 0) return null;
            }
            const matches = [], active = new Set();
            let visited = 0;
            function visit(event, lifecycle, route, refs, risk, depth) {
                if (++visited > 128) throw Error("node-cap");
                if (!valid(event) || depth > 4 || active.has(event)) return;
                const type = klass(event);
                // Unknown siblings do not poison a supported route.
                if (![EFFECT, EXECUTION, FILTER].includes(type)) return;
                if (!noDelay(event)) return;
                const next = route.concat({ classPath: type, eventPath: path(event) });
                const nextRefs = refs.concat(event);
                if (actionClass === DELAY && type === EFFECT) {
                    const effect = effectPath({ NiagaraEffect: read(event, "Niagara") });
                    const color = classifyEffect(effect && effect.path);
                    if (color) matches.push({ color, kind: "standard-warning-resource", lifecycle,
                        effectPath: effect.path, route: next, riskConditions: risk, refs: nextRefs });
                } else if (actionClass === DURATION && type === EXECUTION) {
                    if (flag(event, "Only Grab Ability Target")) return;
                    const executed = alias(event, ["Executed Ability", "ExecutedAbility"]);
                    if (!ancestry(executed)) return;
                    const conditions = { targetRequired: read(event, "Target Required Tags") === undefined ? [] : tags(read(event, "Target Required Tags")),
                        targetIgnored: read(event, "Target Ignored Tags") === undefined ? [] : tags(read(event, "Target Ignored Tags")) };
                    if (flag(event, "CheckSelfTag")) {
                        const self = read(event, "SelfTagRequirement");
                        conditions.self = tagRequirements(self);
                        if (!requirements({ ActivationRequirements: self }, sourceASC).eligible) return;
                    }
                    matches.push({ color: "black", kind: "execution-capability", lifecycle,
                        executedAbilityPath: path(executed), route: next,
                        riskConditions: risk.concat(conditions), refs: nextRefs.concat(executed) });
                } else if (actionClass === DURATION && type === FILTER) {
                    const condition = tagRequirements(read(event, "TagRequirement"));
                    active.add(event);
                    for (const child of array(read(event, "SubEvents")))
                        visit(child, lifecycle, next, nextRefs, risk.concat(condition), depth + 1);
                    active.delete(event);
                }
            }
            const roots = actionClass === DELAY ? ["InitializeEvents", "StartEvents"] : ["PreAttackEvents"];
            for (const lifecycle of roots) {
                const root = read(bullet, lifecycle);
                if (root === undefined) continue;
                for (const event of array(read(root, "Events"))) visit(event, lifecycle, [], [], [], 0);
            }
            // One physical action, one cue. Ambiguous/multiple selected signals stay observations.
            if (matches.length !== 1) return null;
            const { refs, ...match } = matches[0];
            const result = { ...match, actionClass, bulletPath: path(bullet), start: times.start, end: times.end,
                timingBasis: "authored-action-preparation-candidate", executionVerified: false,
                nativeLaunchCoordinateConfirmed: false,
                ...(match.kind === "execution-capability" ? { interpretation: "conditional-grab-capability-risk" } : {}) };
            proofs.set(result, [action, bullet, ...refs]);
            return result;
        } catch (_) { return null; }
    }
    function eligibility(action, times, sourceASC, expectedPlan) {
        const fresh = plan(action, times, sourceASC), expected = expectedPlan && proofs.get(expectedPlan);
        const current = fresh && proofs.get(fresh);
        let eligible = false;
        try {
            eligible = !!expected && !!current && expected.length === current.length &&
                expected.every((value, i) => same(value, current[i])) && JSON.stringify(fresh) === JSON.stringify(expectedPlan);
        } catch (_) {}
        return { eligible, reason: eligible ? "eligible" : "bullet-warning-proof-changed" };
    }
    return { plan, eligibility };
}
module.exports = { createBulletWarning, supportsActionClass };
