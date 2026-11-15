"""Run the hooks-only entry with Lua stubs; forbid any process or audio IPC."""
from pathlib import Path
import sys, json
sys.path.insert(0, str(Path(__file__).parent / 'lib'))
from lupa import LuaRuntime

SOURCE = (Path(__file__).parents[1] / 'main.lua').read_text(encoding='utf8')
BASE = r'''
T={logs={},loads={},runs=0,stops={},oldCalls=0}
ModRef={OnUnload=function(...)
  T.oldCalls=T.oldCalls+1;T.oldArg=select(1,...);T.stops[#T.stops+1]='previous'
  if T.previousThrows then error('prior unload failed')end
end}
function print(text) T.logs[#T.logs+1]=text end
debug.getinfo=function() return {source=T.source} end
os.execute=function() error('process launch prohibited') end
io.open=function() error('entry point file/audio IPC prohibited') end
loadfile=function(path)
  T.loads[#T.loads+1]=path
  if path:match('observation%-hooks%.lua$') and T.observerMissing then return nil,'optional observer missing' end
  if T.loadThrows then error('load exception') end
  if T.loadMissing then return nil,'missing file' end
  return function()
    T.runs=T.runs+1
    local isObserver=path:match('observation%-hooks%.lua$')~=nil
    local label=isObserver and 'observer' or 'timeline'
    local m={status=function()return {active=not T.observerDisabled}end,
      stop=function()T.stops[#T.stops+1]=label;if T[label..'StopThrows']then error(label..' stop failed')end end}
    if isObserver and T.observerPartialThrows then __PBZForewarnObservationHooks_v1=m;error('observer partial startup')end
    if isObserver and T.observerRunThrows then error('observer startup')end
    if T.runThrows then error('startup exception') end
    if T.badModule then return {} end
    return m
  end
end
'''
passed=[]
def run(source=r'@C:\Games\PBZ\Mods\PBZForewarnHooks\Scripts\main.lua', **options):
    lua=LuaRuntime(unpack_returned_tuples=True);lua.execute(BASE)
    state=lua.globals().T;state.source=source
    for key,value in options.items(): state[key]=value
    if options.get('noModRef'): lua.globals().ModRef=None
    lua.execute(SOURCE)
    state.unload=lua.globals().ModRef.OnUnload if lua.globals().ModRef is not None else None
    return state
def check(condition,label):
    assert condition,label
    passed.append(label);print('PASS '+label)
def logs(state):return '\n'.join(state.logs[i] for i in range(1,len(state.logs)+1))

t=run();check(t.runs==2 and len(t.loads)==2,'loads legacy hints and independent sibling observation module')
check(t.loads[1]==r'C:\Games\PBZ\Mods\PBZForewarnHooks\Scripts\timeline-hooks.lua','resolves hook module beside actual entry')
check('ENTRY_READY' in logs(t),'reports hooks-only startup')
check('ENTRY_READY version=0.6.1-dev.4' in logs(t) and 'OBSERVER_READY version=0.6.1-dev.4' in logs(t),
    'entry and optional observer report the trial build identifier')
check('Wwise' in logs(t) and 'UE Media' not in logs(t),'startup log identifies the current in-game Wwise audio owner')
t=run('@D:/PBZ mods/Forewarn/Scripts/main.lua');check(t.runs==2,'forward-slash absolute paths supported')
t=run(r'@\\server\share\PBZ\Scripts\main.lua');check(t.runs==2,'UNC paths supported without a shell')
t=run(r'@C:\mods\a & b!%\Scripts\main.lua');check(t.runs==2,'path shell characters stay plain Lua file paths')
for source in ['main.lua','@Scripts/main.lua','=chunk','']:
    t=run(source);check(t.runs==0 and 'ENTRY_FAILED' in logs(t),'rejects non-absolute file source '+repr(source))
for option in ['loadThrows','loadMissing','runThrows','badModule']:
    t=run(**{option:True});check('ENTRY_FAILED' in logs(t),'contains '+option+' without launching audio')
t=run(observerMissing=True);check(t.runs==1 and 'ENTRY_READY' in logs(t) and 'OBSERVER_UNAVAILABLE' in logs(t),'missing observer preserves the legacy discovery bridge')
t=run();t.unload('sentinel');t.unload('again')
check([t.stops[i] for i in range(1,len(t.stops)+1)]==['observer','timeline','previous'] and t.oldCalls==1 and t.oldArg=='sentinel','unload stops observer then legacy bridge, preserves callback arguments, and is idempotent')
for options in ({'observerMissing':True},{'observerRunThrows':True}):
    t=run(**options);t.unload()
    check([t.stops[i] for i in range(1,len(t.stops)+1)]==['timeline','previous'],'optional observer failure still cleans legacy bridge '+str(options))
t=run(observerDisabled=True);t.unload()
check([t.stops[i] for i in range(1,len(t.stops)+1)]==['observer','timeline','previous'],'disabled observation module remains safely stoppable on unload')
t=run(observerPartialThrows=True);t.unload()
check([t.stops[i] for i in range(1,len(t.stops)+1)]==['observer','timeline','previous'],'partially started observer singleton is cleaned without losing legacy cleanup')
t=run(observerStopThrows=True,timelineStopThrows=True,previousThrows=True);t.unload();t.unload()
check(len(t.stops)==3 and t.oldCalls==1 and 'UNLOAD_STOP_FAILED observer' in logs(t) and 'UNLOAD_STOP_FAILED timeline' in logs(t) and 'UNLOAD_PREVIOUS_FAILED' in logs(t),'independent cleanup failures never skip the other module or previous callback')
t=run(noModRef=True);check(t.runs==2 and t.unload is None and 'ENTRY_READY' in logs(t),'host without ModRef loads without crashing or creating a fake callback')
print('RESULT '+str(len(passed))+' launcher scenarios passed. No game or process access.')
(Path(__file__).parent/'launcher-results.json').write_text(json.dumps({'checks':len(passed),'passed':passed},indent=2),encoding='utf8')
