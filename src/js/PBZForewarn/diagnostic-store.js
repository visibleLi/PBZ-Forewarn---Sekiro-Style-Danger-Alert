"use strict";

// Pure JS diagnostic retention. No UObject access, timers, or disk writes.
// Critical battle history is independent from noisy discovery and asset data.
const ACTIVITY = new Set(["task-found", "timeline-coverage", "active-ability-no-timeline",
    "hook-hint", "rate-jump", "eligibility", "native-task-stalled", "hud-show", "hud-ready"]);
const MAX = Object.freeze({ recentCount: 2048, recentBytes: 512 * 1024,
    activityCount: 256, activityBytes: 64 * 1024, catalogCount: 128, catalogBytes: 384 * 1024 });

function utf8Bytes(text) {
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code < 0x80) bytes++;
        else if (code < 0x800) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length &&
            text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
        else bytes += 3;
    }
    return bytes;
}

function createDiagnosticStore(options = {}) {
    let enabled = options.enabled !== false;
    const now = typeof options.now === "function" ? options.now : () => Date.now();
    const limits = {};
    for (const [name, maximum] of Object.entries(MAX)) {
        const supplied = options.limits && options.limits[name];
        limits[name] = Number.isFinite(supplied) ? Math.max(1, Math.min(maximum, Math.floor(supplied))) : maximum;
    }
    const once = new Map(), assets = new Map();
    let catalogBytes = 0, version = 0, savedVersion = 0;
    const catalogCounts = { total: 0, dropped: 0, oversized: 0, unchanged: 0, disabled: 0,
        rejectedLowerPriority: 0, promoted: 0 };
    const recent = bucket("recent"), activity = bucket("activity");

    function bucket(name) { return { name, items: [], bytes: 0, total: 0, dropped: 0, oversized: 0, suppressed: 0, disabled: 0 }; }
    function clean(value, depth = 0, visited = new Set()) {
        if (value === null || typeof value === "boolean") return value;
        if (typeof value === "number") return Number.isFinite(value) ? value : null;
        if (typeof value === "string") return value.length <= 1024 ? value : value.slice(0, 1008) + "[truncated]";
        if (typeof value === "bigint") return String(value);
        if (typeof value !== "object") return "[unsupported]";
        if (depth >= 8) return "[depth-limit]";
        if (visited.has(value)) return "[cycle]";
        let prototype;
        try { prototype = Object.getPrototypeOf(value); } catch (_) { return "[unreadable-object]"; }
        const constructor = prototype && Object.getOwnPropertyDescriptor(prototype, "constructor");
        const foreignPlain = prototype && Object.getPrototypeOf(prototype) === null && constructor &&
            "value" in constructor && typeof constructor.value === "function" && constructor.value.name === "Object";
        if (!Array.isArray(value) && prototype !== null && prototype !== Object.prototype && !foreignPlain) return "[non-plain-object]";
        visited.add(value);
        let result;
        if (Array.isArray(value)) {
            result = [];
            const length = Math.min(value.length, 64);
            for (let i = 0; i < length; i++) {
                const property = Object.getOwnPropertyDescriptor(value, String(i));
                result.push(property && "value" in property ? clean(property.value, depth + 1, visited) : "[accessor]" );
            }
            if (value.length > length) result.push("[array-truncated]");
        } else {
            result = Object.create(null);
            const keys = Object.getOwnPropertyNames(value).sort();
            for (const key of keys.slice(0, 64)) {
                const property = Object.getOwnPropertyDescriptor(value, key);
                result[key.slice(0, 128)] = property && "value" in property ? clean(property.value, depth + 1, visited) : "[accessor]";
            }
            if (keys.length > 64) result.__truncatedKeys = keys.length - 64;
        }
        visited.delete(value);
        return Object.freeze(result);
    }
    function envelope(kind, data) {
        const safeData = clean(data && typeof data === "object" ? data : {});
        const record = Object.assign(Object.create(null), safeData && typeof safeData === "object" ? safeData : {});
        record.kind = String(kind).slice(0, 80);
        record.at = typeof record.at === "number" && Number.isFinite(record.at) ? record.at : now();
        return Object.freeze(record);
    }
    function add(target, record) {
        target.total++;
        const bytes = utf8Bytes(JSON.stringify(record));
        if (bytes > limits[target.name + "Bytes"]) { target.dropped++; target.oversized++; return false; }
        while (target.items.length && (target.items.length >= limits[target.name + "Count"] ||
            target.bytes + bytes > limits[target.name + "Bytes"])) {
            target.bytes -= target.items.shift().bytes; target.dropped++;
        }
        target.items.push({ record, bytes }); target.bytes += bytes; return true;
    }
    function record(kind, data, onceKey) {
        if (kind === "inventory") return catalog(data);
        const target = ACTIVITY.has(kind) ? activity : recent;
        if (!enabled && target === activity) { target.disabled++; return false; }
        if (onceKey) {
            const key = String(onceKey).slice(0, 1024), time = now();
            if (once.has(key) && time >= once.get(key) && time - once.get(key) < 10000) { target.suppressed++; return false; }
            once.delete(key); once.set(key, time);
            while (once.size > 1024) once.delete(once.keys().next().value);
        }
        return add(target, envelope(kind, data));
    }
    function normalized(value) { return typeof value === "string" ? value.replace(/_C_\d+(?=\b|[.\/|])/g, "_C_*") : value; }
    function automaticIdentity(data) {
        return JSON.stringify([data.actionClass, normalized(data.action), data.effect, data.key,
            data.start, data.end, data.roleName].map(x => x === undefined ? null : x));
    }
    function signature(data) {
        // Canonical object keys from clean() make property insertion order irrelevant.
        const stable = Object.assign(Object.create(null), data); delete stable.at;
        return JSON.stringify(stable);
    }
    function priorityValue(value) { return Number.isFinite(value) ? Math.max(0, Math.min(2, Math.floor(value))) : 0; }
    function catalog(data, identity, priority = 0) {
        if (!enabled) { catalogCounts.disabled++; return false; }
        catalogCounts.total++;
        const safeData = clean(data && typeof data === "object" ? data : {});
        const safeObject = safeData && typeof safeData === "object" ? safeData : {};
        const key = String(identity === undefined ? automaticIdentity(safeObject) : identity).slice(0, 1536);
        const hash = signature(safeObject), previous = assets.get(key);
        const nextPriority = Math.max(priorityValue(priority), previous ? previous.priority : 0);
        if (previous && previous.signature === hash && previous.priority === nextPriority) { catalogCounts.unchanged++; return false; }
        const entry = Object.freeze({ key, priority: nextPriority, data: safeObject });
        const bytes = utf8Bytes(JSON.stringify(entry));
        if (bytes > limits.catalogBytes) { catalogCounts.dropped++; catalogCounts.oversized++; return false; }
        // Plan evictions first. Unknown candidates must never remove an actual
        // warning merely because hundreds of ordinary/unknown nodes came later.
        let remainingCount = assets.size - (previous ? 1 : 0);
        let remainingBytes = catalogBytes - (previous ? previous.bytes : 0);
        const victims = [];
        const eligible = [...assets.entries()].filter(([otherKey, asset]) => otherKey !== key && asset.priority <= nextPriority)
            .sort((a, b) => a[1].priority - b[1].priority);
        for (const [otherKey, asset] of eligible) {
            if (remainingCount < limits.catalogCount && remainingBytes + bytes <= limits.catalogBytes) break;
            victims.push(otherKey); remainingCount--; remainingBytes -= asset.bytes;
        }
        if (remainingCount >= limits.catalogCount || remainingBytes + bytes > limits.catalogBytes) {
            catalogCounts.dropped++; catalogCounts.rejectedLowerPriority++; return false;
        }
        if (previous) { catalogBytes -= previous.bytes; assets.delete(key); }
        for (const otherKey of victims) {
            catalogBytes -= assets.get(otherKey).bytes; assets.delete(otherKey); catalogCounts.dropped++;
        }
        assets.set(key, { entry, bytes, signature: hash, priority: nextPriority }); catalogBytes += bytes; version++; return true;
    }
    function hasCatalog(identity) { return assets.has(String(identity).slice(0, 1536)); }
    function promote(identity, priority = 2) {
        const key = String(identity).slice(0, 1536), previous = assets.get(key);
        if (!previous || previous.priority >= priorityValue(priority)) return false;
        const nextPriority = priorityValue(priority);
        const entry = Object.freeze({ key, priority: nextPriority, data: previous.entry.data });
        const bytes = utf8Bytes(JSON.stringify(entry));
        // Priorities are one-digit 0..2, so promotion preserves the byte budget.
        catalogBytes += bytes - previous.bytes;
        assets.set(key, { ...previous, entry, bytes, priority: nextPriority });
        catalogCounts.promoted++; version++; return true;
    }
    function retention(target) {
        return { count: target.items.length, bytes: target.bytes, total: target.total, dropped: target.dropped,
            oversized: target.oversized, suppressed: target.suppressed, disabled: target.disabled,
            firstAt: target.items.length ? target.items[0].record.at : null,
            lastAt: target.items.length ? target.items[target.items.length - 1].record.at : null };
    }
    function catalogRetention() { return { count: assets.size, bytes: catalogBytes, ...catalogCounts }; }
    function snapshot() {
        return { recent: recent.items.map(x => x.record), activity: activity.items.map(x => x.record),
            retention: { recent: retention(recent), activity: retention(activity) },
            catalog: { version, ...catalogRetention() } };
    }
    function catalogSnapshot() { return { version, entries: [...assets.values()].map(x => x.entry), retention: catalogRetention() }; }
    function markCatalogSaved(value) {
        if (Number.isInteger(value) && value >= 0 && value <= version) savedVersion = Math.max(savedVersion, value);
    }
    return { record, catalog, hasCatalog, promote, snapshot, catalogSnapshot, markCatalogSaved,
        setEnabled: value => { enabled = value === true; }, catalogDirty: () => savedVersion !== version };
}

module.exports = { createDiagnosticStore };
