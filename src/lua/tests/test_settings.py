"""Startup-only Lua config migration and preservation under stubbed file I/O."""
from pathlib import Path
import json
import sys
sys.path.insert(0, str(Path(__file__).parent / 'lib'))
from lupa import LuaRuntime
from settings_fixture import install, HELPER, DIRECTORY, CANONICAL

checks = []
def check(condition, label):
    assert condition, label
    checks.append(label)


def fresh(config=None, body=None, **flags):
    lua = LuaRuntime(unpack_returned_tuples=True)
    lua.execute(r'''
T={logs={}}
function print(text)T.logs[#T.logs+1]=text end
os.getenv=function()return [[C:\Users\Test\AppData\Local]]end
os.execute=function()error('process launch prohibited')end
io.open=function()error('unexpected disk access')end
''')
    install(lua)
    t = lua.globals().T
    t.config, t.json = config, body
    for key, value in flags.items():
        t[key] = value
    helper = lua.execute(HELPER)
    result = helper.load(DIRECTORY)
    return lua, helper, result


def logs(lua):
    t = lua.globals().T
    return '\n'.join(t.logs[i] for i in range(1, len(t.logs)+1))

legacy = '\ufeffhOoKs=0 # disabled\nDiagnostics=false ; quiet\nLeadMs=2000\nLeadMs=invalid\nSoundVolume=-3\nObservationFlushMs=1\nUnknownFlag=true\nUnknownCount=7\nUnknownText=a "quoted" path\\测试\nGenericAttack=1\n'
l, m, s = fresh(config=legacy)
t = l.globals().T
payload = json.loads(t.json)
check(m.path == CANONICAL, 'canonical path resolves in the mod directory beside Scripts')
check(s.Hooks is False and s.Diagnostics is False and s.GenericAttack is True, 'migration preserves commented boolean flags including reserved legacy value')
check(s.LeadMs == 1000 and s.SoundVolume == 0 and s.ObservationFlushMs == 5000, 'migration clamps bounds and ignores later invalid numbers')
check(payload['UnknownFlag'] == 'true' and payload['UnknownCount'] == '7' and payload['UnknownText'] == 'a "quoted" path\\测试', 'migration keeps unknown legacy values as strings without exposing editable menu controls')
check(t.config == legacy and t.settingsWrites == 1 and t.legacyReads == 1, 'migration writes one verified JSON and never modifies legacy TXT')
reads = t.settingsReads
t.json = '{"Hooks":true}'
check(m.load(DIRECTORY).Hooks is False and t.settingsReads == reads, 'startup snapshot ignores later menu edits until restart')
s.Hooks = True
check(m.load(DIRECTORY).Hooks is False, 'consumer mutation does not change cached flag snapshot')
check(l.execute(HELPER).load(DIRECTORY).Hooks is False and t.settingsWrites == 1, 'helper reload shares singleton and never repeats creation')

body = ' \r\n{ "Hooks" : true, "Diagnostics":false, "LeadMs":42, "Extra":null, "Odd\\\"Key":"\\ud83d\\ude00", "Float":-1.2e+3 }\n'
l, m, s = fresh(config='Hooks=0\nLeadMs=900', body=body)
check(s.Hooks is True and s.Diagnostics is False and s.LeadMs == 42, 'existing valid JSON takes priority over stale TXT')
check(l.globals().T.json == body and l.globals().T.settingsWrites == 0 and l.globals().T.legacyReads == 0, 'existing JSON bytes preserved with no legacy access or writes')
check(s['Extra'] is not None and s['Odd"Key'] == '😀' and s.Float == -1200, 'codec supports unknown null escaped key surrogate pair and finite exponent')
l, m, s = fresh(config='Hooks=0', body='{"Hooks":null,"Diagnostics":null,"LeadMs":null}')
check(s.Hooks is True and s.Diagnostics is True and s.LeadMs == 350, 'null known settings retain defaults without stale legacy fallback')

l, m, s = fresh(body='﻿{"Hooks":false,"Hooks":true,"LeadMs":"125"}')
check(s.Hooks is True and s.LeadMs == 125, 'duplicate keys use last value and numeric strings match JS interpretation')

l, m, s = fresh(body='{"Hooks":true,"hooks":false}')
check(s.Hooks is False, 'case-variant JSON aliases resolve consistently in lexical order')
l, m, s = fresh(config='')
check(s.LeadMs == 350 and json.loads(l.globals().T.json)['LeadMs'] == 350,
      'empty legacy TXT is imported as defaults and canonical JSON is created')

