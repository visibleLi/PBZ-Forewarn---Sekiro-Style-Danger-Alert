'use strict';
// Existing partial-integration regression: actual main + adapter + scheduler,
// with owned output/filter modules and Puerts mocked. No native or in-game proof.
const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const core = require('../PBZForewarn/core');
const adapter = require('../PBZForewarn/adapter');
const mainSource = fs.readFileSync(path.join(__dirname, '../PBZForewarn/main.js'), 'utf8');
let passed = 0;
function test(name, body) { body(); passed++; console.log('PASS ' + name); }
const array = xs => ({ Num: () => xs.length, Get: i => xs[i] });
const PUBLIC_SETTINGS = ['LeadMs','RangeCm','OnlyLockedTarget','SoundOn','SoundVolume','GlyphOn','GlyphFontSize','GlyphY','Diagnostics'];
const INTERNAL_SETTINGS = ['BlackOn','GenericAttack','ObserveAttacks','Hooks','ObservationFlushMs',
    'TickMs','DiscoverMs','ScanMs','LateGraceMs','MaxGlyphMs','FontPath'];
const RETIRED_SETTINGS = ['SemanticFallback','YuZanCastWarning','YuZanCastLeadMs'];
function structuredSettings(marked = true) {
    return { LeadMs:225, RangeCm:1800, OnlyLockedTarget:true, SoundOn:false, SoundVolume:0.35,
        GlyphOn:false, GlyphFontSize:96, GlyphY:0.44, Diagnostics:false,
        _internal:{ BlackOn:false, GenericAttack:false, ObserveAttacks:false, Hooks:false,
            ObservationFlushMs:5000, TickMs:32, DiscoverMs:100, ScanMs:500, LateGraceMs:120, MaxGlyphMs:1800,
            FontPath:'/Preserved/Custom.Font' },
        _extra:{ ...(marked ? {PBZForewarnGenericAttackEpoch:1} : {}),
            FutureSetting:23, FutureOptions:{ labels:['quiet',{ enabled:false }], note:'保留' } } };
}
function genericDisabledSettings(internal = {}) {
    return {json:JSON.stringify({_internal:{GenericAttack:false,...internal},_extra:{PBZForewarnGenericAttackEpoch:1}})};
}
function fixture(config, startup = {}) {
    const env = { wall: 1800000000000, game: 0, paused: false, files: new Map(), logs: [], timers: new Map(), failCues: [],
        nextTimer: 0, objects: new Map(), actors: [], actorsInScan: [], hud: [], failUI: false, failClock: false, failWrite: false, audioEvents: [], audioCalls: [], audioPaused: true, lockedTarget: null, keysDown: new Set() };
    function object(p, values) { const o = Object.assign({ _path: p }, values); env.objects.set(p, o); return o; }
    function asc(p) { return object(p, { tags: new Set(), bValid: true, HasMatchingGameplayTag(t) { return this.tags.has(t.TagName); },
        ActivatableAbilities: { Items: array([]) }, TickingTasks: array([]), KnownTasks: array([]) }); }
    function delegate() { const callbacks = new Set(); return { callbacks, Add: f => callbacks.add(f), Remove: f => callbacks.delete(f), Fire: () => [...callbacks].forEach(f => f()) }; }
    env.world = object('/World/A'); env.gi = object('/GI'); env.pc = object('/PC', { GetWorld: () => env.world, IsInputKeyDown: key => env.keysDown.has(key.KeyName) });
    env.player = object('/Player', { AbilitySystemComponent: asc('/Player/ASC'), GetComponentByClass: () => env.deflect });
    env.addEnemy = function (label, scan = true) {
        const system = asc('/' + label + '/ASC');
        const enemy = object('/' + label, { AbilitySystemComponent: system, distance: 1000,
            IsPlayerControlled: () => false, GetDistanceTo() { return this.distance; } });
        const ability = object('/' + label + '/Ability', { bIsActive: true, bIsAbilityEnding: false, activation: 1,
            GetActivationCount() { return this.activation; }, ActiveTasks: array([]), GetPlayTimelineTask() { return this.tasks[0]; },
            GetAvatarActorFromActorInfo: () => enemy, tasks: [] });
        system.ActivatableAbilities.Items = array([{ ActiveCount: 1, NonReplicatedInstances: array([ability]), ReplicatedInstances: array([]) }]);
        env.actors.push(enemy); if (scan) env.actorsInScan.push(enemy);
        return { enemy, ability, asc: system };
    };
    env.addTask = function (owner, label, options = {}) {
        const effectName = options.effectName || 'NS_AttackAlert_Red_001';
        const effectPath = '/PBZVFXPack/VFX/BattleFX/Common/' + effectName + '.' + effectName;
        const effect = options.soft ? { softPath: effectPath, LoadSynchronous() { throw Error('MUST NOT LOAD'); } } : object(effectPath);
        const action = object('/Action/' + label, { NiagaraEffect: effect, GetClass: () => object(options.actionClass || '/Class/ArbitraryAction'),
            ActivationRequirements: { RequireTags: options.require || [], IgnoreTags: [], TagQuery: { empty: true } } });
        const event = Object.freeze({ Action: action, StartTime: options.start === undefined ? 1 : options.start,
            duration: options.duration === undefined ? 0.4 : options.duration, TriggerTimeOffset: 0, EndTriggerTimeOffset: 0 });
        const timeline = object('/Timeline/' + label, { Actions: array([event]), RoleLayers: array([]) });
        const task = object('/Task/' + label, { Timeline: timeline, CurrentTime: 0, Ability: owner.ability,
            OnCompleted: delegate(), OnCancelled: delegate(), GetRoleActor: () => null });
        owner.ability.tasks.push(task); owner.ability.ActiveTasks = array(owner.ability.tasks);
        return { task, timeline, event, action };
    };
    env.owner = env.addEnemy('Enemy'); env.first = env.addTask(env.owner, 'first');
    const saved = 'C:/Mock/Saved/'; env.saved = saved;
    const content = startup.contentDir || 'D:/Mock/ProjectPBZ/Content/';
    const normalize = p => path.posix.normalize(p.replace(/\\/g, '/'));
    env.configPath = normalize(content + '../../platform/steam/ue4ss/Mods/PBZForewarnHooks/PBZForewarnHooks.config.json');
    env.configReads = []; env.configWrites = []; env.menuReads = [];
    env.menuPath = env.configPath.replace('PBZForewarnHooks/PBZForewarnHooks.config.json', 'PBZModsMenuBridge/events-PBZForewarnHooks.txt');
    // Model patch-style saves, not the third-party script. Internal edits in
    // notification tests are manual changes; only PUBLIC_SETTINGS are Menu rows.
    env.menuSave = (values, change = 1) => {
        const json = JSON.parse(env.files.get(env.configPath) || JSON.stringify(env.settings));
        if (!Object.hasOwn(json,'_internal') && !Object.hasOwn(json,'_extra')) {
            json._internal = {};
            for (const key of INTERNAL_SETTINGS) if (Object.hasOwn(json,key)) { json._internal[key]=json[key]; delete json[key]; }
        }
        for (const [key, value] of Object.entries(values)) {
            if (PUBLIC_SETTINGS.includes(key)) json[key] = value;
            else if (INTERNAL_SETTINGS.includes(key)) {
                json._internal = { ...(json._internal || {}), [key]:value };
                delete json[key];
            } else if (RETIRED_SETTINGS.includes(key)) json._extra = { ...(json._extra || {}), [key]:value };
        }
        env.files.set(env.configPath, JSON.stringify(json));
        env.files.set(env.menuPath, 'Changed=' + change + '\r\nEnd=1\r\n');
    };
    if (config !== undefined) env.files.set(saved + 'PBZForewarn.txt', config);
    if (startup.json !== undefined) env.files.set(env.configPath, startup.json);
    if (startup.migrationOriginal !== undefined) for (const suffix of ['.pre-menu-cleanup.pending','.pre-menu-cleanup.bak'])
        if (!startup.moveBeforeConfigRead || suffix.endsWith('.bak')) env.files.set(env.configPath + suffix,startup.migrationOriginal);
    if (startup.migrationBackup !== undefined) env.files.set(env.configPath+'.pre-menu-cleanup.bak',startup.migrationBackup);
    if (startup.genericOriginal !== undefined) for (const suffix of ['.pre-generic-default.pending','.pre-generic-default.bak'])
        if (!startup.moveBeforeConfigRead || suffix.endsWith('.bak')) env.files.set(env.configPath+suffix,startup.genericOriginal);
    if (startup.genericBackup !== undefined) env.files.set(env.configPath+'.pre-generic-default.bak',startup.genericBackup);
    const UE = {
        KismetSystemLibrary: { IsValid: x => !!(x && x._path && x.bValid !== false), GetPathName: x => x._path,
            Conv_SoftObjectReferenceToString: x => x.softPath || '',
            GetGameTimeInSeconds: () => { if (env.failClock) throw Error('clock unavailable'); return env.nanClock ? NaN : env.game; } },
        BlueprintPathsLibrary: { ProjectSavedDir: () => saved, ProjectContentDir: () => content, ConvertRelativePathToFull: normalize,
            FileExists: p => { if (startup.failConfigExists && p === env.configPath) throw Error('config stat failed'); return env.files.has(p); } },
        EasyCsv: { LoadStringFromLocalFile(p, ref) {
            if (p === env.menuPath) env.menuReads.push(p);
            if (p === env.configPath || p.startsWith(env.configPath+'.pre-menu-cleanup.') ||
                p.startsWith(env.configPath+'.pre-generic-default.') || p === saved + 'PBZForewarn.txt') env.configReads.push(p);
            if (p === env.configPath && startup.moveBeforeConfigRead && env.files.has(p)) {
                env.files.set(p+(startup.genericOriginal !== undefined ? '.pre-generic-default.pending' : '.pre-menu-cleanup.pending'),env.files.get(p)); env.files.delete(p);
            }
            if (p === env.configPath+startup.publishDuringRecovery?.suffix) env.files.set(env.configPath,startup.publishDuringRecovery.json);
            ref.value = env.files.get(p) || '';
            if (startup.failRecoveryRead && p === env.configPath+startup.failRecoveryRead) return false;
            if (p === env.configPath && startup.failConfigRead) {
                if (startup.failConfigRead === 'throw') throw Error('config read failed');
                return false;
            }
            return env.files.has(p);
        },
            SaveStringToFileWithFullPath(body, p) {
                if (p === env.configPath || p === saved + 'PBZForewarn.txt') env.configWrites.push(p);
                if (env.failWrite && p.endsWith('_diagnostics.json') || env.failObservationWrite && p.endsWith('_observations.json')) return false;
                env.files.set(p, body); return true;
            } },
        GameplayStatics: { GetPlayerController: () => env.pc, GetPlayerPawn: () => env.player,
            IsGamePaused: () => env.paused, GetAllActorsOfClass: (w, c, ref) => { ref.value = array(env.actorsInScan); } },
        PBZCharacter_NPC: { StaticClass: () => 'NPC' }, DeflectComponent: { StaticClass: () => 'Deflect' }, Actor: {}, NewArray: () => array([]), GameplayTag: function () {}, Key: function () {},
        FactionUtils: { GetFaction: () => 'enemy', GetFactionRelation: (p, a) => a.friendly ? 1 : 2 }, ETeamAttitude: { Friendly: 1, Hostile: 2 },
        BlueprintGameplayTagLibrary: { Conv_ObjectToGameplayTagAssetInterface: a => a,
            HasAllMatchingGameplayTags: (a, ts) => ts.every(t => a.tags.has(t)), HasAnyMatchingGameplayTags: (a, ts) => ts.some(t => a.tags.has(t)),
            IsTagQueryEmpty: q => q.empty, GetOwnedGameplayTags: a => a.tags, DoesContainerMatchTagQuery: () => true, IsGameplayTagValid: () => true },
        Object: { Find: p => env.objects.get(p) }
    };
    const puerts = { $ref: value => ({ value }), $unref: ref => ref.value, argv: { getByName: () => env.gi } };
    const presentation = { createPresentation: () => ({ update(w, active, paused) {
        if (env.failUI) throw Error('mock layout failure'); env.hud.push({ active, paused });
        return paused ? [] : [...new Set(active.map(x => x.color))].map(c => active.find(x => x.color === c));
    }, status() { return { failure: env.containedUIFailure ? 'contained HUD error' : '' }; },
        dispose() { env.disposed = (env.disposed || 0) + 1; } }) };
    const nativeAudio = { createNativeAudio: (ue, a, settings, diag, options) => {
        env.settings = settings;
        env.audioEvents = []; env.audioPaused = true; env.bankPath = options.bankPath; env.bankRelativePath = options.bankRelativePath; env.bankConfig = options.bank;
        return { update(context, events) {
            if (env.failAudio) throw Error('mock media failure');
            env.audioPaused = context.paused;
            env.audioCalls.push({ ...context, events }); env.audioEvents.push(...events);
        }, dispose() { env.audioPaused = true; env.audioDisposed = (env.audioDisposed || 0) + 1; },
        status() { return { backend: 'mock-native', paused: env.audioPaused }; } };
    } };
    const targetFilter = { createTargetFilter: () => ({
        read(player, enabled) { return { mode: enabled ? 'locked-only' : 'nearby', target: env.lockedTarget,
            key: env.lockedTarget ? env.lockedTarget._path : '', status: enabled ? (env.lockedTarget ? 'locked' : 'unlocked') : 'disabled' }; },
        allows(actor, state) { return state.mode === 'nearby' || state.target === actor; }
    }) };
    class Clock extends Date { static now() { return env.wall; } }
    const context = vm.createContext({ require: name => {
        if (startup.missingModule===name) throw Error('optional module missing');
        return ({ ue: UE, puerts, cpp: {}, './core': core, './adapter': adapter,
        './presentation': presentation, './wwise-audio': nativeAudio, './wwise-bank-config': require('../PBZForewarn/wwise-bank-config'), './target-filter': targetFilter,
        './diagnostic-store': require('../PBZForewarn/diagnostic-store'),
        './grab-reaction': require('../PBZForewarn/grab-reaction'),
        './grab-warning-cycle': require('../PBZForewarn/grab-warning-cycle'),
        './observation-store': startup.badStore ? {createObservationStore(){throw Error('optional store failed');}} : require('../PBZForewarn/observation-store'),
        './native-attack-observer': require('../PBZForewarn/native-attack-observer'),
        './timeline-observation': require('../PBZForewarn/timeline-observation'),
        './audio-environment': { createAudioEnvironmentProbe: () => () => ({ status: 'mock' }) } })[name]; }, exports: {}, console: { log: s => env.logs.push(s) }, Date: Clock,
        setInterval: (fn, ms) => { const id = ++env.nextTimer; env.timers.set(id, { fn, ms }); return id; },
        clearInterval: id => env.timers.delete(id) });
    vm.runInContext(startup.mainSource || mainSource, context, { filename: 'PBZForewarn/main.js' });
    env.mod = context.exports;
    env.tick = (time, delta = 16) => { env.wall += delta; env.game += delta / 1000;
        if (time !== undefined) env.first.task.CurrentTime = time;
        for (const t of [...env.timers.values()]) t.fn(); };
    env.bus = () => {
        const start = env.logs.filter(x => x.startsWith('[PBZMOD] [Forewarn] START ')).at(-1);
        return { session: JSON.parse(start.slice('[PBZMOD] [Forewarn] START '.length)).session,
            seq: env.audioEvents.at(-1)?.seq || 0, paused: env.audioPaused, events: env.audioEvents };
    };
    env.cues = () => env.bus().events.filter(x => x.kind === 'cue');
    env.cancels = () => env.bus().events.filter(x => x.kind === 'cancel');
    env.diagnostics = () => env.logs.filter(x => x.startsWith('[PBZMOD] [Forewarn] '));
    return env;
}

