"use strict";

// Observation only. This module never sends input, changes a tag, queries a
// defence result, executes an action, or makes a cue decision. UObject/container
// wrappers are read synchronously; only primitive snapshots survive the call.
const { probeAttackSemantics } = require("./attack-semantics-probe");
const EVENTS = Object.freeze([
    "GameplayEvent.Ability.Action.Deflect.Frame.Deflect.Defender",
    "GameplayEvent.Ability.Action.Deflect.Frame.Dodge.Defender"
]);
const TYPE_FIELDS = Object.freeze(["DeflectBulletType", "Deflect Bullet Type", "DeflectType"]);

function createNativeAttackObserver(UE, puerts, adapter, options = {}) {
    const enabled = options.enabled === true;
    const onRecord = typeof options.onRecord === "function" ? options.onRecord : () => {};
    const maximum = Number.isSafeInteger(options.maxFrames) ? Math.max(1, Math.min(512, options.maxFrames)) : 128;
    const slotLimit = Math.max(1024, maximum * 8);
    const records = new Map(), listeners = [], retired = [];
    const counters = { seen: 0, changed: 0, missing: 0, suppressed: 0, errors: 0,
        incompleteScans: 0, evicted: 0, listenerFailures: 0, outputFailures: 0 };
    let context = null, playerObject = null, componentObject = null, componentPath = "";
    let bindingKey = "", serial = 0, generation = 0, stopped = false, token = 0;
    let nextListenerTry = 0, tick = 0, lastGame = null, mapState = "not-sampled";
    const once = new Map();
    const safe = (fn, fallback = null) => { try { const v = fn(); return v === undefined || v === null ? fallback : v; } catch (_) { return fallback; } };
    const valid = value => !!value && safe(() => adapter.valid(value), false) === true;
    const path = value => valid(value) ? safe(() => adapter.path(value), "") : "";
    const read = (value, key) => safe(() => value[key]);
    const finite = value => typeof value === "number" && Number.isFinite(value);
    const call = (value, name) => valid(value) && typeof read(value, name) === "function" ? safe(() => value[name]()) : null;
    function emit(kind, data) {
        try { onRecord(kind, data); } catch (_) { counters.outputFailures++; }
    }
    function base() {
        return { worldKey: context ? context.worldKey : "", player: context ? context.playerPath : "",
            clockEpoch: context ? context.clockEpoch : null, gameTime: context ? context.gameTime : null,
            wallTime: context ? context.wallTime : null, component: componentPath };
    }
    function report(reason, extra = {}) {
        // Changes of state are useful; emitting the same failure every frame is not.
        const key = reason + ":" + JSON.stringify(extra);
        if (once.has(key)) return;
        once.set(key, true); if (once.size > 128) once.delete(once.keys().next().value);
        emit("native-observer-status", { ...base(), reason, ...extra });
    }
    function closeListener(listener) {
        // UObject validity is checked before calling the cleanup method. A
        // JavaScript try/catch cannot protect every invalid native invocation.
        if (!valid(listener)) return true;
        try { listener.EndAction(); return true; }
        catch (_) { counters.listenerFailures++; return false; }
    }
    function cleanRetired() {
        // No more than the two listeners from a binding can remain queued here;
        // do not create another binding until their EndAction succeeds.
        for (let i = retired.length - 1; i >= 0; i--) if (closeListener(retired[i])) retired.splice(i, 1);
    }
    function unbind(reason) {
        token++;
        for (const listener of listeners.splice(0)) if (!closeListener(listener)) retired.push(listener);
        if (records.size) emit("native-observer-status", { ...base(), reason, abandoned: records.size,
            interpretation: "observation-boundary-not-attack-cancellation" });
        records.clear(); componentObject = null; componentPath = ""; playerObject = null;
        bindingKey = ""; generation++; nextListenerTry = 0; lastGame = null;
    }
    function resolveComponent(player) {
        const cls = safe(() => UE.DeflectComponent.StaticClass());
        if (valid(cls) || cls !== null) {
            const method = read(player, "GetComponentByClass");
            if (typeof method === "function") {
                const found = safe(() => method.call(player, cls));
                if (valid(found)) return found;
            }
        }
        const explicit = call(player, "GetDeflectComponent");
        if (valid(explicit)) return explicit;
        const property = read(player, "DeflectComponent");
        return valid(property) ? property : null;
    }
    function snapshot(frame, handle, captureClock) {
        if (!frame || !Number.isSafeInteger(handle) || handle < 0) return null;
        const action = read(frame, "SourceAction"), ability = call(action, "GetAbility");
        const actor = call(action, "GetAvatarActor"), timeline = call(action, "GetTimeline");
        const currentTask = call(ability, "GetPlayTimelineTask");
        const timelinePath = path(timeline);
        const taskMatches = valid(currentTask) && !!timelinePath && path(read(currentTask, "Timeline")) === timelinePath;
        const count = call(ability, "GetActivationCount");
        const activation = finite(count) && count >= 0 ? String(count) : "";
        // Reuse the existing type interpretation, but do not make its diagnostic
        // timing/array probes cross the engine bridge for every active frame.
        // These accessors live only for this synchronous probe invocation.
        const typeView = Object.create(null);
        if (valid(action)) for (const field of TYPE_FIELDS)
            Object.defineProperty(typeView, field, { get: () => action[field] });
        const semantics = probeAttackSemantics(typeView).deflect;
        const hit = read(frame, "HitGameTime"), bullet = read(frame, "Bullet");
        const stamp = { ...base(), ...(captureClock || {}) };
        const plausibleHit = finite(hit) && hit >= 0 && hit <= Number.MAX_SAFE_INTEGER;
        const clockKnown = finite(stamp.gameTime) && stamp.gameTime >= 0 && Number.isSafeInteger(stamp.clockEpoch) && stamp.clockEpoch >= 0;
        const remaining = plausibleHit && clockKnown ? hit - stamp.gameTime : null;
        const bulletValid = valid(bullet), bulletPath = bulletValid ? path(bullet) : "";
        return { ...stamp, handle, action: path(action), actor: path(actor), ability: path(ability), activation,
            // A shared timeline resource does not identify which concurrent
            // play task created this frame. Keep the current task as a candidate
            // only; correlation must not mistake it for exact task ownership.
            task: null, taskCandidate: taskMatches ? path(currentTask) : null,
            taskIdentity: taskMatches ? "current-task-shared-timeline-candidate-only" : "unavailable-or-unmatched",
            timeline: timelinePath, bullet: bulletPath,
            bulletReferenceStatus: bulletValid ? "instance-reference-read" : bullet ? "invalid-or-unreadable-reference" : "not-reported",
            bulletInstancePresent: bulletValid, bulletLifecycleVerified: false, bulletDangerEndedVerified: false,
            bulletEvidence: "native-frame-reference-not-proof-of-spawn-impact-or-persistent-danger",
            typeValue: semantics.value, typeName: semantics.name, typeConflict: semantics.conflict,
            typeCandidates: semantics.candidates,
            hitGameTime: plausibleHit ? hit : null, reportedHitGameTime: finite(hit) ? hit : null,
            hitTimeStatus: !finite(hit) ? "non-finite-or-unreadable" : hit < 0 ? "negative-placeholder" :
                !plausibleHit ? "unsafe-magnitude" : !clockKnown ? "clock-context-unavailable" :
                remaining < 0 ? "past-reported-time-not-impact-verified" : "finite-not-impact-verified",
            hitTimeUsableForFutureComparison: plausibleHit && clockKnown && remaining >= 0,
            isDodge: typeof read(frame, "IsDodge") === "boolean" ? read(frame, "IsDodge") : null,
            isHit: typeof read(frame, "IsHit") === "boolean" ? read(frame, "IsHit") : null,
            remainingGameSeconds: remaining,
            timingBasis: "engine-game-time-not-wall-time", impactVerified: false, cancelled: false };
    }
    function observe(frame, handle, source, seen, captureClock) {
        const value = snapshot(frame, handle, captureClock);
        if (!value) { counters.errors++; return false; }
        if (seen) seen.add(handle);
        if (captureClock && captureClock.callbackContextVerified === false) {
            // A queued callback can cross a map/clock change before update sees
            // it. Preserve its facts, but do not merge it into the last binding.
            counters.seen++;
            emit("native-frame", { ...value, id: "native-unverified-" + (++serial), phase: "seen", source,
                firstSource: source, sources: [source], firstGameTime: value.gameTime, firstWallTime: value.wallTime,
                identityBasis: "unverified-callback-context", perHitIdentityVerified: false });
            return true;
        }
        // Addresses/paths are exact runtime identities, never canonicalised class
        // names. A reused handle with another source starts another observation.
        const identity = JSON.stringify([value.action, value.actor, value.ability, value.activation, value.timeline, value.bullet]);
        let prior = records.get(handle);
        if (prior && prior.identity !== identity) {
            emit("native-frame-ended", { ...prior.value, ...base(), id: prior.id,
                reason: "handle-source-replaced", interpretation: "registration-replaced-not-confirmed-cancel" });
            records.delete(handle); prior = null;
        }
        if (!prior) {
            if (records.size >= maximum) {
                records.delete(records.keys().next().value); counters.evicted++;
                report("capacity-eviction", { maximum });
            }
            prior = { id: "native-" + generation + "-" + (++serial), identity,
                firstGameTime: value.gameTime, firstWallTime: value.wallTime, firstSource: source, sources: new Set() };
            records.set(handle, prior);
        }
        const state = JSON.stringify([value.hitGameTime, value.reportedHitGameTime, value.hitTimeStatus, value.isHit, value.isDodge,
            value.bulletReferenceStatus,
            value.typeValue, value.typeName, value.typeConflict, value.typeCandidates, value.taskCandidate]);
        const newSource = !prior.sources.has(source);
        prior.sources.add(source);
        const phase = prior.state === undefined ? "seen" : "changed";
        const result = { ...value, id: prior.id, phase, source, firstSource: prior.firstSource,
            sources: [...prior.sources], firstGameTime: prior.firstGameTime, firstWallTime: prior.firstWallTime,
            identityBasis: "component-generation-handle-and-exact-source", perHitIdentityVerified: false };
        if (prior.state !== state || newSource) {
            counters[phase]++; emit("native-frame", result);
        } else counters.suppressed++;
        prior.state = state; prior.value = result; prior.lastObservedTick = tick;
        return true;
    }
    function installListeners() {
        if (listeners.length === EVENTS.length || tick < nextListenerTry || retired.length) return;
        // Retry failure at most once per 300 update calls. No timer or worker is
        // created by this module, including when the listener API is unavailable.
        nextListenerTry = tick + 300;
        const factory = safe(() => UE.AbilityAsync_WaitGameplayEvent.WaitGameplayEventToActor);
        if (typeof factory !== "function" || typeof safe(() => UE.GameplayTag) !== "function") {
            report("event-listener-api-unavailable"); return;
        }
        const installedToken = token;
        for (let index = listeners.length; index < EVENTS.length; index++) {
            let listener = null;
            try {
                const tag = new UE.GameplayTag(); tag.TagName = EVENTS[index];
                listener = factory.call(UE.AbilityAsync_WaitGameplayEvent, playerObject, tag, false, false);
                if (!valid(listener) || typeof read(listener, "Activate") !== "function" ||
                    typeof read(listener, "EndAction") !== "function" || typeof safe(() => listener.EventReceived.Add) !== "function")
                    throw Error("listener-interface-unavailable");
                const source = "event:" + EVENTS[index];
                listener.EventReceived.Add(data => {
                    if (stopped || !enabled || token !== installedToken || !context || context.paused || !valid(playerObject)) return;
                    try {
                        const payload = read(data, "OptionalObject");
                        const handle = read(payload, "Handle"), frame = read(payload, "ReceiveFrame");
                        const captureWorld = path(call(playerObject, "GetWorld"));
                        const eventGameTime = safe(() => UE.KismetSystemLibrary.GetGameTimeInSeconds(playerObject));
                        const sameWorld = !!captureWorld && !!context.worldPath && captureWorld === context.worldPath;
                        const clockRewound = finite(eventGameTime) && finite(context.gameTime) && eventGameTime < context.gameTime - 0.001;
                        const contextVerified = sameWorld && !clockRewound;
                        // A last update's clock is not the event's precise clock.
                        // If engine time cannot be read, keep it unavailable.
                        const eventClock = { gameTime: finite(eventGameTime) ? eventGameTime : null,
                            wallTime: Date.now(), clockSource: finite(eventGameTime) ? "callback-engine-time" : "callback-engine-time-unavailable",
                            worldKey: contextVerified ? context.worldKey : null,
                            clockEpoch: contextVerified ? context.clockEpoch : null,
                            captureWorld: captureWorld || null, boundWorld: context.worldPath || null,
                            callbackContextVerified: contextVerified,
                            callbackContextReason: !captureWorld || !context.worldPath ? "world-unavailable"
                                : !sameWorld ? "world-changed-before-update" : clockRewound ? "clock-rewound-before-update" : "same-world-no-observed-rewind" };
                        if (!observe(frame, handle, source, null, eventClock)) report("event-frame-unreadable");
                    } catch (_) { counters.errors++; report("event-read-failed"); }
                    // No return: never override event/native outputs.
                });
                listener.Activate(); listeners.push(listener);
            } catch (_) {
                counters.listenerFailures++;
                if (listener && typeof read(listener, "EndAction") === "function" && !closeListener(listener)) retired.push(listener);
                report("event-listener-bind-failed", { event: EVENTS[index] }); break;
            }
        }
    }
    function scan() {
        const map = read(componentObject, "ReceiveFrames");
        const methods = ["Num", "GetMaxIndex", "IsValidIndex", "GetKey", "Get"];
        if (!map || !methods.every(key => typeof read(map, key) === "function")) {
            mapState = "unsupported"; report("receive-map-api-unavailable"); return;
        }
        let count, slots;
        try { count = map.Num(); slots = map.GetMaxIndex(); }
        catch (_) { mapState = "read-failed"; counters.errors++; report("receive-map-read-failed"); return; }
        if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(slots) || slots < 0 || slots < count) {
            mapState = "invalid-size"; report("receive-map-invalid-size"); return;
        }
        const seen = new Set(); let complete = slots <= slotLimit && count <= maximum;
        let validEntries = 0;
        try {
            for (let index = 0; index < Math.min(slots, slotLimit); index++) {
                if (!map.IsValidIndex(index)) continue; // Sparse-map holes are legitimate.
                validEntries++;
                if (validEntries > maximum) { complete = false; break; }
                const handle = map.GetKey(index);
                if (seen.has(handle) || !observe(map.Get(handle), handle, "receive-map", seen)) complete = false;
            }
            if (validEntries !== count || seen.size !== count || map.Num() !== count || map.GetMaxIndex() !== slots) complete = false;
        } catch (_) { complete = false; counters.errors++; report("receive-map-entry-read-failed"); }
        mapState = complete ? "complete" : "incomplete";
        if (!complete) { counters.incompleteScans++; report("receive-map-scan-incomplete", { count, slots, maximum }); return; }
        for (const [handle, prior] of records) {
            if (seen.has(handle) || prior.lastObservedTick === tick) continue;
            counters.missing++;
            emit("native-frame-ended", { ...prior.value, ...base(), id: prior.id,
                reason: "missing-observed", interpretation: "absence-not-confirmed-cancel-or-hit" });
            records.delete(handle);
        }
    }
    function update(input = {}) {
        if (stopped || !enabled) return;
        tick++; cleanRetired();
        try {
            const playerPath = path(input.player);
            const next = { worldKey: typeof input.worldKey === "string" ? input.worldKey : "", playerPath,
                worldPath: path(input.world),
                gameTime: finite(input.gameTime) ? input.gameTime : null,
                wallTime: finite(input.wallTime) ? input.wallTime : null,
                clockEpoch: typeof input.clockEpoch === "string" || Number.isSafeInteger(input.clockEpoch) ? input.clockEpoch : null,
                paused: input.paused === true };
            const key = JSON.stringify([next.worldKey, next.playerPath, next.clockEpoch]);
            const rewind = finite(lastGame) && finite(next.gameTime) && next.gameTime < lastGame - 0.001;
            if (key !== bindingKey || rewind || next.paused || !valid(input.player)) {
                if (bindingKey) unbind(rewind ? "game-clock-rewind" : next.paused ? "paused" : "binding-change");
                context = next;
                if (next.paused || !valid(input.player) || !next.worldKey || !playerPath) return;
                bindingKey = key; playerObject = input.player;
            } else context = next;
            lastGame = next.gameTime;
            const component = resolveComponent(playerObject), foundPath = path(component);
            if (foundPath !== componentPath) {
                if (componentPath && records.size) {
                    emit("native-observer-status", { ...base(), reason: "component-change", abandoned: records.size,
                        interpretation: "observation-boundary-not-attack-cancellation" }); records.clear(); generation++;
                }
                componentObject = component; componentPath = foundPath;
            }
            installListeners();
            if (valid(componentObject)) scan();
            else { mapState = "component-unavailable"; report("deflect-component-unavailable"); }
        } catch (_) { counters.errors++; report("observer-update-failed"); }
    }
    function dispose() {
        if (stopped) return;
        unbind("disposed"); stopped = true; cleanRetired(); context = null;
    }
    function status() {
        return { enabled, stopped, mode: "observe-only", mapState, tracked: records.size, maximum,
            listeners: listeners.length, pendingListenerCleanup: retired.length, ...counters };
    }
    return { update, dispose, status };
}

module.exports = { createNativeAttackObserver, EVENTS };
