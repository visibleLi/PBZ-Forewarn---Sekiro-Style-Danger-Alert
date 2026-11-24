"use strict";
const assert = require("assert");
const { createNativeAttackObserver, EVENTS } = require("../PBZForewarn/native-attack-observer");
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }
function object(name, values = {}) { return Object.assign({ path: name, valid: true }, values); }
function readonly(value) { return new Proxy(value, { set() { throw Error("gameplay write"); }, deleteProperty() { throw Error("gameplay delete"); } }); }
function mapOf(entries = [], slots = null) {
    const map = new Map(entries);
    const keys = slots || [...map.keys()];
    return { map, keys, Num: () => map.size, GetMaxIndex: () => keys.length,
        IsValidIndex: i => keys[i] !== null && map.has(keys[i]), GetKey: i => keys[i], Get: k => map.get(k) };
}
function fixture(options = {}) {
    const env = { events: [], created: [], gameTime: 1, endCalls: 0, attempts: 0 };
    const adapter = { valid: x => !!x && x.valid === true, path: x => x.path || "" };
    env.map = mapOf();
    env.component = object("/Player/Deflect");
    Object.defineProperty(env.component, "ReceiveFrames", { get() { return env.map; } });
    env.player = object("/Player", { GetComponentByClass: () => env.component, GetWorld: () => env.world });
    env.world = object("/World");
    const UE = {
        DeflectComponent: { StaticClass: () => "DeflectClass" },
        KismetSystemLibrary: { GetGameTimeInSeconds: () => env.gameTime }, GameplayTag: function () {},
        AbilityAsync_WaitGameplayEvent: { WaitGameplayEventToActor(player, tag) {
            env.attempts++;
            if (env.failBind) throw Error("bind failed");
            const callbacks = [];
            const listener = object("/Listener/" + env.attempts, { callbacks, player, tag: tag.TagName,
                EventReceived: { Add: f => callbacks.push(f) }, Activate() { this.active = true; },
                EndAction() { env.endCalls++; if (env.failEnd) throw Error("end failed"); this.active = false; } });
            env.created.push(listener); return listener;
        } }
    };
    if (options.noEvents) delete UE.AbilityAsync_WaitGameplayEvent;
    env.UE = UE;
    env.observer = createNativeAttackObserver(UE, {}, adapter,
        { enabled: options.enabled !== false, maxFrames: options.maxFrames, onRecord: (kind, data) => env.events.push({ kind, ...data }) });
    env.update = (overrides = {}) => env.observer.update({ world: env.world, player: env.player, worldKey: "/World|/Player",
        gameTime: env.gameTime, wallTime: 1000 + env.gameTime * 1000, clockEpoch: 1, paused: false, ...overrides });
    env.frame = (handle = 1, config = {}) => {
        const actor = object(config.actor || "/Enemy/1");
        const timeline = object(config.timeline || "/Enemy/Timeline");
        const task = object(config.task || "/Enemy/Task", { Timeline: timeline });
        const ability = object(config.ability || "/Enemy/Ability", { GetActivationCount: () => config.activation ?? 1,
            GetPlayTimelineTask: () => task });
        const action = readonly(object(config.action || "/Enemy/Action", { DeflectBulletType: config.type ?? 3,
            ...(config.conflict ? { DeflectType: 2 } : {}), GetAbility: () => ability,
            GetAvatarActor: () => actor, GetTimeline: () => timeline }));
        return readonly({ SourceAction: action, Bullet: config.noBullet ? null : object(config.bullet || "/Enemy/Bullet"),
            HitGameTime: config.hit === undefined ? 2 : config.hit, IsDodge: true, IsHit: config.isHit || false });
    };
    env.seen = () => env.events.filter(e => e.kind === "native-frame");
    env.ended = () => env.events.filter(e => e.kind === "native-frame-ended");
    env.fire = (frame, handle = 1, index = 0) => env.created[index].callbacks[0]({ OptionalObject: object("/EventPayload", { Handle: handle, ReceiveFrame: frame }) });
    return env;
}