test('fresh install defaults diagnostic capture off and keeps the cue pipeline active', () => {
    const e = fixture(); assert.equal(e.bus().seq, 0); assert.equal(e.bus().paused, true);
    assert(!e.files.has(e.saved + 'PBZForewarn.txt')); assert(!e.files.has(e.configPath));
    assert.equal(e.settings.Diagnostics, false); assert.equal(e.settings.GenericAttack, true); assert.deepEqual(e.configWrites, []);
    assert.equal([...e.timers.values()][0].ms, 16); assert(![...e.files.keys()].some(p => p.endsWith('_bus.json')));
    assert.equal(e.bankPath, 'D:/Mock/ProjectPBZ/Content/PBZForewarn/PBZForewarn.bnk');
    assert.equal(e.bankRelativePath, 'PBZForewarn/PBZForewarn.bnk'); assert.equal(e.bankConfig.eventId, 1682749338);
    e.tick(0.7); assert.equal(e.cues().length, 1, 'diagnostic capture does not gate an ordinary warning');
    e.mod.stop();
});
test('unmarked test.1 structured false upgrades only GenericAttack without writing the config', () => {
    const json=JSON.stringify(structuredSettings(false)), e=fixture(undefined,{json});
    assert.deepEqual(e.settings, { LeadMs:225, RangeCm:1800, OnlyLockedTarget:true, SoundOn:false, SoundVolume:0.35,
        GlyphOn:false, GlyphFontSize:96, GlyphY:0.44, BlackOn:false, GenericAttack:true,
        Diagnostics:false, ObserveAttacks:false, Hooks:false, ObservationFlushMs:5000,
        TickMs:32, DiscoverMs:100, ScanMs:500, LateGraceMs:120, MaxGlyphMs:1800,
        FontPath:'/Game/PBZContent/UI/Fonts/ZH_ZiKuTangKuangShanKaiShuJF_Font.ZH_ZiKuTangKuangShanKaiShuJF_Font' });
    e.mod.stop(); assert.equal(e.files.get(e.configPath),json); assert.deepEqual(e.configWrites,[]);
});
test('only the exact reserved numeric epoch honors a deliberate false across Menu save and restart', () => {
    const e=fixture(undefined,genericDisabledSettings()); assert.equal(e.settings.GenericAttack,false);
    e.menuSave({LeadMs:225,SoundOn:false}); e.tick(0.1);
    assert.equal(e.settings.GenericAttack,false); assert.equal(e.settings.LeadMs,225);
    assert.equal(JSON.parse(e.files.get(e.configPath))._extra.PBZForewarnGenericAttackEpoch,1);
    e.mod.stop(); e.mod.start(); assert.equal(e.settings.GenericAttack,false); assert.equal(e.settings.SoundOn,false);
    assert(!Object.hasOwn(e.settings,'PBZForewarnGenericAttackEpoch')); e.mod.stop(); assert.deepEqual(e.configWrites,[]);
});
test('missing unknown and nonnumeric upgrade epochs enable GenericAttack without configuring metadata', () => {
    for(const epoch of [undefined,true,false,'1',null,0,2,{},[]]) {
        const json=JSON.stringify({LeadMs:225,_internal:{GenericAttack:false,Hooks:false},
            _extra:{PBZForewarnGenericAttackEpoch:epoch,GenericAttack:false,SoundOn:false,FutureSetting:23}});
        const e=fixture(undefined,{json}); assert.equal(e.settings.GenericAttack,true); assert.equal(e.settings.Hooks,false);
        assert.equal(e.settings.LeadMs,225); assert.equal(e.settings.SoundOn,true);
        assert(!Object.hasOwn(e.settings,'PBZForewarnGenericAttackEpoch')); e.mod.stop();
        assert.equal(e.files.get(e.configPath),json); assert.deepEqual(e.configWrites,[]);
    }
    for(const values of [{GenericAttack:false,PBZForewarnGenericAttackEpoch:1},
        {_internal:{GenericAttack:false,PBZForewarnGenericAttackEpoch:1}},
        {_internal:{GenericAttack:false},_extra:{pbzforewarngenericattackepoch:1}}]) {
        const e=fixture(undefined,{json:JSON.stringify(values)}); assert.equal(e.settings.GenericAttack,true); e.mod.stop();
    }
});
test('legacy flat false and TXT zero always receive the one-time enabled default', () => {
    for(const startup of [{},{json:'{"LeadMs":225,"GenericAttack":false,"Hooks":false}'}]) {
        const e=fixture('LeadMs=225\nGenericAttack=0\nHooks=0',startup);
        assert.equal(e.settings.GenericAttack,true); assert.equal(e.settings.LeadMs,225); assert.equal(e.settings.Hooks,false);
        assert.equal(e.mod.parseSettings('GenericAttack=false').GenericAttack,true);
        e.mod.stop(); assert.deepEqual(e.configWrites,[]);
    }
});
test('settings preserve existing file and clamp supported numeric values', () => {
    const body = 'LeadMs=9000\nGlyphOn=false\nHooks=0\nTickMs=1\nGlyphY=0.4'; const e = fixture(body);
    const settings = e.mod.parseSettings(body); assert.equal(settings.LeadMs, 1000); assert.equal(settings.TickMs, 16);
    assert.equal(settings.GlyphOn, false); assert.equal(settings.Hooks, false);
    assert.equal(e.files.get(e.saved + 'PBZForewarn.txt'), body); e.mod.stop();
});
test('canonical JSON is authoritative over stale legacy values and does not require Menu', () => {
    const legacy = 'LeadMs=900\nTickMs=100\nSoundOn=0\nOnlyLockedTarget=1';
    const json = JSON.stringify({ LeadMs: 200, TickMs: 32, SoundOn: true });
    const e = fixture(legacy, { json });
    assert.equal(e.configPath, 'D:/Mock/platform/steam/ue4ss/Mods/PBZForewarnHooks/PBZForewarnHooks.config.json');
    assert.equal(e.settings.LeadMs, 200); assert.equal(e.settings.SoundOn, true); assert.equal(e.settings.OnlyLockedTarget, false);
    assert.equal([...e.timers.values()][0].ms, 32); assert.deepEqual(e.configReads, [e.configPath]);
    assert.equal(e.files.get(e.saved + 'PBZForewarn.txt'), legacy); assert.equal(e.files.get(e.configPath), json);
    e.tick(0.79); assert.equal(e.cues().length, 0); e.tick(0.81); assert.equal(e.cues().length, 1);
    assert.equal(e.first.event.StartTime, 1); assert.equal(e.first.event.duration, 0.4);
    e.first.task.OnCancelled.Fire(); e.tick(0.82); assert.equal(e.cancels().length, 1);
    e.mod.stop(); assert.deepEqual(e.configWrites, []);
});
test('JSON missing alone permits case-insensitive legacy parsing without rewriting settings', () => {
    const legacy = 'leadms=210\nsOuNdOn=FaLsE\nGLYPHON=0\nHooks=TRUE\nFutureSetting=17';
    const e = fixture(legacy);
    assert.equal(e.settings.LeadMs, 210); assert.equal(e.settings.SoundOn, false);
    assert.equal(e.settings.GlyphOn, false); assert.equal(e.settings.Hooks, true);
    assert.deepEqual(e.configReads, [e.saved + 'PBZForewarn.txt']);
    e.mod.stop(); assert.equal(e.files.get(e.saved + 'PBZForewarn.txt'), legacy);
    assert(!e.files.has(e.configPath)); assert.deepEqual(e.configWrites, []);
});
test('startup during flat migration uses pending original settings rather than stale TXT or defaults', () => {
    const original='{"GenericAttack":false,"SoundOn":false,"LeadMs":175}';
    for(const startup of [{migrationOriginal:original},
        {json:original,migrationOriginal:original,moveBeforeConfigRead:true}]) {
        const e=fixture('GenericAttack=1\nSoundOn=1\nLeadMs=900',startup);
        assert(!e.files.has(e.configPath));
        assert.equal(e.settings.GenericAttack,true); assert.equal(e.settings.SoundOn,false); assert.equal(e.settings.LeadMs,175);
        assert(!e.configReads.includes(e.saved+'PBZForewarn.txt'));
        assert.equal(e.files.get(e.configPath+'.pre-menu-cleanup.pending'),original);
        assert.equal(e.files.get(e.configPath+'.pre-menu-cleanup.bak'),original);
        e.files.set(e.configPath,'{"LeadMs":175,"SoundOn":false,"_internal":{"GenericAttack":false}}');
        e.tick(0.7); assert.equal(e.settings.GenericAttack,true); assert.equal(e.settings.SoundOn,false); e.mod.stop();
        assert.deepEqual(e.configWrites,[]);
    }
    for(const recovery of [{migrationBackup:'{"GenericAttack":true}'},
        {failRecoveryRead:'.pre-menu-cleanup.pending'},{failRecoveryRead:'.pre-menu-cleanup.bak'}]) {
        const e=fixture('GenericAttack=0\nSoundOn=0\nLeadMs=900',{migrationOriginal:original,...recovery});
        assert.equal(e.settings.GenericAttack,true); assert.equal(e.settings.SoundOn,true); assert.equal(e.settings.LeadMs,350);
        assert(!e.configReads.includes(e.saved+'PBZForewarn.txt')); assert(e.logs.some(x=>x.includes('config-read-error')));
        assert.equal(e.files.get(e.configPath+'.pre-menu-cleanup.pending'),original);
        assert.equal(e.files.get(e.configPath+'.pre-menu-cleanup.bak'),recovery.migrationBackup || original);
        e.mod.stop(); assert.deepEqual(e.configWrites,[]);
    }
    const current='{"LeadMs":250,"SoundOn":false,"_internal":{"GenericAttack":true}}';
    const e=fixture('GenericAttack=0\nSoundOn=0\nLeadMs=900',{json:current,migrationOriginal:original,failConfigRead:true});
    assert.equal(e.settings.GenericAttack,true); assert.equal(e.settings.SoundOn,true); assert.equal(e.settings.LeadMs,350);
    assert.deepEqual(e.configReads,[e.configPath,e.configPath]); assert(e.logs.some(x=>x.includes('config-read-error')));
    assert.equal(e.files.get(e.configPath),current); assert.equal(e.files.get(e.configPath+'.pre-menu-cleanup.pending'),original);
    assert.equal(e.files.get(e.configPath+'.pre-menu-cleanup.bak'),original); e.mod.stop(); assert.deepEqual(e.configWrites,[]);
});
test('generic-default migration reads its own matching snapshots despite an old cleanup backup', () => {
    const original='{"LeadMs":175,"SoundOn":false,"_internal":{"GenericAttack":false,"Hooks":false}}';
    for(const startup of [{genericOriginal:original,migrationBackup:'{"LeadMs":950}'},
        {json:original,genericOriginal:original,moveBeforeConfigRead:true}]) {
        const e=fixture('GenericAttack=0\nLeadMs=900',startup);
        assert.equal(e.settings.GenericAttack,true); assert.equal(e.settings.LeadMs,175);
        assert.equal(e.settings.SoundOn,false); assert.equal(e.settings.Hooks,false);
        assert(!e.configReads.includes(e.saved+'PBZForewarn.txt'));
        assert(!e.configReads.includes(e.configPath+'.pre-menu-cleanup.bak'));
        e.mod.stop(); assert.equal(e.files.get(e.configPath+'.pre-generic-default.pending'),original);
        assert.equal(e.files.get(e.configPath+'.pre-generic-default.bak'),original); assert.deepEqual(e.configWrites,[]);
    }
});
test('ambiguous or unmatched generic-default recovery never imports stale TXT or cleanup backup', () => {
    const original='{"LeadMs":175,"SoundOn":false,"_internal":{"GenericAttack":false}}';
    for(const recovery of [{genericBackup:'{"LeadMs":950}'},{genericBackup:''},
        {migrationOriginal:original},{failRecoveryRead:'.pre-generic-default.pending'},
        {failRecoveryRead:'.pre-generic-default.bak'}]) {
        const e=fixture('LeadMs=900\nSoundOn=0',{genericOriginal:original,migrationBackup:original,...recovery});
        assert.equal(e.settings.LeadMs,350); assert.equal(e.settings.SoundOn,true); assert.equal(e.settings.GenericAttack,true);
        assert(!e.configReads.includes(e.saved+'PBZForewarn.txt')); assert(e.logs.some(x=>x.includes('config-read-error')));
        e.mod.stop(); assert.deepEqual(e.configWrites,[]);
    }
});
test('canonical publication wins a recovery read race including a failed snapshot read', () => {
    const original='{"LeadMs":175,"SoundOn":false}', current='{"LeadMs":250,"_internal":{"GenericAttack":false},"_extra":{"PBZForewarnGenericAttackEpoch":1}}';
    for(const suffix of ['.pre-menu-cleanup','.pre-generic-default']) for(const fail of [false,true]) {
        const e=fixture('LeadMs=900',{[suffix==='.pre-menu-cleanup'?'migrationOriginal':'genericOriginal']:original,
            publishDuringRecovery:{suffix:suffix+'.pending',json:current},
            ...(fail ? {failRecoveryRead:suffix+'.pending'} : {})});
        assert.equal(e.settings.LeadMs,250); assert.equal(e.settings.GenericAttack,false); assert.equal(e.settings.SoundOn,true);
        assert.equal(e.configReads.at(-1),e.configPath); assert(!e.configReads.includes(e.saved+'PBZForewarn.txt'));
        assert(!e.logs.some(x=>x.includes('config-read-error'))); e.mod.stop(); assert.deepEqual(e.configWrites,[]);
    }
});
test('existing canonical generic-default config never falls back to stale snapshots when unreadable', () => {
    const current='{"LeadMs":250,"_internal":{"GenericAttack":false},"_extra":{"PBZForewarnGenericAttackEpoch":1}}';
    const e=fixture('LeadMs=900',{json:current,failConfigRead:true,genericOriginal:'{"LeadMs":175}'});
    assert.equal(e.settings.LeadMs,350); assert.deepEqual(e.configReads,[e.configPath,e.configPath]);
    assert(e.logs.some(x=>x.includes('config-read-error'))); e.mod.stop(); assert.equal(e.files.get(e.configPath),current);
    assert.deepEqual(e.configWrites,[]);
});
test('JSON BOM duplicate keys and numeric strings follow startup semantics', () => {
    const e = fixture('Hooks=0', { json: '﻿{"Hooks":false,"Hooks":true,"LeadMs":"125"}' });
    assert.equal(e.settings.Hooks, true); assert.equal(e.settings.LeadMs, 125); e.mod.stop();
});
test('case-variant JSON aliases use the shared deterministic order', () => {
    const e = fixture('Hooks=1', { json: '{"Hooks":true,"hooks":false}' });
    assert.equal(e.settings.Hooks, false); e.mod.stop();
});
test('numeric booleans numeric-string grammar and commented migration inputs agree', () => {
    const e = fixture('Hooks=0 # off\nDiagnostics=0 ; quiet\nLeadMs=0b11001000');
    assert.equal(e.settings.Hooks, false); assert.equal(e.settings.Diagnostics, false); assert.equal(e.settings.LeadMs, 200); e.mod.stop();
    for (const [value, expected] of [['0b11001000',200],['0o310',200],['0xC8',200],['0x1p7',350],['+0xC8',350],['.2e3',200]]) {
        const r = fixture(undefined, { json: JSON.stringify({Hooks:0.0,LeadMs:value}) });
        assert.equal(r.settings.Hooks, false); assert.equal(r.settings.LeadMs, expected); r.mod.stop();
    }
});
test('oversized Unicode and lone surrogates reject the whole JSON consistently', () => {
    for (const json of [JSON.stringify({Hooks:false,Extra:'中'.repeat(22000)}), '{"Hooks":false,"Extra":"\\ud800"}', '{"Hooks":false,"Extra":"\\udc00"}']) {
        const e = fixture('Hooks=0', {json});
        assert.equal(e.settings.Hooks, true); assert(e.logs.some(x => x.includes('config-read-error'))); e.mod.stop();
    }
});
test('Unicode whitespace and overwritten invalid JSON members stay consistent with Lua', () => {
    const e = fixture(' Hooks= 0 \nLeadMs=　200　');
    assert.equal(e.settings.Hooks, false); assert.equal(e.settings.LeadMs, 200); e.mod.stop();
    for (const json of ['{"Hooks":false,"Extra":"\\ud800","Extra":null}', '{"Hooks":false,"Extra":1e999,"Extra":null}']) {
        const r = fixture('Hooks=0', {json});
        assert.equal(r.settings.Hooks, true); assert(r.logs.some(x => x.includes('config-read-error'))); r.mod.stop();
    }
    const r = fixture(undefined, {json:JSON.stringify({LeadMs:' 200 '})});
    assert.equal(r.settings.LeadMs, 200); r.mod.stop();
});
test('JSON numeric bounds and boolean meanings match the legacy reader', () => {
    const values = { LeadMs: 9000, ObservationFlushMs: 1, RangeCm: 20000,
        TickMs: 1, DiscoverMs: 999, ScanMs: 1, LateGraceMs: 999, MaxGlyphMs: -1,
        GlyphFontSize: 900, GlyphY: 0, SoundVolume: 9, GlyphOn: false, Hooks: 0,
        SoundOn: 'FALSE', Diagnostics: '1', GenericAttack: false,
        FontPath: '/Ignored/As/Before', FutureSetting: 23 };
    const e = fixture(undefined, { json: JSON.stringify(values) });
    const legacy = e.mod.parseSettings(Object.entries(values).map(([k, v]) => k + '=' + v).join('\n'));
    assert.deepEqual(e.settings, legacy); assert.equal(e.settings.LeadMs, 1000); assert.equal(e.settings.TickMs, 16);
    assert.equal(e.settings.SoundVolume, 2); assert.equal(e.settings.GlyphOn, false);
    assert.equal(e.settings.Hooks, false); assert.equal(e.settings.SoundOn, false); assert.equal(e.settings.GenericAttack, true);
    e.mod.stop(); assert.deepEqual(e.configWrites, []);
});
test('invalid numeric and boolean JSON fields retain defaults rather than coercing unrelated types', () => {
    const e = fixture(undefined, { json: JSON.stringify({ LeadMs: null, RangeCm: true, TickMs: '',
        SoundVolume: 'NaN', GlyphY: 'Infinity', SoundOn: 'off', GlyphOn: 2, Hooks: null }) });
    assert.equal(e.settings.LeadMs, 350); assert.equal(e.settings.RangeCm, 3500); assert.equal(e.settings.TickMs, 16);
    assert.equal(e.settings.SoundVolume, 0.8); assert.equal(e.settings.GlyphY, 0.32);
    assert.equal(e.settings.SoundOn, true); assert.equal(e.settings.GlyphOn, true); assert.equal(e.settings.Hooks, true);
    e.mod.stop();
});
test('empty malformed and non-object JSON use defaults and never stale legacy or replacement files', () => {
    for (const json of ['', '{broken', 'null', '[]', '42', 'true', '"LeadMs=900"',
        '{"LeadMs":900,"_internal":[]}', '{"LeadMs":900,"_extra":null}']) {
        const e = fixture('LeadMs=900\nTickMs=100\nSoundOn=0', { json });
        assert.equal(e.settings.LeadMs, 350); assert.equal(e.settings.TickMs, 16); assert.equal(e.settings.SoundOn, true);
        assert.deepEqual(e.configReads, [e.configPath]); assert(e.logs.some(x => x.includes('config-read-error')));
        e.tick(0.7); assert.equal(e.cues().length, 1); e.mod.stop();
        assert.equal(e.files.get(e.configPath), json); assert.deepEqual(e.configWrites, []);
        assert(!e.files.has(e.saved + 'pbzforewarn_diagnostics.json'), 'invalid config leaves diagnostics default off');
    }
});
test('structured JSON loads nine public and eleven internal settings without rewriting hidden data', () => {
    const values=structuredSettings(), json=JSON.stringify(values), e=fixture('LeadMs=900\nGenericAttack=1',{json});
    assert.deepEqual(Object.keys(values).filter(key=>!key.startsWith('_')).sort(), PUBLIC_SETTINGS.slice().sort());
    assert.deepEqual(Object.keys(values._internal).sort(), INTERNAL_SETTINGS.slice().sort());
    assert.equal(e.settings.LeadMs,225); assert.equal(e.settings.RangeCm,1800); assert.equal(e.settings.OnlyLockedTarget,true);
    assert.equal(e.settings.SoundOn,false); assert.equal(e.settings.SoundVolume,0.35); assert.equal(e.settings.GlyphOn,false);
    assert.equal(e.settings.GlyphFontSize,96); assert.equal(e.settings.GlyphY,0.44);
    assert.equal(e.settings.BlackOn,false); assert.equal(e.settings.GenericAttack,false); assert.equal(e.settings.Diagnostics,false);
    assert.equal(e.settings.ObserveAttacks,false); assert.equal(e.settings.Hooks,false); assert.equal(e.settings.ObservationFlushMs,5000);
    assert.equal(e.settings.TickMs,32); assert.equal(e.settings.DiscoverMs,100); assert.equal(e.settings.ScanMs,500);
    assert.equal(e.settings.LateGraceMs,120); assert.equal(e.settings.MaxGlyphMs,1800);
    assert.equal(e.settings.FontPath,'/Game/PBZContent/UI/Fonts/ZH_ZiKuTangKuangShanKaiShuJF_Font.ZH_ZiKuTangKuangShanKaiShuJF_Font');
    assert.deepEqual(Object.keys(e.settings).sort(), PUBLIC_SETTINGS.concat(INTERNAL_SETTINGS).sort());
    assert.equal([...e.timers.values()][0].ms,32); assert.deepEqual(e.configReads,[e.configPath]);
    e.mod.stop(); assert.equal(e.files.get(e.configPath),json); assert.deepEqual(e.configWrites,[]);
});
test('either own structured container disables flat internal aliases and nonreserved extra values never configure runtime', () => {
    for(const containers of [{_internal:{}},{_extra:{Hooks:false,GenericAttack:false,LeadMs:900,SoundOn:false}},
        {_internal:{},_extra:{Hooks:false,GenericAttack:false}}]) {
        const e=fixture(undefined,{json:JSON.stringify({LeadMs:175,Hooks:false,GenericAttack:false,BlackOn:false,...containers})});
        assert.equal(e.settings.LeadMs,175); assert.equal(e.settings.Hooks,true); assert.equal(e.settings.GenericAttack,true);
        assert.equal(e.settings.BlackOn,true); assert.equal(e.settings.SoundOn,true); e.mod.stop();
    }
});
test('structured public and internal scalars are read only from their assigned locations', () => {
    const e=fixture(undefined,{json:JSON.stringify({LeadMs:175,SoundOn:false,Hooks:true,BlackOn:true,GenericAttack:true,
        _internal:{LeadMs:950,SoundOn:true,Hooks:false,BlackOn:false,GenericAttack:false},
        _extra:{PBZForewarnGenericAttackEpoch:1,LeadMs:600,SoundOn:true,Hooks:true,BlackOn:true,GenericAttack:true}})});
    assert.equal(e.settings.LeadMs,175); assert.equal(e.settings.SoundOn,false); assert.equal(e.settings.Hooks,false);
    assert.equal(e.settings.BlackOn,false); assert.equal(e.settings.GenericAttack,false); e.mod.stop();
});
test('structured internal aliases retain case ordering and scalar numeric grammar', () => {
    const e=fixture(undefined,{json:'{"leadms":"0b11001000","_internal":{"Hooks":true,"hooks":false,"TickMs":"32","GenericAttack":"FALSE"},"_extra":{"PBZForewarnGenericAttackEpoch":1}}'});
    assert.equal(e.settings.LeadMs,200); assert.equal(e.settings.Hooks,false); assert.equal(e.settings.TickMs,32);
    assert.equal(e.settings.GenericAttack,false); e.mod.stop();
});
test('present structured containers must be objects even when their values would otherwise be ignored', () => {
    for(const key of ['_internal','_extra']) for(const value of [null,false,0,'hidden',[]]) {
        const json=JSON.stringify({LeadMs:900,[key]:value}), e=fixture('LeadMs=800',{json});
        assert.equal(e.settings.LeadMs,350); assert(e.logs.some(x=>x.includes('config-read-error')));
        e.mod.stop(); assert.equal(e.files.get(e.configPath),json); assert.deepEqual(e.configWrites,[]);
    }
});
test('known object and array setting values fail closed in relevant and irrelevant containers', () => {
    for(const container of [null,'_internal']) for(const key of ['LeadMs','Hooks','GenericAttack']) for(const value of [{},[]]) {
        const values={SoundOn:false}; if(container) values[container]={[key]:value}; else values[key]=value;
        const json=JSON.stringify(values), e=fixture('SoundOn=0',{json});
        assert.equal(e.settings.SoundOn,true); assert.equal(e.settings.LeadMs,350); assert.equal(e.settings.GenericAttack,true);
        assert(e.logs.some(x=>x.includes('config-read-error'))); e.mod.stop(); assert.equal(e.files.get(e.configPath),json);
    }
    for(const json of ['{"LeadMs":{},"LeadMs":4}', '{"_internal":[],"_internal":{}}',
        '{"_internal":{"Hooks":{},"Hooks":false}}', '{"_internal":{"LeadMs":[],"LeadMs":4}}']) {
        const e=fixture('LeadMs=900\nHooks=0',{json});
        assert.equal(e.settings.LeadMs,350,json); assert.equal(e.settings.Hooks,true,json);
        assert(e.logs.some(x=>x.includes('config-read-error')),json); e.mod.stop();
        assert.equal(e.files.get(e.configPath),json); assert.deepEqual(e.configWrites,[]);
    }
});
test('unknown nested data outside or inside containers is ignored without rejecting valid settings', () => {
    for(const json of ['{"Hooks":false,"LeadMs":175,"FutureSetting":{}}',
        '{"Hooks":false,"LeadMs":175,"FutureSetting":[{"note":"kept"}]}',
        '{"Hooks":false,"Extra":{},"Extra":null}',
        '{"LeadMs":175,"_internal":{"Hooks":false,"FutureSetting":{"notes":[1,null]}}}',
        '{"LeadMs":175,"_internal":{"Hooks":false},"_extra":{"Hooks":{},"LeadMs":[],"GenericAttack":[false],"FutureSetting":{"notes":[1,null]}}}']) {
        const e=fixture(undefined,{json}); assert.equal(e.settings.Hooks,false);
        assert.equal(e.settings.LeadMs,json.includes('175')?175:350); assert(!e.logs.some(x=>x.includes('config-read-error')));
        e.mod.stop(); assert.equal(e.files.get(e.configPath),json); assert.deepEqual(e.configWrites,[]);
    }
});
test('JSON container depth counts the root and rejects overwritten overdeep values', () => {
    let nested='leaf'; for(let i=0;i<7;i++) nested={next:nested};
    for(const [value,valid] of [[nested,true],[{next:nested},false]]) {
        const json=JSON.stringify({LeadMs:175,FutureSetting:value}), e=fixture('LeadMs=900',{json});
        assert.equal(e.settings.LeadMs,valid?175:350); assert.equal(e.logs.some(x=>x.includes('config-read-error')),!valid);
        e.mod.stop(); assert.equal(e.files.get(e.configPath),json);
    }
    const e=fixture(undefined,{json:'{"LeadMs":175,"FutureSetting":'+JSON.stringify({next:nested})+',"FutureSetting":null}'});
    assert.equal(e.settings.LeadMs,350); assert(e.logs.some(x=>x.includes('config-read-error'))); e.mod.stop();
});
test('deep unknown and overwritten JSON values still reject invalid Unicode and nonfinite numbers', () => {
    for(const value of ['"\\ud800"','"\\udc00"','1e999']) for(const container of ['FutureSetting','_extra']) {
        const json='{"LeadMs":175,"'+container+'":{"nested":['+value+']},"'+container+'":{}}';
        const e=fixture('LeadMs=900',{json}); assert.equal(e.settings.LeadMs,350);
        assert(e.logs.some(x=>x.includes('config-read-error'))); e.mod.stop(); assert.equal(e.files.get(e.configPath),json);
    }
});
test('JSON accepts the exact UTF8 byte limit and rejects one byte beyond it in preserved data', () => {
    const values={LeadMs:175,_extra:{note:'中'.repeat(100)}}, overhead=Buffer.byteLength(JSON.stringify(values),'utf8');
    values._extra.padding='x'.repeat(65536-overhead-13);
    const exact=JSON.stringify(values); assert.equal(Buffer.byteLength(exact,'utf8'),65536);
    for(const json of [exact,exact.replace('175','1750')]) {
        const valid=Buffer.byteLength(json,'utf8')===65536, e=fixture(undefined,{json});
        assert.equal(e.settings.LeadMs,valid?175:350); assert.equal(e.logs.some(x=>x.includes('config-read-error')),!valid); e.mod.stop();
    }
});
test('retired settings are absent from defaults and ignored in TXT flat JSON and structured JSON', () => {
    const values={SemanticFallback:true,YuZanCastWarning:true,YuZanCastLeadMs:9999,GenericAttack:false};
    for(const startup of [{}, {json:JSON.stringify(values)}, {json:JSON.stringify({_internal:values,_extra:values,...values})}]) {
        const e=fixture('SemanticFallback=1\nYuZanCastWarning=1\nYuZanCastLeadMs=9999\nGenericAttack=0',startup);
        assert.equal(e.settings.GenericAttack,true);
        const parsed=e.mod.parseSettings('SemanticFallback=1\nYuZanCastWarning=1\nYuZanCastLeadMs=9999');
        assert.equal(parsed.GenericAttack,true);
        for(const key of RETIRED_SETTINGS) { assert(!Object.hasOwn(e.settings,key)); assert(!Object.hasOwn(parsed,key)); }
        e.mod.stop();
    }
});
test('unreadable JSON including a false read result with populated output uses defaults', () => {
    for (const failConfigRead of [true, 'throw']) {
        const json = '{"LeadMs":900,"SoundOn":false}';
        const e = fixture('LeadMs=800\nSoundOn=0', { json, failConfigRead });
        assert.equal(e.settings.LeadMs, 350); assert.equal(e.settings.SoundOn, true);
        assert.deepEqual(e.configReads, [e.configPath,e.configPath]); assert(e.logs.some(x => x.includes('config-read-error')));
        e.mod.stop(); assert.equal(e.files.get(e.configPath), json); assert.deepEqual(e.configWrites, []);
    }
});
test('failed JSON existence check does not reinterpret an inaccessible config as missing', () => {
    const e = fixture('LeadMs=900', { failConfigExists: true });
    assert.equal(e.settings.LeadMs, 350); assert.deepEqual(e.configReads, []);
    assert(e.logs.some(x => x.includes('config-read-error'))); e.mod.stop(); assert.deepEqual(e.configWrites, []);
});
test('canonical config resolves from a Windows content directory', () => {
    const e = fixture('LeadMs=900', { contentDir: 'D:\\Mock\\ProjectPBZ\\Content\\', json: '{"LeadMs":125}' });
    assert.equal(e.settings.LeadMs, 125); assert.deepEqual(e.configReads, [e.configPath]); e.mod.stop();
});
test('JSON edits are read only on restart and preserve the current cue schedule', () => {
    const e = fixture('LeadMs=900', { json: '{"LeadMs":200,"SoundOn":false,"GlyphOn":false}' });
    const settings = e.settings;
    e.files.set(e.configPath, '{"LeadMs":900,"SoundOn":true,"GlyphOn":true}');
    e.tick(0.2); assert.equal(e.cues().length, 0); assert.equal(settings.SoundOn, false); assert.equal(settings.GlyphOn, false);
    e.tick(0.81); assert.equal(e.cues().length, 1); assert.deepEqual(e.configReads, [e.configPath]);
    e.mod.stop(); e.mod.start();
    assert.equal(e.settings.LeadMs, 900); assert.equal(e.settings.SoundOn, true); assert.equal(e.settings.GlyphOn, true);
    assert.deepEqual(e.configReads, [e.configPath, e.configPath]); e.mod.stop(); assert.deepEqual(e.configWrites, []);
});
test('JSON creation after startup is deferred until restart', () => {
    const e = fixture('LeadMs=200');
    e.files.set(e.configPath, '{"LeadMs":900}'); e.tick(0.2); assert.equal(e.cues().length, 0);
    assert.equal(e.settings.LeadMs, 200); assert.deepEqual(e.configReads, [e.saved + 'PBZForewarn.txt']);
    e.mod.stop(); e.mod.start(); assert.equal(e.settings.LeadMs, 900);
    assert.deepEqual(e.configReads, [e.saved + 'PBZForewarn.txt', e.configPath]); e.mod.stop();
});
test('Menu save updates editable controls without restarting the runtime or resetting cue history', () => {
    const e = fixture(undefined, { json: '{"LeadMs":200}' });
    const settings = e.settings, timers = [...e.timers.keys()];
    e.menuSave({ SoundOn:false, SoundVolume:0.25, GlyphOn:false, LeadMs:900, Hooks:false, SemanticFallback:false });
    e.tick(0.2);
    assert.strictEqual(e.settings, settings); assert.equal(settings.SoundOn, false); assert.equal(settings.SoundVolume, 0.25);
    assert.equal(settings.GlyphOn, false); assert.equal(settings.LeadMs, 900); assert.equal(settings.Hooks, false);
    assert(!Object.hasOwn(settings,'SemanticFallback')); assert.deepEqual([...e.timers.keys()], timers);
    assert.equal(e.cues().length, 1); e.tick(0.81); assert.equal(e.cues().length, 1);
    const savedEntry=e.logs.find(x=>x.startsWith('[PBZMOD] [Forewarn] config-saved '));
    const savedConfig=JSON.parse(savedEntry.slice(savedEntry.indexOf('{')));
    assert.equal(savedConfig.saved.LeadMs,900);assert(!savedConfig.changed.includes('SemanticFallback'));
    assert(!Object.hasOwn(savedConfig.saved,'SemanticFallback'));
    assert(e.logs.some(x => x.includes('config-output-update') && x.includes('outputVerified')));
    assert.deepEqual(e.configReads, [e.configPath,e.configPath]); e.mod.stop(); assert.deepEqual(e.configWrites, []);
});
test('visible Menu saves preserve nondefault hidden settings and arbitrary extra data across restart', () => {
    const values=structuredSettings(), e=fixture(undefined,{json:JSON.stringify(values)}), settings=e.settings;
    const visible={LeadMs:450,RangeCm:2200,OnlyLockedTarget:false,SoundOn:true,SoundVolume:0.6,
        GlyphOn:true,GlyphFontSize:140,GlyphY:0.5};
    e.menuSave(visible); const saved=JSON.parse(e.files.get(e.configPath));
    assert.deepEqual(saved,{...values,...visible}); assert.deepEqual(saved._internal,values._internal); assert.deepEqual(saved._extra,values._extra);
    e.tick(0.1); assert.strictEqual(e.settings,settings);
    for(const [key,value] of Object.entries(visible)) assert.equal(e.settings[key],value,key);
    for(const key of ['BlackOn','GenericAttack','Diagnostics','ObserveAttacks','Hooks']) assert.equal(e.settings[key],false,key);
    assert.equal(e.settings.ObservationFlushMs,5000); assert.equal(e.settings.TickMs,32); assert.equal(e.settings.DiscoverMs,100);
    assert.equal(e.settings.ScanMs,500); assert.equal(e.settings.LateGraceMs,120); assert.equal(e.settings.MaxGlyphMs,1800);
    assert.equal(e.settings.FontPath,'/Game/PBZContent/UI/Fonts/ZH_ZiKuTangKuangShanKaiShuJF_Font.ZH_ZiKuTangKuangShanKaiShuJF_Font');
    e.mod.stop(); e.mod.start(); assert.equal(e.settings.LeadMs,450); assert.equal(e.settings.SoundOn,true);
    assert.equal(e.settings.GenericAttack,false); assert.equal(e.settings.BlackOn,false); assert.equal(e.settings.Diagnostics,false);
    assert.equal(e.settings.TickMs,32); assert.deepEqual(JSON.parse(e.files.get(e.configPath)),saved);
    e.mod.stop(); assert.deepEqual(e.configWrites,[]);
});
test('all six reserved controls retain startup values after a notice and numeric values apply on restart', () => {
    const values=structuredSettings(), e=fixture(undefined,{json:JSON.stringify(values)});
    const reserved={TickMs:100,DiscoverMs:250,ScanMs:1000,LateGraceMs:250,MaxGlyphMs:3000,FontPath:'/Other'};
    e.menuSave({...reserved,LeadMs:150}); e.tick(0.2);
    assert.equal(e.settings.TickMs,32); assert.equal(e.settings.DiscoverMs,100); assert.equal(e.settings.ScanMs,500);
    assert.equal(e.settings.LateGraceMs,120); assert.equal(e.settings.MaxGlyphMs,1800); assert.equal(e.settings.GenericAttack,false);
    assert.equal(e.settings.FontPath,'/Game/PBZContent/UI/Fonts/ZH_ZiKuTangKuangShanKaiShuJF_Font.ZH_ZiKuTangKuangShanKaiShuJF_Font');
    assert.equal(e.settings.LeadMs,150);
    const saved=JSON.parse(e.files.get(e.configPath)); assert.deepEqual(saved._internal,{...values._internal,...reserved});
    assert.deepEqual(saved._extra,values._extra); e.mod.stop(); e.mod.start();
    assert.equal(e.settings.TickMs,100); assert.equal(e.settings.DiscoverMs,250); assert.equal(e.settings.ScanMs,1000);
    assert.equal(e.settings.LateGraceMs,250); assert.equal(e.settings.MaxGlyphMs,3000); e.mod.stop();
});
test('live lead changes preserve fired identities while moving only pending cue times', () => {
    const e=fixture(undefined,{json:'{}'}); e.tick(0.7); const id=e.cues()[0].id;
    e.menuSave({LeadMs:1000}); e.tick(0.8,500); assert.equal(e.cues().length,1); assert.equal(e.cues()[0].id,id);
    e.mod.stop();
    const f=fixture(undefined,{json:'{}'}); f.tick(0.2); f.menuSave({LeadMs:0}); f.tick(0.7,500);
    assert.equal(f.cues().length,0); f.tick(1); assert.equal(f.cues().length,1); f.mod.stop();
});
test('live range and locked-target filtering withdraw without replaying a consumed cue', () => {
    const e=fixture(undefined,{json:'{}'}); e.owner.enemy.distance=2000; e.tick(0.7);
    e.menuSave({RangeCm:500}); e.tick(0.8,500); assert(e.cancels().length>0);
    e.menuSave({RangeCm:3500,OnlyLockedTarget:true},2); e.tick(0.85,500); assert.equal(e.cues().length,1);
    e.lockedTarget=e.owner.enemy; e.menuSave({RangeCm:3500,OnlyLockedTarget:false},3); e.tick(0.9,500);
    assert.equal(e.cues().length,1); e.mod.stop();
});
test('live black filter withdraws a playing cue and reenabling does not replay it', () => {
    const { BLACK_ACTION_CLASS }=require('../PBZForewarn/attack-recognition');
    const e=fixture(undefined,{json:'{}'}); e.first.action.GetClass=()=>({_path:BLACK_ACTION_CLASS});
    e.first.action.NiagaraEffect={_path:'/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Post_001.NS_AttackAlert_Post_001'};
    e.tick(0.7); assert.equal(e.cues().length,1); assert.equal(e.cues()[0].color,'black');
    e.menuSave({BlackOn:false}); e.tick(0.8,500); assert(e.cancels().some(x=>x.reason==='settings-disabled'));
    e.menuSave({BlackOn:true},2); e.tick(0.9,500); assert.equal(e.cues().length,1); e.mod.stop();
});
test('JS startup during diagnostic promotion reads the verified original, not the legacy TXT', () => {
    const e=fixture('Diagnostics=0\nGenericAttack=1'); e.mod.stop();
    const original='{"LeadMs":225,"_internal":{"Diagnostics":1,"GenericAttack":false},"_extra":{"PBZForewarnGenericAttackEpoch":1}}';
    for(const suffix of ['.pending','.bak']) e.files.set(e.configPath+'.pre-diagnostics-menu'+suffix,original);
    e.mod.start();
    assert.equal(e.settings.LeadMs,225); assert.equal(e.settings.Diagnostics,true);
    assert.equal(e.settings.GenericAttack,false); assert(!e.files.has(e.configPath));
    e.mod.stop(); assert.deepEqual(e.configWrites,[]);
});
test('a complete Menu save applies the public diagnostic switch ahead of a legacy internal value', () => {
    const original = {diagnostics:true,_internal:{Diagnostics:1,ObserveAttacks:true,Hooks:true},
        _extra:{PBZForewarnGenericAttackEpoch:1}};
    const e=fixture(undefined,{json:JSON.stringify(original)}); e.tick(0.7);
    assert.equal(e.settings.Diagnostics,true);
    e.menuSave({Diagnostics:false}); e.tick(0.8,500);
    assert.equal(e.settings.Diagnostics,false); assert.equal(e.settings.Hooks,true);
    assert.equal(e.cues().length,1);
    assert.deepEqual(JSON.parse(e.files.get(e.configPath))._internal,original._internal);
    e.mod.stop(); e.mod.start(); assert.equal(e.settings.Diagnostics,false); e.mod.stop();
    assert.deepEqual(e.configWrites,[]);
});
test('diagnostics and observation can start disabled then repeatedly enable without resetting battle history', () => {
    const e=fixture(undefined,{json:'{"Diagnostics":false,"ObserveAttacks":false}'}); e.tick(0.7);
    e.menuSave({Diagnostics:true,ObserveAttacks:true,ObservationFlushMs:5000}); e.tick(0.8,500);
    assert.equal(e.settings.Diagnostics,true); assert.equal(e.settings.ObserveAttacks,true); assert.equal(e.settings.ObservationFlushMs,5000);
    e.menuSave({Diagnostics:false,ObserveAttacks:true},2); e.tick(0.85,500);
    e.menuSave({Diagnostics:true,ObserveAttacks:true},3); e.tick(0.9,500);
    assert.equal(e.cues().length,1); assert(!e.logs.some(x=>x.includes('runtime-error'))); e.mod.stop();
});
test('disabling observation or diagnostics flushes retained cues and marks capture disabled', () => {
    for(const values of [{ObserveAttacks:false},{Diagnostics:false}]) {
        const e=fixture(undefined,{json:'{"Diagnostics":true}'}); e.tick(0.7);
        e.menuSave(values); e.tick(0.8,500);
        const saved=JSON.parse(e.files.get(e.saved+'pbzforewarn_observations.json'));
        assert.equal(saved.enabled,false); assert.equal(saved.captureEnabled,false);
        assert(saved.events.some(x=>x.kind==='warning-cue'));
        e.mod.stop(); const final=JSON.parse(e.files.get(e.saved+'pbzforewarn_observations.json'));
        assert(final.events.some(x=>x.kind==='warning-cue')); assert.equal(final.enabled,false);
    }
});
test('failed disable-boundary observation write retries during shutdown while capture stays off', () => {
    const e=fixture(undefined,{json:'{"Diagnostics":true}'}); e.tick(0.7); e.failObservationWrite=true;
    e.menuSave({ObserveAttacks:false}); e.tick(0.8,500); e.failObservationWrite=false; e.mod.stop();
    const final=JSON.parse(e.files.get(e.saved+'pbzforewarn_observations.json'));
    assert(final.events.some(x=>x.kind==='warning-cue')); assert.equal(final.enabled,false);
});
test('live optional observation failure retains cue pipeline and reports unavailability', () => {
    const e=fixture(undefined,{json:'{"Diagnostics":true,"ObserveAttacks":false}',missingModule:'./native-attack-observer'});
    e.menuSave({ObserveAttacks:true}); e.tick(0.7);
    assert.equal(e.cues().length,1); assert(e.logs.some(x=>x.includes('observation-unavailable'))); e.mod.stop();
});
test('live observation flush interval changes the next due write without resetting observation history', () => {
    const e=fixture('Diagnostics=1\nObservationFlushMs=20000'); e.tick(0.7);
    e.menuSave({ObservationFlushMs:5000}); e.tick(0.71,5200);
    const report=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(report.flush.observationWrites,2); assert.equal(report.settings.ObservationFlushMs,5000);
    e.menuSave({ObserveAttacks:false},2); e.tick(0.72,5200);
    const after=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(after.flush.observationWrites,3); e.mod.stop();
});
test('Menu notice checks are bounded and unchanged notices never reread JSON', () => {
    const e = fixture(undefined, { json:'{}' }); e.menuSave({SoundOn:false}, 5); e.tick(0.1);
    for (let i=0;i<20;i++) e.tick(0.1,16);
    assert.equal(e.menuReads.length, 1); assert.equal(e.configReads.length, 2);
    e.tick(0.1,500); assert.equal(e.menuReads.length, 2); assert.equal(e.configReads.length, 2);
    e.menuSave({SoundOn:true}, 4); e.tick(0.1,500); assert.equal(e.settings.SoundOn, false);
    e.menuSave({SoundOn:true}, 6); e.tick(0.1,500); assert.equal(e.settings.SoundOn, true);
    assert.equal(e.configReads.length, 3); e.mod.stop();
});
test('partial malformed or missing saves retain outputs and retry the same notice after recovery', () => {
    const e = fixture(undefined, { json:'{"SoundVolume":0.4}' });
    e.menuSave({SoundOn:false}, 2); e.files.set(e.menuPath,'Changed=2\r\n'); e.tick(0.1);
    assert.equal(e.configReads.length,1); assert.equal(e.settings.SoundOn,true);
    e.files.set(e.menuPath,'Changed=2\r\nEnd=1\r\n'); e.files.delete(e.configPath); e.tick(0.1,500);
    assert.equal(e.settings.SoundVolume,0.4); assert.equal(e.settings.SoundOn,true);
    e.files.set(e.configPath,'{"SoundOn":false,'); e.tick(0.1,500); assert.equal(e.settings.SoundOn,true);
    e.files.set(e.configPath,'{"SoundOn":false,"SoundVolume":0.2}'); e.tick(0.1,500);
    assert.equal(e.settings.SoundOn,false); assert.equal(e.settings.SoundVolume,0.2);
    assert(e.logs.some(x=>x.includes('config-refresh-error'))); e.mod.stop(); assert.deepEqual(e.configWrites,[]);
});
test('Menu save while paused applies output preferences and never creates a warning', () => {
    const e=fixture(undefined,{json:'{"Diagnostics":true}'}); e.paused=true;
    e.menuSave({SoundOn:false,GlyphOn:false}); e.tick(0.1);
    assert.equal(e.settings.SoundOn,false); assert.equal(e.settings.GlyphOn,false); assert.equal(e.cues().length,0);
    e.mod.stop(); const final=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(final.menuSettings.change,1); assert.equal(final.menuSettings.saved.SoundOn,false);
    assert.equal(final.menuSettings.outputs.audio,'update-returned-unverified');
});
test('persisted values survive isolated output application failure', () => {
    const e=fixture(undefined,{json:'{}'}); e.failAudio=true;
    e.menuSave({SoundOn:false,GlyphOn:false,LeadMs:900}); e.tick(0.1);
    assert.equal(e.settings.SoundOn,false); assert.equal(e.settings.LeadMs,900);
    assert.equal(JSON.parse(e.files.get(e.configPath)).LeadMs,900);
    assert(e.logs.some(x=>x.includes('config-output-update') && x.includes('restart-required') && x.includes('update-returned-unverified')));
    assert.equal(e.hud.length,1); assert.equal(e.timers.size,1); e.mod.stop(); assert.deepEqual(e.configWrites,[]);
});
test('contained glyph failure is recorded separately from a successful save and audio update', () => {
    const e=fixture(undefined,{json:'{"Diagnostics":true}'}); e.containedUIFailure=true;
    e.menuSave({SoundVolume:0.3}); e.tick(0.7);
    assert.equal(JSON.parse(e.files.get(e.configPath)).SoundVolume,0.3);
    e.mod.stop(); const final=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(final.menuSettings.outputs.glyph,'restart-required');
    assert.equal(final.menuSettings.outputs.audio,'update-returned-unverified');
    assert.equal(e.cues().length,1);
});
test('Menu saves do not replay cue history or resurrect expired glyph windows', () => {
    const e=fixture(undefined,{json:'{}'}); e.tick(0.7); const id=e.cues()[0].id;
    e.menuSave({SoundOn:false,GlyphOn:false}); e.tick(0.8,500);
    e.tick(1.5,500); e.menuSave({SoundOn:true,GlyphOn:true},2); e.tick(1.6,500);
    assert.equal(e.cues().length,1); assert.equal(e.cues()[0].id,id);
    assert.equal(e.hud.at(-1).active.length,0);
    assert.equal(e.audioCalls.at(-1).events.filter(x=>x.kind==='cue').length,0); e.mod.stop();
});
test('independent cue occurs before original immutable warning and never edits it', () => {
    const e = fixture(); e.tick(0.64); assert.equal(e.cues().length, 0); e.tick(0.656);
    assert.equal(e.cues().length, 1); assert.equal(e.first.event.StartTime, 1); assert.equal(e.first.event.duration, 0.4);
    assert.equal(e.hud.at(-1).active[0].actualLeadGameSeconds.toFixed(3), '0.344'); e.mod.stop();
});
test('parallel ActiveTasks and prefixed soft references each issue a unique cue', () => {
    const e = fixture(); const b = e.addTask(e.owner, 'second', { soft: true, effectName: 'NS_LeiTing_AttackAlert_Blue_201' }); b.task.CurrentTime = 0.7;
    e.tick(0.7); assert.equal(e.cues().length, 2); assert.equal(new Set(e.cues().map(x => x.id)).size, 2);
    assert.deepEqual(e.cues().map(x => x.color).sort(), ['blue', 'red']); e.mod.stop();
});
test('two enemies warn simultaneously without a global cooldown', () => {
    const e = fixture(); const enemy = e.addEnemy('Other'); const t = e.addTask(enemy, 'other'); t.task.CurrentTime = 0.7;
    e.tick(0.7); assert.equal(e.cues().length, 2); e.mod.stop();
});
test('new activation of the same ability gets a new cue identity', () => {
    const e = fixture(); e.tick(0.7); e.owner.ability.activation++; e.tick(0.7, 64);
    assert.equal(e.cues().length, 2); assert.notEqual(e.cues()[0].id, e.cues()[1].id); e.mod.stop();
});
test('same-color consecutive warning nodes are not swallowed', () => {
    const e = fixture(); const second = Object.freeze({ ...e.first.event, StartTime: 1.2 });
    e.first.timeline.Actions = array([e.first.event, second]); e.tick(0.7); e.tick(0.86, 160);
    assert.equal(e.cues().length, 2); e.mod.stop();
});
test('natural glyph ending preserves WAV tail but later OnCancelled still stops it', () => {
    const e = fixture(); e.tick(0.7); e.tick(1.41, 710); assert.equal(e.cancels().length, 0);
    assert.equal(e.hud.at(-1).active.length, 0); e.first.task.OnCancelled.Fire(); e.tick(1.42);
    assert(e.cancels().some(x => x.id === e.cues()[0].id)); e.mod.stop();
});
test('normal OnCompleted removes glyph without cutting natural audio tail', () => {
    const e = fixture(); e.tick(0.7); e.first.task.OnCompleted.Fire(); e.tick(0.72);
    assert.equal(e.hud.at(-1).active.length, 0); assert.equal(e.cancels().length, 0); e.mod.stop();
});
test('normal completion retains audio tail when task leaves all live collections before scan', () => {
    const e = fixture(); e.tick(0.7); e.first.task.OnCompleted.Fire(); e.owner.ability.tasks.length = 0;
    e.tick(0.72, 64); assert.equal(e.hud.at(-1).active.length, 0); assert.equal(e.cancels().length, 0); e.mod.stop();
});
test('OnCancelled stops a live cue and cannot retrigger from a stale task pointer', () => {
    const e = fixture(); e.tick(0.7); e.first.task.OnCancelled.Fire(); e.tick(0.72); e.tick(0.75, 64);
    assert.equal(e.cues().length, 1); assert(e.cancels().length > 0); e.mod.stop();
});
test('pause cancels and resume does not replay the same attack', () => {
    const e = fixture(); e.tick(0.7); e.paused = true; e.tick(0.7); assert.equal(e.bus().paused, true);
    e.paused = false; e.tick(0.72); assert.equal(e.cues().length, 1); e.mod.stop();
});
test('temporary range exclusion suspends and preserves generation history', () => {
    const e = fixture(); e.tick(0.7); e.owner.enemy.distance = 9000; e.tick(0.71, 64);
    e.owner.enemy.distance = 1000; e.tick(0.72, 64); assert.equal(e.cues().length, 1); e.mod.stop();
});
test('temporary invalid CurrentTime suspends instead of resetting dedupe', () => {
    const e = fixture(); e.tick(0.7); e.tick(NaN); e.tick(0.72); assert.equal(e.cues().length, 1); e.mod.stop();
});
test('temporary read exception suspends and recovery never repeats a cue', () => {
    const e = fixture(); e.tick(0.7); const descriptor = Object.getOwnPropertyDescriptor(e.first.task, 'CurrentTime');
    Object.defineProperty(e.first.task, 'CurrentTime', { configurable: true, get() { throw Error('bridge read failed'); } });
    e.tick(undefined); Object.defineProperty(e.first.task, 'CurrentTime', descriptor); e.tick(0.72);
    assert.equal(e.cues().length, 1); assert(e.logs.some(x => x.includes('task-read-error'))); e.mod.stop();
});
test('HUD rendering failure leaves native audio and scheduler active', () => {
    const e = fixture(); e.failUI = true; e.tick(0.7); assert.equal(e.cues().length, 1); assert.equal(e.bus().paused, false);
    assert.equal(e.cancels().length, 0); e.failUI = false; e.tick(0.72); assert.equal(e.cues().length, 1); e.mod.stop();
});
test('global clock exception pauses without changing world identity or replaying', () => {
    const e = fixture(); e.tick(0.7); e.failClock = true; e.tick(0.71); assert.equal(e.bus().paused, true);
    e.failClock = false; e.tick(0.72); assert.equal(e.cues().length, 1); e.mod.stop();
});
test('malformed hook snapshot retries then discovers an actor outside the class scan', () => {
    const e = fixture('Diagnostics=1'); const owner = e.addEnemy('Hinted', false); const t = e.addTask(owner, 'hinted'); t.task.CurrentTime = 0.7;
    e.files.set(e.saved + 'pbzforewarn_hooks.json', '{broken'); e.tick(0); assert.equal(e.cues().length, 0);
    e.files.set(e.saved + 'pbzforewarn_hooks.json', JSON.stringify({ version: 1, session: 'hooks', active: true,
        heartbeat: e.wall, hints: [{ seq: 1, at: e.wall, ability: owner.ability._path, actor: owner.enemy._path }] }));
    e.tick(0.064, 64); assert.equal(e.cues().length, 1); e.mod.stop();
    assert(JSON.parse(e.files.get(e.saved + 'pbzforewarn_diagnostics.json')).activity.some(x => x.kind === 'hook-hint'));
});
test('invalidated hook snapshots do not keep reporting a living bridge', () => {
    const e = fixture('Diagnostics=1'); const p = e.saved + 'pbzforewarn_hooks.json'; e.files.set(p, JSON.stringify({ version: 1, session: 'hooks', active: true, heartbeat: e.wall, hints: [] }));
    e.tick(0); e.files.set(p, '{partial'); e.tick(0.064, 64); e.mod.stop();
    assert.equal(JSON.parse(e.files.get(e.saved + 'pbzforewarn_diagnostics.json')).hookBridgeAlive, false);
});
test('native start hint directly tracks an active task absent from every ASC list', () => {
    const e = fixture('Diagnostics=1'); e.owner.asc.ActivatableAbilities.Items = array([]); e.owner.ability.tasks.length = 0;
    e.first.task.CurrentTime = 0.7;
    e.files.set(e.saved + 'pbzforewarn_hooks.json', JSON.stringify({ version: 1, session: 'hooks', active: true,
        heartbeat: e.wall, hints: [{ seq: 1, at: e.wall, ability: e.owner.ability._path,
            actor: e.owner.enemy._path, task: e.first.task._path }] }));
    e.tick(0.7); assert.equal(e.cues().length, 1);
    e.tick(0.8, 100); assert.equal(e.cues().length, 1); e.first.task.OnCancelled.Fire(); e.tick(0.8);
    assert(e.cancels().length > 0); e.mod.stop();
    assert(JSON.parse(e.files.get(e.saved + 'pbzforewarn_diagnostics.json')).activity.some(x => x.source === 'native-start-hint'));
});
test('unlisted native task stops predicting after one second with no progress and retains history', () => {
    const e = fixture(); e.owner.asc.ActivatableAbilities.Items = array([]); e.owner.ability.tasks.length = 0;
    e.files.set(e.saved + 'pbzforewarn_hooks.json', JSON.stringify({ version: 1, session: 'hooks', active: true,
        heartbeat: e.wall, hints: [{ seq: 1, at: e.wall, ability: e.owner.ability._path, actor: e.owner.enemy._path, task: e.first.task._path }] }));
    e.tick(0.7); e.tick(0.7, 1100); assert.equal(e.hud.at(-1).active.length, 0);
    assert(e.logs.some(x => x.includes('native-task-stalled'))); e.tick(0.72); assert.equal(e.cues().length, 1); e.mod.stop();
});
test('unrecognized effects leave actionable inventory instead of silently vanishing', () => {
    const e = fixture('Diagnostics=1'); e.first.action.NiagaraEffect = { _path: '/PBZVFXPack/VFX/BattleFX/Common/NS_Special_001' };
    e.tick(0.7); e.mod.stop(); const report = JSON.parse(e.files.get(e.saved + 'pbzforewarn_diagnostics.json'));
    const catalog = JSON.parse(e.files.get(e.saved + 'pbzforewarn_resources.json'));
    assert(catalog.entries.some(x => x.data.reason === 'unrecognized-effect')); assert.equal(e.cues().length, 0);
});
test('runtime tag eligibility changes cancel but do not replay previously fired nodes', () => {
    const e = fixture(); e.first.action.ActivationRequirements.RequireTags = ['ready']; e.tick(0.7); assert.equal(e.cues().length, 0);
    e.owner.asc.tags.add('ready'); e.tick(0.72); assert.equal(e.cues().length, 1);
    e.owner.asc.tags.delete('ready'); e.tick(0.74); assert(e.cancels().length > 0);
    e.owner.asc.tags.add('ready'); e.tick(0.76); assert.equal(e.cues().length, 1); e.mod.stop();
});
test('bound enemy role uses its own tag state while friendly and unbound roles are suppressed', () => {
    const e = fixture('Diagnostics=1'); const roleOwner = e.addEnemy('Role'); e.first.timeline.Actions = array([]);
    e.first.timeline.RoleLayers = array([{ RoleName: 'Partner', Actions: array([e.first.event]) }]);
    e.first.action.ActivationRequirements.RequireTags = ['ready']; e.owner.asc.tags.add('ready');
    e.first.task.GetRoleActor = () => roleOwner.enemy;
    e.tick(0.66); assert.equal(e.cues().length, 0); roleOwner.asc.tags.add('ready'); roleOwner.enemy.friendly = true;
    e.tick(0.68); assert.equal(e.cues().length, 0); roleOwner.enemy.friendly = false;
    e.tick(0.70); assert.equal(e.cues().length, 1); e.mod.stop();
    const u = fixture('Diagnostics=1'); u.first.timeline.Actions = array([]);
    u.first.timeline.RoleLayers = array([{ RoleName: 'Missing', Actions: array([u.first.event]) }]);
    u.tick(0.7); assert.equal(u.cues().length, 0); u.mod.stop();
    const report = JSON.parse(u.files.get(u.saved + 'pbzforewarn_diagnostics.json'));
    assert(report.activity.some(x => x.reason === 'role-unbound'));
});
test('world replacement publishes reset even after natural glyph expiration', () => {
    const e = fixture(); e.tick(0.7); e.tick(1.41, 710); assert.equal(e.cancels().length, 0);
    e.world = { _path: '/World/B' }; e.tick(1.42); assert(e.bus().events.some(x => x.kind === 'reset')); e.mod.stop();
});
test('stop and restart clean delegate bindings and publish a new session', () => {
    const e = fixture(); e.tick(0.7); const oldSession = e.bus().session; assert.equal(e.first.task.OnCancelled.callbacks.size, 1);
    e.mod.stop(); assert.equal(e.timers.size, 0); assert.equal(e.first.task.OnCancelled.callbacks.size, 0); assert.equal(e.bus().paused, true);
    e.mod.start(); assert.equal(e.timers.size, 1); assert.notEqual(e.bus().session, oldSession); assert.equal(e.bus().seq, 0); e.mod.stop();
});
test('diagnostic write failure cannot lose game-engine audio events', () => {
    const e = fixture('Diagnostics=1'); e.failWrite = true; e.tick(0.7, 5010); assert.equal(e.cues().length, 1);
    assert(e.logs.some(x => x.includes('diagnostic-write-error')));
    e.failWrite = false; e.tick(0.72); assert.equal(e.cues().length, 1); e.mod.stop();
});
test('delayed sampling reports a missed window and the measured timer gap', () => {
    const e = fixture(); e.tick(0); e.tick(1.6, 1600); assert.equal(e.cues().length, 0);
    assert(e.logs.some(x => x.includes('tick-gap'))); assert(e.logs.some(x => x.includes('past-window'))); e.mod.stop();
});

