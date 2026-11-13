"use strict";
const assert = require("node:assert/strict");
const { createNativeAudio, PRIORITY } = require("./native-audio");
let count = 0;
function test(name, fn) { fn(); count++; console.log("PASS " + name); }
class Delegate {
    constructor() { this.callbacks = new Set(); }
    Add(fn) { this.callbacks.add(fn); }
    Remove(fn) { this.callbacks.delete(fn); }
    fire(...args) { for (const fn of [...this.callbacks]) fn(...args); }
}
function harness(options = {}) {
    let time = 1000;
    const history = [], logs = [], players = [], sounds = [];
    const settings = { SoundOn: true, SoundVolume: 1, ...options.settings };
    function mediaObject(outer) {
        const m = { valid: true, outer, ready: false, isPlaying: false, error: false, topologyReady: false,
            OnMediaOpened: new Delegate(), OnMediaOpenFailed: new Delegate(),
            OnSeekCompleted: new Delegate(), OnEndReached: new Delegate(),
            OpenFile(file) { history.push(["open", file]); return !options.rejectOpen; },
            Close() { history.push(["close"]); m.ready = false; m.isPlaying = false; },
            HasError() { return m.error; },
            IsPlaying() { return m.isPlaying; },
            IsReady() { return m.ready; },
            IsPaused() { return m.ready && !m.isPlaying; }, IsPreparing() { return !m.ready; },
            IsClosed() { return !m.ready; }, IsBuffering() { return false; },
            GetRate() { return m.isPlaying ? 1 : 0; }, CanPause() { return m.isPlaying; },
            SupportsRate(rate, unthinned) { assert.equal(rate, 1); assert.equal(typeof unthinned, "boolean"); return m.topologyReady && !options.delayRates; },
            GetTrackFormat(type, track) { assert.equal(type, 0); assert.equal(track, 0); return 0; },
            GetAudioTrackChannels(track, format) { assert.equal(track, 0); assert.equal(format, 0); return 2; },
            GetAudioTrackSampleRate(track, format) { assert.equal(track, 0); assert.equal(format, 0); return 44100; },
            SetLooping(loop) { history.push(["loop", loop]); return !options.rejectLoop; },
            GetPlayerName() { return "MockWmfMedia"; },
            GetNumTracks(type) { assert.equal(type, 0); return options.noAudioTrack ? 0 : 1; },
            GetSelectedTrack(type) { assert.equal(type, 0); return options.noSelectedTrack ? -1 : 0; },
            SelectTrack(type, index) { assert.equal(type, 0); assert.equal(index, 0); history.push(["select-track"]); return !options.rejectTrack; },
            SupportsSeeking() { return !options.noSeeking; },
            Rewind() { history.push(["rewind"]); if (options.syncSeek) m.OnSeekCompleted.fire(); return !options.rejectSeek; },
            Pause() {
                history.push(["pause"]); if (options.rejectPause) return false;
                if (!options.delayPause) m.isPlaying = false; m.playPending = false; return true;
            },
            Play() {
                history.push(["play"]); assert(outer.active && outer.tickEnabled && m.topologyReady, "active sink must precede Play");
                assert.equal(outer.MediaPlayer, m, "strong reflected reference must retain media");
                if (options.throwPlay) throw Error("play exception");
                m.isPlaying = !options.rejectPlay && !options.asyncPlay;
                m.playPending = !options.rejectPlay && !!options.asyncPlay; return !options.rejectPlay;
            }
        };
        players.push(m); return m;
    }
    function ownerObject(key) {
        const owner = { valid: true, key,
            AddComponentByClass(classType, manual, transform, deferred) {
                assert.equal(classType, "MediaSoundComponent"); assert.equal(manual, true); assert.equal(deferred, true);
                if (options.rejectComponent) return null;
                const c = { valid: true, owner, registered: false, retained: null, active: false, tickEnabled: false, volume: null,
                    SetMediaPlayer(m) { c.retained = m; history.push(["retain", m]); },
                    GetMediaPlayer() { return c.retained; },
                    GetOwner() { return options.badOwner ? { valid: true, key: "other" } : c.owner; },
                    SetVolumeMultiplier(v) { assert(c.registered); c.volume = v; history.push(["volume", v]); },
                    SetComponentTickEnabled(enabled) { c.tickEnabled = enabled; history.push(["tick", enabled]); },
                    IsComponentTickEnabled() { return c.tickEnabled; }, IsActive() { return c.active; }, IsPlaying() { return c.active; },
                    Start() { assert(c.registered); assert(c.retained); c.active = true; history.push(["start"]); },
                    Stop() { c.active = false; history.push(["stop"]); },
                    K2_DestroyComponent(requester) { assert.equal(requester, owner); c.valid = false; history.push(["destroy"]); }
                };
                sounds.push(c); return c;
            },
            FinishAddComponent(c, manual) { assert.equal(c.owner, owner); assert.equal(manual, true); assert.equal(c.bAutoActivate, false); c.registered = true; history.push(["register"]); }
        };
        return owner;
    }
    const owner = ownerObject("player1"), world = { valid: true, key: "world1" };
    const context = { world, player: owner, worldKey: "world1", paused: false };
    const UE = {
        BlueprintPathsLibrary: { FileExists: () => !options.missingFile },
        MediaSoundComponent: { StaticClass: () => "MediaSoundComponent" },
        MediaPlayer: { StaticClass: () => "MediaPlayer" },
        EMediaSoundChannels: { Stereo: 1 },
        EMediaPlayerTrack: { Audio: 0 },
        Transform: function Transform() {},
        NewObject(type, outer) { assert.equal(type, "MediaPlayer"); return mediaObject(outer); }
    };
    if (options.missingMediaClass) delete UE.MediaPlayer;
    const adapter = { valid: obj => !!obj && obj.valid === true, path: obj => obj.key || "" };
    const audio = createNativeAudio(UE, adapter, settings, (kind, data) => logs.push({ kind, ...data }),
        { wavPath: options.wavPath || "C:/mods/PBZForewarn/cue.wav", now: () => time, inspectEnvironment: options.inspectEnvironment });
    const update = (events = [], patch = {}) => {
        // UE component ticking registers the sink; the facade applies the audio
        // track selection on a later tick. Track enumeration itself is earlier.
        for (const m of players) m.topologyReady = m.ready && m.outer.active && m.outer.tickEnabled;
        audio.update({ ...context, ...patch }, events);
    };
    function open() { const m = players.at(-1); m.ready = true; m.OnMediaOpened.fire("file://cue.wav"); }
    function ready() { update(); open(); update(); }
    function seek() { players.at(-1).OnSeekCompleted.fire(); }
    function cue(id, color = "red", extra = {}) { return { kind: "cue", id, color, at: time, ...extra }; }
    return { audio, update, open, ready, seek, cue, settings, context, ownerObject, players, sounds, history, logs,
        advance(ms) { time += ms; }, times(name) { return history.filter(x => x[0] === name).length; } };
}

