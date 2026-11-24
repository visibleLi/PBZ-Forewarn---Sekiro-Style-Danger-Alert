-- PBZ Forewarn: optional, read-only timeline-start witnesses.
-- Engine objects are inspected only in native hook callbacks or game-thread setup.
-- The asynchronous publisher handles immutable JSON strings and ordinary file I/O.
-- This is a discovery aid; periodic task discovery must remain available.
local GLOBAL_KEY = "__PBZForewarnTimelineHooks_v1"
local prior = rawget(_G, GLOBAL_KEY)
if type(prior) == "table" then return prior end

local M = {}
rawset(_G, GLOBAL_KEY, M)
local PREFIX = "[PBZForewarnHooks] "
local PATHS = {
    "/Script/LegoAbility.LegoAbility:PlayTimeline",
    "/Script/LegoAbility.LegoAbility:PlayTimelineByName",
}
local S = {
    active = false, stopped = false, hooks = {}, hints = {}, seq = 0,
    frame = {seq = 0, json = "[]"}, publishedSeq = -1, publishedSecond = -1,
    hits = 0, errors = {}, callbackHits = {}, unregisterPending = false,
    healthVersion = 0, publishedHealthVersion = -1,
    health = {writeFailures = 0, openFailures = 0, writeOperationFailures = 0,
        closeFailures = 0, publishExceptions = 0, registrationFailures = 0,
        captureFailures = 0, recoveries = 0, lastSuccessfulWriteMs = 0,
        lastErrorAtMs = 0, lastErrorStage = "", lastError = ""},
}

local function log(kind, text)
    print(PREFIX .. kind .. " " .. tostring(text) .. "\n")
end
local function quote(s)
    return '"' .. tostring(s):gsub('[%z\1-\31\\"]', function(c)
        if c == '"' then return '\\"' end
        if c == '\\' then return '\\\\' end
        return string.format('\\u%04x', string.byte(c))
    end) .. '"'
end
local function valid(object)
    if object == nil then return false end
    local ok, result = pcall(function() return object:IsValid() end)
    return ok and result == true
end
local function objectPath(object)
    if not valid(object) then return "" end
    local ok, full = pcall(function() return object:GetFullName() end)
    if not ok or type(full) ~= "string" then return "" end
    -- GetFullName is already used by the installed UE4SS mods.
    -- Strip the reflected type prefix: "SomeClass /Game/...:Object".
    return full:match('^[^ ]+ (.+)$') or ""
end
local function getter(object, name)
    local ok, value = pcall(function() return object[name](object) end)
    if ok then return value end
    return nil
end
local function nowMs()
    -- os.time is wall time with one-second precision. It is freshness metadata,
    -- not the scheduling clock used to decide when the extra warning should fire.
    return os.time() * 1000
end
local function rememberError(stage, why)
    S.health.lastErrorStage = stage
    S.health.lastError = tostring(why or "unknown error"):sub(1, 512)
    local clockOK, timestamp = pcall(nowMs)
    S.health.lastErrorAtMs = clockOK and timestamp or 0
    S.healthVersion = S.healthVersion + 1
end
local function healthSnapshot(successfulAt, recovering)
    local result = {}
    for key, value in pairs(S.health) do result[key] = value end
    result.lastSuccessfulWriteMs = successfulAt or result.lastSuccessfulWriteMs
    result.recoveries = result.recoveries + (recovering and 1 or 0)
    result.currentlyFailing = successfulAt == nil and S.writeError == true or false
    result.registered = #S.hooks
    return result
