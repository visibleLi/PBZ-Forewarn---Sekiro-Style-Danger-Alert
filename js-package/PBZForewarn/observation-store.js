"use strict";

// Observation only: copies JSON data, retains no engine object, and makes no cue
// decisions. Neither a shared source nor HitGameTime proves that a hit occurred.
const DEFAULTS = Object.freeze({ maxRecords: 1024, maxBytes: 512 * 1024,
    maxCorrelationComparisons: 4096, maxCorrelationRows: 128 });
const MAXIMUM = Object.freeze({ maxRecords: 2048, maxBytes: 1024 * 1024,
    maxCorrelationComparisons: 8192, maxCorrelationRows: 256 });
const IDENTITY = ["worldKey", "player", "clockEpoch", "actor", "ability", "activation", "action"];
const OPTIONAL_IDENTITY = ["task", "timeline", "eventKey", "attackId", "handle"];
const PLAN_KINDS = new Set(["warning-plan", "attack-plan"]);
const MAX_CANDIDATE_SEQS = 64;
const UNKNOWN = /^(?:unknown|unavailable|none|null|undefined|n\/a|\[.+\])$/i;

function utf8Bytes(text) {
    let count = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c < 0x80) count++;
        else if (c < 0x800) count += 2;
        else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length &&
            text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { count += 4; i++; }
        else count += 3;
    }
    return count;
}
function limit(value, fallback, maximum) {
    return Number.isFinite(value) ? Math.max(1, Math.min(maximum, Math.floor(value))) : fallback;
}
function identity(value) {
    if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
    return typeof value === "string" && value.length > 0 && value.trim() === value &&
        !UNKNOWN.test(value) ? value : null;
}
function plain(value) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype) return true;
    // Puerts tests and the main runtime may use separate JavaScript realms.
    const ctor = Object.getOwnPropertyDescriptor(prototype, "constructor");
    return Object.getPrototypeOf(prototype) === null && ctor && "value" in ctor &&
        typeof ctor.value === "function" && ctor.value.name === "Object";
}
function sanitize(value, issues, path, ancestors, depth) {
    const issue = reason => { issues.push({ path, reason }); return null; };
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : issue("non-finite");
    if (typeof value === "string") {
        if (value.length <= 4096) return value;
        issues.push({ path, reason: "string-truncated" });
        return value.slice(0, 4080) + "[truncated]";
    }
    if (typeof value !== "object") return issue("non-json-value");
    if (depth >= 8) return issue("depth-limit");
    if (ancestors.has(value)) return issue("cycle");
    try {
        if (!Array.isArray(value) && !plain(value)) return issue("non-plain-object");
        ancestors.add(value);
        let result;
        if (Array.isArray(value)) {
            result = [];
            const size = Math.min(value.length, 64);
            for (let i = 0; i < size; i++) {
                const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
                result.push(descriptor && "value" in descriptor
                    ? sanitize(descriptor.value, issues, path + "." + i, ancestors, depth + 1)
                    : (issues.push({ path: path + "." + i, reason: "accessor-or-hole" }), null));
            }
            if (value.length > size) issues.push({ path, reason: "array-truncated" });
        } else {
            result = Object.create(null);
            const keys = Object.getOwnPropertyNames(value).sort();
            for (const key of keys.slice(0, 64)) {
                if (key.length > 128) { issues.push({ path, reason: "key-too-long" }); continue; }
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                result[key] = descriptor && "value" in descriptor
                    ? sanitize(descriptor.value, issues, path ? path + "." + key : key, ancestors, depth + 1)
                    : (issues.push({ path: path ? path + "." + key : key, reason: "accessor" }), null);
            }
            if (keys.length > 64) issues.push({ path, reason: "keys-truncated" });
        }
        ancestors.delete(value);
        return Object.freeze(result);
    } catch (_) {
        ancestors.delete(value);
        return issue("unreadable-object");
    }
}
function sourceIdentity(event) {
    const values = [];
    for (const key of OPTIONAL_IDENTITY) {
        if ((event.sanitization || []).some(x => x.path === key)) return { reason: "invalid-identity:" + key };
    }
    for (const key of IDENTITY) {
        if ((event.sanitization || []).some(x => x.path === key || x.path === ""))
            return { reason: "invalid-identity:" + key };
        const value = key !== "activation" && key !== "clockEpoch" && typeof event[key] !== "string"
            ? null : identity(event[key]);
        if (value === null) return { reason: "missing-identity:" + key };
        values.push(value);
    }
    return { key: JSON.stringify(values) };
}
function sameOptional(a, b, key) {
    const av = identity(a[key]), bv = identity(b[key]);
    return av === null || bv === null || av === bv;
}
function strikeEvidence(plan, frame) {
    let evidence = "source-only";
    for (const field of ["attackId", "eventKey"]) {
        const a = identity(plan[field]), b = identity(frame[field]);
        if (a !== null && b !== null) {
            if (a !== b) return null;
            if (evidence === "source-only") evidence = "shared-" + field;
        }
    }
    return evidence;
}
function unitKey(event, sourceKey, native) {
    const stroke = native
        ? [identity(event.handle), event.hitGameTime ?? null, identity(event.attackId), identity(event.eventKey)]
        : [identity(event.eventKey), identity(event.attackId), event.start ?? null, event.end ?? null,
            event.warningGameTime ?? null];
    // Missing a handle/strike key cannot collapse different observations safely.
    const distinct = native ? stroke[0] === null && stroke[2] === null && stroke[3] === null
        : stroke[0] === null && stroke[1] === null;
    return JSON.stringify([event.kind, sourceKey, identity(event.task), identity(event.timeline), stroke, distinct ? event.seq : null]);
}
function correlations(events, limits) {
    const plans = new Map(), frames = new Map(), ineligible = [];
    for (const event of events) {
        const native = event.kind === "native-frame";
        if (!native && !PLAN_KINDS.has(event.kind)) continue;
        const source = sourceIdentity(event);
        if (!source.key) {
            ineligible.push({ kind: event.kind, observationSeqs: [event.seq], status: "unlinked", reason: source.reason });
            continue;
        }
        const key = unitKey(event, source.key, native), collection = native ? frames : plans;
        let unit = collection.get(key);
        if (!unit) {
            unit = { key, source: source.key, event, observationSeqs: [], firstGameTime: null };
            collection.set(key, unit);
        }
        unit.observationSeqs.push(event.seq);
        if (typeof event.gameTime === "number" && event.gameTime >= 0 &&
            (unit.firstGameTime === null || event.gameTime < unit.firstGameTime)) unit.firstGameTime = event.gameTime;
    }
    const buckets = new Map(), result = [];
    const statuses = { suggestedUniqueSources: 0, ambiguous: 0, unlinked: 0 };
    const planCorrelations = Object.create(null);
    for (const kind of PLAN_KINDS) planCorrelations[kind] = { count: 0, suggestedUniqueSources: 0, ambiguous: 0, unlinked: 0 };
    const analysis = { maxComparisons: limits.maxCorrelationComparisons, comparisons: 0,
        maxRows: limits.maxCorrelationRows, emittedRows: 0, totalRows: 0, omittedRows: 0,
        omittedObservationRecords: 0, sourceBuckets: 0, indexedPlanUnits: plans.size, indexedNativeFrameUnits: frames.size,
        unavailableIdentityUnits: ineligible.length, analyzedPlanUnits: 0, unanalysedPlanUnits: 0,
        unanalysedNativeFrameUnits: 0, unanalysedObservationRecords: 0, budgetExceededSources: 0,
        comparisonBudgetExceeded: false, rowsTruncated: false, truncated: false, complete: true };
    function emit(row) {
        const status = row.status === "suggested-unique-source" ? "suggestedUniqueSources"
            : row.status === "ambiguous" ? "ambiguous" : "unlinked";
        statuses[status]++;
        if (PLAN_KINDS.has(row.kind)) { planCorrelations[row.kind].count++; planCorrelations[row.kind][status]++; }
        analysis.totalRows++;
        if (result.length >= limits.maxCorrelationRows) {
            analysis.omittedRows++; analysis.omittedObservationRecords += row.observationSeqs.length;
            return;
        }
        result.push(row);
    }
    for (const row of ineligible) emit(row);
    function bucket(source) {
        if (!buckets.has(source)) buckets.set(source, { plans: [], frames: [] });
        return buckets.get(source);
    }
    for (const plan of plans.values()) bucket(plan.source).plans.push(plan);
    for (const frame of frames.values()) bucket(frame.source).frames.push(frame);
    analysis.sourceBuckets = buckets.size;
    for (const group of buckets.values()) {
        const requiredComparisons = group.plans.length * group.frames.length;
        if (requiredComparisons > limits.maxCorrelationComparisons - analysis.comparisons) {
            // Partial evaluation of this source could make the first plan look
            // unique while an unexamined sibling competes for the same frame.
            // Skip the entire source bucket; other smaller buckets may still fit.
            analysis.budgetExceededSources++;
            analysis.unanalysedPlanUnits += group.plans.length;
            analysis.unanalysedNativeFrameUnits += group.frames.length;
            for (const unit of group.plans.concat(group.frames)) {
                analysis.unanalysedObservationRecords += unit.observationSeqs.length;
                emit({ kind: unit.event.kind, observationSeqs: [...unit.observationSeqs], status: "unlinked",
                    reason: "analysis-budget-exceeded", scope: "retained-events-only",
                    confirmedHit: false, confirmedWarningBegin: false });
            }
            continue;
        }
        const choices = new Map(), claims = new Map();
        for (const plan of group.plans) {
            const candidates = [];
            for (const frame of group.frames) {
                analysis.comparisons++;
                if (sameOptional(plan.event, frame.event, "task") && sameOptional(plan.event, frame.event, "timeline") &&
                    strikeEvidence(plan.event, frame.event) !== null) {
                    candidates.push(frame); claims.set(frame, (claims.get(frame) || 0) + 1);
                }
            }
            choices.set(plan, candidates);
        }
        analysis.analyzedPlanUnits += group.plans.length;
        for (const plan of group.plans) {
            const candidates = choices.get(plan), unique = candidates.length === 1 && claims.get(candidates[0]) === 1;
            const candidateSeqs = [];
            let candidateObservationCount = 0;
            // Sequence detail is needed only for rows that will be emitted.
            if (result.length < limits.maxCorrelationRows) for (const candidate of candidates) {
                candidateObservationCount += candidate.observationSeqs.length;
                for (const sequence of candidate.observationSeqs) {
                    if (candidateSeqs.length >= MAX_CANDIDATE_SEQS) break;
                    candidateSeqs.push(sequence);
                }
            }
            const row = { kind: plan.event.kind, observationSeqs: [...plan.observationSeqs],
                status: unique ? "suggested-unique-source" : candidates.length ? "ambiguous" : "unlinked",
                reason: unique ? "one-compatible-plan-and-frame" : candidates.length ? "multiple-plans-or-frames" : "no-compatible-native-frame",
                nativeObservationSeqs: candidateSeqs, nativeCandidateCount: candidates.length,
                nativeObservationSeqsOmitted: candidateObservationCount - candidateSeqs.length,
                scope: "retained-events-only", confirmedHit: false, confirmedWarningBegin: false };
            if (unique && result.length < limits.maxCorrelationRows) {
                const frame = candidates[0], hit = frame.event.hitGameTime;
                row.identityEvidence = strikeEvidence(plan.event, frame.event);
                row.perStrikeIdentity = row.identityEvidence !== "source-only";
                // Both are explicitly game-clock values in one caller-supplied epoch.
                // Timeline StartTime and wallTime are deliberately never subtracted.
                if (typeof hit === "number" && hit >= 0 && frame.firstGameTime !== null)
                    row.reportedFrameLeadToHitMs = (hit - frame.firstGameTime) * 1000;
                if (typeof plan.event.warningGameTime === "number" && plan.event.warningGameTime >= 0 && frame.firstGameTime !== null)
                    row.frameBeforePlannedWarningMs = (plan.event.warningGameTime - frame.firstGameTime) * 1000;
            }
            emit(row);
        }
        for (const frame of group.frames) {
            if (!claims.has(frame)) emit({ kind: "native-frame", observationSeqs: [...frame.observationSeqs],
                status: "unlinked", reason: "no-compatible-plan", confirmedHit: false, confirmedWarningBegin: false });
        }
    }
    analysis.emittedRows = result.length;
    analysis.comparisonBudgetExceeded = analysis.budgetExceededSources > 0;
    analysis.rowsTruncated = analysis.omittedRows > 0;
    analysis.truncated = analysis.comparisonBudgetExceeded || analysis.rowsTruncated;
    analysis.complete = !analysis.truncated;
    return { rows: result, statuses, planCorrelations, analysis };
}

