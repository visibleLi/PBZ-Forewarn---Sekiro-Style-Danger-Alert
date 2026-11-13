"use strict";
const assert = require("node:assert/strict");
const { createNativeAudio } = require("./wwise-audio");
let count = 0;
function test(name, body) { body(); count++; console.log("PASS " + name); }
function collection() { return { values: [], Empty() { this.values.length = 0; }, Add(...args) { this.values.push(args); },
    Num() { return this.values.length; }, Get(key) { return typeof key === "number" ? this.values[key]?.[0] : this.values.find(x => x[0] === key)?.[1]; } }; }
function fixture(options = {}) {
    let time = 1000, serial = 0;
    const logs = [], calls = [], events = [], components = [];
    const settings = { SoundOn: true, SoundVolume: 0.8 };
    function nativeField(field) {
        const key = options.alternateFieldCase ? field.slice(0, -2) + (field.endsWith("ID") ? "Id" : "ID") : field;
        const values = new WeakMap();
        function NativeStruct() {}
        if (!(options.missingIdField && field === "SoundBankId")) Object.defineProperty(NativeStruct.prototype, key,
            { get() { return values.get(this) || 0; }, set(value) { values.set(this, value); } });
        return NativeStruct;
    }
    const BankStruct = nativeField("SoundBankId"), EventStruct = nativeField("EventID"),
        LanguageStruct = nativeField("LanguageId"), LocalizedStruct = nativeField("EventID");
    const owner = { valid: true, path: "/Player", AddComponentByClass(cls, manual, transform, deferred) {
        assert.equal(cls, "AkComponent"); assert.equal(manual, true); assert.equal(deferred, true);
        const c = { valid: true, path: "/Component/" + components.length, AkAudioEvent: null, GetOwner: () => owner,
            SetOutputBusVolume(v) { calls.push(["volume", c, v]); c.volume = v; },
            K2_DestroyComponent(who) { assert.equal(who, owner); c.valid = false; calls.push(["destroy", c]); } };
        components.push(c); calls.push(["component", c]); return c;
    }, FinishAddComponent(c) { assert(c.AkAudioEvent); calls.push(["register", c]); } };
    const context = { world: { valid: true, path: "/World" }, player: owner, worldKey: "world1", paused: false };
    const UE = {
        AkComponent: { StaticClass: () => "AkComponent" }, AkAudioEvent: { StaticClass: () => "AkAudioEvent" },
        Transform: function () {}, WwisePackagedFile: function () {}, WwiseSoundBankCookedData: BankStruct,
        WwiseEventCookedData: function () { this.SoundBanks = collection(); this.Media = collection(); this.ExternalSources = collection();
            this.SwitchContainerLeaves = collection(); this.RequiredGroupValueSet = collection(); },
        WwiseLanguageCookedData: LanguageStruct, WwiseLocalizedEventCookedData: function () { this.EventLanguageMap = collection(); },
        EWwisePackagingStrategy: { AdditionalFile: 1 }, EWwiseSoundBankType: { Event: 30 },
        EWwiseEventDestroyOptions: { StopEventOnDestroy: 0 }, EWwiseLanguageRequirement: { SFX: 2 },
        EAkCallbackType: { EndOfEvent: 0 }, EAkResult: { Success: 1 }, AkActionOnEventType: { Stop: 0 }, EAkCurveInterpolation: { Linear: 4 },
        BlueprintPathsLibrary: { FileExists: () => !options.missingFile },
        AkGameplayStatics: { CancelEventCallback(cb) { calls.push(["cancel-callback", cb]); } },
        NewObject(cls, outer) {
            assert.equal(cls, "AkAudioEvent");
            const e = { valid: true, path: "/Event/" + events.length, outer, EventCookedData: null,
                GetWwiseShortID() {
                    if (options.lostNestedAssignment) e.EventCookedData.EventLanguageMap.Empty();
                    return options.wrongId ? 0 : e.EventCookedData[options.alternateFieldCase ? 'EventId' : 'EventID'];
                },
                LoadData() { calls.push(["load", e]); time += options.loadMs || 0; },
                UnloadData(async) { assert.equal(async, true); calls.push(["unload", e]); },
                PostOnComponent(c, cb, mask, stopWithOwner) {
                    assert.equal(c, outer); assert.equal(c.AkAudioEvent, e); assert.equal(mask, 1); assert.equal(stopWithOwner, true);
                    calls.push(["post", e, cb]); e.callback = cb;
                    if (options.throwPost) throw Error("Post failed");
                    const id = options.rejectPost ? 0 : ++serial; e.lastId = id;
                    if (options.syncEnd && id) cb(0, { PlayingID: id });
                    return id;
                },
                ExecuteAction(type, actor, id, duration, curve) {
                    assert.equal(type, 0); assert.equal(actor, null); assert.notEqual(id, 0); assert.equal(duration, 0); assert.equal(curve, 4);
                    calls.push(["stop", id]); return options.rejectStop ? 2 : 1;
                } };
            if (options.sdkGetterCase) { e.GetWwiseShortId = e.GetWwiseShortID; delete e.GetWwiseShortID; }
            events.push(e); return e;
        }
    };
    Object.setPrototypeOf(UE.WwiseEventCookedData.prototype, EventStruct.prototype);
    Object.setPrototypeOf(UE.WwiseLocalizedEventCookedData.prototype, LocalizedStruct.prototype);
    const adapter = { valid: x => !!x && x.valid === true, path: x => x.path };
    const config = { bankPath: "D:/PBZ/ProjectPBZ/Content/PBZForewarn/PBZForewarn.bnk", bankRelativePath: "PBZForewarn/PBZForewarn.bnk",
        bank: { eventId: 1682749338, bankId: 1682749338, durationSeconds: 4.6 }, now: () => time,
        inspectEnvironment: () => ({ AudioRouting: { name: "EnableWwiseOnly" } }) };
    const audio = createNativeAudio(UE, adapter, settings, (kind, data) => logs.push({ kind, ...data }), config);
    const update = (items = [], patch = {}) => audio.update({ ...context, ...patch }, items);
    const cue = (id, color = "red", extra = {}) => ({ kind: "cue", id, color, at: time, ...extra });
    return { audio, update, cue, settings, context, logs, calls, events, components, options,
        advance(ms) { time += ms; }, n(kind) { return calls.filter(x => x[0] === kind).length; } };
}
test("preload builds independent SFX bank data and strong owned reference once without sound", () => {
    const f = fixture(); f.update(); f.update();
    assert.equal(f.n("load"), 1); assert.equal(f.n("post"), 0); assert.equal(f.audio.status().phase, "prepared");
    const e = f.events[0], loc = e.EventCookedData, [lang, data] = loc.EventLanguageMap.values[0];
    assert.equal(loc.EventID, 1682749338); assert.equal(data.EventID, loc.EventID);
    assert.equal(lang.LanguageId, 0); assert.equal(lang.LanguageRequirement, 2); assert.equal(lang.LanguageName, "SFX");
    const b = data.SoundBanks.values[0][0]; assert.equal(b.bContainsMedia, true); assert.equal(b.SoundBankType, 30);
    assert.equal(b.PackagedFile.PathName, "PBZForewarn/PBZForewarn.bnk"); assert.equal(b.PackagedFile.ModularGameplayName, "Game");
    assert.equal(b.PackagedFile.PackagingStrategy, 1); assert.equal(data.Media.values.length, 0);
    assert.equal(f.components[0].AkAudioEvent, e); assert.equal(f.audio.status().strongEventReference, true);
    assert.equal(f.logs.find(x => x.kind === "sound-prepared").loadResult, "void-returned-unconfirmed");
});
test("fresh cue posts exact native event and consumes duplicate ID", () => {
    const f = fixture(); f.update(); f.update([f.cue("one")]); f.update([f.cue("one")]);
    assert.equal(f.n("post"), 1); assert.equal(f.audio.status().wwisePlayingId, 1);
    assert.equal(f.audio.status().stats.duplicates, 1); assert.equal(f.n("load"), 1);
});

