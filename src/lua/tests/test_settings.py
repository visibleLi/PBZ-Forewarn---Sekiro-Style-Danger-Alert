"""Lua config migration, preservation and refresh under existing stubbed file I/O."""
from pathlib import Path
import json
import sys
sys.path.insert(0, str(Path(__file__).parent / 'lib'))
from lupa.lua54 import LuaRuntime
from settings_fixture import install, HELPER, DIRECTORY, CANONICAL

checks = []
def check(condition, label):
    assert condition, label
    checks.append(label)


def fresh(config=None, body=None, files=None, **flags):
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
    for path, value in (files or {}).items():
        t.settingsFiles[path] = value
    helper = lua.execute(HELPER)
    result = helper.load(DIRECTORY)
    return lua, helper, result


def logs(lua):
    t = lua.globals().T
    return '\n'.join(t.logs[i] for i in range(1, len(t.logs)+1))

# Retrospective config regressions at the existing Lua stub-I/O seam, not a
# newly user-confirmed public acceptance boundary or a real Menu/game test.
PUBLIC = {'LeadMs', 'RangeCm', 'OnlyLockedTarget', 'SoundOn', 'SoundVolume',
          'GlyphOn', 'GlyphFontSize', 'GlyphY'}
INTERNAL = {'BlackOn', 'GenericAttack', 'Diagnostics', 'ObserveAttacks', 'Hooks',
            'ObservationFlushMs', 'TickMs', 'DiscoverMs', 'ScanMs', 'LateGraceMs',
            'MaxGlyphMs', 'FontPath'}
RETIRED = {'SemanticFallback', 'YuZanCastWarning', 'YuZanCastLeadMs'}
# Pre-marker flat and structured upgrades share the new transaction suffix;
# test.1's old suffix remains recovery input only, never a new backup target.
BACKUP = CANONICAL + '.pre-generic-default.bak'
PENDING = CANONICAL + '.pre-generic-default.pending'
REPLACED = CANONICAL + '.pre-generic-default.replaced'
OLD_BACKUP = CANONICAL + '.pre-menu-cleanup.bak'
OLD_PENDING = CANONICAL + '.pre-menu-cleanup.pending'

# Approved test.2 upgrade seam: load/refresh plus the existing in-memory I/O stub.
EPOCH = 'PBZForewarnGenericAttackEpoch'
original = ' \r\n' + json.dumps({'LeadMs': 613, 'SoundOn': False,
    '_internal': {'GenericAttack': False, 'Hooks': False, 'FontPath': '/retained'},
    '_extra': {'nested': {'unknown': [None, False, 7]}}}) + '\n'
l, m, s = fresh(body=original)
payload = json.loads(l.globals().T.json)
check(s.GenericAttack is True, 'test.2 upgrades unmarked structured generic false in memory')
check(payload == {'LeadMs': 613, 'SoundOn': False,
    '_internal': {'GenericAttack': True, 'Hooks': False, 'FontPath': '/retained'},
    '_extra': {'nested': {'unknown': [None, False, 7]}, EPOCH: 1}},
    'test.2 publishes marker and preserves every other structured value')
check(l.globals().T.settingsFiles[CANONICAL + '.pre-generic-default.bak'] == original,
      'test.2 backs up original structured bytes before publication')

marked_off = ' \r\n' + json.dumps({'LeadMs': 613,
    '_internal': {'GenericAttack': False, 'Hooks': False},
    '_extra': {EPOCH: 1, 'nested': [None, {'saved': True}]}}) + '\n'
for restart in range(2):
    l, m, s = fresh(body=marked_off)
    t = l.globals().T
    check(s.GenericAttack is False and t.json == marked_off and t.settingsWrites == 0,
          'marked deliberate false survives exact-byte read-only restart '+str(restart))
    check(m.refresh().GenericAttack is False and t.json == marked_off and t.settingsWrites == 0,
          'marked deliberate false survives exact-byte read-only refresh '+str(restart))
    check(set(s.keys()) == PUBLIC | INTERNAL, 'epoch metadata never becomes a runtime setting '+str(restart))

