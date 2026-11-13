'use strict';

// This file never reads or writes Unreal objects. All times are supplied by the
// runtime adapter. `start` and `end` already include the event trigger offsets.
function classifyEffect(path) {
    if (typeof path !== 'string') return null;
    const clean = path.trim().replace(/\\/g, '/');
    const match = /^\/PBZVFXPack\/VFX\/BattleFX\/(.+)\/([^/.]+)(?:\.([^/]+))?$/i.exec(clean);
    if (!match || /(?:^|\/)Hun(?:\/|$)/i.test(match[1])) return null;
    const name = match[2];
    if (/(?:^|_)Hun(?:_|$)/i.test(name)) return null;
    if (match[3] && match[3].toLowerCase() !== name.toLowerCase()) return null;
    const color = /^NS_(?:[A-Za-z0-9]+_)*AttackAlert_(Red|Blue)_\d+$/i.exec(name);
    return color ? color[1].toLowerCase() : null;
}

const finite = value => typeof value === 'number' && Number.isFinite(value);
const TIME_EPSILON = 1e-9;
const validRate = value => finite(value) && value > 0.01 && value < 20;
const identity = value => value == null ? '' : String(value);
const clampNumber = (value, fallback, low, high) => finite(value) ? Math.min(high, Math.max(low, value)) : fallback;

class Scheduler {
    constructor(options) {
        const o = options || {};
        this.options = {
            leadSeconds: clampNumber(o.leadSeconds, 0.35, 0, 3),
            lateGrace: clampNumber(o.lateGrace, 0.08, 0, 1),
            maxGlyphSeconds: clampNumber(o.maxGlyphSeconds, 1.2, 0.05, 10),
            maxTasks: Math.floor(clampNumber(o.maxTasks, 512, 1, 4096)),
            maxEventsPerTask: Math.floor(clampNumber(o.maxEventsPerTask, 256, 1, 4096)),
            onCue: typeof o.onCue === 'function' ? o.onCue : () => {},
            onCancel: typeof o.onCancel === 'function' ? o.onCancel : () => {},
            onDiagnostic: typeof o.onDiagnostic === 'function' ? o.onDiagnostic : () => {}
        };
        this.tasks = new Map();
        this.generation = 0;
        this.eventSerial = 0;
        this.worldKey = null;
        this.lastNow = null;
        this.paused = false;
        this.taskLimitReported = false;
    }

    diagnostic(type, data) {
        // Observability must not change scheduling semantics if an output fails.
        try { this.options.onDiagnostic(type, data); } catch (_) {}
    }

    emit(callback, event) {
        try { callback(event); }
        catch (error) { this.diagnostic('callback-error', { id: event.id, error: String(error) }); }
    }

    cancelEvent(state, reason) {
        if (!state.active) return;
        state.active = false;
        this.emit(this.options.onCancel, Object.assign({}, state.output, { reason }));
    }

    cancelTask(task, reason) {
        for (const state of task.events.values()) this.cancelEvent(state, reason);
    }

    clear(reason) {
        for (const task of this.tasks.values()) this.cancelTask(task, reason || 'reset');
        this.tasks.clear();
        this.lastNow = null;
        this.taskLimitReported = false;
    }

    reset(reason) {
        this.clear(reason || 'reset');
        this.worldKey = null;
        this.paused = false;
        return this.snapshot();
    }

    newTask(input, now) {
        return {
            key: identity(input.key),
            activation: identity(input.activation),
            timelineKey: identity(input.timelineKey),
            generation: ++this.generation,
            lastTime: input.time,
            lastNow: now,
            rate: validRate(input.rateHint) ? input.rateHint : 1,
            pendingRate: null,
            events: new Map(),
            eventLimitReported: false
        };
    }

