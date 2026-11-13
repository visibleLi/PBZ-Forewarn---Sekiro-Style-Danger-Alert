'use strict';
const assert = require('assert');
const { Scheduler, classifyEffect } = require('./core');
let passed = 0;
function test(name, run) {
    run(); passed++; console.log('PASS ' + name);
}
function fixture(options) {
    const cues = [], cancels = [], diagnostics = [];
    const scheduler = new Scheduler(Object.assign({
        onCue: e => cues.push(e), onCancel: e => cancels.push(e),
        onDiagnostic: (type, data) => diagnostics.push({ type, data })
    }, options || {}));
    return { scheduler, cues, cancels, diagnostics };
}
function event(overrides) { return Object.assign({ key: 'event', color: 'red', start: 1, end: 1.5, eligible: true, meta: { name: 'test' } }, overrides || {}); }
function task(time, overrides) { return Object.assign({ key: 'actor/ability/task', activation: 1, timelineKey: 'timeline', time, events: [event()] }, overrides || {}); }
function frame(now, tasks, overrides) { return Object.assign({ now, wall: now * 1000 + 10000, worldKey: 'map', paused: false, tasks }, overrides || {}); }
function freeze(value) {
    if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) freeze(value[key]);
        Object.freeze(value);
    }
    return value;
}

test('classification uses known namespace and supports Common and LeiTing names', () => {
    assert.equal(classifyEffect('/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Red_004.NS_AttackAlert_Red_004'), 'red');
    assert.equal(classifyEffect('/PBZVFXPack/VFX/BattleFX/LeiTing/NS_LeiTing_AttackAlert_Blue_201.NS_LeiTing_AttackAlert_Blue_201'), 'blue');
    assert.equal(classifyEffect('/PBZVFXPack/VFX/BattleFX/Other/NS_NewBoss_AttackAlert_Red_501'), 'red');
    assert.equal(classifyEffect('/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_White_301'), null);
    assert.equal(classifyEffect('/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Post_001'), null);
    assert.equal(classifyEffect('/PBZVFXPack/VFX/BattleFX/Hun/NS_AttackAlert_Blue_001'), null);
    assert.equal(classifyEffect('/PBZVFXPack/VFX/BattleFX/Common/NS_Hun_AttackAlert_Blue_001'), null);
    assert.equal(classifyEffect('/Game/VFX/BattleFX/Common/NS_AttackAlert_Red_001'), null);
    assert.equal(classifyEffect('/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Red_001.WrongObject'), null);
});

test('first observation in advance window cues without altering original event', () => {
    const x = fixture(); const source = freeze(frame(2, [task(0.7)]));
    assert.equal(x.scheduler.step(source).active.length, 1);
    assert.equal(x.cues.length, 1); assert.equal(x.cues[0].start, 1);
    assert.equal(source.tasks[0].events[0].start, 1);
    assert(Math.abs(x.cues[0].actualLeadGameSeconds - 0.3) < 1e-9);
    assert(/^t\d+e\d+$/.test(x.cues[0].id));
});

test('future nodes do not spam and trigger only after entering window', () => {
    const x = fixture();
    for (let i = 0; i < 5; i++) x.scheduler.step(frame(i * 0.1, [task(i * 0.1)]));
    assert.equal(x.cues.length, 0); assert.equal(x.diagnostics.length, 0);
    x.scheduler.step(frame(0.7, [task(0.7)]));
    assert.equal(x.cues.length, 1);
});

test('same event never repeats each frame and retains tombstone after display ends', () => {
    const x = fixture({ maxGlyphSeconds: 0.1 });
    x.scheduler.step(frame(0, [task(0.7)]));
    x.scheduler.step(frame(0.2, [task(0.8)]));
    assert.equal(x.cancels[0].reason, 'display-expired');
    x.scheduler.step(frame(0.3, [task(0.9)]));
    assert.equal(x.cues.length, 1); assert.equal(x.scheduler.snapshot().active.length, 0);
});

