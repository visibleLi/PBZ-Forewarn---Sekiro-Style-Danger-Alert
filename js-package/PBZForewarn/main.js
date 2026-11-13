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
const VERSION = "0.5.0-release.2";
const DEFAULTS = { LeadMs: 350, RangeCm: 3500, TickMs: 16, DiscoverMs: 50, ScanMs: 250,
    LateGraceMs: 80, MaxGlyphMs: 1200, GlyphOn: true, GlyphFontSize: 120, GlyphY: 0.32,
    Diagnostics: true, Hooks: true, BlackOn: true, OnlyLockedTarget: false, SoundOn: true, SoundVolume: 0.8,
    FontPath: "/Game/PBZContent/UI/Fonts/ZH_ZiKuTangKuangShanKaiShuJF_Font.ZH_ZiKuTangKuangShanKaiShuJF_Font" };
const TEMPLATE = "# PBZForewarn 0.5; edit then restart game or Alt+F5\n" +
    "# Extra cue lead in GAME seconds (ms input); original warning is unchanged.\n" +
    "LeadMs=350\nRangeCm=3500\nBlackOn=1\nOnlyLockedTarget=0\nSoundOn=1\nSoundVolume=0.8\nGlyphOn=1\nGlyphFontSize=120\nGlyphY=0.32\nDiagnostics=1\nHooks=1\n";