test('only-locked mode suppresses unlocked actors then accepts the selected enemy', () => {
    const e = fixture('OnlyLockedTarget=1'); e.tick(0.66); assert.equal(e.cues().length, 0);
    e.lockedTarget = e.owner.enemy; e.tick(0.70); assert.equal(e.cues().length, 1);
    const other = e.addEnemy('OtherLock'); e.lockedTarget = other.enemy; e.tick(0.72);
    assert.equal(e.hud.at(-1).active.length, 0); assert(e.bus().events.some(x => x.kind === 'reset'));
    e.lockedTarget = e.owner.enemy; e.tick(0.74); assert.equal(e.cues().length, 1); e.mod.stop();
});
test('nearby default keeps unlocked play working', () => {
    const e = fixture(); e.tick(0.7); assert.equal(e.cues().length, 1); e.mod.stop();
});
test('Alt+F9 preview accepts either Alt and triggers once per F9 press', () => {
    const e = fixture(); e.tick(0);
    const count = () => e.cues().filter(x => x.id.startsWith('preview-')).length;
    e.keysDown.add('F9'); e.tick(0.01); assert.equal(count(), 0);
    e.keysDown.add('LeftAlt'); e.tick(0.02); assert.equal(count(), 0);
    e.keysDown.delete('F9'); e.tick(0.03); assert.equal(count(), 0);
    e.keysDown.add('F9'); e.tick(0.04); e.tick(0.05); assert.equal(count(), 1);
    e.keysDown.delete('LeftAlt'); e.tick(0.06);
    e.keysDown.add('RightAlt'); e.tick(0.07); assert.equal(count(), 1);
    e.keysDown.delete('F9'); e.tick(0.08);
    e.keysDown.add('F9'); e.tick(0.09); assert.equal(count(), 2);
    e.keysDown.delete('F9'); e.tick(0.10); e.paused = true;
    e.keysDown.add('F9'); e.tick(0.11); assert.equal(count(), 2);
    e.paused = false; e.tick(0.12); assert.equal(count(), 2);
    assert(e.logs.some(x => x.includes('audio-preview') && x.includes('Alt+F9'))); e.mod.stop();
});
test('audio failure cannot hide a valid warning or stop task sampling', () => {
    const e = fixture(); e.failAudio = true; e.tick(0.7);
    assert.equal(e.hud.at(-1).active.length, 1); assert(e.logs.some(x => x.includes('audio-update-error')));
    e.failAudio = false; e.tick(0.72); assert.equal(e.hud.at(-1).active.length, 1); e.mod.stop();
});