l, m, s = fresh()
payload = json.loads(l.globals().T.json)
check(set(payload) == PUBLIC | {'_internal', '_extra'} and set(payload['_internal']) == INTERNAL
      and payload['_extra'] == {EPOCH: 1},
      'fresh JSON has exactly eight public settings and twelve hidden settings')
check(s.GenericAttack is True and not any(s[key] is not None for key in RETIRED),
      'generic warnings default on and retired settings are absent from runtime')

legacy = '\ufeffhOoKs=0 # disabled\nDiagnostics=false ; quiet\nLeadMs=2000\nLeadMs=invalid\nSoundVolume=-3\nObservationFlushMs=1\nUnknownFlag=true\nUnknownCount=7\nUnknownText=a "quoted" path\\测试\nGenericAttack=1\n'
l, m, s = fresh(config=legacy)
t = l.globals().T
payload = json.loads(t.json)
check(m.path == CANONICAL, 'canonical path resolves in the mod directory beside Scripts')
check(s.Hooks is False and s.Diagnostics is False and s.GenericAttack is True, 'migration preserves commented boolean flags including reserved legacy value')
check(s.LeadMs == 1000 and s.SoundVolume == 0 and s.ObservationFlushMs == 5000, 'migration clamps bounds and ignores later invalid numbers')
check(payload['_extra']['UnknownFlag'] == 'true' and payload['_extra']['UnknownCount'] == '7' and payload['_extra']['UnknownText'] == 'a "quoted" path\\测试', 'migration keeps unknown legacy strings inside the hidden extra object')
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
t = l.globals().T
payload = json.loads(t.json)
check(t.settingsFiles[BACKUP] == body and t.settingsFiles[REPLACED] == body and t.legacyReads == 0,
      'flat JSON original bytes backed up before upgrade with no stale TXT access')
check(payload['_extra'] == {'Extra': None, 'Odd"Key': '😀', 'Float': -1200, EPOCH: 1} and s.Extra is None,
      'codec preserves unknown null surrogate-pair key and finite exponent as disk-only extras')
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
           '{"Hooks":{}}', '{"LeadMs":[]}', '{"_internal":[]}', '{"_extra":null}',
           '{"LeadMs":01}', '{"LeadMs":+1}', '{"LeadMs":0x10}',
           '{"LeadMs":.5}', '{"LeadMs":1.}', '{"LeadMs":1e}', '{"LeadMs":1e999}',
           '{"Bad":"\\x20"}', '{"Bad":"\\ud800"}', '{"Bad":"\\udc00"}', '{"Bad":"line\nfeed"}', '',
           '{"Bad":NaN}', '{"Bad":Infinity}', '{"Bad":truefalse}']
for body in invalid:
    l, m, s = fresh(config='Hooks=0\nLeadMs=900', body=body)
    check(s.Hooks is True and s.LeadMs == 350 and l.globals().T.json == body and l.globals().T.settingsWrites == 0
          and l.globals().T.legacyReads == 0 and 'CONFIG_INVALID' in logs(l), 'rejects malformed or non-scalar known JSON without overwrite '+repr(body))
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
          and json.loads(l.globals().T.json)['_internal']['Hooks'] is False,
          'BOM-marked legacy UTF-16 migration preserves settings '+encoding)
l, m, s = fresh(config=b'\xff\xfeH')
check(l.globals().T.json is None and 'MIGRATION_FAILED' in logs(l),
      'truncated UTF-16 is preserved without publishing default JSON')
l, m, s = fresh(config=' Hooks= 0 \nLeadMs=　200　')
check(s.Hooks is False and s.LeadMs == 200, 'Unicode whitespace matches JS during legacy migration')
l, m, s = fresh(body=json.dumps({'LeadMs':' 200 '}))
check(s.LeadMs == 200, 'Unicode whitespace matches JS numeric JSON string conversion')
for body in ['{"Hooks":false,"LeadMs":{},"LeadMs":null}',
             '{"Hooks":false,"Extra":"\\ud800","Extra":null}',
             '{"Hooks":false,"Extra":1e999,"Extra":null}']:
    l, m, s = fresh(body=body)
    check(s.Hooks is True and 'CONFIG_INVALID' in logs(l), 'invalid overwritten JSON member is rejected '+body)

