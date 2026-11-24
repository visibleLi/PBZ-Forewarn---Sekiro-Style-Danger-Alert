from pathlib import Path
import json, sys
sys.path.insert(0, str(Path(__file__).parent / 'lib'))
from lupa.lua54 import LuaRuntime
from settings_fixture import install, DIRECTORY

SOURCE = (Path(__file__).parents[1] / 'timeline-hooks.lua').read_text(encoding='utf8')
BASE = r'''
T = {now=1800000000,mode='init',scheduled={},loops={},registered={},removed={},writes={},logs={},bad={},calls=0}
function print(x) T.logs[#T.logs+1]=x end
os.getenv=function(name) return 'C:\\Users\\Test\\AppData\\Local' end
os.time=function() return T.now end
io.open=function(path,mode)
  if mode=='rb' then
    T.configPath=path
    if not T.config then return nil,'no config file' end
    return {read=function(self,count)return T.config:sub(1,count)end,close=function()return true end}
  end
  if T.writeFails then return nil,'simulated locked output' end
  return {write=function(self,payload)
      if T.writeThrows then error('simulated write exception') end
      if T.writeOpFails then return nil,'simulated short write' end
      self.payload=payload;return self
    end,
    close=function(self)
      T.closeAttempts=(T.closeAttempts or 0)+1
      if T.closeThrows then error('simulated close exception') end
      if T.closeFails then return nil,'simulated close failure' end
      if self.payload then T.writes[#T.writes+1]={path=path,payload=self.payload} end
      return true
    end}
end
function IsInGameThread()return T.mode=='game'end
function requireGame() assert(T.mode=='game','UObject API was used outside game thread') end
function object(full)
  return {IsValid=function()requireGame();return true end,
    GetFullName=function()requireGame();return full end}
end
function ability(taskReady)
  local a=object('GA_Test_C /Game/Test.Ability_123')
  a.GetPlayTimelineTask=function()
    requireGame();if taskReady then return object('LGATask_PlayTimeline /Game/Test.Task_456') end
  end
  a.GetAvatarActorFromActorInfo=function()requireGame();return object('PBZCharacter_NPC /Game/Test.NPC_789')end
  return a
end
function context(a)return {get=function()requireGame();return a end}end
function StaticFindObject(path)
  requireGame();T.calls=T.calls+1
  if T.bad[path]=='missing' then return nil end
  if T.bad[path]=='notfunction' then return object('Object '..path) end
  return object('Function '..path)
end
function RegisterHook(path,pre,post)
  requireGame()
  if T.bad[path]=='register' then error('simulated registration failure') end
  local n=#T.registered*2+1
  T.registered[#T.registered+1]={path=path,pre=pre,post=post,a=n,b=n+1}
  return n,n+1
end
function UnregisterHook(path,pre,post)
  requireGame();T.removed[#T.removed+1]={path=path,a=pre,b=post};return true
end
function ExecuteInGameThread(fn)T.scheduled[#T.scheduled+1]=fn end
function LoopAsync(ms,fn)T.loops[#T.loops+1]={ms=ms,fn=fn}end
function game()
  T.mode='game'
  while #T.scheduled>0 do local f=table.remove(T.scheduled,1);f()end
  T.mode='test'
end
function tick()
  T.mode='async';local r=T.loops[1].fn();T.mode='test';return r
end
function hit(index,a)
  T.mode='game';local h=T.registered[index]
  local pre=h.pre(context(a),'unused',true)
  local count=select('#',h.post(context(a),'unused',true))
  T.mode='test';assert(pre==nil and count==0,'hook must not return an override')
end
'''

checks=[]
def check(value, label):
    assert value, label
    checks.append(label)

def fresh(before=''):
    lua=LuaRuntime(unpack_returned_tuples=True)
    lua.execute(BASE)
    install(lua)
    if before: lua.execute(before)
    module=lua.execute(SOURCE, name='@'+DIRECTORY+'\\timeline-hooks.lua')
    return lua,module

def payload(lua):
    t=lua.globals().T
    return json.loads(t.writes[len(t.writes)].payload)

def log_count(lua, text):
    logs=lua.globals().T.logs
    return sum(text in logs[i] for i in range(1,len(logs)+1))

