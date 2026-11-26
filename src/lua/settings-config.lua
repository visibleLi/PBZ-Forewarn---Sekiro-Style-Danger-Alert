-- Shared settings authority. Startup migration is separate from read-only Menu refresh.
local GLOBAL_KEY = "__PBZForewarnSettingsConfig_v1"
local prior = rawget(_G, GLOBAL_KEY)
if type(prior) == "table" then return prior end
local M = {}
rawset(_G, GLOBAL_KEY, M)
local defaults = {LeadMs=350, RangeCm=3500, TickMs=16, DiscoverMs=50, ScanMs=250,
    LateGraceMs=80, MaxGlyphMs=1200, GlyphOn=true, GlyphFontSize=120, GlyphY=0.32,
    Diagnostics=false, ObserveAttacks=true, Hooks=true, BlackOn=true,
    GenericAttack=true, ObservationFlushMs=20000,
    OnlyLockedTarget=false, SoundOn=true, SoundVolume=0.8,
    FontPath="/Game/PBZContent/UI/Fonts/ZH_ZiKuTangKuangShanKaiShuJF_Font.ZH_ZiKuTangKuangShanKaiShuJF_Font"}
local bounds = {LeadMs={0,1000}, ObservationFlushMs={5000,60000},
    RangeCm={500,10000}, TickMs={16,100}, DiscoverMs={16,250}, ScanMs={100,1000},
    LateGraceMs={0,250}, MaxGlyphMs={100,3000}, GlyphFontSize={30,240}, GlyphY={0.1,0.8}, SoundVolume={0,2}}
local names = {}
for key in pairs(defaults) do names[key:lower()] = key end
local public = {LeadMs=true, RangeCm=true, OnlyLockedTarget=true, SoundOn=true,
    SoundVolume=true, GlyphOn=true, GlyphFontSize=true, GlyphY=true, Diagnostics=true}
local retired = {semanticfallback=true, yuzancastwarning=true, yuzancastleadms=true}
local NULL, OBJECT, ARRAY = {}, {}, {} -- Keep null and empty object/array distinct.
local numberLiterals=setmetatable({},{__mode='k'}) -- Lossless unknown numeric values during migration.
local MAX_BYTES, MAX_DEPTH = 65536, 8
local function object(value) return type(value)=='table' and getmetatable(value)==OBJECT end
local function structured(values) return values._internal~=nil or values._extra~=nil end
local EPOCH='PBZForewarnGenericAttackEpoch'
local function genericUpgraded(values)
    return values._extra and type(values._extra[EPOCH])=='number' and values._extra[EPOCH]==1
end
local function finite(n) return type(n)=="number" and n==n and n~=math.huge and n~=-math.huge end
local function report(text) print("[PBZForewarnSettings] " .. text .. "\n") end
local function copy(t) local r={}; for k,v in pairs(t) do r[k]=v end; return r end
-- ECMAScript whitespace, matching the JS legacy reader and Number(string).
local function whitespace(text)
    for _,code in ipairs({0xA0,0x1680,0x2000,0x2001,0x2002,0x2003,0x2004,0x2005,
        0x2006,0x2007,0x2008,0x2009,0x200A,0x2028,0x2029,0x202F,0x205F,0x3000,0xFEFF}) do
        text=text:gsub(utf8.char(code),' ')
    end
    return text
end
local function numericString(text)
    text=whitespace(text):match('^%s*(.-)%s*$')
    if text=='' then return nil end
    local sign,radix,digits=text:match('^([+-]?)0([xX])([%da-fA-F]+)$')
    if not digits then sign,radix,digits=text:match('^([+-]?)0([bB])([01]+)$') end
    if not digits then sign,radix,digits=text:match('^([+-]?)0([oO])([0-7]+)$') end
    if digits then
        local base=(radix:lower()=='x' and 16) or (radix:lower()=='b' and 2) or 8
        if sign~='' then return nil end
        local number=0.0
        for digit in digits:gmatch('.') do number=number*base+tonumber(digit,base) end
        return finite(number) and number or nil
    end
    local decimal=text:match('^[+-]?%d+$') or text:match('^[+-]?%d+%.%d*$') or
        text:match('^[+-]?%.%d+$') or text:match('^[+-]?%d+[eE][+-]?%d+$') or
        text:match('^[+-]?%d+%.%d*[eE][+-]?%d+$') or text:match('^[+-]?%.%d+[eE][+-]?%d+$')
    if not decimal then return nil end
    local number=tonumber(text)
    return finite(number) and number or nil