test("disabled observer never inspects the game or installs listeners", () => {
    const e = fixture({ enabled: false }); e.update(); assert.equal(e.attempts, 0); assert.equal(e.events.length, 0); e.observer.dispose();
});
test("map-only reads primitive native classification without modifying gameplay", () => {
    const e = fixture({ noEvents: true }); e.map = mapOf([[5, e.frame(5)]]); e.update();
    const r = e.seen()[0]; assert.equal(r.handle, 5); assert.equal(r.typeName, "RedEye"); assert.equal(r.actor, "/Enemy/1");
    assert.equal(r.hitGameTime, 2); assert.equal(r.remainingGameSeconds, 1); assert.equal(r.impactVerified, false);
    assert(!Object.hasOwn(r, "cue")); assert(!Object.hasOwn(r, "color")); assert.doesNotThrow(() => JSON.stringify(r)); e.observer.dispose();
});
test("unchanged per-frame snapshots are suppressed", () => {
    const e = fixture(); e.map = mapOf([[1, e.frame()]]); e.update(); e.gameTime = 1.016; e.update();
    assert.equal(e.seen().length, 1); assert.equal(e.observer.status().suppressed, 1); e.observer.dispose();
});
test("hit state and time revisions are changes, not proof of impact", () => {
    const e = fixture(); e.map = mapOf([[1, e.frame()]]); e.update(); const id = e.seen()[0].id;
    e.map = mapOf([[1, e.frame(1, { hit: 2.05, isHit: true })]]); e.update();
    assert.equal(e.seen().at(-1).id, id); assert.equal(e.seen().at(-1).phase, "changed"); assert.equal(e.seen().at(-1).impactVerified, false); e.observer.dispose();
});
test("a complete empty map reports observed absence, never cancellation", () => {
    const e = fixture(); e.map = mapOf([[1, e.frame()]]); e.update(); e.map = mapOf(); e.update();
    assert.equal(e.ended().length, 1); assert.equal(e.ended()[0].reason, "missing-observed"); assert.equal(e.ended()[0].cancelled, false); e.observer.dispose();
});
test("sparse TMap indices are enumerated by GetMaxIndex rather than Num", () => {
    const e = fixture(); e.map = mapOf([[7, e.frame(7)], [9, e.frame(9, { action: "/Other" })]], [null, 7, null, 9]); e.update();
    assert.deepEqual(e.seen().map(x => x.handle), [7, 9]); assert.equal(e.observer.status().mapState, "complete"); e.observer.dispose();
});
test("entry read failure cannot erase an existing observation", () => {
    const e = fixture(); e.map = mapOf([[1, e.frame()]]); e.update(); e.map = mapOf([[2, e.frame(2)]]);
    e.map.Get = () => { throw Error("borrow expired"); }; e.update(); assert.equal(e.ended().length, 0); assert.equal(e.observer.status().mapState, "incomplete"); e.observer.dispose();
});
test("truncated maps do not infer disappeared frames", () => {
    const e = fixture({ maxFrames: 1 }); e.map = mapOf([[1, e.frame()]]); e.update();
    e.map = mapOf([[2, e.frame(2, { action: "/Second" })], [3, e.frame(3, { action: "/Third" })]]); e.update();
    assert.equal(e.ended().filter(x => x.reason === "missing-observed").length, 0); assert.equal(e.observer.status().incompleteScans, 1); e.observer.dispose();
});
test("unsupported map API is explicit and event path remains available", () => {
    const e = fixture(); e.map = { Num: () => 1 }; e.update(); e.fire(e.frame());
    assert.equal(e.observer.status().mapState, "unsupported"); assert.equal(e.seen().length, 1); assert(e.seen()[0].source.startsWith("event:")); e.observer.dispose();
});
test("event callbacks snapshot current engine time instead of stale update time", () => {
    const e = fixture(); e.update(); e.gameTime = 1.25; e.fire(e.frame());
    assert.equal(e.seen()[0].gameTime, 1.25); assert.equal(e.seen()[0].clockSource, "callback-engine-time");
    assert.equal(e.seen()[0].remainingGameSeconds, 0.75); e.observer.dispose();
});
test("event time unavailable stays null instead of claiming precise last-update clock", () => {
    const e = fixture(); e.update(); e.UE.KismetSystemLibrary.GetGameTimeInSeconds = () => { throw Error("clock"); }; e.fire(e.frame());
    assert.equal(e.seen()[0].gameTime, null); assert.equal(e.seen()[0].remainingGameSeconds, null); e.observer.dispose();
});
test("map and event evidence share source identity and do not duplicate first seen", () => {
    const e = fixture(); const f = e.frame(); e.map = mapOf([[1, f]]); e.update(); e.fire(f);
    assert.equal(new Set(e.seen().map(x => x.id)).size, 1); assert.equal(e.seen()[1].phase, "changed"); assert.equal(e.seen()[1].sources.length, 2); e.observer.dispose();
});
test("negative and non-finite native hit times are retained as unavailable evidence", () => {
    const e = fixture(); e.map = mapOf([[1, e.frame(1, { hit: -3.4e38 })], [2, e.frame(2, { hit: Infinity, action: "/B" })]]); e.update();
    assert.equal(e.seen()[0].hitTimeStatus, "negative-placeholder"); assert.equal(e.seen()[0].remainingGameSeconds, null);
    assert.equal(e.seen()[1].hitGameTime, null); assert.equal(e.seen()[1].hitTimeStatus, "non-finite-or-unreadable"); e.observer.dispose();
});
test("conflicting enum fields remain visible without manufactured colour", () => {
    const e = fixture(); e.map = mapOf([[1, e.frame(1, { conflict: true })]]); e.update();
    assert.equal(e.seen()[0].typeConflict, true); assert.equal(e.seen()[0].typeCandidates.length, 3); assert(!Object.hasOwn(e.seen()[0], "color")); e.observer.dispose();
});
test("handle replacement by another actor or activation creates a fresh identity", () => {
    const e = fixture(); e.map = mapOf([[1, e.frame()]]); e.update(); const a = e.seen()[0].id;
    e.map = mapOf([[1, e.frame(1, { actor: "/Enemy/2", activation: 2 })]]); e.update();
    assert.notEqual(e.seen().at(-1).id, a); assert.equal(e.ended()[0].reason, "handle-source-replaced"); e.observer.dispose();
});
test("handle disappearing and then being reused does not reuse the old identity", () => {
    const e = fixture(); const f = e.frame(); e.map = mapOf([[1, f]]); e.update(); const a = e.seen()[0].id;
    e.map = mapOf(); e.update(); e.map = mapOf([[1, f]]); e.update(); assert.notEqual(e.seen().at(-1).id, a); e.observer.dispose();
});
test("pause ends listeners and invalidates old callbacks without emitting attack cancellation", () => {
    const e = fixture(); e.update(); const old = e.created[0]; e.update({ paused: true }); old.callbacks[0]({ OptionalObject: { Handle: 1, ReceiveFrame: e.frame() } });
    assert.equal(e.endCalls, 2); assert.equal(e.seen().length, 0); e.update(); assert.equal(e.created.length, 4); e.observer.dispose();
});
test("new player and clock epoch create new listener bindings", () => {
    const e = fixture(); e.update(); e.update({ clockEpoch: 2 }); assert.equal(e.endCalls, 2); assert.equal(e.created.length, 4);
    e.player = object("/Player/New", { GetComponentByClass: () => e.component }); e.update({ clockEpoch: 2 }); assert.equal(e.created.length, 6); e.observer.dispose();
});
test("listener binding failure is retried with bounded cadence, not each frame", () => {
    const e = fixture(); e.failBind = true; for (let i = 0; i < 30; i++) e.update();
    assert.equal(e.attempts, 1); assert.equal(e.observer.status().listenerFailures, 1); e.observer.dispose();
});
test("failed EndAction disables callbacks and blocks duplicate listener registration", () => {
    const e = fixture(); e.update(); e.failEnd = true; e.update({ paused: true }); e.update();
    assert.equal(e.created.length, 2); assert.equal(e.observer.status().pendingListenerCleanup, 2);
    e.fire(e.frame()); assert.equal(e.seen().length, 0); e.failEnd = false; e.update(); assert.equal(e.observer.status().pendingListenerCleanup, 0); e.observer.dispose();
});
test("live suspend retries failed cleanup and never stacks native listeners on resume", () => {
    const e=fixture(); e.update(); e.failEnd=true; e.observer.setEnabled(false);
    assert.equal(e.observer.status().pendingListenerCleanup,2);
    e.fire(e.frame()); assert.equal(e.seen().length,0);
    e.update(); const attempts=e.endCalls; assert(attempts>2);
    e.observer.setEnabled(true); e.update(); assert.equal(e.created.length,2);
    e.failEnd=false; e.update();
    assert.equal(e.observer.status().pendingListenerCleanup,0);
    assert.equal(e.created.filter(x=>x.active).length,2);
    e.observer.setEnabled(false); e.update(); assert.equal(e.created.filter(x=>x.active).length,0);
    e.observer.setEnabled(true); e.update(); assert.equal(e.created.filter(x=>x.active).length,2);
    e.observer.dispose(); assert.equal(e.created.filter(x=>x.active).length,0);
    e.observer.setEnabled(true); e.update(); assert.equal(e.created.filter(x=>x.active).length,0);
});
test("dispose retries failed native cleanup without registering new listeners", () => {
    const e=fixture(); e.update(); e.failEnd=true; e.observer.dispose();
    assert.equal(e.observer.status().pendingListenerCleanup,2);
    e.failEnd=false; e.observer.dispose(); assert.equal(e.observer.status().pendingListenerCleanup,0);
    e.update(); assert.equal(e.created.length,2); assert.equal(e.created.filter(x=>x.active).length,0);
});
test("dispose ends all own listeners, clears records and makes future updates inert", () => {
    const e = fixture(); e.map = mapOf([[1, e.frame()]]); e.update(); e.observer.dispose(); const count = e.events.length;
    e.update(); e.fire(e.frame()); assert.equal(e.events.length, count); assert.equal(e.observer.status().tracked, 0); assert.equal(e.endCalls, 2);
});
test("unknown action identity is preserved as unknown and not guessed from event instigator", () => {
    const e = fixture(); e.update(); e.fire(readonly({ SourceAction: null, HitGameTime: 2, IsDodge: true, IsHit: false }));
    assert.equal(e.seen()[0].action, ""); assert.equal(e.seen()[0].actor, ""); assert.equal(e.seen()[0].activation, ""); e.observer.dispose();
});
test("two exact source instances with the same type remain separate native observations", () => {
    const e = fixture(); e.map = mapOf([[1, e.frame(1, { actor: "/Enemy/SameClass_1", ability: "/Enemy/SameClass_1/GA", action: "/Enemy/SameClass_1/GA/Action" })],
        [2, e.frame(2, { actor: "/Enemy/SameClass_2", ability: "/Enemy/SameClass_2/GA", action: "/Enemy/SameClass_2/GA/Action" })]]); e.update();
    assert.equal(new Set(e.seen().map(x => x.id)).size, 2); assert.equal(new Set(e.seen().map(x => x.actor)).size, 2); e.observer.dispose();
});
test("a different current timeline task is not falsely assigned to the source action", () => {
    const e = fixture(); const actionTimeline = object("/Timeline/Source"), otherTimeline = object("/Timeline/Other");
    const ability = object("/Ability", { GetActivationCount: () => 1, GetPlayTimelineTask: () => object("/WrongTask", { Timeline: otherTimeline }) });
    const action = object("/Action", { DeflectBulletType: 4, GetAbility: () => ability, GetTimeline: () => actionTimeline });
    e.map = mapOf([[1, { SourceAction: action, HitGameTime: 2 }]]); e.update();
    assert.equal(e.seen()[0].task, null); assert.equal(e.seen()[0].taskCandidate, null);
    assert.equal(e.seen()[0].typeName, "PowerAttack"); assert.equal(e.seen()[0].taskIdentity, "unavailable-or-unmatched"); e.observer.dispose();
});
test("frame/container wrappers are not accessed again during status and disposal", () => {
    const e = fixture(); let live = true;
    const frame = new Proxy(e.frame(), { get(target, key) { if (!live) throw Error("expired wrapper"); return Reflect.get(target, key); } });
    e.map = mapOf([[1, frame]]); e.update(); live = false;
    assert.doesNotThrow(() => e.observer.status()); assert.doesNotThrow(() => JSON.stringify(e.seen())); assert.doesNotThrow(() => e.observer.dispose());
    assert.equal(e.observer.status().errors, 0);
});
test("per-frame type observation does not read diagnostic timing arrays", () => {
    const e = fixture(); let arrayReads = 0;
    const action = object("/Action", { DeflectType: 2 });
    for (const field of ["PreHitPointDuration", "RuntimePreHitPointDuration", "BulletDuration", "SendFrameTimes", "StartBulletTimes", "EndBulletTimes"])
        Object.defineProperty(action, field, { get() { arrayReads++; throw Error("must not probe this data per native frame"); } });
    e.map = mapOf([[1, readonly({ SourceAction: action, HitGameTime: 2 })]]); e.update(); e.update();
    assert.equal(e.seen()[0].typeName, "BlueEye"); assert.equal(arrayReads, 0); e.observer.dispose();
});
test("invalidated listener cleanup does not invoke a native EndAction method", () => {
    const e = fixture(); e.update(); e.created.forEach(listener => { listener.valid = false; listener.EndAction = () => { throw Error("invalid native call"); }; });
    assert.doesNotThrow(() => e.observer.dispose()); assert.equal(e.observer.status().pendingListenerCleanup, 0); assert.equal(e.observer.status().listenerFailures, 0);
});
test("an event from a player invalidated between updates never reads its engine clock", () => {
    const e = fixture(); e.update(); e.player.valid = false;
    e.UE.KismetSystemLibrary.GetGameTimeInSeconds = () => { throw Error("invalid native player clock call"); };
    e.fire(e.frame()); assert.equal(e.seen().length, 0); assert.equal(e.observer.status().errors, 0); e.observer.dispose();
});
test("an invalid event payload is rejected before reading native frame properties", () => {
    const e = fixture(); e.update(); let reads = 0;
    const payload = object("/ExpiredPayload", { valid: false });
    for (const key of ["Handle", "ReceiveFrame"])
        Object.defineProperty(payload, key, { get() { reads++; throw Error("invalid native payload"); } });
    e.created[0].callbacks[0]({ OptionalObject: payload });
    assert.equal(reads, 0); assert.equal(e.seen().length, 0); e.observer.dispose();
});
test("a world change before update cannot label an old listener event with the old epoch", () => {
    const e = fixture(); e.map = mapOf([[1, e.frame()]]); e.update(); const original = e.seen()[0].id;
    e.world = object("/World/New"); e.fire(e.frame()); const record = e.seen().at(-1);
    assert.equal(record.worldKey, null); assert.equal(record.clockEpoch, null); assert.equal(record.captureWorld, "/World/New");
    assert.equal(record.callbackContextReason, "world-changed-before-update"); assert.notEqual(record.id, original);
    assert.equal(e.observer.status().tracked, 1); e.observer.dispose();
});
test("an unavailable callback world does not borrow the update binding epoch", () => {
    const e = fixture(); e.update(); delete e.player.GetWorld; e.fire(e.frame()); const record = e.seen()[0];
    assert.equal(record.clockEpoch, null); assert.equal(record.worldKey, null); assert.equal(record.callbackContextReason, "world-unavailable"); e.observer.dispose();
});
test("a game clock rewind between updates is not attributed to the old epoch", () => {
    const e = fixture(); e.update(); e.gameTime = 0.1; e.fire(e.frame()); const record = e.seen()[0];
    assert.equal(record.gameTime, 0.1); assert.equal(record.clockEpoch, null); assert.equal(record.callbackContextReason, "clock-rewound-before-update"); e.observer.dispose();
});
test("a matching shared timeline yields only a task candidate, never exact ownership", () => {
    const e = fixture(); e.map = mapOf([[1, e.frame()]]); e.update(); const record = e.seen()[0];
    assert.equal(record.task, null); assert.equal(record.taskCandidate, "/Enemy/Task");
    assert.equal(record.taskIdentity, "current-task-shared-timeline-candidate-only"); e.observer.dispose();
});
test("parallel tasks sharing a template cannot relabel the source frame's exact task", () => {
    const e = fixture(); const timeline = object("/Shared/Timeline");
    const first = object("/Task/First", { Timeline: timeline }), second = object("/Task/Second", { Timeline: timeline });
    let current = first;
    const ability = object("/Ability", { GetActivationCount: () => 1, GetPlayTimelineTask: () => current });
    const action = object("/Action", { DeflectBulletType: 3, GetAbility: () => ability, GetTimeline: () => timeline });
    e.map = mapOf([[1, readonly({ SourceAction: action, HitGameTime: 2 })]]); e.update(); const id = e.seen()[0].id;
    current = second; e.update(); const record = e.seen().at(-1);
    assert.equal(record.id, id); assert.equal(record.phase, "changed"); assert.equal(record.task, null);
    assert.equal(record.taskCandidate, "/Task/Second"); assert.equal(record.taskIdentity, "current-task-shared-timeline-candidate-only"); e.observer.dispose();
});
test("native float-min placeholder is not exposed as a usable hit deadline",()=>{
    const e=fixture();e.map=mapOf([[1,e.frame(1,{hit:-3.4028234663852886e38})]]);e.update();const r=e.seen()[0];
    assert.equal(r.hitGameTime,null);assert.equal(r.reportedHitGameTime,-3.4028234663852886e38);
    assert.equal(r.hitTimeStatus,'negative-placeholder');assert.equal(r.hitTimeUsableForFutureComparison,false);
    assert.equal(r.remainingGameSeconds,null);e.observer.dispose();
});
test("past native timestamp remains a reported fact and cannot become a future warning deadline",()=>{
    const e=fixture();e.map=mapOf([[1,e.frame(1,{hit:0.5})]]);e.update();const r=e.seen()[0];
    assert.equal(r.hitGameTime,0.5);assert.equal(r.remainingGameSeconds,-0.5);
    assert.equal(r.hitTimeStatus,'past-reported-time-not-impact-verified');assert.equal(r.hitTimeUsableForFutureComparison,false);
    assert.equal(r.impactVerified,false);e.observer.dispose();
});
test("huge positive sentinel and unknown callback epoch never support a future comparison",()=>{
    const e=fixture();e.map=mapOf([[1,e.frame(1,{hit:3.4028234663852886e38})]]);e.update();
    assert.equal(e.seen()[0].hitGameTime,null);assert.equal(e.seen()[0].hitTimeStatus,'unsafe-magnitude');
    e.world=object('/World/Changed');e.fire(e.frame(2,{hit:2}),2);const r=e.seen().at(-1);
    assert.equal(r.hitGameTime,2);assert.equal(r.hitTimeUsableForFutureComparison,false);
    assert.equal(r.remainingGameSeconds,null);e.observer.dispose();
});
test("bullet references are observable instances without a claim of spawn or persistent danger",()=>{
    const e=fixture();e.map=mapOf([[1,e.frame(1,{bullet:'/Projectile/One'})],[2,e.frame(2,{bullet:'/Projectile/Two'})]]);e.update();
    assert.equal(new Set(e.seen().map(x=>x.bullet)).size,2);
    for(const r of e.seen()){assert.equal(r.bulletInstancePresent,true);assert.equal(r.bulletLifecycleVerified,false);assert.equal(r.bulletDangerEndedVerified,false);}
    e.map=mapOf();e.update();for(const r of e.ended()){assert.equal(r.cancelled,false);assert.equal(r.bulletDangerEndedVerified,false);}
    e.observer.dispose();
});
test("absent bullet reference does not invent a projectile from an attack type",()=>{
    const e=fixture();e.map=mapOf([[1,e.frame(1,{noBullet:true,type:4})]]);e.update();const r=e.seen()[0];
    assert.equal(r.bullet,'');assert.equal(r.bulletReferenceStatus,'not-reported');assert.equal(r.bulletInstancePresent,false);
    assert(!Object.hasOwn(r,'color'));e.observer.dispose();
});
console.log("RESULT " + passed + " native observer scenarios passed. No game access.");