invalid = ['[]', '{"Hooks":false,}', '{"Hooks":false} trailing',
           '{"Nested":{}}', '{"Nested":[]}', '{"LeadMs":01}', '{"LeadMs":+1}', '{"LeadMs":0x10}',
           '{"LeadMs":.5}', '{"LeadMs":1.}', '{"LeadMs":1e}', '{"LeadMs":1e999}',
           '{"Bad":"\\x20"}', '{"Bad":"\\ud800"}', '{"Bad":"\\udc00"}', '{"Bad":"line\nfeed"}', '',
           '{"Bad":NaN}', '{"Bad":Infinity}', '{"Bad":truefalse}']
for body in invalid:
    l, m, s = fresh(config='Hooks=0\nLeadMs=900', body=body)
    check(s.Hooks is True and s.LeadMs == 350 and l.globals().T.json == body and l.globals().T.settingsWrites == 0
          and l.globals().T.legacyReads == 0 and 'CONFIG_INVALID' in logs(l), 'rejects malformed or nested JSON without overwrite '+repr(body))
for flag in ['jsonDenied', 'settingsReadThrows', 'settingsReadError', 'settingsReadCloseFails']:
    l, m, s = fresh(config='Hooks=0', body='{"Hooks":false}', **{flag: True})
    check(s.Hooks is True and l.globals().T.legacyReads == 0 and l.globals().T.settingsWrites == 0
          and 'CONFIG_READ_FAILED' in logs(l), 'unreadable JSON retains defaults and never imports TXT '+flag)
for flag in ['settingsOpenFails', 'settingsWriteFails', 'settingsWriteThrows', 'settingsCloseFails',
             'settingsReadbackMismatch', 'settingsRenameFails']:
    l, m, s = fresh(config='Hooks=0\nLeadMs=700', **{flag: True})
    check(s.Hooks is False and s.LeadMs == 700 and l.globals().T.json is None
          and l.globals().T.config == 'Hooks=0\nLeadMs=700' and 'MIGRATION_FAILED' in logs(l),
          'failed migration preserves legacy authority in memory '+flag)
for flag in ['legacyDenied', 'legacyReadError', 'legacyCloseFails']:
    l, m, s = fresh(config='Hooks=0', **{flag: True})
    check(l.globals().T.json is None and l.globals().T.settingsWrites == 0 and 'MIGRATION_FAILED' in logs(l),
          'unreadable legacy never creates replacement defaults '+flag)
l, m, s = fresh(config='Hooks=0', settingsFinalMismatch=True)
check(l.globals().T.json == '{}' and s.Hooks is False and 'MIGRATION_FAILED' in logs(l),
      'failed final readback is reported and published file is not deleted or falsely confirmed')
l, m, s = fresh()
check(s.Hooks is True and json.loads(l.globals().T.json)['LeadMs'] == 350, 'menu and legacy absent create JSON defaults without any Menu dependency')
for body in ['{"Hooks":0.0,"Diagnostics":0e0}', '{"Hooks":true,"hooks":false}']:
    l, m, s = fresh(body=body)
    check(s.Hooks is False, 'JSON boolean numeric forms and aliases match JS '+body)
for text, expected in [('0b11001000',200), ('0o310',200), ('0xC8',200), ('0x1p7',350), ('+0xC8',350), ('.2e3',200)]:
    l, m, s = fresh(config='LeadMs='+text)
    check(s.LeadMs == expected and json.loads(l.globals().T.json)['LeadMs'] == expected,
          'migration uses JavaScript numeric grammar '+text)
    l, m, s = fresh(body=json.dumps({'LeadMs':text}))
    check(s.LeadMs == expected, 'JSON string uses JavaScript numeric grammar '+text)
l, m, s = fresh(body=json.dumps({'Hooks':False,'Extra':'中'*22000},ensure_ascii=False))
check(s.Hooks is True and 'CONFIG_READ_FAILED' in logs(l), 'UTF-8 byte limit rejects oversized Unicode JSON consistently')

for encoding, bom in [('utf-16-le',b'\xff\xfe'),('utf-16-be',b'\xfe\xff')]:
    original=bom+'Hooks=0\nSoundOn=0\nLeadMs=200\n'.encode(encoding)
    l, m, s = fresh(config=original)
    check(s.Hooks is False and s.SoundOn is False and s.LeadMs == 200
          and json.loads(l.globals().T.json)['Hooks'] is False,
          'BOM-marked legacy UTF-16 migration preserves settings '+encoding)
