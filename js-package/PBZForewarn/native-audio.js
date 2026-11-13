"use strict";

// Game-process audio, using UE MediaPlayer -> MediaSoundComponent. No external
// player, sound-signal IPC, Wwise event substitution, or gameplay-object edits.
// SDK 0.3.3 evidence (reflection declarations, NOT individual in-game tests):
// MediaAssets.d.ts:146-254,287-307; AudioMixer.d.ts:444-486;
// Engine.d.ts:187,196,355,369,373. WmfMediaFactory exists, but its presence does
// not prove this game's packaged codec supports cue.wav or that Wwise's SFX
// slider controls UE Media audio. Report failures; never silently change sound.
// No RuntimeAudioImporter/QueueAudio was reflected. Interchange has WAV import
// declarations, but packaged runtime import/cooking has not been established.
const PRIORITY = Object.freeze({ red: 3, black: 2, blue: 1 });
const NATURAL_ENDS = new Set(["event-ended", "display-expired", "completed", "OnCompleted"]);

function createNativeAudio(UE, adapter, settings, diagnostic, options = {}) {
    const now = typeof options.now === "function" ? options.now : () => Date.now();
    const maxDelayMs = Number.isFinite(options.maxStartDelayMs) ? Math.max(0, options.maxStartDelayMs) : 80;
    const prepareTimeoutMs = 10000;
    const seenLimit = 65536;
    const wavPath = typeof options.wavPath === "string" ? options.wavPath : "";
    const valid = o => { try { return !!o && adapter.valid(o); } catch (_) { return false; } };
    const report = (kind, data) => { try { diagnostic(kind, data); } catch (_) {} };
    const safe = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };
    let disposed = false, worldKey = null, ownerKey = null, owner = null, media = null, sound = null;
    let phase = "idle", failure = "", epoch = 0, startedAt = 0, drainUntil = 0, pending = null, playing = null;
    let paused = true, enabled = settings.SoundOn !== false, bindings = [], volume = null, muted = true;
    const recoveryDelays = [1000, 3000, 10000];
    let recoveryAttempts = 0, recoveryAt = 0, recoverableFailure = false, lastManualRecovery = -Infinity;
    let lastBackendState = null;
    const seen = new Set();
    const stats = { played: 0, duplicates: 0, dropped: 0, stopped: 0, superseded: 0, errors: 0 };

    function pathOf(object) { return safe(() => adapter.path(object), "") || object; }
    function callRequired(object, name, args) {
        if (!object || typeof object[name] !== "function") throw Error("missing reflected function: " + name);
        return object[name](...args);
    }
    function stopPlayback(reason) {
        const id = playing && playing.id;
        const playWasAccepted = !!playing || phase === "playing" || phase === "draining";
        // Keep the synth active: UE5's media facade disables the underlying
        // audio track when there is no active sample sink. Silence our output
        // before pausing, then rewind while muted to flush any old samples.
        muted = true;
        if (valid(sound)) safe(() => applyVolume());
        // WMF accepts Play asynchronously. Queue Pause even when IsPlaying has
        // not caught up yet, otherwise a cancelled Play can begin after rewind.
        const pauseAccepted = !valid(media) || !(playWasAccepted || safe(() => media.IsPlaying(), false)) ||
            safe(() => media.Pause() !== false, false);
        if (playing) { stats.stopped++; report("sound-stop", { id, reason }); }
        playing = null;
        pending = null;
        if (phase === "playing" || phase === "draining") phase = "spent";
        return pauseAccepted;
    }
    function release(reason) {
        // Invalidate callbacks before removing delegates or closing the player.
        epoch++;
        stopPlayback(reason);
        for (const binding of bindings) safe(() => binding.delegate.Remove(binding.callback));
        bindings = [];
        if (valid(sound)) safe(() => sound.Stop());
        if (valid(sound)) safe(() => sound.SetMediaPlayer(null));
        if (valid(sound)) safe(() => { sound.MediaPlayer = null; });
        if (valid(media)) safe(() => media.Close());
        // This component was created by this module on this owner. Never stop
        // global audio, destroy the owner, or touch its other components.
        if (valid(sound)) safe(() => sound.K2_DestroyComponent(owner));
        media = sound = null;
        volume = null;
        phase = "idle";
    }
    function backendState() {
        if (!valid(media) || !valid(sound)) return null;
        const track = UE.EMediaPlayerTrack && UE.EMediaPlayerTrack.Audio;
        const selected = safe(() => media.GetSelectedTrack(track), null);
        const format = selected !== null && selected >= 0 ? safe(() => media.GetTrackFormat(track, selected), null) : null;
        return {
            player: safe(() => media.GetPlayerName(), null), ready: safe(() => media.IsReady(), null),
            playing: safe(() => media.IsPlaying(), null), paused: safe(() => media.IsPaused(), null),
            preparing: safe(() => media.IsPreparing(), null), buffering: safe(() => media.IsBuffering(), null),
            closed: safe(() => media.IsClosed(), null), error: safe(() => media.HasError(), null),
            rate: safe(() => media.GetRate(), null), canPause: safe(() => media.CanPause(), null),
            supportsRate1Unthinned: safe(() => media.SupportsRate(1, true), null),
            supportsRate1Thinned: safe(() => media.SupportsRate(1, false), null),
            supportsSeeking: safe(() => media.SupportsSeeking(), null),
            audioTracks: safe(() => media.GetNumTracks(track), null), selectedTrack: selected, trackFormat: format,
            channels: selected !== null && selected >= 0 && format !== null ? safe(() => media.GetAudioTrackChannels(selected, format), null) : null,
            sampleRate: selected !== null && selected >= 0 && format !== null ? safe(() => media.GetAudioTrackSampleRate(selected, format), null) : null,
            componentActive: safe(() => sound.IsActive(), null), componentTickEnabled: safe(() => sound.IsComponentTickEnabled(), null),
            componentPlaying: safe(() => sound.IsPlaying(), null), strongPlayerReference: safe(() => pathOf(sound.MediaPlayer) === pathOf(media), false),
            muted, volume
        };
    }
    function fail(reason, detail, recoverable = false) {
        stats.errors++;
        lastBackendState = backendState() || lastBackendState;
        if (pending) drop(pending, reason);
        release("failure");
        failure = reason; recoverableFailure = recoverable;
        recoveryAt = recoverable && recoveryAttempts < recoveryDelays.length ? now() + recoveryDelays[recoveryAttempts] : 0;
        phase = recoveryAt ? "recovering" : "failed";
        report("sound-unavailable", { reason, detail: String(detail || ""), path: wavPath,
            backend: "ue-media", fallback: "none", state: lastBackendState,
            recoveryAttempt: recoveryAttempts, recoveryLimit: recoveryDelays.length, retryInMs: recoveryAt ? recoveryAt - now() : null,
            environment: typeof options.inspectEnvironment === "function" ? safe(() => options.inspectEnvironment(), null) : null });
    }
    function stopSafely(reason) {
        if (stopPlayback(reason)) return true;
        fail("media-pause-failed", "media Pause rejected after an accepted Play", true);
        return false;
    }
    function bind(delegate, callback) {
        if (!delegate || typeof delegate.Add !== "function" || typeof delegate.Remove !== "function")
            throw Error("media delegate Add/Remove unavailable");
        delegate.Add(callback); bindings.push({ delegate, callback });
    }
    function desiredVolume() {
        return typeof settings.SoundVolume === "number" && Number.isFinite(settings.SoundVolume)
            ? Math.min(2, Math.max(0, settings.SoundVolume)) : 1;
    }
    function applyVolume() {
        const next = muted ? 0 : desiredVolume();
        if (next !== volume) { callRequired(sound, "SetVolumeMultiplier", [next]); volume = next; }
    }
    function prepare() {
        if (phase !== "idle" || !owner || disposed || !enabled) return;
        try {
            if (!/^(?:[A-Za-z]:[\\/]|\\\\)/.test(wavPath) || !/\.wav$/i.test(wavPath))
                throw Error("an absolute local WAV path is required");
            if (!UE.BlueprintPathsLibrary || !callRequired(UE.BlueprintPathsLibrary, "FileExists", [wavPath]))
                throw Error("cue WAV is missing");
            if (!UE.MediaPlayer || !UE.MediaSoundComponent || typeof UE.NewObject !== "function" || typeof UE.Transform !== "function")
                throw Error("MediaPlayer/MediaSoundComponent reflection unavailable");
            const relative = new UE.Transform();
            sound = callRequired(owner, "AddComponentByClass", [UE.MediaSoundComponent.StaticClass(), true, relative, true]);
            if (!valid(sound)) throw Error("AddComponentByClass returned no MediaSoundComponent");
            // Configure before FinishAddComponent registers this component. The
            // Actor owns the component. SetMediaPlayer alone assigns UE's weak
            // current-player pointer in reference UE5 source; retain the UObject
            // separately through its reflected MediaPlayer property.
            sound.bAutoActivate = false;
            sound.bAutoDestroy = false;
            sound.bStopWhenOwnerDestroyed = true;
            sound.bAllowSpatialization = false;
            sound.bOverrideAttenuation = false;
            sound.AttenuationSettings = null;
            sound.bIsUISound = false;
            sound.bIsPreviewSound = false;
            if (UE.EMediaSoundChannels && UE.EMediaSoundChannels.Stereo !== undefined)
                sound.Channels = UE.EMediaSoundChannels.Stereo;
            media = UE.NewObject(UE.MediaPlayer.StaticClass(), sound);
            if (!valid(media)) throw Error("NewObject returned no MediaPlayer");
            media.PlayOnOpen = false;
            media.NativeAudioOut = false; // Sound must flow through the UE component.
            media.Loop = false;
            sound.MediaPlayer = media;
            callRequired(sound, "SetMediaPlayer", [media]);
            callRequired(owner, "FinishAddComponent", [sound, true, relative]);
            const actualOwner = callRequired(sound, "GetOwner", []);
            if (!valid(actualOwner) || pathOf(actualOwner) !== ownerKey) throw Error("media component owner mismatch");
            const retained = callRequired(sound, "GetMediaPlayer", []);
            if (!valid(retained) || pathOf(retained) !== pathOf(media)) throw Error("media component did not retain player");
            muted = true;
            applyVolume();
            // Preload the consumer before requesting playback. UE5 reference
            // UpdatePlayer registers its sink only while this synth is active;
            // the facade otherwise filters the real audio track to INDEX_NONE.
            callRequired(sound, "SetComponentTickEnabled", [true]);
            callRequired(sound, "Start", []);
            const mine = epoch, player = media;
            const alive = () => !disposed && mine === epoch && player === media;
            bind(media.OnMediaOpened, () => {
                if (!alive() || phase !== "opening") return;
                try {
                    if (callRequired(player, "HasError", [])) throw Error("media backend reported an error");
                    const audioTrack = UE.EMediaPlayerTrack && UE.EMediaPlayerTrack.Audio;
                    if (audioTrack === undefined) throw Error("audio track enum unavailable");
                    const tracks = callRequired(player, "GetNumTracks", [audioTrack]);
                    if (!Number.isInteger(tracks) || tracks < 1) throw Error("WAV opened without a discovered audio track");
                    if (callRequired(player, "GetSelectedTrack", [audioTrack]) < 0 &&
                        !callRequired(player, "SelectTrack", [audioTrack, 0])) throw Error("could not select WAV audio track");
                    if (callRequired(player, "IsPlaying", [])) callRequired(player, "Pause", []);
                    if (!callRequired(player, "SetLooping", [false])) throw Error("could not disable media looping");
                    // Enumerating a track is not proof that WMF has enabled its
                    // topology. Wait for supported play rate on later updates.
                    phase = "arming"; startedAt = now();
                    report("sound-opened", { backend: "ue-media", state: backendState(), path: wavPath });
                } catch (e) { fail("media-open-validation", e); }
            });
            bind(media.OnMediaOpenFailed, url => { if (alive()) fail("media-open-failed", url); });
            bind(media.OnSeekCompleted, () => {
                if (alive() && phase === "seeking") { phase = "arming"; startedAt = now(); }
            });
            bind(media.OnEndReached, () => {
                if (!alive() || phase !== "playing") return;
                const id = playing && playing.id;
                // Reaching media EOF is different from the warning glyph ending:
                // the original 4.6 s WAV may finish naturally after the glyph.
                // Media EOF can precede the last mixer buffer reaching output.
                // Leave a short drain interval; a new cue/cancel still stops it.
                phase = "draining"; drainUntil = now() + 250;
                report("sound-ended", { id, mixerDrainMs: 250 });
            });
            phase = "opening"; startedAt = now();
            if (!callRequired(media, "OpenFile", [wavPath])) throw Error("OpenFile rejected the WAV");
            report("sound-preparing", { backend: "ue-media", path: wavPath });
        } catch (e) { if (phase !== "failed") fail("media-prepare-failed", e); }
    }
    function rewind() {
        if (phase !== "spent") return;
        try {
            if (!callRequired(media, "SupportsSeeking", [])) throw Error("WAV backend does not support seeking");
            phase = "seeking"; startedAt = now();
            // Only one seek is in flight. Further cues replace pending without
            // issuing another seek, so a late completion cannot replay an old id.
            if (!callRequired(media, "Rewind", [])) throw Error("media rewind rejected");
        } catch (e) { fail("media-rewind-failed", e, true); }
    }
    function arm() {
        if (phase !== "arming") return;
        try {
            if (!callRequired(sound, "IsActive", []) || !callRequired(sound, "IsComponentTickEnabled", []) ||
                !callRequired(media, "IsReady", []) || callRequired(media, "IsPlaying", []) ||
                !(callRequired(media, "SupportsRate", [1, true]) || callRequired(media, "SupportsRate", [1, false]))) return;
            phase = "ready";
            report("sound-ready", { backend: "ue-media", path: wavPath, state: backendState(), gameSfxSliderVerified: false });
        } catch (e) { fail("media-arm-failed", e); }
    }
    function remember(id) {
        if (seen.has(id)) { stats.duplicates++; return false; }
        if (seen.size >= seenLimit) {
            stats.dropped++;
            if (failure !== "dedup-capacity") report("sound-capacity", { limit: seenLimit });
            failure = "dedup-capacity";
            return false; // Never evict an old id and permit a repeat.
        }
        seen.add(id); return true;
    }
    function drop(cue, reason) {
        if (!cue) return;
        stats.dropped++;
        report("sound-dropped", { id: cue.id, color: cue.color, reason });
    }
    function isExpired(cue) { return now() - cue.receivedAt > maxDelayMs; }
    function update(context, events = []) {
        if (disposed) return;
        context = context || {};
        const usable = valid(context.world) && valid(context.player) && typeof context.worldKey === "string" && context.worldKey.length > 0;
        const nextWorld = usable ? context.worldKey : null;
        const nextOwner = usable ? pathOf(context.player) : null;
        if (nextWorld !== worldKey || nextOwner !== ownerKey) {
            release("context-changed");
            // Preserve consumed ids across respawn, transient context loss and
            // travel. The caller must give each new cue a session-unique id.
            worldKey = nextWorld; ownerKey = nextOwner; owner = usable ? context.player : null;
            failure = ""; recoveryAttempts = 0; recoveryAt = 0; recoverableFailure = false; lastBackendState = null;
        }
        const nextEnabled = settings.SoundOn !== false;
        if (nextEnabled !== enabled) {
            release("sound-setting"); failure = ""; enabled = nextEnabled;
            recoveryAttempts = 0; recoveryAt = 0; recoverableFailure = false;
        }
        paused = context.paused !== false;
        if (paused) stopSafely("paused");
        if (phase === "recovering" && now() >= recoveryAt && usable && enabled) {
            recoveryAttempts++; recoveryAt = 0; phase = "idle";
            report("sound-recovering", { attempt: recoveryAttempts, limit: recoveryDelays.length, previousFailure: failure });
            failure = "";
        }
        if (usable && enabled) prepare();
        if (media && (!valid(media) || !valid(sound))) fail("audio-object-invalid", "", true);
        if ((phase === "opening" || phase === "seeking" || phase === "arming") && now() - startedAt > prepareTimeoutMs)
            fail("media-prepare-timeout", phase, true);
        if (valid(media) && safe(() => media.HasError(), false)) fail("media-backend-error", "", true);
        if (phase === "draining" && now() >= drainUntil) stopSafely("audio-tail-drained");
        const candidates = new Map();
        for (const event of Array.isArray(events) ? events : []) {
            if (!event || typeof event.kind !== "string") continue;
            if (event.kind === "reset") {
                for (const cue of candidates.values()) drop(cue, "reset");
                candidates.clear(); stopSafely("reset"); continue;
            }
            if (typeof event.id !== "string" || !event.id || event.id.length > 512) continue;
            if (event.kind === "cancel") {
                if (NATURAL_ENDS.has(event.reason)) continue;
                if (!seen.has(event.id)) remember(event.id);
                candidates.delete(event.id);
                if (pending && pending.id === event.id) { drop(pending, "cancelled"); pending = null; }
                if (playing && playing.id === event.id) stopSafely("cancelled");
                continue;
            }
            if (event.kind !== "cue" || !Object.prototype.hasOwnProperty.call(PRIORITY, event.color)) continue;
            if (!remember(event.id)) continue;
            const timestamp = typeof event.at === "number" && Number.isFinite(event.at) ? event.at : now();
            const cue = { id: event.id, color: event.color, receivedAt: Math.min(timestamp, now()) };
            if (event.preview === true && usable && enabled && !paused && phase === "failed" && recoverableFailure &&
                recoveryAttempts >= recoveryDelays.length && now() - lastManualRecovery >= 10000) {
                lastManualRecovery = now(); recoveryAttempts = 0; recoveryAt = 0; failure = ""; phase = "idle";
                report("sound-manual-recovery", { id: event.id });
                prepare();
                drop(cue, "manual-recovery-started"); continue;
            }
            if (!usable || !enabled || paused || phase === "failed" || phase === "recovering") {
                drop(cue, !usable ? "no-context" : !enabled ? "disabled" : paused ? "paused" : phase === "recovering" ? "recovering" : failure); continue;
            }
            if (isExpired(cue)) { drop(cue, "stale"); continue; }
            candidates.set(cue.id, cue);
        }
        if (candidates.size) {
            const batch = Array.from(candidates.values()).sort((a, b) => PRIORITY[b.color] - PRIORITY[a.color]);
            const winner = batch[0];
            for (let i = 1; i < batch.length; i++) drop(batch[i], "simultaneous-lower-priority");
            if (pending) { stats.superseded++; drop(pending, "new-cue"); }
            if (playing) {
                stats.superseded++;
                if (stopSafely("new-cue")) pending = winner;
                else drop(winner, "media-pause-failed");
            } else pending = winner;
        }
        if (pending && (paused || !enabled || isExpired(pending))) { drop(pending, paused ? "paused" : !enabled ? "disabled" : "start-deadline"); pending = null; }
        if (valid(sound)) { try { applyVolume(); } catch (e) { fail("media-volume-failed", e); } }
        rewind(); // Pre-arm after EOF/cancel/pause even when no cue is pending.
        arm();
        if (pending && phase === "ready" && !paused && enabled) {
            const cue = pending; pending = null;
            try {
                if (!callRequired(media, "IsReady", [])) throw Error("media lost ready state");
                if (!callRequired(sound, "IsActive", []) || !callRequired(sound, "IsComponentTickEnabled", []))
                    throw Error("media consumer became inactive");
                // The active sink is already receiving samples; keep its volume
                // zero through rewind and unmute only after Play is accepted.
                if (!callRequired(media, "Play", [])) throw Error("media Play rejected");
                muted = false; applyVolume();
                playing = cue; phase = "playing"; stats.played++;
                report("sound-play", { id: cue.id, color: cue.color, backend: "ue-media", requestDelayMs: now() - cue.receivedAt });
            } catch (e) {
                report("sound-play-rejected", { id: cue.id, detail: String(e), state: backendState() });
                drop(cue, "play-failed"); fail("media-play-failed", e, true);
            }
        }
    }
    function dispose() {
        if (disposed) return;
        disposed = true; release("disposed"); owner = null; ownerKey = worldKey = null; seen.clear();
    }
    function status() {
        return { backend: "ue-media", phase: disposed ? "disposed" : phase, enabled, paused,
            worldKey, wavPath, failure, playingId: playing && playing.id, pendingId: pending && pending.id,
            seen: seen.size, gameSfxSliderVerified: false, state: backendState() || lastBackendState,
            recovery: { attempts: recoveryAttempts, limit: recoveryDelays.length, retryInMs: recoveryAt ? Math.max(0, recoveryAt - now()) : null,
                exhausted: recoverableFailure && phase === "failed" && recoveryAttempts >= recoveryDelays.length },
            environment: typeof options.inspectEnvironment === "function" ? safe(() => options.inspectEnvironment(), null) : null,
            stats: { ...stats } };
    }
    return { update, dispose, status };
}

module.exports = { createNativeAudio, PRIORITY };
