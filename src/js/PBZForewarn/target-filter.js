"use strict";

// Read-only hard-lock filter. Signatures are from the local reflected SDK:
// SGameCombatSystem.TargetingComponent{Holder,GlobalConfig}, SGameActorState,
// SGameUtils.ComponentSocketHelper and NBCamera.NBCameraComponent.
// GetLockTarget takes an OUT ComponentSocket; it does not return an Actor.
// The game's configured lock-state tag is read rather than guessed. Camera
// focus / HasLockTarget alone are insufficient because soft selection exists.
// This establishes the game's hard-lock state, not the physical input source:
// a script that forces that same state is indistinguishable from manual input.
function createTargetFilter(UE, puerts, adapter, diagnostic) {
    let previous = "";
    const attempt = fn => { try { return { ok: true, value: fn() }; } catch (error) { return { ok: false, error: String(error) }; } };
    const valid = value => !!value && attempt(() => adapter.valid(value)).value === true;
    const path = value => valid(value) ? attempt(() => adapter.path(value)).value || "" : "";
    const method = (value, name) => attempt(() => typeof value[name] === "function").value === true;
    function component(player, type) {
        if (!method(player, "GetComponentByClass")) return null;
        return attempt(() => player.GetComponentByClass(type.StaticClass())).value || null;
    }
    function finish(mode, status, reason, target, evidence) {
        const result = { mode, target: status === "locked" ? target : null,
            key: status === "locked" ? path(target) : "", status, reason };
        const details = Object.assign({ mode, status, reason, target: result.key }, evidence || {});
        const fingerprint = JSON.stringify(details);
        if (fingerprint !== previous) {
            previous = fingerprint;
            try { if (typeof diagnostic === "function") diagnostic("target-filter", details); } catch (_) {}
        }
        return result;
    }
    function read(player, enabled = false) {
        if (enabled !== true) return finish("nearby", "bypass", "only-locked-target-disabled", null);
        const evidence = {};
        const fail = (status, reason) => finish("locked", status, reason, null, evidence);
        try {
            if (!valid(player)) return fail("unavailable", "player-unavailable");
            let targeting = method(player, "GetTargetingComponent") ? attempt(() => player.GetTargetingComponent()).value : null;
            evidence.targetingSource = "holder";
            if (!valid(targeting)) { targeting = component(player, UE.TargetingComponent); evidence.targetingSource = "component"; }
            if (!valid(targeting)) return fail("unavailable", "targeting-component-unavailable");
            if (!method(targeting, "HasLockTarget")) return fail("unavailable", "lock-presence-api-unavailable");
            const presence = attempt(() => targeting.HasLockTarget());
            if (!presence.ok || typeof presence.value !== "boolean") return fail("unavailable", "lock-presence-unreadable");
            if (!presence.value) return fail("unlocked", "no-lock-target");

            // The config exposes the canonical lock state used by Targeting.
            let config = attempt(() => targeting.GlobalConfig).value;
            evidence.configSource = "targeting-global-config";
            if (!valid(config) && method(player, "GetTargetingGlobalConfig")) {
                config = attempt(() => player.GetTargetingGlobalConfig()).value; evidence.configSource = "holder-global-config";
            }
            if (!valid(config) || !method(config, "GetTargetingLockStateTag")) return fail("unavailable", "lock-state-config-unavailable");
            const configuredTag = attempt(() => config.GetTargetingLockStateTag());
            const tag = configuredTag.value;
            if (!configuredTag.ok || !tag || attempt(() => UE.BlueprintGameplayTagLibrary.IsGameplayTagValid(tag)).value !== true)
                return fail("unavailable", "lock-state-tag-unavailable");
            const tagName = attempt(() => UE.BlueprintGameplayTagLibrary.GetTagName(tag)).value;
            evidence.lockStateTag = typeof tagName === "string" ? tagName : "";

            let actorState = attempt(() => targeting.ActorState).value;
            if (!valid(actorState) && method(player, "GetActorStateComponent")) actorState = attempt(() => player.GetActorStateComponent()).value;
            let locked;
            if (valid(actorState) && method(actorState, "InExactState") && method(actorState, "InChildState")) {
                const exact = attempt(() => actorState.InExactState(tag));
                const child = exact.ok && exact.value === false ? attempt(() => actorState.InChildState(tag)) : { ok: true, value: false };
                if (!exact.ok || !child.ok || typeof exact.value !== "boolean" || typeof child.value !== "boolean")
                    return fail("unavailable", "lock-state-unreadable");
                locked = exact.value || child.value; evidence.stateSource = "actor-state";
            } else {
                const asc = attempt(() => player.AbilitySystemComponent).value;
                if (!valid(asc) || !method(asc, "HasMatchingGameplayTag")) return fail("unavailable", "lock-state-reader-unavailable");
                const observed = attempt(() => asc.HasMatchingGameplayTag(tag));
                if (!observed.ok || typeof observed.value !== "boolean") return fail("unavailable", "lock-state-unreadable");
                locked = observed.value; evidence.stateSource = "player-asc";
            }
            if (!locked) return fail("soft-lock", "target-present-without-lock-state");

            // Check actual class ancestry, not display names or "Soft" substrings.
            // Missing evidence is closed; a soft handler never becomes hard-lock
            // merely because a camera target or an old lock-state tag remains.
            const handler = attempt(() => targeting.CurrentHandler).value;
            if (!valid(handler) || !method(handler, "GetClass")) return fail("unavailable", "handler-kind-unavailable");
            const handlerClass = attempt(() => handler.GetClass()).value;
            const softClass = attempt(() => UE.TargetingHandler_PlayerSoftLock.StaticClass()).value;
            if (!valid(handlerClass) || !valid(softClass)) return fail("unavailable", "handler-kind-unavailable");
            const soft = attempt(() => UE.KismetMathLibrary.ClassIsChildOf(handlerClass, softClass));
            if (!soft.ok || typeof soft.value !== "boolean") return fail("unavailable", "handler-kind-unreadable");
            evidence.handlerClass = path(handlerClass);
            if (soft.value) return fail("soft-lock", "soft-targeting-handler");

            if (!method(targeting, "GetLockTarget")) return fail("unavailable", "lock-target-api-unavailable");
            const socketRead = attempt(() => {
                const out = puerts.$ref(new UE.ComponentSocket());
                targeting.GetLockTarget(out);
                return puerts.$unref(out);
            });
            if (!socketRead.ok || !socketRead.value) return fail("unavailable", "lock-target-unreadable");
            const socket = socketRead.value;
            if (!valid(attempt(() => socket.Component).value)) return fail("invalid-target", "target-component-invalid");
            const actorRead = attempt(() => UE.ComponentSocketHelper.GetActor(socket));
            if (!actorRead.ok) return fail("unavailable", "target-actor-unreadable");
            const target = actorRead.value, targetKey = path(target), playerKey = path(player);
            if (!valid(target) || !targetKey) return fail("invalid-target", "target-actor-invalid");
            if (target === player || targetKey === playerKey) return fail("invalid-target", "target-is-player");

            // Optional independent corroboration; camera focus can include soft
            // targets and can never authorize a cue by itself. If a live camera
            // is readable but reports a different target, wait for agreement.
            let camera = attempt(() => player.NBCamera).value;
            if (!valid(camera)) camera = component(player, UE.NBCameraComponent);
            if (valid(camera) && method(camera, "GetCurrentLockComponent")) {
                const cameraRead = attempt(() => camera.GetCurrentLockComponent());
                if (!cameraRead.ok) return fail("unavailable", "camera-lock-unreadable");
                if (!valid(cameraRead.value)) return fail("ambiguous", "camera-lock-not-ready");
                const cameraActor = attempt(() => cameraRead.value.GetOwner());
                if (!cameraActor.ok || !valid(cameraActor.value)) return fail("ambiguous", "camera-target-invalid");
                evidence.cameraTarget = path(cameraActor.value);
                if (!evidence.cameraTarget || evidence.cameraTarget !== targetKey) return fail("ambiguous", "camera-target-mismatch");
            } else evidence.cameraTarget = "unavailable-optional";
            return finish("locked", "locked", "configured-lock-state-and-target", target, evidence);
        } catch (error) {
            evidence.error = String(error).slice(0, 200);
            return fail("unavailable", "target-filter-read-error");
        }
    }
    function allows(actor, state) {
        if (!state || state.mode === "nearby") return !!state && state.mode === "nearby";
        if (state.mode !== "locked" || state.status !== "locked" || !state.key || !valid(state.target) || !valid(actor)) return false;
        return path(state.target) === state.key && path(actor) === state.key;
    }
    return { read, allows };
}

module.exports = { createTargetFilter };
