-- Shared settings authority. Startup migration is separate from read-only Menu refresh.
local GLOBAL_KEY = "__PBZForewarnSettingsConfig_v1"
local prior = rawget(_G, GLOBAL_KEY)
if type(prior) == "table" then return prior end
local M = {}
rawset(_G, GLOBAL_KEY, M)
local defaults = {LeadMs=350, RangeCm=3500, TickMs=16, DiscoverMs=50, ScanMs=250,
    LateGraceMs=80, MaxGlyphMs=1200, GlyphOn=true, GlyphFontSize=120, GlyphY=0.32,
    Diagnostics=true, ObserveAttacks=true, Hooks=true, BlackOn=true, SemanticFallback=true,
    GenericAttack=false, ObservationFlushMs=20000, YuZanCastWarning=true, YuZanCastLeadMs=350,
    OnlyLockedTarget=false, SoundOn=true, SoundVolume=0.8,
    FontPath="/Game/PBZContent/UI/Fonts/ZH_ZiKuTangKuangShanKaiShuJF_Font.ZH_ZiKuTangKuangShanKaiShuJF_Font"}
local bounds = {LeadMs={0,1000}, YuZanCastLeadMs={0,1000}, ObservationFlushMs={5000,60000},
    RangeCm={500,10000}, TickMs={16,100}, DiscoverMs={16,250}, ScanMs={100,1000},
    LateGraceMs={0,250}, MaxGlyphMs={100,3000}, GlyphFontSize={30,240}, GlyphY={0.1,0.8}, SoundVolume={0,2}}
