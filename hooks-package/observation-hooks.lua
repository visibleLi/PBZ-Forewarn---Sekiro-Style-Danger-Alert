-- Forewarn 0.6: read-only evidence, never a cue/input/particle producer.
-- All UE reads, discovery and hook registration/removal require the game thread.
-- Only immutable JSON strings and scalar health cross to the async publisher.
local KEY = "__PBZForewarnObservationHooks_v1"
local prior = rawget(_G, KEY)
if type(prior) == "table" then return prior end
local M = {}; rawset(_G, KEY, M)
local PREFIX = "[PBZForewarnObserver] "
local MAX_EVENTS, MAX_BYTES, MAX_DYNAMIC = 512, 393216, 32
local MAX_LOOKUPS, MAX_ATTEMPTS_PER_PATH = 64, 3
local PLAY = "/Script/LegoAbility.LegoAbility:PlayTimeline"
local BYNAME = "/Script/LegoAbility.LegoAbility:PlayTimelineByName"
local BASE = "/PBZCombatAsset/Prototypes/Actions/"
local BLUE = BASE .. "GAAction_WeaponParticle_BlueRedEye.GAAction_WeaponParticle_BlueRedEye_C"
local BLACK = BASE .. "GAAction_PowerAttackParticle.GAAction_PowerAttackParticle_C"
local PARTICLE = BASE .. "GAAction_WeaponParticle.GAAction_WeaponParticle_C"
local METHODS = {"Received_ActionBegin", "Spawn Particles", "Play Particle"}
local S = {active=false, stopped=false, seq=0, serial=0, rows={}, bytes=0, dropped=0,
    hooks={}, registered={}, backends={}, stacks={}, overflows={}, candidates={}, attempted={}, dynamic=0,
    lookupProfile={timer="os.clock-process-cpu-seconds",notGameClock=true,notWallDuration=true,
        attempts=0,misses=0,cpuClockUnavailable=0,totalCpuSeconds=0,maxCpuSeconds=0,byPath={},calls={}},
    revision=0, frame={seq=0, json="[]", firstSeq=0, dropped=0}, published=-1,
    health={captureFailures=0, registrationFailures=0, unregisterFailures=0,
        writeFailures=0, recoveries=0, unmatchedPosts=0, abandonedPres=0,
        rejectedOffThread=0, unknownThread=0, abiUnknown=0, clockUnavailable=0,
        dynamicLimitReached=0, candidateDrops=0, discoveryFailures=0, publishExceptions=0,
        lookupBudgetDrops=0,lookupBackoffSkips=0,lookupPathExhausted=0,
        discoveryPaused=0,discoveryNoContext=0,snapshotRebuilds=0,
        lastErrorStage="", lastError="", currentlyFailing=false}}
local function log(k,t) print(PREFIX .. k .. " " .. tostring(t) .. "\n") end
local function finite(x) return type(x)=="number" and x==x and x~=math.huge and x~=-math.huge end
local function q(x)
    return '"' .. tostring(x):gsub('[%z\1-\31\\"]',function(c)
        if c=='"' then return '\\"' elseif c=='\\' then return '\\\\' end
        return string.format('\\u%04x',string.byte(c))
    end) .. '"'
