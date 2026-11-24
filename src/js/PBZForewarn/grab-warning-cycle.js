'use strict';
// Observed handoff policy, not proven causality/parentage; caller authorizes primitive grab contexts.
const complete = r => r && ['world', 'actor', 'ability', 'activation', 'key', 'timeline'].every(k =>
    typeof r[k] === 'string' && !!r[k]) && /^\d+$/.test(r.activation) && Number.isSafeInteger(Number(r.activation)) &&
    Number.isSafeInteger(r.serial) && r.serial > 0 &&
    typeof r.live === 'boolean' && (r.ended === undefined || typeof r.ended === 'boolean') &&
    Array.isArray(r.payloads) && r.payloads.every(path => typeof path === 'string' && !!path);
const sameSource = (a, b) => a.ability === b.ability && a.activation === b.activation;
const sameRecord = (a, b) => sameSource(a, b) && a.key === b.key && a.serial === b.serial && a.timeline === b.timeline;
const snapshot = r => Object.fromEntries(['world', 'actor', 'ability', 'activation', 'key', 'serial', 'timeline',
    'live', 'ended'].map(k => [k, r[k]]));
function createGrabWarningCycle({ now = () => Date.now() } = {}) {
    const tokens = new Map();
    function clear() { tokens.clear(); }
    function recordDelivery(context, cueId) {
        if (!complete(context) || !context.live || typeof cueId !== 'string' || !cueId ||
            typeof context.eventKey !== 'string' || !context.eventKey) return;
        const payloads = [...new Set(context.payloads)];
        if (payloads.length !== 1 || typeof payloads[0] !== 'string' || !payloads[0]) return;
        const previous = tokens.get(context.actor);
        // A duplicate successful output must not replace the first cue's token.
        if (previous && previous.root.world === context.world && sameSource(previous.root, context)) return;
        tokens.set(context.actor, { root: snapshot(context), rootEventKey: context.eventKey, cueId, payload: payloads[0], phase: 'root' });
        if (tokens.size > 128) tokens.delete(tokens.keys().next().value);
    }
    function withdrawCue(id) {
        for (const [actor, token] of tokens) if (token.cueId === id) tokens.delete(actor);
    }
    function update(records) {
        for (const [actor, token] of tokens) {
            const rows = records.filter(r => complete(r) && r.actor === actor && r.world === token.root.world);
            const live = rows.filter(r => r.live);
            // A short observation gap may bridge discovery, never an arbitrary later cast.
            // Expiry only restores warnings; it is not evidence of native parentage.
            if (token.endedAt !== undefined && (!Number.isFinite(now()) || now() < token.endedAt || now() - token.endedAt > 1000)) {
                tokens.delete(actor); continue;
            }
            const tracked = rows.find(r => sameRecord(r, token.continuation || token.root));
            if (tracked && !tracked.live && tracked.ended === true && token.endedAt === undefined) token.endedAt = now();
            // Even an undelivered new activation starts a new cycle.
            if (rows.some(r => r.ability === token.root.ability && !sameSource(r, token.root))) {
                tokens.delete(actor); continue;
            }
            if (token.phase === 'root') {
                const root = rows.find(r => sameRecord(r, token.root));
                const next = live.filter(r => r.payloads.length && !sameSource(r, token.root));
                // Only a positively observed end survives record retirement.
                const ended = token.root.ended === true && !token.root.live;
                if ((!root && !ended) || (root && !root.live && root.ended !== true) || next.length > 1 ||
                    (root && root.live && next.length) || (next.length && !next[0].payloads.includes(token.payload))) {
                    tokens.delete(actor); continue;
                }
                if (root) { token.root.live = root.live; token.root.ended = root.ended === true; }
                if (next.length) {
                    token.continuation = snapshot(next[0]); token.phase = 'continuation'; delete token.endedAt;
                }
            } else {
                // A witnessed continuation end may await the next timeline.
                const current = rows.find(r => sameRecord(r, token.continuation));
                const ended = current ? !current.live && current.ended === true :
                    !token.continuation.live && token.continuation.ended === true;
                if (live.length > 1 || (live.length && !sameSource(live[0], token.continuation)) ||
                    (!live.length && !ended)) { tokens.delete(actor); continue; }
                if (live.length && !sameRecord(live[0], token.continuation)) {
                    // Generic owned Main -> Success structure, not a named ability whitelist.
                    // An arbitrary sibling timeline cannot inherit ordinary-black suppression.
                    if (!ended || token.continuation.timeline !== token.continuation.ability + '.Main' ||
                        live[0].timeline !== live[0].ability + '.Success') { tokens.delete(actor); continue; }
                    delete token.endedAt;
                }
                token.continuation = snapshot(live[0] || current || token.continuation);
            }
        }
    }
    function suppression(context, event) {
        const token = context && tokens.get(context.actor);
        if (!complete(context) || !context.live || !token || context.world !== token.root.world ||
            !event || event.eligible !== true || event.roleName !== '' || event.color !== 'black') return false;
        const generic = event.kind === 'execution-capability' && event.executedAbilityPath === token.payload &&
            context.payloads.includes(token.payload);
        if (token.phase === 'root') return !!(token.root.live && sameSource(context, token.root) && generic &&
            typeof event.key === 'string' && !!event.key &&
            !(sameRecord(context, token.root) && event.key === token.rootEventKey));
        if (!token.continuation.live || !sameRecord(context, token.continuation)) return false;
        return !!(generic || event.source === 'power-attack-post-pair');
    }
    return { recordDelivery, update, suppression, withdrawCue, clear };
}
module.exports = { createGrabWarningCycle };
