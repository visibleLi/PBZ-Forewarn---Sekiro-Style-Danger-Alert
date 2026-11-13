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

function createObservationStore(options = {}) {
    const enabled = options.enabled !== false;
    const session = typeof options.session === "string" ? options.session.slice(0, 256) : "";
    const maxRecords = limit(options.maxRecords, DEFAULTS.maxRecords, MAXIMUM.maxRecords);
    const maxBytes = limit(options.maxBytes, DEFAULTS.maxBytes, MAXIMUM.maxBytes);
    const correlationLimits = {
        maxCorrelationComparisons: limit(options.maxCorrelationComparisons, DEFAULTS.maxCorrelationComparisons, MAXIMUM.maxCorrelationComparisons),
        maxCorrelationRows: limit(options.maxCorrelationRows, DEFAULTS.maxCorrelationRows, MAXIMUM.maxCorrelationRows)
    };
    const items = [];
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
            correlations: links.rows, analysis: links.analysis };
    }
    return { record, snapshot };
}

module.exports = { createObservationStore };
