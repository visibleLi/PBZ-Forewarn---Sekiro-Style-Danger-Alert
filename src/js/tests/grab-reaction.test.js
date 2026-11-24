'use strict';
const assert = require('assert');
const { createAdapter } = require('../PBZForewarn/adapter');
const { createGrabReactionReader } = require('../PBZForewarn/grab-reaction');
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
const GRAB = '/SGameExecution/GA/GA_ExecutedAbilityBase_Grab.GA_ExecutedAbilityBase_Grab_C';
const array = values => ({ Num: () => values.length, Get: i => values[i] });
function fixture() {
    const player = { _path: '/Renamed/Player' };
    const base = { _path: GRAB };
    const klass = { _path: '/Renamed/Reaction.Reaction_C', GetSuperClass: () => base };
    const ability = { _path: '/Renamed/Player.Reaction_7', bIsActive: true, bIsAbilityEnding: false,
        GetAvatarActorFromActorInfo: () => player, GetClass: () => klass, GetActivationCount: () => 3 };
    const asc = { _path: '/Renamed/Player.ASC', ActivatableAbilities: { Items: array([
        { ActiveCount: 1, NonReplicatedInstances: array([ability]), ReplicatedInstances: array([]) }
    ]) }, TickingTasks: array([]) };
    player.AbilitySystemComponent = asc;
    const adapter = createAdapter({ KismetSystemLibrary: {
        IsValid: value => !!value && !!value._path && value.valid !== false, GetPathName: value => value._path
    } }, {});
    return { player, asc, ability, klass, base, adapter, reader: createGrabReactionReader(adapter) };
}
test('renamed active player reaction exposes only primitive grab identity', () => {
    const e = fixture(), result = e.reader.read(e.player, e.asc);
    assert.equal(result.status, 'active');
    assert.deepEqual(result.executions, [{ ability: '/Renamed/Player.Reaction_7', activation: '3',
        abilityClass: '/Renamed/Reaction.Reaction_C', ancestry: ['/Renamed/Reaction.Reaction_C', GRAB] }]);
    assert.doesNotThrow(() => JSON.stringify(result));
});
test('inactive invalid ending and foreign avatar reactions cannot assert active grab', () => {
    const changes = [e => { e.ability.valid = false; }, e => { e.ability.bIsActive = false; },
        e => { delete e.ability.bIsActive; }, e => { e.ability.bIsAbilityEnding = true; },
        e => { delete e.ability.bIsAbilityEnding; }, e => { e.ability.GetAvatarActorFromActorInfo = () => ({ _path: '/Other' }); },
        e => { e.ability.GetClass = () => ({ _path: '/Other/Class' }); },
        e => { e.klass.GetSuperClass = () => e.klass; },
        e => { e.klass.GetSuperClass = () => { throw Error('bridge'); }; },
        e => { Object.defineProperty(e.ability, 'GetClass', { get() { throw Error('bridge'); } }); }];
    for (const change of changes) {
        const e = fixture(); change(e); const result = e.reader.read(e.player, e.asc);
        assert.notEqual(result.status, 'active'); assert.deepEqual(result.executions, []);
    }
});
test('missing player ASC or failed collection leaves an unavailable snapshot', () => {
    const e = fixture();
    assert.equal(e.reader.read(null, e.asc).status, 'unavailable');
    assert.equal(e.reader.read(e.player, null).status, 'unavailable');
    e.adapter.collectAbilities = () => { throw Error('bridge'); };
    assert.equal(e.reader.read(e.player, e.asc).status, 'unavailable');
});
test('super-struct methods and fields support actual class ancestry without names', () => {
    for (const parent of [base => ({ GetSuperStruct: () => base }), base => ({ SuperStruct: base }), base => ({ SuperClass: base })]) {
        const e = fixture(); e.ability.GetClass = () => ({ _path: '/Another/Reaction', ...parent(e.base) });
        assert.equal(e.reader.read(e.player, e.asc).status, 'active');
    }
});
test('a reaction removed from the live ASC cannot survive in reader state', () => {
    const e = fixture(); assert.equal(e.reader.read(e.player, e.asc).status, 'active');
    e.asc.ActivatableAbilities.Items = array([]);
    assert.equal(e.reader.read(e.player, e.asc).status, 'inactive');
});
test('oversized native collections are rejected before enumeration', () => {
    for (const field of ['specs', 'instances', 'tasks']) {
        const e = fixture(); let reads = 0;
        const huge = { Num: () => 65, Get() { reads++; throw Error('must not enumerate'); } };
        if (field === 'specs') e.asc.ActivatableAbilities.Items = huge;
        if (field === 'instances') e.asc.ActivatableAbilities.Items = array([{ ActiveCount: 1, NonReplicatedInstances: huge }]);
        if (field === 'tasks') e.asc.TickingTasks = huge;
        assert.equal(e.reader.read(e.player, e.asc).status, 'unavailable');
        assert.equal(reads, 0);
    }
});
test('class ancestry and candidate counts remain bounded', () => {
    const e = fixture(); let klass = e.base;
    for (let i = 0; i < 16; i++) { const parent = klass; klass = { _path: '/Class/' + i, GetSuperClass: () => parent }; }
    e.ability.GetClass = () => klass;
    assert.notEqual(e.reader.read(e.player, e.asc).status, 'active');
    const entries = Array.from({ length: 64 }, () => ({ ActiveCount: 1,
        NonReplicatedInstances: array([e.ability]), ReplicatedInstances: array([e.ability]) }));
    e.asc.ActivatableAbilities.Items = array(entries);
    assert.equal(e.reader.read(e.player, e.asc).status, 'unavailable');
});
test('a ticking task is a live entrance only when its reaction has positive current state', () => {
    const e = fixture(); e.asc.ActivatableAbilities.Items = array([]);
    e.asc.TickingTasks = array([{ Ability: e.ability }]);
    assert.equal(e.reader.read(e.player, e.asc).status, 'active');
    e.ability.bIsActive = false;
    assert.equal(e.reader.read(e.player, e.asc).status, 'inactive');
});
console.log('RESULT ' + passed + ' grab reaction scenarios passed. Unreal APIs are mocked.');