// A second, bounded evidence lane preserves small facts from a long session.
// Its references describe objects, not confirmed strike identities or outcomes.
function createEvidenceStore(options) {
    const maxBytes = limit(options.maxEvidenceBytes, 256 * 1024, 384 * 1024);
    const maxRecords = limit(options.maxEvidenceRecords, 1024, 1536);
    const maxDictionaryBytes = Math.min(maxBytes, limit(options.maxEvidenceDictionaryBytes, 96 * 1024, 128 * 1024));
    const maxDictionaryEntries = limit(options.maxEvidenceDictionaryEntries, 768, 1024);
    const queues = [new Map(), new Map(), new Map(), new Map()];
    const dictionary = new Map(), paths = new Map(), dedupe = new Map();
    const totals = Object.create(null), kinds = Object.create(null);
    let bytes = 2, dictionaryBytes = 2, nextId = 0, size = 0;
    const counters = { observed: 0, accepted: 0, evicted: 0, deduplicated: 0, rejected: 0,
        priorityProtectedDrops: 0, oversized: 0, dictionaryDrops: 0, omittedPaths: 0, kindOverflow: 0 };
    const priorities = [0, 1, 2, 3].map(() => ({ accepted: 0, evicted: 0, rejected: 0, count: 0 }));
    const pathFields = ["worldKey", "player", "actor", "ability", "action", "task", "timeline", "previousTimeline", "nextTimeline",
        "previousAbility", "nextAbility", "effect", "bullet",
        "component", "ownerActorCandidate", "roleActorCandidate", "captureWorld", "boundWorld"];
    const scalarFields = ["id", "eventKey", "attackId", "activation", "clockEpoch", "recordSerial", "handle", "source", "fallbackRule", "reason",
        "phase", "color", "eligible", "typeName", "typeValue", "typeConflict", "hitTimeStatus", "impactVerified",
        "perHitIdentityVerified", "executableBranchConfirmed", "roleActorUnresolved", "usedForScheduling",
        "wallTime", "at", "gameTime", "firstWallTime", "firstGameTime", "hitGameTime", "reportedHitGameTime", "hitTimeUsableForFutureComparison", "remainingGameSeconds",
        "bulletReferenceStatus", "bulletInstancePresent", "bulletLifecycleVerified", "bulletDangerEndedVerified",
        "start", "end", "time", "taskTimelineTime", "firstObservedTimelineTime", "firstObservedGameTime", "firstObservedWallTime",
        "previousTimelineTime", "currentTimelineTime", "observationRun", "discoverySource", "identityBasis", "hookSession", "hookSeq",
        "startOffset", "startTimeSeconds", "observedRate", "event", "status", "terminationSource",
        "plannedStart", "observedTimelineTime", "estimatedLeadGameSeconds", "soundSubmitted", "generation",
        "authoredStartTime", "triggerTimeOffset", "endTriggerTimeOffset", "deltaTimelineTime", "deltaGameTime", "cause",
        "replacesRecordSerial", "startTimeVerified", "executionVerified", "interpretation", "clockSource", "playerHitCauseVerified",
        "callbackContextVerified", "callbackContextReason", "timingBasis", "temporalAssociation", "scanned", "truncated", "unreadable", "layers",
        "typed", "timed", "standard", "generic", "ignored", "branchConfirmed", "spellWarningCandidate",
        "spellPhase", "cueEnabled", "castRule", "castCueId", "castRecordSerial", "mainRecordSerial", "associationBasis"];
    function countKind(kind) {
        if (Object.hasOwn(totals, kind)) { totals[kind]++; return; }
        if (Object.keys(totals).length < 64) { totals[kind] = 1; kinds[kind] = { retained: 0, evicted: 0, deduplicated: 0, rejected: 0 }; }
        else counters.kindOverflow++;
    }
    function priority(kind, event) {
        if (["warning-cue", "warning-withdrawal", "warning-suppressed", "warning-missed", "missed", "focused-call-summary"].includes(kind)) return 3;
        // Preserve every scanned timeline phase, including a mage's Success
        // branch, even when it has no red/blue type or warning resource.
        if (kind === "timeline-observer-status") return 2;
        if (["task-lifecycle", "timeline-branch-transition", "native-task-start", "timeline-start", "timeline-observer-status"].includes(kind)) {
            const ability = typeof event.ability === "string" ? event.ability : "";
            const focus = ability.includes("FeiZei_SpecialAttack_07") || ability.includes("Vessel_Vagrant_RangeAttack_Throw_02") ||
                (ability.includes("YuCong") && ability.includes("Wuli_Attack_01_B"));
            return focus ? 3 : 2;
        }
        if (["warning-plan", "native-warning-call"].includes(kind)) return 2;
        if (kind === "attack-plan" && (event.spellWarningCandidate ||
            event.genericColor && event.genericEvidencePolicy)) return 3;
        if (kind === "spell-warning-observation") return 3;
        return kind.startsWith("native-frame") || kind === "timeline-call" ? 1 : 0;
    }
    function retainPath(value, refs) {
        if (typeof value !== "string" || !value || UNKNOWN.test(value)) return null;
        let entry = paths.get(value);
        if (!entry) {
            const id = ++nextId, entryBytes = utf8Bytes(JSON.stringify(String(id))) + 1 + utf8Bytes(JSON.stringify(value));
            entry = { id, value, refs: 0, bytes: entryBytes };
            dictionaryBytes += entryBytes + (dictionary.size ? 1 : 0); dictionary.set(id, entry); paths.set(value, entry);
        }
        entry.refs++; refs.push(entry.id); return entry.id;
    }
    function release(refs) {
        for (const id of refs) {
            const entry = dictionary.get(id);
            if (!entry || --entry.refs > 0) continue;
            dictionary.delete(id); paths.delete(entry.value);
            dictionaryBytes -= entry.bytes + (dictionary.size ? 1 : 0);
        }
    }
    function remove(item) {
        queues[item.priority].delete(item.record.seq); size--;
        bytes -= item.bytes + (size ? 1 : 0); release(item.refs);
        if (item.key) dedupe.delete(item.key);
        counters.evicted++; priorities[item.priority].count--; priorities[item.priority].evicted++;
        if (kinds[item.record.kind]) { kinds[item.record.kind].retained--; kinds[item.record.kind].evicted++; }
    }
    function oldestAtMost(p) {
        for (let i = 0; i <= p; i++) if (queues[i].size) return queues[i].values().next().value;
        return null;
    }
    const scalar = value => value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string";
    function record(event) {
        counters.observed++; countKind(event.kind);
        const p = priority(event.kind, event), refs = [], r = { seq: event.seq, kind: event.kind, priority: p }, pathRefs = Object.create(null);
        const issues = event.sanitization || [];
        function ref(field, value, sourcePath = field) {
            if (issues.some(x => x.path === sourcePath && /truncat|non-json|non-finite/.test(x.reason))) { counters.omittedPaths++; return; }
            const id = retainPath(value, refs); if (id !== null) pathRefs[field] = id;
        }
        for (const field of pathFields) ref(field, event[field]);
        for (const field of scalarFields) if (Object.hasOwn(event, field) && scalar(event[field])) {
            if (["eventKey", "attackId"].includes(field) && typeof event[field] === "string" && event[field].length > 128) ref(field, event[field]);
            else r[field] = event[field];
        }
        const capture = event.capture, context = capture && capture.context;
        if (capture) {
            r.capture = {};
            for (const key of ["phase", "thread", "matching", "callbackSemantics", "callId", "atWallMs"])
                if (scalar(capture[key]) && capture[key] !== undefined) r.capture[key] = capture[key];
            ref("hookPath", capture.hookPath, "capture.hookPath");
            if (capture.gameTime) r.capture.gameTime = Object.freeze({ ...capture.gameTime });
            if (context) {
                for (const field of ["actor", "ability", "action", "task", "timeline", "world", "captureWorld", "effect"])
                    ref("capture." + field, context[field], "capture.context." + field);
                for (const field of ["activation", "taskTime"])
                    if (context[field]) r.capture[field] = Object.freeze({ ...context[field] });
                for (const field of ["nativeExecutionConfirmed", "taskCorrelation", "warningResourceMatched", "attackAssociation"])
                    if (scalar(context[field]) && context[field] !== undefined) r.capture[field] = context[field];
            }
            if (capture.params) {
                r.capture.params = {};
                for (const key of ["status", "source", "abiVerified", "StartTimeSeconds", "PlayRate", "PreviousTimlineName", "SyncPoint",
                    "BeginTime", "ElapsedTime", "TotalDuration"]) {
                    const value = capture.params[key];
                    if (scalar(value) && value !== undefined) r.capture.params[key] = value;
                    else if (value && scalar(value.value)) r.capture.params[key] = Object.freeze({ status: value.status, value: value.value });
                }
                const timeline = capture.params.Timeline;
                if (timeline && typeof timeline.value === "string") ref("param.Timeline", timeline.value, "capture.params.Timeline.value");
            }
            if (event.kind === "focused-call-summary") {
                for (const field of ["firstSeq", "lastSeq", "taskCorrelation", "attackAssociation", "abiVerified", "interpretation"])
                    if (scalar(capture[field]) && capture[field] !== undefined) r.capture[field] = capture[field];
                for (const field of ["ability", "actor", "action", "captureWorld", "effect"]) ref("capture." + field, capture[field]);
                if (capture.activation) r.capture.activation = Object.freeze({ ...capture.activation });
                for (const side of ["first", "last"]) {
                    const point = capture[side]; if (!point) continue;
                    const out = {};
                    for (const key of ["phase", "atWallMs", "matching"]) if (scalar(point[key]) && point[key] !== undefined) out[key] = point[key];
                    for (const key of ["gameTime", "taskTime"]) if (point[key]) out[key] = Object.freeze({ ...point[key] });
                    for (const key of ["task", "timeline"]) ref("capture." + side + "." + key, point[key]);
                    if (point.params) {
                        out.params = {};
                        for (const key of ["StartTimeSeconds", "PlayRate", "SyncPoint", "PreviousTimlineName", "BeginTime", "ElapsedTime", "TotalDuration"])
                            if (point.params[key] && scalar(point.params[key].value)) out.params[key] = Object.freeze({ ...point.params[key] });
                        Object.freeze(out.params);
                    }
                    r.capture[side] = Object.freeze(out);
                }
            }
            Object.freeze(r.capture.params); Object.freeze(r.capture);
        }
        if (event.attackSemantics) {
            const a = event.attackSemantics, attack = {};
            if (a.timing) for (const key of ["BulletDuration", "PreHitPointDuration", "RuntimePreHitPointDuration"])
                if (a.timing[key]) attack[key] = Object.freeze({ ...a.timing[key] });
            if (a.arrays) for (const key of ["StartBulletTimes", "EndBulletTimes", "SendFrameTimes"]) {
                const value = a.arrays[key]; if (!value) continue;
                attack[key] = Object.freeze({ status: value.status, length: value.length,
                    values: Array.isArray(value.values) ? Object.freeze(value.values.slice(0, 8)) : null,
                    truncated: value.truncated === true || (value.values?.length || 0) > 8 });
            }
            if (Object.keys(attack).length) r.attack = Object.freeze(attack);
        }
        if (event.termination) {
            r.termination = {};
            for (const key of ["source", "taskValid", "abilityValid", "abilityActive", "abilityEnding", "lastTimelineTime", "currentTimelineTime",
                "lastProgressAgoMs", "naturalWarningEndsSeen", "callback", "playerHitCauseVerified"])
                if (scalar(event.termination[key]) && event.termination[key] !== undefined) r.termination[key] = event.termination[key];
            ref("termination.task", event.termination.task); ref("termination.ability", event.termination.ability);
            Object.freeze(r.termination);
        }
        if (issues.length) r.sanitizedValues = issues.length;
        if (Object.keys(pathRefs).length) r.refs = Object.freeze(pathRefs);
        // Deduplicate stable plans/status facts only. Never combine cue attempts,
        // callbacks, misses, or lifecycle transitions by their nearby timestamp.
        let key = null;
        const stable = ["attack-plan", "warning-plan", "spell-warning-observation", "timeline-observer-status", "native-observer-status",
            "timeline-branch-transition"].includes(event.kind);
        const hasScope = pathRefs.worldKey && pathRefs.player && pathRefs.actor && pathRefs.ability && pathRefs.task &&
            identity(event.activation) !== null && identity(event.clockEpoch) !== null;
        if (stable && hasScope) {
            const fields = [event.kind, pathRefs, event.clockEpoch, event.activation, event.recordSerial, event.observationRun,
                event.eventKey, event.attackId, event.handle, event.start, event.end, event.eligible,
                event.typeName, event.typeValue, event.reason, event.status, event.scanned, event.truncated, event.unreadable,
                event.typed, event.timed, event.standard, event.generic, event.ignored,
                event.phase, event.branchConfirmed, event.spellWarningCandidate, event.spellPhase, event.cueEnabled, r.attack];
            // Missing action/event identity cannot collapse two attack nodes.
            if (!PLAN_KINDS.has(event.kind) || pathRefs.action || identity(event.eventKey) !== null) key = JSON.stringify(fields);
        }
        if (key && dedupe.has(key)) {
            release(refs); counters.deduplicated++; if (kinds[event.kind]) kinds[event.kind].deduplicated++; return;
        }
        Object.freeze(r);
        const recordBytes = utf8Bytes(JSON.stringify(r));
        // Reject a record that cannot fit even on its own before evicting useful
        // history. Repeated references count only once in the dictionary cost.
        const uniqueRefs = [...new Set(refs)];
        const ownDictionaryBytes = 2 + uniqueRefs.reduce((sum, id) => sum + dictionary.get(id).bytes, 0) + Math.max(0, uniqueRefs.length - 1);
        if (recordBytes + 2 + ownDictionaryBytes > maxBytes || ownDictionaryBytes > maxDictionaryBytes || uniqueRefs.length > maxDictionaryEntries) {
            if (ownDictionaryBytes > maxDictionaryBytes || uniqueRefs.length > maxDictionaryEntries) counters.dictionaryDrops++;
            counters.oversized++; counters.rejected++; priorities[p].rejected++;
            if (kinds[event.kind]) kinds[event.kind].rejected++;
            release(refs); return;
        }
        function overBudget() { return size >= maxRecords || bytes + recordBytes + (size ? 1 : 0) + dictionaryBytes > maxBytes ||
            dictionaryBytes > maxDictionaryBytes || dictionary.size > maxDictionaryEntries; }
        while (overBudget()) {
            const old = oldestAtMost(p); if (!old) break; remove(old);
        }
        if (overBudget()) {
            const dictionaryFull = dictionaryBytes > maxDictionaryBytes || dictionary.size > maxDictionaryEntries;
            if (dictionaryFull) counters.dictionaryDrops++;
            if (recordBytes + dictionaryBytes + 2 > maxBytes) counters.oversized++;
            if (size && !oldestAtMost(p)) counters.priorityProtectedDrops++;
            release(refs); counters.rejected++; priorities[p].rejected++;
            if (kinds[event.kind]) kinds[event.kind].rejected++;
            return;
        }
        const item = { record: r, refs, bytes: recordBytes, priority: p, key };
        bytes += recordBytes + (size ? 1 : 0); size++;
        queues[p].set(r.seq, item); if (key) dedupe.set(key, item);
        counters.accepted++; priorities[p].accepted++; priorities[p].count++;
        if (kinds[event.kind]) kinds[event.kind].retained++;
    }
    function snapshot() {
        const records = []; for (const q of queues) for (const item of q.values()) records.push(item.record);
        records.sort((a, b) => a.seq - b.seq);
        const dict = Object.create(null); for (const [id, entry] of dictionary) dict[id] = entry.value;
        return { schemaVersion: 1, mode: "compact-observation-evidence", records, dictionary: Object.freeze(dict),
            referenceFormat: "record.refs values are dictionary IDs; absent identity remains unknown",
            counters: { ...counters, kindCounts: { ...totals }, kinds: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, { ...v }])) },
            retention: { count: size, maxRecords, recordBytes: bytes, dictionaryBytes, bytes: bytes + dictionaryBytes,
                maxBytes, byteScope: "records-array-plus-dictionary-object-json; metadata-excluded",
                dictionaryEntries: dictionary.size, maxDictionaryEntries, maxDictionaryBytes,
                priorities: priorities.map(x => ({ ...x })), firstSeq: records[0]?.seq ?? null, lastSeq: records.at(-1)?.seq ?? null,
                completeHistory: counters.evicted === 0 && counters.rejected === 0 && counters.deduplicated === 0 },
            interpretation: "compact retained facts only; cumulative kind counts are not coverage or confirmed hits" };
    }
    return { record, snapshot };
}