test('two rapid same-color events have independent cues without global cooldown', () => {
    const x = fixture(); const events = [event({ key: 'a' }), event({ key: 'b', start: 1.1, end: 1.6 })];
    x.scheduler.step(frame(0.7, [task(0.7, { events })]));
    x.scheduler.step(frame(0.8, [task(0.8, { events })]));
    assert.equal(x.cues.length, 2); assert.notEqual(x.cues[0].id, x.cues[1].id);
});

test('two enemies with identical event time and color both cue', () => {
    const x = fixture();
    x.scheduler.step(frame(0, [task(0.7, { key: 'enemy1' }), task(0.7, { key: 'enemy2' })]));
    assert.equal(x.cues.length, 2); assert.equal(x.scheduler.snapshot().active.length, 2);
});

test('task disappearance cancels promptly and a reused key gets a fresh generation', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(0.7)]));
    x.scheduler.step(frame(0.1, []));
    assert.equal(x.cancels[0].reason, 'task-missing'); assert.equal(x.scheduler.snapshot().taskCount, 0);
    x.scheduler.step(frame(0.2, [task(0.7)]));
    assert.equal(x.cues.length, 2); assert.notEqual(x.cues[0].id, x.cues[1].id);
});

test('eligibility drop cancels and a later tag recovery does not replay same event', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(0.7)]));
    x.scheduler.step(frame(0.05, [task(0.75, { events: [event({ eligible: false })] })]));
    assert.equal(x.cancels[0].reason, 'ineligible');
    x.scheduler.step(frame(0.1, [task(0.8)])); assert.equal(x.cues.length, 1);
});

test('dynamic tags can become eligible after entering advance window', () => {
    const x = fixture();
    x.scheduler.step(frame(0, [task(0.7, { events: [event({ eligible: false })] })]));
    assert.equal(x.cues.length, 0);
    x.scheduler.step(frame(0.05, [task(0.75)])); assert.equal(x.cues.length, 1);
});

test('pause cancels active display but resume does not replay a fired event', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(0.7)]));
    x.scheduler.step(frame(0, [], { paused: true }));
    assert.equal(x.cancels[0].reason, 'paused');
    x.scheduler.step(frame(0, [], { paused: true }));
    x.scheduler.step(frame(0.1, [task(0.8)]));
    assert.equal(x.cues.length, 1); assert.equal(x.cancels.length, 1);
});

test('unfired event can still cue after pause', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(0.1)]));
    x.scheduler.step(frame(0, [], { paused: true }));
    x.scheduler.step(frame(0.6, [task(0.7)])); assert.equal(x.cues.length, 1);
});

test('observed double rate confirms on a second sample and converts lead correctly', () => {
    const x = fixture();
    x.scheduler.step(frame(0, [task(0.1)]));
    x.scheduler.step(frame(0.05, [task(0.2)]));
    assert.equal(x.cues.length, 0);
    x.scheduler.step(frame(0.1, [task(0.3)]));
    assert.equal(x.cues.length, 1); assert(Math.abs(x.cues[0].observedRate - 2) < 1e-9);
    assert(Math.abs(x.cues[0].actualLeadGameSeconds - 0.35) < 1e-9);
});

test('real fourfold speed confirms and retains the requested advance window', () => {
    const x = fixture(); const events = [event({ start: 2, end: 2.2 })];
    x.scheduler.step(frame(0, [task(0.2, { events })]));
    x.scheduler.step(frame(0.025, [task(0.3, { events })]));
    x.scheduler.step(frame(0.05, [task(0.4, { events })]));
    assert.equal(x.cues.length, 0);
    x.scheduler.step(frame(0.1, [task(0.6, { events })]));
    assert.equal(x.cues.length, 1); assert(Math.abs(x.cues[0].observedRate - 4) < 1e-9);
    assert(Math.abs(x.cues[0].actualLeadGameSeconds - 0.35) < 1e-9);
});

test('a single section skip cannot masquerade as a sustained high playback rate', () => {
    const x = fixture(); const events = [event({ start: 2, end: 2.2 })];
    x.scheduler.step(frame(0, [task(0.1, { events })]));
    x.scheduler.step(frame(0.016, [task(0.3, { events })]));
    x.scheduler.step(frame(0.032, [task(0.316, { events })]));
    assert.equal(x.cues.length, 0);
    assert.equal(x.diagnostics.filter(d => d.type === 'rate-jump').length, 1);
});

