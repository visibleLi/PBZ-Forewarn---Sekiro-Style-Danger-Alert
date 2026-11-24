'use strict';

const GRAB = '/SGameExecution/GA/GA_ExecutedAbilityBase_Grab.GA_ExecutedAbilityBase_Grab_C';
// Live player state only; this does not identify the attacker causing a reaction.
function createGrabReactionReader(adapter) {
    const safe = (read, fallback = null) => { try { return read(); } catch (_) { return fallback; } };
    const valid = value => safe(() => adapter.valid(value), false) === true;
    const path = value => valid(value) ? safe(() => adapter.path(value), '') : '';
    function ancestry(klass) {
        const seen = new Set(), result = [];
        for (let depth = 0; depth < 16; depth++) {
            const name = path(klass);
            if (!name || seen.has(name)) return null;
            seen.add(name); result.push(name);
            if (name === GRAB) return result;
            // Keep bridge reads inside the caller's guarded ability snapshot.
            let parent;
            if (typeof klass.GetSuperClass === 'function') parent = klass.GetSuperClass();
            else if (typeof klass.GetSuperStruct === 'function') parent = klass.GetSuperStruct();
            else parent = klass.SuperStruct || klass.SuperClass;
            klass = parent;
        }
        return null;
    }
    function count(values) {
        if (!values) return 0;
        const size = values.Num();
        if (!Number.isSafeInteger(size) || size < 0 || size > 64) throw Error('reaction-scan-limit');
        return size;
    }
    function read(player, playerASC) {
        const result = { status: 'unavailable', player: path(player), asc: path(playerASC), executions: [] };
        if (!result.player || !result.asc) return result;
        try {
            // collectAbilities is shared with NPC discovery. Bound its native
            // inputs before that helper enumerates them for this per-tick read.
            const specs = playerASC.ActivatableAbilities && playerASC.ActivatableAbilities.Items;
            const size = count(specs);
            let budget = count(playerASC.TickingTasks);
            for (let i = 0; i < size; i++) {
                const spec = specs.Get(i);
                if (!(Number(spec.ActiveCount) > 0)) continue;
                budget += Math.max(1, count(spec.NonReplicatedInstances) + count(spec.ReplicatedInstances));
                if (budget > 64) return result;
            }
            const abilities = adapter.collectAbilities(playerASC);
            if (!(abilities instanceof Map) || abilities.size > 64) return result;
            for (const ability of abilities.values()) {
                try {
                    if (!valid(ability) || ability.bIsActive !== true || ability.bIsAbilityEnding !== false ||
                        path(ability.GetAvatarActorFromActorInfo()) !== result.player) continue;
                    const chain = ancestry(ability.GetClass()), abilityPath = path(ability);
                    if (chain && abilityPath) result.executions.push({ ability: abilityPath,
                        activation: adapter.activation(ability), abilityClass: chain[0], ancestry: chain });
                } catch (_) { /* Unproven reactions cannot suppress a warning. */ }
            }
            result.status = result.executions.length ? 'active' : 'inactive';
        } catch (_) { /* A failed live scan leaves suppression unavailable. */ }
        return result;
    }
    return { read };
}
module.exports = { createGrabReactionReader };
