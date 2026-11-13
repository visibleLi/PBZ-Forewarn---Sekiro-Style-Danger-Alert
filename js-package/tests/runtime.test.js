'use strict';
// Runs the actual main + adapter + scheduler in a mocked Puerts environment.
// No game, files outside this process, timers, UI, or audio are started.
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
function fixture(config, startup = {}) {
    const env = { wall: 1800000000000, game: 0, paused: false, files: new Map(), logs: [], timers: new Map(),
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
    if (config !== undefined) env.files.set(saved + 'PBZForewarn.txt', config);
    const UE = {
        KismetSystemLibrary: { IsValid: x => !!(x && x._path && x.bValid !== false), GetPathName: x => x._path,
            Conv_SoftObjectReferenceToString: x => x.softPath || '',
            GetGameTimeInSeconds: () => { if (env.failClock) throw Error('clock unavailable'); return env.nanClock ? NaN : env.game; } },
        BlueprintPathsLibrary: { ProjectSavedDir: () => saved, ProjectContentDir: () => 'D:/Mock/ProjectPBZ/Content/', ConvertRelativePathToFull: p => p, FileExists: p => env.files.has(p) },
        EasyCsv: { LoadStringFromLocalFile(p, ref) { ref.value = env.files.get(p) || ''; return env.files.has(p); },
            SaveStringToFileWithFullPath(body, p) { if (env.failWrite && p.endsWith('_diagnostics.json') || env.failObservationWrite && p.endsWith('_observations.json')) return false; env.files.set(p, body); return true; } },
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
    }, dispose() { env.disposed = (env.disposed || 0) + 1; } }) };
    const nativeAudio = { createNativeAudio: (ue, a, settings, diag, options) => {
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
        './observation-store': startup.badStore ? {createObservationStore(){throw Error('optional store failed');}} : require('../PBZForewarn/observation-store'),
        './native-attack-observer': require('../PBZForewarn/native-attack-observer'),
        './timeline-observation': require('../PBZForewarn/timeline-observation'),
        './audio-environment': { createAudioEnvironmentProbe: () => () => ({ status: 'mock' }) } })[name]; }, exports: {}, console: { log: s => env.logs.push(s) }, Date: Clock,
        setInterval: (fn, ms) => { const id = ++env.nextTimer; env.timers.set(id, { fn, ms }); return id; },
        clearInterval: id => env.timers.delete(id) });
    vm.runInContext(mainSource, context, { filename: 'PBZForewarn/main.js' });
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