test('zero hit-stop progress preserves rate and breaks pending acceleration confirmation', () => {
    const x = fixture();
    x.scheduler.step(frame(0, [task(0.1)]));
    x.scheduler.step(frame(0.05, [task(0.3)]));
    x.scheduler.step(frame(0.1, [task(0.3)]));
    x.scheduler.step(frame(0.15, [task(0.5)]));
    assert.equal(x.cues.length, 0);
    x.scheduler.step(frame(0.2, [task(0.7)]));
    assert.equal(x.cues.length, 1); assert(Math.abs(x.cues[0].observedRate - 4) < 1e-9);
    assert.equal(x.diagnostics.filter(d => d.type === 'rate-jump').length, 2);
});

test('slowdown is used immediately to prevent an early cue based on the old high rate', () => {
    const x = fixture();
    x.scheduler.step(frame(0, [task(0.2, { rateHint: 4, events: [event({ eligible: false })] })]));
    x.scheduler.step(frame(0.1, [task(0.3)]));
    assert.equal(x.cues.length, 0);
});

test('authoritative rate hint wins over a delta that included a section skip', () => {
    const x = fixture(); const events = [event({ start: 2, end: 2.2 })];
    x.scheduler.step(frame(0, [task(0.1, { events })]));
    x.scheduler.step(frame(0.016, [task(0.3, { events, rateHint: 1 })]));
    assert.equal(x.cues.length, 0); assert.equal(x.diagnostics.length, 0);
});

test('suspended task cancels its display while preserving dedupe through a read outage', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(0.7)]));
    const unreadable = { key: 'actor/ability/task', suspended: true,
        get time() { throw Error('unreadable'); }, get events() { throw Error('unreadable'); },
        get activation() { throw Error('unreadable'); } };
    x.scheduler.step(frame(0.1, [unreadable]));
    assert.equal(x.cancels[0].reason, 'suspended');
    assert.equal(x.scheduler.snapshot().eventCount, 1);
    x.scheduler.step(frame(0.2, [task(0.9)]));
    assert.equal(x.cues.length, 1); assert.equal(x.scheduler.snapshot().active.length, 0);
});

test('suspension does not invent a new task and resume never estimates rate across the outage', () => {
    const x = fixture(); const events = [event({ start: 3, end: 3.5 })];
    x.scheduler.step(frame(0, [{ key: 'unknown', suspended: true }]));
    assert.equal(x.scheduler.snapshot().taskCount, 0);
    x.scheduler.step(frame(0.1, [task(0.2, { rateHint: 4, events })]));
    x.scheduler.step(frame(0.2, [{ key: 'actor/ability/task', suspended: true }]));
    x.scheduler.step(frame(100, [task(1.6, { events })]));
    assert.equal(x.cues.length, 1); assert.equal(x.cues[0].observedRate, 4);
});

test('activation changes after suspension create a new generation as normal', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(0.7)]));
    x.scheduler.step(frame(0.1, [{ key: 'actor/ability/task', suspended: true }]));
    x.scheduler.step(frame(0.2, [task(0.7, { activation: 2 })]));
    assert.equal(x.cues.length, 2); assert.notEqual(x.cues[0].id, x.cues[1].id);
});

test('rate hint handles first observation at a slow playback rate', () => {
    const x = fixture();
    x.scheduler.step(frame(0, [task(0.7, { rateHint: 0.5 })])); assert.equal(x.cues.length, 0);
    x.scheduler.step(frame(0.3, [task(0.85, { rateHint: 0.5 })])); assert.equal(x.cues.length, 1);
});

test('frozen timeline preserves rate and does not invent an ended task', () => {
    const x = fixture({ maxGlyphSeconds: 3 });
    x.scheduler.step(frame(0, [task(0.7, { rateHint: 2 })]));
    x.scheduler.step(frame(1, [task(0.7)]));
    assert.equal(x.scheduler.snapshot().active.length, 1); assert.equal(x.cancels.length, 0);
    x.scheduler.step(frame(1.1, [task(0.71, { events: [event(), event({ key: 'b', start: 1.1 })] })]));
    assert.equal(x.cues.length, 1);
});