l,m=fresh()
check(len(l.globals().T.registered)==0, 'registration is scheduled onto game thread')
l.execute('game()')
check(len(l.globals().T.registered)==2, 'both verified native function paths register')
check(l.globals().T.loops[1].ms==50, 'publisher schedules at 50ms; no faster loop')
l.execute('tick()')
p=payload(l)
check(p['version']==1 and p['seq']==0 and p['hints']==[] and p['heartbeat']==1800000000000, 'initial envelope and millisecond epoch heartbeat')
check(p['health']['registered']==2 and p['health']['lastSuccessfulWriteMs']==1800000000000
      and not p['health']['currentlyFailing'] and p['health']['writeFailures']==0,
      'successful bridge snapshot includes registered hook and last successful write health')
l.execute('hit(1,ability(true));tick()')
p=payload(l)
check(p['seq']==1 and p['hints'][0]==dict(seq=1,ability='/Game/Test.Ability_123',task='/Game/Test.Task_456',actor='/Game/Test.NPC_789',kind='play',at=1800000000000), 'native post creates complete pure-string hint without return override')
l.execute('hit(2,ability(false));tick()')
p=payload(l)
check(p['hints'][-1]['task']=='' and p['hints'][-1]['ability'], 'not-yet-ready task still records ability discovery')
before=len(l.globals().T.writes)
l.execute('tick();tick()')
check(len(l.globals().T.writes)==before, 'unchanged same-second snapshot is not rewritten')
l.execute('T.now=T.now+1;tick()')
check(payload(l)['heartbeat']==1800000001000 and len(l.globals().T.writes)==before+1, 'idle heartbeat is republished when epoch second advances')
l.execute('for i=1,140 do hit(1,ability(true)) end;tick()')
p=payload(l)
check(len(p['hints'])==128 and p['hints'][0]['seq']==15 and p['hints'][-1]['seq']==142, '128-entry FIFO preserves ordered sequence numbers')
l.execute(r'''T.mode='game';local a=ability(true);a.GetFullName=function()requireGame();return 'GA_C /Game/A"\\B\n中文'end;T.mode='test';hit(1,a);tick()''')
check(payload(l)['hints'][-1]['ability']=='/Game/A"\\B\n中文', 'JSON escapes quotes, backslashes, newline and preserves UTF-8')
count=len(l.globals().T.registered)
again=l.execute(SOURCE)
check(len(l.globals().T.registered)==count and again.status()['hits']==m.status()['hits'], 'reloading module is idempotent within one Lua state')
l.execute('T.writeFails=true;hit(1,ability(true));tick()')
old=len(l.globals().T.writes)
l.execute('T.writeFails=false;tick()')
check(len(l.globals().T.writes)==old+1 and payload(l)['seq']==144, 'output open failure retries pending snapshot')
m.stop()
check(payload(l)['active'] is False and payload(l)['heartbeat']==0 and payload(l)['hints']==[], 'stop publishes empty inactive tombstone')
l.execute('game()')
check(len(l.globals().T.removed)==2 and l.globals().T.removed[1].a==1 and l.globals().T.removed[1].b==2, 'stop unregisters exact hook IDs on game thread')
check(l.eval('tick()') is True, 'async loop self-cancels after stop')
seq=m.status()['seq']
l.execute('hit(1,ability(true))')
check(m.status()['seq']==seq, 'late callbacks after stop are inert')

for failure in ['missing','notfunction','register']:
    z,mod=fresh("T.bad['/Script/LegoAbility.LegoAbility:PlayTimeline']='"+failure+"'")
    z.execute('game();tick()')
    check(len(z.globals().T.registered)==1, failure+' first function degrades without losing second observer')
    check(payload(z)['health']['registrationFailures']==1 and mod.status()['health']['registrationFailures']==1,
          failure+' registration failure remains visible in status and file health')

z,mod=fresh("os.getenv=function()return 'relative/path'end")
check(len(z.globals().T.loops)==0 and not mod.status()['active'], 'non-absolute Saved root disables bridge')
z,mod=fresh('RegisterHook=nil')
check(len(z.globals().T.loops)==0 and not mod.status()['active'], 'missing required host API disables bridge')
z,mod=fresh()
z.execute("game();T.mode='game';T.registered[1].post({get=function()error('stale wrapper')end});T.mode='test';tick()")
check(mod.status()['hits']==0 and payload(z)['hints']==[], 'invalid RemoteUnrealParam is contained without fabricated event')
check(payload(z)['health']['captureFailures']==1 and payload(z)['health']['lastErrorStage']=='capture',
      'capture failure health remains separate from publisher failure totals')