test('verified black action reaches both HUD and native sound while BlackOn can disable it', () => {
    const { BLACK_ACTION_CLASS } = require('../PBZForewarn/attack-recognition');
    for (const enabled of [true,false]) {
        const e = fixture('BlackOn='+(enabled?'1':'0'));
        e.first.timeline.Actions = array([]);
        const k = e.addTask(e.owner,'black',{effectName:'NS_AttackAlert_Post_001',actionClass:BLACK_ACTION_CLASS});
        k.task.CurrentTime=0.7; e.tick(0.7);
        assert.equal(e.cues().filter(x=>x.color==='black').length, enabled?1:0);
        assert.equal(e.hud.at(-1).active.filter(x=>x.color==='black').length, enabled?1:0); e.mod.stop();
    }
});
test('only-locked mode follows the bound execution actor for role-layer events', () => {
    const e = fixture('OnlyLockedTarget=1'), partner=e.addEnemy('Partner');
    e.first.timeline.Actions=array([]);
    e.first.timeline.RoleLayers=array([{RoleName:'Partner',Actions:array([e.first.event])}]);
    e.first.task.GetRoleActor=()=>partner.enemy; e.lockedTarget=partner.enemy;
    e.tick(0.7); assert.equal(e.cues().length,1); e.mod.stop();
});