l, m, s = fresh(config=b'\xff\xfeH')
check(l.globals().T.json is None and 'MIGRATION_FAILED' in logs(l),
      'truncated UTF-16 is preserved without publishing default JSON')
l, m, s = fresh(config=' Hooks= 0 \nLeadMs=　200　')
check(s.Hooks is False and s.LeadMs == 200, 'Unicode whitespace matches JS during legacy migration')
l, m, s = fresh(body=json.dumps({'LeadMs':' 200 '}))
check(s.LeadMs == 200, 'Unicode whitespace matches JS numeric JSON string conversion')
for body in ['{"Hooks":false,"Extra":{},"Extra":null}',
             '{"Hooks":false,"Extra":"\\ud800","Extra":null}',
             '{"Hooks":false,"Extra":1e999,"Extra":null}']:
    l, m, s = fresh(body=body)
    check(s.Hooks is True and 'CONFIG_INVALID' in logs(l), 'invalid overwritten JSON member is rejected '+body)

# Refresh is read-only, atomic, and excludes reserved and unknown controls.
l,m,s=fresh(body='{"Hooks":false,"TickMs":32,"GenericAttack":true,"Extra":7}')
t=l.globals().T
t.json='{"Hooks":true,"LeadMs":800,"ObservationFlushMs":1,"TickMs":99,"GenericAttack":false,"Extra":8}'
s=m.refresh()
check(s.Hooks is True and s.LeadMs==800 and s.ObservationFlushMs==5000, 'refresh applies editable flags and clamped numbers')
check(s.TickMs==32 and s.GenericAttack is True and s.Extra==7, 'refresh preserves reserved and unknown startup controls')
check(t.settingsWrites==0 and t.legacyReads==0, 'refresh never rewrites canonical JSON or reads legacy TXT')
for body in (None, '', '{"Hooks":false,}', '{"Hooks":false,"Nested":{}}'):
    t.json=body
    result=m.refresh()
    check(isinstance(result,tuple) and result[0] is None and m.load(DIRECTORY).Hooks is True,
          'failed refresh retains previous snapshot '+repr(body))
for flag in ('jsonDenied','settingsReadThrows','settingsReadError','settingsReadCloseFails'):
    t.json='{"Hooks":false}';t[flag]=True
    result=m.refresh();t[flag]=False
    check(isinstance(result,tuple) and result[0] is None and m.load(DIRECTORY).LeadMs==800,
          'refresh read failure retains complete previous snapshot '+flag)
s.Hooks=False
check(m.load(DIRECTORY).Hooks is True, 'refreshed settings remain defensive copies')

# Load the actual entry, helper and hook modules together with functioning APIs.
root = Path(__file__).parents[1]
for disabled in (False, True):
    lua = LuaRuntime(unpack_returned_tuples=True)
    lua.execute(r'''
T={logs={},scheduled=0,loops=0}
function print(text)T.logs[#T.logs+1]=text end
os.getenv=function()return [[C:\Users\Test\AppData\Local]]end
io.open=function()error('unexpected disk access')end
ModRef={}
function ExecuteInGameThread(fn)T.scheduled=T.scheduled+1 end
function LoopAsync(ms,fn)T.loops=T.loops+1 end
function LoopInGameThreadWithDelay(ms,fn)T.scheduled=T.scheduled+1 end
function IsInGameThread()return true end
function StaticFindObject()return nil end
function RegisterHook()return 1,2 end
function UnregisterHook()end
''')
    install(lua)
    lua.globals().T.config = 'Hooks=0' if disabled else 'Hooks=1'
    modules = {name:(root/name).read_text(encoding='utf8') for name in
               ('main.lua','timeline-hooks.lua','observation-hooks.lua','settings-config.lua')}
    lua.globals().MODULE_SOURCES = lua.table_from(modules)
    lua.execute(r'''
loadfile=function(path)
  local name=path:match('([^/\\]+)$')
  local source=MODULE_SOURCES[name]
  if not source then return nil,'missing module' end
  return load(source,'@'..CONFIG_DIRECTORY..'\\'..name)
end
''')
    lua.execute(modules['main.lua'], name='@'+DIRECTORY+'\\main.lua')
    t = lua.globals().T
    check(t.settingsWrites == 1 and t.legacyReads == 1,
          'real entry and both hook modules share one migration disabled='+str(disabled))
    if disabled:
        check(t.scheduled > 0 and t.loops == 3 and 'startup settings' in logs(lua)
              and 'startup config' in logs(lua), 'disabled startup retains watcher and paused consumer loops')
    else:
        check(t.scheduled > 0 and t.loops == 3, 'enabled startup creates watcher and two consumer loops')

