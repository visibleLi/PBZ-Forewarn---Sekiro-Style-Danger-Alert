"""Meaningful observer checks against a thread-checking UE4SS facade, no game."""
from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path(__file__).parent / 'lib'))
from lupa import LuaRuntime

ROOT = Path(__file__).parents[1]
SOURCE = (ROOT / 'observation-hooks.lua').read_text(encoding='utf-8')
BASE = r'''
T={mode='init',now=1800000000,gameTime=42.25,scheduled={},loops={},gameLoops={},hooks={},removed={},writes={},logs={},loaded={},gameReads=0}
PLAY='/Script/LegoAbility.LegoAbility:PlayTimeline'
BYNAME='/Script/LegoAbility.LegoAbility:PlayTimelineByName'
BLUE='/PBZCombatAsset/Prototypes/Actions/GAAction_WeaponParticle_BlueRedEye.GAAction_WeaponParticle_BlueRedEye_C'
BLACK='/PBZCombatAsset/Prototypes/Actions/GAAction_PowerAttackParticle.GAAction_PowerAttackParticle_C'
T.loaded[PLAY]=true;T.loaded[BYNAME]=true;T.loaded[BLUE..':Received_ActionBegin']=true;T.loaded[BLUE..':Spawn Particles']=true
function print(s)T.logs[#T.logs+1]=s end
os.getenv=function()return [[C:\Users\Test\AppData\Local]]end
os.time=function()return T.now end
os.clock=function()error('os.clock is not a game clock')end
os.execute=function()error('process launch prohibited')end
function requireGame()assert(T.mode=='game','UE access outside game thread');T.gameReads=T.gameReads+1 end
function IsInGameThread()return T.mode=='game'end
function obj(full,more)
  local o=more or {};o.IsValid=function()requireGame();return not o.invalid end
  o.GetFullName=function()requireGame();return full end
  return o
end
function arr(values)return {Num=function()requireGame();T.arrayEnumerations=(T.arrayEnumerations or 0)+1;return #values end,Get=function(self,i)requireGame();T.arrayElements=(T.arrayElements or 0)+1;return values[i+1]end}end
function ueArray(values)return {ForEach=function(self,fn)requireGame();for i,v in ipairs(values)do fn(i-1,param(v))end end}end
function param(v)return {get=function()requireGame();return v end,set=function()error('parameter write prohibited')end}end
function ability(name)
  local timeline=obj('LGATimeline /Game/Test.Timeline', {Actions=arr({}),RoleLayers=arr({})})
  local task=obj('LGATask_PlayTimeline /Game/Test.Task_'..(name or 'A'),{Timeline=timeline,CurrentTime=0.125})
  local actor=obj('PBZCharacter_NPC /Game/Test.Enemy_'..(name or 'A'),{GetWorld=function()requireGame();return obj('World /Game/Test.World')end})
  local a=obj('LegoAbility /Game/Test.Ability_'..(name or 'A'),{
    GetPlayTimelineTask=function()requireGame();return task end,
    GetAvatarActorFromActorInfo=function()requireGame();return actor end,
    GetActivationCount=function()requireGame();return 3 end})
  return a,task,actor,timeline
end
function warning(a,task,actor,cls,effect)
 return obj('GAAction /Game/Test.Warning',{
  GetAbility=function()requireGame();return a end,
  GetTimeline=function()requireGame();return task.Timeline end,
  GetAvatarActor=function()requireGame();return actor end,
  GetClass=function()requireGame();return obj('BlueprintGeneratedClass '..(cls or BLUE))end,
  NiagaraEffect=obj('NiagaraSystem '..(effect or '/PBZVFXPack/VFX/BattleFX/Common/NS_AttackAlert_Red_001.NS_AttackAlert_Red_001'))})
end
function StaticFindObject(p)
 requireGame()
 if p=='/Script/Engine.Default__GameplayStatics' then
  if T.noClock then return nil end
  return obj('GameplayStatics '..p,{GetTimeSeconds=function(self,ctx)requireGame();return T.gameTime end})
 end
 if T.loaded[p] or T.allLoaded then return obj('Function '..p)end
end
function RegisterHook(path,pre,post)
 requireGame();if T.registerFail then error('registration refused')end
 local n=#T.hooks*2+1;T.hooks[#T.hooks+1]={path=path,pre=pre,post=post};return n,T.scriptBackend and path:sub(1,7)~='/Script' and n or n+1
end
function UnregisterHook(path,pre,post)requireGame();T.removed[#T.removed+1]=path;return not T.unregisterFail end
function ExecuteInGameThread(fn)if T.scheduleFail then error('cannot schedule')end;T.scheduled[#T.scheduled+1]=fn end
function LoopAsync(ms,fn)T.loops[#T.loops+1]={ms=ms,fn=fn}end
function LoopInGameThreadWithDelay(ms,fn)requireGame();T.gameLoops[#T.gameLoops+1]={ms=ms,fn=fn}end
function game()
 T.mode='game';while #T.scheduled>0 do table.remove(T.scheduled,1)()end;T.mode='test'
end
function maintenance()
 T.mode='game';for _,l in ipairs(T.gameLoops)do l.fn()end;T.mode='test'
end
function publish()
 T.mode='async';local result=T.loops[1].fn();T.mode='test';return result
end
function hook(path)for _,h in ipairs(T.hooks)do if h.path==path then return h end end;error('missing hook '..path)end
function invoke(path,phase,object,...)
 T.mode='game';local h=hook(path);local n=select('#',h[phase](param(object),...));T.mode='test';assert(n==0,'native override prohibited')
end
io.open=function(path,mode)
 if mode=='rb' then if not T.config then return nil end;return {read=function()return T.config end,close=function()return true end}end
 if T.writeFail then return nil,'locked file' end
 return {write=function(self,body)if T.writeThrow then error('write exception')end;self.body=body;return self end,
 close=function(self)if T.closeFail then return nil,'close failed'end;T.writes[#T.writes+1]={path=path,body=self.body};return true end}
end
'''
passed=[]