# Preserve raw values on disk, flatten only known settings, and retire rather
# than merely hide the three boss settings. Flat migration has a byte backup.
flat_values = {'LeadMs': 613, 'RangeCm': 2700, 'OnlyLockedTarget': True,
               'SoundOn': False, 'SoundVolume': 0.35, 'GlyphOn': False,
               'GlyphFontSize': 88, 'GlyphY': 0.51, 'BlackOn': False,
               'GenericAttack': False, 'Diagnostics': False, 'ObserveAttacks': False,
               'Hooks': False, 'ObservationFlushMs': 31000, 'TickMs': 33,
               'DiscoverMs': 67, 'ScanMs': 444, 'LateGraceMs': 45,
               'MaxGlyphMs': 1600, 'FontPath': '/custom/retained-not-enabled',
               'SemanticFallback': True, 'YuZanCastWarning': True, 'YuZanCastLeadMs': 999,
               'UnknownFlag': False, 'UnknownCount': 0, 'UnknownNull': None,
               'UnknownNested': {'Hooks': True, 'LeadMs': 999, 'nested': [None, {}, [], '😀']},
               '__proto__': {'constructor': ['not Lua', 'not JS']}}
original = '﻿ \r\n' + json.dumps(flat_values, ensure_ascii=False) + '\n'
l, m, s = fresh(config='Hooks=1', body=original)
t = l.globals().T
payload = json.loads(t.json)
check(set(payload) == PUBLIC | {'_internal', '_extra'} and set(payload['_internal']) == INTERNAL,
      'flat upgrade emits only eight public scalars and two hidden objects')
check(all(payload[key] == flat_values[key] for key in PUBLIC) and
      all(payload['_internal'][key] == flat_values[key] for key in INTERNAL-{'GenericAttack'}) and
      payload['_internal']['GenericAttack'] is True,
      'flat upgrade changes only generic false among twenty non-default raw known values')
check(payload['_extra'] == {EPOCH: 1, **{key: value for key, value in flat_values.items()
                           if key not in PUBLIC | INTERNAL | RETIRED}},
      'flat upgrade preserves unknown scalars objects arrays null and special names under extra')
check(t.settingsFiles[BACKUP] == original and t.settingsFiles[REPLACED] == original and
      t.settingsFiles[PENDING] is None and t.backupWrites == 1 and t.settingsWrites == 2,
      'verified exclusive backup and retained original are byte-for-byte before one canonical upgrade')
ops = [t.settingsOps[i] for i in range(1, len(t.settingsOps)+1)]
backup_publish = next(i for i, op in enumerate(ops) if op.startswith('rename ') and op.endswith(' -> '+BACKUP))
check(backup_publish < ops.index('rename '+CANONICAL+' -> '+PENDING),
      'backup publication precedes moving or replacing canonical bytes')
check(s.GenericAttack is True and s.BlackOn is False and s.Hooks is False and
      s.FontPath != flat_values['FontPath'] and all(s[key] is None for key in RETIRED) and
      s.UnknownNested is None and s._extra is None and s._internal is None,
      'runtime flattens only known values and keeps fixed font without executing extras or retired rules')
reads, writes, saved = t.settingsReads, t.settingsWrites, t.json
check(m.load(DIRECTORY).GenericAttack is True and t.settingsReads == reads and t.settingsWrites == writes,
      'repeated load is cached and cannot repeat migration')
l2, m2, s2 = fresh(config='Hooks=1', body=saved)
check(l2.globals().T.json == saved and l2.globals().T.settingsWrites == 0 and
      l2.globals().T.legacyReads == 0 and s2.GenericAttack is True and s2.Hooks is False,
      'restart reads structured JSON unchanged without consulting legacy or re-migrating')