test('non-finite game clock pauses audio and preserves same-attack dedupe on recovery', () => {
    const e=fixture(); e.tick(0.7); e.nanClock=true; e.tick(0.71);
    assert.equal(e.bus().paused,true); e.nanClock=false; e.tick(0.72);
    assert.equal(e.cues().length,1); assert.equal(e.bus().paused,false); e.mod.stop();
});
test('eligibility loss cancels a sound whose short glyph has already expired', () => {
    const e=fixture('MaxGlyphMs=100'); e.first.action.ActivationRequirements.RequireTags=['ready'];
    e.owner.asc.tags.add('ready'); e.tick(0.7); e.tick(0.82,120);
    assert.equal(e.hud.at(-1).active.length,0); assert.equal(e.cancels().length,0);
    e.owner.asc.tags.delete('ready'); e.tick(0.84,20);
    assert(e.cancels().some(x=>x.reason==='execution-ineligible:require-tags')); e.mod.stop();
});
test('inactive task without a completion delegate cancels audio after glyph expiration', () => {
    const e=fixture('MaxGlyphMs=100'); e.tick(0.7); e.tick(0.82,120);
    e.owner.ability.bIsActive=false; e.tick(0.84,20);
    assert(e.cancels().some(x=>x.reason==='task-no-longer-active')); e.mod.stop();
});

test('sampled natural warning end preserves sound when task vanishes without completion callback', () => {
    const e=fixture(); e.tick(0.7); const cueId=e.cues()[0].id;
    e.tick(1.41,710); assert.equal(e.hud.at(-1).active.length,0);
    e.owner.ability.tasks.length=0; e.owner.ability.ActiveTasks=array([]); e.owner.ability.bIsActive=false;
    e.tick(1.43,64);
    assert(!e.cancels().some(x=>x.id===cueId));
    assert(e.logs.some(x=>x.includes('sound-tail-preserved'))); e.mod.stop();
});

test('new task generation does not cut an already naturally ended warning sound', () => {
    const e=fixture(); e.tick(0.7); const cueId=e.cues()[0].id; e.tick(1.41,710);
    e.owner.ability.activation++; e.tick(0,64);
    assert(!e.cancels().some(x=>x.id===cueId)); e.mod.stop();
});

test('actor range loss still cancels tail after natural warning end', () => {
    const e=fixture(); e.tick(0.7); const cueId=e.cues()[0].id; e.tick(1.41,710);
    e.owner.enemy.distance=9000; e.tick(1.43,20);
    assert(e.cancels().some(x=>x.id===cueId && x.reason==='actor-filtered')); e.mod.stop();
});
test('one withdrawal is counted once with explicit cancellation evidence', () => {
    const e=fixture('Diagnostics=1'); e.tick(0.7); const cueId=e.cues()[0].id;
    e.first.task.OnCancelled.Fire(); e.tick(0.72); e.tick(0.74); e.mod.stop();
            e.mod.stop();
            const report=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(e.cancels().filter(x=>x.id===cueId).length,1); assert.equal(report.stats.cancels,1);
    assert(report.stats.duplicateCancelsSuppressed>0);
    const cancel=report.recent.find(x=>x.kind==='CANCEL' && x.id===cueId);
    assert.equal(cancel.termination.source,'explicit-cancel'); assert.equal(cancel.termination.taskValid,true);
    assert.equal(cancel.termination.playerHitCauseVerified,false);
});

test('editor preview condition is counted as inactive instead of a missed attack', () => {
    const e=fixture('Diagnostics=1'); e.first.action.ActivationRequirements.RequireTags=['CharacterState.EditorDebug.Preview'];
    e.tick(0.7); e.tick(1.2,500); e.mod.stop();
    const report=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(e.cues().length,0); assert.equal(report.stats.missed,0);
    assert.equal(report.stats.conditionsNotMet,1); assert.equal(report.stats.previewOnlySkipped,1);
    const skip=report.recent.find(x=>x.kind==='condition-not-met');
    assert.equal(skip.reason,'editor-preview-only'); assert.equal(skip.eligibilityReason,'require-tags');
    assert(Math.abs(skip.lateBy-0.2)<1e-6); assert(Math.abs(skip.lateGrace-0.08)<1e-6);
    assert.equal(skip.endedBeforeObservation,false);
});

test('a tag-blocked warning records why it was skipped and how late it was seen', () => {
    const e=fixture('Diagnostics=1'); e.first.action.ActivationRequirements.RequireTags=['CharacterState.NotOwned'];
    e.tick(0.7); e.tick(1.2,500); e.mod.stop();
    const report=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(e.cues().length,0); assert.equal(report.stats.conditionsNotMet,1);
    const skip=report.recent.find(x=>x.kind==='condition-not-met');
    assert.equal(skip.reason,'conditions-not-met-through-window');
    assert.equal(skip.eligibilityReason,'require-tags');
    assert(Math.abs(skip.lateBy-0.2)<1e-6);
    assert.equal(report.stats.previewOnlySkipped,0);
});

test('diagnostics off with generic preparation disabled skips deep sampling but keeps warning identity and withdrawal', () => {
    const e=fixture(undefined,genericDisabledSettings({Diagnostics:false})); let semanticReads=0, evidenceReads=0;
    Object.defineProperty(e.first.action,'DeflectBulletType',{get(){semanticReads++; return 3;}});
    e.first.action.GetAbilitySystemComponent=()=>{evidenceReads++; return e.owner.asc;};
    e.tick(0.7); assert.equal(e.cues().length,1); e.first.task.OnCancelled.Fire(); e.tick(0.72); e.mod.stop();
    assert.equal(semanticReads,0); assert.equal(evidenceReads,0);
    assert.equal(e.cancels().filter(x=>x.id===e.cues()[0].id).length,1);
    assert(!e.files.has(e.saved+'pbzforewarn_diagnostics.json'));
    assert(!e.files.has(e.saved+'pbzforewarn_resources.json'));
});

test('repeated resources do not inflate catalog or push early fight events out of history', () => {
    const e=fixture('Diagnostics=1');
    for(let i=0;i<100;i++) { e.owner.ability.activation++; e.tick(0.7,80); e.tick(1.41,710); }
    e.mod.stop(); const report=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    const catalog=JSON.parse(e.files.get(e.saved+'pbzforewarn_resources.json'));
    assert.equal(report.stats.cues,100); assert.equal(report.recent.filter(x=>x.kind==='CUE').length,100);
    assert.equal(catalog.entries.length,1); assert(report.recent.some(x=>x.kind==='CUE' && x.id===e.cues()[0].id));
    assert(report.retention.recent.bytes<=512*1024); assert(report.retention.recent.dropped===0);
    assert(e.files.get(e.saved+'pbzforewarn_diagnostics.json').length<250000);
});

test('natural event ending permits tail even if its required tags later disappear', () => {
    const e=fixture(); e.first.action.ActivationRequirements.RequireTags=['ready'];
    e.owner.asc.tags.add('ready'); e.tick(0.7); e.tick(1.41,710);
    e.owner.asc.tags.delete('ready'); e.tick(1.43,20);
    assert.equal(e.cancels().length,0); e.mod.stop();
});

test('hundreds of ordinary and candidate actions preserve the fired warning resource', () => {
    const e=fixture('Diagnostics=1'), entries=[e.first.event];
    for(let i=0;i<700;i++) {
        const effect=i<450 ? null : {_path:'/PBZVFXPack/VFX/BattleFX/Common/NS_Unknown_'+i};
        const action={_path:'/Actions/junk-'+i,NiagaraEffect:effect,GetClass:()=>({_path:'/Class/Ordinary'}),
            ActivationRequirements:{RequireTags:[],IgnoreTags:[],TagQuery:{empty:true}}};
        entries.push({Action:action,StartTime:2,duration:0.2,TriggerTimeOffset:0,EndTriggerTimeOffset:0});
    }
    e.first.timeline.Actions=array(entries); e.tick(0.7); e.mod.stop();
    const report=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    const catalog=JSON.parse(e.files.get(e.saved+'pbzforewarn_resources.json'));
    const cue=report.recent.find(x=>x.kind==='CUE');
    assert.equal(report.stats.cues,1); assert.equal(catalog.entries.length,128);
    assert(catalog.entries.some(x=>x.key===cue.resourceId && x.priority===2 && x.data.color==='red'));
    assert(!catalog.entries.some(x=>x.data.reason==='non-niagara-action'));
});