# Exercise Menu notices through the actual entry and both actual consumers.
for disabled in (False, True):
    lua=LuaRuntime(unpack_returned_tuples=True)
    lua.execute(r'''
T={logs={},scheduled={},loops={},gameLoops={},registered=0,removed=0,writes={},mode='test'}
function print(text)T.logs[#T.logs+1]=text end
os.getenv=function()return [[C:\Users\Test\AppData\Local]]end
io.open=function(path,mode)
  assert(mode=='wb','unexpected read '..path)
  return {write=function(self,body)self.body=body;return self end,
    close=function(self)T.writes[#T.writes+1]=self.body;return true end}
end
ModRef={}
function ExecuteInGameThread(fn)
  if T.scheduleFail then error('schedule failed')end
  T.scheduled[#T.scheduled+1]=fn
end
function LoopAsync(ms,fn)T.loops[#T.loops+1]={ms=ms,fn=fn}end
function LoopInGameThreadWithDelay(ms,fn)assert(T.mode=='game');T.gameLoops[#T.gameLoops+1]=fn end
function IsInGameThread()return T.mode=='game'end
function StaticFindObject(path)
  assert(T.mode=='game','lookup off game thread')
  return {IsValid=function()assert(T.mode=='game');return true end,
    GetFullName=function()assert(T.mode=='game');return 'Function '..path end}
end
function RegisterHook()assert(T.mode=='game');T.registered=T.registered+1;return T.registered*2-1,T.registered*2 end
function UnregisterHook()assert(T.mode=='game');T.removed=T.removed+1 end
function game()
  T.mode='game';while #T.scheduled>0 do table.remove(T.scheduled,1)()end;T.mode='test'
end
function watch()
  T.mode='async';for _,loop in ipairs(T.loops)do if loop.ms==500 then T.watchResult=loop.fn()end end;T.mode='test'
end
''')
    install(lua)
    t=lua.globals().T;t.config='Hooks=0' if disabled else 'Hooks=1'
    lua.globals().MODULE_SOURCES=lua.table_from(modules)
    lua.execute(r'''
loadfile=function(path)
  local name=path:match('([^/\\]+)$')
  local source=MODULE_SOURCES[name]
  if not source then return nil,'missing module' end
  return load(source,'@'..CONFIG_DIRECTORY..'\\'..name)
end
''')
    lua.execute(modules['main.lua'],name='@'+DIRECTORY+r'\main.lua')
    lua.execute('game()')
    timeline=lua.globals().__PBZForewarnTimelineHooks_v1
    observer=lua.globals().__PBZForewarnObservationHooks_v1
    helper=lua.globals().__PBZForewarnSettingsConfig_v1
    lua.execute('T.originalUnload=ModRef.OnUnload')
    lua.execute(modules['main.lua'],name='@'+DIRECTORY+r'\main.lua')
    check(len(t.loops)==3 and lua.eval('T.originalUnload==ModRef.OnUnload'),
          'entry reload reuses watcher and unload chain without leaks')
    initial=t.registered
    check(len(t.loops)==3 and len(t.gameLoops)==1 and timeline.status().active==(not disabled),
          'actual modules retain one watcher and resident loops disabled='+str(disabled))
    t.json='{"Hooks":true,"Diagnostics":true,"ObserveAttacks":true,"TickMs":100}'
    for notice in (None, 'Changed=1\n', 'Changed=1\nEnd=0\n', 'Changed=9007199254740992\nEnd=1\n', 'Changed=1\nEnd=1\n'+'x'*4096):
        t.notice=notice;lua.execute('watch();game()')
        check(t.registered==initial and timeline.status().active==(not disabled),
              'invalid absent incomplete or oversized notice ignored '+repr(notice and notice[:32]))
    t.notice='Changed=1\r\nEnd=1';t.json='{"Hooks":true,'
    lua.execute('watch();game()')
    check(timeline.status().active==(not disabled), 'torn JSON retains states without consuming notice')
    t.json='{"Hooks":true,"Diagnostics":true,"ObserveAttacks":true,"TickMs":100}'
    lua.execute('watch()')
    check(timeline.status().active==(not disabled), 'async watcher schedules rather than applies consumers')
    lua.execute('game()')
    check(timeline.status().active and observer.status().active and t.registered==4 and helper.load(DIRECTORY).TickMs==16,
          'same notice retries repaired JSON and applies both actual consumers on game thread')
    check(t.noticePath==DIRECTORY.rsplit(chr(92),2)[0]+chr(92)+'PBZModsMenuBridge'+chr(92)+'events-PBZForewarnHooks.txt',
          'watcher resolves established sibling Menu path')
    for flag in ('noticeDenied','noticeOpenThrows','noticeReadThrows','noticeReadError','noticeCloseFails','jsonDenied','settingsReadError','settingsReadCloseFails'):
        t.notice='Changed=2\nEnd=1\n';t.json='{"Hooks":false}';t[flag]=True
        lua.execute('watch();game()');t[flag]=False
        check(timeline.status().active and observer.status().active, 'bad save read retains consumers '+flag)
    lua.execute('watch();game()')
    check(not timeline.status().active and not observer.status().active, 'higher notice retries failed read and pauses both consumers')
    for change in (1,2):
        t.notice='Changed='+str(change)+'\nEnd=1\n';t.json='{"Hooks":true}'
        lua.execute('watch();game()')
        check(not timeline.status().active, 'old duplicate notice ignored '+str(change))
    for change,fields in ((3,{'Hooks':True,'Diagnostics':False}), (4,{'Hooks':True,'Diagnostics':True,'ObserveAttacks':False}),
                          (5,{'Hooks':True,'Diagnostics':True,'ObserveAttacks':True})):
        t.notice='Changed='+str(change)+'\nEnd=1\n';t.json=json.dumps(fields)
        lua.execute('watch();game()')
        check(timeline.status().active and observer.status().active==(change==5), 'independent observer flags change='+str(change))
    check(t.registered==4 and len(t.loops)==3 and len(t.gameLoops)==1 and t.settingsWrites==1 and t.legacyReads==1,
          'live changes do not multiply hooks loops migrations or settings writes')
    t.notice='Changed=6\nEnd=1\n';t.json='{"Hooks":false}'
    lua.execute('T.scheduleFail=true;watch();game();T.scheduleFail=false')
    check(timeline.status().active and observer.status().active, 'failed game-thread scheduling retains active consumers')
    lua.execute('watch();game()')
    check(not timeline.status().active and not observer.status().active, 'same notice retries failed game-thread scheduling')
    t.notice='Changed=7\nEnd=1\n';t.json='{"Hooks":true}'
    lua.execute('watch()')
    t.notice='Changed=8\nEnd=1\n';t.json='{"Hooks":false}'
    lua.execute('watch()')
    check(len(t.scheduled)==1, 'consecutive menu saves coalesce into one game-thread callback')
    lua.execute('game()')
    check(not timeline.status().active and not observer.status().active and t.registered==4,
          'coalesced callback applies latest snapshot without transient enable or extra hooks')
    t.notice='Changed=9\nEnd=1\n';t.json='{"Hooks":true}'
    lua.execute('watch();ModRef.OnUnload();game();watch()')
    check(t.watchResult is True and timeline.status().stopped and observer.status().stopped and t.removed==4,
          'unload cancels watcher guards pending settings and unregisters each hook once')

# Both standalone hooks must read the same helper before any engine scheduling.
root = Path(__file__).parents[1]
for first, second in [('timeline-hooks.lua', 'observation-hooks.lua'), ('observation-hooks.lua', 'timeline-hooks.lua')]:
    lua = LuaRuntime(unpack_returned_tuples=True)
    lua.execute(r'''
T={logs={}}
function print(text)T.logs[#T.logs+1]=text end
os.getenv=function()return [[C:\Users\Test\AppData\Local]]end
io.open=function()error('unexpected disk access')end
''')
    install(lua)
    lua.globals().T.config = 'Hooks=0'
    for filename in (first, second):
        mod = lua.execute((root / filename).read_text(encoding='utf8'), name='@'+DIRECTORY+'\\'+filename)
        check(not mod.status().active, 'shared startup config disables standalone '+filename+' first='+first)
    check(lua.globals().T.settingsWrites == 1 and lua.globals().T.legacyReads == 1,
          'startup ordering creates canonical JSON only once first='+first)

result = {'checks':len(checks), 'passed':checks, 'scope':'Lua stub I/O only; no game or Menu execution.'}
(Path(__file__).parent / 'settings-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False,indent=2))
