"use strict";

// Read-only evidence, not proof that a mixer/device is available. The reflected
// AkSettings flags describe configured routing; actual playback needs its own
// observations. Class.ClassDefaultObject is in CoreUObject.d.ts:197, and
// AkSettings / EAkUnrealAudioRouting in AkAudio.d.ts:1144-1200,1864-1871.
// Object.Find looks up existing UObjects only. Never Load or create a CDO.
const CLASS_PATH = "/Script/AkAudio.AkSettings";
const DEFAULT_PATH = "/Script/AkAudio.Default__AkSettings";
const ROUTES = Object.freeze({
    0: "EnableWwiseOnly", 1: "Separate", 2: "AudioLink", 3: "AudioMixer", 4: "EnableUnrealOnly"
});
const FLAGS = ["bWwiseSoundEngineEnabled", "bWwiseAudioLinkEnabled", "bAkAudioMixerEnabled"];

function createAudioEnvironmentProbe(UE, adapter) {
    let cached = null, cachedSource = "";
    const attempt = fn => { try { return { ok: true, value: fn() }; } catch (_) { return { ok: false }; } };
    const valid = value => !!value && attempt(() => adapter.valid(value)).value === true;
    function empty(status) {
        const snapshot = { status, source: "", path: "", AudioRouting: { status, value: null, name: null } };
        for (const field of FLAGS) snapshot[field] = { status, value: null };
        return snapshot;
    }
    function field(object, key, type) {
        const read = attempt(() => object[key]);
        if (!read.ok) return { status: "unreadable", value: null };
        if (read.value === undefined || read.value === null) return { status: "missing", value: null };
        if (typeof read.value !== type || (type === "number" && !Number.isInteger(read.value)))
            return { status: "unreadable", value: null };
        return { status: "read", value: read.value };
    }
    return function inspectEnvironment() {
        try {
            if (!valid(cached)) {
                cached = null; cachedSource = "";
                const find = attempt(() => UE.Object.Find);
                if (!find.ok) return empty("unreadable");
                if (typeof find.value !== "function") return empty("missing");
                const klass = attempt(() => UE.Object.Find(CLASS_PATH));
                const fromClass = valid(klass.value)
                    ? attempt(() => klass.value.ClassDefaultObject) : { ok: klass.ok, value: null };
                if (valid(fromClass.value)) { cached = fromClass.value; cachedSource = "class-default-object"; }
                else {
                    const direct = attempt(() => UE.Object.Find(DEFAULT_PATH));
                    if (valid(direct.value)) { cached = direct.value; cachedSource = "default-object-path"; }
                    else return empty(!klass.ok || !fromClass.ok || !direct.ok ? "unreadable" : "missing");
                }
            }
            const snapshot = empty("read");
            snapshot.source = cachedSource;
            const path = attempt(() => adapter.path(cached));
            snapshot.path = path.ok && typeof path.value === "string" ? path.value.slice(0, 256) : "";
            const route = field(cached, "AudioRouting", "number");
            snapshot.AudioRouting = { ...route, name: route.status === "read" ? ROUTES[route.value] || "unknown" : null };
            for (const key of FLAGS) snapshot[key] = field(cached, key, "boolean");
            if ([snapshot.AudioRouting, ...FLAGS.map(key => snapshot[key])].some(item => item.status !== "read"))
                snapshot.status = "partial";
            return snapshot;
        } catch (_) { return empty("unreadable"); }
    };
}

module.exports = { createAudioEnvironmentProbe };