def check(v,label):
    assert v,label
    passed.append(label)

def fresh(before=''):
    lua=LuaRuntime(unpack_returned_tuples=True)
    lua.execute(BASE)
    lua.execute(before)
    mod=lua.execute(SOURCE)
    lua.globals().M=mod
    return lua,mod

def data(lua):
    writes=lua.globals().T.writes
    return json.loads(writes[len(writes)]['body'])

z,m=fresh()
check(len(z.globals().T.hooks)==0,'setup queues registration without touching UE from the loading thread')
z.execute('game();publish()')
p=data(z)
check(m.status()['registered']==4 and p['active'],'two native and only loaded warning functions register on game thread')
check(p['events']==[] and p['health']['dynamicRegistered']==2,'publisher emits bounded empty evidence without calling UE')
z.execute("a,task,actor,tl=ability();invoke(PLAY,'pre',a,param(tl),param(1.2),param(0),param(0.65),param('Previous'));task.CurrentTime=0.65;invoke(PLAY,'post',a,param(tl),param(1.2),param(0),param(0.65),param('Previous'));maintenance();publish()")
p=data(z);e=p['events']
check(len(e)==2 and e[0]['callId']==e[1]['callId'] and e[1]['matching']=='synchronous-stack','native pre/post pair by synchronous context stack')
check(e[0]['params']['StartTimeSeconds']['value']==0.65 and e[0]['params']['PlayRate']['value']==1.2,'SDK named start offset and rate are captured as synchronous scalars')
check(e[1]['context']['taskTime']['value']==0.65 and e[1]['gameTime']['value']==42.25 and e[1]['context']['captureWorld']=='/Game/Test.World','engine game time and captured world are separate from task time and wall timestamp')
check(e[1]['context']['attackAssociation']=='unknown' and e[1]['params']['abiVerified'] is False,'SDK positional count is not falsely labelled runtime ABI or cue ownership verification')
z.execute("invoke(BYNAME,'pre',a,param('Main'),param(1),param(0),param(0));publish();maintenance();publish()")
check(data(z)['seq']==3,'new immutable capture frame publishes within the same second even if a publisher ran before game-thread rebuild')
z.execute("invoke(BYNAME,'post',a,param('Main'),param(1),param(0),param(0))")
z.execute("invoke(BYNAME,'post',a,param('Main'),param(1),param(0),param(0));maintenance();publish()")
check(data(z)['events'][-1]['matching']=='unknown' and m.status()['health']['unmatchedPosts']==1,'post without observed pre remains unmatched')
z.execute("invoke(BYNAME,'pre',a,param('only-one-arg'));invoke(BYNAME,'post',a,param('only-one-arg'));maintenance();publish()")
check(data(z)['events'][-1]['params']['status']=='unknown' and m.status()['health']['abiUnknown']==2,'argument count mismatch never invents start offset')
z.execute("T.noClock=true;invoke(BYNAME,'pre',a,param('Main'),param(1),param(0),param(0));invoke(BYNAME,'post',a,param('Main'),param(1),param(0),param(0));maintenance();publish()")
check(data(z)['events'][-1]['gameTime']['status']=='unavailable','engine clock failure is explicit with no os.clock substitution')
before=z.globals().T.gameReads
z.execute("T.mode='async';hook(PLAY).pre(param(a),param(tl),param(1),param(0),param(0),param(''));T.mode='test';publish()")
check(z.globals().T.gameReads==before and m.status()['health']['rejectedOffThread']==1,'off-thread callbacks are rejected before dereferencing context or parameters')
z.execute("T.noClock=false;w=warning(a,task,actor);invoke(BLUE..':Received_ActionBegin','pre',w,param(0),param(0.4),param(0.7));invoke(BLUE..':Received_ActionBegin','post',w,param(0),param(0.4),param(0.7));maintenance();publish()")
e=data(z)['events'][-1]
check(e['kind']=='warning-call' and e['params']['BeginTime']['value']==0.7 and e['context']['warningResourceMatched'],'actual warning callback slot records resource and BeginTime')
check(e['context']['taskCorrelation']=='current-task-candidate' and not e['context']['nativeExecutionConfirmed'],'template/current-task candidate is never elevated to exact warning-task association or rendered pixels')
old=len(data(z)['events'])
enum_before=z.globals().T.arrayEnumerations
z.execute("ordinary=warning(a,task,actor,BLUE,'/Game/VFX/Dust.Dust');invoke(BLUE..':Spawn Particles','pre',ordinary,param(actor));invoke(BLUE..':Spawn Particles','post',ordinary,param(actor));maintenance();publish()")
check(len(data(z)['events'])==old,'ordinary particle effects using the same function are filtered out')
check(z.globals().T.arrayEnumerations==enum_before,'ordinary VFX returns before enumerating timeline nodes')
z.execute("T.ordinaryDeepReads=0;ordinary.GetAbility=function()T.ordinaryDeepReads=T.ordinaryDeepReads+1;return a end;ordinary.GetTimeline=function()T.ordinaryDeepReads=T.ordinaryDeepReads+1;return tl end;invoke(BLUE..':Spawn Particles','pre',ordinary,param(actor));invoke(BLUE..':Spawn Particles','post',ordinary,param(actor))")
check(z.globals().T.ordinaryDeepReads==0,'ordinary VFX also avoids ability and task context reads')
z.execute("tl.Actions=arr({{Action=w,StartTime=0.7,Duration=0.4,TriggerTimeOffset=0.01,EndTriggerTimeOffset=-0.01,Guid={A=1,B=2,C=3,D=4}}});invoke(BLUE..':Spawn Particles','pre',w,param(actor));invoke(BLUE..':Spawn Particles','post',w,param(actor));maintenance();publish()")
snap=data(z)['events'][-1]['context']['sourceContextSnapshot']
check(snap['status']=='candidate-unique-action-reference' and snap['candidates']['1']['startTime']['value']==0.7 and snap['getActionEvent']['status']=='unknown','source event snapshot retains readable timing while leaving unverified out-struct ABI unknown')
z.execute("tl.Actions=ueArray({{Action=w,StartTime=0.7,Duration=0.4}});tl.RoleLayers=ueArray({});invoke(BLUE..':Spawn Particles','pre',w,param(actor));invoke(BLUE..':Spawn Particles','post',w,param(actor));maintenance();publish()")
check(data(z)['events'][-1]['context']['sourceContextSnapshot']['matchCount']==1,'UE4SS ForEach and RemoteUnrealParam element conversion capture real TArray facade')
z.execute("b=ability('B');invoke(BYNAME,'pre',a,param('M'),param(1),param(0),param(0));invoke(BYNAME,'post',b,param('M'),param(1),param(0),param(0));maintenance();publish()")
check(data(z)['events'][-1]['matching']=='unknown','mismatched context does not borrow another invocation callId')
z.execute("T.mode='game';hook(PLAY).pre({get=function()error('bad ephemeral context')end});T.mode='test';maintenance();publish()")
check(m.status()['health']['captureFailures']==1,'ephemeral parameter capture failure is contained and separately counted')