z,mod=fresh()
z.execute('game();tick();T.now=T.now+1;T.writeFails=true;tick();tick()')
h=mod.status()['health']
check(h['writeFailures']==2 and h['openFailures']==2 and h['currentlyFailing']
      and h['lastSuccessfulWriteMs']==1800000000000 and log_count(z,'WRITE_FAILED')==1,
      'repeated open failures accumulate without advancing successful time or flooding first-failure log')
z.execute('T.writeFails=false;tick();tick()')
p=payload(z)
check(p['health']['writeFailures']==2 and p['health']['openFailures']==2 and p['health']['recoveries']==1
      and p['health']['lastSuccessfulWriteMs']==1800000001000 and not p['health']['currentlyFailing']
      and p['health']['lastErrorStage']=='open' and log_count(z,'WRITE_RECOVERED')==1,
      'successful retry commits cumulative failure history and one recovery to file health')
check(mod.status()['health']['recoveries']==1 and mod.status()['health']['lastSuccessfulWriteMs']==p['health']['lastSuccessfulWriteMs'],
      'in-memory successful health matches the committed recovery snapshot')

for mode,stage,field in [('writeOpFails','write','writeOperationFailures'),('writeThrows','write','writeOperationFailures'),
                        ('closeFails','close','closeFailures'),('closeThrows','close','closeFailures')]:
    z,mod=fresh()
    z.execute('game();tick();T.now=T.now+1;T.'+mode+'=true;tick()')
    h=mod.status()['health']
    check(h['writeFailures']==1 and h[field]==1 and h['lastErrorStage']==stage
          and h['lastSuccessfulWriteMs']==1800000000000 and z.globals().T.closeAttempts==2,
          mode+' is contained, closes the file, and does not commit success metadata')
    z.execute('T.'+mode+'=false;tick()')
    check(payload(z)['health'][field]==1 and payload(z)['health']['recoveries']==1
          and payload(z)['health']['lastSuccessfulWriteMs']==1800000001000,
          mode+' retries the same pending frame and publishes recovery evidence')

z,mod=fresh()
z.execute('game();tick();T.now=T.now+1;T.writeOpFails=true;T.closeFails=true;tick()')
check(mod.status()['health']['writeFailures']==1 and mod.status()['health']['writeOperationFailures']==1
      and mod.status()['health']['closeFailures']==1,
      'combined write and close failure counts one failed attempt and both failing operations')

z,mod=fresh()
z.execute('game();tick();T.now=T.now+1;T.throwTime=true;os.time=function()if T.throwTime then T.throwTime=false;error("publisher clock exception")end;return T.now end;tick()')
check(mod.status()['health']['publishExceptions']==1 and mod.status()['health']['currentlyFailing']
      and mod.status()['health']['lastErrorStage']=='publish' and log_count(z,'PUBLISH_FAILED')==1,
      'unexpected publisher exception is counted by the loop without stopping it')
z.execute('tick()')
check(payload(z)['health']['publishExceptions']==1 and payload(z)['health']['recoveries']==1
      and log_count(z,'WRITE_RECOVERED')==1,
      'publisher exception is followed by a committed recovered health snapshot')

z,mod=fresh()
z.execute('game();tick();T.now=T.now+1;T.writeFails=true;tick()')
h=mod.status()['health'];h['writeFailures']=999;h['lastError']='tampered status copy'
check(mod.status()['health']['writeFailures']==1 and mod.status()['health']['lastError']!='tampered status copy',
      'status returns independent primitive health values instead of the live mutable counters')
z.execute('T.writeFails=false;tick();T.mode="game";local h=T.registered[1];h.post({get=function()error(string.rep("x",2048))end});T.mode="test";tick()')
check(len(payload(z)['health']['lastError'])==512 and payload(z)['health']['captureFailures']==1,
      'error text is bounded and health changes publish even within one unchanged second')