test("preload registers one owned non-spatial UE component and never autoplays", () => {
    const h = harness(); h.ready();
    const c = h.sounds[0], m = h.players[0];
    assert(c.registered); assert.equal(m.outer, c); assert.equal(c.retained, m); assert.equal(c.MediaPlayer, m);
    assert.equal(c.bAllowSpatialization, false); assert.equal(c.AttenuationSettings, null);
    assert.equal(c.bStopWhenOwnerDestroyed, true); assert.equal(c.bIsUISound, false);
    assert.equal(m.PlayOnOpen, false); assert.equal(m.NativeAudioOut, false); assert.equal(m.Loop, false);
    assert.equal(h.times("play"), 0); assert.equal(h.times("start"), 1); assert.equal(h.audio.status().phase, "ready");
    assert(c.active && c.tickEnabled); assert.equal(c.volume, 0);
    assert(h.history.findIndex(x => x[0] === "start") < h.history.findIndex(x => x[0] === "open"));
    h.update(); h.update(); assert.equal(h.players.length, 1);
});
test("a ready cue uses the original WAV through UE Media and does not replay its id", () => {
    const h = harness(); h.ready(); h.update([h.cue("t1")]); h.update([h.cue("t1")]);
    assert.equal(h.times("play"), 1); assert.equal(h.times("start"), 1);
    assert.equal(h.audio.status().playingId, "t1"); assert.equal(h.audio.status().stats.duplicates, 1);
    assert.equal(h.history.find(x => x[0] === "open")[1], "C:/mods/PBZForewarn/cue.wav");
    assert.equal(h.audio.status().gameSfxSliderVerified, false);
});
test("simultaneous red, black, blue play red once; suppressed ids cannot replay", () => {
    const h = harness(); h.ready(); h.update([h.cue("b", "blue"), h.cue("k", "black"), h.cue("r")]);
    assert(PRIORITY.red > PRIORITY.black && PRIORITY.black > PRIORITY.blue);
    assert.equal(h.audio.status().playingId, "r"); assert.equal(h.times("play"), 1);
    h.update([h.cue("b", "blue"), h.cue("k", "black")]); assert.equal(h.times("play"), 1);
    assert.equal(h.audio.status().stats.dropped, 2);
});
test("new alert interrupts old tail, waits for rewind, then plays latest exactly once", () => {
    const h = harness(); h.ready(); h.update([h.cue("old")]);
    h.update([h.cue("new", "blue")]); assert.equal(h.audio.status().phase, "seeking");
    assert.equal(h.audio.status().playingId, null); assert.equal(h.times("play"), 1);
    h.seek(); h.update(); assert.equal(h.audio.status().playingId, "new"); assert.equal(h.times("play"), 2);
    h.seek(); h.update(); assert.equal(h.times("play"), 2);
});
test("multiple cues during one seek replace pending without issuing competing seeks", () => {
    const h = harness(); h.ready(); h.update([h.cue("old")]); h.update([h.cue("a")]); h.update([h.cue("b", "black")]);
    assert.equal(h.times("rewind"), 1); h.seek(); h.update(); assert.equal(h.audio.status().playingId, "b");
    assert.equal(h.times("play"), 2); h.update([h.cue("a")]); assert.equal(h.times("play"), 2);
});
test("glyph ending and natural completion do not truncate the 4.6 second sound", () => {
    const h = harness(); h.ready(); h.update([h.cue("tail")]); const stops = h.times("stop");
    for (const reason of ["event-ended", "display-expired", "OnCompleted"])
        h.update([{ kind: "cancel", id: "tail", reason }]);
    h.advance(1200); h.update(); assert.equal(h.times("stop"), stops); assert.equal(h.audio.status().playingId, "tail");
});
test("media EOF allows the mixer tail to drain before stopping and re-arming", () => {
    const h = harness(); h.ready(); h.update([h.cue("tail")]); const stops = h.times("stop");
    h.players[0].OnEndReached.fire(); assert.equal(h.audio.status().phase, "draining");
    h.advance(249); h.update(); assert.equal(h.times("stop"), stops);
    h.advance(1); h.update(); assert.equal(h.times("stop"), stops); assert.equal(h.sounds[0].volume, 0);
    assert(h.sounds[0].active); assert.equal(h.audio.status().phase, "seeking");
    h.seek(); h.update(); assert.equal(h.audio.status().phase, "ready"); assert.equal(h.times("play"), 1);
});
test("matching cancellation stops only this sound; unrelated cancellation leaves tail", () => {
    const h = harness(); h.ready(); h.update([h.cue("live")]);
    h.update([{ kind: "cancel", id: "other", reason: "task-cancelled" }]); assert.equal(h.audio.status().playingId, "live");
    h.update([{ kind: "cancel", id: "live", reason: "task-cancelled" }]); assert.equal(h.audio.status().playingId, null);
    h.seek(); h.update([h.cue("live")]); assert.equal(h.times("play"), 1);
});
test("cue cancelled before seek completion cannot be started by its late callback", () => {
    const h = harness(); h.ready(); h.update([h.cue("old")]); h.update([h.cue("pending")]);
    h.update([{ kind: "cancel", id: "pending" }]); h.seek(); h.update();
    assert.equal(h.times("play"), 1); assert.equal(h.audio.status().pendingId, null);
});
test("same-batch cancel and reset suppress all earlier pending cues", () => {
    const h = harness(); h.ready(); h.update([h.cue("a"), { kind: "cancel", id: "a" }, h.cue("b"), { kind: "reset" }]);
    assert.equal(h.times("play"), 0); h.update([h.cue("a"), h.cue("b")]); assert.equal(h.times("play"), 0);
});
test("pause stops current sound and consumes paused cues without replay on resume", () => {
    const h = harness(); h.ready(); h.update([h.cue("old")]);
    h.update([h.cue("paused")], { paused: true }); assert.equal(h.audio.status().playingId, null);
    h.seek(); h.update([h.cue("paused")], { paused: false }); assert.equal(h.times("play"), 1);
    h.update([h.cue("fresh")]); assert.equal(h.times("play"), 2);
});
test("preload is allowed while paused but never starts sound", () => {
    const h = harness(); h.update([], { paused: true }); h.open(); h.update([h.cue("paused")], { paused: true });
    assert.equal(h.audio.status().phase, "ready"); assert.equal(h.times("play"), 0);
});
test("world switch destroys only owned component, closes old media and ignores old callbacks", () => {
    const h = harness(); h.ready(); h.update([h.cue("same")]);
    const old = h.players[0], stale = [...old.OnMediaOpened.callbacks][0];
    const next = { world: { valid: true, key: "world2" }, worldKey: "world2", player: h.ownerObject("player2") };
    h.update([], next); assert.equal(h.sounds[0].valid, false); assert.equal(old.OnMediaOpened.callbacks.size, 0);
    stale("old.wav"); assert.equal(h.audio.status().phase, "opening");
    h.open(); h.update([h.cue("same")], next); assert.equal(h.times("play"), 1);
    h.update([h.cue("new-world-cue")], next); assert.equal(h.times("play"), 2);
});
test("owner replacement in same world preserves duplicate suppression", () => {
    const h = harness(); h.ready(); h.update([h.cue("old")]); const patch = { player: h.ownerObject("replacement") };
    h.update([], patch); h.open(); h.update([h.cue("old")], patch); assert.equal(h.times("play"), 1);
});
test("disable disposes resources, consumes cues, and re-enable preloads without replay", () => {
    const h = harness(); h.ready(); h.update([h.cue("old")]); h.settings.SoundOn = false;
    h.update([h.cue("disabled")]); assert.equal(h.sounds[0].valid, false);
    h.settings.SoundOn = true; h.update(); h.open(); h.update([h.cue("disabled")]); assert.equal(h.times("play"), 1);
});
test("open delay never queues an obsolete warning for later playback", () => {
    const h = harness(); h.update([h.cue("expired")]); h.advance(81); h.open(); h.update();
    assert.equal(h.times("play"), 0); assert.equal(h.audio.status().pendingId, null);
    assert(h.logs.some(x => x.reason === "start-deadline"));
});
test("a fast asynchronous open may service a fresh cue within the 80ms deadline", () => {
    const h = harness(); h.update([h.cue("fresh")]); h.advance(30); h.open(); h.update();
    assert.equal(h.times("play"), 1); assert.equal(h.logs.find(x => x.kind === "sound-play").requestDelayMs, 30);
});
test("stale input is consumed without playing or retrying", () => {
    const h = harness(); h.ready(); h.update([h.cue("stale", "red", { at: 0 })]); h.update([h.cue("stale")]);
    assert.equal(h.times("play"), 0); assert.equal(h.audio.status().stats.duplicates, 1);
});
test("failed or unsupported WAV remains silent and reports no fallback", () => {
    for (const options of [{ missingFile: true }, { rejectOpen: true }, { missingMediaClass: true },
        { badOwner: true }, { rejectComponent: true }, { wavPath: "relative/cue.wav" }]) {
        const h = harness(options); h.update([h.cue("x")]); h.update([h.cue("y")]);
        assert.equal(h.audio.status().phase, "failed"); assert.equal(h.times("play"), 0);
        assert(h.logs.some(x => x.kind === "sound-unavailable" && x.fallback === "none"));
    }
});
test("asynchronous decoder failure removes delegates and resources without retries", () => {
    const h = harness(); h.update(); h.players[0].OnMediaOpenFailed.fire("unsupported codec"); h.update();
    assert.equal(h.audio.status().phase, "failed"); assert.equal(h.sounds[0].valid, false); assert.equal(h.players.length, 1);
});
test("opening with no discovered audio track fails; unselected audio is selected explicitly", () => {
    const silent = harness({ noAudioTrack: true }); silent.update(); silent.open();
    assert.equal(silent.audio.status().phase, "failed"); assert.equal(silent.times("play"), 0);
    const selectable = harness({ noSelectedTrack: true }); selectable.ready(); selectable.update([selectable.cue("x")]);
    assert.equal(selectable.times("select-track"), 1); assert.equal(selectable.times("play"), 1);
    const rejected = harness({ noSelectedTrack: true, rejectTrack: true }); rejected.update(); rejected.open();
    assert.equal(rejected.audio.status().phase, "failed");
});
test("preparing backend timeout fails closed instead of hanging or late playing", () => {
    const h = harness(); h.update(); h.advance(10001); h.update();
    assert.equal(h.audio.status().failure, "media-prepare-timeout"); assert.equal(h.times("play"), 0);
});
test("play rejection and exception silence owned audio and schedule bounded recovery", () => {
    for (const options of [{ rejectPlay: true }, { throwPlay: true }]) {
        const h = harness(options); h.ready(); h.update([h.cue("x")]);
        assert.equal(h.audio.status().phase, "recovering"); assert.equal(h.times("start"), 1); assert.equal(h.sounds[0].valid, false);
        assert.equal(h.audio.status().recovery.retryInMs, 1000); assert.equal(h.sounds[0].volume, 0);
        const rejected = h.logs.find(x => x.kind === "sound-play-rejected");
        assert.equal(rejected.state.supportsRate1Unthinned, true); assert.equal(rejected.state.componentActive, true);
    }
});
test("unsupported rewind cannot replay a leftover tail", () => {
    for (const options of [{ noSeeking: true }, { rejectSeek: true }]) {
        const h = harness(options); h.ready(); h.update([h.cue("old")]); h.update([h.cue("new")]);
        assert.equal(h.audio.status().phase, "recovering"); assert.equal(h.times("play"), 1); assert.equal(h.sounds[0].volume, 0);
    }
});
test("synchronous seek callback is handled without waiting for a second cue", () => {
    const h = harness({ syncSeek: true }); h.ready(); h.update([h.cue("a")]); h.update([h.cue("b")]);
    assert.equal(h.times("play"), 2); assert.equal(h.audio.status().playingId, "b");
});
test("volume changes are local to component and clamped to configured 0..2", () => {
    const h = harness({ settings: { SoundVolume: 10 } }); h.ready();
    assert.equal(h.history.filter(x => x[0] === "volume").at(-1)[1], 0);
    h.update([h.cue("volume")]);
    assert.equal(h.history.filter(x => x[0] === "volume").at(-1)[1], 2);
    h.settings.SoundVolume = -1; h.update(); assert.equal(h.history.filter(x => x[0] === "volume").at(-1)[1], 0);
    h.settings.SoundVolume = NaN; h.update(); assert.equal(h.history.filter(x => x[0] === "volume").at(-1)[1], 1);
});
test("dispose is idempotent and stale delegates cannot revive an audio instance", () => {
    const h = harness(); h.ready(); h.update([h.cue("x")]); const callback = [...h.players[0].OnEndReached.callbacks][0];
    h.audio.dispose(); h.audio.dispose(); callback(); h.update([h.cue("y")]);
    assert.equal(h.times("destroy"), 1); assert.equal(h.times("play"), 1); assert.equal(h.audio.status().phase, "disposed");
});
test("temporary world loss stops owned audio and cannot replay consumed ids", () => {
    const h = harness(); h.ready(); h.update([h.cue("old")]);
    h.update([h.cue("lost")], { world: null }); assert.equal(h.sounds[0].valid, false);
    h.update(); h.open(); h.update([h.cue("old"), h.cue("lost")]); assert.equal(h.times("play"), 1);
});