z,m=fresh();z.execute('game();T.registerFail=true;T.allLoaded=true;T.now=T.now+1;maintenance();publish()')
check(m.status()['active'] and m.status()['health']['registrationFailures']>0,'dynamic registration errors degrade observation without raising into caller')
z,m=fresh();z.execute('game();T.writeFail=true;publish()')
check(m.status()['health']['writeFailures']==1 and m.status()['health']['currentlyFailing'],'write refusal is counted and retained for retry')
z.execute('T.writeFail=false;publish()')
check(data(z)['health']['recoveries']==1 and not data(z)['health']['currentlyFailing'],'next successful snapshot carries committed write recovery')
z.execute('T.closeFail=true;T.now=T.now+1;publish()')
check(m.status()['health']['writeFailures']==2,'close refusal is not reported as a committed successful write')

z,m=fresh();z.execute("game();a,task,actor,tl=ability();for i=1,270 do invoke(BYNAME,'pre',a,param('Main'),param(1),param(0),param(0));invoke(BYNAME,'post',a,param('Main'),param(1),param(0),param(0))end;maintenance();publish()")
p=data(z)
check(p['seq']==540 and len(p['events'])<=512 and p['retention']['dropped']>0,'retention is bounded with monotonic sequence and explicit lost-history count')
check(p['retention']['firstSeq']==p['events'][0]['seq'] and p['retention']['lastSeq']==540,'snapshot first and last sequence identify gaps without claiming complete history')

