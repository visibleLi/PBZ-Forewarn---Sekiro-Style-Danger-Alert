"use strict";
// PBZForewarn 0.5 trial — independent cues and game-engine audio.
const UE = require("ue"), puerts = require("puerts"), cpp = require("cpp");
const { Scheduler, classifyEffect } = require("./core");
const { createAdapter } = require("./adapter");
const { createPresentation } = require("./presentation");
const { createNativeAudio } = require("./wwise-audio");
const bankConfig = require("./wwise-bank-config");
const { createAudioEnvironmentProbe } = require("./audio-environment");
const { createTargetFilter } = require("./target-filter");
const { createDiagnosticStore } = require("./diagnostic-store");
const { createCastFollowup } = require("./cast-followup");
const { createLateWindowRecovery } = require("./late-window-recovery");
const VERSION = "0.6.1-dev.3";
const DEFAULTS = { LeadMs: 350, RangeCm: 3500, TickMs: 16, DiscoverMs: 50, ScanMs: 250,
    LateGraceMs: 80, MaxGlyphMs: 1200, GlyphOn: true, GlyphFontSize: 120, GlyphY: 0.32,
    Diagnostics: true, ObserveAttacks: true, Hooks: true, BlackOn: true, SemanticFallback: true, GenericAttack: false,
    LateDodgeRecovery: false, LateDodgeRecoveryMinRemainingMs: 100,
    YuZanCastWarning: true, YuZanCastLeadMs: 350,
    OnlyLockedTarget: false, SoundOn: true, SoundVolume: 0.8,
    FontPath: "/Game/PBZContent/UI/Fonts/ZH_ZiKuTangKuangShanKaiShuJF_Font.ZH_ZiKuTangKuangShanKaiShuJF_Font" };
const TEMPLATE = "# PBZForewarn 0.6.1-dev.3; restart game after changes\n" +
    "# Extra cue lead in GAME seconds (ms input); original warning is unchanged.\n" +
    "LeadMs=350\nLateDodgeRecovery=0\nLateDodgeRecoveryMinRemainingMs=100\nYuZanCastWarning=1\nYuZanCastLeadMs=350\nRangeCm=3500\nBlackOn=1\nSemanticFallback=1\nGenericAttack=0\nOnlyLockedTarget=0\nSoundOn=1\nSoundVolume=0.8\nGlyphOn=1\nGlyphFontSize=120\nGlyphY=0.32\nDiagnostics=1\nObserveAttacks=1\nHooks=1\n";
