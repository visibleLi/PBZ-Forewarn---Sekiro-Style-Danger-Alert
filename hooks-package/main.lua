-- PBZForewarn 0.6: discovery hooks plus optional read-only observations.
-- This entry point never launches a process or writes an audio signal.
local VERSION = "0.6.1-dev.2"
local prefix = "[PBZForewarnHooks] "
local function report(message) print(prefix .. message .. "\n") end
local info = debug.getinfo(1, "S")
local source = info and info.source or ""
if source:sub(1, 1) ~= "@" then report("ENTRY_FAILED file-backed script path unavailable"); return end
local script = source:sub(2):gsub("/", "\\")
if not (script:match("^[A-Za-z]:\\") or script:match("^\\\\[^\\]+\\[^\\]+")) then
    report("ENTRY_FAILED absolute script path unavailable"); return
end
local directory = script:match("^(.*)\\[^\\]+$")
if not directory then report("ENTRY_FAILED script directory unavailable"); return end
local loaded, chunk, errorText = pcall(loadfile, directory .. "\\timeline-hooks.lua")
if not loaded or type(chunk) ~= "function" then
    report("ENTRY_FAILED bridge load: " .. tostring(errorText or chunk)); return
end
local started, module = pcall(chunk)
if not started then report("ENTRY_FAILED bridge startup: " .. tostring(module)); return end
local observer
-- UE4SS owns the callback. Preserve any prior callback and install cleanup
-- before loading optional observation, so failure/disabled startup still cleans
-- the already started legacy bridge. No process/engine-exit API is invoked here.
local unloadInstalled, unloadWhy = pcall(function()
    local modRef = rawget(_G, "ModRef")
    if modRef == nil then return end
    local previous = modRef.OnUnload
    local cleaned = false
    modRef.OnUnload = function(...)
        if cleaned then return end
        cleaned = true
        local function stopOne(value, label)
            if type(value) ~= "table" or type(value.stop) ~= "function" then return end
            local ok, why = pcall(value.stop)
            if not ok then report("UNLOAD_STOP_FAILED " .. label .. " " .. tostring(why)) end
        end
        -- A module may install its singleton then fail during startup. Only
        -- this observer's own singleton is used as a partial-startup fallback.
        stopOne(observer or rawget(_G, "__PBZForewarnObservationHooks_v1"), "observer")
        stopOne(module, "timeline")
        if type(previous) == "function" then
            local ok, why = pcall(previous, ...)
            if not ok then report("UNLOAD_PREVIOUS_FAILED " .. tostring(why)) end
        end
    end
end)
if not unloadInstalled then report("UNLOAD_UNAVAILABLE " .. tostring(unloadWhy)) end
if type(module) ~= "table" or type(module.status) ~= "function" then
    report("ENTRY_FAILED bridge returned no status API"); return
end
report("ENTRY_READY version=" .. VERSION .. "; hooks only; Wwise audio is handled by Forewarn JS")
-- Observation is independent: failure must not disable the proven v1 hints.
local observerLoaded, observerChunk, observerError = pcall(loadfile, directory .. "\\observation-hooks.lua")
if not observerLoaded or type(observerChunk) ~= "function" then
    report("OBSERVER_UNAVAILABLE " .. tostring(observerError or observerChunk)); return
end
local observerStarted, observerResult = pcall(observerChunk)
if type(observerResult) == "table" then observer = observerResult end
if not observerStarted or type(observer) ~= "table" or type(observer.status) ~= "function" then
    report("OBSERVER_UNAVAILABLE " .. tostring(observerResult)); return
end
report("OBSERVER_READY version=" .. VERSION .. "; read-only evidence; no attack decisions")
