"use strict";

// Standalone BNK with our own event/media; no replacement of game assets.
// Reflected fields are from this game's SDK. Reference Wwise 2025.1.8 source
// resolves AdditionalFile under ProjectContentDir when ModularGameplayName is
// Game; LoadData -> LoadEvent -> LoadEventAsync(...).Get() blocks until complete.
// PBZ uses Wwise 2024.1.9: matching declarations are evidence, not live proof.
// LoadData returns void. Only a nonzero PlayingID proves Post was accepted;
// neither that nor an EndOfEvent callback proves audible device output.
const PRIORITY = Object.freeze({ red: 3, black: 2, blue: 1 });
const NATURAL_ENDS = new Set(["event-ended", "display-expired", "completed", "OnCompleted"]);

function createNativeAudio(UE, adapter, settings, diagnostic, options = {}) {
    const now = typeof options.now === "function" ? options.now : () => Date.now();
    const maxDelayMs = Number.isFinite(options.maxStartDelayMs) ? Math.max(0, options.maxStartDelayMs) : 80;
    const bank = options.bank || {}, bankPath = options.bankPath || "", relativePath = options.bankRelativePath || "";
    const retryDelays = [1000, 3000, 10000], seen = new Set(), callbacks = new Set();
    let disposed = false, epoch = 0, owner = null, worldKey = null, ownerKey = null;
    let component = null, event = null, playing = null, phase = "idle", failure = "", loadRequested = false;
    let enabled = settings.SoundOn !== false, paused = true, volume = null, muted = true, attempts = 0, retryAt = 0, manualAt = -Infinity;
    const stats = { played: 0, duplicates: 0, dropped: 0, stopped: 0, superseded: 0, errors: 0 };
    const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };
    const valid = value => !!value && safe(() => adapter.valid(value), false) === true;
    const path = value => safe(() => adapter.path(value), "") || "";
    const report = (kind, data) => { try { diagnostic(kind, data); } catch (_) {} };
    const resolvedMembers = {};
    // FName casing can differ from generated declarations. The game exports
    // GetWwiseShortID, while SDK 0.3.3 spells it GetWwiseShortId.
    function member(object, name) {
        if (!object) throw Error("missing reflected member: " + name);
        if (name in object || object[name] !== undefined) return name;
        const wanted = name.toLowerCase();
        let prototype = object;
        for (let depth = 0; prototype && depth < 16; depth++, prototype = Object.getPrototypeOf(prototype)) {
            const matches = Object.getOwnPropertyNames(prototype).filter(key => key.toLowerCase() === wanted);
            if (matches.length > 1) throw Error("ambiguous reflected member: " + name);
            if (matches.length === 1) { resolvedMembers[name] = matches[0]; return matches[0]; }
        }
        throw Error("missing reflected member: " + name);
    }
    function read(object, name) { return object[member(object, name)]; }
    function write(object, name, value) { object[member(object, name)] = value; }
    function call(object, name, args = []) {
        const key = member(object, name);
        if (typeof object[key] !== "function") throw Error("missing reflected function: " + name);
        return object[key](...args);
    }
    function signedId(value) { return value > 0x7fffffff ? value - 0x100000000 : value; }
    function validId(value) { return Number.isInteger(value) && value > 0 && value <= 0xffffffff; }
    function cancelCallback(token) {
        if (!token) return;
        token.cancelled = true;
        if (callbacks.delete(token)) safe(() => call(UE.AkGameplayStatics, "CancelEventCallback", [token.callback]));
    }
    function stop(reason) {
        const previous = playing; playing = null;
        muted = true;
        if (!previous) return true;
        // Mute the private emitter before asking the engine to stop. A rejected
        // stop must never be followed by unmuting/reusing the same emitter.
        if (valid(component)) safe(() => { call(component, "SetOutputBusVolume", [0]); volume = 0; });
        cancelCallback(previous);
        // Actor=null avoids looking up the player's unrelated default AkComponent.
        // The unique event ID AND exact PlayingID restrict the action to our cue.
        const result = valid(event) ? safe(() => call(event, "ExecuteAction", [UE.AkActionOnEventType.Stop,
            null, previous.playingId, 0, UE.EAkCurveInterpolation.Linear])) : null;
        stats.stopped++;
        report("sound-stop", { id: previous.id, playingId: previous.playingId, reason, result });
        if (phase === "playing") phase = "prepared";
        return result === safe(() => UE.EAkResult.Success, 1); // SDK: AK_Success=1; others are unconfirmed.
    }
    function release(reason) {
        epoch++;
        stop(reason);
        for (const token of [...callbacks]) cancelCallback(token);
        if (valid(component)) safe(() => call(component, "SetOutputBusVolume", [0]));
        if (valid(event) && loadRequested) safe(() => call(event, "UnloadData", [true]));
        if (valid(component)) {
            safe(() => { component.AkAudioEvent = null; });
            safe(() => call(component, "K2_DestroyComponent", [owner]));
        }
        component = event = null; loadRequested = false; volume = null; muted = true; phase = "idle";
    }
    function environment() {
        return typeof options.inspectEnvironment === "function" ? safe(() => options.inspectEnvironment()) : null;
    }
    function fail(reason, error, recoverable = true) {
        stats.errors++;
        release("failure"); failure = reason;
        retryAt = recoverable && attempts < retryDelays.length ? now() + retryDelays[attempts] : 0;
        phase = retryAt ? "recovering" : "failed";
        report("sound-unavailable", { backend: "wwise-bank", reason, detail: String(error || ""),
            bankPath, relativePath, eventId: bank.eventId, bankId: bank.bankId,
            retryInMs: retryAt ? retryAt - now() : null, recoveryAttempt: attempts,
            environment: environment(), fallback: "none" });
    }
    function applyVolume(force = false) {
        const desired = typeof settings.SoundVolume === "number" && Number.isFinite(settings.SoundVolume)
            ? Math.max(0, Math.min(2, settings.SoundVolume)) : 1;
        const next = muted ? 0 : desired;
        if (force || volume !== next) {
            // This method adjusts the private emitter-to-listener output only.
            call(component, "SetOutputBusVolume", [next]); volume = next;
        }
    }
    function prepare() {
        if (disposed || phase !== "idle" || !valid(owner) || !enabled) return;
        try {
            if (!validId(bank.eventId) || !validId(bank.bankId) ||
                !Number.isFinite(bank.durationSeconds) || bank.durationSeconds <= 0 || bank.durationSeconds > 60)
                throw Error("invalid independent bank manifest");
            if (relativePath !== "PBZForewarn/PBZForewarn.bnk" || !/^(?:[A-Za-z]:[\\/]|\\\\)/.test(bankPath))
                throw Error("expected standalone Content/PBZForewarn/PBZForewarn.bnk path");
            if (!call(UE.BlueprintPathsLibrary, "FileExists", [bankPath])) throw Error("independent bank file missing");
            if (typeof UE.NewObject !== "function") throw Error("NewObject unavailable");
            const transform = new UE.Transform();
            component = call(owner, "AddComponentByClass", [UE.AkComponent.StaticClass(), true, transform, true]);
            if (!valid(component)) throw Error("could not create private AkComponent");
            component.bAutoActivate = true; component.bUseSpatialAudio = false;
            component.bUseReverbVolumes = false; component.OcclusionRefreshInterval = 0;
            component.StopWhenOwnerDestroyed = true;
            event = UE.NewObject(UE.AkAudioEvent.StaticClass(), component);
            if (!valid(event)) throw Error("could not create private AkAudioEvent");
            event.bAutoLoad = false;
            event.IsInfinite = false; event.MinimumDuration = bank.durationSeconds; event.MaximumDuration = bank.durationSeconds;
            component.AkAudioEvent = event; // Reflected UPROPERTY strong reference, owner retains component.

            const file = new UE.WwisePackagedFile();
            file.PackagingStrategy = UE.EWwisePackagingStrategy.AdditionalFile;
            file.PathName = relativePath; file.ModularGameplayName = "Game";
            file.bStreaming = false; file.PrefetchSize = 0; file.MemoryAlignment = 16; file.bDeviceMemory = false; file.Hash = 0;
            const bankData = new UE.WwiseSoundBankCookedData();
            write(bankData, "SoundBankId", signedId(bank.bankId)); bankData.bContainsMedia = true;
            bankData.SoundBankType = UE.EWwiseSoundBankType.Event;
            bankData.DebugName = "PBZForewarn"; bankData.PackagedFile = file;
            const data = new UE.WwiseEventCookedData();
            write(data, "EventID", signedId(bank.eventId)); data.DebugName = "PBZForewarn";
            data.SoundBanks.Empty(); data.SoundBanks.Add(bankData);
            data.Media.Empty(); data.ExternalSources.Empty(); data.SwitchContainerLeaves.Empty(); data.RequiredGroupValueSet.Empty();
            data.DestroyOptions = UE.EWwiseEventDestroyOptions.StopEventOnDestroy;
            const language = new UE.WwiseLanguageCookedData();
            write(language, "LanguageId", 0); language.LanguageName = "SFX"; language.LanguageRequirement = UE.EWwiseLanguageRequirement.SFX;
            const localized = new UE.WwiseLocalizedEventCookedData();
            write(localized, "EventID", signedId(bank.eventId)); localized.DebugName = "PBZForewarn";
            localized.EventLanguageMap.Empty(); localized.EventLanguageMap.Add(language, data);
            event.EventCookedData = localized;
            const actualId = call(event, "GetWwiseShortID");
            if (!Number.isInteger(actualId) || (actualId >>> 0) !== bank.eventId)
                throw Error("created event ID does not match independent bank");
            // Confirm nested struct/map assignments survived Puerts value copies.
            // A top-level ID alone cannot prove the bank entry was retained.
            const echoed = event.EventCookedData;
            if (call(echoed.EventLanguageMap, "Num") !== 1) throw Error("event language map assignment was not retained");
            const echoedData = call(echoed.EventLanguageMap, "Get", [language]);
            if (!echoedData || (read(echoedData, "EventID") >>> 0) !== bank.eventId || call(echoedData.SoundBanks, "Num") !== 1)
                throw Error("SFX event bank entry was not retained");
            const echoedBank = call(echoedData.SoundBanks, "Get", [0]);
            if (!echoedBank || (read(echoedBank, "SoundBankId") >>> 0) !== bank.bankId || echoedBank.bContainsMedia !== true ||
                echoedBank.PackagedFile.PathName !== relativePath ||
                echoedBank.PackagedFile.PackagingStrategy !== UE.EWwisePackagingStrategy.AdditionalFile)
                throw Error("independent bank ID/path assignment was not retained");
            call(owner, "FinishAddComponent", [component, true, transform]);
            if (!valid(call(component, "GetOwner")) || path(call(component, "GetOwner")) !== ownerKey ||
                !valid(component.AkAudioEvent) || path(component.AkAudioEvent) !== path(event))
                throw Error("owned component/event retention check failed");
            applyVolume(true);
            const begin = now();
            loadRequested = true;
            call(event, "LoadData");
            phase = "prepared"; failure = "";
            report("sound-prepared", { backend: "wwise-bank", bankPath, relativePath,
                eventId: bank.eventId, bankId: bank.bankId, loadCallMs: now() - begin,
                authoredGainDb: bank.authoredGainDb, voicePriority: bank.voicePriority,
                loadResult: "void-returned-unconfirmed", readiness: "nonzero-PlayingID-required",
                resolvedMembers: { ...resolvedMembers }, environment: environment() });
        } catch (error) { fail("wwise-prepare-failed", error, false); }
    }
    function drop(cue, reason) { stats.dropped++; report("sound-dropped", { id: cue.id, color: cue.color, reason }); }
    function remember(id) {
        if (seen.has(id)) { stats.duplicates++; return false; }
        if (seen.size >= 65536) { stats.dropped++; report("sound-capacity", { limit: 65536 }); return false; }
        seen.add(id); return true;
    }
    function post(cue) {
        const token = { ...cue, epoch, playingId: null, endedEarly: false, cancelled: false, callback: null };
        try {
            if (playing) {
                stats.superseded++;
                if (!stop("new-cue")) throw Error("previous PlayingID stop was not confirmed");
            }
            applyVolume(true);
            const callbackType = UE.EAkCallbackType.EndOfEvent;
            token.callback = (type, info) => {
                if (disposed || token.cancelled || token.epoch !== epoch || type !== callbackType) return;
                const finishedId = safe(() => read(info, "PlayingID"));
                if (token.playingId === null) { token.endedEarly = true; token.earlyId = finishedId; return; }
                if (finishedId !== token.playingId) return;
                callbacks.delete(token);
                if (playing === token) { playing = null; muted = true; phase = "prepared"; }
                report("sound-ended", { id: token.id, playingId: token.playingId, backend: "wwise-bank" });
            };
            callbacks.add(token);
            const result = call(event, "PostOnComponent", [component, token.callback, 1 << callbackType, true]);
            if (!Number.isInteger(result) || result === 0) throw Error("PostOnComponent returned invalid PlayingID: " + String(result));
            token.playingId = result; token.startedAt = now(); stats.played++;
            if (token.endedEarly && token.earlyId === result) { callbacks.delete(token); phase = "prepared"; }
            else { playing = token; phase = "playing"; muted = false; applyVolume(true); }
            report("sound-play", { id: cue.id, color: cue.color, backend: "wwise-bank", playingId: result,
                componentVolume: volume, authoredGainDb: bank.authoredGainDb, voicePriority: bank.voicePriority,
                requestDelayMs: now() - cue.receivedAt, audibleOutputVerified: false });
        } catch (error) { cancelCallback(token); drop(cue, "post-failed"); fail("wwise-post-failed", error); }
    }
    function update(context, events = []) {
        if (disposed) return;
        context = context || {};
        const usable = valid(context.world) && valid(context.player) && typeof context.worldKey === "string" && !!context.worldKey;
        const nextWorld = usable ? context.worldKey : null, nextOwner = usable ? path(context.player) : null;
        if (nextWorld !== worldKey || nextOwner !== ownerKey) {
            release("context-changed"); worldKey = nextWorld; ownerKey = nextOwner; owner = usable ? context.player : null;
            attempts = 0; retryAt = 0; failure = "";
        }
        if ((settings.SoundOn !== false) !== enabled) {
            release("sound-setting"); enabled = settings.SoundOn !== false; attempts = 0; retryAt = 0; failure = "";
        }
        paused = context.paused !== false;
        if (paused && !stop("paused")) fail("wwise-stop-failed", "pause stop was not confirmed");
        if (phase === "recovering" && usable && enabled && now() >= retryAt) {
            attempts++; phase = "idle"; retryAt = 0;
            report("sound-recovering", { attempt: attempts, limit: retryDelays.length });
        }
        if (usable && enabled) prepare();
        if (event && (!valid(event) || !valid(component))) fail("wwise-object-invalid", "owned object no longer valid");
        if (playing && now() - playing.startedAt > bank.durationSeconds * 1000 + 1500 && !stop("completion-timeout"))
            fail("wwise-stop-failed", "completion timeout stop was not confirmed");
        const candidates = new Map();
        for (const item of Array.isArray(events) ? events : []) {
            if (!item || typeof item.kind !== "string") continue;
            if (item.kind === "reset") {
                candidates.clear();
                if (!stop("reset")) fail("wwise-stop-failed", "reset stop was not confirmed");
                continue;
            }
            if (typeof item.id !== "string" || !item.id || item.id.length > 512) continue;
            if (item.kind === "cancel") {
                if (NATURAL_ENDS.has(item.reason)) continue;
                if (!seen.has(item.id)) remember(item.id);
                candidates.delete(item.id);
                if (playing && playing.id === item.id && !stop("cancelled"))
                    fail("wwise-stop-failed", "cancel stop was not confirmed");
                continue;
            }
            if (item.kind !== "cue" || !Object.prototype.hasOwnProperty.call(PRIORITY, item.color) || !remember(item.id)) continue;
            const at = Number.isFinite(item.at) ? Math.min(item.at, now()) : now();
            const cue = { id: item.id, color: item.color, receivedAt: at };
            if (item.preview === true && phase === "failed" && usable && enabled && !paused && now() - manualAt >= 10000) {
                manualAt = now(); attempts = 0; phase = "idle";
                report("sound-manual-recovery", { id: item.id }); prepare(); drop(cue, "manual-recovery-started"); continue;
            }
            if (!usable || !enabled || paused || !["prepared", "playing"].includes(phase)) {
                drop(cue, !usable ? "no-context" : !enabled ? "disabled" : paused ? "paused" : phase); continue;
            }
            if (now() - cue.receivedAt > maxDelayMs) { drop(cue, "stale"); continue; }
            candidates.set(cue.id, cue);
        }
        if (valid(component) && enabled) {
            try { applyVolume(); } catch (error) { fail("wwise-volume-failed", error, false); }
        }
        if (candidates.size && ["prepared", "playing"].includes(phase)) {
            const sorted = [...candidates.values()].sort((a, b) => PRIORITY[b.color] - PRIORITY[a.color]);
            for (let i = 1; i < sorted.length; i++) drop(sorted[i], "simultaneous-lower-priority");
            const cue = sorted[0];
            if (now() - cue.receivedAt > maxDelayMs) drop(cue, "start-deadline"); else post(cue);
        }
    }
    function status() {
        return { backend: "wwise-bank", phase: disposed ? "disposed" : phase, enabled, paused, worldKey,
            bankPath, relativePath, eventId: bank.eventId, bankId: bank.bankId, failure,
            authoredGainDb: bank.authoredGainDb, voicePriority: bank.voicePriority,
            playingId: playing && playing.id, wwisePlayingId: playing && playing.playingId, pendingId: null,
            seen: seen.size, callbackCount: callbacks.size, muted, volume,
            strongEventReference: valid(component) && valid(event) && path(component.AkAudioEvent) === path(event),
            loadResult: loadRequested ? "void-returned-unconfirmed" : "not-loaded", gameSfxSliderVerified: false,
            resolvedMembers: { ...resolvedMembers },
            recovery: { attempts, limit: retryDelays.length, retryInMs: retryAt ? Math.max(0, retryAt - now()) : null },
            environment: environment(), stats: { ...stats } };
    }
    function dispose() { if (disposed) return; disposed = true; release("disposed"); owner = null; ownerKey = worldKey = null; }
    return { update, status, dispose };
}

module.exports = { createNativeAudio, PRIORITY };
