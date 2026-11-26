"""Meaningful observer checks against a thread-checking UE4SS facade, no game."""
from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path(__file__).parent / 'lib'))
from lupa.lua54 import LuaRuntime
from settings_fixture import install, DIRECTORY

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
function ueArray(values)return {ForEach=function(self,fn)
  requireGame()
  for i,v in ipairs(values)do
    T.nativeConversions=(T.nativeConversions or 0)+1
    if fn(i,param(v))==true then break end
  end
end}end
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
  return obj('GameplayStatics '..p,{GetTimeSeconds=function(self,ctx)requireGame();if T.noClock then error('clock unavailable')end;return T.gameTime end,
    IsGamePaused=function(self,ctx)requireGame();return T.paused==true end})
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

def fresh(before='', diagnostics=True):
    lua=LuaRuntime(unpack_returned_tuples=True)
    lua.execute(BASE)
    install(lua)
    if diagnostics:
        lua.globals().T.config = 'Diagnostics=1'
    lua.execute(before)
    mod=lua.execute(SOURCE, name='@'+DIRECTORY+'\\observation-hooks.lua')
    lua.globals().M=mod
    return lua,mod

def data(lua, raw=False):
    writes=lua.globals().T.writes
    value=json.loads(writes[len(writes)]['body'])
    if raw or value.get('schemaVersion') != 2:
        return value
    dictionary=value.get('pathDictionary', {})
    def decode(node):
        if isinstance(node, list):
            return [decode(item) for item in node]
        if isinstance(node, dict):
            if '$path' in node:
                assert set(node)=={'$path'} and isinstance(node['$path'], int) and node['$path']>0
                path=dictionary[str(node['$path'])]
                assert isinstance(path,str) and path.startswith('/')
                return path
            return {key:decode(item) for key,item in node.items()}
        return node
    value['events']=decode(value['events'])
    value['focusSummaries']=decode(value['focusSummaries'])
    return value

z,m=fresh(diagnostics=False)
z.execute('game();publish();T.now=T.now+10;maintenance();publish();M.stop();game()')
check(not m.status()['active'] and len(z.globals().T.hooks)==0 and len(z.globals().T.writes)==0,
      'starting with diagnostics off never writes the observer file, including on unload')

z,m=fresh()
check(len(z.globals().T.hooks)==0,'setup queues registration without touching UE from the loading thread')
z.execute('game();publish()')
p=data(z)
check(m.status()['registered']==2 and p['active'],'idle startup registers only the two native timeline hooks')
check(p['events']==[] and p['health']['dynamicRegistered']==0,'idle publisher stays bounded without searching warning methods')
noContextBefore=m.status()['health']['discoveryNoContext']
z.execute("a,task,actor,tl=ability();tl.Actions=arr({{Action=warning(a,task,actor)}});task.CurrentTime=0.65;invoke(PLAY,'pre',a,param(tl),param(1.2),param(0),param(0.65),param('Previous'));invoke(PLAY,'post',a,param(tl),param(1.2),param(0),param(0.65),param('Previous'));T.now=T.now+1;maintenance();publish()")
_context_data=data(z)
check(_context_data['lookupProfile']['attempts']>2 and m.status()['health']['discoveryNoContext']==noContextBefore,
    'live timeline hook establishes context before dynamic warning discovery begins')
z.execute("T.allLoaded=true;for i=1,12 do local before=M.status().registered;T.now=T.now+1;maintenance();assert(M.status().registered-before<=1,'more than one dynamic registration in a maintenance pass')end;publish()")
check(m.status()['registered']<=11,'dynamic warning UFunctions install gradually under the per-pass limit')
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

