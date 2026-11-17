"use strict";
const assert = require("assert");
const { createAudioEnvironmentProbe } = require("../PBZForewarn/audio-environment");
let checks = 0;
function test(name, run) { run(); checks++; console.log("PASS " + name); }
const clsPath = "/Script/AkAudio.AkSettings", cdoPath = "/Script/AkAudio.Default__AkSettings";
const settings = () => ({ _valid: true, _path: cdoPath, AudioRouting: 0,
    bWwiseSoundEngineEnabled: true, bWwiseAudioLinkEnabled: false, bAkAudioMixerEnabled: false });
function fixture(objects) {
    const finds = [];
    const ue = { Object: { Find(path) { finds.push(path); return objects[path]; }, Load() { throw Error("must not load"); } },
        NewObject() { throw Error("must not create"); } };
    const adapter = { valid: object => !!object && object._valid === true, path: object => object._path };
    return { finds, inspect: createAudioEnvironmentProbe(ue, adapter) };
}
test("CDO configuration is read without loading or mutating", () => {
    const cdo = Object.freeze(settings()), klass = Object.freeze({ _valid: true, ClassDefaultObject: cdo });
    const f = fixture({ [clsPath]: klass });
    const read = f.inspect();
    assert.equal(read.status, "read"); assert.equal(read.source, "class-default-object");
    assert.deepEqual(read.AudioRouting, { status: "read", value: 0, name: "EnableWwiseOnly" });
    assert.deepEqual(read.bWwiseSoundEngineEnabled, { status: "read", value: true });
    assert.deepEqual(read.bAkAudioMixerEnabled, { status: "read", value: false });
    assert.deepEqual(f.finds, [clsPath]); assert.equal(JSON.parse(JSON.stringify(read)).path, cdoPath);
});
test("missing reflected CDO field falls back to existing default object", () => {
    const f = fixture({ [clsPath]: { _valid: true }, [cdoPath]: settings() });
    assert.equal(f.inspect().source, "default-object-path"); assert.deepEqual(f.finds, [clsPath, cdoPath]);
});
test("valid CDO reference is cached but its observed scalar values stay current", () => {
    const cdo = settings(), f = fixture({ [cdoPath]: cdo });
    f.inspect(); cdo.AudioRouting = 3; cdo.bAkAudioMixerEnabled = true;
    const read = f.inspect(); assert.equal(read.AudioRouting.name, "AudioMixer");
    assert.equal(read.bAkAudioMixerEnabled.value, true); assert.equal(f.finds.length, 2);
});
test("invalidated cached object is resolved again", () => {
    const cdo = settings(), objects = { [cdoPath]: cdo }, f = fixture(objects);
    f.inspect(); cdo._valid = false; objects[cdoPath] = settings(); objects[cdoPath].AudioRouting = 1;
    assert.equal(f.inspect().AudioRouting.name, "Separate"); assert.equal(f.finds.length, 4);
});
test("missing and inaccessible configuration produce explicit safe snapshots", () => {
    assert.equal(fixture({}).inspect().status, "missing");
    const throwing = createAudioEnvironmentProbe({ Object: { Find() { throw Error("unreadable"); } } }, { valid: () => true });
    assert.equal(throwing().status, "unreadable");
    assert.equal(createAudioEnvironmentProbe(null, null)().status, "unreadable");
});
test("missing malformed and throwing properties remain distinct and JSON safe", () => {
    const cdo = settings(); delete cdo.bAkAudioMixerEnabled; cdo.AudioRouting = NaN; cdo.bWwiseSoundEngineEnabled = "true";
    Object.defineProperty(cdo, "bWwiseAudioLinkEnabled", { get() { throw Error("not reflected"); } });
    const read = fixture({ [cdoPath]: cdo }).inspect();
    assert.equal(read.status, "partial"); assert.equal(read.AudioRouting.status, "unreadable");
    assert.equal(read.bAkAudioMixerEnabled.status, "missing");
    assert.equal(read.bWwiseSoundEngineEnabled.status, "unreadable");
    assert.equal(read.bWwiseAudioLinkEnabled.status, "unreadable"); assert.doesNotThrow(() => JSON.stringify(read));
});
test("unrecognized future routing value is preserved rather than guessed", () => {
    const cdo = settings(); cdo.AudioRouting = 99;
    const read = fixture({ [cdoPath]: cdo }).inspect();
    assert.deepEqual(read.AudioRouting, { status: "read", value: 99, name: "unknown" });
    assert(!Object.hasOwn(read, "mixerAvailable"));
});
console.log(checks + " audio environment checks passed.");
