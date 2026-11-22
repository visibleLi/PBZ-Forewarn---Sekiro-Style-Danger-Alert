"""Project config I/O stub shared by Lua startup suites; no disk/game access."""
from pathlib import Path

HELPER = (Path(__file__).parents[1] / 'settings-config.lua').read_text(encoding='utf8')
DIRECTORY = r'C:\Games\PBZ\platform\steam\ue4ss\Mods\PBZForewarnHooks\Scripts'
CANONICAL = DIRECTORY.rsplit('\\', 1)[0] + r'\PBZForewarnHooks.config.json'
LEGACY = r'C:\Users\Test\AppData\Local\ProjectPBZ\Saved\PBZForewarn.txt'

IO = r'''
T.settingsFiles={};T.settingsWrites=0;T.settingsReads=0;T.legacyReads=0
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
    if mode=='rb' then
      T.settingsReads=T.settingsReads+1
      if T.jsonDenied and path==CONFIG_PATH then return nil,'permission denied',13 end
      local body=path==CONFIG_PATH and T.json or T.settingsFiles[path]
      if body==nil then return nil,'missing',2 end
      return {read=function(self,count)
          if T.settingsReadThrows then error('read failed')end
          if T.settingsReadError then return nil,'read failed',5 end
          if body=='' then return nil end
          return body:sub(1,count)
        end,
        close=function()return not T.settingsReadCloseFails end}
    end
    T.settingsWrites=T.settingsWrites+1
    if T.settingsOpenFails then return nil,'config open failed',13 end
    return {write=function(self,body)
        if T.settingsWriteThrows then error('config write failed')end
        if T.settingsWriteFails then return nil,'short write'end
        self.body=body;return self
      end,
      close=function(self)
        if T.settingsCloseFails then return nil,'config close failed'end
        T.settingsFiles[path]=T.settingsReadbackMismatch and '{}' or self.body;return true
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
  if T.settingsRenameFails then return nil,'rename failed' end
  if T.json then return nil,'target exists' end
  T.json=T.settingsFinalMismatch and '{}' or T.settingsFiles[source];T.settingsFiles[source]=nil;return true
end
os.remove=function(path)T.settingsFiles[path]=nil;return true end
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