test("opened track cannot become ready until active sink topology supports playback", () => {
    const options = { delayRates: true }, h = harness(options);
    h.update(); h.open();
    assert.equal(h.audio.status().phase, "arming");
    assert.equal(h.audio.status().state.selectedTrack, 0); assert.equal(h.audio.status().state.ready, true);
    assert.equal(h.audio.status().state.supportsRate1Unthinned, false);
    h.update([h.cue("too-early")]); h.advance(81); h.update();
    assert.equal(h.times("play"), 0); assert.equal(h.audio.status().pendingId, null);
    options.delayRates = false; h.update();
    assert.equal(h.audio.status().phase, "ready"); assert.equal(h.times("play"), 0);
    h.update([h.cue("fresh")]); assert.equal(h.audio.status().playingId, "fresh");
});

test("consumer starts before file open and later topology readiness can service a fresh cue", () => {
    const options = { delayRates: true }, h = harness(options);
    h.update(); h.open(); h.update([h.cue("in-time")]);
    assert.equal(h.times("play"), 0); assert.equal(h.sounds[0].volume, 0);
    h.advance(32); options.delayRates = false; h.update();
    assert.equal(h.audio.status().playingId, "in-time"); assert.equal(h.times("start"), 1);
    const playIndex = h.history.findIndex(x => x[0] === "play");
    assert(h.history.slice(0, playIndex).filter(x => x[0] === "volume").every(x => x[1] === 0));
    assert.equal(h.history[playIndex + 1][0], "volume"); assert.equal(h.sounds[0].volume, 1);
});