local names = {}
for key in pairs(defaults) do names[key:lower()] = key end
local NULL = {} -- Preserve unknown JSON nulls without confusing them with absent keys.
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
-- Deliberately flat JSON: nested values and non-finite numbers fail closed.
local function decode(body)
    body=body:gsub('^\239\187\191','')
    local i,n = 1,#body
    local function fail() error("invalid flat settings JSON at byte " .. i,0) end
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
    local function scalar()
        local c=body:sub(i,i)
        if c=='"' then return str() end
        for token,value in pairs({['true']=true,['false']=false,['null']=NULL}) do
            if body:sub(i,i+#token-1)==token then i=i+#token; return value end
        end
        local token=body:sub(i):match('^[^,}%s]+') or ''
        -- JSON number grammar, checked in stages to reject Lua-only numeric forms.
        local rest=token
        if rest:sub(1,1)=='-' then rest=rest:sub(2) end
        if rest:sub(1,1)=='0' then rest=rest:sub(2)
        else local digits=rest:match('^[1-9]%d*'); if not digits then fail() end; rest=rest:sub(#digits+1) end
        if rest:sub(1,1)=='.' then local digits=rest:match('^%.%d+'); if not digits then fail() end; rest=rest:sub(#digits+1) end
        if rest:match('^[eE]') then local exp=rest:match('^[eE][+-]?%d+'); if not exp then fail() end; rest=rest:sub(#exp+1) end
        local value=tonumber(token)
        if rest~='' or not finite(value) then fail() end
        i=i+#token; return value
    end
    ws(); if body:sub(i,i)~='{' then fail() end; i=i+1; ws()
    local values={}
    if body:sub(i,i)~='}' then
        while true do
            local key=str(); ws()
            if body:sub(i,i)~=':' then fail() end
            i=i+1; ws(); values[key]=scalar(); ws()
            if body:sub(i,i)~=',' then break end
            i=i+1; ws()
        end
    end
    if body:sub(i,i)~='}' then fail() end
    i=i+1; ws(); if i<=n then fail() end
    return values
end
local function encode(values)
    local keys,rows={},{}
    for key in pairs(values) do keys[#keys+1]=key end
    table.sort(keys)
    for _,key in ipairs(keys) do
        local value=values[key]
        local text=value==NULL and 'null' or type(value)=='string' and quote(value) or tostring(value)
        rows[#rows+1]='  '..quote(key)..': '..text
    end
    return '{\n'..table.concat(rows,',\n')..'\n}\n'
end
local function assign(result,key,value,legacy)
    local name=names[key:lower()]
    -- Keep unknown legacy values as strings: Menu must not auto-expose them as
    -- editable bool/number rows. Existing JSON scalars remain byte-preserved.
    if not name then result[key]=value; return end
    if type(defaults[name])=='boolean' then
        if type(value)=='boolean' then result[name]=value
        elseif type(value)=='number' and (value==0 or value==1) then result[name]=value==1
        elseif type(value)=='string' then
            local text=value:lower()
            if text=='true' or text=='1' then result[name]=true
            elseif text=='false' or text=='0' then result[name]=false end
        end
    elseif bounds[name] then
        local number=type(value)=='number' and value or type(value)=='string' and numericString(value)
        if finite(number) then result[name]=math.max(bounds[name][1],math.min(bounds[name][2],number)) end
    end -- FontPath remains the existing fixed default, matching the legacy JS reader.
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
            if value and value~='' then assign(values,key,value,true) end
        end
    end
    return values
end
local function read(path)
    local opened,file,why,code=pcall(io.open,path,'rb')
    if not opened then return nil,'unreadable',file end
    if not file then return nil,code==2 and 'missing' or 'unreadable',why end
    local ok,body,readError=pcall(file.read,file,65537)
    local closed,closeResult=pcall(file.close,file)
    if not ok or readError or not closed or not closeResult or body~=nil and type(body)~='string' or type(body)=='string' and #body>65536 then
        return nil,'unreadable','read/close failed or settings exceed 64 KiB'
    end
    return body or ''
end
local function create(path,body)
    local temp=path..'.tmp-'..tostring(M):gsub('[^%w]','')
    local ok,why=pcall(function()
        local file,err=io.open(temp,'wb'); if not file then error(err or 'open failed') end
        local wrote,result=pcall(file.write,file,body)
        local closed,closeResult=pcall(file.close,file)
        if not wrote or not result or not closed or not closeResult then error('write/close failed') end
        local verified=read(temp)
        if verified~=body then error('temporary JSON readback failed') end
        decode(verified)
        local _,state=read(path)
        if state~='missing' then error('canonical path appeared or is unreadable') end
        local renamed,errText=os.rename(temp,path)
        if not renamed then error(errText or 'rename failed') end
        local final=read(path)
        if final~=body then error('canonical JSON readback failed') end
    end)
    if not ok then pcall(os.remove,temp); return false,why end
    return true
end
-- directory is the absolute Scripts directory beside main/timeline/observation.
-- Returns the cached snapshot; only the first call performs startup migration.
-- Existing JSON is never rewritten, including during live refresh.
function M.load(directory)
    if M.settings then return copy(M.settings) end
    M.settings=copy(defaults)
    local parent=type(directory)=='string' and directory:match('^(.*)[\\/][^\\/]+$')
    if not parent or not (parent:match('^[A-Za-z]:[\\/]') or parent:match('^\\\\[^\\]+\\[^\\]+')) then
        report('CONFIG_PATH_FAILED; using defaults'); return copy(M.settings)
    end
    M.path=parent..'\\PBZForewarnHooks.config.json'
    local body,state,why=read(M.path)
    if body then
        local ok,values=pcall(decode,body)
        if ok then
            local ordered={}
            for key,value in pairs(values) do ordered[#ordered+1]={key=key,value=value} end
            table.sort(ordered,function(a,b) return a.key:lower()<b.key:lower() or a.key:lower()==b.key:lower() and a.key<b.key end)
            for _,item in ipairs(ordered) do assign(M.settings,item.key,item.value,false) end
            M.source='json'
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
    if legacy then
        local parsed,values=pcall(legacySettings,legacy)
        if not parsed then
            M.source='migration-failed'; report('MIGRATION_FAILED '..tostring(values)..'; legacy preserved'); return copy(M.settings)
        end
        M.settings=values
    end
    local ok,err=create(M.path,encode(M.settings))
    M.source=ok and (legacy and 'migrated' or 'created') or 'migration-failed'
    report(ok and ('CONFIG_CREATED '..M.path..'; Menu saves apply live; manual edits require restart') or
        ('MIGRATION_FAILED '..tostring(err)..'; using '..(legacy and 'legacy settings' or 'defaults')..' in memory'))
    return copy(M.settings)
end
-- Only editable controls refresh; reserved/unknown fields retain their startup values.
local editable = {LeadMs=true, RangeCm=true, GlyphOn=true, GlyphFontSize=true, GlyphY=true,
    Diagnostics=true, ObserveAttacks=true, Hooks=true, BlackOn=true, SemanticFallback=true,
    ObservationFlushMs=true, YuZanCastWarning=true, YuZanCastLeadMs=true,
    OnlyLockedTarget=true, SoundOn=true, SoundVolume=true}
function M.refresh()
    if not M.path or not M.settings then return nil, 'settings not initialized' end
    local body,state,why=read(M.path)
    if not body then return nil, why or state end
    local ok,values=pcall(decode,body)
    if not ok then return nil,values end
    local normalized=copy(defaults)
    local ordered={}
    for key,value in pairs(values) do ordered[#ordered+1]={key=key,value=value} end
    table.sort(ordered,function(a,b) return a.key:lower()<b.key:lower() or a.key:lower()==b.key:lower() and a.key<b.key end)
    for _,item in ipairs(ordered) do assign(normalized,item.key,item.value,false) end
    local nextSettings=copy(M.settings)
    for key in pairs(editable) do nextSettings[key]=normalized[key] end
    M.settings=nextSettings
    return copy(M.settings)
end
return M