structured_values = {'LeadMs': 301, 'RangeCm': 2200, 'OnlyLockedTarget': True,
                     'SoundOn': False, 'SoundVolume': 0.42, 'GlyphOn': False,
                     'GlyphFontSize': 77, 'GlyphY': 0.66, 'Hooks': True,
                     'BlackOn': True, 'GenericAttack': True,
                     '_internal': {'Hooks': False, 'BlackOn': False, 'GenericAttack': False,
                                   'LeadMs': 999, 'SoundOn': True, 'SemanticFallback': True},
                     '_extra': {'Hooks': {}, 'LeadMs': [], 'GenericAttack': True,
                                'data': [{'保存': '😀'}, None], EPOCH: 1},
                     'RootUnknown': {'Hooks': True}, 'YuZanCastWarning': True}
body = '\r\n' + json.dumps(structured_values, ensure_ascii=False) + '\n'
l, m, s = fresh(config='Hooks=1', body=body)
check(s.LeadMs == 301 and s.SoundOn is False and s.Hooks is False and s.BlackOn is False and
      s.GenericAttack is False and s.YuZanCastWarning is None,
      'structured public top wins and hidden internal wins without cross-scope overrides')
check(l.globals().T.json == body and l.globals().T.settingsWrites == 0 and
      l.globals().T.legacyReads == 0 and s.RootUnknown is None,
      'already structured file including unknown root nested data is never rewritten or executed')
for body in ('{"Hooks":false,"GenericAttack":false,"_extra":{"PBZForewarnGenericAttackEpoch":1}}',
             '{"Hooks":false,"_internal":{},"_extra":{"PBZForewarnGenericAttackEpoch":1}}',
             '{"_extra":{"Hooks":{},"PBZForewarnGenericAttackEpoch":1}}'):
    l, m, s = fresh(body=body)
    check(s.Hooks is True and s.GenericAttack is True and l.globals().T.json == body and
          l.globals().T.settingsWrites == 0,
          'presence of either reserved object selects structured scoping '+body)
for body in ('{"GenericAttack":false,"SemanticFallback":true,"YuZanCastWarning":true}',
             '{"_internal":{"GenericAttack":false,"SemanticFallback":true,"YuZanCastLeadMs":900}}'):
    l, m, s = fresh(body=body)
    check(s.GenericAttack is True and all(s[key] is None for key in RETIRED),
          'upgraded generic false never restores retired boss settings '+body)
l, m, s = fresh(config='GenericAttack=0\nSemanticFallback=1\nYuZanCastWarning=1\nYuZanCastLeadMs=900\n')
check(s.GenericAttack is True and all(s[key] is None for key in RETIRED) and
      json.loads(l.globals().T.json)['_extra'][EPOCH] == 1 and
      not (set(json.loads(l.globals().T.json)['_internal']) & RETIRED),
      'legacy TXT upgrades generic false and marks while retiring all boss settings')

body = '{"LeadMs":700,"leadms":"invalid","GenericAttack":false,"genericattack":"invalid"}'
l, m, s = fresh(body=body)
l2, m2, s2 = fresh(body=l.globals().T.json)
check(s.LeadMs == s2.LeadMs == 700 and s.GenericAttack is s2.GenericAttack is True,
      'flat aliases with later invalid values preserve last valid runtime values after restart')
body = '{"LeadMs":123.45678901234567,"Precise":1.2345678901234567,"Integer":9007199254740993,"Tiny":1e-320}'
l, m, s = fresh(body=body)
payload = json.loads(l.globals().T.json)
check(payload['LeadMs'] == json.loads(body)['LeadMs'] and payload['_extra'] ==
      {EPOCH: 1, **{key: value for key, value in json.loads(body).items() if key != 'LeadMs'}},
      'migration preserves full numeric precision for known and unknown saved JSON values')

# Unknown containers are parsed as data, with root counted as depth 1. Moving
# a flat unknown beneath _extra must not silently exceed the same depth limit.
for depth, expect_valid, expect_migrated in ((7, True, True), (8, True, False), (9, False, False)):
    body = '{"LeadMs":700,"Nested":' + '['*(depth-1) + '0' + ']'*(depth-1) + '}'
    l, m, s = fresh(body=body)
    check(s.LeadMs == (700 if expect_valid else 350) and
          (l.globals().T.json != body) == expect_migrated,
          'flat unknown nesting bounded and failed reparenting retains original depth='+str(depth))