z,m=fresh();z.execute("game();a,task,actor,tl=ability();tl.Actions=arr({{Action=warning(a,task,actor)}});invoke(PLAY,'pre',a,param(tl),param(1),param(0),param(0),param(''));invoke(PLAY,'post',a,param(tl),param(1),param(0),param(0),param(''));T.registerFail=true;T.allLoaded=true;T.now=T.now+1;maintenance();publish()")
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
VERSION = __import__('re').search(r'local VERSION = "([^"]+)"', SOURCE).group(1)
check(p['schemaVersion']==2 and p['version']==VERSION and m.status()['version']==p['version'],
    'Lua snapshot and status identify the actual trial version')
raw=data(z,raw=True)
check(raw['retention']['retainedBytes']<=raw['retention']['maxBytes'] and raw['retention']['pathBytes']<=raw['retention']['maxPathBytes'],
    'serialized events, interned paths and focused summaries share an explicit combined byte budget')

z,m=fresh();z.execute("game();a,task,actor,tl=ability('FeiZei_SpecialAttack_07_'..string.rep('A',80));invoke(BYNAME,'pre',a,param('Main'),param(1.2),param(0),param(2.883));task.CurrentTime=2.9;invoke(BYNAME,'post',a,param('Main'),param(1.2),param(0),param(2.883));b,bt,ba,btl=ability('Ordinary_'..string.rep('B',80));for i=1,1200 do invoke(BYNAME,'pre',b,param('Main'),param(1),param(0),param(0));invoke(BYNAME,'post',b,param('Main'),param(1),param(0),param(0))end;maintenance();publish()")
p=data(z);raw=data(z,raw=True)
check(p['seq']==2402 and p['retention']['dropped']>0 and len(p['focusSummaries'])==1,
    'a named investigation call survives thousands of ordinary captures outside the general event window')
focus=p['focusSummaries'][0]
check(focus['firstSeq']==1 and focus['lastSeq']==2 and focus['first']['params']['StartTimeSeconds']['value']==2.883
    and focus['last']['taskTime']['value']==2.9 and not focus['abiVerified'],
    'focused pre/post summary preserves original offset and post task position without claiming ABI verification')
check(p['eventKinds']['timeline-call']==2402 and p['focusRetention']['total']==1,
    'cumulative event and focused-call counts survive event eviction without counting phases as independent casts')
check(raw['pathDictionary'] and any(isinstance(e['hookPath'],dict) and '$path' in e['hookPath'] for e in raw['events']),
    'repeated resource paths are stored once and referenced explicitly in event rows')
check(p['retention']['retainedBytes']<=393216 and len(json.dumps(raw).encode())<450000,
    'long capture stream remains bounded including dictionary and focus records')

z,m=fresh();z.execute("game();for i=1,90 do local a=ability('FeiZei_SpecialAttack_07_'..i..string.rep('C',80));invoke(BYNAME,'pre',a,param('Main'),param(1),param(0),param(i));invoke(BYNAME,'post',a,param('Main'),param(1),param(0),param(i))end;maintenance();publish()")
p=data(z)
check(p['focusRetention']['count']<=64 and p['focusRetention']['total']==90 and p['focusRetention']['dropped']>=26,
    'focus preservation has its own finite call capacity and explicit eviction count')
check(p['retention']['retainedBytes']<=393216,
    'focus pressure cannot escape the shared byte budget')

z,m=fresh();z.execute("game();for i=1,1400 do local a=ability('Ordinary_'..i..string.rep('D',80));invoke(BYNAME,'pre',a,param('Main'),param(1),param(0),param(0));invoke(BYNAME,'post',a,param('Main'),param(1),param(0),param(0))end;maintenance();publish()")
p=data(z);raw=data(z,raw=True)
check(raw['retention']['pathCount']<=raw['retention']['maxPaths'] and raw['retention']['pathBytes']<=131072,
    'unique long paths cannot grow the shared dictionary indefinitely')
check(p['retention']['retainedBytes']<=393216 and p['events'][-1]['seq']==2800,
    'path references remain resolvable after dictionary reclamation and long unique-task churn')