// Keep totals and the latest actionable fact after both detailed lanes evict.
// This is a third bounded observation lane; it never creates or changes a cue.
function createEncounterStore(options) {
    const maxActors = limit(options.maxEncounterActors, 128, 256);
    const maxAbilities = limit(options.maxEncounterAbilities, 128, 256);
    const maxBytes = limit(options.maxEncounterBytes, 64 * 1024, 128 * 1024);
    const actors = new Map(), sessionCounts = counts();
    let bytes = 2;
    const counters = { observed: 0, attributed: 0, unattributed: 0, actorsEvicted: 0,
        abilitiesEvicted: 0, namedValuesOmitted: 0, snapshotRowsOmitted: 0 };
    const scalar = value => value === null || typeof value === "boolean" ||
        typeof value === "number" && Number.isFinite(value) || typeof value === "string";
    const known = identity;
    function counts() {
        return { events: 0, warningCue: 0, warningMissed: 0, warningWithdrawal: 0,
            warningSuppressed: 0, warningPlan: 0, attackPlan: 0, nativeFrame: 0,
            nativeFrameEnded: 0, nativeWarningCall: 0, taskLifecycle: 0, timelineCall: 0, other: 0 };
    }
    function colors() { return { red: 0, blue: 0, black: 0, unknown: 0 }; }
    function bumpCounts(value, kind) {
        value.events++;
        const field = kind === "warning-cue" ? "warningCue" :
            kind === "warning-missed" || kind === "missed" ? "warningMissed" :
            kind === "warning-withdrawal" ? "warningWithdrawal" :
            kind === "warning-suppressed" ? "warningSuppressed" :
            kind === "warning-plan" ? "warningPlan" :
            kind === "attack-plan" ? "attackPlan" :
            kind === "native-frame" ? "nativeFrame" :
            kind === "native-frame-ended" ? "nativeFrameEnded" :
            kind === "native-warning-call" ? "nativeWarningCall" :
            kind === "task-lifecycle" ? "taskLifecycle" :
            kind === "timeline-call" ? "timelineCall" : "other";
        value[field]++;
    }
    function updateTime(value, event) {
        if (value.firstSeq === null) value.firstSeq = event.seq;
        value.lastSeq = event.seq;
        const wall = [event.at, event.wallTime].find(x => typeof x === "number" && Number.isFinite(x) && x >= 0);
        if (wall !== undefined) {
            value.firstWall = value.firstWall === null ? wall : Math.min(value.firstWall, wall);
            value.lastWall = value.lastWall === null ? wall : Math.max(value.lastWall, wall);
        }
        if (typeof event.gameTime === "number" && event.gameTime >= 0) {
            if (value.firstGameTime === null) value.firstGameTime = event.gameTime;
            value.lastGameTime = event.gameTime;
        }
    }
    function updateFact(value, event) {
        const important = event.kind.startsWith("warning-") || event.kind === "missed";
        if (!important && value.lastFact && value.lastFact.kind.startsWith("warning-")) return;
        const fact = { seq: event.seq, kind: event.kind };
        for (const field of ["at", "gameTime", "start", "end", "time", "reason", "color",
            "typeName", "typeValue", "generation", "eventKey", "attackId", "timeline", "task",
            "action", "activation", "firstObservedTimelineTime", "taskTimelineTime", "recordSerial",
            "observationRun", "executionVerified", "usedForScheduling"])
            if (scalar(event[field]) && !(event.sanitization || []).some(x => x.path === field)) fact[field] = event[field];
        value.lastFact = fact;
    }
    function updateColors(value, event) {
        if (event.kind !== "warning-cue") return;
        value.colors[["red", "blue", "black"].includes(event.color) ? event.color : "unknown"]++;
    }
    function bumpNamed(map, value) {
        const key = known(value) || "unknown";
        if (!Object.hasOwn(map, key) && Object.keys(map).length >= 16) {
            counters.namedValuesOmitted++; return;
        }
        map[key] = (map[key] || 0) + 1;
    }
    function emptyValue(key, actor) {
        return { key, actor, counts: counts(), colors: colors(), firstSeq: null, lastSeq: null,
            firstWall: null, lastWall: null, firstGameTime: null, lastGameTime: null,
            lastFact: null, score: 0 };
    }
    function score(value) {
        if (value.counts.warningCue || value.counts.warningMissed) return 3;
        if (value.counts.warningWithdrawal || value.counts.warningSuppressed || value.counts.warningPlan) return 2;
        return value.counts.nativeFrame || value.counts.nativeWarningCall || value.counts.attackPlan ? 1 : 0;
    }
    function leastImportant(map, actorMap = false) {
        let victim = null;
        for (const [key, entry] of map) {
            const value = actorMap ? entry.value : entry;
            if (!victim || value.score < victim.value.score ||
                value.score === victim.value.score && value.lastSeq < victim.value.lastSeq)
                victim = { key, value, entry };
        }
        return victim;
    }
    function removeAbility(summary, key) {
        const detail = summary.abilities.get(key);
        summary.abilities.delete(key);
        const removed = detail.bytes + (summary.abilities.size ? 1 : 0);
        bytes -= removed; summary.bytes -= removed; counters.abilitiesEvicted++;
    }
    function removeActor(key) {
        const summary = actors.get(key);
        actors.delete(key); bytes -= summary.bytes + (actors.size ? 1 : 0); counters.actorsEvicted++;
    }
    function enforceBudget() {
        while (bytes > maxBytes) {
            let victim = null;
            for (const summary of actors.values()) {
                const candidate = leastImportant(summary.abilities);
                if (candidate && (!victim || candidate.value.score < victim.value.score ||
                    candidate.value.score === victim.value.score && candidate.value.lastSeq < victim.value.lastSeq))
                    victim = { ...candidate, summary };
            }
            if (victim) removeAbility(victim.summary, victim.key);
            else if (actors.size) removeActor(leastImportant(actors, true).key);
            else break;
        }
    }
    function refreshHeader(summary) {
        const header = publicValue(summary.value);
        delete header.ability; delete header.missedReasons; delete header.nativeTypes;
        summary.header = { world: summary.world, ...header };
        const size = utf8Bytes(JSON.stringify({ ...summary.header, abilities: [] }));
        bytes += size - summary.headerBytes; summary.bytes += size - summary.headerBytes;
        summary.headerBytes = size;
    }
    function record(event) {
        counters.observed++;
        bumpCounts(sessionCounts, event.kind);
        const trusted = field => typeof event[field] !== "string" ||
            (event.sanitization || []).some(x => x.path === field) ? null : known(event[field]);
        // Owner/role candidates are not confirmed execution actors.
        const actor = trusted("actor");
        if (actor === null) { counters.unattributed++; return; }
        counters.attributed++;
        const world = trusted("worldKey") ?? trusted("world") ?? trusted("captureWorld") ?? trusted("boundWorld");
        const actorKey = JSON.stringify([world, actor]);
        let summary = actors.get(actorKey);
        if (!summary) {
            while (actors.size >= maxActors) removeActor(leastImportant(actors, true).key);
            summary = { world, value: emptyValue(actorKey, actor), abilities: new Map(), headerBytes: 0, bytes: 0 };
            if (actors.size) bytes++;
            actors.set(actorKey, summary);
        }
        updateTime(summary.value, event);
        bumpCounts(summary.value.counts, event.kind);
        updateColors(summary.value, event);
        updateFact(summary.value, event);
        summary.value.score = score(summary.value);
        refreshHeader(summary);
        const ability = trusted("ability");
        if (ability === null) { enforceBudget(); return; }
        let detail = summary.abilities.get(ability);
        if (!detail) {
            while (summary.abilities.size >= maxAbilities) removeAbility(summary, leastImportant(summary.abilities).key);
            detail = emptyValue(ability, actor);
            detail.bytes = 0;
            detail.ability = ability;
            detail.missedReasons = Object.create(null);
            detail.nativeTypes = Object.create(null);
            if (summary.abilities.size) { bytes++; summary.bytes++; }
            summary.abilities.set(ability, detail);
        }
        updateTime(detail, event);
        bumpCounts(detail.counts, event.kind);
        updateColors(detail, event);
        updateFact(detail, event);
        if (event.kind === "warning-missed" || event.kind === "missed") bumpNamed(detail.missedReasons, event.reason);
        if (event.kind === "native-frame" || event.kind === "native-frame-ended" || event.kind === "native-warning-call") {
            bumpNamed(detail.nativeTypes, event.typeName);
        }
        detail.score = score(detail);
        detail.cached = publicValue(detail);
        const size = utf8Bytes(JSON.stringify(detail.cached));
        bytes += size - detail.bytes; summary.bytes += size - detail.bytes; detail.bytes = size;
        enforceBudget();
    }
    function publicValue(value) {
        return { actor: value.actor, ability: value.ability, counts: Object.freeze({ ...value.counts }), colors: Object.freeze({ ...value.colors }),
            missedReasons: value.missedReasons ? { ...value.missedReasons } : undefined,
            nativeTypes: value.nativeTypes ? { ...value.nativeTypes } : undefined,
            firstSeq: value.firstSeq, lastSeq: value.lastSeq, firstWall: value.firstWall, lastWall: value.lastWall,
            firstGameTime: value.firstGameTime, lastGameTime: value.lastGameTime,
            lastFact: value.lastFact ? Object.freeze({ ...value.lastFact }) : null };
    }
    function snapshot() {
        const rows = [...actors.values()].map(summary => ({ ...summary.header,
            abilities: [...summary.abilities.values()].map(detail => ({ ...detail.cached,
                missedReasons: { ...detail.cached.missedReasons }, nativeTypes: { ...detail.cached.nativeTypes } })) }));
        return { schemaVersion: 2, mode: "bounded-encounter-summary",
            actors: rows, counters: { ...counters }, sessionCounts: { ...sessionCounts },
            retention: { count: rows.length, maxActors, maxAbilitiesPerActor: maxAbilities, bytes, maxBytes,
                byteScope: "actors-json-array; metadata-excluded",
                complete: counters.actorsEvicted === 0 && counters.abilitiesEvicted === 0 &&
                    counters.namedValuesOmitted === 0 && counters.unattributed === 0 },
            interpretation: "colors count emitted warning-cue records only; observed totals survive detail eviction; not confirmed hits or a coverage rate" };
    }
    return { record, snapshot };
}