test('Lua health failures and recovery remain visible in JS diagnostics', () => {
    const e=fixture('Diagnostics=1'); e.files.set(e.saved+'pbzforewarn_hooks.json',JSON.stringify({version:1,session:'lua-new',active:true,
        heartbeat:e.wall,hints:[],health:{writeFailures:2,recoveries:1,lastSuccessfulWriteMs:e.wall,
            lastError:'sharing conflict',lastErrorStage:'open',currentlyFailing:false,registered:2}}));
    e.tick(0); e.mod.stop(); const report=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(report.hookHealth.writeFailures,2); assert.equal(report.hookHealth.recoveries,1);
    assert.equal(report.hookHealth.lastErrorStage,'open'); assert.equal(report.hookBridgeAlive,true);
    assert.equal(report.stats.errors,0);
});

function observations(env) { return JSON.parse(env.files.get(env.saved+'pbzforewarn_observations.json')); }
function provideNativeFrame(env, handle=1) {
    env.first.action.GetAbility=()=>env.owner.ability;
    env.first.action.GetAvatarActor=()=>env.owner.enemy;
    env.first.action.GetTimeline=()=>env.first.timeline;
    env.first.action.DeflectBulletType=3;
    const frame={SourceAction:env.first.action,HitGameTime:1.5,IsDodge:true,IsHit:false};
    const entries=new Map([[handle,frame]]), keys=[handle];
    env.deflect={_path:'/Player/Deflect',ReceiveFrames:{Num:()=>entries.size,GetMaxIndex:()=>keys.length,
        IsValidIndex:i=>entries.has(keys[i]),GetKey:i=>keys[i],Get:key=>entries.get(key)}};
    return {frame,entries,keys};
}

test('observation on and off keep identical cue and withdrawal sequences',()=>{
    const results=[];
    for(const enabled of [true,false]) {
        const e=fixture('Diagnostics=1\nObserveAttacks='+(enabled?'1':'0')); provideNativeFrame(e);
        e.tick(0.3);e.tick(0.7);e.first.task.OnCancelled.Fire();e.tick(0.71);e.mod.stop();
        results.push(e.audioEvents.map(x=>({kind:x.kind,id:x.id,color:x.color,reason:x.reason})));
    }
    assert.deepEqual(results[0],results[1]);
});
test('native observations are persisted but cannot generate an unsupported warning',()=>{
    const e=fixture('Diagnostics=1');provideNativeFrame(e);
    e.first.action.NiagaraEffect={_path:'/Unknown/OrdinaryEffect'};
    e.tick(0.7);e.mod.stop();const report=observations(e);
    assert.equal(e.cues().length,0);assert(report.events.some(x=>x.kind==='native-frame'&&x.typeName==='RedEye'));
    assert(report.events.some(x=>x.kind==='attack-plan'));assert.equal(report.mode,'observe-only');
});
test('emitted warning is present in the bounded encounter summary',()=>{
    const e=fixture('Diagnostics=1');e.tick(0.7);e.mod.stop();const summary=observations(e).encounterSummary;
    const actor=summary.actors.find(x=>x.actor==='/Enemy');
    assert(actor);assert.equal(actor.counts.warningCue,1);assert.equal(actor.colors.red,1);
});
test('same resource in another activation has another observation identity',()=>{
    const e=fixture('Diagnostics=1');provideNativeFrame(e);e.tick(0.1);
    e.owner.ability.activation++;e.tick(0.1,250);e.mod.stop();
    const plans=observations(e).events.filter(x=>x.kind==='attack-plan');
    assert.equal(new Set(plans.map(x=>x.activation)).size,2);
});
test('unchanged action snapshots do not record every compile progress update',()=>{
    const e=fixture('Diagnostics=1');provideNativeFrame(e);e.tick(0.1);e.tick(0.2,250);e.tick(0.3,250);e.mod.stop();
    const report=observations(e);
    assert.equal(report.events.filter(x=>x.kind==='attack-plan').length,1);
    assert.equal(report.events.filter(x=>x.kind==='warning-plan').length,1);
});
test('observation file write failure leaves cues and audio running',()=>{
    const e=fixture('Diagnostics=1');e.failObservationWrite=true;e.tick(0.7);e.tick(0.8,5100);e.mod.stop();
    assert.equal(e.cues().length,1);const report=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(report.stats.errors,0);assert(report.flush.observationWriteFailures>0);
    assert(report.recent.some(x=>x.kind==='observation-write-error'));
});
test('observation file is written on its own slower cadence and skipped when unchanged',()=>{
    const e=fixture('Diagnostics=1\nObservationFlushMs=20000');
    const writes=()=>JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json')).flush.observationWrites;
    assert.equal(writes(),1);                 // forced write at startup
    e.tick(0.7);assert.equal(writes(),1);     // nothing due yet
    e.tick(0.71,5200);assert.equal(writes(),1); // still inside the 20 s window
    e.tick(0.72,16000);assert.equal(writes(),2); // now due and content changed
    e.tick(0.73,21000);assert.equal(writes(),2); // due again but nothing changed
    e.mod.stop();assert.equal(writes(),3);     // shutdown always flushes
});
test('diagnostics off disables optional observation reads and all diagnostic files through shutdown',()=>{
    const e=fixture('Diagnostics=0');let reads=0;
    Object.defineProperty(e.player,'GetComponentByClass',{get(){reads++;throw Error('must not read');}});
    e.tick(0.7);e.tick(0.8,31000);e.mod.stop();assert.equal(reads,0);assert.equal(e.cues().length,1);
    for(const name of ['diagnostics','observations','resources'])
        assert(!e.files.has(e.saved+'pbzforewarn_'+name+'.json'),name+' must not be written while off');
});
test('Lua observations preserve callback clock and never use import player as capture identity',()=>{
    const e=fixture('Diagnostics=1');e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify({schemaVersion:1,
        session:'observer-lua',seq:1,active:true,heartbeat:e.wall,events:[{seq:1,kind:'timeline-call',phase:'pre',
            callId:1,gameTime:{status:'read',value:42,source:'GameplayStatics.GetTimeSeconds'},
            context:{world:'/World/A',ability:'/Ability',actor:'/Enemy',task:'/Task'},params:{StartTimeSeconds:{status:'read',value:2.88}}}]}));
    e.tick(0.7);e.mod.stop();const entry=observations(e).events.find(x=>x.kind==='timeline-call');
    assert.equal(entry.capture.gameTime.value,42);assert.equal(entry.player,null);assert.equal(entry.gameTime,null);
    assert.equal(entry.importedPlayer,'/Player');assert.equal(entry.captureWorldMatchesImportedWorld,true);
    assert.equal(entry.capture.params.StartTimeSeconds.value,2.88);assert.equal(e.cues().length,1);
});
test('stale Lua observation snapshots cannot impersonate current calls',()=>{
    const e=fixture('Diagnostics=1');e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify({schemaVersion:1,
        session:'old',seq:1,active:true,heartbeat:e.wall-5000,events:[{seq:1,kind:'warning-call',phase:'call'}]}));
    e.tick(0.7);e.mod.stop();assert(!observations(e).events.some(x=>x.kind==='native-warning-call'));
    assert(observations(e).events.some(x=>x.status==='snapshot-inactive-or-stale'));
});
test('Lua snapshot sequence gaps are explicit and repeated imports do not duplicate calls',()=>{
    const e=fixture('Diagnostics=1');e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify({schemaVersion:1,
        session:'gap',seq:8,active:true,heartbeat:e.wall,events:[{seq:8,kind:'warning-call',phase:'call',context:{world:'/Other'}}]}));
    e.tick(0.1);e.tick(0.2,100);e.mod.stop();const report=observations(e);
    assert.equal(report.events.filter(x=>x.kind==='native-warning-call').length,1);
    assert(report.events.some(x=>x.kind==='observer-hook-gap'&&x.actual===8));
    assert.equal(report.events.find(x=>x.kind==='native-warning-call').captureWorldMatchesImportedWorld,false);
});
test('clock rewind increments observation epoch before native records are reused',()=>{
    const e=fixture('Diagnostics=1');provideNativeFrame(e);e.game=2;e.tick(0.1);e.game=0;e.tick(0.2);e.mod.stop();
    const frames=observations(e).events.filter(x=>x.kind==='native-frame');
    assert.equal(new Set(frames.map(x=>x.clockEpoch)).size,2);
    assert(observations(e).events.some(x=>x.kind==='observer-reset'&&x.reason==='game-clock-rewind'));
});

test('missing optional observation modules leave baseline cues operational',()=>{
    for(const name of ['./observation-store','./native-attack-observer','./timeline-observation']) {
        const e=fixture('Diagnostics=1',{missingModule:name});e.tick(0.7);e.mod.stop();
        assert.equal(e.cues().length,1);assert(!e.files.has(e.saved+'pbzforewarn_observations.json'));
        assert(e.diagnostics().some(x=>x.includes('observation-unavailable')));
    }
});
test('disabled observations do not even require missing optional files',()=>{
    const e=fixture('Diagnostics=1\nObserveAttacks=0',{missingModule:'./observation-store'});e.tick(0.7);e.mod.stop();
    assert.equal(e.cues().length,1);assert(!e.diagnostics().some(x=>x.includes('observation-unavailable')));
});
test('observer store construction failure cannot stop cue startup',()=>{
    const e=fixture('Diagnostics=1',{badStore:true});e.tick(0.7);e.mod.stop();assert.equal(e.cues().length,1);
});
test('invalid Lua rows cannot advance cursor past valid observations',()=>{
    const e=fixture('Diagnostics=1');e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify({schemaVersion:1,
        session:'reject',seq:1,active:true,heartbeat:e.wall,events:[
            {seq:999999,kind:'timeline-call',phase:'pre'},
            {seq:1,kind:'not-a-call',phase:'post'},
            {seq:1,kind:'timeline-call',phase:'post',context:{world:'/World/A'}}]}));
    e.tick(0.7);e.mod.stop();const report=observations(e);
    assert.equal(report.events.filter(x=>x.kind==='timeline-call').length,1);
    assert.equal(report.hookImport.lastSeq,1);assert.equal(report.hookImport.rejectedRows,2);
});
test('Lua structured activation stays in capture and is not promoted to identity',()=>{
    const e=fixture('Diagnostics=1');e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify({schemaVersion:1,
        session:'abi',seq:1,active:true,heartbeat:e.wall,events:[{seq:1,kind:'timeline-call',phase:'pre',
            context:{world:'/World/A',activation:{status:'read',value:7}}}]}));
    e.tick(0.7);e.mod.stop();const entry=observations(e).events.find(x=>x.kind==='timeline-call');
    assert.equal(entry.activation,null);assert.equal(entry.capture.context.activation.value,7);
});
test('global observation sampling covers multiple tasks without withholding cues',()=>{
    const e=fixture('Diagnostics=1');provideNativeFrame(e);
    const extras=[];for(let i=0;i<5;i++){const other=e.addEnemy('Other'+i),task=e.addTask(other,'other'+i);
        task.action.DeflectBulletType=2;task.task.CurrentTime=0.7;extras.push(task);}
    e.tick(0.7);assert.equal(e.cues().length,6);
    e.tick(0.71);e.mod.stop();const report=observations(e);
    assert(report.sampling.deferredTaskSamples>=1);assert.equal(report.sampling.maxTimelineTasksPerTick,4);
    assert.equal(report.sampling.fairRotationByRecord,true);
    assert(report.events.some(x=>x.kind==='attack-plan'&&x.actor==='/Enemy'));
    assert(report.events.filter(x=>x.kind==='attack-plan'&&String(x.actor).startsWith('/Other')).length>=3);
});

function namedOnlyRuntime(kind, config, startup) {
    const e=fixture(config,startup);
    if(kind==='cast') {
        e.owner.enemy._path='/World/BP_Monster_FemaleVessel_YuZan_C_1';
        e.owner.ability._path=e.owner.enemy._path+'.GA_YuZan_Skill_03_C_1';
        e.first.action.GetClass=()=>({_path:'/SGameCombatSystem/Weapon/Action/GAAction_WeaponParticleFrame.GAAction_WeaponParticleFrame_C'});
        e.first.action.NiagaraEffect={_path:'/PBZVFXPack/VFX/BattleFX/YuZan/NS_YuZan_Warning_AOE_101.NS_YuZan_Warning_AOE_101'};
        e.first.timeline.Actions=array([{...e.first.event,StartTime:0.7387645244598389,duration:0}]);
    } else {
        e.owner.enemy._path='/Game/Test.BP_Monster_QiShu_Huo_C_1';
        e.owner.ability._path='/Game/Test.'+(kind==='round'?'GA_Qishu_Huo_RoundSkill_FireRing_C_1':'GA_Qishu_Huo_SkillAttack_F_AssaultEnd_C_1');
        e.first.action.NiagaraEffect=null; e.first.action['Deflect Bullet Type']=3;
        e.first.action.GetClass=()=>({_path:'/PBZDeflectSystem/Actions/GAA_DelayDeflectProjectileBullet.GAA_DelayDeflectProjectileBullet_C'});
    }
    e.first.timeline._path=e.owner.ability._path+'.Main';
    return e;
}
test('named boss actions without structural preparation resources cannot cue with retired keys enabled',()=>{
    for(const kind of ['round','assault','cast']) {
        const e=namedOnlyRuntime(kind,'Diagnostics=1\nSemanticFallback=1\nYuZanCastWarning=1\nYuZanCastLeadMs=1000');
        assert.equal(e.settings.GenericAttack,true);
        for(const time of [0,0.4,0.7,1.1]) e.tick(time,250);
        e.owner.ability.activation++; e.tick(0,64); e.tick(0.7,250);
        assert.equal(e.cues().length,0,kind); assert(e.hud.every(x=>x.active.length===0)); e.mod.stop();
        const report=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
        for(const key of ['fallbackCues','castCues','followupSuppressed']) assert(!Object.hasOwn(report.stats,key),key);
        for(const key of RETIRED_SETTINGS) assert(!Object.hasOwn(report.settings,key),key);
    }
});
test('legacy upgrade and marked deliberate GenericAttack false cannot reactivate retired named rules',()=>{
    const values={GenericAttack:false,SemanticFallback:true,YuZanCastWarning:true,YuZanCastLeadMs:1000};
    for(const kind of ['round','assault','cast']) for(const [startup,enabled] of [[{},true],
        [{json:JSON.stringify(values)},true], [{json:JSON.stringify({_internal:values,_extra:values})},true],
        [genericDisabledSettings(),false],
        [{json:JSON.stringify({_internal:values,_extra:{...values,PBZForewarnGenericAttackEpoch:1}})},false]]) {
        const e=namedOnlyRuntime(kind,'GenericAttack=0\nSemanticFallback=1\nYuZanCastWarning=1\nYuZanCastLeadMs=1000',startup);
        assert.equal(e.settings.GenericAttack,enabled); e.tick(0.4); e.tick(0.7,300); assert.equal(e.cues().length,0,kind);
        e.menuSave({SemanticFallback:true,YuZanCastWarning:true,YuZanCastLeadMs:1000}); e.tick(0.8,600);
        assert.equal(e.settings.GenericAttack,enabled); assert.equal(e.cues().length,0); e.mod.stop();
    }
});
test('retired keys and disabled generic preparation leave ordinary red blue black requirements and cancellation intact',()=>{
    const {BLACK_ACTION_CLASS}=require('../PBZForewarn/attack-recognition');
    for(const color of ['red','blue','black']) {
        const e=fixture('SemanticFallback=1\nYuZanCastWarning=1\nYuZanCastLeadMs=1000',genericDisabledSettings());
        e.owner.enemy._path='/World/BP_Monster_FemaleVessel_YuZan_C_1';
        e.first.action.NiagaraEffect={_path:color==='black'?'/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Post_001.NS_AttackAlert_Post_001':
            '/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_'+(color==='red'?'Red':'Blue')+'_001'};
        if(color==='black') e.first.action.GetClass=()=>({_path:BLACK_ACTION_CLASS});
        e.first.action.ActivationRequirements.RequireTags=['ready']; e.tick(0.7); assert.equal(e.cues().length,0,color);
        e.owner.asc.tags.add('ready'); e.tick(0.72); assert.equal(e.cues().length,1); assert.equal(e.cues()[0].color,color);
        e.owner.asc.tags.delete('ready'); e.tick(0.74); assert.equal(e.cancels().length,1);
        e.owner.asc.tags.add('ready'); e.tick(0.76); assert.equal(e.cues().length,1); e.mod.stop();
    }
});
test('duplicate ordinary GUID nodes and a later array reorder preserve one cue identity',()=>{
    const e=fixture(), node={...e.first.event,Guid:{A:1,B:2,C:3,D:4}};
    e.first.timeline.Actions=array([node,{...node}]); e.tick(0.7); assert.equal(e.cues().length,1); const id=e.cues()[0].id;
    const unrelated={...node,Action:{_path:'/Action/Unrelated',GetClass:()=>({_path:'/Class/Unrelated'})}};
    e.first.timeline.Actions=array([unrelated,node]); e.tick(0.95,250);
    assert.equal(e.cues().length,1); assert.equal(e.cues()[0].id,id); assert.equal(e.cancels().length,0); e.mod.stop();
});
test('a name-only cast marker cannot suppress a later ordinary Success black warning',()=>{
    const e=namedOnlyRuntime('cast','YuZanCastWarning=1',genericDisabledSettings({Diagnostics:true})); e.tick(0.4); assert.equal(e.cues().length,0);
    e.first.task.OnCompleted.Fire(); e.owner.ability.activation++;
    const success=ordinaryFollowup(e); success.timeline._path=e.owner.ability._path+'.Success'; e.tick(undefined,250);
    assert.equal(e.cues().length,1); assert.equal(e.cues()[0].color,'black');
    success.task.OnCancelled.Fire(); e.tick(undefined); assert.equal(e.cancels().length,1); e.mod.stop();
    assert(observations(e).events.some(x=>x.kind==='warning-cue'&&x.source==='existing-0.5-scheduler'));
});
test('a Main-to-Success switch is retained as a branch observation without another cue',()=>{
    const e=fixture(undefined,genericDisabledSettings({Diagnostics:true}));
    e.owner.enemy._path='/Game/Test.BP_Monster_FemaleVessel_YuZan_C_1';
    e.owner.ability._path='/Game/Test.GA_YuZan_Skill_03_A_R_Start_C_1';
    const mainTimeline={...e.first.timeline,_path:'/Game/Test.Ability.Main'};
    const successTimeline={...e.first.timeline,_path:'/Game/Test.Ability.Success'};
    e.first.task.Timeline=mainTimeline;e.first.task.CurrentTime=0.3;e.tick(0.3);
    e.owner.ability.activation++;e.first.task.Timeline=successTimeline;e.first.task.CurrentTime=0;e.tick(0,64);
    const before=e.cues().length;e.tick(0.1,250);assert.equal(e.cues().length,before);
    e.mod.stop();const report=observations(e);const transition=report.events.find(x=>x.kind==='timeline-branch-transition');
    assert(transition);assert.equal(transition.phase,'main-to-success');
    assert.match(transition.previousTimeline,/\.Main$/);assert.match(transition.nextTimeline,/\.Success$/);
    assert.match(transition.previousAbility,/GA_YuZan_Skill_03_A_R_Start_C_/);
    assert.match(transition.nextAbility,/GA_YuZan_Skill_03_A_R_Start_C_/);
    assert.equal(transition.branchConfirmed,false);
});
test('YuZan spell-warning resources remain cue-disabled observations',()=>{
    const e=fixture('Diagnostics=1');
    e.owner.ability._path='/Game/Test.GA_YuZan_Skill_03_C_1';
    e.first.action.NiagaraEffect._path='/PBZVFXPack/VFX/BattleFX/YuZan/NS_YuZan_Warning_AOE_101.NS_YuZan_Warning_AOE_101';
    e.tick(0.1,250);e.mod.stop();
    const report=observations(e);
    const spell=report.events.find(x=>x.kind==='spell-warning-observation');
    assert(spell);assert.equal(spell.spellPhase,'cast');
    assert.equal(spell.cueEnabled,false);assert.equal(e.cues().length,0);
});
test('one spell-warning observation is retained per task and phase',()=>{
    const e=fixture('Diagnostics=1');
    e.owner.ability._path='/Game/Test.GA_YuZan_Skill_03_C_1';
    e.first.action.NiagaraEffect._path='/PBZVFXPack/VFX/BattleFX/YuZan/NS_YuZan_Warning_AOE_101.NS_YuZan_Warning_AOE_101';
    e.tick(0.1,250);e.tick(0.2,250);e.tick(0.3,250);e.mod.stop();
    assert.equal(observations(e).events.filter(x=>x.kind==='spell-warning-observation').length,1);
});
test('trial version is identical in START, diagnostics and observation snapshots',()=>{
    const e=fixture('Diagnostics=1');e.tick(0.1);e.mod.stop();
    const start=JSON.parse(e.logs.find(x=>x.startsWith('[PBZMOD] [Forewarn] START ')).split('START ')[1]);
    assert.equal(start.version,/const VERSION = "([^"]+)"/.exec(mainSource)[1]);
    assert.equal(observations(e).version,start.version);
    assert.equal(JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json')).version,start.version);
});