    step(frame) {
        const f = frame || {};
        if (!finite(f.now)) {
            this.diagnostic('invalid-clock', { now: f.now });
            this.clear('invalid-clock');
            return this.snapshot();
        }
        const world = identity(f.worldKey);
        if (this.worldKey !== null && world !== this.worldKey) this.clear('world-change');
        if (this.lastNow !== null && f.now < this.lastNow - 0.001) this.clear('game-time-rewind');
        this.worldKey = world;
        this.lastNow = f.now;

        if (f.paused) {
            if (!this.paused) {
                for (const task of this.tasks.values()) {
                    this.cancelTask(task, 'paused');
                    task.lastNow = null;
                    task.pendingRate = null;
                }
            }
            this.paused = true;
            return this.snapshot();
        }
        this.paused = false;

        const seen = new Set();
        const inputs = Array.isArray(f.tasks) ? f.tasks : [];
        for (const input of inputs) {
            if (!input || input.key == null) continue;
            if (input.suspended !== true && (!finite(input.time) || input.time < 0)) continue;
            const key = identity(input.key);
            if (seen.has(key)) continue;
            if (seen.size >= this.options.maxTasks) {
                if (!this.taskLimitReported) {
                    this.taskLimitReported = true;
                    this.diagnostic('task-limit', { maximum: this.options.maxTasks });
                }
                continue;
            }
            seen.add(key);
            let task = this.tasks.get(key);
            if (input.suspended === true) {
                if (task) {
                    this.cancelTask(task, 'suspended');
                    task.lastNow = null;
                    task.pendingRate = null;
                }
                continue;
            }
            let changed = null;
            if (task && identity(input.activation) !== task.activation) changed = 'activation-change';
            else if (task && identity(input.timelineKey) !== task.timelineKey) changed = 'timeline-change';
            else if (task && input.time < task.lastTime - 0.001) changed = 'timeline-rewind';
            if (changed) {
                this.cancelTask(task, changed);
                task = null;
            }
            if (!task) {
                task = this.newTask(input, f.now);
                this.tasks.set(key, task);
            } else {
                if (validRate(input.rateHint)) {
                    // The adapter must supply rateHint only when it has an
                    // authoritative current rate, not a stale cached estimate.
                    task.rate = input.rateHint;
                    task.pendingRate = null;
                } else if (task.lastNow !== null && f.now > task.lastNow && input.time >= task.lastTime) {
                    const sample = (input.time - task.lastTime) / (f.now - task.lastNow);
                    // A zero sample can be hit-stop, a paused animation, or a
                    // stopped montage. It is not proof that the task finished.
                    if (validRate(sample)) {
                        if (sample > task.rate * 1.75 + TIME_EPSILON) {
                            // SkipSection also advances CurrentTime. One large
                            // delta cannot distinguish a seek from acceleration.
                            if (task.pendingRate !== null && Math.abs(sample / task.pendingRate - 1) <= 0.2) {
                                task.rate = sample;
                                task.pendingRate = null;
                            } else {
                                task.pendingRate = sample;
                                this.diagnostic('rate-jump', { taskKey: task.key, previousRate: task.rate, sample, status: 'pending' });
                            }
                        } else {
                            // Slowdown is accepted immediately: keeping an old
                            // high rate would produce unnecessarily early cues.
                            task.rate = sample;
                            task.pendingRate = null;
                        }
                    } else {
                        task.pendingRate = null;
                        if (sample >= 20) this.diagnostic('rate-jump', { taskKey: task.key, previousRate: task.rate, sample, status: 'discarded' });
                    }
                }
                task.lastTime = input.time;
                task.lastNow = f.now;
            }
            this.stepEvents(task, input, f);
        }
        for (const [key, task] of this.tasks) {
            if (!seen.has(key)) {
                this.cancelTask(task, 'task-missing');
                this.tasks.delete(key);
            }
        }
        return this.snapshot();
    }