z,m=fresh();z.execute("game();a,task,actor,tl=ability();local items={};for i=1,40 do items[i]={Action=warning(a,task,actor,'/Game/Test.WarningClass_'..i)}end;tl.Actions=arr(items);invoke(PLAY,'pre',a,param(tl),param(1),param(0),param(0),param(''));invoke(PLAY,'post',a,param(tl),param(1),param(0),param(0),param(''));T.allLoaded=true;T.now=T.now+1;maintenance();publish()")
check(m.status()['dynamicRegistered']==32 and m.status()['health']['dynamicLimitReached']>0,'runtime action-class discovery respects maximum 32 dynamic hooks')
z.execute('M.stop();game()')
check(not m.status()['active'] and len(z.globals().T.removed)==34 and data(z)['heartbeat']==0,'stop invalidates heartbeat and unregisters only its hooks on game thread')
check(z.eval('publish()') is True,'async publisher terminates after stop')

z,m=fresh();z.execute("game();a,task,actor,tl=ability();local main={};for i=1,500 do main[i]={Action=warning(a,task,actor,'/Game/Test.ClassA')}end;local role={};for i=1,500 do role[i]={Action=warning(a,task,actor,'/Game/Test.ClassB')}end;tl.Actions=arr(main);tl.RoleLayers=arr({{RoleName='Other',Actions=arr(role)},{RoleName='Extra',Actions=arr(role)}});T.arrayElements=0;invoke(PLAY,'pre',a,param(tl),param(1),param(0),param(0),param(''));invoke(PLAY,'post',a,param(tl),param(1),param(0),param(0),param(''))")
check(z.globals().T.arrayElements<=514,'runtime candidate discovery caps total inspected nodes across role layers at 512 plus bounded layer references')

for setting in ('ObserveAttacks=0','Diagnostics=0','Hooks=0','observeattacks=false','\ufeffDiagnostics=false'):
    z,m=fresh('T.config='+json.dumps(setting,ensure_ascii=False))
    check(not m.status()['active'] and len(z.globals().T.loops)==0 and len(z.globals().T.scheduled)==0,'startup switch suppresses all observer activity: '+setting)
z,m=fresh('IsInGameThread=nil')
check(not m.status()['active'] and len(z.globals().T.loops)==0,'missing thread verification API safely disables only observer')
z,m=fresh('T.scheduleFail=true')
check(not m.status()['active'] and m.status()['stopped'],'setup scheduling failure disables observer safely')
z,m=fresh('T.scriptBackend=true');z.execute("game();a,task,actor,tl=ability();w=warning(a,task,actor);for i=1,70 do invoke(BLUE..':Received_ActionBegin','pre',w,param(0),param(0.4),param(0.7))end;maintenance();publish()")
check(all(e['phase']=='call' and e['matching']=='single-script-callback-no-post' for e in data(z)['events']),'script-hook equal IDs yield single observations without imaginary post callbacks or pairing-stack overflow')

out={'checks':len(passed),'passed':passed,'scope':'Lua runtime, thread-checking UE4SS and file stubs; no PBZ execution or runtime ABI certification.'}
(Path(__file__).parent/'observer-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(out,ensure_ascii=True,indent=2))