for value in ['Hooks=0', 'Hooks=false', '  hOoKs = FALSE  \r\n']:
    z,mod=fresh('T.config='+json.dumps(value))
    z.execute('game()')
    check(not mod.status()['active'] and len(z.globals().T.loops)==1 and len(z.globals().T.registered)==0,
          'startup config pauses hooks with one resident publisher: '+repr(value))
z,mod=fresh('T.config="Hooks=0\\nHooks=true\\nHooks=invalid\\n"')
z.execute('game();tick()')
check(mod.status()['active'] and len(z.globals().T.registered)==2,
      'last valid Hooks setting wins and invalid value preserves it')
check(z.globals().T.configPath==r'C:\Users\Test\AppData\Local\ProjectPBZ\Saved\PBZForewarn.txt',
      'startup settings are read from the shared Saved config')
z,mod=fresh(r'T.config="\239\187\191Hooks=0\r\n"')
check(not mod.status()['active'], 'UTF-8 BOM does not hide the startup Hooks=0 setting')
z,mod=fresh("T.bad['/Script/LegoAbility.LegoAbility:PlayTimeline']='missing';T.bad['/Script/LegoAbility.LegoAbility:PlayTimelineByName']='missing'")
z.execute('game();tick()')
check(mod.status()['registered']==0 and payload(z)['active'] is True and payload(z)['hints']==[],
      'active heartbeat denotes bridge liveness even when no hook registered')

z,mod=fresh('T.config="Hooks=0"');z.globals().M=mod;z.execute('game();tick()')
check(len(z.globals().T.writes)==0, 'paused publisher performs no file writes')
z.execute('ExecuteInGameThread(function()M.applySettings({Hooks=true})end);game();hit(1,ability(true));tick()')
check(mod.status()['active'] and mod.status()['hits']==1 and len(z.globals().T.registered)==2,
      'startup-paused timeline enables on the game thread without reload')
z.execute('ExecuteInGameThread(function()M.applySettings({Hooks=false})end);game();hit(1,ability(true))')
check(payload(z)['heartbeat']==0 and payload(z)['hints']==[] and mod.status()['hits']==1,
      'pause invalidates stale hints and leaves registered callbacks inert')
writes=len(z.globals().T.writes);z.execute('tick()')
check(len(z.globals().T.writes)==writes, 'paused resident publisher leaves inactive tombstone intact')
z.execute('for i=1,5 do ExecuteInGameThread(function()M.applySettings({Hooks=true});M.applySettings({Hooks=false})end);game()end;ExecuteInGameThread(function()M.applySettings({Hooks=true})end);game()')
check(len(z.globals().T.loops)==1 and len(z.globals().T.registered)==2 and mod.status()['queued']==0,
      'repeated timeline toggles reuse one loop and two hooks without old hints')
z.execute('tick()')
check(payload(z)['active'] is True and payload(z)['heartbeat']>0 and payload(z)['hints']==[],
      'same-second timeline resume replaces paused tombstone without replaying hints')
z.execute('M.stop();ExecuteInGameThread(function()M.applySettings({Hooks=true})end);game()')
check(mod.status()['stopped'] and not mod.status()['active'] and z.eval('tick()') is True,
      'final timeline stop cannot resume from queued settings')

# Native UFunction callbacks run on their caller's thread, not setup's thread.
for thread_status in ('false', 'nil', 'error', 'nonboolean'):
    z,mod=fresh();z.execute('game();T.contextReads=0')
    z.globals().THREAD_STATUS=thread_status
    z.execute("""
    if THREAD_STATUS=='nil' then IsInGameThread=nil
    else IsInGameThread=function()
      if THREAD_STATUS=='error' then error('thread unknown') end
      if THREAD_STATUS=='nonboolean' then return 'game' end
      return false
    end end
    T.mode='worker'
    T.registered[1].post({get=function()T.contextReads=T.contextReads+1;return ability(true)end})
    T.mode='test'
    """)
    check(z.globals().T.contextReads==0 and mod.status()['hits']==0 and mod.status()['seq']==0,
          'unverified native callback thread is rejected before parameter access '+thread_status)

result={'checks':len(checks),'passed':checks,'scope':'Lua runtime with UE4SS and file-I/O stubs; no game, hooks, or audio were executed.'}
(Path(__file__).parent/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False,indent=2))