test("pause and rewind keep consumer active and muted until a new accepted play", () => {
    const h = harness(); h.ready(); h.update([h.cue("old")]);
    h.update([], { paused: true });
    assert(h.sounds[0].active && h.sounds[0].tickEnabled); assert.equal(h.sounds[0].volume, 0);
    assert.equal(h.times("stop"), 0); h.seek(); h.update([], { paused: false });
    assert.equal(h.sounds[0].volume, 0); assert.equal(h.times("play"), 1);
    h.update([h.cue("new")]); assert.equal(h.sounds[0].volume, 1); assert.equal(h.times("start"), 1);
    h.audio.dispose(); assert.equal(h.times("stop"), 1); assert.equal(h.sounds[0].MediaPlayer, null);
});

test("cancelling an accepted asynchronous Play queues Pause before rewind", () => {
    const h = harness({ asyncPlay: true }); h.ready(); h.update([h.cue("pending-play")]);
    assert.equal(h.players[0].IsPlaying(), false); assert.equal(h.players[0].playPending, true);
    h.update([{ kind: "cancel", id: "pending-play", reason: "task-cancelled" }]);
    assert.equal(h.players[0].playPending, false); assert.equal(h.times("pause"), 1);
    assert(h.history.findIndex(x => x[0] === "pause") < h.history.findIndex(x => x[0] === "rewind"));
    assert.equal(h.sounds[0].volume, 0); h.seek(); h.update();
    assert.equal(h.audio.status().playingId, null); assert.equal(h.times("play"), 1);
});