test('invalid or implausible rates are ignored and negative time cannot cue', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(-1)])); assert.equal(x.scheduler.snapshot().taskCount, 0);
    x.scheduler.step(frame(1, [task(0.1, { rateHint: 1000 })]));
    x.scheduler.step(frame(1.001, [task(0.7)]));
    assert.equal(x.cues.length, 1); assert.equal(x.cues[0].observedRate, 1);
});

test('provided start/end offsets are honored and event end cancels', () => {
    const x = fixture(); const events = [event({ start: 1.2, end: 1.8 })];
    x.scheduler.step(frame(0, [task(0.7, { events })])); assert.equal(x.cues.length, 0);
    x.scheduler.step(frame(0.2, [task(0.9, { events })])); assert.equal(x.cues.length, 1);
    x.scheduler.step(frame(1.1, [task(1.8, { events })])); assert.equal(x.cancels[0].reason, 'event-ended');
});

test('observation just after start can cue within late grace', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(1.04)]));
    assert.equal(x.cues.length, 1); assert(x.cues[0].actualLeadGameSeconds < 0);
    assert.equal(x.diagnostics.filter(d => d.type === 'late').length, 1);
});

test('zero-duration warning is predicted and ends at its original trigger', () => {
    const x = fixture(); const events = [event({ end: 1 })];
    x.scheduler.step(frame(0, [task(0.7, { events })]));
    assert.equal(x.cues.length, 1); assert.equal(x.scheduler.snapshot().active.length, 1);
    x.scheduler.step(frame(0.3, [task(1, { events })]));
    assert.equal(x.cancels[0].reason, 'event-ended');
    assert.equal(x.scheduler.snapshot().active.length, 0);
});

test('zero-duration warning observed at trigger cues once and records late', () => {
    const x = fixture(); const events = [event({ start: 0, end: 0 })];
    x.scheduler.step(frame(0, [task(0, { events })]));
    assert.equal(x.cues.length, 1); assert.equal(x.diagnostics[0].type, 'late');
    x.scheduler.step(frame(0.01, [task(0.01, { events })]));
    assert.equal(x.cues.length, 1); assert.equal(x.scheduler.snapshot().active.length, 0);
});

test('zero-duration warning already past is not replayed using late grace', () => {
    const x = fixture();
    x.scheduler.step(frame(0, [task(1.01, { events: [event({ end: 1 })] })]));
    assert.equal(x.cues.length, 0); assert.equal(x.diagnostics[0].type, 'missed');
});

test('late grace comparison tolerates decimal arithmetic at exact boundary', () => {
    const x = fixture();
    x.scheduler.step(frame(0, [task(0.3, { events: [event({ start: 0.22 })] })]));
    assert.equal(x.cues.length, 1);
});

test('invalid color or timing cannot cue and diagnoses only once per event', () => {
    const x = fixture(); const events = [event({ color: 'white' }), event({ key: 'bad-duration', end: 0.5 })];
    x.scheduler.step(frame(0, [task(0.7, { events })]));
    x.scheduler.step(frame(0.01, [task(0.71, { events })]));
    assert.equal(x.cues.length, 0); assert.equal(x.diagnostics.length, 2);
    assert(x.diagnostics.every(d => d.type === 'invalid-event'));
});

test('jump across entire warning window records missed once without replay', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(0.1)]));
    x.scheduler.step(frame(0.01, [task(1.2)]));
    x.scheduler.step(frame(0.02, [task(1.21)]));
    assert.equal(x.cues.length, 0); assert.equal(x.diagnostics.filter(e => e.type === 'missed').length, 1);
});

test('past node at first discovery is not played as a new warning', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(2)]));
    assert.equal(x.cues.length, 0); assert.equal(x.diagnostics[0].type, 'missed');
});