let state = null;
function log(kind, data) { console.log("[PBZMOD] [Forewarn] " + kind + " " + JSON.stringify(data)); }
function parseSettings(text) {
    const result = { ...DEFAULTS };
    const bounds = { LeadMs: [0, 1000], LateDodgeRecoveryMinRemainingMs: [0, 2000], YuZanCastLeadMs: [0, 1000],
        RangeCm: [500, 10000], TickMs: [16, 100], DiscoverMs: [16, 250], ScanMs: [100, 1000],
        LateGraceMs: [0, 250], MaxGlyphMs: [100, 3000], GlyphFontSize: [30, 240], GlyphY: [0.1, 0.8], SoundVolume: [0, 2] };
    for (const line of text.split(/\r?\n/)) {
        const m = /^\s*([A-Za-z]+)\s*=\s*([^#;\r\n]+?)\s*$/.exec(line);
        if (!m) continue;
        const key = Object.keys(result).find(k => k.toLowerCase() === m[1].toLowerCase());
        if (!key) continue;
        if (typeof result[key] === "boolean") { if (/^(1|true|0|false)$/i.test(m[2])) result[key] = /^(1|true)$/i.test(m[2]); }
        else if (bounds[key] && Number.isFinite(Number(m[2]))) result[key] = Math.max(bounds[key][0], Math.min(bounds[key][1], Number(m[2])));
    }
    return result;
}
function start() {
    if (state) return;
    const session = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    const s = { session, stopped: false, ticking: false, seq: 0, events: [], audioEvents: [], once: new Map(),
        actors: [], hintedActors: new Map(), records: new Map(), lastDiscovery: 0, lastScan: 0, lastReport: 0,
        worldKey: "", nextRecord: 0, hooksSession: "", hooksSeq: 0, hooksAlive: false, hookHealth: null, lastHookRead: 0,
        paused: true, stats: { cues: 0, fallbackCues: 0, castCues: 0, recoveryCues: 0, followupSuppressed: 0, cancels: 0, duplicateCancelsSuppressed: 0, missed: 0, conditionsNotMet: 0,
            previewOnlySkipped: 0, recognized: 0, tasks: 0, hooks: 0, errors: 0 },
        lastTickWall: 0, maxTickGap: 0, lastLongTick: 0, gameNow: 0, naturalCompletions: new Set(),
        targetStatus: null, previewDown: true, previewSerial: 0,
        cancelledIds: new Set(), resourceIds: new Map(), resourceSerial: 0, catalogedTemplates: new Set(),
        lastCatalogReport: 0, clockEpoch: 0, observedGameTime: null, observationContext: null,
        observationHooksSession: "", observationHooksSeq: 0, lastObservationHookRead: 0,
        observationFaults: 0, observerImportFailure: "", observationRecordCursor: 0,
        observationTasksDeferred: 0, observationHookRowsRejected: 0, observationLastRaw: "",
        observationProfiles: {}, observationHookHealth: null, observationHookFocus: null, observationFocusSeqs: new Map(),
        lateRecovery: null,
        flushStats: { writes: 0, catalogWrites: 0, observationWrites: 0, observationWriteFailures: 0,
            lastChars: 0, maxWriteMs: 0, maxSerializeMs: 0, maxObservationWriteMs: 0, maxObservationSerializeMs: 0 } };
    s.diagnostics = createDiagnosticStore({ now: () => Date.now() });
    s.castFollowup = createCastFollowup();
    s.pendingCastDelivery = new Map();
    function acceptCastDelivery(id) {
        const pending = s.pendingCastDelivery.get(id);
        if (!pending) return;
        s.castFollowup.recordCue(pending, id); s.pendingCastDelivery.delete(id);
    }
    function followupContext(r, live) {
        return { world: s.worldKey + "|" + s.clockEpoch, actor: a.path(r.actor), ability: a.path(r.ability),
            timeline: r.timelineKey, key: r.key, serial: r.serial, activation: String(r.activation), live };
    }
    function shortPath(value) { return typeof value === "string" ? value.slice(value.lastIndexOf(".") + 1) : value; }
    function canonical(value) { return typeof value === "string" ? value.replace(/_C_\d+/g, "_C") : ""; }
    function templateKey(r) { return shortPath(canonical(a.path(r.ability))) + "|" + a.path(r.timeline).slice(a.path(r.timeline).lastIndexOf(".") + 1); }
    function resourceKey(info) { return [shortPath(canonical(info.ability)), info.key, info.actionClass, info.effect,
        info.start, info.end, info.roleName || ""].join("|"); }
    function resourceId(info) {
        const key = resourceKey(info || {});
        if (!s.resourceIds.has(key)) {
            if (s.resourceIds.size >= 1024) s.resourceIds.delete(s.resourceIds.keys().next().value);
            s.resourceIds.set(key, "resource-" + (++s.resourceSerial));
        }
        return s.resourceIds.get(key);
    }
    function resourceRelevant(item) {
        if (["red", "blue", "black"].includes(item.color) || item.effect || item.effectSource === "soft-unresolved") return true;
        const semantics = item.attackSemantics;
        return !!semantics && (semantics.deflect.candidates.some(x => x.status === "read") ||
            Object.values(semantics.timing).some(x => x.status === "read") ||
            Object.values(semantics.arrays).some(x => x.status === "read"));
    }
    function resourceDetail(item) {
        const evidence = item.requirementsEvidence;
        return { ability: shortPath(canonical(item.ability)), key: item.key,
            action: shortPath(item.action), actionClass: item.actionClass, effect: item.effect, color: item.color,
            start: item.start, end: item.end, roleName: item.roleName, recognition: item.recognition || null,
            requirements: evidence ? { requireTags: evidence.requireTags, ignoreTags: evidence.ignoreTags, tagQuery: evidence.tagQuery } : null,
            attackSemantics: item.attackSemantics || null, semanticFallback: item.semanticFallback || null,
            castWarning: item.castWarning || null, reason: item.reason,
            detailLevel: item.requirementsEvidence || item.attackSemantics ? "full" : "compact" };
    }
    function compactEvent(data) {
        const result = { ...data }; delete result.meta;
        if (data && data.meta) {
            result.resourceId = resourceId(data.meta);
            result.ability = shortPath(data.meta.ability); result.actor = shortPath(data.meta.actor);
            result.actionClass = data.meta.actionClass;
            if (data.meta.semanticFallback) {
                result.source = "semantic-fallback";
                result.fallbackRule = data.meta.semanticFallback.ruleId;
                result.timingBasis = data.meta.semanticFallback.timingBasis;
            }
            if (data.meta.castWarning) {
                result.source = "cast-warning";
                result.castRule = data.meta.castWarning.ruleId;
                result.spellPhase = "cast";
                result.timingBasis = data.meta.castWarning.timingBasis;
            }
        }
        if (result.taskKey) { const parts = result.taskKey.split("|"); result.task = shortPath(parts[parts.length - 1]); delete result.taskKey; }
        if (result.timelineKey) { result.timeline = shortPath(result.timelineKey); delete result.timelineKey; }
        if (result.eventKey) { result.node = result.eventKey.split("|")[0]; delete result.eventKey; }
        if (result.actualLeadGameSeconds !== undefined) {
            result.estimatedLeadGameMs = result.actualLeadGameSeconds * 1000; delete result.actualLeadGameSeconds;
        }
        return result;
    }
    function diagnostic(kind, data, onceKey) {
        if (kind === "sound-play" && data && data.playingId) acceptCastDelivery(data.id);
        if (onceKey) {
            const previous = s.once.get(onceKey);
            if (previous && Date.now() - previous < 10000) return;
            s.once.set(onceKey, Date.now());
            if (s.once.size > 4096) s.once.delete(s.once.keys().next().value);
        }
        s.diagnostics.record(kind, data);
        if (!["inventory", "eligibility", "task-found", "hook-hint", "rate-jump", "active-ability-no-timeline", "timeline-coverage"].includes(kind)) log(kind, data);
    }
    const a = createAdapter(UE, puerts, (k, d) => diagnostic(k, d, k + JSON.stringify(d)),
        { semanticFallback: false, genericAttack: false });
    s.a = a;
    function readText(file) {
        const out = puerts.$ref(""); const result = UE.EasyCsv.LoadStringFromLocalFile(file, out);
        const text = puerts.$unref(out); return typeof text === "string" ? text : typeof result === "string" ? result : "";
    }
    function writeText(file, body) {
        const result = UE.EasyCsv.SaveStringToFileWithFullPath(body, file);
        if (result === false) throw Error("SaveStringToFileWithFullPath returned false");
    }
    let saved = a.safe(() => UE.BlueprintPathsLibrary.ConvertRelativePathToFull(UE.BlueprintPathsLibrary.ProjectSavedDir(), ""), "");
    if (!saved) throw Error("PBZForewarn: ProjectSavedDir unavailable; startup refused");
    saved = saved.replace(/[\\/]+$/, "") + "/"; s.saved = saved;
    const configPath = saved + "PBZForewarn.txt";
    s.settings = parseSettings(a.safe(() => readText(configPath), ""));
    a.configureSemanticFallback(s.settings.SemanticFallback === true);
    a.configureGenericAttack(s.settings.GenericAttack === true);
    a.configureCastWarning(s.settings.YuZanCastWarning === true, s.settings.YuZanCastLeadMs / 1000);
    s.diagnostics = createDiagnosticStore({ enabled: s.settings.Diagnostics, now: () => Date.now() });
    const requestedObserving = s.settings.Diagnostics && s.settings.ObserveAttacks;
    let observing = false, createNativeAttackObserver = null, captureTimelineActions = null;
    // Missing/invalid optional files must not prevent the proven cue path from
    // starting, including when observations were explicitly disabled.
    s.observations = { record: () => false, snapshot: () => ({ enabled: false, events: [] }) };
    if (requestedObserving) {
        try {
            const { createObservationStore } = require("./observation-store");
            createNativeAttackObserver = require("./native-attack-observer").createNativeAttackObserver;
            captureTimelineActions = require("./timeline-observation").captureTimelineActions;
            if (typeof createNativeAttackObserver !== "function" || typeof captureTimelineActions !== "function")
                throw Error("observer-module-interface-unavailable");
            s.observations = createObservationStore({ enabled: true, session });
            if (!s.observations || typeof s.observations.record !== "function" || typeof s.observations.snapshot !== "function")
                throw Error("observer-store-interface-unavailable");
            observing = true;
        } catch (error) { diagnostic("observation-unavailable", { error: String(error), cuePipelineContinues: true }); }
    }
    function observe(kind, data) {
        if (!observing) return;
        if (s.lateRecovery && kind === "native-frame") {
            try { s.lateRecovery.recordFrame(data, data.wallTime); }
            catch (error) { diagnostic("late-recovery-error", { stage: "frame", error: String(error) }, "late-recovery-error:frame"); }
        }
        try { s.observations.record(kind, { ...(s.observationContext || {}), ...data }); }
        catch (_) { s.observationFaults++; } // optional evidence cannot change cue decisions
    }
    function profileObservation(name, fn) {
        if (!observing) return;
        const begin = Date.now();
        try { return fn(); }
        finally {
            const elapsed = Math.max(0, Date.now() - begin);
            const p = s.observationProfiles[name] || (s.observationProfiles[name] = { calls: 0, totalWallMs: 0, maxWallMs: 0, over8Ms: 0 });
            p.calls++; p.totalWallMs += elapsed; p.maxWallMs = Math.max(p.maxWallMs, elapsed);
            if (elapsed > 8) p.over8Ms++;
        }
    }
    function taskObservationContext(r) {
        if (!observing || !r) return {};
        try {
            const t = r.observationLifecycle || {};
            return { actor: t.actor || a.path(r.actor), ability: t.ability || a.path(r.ability), activation: r.activation,
                task: t.task || a.path(r.task), timeline: r.timelineKey, recordSerial: r.serial,
                observationRun: t.run || 1, identityBasis: "local-task-record-not-cross-source-strike-id",
                firstObservedTimelineTime: t.firstTimelineTime ?? null, firstObservedGameTime: t.firstGameTime ?? null,
                firstObservedWallTime: t.firstWallTime ?? null, discoverySource: r.source,
                taskTimelineTime: a.safe(() => { const n = Number(r.task.CurrentTime); return Number.isFinite(n) ? n : null; }, null) };
        } catch (_) { s.observationFaults++; return {}; }
    }
    function observeTask(r, phase, extra = {}) {
        if (!observing || !r) return;
        try { observe("task-lifecycle", { ...taskObservationContext(r), phase, ...extra, usedForScheduling: false }); }
        catch (_) { s.observationFaults++; }
    }
    function taskCallbackClock(r) {
        // A delegate can fire between JS updates or across a world boundary.
        // Keep fresh callback time separate from the previous update's binding.
        const world = a.safe(() => r.actor.GetWorld(), null), worldPath = a.path(world);
        const game = a.safe(() => UE.KismetSystemLibrary.GetGameTimeInSeconds(r.actor), NaN);
        const expectedWorld = s.observationContext && s.observationContext.worldKey.split("|")[0];
        const same = !!worldPath && worldPath === expectedWorld && Number.isFinite(game) &&
            (s.observedGameTime === null || game >= s.observedGameTime - 0.001);
        return { worldKey: same ? s.worldKey : null, clockEpoch: same ? s.clockEpoch : null,
            player: same ? s.observationContext.player : null, gameTime: Number.isFinite(game) ? game : null,
            wallTime: Date.now(), captureWorld: worldPath || null, callbackContextVerified: same,
            clockSource: Number.isFinite(game) ? "task-delegate-engine-time" : "task-delegate-clock-unavailable",
            temporalAssociation: same ? "same-world-no-observed-rewind" : "unverified-task-delegate-context" };
    }
    function beginTaskObservation(r, now, replacedSerial) {
        if (!observing) return;
        try {
            const n = a.safe(() => Number(r.task.CurrentTime), NaN);
            r.observationLifecycle = { run: 1, actor: a.path(r.actor), ability: a.path(r.ability), task: a.path(r.task),
                firstTimelineTime: Number.isFinite(n) ? n : null, firstGameTime: s.gameNow, firstWallTime: now,
                previousTimelineTime: Number.isFinite(n) ? n : null, previousGameTime: s.gameNow };
            observeTask(r, "first-observed", { replacesRecordSerial: replacedSerial || null,
                startTimeVerified: false, interpretation: "first-discovery-is-not-proof-of-task-start" });
        } catch (_) { s.observationFaults++; }
    }
    function observeBranchTransition(r, previous, current, now) {
        if (!observing || !previous || !current || previous === current || !/\.Success$/i.test(current)) return;
        try {
            const previousAbility = a.path(r.ability);
            const nextAbility = a.path(a.safe(() => r.task.Ability, null)) || previousAbility;
            observe("timeline-branch-transition", {
                ...taskObservationContext(r), actor: a.path(r.actor), ability: a.path(r.ability),
                activation: r.activation, task: a.path(r.task), previousTimeline: previous,
                nextTimeline: current, phase: "main-to-success", recordSerial: r.serial,
                transitionObservedWallTime: now, branchConfirmed: false,
                previousAbility, nextAbility,
                interpretation: "observed-timeline-switch-not-proof-of-successful-hit"
            });
        } catch (_) { s.observationFaults++; }
    }
    function observeTaskProgress(r, current) {
        if (!observing || !Number.isFinite(current) || !r.observationLifecycle) return;
        try {
            const t = r.observationLifecycle, previous = t.previousTimelineTime;
            if (previous !== null) {
                const delta = current - previous, deltaGame = s.gameNow - t.previousGameTime;
                if (delta < -0.001) {
                    t.run++;
                    observeTask(r, "timeline-rewind-observed", { previousTimelineTime: previous, currentTimelineTime: current,
                        deltaTimelineTime: delta, deltaGameTime: deltaGame, cause: "unknown-restart-or-seek" });
                } else if (delta > 0.15 && deltaGame >= 0 && delta > deltaGame * 3 + 0.1) {
                    observeTask(r, "forward-discontinuity-candidate", { previousTimelineTime: previous, currentTimelineTime: current,
                        deltaTimelineTime: delta, deltaGameTime: deltaGame, cause: "unknown-seek-rate-or-sampling" });
                }
            }
            t.previousTimelineTime = current; t.previousGameTime = s.gameNow;
        } catch (_) { s.observationFaults++; }
    }
    s.lateRecovery = s.settings.LateDodgeRecovery ? createLateWindowRecovery({
        minRemainingMs: s.settings.LateDodgeRecoveryMinRemainingMs }) : null;
    try { if (observing) s.attackObserver = createNativeAttackObserver(UE, puerts, a, { enabled: true, onRecord: observe }); }
    catch (error) { observe("observer-status", { status: "startup-failed", error: String(error) }); }
    if (!a.safe(() => UE.BlueprintPathsLibrary.FileExists(configPath), true)) {
        try { writeText(configPath, TEMPLATE); } catch (e) { diagnostic("config-write-error", { error: String(e) }); }
    }
    const contentDir = a.safe(() => UE.BlueprintPathsLibrary.ConvertRelativePathToFull(UE.BlueprintPathsLibrary.ProjectContentDir(), ""), "");
    const bankRelativePath = "PBZForewarn/PBZForewarn.bnk";
    const bankPath = contentDir ? contentDir.replace(/\\/g, "/").replace(/\/+$/, "") + "/" + bankRelativePath : "";
    s.audio = createNativeAudio(UE, a, s.settings, diagnostic, { bankPath, bankRelativePath,
        bank: bankConfig, inspectEnvironment: createAudioEnvironmentProbe(UE, a) });
    s.targetFilter = createTargetFilter(UE, puerts, a, diagnostic);
    function inputKey(name) { return a.safe(() => { const key = new UE.Key(); key.KeyName = name; return key; }, null); }
    const previewKey = inputKey("F9"), previewAltKeys = [inputKey("LeftAlt"), inputKey("RightAlt")];
    function emit(kind, event) {
        if (kind === "reset") { s.castFollowup.clear(); s.pendingCastDelivery.clear(); }
        if (kind === "cancel" && event && event.id) {
            s.castFollowup.withdrawCue(event.id); s.pendingCastDelivery.delete(event.id);
        }
        if (kind === "cancel" && event && event.id) {
            if (s.cancelledIds.has(event.id)) { s.stats.duplicateCancelsSuppressed++; return; }
            s.cancelledIds.add(event.id);
            if (s.cancelledIds.size > 65536) s.cancelledIds.delete(s.cancelledIds.values().next().value);
        }
        const entry = { seq: ++s.seq, kind, at: Date.now() };
        if (event && event.id) entry.id = String(event.id);
        if (event && event.color) entry.color = event.color;
        if (event && event.reason) entry.reason = event.reason;
        if (event && event.termination) entry.termination = event.termination;
        s.events.push(entry); while (s.events.length > 256) s.events.shift();
        s.audioEvents.push(entry);
        if (s.audioEvents.length > 256) { s.audioEvents.shift(); diagnostic("audio-queue-limit", { maximum: 256 }, "audio-queue-limit"); }
        if (kind === "cue") {
            const role = event.meta && event.meta.roleName;
            const semanticFallback = event.meta && event.meta.semanticFallback;
            const castWarning = event.meta && event.meta.castWarning;
            const recovery = event.meta && event.meta.recovery;
            observe("warning-cue", { ...taskObservationContext(s.records.get(event.taskKey)), id: event.id, actor: role ? null : event.meta && event.meta.actor,
                ability: role ? null : event.meta && event.meta.ability, activation: role ? null : event.activation,
                ownerActorCandidate: event.meta && event.meta.actor, roleActorCandidate: event.meta && event.meta.roleActor,
                task: event.meta && event.meta.task, timeline: event.timelineKey,
                action: event.meta && event.meta.action, eventKey: event.eventKey,
                color: event.color, plannedStart: event.start, observedTimelineTime: event.observedTime,
                observedRate: event.observedRate, estimatedLeadGameSeconds: event.actualLeadGameSeconds,
                soundSubmitted: false, source: recovery ? "late-window-dodge-recovery" :
                    castWarning ? "cast-warning" : semanticFallback ? "semantic-fallback" : "existing-0.5-scheduler",
                castRule: castWarning ? castWarning.ruleId : null, spellPhase: castWarning ? "cast" : null,
                fallbackRule: semanticFallback ? semanticFallback.ruleId : null,
                timingBasis: recovery ? event.meta.timingBasis : castWarning ? castWarning.timingBasis :
                    semanticFallback ? semanticFallback.timingBasis : "original-warning-node",
                executionVerified: false, usedForScheduling: true });
            if (s.settings.Diagnostics && event.meta && !recovery) {
                const id = resourceId(event.meta);
                if (!s.diagnostics.hasCatalog(id)) s.diagnostics.catalog(resourceDetail(event.meta), id, 2);
                else s.diagnostics.promote(id, 2);
            }
            const r = s.records.get(event.taskKey);
            if (r) {
                if (castWarning && s.settings.YuZanCastWarning && (s.settings.GlyphOn || s.settings.SoundOn))
                    s.pendingCastDelivery.set(event.id, followupContext(r, true));
                r.audioIds.add(event.id); if (event.eventKey) r.audioByEvent.set(event.eventKey, event.id);
                if (r.audioIds.size > 256) r.audioIds.delete(r.audioIds.values().next().value);
            }
            s.stats.cues++; diagnostic("CUE", { seq: entry.seq, ...compactEvent(event) });
            if (event.meta && event.meta.semanticFallback) s.stats.fallbackCues++;
            if (castWarning) s.stats.castCues++;
            if (recovery) s.stats.recoveryCues++;
        }
        if (kind === "cancel") {
            observe("warning-withdrawal", { ...taskObservationContext(s.records.get(event.taskKey)), id: event.id, reason: event.reason,
                termination: event.termination || null, playerHitCauseVerified: false });
            const r = event && s.records.get(event.taskKey);
            if (r) { r.audioIds.delete(event.id); r.naturalAudioIds.delete(event.id); if (event.eventKey) r.audioByEvent.delete(event.eventKey); }
            s.stats.cancels++; diagnostic("CANCEL", { seq: entry.seq, ...compactEvent(event) });
        }
    }
    s.scheduler = new Scheduler({ leadSeconds: s.settings.LeadMs / 1000, lateGrace: s.settings.LateGraceMs / 1000,
        maxGlyphSeconds: s.settings.MaxGlyphMs / 1000, onCue: e => emit("cue", e), onCancel: e => {
            // Natural glyph lifetime must not cut off the user's 4.6-second WAV.
            const r = s.records.get(e.taskKey);
            if (["event-ended", "display-expired"].includes(e.reason) || (r && r.endKind === "OnCompleted") ||
                (e.reason === "task-missing" && s.naturalCompletions.has(e.taskKey))) {
                diagnostic("glyph-ended", { id: e.id, reason: e.reason }); return;
            }
            emit("cancel", e);
        },
        onDiagnostic: (kind, data) => {
            if (kind === "missed") {
                const missed = {
                    ...taskObservationContext(s.records.get(data.taskKey)), eventKey: data.eventKey,
                    generation: data.generation, reason: data.reason, start: data.start, end: data.end, time: data.time,
                    action: data.meta && data.meta.action, color: data.meta && data.meta.color,
                    resourceId: data.meta && data.meta.resourceId,
                    executionVerified: false, interpretation: "past-plan-window-does-not-prove-executed-attack-was-missed" };
                if (s.lateRecovery) {
                    try { s.lateRecovery.recordMiss(missed, Date.now()); }
                    catch (error) { diagnostic("late-recovery-error", { stage: "miss", error: String(error) }, "late-recovery-error:miss"); }
                }
                observe("warning-missed", missed);
            }
            if (kind === "missed" && data.reason === "ineligible-through-window") {
                s.stats.conditionsNotMet++;
                if (data.meta && data.meta.previewOnly === true) s.stats.previewOnlySkipped++;
                diagnostic("condition-not-met", { ...compactEvent(data), reason: data.meta && data.meta.previewOnly === true ?
                    "editor-preview-only" : "conditions-not-met-through-window" });
            } else { if (kind === "missed") s.stats.missed++; diagnostic(kind, compactEvent(data)); }
        } });
    s.presentation = createPresentation(UE, cpp, a, s.settings, diagnostic);
    function flush(force) {
        const now = Date.now();
        if (force || now - s.lastReport >= 5000) {
            if (observing) {
                try {
                    const begin = Date.now(), snapshot = s.observations.snapshot();
                    const observationReport = { version: VERSION, session, at: now, ...snapshot,
                        faults: s.observationFaults,
                        sampling: { maxTimelineTasksPerTick: 4, maxAttackNodesPerTask: 128,
                            deferredTaskSamples: s.observationTasksDeferred, minimumTaskSampleMs: 200,
                            fairRotationByRecord: true },
                        hookImport: { session: s.observationHooksSession, lastSeq: s.observationHooksSeq,
                            rejectedRows: s.observationHookRowsRejected, importIntervalMs: 250,
                            health: s.observationHookHealth, focus: s.observationHookFocus },
                        profiles: { scope: "observation-wall-clock-steps-not-total-frame-time", steps: s.observationProfiles },
                        native: s.attackObserver ? s.attackObserver.status() : { status: "unavailable" },
                        lateRecovery: s.lateRecovery ? s.lateRecovery.status() : { enabled: false },
                        flush: { ...s.flushStats }, interpretation: "read-only observations plus scoped late-window dodge recovery" };
                    const body = JSON.stringify(observationReport), writeBegin = Date.now();
                    s.flushStats.maxObservationSerializeMs = Math.max(s.flushStats.maxObservationSerializeMs, writeBegin - begin);
                    writeText(saved + "pbzforewarn_observations.json", body);
                    s.flushStats.maxObservationWriteMs = Math.max(s.flushStats.maxObservationWriteMs, Date.now() - writeBegin);
                    s.flushStats.observationWrites++;
                } catch (error) {
                    s.flushStats.observationWriteFailures++;
                    diagnostic("observation-write-error", { error: String(error) }, "observation-write-error");
                }
            }
            const snapshot = s.diagnostics.snapshot();
            const report = { version: VERSION, session, at: now, stats: s.stats, tasks: s.records.size, actors: s.actors.length,
                hookHintsSeen: s.stats.hooks, hookBridgeAlive: s.hooksAlive, hookHealth: s.hookHealth,
                paused: s.paused, maxObservedTickGapMs: s.maxTickGap,
                settings: s.settings, target: s.targetStatus ? { mode: s.targetStatus.mode, key: s.targetStatus.key,
                    status: s.targetStatus.status, reason: s.targetStatus.reason } : null,
                audio: a.safe(() => s.audio.status(), null), lateRecovery: s.lateRecovery ? s.lateRecovery.status() : { enabled: false },
                outputEvents: s.events,
                recent: snapshot.recent, activity: snapshot.activity, retention: snapshot.retention,
                resourceCatalog: { ...snapshot.catalog, file: "pbzforewarn_resources.json" }, flush: { ...s.flushStats } };
            try {
                const serializeStart = Date.now(), body = JSON.stringify(report), writeStart = Date.now();
                s.flushStats.maxSerializeMs = Math.max(s.flushStats.maxSerializeMs, writeStart - serializeStart);
                writeText(saved + "pbzforewarn_diagnostics.json", body);
                s.flushStats.maxWriteMs = Math.max(s.flushStats.maxWriteMs, Date.now() - writeStart);
                s.flushStats.lastChars = body.length; s.flushStats.writes++; s.lastReport = now;
            }
            catch (e) { diagnostic("diagnostic-write-error", { error: String(e) }, "diag-error"); }
        }
        if (s.diagnostics.catalogDirty() && (force || now - s.lastCatalogReport >= 30000)) {
            const catalog = s.diagnostics.catalogSnapshot();
            try {
                writeText(saved + "pbzforewarn_resources.json", JSON.stringify({ runtimeVersion: VERSION, session, at: now, ...catalog }));
                s.diagnostics.markCatalogSaved(catalog.version); s.lastCatalogReport = now; s.flushStats.catalogWrites++;
            } catch (e) { diagnostic("catalog-write-error", { error: String(e) }, "catalog-write-error"); }
        }
    }
    function detach(record) {
        for (const binding of record.bindings || []) {
            try { if (a.valid(record.task)) binding.delegate.Remove(binding.callback); } catch (_) {}
        }
        record.bindings = [];
    }
    function termination(record) {
        const taskValid = a.valid(record.task), abilityValid = a.valid(record.ability);
        const active = abilityValid ? a.safe(() => record.ability.bIsActive, null) : null;
        const ending = abilityValid ? a.safe(() => record.ability.bIsAbilityEnding, null) : null;
        const current = taskValid ? a.safe(() => Number(record.task.CurrentTime), NaN) : NaN;
        return { source: record.endKind === "OnCancelled" ? "explicit-cancel" : record.endKind === "OnCompleted" ? "explicit-complete" :
            !taskValid ? "task-invalid" : !abilityValid ? "ability-invalid" : active === false ? "ability-inactive" :
            ending === true ? "ability-ending" : record.ended ? "task-ended" : "unconfirmed",
            task: shortPath(a.path(record.task)), ability: shortPath(a.path(record.ability)),
            taskValid, abilityValid, abilityActive: active, abilityEnding: ending,
            lastTimelineTime: Number.isFinite(record.lastObserved) ? record.lastObserved : null,
            currentTimelineTime: Number.isFinite(current) ? current : null,
            lastProgressAgoMs: Math.max(0, Date.now() - record.lastProgress),
            naturalWarningEndsSeen: record.naturalAudioIds.size, callback: record.endKind || null,
            playerHitCauseVerified: false };
    }
    function cancelRecordAudio(record, reason) {
        // A task leaving live collections is not evidence that an already
        // finished warning node was interrupted. Keep that cue's natural tail.
        // Explicit OnCancelled, actor filtering, pause/reset still stop it.
        const inferredEnd = reason === "task-no-longer-active" || reason === "task-generation-changed";
        for (const id of record.audioIds) {
            if (inferredEnd && record.naturalAudioIds.has(id))
                diagnostic("sound-tail-preserved", { id, task: a.path(record.task), reason: "warning-node-ended-before-task-cleanup" });
            else emit("cancel", { id, taskKey: record.key, reason, termination: termination(record) });
        }
        record.audioIds.clear(); record.audioByEvent.clear();
        record.naturalAudioIds.clear();
    }
    function clearRecords(reason = "context-reset") {
        s.castFollowup.clear();
        s.pendingCastDelivery.clear();
        for (const r of s.records.values()) { observeTask(r, "observation-boundary", { reason, dangerEndedVerified: false }); detach(r); }
        s.records.clear(); s.naturalCompletions.clear();
    }
    function hookHints(now, player) {
        if (!s.settings.Hooks || now - s.lastHookRead < 50) return;
        s.lastHookRead = now;
        s.hooksAlive = false;
        try {
            const raw = readText(saved + "pbzforewarn_hooks.json");
            if (!raw || raw.length > 262144) return;
            const payload = JSON.parse(raw);
            if (payload.version !== 1 || typeof payload.session !== "string" || !Array.isArray(payload.hints)) return;
            s.hooksAlive = payload.active === true && Math.abs(now - Number(payload.heartbeat)) < 3000;
            if (!s.hooksAlive) return;
            s.hookHealth = null;
            if (payload.health && typeof payload.health === "object" && !Array.isArray(payload.health)) {
                const health = {};
                for (const field of ["writeFailures", "openFailures", "writeOperationFailures", "closeFailures", "publishExceptions",
                    "registrationFailures", "captureFailures", "recoveries", "lastSuccessfulWriteMs", "lastErrorAtMs", "registered"])
                    health[field] = Number.isFinite(payload.health[field]) ? payload.health[field] : null;
                health.currentlyFailing = payload.health.currentlyFailing === true;
                health.lastErrorStage = typeof payload.health.lastErrorStage === "string" ? payload.health.lastErrorStage.slice(0, 80) : null;
                health.lastError = typeof payload.health.lastError === "string" ? payload.health.lastError.slice(0, 512) : null;
                s.hookHealth = { session: payload.session, ...health };
            }
            if (s.hooksSession !== payload.session) { s.hooksSession = payload.session; s.hooksSeq = 0; }
            for (const h of payload.hints) {
                if (!Number.isSafeInteger(h.seq) || h.seq <= s.hooksSeq) continue;
                s.hooksSeq = h.seq;
                if (Math.abs(now - Number(h.at)) > 3000) continue;
                s.stats.hooks++;
                const ability = typeof h.ability === "string" ? a.safe(() => UE.Object.Find(h.ability), null) : null;
                const actor = a.valid(ability) ? a.safe(() => ability.GetAvatarActorFromActorInfo(), null) :
                    typeof h.actor === "string" ? a.safe(() => UE.Object.Find(h.actor), null) : null;
                if (a.valid(actor)) s.hintedActors.set(a.path(actor), { actor, until: now + 2000 });
                const task = typeof h.task === "string" ? a.safe(() => UE.Object.Find(h.task), null) : null;
                const asc = eligibleActor(actor, player);
                if (asc && a.valid(ability) && a.valid(task) &&
                    a.safe(() => ability.bIsActive, false) === true && !a.safe(() => ability.bIsAbilityEnding, false) &&
                    a.path(a.safe(() => task.Ability, null)) === a.path(ability)) {
                    registerTask(actor, asc, ability, { task, source: "native-start-hint" }, now, now);
                }
                diagnostic("hook-hint", { ability: h.ability, task: h.task, actor: h.actor });
                s.lastDiscovery = 0;
            }
        } catch (_) { /* incomplete producer snapshot: retry without advancing seq */ }
    }
    const tags = {};
    function tag(name) { if (!tags[name]) { tags[name] = new UE.GameplayTag(); tags[name].TagName = name; } return tags[name]; }
    function hasTag(asc, name) { return a.safe(() => asc.HasMatchingGameplayTag(tag(name)), false); }
    function eligibleActor(actor, player) {
        if (!a.valid(actor) || actor === player || a.safe(() => actor.IsPlayerControlled(), true)) return null;
        if (a.safe(() => actor.GetDistanceTo(player), Infinity) > s.settings.RangeCm) return null;
        const asc = a.safe(() => actor.AbilitySystemComponent, null);
        if (!a.valid(asc) || hasTag(asc, "CharacterState.Dead")) return null;
        const friendly = a.safe(() => {
            const pf = UE.FactionUtils.GetFaction(player), af = UE.FactionUtils.GetFaction(actor), lib = UE.BlueprintGameplayTagLibrary;
            return lib.IsGameplayTagValid(pf) && lib.IsGameplayTagValid(af) && UE.FactionUtils.GetFactionRelation(player, actor) === UE.ETeamAttitude.Friendly;
        }, false);
        return friendly ? null : asc;
    }
    function registerTask(actor, asc, ability, taskInfo, stamp, now) {
        const task = taskInfo.task, tp = a.path(task), ap = a.path(ability), actorPath = a.path(actor);
        const timeline = a.safe(() => task.Timeline, null), timelineKey = a.path(timeline);
        if (!tp || !ap || !actorPath || !timelineKey) return;
        const key = actorPath + "|" + ap + "|" + tp, activation = a.activation(ability);
        let r = s.records.get(key);
        let replacedSerial = null;
        if (r && (r.task !== task || r.activation !== activation || r.timelineKey !== timelineKey)) {
            replacedSerial = r.serial;
            observeTask(r, "record-replaced", { nextActivation: activation, nextTimeline: timelineKey, dangerEndedVerified: false });
            observeBranchTransition(r, r.timelineKey, timelineKey, now);
            cancelRecordAudio(r, "task-generation-changed"); detach(r); s.records.delete(key); r = null;
        }
        if (!r) {
            if (s.records.size >= 512) { diagnostic("record-limit", { maximum: 512 }, "record-limit"); return; }
            s.naturalCompletions.delete(key);
            r = { key, actor, asc, ability, task, timeline, timelineKey, activation, bindings: [], ended: false,
                lastCompile: 0, events: [], stamp, present: true, audioIds: new Set(), audioByEvent: new Map(), naturalAudioIds: new Set(), source: taskInfo.source,
                witnessed: taskInfo.source === "native-start-hint", lastProgress: now,
                lastObserved: a.safe(() => Number(task.CurrentTime), NaN), serial: ++s.nextRecord };
            s.records.set(key, r); s.stats.tasks++;
            beginTaskObservation(r, now, replacedSerial);
            for (const name of ["OnCompleted", "OnCancelled"]) {
                try {
                    const delegate = task[name];
                    if (!delegate || typeof delegate.Add !== "function" || typeof delegate.Remove !== "function") continue;
                    const callback = () => {
                        r.ended = true; r.endKind = name; r.endedTime = a.safe(() => Number(task.CurrentTime), NaN);
                        if (observing) observeTask(r, "native-task-ended", { ...taskCallbackClock(r), callback: name,
                            termination: termination(r), dangerEndedVerified: false });
                        if (name === "OnCompleted") {
                            s.naturalCompletions.add(r.key);
                            if (s.naturalCompletions.size > 1024) s.naturalCompletions.delete(s.naturalCompletions.values().next().value);
                        }
                        if (name === "OnCancelled") for (const id of r.audioIds) emit("cancel", { id, taskKey: r.key,
                            reason: "task-cancelled", termination: termination(r) });
                        r.audioIds.clear(); r.audioByEvent.clear(); r.naturalAudioIds.clear();
                        diagnostic("task-ended-event", { task: shortPath(tp), event: name, termination: termination(r) });
                    };
                    delegate.Add(callback); r.bindings.push({ delegate, callback });
                } catch (e) { diagnostic("task-delegate-unavailable", { name, error: String(e) }, "delegate:" + name); }
            }
            diagnostic("task-found", { actor: actorPath, ability: ap, task: tp, timeline: timelineKey, activation, source: taskInfo.source });
        }
        if (r.ended && Number(task.CurrentTime) < r.endedTime - 0.001) {
            observeTask(r, "ended-task-reopened", { previousEndTime: r.endedTime, cause: "observed-time-rewind-not-proven-new-strike" });
            r.ended = false; r.endKind = ""; s.naturalCompletions.delete(key); diagnostic("task-restarted", { task: tp });
        }
        r.stamp = stamp; r.lastSeen = now; r.present = true;
        if (taskInfo.source === "native-start-hint") { r.witnessed = true; r.lastProgress = now; }
    }
    function discover(world, player, now) {
        if (now - s.lastScan >= s.settings.ScanMs) {
            const out = puerts.$ref(UE.NewArray(UE.Actor));
            UE.GameplayStatics.GetAllActorsOfClass(world, UE.PBZCharacter_NPC.StaticClass(), out);
            s.actors = a.list(puerts.$unref(out), 512); s.lastScan = now;
        }
        const actors = new Map(s.actors.map(x => [a.path(x), x]));
        for (const [key, h] of s.hintedActors) {
            if (h.until < now || !a.valid(h.actor)) s.hintedActors.delete(key); else actors.set(key, h.actor);
        }
        const stamp = now;
        for (const actor of actors.values()) {
            try {
                const asc = eligibleActor(actor, player); if (!asc) continue;
                const abilities = a.collectAbilities(asc);
                for (const ability of abilities.values()) {
                    const tasks = a.abilityTasks(ability);
                    for (const task of a.list(a.safe(() => asc.TickingTasks, null))) {
                        if (a.safe(() => task.Ability, null) !== ability || !a.valid(a.safe(() => task.Timeline, null))) continue;
                        const p = a.path(task); if (p && !tasks.has(p)) tasks.set(p, { task, source: "ticking-tasks" });
                    }
                    if (!tasks.size) diagnostic("active-ability-no-timeline", { actor: a.path(actor), ability: a.path(ability),
                        knownTaskCount: a.safe(() => asc.KnownTasks.Num(), -1) }, "no-task:" + a.path(ability));
                    for (const info of tasks.values()) registerTask(actor, asc, ability, info, stamp, now);
                }
            } catch (e) { s.stats.errors++; diagnostic("discovery-error", { actor: a.path(actor), error: String(e) }, "discover:" + a.path(actor)); }
        }
        for (const [key, r] of s.records) {
            r.present = r.stamp === stamp || (r.witnessed && !r.ended && now - r.lastProgress <= 1000);
        }
        // Reconcile before retiring old task records: a stage handoff must be
        // witnessed while both records are still available, never reconstructed
        // later from two close timestamps or a global cooldown.
        s.castFollowup.update([...s.records.values()].map(r => followupContext(r,
            r.present && !r.ended && a.valid(r.task) && a.valid(r.ability) &&
            a.safe(() => r.ability.bIsActive, false) && !a.safe(() => r.ability.bIsAbilityEnding, true))));
        for (const [key, r] of s.records) {
            if (!r.present && r.witnessed) diagnostic("native-task-stalled", { task: a.path(r.task) }, "stalled:" + r.key);
            // A temporarily unreadable/out-of-range live task keeps its history.
            // Only confirmed ending/invalid objects remove this generation.
            if (!r.present && (r.ended || !a.valid(r.task) || !a.valid(r.ability) ||
                a.safe(() => r.ability.bIsActive, null) === false || a.safe(() => r.ability.bIsAbilityEnding, false))) {
                observeTask(r, "record-retired", { termination: termination(r), dangerEndedVerified: false });
                if (r.endKind !== "OnCompleted") cancelRecordAudio(r, "task-no-longer-active");
                detach(r); s.records.delete(key);
            }
        }
        s.lastDiscovery = now;
    }
    function compile(r, now) {
        const context = { actor: a.path(r.actor), ability: a.path(r.ability), task: a.path(r.task), timeline: r.timelineKey, activation: r.activation };
        const template = templateKey(r), capture = s.settings.Diagnostics && !s.catalogedTemplates.has(template);
        const result = a.events(r.timeline, classifyEffect, r.asc, context, r.task, { captureDiagnostics: capture });
        if (capture) {
            if (!result.inventory.some(item => item.effectSource === "soft-unresolved")) s.catalogedTemplates.add(template);
            if (s.catalogedTemplates.size > 512) s.catalogedTemplates.delete(s.catalogedTemplates.values().next().value);
        }
        r.events = result.events.filter(e => s.settings.BlackOn || e.color !== "black");
        r.checks = result.checks; r.contexts = result.contexts; r.lastCompile = now;
        for (const event of r.events) {
            event.meta.resourceId = resourceId(event.meta);
            if (s.settings.Diagnostics && !s.diagnostics.hasCatalog(event.meta.resourceId))
                s.diagnostics.catalog(resourceDetail(event.meta), event.meta.resourceId, 1);
            event.meta.previewOnly = a.safe(() => {
                const container = r.checks.get(event.key).ActivationRequirements.RequireTags;
                const values = Array.isArray(container) ? container : a.list(container.GameplayTags, 128);
                return values.some(t => (typeof t === "string" ? t : a.safe(() => UE.BlueprintGameplayTagLibrary.GetTagName(t), t.TagName)) ===
                    "CharacterState.EditorDebug.Preview");
            }, false);
        }
        for (const item of result.inventory) {
            if (!resourceRelevant(item)) continue;
            s.diagnostics.catalog(resourceDetail(item), resourceId(item), item.color ? 1 : 0);
        }
        if (!r.reported) { r.reported = true; s.stats.recognized += r.events.length; diagnostic("timeline-coverage", { ...context,
            capturedInventoryCount: result.inventory.length, recognized: r.events.length,
            reason: r.events.length ? "mapped" : "no-supported-warning-node" }); }
    }
    function observeTimelineRecord(r, wall) {
            try {
                r.lastObservationSample = wall;
                if (!r.observedPlans) r.observedPlans = new Map();
                const context = { ...taskObservationContext(r), actor: a.path(r.actor), ability: a.path(r.ability), activation: r.activation,
                    task: a.path(r.task), timeline: r.timelineKey, recordSerial: r.serial,
                    taskTimelineTime: a.safe(() => Number(r.task.CurrentTime), null) };
                const candidates = captureTimelineActions(a, r.timeline, r.task, context, 128);
                for (const candidate of candidates.plans) {
                    const signature = JSON.stringify({ ...candidate, taskTimelineTime: null }), key = "attack:" + candidate.eventKey;
                    if (r.observedPlans.get(key) !== signature) {
                        r.observedPlans.set(key, signature); observe("attack-plan", candidate);
                    }
                    if (candidate.spellWarningCandidate) {
                        const spellKey = "spell:" + candidate.spellWarningCandidate + "|" + candidate.spellPhase;
                        if (r.observedPlans.get(spellKey) !== candidate.eventKey) {
                            r.observedPlans.set(spellKey, candidate.eventKey);
                            observe("spell-warning-observation", {
                                ...candidate,
                                eventKey: candidate.spellWarningCandidate + "|" + candidate.eventKey,
                                spellPhase: candidate.spellPhase, cueEnabled: false,
                                interpretation: "spell-warning-resource-candidate-not-confirmed-danger-cue"
                            });
                        }
                    }
                }
                const captureKey = JSON.stringify(candidates.status);
                if (r.observedCaptureStatus !== captureKey) {
                    r.observedCaptureStatus = captureKey;
                    observe("timeline-observer-status", { ...context, ...candidates.status });
                }
                for (const event of r.events.slice(0, 128)) {
                    const execution = r.contexts.get(event.key);
                    const role = execution && execution.roleName;
                    const semanticFallback = event.meta && event.meta.semanticFallback;
                    const castWarning = event.meta && event.meta.castWarning;
                    const plan = { ...context, actor: role ? null : context.actor,
                        ability: role ? null : context.ability, activation: role ? null : context.activation,
                        ownerActorCandidate: context.actor, roleActorCandidate: role ? a.path(execution.actor) : null,
                        action: event.meta.action, eventKey: event.key,
                        color: event.color, start: event.start, end: event.end, eligible: event.eligible,
                        source: castWarning ? "cast-warning" : semanticFallback ? "semantic-fallback" : "existing-warning-resource",
                        castRule: castWarning ? castWarning.ruleId : null, spellPhase: castWarning ? "cast" : null,
                        fallbackRule: semanticFallback ? semanticFallback.ruleId : null,
                        timingBasis: castWarning ? castWarning.timingBasis : semanticFallback ? semanticFallback.timingBasis : "timeline-warning-event",
                        executionVerified: false, usedForScheduling: true };
                    const signature = JSON.stringify({ ...plan, taskTimelineTime: null }), key = "warning:" + event.key;
                    if (r.observedPlans.get(key) !== signature) {
                        r.observedPlans.set(key, signature); observe("warning-plan", plan);
                    }
                }
            } catch (error) { observe("timeline-observer-status", { task: a.path(r.task), status: "read-failed", error: String(error) }); }
    }
    function sampleTimelineObservations(wall) {
        if (!observing) return;
        const records = [...s.records.values()], cursor = s.observationRecordCursor;
        let sampled = 0, deferred = 0;
        for (let offset = 0; offset < records.length; offset++) {
            const index = (cursor + offset) % records.length, r = records[index];
            if (r.ended || !r.present || !a.valid(r.task) || !a.valid(r.ability) || !r.events ||
                wall - (r.lastObservationSample || 0) < 200) continue;
            if (sampled >= 4) { deferred++; continue; }
            observeTimelineRecord(r, wall); sampled++;
            s.observationRecordCursor = (index + 1) % records.length;
        }
        s.observationTasksDeferred += deferred;
    }
    function observationHints(wall, world, player) {
        if (!observing || !s.settings.Hooks || wall - s.lastObservationHookRead < 250) return;
        s.lastObservationHookRead = wall;
        const failure = reason => {
            if (s.observerImportFailure !== reason) observe("observer-hook-status", { status: reason });
            s.observerImportFailure = reason;
        };
        try {
            const raw = readText(saved + "pbzforewarn_observer_hooks.json");
            if (!raw) { failure("snapshot-unavailable"); return; }
            if (raw.length > 2 * 1024 * 1024) { failure("snapshot-too-large"); return; }
            if (raw === s.observationLastRaw && !s.observerImportFailure) return;
            const payload = JSON.parse(raw);
            if (![1, 2].includes(payload.schemaVersion) || typeof payload.session !== "string" ||
                !payload.session || payload.session.length > 256 || !Number.isSafeInteger(payload.seq) || payload.seq < 0 ||
                !Array.isArray(payload.events) || payload.events.length > 512) { failure("snapshot-invalid"); return; }
            const dictionary = payload.schemaVersion === 2 ? payload.pathDictionary : null;
            if (payload.schemaVersion === 2 && (!dictionary || typeof dictionary !== "object" || Array.isArray(dictionary) ||
                Object.keys(dictionary).length > 2048 || Object.entries(dictionary).some(([key, value]) =>
                    !/^[1-9]\d*$/.test(key) || typeof value !== "string" || value.length > 4096 || value[0] !== "/"))) {
                failure("snapshot-dictionary-invalid"); return;
            }
            function decodeRow(input) {
                let nodes = 0, chars = 0;
                function visit(value, depth) {
                    if (++nodes > 2048 || depth > 16) throw Error("expanded-row-budget");
                    if (typeof value === "string") {
                        chars += value.length; if (chars > 65536 || value.length > 4096) throw Error("expanded-row-strings");
                        return value;
                    }
                    if (value === null || typeof value !== "object") return value;
                    const keys = Object.keys(value);
                    if (Object.prototype.hasOwnProperty.call(value, "$path")) {
                        if (keys.length !== 1 || !Number.isSafeInteger(value.$path) || value.$path < 1 ||
                            !dictionary || !Object.prototype.hasOwnProperty.call(dictionary, String(value.$path))) throw Error("unresolved-path-reference");
                        return visit(dictionary[String(value.$path)], depth + 1);
                    }
                    if (keys.length > 128) throw Error("expanded-row-fields");
                    if (Array.isArray(value)) return value.map(x => visit(x, depth + 1));
                    const result = Object.create(null);
                    for (const key of keys) result[key] = visit(value[key], depth + 1);
                    return result;
                }
                return visit(input, 0);
            }
            if (payload.active !== true || !Number.isFinite(payload.heartbeat) || Math.abs(wall - payload.heartbeat) > 3000) {
                failure("snapshot-inactive-or-stale"); return;
            }
            if (s.observationHooksSession !== payload.session) {
                s.observationHooksSession = payload.session; s.observationHooksSeq = 0;
                s.observationFocusSeqs.clear();
                observe("observer-hook-session", { hookSession: payload.session, health: payload.health, retention: payload.retention });
            }
            s.observationHookHealth = payload.health || null;
            s.observationHookFocus = payload.focusRetention || null;
            for (let item of payload.events) {
                if (!item || !["timeline-call", "warning-call"].includes(item.kind) ||
                    !["pre", "post", "call"].includes(item.phase) || !Number.isSafeInteger(item.seq) ||
                    item.seq < 1 || item.seq > payload.seq) { s.observationHookRowsRejected++; continue; }
                if (!item || !Number.isSafeInteger(item.seq) || item.seq <= s.observationHooksSeq) continue;
                try { if (payload.schemaVersion === 2) item = decodeRow(item); }
                catch (_) { s.observationHookRowsRejected++; continue; }
                if (item.seq !== s.observationHooksSeq + 1) observe("observer-hook-gap", {
                    expected: s.observationHooksSeq + 1, actual: item.seq, hookSession: payload.session, retention: payload.retention });
                s.observationHooksSeq = item.seq;
                const context = item.context || {};
                const captureWorld = context.world || item.captureWorld || "";
                const captureMatches = !!captureWorld && captureWorld === a.path(world);
                // Keep original callback evidence. Current JS clock/player must
                // never impersonate the time/player of a queued Lua callback.
                observe(item.kind === "warning-call" ? "native-warning-call" : "timeline-call", {
                    worldKey: null, player: null, clockEpoch: null,
                    importedWorldKey: s.worldKey, importedPlayer: a.path(player), importedClockEpoch: s.clockEpoch,
                    gameTime: null, wallTime: null, importedGameTime: s.gameNow, importedWallTime: wall,
                    actor: typeof context.actor === "string" ? context.actor : null,
                    ability: typeof context.ability === "string" ? context.ability : null,
                    activation: typeof context.activation === "string" || Number.isSafeInteger(context.activation) ? context.activation : null,
                    task: context.task || null, timeline: context.timeline || null, action: context.action || null,
                    hookSession: payload.session, hookSeq: item.seq, captureWorld,
                    captureWorldMatchesImportedWorld: captureMatches, capture: item,
                    source: "lua-native-call-observer", usedForScheduling: false,
                    temporalAssociation: "unverified-callback-clock-and-player-context" });
            }
            if (payload.schemaVersion === 2 && Array.isArray(payload.focusSummaries) && payload.focusSummaries.length <= 64) {
                for (let focus of payload.focusSummaries) {
                    const validCallId = focus && (typeof focus.callId === "string" && focus.callId.length > 0 && focus.callId.length <= 256 ||
                        Number.isSafeInteger(focus.callId) && focus.callId > 0);
                    if (!validCallId || !Number.isSafeInteger(focus.lastSeq) || focus.lastSeq < 1 || focus.lastSeq > payload.seq) {
                        s.observationHookRowsRejected++; continue;
                    }
                    if ((s.observationFocusSeqs.get(focus.callId) || 0) >= focus.lastSeq) continue;
                    try { focus = decodeRow(focus); } catch (_) { s.observationHookRowsRejected++; continue; }
                    observe("focused-call-summary", { worldKey: null, player: null, clockEpoch: null, gameTime: null, wallTime: null,
                        importedWorldKey: s.worldKey, importedPlayer: a.path(player), importedClockEpoch: s.clockEpoch,
                        importedWallTime: wall, actor: typeof focus.actor === "string" ? focus.actor : null,
                        ability: typeof focus.ability === "string" ? focus.ability : null,
                        hookSession: payload.session, hookSeq: focus.lastSeq, capture: focus,
                        source: "lua-focused-summary-not-new-call", usedForScheduling: false });
                    s.observationFocusSeqs.set(focus.callId, focus.lastSeq);
                    if (s.observationFocusSeqs.size > 128) s.observationFocusSeqs.delete(s.observationFocusSeqs.keys().next().value);
                }
            }
            if (s.observerImportFailure) observe("observer-hook-status", { status: "recovered", previous: s.observerImportFailure });
            s.observerImportFailure = "";
            s.observationLastRaw = raw;
        } catch (error) { failure("snapshot-read-failed:" + String(error).slice(0, 160)); }
    }
    function tick() {
        if (s.stopped || s.ticking) return;
        s.ticking = true;
        const wall = Date.now();
        try {
            if (s.lastTickWall) {
                const gap = wall - s.lastTickWall; s.maxTickGap = Math.max(s.maxTickGap, gap);
                if (gap > 100 && wall - s.lastLongTick > 1000) { diagnostic("tick-gap", { ms: gap }); s.lastLongTick = wall; }
            }
            s.lastTickWall = wall;
            const gi = puerts.argv.getByName("GameInstance");
            const pc = a.valid(gi) ? UE.GameplayStatics.GetPlayerController(gi, 0) : null;
            const world = a.valid(pc) ? pc.GetWorld() : null;
            const player = a.valid(world) ? UE.GameplayStatics.GetPlayerPawn(world, 0) : null;
            const wk = a.path(world) + "|" + a.path(player);
            const playerASC = a.safe(() => player.AbilitySystemComponent, null);
            const paused = !a.valid(world) || !a.valid(player) || !a.valid(playerASC) ||
                a.safe(() => UE.GameplayStatics.IsGamePaused(world), true) || hasTag(playerASC, "CharacterState.Dead") || hasTag(playerASC, "CharacterState.InLevelSequence");
            if (wk !== s.worldKey) {
                if (s.worldKey) emit("reset");
                clearRecords(); s.actors = []; s.hintedActors.clear(); s.lastScan = s.lastDiscovery = 0; s.worldKey = wk;
            }
            if (paused !== s.paused) diagnostic("state", { paused });
            s.paused = paused;
            if (paused) s.castFollowup.clear();
            const targetStatus = s.targetFilter.read(player, s.settings.OnlyLockedTarget);
            if (s.settings.OnlyLockedTarget && s.targetStatus && targetStatus.key !== s.targetStatus.key) emit("reset", { reason: "lock-target-change" });
            s.targetStatus = targetStatus;
            const gameNow = a.valid(world) ? UE.KismetSystemLibrary.GetGameTimeInSeconds(world) : 0;
            if (!Number.isFinite(gameNow)) throw Error("non-finite game clock");
            s.gameNow = gameNow;
            const rewind = s.observedGameTime !== null && gameNow < s.observedGameTime - 0.001;
            if (!s.observationContext || s.observationContext.worldKey !== wk || rewind) {
                s.castFollowup.clear();
                s.clockEpoch++;
                for (const record of s.records.values()) record.observedPlans = null;
                observe("observer-reset", { previousWorldKey: s.observationContext && s.observationContext.worldKey,
                    nextWorldKey: wk, nextClockEpoch: s.clockEpoch, reason: rewind ? "game-clock-rewind" : "world-or-player-change" });
            }
            s.observedGameTime = gameNow;
            s.observationContext = { worldKey: wk, player: a.path(player), clockEpoch: s.clockEpoch,
                gameTime: gameNow, wallTime: wall };
            if (s.attackObserver) {
                try { profileObservation("native-update", () => s.attackObserver.update({ world, player, worldKey: wk, gameTime: gameNow, wallTime: wall,
                    paused, clockEpoch: s.clockEpoch })); }
                catch (error) { observe("observer-status", { status: "update-failed", error: String(error) }); }
            }
            profileObservation("lua-import", () => observationHints(wall, world, player));
            const samples = [];
            if (!paused) {
                hookHints(wall, player);
                if (wall - s.lastDiscovery >= s.settings.DiscoverMs) discover(world, player, wall);
                for (const r of s.records.values()) {
                    try {
                        if (r.ended || !a.valid(r.task) || !a.valid(r.ability) ||
                            a.safe(() => r.ability.bIsActive, null) === false || a.safe(() => r.ability.bIsAbilityEnding, false)) {
                            if (r.endKind !== "OnCompleted") cancelRecordAudio(r, "task-no-longer-active");
                            continue;
                        }
                        const current = Number(r.task.CurrentTime);
                        observeTaskProgress(r, current);
                        if (Number.isFinite(current) && current !== r.lastObserved) {
                            r.lastProgress = wall; r.lastObserved = current;
                            if (r.witnessed) r.present = true;
                        }
                        if (!r.present || !eligibleActor(r.actor, player)) {
                            // Stop any still-playing tail even after its glyph ended.
                            cancelRecordAudio(r, "actor-filtered"); samples.push({ key: r.key, suspended: true }); continue;
                        }
                        if (wall - r.lastCompile >= 200) compile(r, wall);
                        if (!Number.isFinite(current)) { samples.push({ key: r.key, suspended: true }); continue; }
                        // Re-evaluate only recognized actions' tag conditions on every
                        // sample. Inventory/soft-reference resolution refreshes at 200ms.
                        const freshEvents = r.events.map(event => {
                            const context = r.contexts && r.contexts.get(event.key);
                            const role = context && context.roleName;
                            const executionActor = context && context.actor ? context.actor : r.actor;
                            const targetAllowed = s.targetFilter.allows(executionActor, s.targetStatus);
                            const blackAllowed = event.color !== "black" || a.safe(() => UE.ETeamAttitude.Hostile !== undefined &&
                                UE.FactionUtils.GetFactionRelation(executionActor, player) === UE.ETeamAttitude.Hostile, false);
                            const semanticType = event.meta && event.meta.semanticFallback ?
                                a.semanticFallbackEligibility(r.checks.get(event.key)) : null;
                            const castCheck = event.meta && event.meta.castWarning ? a.castWarningEligibility(r.checks.get(event.key), {
                                actor: a.path(executionActor), ability: a.path(r.ability),
                                timeline: a.path(a.safe(() => r.task.Timeline, null)) }) : null;
                            const check = context && context.reason ? { eligible: false, reason: context.reason } :
                                !targetAllowed ? { eligible: false, reason: "not-locked-target" } :
                                !blackAllowed ? { eligible: false, reason: "black-not-confirmed-hostile" } :
                                role && (!a.valid(context.actor) || !eligibleActor(context.actor, player)) ?
                                { eligible: false, reason: "role-not-eligible" } :
                                semanticType && !semanticType.eligible ? semanticType :
                                castCheck && !castCheck.eligible ? castCheck :
                                a.requirements(r.checks.get(event.key), context ? context.asc : r.asc);
                            const audioId = r.audioByEvent.get(event.key);
                            if (audioId && check.eligible && current >= event.end) r.naturalAudioIds.add(audioId);
                            if (!check.eligible) {
                                if (audioId && (current < event.end || (event.start === event.end && current <= event.start)))
                                    emit("cancel", { id: audioId, taskKey: r.key, eventKey: event.key, reason: "execution-ineligible:" + check.reason });
                                if (s.settings.Diagnostics) {
                                if (!r.requirementEvidence) r.requirementEvidence = new Map();
                                let cached = r.requirementEvidence.get(event.key);
                                if (!cached || cached.reason !== check.reason) {
                                    cached = { at: wall, reason: check.reason, evidence: a.safe(() => a.requirements(
                                        r.checks.get(event.key), context ? context.asc : r.asc, { captureEvidence: true }), check) };
                                    r.requirementEvidence.set(event.key, cached);
                                }
                                const evidence = cached.evidence;
                                diagnostic("eligibility", { task: shortPath(a.path(r.task)), resourceId: event.meta.resourceId, reason: check.reason,
                                    requirementsEvidence: evidence.requirementsEvidence || evidence.evidence || evidence },
                                    "eligibility:" + r.serial + ":" + event.key + ":" + check.reason);
                                }
                            }
                            return { ...event, eligible: check.eligible };
                        }).filter(event => {
                            const suppression = s.settings.YuZanCastWarning &&
                                s.castFollowup.suppression({ ...followupContext(r, true),
                                    timeline: a.path(a.safe(() => r.task.Timeline, null)) }, event);
                            if (!suppression) return true;
                            if (!r.followupSuppressed) r.followupSuppressed = new Set();
                            if (!r.followupSuppressed.has(event.key)) {
                                r.followupSuppressed.add(event.key); s.stats.followupSuppressed++;
                                const info = { ...taskObservationContext(r), action: event.meta.action, eventKey: event.key,
                                    color: event.color, ...suppression, source: "cast-followup-policy", usedForScheduling: false };
                                diagnostic("followup-suppressed", info); observe("warning-suppressed", info);
                            }
                            return false;
                        });
                        samples.push({ key: r.key, activation: r.activation, timelineKey: r.timelineKey, time: current, events: freshEvents });
                    } catch (e) {
                        samples.push({ key: r.key, suspended: true }); s.stats.errors++;
                        diagnostic("task-read-error", { task: a.path(r.task), error: String(e) }, "task-error:" + r.key);
                    }
                }
            }
            if (s.lateRecovery) {
                try {
                    samples.push(...s.lateRecovery.samples({ now: Number(gameNow), wall, paused,
                        allowActor: actor => !s.settings.OnlyLockedTarget ||
                            !!(s.targetStatus && s.targetStatus.status === "locked" && s.targetStatus.key === actor) }));
                } catch (error) {
                    diagnostic("late-recovery-error", { stage: "samples", error: String(error) }, "late-recovery-error:samples");
                }
            }
            const result = s.scheduler.step({ now: Number(gameNow), wall, paused, worldKey: wk, tasks: samples });
            const previewDown = a.valid(pc) && previewKey ? a.safe(() => pc.IsInputKeyDown(previewKey), false) : false;
            const previewAltDown = a.valid(pc) && previewAltKeys.some(key => key && a.safe(() => pc.IsInputKeyDown(key), false));
            // Trigger on a new F9 press while Alt is held; toggling Alt during
            // a held F9 must not repeat the preview.
            if (previewDown && !s.previewDown && previewAltDown && !paused) {
                s.audioEvents.push({ kind: "cue", id: "preview-" + (++s.previewSerial), color: "red", at: wall, preview: true });
                diagnostic("audio-preview", { key: "Alt+F9" });
            }
            s.previewDown = previewDown;
            const audioEvents = s.audioEvents.splice(0);
            try { s.audio.update({ world, player, worldKey: wk, paused }, audioEvents); }
            catch (e) { s.audio.dispose(); diagnostic("audio-update-error", { error: String(e) }, "audio-update-error"); }
            try {
                const rendered = s.presentation.update(world, result.active, paused);
                // presentation.update proves a HUD render call succeeded for the
                // active list. Audio is acknowledged separately in diagnostic().
                if (!paused) for (const active of Array.isArray(rendered) ? rendered : []) acceptCastDelivery(active.id);
            }
            catch (e) {
                s.presentation.dispose(); diagnostic("hud-update-error", { error: String(e) }, "hud-update-error");
            }
            // A failed tick must not leave an old request waiting to be credited
            // by an unrelated later output. Audio acknowledgements are synchronous.
            s.pendingCastDelivery.clear();
            if (!paused) {
                try { profileObservation("timeline-sample", () => sampleTimelineObservations(wall)); }
                catch (error) { observe("timeline-observer-status", { status: "sampling-failed", error: String(error) }); }
            }
            flush(false);
        } catch (e) {
            s.stats.errors++; s.paused = true;
            diagnostic("runtime-error", { error: String(e) }, "runtime-error");
            s.scheduler.step({ now: s.gameNow, wall, paused: true, worldKey: s.worldKey, tasks: [] });
            s.audioEvents.length = 0;
            try { s.audio.update({ world: null, player: null, worldKey: s.worldKey, paused: true }, []); } catch (_) { s.audio.dispose(); }
            try { s.presentation.update(null, [], true); } catch (_) {}
            flush(false);
        } finally { s.ticking = false; }
    }
    s.shutdown = () => {
        s.stopped = true; clearInterval(s.timer);
        if (s.attackObserver) { try { s.attackObserver.dispose(); } catch (_) { s.observationFaults++; } }
        s.scheduler.step({ now: 0, wall: Date.now(), paused: true, worldKey: "stop", tasks: [] });
        emit("reset"); s.paused = true; clearRecords(); s.presentation.dispose(); s.audio.dispose(); s.audioEvents.length = 0;
        diagnostic("STOP", { stats: s.stats }); flush(true);
    };
    state = s;
    log("START", { version: VERSION, session, saved, settings: s.settings,
        architecture: "0.5 cue pipeline + bounded observations + late-window dodge recovery" });
    flush(true);
    s.timer = setInterval(tick, s.settings.TickMs);
}
function stop() { if (state) { const old = state; state = null; old.shutdown(); } }
exports.start = start; exports.stop = stop; exports.parseSettings = parseSettings;
start();