z,m=fresh();z.execute("game();a,task,actor,tl=ability();actor.GetFullName=function()requireGame();return 'PBZCharacter_NPC /Game/'..string.rep('X',5000)end;invoke(BYNAME,'pre',a,param('Main'),param(1),param(0),param(0));b,bt,ba,btl=ability('Normal');invoke(BYNAME,'pre',b,param('Main'),param(1),param(0),param(0));maintenance();publish()")
p=data(z);raw=data(z,raw=True)
check(len(raw['events'])==2 and all(len(value)<=4096 for value in raw['pathDictionary'].values())
    and isinstance(raw['events'][0]['context']['actor'],str) and len(raw['events'][0]['context']['actor'])>4096
    and m.status()['health']['pathInlineFallbacks']>0 and p['events'][1]['context']['actor']=='/Game/Test.Enemy_Normal',
    'an overlong path stays inline and cannot poison dictionary validation for unrelated normal captures')

z,m=fresh();z.execute("game();a,task,actor,tl=ability();local items={};for i=1,40 do items[i]={Action=warning(a,task,actor,'/Game/Test.WarningClass_'..i)}end;tl.Actions=arr(items);invoke(PLAY,'pre',a,param(tl),param(1),param(0),param(0),param(''));invoke(PLAY,'post',a,param(tl),param(1),param(0),param(0),param(''));T.allLoaded=true;for i=1,40 do T.now=T.now+1;maintenance()end;publish()")
check(m.status()['dynamicRegistered']==32 and m.status()['health']['dynamicLimitReached']>0,'runtime action-class discovery respects maximum 32 dynamic hooks')
z.execute('M.stop();game()')
check(not m.status()['active'] and len(z.globals().T.removed)==34 and data(z)['heartbeat']==0,'stop invalidates heartbeat and unregisters only its hooks on game thread')
check(z.eval('publish()') is True,'async publisher terminates after stop')

z,m=fresh();z.execute("game();a,task,actor,tl=ability();local main={};for i=1,500 do main[i]={Action=warning(a,task,actor,'/Game/Test.ClassA')}end;local role={};for i=1,500 do role[i]={Action=warning(a,task,actor,'/Game/Test.ClassB')}end;tl.Actions=arr(main);tl.RoleLayers=arr({{RoleName='Other',Actions=arr(role)},{RoleName='Extra',Actions=arr(role)}});T.arrayElements=0;invoke(PLAY,'pre',a,param(tl),param(1),param(0),param(0),param(''));invoke(PLAY,'post',a,param(tl),param(1),param(0),param(0),param(''))")
check(z.globals().T.arrayElements<=514,'runtime candidate discovery caps total inspected nodes across role layers at 512 plus bounded layer references')

for setting in ('Diagnostics=1\nObserveAttacks=0','Diagnostics=0','Diagnostics=1\nHooks=0',
                'Diagnostics=1\nobserveattacks=false','\ufeffDiagnostics=false'):
    z,m=fresh('T.config='+json.dumps(setting,ensure_ascii=False))
    z.execute('game();maintenance();publish()')
    check(not m.status()['active'] and len(z.globals().T.loops)==1 and len(z.globals().T.hooks)==0 and len(z.globals().T.writes)==0,'startup switch pauses observer capture with resident loops: '+setting)
z,m=fresh('IsInGameThread=nil')
check(not m.status()['active'] and len(z.globals().T.loops)==0,'missing thread verification API safely disables only observer')
z,m=fresh('T.scheduleFail=true')
check(not m.status()['active'] and m.status()['stopped'],'setup scheduling failure disables observer safely')
z,m=fresh('T.scriptBackend=true');z.execute("game();a,task,actor,tl=ability();w=warning(a,task,actor);tl.Actions=arr({{Action=w}});invoke(PLAY,'pre',a,param(tl),param(1),param(0),param(0),param(''));invoke(PLAY,'post',a,param(tl),param(1),param(0),param(0),param(''));T.allLoaded=true;for i=1,12 do T.now=T.now+1;maintenance()end;for i=1,70 do invoke(BLUE..':Received_ActionBegin','pre',w,param(0),param(0.4),param(0.7))end;maintenance();publish()")
warnings=[e for e in data(z)['events'] if e['kind']=='warning-call']
check(len(warnings)==70 and all(e['phase']=='call' and e['matching']=='single-script-callback-no-post' for e in warnings),'script-hook equal IDs yield single observations without imaginary post callbacks or pairing-stack overflow')

