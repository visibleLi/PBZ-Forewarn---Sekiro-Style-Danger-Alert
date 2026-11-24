'use strict';
const assert = require('assert');
const { createGrabWarningCycle } = require('../PBZForewarn/grab-warning-cycle');
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
const payload = '/Renamed/ExecutedGrab';
const root = (extra = {}) => ({ world: '/World', actor: '/Enemy', ability: '/Renamed/A', activation: '1', key: 'a',
    eventKey: 'original', serial: 1, timeline: '/Renamed/A.TimelineX', live: true, payloads: [payload], ...extra });
const next = (extra = {}) => root({ ability: '/Renamed/B', key: 'b', serial: 2, timeline: '/Renamed/B.Main', ...extra });
const generic = (extra = {}) => ({ eligible: true, roleName: '', color: 'black', key: 'duplicate', kind: 'execution-capability', executedAbilityPath: payload, ...extra });
const ordinary = { eligible: true, roleName: '', color: 'black', source: 'power-attack-post-pair' };
function delivered() { const cycle = createGrabWarningCycle(); cycle.recordDelivery(root(), 'first'); return cycle; }
function handoff(cycle) { cycle.update([root({ live: false, ended: true }), next()]); }
test('renamed triple chain suppresses continuation generic and ordinary after first delivery', () => {
    const cycle = delivered(); cycle.update([root({ live: false, ended: true }), next(),
        next({ ability: '/Unrelated', key: 'other', serial: 6, payloads: [] })]);
    assert.equal(cycle.suppression(next(), generic()), true);
    const success = next({ key: 'c', serial: 3, timeline: '/Renamed/B.Success', payloads: [] });
    cycle.update([next({ live: false, ended: true }), success]); // Retired root and Main are no longer needed after binding.
    assert.equal(cycle.suppression(success, ordinary), true);
    assert.equal(cycle.suppression(next(), ordinary), false);
});
test('same root activation duplicate physical nodes are first-only; independent root black remains', () => {
    const cycle = delivered();
    assert.equal(cycle.suppression(root({ key: 'other-node', serial: 4 }), generic()), true);
    assert.equal(cycle.suppression(root(), generic({ key: 'original' })), false);
    assert.equal(cycle.suppression(root(), generic({ key: '' })), false);
    assert.equal(cycle.suppression(root(), ordinary), false);
    assert.equal(cycle.suppression(root(), generic({ executedAbilityPath: '/Different' })), false);
});
test('same node key on another task is not the delivered root event', () => {
    const cycle = delivered();
    assert.equal(cycle.suppression(root({ key: 'second-task', serial: 2 }), generic({ key: 'original' })), true);
    assert.equal(cycle.suppression(root(), generic({ key: 'original' })), false);
});
test('initial no output and both output failures leave every fallback available', () => {
    for (const outcome of ['no-output', 'glyph-failed-and-audio-failed']) {
        const cycle = createGrabWarningCycle(); // Neither outcome calls recordDelivery.
        handoff(cycle);
        assert.equal(cycle.suppression(next(), generic()), false, outcome);
        assert.equal(cycle.suppression(next(), ordinary), false, outcome);
    }
});
test('positive ended witness permits root retirement before unique continuation discovery', () => {
    const cycle = delivered(); cycle.update([root({ live: false, ended: true })]);
    cycle.update([]); cycle.update([next()]);
    assert.equal(cycle.suppression(next(), generic()), true);
    const success = next({ key: 'c', serial: 3, timeline: '/Renamed/B.Success', payloads: [] });
    cycle.update([next({ live: false, ended: true }), success]); assert.equal(cycle.suppression(success, ordinary), true);
    const fresh = delivered(); fresh.update([root({ live: false, ended: true })]);
    fresh.update([root({ activation: '2', serial: 5 }), next()]);
    assert.equal(fresh.suppression(next(), generic()), false);
});
test('ended witnesses expire before an unrelated later attack can inherit them', () => {
    for (const continuation of [false, true]) {
        let now = 0;
        const cycle = createGrabWarningCycle({ now: () => now });
        cycle.recordDelivery(root(), 'first');
        if (continuation) handoff(cycle);
        const ended = continuation ? next : root;
        cycle.update([ended({ live: false, ended: true })]);
        now = 500; cycle.update([]);
        now = 1001; cycle.update([]);
        const later = continuation ? next({ key: 'later', serial: 9 }) : next();
        cycle.update([later]);
        assert.equal(cycle.suppression(later, continuation ? ordinary : generic()), false);
    }
});
test('next root activation invalidates old cycle before any new delivery', () => {
    const cycle = delivered(), fresh = root({ activation: '2', key: 'new', serial: 5 });
    cycle.update([root({ live: false, ended: true }), fresh]);
    assert.equal(cycle.suppression(fresh, generic()), false);
    handoff(cycle); assert.equal(cycle.suppression(next(), generic()), false);
});
test('different enemy and world never join a delivered cycle', () => {
    for (const change of [{ actor: '/Independent' }, { world: '/OtherWorld' }]) {
        const cycle = delivered(); cycle.update([root({ live: false, ended: true }), next(change)]);
        assert.equal(cycle.suppression(next(change), generic()), false);
        assert.equal(cycle.suppression(next(change), ordinary), false);
    }
});
test('missing root or intermediate evidence permanently preserves fallback', () => {
    const cycle = delivered(); cycle.update([next()]); handoff(cycle);
    assert.equal(cycle.suppression(next(), generic()), false);
    const bound = delivered(); handoff(bound); bound.update([]);
    const success = next({ key: 'c', serial: 3, timeline: '/Renamed/B.Success' });
    bound.update([success]); assert.equal(bound.suppression(success, ordinary), false);
});
test('competing live source, overlapping root, different payload, and unproven root end discard token', () => {
    for (const rows of [
        [root({ live: false, ended: true }), next(), next({ ability: '/Third', key: 'third', serial: 6 })],
        [root(), next()], [root({ live: false, ended: true }), next({ payloads: ['/Different'] })],
        [root({ live: false }), next()]
    ]) {
        const cycle = delivered(); cycle.update(rows); handoff(cycle);
        assert.equal(cycle.suppression(next(), generic()), false);
    }
    const cycle = delivered(); handoff(cycle);
    cycle.update([next(), next({ ability: '/Third', key: 'third', serial: 6 })]);
    assert.equal(cycle.suppression(next(), ordinary), false);
});
test('eligibility role and supported event guards apply in both phases', () => {
    for (const event of [null, {}, generic({ eligible: false }), generic({ eligible: 1 }),
        generic({ roleName: 'special' }), generic({ roleName: undefined }), generic({ kind: 'other' }),
        generic({ color: 'red' }), generic({ color: undefined })]) {
        const cycle = delivered(); assert.equal(cycle.suppression(root(), event), false);
        handoff(cycle); assert.equal(cycle.suppression(next(), event), false);
    }
});
test('withdraw cancels first delivery; duplicate delivery cannot replace its cue identity', () => {
    const cycle = delivered(); cycle.recordDelivery(root({ key: 'another', serial: 4 }), 'duplicate');
    cycle.withdrawCue('duplicate'); assert.equal(cycle.suppression(root(), generic()), true);
    cycle.withdrawCue('first'); handoff(cycle); assert.equal(cycle.suppression(next(), generic()), false);
});
test('ended continuation waits for same activation Success with retained payload proof', () => {
    const cycle = delivered(); handoff(cycle); cycle.update([next({ live: false, ended: true })]);
    cycle.update([]); assert.equal(cycle.suppression(next(), ordinary), false);
    const success = next({ key: 'c', serial: 3, timeline: '/Renamed/B.Success', payloads: [] });
    cycle.update([success]); assert.equal(cycle.suppression(success, ordinary), true);
    cycle.update([root({ activation: '2' }), success]); assert.equal(cycle.suppression(success, ordinary), false);
    const changed = delivered(); handoff(changed); changed.update([next({ activation: '2' })]);
    assert.equal(changed.suppression(next({ activation: '2' }), ordinary), false);
});
test('an unrelated timeline in the same activation keeps its ordinary black warning', () => {
    const cycle = delivered(); handoff(cycle);
    cycle.update([next({ live: false, ended: true })]);
    const independent = next({ key: 'independent', serial: 9, timeline: '/Renamed/B.Independent', payloads: [] });
    cycle.update([independent]);
    assert.equal(cycle.suppression(independent, ordinary), false);
});
test('clear handles pause and world reset without retaining a cycle', () => {
    const cycle = delivered(); handoff(cycle); cycle.clear(); handoff(cycle);
    assert.equal(cycle.suppression(next(), ordinary), false);
});
test('invalid or ambiguous delivery proof cannot create a token; snapshots retain primitives', () => {
    for (const change of [{ payloads: [] }, { payloads: [payload, '/Other'] }, { payloads: [{}] },
        { live: false }, { serial: 0 }, { actor: '' }, { activation: 'unknown' },
        { activation: '9007199254740992' }, { eventKey: '' }]) {
        const cycle = createGrabWarningCycle(); cycle.recordDelivery(root(change), 'cue');
        assert.equal(cycle.suppression(root(), generic()), false);
    }
    const cycle = createGrabWarningCycle(), context = root(); cycle.recordDelivery(context, 'cue');
    context.ability = '/Mutated'; context.payloads[0] = '/Mutated';
    assert.equal(cycle.suppression(root(), generic()), true);
});
test('token storage evicts oldest after 128 actors', () => {
    const cycle = createGrabWarningCycle();
    for (let i = 0; i < 129; i++) cycle.recordDelivery(root({ actor: '/Enemy' + i }), 'cue' + i);
    assert.equal(cycle.suppression(root({ actor: '/Enemy0' }), generic()), false);
    assert.equal(cycle.suppression(root({ actor: '/Enemy1' }), generic()), true);
    assert.equal(cycle.suppression(root({ actor: '/Enemy128' }), generic()), true);
});
console.log('RESULT ' + passed + ' grab warning cycle scenarios passed. Primitive policy only; no game causality claim.');