for depth in (8, 9):
    body = '{"LeadMs":700,"_extra":{"PBZForewarnGenericAttackEpoch":1,"Nested":' + '['*(depth-2) + '0' + ']'*(depth-2) + '}}'
    l, m, s = fresh(body=body)
    check(s.LeadMs == (700 if depth == 8 else 350) and l.globals().T.json == body and
          l.globals().T.settingsWrites == 0,
          'structured JSON exact depth limit counts root and extra depth='+str(depth))
invalid_scopes = ['{"_internal":null}', '{"_extra":[]}', '{"_internal":false}',
                  '{"LeadMs":{},"LeadMs":4}', '{"_internal":{"LeadMs":[]}}',
                  '{"Hooks":[],"_internal":{}}', '{"_internal":{"Hooks":{},"Hooks":false}}',
                  '{"_internal":[],"_internal":{}}', '{"_extra":{"x":1e999,"x":0}}',
                  '{"_extra":{"x":"\\ud800","x":0}}',
                  '{"_extra":{"x":[true,]}}', '{"_extra":{"x":[1 2]}}']
for body in invalid_scopes:
    l, m, s = fresh(body=body)
    check(s.LeadMs == 350 and s.Hooks is True and l.globals().T.json == body and
          l.globals().T.settingsWrites == 0 and 'CONFIG_INVALID' in logs(l),
          'invalid typed container or overwritten literal fails closed '+body)
body = '{"LeadMs":701,"_extra":{"text":""}}'
body = body.replace('""', '"' + 'x'*(65536-len(body.encode('utf8'))) + '"')
check(len(body.encode('utf8')) == 65536, 'byte-limit fixture is exactly 64 KiB')
l, m, s = fresh(body=body)
check(s.LeadMs == 701 and l.globals().T.json == body, 'exactly 64 KiB structured JSON accepted unchanged')
l, m, s = fresh(body=body+' ')
check(s.LeadMs == 350 and l.globals().T.json == body+' ' and 'CONFIG_READ_FAILED' in logs(l),
      'one byte above 64 KiB is rejected without overwrite')
body = '{"LeadMs":702,"Extra":"' + 'x'*65470 + '"}'
l, m, s = fresh(body=body)
check(s.LeadMs == 702 and l.globals().T.json == body and l.globals().T.settingsWrites == 0 and
      'MIGRATION_FAILED' in logs(l), 'flat expansion beyond 64 KiB keeps original values and bytes')

# Failure injection never overwrites the original config merely because the
# backup, temporary file or verified Windows non-replacing rename failed.
original = ' \r\n{"LeadMs":777,"Hooks":false,"GenericAttack":false,"Odd":null}\n'
backup_failures = ('backupDenied', 'backupReadThrows', 'backupReadError', 'backupReadCloseFails',
                   'backupOpenFails', 'backupWriteThrows', 'backupWriteFails', 'backupCloseFails',
                   'backupReadbackMismatch', 'backupRenameFails', 'backupFinalMismatch')
for flag in backup_failures:
    l, m, s = fresh(body=original, **{flag: True})
    t = l.globals().T
    check(t.json == original and s.LeadMs == 777 and s.Hooks is False and s.GenericAttack is True and
          t.legacyReads == 0 and t.settingsFiles[PENDING] is None and 'MIGRATION_FAILED' in logs(l),
          'flat backup failure retains canonical bytes and effective values '+flag)
for flag in ('jsonTempOpenFails', 'jsonTempWriteThrows', 'jsonTempWriteFails', 'jsonTempCloseFails',
             'jsonTempReadbackMismatch', 'settingsHoldFails', 'settingsPublishFails', 'settingsFinalMismatch'):
    l, m, s = fresh(body=original, **{flag: True})
    t = l.globals().T
    check(t.json == original and t.settingsFiles[BACKUP] == original and
          s.LeadMs == 777 and s.Hooks is False and t.settingsFiles[PENDING] is None and
          'MIGRATION_FAILED' in logs(l), 'flat replacement failure retains or rolls back canonical '+flag)
