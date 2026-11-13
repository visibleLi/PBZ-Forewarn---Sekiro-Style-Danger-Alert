-- PBZForewarn 0.5: discovery hooks only. Audio is played inside the game by JS.
-- This entry point never launches a process or writes an audio signal.
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
if type(module) ~= "table" or type(module.status) ~= "function" then
    report("ENTRY_FAILED bridge returned no status API"); return
end
report("ENTRY_READY hooks only; Wwise audio is handled by Forewarn JS")