test("rejected Pause closes and rebuilds media without unmuting an old position", () => {
    const h = harness({ rejectPause: true, asyncPlay: true }); h.ready(); h.update([h.cue("old")]);
    h.update([h.cue("replacement")]);
    assert.equal(h.audio.status().phase, "recovering"); assert.equal(h.audio.status().failure, "media-pause-failed");
    assert.equal(h.sounds[0].valid, false); assert.equal(h.sounds[0].volume, 0);
    assert.equal(h.times("play"), 1); assert.equal(h.times("rewind"), 0);
    assert.equal(h.audio.status().pendingId, null);
});

test("rewind completion cannot rearm while an accepted Pause is still pending", () => {
    const h = harness({ delayPause: true }); h.ready(); h.update([h.cue("old")]);
    h.update([h.cue("fresh")]); h.seek(); h.update();
    assert.equal(h.audio.status().phase, "arming"); assert.equal(h.times("play"), 1);
    assert.equal(h.sounds[0].volume, 0); h.advance(32); h.players[0].isPlaying = false; h.update();
    assert.equal(h.audio.status().playingId, "fresh"); assert.equal(h.times("play"), 2);
});

test("one rejected play recovers without replaying failed or recovery-period cue ids", () => {
    const options = { rejectPlay: true }, h = harness(options); h.ready(); h.update([h.cue("failed")]);
    h.advance(999); h.update([h.cue("during-recovery")]); assert.equal(h.players.length, 1);
    options.rejectPlay = false; h.advance(1); h.update(); assert.equal(h.players.length, 2);
    h.open(); h.update([h.cue("failed"), h.cue("during-recovery")]); assert.equal(h.times("play"), 1);
    h.update([h.cue("new")]); assert.equal(h.audio.status().playingId, "new"); assert.equal(h.times("play"), 2);
});