for backup in (original, 'different bytes'):
    l, m, s = fresh(body=original, files={BACKUP: backup})
    t = l.globals().T
    check(t.settingsFiles[BACKUP] == backup and t.backupWrites == 0 and
          (m.source == 'json-migrated') == (backup == original) and
          (t.json == original) == (backup != original),
          'existing backup is reused only for exact original bytes '+repr(backup))
l, m, s = fresh(body=original, backupRaceBody='concurrent backup')
check(l.globals().T.json == original and l.globals().T.settingsFiles[BACKUP] == 'concurrent backup' and
      'MIGRATION_FAILED' in logs(l), 'exclusive backup publication never replaces a racing destination')
racing = '{"LeadMs":888,"Hooks":true}'
for flag in ('settingsRaceBody', 'settingsRaceAtHold', 'settingsRaceAtPublish'):
    l, m, s = fresh(body=original, **{flag: racing})
    t = l.globals().T
    check(t.json == racing and t.settingsFiles[BACKUP] == original and s.LeadMs == 777 and
          'MIGRATION_FAILED' in logs(l) and 'CONFIG_MIGRATED' not in logs(l),
          'racing writer never overwritten or falsely confirmed '+flag)
l, m, s = fresh(body=original, files={PENDING: 'unresolved original'})
check(l.globals().T.json == original and l.globals().T.settingsFiles[PENDING] == 'unresolved original' and
      'MIGRATION_FAILED' in logs(l), 'unresolved holding file prevents a new replacement')
l, m, s = fresh(files={BACKUP: original, PENDING: original})
check(s.LeadMs == 777 and s.Hooks is False and l.globals().T.settingsFiles[BACKUP] == original and
      json.loads(l.globals().T.json)['_internal']['GenericAttack'] is True and 'CONFIG_RECOVERED' in logs(l),
      'startup restores interrupted holding snapshot then performs one verified upgrade')
for files in ({PENDING: original}, {BACKUP: 'different', PENDING: original}):
    l, m, s = fresh(config='Hooks=0', files=files)
    check(l.globals().T.json is None and l.globals().T.settingsWrites == 0 and
          l.globals().T.legacyReads == 0 and 'MIGRATION_FAILED' in logs(l),
          'inconsistent pending recovery fails closed without a replacement authority')
l, m, s = fresh(config='Hooks=0', pendingDenied=True)
check(l.globals().T.json is None and l.globals().T.settingsWrites == 0 and l.globals().T.legacyReads == 0,
      'unreadable pending snapshot cannot be bypassed by fresh defaults or stale legacy')
l, m, s = fresh(body=original, settingsPublishFails=True, settingsRestoreFails=True)
t = l.globals().T
check(t.json is None and t.settingsFiles[BACKUP] == original and t.settingsFiles[PENDING] == original and
      s.LeadMs == 777 and 'recovery required' in logs(l),
      'double rename failure retains original backup and pending bytes with explicit recovery warning')
l, m, s = fresh(files={BACKUP: t.settingsFiles[BACKUP], PENDING: t.settingsFiles[PENDING]})
check(s.LeadMs == 777 and 'CONFIG_RECOVERED' in logs(l),
      'next startup recovers original after prior rollback failure')

# The old test.1 backup namespace must never block or be overwritten by test.2.
original = '{"LeadMs":613,"_internal":{"GenericAttack":false,"Hooks":false},"_extra":{"nested":[null,{"saved":true}]}}'
for old_files in ({OLD_BACKUP: 'earlier test.1 flat bytes'},
                  {OLD_BACKUP: original, OLD_PENDING: original}):
    l, m, s = fresh(body=None if OLD_PENDING in old_files else original, files=old_files)
    t = l.globals().T
    check(s.GenericAttack is True and s.Hooks is False and s.LeadMs == 613 and
          t.settingsFiles[OLD_BACKUP] == old_files[OLD_BACKUP] and
          t.settingsFiles[BACKUP] == original and json.loads(t.json)['_extra'][EPOCH] == 1,
          'old menu backup retained and old pending recovered before distinct generic upgrade '+str(OLD_PENDING in old_files))