z,m=fresh('T.config="Hooks=0"');z.execute('game();ExecuteInGameThread(function()M.applySettings({Hooks=true,Diagnostics=true,ObserveAttacks=true})end);game()')
check(m.status()['active'] and len(z.globals().T.hooks)==2 and len(z.globals().T.gameLoops)==1,
      'startup-paused observer enables with one existing maintenance loop')
z.execute('a,task,actor,tl=ability();invoke(PLAY,"pre",a,param(tl),param(1),param(0),param(0),param(""));ExecuteInGameThread(function()M.applySettings({Hooks=true,Diagnostics=false,ObserveAttacks=true})end);game()')
check(not m.status()['active'] and m.status()['health']['abandonedPres']==1 and data(z)['heartbeat']==0,
      'diagnostics pause invalidates output and abandons pending pre calls')
seq=m.status()['seq'];writes=len(z.globals().T.writes);reads=z.globals().T.gameReads
z.execute('maintenance();publish();invoke(PLAY,"post",a,param(tl),param(1),param(0),param(0),param(""))')
check(m.status()['seq']==seq and len(z.globals().T.writes)==writes and z.globals().T.gameReads==reads,
      'paused observer does no capture discovery rebuild file writes or UE reads')
for hooks in (False,True):
    for diagnostics in (False,True):
        for observe in (False,True):
            settings=z.table_from({'Hooks':hooks,'Diagnostics':diagnostics,'ObserveAttacks':observe})
            z.globals().NEXT_SETTINGS=settings
            z.execute('ExecuteInGameThread(function()M.applySettings(NEXT_SETTINGS)end);game()')
            check(m.status()['active']==(hooks and diagnostics and observe),
                  'live observer flag truth table '+str((hooks,diagnostics,observe)))
check(len(z.globals().T.hooks)==2 and len(z.globals().T.loops)==1 and len(z.globals().T.gameLoops)==1,
      'repeated observer flag changes do not duplicate registrations or loops')
z.execute('publish()')
check(data(z)['active'] is True and data(z)['heartbeat']>0 and m.status()['seq']==seq,
      'same-second observer resume replaces tombstone and preserves bounded prior evidence')
z.execute('invoke(PLAY,"post",a,param(tl),param(1),param(0),param(0),param(""))')
check(m.status()['health']['unmatchedPosts']==1, 'resume cannot pair a post with a pre from before pause')
z.execute('M.stop();ExecuteInGameThread(function()M.applySettings({Hooks=true,Diagnostics=true,ObserveAttacks=true})end);game()')
check(m.status()['stopped'] and not m.status()['active'] and z.eval('publish()') is True,
      'final observer unload remains terminal after a queued resume')

# Native ForEach converts before callback and stops only on boolean true.
z,m=fresh();z.execute("""
game();a,task,actor,tl=ability();w=warning(a,task,actor)
local items={};for i=1,2000 do items[i]={Action=w,StartTime=0.7,Duration=0.4} end
local layers={};for i=1,100 do layers[i]={Actions=ueArray({})} end
tl.Actions=ueArray(items);tl.RoleLayers=ueArray(layers);T.nativeConversions=0
invoke(PLAY,'post',a,param(tl),param(1),param(0),param(0),param(''))
""")
check(z.globals().T.nativeConversions<=546,
      'native conversion budget includes at most 513 action and 33 layer lookahead elements')
