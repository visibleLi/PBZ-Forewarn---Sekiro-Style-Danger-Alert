"""Project config I/O stub shared by Lua startup suites; no disk/game access."""
from pathlib import Path

HELPER = (Path(__file__).parents[1] / 'settings-config.lua').read_text(encoding='utf8')
DIRECTORY = r'C:\Games\PBZ\platform\steam\ue4ss\Mods\PBZForewarnHooks\Scripts'
CANONICAL = DIRECTORY.rsplit('\\', 1)[0] + r'\PBZForewarnHooks.config.json'
LEGACY = r'C:\Users\Test\AppData\Local\ProjectPBZ\Saved\PBZForewarn.txt'

IO = r'''
T.settingsFiles={};T.settingsWrites=0;T.settingsReads=0;T.legacyReads=0
T.settingsOps={};T.backupWrites=0;T.canonicalReads=0
local function operation(kind,path)T.settingsOps[#T.settingsOps+1]=kind..' '..path end
local function bodyAt(path)
  if path==CONFIG_PATH then return T.json end
  return T.settingsFiles[path]
end
local function put(path,body)
  if path==CONFIG_PATH then T.json=body else T.settingsFiles[path]=body end
end
local function migrationPath(path,ending)
  return path:find('.pre-menu-cleanup'..ending,1,true)~=nil or
    path:find('.pre-generic-default'..ending,1,true)~=nil or
    path:find('.pre-diagnostics-menu'..ending,1,true)~=nil
end
local originalOpen=io.open
io.open=function(path,mode)
  path=path:gsub('/','\\')
  if path:match('events%-PBZForewarnHooks%.txt$') then
    T.noticeReads=(T.noticeReads or 0)+1;T.noticePath=path
    if T.noticeOpenThrows then error('notice open failed')end
    if not T.notice or T.noticeDenied then return nil,'missing',2 end
    return {read=function(self,count)
        if T.noticeReadThrows then error('notice read failed')end
        if T.noticeReadError then return nil,'notice read failed',5 end
        return T.notice:sub(1,count)
      end,close=function()return not T.noticeCloseFails end}
  end
  if path:match('PBZForewarnHooks%.config%.json') then
    local backup=migrationPath(path,'.bak')
    local temp=path:find('.tmp-',1,true)~=nil
    operation(mode,path)
    if mode=='rb' then
      T.settingsReads=T.settingsReads+1
      if path==CONFIG_PATH then
        T.canonicalReads=T.canonicalReads+1
        if T.readyToReplace and T.settingsRaceBody then T.json=T.settingsRaceBody;T.settingsRaceBody=nil end
      end
      if T.jsonDenied and path==CONFIG_PATH or T.backupDenied and backup or
          T.pendingDenied and migrationPath(path,'.pending') then return nil,'permission denied',13 end
      local body=bodyAt(path)
      if body==nil then return nil,'missing',2 end
      return {read=function(self,count)
          if T.settingsReadThrows or backup and T.backupReadThrows then error('read failed')end
          if T.settingsReadError or backup and T.backupReadError then return nil,'read failed',5 end
          if body=='' then return nil end
          return body:sub(1,count)
        end,
        close=function()return not (T.settingsReadCloseFails or backup and T.backupReadCloseFails) end}
    end
    assert(mode=='wb','unexpected settings write mode '..mode)
    T.settingsWrites=T.settingsWrites+1
    if backup then T.backupWrites=T.backupWrites+1 end
    if T.settingsOpenFails or backup and T.backupOpenFails or not backup and T.jsonTempOpenFails then return nil,'config open failed',13 end
    return {write=function(self,body)
        if T.settingsWriteThrows or backup and T.backupWriteThrows or not backup and T.jsonTempWriteThrows then error('config write failed')end
        if T.settingsWriteFails or backup and T.backupWriteFails or not backup and T.jsonTempWriteFails then return nil,'short write'end
        self.body=body;return self
      end,
      close=function(self)
        if T.settingsCloseFails or backup and T.backupCloseFails or not backup and T.jsonTempCloseFails then return nil,'config close failed'end
        local mismatch=T.settingsReadbackMismatch or backup and T.backupReadbackMismatch or not backup and T.jsonTempReadbackMismatch
        put(path,mismatch and '{}' or self.body)
        if temp and not backup then T.readyToReplace=true end
        return true
      end}
  end
  if path:match('PBZForewarn%.txt$') and mode=='rb' then
    T.legacyReads=T.legacyReads+1;T.configPath=path
    if T.legacyDenied then return nil,'permission denied',13 end
    if T.config==nil then return nil,'missing',2 end
    return {read=function(self,count)
        if T.legacyReadError then return nil,'read failed',5 end
        if T.config=='' then return nil end
        return T.config:sub(1,count)
      end,close=function()return not T.legacyCloseFails end}
  end
  if originalOpen then return originalOpen(path,mode) end
  error('unexpected file access '..path)
end
os.rename=function(source,target)
  operation('rename',source..' -> '..target)
  local backup=migrationPath(target,'.bak') and not target:find('.tmp-',1,true)
  local holding=migrationPath(target,'.pending')
  local publishing=target==CONFIG_PATH and source:find('.tmp-',1,true)~=nil
  local restoring=target==CONFIG_PATH and migrationPath(source,'.pending')
  if T.settingsRenameFails or backup and T.backupRenameFails or holding and T.settingsHoldFails
      or publishing and T.settingsPublishFails or restoring and T.settingsRestoreFails then return nil,'rename failed' end
  if backup and T.backupRaceBody then put(target,T.backupRaceBody) end
  if holding and T.settingsRaceAtHold then put(source,T.settingsRaceAtHold) end
  if publishing and T.settingsRaceAtPublish then put(target,T.settingsRaceAtPublish) end
  if restoring and T.recoveryRaceBody then put(target,T.recoveryRaceBody) end
  if bodyAt(target)~=nil then return nil,'target exists' end
  local body=bodyAt(source)
  if body==nil then return nil,'source missing' end
  put(target,publishing and T.settingsFinalMismatch and '{}' or body);put(source,nil)
  if backup and T.backupFinalMismatch then put(target,'{}') end
  return true
end
os.remove=function(path)error('raw deletion prohibited: '..path)end
loadfile=function(path)
  if path:match('settings%-config%.lua$') and not T.helperMissing then
    return assert(load(SETTINGS_SOURCE,'@'..CONFIG_DIRECTORY..'\\settings-config.lua'))
  end
  return nil,'helper missing'
end
'''


def install(lua):
    lua.globals().SETTINGS_SOURCE = HELPER
    lua.globals().CONFIG_DIRECTORY = DIRECTORY
    lua.globals().CONFIG_PATH = CANONICAL
    lua.execute(IO)
