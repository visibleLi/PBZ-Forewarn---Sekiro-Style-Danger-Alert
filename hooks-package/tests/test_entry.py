"""Run the hooks-only entry with Lua stubs; forbid any process or audio IPC."""
from pathlib import Path
import sys, json
sys.path.insert(0, str(Path(__file__).parent / 'lib'))
from lupa import LuaRuntime

SOURCE = (Path(__file__).parents[1] / 'main.lua').read_text(encoding='utf8')
BASE = r'''
T={logs={},loads={},runs=0}
function print(text) T.logs[#T.logs+1]=text end
debug.getinfo=function() return {source=T.source} end
os.execute=function() error('process launch prohibited') end
io.open=function() error('entry point file/audio IPC prohibited') end
loadfile=function(path)
  T.loads[#T.loads+1]=path
  if T.loadThrows then error('load exception') end
  if T.loadMissing then return nil,'missing file' end
  return function()
    T.runs=T.runs+1
    if T.runThrows then error('startup exception') end
    if T.badModule then return {} end
    return {status=function() return {active=true} end}
  end
end
'''
passed=[]
def run(source=r'@C:\Games\PBZ\Mods\PBZForewarnHooks\Scripts\main.lua', **options):
    lua=LuaRuntime(unpack_returned_tuples=True);lua.execute(BASE)
    state=lua.globals().T;state.source=source
    for key,value in options.items(): state[key]=value
    lua.execute(SOURCE)
    return state
def check(condition,label):
    assert condition,label
    passed.append(label);print('PASS '+label)
def logs(state):return '\n'.join(state.logs[i] for i in range(1,len(state.logs)+1))

t=run();check(t.runs==1 and len(t.loads)==1,'loads and runs only the sibling hook module')
check(t.loads[1]==r'C:\Games\PBZ\Mods\PBZForewarnHooks\Scripts\timeline-hooks.lua','resolves hook module beside actual entry')
check('ENTRY_READY' in logs(t),'reports hooks-only startup')
check('Wwise' in logs(t) and 'UE Media' not in logs(t),'startup log identifies the current in-game Wwise audio owner')
t=run('@D:/PBZ mods/Forewarn/Scripts/main.lua');check(t.runs==1,'forward-slash absolute paths supported')
t=run(r'@\\server\share\PBZ\Scripts\main.lua');check(t.runs==1,'UNC paths supported without a shell')
t=run(r'@C:\mods\a & b!%\Scripts\main.lua');check(t.runs==1,'path shell characters stay plain Lua file paths')
for source in ['main.lua','@Scripts/main.lua','=chunk','']:
    t=run(source);check(t.runs==0 and 'ENTRY_FAILED' in logs(t),'rejects non-absolute file source '+repr(source))
for option in ['loadThrows','loadMissing','runThrows','badModule']:
    t=run(**{option:True});check('ENTRY_FAILED' in logs(t),'contains '+option+' without launching audio')
print('RESULT '+str(len(passed))+' launcher scenarios passed. No game or process access.')
(Path(__file__).parent/'launcher-results.json').write_text(json.dumps({'checks':len(passed),'passed':passed},indent=2),encoding='utf8')