test("automatic recovery is bounded to three attempts and explicit preview rearms it", () => {
    const options = { rejectPlay: true }, h = harness(options); h.ready(); h.update([h.cue("first-fail")]);
    for (const [i, delay] of [1000, 3000, 10000].entries()) {
        assert.equal(h.audio.status().recovery.retryInMs, delay);
        h.advance(delay - 1); h.update(); assert.equal(h.players.length, i + 1);
        h.advance(1); h.update(); assert.equal(h.players.length, i + 2);
        h.open(); h.update([h.cue("failure-" + i)]);
    }
    assert.equal(h.audio.status().phase, "failed"); assert.equal(h.audio.status().recovery.exhausted, true);
    h.advance(20000); h.update([h.cue("ordinary")]); assert.equal(h.players.length, 4);
    h.update([h.cue("manual", "red", { preview: true })]); assert.equal(h.players.length, 5);
    assert.equal(h.audio.status().phase, "opening"); assert.equal(h.audio.status().recovery.attempts, 0);
    options.rejectPlay = false; h.open(); h.update(); assert.equal(h.times("play"), 4);
    h.update([h.cue("manual", "red", { preview: true })]); assert.equal(h.times("play"), 4);
    h.update([h.cue("after-recovery")]); assert.equal(h.times("play"), 5);
});