    stepEvents(task, input, frame) {
        const seen = new Set();
        const events = Array.isArray(input.events) ? input.events : [];
        for (const event of events) {
            if (!event || event.key == null) continue;
            const key = identity(event.key);
            if (seen.has(key)) continue;
            seen.add(key);
            let state = task.events.get(key);
            if (!state) {
                if (task.events.size >= this.options.maxEventsPerTask) {
                    if (!task.eventLimitReported) {
                        task.eventLimitReported = true;
                        this.diagnostic('event-limit', { taskKey: task.key, maximum: this.options.maxEventsPerTask });
                    }
                    continue;
                }
                state = { id: 't' + task.generation + 'e' + (++this.eventSerial), fired: false, past: false, active: false, output: null, invalidReported: false };
                task.events.set(key, state);
            }

            if (!['red', 'blue', 'black'].includes(event.color) || !finite(event.start) ||
                event.start < 0 || !finite(event.end) || event.end < event.start) {
                this.cancelEvent(state, 'invalid-event');
                if (!state.invalidReported) {
                    state.invalidReported = true;
                    this.diagnostic('invalid-event', { taskKey: task.key, eventKey: key });
                }
                continue;
            }

            // An instantaneous node has no positive-duration active interval.
            // It can still be predicted, or observed exactly at its trigger.
            const instant = event.end === event.start;
            const ended = instant ? input.time > event.end + TIME_EPSILON : input.time >= event.end - TIME_EPSILON;
            if (state.active) {
                if (event.eligible !== true) this.cancelEvent(state, 'ineligible');
                else if (input.time >= event.end - TIME_EPSILON) this.cancelEvent(state, 'event-ended');
                else if (frame.now + TIME_EPSILON >= state.output.firedGameTime + this.options.maxGlyphSeconds) this.cancelEvent(state, 'display-expired');
            }
            if (state.fired || state.past) continue;

            // The grace is a timeline-time tolerance. The lead is a game-time
            // target, converted using this task's observed timeline rate.
            if (input.time > event.start + this.options.lateGrace + TIME_EPSILON || ended) {
                state.past = true;
                this.diagnostic('missed', {
                    taskKey: task.key, eventKey: key, generation: task.generation,
                    time: input.time, start: event.start, end: event.end,
                    reason: event.eligible === true ? 'past-window' : 'ineligible-through-window',
                    meta: event.meta || {}
                });
                continue;
            }
            const cueAt = Math.max(0, event.start - this.options.leadSeconds * task.rate);
            if (event.eligible !== true || input.time + TIME_EPSILON < cueAt) continue;

            state.fired = true;
            state.active = true;
            state.output = {
                id: state.id,
                taskKey: task.key, eventKey: key, generation: task.generation,
                activation: task.activation, timelineKey: task.timelineKey,
                color: event.color, start: event.start, end: event.end,
                cueAt, observedTime: input.time, observedRate: task.rate,
                actualLeadGameSeconds: (event.start - input.time) / task.rate,
                firedGameTime: frame.now,
                firedWallTime: finite(frame.wall) ? frame.wall : null,
                meta: Object.assign({}, event.meta || {})
            };
            this.emit(this.options.onCue, Object.assign({}, state.output));
            if (input.time >= event.start - TIME_EPSILON) {
                this.diagnostic('late', {
                    taskKey: task.key, eventKey: key, generation: task.generation,
                    time: input.time, start: event.start,
                    lateTimelineSeconds: Math.max(0, input.time - event.start),
                    meta: event.meta || {}
                });
            }
        }
        for (const [key, state] of task.events) {
            // Keep the fired/past tombstone until this task generation ends so
            // disappearing/reappearing tags or layers cannot replay the cue.
            if (!seen.has(key)) this.cancelEvent(state, 'event-missing');
        }
    }

    snapshot() {
        const active = [];
        let eventCount = 0;
        for (const task of this.tasks.values()) {
            eventCount += task.events.size;
            for (const state of task.events.values()) {
                if (state.active) active.push(Object.assign({}, state.output));
            }
        }
        return { active, taskCount: this.tasks.size, eventCount, generation: this.generation };
    }
}

module.exports = { Scheduler, classifyEffect };