end
local function healthJSON(health)
    local rows = {}
    for key, value in pairs(health) do
        rows[#rows + 1] = quote(key) .. ':' ..
            (type(value) == "number" and string.format('%.0f', value) or
             type(value) == "boolean" and tostring(value) or quote(value))
    end
    return '{' .. table.concat(rows, ',') .. '}'
end
local function writeFailed(stage, why)
    S.health.writeFailures = S.health.writeFailures + 1
    if stage == "open" then S.health.openFailures = S.health.openFailures + 1 end
    if stage == "write" then S.health.writeOperationFailures = S.health.writeOperationFailures + 1 end
    if stage == "close" then S.health.closeFailures = S.health.closeFailures + 1 end
    rememberError(stage, why)
    if not S.writeError then log("WRITE_FAILED", stage .. ": " .. tostring(why)); end
    S.writeError = true
end
local function hooksEnabled(configPath)
    -- Same valid values/case-insensitive keys as the JS config reader. This is
    -- startup-only: Alt+F5 can stop JS consumption but cannot unload these hooks.
    local file = io.open(configPath, "rb")
    if not file then return true end -- absent config uses the documented default
    local ok, body = pcall(file.read, file, 65536)
    pcall(file.close, file)
    if not ok or type(body) ~= "string" then return true end
    body = body:gsub('^\239\187\191', '') -- optional UTF-8 BOM
    local enabled = true
    for line in body:gmatch('[^\n]+') do
        local key, value = line:match('^%s*([%a]+)%s*=%s*([^#;\r\n]+)%s*$')
        if key and key:lower() == "hooks" then
            value = value:match('^%s*(.-)%s*$'):lower()
            if value == "0" or value == "false" then enabled = false end
            if value == "1" or value == "true" then enabled = true end
        end
    end
    return enabled
end
local function rebuildSnapshot()
    local rows = {}
    for i, hint in ipairs(S.hints) do
        rows[i] = '{"seq":' .. hint.seq .. ',"ability":' .. quote(hint.ability)
            .. ',"task":' .. quote(hint.task) .. ',"actor":' .. quote(hint.actor)
            .. ',"kind":"play","at":' .. string.format('%.0f', hint.at) .. '}'
    end
    -- Replace one immutable, UObject-free frame so seq and JSON always belong together.
    S.frame = {seq = S.seq, json = '[' .. table.concat(rows, ',') .. ']'}
end
local function capture(context, hookPath)
    if not S.active or S.stopped then return end
    if type(IsInGameThread) ~= "function" then return end
    local threadOK, onGameThread = pcall(IsInGameThread)
    if not threadOK or onGameThread ~= true then return end
    -- RemoteUnrealParam is consumed synchronously. No wrapper/UObject is retained.
    local ability = context:get()
    local abilityPath = objectPath(ability)
    if abilityPath == "" then return end
    local taskPath = objectPath(getter(ability, "GetPlayTimelineTask"))
    local actorPath = objectPath(getter(ability, "GetAvatarActorFromActorInfo"))
    S.seq = S.seq + 1
    S.hits = S.hits + 1
    S.hints[#S.hints + 1] = {
        seq = S.seq, ability = abilityPath, task = taskPath, actor = actorPath,
        at = nowMs(),
    }
    if #S.hints > 128 then table.remove(S.hints, 1) end
    rebuildSnapshot()
    S.callbackHits[hookPath] = (S.callbackHits[hookPath] or 0) + 1
    if S.callbackHits[hookPath] == 1 or S.hits % 100 == 0 then
        log("HIT", hookPath .. " pathHits=" .. S.callbackHits[hookPath]
            .. " total=" .. S.hits .. " taskReady=" .. tostring(taskPath ~= ""))
    end
end
local function callbackFor(path)
    return function(context, ...)
        local ok, why = pcall(capture, context, path)
        if not ok then
            S.health.captureFailures = S.health.captureFailures + 1
            rememberError("capture", why)
            if not S.errors[path] then
                S.errors[path] = true
                log("CAPTURE_FAILED", path .. " " .. tostring(why))
            end
        end
        -- Deliberately no return value: this observer must never override native output.
    end
end
local function publish(stopping)
    if not S.output then return false end
    local second = os.time()
    -- Copy one immutable primitive frame before I/O; never enumerate live objects here.
    local frame = S.frame
    if not stopping and not S.writeError and S.publishedSeq == frame.seq and S.publishedSecond == second
        and S.publishedHealthVersion == S.healthVersion then return true end
    local snapshot, seq = frame.json, frame.seq
    -- Candidate health belongs to this write. Commit it in memory only after
    -- write and close both succeed; a failed file is not a valid commit marker.
    local recovering = S.writeError == true
    local successfulAt = second * 1000
    local candidateHealth = healthSnapshot(successfulAt, recovering)
    local payload = '{"version":1,"session":' .. quote(S.session)
        .. ',"seq":' .. seq .. ',"heartbeat":'
        .. (stopping and '0' or string.format('%.0f', second * 1000))
        .. ',"active":' .. (stopping and 'false' or 'true')
        .. ',"health":' .. healthJSON(candidateHealth)
        .. ',"hints":' .. snapshot .. '}\n'
    local opened, file, why = pcall(io.open, S.output, "wb")
    if not opened or not file then
        writeFailed("open", opened and why or file)
        return false
    end
    local writeOK, written, writeError = pcall(file.write, file, payload)
    local closeOK, closed, closeError = pcall(file.close, file)
    if not writeOK or not written then
        writeFailed("write", writeOK and writeError or written)
        if not closeOK or not closed then
            S.health.closeFailures = S.health.closeFailures + 1
        end
        return false
    end
    if not closeOK or not closed then
        writeFailed("close", closeOK and closeError or closed)
        return false
    end
    S.health.lastSuccessfulWriteMs = successfulAt
    if recovering then
        S.health.recoveries = candidateHealth.recoveries
        log("WRITE_RECOVERED", "failures=" .. S.health.writeFailures .. " recoveries=" .. S.health.recoveries)
    end
    S.writeError = false
    S.publishedSeq, S.publishedSecond = seq, second
    S.publishedHealthVersion = S.healthVersion
    return true
end
local function install()
    if not S.active or S.stopped then return end
    for _, path in ipairs(PATHS) do
        local ok, why = pcall(function()
            local fn = StaticFindObject(path)
            assert(valid(fn), "function is not loaded; no asset was loaded by this bridge")
            local full = fn:GetFullName()
            assert(type(full) == "string" and full:sub(1, 9) == "Function ", "object is not a UFunction")
            local pre, post = RegisterHook(path, function() end, callbackFor(path))
            assert(type(pre) == "number" and type(post) == "number", "invalid hook registration IDs")
            S.hooks[#S.hooks + 1] = {path = path, pre = pre, post = post}
            log("REGISTERED", path)
        end)
        if not ok then
            S.health.registrationFailures = S.health.registrationFailures + 1
            rememberError("register", why)
            log("REGISTER_FAILED", path .. " " .. tostring(why))
        end
    end
    log("READY", "registered=" .. #S.hooks .. "/2; optional discovery aid, task scan remains required")
end
local function uninstall()
    local remaining = {}
    for _, hook in ipairs(S.hooks) do
        local ok, result = pcall(UnregisterHook, hook.path, hook.pre, hook.post)
        if not ok or result == false then
            remaining[#remaining + 1] = hook
            log("UNREGISTER_FAILED", hook.path .. " " .. tostring(result))
        end
    end
    S.hooks = remaining
    S.unregisterPending = false
    log("STOPPED", "hits=" .. S.hits .. " retainedDisabledHooks=" .. #remaining)
end

function M.stop()
    if S.stopped then return end
    S.active, S.stopped = false, true
    S.hints = {}
    S.seq = S.seq + 1
    S.frame = {seq = S.seq, json = "[]"}
    pcall(publish, true) -- zero heartbeat invalidates the latest snapshot immediately
    if type(ExecuteInGameThread) == "function" then
        S.unregisterPending = true
        local ok, why = pcall(ExecuteInGameThread, uninstall)
        if not ok then S.unregisterPending = false; log("UNREGISTER_SCHEDULE_FAILED", why) end
    end
    -- LoopAsync has no cancellation API assumed here. Its next callback returns true.
end
-- Settings calls run on the game thread. Registrations stay inert while paused;
-- only final unload unregisters them, so toggles never multiply hooks or loops.
function M.applySettings(settings)
    if S.stopped or not S.ready then return end
    local on = settings.Hooks == true
    if S.active == on then return end
    S.active = on
    if on then
        S.publishedSecond = nil -- Replace the paused tombstone even within the same second.
        if not S.installed then S.installed = true; install() end
    else
        S.hints = {}; S.seq = S.seq + 1
        S.frame = {seq = S.seq, json = "[]"}
        pcall(publish, true)
    end
end
function M.status()
    return {active = S.active, stopped = S.stopped, registered = #S.hooks,
        seq = S.seq, hits = S.hits, queued = #S.hints, unregisterPending = S.unregisterPending,
        health = healthSnapshot()}
end

local appData = os.getenv("LOCALAPPDATA")
local absolute = type(appData) == "string" and
    (appData:match('^[A-Za-z]:[\\/]') or appData:match('^\\\\[^\\]+\\[^\\]+'))
if not absolute then log("DISABLED", "LOCALAPPDATA is missing or not absolute"); return M end
local configPath = appData .. "\\ProjectPBZ\\Saved\\PBZForewarn.txt"
local configOK, enabled = pcall(function()
    local helperOK, settings = pcall(function()
        local info = debug.getinfo(1, "S")
        local directory = info and info.source:match('^@(.*)[\\/][^\\/]+$')
        local helper = rawget(_G, "__PBZForewarnSettingsConfig_v1")
        if not helper then
            if not directory then error("file-backed settings helper path unavailable") end
            local chunk, why = loadfile(directory .. "/settings-config.lua")
            if not chunk then error(why or "settings helper missing") end
            helper = chunk()
        end
        return helper.load(directory)
    end)
    if helperOK then return settings.Hooks end
    log("CONFIG_UNAVAILABLE", tostring(settings) .. "; using legacy startup reader")
    return hooksEnabled(configPath)
end)
if configOK and not enabled then
    log("DISABLED", "Hooks=0/false in startup settings; awaiting live settings")
end
if not configOK then log("CONFIG_READ_FAILED", tostring(enabled) .. "; using Hooks=1") end
for _, name in ipairs({'RegisterHook', 'UnregisterHook', 'StaticFindObject', 'ExecuteInGameThread', 'LoopAsync'}) do
    if type(_G[name]) ~= "function" then log("DISABLED", "required API unavailable: " .. name); return M end
end
S.output = appData .. "\\ProjectPBZ\\Saved\\pbzforewarn_hooks.json"
S.session = 'fw-' .. tostring(os.time()) .. '-' .. tostring(M):gsub('[^%w]', '')
S.ready = true
local loopOK, loopError = pcall(LoopAsync, 50, function()
    if S.stopped then return true end
    if not S.active then return false end
    local ok, why = pcall(publish, false)
    if not ok then
        S.health.publishExceptions = S.health.publishExceptions + 1
        rememberError("publish", why)
        if not S.writeError then log("PUBLISH_FAILED", why) end
        S.writeError = true
    end
    return false
end)
if not loopOK then S.ready = false; S.active = false; log("DISABLED", "publisher unavailable: " .. tostring(loopError)); return M end
local setupOK, setupError = pcall(ExecuteInGameThread, function()
    M.applySettings({Hooks = not configOK or enabled})
end)
if not setupOK then
    S.active, S.stopped = false, true
    pcall(publish, true)
    log("DISABLED", "game-thread setup unavailable: " .. tostring(setupError))
end
return M