test('Lua schema2 paths decode without changing callback clock or cue output',()=>{
    const e=fixture('Diagnostics=1');e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify({schemaVersion:2,
        version:'0.6.0-trial.1',session:'lua-v2',seq:1,active:true,heartbeat:e.wall,
        pathDictionary:{1:'/World/A',2:'/Enemy/Ability',3:'/Enemy/Actor'},
        health:{writeFailures:2,recoveries:2,currentlyFailing:false},events:[{seq:1,kind:'timeline-call',phase:'pre',callId:1,
            gameTime:{status:'read',value:42},context:{world:{$path:1},ability:{$path:2},actor:{$path:3}},
            params:{StartTimeSeconds:{status:'read',value:2.883}}}]}));
    e.tick(0.7);e.mod.stop();const r=observations(e),call=r.events.find(x=>x.kind==='timeline-call');
    assert.equal(call.ability,'/Enemy/Ability');assert.equal(call.capture.context.actor,'/Enemy/Actor');
    assert.equal(call.capture.gameTime.value,42);assert.equal(call.gameTime,null);assert.equal(call.player,null);
    assert.equal(r.hookImport.health.recoveries,2);assert.equal(e.cues().length,1);
});

test('real Lua schema2 wire fixture imports string call IDs and structured parameters',()=>{
    const e=fixture('Diagnostics=1');const fixturePath=path.join(__dirname,'../../lua/tests/observer-schema2-wire-fixture.json');
    const payload=JSON.parse(fs.readFileSync(fixturePath,'utf8'));payload.heartbeat=e.wall;
    e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify(payload));e.tick(0.7);e.mod.stop();
    const r=observations(e),calls=r.events.filter(x=>x.kind==='timeline-call'),focus=r.events.filter(x=>x.kind==='focused-call-summary');
    assert.equal(calls.length,2);assert.equal(focus.length,1);
    assert.equal(typeof focus[0].capture.callId,'string');assert.equal(focus[0].capture.first.params.StartTimeSeconds.value,2.883);
    assert.equal(focus[0].capture.last.taskTime.value,2.9);
    assert.equal(calls[0].capture.gameTime.value,42.25);assert.equal(calls[0].gameTime,null);assert.equal(calls[0].player,null);
    assert.equal(calls[0].capture.context.activation.value,3);assert.equal(calls[0].activation,null);
    assert.equal(r.hookImport.rejectedRows,0);assert.equal(e.cues().length,1);
});

test('Lua schema2 missing or malformed references cannot advance valid cursor',()=>{
    for(const reference of [{$path:99},{$path:1,extra:'ambiguous'},{$path:-1}]){
        const e=fixture('Diagnostics=1');e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify({schemaVersion:2,
            session:'bad-path',seq:2,active:true,heartbeat:e.wall,pathDictionary:{1:'/World/A'},events:[
                {seq:1,kind:'timeline-call',phase:'pre',context:{world:reference}},
                {seq:2,kind:'timeline-call',phase:'post',context:{world:{$path:1}}}]}));
        e.tick(0.7);e.mod.stop();const r=observations(e);
        assert.equal(r.events.filter(x=>x.kind==='timeline-call').length,1);
        assert.equal(r.hookImport.rejectedRows,1);assert.equal(r.hookImport.lastSeq,2);
        assert(r.events.some(x=>x.kind==='observer-hook-gap'&&x.expected===1&&x.actual===2));assert.equal(e.cues().length,1);
    }
});

test('focused Lua summaries survive original event eviction without becoming duplicate execution events',()=>{
    const e=fixture('Diagnostics=1');const payload={schemaVersion:2,session:'focused',seq:500,active:true,heartbeat:e.wall,
        pathDictionary:{1:'/Game/FeiZei_SpecialAttack_07',2:'/Game/Enemy'},events:[],
        focusRetention:{count:1,total:1,dropped:0},focusSummaries:[{callId:'fw-observe-focused:4',kind:'timeline-call',firstSeq:1,lastSeq:2,
            ability:{$path:1},actor:{$path:2},first:{phase:'pre',params:{StartTimeSeconds:{value:2.883}}},
            last:{phase:'post',taskTime:{value:2.9}},abiVerified:false}]};
    e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify(payload));e.tick(0.1);
    payload.heartbeat=e.wall+300;e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify(payload));e.tick(0.2,300);
    e.mod.stop();const r=observations(e),focus=r.events.filter(x=>x.kind==='focused-call-summary');
    assert.equal(focus.length,1);assert.equal(focus[0].capture.first.params.StartTimeSeconds.value,2.883);
    assert.equal(focus[0].ability,'/Game/FeiZei_SpecialAttack_07');assert.equal(focus[0].gameTime,null);
    assert.equal(r.events.filter(x=>x.kind==='timeline-call').length,0);assert.equal(r.hookImport.lastSeq,0);
});

test('late first discovery retains the task position and missed-plan context',()=>{
    const e=fixture('Diagnostics=1');e.tick(3.71554);e.mod.stop();const r=observations(e);
    const first=r.events.find(x=>x.kind==='task-lifecycle'&&x.phase==='first-observed');
    const missed=r.events.find(x=>x.kind==='warning-missed');
    assert.equal(first.firstObservedTimelineTime,3.71554);assert.equal(first.startTimeVerified,false);
    assert.equal(missed.recordSerial,first.recordSerial);assert.equal(missed.firstObservedTimelineTime,3.71554);
    assert.equal(missed.executionVerified,false);assert.equal(e.cues().length,0);
});

test('task rewind and record replacement retain separate local identities without manufacturing strikes',()=>{
    const e=fixture('Diagnostics=1');e.tick(0.3);e.tick(0.1);e.owner.ability.activation++;e.tick(0.1,64);e.mod.stop();
    const r=observations(e),life=r.events.filter(x=>x.kind==='task-lifecycle');
    const rewind=life.find(x=>x.phase==='timeline-rewind-observed');
    const firsts=life.filter(x=>x.phase==='first-observed');
    assert.equal(rewind.previousTimelineTime,0.3);assert.equal(rewind.observationRun,2);
    assert.equal(firsts.length,2);assert.notEqual(firsts[0].recordSerial,firsts[1].recordSerial);
    assert.equal(firsts[1].replacesRecordSerial,firsts[0].recordSerial);
    assert.equal(firsts[1].identityBasis,'local-task-record-not-cross-source-strike-id');
});

test('task cancellation preserves terminal facts without asserting a projectile became safe',()=>{
    const e=fixture('Diagnostics=1');e.tick(0.7);e.first.task.OnCancelled.Fire();e.tick(0.72);e.mod.stop();
    const r=observations(e),ended=r.events.find(x=>x.kind==='task-lifecycle'&&x.phase==='native-task-ended');
    const cancel=r.events.find(x=>x.kind==='warning-withdrawal');
    assert.equal(ended.callback,'OnCancelled');assert.equal(ended.dangerEndedVerified,false);
    assert.equal(cancel.recordSerial,ended.recordSerial);assert.equal(cancel.termination.playerHitCauseVerified,false);
});

test('native task delegate does not borrow an old world clock after the actor world changes',()=>{
    const e=fixture('Diagnostics=1');e.tick(0.7);e.owner.enemy.GetWorld=()=>({_path:'/World/New'});e.game=1.2;
    e.first.task.OnCancelled.Fire();e.mod.stop();const r=observations(e);
    const ended=r.events.find(x=>x.kind==='task-lifecycle'&&x.phase==='native-task-ended');
    assert.equal(ended.captureWorld,'/World/New');assert.equal(ended.worldKey,null);assert.equal(ended.clockEpoch,null);
    assert.equal(ended.gameTime,1.2);assert.equal(ended.callbackContextVerified,false);
});

test('bounded1 and bounded2 main produce identical cue and audio events across combat transitions',()=>{
    const previous=fs.readFileSync(path.join(__dirname,'fixtures/bounded1-main.fixture.js'),'utf8');
    const scenarios=[
        e=>{e.tick(0.3);e.tick(0.7);e.tick(1.42,720);e.first.task.OnCompleted.Fire();e.tick(1.45);},
        e=>{e.tick(0.7);e.first.task.OnCancelled.Fire();e.tick(0.71);e.owner.ability.activation++;e.tick(0,64);e.tick(0.7);},
        e=>{const other=e.addEnemy('Other');const t=e.addTask(other,'other');t.task.CurrentTime=0.7;e.tick(0.7);e.tick(1.42,720);
            e.owner.ability.activation++;e.tick(0.7,80);e.owner.enemy.distance=9000;e.tick(0.72);},
        e=>{e.tick(0.7);e.paused=true;e.tick(0.71);e.paused=false;e.tick(0.72);e.world={_path:'/World/New'};e.tick(0.73);},
        e=>{e.first.action.ActivationRequirements.RequireTags=['ready'];e.tick(0.7);e.owner.asc.tags.add('ready');e.tick(0.8);
            e.owner.asc.tags.delete('ready');e.tick(0.82);e.tick(0.1);}
    ];
    for(const play of scenarios){const outputs=[];for(const source of [previous,mainSource]){
        const e=fixture(undefined,{mainSource:source});play(e);e.mod.stop();
        outputs.push(JSON.parse(JSON.stringify(e.audioEvents)));
    }assert.deepEqual(outputs[1],outputs[0]);}
});

function diagnosticBullet(e, directWarning = false) {
    const effectClass = {_path:'/SGameCombatSystem/Bullet/Event/BP_BulletEvent_Effect.BP_BulletEvent_Effect_C'};
    const effect = {_path:'/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Red_001.NS_AttackAlert_Red_001'};
    const event = {_path:'/Candidate/Bullet.Event',GetClass:()=>effectClass,Niagara:effect};
    const bullet = {_path:'/Candidate/Bullet',InitializeEvents:{Events:array([])},
        StartEvents:{Events:array([event])},PreAttackEvents:{Events:array([])}};
    if (!directWarning) e.first.action.NiagaraEffect = null;
    e.first.action['Bullet Data'] = bullet;
    return {bullet,event};
}
function candidateCatalog(e) {
    const body=e.files.get(e.saved+'pbzforewarn_resources.json');
    return body ? JSON.parse(body).entries.map(x=>x.data).filter(x=>x.bulletSignalCandidates) : [];
}
test('nested standard bullet warning is recorded as a candidate without cue or glyph promotion',()=>{
    const e=fixture('Diagnostics=1');diagnosticBullet(e);e.tick(0.7);e.tick(1.05,350);e.mod.stop();
    const entries=candidateCatalog(e);assert.equal(entries.length,1);
    const probe=entries[0].bulletSignalCandidates;
    assert.equal(probe.usedForScheduling,false);assert.equal(probe.candidates.length,1);
    assert.equal(probe.candidates[0].kind,'standard-warning-resource');
    assert.equal(probe.candidates[0].color,'red');assert.equal(probe.candidates[0].timing.coordinateConfirmed,false);
    assert.equal(e.cues().length,0);assert(e.hud.every(x=>x.active.length===0));
});
test('candidate diagnostics never add a second ordinary cue and preserve cancellation',()=>{
    const e=fixture('Diagnostics=1');diagnosticBullet(e,true);e.tick(0.7);assert.equal(e.cues().length,1);
    e.first.task.OnCancelled.Fire();e.tick(0.72);e.mod.stop();
    assert.equal(e.cues().length,1);assert.equal(e.cancels().length,1);
    assert.equal(candidateCatalog(e)[0].bulletSignalCandidates.usedForScheduling,false);
});
test('Diagnostics disabled never reads candidate bullet fields',()=>{
    const e=fixture(undefined,genericDisabledSettings({Diagnostics:false}));let reads=0;
    Object.defineProperty(e.first.action,'BulletData',{get(){reads++;throw Error('must not inspect');}});
    Object.defineProperty(e.first.action,'Bullet Data',{get(){reads++;throw Error('must not inspect');}});
    e.tick(0.7);e.tick(0.72,250);e.mod.stop();assert.equal(reads,0);assert.equal(e.cues().length,1);
    assert(!e.files.has(e.saved+'pbzforewarn_resources.json'));
});
test('transient unresolved bullet evidence retries without freezing the resource template',()=>{
    const e=fixture('Diagnostics=1');const {bullet}=diagnosticBullet(e);
    e.first.action['Bullet Data']={softPath:'/Candidate/NotLoaded'};
    e.tick(0.7);e.first.action['Bullet Data']=bullet;e.tick(0.72,2100);e.mod.stop();
    const entries=candidateCatalog(e);assert.equal(entries.length,1);
    assert.equal(entries[0].bulletSignalCandidates.unresolved,false);
    assert.equal(entries[0].bulletSignalCandidates.candidates[0].kind,'standard-warning-resource');
    assert.equal(e.cues().length,0);
});
test('unresolved candidate scans are spaced and capped without disabling ordinary cues',()=>{
    const e=fixture('Diagnostics=1');let reads=0;
    Object.defineProperty(e.first.action,'BulletData',{get(){reads++;return {softPath:'/Candidate/Unresolved'};}});
    e.tick(0.7);const first=reads;assert(first>0);
    for(let i=0;i<6;i++)e.tick(0.71,250);assert.equal(reads,first);
    for(let i=0;i<8;i++)e.tick(0.72,2100);const capped=reads;
    e.tick(0.73,2100);assert.equal(reads,capped);assert.equal(reads,first*5);
    e.mod.stop();assert.equal(e.cues().length,1);
    assert.equal(candidateCatalog(e)[0].bulletSignalCandidates.unresolved,true);
});