test('startup configures native audio without writing an external audio bus', () => {
    const e = fixture(); assert.equal(e.bus().seq, 0); assert.equal(e.bus().paused, true);
    assert(e.files.get(e.saved + 'PBZForewarn.txt').includes('LeadMs=350')); assert.equal(e.timers.size, 1);
    assert.equal([...e.timers.values()][0].ms, 16); assert(![...e.files.keys()].some(p => p.endsWith('_bus.json')));
    assert.equal(e.bankPath, 'D:/Mock/ProjectPBZ/Content/PBZForewarn/PBZForewarn.bnk');
    assert.equal(e.bankRelativePath, 'PBZForewarn/PBZForewarn.bnk'); assert.equal(e.bankConfig.eventId, 1682749338); e.mod.stop();
});
test('settings preserve existing file and clamp supported numeric values', () => {
    const body = 'LeadMs=9000\nGlyphOn=false\nHooks=0\nTickMs=1\nGlyphY=0.4'; const e = fixture(body);
    const settings = e.mod.parseSettings(body); assert.equal(settings.LeadMs, 1000); assert.equal(settings.TickMs, 16);
    assert.equal(settings.GlyphOn, false); assert.equal(settings.Hooks, false); assert.equal(e.files.get(e.saved + 'PBZForewarn.txt'), body); e.mod.stop();
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
    const e = fixture(); const owner = e.addEnemy('Hinted', false); const t = e.addTask(owner, 'hinted'); t.task.CurrentTime = 0.7;
    e.files.set(e.saved + 'pbzforewarn_hooks.json', '{broken'); e.tick(0); assert.equal(e.cues().length, 0);
    e.files.set(e.saved + 'pbzforewarn_hooks.json', JSON.stringify({ version: 1, session: 'hooks', active: true,
        heartbeat: e.wall, hints: [{ seq: 1, at: e.wall, ability: owner.ability._path, actor: owner.enemy._path }] }));
    e.tick(0.064, 64); assert.equal(e.cues().length, 1); e.mod.stop();
    assert(JSON.parse(e.files.get(e.saved + 'pbzforewarn_diagnostics.json')).activity.some(x => x.kind === 'hook-hint'));
});
test('invalidated hook snapshots do not keep reporting a living bridge', () => {
    const e = fixture(); const p = e.saved + 'pbzforewarn_hooks.json'; e.files.set(p, JSON.stringify({ version: 1, session: 'hooks', active: true, heartbeat: e.wall, hints: [] }));
    e.tick(0); e.files.set(p, '{partial'); e.tick(0.064, 64); e.mod.stop();
    assert.equal(JSON.parse(e.files.get(e.saved + 'pbzforewarn_diagnostics.json')).hookBridgeAlive, false);
});
test('native start hint directly tracks an active task absent from every ASC list', () => {
    const e = fixture(); e.owner.asc.ActivatableAbilities.Items = array([]); e.owner.ability.tasks.length = 0;
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
    const e = fixture(); e.first.action.NiagaraEffect = { _path: '/PBZVFXPack/VFX/BattleFX/Common/NS_Special_001' };
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
    const e = fixture(); const roleOwner = e.addEnemy('Role'); e.first.timeline.Actions = array([]);
    e.first.timeline.RoleLayers = array([{ RoleName: 'Partner', Actions: array([e.first.event]) }]);
    e.first.action.ActivationRequirements.RequireTags = ['ready']; e.owner.asc.tags.add('ready');
    e.first.task.GetRoleActor = () => roleOwner.enemy;
    e.tick(0.66); assert.equal(e.cues().length, 0); roleOwner.asc.tags.add('ready'); roleOwner.enemy.friendly = true;
    e.tick(0.68); assert.equal(e.cues().length, 0); roleOwner.enemy.friendly = false;
    e.tick(0.70); assert.equal(e.cues().length, 1); e.mod.stop();
    const u = fixture(); u.first.timeline.Actions = array([]);
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
    const e = fixture(); e.failWrite = true; e.tick(0.7, 5010); assert.equal(e.cues().length, 1);
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
    const e=fixture(); e.tick(0.7); const cueId=e.cues()[0].id;
    e.first.task.OnCancelled.Fire(); e.tick(0.72); e.tick(0.74); e.mod.stop();
    const report=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(e.cancels().filter(x=>x.id===cueId).length,1); assert.equal(report.stats.cancels,1);
    assert(report.stats.duplicateCancelsSuppressed>0);
    const cancel=report.recent.find(x=>x.kind==='CANCEL' && x.id===cueId);
    assert.equal(cancel.termination.source,'explicit-cancel'); assert.equal(cancel.termination.taskValid,true);
    assert.equal(cancel.termination.playerHitCauseVerified,false);
});

test('editor preview condition is counted as inactive instead of a missed attack', () => {
    const e=fixture(); e.first.action.ActivationRequirements.RequireTags=['CharacterState.EditorDebug.Preview'];
    e.tick(0.7); e.tick(1.2,500); e.mod.stop();
    const report=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(e.cues().length,0); assert.equal(report.stats.missed,0);
    assert.equal(report.stats.conditionsNotMet,1); assert.equal(report.stats.previewOnlySkipped,1);
    assert(report.recent.some(x=>x.kind==='condition-not-met' && x.reason==='editor-preview-only'));
});

test('diagnostics off skips deep sampling but keeps identical warning identity and withdrawal', () => {
    const e=fixture('Diagnostics=0'); let semanticReads=0, evidenceReads=0;
    Object.defineProperty(e.first.action,'DeflectBulletType',{get(){semanticReads++; return 3;}});
    e.first.action.GetAbilitySystemComponent=()=>{evidenceReads++; return e.owner.asc;};
    e.tick(0.7); assert.equal(e.cues().length,1); e.first.task.OnCancelled.Fire(); e.tick(0.72); e.mod.stop();
    assert.equal(semanticReads,0); assert.equal(evidenceReads,0);
    const report=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert(report.recent.some(x=>x.kind==='CUE')); assert(report.recent.some(x=>x.kind==='CANCEL'));
    assert.equal(report.activity.length,0); assert.equal(report.resourceCatalog.count,0);
    assert(!e.files.has(e.saved+'pbzforewarn_resources.json'));
});