test('loop rewind, activation change, and timeline change each start a new generation', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(0.7)]));
    x.scheduler.step(frame(0.5, [task(1.2)]));
    x.scheduler.step(frame(0.6, [task(0.7)]));
    x.scheduler.step(frame(0.7, [task(0.7, { activation: 2 })]));
    x.scheduler.step(frame(0.8, [task(0.7, { activation: 2, timelineKey: 'other' })]));
    assert.equal(x.cues.length, 4); assert.equal(new Set(x.cues.map(e => e.id)).size, 4);
    assert(x.cancels.some(e => e.reason === 'timeline-rewind'));
    assert(x.cancels.some(e => e.reason === 'activation-change'));
    assert(x.cancels.some(e => e.reason === 'timeline-change'));
});

test('world changes and game-time rollback clear stale cues with globally fresh ids', () => {
    const x = fixture(); x.scheduler.step(frame(10, [task(0.7)]));
    x.scheduler.step(frame(0, [task(0.7)], { worldKey: 'newmap' }));
    x.scheduler.step(frame(-1, [task(0.7)], { worldKey: 'newmap' }));
    assert.equal(x.cues.length, 3); assert.equal(new Set(x.cues.map(e => e.id)).size, 3);
    assert.equal(x.cancels[0].reason, 'world-change'); assert.equal(x.cancels[1].reason, 'game-time-rewind');
});

test('event disappearance cancels but retains dedupe if it reappears', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(0.7)]));
    x.scheduler.step(frame(0.1, [task(0.8, { events: [] })]));
    x.scheduler.step(frame(0.2, [task(0.9)]));
    assert.equal(x.cues.length, 1); assert.equal(x.cancels[0].reason, 'event-missing');
});

test('duplicate task and event identities do not duplicate callbacks', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(0.7, { events: [event(), event()] }), task(0.7)]));
    assert.equal(x.cues.length, 1);
});

test('bounded storage retains fired tombstones and reports overflow once', () => {
    const x = fixture({ maxTasks: 2, maxEventsPerTask: 2 });
    const events = Array.from({ length: 10 }, (_, i) => event({ key: String(i) }));
    const inputs = Array.from({ length: 10 }, (_, i) => task(0.7, { key: String(i), events }));
    x.scheduler.step(frame(0, inputs)); x.scheduler.step(frame(0.01, inputs));
    const s = x.scheduler.snapshot(); assert.equal(s.taskCount, 2); assert.equal(s.eventCount, 4); assert.equal(x.cues.length, 4);
    assert.equal(x.diagnostics.filter(d => d.type === 'task-limit').length, 1);
    assert.equal(x.diagnostics.filter(d => d.type === 'event-limit').length, 2);
    x.scheduler.step(frame(1, [])); assert.equal(x.scheduler.snapshot().eventCount, 0);
});

test('callbacks throwing cannot cause replay or break scheduling of other events', () => {
    let calls = 0; const x = fixture({ onCue: () => { calls++; throw new Error('output offline'); } });
    x.scheduler.step(frame(0, [task(0.7, { events: [event({ key: 'a' }), event({ key: 'b' })] })]));
    x.scheduler.step(frame(0.01, [task(0.71, { events: [event({ key: 'a' }), event({ key: 'b' })] })]));
    assert.equal(calls, 2); assert.equal(x.diagnostics.filter(d => d.type === 'callback-error').length, 2);
});

test('invalid clock cancels rather than leaking an active warning', () => {
    const x = fixture(); x.scheduler.step(frame(0, [task(0.7)]));
    x.scheduler.step(frame(NaN, [task(0.8)]));
    assert.equal(x.scheduler.snapshot().active.length, 0); assert.equal(x.cancels[0].reason, 'invalid-clock');
});


test('verified black events schedule independently and preserve red-blue semantics', () => {
    const x = fixture(); const events = [event({key:'black',color:'black'}),event({key:'blue',color:'blue'})];
    x.scheduler.step(frame(0,[task(0.7,{events})]));
    assert.deepEqual(x.cues.map(x=>x.color), ['black','blue']);
    x.scheduler.step(frame(0.1,[task(0.8,{events})])); assert.equal(x.cues.length,2);
    x.scheduler.step(frame(0.2,[],{paused:true})); assert.equal(x.cancels.length,2);
});

console.log('RESULT ' + passed + ' core scenarios passed. No UE/game access.');
