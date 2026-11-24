-- PBZForewarn 0.6: discovery hooks plus optional read-only observations.
-- This entry point never launches a process or writes an audio signal.
local VERSION = "0.8.0"
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
-- Resolve settings before either hook starts. Missing helper must remain fail-soft
-- for the original discovery bridge; each hook also supports standalone loading.
local settings
local settingsOK, settingsWhy = pcall(function()
    local chunk, why = loadfile(directory .. "\\settings-config.lua")
    if not chunk then error(why or "settings helper missing") end
    settings = chunk()
    settings.load(directory)
end)
if not settingsOK then report("CONFIG_UNAVAILABLE " .. tostring(settingsWhy)) end
local loaded, chunk, errorText = pcall(loadfile, directory .. "\\timeline-hooks.lua")
if not loaded or type(chunk) ~= "function" then
    report("ENTRY_FAILED bridge load: " .. tostring(errorText or chunk)); return
end
local started, module = pcall(chunk)
if not started then report("ENTRY_FAILED bridge startup: " .. tostring(module)); return end
-- Module singletons are terminal after final unload; the entry is too.
-- Re-executing main must not add another watcher or wrap OnUnload again.
local ENTRY_KEY = "__PBZForewarnEntry_v1"
if rawget(_G, ENTRY_KEY) then return end
rawset(_G, ENTRY_KEY, true)
local observer
local unloading = false
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
        unloading = true
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
-- Menu is optional: its completed save notice triggers a read of the one JSON.
-- A resident watcher also permits enabling modules that started paused.
if settingsOK and type(settings.refresh) == "function" and type(LoopAsync) == "function"
    and type(ExecuteInGameThread) == "function" then
    local parent = directory:match("^(.*)\\[^\\]+$")
    local mods = parent and parent:match("^(.*)\\[^\\]+$")
    local noticePath = mods and mods .. "\\PBZModsMenuBridge\\events-PBZForewarnHooks.txt"
    local lastChange, pending, scheduled = 0, nil, false
    local function applyPending()
        scheduled = false
        if unloading then pending = nil; return end
        local nextSettings = pending; pending = nil
        if not nextSettings then return end
        for _, value in ipairs({module, observer or false}) do
            if type(value) == "table" and type(value.applySettings) == "function" then
                local ok, why = pcall(value.applySettings, nextSettings)
                if not ok then report("CONFIG_APPLY_FAILED " .. tostring(why)) end
            end
        end
    end
    local function checkNotice()
        local file = io.open(noticePath, "rb")
        if not file then return end
        local readOK, body, readError = pcall(file.read, file, 4097)
        local closeOK, closed = pcall(file.close, file)
        if not readOK or readError or not closeOK or not closed or type(body) ~= "string"
            or #body > 4096 then return end
        local complete, counter = false, nil
        for rawLine in body:gmatch("[^\n]+") do
            local line = rawLine:gsub("\r$", "")
            if line:match("^End=1%s*$") then complete = true end
            counter = counter or line:match("^Changed=(%d+)$")
        end
        if not complete then return end
        local change = tonumber(counter)
        if not change or change > 9007199254740991 or change <= lastChange then return end
        local nextSettings = settings.refresh()
        if not nextSettings then return end -- Do not consume the notice; retry the same save.
        pending = nextSettings
        if not scheduled then
            scheduled = true
            local ok, why = pcall(ExecuteInGameThread, applyPending)
            if not ok then scheduled = false; error(why) end
        end
        lastChange = change
    end
    if noticePath then
        local ok, why = pcall(LoopAsync, 500, function()
            if unloading then return true end
            pcall(checkNotice) -- Torn/unreadable files retain the last working snapshot.
            return false
        end)
        if not ok then report("CONFIG_WATCH_UNAVAILABLE " .. tostring(why)) end
    end
end
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
