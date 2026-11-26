'use strict';
// Retrospective regression at the user-confirmed native-output boundary.
// All MOD modules are real. Only UE/Puerts/cpp, clocks, timers and files are fake.
// The external shapes follow reflected AkAudio/Engine/UMG/Slate/Wwise declarations;
// they do not certify native calls, GC/thread safety, rendered pixels or audibility.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// Test-only selection also runs this exact test against unchanged installer JS.
const runtimeDir = path.resolve(process.env.PBZ_TEST_RUNTIME_DIR || path.join(__dirname, '../PBZForewarn'));
const BLACK_ACTION = '/PBZCombatAsset/Prototypes/Actions/GAAction_PowerAttackParticle.GAAction_PowerAttackParticle_C';
const BLACK_EFFECT = '/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Post_001.NS_AttackAlert_Post_001';
const GRAB = '/SGameExecution/GA/GA_ExecutedAbilityBase_Grab.GA_ExecutedAbilityBase_Grab_C';
const DURATION = '/Script/PBZCombatAsset.LGAAction_DurationBulletWithDeflect';
const EXECUTION = '/SGameExecution/Bullet/Events/BP_BulletEvent_PlayExecution.BP_BulletEvent_PlayExecution_C';

class NativeArray {
    constructor(values = []) { this.values = [...values]; }
    Num() { return this.values.length; }
    Get(index) { assert(Number.isInteger(index) && index >= 0 && index < this.Num()); return this.values[index]; }
    Empty() { this.values.length = 0; }
    Add(value) { this.values.push(value); }
}
class NativeMap {
    constructor() { this.values = new Map(); }
    Num() { return this.values.size; }
    Get(key) { return this.values.get(key); }
    Empty() { this.values.clear(); }
    Add(key, value) { this.values.set(key, value); }
}
function delegate() {
    const listeners = new Set();
    return { Add(fn) { assert.equal(typeof fn, 'function'); listeners.add(fn); },
        Remove(fn) { listeners.delete(fn); }, fire(...args) { for (const fn of [...listeners]) fn(...args); } };
}
function fixture(diagnostics, settings = {}) {
    const e = { wall: 1800000000000, game: 0, files: new Map(), logs: [], timers: new Set(), objects: new Map(),
        acceptedPosts: [], glyphShows: [], overlay: null };
    function object(name, values = {}) { const o = Object.assign({ _path: name, valid: true }, values); e.objects.set(name, o); return o; }
    const valid = o => !!o && e.objects.get(o._path) === o && o.valid === true;
    const cls = name => object('/Script/' + name);
    const world = object('/Fixture/World'), gi = object('/Fixture/GameInstance');
    const pc = object('/Fixture/Controller', { GetWorld: () => world, IsInputKeyDown: key => { assert.equal(typeof key.KeyName, 'string'); return false; } });
    function asc(name) { return object(name, { tags: new Set(), ActivatableAbilities: { Items: new NativeArray() },
        TickingTasks: new NativeArray(), KnownTasks: new NativeArray(), HasMatchingGameplayTag(tag) { return this.tags.has(tag.TagName); } }); }
    const player = object('/Fixture/Player', { AbilitySystemComponent: asc('/Fixture/Player/ASC'), GetWorld: () => world });
    const enemy = object('/Fixture/Attacker', { AbilitySystemComponent: asc('/Fixture/Attacker/ASC'), IsPlayerControlled: () => false,
        GetDistanceTo(who) { assert.equal(who, player); return 1000; } });
    e.ability = function (name, activation) {
        return object(enemy._path + '.' + name, { bIsActive: true, bIsAbilityEnding: false, ActiveTasks: new NativeArray(),
            GetActivationCount: () => activation, GetAvatarActorFromActorInfo: () => enemy,
            GetPlayTimelineTask() { return this.ActiveTasks.Num() ? this.ActiveTasks.Get(0) : null; } });
    };
    const grabClass = object(GRAB), reactionClass = object('/Fixture/Reaction.Reaction_C', { GetSuperClass: () => grabClass });
    const executionClass = object(EXECUTION), actionClass = object(DURATION), blackClass = object(BLACK_ACTION);
    const execution = object('/Fixture/Bullet.Capture', { GetClass: () => executionClass, 'Executed Ability': reactionClass });
    const bullet = object('/Fixture/Bullet', { PreAttackEvents: { Events: new NativeArray([execution]) } });
    e.task = function (ability, branch, ordinary = false) {
        const timelinePath = ability._path + '.' + branch;
        const action = object(timelinePath + '.Action', { GetClass: () => ordinary ? blackClass : actionClass,
            NiagaraEffect: ordinary ? object(BLACK_EFFECT) : null, DeflectBulletType: 0, BulletData: ordinary ? null : bullet,
            ActivationRequirements: { RequireTags: [], IgnoreTags: [], TagQuery: { empty: true } } });
        const event = Object.freeze({ Action: action, StartTime: ordinary ? 1.55 : 1, duration: ordinary ? 0.3 : 0.4,
            TriggerTimeOffset: 0, EndTriggerTimeOffset: 0 });
        const timeline = object(timelinePath, { Actions: new NativeArray([event]), RoleLayers: new NativeArray() });
        return object(timelinePath + '.Task', { Ability: ability, Timeline: timeline, CurrentTime: 0,
            OnCompleted: delegate(), OnCancelled: delegate(), GetRoleActor: () => null });
    };
    e.lifecycleTask = function (ability) {
        const task = e.task(ability, 'Main'), action = task.Timeline.Actions.Get(0).Action;
        const type = object('/PBZDeflectSystem/Actions/GAA_DelayDeflectProjectileBullet.GAA_DelayDeflectProjectileBullet_C');
        const dataType = object('/PBZCombatAsset/Prototypes/Bullet/BulletData/BP_PBZ_OverlapBulletData.BP_PBZ_OverlapBulletData_C');
        action.GetClass = () => type;
        action.BulletData = object(task._path + '.Data', { GetClass: () => dataType, StartDelay: 0.7,
            EffectData: { ParticleData: new NativeArray([{ ActivateMoment: 1,
                Particle: object('/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Red_001.NS_AttackAlert_Red_001') }]) } });
        return task;
    };
    e.select = function (ability, task) {
        ability.ActiveTasks = new NativeArray([task]);
        enemy.AbilitySystemComponent.ActivatableAbilities.Items = new NativeArray([
            { ActiveCount: 1, NonReplicatedInstances: new NativeArray([ability]), ReplicatedInstances: new NativeArray() }]);
    };
    e.root = e.ability('InitialRisk_C_1', 1); e.first = e.task(e.root, 'Main'); e.select(e.root, e.first);
    const saved = 'C:/Fixture/Saved/', content = 'D:/Fixture/ProjectPBZ/Content/';
    const normalize = p => path.posix.normalize(p.replace(/\\/g, '/'));
    const bankPath = content + 'PBZForewarn/PBZForewarn.bnk';
    const configPath = normalize(content + '../../platform/steam/ue4ss/Mods/PBZForewarnHooks/PBZForewarnHooks.config.json');
    e.files.set(bankPath, 'native-bank-fixture');
    e.files.set(configPath,
        JSON.stringify({ ...settings, _internal: { Hooks: false, Diagnostics: diagnostics, ObserveAttacks: true, ...settings._internal } }));
    e.saveDiagnostics = (enabled, change) => {
        const config = JSON.parse(e.files.get(configPath));
        e.files.set(configPath, JSON.stringify({ ...config, Diagnostics: enabled }));
        e.files.set(configPath.replace('PBZForewarnHooks/PBZForewarnHooks.config.json', 'PBZModsMenuBridge/events-PBZForewarnHooks.txt'),
            `Changed=${change}\r\nEnd=1\r\n`);
    };
    e.writes = [];

    // UMG setters retain external state. Visibility is observed only on the
    // mounted tree after a tick, not through presentation's diagnostic reports.
    const visibility = { Collapsed: 1, HitTestInvisible: 3 };
    class Vector2D { constructor() { this.X = this.Y = 0; } }
    class Anchors { constructor() { this.Minimum = new Vector2D(); this.Maximum = new Vector2D(); } }
    class LinearColor {}
    class SlateFontInfo { constructor() { this.OutlineSettings = { OutlineSize: 0, OutlineColor: new LinearColor() }; } }
    class SlateColor { constructor() { this.SpecifiedColor = new LinearColor(); this.ColorUseRule = 0; } }
    const ftext = Symbol('FText'); let serial = 0;
    class Widget {
        constructor() { Object.assign(this, object('/Fixture/Widget/' + (++serial)), { visibility: 1, parent: null }); e.objects.set(this._path, this); }
        SetVisibility(value) { assert([0, 1, 2, 3, 4].includes(value)); this.visibility = value; }
        RemoveFromParent() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; }
    }
    class Canvas extends Widget {
        constructor() { super(); this.children = []; }
        AddChildToCanvas(node) {
            assert(node instanceof Text); this.children.push(node); node.parent = this;
            return object('/Fixture/Slot/' + (++serial), {
                SetAnchors(value) { assert(value instanceof Anchors); assert(value.Minimum instanceof Vector2D); assert(value.Maximum instanceof Vector2D); },
                SetAlignment(value) { assert(value instanceof Vector2D); }, SetAutoSize(value) { assert.equal(typeof value, 'boolean'); },
                SetZOrder(value) { assert(Number.isInteger(value)); }, SetPosition(value) { assert(value instanceof Vector2D); }
            });
        }
    }
    class Text extends Widget {
        SetText(value) { assert.equal(value[ftext], true); this.text = value.text; }
        SetFont(value) { assert(value instanceof SlateFontInfo); assert(valid(value.FontObject)); assert(value.Size > 0); this.font = value; }
        SetColorAndOpacity(value) { assert(value instanceof SlateColor); assert(value.SpecifiedColor instanceof LinearColor); this.color = value; }
        SetJustification(value) { assert.equal(value, 1); }
    }
    e.overlay = object('/Fixture/HUD/Overlay_0', { children: [], AddChildToOverlay(node) {
        assert(node instanceof Canvas); this.children.push(node); node.parent = this;
        return { SetHorizontalAlignment(value) { assert.equal(value, 0); }, SetVerticalAlignment(value) { assert.equal(value, 0); } };
    } });
    const hud = object('/Fixture/HUD', { WidgetTree: { overlay: e.overlay } }), font = object('/Fixture/Font');
    const canvasClass = cls('UMG.CanvasPanel'), textClass = cls('UMG.TextBlock');
    e.visibleGlyphs = () => e.overlay.children.filter(c => c.visibility === visibility.HitTestInvisible)
        .flatMap(c => c.children.filter(t => t.visibility === visibility.HitTestInvisible));

    // AkAudioEvent accepts a post only after checked cooked-data loading and
    // deferred component registration; its ID is never an always-success stub.
    class Transform {}
    class WwisePackagedFile {}
    class WwiseSoundBankCookedData { constructor() { this.SoundBankId = 0; } }
    class WwiseEventCookedData {
        constructor() { this.EventID = 0; for (const key of ['SoundBanks', 'Media', 'ExternalSources', 'SwitchContainerLeaves', 'RequiredGroupValueSet']) this[key] = new NativeArray(); }
    }
    class WwiseLanguageCookedData { constructor() { this.LanguageId = 0; } }
    class WwiseLocalizedEventCookedData { constructor() { this.EventID = 0; this.EventLanguageMap = new NativeMap(); } }
    const akClass = cls('AkAudio.AkComponent'), eventClass = cls('AkAudio.AkAudioEvent');
    const callbacks = new Set(), playing = new Map(); let playingId = 0;
    player.AddComponentByClass = (type, manual, transform, deferred) => {
        assert.equal(type, akClass); assert.equal(manual, true); assert(transform instanceof Transform); assert.equal(deferred, true);
        return object('/Fixture/AkComponent/' + (++serial), { AkAudioEvent: null, registered: false, GetOwner: () => player,
            SetOutputBusVolume(value) { assert(Number.isFinite(value) && value >= 0 && value <= 2); this.volume = value; },
            K2_DestroyComponent(owner) { assert.equal(owner, player); this.valid = false; }
        });
    };
    player.FinishAddComponent = (component, manual, transform) => {
        assert(valid(component)); assert.equal(component.GetOwner(), player); assert(valid(component.AkAudioEvent));
        assert.equal(manual, true); assert(transform instanceof Transform); component.registered = true;
    };
    function nativeEvent(component) {
        return object('/Fixture/AkEvent/' + (++serial), { EventCookedData: null, loaded: false,
            GetWwiseShortID() { return this.EventCookedData.EventID; },
            LoadData() {
                const data = this.EventCookedData; assert(data instanceof WwiseLocalizedEventCookedData); assert.equal(data.EventID, 1682749338);
                assert.equal(data.EventLanguageMap.Num(), 1);
                const [[language, event]] = [...data.EventLanguageMap.values];
                assert(language instanceof WwiseLanguageCookedData); assert.equal(language.LanguageId, 0); assert.equal(language.LanguageName, 'SFX');
                assert.equal(language.LanguageRequirement, 2); assert(event instanceof WwiseEventCookedData); assert.equal(event.EventID, data.EventID);
                assert.equal(event.SoundBanks.Num(), 1); const bank = event.SoundBanks.Get(0);
                assert(bank instanceof WwiseSoundBankCookedData); assert.equal(bank.SoundBankId, 1682749338); assert.equal(bank.bContainsMedia, true);
                assert.equal(bank.SoundBankType, 30); assert(bank.PackagedFile instanceof WwisePackagedFile);
                assert.equal(bank.PackagedFile.PackagingStrategy, 1); assert.equal(bank.PackagedFile.ModularGameplayName, 'Game');
                assert.equal(bank.PackagedFile.PathName, 'PBZForewarn/PBZForewarn.bnk'); assert(e.files.has(bankPath));
                assert.equal(event.DestroyOptions, 0); this.loaded = true;
            },
            UnloadData(async) { assert.equal(async, true); this.loaded = false; },
            PostOnComponent(owner, callback, mask, stopWithOwner) {
                assert.equal(owner, component); assert(valid(owner) && owner.registered); assert.equal(owner.AkAudioEvent, this);
                assert.equal(this.loaded, true); assert.equal(typeof callback, 'function'); assert.equal(mask, 1); assert.equal(stopWithOwner, true);
                const id = ++playingId; callbacks.add(callback); playing.set(id, this);
                e.acceptedPosts.push({ playingId: id, component: owner, at: e.wall }); return id;
            },
            ExecuteAction(type, actor, id, duration, curve) {
                assert.equal(type, 0); assert.equal(actor, null); assert.equal(playing.get(id), this); assert.equal(duration, 0); assert.equal(curve, 4);
                playing.delete(id); return 1;
            }
        });
    }
    const akSettings = object('/Script/AkAudio.Default__AkSettings', { AudioRouting: 0, bWwiseSoundEngineEnabled: true,
        bWwiseAudioLinkEnabled: false, bAkAudioMixerEnabled: false });
    object('/Script/AkAudio.AkSettings', { ClassDefaultObject: akSettings });
    const deflectClass = cls('SGameCombatSystem.DeflectComponent');
    const deflect = object('/Fixture/Player/Deflect', { ReceiveFrames: { Num: () => 0, GetMaxIndex: () => 0,
        IsValidIndex: () => false, GetKey() { assert.fail('empty ReceiveFrames'); }, Get() { assert.fail('empty ReceiveFrames'); } } });
    player.GetComponentByClass = type => { assert.equal(type, deflectClass); return deflect; };
    const UE = {
        KismetSystemLibrary: { IsValid: valid, GetPathName: o => { assert(valid(o)); return o._path; },
            GetGameTimeInSeconds: context => { assert.equal(context, world); return e.game; }, Conv_SoftObjectReferenceToString: () => '' },
        BlueprintPathsLibrary: { ProjectSavedDir: () => saved, ProjectContentDir: () => content, ConvertRelativePathToFull: normalize,
            FileExists: file => e.files.has(file) },
        EasyCsv: { LoadStringFromLocalFile(file, out) { out.value = e.files.get(file) || ''; return e.files.has(file); },
            SaveStringToFileWithFullPath(body, file) {
                assert.equal(typeof body, 'string'); e.writes.push(path.basename(file)); e.files.set(file, body); return true;
            } },
        GameplayStatics: { GetPlayerController(context, index) { assert.equal(context, gi); assert.equal(index, 0); return pc; },
            GetPlayerPawn(context, index) { assert.equal(context, world); assert.equal(index, 0); return player; },
            IsGamePaused(context) { assert.equal(context, world); return false; },
            GetAllActorsOfClass(context, type, out) { assert.equal(context, world); assert.equal(type, npcClass); assert(out.value instanceof NativeArray); out.value = new NativeArray([enemy]); } },
        PBZCharacter_NPC: { StaticClass: () => npcClass }, Actor: cls('Engine.Actor'), NewArray: () => new NativeArray(),
        GameplayTag: class {}, Key: class {}, DeflectComponent: { StaticClass: () => deflectClass },
        FactionUtils: { GetFaction: actor => ({ TagName: actor === player ? 'Faction.Player' : 'Faction.Enemy' }),
            GetFactionRelation(a, b) { assert([player, enemy].includes(a) && [player, enemy].includes(b)); return a === b ? 0 : 2; } },
        ETeamAttitude: { Friendly: 0, Hostile: 2 },
        BlueprintGameplayTagLibrary: { Conv_ObjectToGameplayTagAssetInterface: system => valid(system) ? system : null,
            HasAllMatchingGameplayTags: (system, tags) => tags.every(tag => system.tags.has(tag)),
            HasAnyMatchingGameplayTags: (system, tags) => tags.some(tag => system.tags.has(tag)), IsTagQueryEmpty: query => query.empty === true,
            GetOwnedGameplayTags: system => ({ GameplayTags: new NativeArray([...system.tags].map(TagName => ({ TagName }))) }),
            IsGameplayTagValid: tag => typeof tag?.TagName === 'string' && !!tag.TagName, GetTagName: tag => tag.TagName },
        Object: { Find: name => e.objects.get(name) },
        AbilityAsync_WaitGameplayEvent: { WaitGameplayEventToActor(actor, tag, once, exact) {
            assert.equal(actor, player); assert.equal(typeof tag.TagName, 'string'); assert.equal(once, false); assert.equal(exact, false);
            return object('/Fixture/Listener/' + (++serial), { EventReceived: delegate(), Activate() { this.active = true; }, EndAction() { this.active = false; } });
        } },
        Vector2D, Anchors, LinearColor, SlateFontInfo, SlateColor, ESlateVisibility: visibility,
        ETextJustify: { Center: 1 }, ESlateColorStylingMode: { UseColor_Specified: 0 }, EHorizontalAlignment: { HAlign_Fill: 0 }, EVerticalAlignment: { VAlign_Fill: 0 },
        CanvasPanel: { StaticClass: () => canvasClass }, TextBlock: { StaticClass: () => textClass },
        PBZHUDLayout: { GetHUDLayout(context) { assert.equal(context, world); return hud; } },
        Widget: { Find(name, tree) { assert.equal(name, 'Overlay_0'); assert.equal(tree, hud.WidgetTree); return tree.overlay; } },
        Font: { Load(name) { assert.equal(name, '/Game/PBZContent/UI/Fonts/ZH_ZiKuTangKuangShanKaiShuJF_Font.ZH_ZiKuTangKuangShanKaiShuJF_Font'); return font; } },
        AkComponent: { StaticClass: () => akClass }, AkAudioEvent: { StaticClass: () => eventClass },
        Transform, WwisePackagedFile, WwiseSoundBankCookedData, WwiseEventCookedData, WwiseLanguageCookedData, WwiseLocalizedEventCookedData,
        EWwisePackagingStrategy: { AdditionalFile: 1 }, EWwiseSoundBankType: { Event: 30 }, EWwiseEventDestroyOptions: { StopEventOnDestroy: 0 },
        EWwiseLanguageRequirement: { SFX: 2 }, EAkCallbackType: { EndOfEvent: 0 }, EAkResult: { Success: 1 },
        AkActionOnEventType: { Stop: 0 }, EAkCurveInterpolation: { Linear: 4 },
        AkGameplayStatics: { CancelEventCallback(callback) { assert(callbacks.has(callback)); callbacks.delete(callback); } },
        NewObject(type, outer) {
            assert(valid(outer));
            if (type === eventClass) return nativeEvent(outer);
            assert.equal(outer, hud);
            if (type === canvasClass) return new Canvas();
            assert.equal(type, textClass); return new Text();
        }
    };
    const npcClass = cls('SGame.PBZCharacter_NPC');
    const puerts = { $ref: value => ({ value }), $unref: ref => ref.value,
        argv: { getByName(name) { assert.equal(name, 'GameInstance'); return gi; } } };
    const cpp = { FText: { FromString(text) { assert.equal(typeof text, 'string'); return { [ftext]: true, text }; } } };
    class Clock extends Date { static now() { return e.wall; } }
    const context = vm.createContext({ Date: Clock, console: { log: text => e.logs.push(text) },
        setInterval(fn, ms) { assert.equal(typeof fn, 'function'); assert.equal(ms, 16); e.timers.add(fn); return fn; },
        clearInterval: fn => e.timers.delete(fn) });
    const cache = new Map(), external = { ue: UE, puerts, cpp };
    function load(file) {
        if (cache.has(file)) return cache.get(file).exports;
        const module = { exports: {} }; cache.set(file, module);
        const source = fs.readFileSync(file, 'utf8');
        const execute = vm.runInContext('(function(require, module, exports) {\n' + source + '\n})', context, { filename: file });
        execute(name => {
            if (Object.hasOwn(external, name)) return external[name];
            assert(name.startsWith('./'), 'only real relative MOD modules or the three external bridges may load');
            return load(path.join(path.dirname(file), name + '.js'));
        }, module, module.exports);
        return module.exports;
    }
    const mod = load(path.join(runtimeDir, 'main.js'));
    let wasVisible = false;
    e.tick = (task, time, elapsed = 16) => {
        task.CurrentTime = time; e.wall += elapsed; e.game += elapsed / 1000;
        for (const timer of [...e.timers]) timer();
        const visible = e.visibleGlyphs();
        if (visible.length && !wasVisible) e.glyphShows.push({ at: e.wall, text: visible.map(t => t.text) });
        wasVisible = visible.length > 0;
    };
    e.stop = () => mod.stop();
    return e;
}

