"""Assemble reviewed publication artifacts without modifying the tested runtime."""
from pathlib import Path
import argparse,hashlib,json,zipfile

ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description='Build Forewarn 0.5 player/source archives.')
parser.add_argument('--output-dir',type=Path,default=ROOT/'dist',
    help='output directory (default: dist beside package.py)')
DEST=parser.parse_args().output_dir.expanduser().resolve()
DIST='0.5'; VERSION='0.5.0-release.2'
DOCS=ROOT/'player-docs'
report=json.loads((ROOT/'verification/summary.json').read_text(encoding='utf8'))
assert report['version']==VERSION and report['checks']==349 and all(x['exit']==0 for x in report['suites'])
frozen=json.loads((ROOT/'evidence/release2-tested-runtime-hashes.json').read_text())
files={}
for p in sorted((ROOT/'js-package/PBZForewarn').glob('*.js')):
    if p.name.endswith('.test.js') or p.name=='native-audio.js':continue
    files['ProjectPBZ/PBZModLoader/mods/PBZForewarn/'+p.name]=p.read_bytes()
files['ProjectPBZ/Content/PBZForewarn/PBZForewarn.bnk']=(ROOT/'audio-bank/generated/PBZForewarn.bnk').read_bytes()
for name in ['main.lua','timeline-hooks.lua']:
    files['platform/steam/ue4ss/Mods/PBZForewarnHooks/Scripts/'+name]=(ROOT/'hooks-package'/name).read_bytes()
files['platform/steam/ue4ss/Mods/PBZForewarnHooks/enabled.txt']=b''
assert {k:hashlib.sha256(v).hexdigest() for k,v in files.items()}==frozen,'Runtime differs from the four-boss-tested package'
DEST.mkdir(parents=True,exist_ok=True)
public_names=['README.txt','README_EN.txt','CHANGELOG.txt','CREDITS.md','VALIDATION.md']
for name in public_names:
    body=(DOCS/name).read_text(encoding='utf8')
    # UTF8 BOM and CRLF keep plain text readable in Windows editors.
    data=('\ufeff'+body.replace('\r\n','\n').replace('\n','\r\n')).encode('utf8') if name.endswith('.txt') else body.encode('utf8')
    files[name]=data;(DEST/name).write_bytes(data)