for files in ({BACKUP: original, PENDING: original, OLD_BACKUP: 'earlier bytes'},
              {BACKUP: original, PENDING: original, OLD_BACKUP: original, OLD_PENDING: original}):
    l, m, s = fresh(config='LeadMs=999', files=files)
    t = l.globals().T
    ambiguous = OLD_PENDING in files
    check((t.json is None) == ambiguous and t.legacyReads == 0 and
          ('ambiguous pending' in logs(l)) == ambiguous and
          (s.LeadMs == 350 if ambiguous else s.LeadMs == 613 and s.GenericAttack is True),
          'new pending uses own backup and dual pending fails closed '+str(ambiguous))

l, m, s = fresh(files={BACKUP: original, PENDING: original}, recoveryRaceBody=marked_off)
check(s.GenericAttack is False and s.LeadMs == 613 and l.globals().T.json == marked_off and
      l.globals().T.settingsWrites == 0 and l.globals().T.legacyReads == 0,
      'recovery race rereads existing marked canonical rather than falling back to defaults')

# Every transaction failure keeps the pre-marker policy active, not a completed
# disk marker. Restart after a transient failure retries the exact original.
for flag in backup_failures + ('jsonTempOpenFails', 'jsonTempWriteThrows', 'jsonTempWriteFails',
        'jsonTempCloseFails', 'jsonTempReadbackMismatch', 'settingsHoldFails',
        'settingsPublishFails', 'settingsFinalMismatch'):
    l, m, s = fresh(body=original, **{flag: True})
    t = l.globals().T
    check(t.json == original and s.GenericAttack is True and s.LeadMs == 613 and s.Hooks is False and
          'MIGRATION_FAILED' in logs(l) and 'retry next startup' in logs(l) and
          EPOCH not in json.loads(t.json)['_extra'],
          'structured migration failure retains original bytes and other effective values '+flag)
    l2, m2, s2 = fresh(body=t.json)
    check(s2.GenericAttack is True and json.loads(l2.globals().T.json)['_extra'][EPOCH] == 1,
          'structured failed migration retries next startup '+flag)

for marker in (None, False, True, '1', 0, 2, {}, []):
    body = json.dumps({'LeadMs': 614, '_internal': {'GenericAttack': False, 'Diagnostics': False},
                       '_extra': {EPOCH: marker, 'opaque': [None, {'saved': 7}]}})
    l, m, s = fresh(body=body)
    t = l.globals().T
    check(s.GenericAttack is True and s.Diagnostics is False and s.LeadMs == 614 and
          json.loads(t.json)['_extra'] == {EPOCH: 1, 'opaque': [None, {'saved': 7}]} and
          t.settingsFiles[BACKUP] == body,
          'only exact numeric epoch one completes upgrade '+repr(marker))
    t.json = body
    writes = t.settingsWrites
    check(m.refresh().GenericAttack is True and t.settingsWrites == writes and t.json == body,
          'read-only pre-marker refresh enforces effective true '+repr(marker))

body = '{"LeadMs":123.45678901234567,"leadms":"invalid","_internal":{"GenericAttack":0,"genericattack":"false","Hooks":false,"FontPath":"/raw"},"_extra":{"Integer":9007199254740993,"Tiny":1e-320},"RootUnknown":{"bad":[false,null]}}'
l, m, s = fresh(body=body)
t = l.globals().T
payload = json.loads(t.json)
check(s.GenericAttack is True and payload['_internal']['GenericAttack'] is True and
      payload['_internal']['genericattack'] is True and s.LeadMs == 123.45678901234567 and
      payload['leadms'] == 'invalid' and payload['RootUnknown'] == {'bad': [False, None]} and
      payload['_internal']['FontPath'] == '/raw' and '9007199254740993' in t.json and '1e-320' in t.json,
      'structured migration preserves aliases raw invalid values precision font and misplaced unknown data')
check(fresh(body=t.json)[2].GenericAttack is True,
      'upgraded generic aliases cannot restore stale false on restart')