end
local function quote(s)
    return '"' .. s:gsub('[%z\1-\31\\"]',function(c)
        if c=='"' then return '\\"' elseif c=='\\' then return '\\\\' end
        return string.format('\\u%04x',string.byte(c))
    end) .. '"'
end
-- Bounded JSON, including unknown data: never evaluate a saved value as Lua.
-- Validate every literal/member before overwrite, matching the JS reader.
local function decode(body)
    if #body>MAX_BYTES then error('settings exceed 64 KiB') end
    body=body:gsub('^\239\187\191','')
    local i,n = 1,#body
    local function fail() error("invalid settings JSON at byte " .. i,0) end
    local function ws() local _,last=body:find('^[ \t\r\n]*',i); i=(last or i-1)+1 end
    local function str()
        if body:sub(i,i)~='"' then fail() end
        i=i+1; local parts={}
        while i<=n do
            local c=body:sub(i,i); i=i+1
            if c=='"' then
                local value=table.concat(parts)
                if not utf8.len(value) then fail() end
                return value
            elseif c=='\\' then
                c=body:sub(i,i); i=i+1
                local escapes={['"']='"',['\\']='\\',['/']='/',b='\b',f='\f',n='\n',r='\r',t='\t'}
                if escapes[c] then parts[#parts+1]=escapes[c]
                elseif c=='u' then
                    local hex=body:sub(i,i+3)
                    if #hex~=4 or hex:find('[^%da-fA-F]') then fail() end
                    local code=tonumber(hex,16); i=i+4
                    if code>=0xD800 and code<=0xDBFF then
                        if body:sub(i,i+1)~='\\u' then fail() end
                        hex=body:sub(i+2,i+5)
                        if #hex~=4 or hex:find('[^%da-fA-F]') then fail() end
                        local low=tonumber(hex,16)
                        if low<0xDC00 or low>0xDFFF then fail() end
                        code=0x10000+(code-0xD800)*0x400+low-0xDC00; i=i+6
                    elseif code>=0xDC00 and code<=0xDFFF then fail() end
                    parts[#parts+1]=utf8.char(code)
                else fail() end
            elseif c:byte()<32 then fail()
            else parts[#parts+1]=c end
        end
        fail()
    end
    local value
    value=function(depth,scope)
        local c=body:sub(i,i)
        if c=='{' or c=='[' then
            if depth>MAX_DEPTH then fail() end
            local isObject=c=='{'
            local values=setmetatable({},isObject and OBJECT or ARRAY)
            numberLiterals[values]={}
            local ending=isObject and '}' or ']'
            i=i+1; ws()
            if body:sub(i,i)~=ending then
                while true do
                    local key=isObject and str() or #values+1
                    if isObject then ws(); if body:sub(i,i)~=':' then fail() end; i=i+1; ws() end
                    local childScope=scope=='root' and key=='_internal' and 'internal' or nil
                    local item,literal=value(depth+1,childScope)
                    if scope=='root' and (key=='_internal' or key=='_extra') and not object(item) then fail() end
                    if (scope=='root' or scope=='internal') and names[tostring(key):lower()] and
                        type(item)=='table' and item~=NULL then fail() end
                    values[key]=item; numberLiterals[values][key]=literal; ws()
                    if body:sub(i,i)~=',' then break end
                    i=i+1; ws()
                end
            end
            if body:sub(i,i)~=ending then fail() end
            i=i+1; return values
        end
        if c=='"' then return str() end
        for token,item in pairs({['true']=true,['false']=false,['null']=NULL}) do
            if body:sub(i,i+#token-1)==token then i=i+#token; return item end
        end
        local token=body:sub(i):match('^[^,%]%}%s]+') or ''
        -- JSON number grammar, checked in stages to reject Lua-only numeric forms.
        local rest=token
        if rest:sub(1,1)=='-' then rest=rest:sub(2) end
        if rest:sub(1,1)=='0' then rest=rest:sub(2)
        else local digits=rest:match('^[1-9]%d*'); if not digits then fail() end; rest=rest:sub(#digits+1) end
        if rest:sub(1,1)=='.' then local digits=rest:match('^%.%d+'); if not digits then fail() end; rest=rest:sub(#digits+1) end
        if rest:match('^[eE]') then local exp=rest:match('^[eE][+-]?%d+'); if not exp then fail() end; rest=rest:sub(#exp+1) end
        local item=tonumber(token)
        if rest~='' or not finite(item) then fail() end
        i=i+#token; return item,token
    end
    ws(); local values=value(1,'root'); ws()
    if not object(values) or i<=n then fail() end
    return values
end
local function keys(values)
    local ordered={}; for key in pairs(values) do ordered[#ordered+1]=key end
    table.sort(ordered,function(a,b) return a:lower()<b:lower() or a:lower()==b:lower() and a<b end)
    return ordered
end
local function encode(values)
    local function text(value,depth,literal)
        if value==NULL then return 'null' end
        if type(value)=='string' then return quote(value) end
        if type(value)=='number' then return literal or string.format('%.17g',value) end
        if type(value)~='table' then return tostring(value) end
        if depth>MAX_DEPTH then error('settings exceed JSON depth limit') end
        local rows,indent={},string.rep('  ',depth)
        local literals=numberLiterals[value] or {}
        if getmetatable(value)==ARRAY then
            for index,item in ipairs(value) do rows[#rows+1]=indent..text(item,depth+1,literals[index]) end
            return '[\n'..table.concat(rows,',\n')..'\n'..string.rep('  ',depth-1)..']'
        end
        for _,key in ipairs(keys(value)) do rows[#rows+1]=indent..quote(key)..': '..text(value[key],depth+1,literals[key]) end
        return '{\n'..table.concat(rows,',\n')..'\n'..string.rep('  ',depth-1)..'}'
    end
    local body=text(values,1)..'\n'
    if #body>MAX_BYTES then error('settings exceed 64 KiB after migration') end
    return body
end
local function assign(result,key,value)
    local name=names[key:lower()]
    if not name then return false end
    if type(defaults[name])=='boolean' then
        if type(value)=='boolean' then result[name]=value; return true
        elseif type(value)=='number' and (value==0 or value==1) then result[name]=value==1; return true
        elseif type(value)=='string' then
            local text=value:lower()
            if text=='true' or text=='1' then result[name]=true; return true
            elseif text=='false' or text=='0' then result[name]=false; return true end
        end
    elseif bounds[name] then
        local number=type(value)=='number' and value or type(value)=='string' and numericString(value)
        if finite(number) then result[name]=math.max(bounds[name][1],math.min(bounds[name][2],number)); return true end
    end -- FontPath remains the existing fixed default, matching the legacy JS reader.
    return false
end
local function normalize(values)
    local result=copy(defaults)
    local grouped=structured(values)
    -- Read old internal Diagnostics before its public Menu spelling so an
    -- explicit public value always wins during the compatibility window.
    if grouped and values._internal then
        for _,key in ipairs(keys(values._internal)) do
            local name=names[key:lower()]
            if name=='Diagnostics' or name and not public[name] then assign(result,key,values._internal[key]) end
        end
    end
    for _,key in ipairs(keys(values)) do
        local name=names[key:lower()]
        if name and (not grouped or public[name]) then assign(result,key,values[key]) end
    end
    -- The exact key written by Menu also wins over legacy case aliases.
    assign(result,'Diagnostics',values.Diagnostics)
    if not genericUpgraded(values) then result.GenericAttack=true end
    return result
end
local function partition(values)
    local result=setmetatable({_internal=setmetatable({},OBJECT)},OBJECT)
    numberLiterals[result]={}; numberLiterals[result._internal]={}
    local effective,seen=copy(defaults),{}
    for key,value in pairs(defaults) do
        if public[key] then result[key]=value else result._internal[key]=value end
    end
    local function preserve(target,name,key)
        target[name]=values[key]
        numberLiterals[target][name]=(numberLiterals[values] or {})[key]
    end
    for _,key in ipairs(keys(values)) do
        local name=names[key:lower()]
        if name then
            local valid=assign(effective,key,values[key])
            -- Keep a later invalid alias from replacing an earlier valid value;
            -- otherwise migration would change the effective setting on restart.
            if valid or not seen[name] or name=='FontPath' then
                preserve(public[name] and result or result._internal,name,key)
            end
            seen[name]=seen[name] or valid
        elseif not retired[key:lower()] then
            if not result._extra then
                result._extra=setmetatable({},OBJECT); numberLiterals[result._extra]={}
            end
            preserve(result._extra,key,key)
        end
    end
    return result
end
local function needsDiagnosticsPromotion(values)
    if values.Diagnostics~=nil and type(values.Diagnostics)~='boolean' then return true end
    for key in pairs(values) do
        if key~='Diagnostics' and names[key:lower()]=='Diagnostics' then return true end
    end
    for key in pairs(values._internal or {}) do
        if names[key:lower()]=='Diagnostics' then return true end
    end
    return false
end
local function promoteDiagnostics(values,value)
    for _,source in ipairs({values,values._internal}) do
        for key in pairs(source) do
            if names[key:lower()]=='Diagnostics' then
                source[key]=nil
                if numberLiterals[source] then numberLiterals[source][key]=nil end
            end
        end
    end
    values.Diagnostics=value
end
local function upgradeGeneric(values)
    local result=structured(values) and values or partition(values)
    if not result._internal then result._internal=setmetatable({},OBJECT) end
    for key in pairs(result._internal) do
        if names[key:lower()]=='GenericAttack' then
            result._internal[key]=true
            if numberLiterals[result._internal] then numberLiterals[result._internal][key]=nil end
        end
    end
    result._internal.GenericAttack=true
    if not result._extra then result._extra=setmetatable({},OBJECT) end
    result._extra[EPOCH]=1
    if numberLiterals[result._extra] then numberLiterals[result._extra][EPOCH]=nil end
    return result
end
local function legacySettings(body)
    local values=copy(defaults)
    local bom=body:sub(1,2)
    if bom=='\255\254' or bom=='\254\255' then
        if #body%2~=0 then error('truncated UTF-16 legacy settings') end
        local parts,i={},3
        local function unit(at)
            local a,b=body:byte(at,at+1)
            return bom=='\255\254' and a+b*256 or a*256+b
        end
        while i<=#body do
            local code=unit(i); i=i+2
            if code>=0xD800 and code<=0xDBFF then
                if i>#body then error('unpaired UTF-16 legacy surrogate') end
                local low=unit(i); i=i+2
                if low<0xDC00 or low>0xDFFF then error('unpaired UTF-16 legacy surrogate') end
                code=0x10000+(code-0xD800)*0x400+low-0xDC00
            elseif code>=0xDC00 and code<=0xDFFF then error('unpaired UTF-16 legacy surrogate') end
            parts[#parts+1]=utf8.char(code)
        end
        body=table.concat(parts)
    end
    if not utf8.len(body) then error('legacy settings are not valid UTF-8 or BOM-marked UTF-16') end
    body=whitespace(body:gsub('^\239\187\191',''))
    for line in body:gmatch('[^\n]+') do
        local key,value=line:match('^%s*([%a][%w_]*)%s*=%s*(.-)%s*$')
        if key then
            value=value:match('^([^#;]*)')
            value=value and value:match('^%s*(.-)%s*$')
            if value and value~='' and not retired[key:lower()] then
                if not names[key:lower()] then values[key]=value
                elseif names[key:lower()]=='FontPath' then values.FontPath=value
                else assign(values,key,value) end
            end
        end
    end
    return values
end
local function read(path)
    local opened,file,why,code=pcall(io.open,path,'rb')
    if not opened then return nil,'unreadable',file end
    if not file then return nil,code==2 and 'missing' or 'unreadable',why end
    local ok,body,readError=pcall(file.read,file,MAX_BYTES+1)
    local closed,closeResult=pcall(file.close,file)
    if not ok or readError or not closed or not closeResult or body~=nil and type(body)~='string' or type(body)=='string' and #body>MAX_BYTES then
        return nil,'unreadable','read/close failed or settings exceed 64 KiB'
    end
    return body or ''
end
local function missing(path)
    local _,state=read(path)
    if state~='missing' then error('path exists or is unreadable: '..path) end
end
local function rename(source,target)
    local ok,why=os.rename(source,target)
    if not ok then error(why or 'rename failed') end
end
local function stage(path,body,json)
    if #body>MAX_BYTES then error('settings exceed 64 KiB') end
    local temp=path..'.tmp-'..tostring(M):gsub('[^%w]','')
    missing(temp)
    local file,err=io.open(temp,'wb'); if not file then error(err or 'open failed') end
    local wrote,result=pcall(file.write,file,body)
    local closed,closeResult=pcall(file.close,file)
    if not wrote or not result or not closed or not closeResult then error('write/close failed') end
    local verified=read(temp)
    if verified~=body then error('temporary readback failed') end
    if json then decode(verified) end
    return temp
end
local function create(path,body)
    return pcall(function()
        local temp=stage(path,body,true)
        missing(path); rename(temp,path)
        if read(path)~=body then error('canonical JSON readback failed') end
    end)
end
local GENERIC_SUFFIX='.pre-generic-default'
local MENU_SUFFIX='.pre-menu-cleanup'
local DIAGNOSTICS_SUFFIX='.pre-diagnostics-menu'
local MIGRATION_SUFFIXES={MENU_SUFFIX,GENERIC_SUFFIX,DIAGNOSTICS_SUFFIX}
-- Windows CRT rename does not replace a destination. Publish the backup this
-- way (never open it with wb), then keep the original until new JSON readback.
-- This is recoverable, not atomic against process termination or other writers.
local function upgrade(path,original,body,suffix)
    local BACKUP,PENDING=suffix..'.bak',suffix..'.pending'
    local held,published,temp=false,false,nil
    local ok,why=pcall(function()
        -- A leftover hold from another upgrade must not become one of two
        -- competing recovery snapshots when we move the canonical file.
        for _,candidate in ipairs(MIGRATION_SUFFIXES) do missing(path..candidate..'.pending') end
        local backup,state=read(path..BACKUP)
        if backup then
            if backup~=original then error('original-byte backup conflicts') end
        elseif state=='missing' then
            local temp=stage(path..BACKUP,original,false)
            missing(path..BACKUP); rename(temp,path..BACKUP)
            if read(path..BACKUP)~=original then error('original-byte backup readback failed') end
        else error('original-byte backup unreadable') end
        temp=stage(path,body,true)
        missing(path..PENDING)
        if read(path)~=original then error('canonical JSON changed before migration') end
        rename(path,path..PENDING); held=true
        if read(path..PENDING)~=original then error('held original changed during migration') end
        missing(path); rename(temp,path); published=true
        if read(path)~=body then error('canonical JSON readback failed') end
    end)
    if not ok and held then
        local restored,restoreError=pcall(function()
            if published then
                local failed=temp..'.failed'
                missing(failed); rename(path,failed)
            end
            missing(path); rename(path..PENDING,path)
            if read(path)~=original then error('restored original readback failed') end
        end)
        if not restored then why=tostring(why)..'; recovery required from '..path..BACKUP..': '..tostring(restoreError) end
    elseif ok then
        -- Preserve, rather than delete, the moved original. A failed archival
        -- rename leaves a usable recovery snapshot, not a second live authority.
        local archived=pcall(rename,path..PENDING,path..suffix..'.replaced')
        if not archived then report('CONFIG_RECOVERY_SNAPSHOT '..path..PENDING) end
    end
    return ok,why
end
local function recover(path)
    return pcall(function()
        local original,pending
        for _,suffix in ipairs(MIGRATION_SUFFIXES) do
            local body,state=read(path..suffix..'.pending')
            if body then
                if original then error('ambiguous pending migration snapshots') end
                original,pending=body,suffix
            elseif state~='missing' then error('pending migration snapshot unreadable') end
        end
        if not original then return end
        local backup=read(path..pending..'.bak')
        if backup~=original then error('pending migration snapshot does not match backup') end
        missing(path); rename(path..pending..'.pending',path)
        if read(path)~=original then error('recovered original readback failed') end
        report('CONFIG_RECOVERED '..path)
    end)
end
-- directory is the absolute Scripts directory beside main/timeline/observation.
-- Returns the cached snapshot; only the first call performs startup migration.
-- Only required migrations replace canonical JSON, with the original backed up.
function M.load(directory)
    if M.settings then return copy(M.settings) end
    M.settings=copy(defaults)
    local parent=type(directory)=='string' and directory:match('^(.*)[\\/][^\\/]+$')
    if not parent or not (parent:match('^[A-Za-z]:[\\/]') or parent:match('^\\\\[^\\]+\\[^\\]+')) then
        report('CONFIG_PATH_FAILED; using defaults'); return copy(M.settings)
    end
    M.path=parent..'\\PBZForewarnHooks.config.json'
    local body,state,why=read(M.path)
    if not body and state=='missing' then
        local recovered,err=recover(M.path)
        body,state,why=read(M.path)
        if not recovered then
            report('MIGRATION_FAILED '..tostring(err))
            if not body then M.source='migration-failed'; return copy(M.settings) end
        end
    end
    if body then
        local ok,values=pcall(decode,body)
        if ok then
            M.settings=normalize(values)
            M.source='json'
            local generic=not genericUpgraded(values)
            local diagnostics=needsDiagnosticsPromotion(values)
            if generic or diagnostics then
                local encoded,newBody=pcall(function()
                    local canonical=generic and upgradeGeneric(values) or values
                    if diagnostics then promoteDiagnostics(canonical,M.settings.Diagnostics) end
                    return encode(canonical)
                end)
                local migrated,err=false,newBody
                if encoded then migrated,err=upgrade(M.path,body,newBody,generic and GENERIC_SUFFIX or DIAGNOSTICS_SUFFIX) end
                M.source=migrated and 'json-migrated' or 'migration-failed'
                report(migrated and 'CONFIG_MIGRATED settings; original bytes backed up' or
                    ('MIGRATION_FAILED '..tostring(err)..'; using normalized settings in memory; retry next startup'))
            end
        else M.source='invalid'; report('CONFIG_INVALID '..tostring(values)..'; using defaults') end
        return copy(M.settings)
    elseif state~='missing' then
        M.source='unreadable'; report('CONFIG_READ_FAILED '..tostring(why)..'; using defaults'); return copy(M.settings)
    end
    local appData=os.getenv('LOCALAPPDATA')
    local legacy
    if type(appData)=='string' and (appData:match('^[A-Za-z]:[\\/]') or appData:match('^\\\\[^\\]+\\[^\\]+')) then
        local legacyState
        legacy,legacyState,why=read(appData..'\\ProjectPBZ\\Saved\\PBZForewarn.txt')
        if not legacy and legacyState~='missing' then
            M.source='legacy-unreadable'; report('MIGRATION_FAILED legacy unreadable: '..tostring(why)); return copy(M.settings)
        end
    end
    local values=copy(defaults)
    if legacy then
        local parsed,result=pcall(legacySettings,legacy)
        if not parsed then
            M.source='migration-failed'; report('MIGRATION_FAILED '..tostring(result)..'; legacy preserved'); return copy(M.settings)
        end
        values=result; M.settings=normalize(values)
    end
    local encoded,body=pcall(function()
        local canonical=upgradeGeneric(values)
        promoteDiagnostics(canonical,M.settings.Diagnostics)
        return encode(canonical)
    end)
    local ok,err=false,body
    if encoded then ok,err=create(M.path,body) end
    M.source=ok and (legacy and 'migrated' or 'created') or 'migration-failed'
    report(ok and ('CONFIG_CREATED '..M.path..'; Menu saves apply live; manual edits require restart') or
        ('MIGRATION_FAILED '..tostring(err)..'; using '..(legacy and 'legacy settings' or 'defaults')..' in memory'))
    return copy(M.settings)
end
-- UI visibility does not disable live application: all former 14 live controls
-- refresh from their proper scope; the six reserved controls remain startup-only.
local editable = {LeadMs=true, RangeCm=true, GlyphOn=true, GlyphFontSize=true, GlyphY=true,
    Diagnostics=true, ObserveAttacks=true, Hooks=true, BlackOn=true,
    ObservationFlushMs=true, GenericAttack=true,
    OnlyLockedTarget=true, SoundOn=true, SoundVolume=true}
function M.refresh()
    if not M.path or not M.settings then return nil, 'settings not initialized' end
    local body,state,why=read(M.path)
    if not body then return nil, why or state end
    local ok,values=pcall(decode,body)
    if not ok then return nil,values end
    local normalized=normalize(values)
    local nextSettings=copy(M.settings)
    for key in pairs(editable) do nextSettings[key]=normalized[key] end
    M.settings=nextSettings
    return copy(M.settings)
end
return M
