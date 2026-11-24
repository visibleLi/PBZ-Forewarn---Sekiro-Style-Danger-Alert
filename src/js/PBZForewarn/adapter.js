"use strict";
const { probeAttackSemantics } = require("./attack-semantics-probe");
const { recognizeWarning } = require("./attack-recognition");
const { matchSemanticFallbackScope, matchSemanticFallback } = require("./semantic-fallback");
const { createBulletWarning, supportsActionClass } = require("./bullet-warning");
const { matchCastWarning } = require("./cast-warning");
const { createBulletSignalProbe } = require("./bullet-signal-candidates");
// Read-only UE adapter. Never assigns to a gameplay object or timeline event.
// Injected dependencies make the bridge testable without starting PBZ.
function createAdapter(UE, puerts, diagnostic, options = {}) {
    const log = diagnostic || (() => {});
    let semanticFallbackEnabled = options.semanticFallback === true;
    let genericAttackEnabled = options.genericAttack === true;
    let castWarningEnabled = options.castWarning === true;
    let castLeadSeconds = 0.35;
    const safe = (fn, fallback) => { try { const v = fn(); return v === undefined || v === null ? fallback : v; } catch (_) { return fallback; } };
    const valid = o => !!o && safe(() => UE.KismetSystemLibrary.IsValid(o), false);
    const path = o => valid(o) ? safe(() => UE.KismetSystemLibrary.GetPathName(o), "") : "";
    function list(value, limit = 4096) {
        if (!value || typeof value.Num !== "function") return [];
        const n = value.Num();
        if (!Number.isInteger(n) || n < 0) throw Error("invalid TArray length");
        if (n > limit) log("array-truncated", { count: n, limit });
        const result = [];
        for (let i = 0; i < Math.min(n, limit); i++) result.push(value.Get(i));
        return result;
    }
    function effectPath(action) {
        const effect = safe(() => action.NiagaraEffect, null);
        if (!effect) return { path: "", source: "no-NiagaraEffect" };
        if (valid(effect)) return { path: path(effect), source: "hard" };
        // The reflected Blueprint conversion exposes a soft reference's asset path
        // even before it is loaded. Never LoadSynchronous in the combat loop.
        const soft = safe(() => UE.KismetSystemLibrary.Conv_SoftObjectReferenceToString(effect), "");
        if (typeof soft === "string" && soft.includes("/")) return { path: soft, source: "soft-path" };
        const loaded = safe(() => effect.Get(), null);
        if (valid(loaded)) return { path: path(loaded), source: "soft-loaded" };
        return { path: "", source: "soft-unresolved" };
    }
    const { probe: probeBulletSignals } = createBulletSignalProbe({ valid, path, list, effectPath });
    const bulletWarning = createBulletWarning({ valid, path, list, effectPath, requirements: evaluateRequirements });
    function bulletWarningEligibility(action, times, sourceASC, expectedPlan) {
        if (!genericAttackEnabled) return { eligible: false, reason: "generic-attack-disabled" };
        return safe(() => bulletWarning.eligibility(action, times, sourceASC, expectedPlan),
            { eligible: false, reason: "bullet-warning-proof-error" });
    }
    function eventTimes(event) {
        const startRaw = Number(safe(() => event.StartTime, NaN));
        let duration = Number(safe(() => event.duration, NaN));
        let durationField = "duration";
        if (!Number.isFinite(duration)) { duration = Number(safe(() => event.Duration, NaN)); durationField = "Duration"; }
        const trigger = Number(safe(() => event.TriggerTimeOffset, 0));
        const endOffset = Number(safe(() => event.EndTriggerTimeOffset, 0));
        return { start: startRaw + trigger, end: startRaw + duration + endOffset, startRaw, duration, trigger, endOffset, durationField };
    }
    function readField(object, field) {
        try {
            const value = object && object[field];
            return value === undefined || value === null ? { status: "missing" } : { status: "read", value };
        } catch (_) { return { status: "unreadable" }; }
    }
    function semanticFallbackEligibility(action) {
        // Match the probe's three aliases and finite-number conflict policy,
        // without reading any timing arrays or diagnostic-only fields per tick.
        const values = ["DeflectBulletType", "Deflect Bullet Type", "DeflectType"]
            .map(field => readField(action, field))
            .filter(item => item.status === "read" && typeof item.value === "number" && Number.isFinite(item.value))
            .map(item => item.value);
        if (!values.length) return { eligible: false, reason: "semantic-type-unavailable" };
        if (values.some(value => value !== values[0])) return { eligible: false, reason: "semantic-type-conflict" };
        return values[0] === 3 ? { eligible: true, reason: "eligible" } :
            { eligible: false, reason: "semantic-type-changed" };
    }
    function castWarningEligibility(action, context) {
        const rule = castWarningEnabled && matchCastWarning({ ...context, layer: "main",
            actionClass: path(safe(() => action.GetClass(), null)), effectPath: effectPath(action).path });
        return rule ? { eligible: true, reason: "eligible" } : { eligible: false, reason: "cast-scope-or-resource-changed" };
    }
    function snapshotArray(value, convert, limit = 128) {
        if (value === undefined || value === null) return { status: "missing", values: [] };
        try {
            const ordinary = Array.isArray(value);
            if (!ordinary && (typeof value.Num !== "function" || typeof value.Get !== "function"))
                return { status: "not-array", values: [] };
            const length = ordinary ? value.length : value.Num();
            if (!Number.isSafeInteger(length) || length < 0) return { status: "invalid-length", values: [] };
            const values = [], unreadableIndices = [];
            for (let i = 0; i < Math.min(length, limit); i++) {
                try { values.push(convert(ordinary ? value[i] : value.Get(i))); }
                catch (_) { values.push(null); unreadableIndices.push(i); }
            }
            return { status: "read", length, truncated: length > limit, values, unreadableIndices };
        } catch (_) { return { status: "unreadable", values: [] }; }
    }
    function tagName(tag) {
        if (typeof tag === "string") return tag;
        const native = safe(() => UE.BlueprintGameplayTagLibrary.GetTagName(tag), null);
        if (typeof native === "string") return native;
        const reflected = safe(() => tag.TagName, null);
        if (typeof reflected === "string") return reflected;
        const debug = safe(() => UE.BlueprintGameplayTagLibrary.GetDebugStringFromGameplayTag(tag), null);
        return typeof debug === "string" ? debug : null;
    }
    function tagContainerEvidence(container) {
        if (container === undefined || container === null) return { status: "missing" };
        const direct = Array.isArray(container);
        const tagsField = direct ? { status: "read", value: container } : readField(container, "GameplayTags");
        const parentsField = direct ? { status: "missing" } : readField(container, "ParentTags");
        return {
            status: "read", tagsFieldStatus: tagsField.status,
            tags: snapshotArray(tagsField.value, tagName),
            parentTagsFieldStatus: parentsField.status, parentTags: snapshotArray(parentsField.value, tagName),
            debug: safe(() => {
                const text = UE.BlueprintGameplayTagLibrary.GetDebugStringFromGameplayTagContainer(container);
                return typeof text === "string" ? text.slice(0, 4096) : null;
            }, null)
        };
    }
    function queryEvidence(query) {
        if (!query) return { status: "missing" };
        const version = readField(query, "TokenStreamVersion"), dictionary = readField(query, "TagDictionary");
        const tokens = readField(query, "QueryTokenStream");
        return {
            status: "read", empty: safe(() => UE.BlueprintGameplayTagLibrary.IsTagQueryEmpty(query), null),
            tokenStreamVersion: version.status === "read" && Number.isFinite(version.value) ? version.value : null,
            tagDictionary: snapshotArray(dictionary.value, tagName),
            queryTokenStream: snapshotArray(tokens.value, value => Number.isInteger(value) ? value : null, 256),
            userDescription: safe(() => typeof query.UserDescription === "string" ? query.UserDescription.slice(0, 1024) : null, null),
            autoDescription: safe(() => typeof query.AutoDescription === "string" ? query.AutoDescription.slice(0, 1024) : null, null)
        };
    }
    function nativeContext(action, selectedASC) {
        function getter(name) {
            try {
                if (typeof action[name] !== "function") return { status: "unavailable", path: "" };
                const value = action[name]();
                return { status: valid(value) ? "read" : "invalid", path: path(value) };
            } catch (_) { return { status: "unreadable", path: "" }; }
        }
        const actionASC = getter("GetAbilitySystemComponent");
        return { actionASC, avatar: getter("GetAvatarActor"), ability: getter("GetAbility"),
            selectedASC: path(selectedASC),
            actionASCMatchesSelected: actionASC.path ? actionASC.path === path(selectedASC) : null,
            policy: "diagnostic-only-do-not-replace-selected-context" };
    }
    function tagMatchEvidence(container, owned) {
        const raw = Array.isArray(container) ? container : safe(() => container.GameplayTags, null);
        return snapshotArray(raw, tag => ({ tag: tagName(tag), matchesOwned: safe(() => {
            // Preserve UE hierarchical tag matching. A JS string equality test
            // would incorrectly reject an owned child satisfying a required parent.
            const match = UE.BlueprintGameplayTagLibrary.HasTag(owned, tag, false);
            return typeof match === "boolean" ? match : null;
        }, null) }));
    }
    // captureEvidence is opt-in: per-frame eligibility keeps its small existing
    // API, while inventory can record the exact requirements and live owned tags.
    function requirements(action, asc, options) {
        if (!valid(action)) return { eligible: false, reason: "invalid-action" };
        return evaluateRequirements(action, asc, options);
    }
    function evaluateRequirements(action, asc, options) {
        let req = null, iface = null, owned = null;
        const evaluations = { requireAll: null, ignoreAny: null, queryEmpty: null, queryMatches: null };
        const capture = !!(options && options.captureEvidence);
        function finish(result) {
            if (!capture) return result;
            // Diagnostic reads must not turn a successful eligibility check into
            // a failure, or bypass a failed check. Never invoke K2_CanActivateAction.
            const required = readField(req, "RequireTags"), ignored = readField(req, "IgnoreTags"), query = readField(req, "TagQuery");
            const liveOwned = owned || safe(() => UE.BlueprintGameplayTagLibrary.GetOwnedGameplayTags(iface), null);
            return { ...result, evidence: {
                schemaVersion: 1, checkedASC: path(asc),
                requireFieldStatus: required.status, requireTags: tagContainerEvidence(required.value),
                ignoreFieldStatus: ignored.status, ignoreTags: tagContainerEvidence(ignored.value),
                queryFieldStatus: query.status, tagQuery: queryEvidence(query.value),
                ownedTags: tagContainerEvidence(liveOwned), evaluations: { ...evaluations },
                requiredTagMatches: tagMatchEvidence(required.value, liveOwned),
                ignoredTagMatches: tagMatchEvidence(ignored.value, liveOwned),
                actionContext: nativeContext(action, asc),
                extraBlueprintConditions: "not-executed-not-proven-by-tag-check"
            } };
        }
        try {
            req = action.ActivationRequirements;
            if (!req) return finish({ eligible: false, reason: "requirements-unavailable" });
            const tags = UE.BlueprintGameplayTagLibrary;
            iface = tags.Conv_ObjectToGameplayTagAssetInterface(asc);
            if (!iface) return finish({ eligible: false, reason: "tag-interface-unavailable" });
            evaluations.requireAll = tags.HasAllMatchingGameplayTags(iface, req.RequireTags);
            if (!evaluations.requireAll) return finish({ eligible: false, reason: "require-tags" });
            evaluations.ignoreAny = tags.HasAnyMatchingGameplayTags(iface, req.IgnoreTags);
            if (evaluations.ignoreAny) return finish({ eligible: false, reason: "ignore-tags" });
            if (req.TagQuery) {
                evaluations.queryEmpty = tags.IsTagQueryEmpty(req.TagQuery);
                if (!evaluations.queryEmpty) {
                    owned = tags.GetOwnedGameplayTags(iface);
                    evaluations.queryMatches = tags.DoesContainerMatchTagQuery(owned, req.TagQuery);
                    if (!evaluations.queryMatches) return finish({ eligible: false, reason: "tag-query" });
                }
            }
            return finish({ eligible: true, reason: "eligible" });
        } catch (e) { return finish({ eligible: false, reason: "requirements-error", detail: String(e).slice(0, 180) }); }
    }
    function activation(ability) {
        const n = safe(() => ability.GetActivationCount(), null);
        return (typeof n === "number" && Number.isFinite(n)) ? String(n) : "unknown";
    }
    function abilityTasks(ability) {
        const map = new Map();
        function add(task, source) {
            if (!valid(task)) return;
            const timeline = safe(() => task.Timeline, null);
            const t = Number(safe(() => task.CurrentTime, NaN));
            if (!valid(timeline) || !Number.isFinite(t)) return;
            const p = path(task);
            if (p && !map.has(p)) map.set(p, { task, source });
        }
        // Current task provides backwards compatibility; ActiveTasks handles
        // concurrent play tasks that a singular GetPlayTimelineTask cannot list.
        add(safe(() => ability.GetPlayTimelineTask(), null), "current");
        for (const task of list(safe(() => ability.ActiveTasks, null))) add(task, "active-tasks");
        return map;
    }
    function collectAbilities(asc) {
        const map = new Map();
        for (const spec of list(safe(() => asc.ActivatableAbilities.Items, null))) {
            if (!(safe(() => Number(spec.ActiveCount), 0) > 0)) continue;
            let instances = list(safe(() => spec.NonReplicatedInstances, null)).concat(list(safe(() => spec.ReplicatedInstances, null)));
            if (!instances.length) instances = [safe(() => spec.Ability, null)];
            for (const ability of instances) {
                if (!valid(ability) || safe(() => ability.bIsAbilityEnding, false) === true) continue;
                if (safe(() => ability.bIsActive, null) === false) continue;
                const p = path(ability); if (p) map.set(p, ability);
            }
        }
        // Only ticking tasks are an additional live entrance. KnownTasks may
        // contain inactive/finished tasks and is deliberately not a trigger list.
        for (const task of list(safe(() => asc.TickingTasks, null))) {
            const a = safe(() => task.Ability, null);
            if (valid(a) && safe(() => a.bIsActive, false) === true && !safe(() => a.bIsAbilityEnding, false)) {
                const p = path(a); if (p) map.set(p, a);
            }
        }
        return map;
    }
    function events(timeline, classify, asc, context, task, options = {}) {
        const captureDiagnostics = options.captureDiagnostics !== false;
        const groups = [{ label: "main", values: timeline.Actions,
            execution: { asc, actor: null, roleName: "", source: "main-asc", reason: null } }];
        list(safe(() => timeline.RoleLayers, null)).forEach((layer, i) => {
            const rawRole = safe(() => layer.RoleName, "");
            const roleName = typeof rawRole === "string" ? rawRole : "";
            let actor = null, roleASC = null, reason = null;
            if (!roleName || roleName === "None") reason = "role-name-unavailable";
            else {
                actor = safe(() => task.GetRoleActor(roleName), null);
                if (!valid(actor)) { actor = null; reason = "role-unbound"; }
                else {
                    roleASC = safe(() => actor.AbilitySystemComponent, null);
                    if (!valid(roleASC)) { roleASC = null; reason = "role-asc-unavailable"; }
                }
            }
            // The binding itself is read from the live task. Using the bound
            // actor's ASC for this role's tags is an explicit trial assumption;
            // SDK signatures alone do not establish native role tag semantics.
            groups.push({ label: "role" + i, values: layer.Actions,
                execution: { asc: roleASC, actor, roleName, source: "role-binding-asc-assumption", reason,
                    ...(captureDiagnostics ? { autoSpawnWhenUnbound: safe(() => layer.bAutoSpawnWhenNoBinding, null),
                        roleCharacterClass: path(safe(() => layer.RoleCharacterClass, null)) } : {}) } });
        });
        const found = [], inventory = [], seen = new Set(), checks = new Map(), contexts = new Map();
        let candidateScanUnresolved = false;
        const maxCandidateActions = 32;
        let probeActionBudget = maxCandidateActions, preparationActionBudget = maxCandidateActions;
        for (const group of groups) {
            list(group.values).forEach((event, index) => {
                const action = safe(() => event.Action, null);
                const actionPath = path(action);
                const actionClass = path(safe(() => action.GetClass(), null));
                const baseKey = group.label + "/" + index;
                if (!valid(action)) {
                    if (captureDiagnostics) inventory.push({ key: baseKey, roleName: group.execution.roleName, reason: "invalid-action" });
                    return;
                }
                const effect = effectPath(action);
                const times = eventTimes(event);
                const recognition = recognizeWarning({ effectPath: effect.path, actionClass }, classify);
                let color = recognition.color;
                const castRule = !genericAttackEnabled && castWarningEnabled && !color ? matchCastWarning({ actor: context.actor,
                    ability: context.ability, timeline: path(timeline), actionClass, effectPath: effect.path, layer: group.label }) : null;
                const fallbackScope = !genericAttackEnabled && semanticFallbackEnabled && !color ? matchSemanticFallbackScope({
                    actor: path(group.execution.actor) || context.actor,
                    ability: context.ability,
                    actionClass
                }) : null;
                const semantics = captureDiagnostics || fallbackScope ? probeAttackSemantics(action) : null;
                let preparationPlan = null;
                if (genericAttackEnabled && !color && supportsActionClass(actionClass) &&
                    !group.execution.reason && valid(group.execution.asc) && preparationActionBudget > 0) {
                    preparationActionBudget--;
                    preparationPlan = safe(() => bulletWarning.plan(action, times, group.execution.asc), null);
                }
                const semanticCandidate = !!semantics && (semantics.deflect.candidates.some(x => x.status === "read") ||
                    Object.values(semantics.timing).some(x => x.status === "read") ||
                    Object.values(semantics.arrays).some(x => x.status === "read"));
                const guid = safe(() => [event.Guid.A, event.Guid.B, event.Guid.C, event.Guid.D], []);
                const hasGuid = guid.length === 4 && guid.every(Number.isFinite) && guid.some(x => x !== 0);
                // Share only an identical GUID + action identity + exact timing.
                // Distinct nodes at the same relative time remain distinct.
                const executionKey = group.label === "main" ? "main" : "role:" + group.execution.roleName + "|" + path(group.execution.actor);
                const key = hasGuid ? executionKey + "|" + guid.join(":") + "|" + actionPath + "|" + times.start + "|" + times.end : baseKey;
                const info = { ...context, key: baseKey, action: actionPath, actionClass, effect: effect.path,
                    effectSource: effect.source, color, recognition, ...times, roleName: group.execution.roleName,
                    roleActor: path(group.execution.actor), requirementsASC: path(group.execution.asc),
                    eligibilitySource: group.execution.source,
                    reason: color ? "recognized" : recognition.source === "unconfirmed-black-pair" ? recognition.reason :
                        semanticCandidate ? "attack-semantics-timing-unverified" :
                        effect.source === "no-NiagaraEffect" ? "non-niagara-action" : "unrecognized-effect" };
                if (captureDiagnostics) {
                    info.roleContext = { mainASC: path(asc), boundActor: path(group.execution.actor),
                        boundASC: path(group.execution.asc), bindingReason: group.execution.reason,
                        autoSpawnWhenUnbound: group.execution.autoSpawnWhenUnbound,
                        roleCharacterClass: group.execution.roleCharacterClass };
                    info.attackSemantics = { ...semantics, timingBasis: "unverified-not-scheduled", usedForScheduling: false };
                    let bulletSignals;
                    if (probeActionBudget <= 0) {
                        bulletSignals = { status: "unresolved", usedForScheduling: false, candidates: [],
                            unresolved: true, limits: { maxActions: maxCandidateActions }, issues: ["timeline-probe-cap"] };
                    } else {
                        probeActionBudget--;
                        try { bulletSignals = probeBulletSignals(action, times); }
                        catch (_) {
                            // Observation failure must never discard ordinary warning nodes.
                            bulletSignals = { status: "unresolved", usedForScheduling: false, candidates: [],
                                unresolved: true, limits: {}, issues: ["probe-error"] };
                        }
                    }
                    if (bulletSignals.unresolved) candidateScanUnresolved = true;
                    if (bulletSignals.candidates.length || bulletSignals.unresolved || bulletSignals.status !== "no-bullet-data")
                        info.bulletSignalCandidates = bulletSignals;
                    inventory.push(info);
                }
                // Inspect known warning nodes and semantic candidates even when
                // not schedulable. A role binding failure is never bypassed.
                const tagCheck = color || semanticCandidate || castRule || preparationPlan ? requirements(action, group.execution.asc,
                    captureDiagnostics ? { captureEvidence: true } : undefined) : null;
                if (tagCheck && captureDiagnostics) {
                    info.requirementsEvidence = tagCheck.evidence;
                    info.requirementsReason = tagCheck.reason;
                }
                if (!color) {
                    const rule = fallbackScope ? matchSemanticFallback({
                        actor: path(group.execution.actor) || context.actor,
                        ability: context.ability,
                        actionClass,
                        semantics
                    }) : null;
                    if (!rule && !preparationPlan && !castRule) return;
                    if (castRule) {
                        color = castRule.color; info.color = color;
                        info.castWarning = { ruleId: castRule.id, phase: castRule.phase,
                            timingBasis: castRule.timingBasis, interpretation: castRule.interpretation,
                            usedForScheduling: false, executionVerified: false };
                        info.recognition = { color, supported: true, source: "cast-warning",
                            timingBasis: castRule.timingBasis, reason: "scoped-cast-resource" };
                    } else if (preparationPlan) {
                        color = preparationPlan.color;
                        info.color = color;
                        // Retain the original JSON-safe plan: its factory privately
                        // owns the selected native identity proof used before emit.
                        info.bulletWarning = preparationPlan;
                        info.recognition = { color, supported: true, source: "bullet-preparation",
                            timingBasis: preparationPlan.timingBasis, reason: "authored-preparation-candidate" };
                    } else {
                        color = rule.color;
                        info.color = color;
                        info.semanticFallback = {
                            schemaVersion: 1, ruleId: rule.id, testedBuild: rule.testedBuild,
                            color, typeValue: rule.typeValue, typeName: rule.typeName,
                            timingBasis: rule.timingBasis, interpretation: rule.interpretation,
                            usedForScheduling: false, status: "recognized-candidate", executionVerified: false
                        };
                        info.recognition = { color, supported: true, source: "semantic-fallback",
                            timingBasis: rule.timingBasis, reason: "recognized-evidence-rule" };
                    }
                }
                if (![times.start, times.end].every(Number.isFinite) || times.end < times.start) {
                    info.reason = "invalid-time"; return;
                }
                const eligibility = group.execution.reason ? { eligible: false, reason: group.execution.reason } : tagCheck;
                info.reason = eligibility.reason;
                if (eligibility.detail) info.detail = eligibility.detail;
                if (seen.has(key)) return;
                seen.add(key);
                if (info.semanticFallback) {
                    info.semanticFallback.usedForScheduling = true;
                    info.semanticFallback.status = "scheduled";
                    if (info.attackSemantics) {
                        info.attackSemantics.timingBasis = info.semanticFallback.timingBasis;
                        info.attackSemantics.usedForScheduling = true;
                    }
                }
                if (info.castWarning) info.castWarning.usedForScheduling = true;
                // Point notifications remain exact points. The scheduler can
                // preannounce them without manufacturing a gameplay duration.
                // Identity belongs to the physical node, not its recognition
                // source. Late Niagara resolution must retain the fired
                // tombstone. The Scheduler separately owns task/activation
                // generations; different nodes are never merged by colour.
                found.push({ key, color, start: times.start, end: times.end,
                    ...(castRule ? { leadSeconds: castLeadSeconds } : {}),
                    eligible: eligibility.eligible, meta: info });
                checks.set(key, action);
                contexts.set(key, group.execution);
            });
        }
        return { events: found, inventory, checks, contexts, candidateScanUnresolved };
    }
    function configureSemanticFallback(enabled) { semanticFallbackEnabled = enabled === true; }
    function configureGenericAttack(enabled) { genericAttackEnabled = enabled === true; }
    function configureCastWarning(enabled, leadSeconds) {
        castWarningEnabled = enabled === true;
        castLeadSeconds = typeof leadSeconds === "number" && Number.isFinite(leadSeconds) ?
            Math.max(0, Math.min(1, leadSeconds)) : 0.35;
    }
    return { safe, valid, path, list, effectPath, eventTimes, requirements, activation, abilityTasks, collectAbilities,
        events, configureSemanticFallback, configureGenericAttack, semanticFallbackEligibility, bulletWarningEligibility,
        configureCastWarning, castWarningEligibility };
}
module.exports = { createAdapter };