# Refresh is read-only, atomic, and excludes reserved and unknown controls.
l,m,s=fresh(body='{"_internal":{"Hooks":false,"TickMs":32,"GenericAttack":true},"_extra":{"Extra":7,"PBZForewarnGenericAttackEpoch":1}}')
t=l.globals().T
t.json='{"LeadMs":800,"_internal":{"Hooks":true,"ObservationFlushMs":1,"TickMs":99,"GenericAttack":false},"_extra":{"Extra":8,"PBZForewarnGenericAttackEpoch":1}}'
s=m.refresh()
check(s.Hooks is True and s.LeadMs==800 and s.ObservationFlushMs==5000, 'refresh applies hidden live flags and clamped numbers')
check(s.TickMs==32 and s.GenericAttack is False and s.Extra is None, 'refresh preserves reserved controls and never executes extras')
check(t.settingsWrites==0 and t.legacyReads==0, 'refresh never rewrites canonical JSON or reads legacy TXT')
for body in (None, '', '{"Hooks":false,}', '{"Hooks":false,"_internal":{"LeadMs":{}}}'):
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

# A provider-like patch of only the eight public fields retains hidden data;
# manual hidden changes still apply to the fourteen live controls, not reserved.
reserved = {'TickMs', 'DiscoverMs', 'ScanMs', 'LateGraceMs', 'MaxGlyphMs', 'FontPath'}
initial = {key: flat_values[key] for key in PUBLIC}
initial['_internal'] = {key: flat_values[key] for key in INTERNAL}
initial['_extra'] = {EPOCH: 1, 'opaque': {'Hooks': [], 'data': [None, {'saved': True}]}}
l, m, s = fresh(body=json.dumps(initial))
t = l.globals().T
public_patch = {'LeadMs': 421, 'RangeCm': 4200, 'OnlyLockedTarget': False,
                'SoundOn': True, 'SoundVolume': 1.1, 'GlyphOn': True,
                'GlyphFontSize': 155, 'GlyphY': 0.25}
saved = {**initial, **public_patch}
t.json = json.dumps(saved, ensure_ascii=False)
s = m.refresh()
check(all(s[key] == value for key, value in public_patch.items()),
      'public-only Menu-like patch applies exactly the eight public values')
check(all(s[key] == flat_values[key] for key in INTERNAL-reserved) and
      json.loads(t.json)['_internal'] == initial['_internal'] and
      json.loads(t.json)['_extra'] == initial['_extra'] and t.settingsWrites == 0,
      'public-only save preserves hidden runtime values and nested disk extras without module writes')
internal_patch = {'Hooks': True, 'Diagnostics': True, 'ObserveAttacks': True,
                  'BlackOn': True, 'GenericAttack': True, 'ObservationFlushMs': 15000,
                  'TickMs': 88, 'DiscoverMs': 123, 'ScanMs': 888, 'LateGraceMs': 200,
                  'MaxGlyphMs': 2500, 'FontPath': '/still-not-live'}
saved['_internal'] = {**internal_patch, 'LeadMs': 999, 'SoundOn': False}
saved.update({'Hooks': False, 'BlackOn': False, 'GenericAttack': False})
t.json = json.dumps(saved)
s = m.refresh()
check(all(s[key] == value for key, value in internal_patch.items() if key not in reserved) and
      all(s[key] == value for key, value in public_patch.items()),
      'all fourteen former live keys apply while top hidden and internal public cannot override')
check(all(s[key] == initial['_internal'][key] for key in reserved-{'FontPath'}) and
      s.FontPath != internal_patch['FontPath'] and t.settingsWrites == 0 and t.legacyReads == 0,
      'all six reserved settings remain startup snapshots during read-only refresh')
previous = {key: s[key] for key in PUBLIC | INTERNAL}
t.json = '{"LeadMs":1,"_internal":{"Hooks":{}}}'
check(m.refresh()[0] is None and all(m.load(DIRECTORY)[key] == value for key, value in previous.items()),
      'typed structured refresh failure retains the complete previous twenty-setting snapshot')

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
output = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / 'settings-results.json'
output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False,indent=2))