test('repeated resources do not inflate catalog or push early fight events out of history', () => {
    const e=fixture();
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
    const e=fixture(), entries=[e.first.event];
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
    const e=fixture(); e.files.set(e.saved+'pbzforewarn_hooks.json',JSON.stringify({version:1,session:'lua-new',active:true,
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
        const e=fixture('ObserveAttacks='+(enabled?'1':'0')); provideNativeFrame(e);
        e.tick(0.3);e.tick(0.7);e.first.task.OnCancelled.Fire();e.tick(0.71);e.mod.stop();
        results.push(e.audioEvents.map(x=>({kind:x.kind,id:x.id,color:x.color,reason:x.reason})));
    }
    assert.deepEqual(results[0],results[1]);
});
test('native observations are persisted but cannot generate an unsupported warning',()=>{
    const e=fixture();provideNativeFrame(e);
    e.first.action.NiagaraEffect={_path:'/Unknown/OrdinaryEffect'};
    e.tick(0.7);e.mod.stop();const report=observations(e);
    assert.equal(e.cues().length,0);assert(report.events.some(x=>x.kind==='native-frame'&&x.typeName==='RedEye'));
    assert(report.events.some(x=>x.kind==='attack-plan'));assert.equal(report.mode,'observe-only');
});
test('same resource in another activation has another observation identity',()=>{
    const e=fixture();provideNativeFrame(e);e.tick(0.1);
    e.owner.ability.activation++;e.tick(0.1,250);e.mod.stop();
    const plans=observations(e).events.filter(x=>x.kind==='attack-plan');
    assert.equal(new Set(plans.map(x=>x.activation)).size,2);
});
test('unchanged action snapshots do not record every compile progress update',()=>{
    const e=fixture();provideNativeFrame(e);e.tick(0.1);e.tick(0.2,250);e.tick(0.3,250);e.mod.stop();
    const report=observations(e);
    assert.equal(report.events.filter(x=>x.kind==='attack-plan').length,1);
    assert.equal(report.events.filter(x=>x.kind==='warning-plan').length,1);
});
test('observation file write failure leaves cues and audio running',()=>{
    const e=fixture();e.failObservationWrite=true;e.tick(0.7);e.tick(0.8,5100);e.mod.stop();
    assert.equal(e.cues().length,1);const report=JSON.parse(e.files.get(e.saved+'pbzforewarn_diagnostics.json'));
    assert.equal(report.stats.errors,0);assert(report.flush.observationWriteFailures>0);
    assert(report.recent.some(x=>x.kind==='observation-write-error'));
});
test('diagnostics off disables all optional observation reads and files',()=>{
    const e=fixture('Diagnostics=0');let reads=0;
    Object.defineProperty(e.player,'GetComponentByClass',{get(){reads++;throw Error('must not read');}});
    e.tick(0.7);e.mod.stop();assert.equal(reads,0);assert.equal(e.cues().length,1);
    assert(!e.files.has(e.saved+'pbzforewarn_observations.json'));
});
test('Lua observations preserve callback clock and never use import player as capture identity',()=>{
    const e=fixture();e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify({schemaVersion:1,
        session:'observer-lua',seq:1,active:true,heartbeat:e.wall,events:[{seq:1,kind:'timeline-call',phase:'pre',
            callId:1,gameTime:{status:'read',value:42,source:'GameplayStatics.GetTimeSeconds'},
            context:{world:'/World/A',ability:'/Ability',actor:'/Enemy',task:'/Task'},params:{StartTimeSeconds:{status:'read',value:2.88}}}]}));
    e.tick(0.7);e.mod.stop();const entry=observations(e).events.find(x=>x.kind==='timeline-call');
    assert.equal(entry.capture.gameTime.value,42);assert.equal(entry.player,null);assert.equal(entry.gameTime,null);
    assert.equal(entry.importedPlayer,'/Player');assert.equal(entry.captureWorldMatchesImportedWorld,true);
    assert.equal(entry.capture.params.StartTimeSeconds.value,2.88);assert.equal(e.cues().length,1);
});
test('stale Lua observation snapshots cannot impersonate current calls',()=>{
    const e=fixture();e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify({schemaVersion:1,
        session:'old',seq:1,active:true,heartbeat:e.wall-5000,events:[{seq:1,kind:'warning-call',phase:'call'}]}));
    e.tick(0.7);e.mod.stop();assert(!observations(e).events.some(x=>x.kind==='native-warning-call'));
    assert(observations(e).events.some(x=>x.status==='snapshot-inactive-or-stale'));
});
test('Lua snapshot sequence gaps are explicit and repeated imports do not duplicate calls',()=>{
    const e=fixture();e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify({schemaVersion:1,
        session:'gap',seq:8,active:true,heartbeat:e.wall,events:[{seq:8,kind:'warning-call',phase:'call',context:{world:'/Other'}}]}));
    e.tick(0.1);e.tick(0.2,100);e.mod.stop();const report=observations(e);
    assert.equal(report.events.filter(x=>x.kind==='native-warning-call').length,1);
    assert(report.events.some(x=>x.kind==='observer-hook-gap'&&x.actual===8));
    assert.equal(report.events.find(x=>x.kind==='native-warning-call').captureWorldMatchesImportedWorld,false);
});
test('clock rewind increments observation epoch before native records are reused',()=>{
    const e=fixture();provideNativeFrame(e);e.game=2;e.tick(0.1);e.game=0;e.tick(0.2);e.mod.stop();
    const frames=observations(e).events.filter(x=>x.kind==='native-frame');
    assert.equal(new Set(frames.map(x=>x.clockEpoch)).size,2);
    assert(observations(e).events.some(x=>x.kind==='observer-reset'&&x.reason==='game-clock-rewind'));
});