end
local function json(x)
    local t=type(x)
    if t=="string" then return q(x) elseif t=="boolean" then return tostring(x)
    elseif t=="number" then return finite(x) and string.format('%.17g',x) or 'null'
    elseif t~="table" then return 'null' end
    local a={}; for k,v in pairs(x) do a[#a+1]=q(k)..':'..json(v) end
    return '{'..table.concat(a,',')..'}'
end
local function err(stage,why)
    S.health.lastErrorStage=stage; S.health.lastError=tostring(why):sub(1,256)
    S.revision=S.revision+1
end
local function gameThread()
    if type(IsInGameThread)~="function" then S.health.unknownThread=S.health.unknownThread+1; return false end
    local ok,on=pcall(IsInGameThread)
    if not ok or type(on)~="boolean" then S.health.unknownThread=S.health.unknownThread+1; return false end
    if not on then S.health.rejectedOffThread=S.health.rejectedOffThread+1; return false end
    return true
end
local function valid(o)
    if o==nil then return false end
    local ok,v=pcall(function() return o:IsValid() end); return ok and v==true
end
local function path(o)
    if not valid(o) then return "" end
    local ok,v=pcall(function() return o:GetFullName() end)
    return ok and type(v)=="string" and (v:match('^[^ ]+ (.+)$') or "") or ""
end
local function field(o,k) local ok,v=pcall(function() return o[k] end); if ok then return v end end
local function call(o,k,...) local a=table.pack(...); local ok,v=pcall(function() return o[k](o,table.unpack(a,1,a.n)) end); if ok then return v end end
local function cpuClock()
    local ok,v=pcall(os.clock)
    if ok and finite(v) then return v end
    return nil
end
local function findObject(p,purpose)
    local P=S.lookupProfile
    if P.attempts>=MAX_LOOKUPS then S.health.lookupBudgetDrops=S.health.lookupBudgetDrops+1; return nil,"budget" end
    local start=cpuClock(); local ok,value=pcall(StaticFindObject,p); local finish=cpuClock()
    P.attempts=P.attempts+1
    local found=ok and valid(value)
    if not found then P.misses=P.misses+1 end
    local record=P.byPath[p] or {attempts=0,misses=0,totalCpuSeconds=0,maxCpuSeconds=0,purpose=purpose}
    P.byPath[p]=record; record.attempts=record.attempts+1
    if not found then record.misses=record.misses+1 end
    if start and finish and finish>=start then
        local dt=finish-start
        P.totalCpuSeconds=P.totalCpuSeconds+dt; P.maxCpuSeconds=math.max(P.maxCpuSeconds,dt)
        record.totalCpuSeconds=record.totalCpuSeconds+dt; record.maxCpuSeconds=math.max(record.maxCpuSeconds,dt)
        P.calls[tostring(P.attempts)]={path=p,purpose=purpose,result=found and "found" or ok and "missing" or "error",cpuSeconds=dt}
    else
        P.cpuClockUnavailable=P.cpuClockUnavailable+1
        P.calls[tostring(P.attempts)]={path=p,purpose=purpose,result=found and "found" or ok and "missing" or "error",cpuStatus="unavailable"}
    end
    S.revision=S.revision+1
    return found and value or nil,found and "found" or ok and "missing" or "error"
end
local function cachedGameLibrary()
    if valid(S.gameLibrary) then return S.gameLibrary end
    local now=os.time(); local a=S.clockAttempt or {count=0,nextAt=0}; S.clockAttempt=a
    if a.count>=MAX_ATTEMPTS_PER_PATH or now<a.nextAt then return nil end
    a.count=a.count+1; a.nextAt=now+(a.count==1 and 5 or 30)
    S.gameLibrary=findObject("/Script/Engine.Default__GameplayStatics","engine-clock-library")
    return S.gameLibrary
end
local function unwrap(p)
    if type(p)=="number" or type(p)=="boolean" or type(p)=="string" or p==nil then return p end
    local ok,v=pcall(function() return p:get() end); if ok then return v end
    return p
end
local function scalar(p,kind)
    local ok,v=pcall(unwrap,p)
    if not ok then return {status="unreadable"} end
    if kind=="number" then return finite(v) and {status="read",value=v} or {status="unknown",reason="not-finite-number"} end
    if kind=="object" then
        if v==nil then return {status="null"} end
        local s=path(v); return s~="" and {status="read",value=s} or {status="unknown",reason="object-unavailable"}
    end
    if type(v)=="string" then return {status="read",value=v:sub(1,256)} end
    -- FName is converted synchronously and never retained.
    local s=call(v,"ToString"); return type(s)=="string" and {status="read",value=s:sub(1,256)} or {status="unknown",reason="name-unavailable"}
end
local function number(v) return finite(v) and {status="read",value=v} or {status="unavailable"} end
local function eachArray(array,fn,limit)
    if array==nil then return end
    -- UE4SS TArray exposes ForEach/element:get(); Num/Get is only a fallback
    -- for compatible facades. All conversions happen in this game-thread call.
    local iterator=field(array,"ForEach")
    if type(iterator)=="function" then
        local seen=0
        iterator(array,function(index,element)
            seen=seen+1
            if seen<=limit then fn(unwrap(element),finite(index) and index or seen-1) end
        end)
        return seen>limit
    end
    local n=call(array,"Num"); if not finite(n) then return end
    for i=0,math.min(n,limit)-1 do local v=call(array,"Get",i); if v~=nil then fn(v,i) end end
    return n>limit
end
local function eventSnapshot(action,timeline)
    local out={status="unavailable",reason="no-matching-reference",actionAbility=path(call(action,"GetAbility")),
        actionTimeline=path(timeline),getActionEvent={status="unknown",reason="out-struct-binding-unverified"},candidates={}}
    local actionPath=path(action); local count,budget=0,512
    local function events(list,layer)
        if budget<=0 then out.scanTruncated=true; return end
        local truncated=eachArray(list,function(e,i)
            if budget<=0 then return end
            budget=budget-1
            if path(field(e,"Action"))==actionPath then
                count=count+1
                if count<=8 then
                    local dur=field(e,"duration"); local durField="duration"
                    if not finite(dur) then dur=field(e,"Duration"); durField="Duration" end
                    local g=field(e,"Guid")
                    out.candidates[tostring(count)]={layer=layer,index=i,startTime=number(field(e,"StartTime")),
                        duration=number(dur),durationField=durField,triggerTimeOffset=number(field(e,"TriggerTimeOffset")),
                        endTriggerTimeOffset=number(field(e,"EndTriggerTimeOffset")),
                        guid={A=number(field(g,"A")),B=number(field(g,"B")),C=number(field(g,"C")),D=number(field(g,"D"))}}
                end
            end
        end,budget)
        if truncated then out.scanTruncated=true end
    end
    events(field(timeline,"Actions"),"main")
    eachArray(field(timeline,"RoleLayers"),function(layer,i)
        if budget<=0 then out.scanTruncated=true; return end
        local role=field(layer,"RoleName"); local name=type(role)=="string" and role or call(role,"ToString")
        events(field(layer,"Actions"),"role:"..tostring(name or i))
    end,32)
    out.matchCount=count
    if out.scanTruncated then out.status="unknown"; out.reason="timeline-scan-budget-exhausted"
    elseif count==1 then out.status="candidate-unique-action-reference"; out.reason="execution-binding-unverified"
    elseif count>1 then out.status="ambiguous"; out.reason="multiple-template-references" end
    return out
end
local function clock(context)
    local lib=cachedGameLibrary()
    local v=valid(lib) and call(lib,"GetTimeSeconds",context) or nil
    if finite(v) then return {status="read",value=v,source="GameplayStatics.GetTimeSeconds"} end
    S.health.clockUnavailable=S.health.clockUnavailable+1
    return {status="unavailable",source="GameplayStatics.GetTimeSeconds",reason="no-finite-engine-value"}
end
local function contextOf(o,kind,warning)
    local ability=kind=="timeline-call" and o or call(o,"GetAbility")
    local task=valid(ability) and call(ability,"GetPlayTimelineTask") or nil
    local timeline=kind=="warning-call" and call(o,"GetTimeline") or field(task,"Timeline")
    local actor=valid(ability) and call(ability,"GetAvatarActorFromActorInfo") or call(o,"GetAvatarActor")
    local c={object=path(o),ability=path(ability),task=path(task),actor=path(actor),timeline=path(timeline),
        activation=number(valid(ability) and call(ability,"GetActivationCount") or nil),
        taskTime=number(field(task,"CurrentTime")),taskCorrelation="current-task-candidate",
        attackAssociation="unknown",nativeExecutionConfirmed=false}
    c.world=path(valid(actor) and call(actor,"GetWorld") or call(ability,"GetWorld"))
    c.captureWorld=c.world
    if kind=="warning-call" then
        c.action=path(o); c.actionClass=warning.actionClass; c.effect=warning.effect
        c.warningResourceMatched=true
        c.sourceContextSnapshot=eventSnapshot(o,timeline)
        -- A current task is a candidate, even when its template matches. Parallel
        -- tasks can share one timeline asset; do not fabricate exact ownership.
    end
    return c,ability,task
end
local SIGNATURES={
    [PLAY]={{"Timeline","object"},{"PlayRate","number"},{"SyncPoint","number"},{"StartTimeSeconds","number"},{"PreviousTimlineName","name"}},
    [BYNAME]={{"TimelineName","name"},{"PlayRate","number"},{"SyncPoint","number"},{"StartTimeSeconds","number"}},
    Received_ActionBegin={{"ElapsedTime","number"},{"TotalDuration","number"},{"BeginTime","number"}},
    ["Spawn Particles"]={{"Avatar","object"}}, ["Play Particle"]={{"Actor","object"}}}
local function paramsFor(hook,args)
    local signature=SIGNATURES[hook] or SIGNATURES[hook:match(':([^:]+)$')]
    if not signature or args.n~=#signature then
        S.health.abiUnknown=S.health.abiUnknown+1
        return {status="unknown",reason="sdk-argument-count-mismatch",observedCount=args.n,expectedCount=signature and #signature or -1}
    end
    local out={status="sdk-positional-count-matched",abiVerified=false,source="reflection-SDK-0.3.3"}
    for i,s in ipairs(signature) do out[s[1]]=scalar(args[i],s[2]) end
    return out
end
local function append(event)
    S.seq=S.seq+1; event.seq=S.seq
    local row=json(event)
    if #row>16384 then S.dropped=S.dropped+1; err("oversized-event",#row); return end
    S.rows[#S.rows+1]={seq=S.seq,json=row}; S.bytes=S.bytes+#row
    while #S.rows>MAX_EVENTS or S.bytes>MAX_BYTES do
        local first=table.remove(S.rows,1); S.bytes=S.bytes-#first.json; S.dropped=S.dropped+1
    end
    S.revision=S.revision+1
end
local function rebuild()
    if S.frame.seq==S.seq then return end
    local rows={}; for i,r in ipairs(S.rows) do rows[i]=r.json end
    S.frame={seq=S.seq,json='['..table.concat(rows,',')..']',firstSeq=S.rows[1] and S.rows[1].seq or 0,dropped=S.dropped}
    S.health.snapshotRebuilds=S.health.snapshotRebuilds+1
end
local function candidate(classPath,action)
    if type(classPath)~="string" or classPath:sub(1,1)~="/" then return end
    for _,method in ipairs(METHODS) do
        local p=classPath..":"..method
        if action and S.candidates[p] then
            local existing=field(action,method)
            local full=valid(existing) and call(existing,"GetFullName") or nil
            if type(full)=="string" and full:sub(1,9)=="Function " and path(existing)==p then
                S.candidates[p].exactFunction=existing
            end
        end
        if not S.registered[p] and not S.candidates[p] then
            local n=0; for _ in pairs(S.candidates) do n=n+1 end
            if n<128 then
                -- Some UE4SS facades expose a loaded UFunction at the member.
                -- Prefer it only when GetFullName identifies the exact path;
                -- ordinary Lua functions/unreadable wrappers remain unknown.
                local existing=action and field(action,method) or nil
                local full=valid(existing) and call(existing,"GetFullName") or nil
                local exact=type(full)=="string" and full:sub(1,9)=="Function " and path(existing)==p
                S.candidates[p]={exactFunction=exact and existing or nil}
            else S.health.candidateDrops=S.health.candidateDrops+1 end
        end
    end
end
local function inspectActions(task)
    local timeline=field(task,"Timeline"); if not valid(timeline) then return end
    local budget=512 -- total nodes across main + all role layers, not 512 per layer
    local function events(array)
        if budget<=0 then return end
        eachArray(array,function(e)
            if budget<=0 then return end
            budget=budget-1
            local action=field(e,"Action"); if not valid(action) then return end
            local effect=path(field(action,"NiagaraEffect")):lower()
            local cls=path(call(action,"GetClass"))
            if effect:find("/ns_attackalert_red_",1,true) or effect:find("/ns_attackalert_blue_",1,true)
                or (effect:find("/ns_attackalert_post_001",1,true) and cls==BLACK) then candidate(cls,action) end
        end,budget)
    end
    events(field(timeline,"Actions"))
    eachArray(field(timeline,"RoleLayers"),function(layer)
        if budget>0 then events(field(layer,"Actions")) end
    end,32)
end
local function capture(hook,kind,phase,ctx,args)
    if not S.active or S.stopped or not gameThread() then return end
    local o=unwrap(ctx); local warning
    if kind=="warning-call" then
        -- Parent particle functions service ordinary VFX too: reject those
        -- after only class/effect reads, before ability/task/timeline traversal.
        if not valid(o) then return end
        local cls=path(call(o,"GetClass")); local raw=path(field(o,"NiagaraEffect")); local effect=raw:lower()
        local matched=effect:find("/ns_attackalert_red_",1,true) or effect:find("/ns_attackalert_blue_",1,true)
            or (cls==BLACK and effect:find("/ns_attackalert_post_001",1,true))
        if not matched then return end
        warning={actionClass=cls,effect=raw}
    end
    local c,ability,task=contextOf(o,kind,warning)
    if c.object=="" then error("context unavailable") end
    -- This reference is used only by subsequent game-thread maintenance and is
    -- checked before access. It never crosses to the async JSON publisher.
    local actor=valid(ability) and call(ability,"GetAvatarActorFromActorInfo") or nil
    if valid(actor) then S.discoveryContext=actor end
    local stack=S.stacks[hook] or {}; S.stacks[hook]=stack
    local id,match,parent
    if S.backends[hook]=="script-single-slot" then
        phase="call"; S.serial=S.serial+1; id=S.session..":"..S.serial
        match="single-script-callback-no-post"
    elseif phase=="pre" then
        S.serial=S.serial+1; id=S.session..":"..S.serial
        if #stack>=64 then
            S.overflows[hook]=(S.overflows[hook] or 0)+1; match="unknown-stack-overflow"
        else
            stack[#stack+1]={callId=id,object=c.object}; match="pending-post"
        end
    else
        if (S.overflows[hook] or 0)>0 then
            S.overflows[hook]=S.overflows[hook]-1; match="unknown-stack-overflow"
        else
            local pre=table.remove(stack)
            if pre and pre.object==c.object then id=pre.callId; match="synchronous-stack"
            else
                match="unknown"; parent=pre and pre.callId or nil
                S.health.unmatchedPosts=S.health.unmatchedPosts+1
            end
        end
        if not id then S.serial=S.serial+1; id=S.session..":unmatched:"..S.serial end
    end
    append({kind=kind,phase=phase,callId=id,matching=match,unmatchedPreCandidate=parent,
        hookPath=hook,atWallMs=os.time()*1000,gameTime=clock(valid(ability) and ability or o),
        thread="game-confirmed",context=c,params=paramsFor(hook,args),
        callbackSemantics=S.backends[hook] or "unknown"})
    if kind=="timeline-call" and phase=="post" then inspectActions(task) end
end
local function callback(hook,kind,phase)
    return function(ctx,...)
        local args=table.pack(...)
        local ok,why=pcall(capture,hook,kind,phase,ctx,args)
        if not ok then
            S.health.captureFailures=S.health.captureFailures+1
            S.health.abandonedPres=S.health.abandonedPres+#(S.stacks[hook] or {})
            S.stacks[hook]={}; S.overflows[hook]=0; err("capture",why)
        end
        -- No parameter writes, Set calls, return override, or deferred params.
    end
end
local function register(hook,kind,dynamic,suppliedFunction)
    if S.registered[hook] then return true end
    if dynamic and S.dynamic>=MAX_DYNAMIC then
        S.health.dynamicLimitReached=S.health.dynamicLimitReached+1; S.candidates[hook]=nil; return false
    end
    local fn=valid(suppliedFunction) and path(suppliedFunction)==hook and suppliedFunction or findObject(hook,"hook-discovery")
    if not valid(fn) then return false end -- no LoadAsset/LoadObject
    local full=call(fn,"GetFullName"); if type(full)~="string" or full:sub(1,9)~="Function " then return false end
    local pre,post=RegisterHook(hook,callback(hook,kind,"pre"),callback(hook,kind,"post"))
    if type(pre)~="number" or type(post)~="number" then error("invalid hook registration IDs") end
    S.hooks[#S.hooks+1]={path=hook,pre=pre,post=post}; S.registered[hook]=true
    -- In the audited UE4SS implementation script UFunctions use one callback
    -- and equal IDs; their optional PostCallback is not invoked. Record a call,
    -- not fabricated pre/post phases. Native UFunctions have distinct IDs.
    S.backends[hook]=pre==post and "script-single-slot" or "native-pre-post"
    S.candidates[hook]=nil; if dynamic then S.dynamic=S.dynamic+1 end
    S.revision=S.revision+1; log("REGISTERED",hook); return true
end
local function tryRegister(hook,kind,dynamic,suppliedFunction)
    if S.registered[hook] then return false end
    local now=os.time(); local state=S.attempted[hook] or {count=0,nextAt=0}; S.attempted[hook]=state
    if state.count>=MAX_ATTEMPTS_PER_PATH then S.health.lookupPathExhausted=S.health.lookupPathExhausted+1; return false end
    if now<state.nextAt then S.health.lookupBackoffSkips=S.health.lookupBackoffSkips+1; return false end
    if S.lookupProfile.attempts>=MAX_LOOKUPS and not valid(suppliedFunction) then
        S.health.lookupBudgetDrops=S.health.lookupBudgetDrops+1; return false
    end
    state.count=state.count+1; state.nextAt=now+(state.count==1 and 5 or 30)
    local ok,result=pcall(register,hook,kind,dynamic,suppliedFunction)
    if not ok then S.health.registrationFailures=S.health.registrationFailures+1; err("register",result) end
    return true
end
local function discover(initial)
    if not gameThread() then return end
    if initial then
        -- Only these known native functions are searched at setup. No nine-path
        -- speculative particle search runs before there is a live world context.
        for _,hook in ipairs({PLAY,BYNAME}) do tryRegister(hook,"timeline-call",false) end
        return
    end
    if not valid(S.discoveryContext) then S.health.discoveryNoContext=S.health.discoveryNoContext+1; return end
    local lib=cachedGameLibrary(); local paused
    if valid(lib) then paused=call(lib,"IsGamePaused",S.discoveryContext) end
    if type(paused)~="boolean" or paused then S.health.discoveryPaused=S.health.discoveryPaused+1; return end
    for _,hook in ipairs({PLAY,BYNAME}) do
        if not S.registered[hook] and tryRegister(hook,"timeline-call",false) then return end
    end
    local pending={}; for p in pairs(S.candidates) do pending[#pending+1]=p end; table.sort(pending)
    for _,p in ipairs(pending) do
        local candidateInfo=S.candidates[p]
        if tryRegister(p,"warning-call",true,candidateInfo and candidateInfo.exactFunction) then break end
    end
end
local function publish(stopping)
    if not S.output then return false end
    local second=os.time()
    if not stopping and not S.health.currentlyFailing and S.published==S.revision
        and S.publishedSeq==S.frame.seq and S.publishedSecond==second then return true end
    local frame=S.frame
    local health={}; for k,v in pairs(S.health) do health[k]=v end
    local recovering=health.currentlyFailing
    health.currentlyFailing=false; health.recoveries=health.recoveries+(recovering and 1 or 0)
    health.registered=#S.hooks; health.dynamicRegistered=S.dynamic
    local payload='{"schemaVersion":1,"session":'..q(S.session)..',"seq":'..frame.seq
        ..',"heartbeat":'..(stopping and '0' or tostring(second*1000))..',"active":'..tostring(not stopping and S.active)
        ..',"retention":'..json({maxEvents=MAX_EVENTS,maxBytes=MAX_BYTES,firstSeq=frame.firstSeq,lastSeq=frame.seq,dropped=frame.dropped})
        ..',"health":'..json(health)..',"lookupProfile":'..json(S.lookupProfile)..',"events":'..frame.json..'}\n'
    local f,why=io.open(S.output,"wb")
    local ok,wrote,closeOK,closed=true,nil,true,nil
    if f then ok,wrote=pcall(f.write,f,payload); closeOK,closed=pcall(f.close,f) end
    if not f or not ok or not wrote or not closeOK or not closed then
        S.health.writeFailures=S.health.writeFailures+1; S.health.currentlyFailing=true
        err("write",why or (not ok and wrote) or (not closeOK and closed) or "write/close refused"); return false
    end
    S.health.recoveries=health.recoveries; S.health.currentlyFailing=false
    S.published=S.revision; S.publishedSeq=frame.seq; S.publishedSecond=second; return true
end
local function maintenance()
    if S.stopped then return true end
    if not gameThread() then return false end
    local now=os.time()
    if not S.lastDiscovery or now-S.lastDiscovery>=1 then
        S.lastDiscovery=now; local ok,why=pcall(discover,false)
        if not ok then S.health.discoveryFailures=S.health.discoveryFailures+1; err("discover",why) end
    end
    rebuild(); return false
end
local function uninstall()
    if not gameThread() then return end
    local keep={}
    for _,h in ipairs(S.hooks) do
        local ok,result=pcall(UnregisterHook,h.path,h.pre,h.post)
        if not ok or result==false then keep[#keep+1]=h; S.health.unregisterFailures=S.health.unregisterFailures+1; err("unregister",result) end
    end
    S.hooks=keep; S.revision=S.revision+1
end
function M.stop()
    if S.stopped then return end
    S.active=false; S.stopped=true
    pcall(publish,true)
    if type(ExecuteInGameThread)=="function" then pcall(ExecuteInGameThread,uninstall) end
end
function M.status()
    local h={}; for k,v in pairs(S.health) do h[k]=v end
    return {active=S.active,stopped=S.stopped,seq=S.seq,registered=#S.hooks,dynamicRegistered=S.dynamic,
        retained=#S.rows,dropped=S.dropped,health=h}
end
local function enabled(config)
    local f=io.open(config,"rb"); if not f then return true end
    local ok,body=pcall(f.read,f,65536); pcall(f.close,f)
    if not ok or type(body)~="string" then return true end
    body=body:gsub('^\239\187\191','')
    local flags={observeattacks=true,diagnostics=true,hooks=true}
    for line in body:gmatch('[^\n]+') do
        local k,v=line:match('^%s*([%a]+)%s*=%s*([^#;\r\n]+)')
        if k then k=k:lower(); v=v:match('^%s*(.-)%s*$'):lower()
            if flags[k]~=nil then
                if v=="0" or v=="false" then flags[k]=false elseif v=="1" or v=="true" then flags[k]=true end
            end
        end
    end
    return flags.observeattacks and flags.diagnostics and flags.hooks
end
local localData=os.getenv("LOCALAPPDATA")
if type(localData)~="string" or not (localData:match('^[A-Za-z]:[\\/]') or localData:match('^\\\\[^\\]+\\[^\\]+')) then log("DISABLED","invalid LOCALAPPDATA"); return M end
local ok,on=pcall(enabled,localData.."\\ProjectPBZ\\Saved\\PBZForewarn.txt")
if not ok or not on then log("DISABLED",ok and "startup config" or "unreadable startup config"); return M end
for _,api in ipairs({"StaticFindObject","RegisterHook","UnregisterHook","ExecuteInGameThread","LoopAsync","IsInGameThread"}) do
    if type(_G[api])~="function" then log("DISABLED","missing API "..api); return M end
end
if type(LoopInGameThreadWithDelay)~="function" then log("DISABLED","missing game-thread maintenance API"); return M end
S.output=localData.."\\ProjectPBZ\\Saved\\pbzforewarn_observer_hooks.json"
S.session="fw-observe-"..tostring(os.time()).."-"..tostring(M):gsub('[^%w]','')
S.active=true; candidate(BLUE); candidate(BLACK); candidate(PARTICLE)
local loopOK,why=pcall(LoopAsync,100,function()
    if S.stopped then return true end
    local success,failure=pcall(publish,false)
    if not success then S.health.publishExceptions=S.health.publishExceptions+1; S.health.currentlyFailing=true; err("publish",failure) end
    return false
end)
if not loopOK then S.active=false; log("DISABLED",why); return M end
local setupOK,setupWhy=pcall(ExecuteInGameThread,function()
    if not gameThread() or S.stopped then return end
    discover(true)
    maintenance()
    local good,e=pcall(LoopInGameThreadWithDelay,50,maintenance)
    if not good then S.health.discoveryFailures=S.health.discoveryFailures+1; err("maintenance",e) end
end)
if not setupOK then S.active=false; S.stopped=true; log("DISABLED",setupWhy); pcall(publish,true) end
return M