let passed = 0, failed = 0;
for (const diagnostics of [true, false]) {
    const name = 'one delivered grab warning keeps its continuation and delayed Success silent (Diagnostics=' + diagnostics + ')';
    const e = fixture(diagnostics);
    try {
        e.tick(e.first, 0.7);
        assert.equal(e.acceptedPosts.length, 1, 'the initial warning must actually reach native audio');
        assert(e.acceptedPosts[0].playingId > 0); assert.equal(e.acceptedPosts[0].component.volume, 0.8);
        const [glyph] = e.visibleGlyphs(); assert.equal(e.visibleGlyphs().length, 1); assert.equal(glyph.text, '危');
        assert.equal(glyph.color.SpecifiedColor.R, 0.025); assert.equal(glyph.color.SpecifiedColor.G, 0.025); assert.equal(glyph.color.SpecifiedColor.B, 0.025);
        assert.equal(e.glyphShows.length, 1, 'the initial warning must actually show a mounted black glyph');
        e.tick(e.first, 1.41, 710); e.first.OnCompleted.fire(); e.root.bIsActive = false;
        assert.equal(e.visibleGlyphs().length, 0, 'the first display ends before a possible duplicate');
        const continuation = e.ability('Continuation_C_2', 2), main = e.task(continuation, 'Main');
        e.select(continuation, main); e.tick(main, 0.7, 250);
        assert.equal(e.acceptedPosts.length, 1, 'same-actor same-payload continuation is silent');
        assert.equal(e.visibleGlyphs().length, 0);
        main.OnCancelled.fire();
        const success = e.task(continuation, 'Success', true); e.select(continuation, success);
        // Observed 513 ms before its ordinary 350 ms-lead window. Coherent 1x
        // timeline/game time crosses two 200 ms recompiles (real reports: 513/555 ms).
        e.tick(success, 0.687, 250); e.tick(success, 0.937, 250); e.tick(success, 1.2, 263);
        e.tick(success, 1.45, 250); e.tick(success, 1.8, 350);
        console.log('NATIVE Diagnostics=' + diagnostics + ' PlayingIDs=' + e.acceptedPosts.map(p => p.playingId).join(',') + ' glyphShows=' + e.glyphShows.length);
        assert.equal(e.acceptedPosts.length, 1, 'only the initial warning may reach PostOnComponent; no Success backfill');
        assert.equal(e.glyphShows.length, 1, 'only the initial warning may show the mounted danger glyph');
        // The completed chain must not silence a subsequent independent attack.
        success.OnCompleted.fire(); continuation.bIsActive = false;
        const independent = e.ability('IndependentAttack_C_3', 3), attack = e.task(independent, 'Main', true);
        e.select(independent, attack);
        e.tick(attack, 0.687, 250); e.tick(attack, 0.937, 250); e.tick(attack, 1.2, 263);
        assert.equal(e.acceptedPosts.length, 2, 'a later independent ordinary black attack must still reach native audio');
        assert.equal(e.acceptedPosts[1].playingId, 2); assert.equal(e.acceptedPosts[1].component.volume, 0.8);
        assert.equal(e.visibleGlyphs().length, 1); assert.equal(e.visibleGlyphs()[0].text, '危');
        assert.equal(e.glyphShows.length, 2, 'the independent attack must show a fresh mounted danger glyph');
        console.log('INDEPENDENT Diagnostics=' + diagnostics + ' PlayingIDs=' + e.acceptedPosts.map(p => p.playingId).join(',') + ' glyphShows=' + e.glyphShows.length);
        passed++; console.log('PASS ' + name);
    } catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
    finally { e.stop(); }
}
for (const diagnostics of [true, false]) {
    const e = fixture(diagnostics), name = 'lifecycle Start preparation reaches output once without delay or recompile replay (Diagnostics=' + diagnostics + ')';
    try {
        e.root.bIsActive = false;
        const ability = e.ability('LifecycleRisk_C_1', 1), task = e.lifecycleTask(ability);
        e.select(ability, task); e.tick(task, 0.7);
        assert.equal(e.acceptedPosts.length, 1); assert(e.acceptedPosts[0].playingId > 0);
        assert.equal(e.visibleGlyphs().length, 1); assert.equal(e.visibleGlyphs()[0].text, '危');
        const color = e.visibleGlyphs()[0].color.SpecifiedColor;
        assert(color.R > color.G && color.R > color.B, 'the mounted glyph is red');
        e.tick(task, 0.95, 250); e.tick(task, 1.2, 250); e.tick(task, 1.41, 210);
        assert.equal(e.acceptedPosts.length, 1); assert.equal(e.glyphShows.length, 1);
        assert.equal(e.visibleGlyphs().length, 0);
        task.OnCancelled.fire(); ability.bIsActive = false;
        e.tick(task, 1.8, 400); assert.equal(e.acceptedPosts.length, 1);
        passed++; console.log('PASS ' + name);
    } catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
    finally { e.stop(); }
}
for (const marked of [false, true]) {
    const name = 'legacy false reaches real preparation outputs only before the numeric upgrade epoch (marked=' + marked + ')';
    const e = fixture(false, { _internal: { GenericAttack: false },
        ...(marked ? { _extra: { PBZForewarnGenericAttackEpoch: 1 } } : {}) });
    try {
        e.root.bIsActive = false;
        const ability = e.ability('UpgradeRisk_C_1', 1), task = e.lifecycleTask(ability);
        e.select(ability, task); e.tick(task, 0.7);
        if (marked) {
            assert.equal(e.acceptedPosts.length, 0); assert.equal(e.visibleGlyphs().length, 0);
        } else {
            assert.equal(e.acceptedPosts.length, 1); assert.equal(e.acceptedPosts[0].playingId, 1);
            assert.equal(e.visibleGlyphs().length, 1); assert.equal(e.visibleGlyphs()[0].text, '危');
        }
        passed++; console.log('PASS ' + name);
    } catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
    finally { e.stop(); }
}
{
    const name = 'Menu diagnostic recording stops writes, resumes recording, and preserves warning output';
    const e = fixture(true);
    try {
        e.tick(e.first, 0.7);
        assert.equal(e.acceptedPosts.length, 1);
        assert.equal(e.visibleGlyphs().length, 1);
        assert(e.writes.includes('pbzforewarn_diagnostics.json'));
        const beforeDisable = e.writes.length;
        e.saveDiagnostics(false, 1);
        e.tick(e.first, 0.8, 500);
        assert.deepEqual(e.writes.slice(beforeDisable), ['pbzforewarn_observations.json']);
        assert.equal(e.acceptedPosts.length, 1, 'a settings save must not replay the current warning');

        e.tick(e.first, 1.42, 620);
        e.first.OnCompleted.fire(); e.root.bIsActive = false;
        const independent = e.ability('OffRisk_C_2', 2), task = e.lifecycleTask(independent);
        e.select(independent, task); e.tick(task, 0.7, 64);
        assert.equal(e.acceptedPosts.length, 2);
        assert.equal(e.visibleGlyphs()[0].text, '危');
        e.tick(task, 1.42, 31000);
        assert.equal(e.writes.length, beforeDisable + 1, 'no periodic writes while disabled');

        e.saveDiagnostics(true, 2); e.tick(task, 1.43, 500);
        assert(e.writes.slice(beforeDisable + 1).includes('pbzforewarn_diagnostics.json'));
        assert.equal(e.acceptedPosts.length, 2);
        passed++; console.log('PASS ' + name);
    } catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
    finally { e.stop(); }
}
console.log('Native-output regression: ' + passed + ' checks passed; ' + failed + ' failed. External UE/Wwise fakes only; no in-game or acoustic claim.');
if (failed) process.exitCode = 1;