test('missing optional observation modules leave baseline cues operational',()=>{
    for(const name of ['./observation-store','./native-attack-observer','./timeline-observation']) {
        const e=fixture(undefined,{missingModule:name});e.tick(0.7);e.mod.stop();
        assert.equal(e.cues().length,1);assert(!e.files.has(e.saved+'pbzforewarn_observations.json'));
        assert(e.diagnostics().some(x=>x.includes('observation-unavailable')));
    }
});
test('disabled observations do not even require missing optional files',()=>{
    const e=fixture('ObserveAttacks=0',{missingModule:'./observation-store'});e.tick(0.7);e.mod.stop();
    assert.equal(e.cues().length,1);assert(!e.diagnostics().some(x=>x.includes('observation-unavailable')));
});
test('observer store construction failure cannot stop cue startup',()=>{
    const e=fixture(undefined,{badStore:true});e.tick(0.7);e.mod.stop();assert.equal(e.cues().length,1);
});
test('invalid Lua rows cannot advance cursor past valid observations',()=>{
    const e=fixture();e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify({schemaVersion:1,
        session:'reject',seq:1,active:true,heartbeat:e.wall,events:[
            {seq:999999,kind:'timeline-call',phase:'pre'},
            {seq:1,kind:'not-a-call',phase:'post'},
            {seq:1,kind:'timeline-call',phase:'post',context:{world:'/World/A'}}]}));
    e.tick(0.7);e.mod.stop();const report=observations(e);
    assert.equal(report.events.filter(x=>x.kind==='timeline-call').length,1);
    assert.equal(report.hookImport.lastSeq,1);assert.equal(report.hookImport.rejectedRows,2);
});
test('Lua structured activation stays in capture and is not promoted to identity',()=>{
    const e=fixture();e.files.set(e.saved+'pbzforewarn_observer_hooks.json',JSON.stringify({schemaVersion:1,
        session:'abi',seq:1,active:true,heartbeat:e.wall,events:[{seq:1,kind:'timeline-call',phase:'pre',
            context:{world:'/World/A',activation:{status:'read',value:7}}}]}));
    e.tick(0.7);e.mod.stop();const entry=observations(e).events.find(x=>x.kind==='timeline-call');
    assert.equal(entry.activation,null);assert.equal(entry.capture.context.activation.value,7);
});
test('global observation sampling rotates tasks and exposes deferrals without withholding cues',()=>{
    const e=fixture();provideNativeFrame(e);
    const other=e.addEnemy('Other'),second=e.addTask(other,'other');second.action.DeflectBulletType=2;
    second.task.CurrentTime=0.7;e.tick(0.7);assert.equal(e.cues().length,2);
    e.tick(0.71);e.mod.stop();const report=observations(e);
    assert(report.sampling.deferredTaskSamples>=1);assert.equal(report.sampling.maxTimelineTasksPerTick,1);
    assert(report.events.some(x=>x.kind==='attack-plan'&&x.actor==='/Enemy'));
    assert(report.events.some(x=>x.kind==='attack-plan'&&x.actor==='/Other'));
});

console.log('Runtime integration: ' + passed + ' tests passed. Unreal APIs are mocked; no in-game claim.');