let state = null;
function log(kind, data) { console.log("[PBZMOD] [Forewarn] " + kind + " " + JSON.stringify(data)); }
function parseSettings(text) {
    const result = { ...DEFAULTS };
    const bounds = { LeadMs: [0, 1000], RangeCm: [500, 10000], TickMs: [16, 100], DiscoverMs: [16, 250], ScanMs: [100, 1000],
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
        paused: true, stats: { cues: 0, cancels: 0, duplicateCancelsSuppressed: 0, missed: 0, conditionsNotMet: 0,
            previewOnlySkipped: 0, recognized: 0, tasks: 0, hooks: 0, errors: 0 },
        lastTickWall: 0, maxTickGap: 0, lastLongTick: 0, gameNow: 0, naturalCompletions: new Set(),
        targetStatus: null, previewDown: true, previewSerial: 0,
        cancelledIds: new Set(), resourceIds: new Map(), resourceSerial: 0, catalogedTemplates: new Set(),
        lastCatalogReport: 0, flushStats: { writes: 0, catalogWrites: 0, lastChars: 0, maxWriteMs: 0, maxSerializeMs: 0 } };
    s.diagnostics = createDiagnosticStore({ now: () => Date.now() });
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
            attackSemantics: item.attackSemantics || null, reason: item.reason,
            detailLevel: item.requirementsEvidence || item.attackSemantics ? "full" : "compact" };
    }
    function compactEvent(data) {
        const result = { ...data }; delete result.meta;
        if (data && data.meta) {
            result.resourceId = resourceId(data.meta);
            result.ability = shortPath(data.meta.ability); result.actor = shortPath(data.meta.actor);
            result.actionClass = data.meta.actionClass;
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
        if (onceKey) {
            const previous = s.once.get(onceKey);
            if (previous && Date.now() - previous < 10000) return;
            s.once.set(onceKey, Date.now());
            if (s.once.size > 4096) s.once.delete(s.once.keys().next().value);
        }
        s.diagnostics.record(kind, data);
        if (!["inventory", "eligibility", "task-found", "hook-hint", "rate-jump", "active-ability-no-timeline", "timeline-coverage"].includes(kind)) log(kind, data);
    }
    const a = createAdapter(UE, puerts, (k, d) => diagnostic(k, d, k + JSON.stringify(d)));
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
    s.diagnostics = createDiagnosticStore({ enabled: s.settings.Diagnostics, now: () => Date.now() });
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
            if (s.settings.Diagnostics && event.meta) {
                const id = resourceId(event.meta);
                if (!s.diagnostics.hasCatalog(id)) s.diagnostics.catalog(resourceDetail(event.meta), id, 2);
                else s.diagnostics.promote(id, 2);
            }
            const r = s.records.get(event.taskKey);
            if (r) {
                r.audioIds.add(event.id); if (event.eventKey) r.audioByEvent.set(event.eventKey, event.id);
                if (r.audioIds.size > 256) r.audioIds.delete(r.audioIds.values().next().value);
            }
            s.stats.cues++; diagnostic("CUE", { seq: entry.seq, ...compactEvent(event) });
        }
        if (kind === "cancel") {
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
            const snapshot = s.diagnostics.snapshot();
            const report = { version: VERSION, session, at: now, stats: s.stats, tasks: s.records.size, actors: s.actors.length,
                hookHintsSeen: s.stats.hooks, hookBridgeAlive: s.hooksAlive, hookHealth: s.hookHealth,
                paused: s.paused, maxObservedTickGapMs: s.maxTickGap,
                settings: s.settings, target: s.targetStatus ? { mode: s.targetStatus.mode, key: s.targetStatus.key,
                    status: s.targetStatus.status, reason: s.targetStatus.reason } : null,
                audio: a.safe(() => s.audio.status(), null), outputEvents: s.events,
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
    function clearRecords() {
        for (const r of s.records.values()) detach(r);
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
        if (r && (r.task !== task || r.activation !== activation || r.timelineKey !== timelineKey)) {
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
            for (const name of ["OnCompleted", "OnCancelled"]) {
                try {
                    const delegate = task[name];
                    if (!delegate || typeof delegate.Add !== "function" || typeof delegate.Remove !== "function") continue;
                    const callback = () => {
                        r.ended = true; r.endKind = name; r.endedTime = a.safe(() => Number(task.CurrentTime), NaN);
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
            if (!r.present && r.witnessed) diagnostic("native-task-stalled", { task: a.path(r.task) }, "stalled:" + r.key);
            // A temporarily unreadable/out-of-range live task keeps its history.
            // Only confirmed ending/invalid objects remove this generation.
            if (!r.present && (r.ended || !a.valid(r.task) || !a.valid(r.ability) ||
                a.safe(() => r.ability.bIsActive, null) === false || a.safe(() => r.ability.bIsAbilityEnding, false))) {
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
            const targetStatus = s.targetFilter.read(player, s.settings.OnlyLockedTarget);
            if (s.settings.OnlyLockedTarget && s.targetStatus && targetStatus.key !== s.targetStatus.key) emit("reset", { reason: "lock-target-change" });
            s.targetStatus = targetStatus;
            const gameNow = a.valid(world) ? UE.KismetSystemLibrary.GetGameTimeInSeconds(world) : 0;
            if (!Number.isFinite(gameNow)) throw Error("non-finite game clock");
            s.gameNow = gameNow;
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
                            const check = context && context.reason ? { eligible: false, reason: context.reason } :
                                !targetAllowed ? { eligible: false, reason: "not-locked-target" } :
                                !blackAllowed ? { eligible: false, reason: "black-not-confirmed-hostile" } :
                                role && (!a.valid(context.actor) || !eligibleActor(context.actor, player)) ?
                                { eligible: false, reason: "role-not-eligible" } :
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
                        });
                        samples.push({ key: r.key, activation: r.activation, timelineKey: r.timelineKey, time: current, events: freshEvents });
                    } catch (e) {
                        samples.push({ key: r.key, suspended: true }); s.stats.errors++;
                        diagnostic("task-read-error", { task: a.path(r.task), error: String(e) }, "task-error:" + r.key);
                    }
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
            try { s.presentation.update(world, result.active, paused); }
            catch (e) {
                s.presentation.dispose(); diagnostic("hud-update-error", { error: String(e) }, "hud-update-error");
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
        s.scheduler.step({ now: 0, wall: Date.now(), paused: true, worldKey: "stop", tasks: [] });
        emit("reset"); s.paused = true; clearRecords(); s.presentation.dispose(); s.audio.dispose(); s.audioEvents.length = 0;
        diagnostic("STOP", { stats: s.stats }); flush(true);
    };
    state = s;
    log("START", { version: VERSION, session, saved, settings: s.settings, architecture: "timeline + verified-black-action + independent-wwise-bank + optional-lock-filter" });
    flush(true);
    s.timer = setInterval(tick, s.settings.TickMs);
}
function stop() { if (state) { const old = state; state = null; old.shutdown(); } }
exports.start = start; exports.stop = stop; exports.parseSettings = parseSettings;
start();
