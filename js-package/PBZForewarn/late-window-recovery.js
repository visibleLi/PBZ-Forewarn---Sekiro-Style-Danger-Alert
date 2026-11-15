"use strict";

// Recover only when the timeline reported an already-expired warning node and
// the game later supplies a matching dodge-only incoming frame with future hit
// time. This module never reads game objects and never invents an attack type.
const DEFAULTS = Object.freeze({ ttlMs: 2000, minRemainingMs: 100, maxRecords: 64 });
const color = value => ["red", "blue", "black"].includes(value) ? value : null;
const path = value => typeof value === "string" && value.length > 0 && value.length <= 2048 ? value : null;
const activation = value => typeof value === "string" && value.length > 0 && value.length <= 64
    ? value : Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
const finite = value => typeof value === "number" && Number.isFinite(value) ? value : null;

function createLateWindowRecovery(options = {}) {
    const enabled = options.enabled !== false;
    const ttlMs = Math.max(250, Math.min(5000, Number.isFinite(options.ttlMs) ? options.ttlMs : DEFAULTS.ttlMs));
    const minRemainingMs = Math.max(0, Math.min(2000,
        Number.isFinite(options.minRemainingMs) ? options.minRemainingMs : DEFAULTS.minRemainingMs));
    const maxRecords = Math.max(8, Math.min(128,
        Number.isSafeInteger(options.maxRecords) ? options.maxRecords : DEFAULTS.maxRecords));
    const misses = new Map(), frames = new Map(), emitted = new Map();
    const counters = { misses: 0, frames: 0, matched: 0, ambiguous: 0, expired: 0, duplicates: 0, rejected: 0 };
    const source = value => [value.actor, value.ability, value.activation, value.timeline, value.action].join("|");
    function trim(map) {
        while (map.size > maxRecords) map.delete(map.keys().next().value);
    }
    function cleanup(now) {
        for (const [key, value] of misses) if (now - value.wall > ttlMs) { misses.delete(key); counters.expired++; }
        for (const [key, value] of frames) if (now - value.wall > ttlMs) { frames.delete(key); counters.expired++; }
        for (const [key, wall] of emitted) if (now - wall > ttlMs) emitted.delete(key);
    }
    function recordMiss(input = {}, wall = Date.now()) {
        if (!enabled || input.reason !== "past-window") return false;
        const miss = { wall: finite(wall) ?? Date.now(), actor: path(input.actor), ability: path(input.ability),
            activation: activation(input.activation), timeline: path(input.timeline), action: path(input.action), task: path(input.task),
            color: color(input.color), resourceId: path(input.resourceId), generation: finite(input.generation) };
        if (!miss.actor || !miss.ability || miss.activation === null || !miss.timeline || !miss.action || !miss.color) {
            counters.rejected++; return false;
        }
        miss.key = source(miss);
        if (misses.has(miss.key)) counters.duplicates++;
        misses.set(miss.key, miss); counters.misses++; trim(misses); cleanup(miss.wall);
        return true;
    }
    function recordFrame(input = {}, wall = Date.now()) {
        if (!enabled) return false;
        const incoming = input.source === "receive-map" || String(input.source || "").startsWith("event:");
        const frame = { wall: finite(wall) ?? Date.now(), id: path(input.id), actor: path(input.actor),
            ability: path(input.ability), activation: activation(input.activation), timeline: path(input.timeline),
            action: path(input.action), taskCandidate: path(input.taskCandidate), gameTime: finite(input.gameTime),
            hitGameTime: finite(input.hitGameTime), remaining: finite(input.remainingGameSeconds),
            isDodge: input.isDodge === true, isHit: input.isHit === true };
        if (!incoming || !frame.isDodge || frame.isHit || !frame.actor || !frame.ability ||
            frame.activation === null || !frame.timeline || !frame.action || frame.gameTime === null ||
            frame.hitGameTime === null || frame.hitGameTime <= frame.gameTime || frame.remaining === null) {
            counters.rejected++; return false;
        }
        frame.key = [source(frame), frame.hitGameTime, frame.id || ""].join("|");
        if (frames.has(frame.key)) counters.duplicates++;
        frames.set(frame.key, frame); counters.frames++; trim(frames); cleanup(frame.wall);
        return true;
    }
    function match(frame, now) {
        const miss = misses.get(source(frame));
        if (!miss) return null;
        if (miss.task && frame.taskCandidate && miss.task !== frame.taskCandidate) return null;
        if ((frame.hitGameTime - now) * 1000 < minRemainingMs) return null;
        return miss;
    }
    function samples(context = {}) {
        if (!enabled || context.paused === true) return [];
        const now = finite(context.now);
        const wall = finite(context.wall) ?? Date.now();
        if (now === null) return [];
        cleanup(wall);
        const result = [];
        for (const [key, frame] of frames) {
            const miss = match(frame, now);
            if (!miss || result.length >= 8) continue;
            if (typeof context.allowActor === "function" && context.allowActor(frame.actor) !== true) continue;
            const hitKey = [source(frame), miss.color, frame.hitGameTime].join("|");
            if (emitted.has(hitKey)) { counters.duplicates++; frames.delete(key); continue; }
            emitted.set(hitKey, wall); trim(emitted);
            frames.delete(key); misses.delete(miss.key); counters.matched++;
            result.push({ key: "late-window-" + hitKey, activation: frame.activation, timelineKey: frame.timeline,
                time: now, rateHint: 1, events: [{ key: "late-window:" + hitKey, color: miss.color,
                    start: now, end: frame.hitGameTime, leadSeconds: 0, eligible: true,
                    meta: { actor: frame.actor, ability: frame.ability, action: null, task: frame.taskCandidate,
                        timeline: frame.timeline, resourceId: miss.resourceId, source: "late-window-dodge-recovery", recovery: true,
                        timingBasis: "past-window-node-plus-incoming-dodge-frame",
                        nativeGameTime: frame.gameTime, hitGameTime: frame.hitGameTime,
                        remainingGameMs: frame.remaining * 1000 } }] });
        }
        return result;
    }
    function status() {
        return { enabled, misses: misses.size, frames: frames.size, emitted: emitted.size, counters: { ...counters } };
    }
    return { recordMiss, recordFrame, samples, status };
}

module.exports = { createLateWindowRecovery };