config='''# PBZForewarn 0.5; example only, not automatically installed.
LeadMs=350
RangeCm=3500
BlackOn=1
OnlyLockedTarget=0
SoundOn=1
SoundVolume=0.8
GlyphOn=1
GlyphFontSize=120
GlyphY=0.32
Diagnostics=1
Hooks=1
'''.encode('utf8')
files['PBZForewarn.example.txt']=config;(DEST/'PBZForewarn.example.txt').write_bytes(config)
manifest='\n'.join(hashlib.sha256(b).hexdigest()+'  '+n for n,b in sorted(files.items()))+'\n'
files['SHA256SUMS.txt']=manifest.encode('utf8')
player=DEST/'PBZForewarn-0.5.zip'
with zipfile.ZipFile(player,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for n,b in sorted(files.items()):z.writestr(n,b)
source=DEST/'PBZForewarn-0.5-Source.zip'
with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for folder in ['js-package','hooks-package','audio-bank','evidence','player-docs','tests']:
        for p in sorted((ROOT/folder).rglob('*')):
            rel=p.relative_to(ROOT)
            if not p.is_file() or any(x in rel.parts for x in ['__pycache__','lib','collector-fixtures']):continue
            if folder=='evidence' and rel.as_posix()!='evidence/release2-tested-runtime-hashes.json':continue
            if rel.as_posix() in ['js-package/PBZForewarn/cue.wav','audio-bank/generated/PBZForewarn.bnk']:continue
            if rel.as_posix() in ['audio-bank/generated/offline-validation.json','audio-bank/generated/parser.txt',
                'hooks-package/tests/results.json']:continue
            if p.name=='test_collector.ps1' or p.suffix.lower() in ['.exe','.dll','.pyd','.pyc']:continue
            if folder=='js-package' and p.name in ['native-audio.js','native-audio.test.js']:continue
            if folder=='audio-bank' and p.suffix=='.wem':continue  # regenerated from source WAV
            if p.name in ['entry-results.json','launcher-results.json']:continue
            z.write(p,rel.as_posix())
    for name in ['verify.py','Run-Checks.ps1','requirements-test.txt']:
        z.write(ROOT/name,name)
    z.write(Path(__file__).resolve(),'package.py')
    for name in ['.gitignore','.gitattributes']:
        if (ROOT/name).is_file():z.write(ROOT/name,name)
    z.write(ROOT/'DEVELOPMENT.md','DEVELOPMENT.md')
    for name in public_names+['PBZForewarn.example.txt']:
        if name in ['README.txt','README_EN.txt']:
            z.write(ROOT/name,name)
        else:z.writestr(name,files[name])
    for name in ['summary.json']+[x['name']+'.txt' for x in report['suites']]:
        z.write(ROOT/'verification'/name,'verification/'+name)
for p in [player,source]:
    with zipfile.ZipFile(p) as z:assert z.testzip() is None
with zipfile.ZipFile(player) as z:
    names=z.namelist();assert len(names)==len(set(names))
    assert set(names)==set(files)
    assert all(not n.lower().endswith(('.cmd','.bat','.ps1','.exe','.dll','.vbs','.wav','.test.js')) for n in names)
    assert not any('Support/' in n or 'Collect-Diagnostics' in n for n in names)
    assert not any('AppData' in n or 'loader.log' in n or 'UE4SS.log' in n for n in names)
    for line in z.read('SHA256SUMS.txt').decode('utf8').splitlines():
        digest,name=line.split('  ',1);assert hashlib.sha256(z.read(name)).hexdigest()==digest
    runtime={k:hashlib.sha256(z.read(k)).hexdigest() for k in frozen}
    assert runtime==frozen
with zipfile.ZipFile(source) as z:
    names=z.namelist();assert not any('Collect-Diagnostics' in n or 'collector-fixtures' in n for n in names)
    assert not any(n.lower().endswith(('.wav','.bnk','.wem')) for n in names)
    assert 'package.py' in names and 'player-docs/README.txt' in names and 'player-docs/README_EN.txt' in names
    compile(z.read('package.py').decode('utf-8-sig'),'package.py','exec')
    compile(z.read('verify.py').decode('utf-8-sig'),'verify.py','exec')
validation={'distribution':DIST,'runtimeVersion':VERSION,'runtimeFiles':len(frozen),
 'playerFiles':len(files),'offlineChecks':report['checks'],'testedRuntimeByteIdentical':True,
 'playerArchiveIntegrity':True,'sourceArchiveIntegrity':True,'internalChecksumsVerified':True,
 'playerShellHelpers':0,'bundledLoaders':False,'personalLogsIncluded':False,
 'knownInGameTest':'clean first install with retained loaders and other mods; four bosses, 59 automatic cues',
 'thirdPartyAttributionIncluded':True,'thirdPartyPermissionClaimed':False,'published':False,'realGameModified':False}
(DEST/'PACKAGE_CHECK.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2),encoding='utf8')
# Remove only the two superseded archive names after the replacement archives
# have passed integrity and tested-runtime checks. No installed game is touched.
for old_name in ['PBZForewarn_0.5byfix7_release.zip','PBZForewarn_0.5byfix7_release_Source.zip']:
    old_archive=DEST/old_name
    if old_archive.exists():old_archive.unlink()
outer=[]
for p in sorted(DEST.rglob('*')):
    if not p.is_file() or p==DEST/'SHA256SUMS.txt':continue
    outer.append(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(DEST).as_posix())
(DEST/'SHA256SUMS.txt').write_text('\n'.join(outer)+'\n',encoding='utf8')
print(json.dumps({'output':str(DEST),**validation},ensure_ascii=False,indent=2))