function createObservationStore(options = {}) {
    const enabled = options.enabled !== false;
    const session = typeof options.session === "string" ? options.session.slice(0, 256) : "";
    const maxRecords = limit(options.maxRecords, DEFAULTS.maxRecords, MAXIMUM.maxRecords);
    const maxBytes = limit(options.maxBytes, DEFAULTS.maxBytes, MAXIMUM.maxBytes);
    const correlationLimits = {
        maxCorrelationComparisons: limit(options.maxCorrelationComparisons, DEFAULTS.maxCorrelationComparisons, MAXIMUM.maxCorrelationComparisons),
        maxCorrelationRows: limit(options.maxCorrelationRows, DEFAULTS.maxCorrelationRows, MAXIMUM.maxCorrelationRows)
    };
    const items = [], evidence = createEvidenceStore(options), encounters = createEncounterStore(options);
    let bytes = 2, seq = 0;
    const counts = { attempted: 0, accepted: 0, disabled: 0, rejected: 0, sanitizedValues: 0, evicted: 0, oversized: 0 };
    function record(kind, data) {
        counts.attempted++;
        if (!enabled) { counts.disabled++; return false; }
        if (typeof kind !== "string" || !kind.trim() || kind.length > 80 || kind !== kind.trim()) {
            counts.rejected++; return false;
        }
        const issues = [];
        const copied = sanitize(data, issues, "", new Set(), 0);
        if (!copied || typeof copied !== "object" || Array.isArray(copied)) { counts.rejected++; return false; }
        const event = Object.assign(Object.create(null), copied, { kind, seq: ++seq });
        // Caller fields cannot hide sanitation issues or supply trusted sequence IDs.
        delete event.sanitization;
        if (issues.length) event.sanitization = Object.freeze(issues.map(x => Object.freeze(x)));
        counts.sanitizedValues += issues.length;
        Object.freeze(event);
        encounters.record(event);
        evidence.record(event);
        const size = utf8Bytes(JSON.stringify(event));
        if (size + 2 > maxBytes) { counts.oversized++; counts.rejected++; return false; }
        while (items.length && (items.length >= maxRecords || bytes + size + 1 > maxBytes)) {
            const old = items.shift(); bytes -= old.bytes + (items.length ? 1 : 0); counts.evicted++;
        }
        bytes += size + (items.length ? 1 : 0); items.push({ event, bytes: size }); counts.accepted++;
        return true;
    }
    function snapshot() {
        const events = items.map(x => x.event), links = correlations(events, correlationLimits), kinds = Object.create(null);
        for (const event of events) kinds[event.kind] = (kinds[event.kind] || 0) + 1;
        return { schemaVersion: 1, mode: "observe-only", session, enabled, events,
            counters: { ...counts, count: items.length, bytes, maxRecords, maxBytes, byteScope: "events-json-array",
                firstSeq: events.length ? events[0].seq : null, lastSeq: events.length ? events.at(-1).seq : null },
            summary: { kindCounts: kinds, ...links.statuses, planCorrelations: links.planCorrelations,
                completeHistory: enabled && counts.disabled === 0 && counts.evicted === 0 && counts.rejected === 0,
                interpretation: "candidate-correlations-only; no coverage rate or confirmed hits" },
            correlations: links.rows, analysis: links.analysis, evidence: evidence.snapshot(),
            encounterSummary: encounters.snapshot() };
    }
    return { record, snapshot };
}

module.exports = { createObservationStore };