z.execute("""
T.allLoaded=true;for i=1,12 do T.now=T.now+1;maintenance()end
invoke(BLUE..':Spawn Particles','pre',w,param(actor));maintenance();publish()
""")
snapshot=data(z)['events'][-1]['context']['sourceContextSnapshot']
check(snapshot['scanTruncated'] and snapshot['candidates']['1']['index']==0,
      'bounded native iteration reports truncation and normalizes one-based native indices')

class InvalidUObject:
    """Lupa exposes Python __getitem__ objects as native-like Lua userdata."""
    def __init__(self):
        self.reads = []

    def __getitem__(self, key):
        if key == 'IsValid':
            return lambda *_: False
        self.reads.append(key)
        raise RuntimeError('invalid native UObject member access: '+str(key))


for invalid_owner in ('task', 'ability', 'timeline', 'context'):
    z,m=fresh();z.execute('game();a,task,actor,tl=ability();w=warning(a,task,actor)')
    dead=InvalidUObject();z.globals().DEAD=dead
    check(z.eval('type(DEAD)')=='userdata', 'invalid object regression uses userdata '+invalid_owner)
    if invalid_owner=='task':
        z.execute('a.GetPlayTimelineTask=function()return DEAD end')
    elif invalid_owner=='ability':
        z.execute('w.GetAbility=function()return DEAD end')
    elif invalid_owner=='timeline':
        z.execute('w.GetTimeline=function()return DEAD end')
    if invalid_owner in ('ability','timeline'):
        z.execute("""
        tl.Actions=ueArray({{Action=w}})
        invoke(PLAY,'post',a,param(tl),param(1),param(0),param(0),param(''))
        T.allLoaded=true;for i=1,12 do T.now=T.now+1;maintenance()end
        invoke(BLUE..':Spawn Particles','pre',w,param(actor))
        """)
    else:
        z.execute("invoke(PLAY,'pre',DEAD,param(tl),param(1),param(0),param(0),param(''))" if invalid_owner=='context' else
                  "invoke(PLAY,'pre',a,param(tl),param(1),param(0),param(0),param(''));invoke(PLAY,'post',a,param(tl),param(1),param(0),param(0),param(''))")
    z.execute('maintenance();publish()')
    check(not dead.reads, 'invalid UObject is never indexed beyond validity '+invalid_owner)
    if invalid_owner=='context':
        check(m.status()['seq']==0, 'invalid hook context produces no fabricated capture')
    else:
        check(m.status()['seq']>0 and m.status()['health']['captureFailures']==0,
              'unavailable invalid child retains valid parent evidence '+invalid_owner)

z,m=fresh();z.execute("""
game();a,task,actor,tl=ability()
invoke(BYNAME,'pre',a,param('Main'),param(1),param(0),param(0))
invoke(BYNAME,'post',a,param('Main'),param(1),param(0),param(0))
T.readsBeforeStop=T.gameReads
T.mode='unload';M.stop();T.mode='test'
""")
final=data(z)
check(final['seq']==2 and [e['seq'] for e in final['events']]==[1,2]
      and final['heartbeat']==0 and not final['active'],
      'stop before maintenance preserves latest captured events and sequence in tombstone')
check(z.globals().T.gameReads==z.globals().T.readsBeforeStop,
      'final frame rebuild uses captured primitives without UE access on unload thread')
z.execute("invoke(BYNAME,'pre',a,param('Late'),param(1),param(0),param(0));maintenance()")
check(m.status()['seq']==2 and z.eval('publish()') is True,
      'late capture and maintenance cannot modify the final stopped frame')

out={'checks':len(passed),'passed':passed,'scope':'Lua runtime, thread-checking UE4SS and file stubs; no PBZ execution or runtime ABI certification.'}
(Path(__file__).parent/'observer-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(out,ensure_ascii=True,indent=2))