test("failed state retains backend and environment evidence after releasing objects", () => {
    const h = harness({ rejectPlay: true, inspectEnvironment: () => ({ fixture: "routing-evidence" }) });
    h.ready(); h.update([h.cue("rejected")]);
    const status = h.audio.status();
    assert.equal(status.state.componentActive, true); assert.equal(status.state.componentTickEnabled, true);
    assert.equal(status.state.strongPlayerReference, true); assert.equal(status.state.channels, 2);
    assert.equal(status.state.sampleRate, 44100); assert.equal(status.environment.fixture, "routing-evidence");
    assert.equal(h.logs.find(x => x.kind === "sound-unavailable").state.supportsRate1Thinned, true);
    assert.equal(h.sounds[0].valid, false);
});
test("all engine calls and assigned properties exist in the local reflected SDK", () => {
    // This checks the evidence we have. It is not an Unreal runtime invocation.
    const fs = require("node:fs"), path = require("node:path");
    const root = path.resolve(__dirname, "../../evidence/reflection");
    const source = name => fs.readFileSync(path.join(root, name + ".d.ts"), "utf8");
    const engine = source("Engine"), media = source("MediaAssets"), mixer = source("AudioMixer");
    const expected = [
        [engine, '"AddComponentByClass"(Class: UE.Class | null | undefined, bManualAttachment: boolean, RelativeTransform: UE.Transform, bDeferredFinish: boolean): UE.ActorComponent | null | undefined;'],
        [engine, '"FinishAddComponent"(Component: UE.ActorComponent | null | undefined, bManualAttachment: boolean, RelativeTransform: UE.Transform): void;'],
        [engine, '"K2_DestroyComponent"(Object: UE.Object | null | undefined): void;'],
        [engine, '"GetOwner"(): UE.Actor | null | undefined;'],
        [engine, '"FileExists"(InPath: string): boolean;'],
        [media, '"OpenFile"(FilePath: string): boolean;'],
        [media, '"SetLooping"(Looping: boolean): boolean;'],
        [media, '"SetMediaPlayer"(NewMediaPlayer: UE.MediaPlayer | null | undefined): void;'],
        [media, '"GetMediaPlayer"(): UE.MediaPlayer | null | undefined;'],
        [media, '"GetNumTracks"(TrackType: UE.EMediaPlayerTrack): number;'],
        [media, '"GetSelectedTrack"(TrackType: UE.EMediaPlayerTrack): number;'],
        [media, '"SelectTrack"(TrackType: UE.EMediaPlayerTrack, TrackIndex: number): boolean;'],
        [media, '"SupportsRate"(Rate: number, Unthinned: boolean): boolean;'],
        [media, '"GetRate"(): number;'],
        [media, '"GetTrackFormat"(TrackType: UE.EMediaPlayerTrack, TrackIndex: number): number;'],
        [media, '"GetAudioTrackChannels"(TrackIndex: number, FormatIndex: number): number;'],
        [media, '"GetAudioTrackSampleRate"(TrackIndex: number, FormatIndex: number): number;'],
        [engine, '"SetComponentTickEnabled"(bEnabled: boolean): void;'],
        [engine, '"IsComponentTickEnabled"(): boolean;'],
        [engine, '"IsActive"(): boolean;'],
        [mixer, '"SetVolumeMultiplier"(VolumeMultiplier: number): void;']
    ];
    for (const [text, signature] of expected) assert(text.includes(signature), "Missing SDK signature: " + signature);
    for (const name of ["Play", "Pause", "Rewind", "IsPlaying", "IsPaused", "IsPreparing", "IsClosed", "IsBuffering", "IsReady", "HasError", "SupportsSeeking", "CanPause"])
        assert(media.includes('"' + name + '"(): boolean;'), name);
    assert(media.includes('"Close"(): void;')); assert(media.includes('"GetPlayerName"(): string;'));
    for (const name of ["Start", "Stop"]) assert(mixer.includes('"' + name + '"(): void;'));
    for (const name of ["PlayOnOpen", "NativeAudioOut", "Loop"]) assert(media.includes('"' + name + '": boolean;'));
    for (const name of ["bAutoDestroy", "bStopWhenOwnerDestroyed", "bAllowSpatialization", "bOverrideAttenuation", "bIsUISound", "bIsPreviewSound"])
        assert(mixer.includes('"' + name + '": boolean;'));
    assert(engine.includes('"bAutoActivate": boolean;'));
    assert(media.includes('"MediaPlayer": UE.MediaPlayer | null | undefined;'));
    for (const name of ["OnMediaOpened", "OnMediaOpenFailed", "OnSeekCompleted", "OnEndReached"])
        assert(media.includes('"' + name + '": UE.$MulticastDelegate<'));
});
console.log("RESULT " + count + " UE Media audio scenarios passed. UE objects are mocked; no game/audio device was used.");