test("actual game uppercase GetWwiseShortID reaches bank loading and playback", () => {
    const f = fixture(); f.update([f.cue("actual-case")]);
    assert.equal(typeof f.events[0].GetWwiseShortID, 'function');
    assert.equal(f.events[0].GetWwiseShortId, undefined); assert.equal(f.n('load'), 1); assert.equal(f.n('post'), 1);
});

test("SDK getter casing remains compatible through existing member resolution", () => {
    const f = fixture({ sdkGetterCase: true }); f.update([f.cue("sdk-case")]);
    assert.equal(f.n('post'), 1); assert.equal(f.audio.status().resolvedMembers.GetWwiseShortID, 'GetWwiseShortId');
});

test("native ID fields with different FName casing are updated without JS shadows", () => {
    const f = fixture({ alternateFieldCase: true }); f.update([f.cue('field-case')]);
    assert.equal(f.n('post'), 1);
    const loc = f.events[0].EventCookedData, [lang, data] = loc.EventLanguageMap.values[0];
    assert.equal(loc.EventId, 1682749338); assert.equal(Object.hasOwn(loc, 'EventID'), false);
    assert.equal(data.EventId, 1682749338); assert.equal(Object.hasOwn(data, 'EventID'), false);
    assert.equal(data.SoundBanks.Get(0).SoundBankID, 1682749338); assert.equal(Object.hasOwn(data.SoundBanks.Get(0), 'SoundBankId'), false);
    assert.equal(lang.LanguageID, 0); assert.equal(Object.hasOwn(lang, 'LanguageId'), false);
    f.events[0].callback(0, { PlayingId: 1 }); assert.equal(f.audio.status().playingId, null);
});