test('capture predicate survives bounded resource catalog serialization without hidden truncation',()=>{
    const e=fixture('Diagnostics=1');e.first.action.NiagaraEffect=null;
    const grab={_path:'/SGameExecution/GA/GA_ExecutedAbilityBase_Grab.GA_ExecutedAbilityBase_Grab_C'};
    const reaction={_path:'/Generic/Reaction.Reaction_C',GetSuperClass:()=>grab};
    const capture={_path:'/Generic/Bullet.Capture',GetClass:()=>({_path:'/SGameExecution/Bullet/Events/BP_BulletEvent_PlayExecution.BP_BulletEvent_PlayExecution_C'}),
        'Executed Ability':reaction};
    const filter={_path:'/Generic/Bullet.Filter',GetClass:()=>({_path:'/Script/SGameCombatSystem.BulletEvent_FilterEventActor'}),
        TagRequirement:{RequireTags:array([{TagName:'State.Required.ForCapture'}]),
            TagQuery:{QueryTokenStream:array([0,1,2])}},SubEvents:array([capture])};
    e.first.action.BulletData={_path:'/Generic/Bullet',InitializeEvents:{Events:array([])},
        StartEvents:{Events:array([])},PreAttackEvents:{Events:array([filter])}};
    e.tick(0.7);e.mod.stop();const entries=candidateCatalog(e);assert.equal(entries.length,1);
    const evidence=entries[0].bulletSignalCandidates;
    assert.equal(evidence.unresolved,false);assert.equal(evidence.candidates[0].kind,'execution-capability');
    const predicate=JSON.stringify(evidence.candidates[0].route[0].conditions);
    assert(predicate.includes('State.Required.ForCapture'),'persisted required capture tag');
    assert(predicate.includes('QueryTokenStream'),'persisted query token coordinates');
    const persisted=evidence.candidates[0].route[0].conditions.TagRequirement;
    assert.equal(persisted['/RequireTags/0/TagName'],'State.Required.ForCapture');
    assert.equal(persisted['/TagQuery/QueryTokenStream/0'],0);
    assert.equal(persisted['/TagQuery/QueryTokenStream/2'],2);
    assert(!predicate.includes('[depth-limit]'),'candidate predicate must not silently exceed catalog depth');
    assert.equal(e.cues().length,0);
});

function preparationRuntime(kind='standard') {
    const e=fixture('Diagnostics=1\nGenericAttack=1\nHooks=0\nObserveAttacks=0');
    if(kind==='standard') {
        diagnosticBullet(e);
        e.first.action.GetClass=()=>({_path:'/PBZDeflectSystem/Actions/GAA_DelayDeflectProjectileBullet.GAA_DelayDeflectProjectileBullet_C'});
    } else {
        const grab={_path:'/SGameExecution/GA/GA_ExecutedAbilityBase_Grab.GA_ExecutedAbilityBase_Grab_C'};
        const reactionClass={_path:'/Renamed/Reaction.Reaction_C',GetSuperClass:()=>grab};
        const execution={_path:'/Renamed/Execution',GetClass:()=>({_path:'/SGameExecution/Bullet/Events/BP_BulletEvent_PlayExecution.BP_BulletEvent_PlayExecution_C'}),
            'Executed Ability':reactionClass};
        e.first.action.NiagaraEffect=null;
        e.first.action.GetClass=()=>({_path:'/Script/PBZCombatAsset.LGAAction_DurationBulletWithDeflect'});
        e.first.action.DeflectBulletType=0;
        e.first.action.BulletData={_path:'/Renamed/Bullet',PreAttackEvents:{Events:array([execution])}};
        e.reactionClass=reactionClass;
        e.setReaction=active=>{
            const reaction={_path:'/Player/RenamedReaction',bIsActive:active,bIsAbilityEnding:false,
                GetAvatarActorFromActorInfo:()=>e.player,GetClass:()=>reactionClass,GetActivationCount:()=>1};
            e.player.AbilitySystemComponent.ActivatableAbilities.Items=array(active?
                [{ActiveCount:1,NonReplicatedInstances:array([reaction]),ReplicatedInstances:array([])}]:[]);
        };
    }
    return e;
}
function ordinaryFollowup(e, owner=e.owner, label='RenamedFollowup') {
    const {BLACK_ACTION_CLASS}=require('../PBZForewarn/attack-recognition');
    const t=e.addTask(owner,label,{start:1.55,duration:0.3,actionClass:BLACK_ACTION_CLASS,effectName:'NS_AttackAlert_Post_001'});
    owner.ability.tasks=[t.task];owner.ability.ActiveTasks=array(owner.ability.tasks);
    t.task.CurrentTime=1.3;return t;
}
test('generic preparation standard resource cues and cancels through the existing pipeline',()=>{
    const e=preparationRuntime();e.tick(0.7);assert.equal(e.cues().length,1);
    assert.equal(e.cues()[0].color,'red');assert(e.logs.some(x=>x.includes('bullet-preparation')));
    e.first.task.OnCancelled.Fire();e.tick(0.72);assert.equal(e.cancels().length,1);e.mod.stop();
});
test('generic grab preparation is black and independent of enemy and ability names',()=>{
    const e=preparationRuntime('grab');e.tick(0.7);assert.equal(e.cues().length,1);
    assert.equal(e.cues()[0].color,'black');e.mod.stop();
});
test('generic reaction matching consumes a later ordinary black cue without release backfill',()=>{
    const e=preparationRuntime('grab');e.tick(0.7);e.first.task.OnCompleted.Fire();
    const t=ordinaryFollowup(e);e.setReaction(true);e.tick(undefined,250);
    assert.equal(e.cues().length,1);e.setReaction(false);t.task.CurrentTime=1.35;e.tick(undefined,32);
    assert.equal(e.cues().length,1);e.mod.stop();
    const d=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(d.stats.grabFollowupsDiscarded,1);
});
test('a different enemy without matching capability keeps its independent black warning',()=>{
    const e=preparationRuntime('grab');e.tick(0.7);e.setReaction(true);
    ordinaryFollowup(e,e.addEnemy('Independent'),'independent');e.tick(undefined,250);
    assert.equal(e.cues().length,2);e.mod.stop();
});
test('missing current player reaction preserves ordinary followup fallback',()=>{
    const e=preparationRuntime('grab');e.tick(0.7);e.first.task.OnCompleted.Fire();
    ordinaryFollowup(e);e.tick(undefined,250);assert.equal(e.cues().length,2);e.mod.stop();
});
test('generic preparation runs with diagnostics and hooks disabled',()=>{
    const e=preparationRuntime();e.menuSave({GenericAttack:true,Diagnostics:false,Hooks:false,ObserveAttacks:false});
    e.tick(0.7,600);assert.equal(e.cues().length,1);e.mod.stop();
});
test('hidden generic preparation can be enabled live and disabling cancels without replay',()=>{
    const e=fixture(undefined,genericDisabledSettings());diagnosticBullet(e);
    e.first.action.GetClass=()=>({_path:'/PBZDeflectSystem/Actions/GAA_DelayDeflectProjectileBullet.GAA_DelayDeflectProjectileBullet_C'});
    e.tick(0.1);assert.equal(e.cues().length,0);e.menuSave({GenericAttack:true},1);e.tick(0.7,600);
    assert.equal(e.cues().length,1);const id=e.cues()[0].id;
    e.menuSave({GenericAttack:false},2);e.tick(0.72,600);assert(e.cancels().some(x=>x.id===id));
    e.menuSave({GenericAttack:true},3);e.tick(0.73,600);assert.equal(e.cues().length,1);e.mod.stop();
});
test('generic source tag loss or selected bullet change prevents cue execution',()=>{
    for(const mutate of [e=>e.first.action.ActivationRequirements.RequireTags=['Absent'],e=>e.first.action['Bullet Data']={_path:'/Other/Bullet'}]){
        const e=preparationRuntime();e.tick(0.1);mutate(e);e.tick(0.7,16);
        assert.equal(e.cues().length,0);e.mod.stop();
    }
});
test('cached grab capability never reads requirements from an invalidated source action',()=>{
    const e=preparationRuntime('grab');e.tick(0.1);let reads=0;
    e.first.action.bValid=false;
    Object.defineProperty(e.first.action,'ActivationRequirements',{get(){reads++;throw Error('invalid native action');}});
    e.tick(0.2,16);assert.equal(reads,0);assert.equal(e.cues().length,0);e.mod.stop();
});
test('two possible source abilities with the same reaction class preserve both black warnings',()=>{
    const e=preparationRuntime('grab');const other=e.addEnemy('Ambiguous');
    const extra=e.addTask(other,'capability');extra.action.NiagaraEffect=null;
    extra.action.GetClass=e.first.action.GetClass;extra.action.DeflectBulletType=0;extra.action.BulletData=e.first.action.BulletData;
    extra.task.CurrentTime=0.7;e.tick(0.7);assert.equal(e.cues().length,2);
    e.first.task.OnCompleted.Fire();extra.task.OnCompleted.Fire();e.setReaction(true);
    ordinaryFollowup(e);ordinaryFollowup(e,other,'ambiguousfollow');e.tick(undefined,250);
    assert.equal(e.cues().length,4);e.mod.stop();
});
test('a new source activation cannot inherit the previous grab capability',()=>{
    const e=preparationRuntime('grab');e.tick(0.7);e.first.task.OnCompleted.Fire();
    e.owner.ability.activation++;e.setReaction(true);ordinaryFollowup(e);e.tick(undefined,250);
    assert.equal(e.cues().length,2);e.mod.stop();
});
test('reaction match cancels an already fired ordinary black tail exactly once',()=>{
    const e=preparationRuntime('grab');e.tick(0.7);e.first.task.OnCompleted.Fire();
    const t=ordinaryFollowup(e);e.tick(undefined,250);const id=e.cues()[1].id;
    e.setReaction(true);t.task.CurrentTime=1.9;e.tick(undefined,32);e.tick(undefined,32);
    assert.equal(e.cancels().filter(x=>x.id===id).length,1);e.mod.stop();
});
test('failed live source requirements cannot be restored from cached capability events',()=>{
    for(const delta of [16,250]){
        const e=preparationRuntime('grab');e.tick(0.1);
        e.first.action.ActivationRequirements.RequireTags=['Missing.Source.Tag'];
        e.setReaction(true);ordinaryFollowup(e);e.tick(undefined,delta);e.tick(undefined,250);
        assert.equal(e.cues().length,1);e.mod.stop();
    }
});
test('a stale record activation cannot authorize black suppression before rediscovery',()=>{
    const e=preparationRuntime('grab');e.tick(0.1);e.owner.ability.activation++;
    e.setReaction(true);ordinaryFollowup(e);e.tick(undefined,16);e.tick(undefined,250);
    assert.equal(e.cues().length,1);e.mod.stop();
});
test('role-layer grab capability cannot suppress a timeline owner black warning',()=>{
    const e=preparationRuntime('grab'), original=e.first.event;
    const role=e.addEnemy('RoleActor');e.first.timeline.Actions=array([]);
    e.first.timeline.RoleLayers=array([{RoleName:'OtherActor',Actions:array([original])}]);
    e.first.task.GetRoleActor=()=>role.enemy;e.tick(0.1);e.first.task.OnCompleted.Fire();
    ordinaryFollowup(e);e.setReaction(true);e.tick(undefined,250);
    assert.equal(e.cues().length,1);e.mod.stop();
});
function continuationGrab(e) {
    const ability={...e.owner.ability,_path:e.owner.enemy._path+'.RenamedContinuation_C_2',activation:2,bIsActive:true,bIsAbilityEnding:false,tasks:[]};
    const owner={...e.owner,ability};const t=e.addTask(owner,'continuationgrab');
    t.timeline._path=ability._path+'.Main';
    t.action.NiagaraEffect=null;t.action.GetClass=e.first.action.GetClass;
    t.action.DeflectBulletType=0;t.action.BulletData=e.first.action.BulletData;
    ability.tasks=[t.task];ability.ActiveTasks=array(ability.tasks);
    return {owner,t,activate(){e.owner.asc.ActivatableAbilities.Items=array([
        {ActiveCount:1,NonReplicatedInstances:array([ability]),ReplicatedInstances:array([])}]);
        t.task.CurrentTime=0.7;e.tick(undefined,250);}};
}
test('one delivered preparation consumes both generic continuation and ordinary Success without needing player grab state',()=>{
    const e=preparationRuntime('grab');e.tick(0.7);assert.equal(e.cues().length,1);
    e.first.task.CurrentTime=1.41;e.tick(undefined,32);e.first.task.OnCompleted.Fire();
    e.owner.ability.bIsActive=false;
    const next=continuationGrab(e);next.activate();assert.equal(e.cues().length,1);
    next.t.task.OnCancelled.Fire();
    const success=ordinaryFollowup(e,next.owner,'continuationsuccess');success.timeline._path=next.owner.ability._path+'.Success';e.tick(undefined,250);
    assert.equal(e.cues().length,1);e.tick(undefined,250);assert.equal(e.cues().length,1);e.mod.stop();
    const d=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(d.stats.grabFollowupsDiscarded,2);
});
test('a delivered grab cycle keeps Success silent after compact recompiles with diagnostics on or off',()=>{
    // Real dev.4 Success was observed 513/555 ms before its extra cue, crossing
    // the 200 ms compile boundary; the earlier test first saw it already due.
    for(const diagnostics of [true,false]) {
        const e=preparationRuntime('grab');
        if(!diagnostics) { e.menuSave({GenericAttack:true,Diagnostics:false});e.tick(0,501); }
        e.tick(0.7);assert.equal(e.cues().length,1);
        e.first.task.CurrentTime=1.41;e.tick(undefined,32);e.first.task.OnCompleted.Fire();e.owner.ability.bIsActive=false;
        const next=continuationGrab(e);next.activate();assert.equal(e.cues().length,1);
        next.t.task.OnCancelled.Fire();
        const success=ordinaryFollowup(e,next.owner,'delayed-success');success.timeline._path=next.owner.ability._path+'.Success';
        success.task.CurrentTime=0.09;e.tick(undefined,250);
        success.task.CurrentTime=0.4;e.tick(undefined,250);
        success.task.CurrentTime=1.3;e.tick(undefined,263);
        assert.equal(e.cues().length,1,'no delivered Success after recompile; Diagnostics='+diagnostics);
        success.task.CurrentTime=1.4;e.tick(undefined,250);
        assert.equal(e.cues().length,1,'suppressed Success cannot backfill');e.mod.stop();
    }
});
test('a different continuation branch keeps its independent ordinary black cue',()=>{
    const e=preparationRuntime('grab');e.tick(0.7);
    e.first.task.CurrentTime=1.41;e.tick(undefined,32);e.first.task.OnCompleted.Fire();e.owner.ability.bIsActive=false;
    const next=continuationGrab(e);next.activate();assert.equal(e.cues().length,1);
    next.t.task.OnCancelled.Fire();ordinaryFollowup(e,next.owner,'independentbranch');e.tick(undefined,250);
    assert.equal(e.cues().length,2);e.mod.stop();
});
test('an expired ended root cannot swallow a later matching-payload ability',()=>{
    const e=preparationRuntime('grab');e.tick(0.7);
    e.first.task.CurrentTime=1.41;e.tick(undefined,32);e.first.task.OnCompleted.Fire();e.owner.ability.bIsActive=false;
    e.tick(undefined,250);e.tick(undefined,1200);
    const next=continuationGrab(e);next.activate();assert.equal(e.cues().length,2);e.mod.stop();
});
test('a new root activation can warn after the previous grab chain',()=>{
    const e=preparationRuntime('grab');e.tick(0.7);e.first.task.CurrentTime=1.41;e.tick(undefined,32);
    e.first.task.OnCompleted.Fire();e.owner.ability.bIsActive=false;
    const next=continuationGrab(e);next.activate();next.owner.ability.bIsActive=false;
    e.owner.ability.bIsActive=true;e.owner.ability.activation++;
    e.owner.ability.tasks=[e.first.task];e.owner.ability.ActiveTasks=array([e.first.task]);
    e.owner.asc.ActivatableAbilities.Items=array([{ActiveCount:1,NonReplicatedInstances:array([e.owner.ability]),ReplicatedInstances:array([])}]);
    e.tick(0,250);e.tick(0.7,250);assert.equal(e.cues().length,2);e.mod.stop();
});
test('a failed first delivery cannot swallow the continuation fallback',()=>{
    const e=preparationRuntime('grab');e.failUI=true;e.tick(0.7);assert.equal(e.cues().length,1);
    e.first.task.CurrentTime=1.41;e.tick(undefined,32);e.first.task.OnCompleted.Fire();e.owner.ability.bIsActive=false;
    e.failUI=false;const next=continuationGrab(e);next.activate();assert.equal(e.cues().length,2);e.mod.stop();
});
test('a root glyph delivered on a later active tick still authorizes its followup cycle',()=>{
    const e=preparationRuntime('grab');e.failUI=true;e.tick(0.7);e.failUI=false;e.tick(0.72,16);
    assert(e.hud.at(-1).active.some(x=>x.id===e.cues()[0].id));
    e.first.task.CurrentTime=1.41;e.tick(undefined,32);e.first.task.OnCompleted.Fire();e.owner.ability.bIsActive=false;
    const next=continuationGrab(e);next.activate();assert.equal(e.cues().length,1);e.mod.stop();
});
test('fresh recovered source tags suppress the continuation without waiting for recompile',()=>{
    const e=preparationRuntime('grab');e.tick(0.7);e.first.task.CurrentTime=1.41;e.tick(undefined,32);
    e.first.task.OnCompleted.Fire();e.owner.ability.bIsActive=false;const next=continuationGrab(e);
    next.t.action.ActivationRequirements.RequireTags=['Recovered.Tag'];next.activate();
    e.owner.asc.tags.add('Recovered.Tag');next.t.task.CurrentTime=0.8;e.tick(undefined,32);
    assert.equal(e.cues().length,1);e.mod.stop();
});
test('runtime-error suspension clears delivered-cycle authorization',()=>{
    const e=preparationRuntime('grab');e.tick(0.7);e.first.task.CurrentTime=1.41;e.tick(undefined,32);
    e.failClock=true;e.tick(undefined,16);e.failClock=false;
    e.first.task.OnCompleted.Fire();e.owner.ability.bIsActive=false;const next=continuationGrab(e);
    next.activate();assert.equal(e.cues().length,2);e.mod.stop();
});
console.log('Runtime integration: ' + passed + ' tests passed. Unreal APIs are mocked; no in-game claim.');