test("missing native ID field stops before LoadData without inventing JS field", () => {
    const f = fixture({ missingIdField: true }); f.update([f.cue('missing-native-field')]);
    assert.equal(f.n('load'), 0); assert.equal(f.n('post'), 0);
    assert(f.logs.some(x => x.kind === 'sound-unavailable' && x.detail.includes('SoundBankId')));
});
test("simultaneous priority is red black blue with no later suppressed replay", () => {
    const f = fixture(); f.update([f.cue("blue", "blue"), f.cue("black", "black"), f.cue("red")]);
    assert.equal(f.audio.status().playingId, "red");
    f.update([f.cue("black", "black")]); assert.equal(f.n("post"), 1); assert.equal(f.audio.status().stats.dropped, 2);
});
test("new cue stops only prior PlayingID and stale callback cannot clear new cue", () => {
    const f = fixture(); f.update([f.cue("old")]); const old = f.events[0].callback;
    f.update([f.cue("new")]); assert.deepEqual(f.calls.filter(x => x[0] === "stop"), [["stop", 1]]);
    old(0, { PlayingID: 1 }); assert.equal(f.audio.status().playingId, "new");
    f.events[0].callback(0, { PlayingID: 2 }); assert.equal(f.audio.status().playingId, null);
    assert.equal(f.audio.status().callbackCount, 0);
});
test("wrong PlayingID callback cannot terminate active cue", () => {
    const f = fixture(); f.update([f.cue("live")]); f.events[0].callback(0, { PlayingID: 99 });
    assert.equal(f.audio.status().playingId, "live");
});
test("natural glyph end keeps tail while cancellation stops exact sound", () => {
    const f = fixture(); f.update([f.cue("live")]);
    f.update([{ kind: "cancel", id: "live", reason: "display-expired" }]); assert.equal(f.n("stop"), 0);
    f.update([{ kind: "cancel", id: "other", reason: "cancelled" }]); assert.equal(f.n("stop"), 0);
    f.update([{ kind: "cancel", id: "live", reason: "cancelled" }]); assert.equal(f.n("stop"), 1);
});
test("same batch cancel and reset suppress pending cues", () => {
    const f = fixture(); f.update([f.cue("a"), { kind: "cancel", id: "a", reason: "cancelled" }]);
    f.update([f.cue("b"), { kind: "reset" }]); assert.equal(f.n("post"), 0);
});
test("pause stops current cue and consumes paused alerts without resuming them", () => {
    const f = fixture(); f.update([f.cue("a")]); f.update([f.cue("b")], { paused: true });
    f.update([f.cue("b")]); assert.equal(f.n("stop"), 1); assert.equal(f.n("post"), 1);
});
test("world change releases only private resources and ignores old callbacks", () => {
    const f = fixture(); f.update([f.cue("a")]); const cb = f.events[0].callback;
    f.update([f.cue("a")], { worldKey: "world2" }); cb(0, { PlayingID: 1 });
    assert.equal(f.n("unload"), 1); assert.equal(f.n("destroy"), 1); assert.equal(f.n("load"), 2);
    assert.equal(f.n("post"), 1); assert.equal(f.components[0].AkAudioEvent, null);
});
test("disable releases sound and reenable cannot replay consumed cues", () => {
    const f = fixture(); f.update([f.cue("a")]); f.settings.SoundOn = false; f.update([f.cue("b")]);
    assert.equal(f.n("destroy"), 1); f.settings.SoundOn = true; f.update([f.cue("b")]);
    assert.equal(f.n("post"), 1); assert.equal(f.n("load"), 2);
});
test("slow synchronous preload cannot play a stale combat cue", () => {
    const f = fixture({ loadMs: 100 }); f.update([f.cue("old")]); assert.equal(f.n("post"), 0);
    assert(f.logs.some(x => x.kind === "sound-dropped" && x.reason === "stale"));
    f.update([f.cue("new")]); assert.equal(f.n("post"), 1);
});
test("post refusal releases resources and bounded recovery never replays rejected cues", () => {
    const f = fixture({ rejectPost: true }); f.update([f.cue("bad")]);
    assert.equal(f.audio.status().phase, "recovering"); assert.equal(f.audio.status().recovery.retryInMs, 1000);
    f.update([f.cue("during")]); f.options.rejectPost = false; f.advance(1000); f.update([f.cue("bad"), f.cue("during")]);
    assert.equal(f.n("post"), 1); f.update([f.cue("fresh")]); assert.equal(f.n("post"), 2);
});
test("three automatic rebuilds are bounded and deliberate preview can rebuild after exhaustion", () => {
    const f = fixture({ rejectPost: true }); f.update([f.cue("bad")]);
    for (const [i, delay] of [1000, 3000, 10000].entries()) { f.advance(delay); f.update(); f.update([f.cue("bad" + i)]); }
    assert.equal(f.audio.status().phase, "failed"); f.options.rejectPost = false;
    f.update([f.cue("manual", "red", { preview: true })]); assert.equal(f.audio.status().phase, "prepared");
    assert.equal(f.n("post"), 4); f.update([f.cue("fresh")]); assert.equal(f.n("post"), 5);
});
test("missing bank or mismatched event ID fails without posting or global fallback", () => {
    for (const opt of [{ missingFile: true }, { wrongId: true }, { lostNestedAssignment: true }]) {
        const f = fixture(opt); f.update([f.cue("x")]); assert.equal(f.n("post"), 0);
        assert.equal(f.audio.status().phase, "failed"); assert(f.logs.some(x => x.kind === "sound-unavailable" && x.fallback === "none"));
    }
});
test("per component volume clamps without using a shared actor/global API", () => {
    const f = fixture(); f.update(); assert.equal(f.components[0].volume, 0);
    f.update([f.cue("a")]); assert.equal(f.components[0].volume, 0.8);
    f.settings.SoundVolume = 9; f.update(); assert.equal(f.components[0].volume, 2);
    f.settings.SoundVolume = -1; f.update(); assert.equal(f.components[0].volume, 0);
});
test("pause reset and cancel keep emitter muted until an accepted new cue", () => {
    for (const action of ["pause", "cancel", "reset"]) {
        const f = fixture(); f.update([f.cue("a")]);
        if (action === "pause") f.update([], { paused: true });
        if (action === "cancel") f.update([{ kind: "cancel", id: "a", reason: "cancelled" }]);
        if (action === "reset") f.update([{ kind: "reset" }]);
        assert.equal(f.components[0].volume, 0); f.update(); assert.equal(f.components[0].volume, 0);
        f.update([f.cue("b")]); assert.equal(f.components[0].volume, 0.8);
    }
});
test("completion timeout bounds callback lifetime if no EndOfEvent arrives", () => {
    const f = fixture(); f.update([f.cue("a")]); f.advance(6101); f.update();
    assert.equal(f.audio.status().callbackCount, 0); assert.equal(f.audio.status().playingId, null);
    assert(f.logs.some(x => x.reason === "completion-timeout"));
});
test("synchronous completion cannot leave a phantom playing token", () => {
    const f = fixture({ syncEnd: true }); f.update([f.cue("a")]);
    assert.equal(f.audio.status().playingId, null); assert.equal(f.audio.status().callbackCount, 0);
});
test("failed stop mutes and discards emitter instead of reusing an uncertain old voice", () => {
    for (const action of ["pause", "new-cue", "cancel", "reset"]) {
        const f = fixture({ rejectStop: true }); f.update([f.cue("old")]);
        if (action === "pause") f.update([], { paused: true });
        if (action === "new-cue") f.update([f.cue("new")]);
        if (action === "cancel") f.update([{ kind: "cancel", id: "old", reason: "cancelled" }]);
        if (action === "reset") f.update([{ kind: "reset" }]);
        assert.equal(f.components[0].volume, 0); assert.equal(f.components[0].valid, false);
        assert.equal(f.n("post"), 1); assert.equal(f.audio.status().phase, "recovering");
    }
});
test("dispose is idempotent and never posts after disposal", () => {
    const f = fixture(); f.update([f.cue("a")]); const cb = f.events[0].callback;
    f.audio.dispose(); f.audio.dispose(); cb(0, { PlayingID: 1 }); f.update([f.cue("b")]);
    assert.equal(f.n("destroy"), 1); assert.equal(f.n("post"), 1); assert.equal(f.audio.status().phase, "disposed");
});
console.log(count + " Wwise audio checks passed.");
