"""Offline structure + source PCM validation; not a Wwise playback test."""
from pathlib import Path
import struct, json, hashlib, wave, math, array

ROOT = Path(__file__).resolve().parent
bank = (ROOT/'generated/PBZForewarn.bnk').read_bytes()
manifest = json.loads((ROOT/'generated/manifest.json').read_text())
ids = manifest['ids']
checks = 0
def check(name, condition):
    global checks
    assert condition, name
    checks += 1
    print('PASS '+name)
def u32(b, p=0): return struct.unpack_from('<I', b, p)[0]
def chunks(b, start=0):
    p=start; out={}
    while p<len(b):
        assert p+8<=len(b)
        tag=b[p:p+4]; size=u32(b,p+4)
        assert tag not in out and p+8+size<=len(b)
        out[tag]=(p+8,b[p+8:p+8+size]);p+=8+size
    assert p==len(b)
    return out
parts=chunks(bank)
check('only self-contained BKHD DIDX DATA HIRC chunks',set(parts)=={b'BKHD',b'DIDX',b'DATA',b'HIRC'})
header=parts[b'BKHD'][1]
check('compatible version bank type project language and bank ID',struct.unpack_from('<6I',header)==(154,ids['bank'],393239870,16,13320,30))
check('four independently named object/media identifiers',len(set(ids[k] for k in ['event','action','sound','media']))==4 and ids['bank']==ids['event'])
index=parts[b'DIDX'][1]
mid,offset,size=struct.unpack('<III',index)
check('single embedded media with aligned exact byte range',mid==ids['media'] and (parts[b'DATA'][0]+offset)%16==0 and offset+size==len(parts[b'DATA'][1]))
wem=parts[b'DATA'][1][offset:offset+size]
check('RIFF extent accounts for full media',wem[:4]==b'RIFF' and u32(wem,4)+8==len(wem) and wem[8:12]==b'WAVE')
media=chunks(wem,12)
fmt=struct.unpack('<HHIIHHHHI',media[b'fmt '][1])
check('packed extensible PCM stereo matches original sample rate',fmt==(65534,2,44100,176400,4,16,6,0,0x3102))
with wave.open(str(ROOT.parent/'js-package/PBZForewarn/cue.wav')) as f: original=f.readframes(f.getnframes())
trim_frames=3528; trim_bytes=trim_frames*4
playable=original[trim_bytes:]
check('only exact leading 80ms is removed without resampling or pitch/speed change',
      manifest['trimStartMs']==80 and manifest['trimStartFrames']==trim_frames and len(playable)//4==199332)
check('removed prefix is near-silent below minus 60dBFS',max(abs(x) for x in array.array('h',original[:trim_bytes]))<=32)
check('embedded PCM is byte-identical to original cue.wav suffix after trim',media[b'data'][1]==playable)
check('media content hash and playable duration are exact',media[b'hash'][1]==hashlib.md5(playable).digest() and len(playable)/176400==4.52 and manifest['pcm']['durationSeconds']==4.52)
check('original WAV backup and source PCM hash are preserved',
      manifest['sourceFrames']==202860 and manifest['sourcePcmSha256']==hashlib.sha256(original).hexdigest() and
      manifest['sourceWavSha256']==hashlib.sha256((ROOT.parent/'js-package/PBZForewarn/cue.wav').read_bytes()).hexdigest()=='5ad6af4e012662d527e93c3044651c278536bac5498853eead4513f77928b7e8')
hier=parts[b'HIRC'][1]; n=u32(hier); p=4; objects={}
for _ in range(n):
    kind=hier[p]; length=u32(hier,p+1); data=hier[p+5:p+5+length]
    assert len(data)==length
    assert kind not in objects
    objects[kind]=data;p+=5+length
check('complete three-object event action sound graph',n==3 and p==len(hier) and set(objects)=={2,3,4})
check('event references only own Play action',objects[4]==struct.pack('<IBI',ids['event'],1,ids['action']))
action=objects[3]
check('Play action references own sound and bank only',struct.unpack_from('<IHI',action)==(ids['action'],0x403,ids['sound']) and action[10:14]==bytes([0,0,0,4]) and struct.unpack_from('<II',action,14)==(ids['bank'],30))
sound=objects[2]
check('Sound uses embedded PCM source and exact media extent',u32(sound)==ids['sound'] and u32(sound,4)==0x10001 and sound[8]==0 and u32(sound,9)==ids['media'] and u32(sound,17)==len(wem))
check('Sound references only existing output bus and no actor mixer parent',u32(sound,26)==2463295413 and u32(sound,30)==0)
flags=sound[34]
count=sound[35]; prop_ids=list(sound[36:36+count])
values=struct.unpack_from('<'+'f'*count,sound,36+count)
props=dict(zip(prop_ids,values))
check('local sound gain remains plus six dB without changing playable PCM',props.get(0)==6.0 and manifest['authoredGainDb']==6.0)
check('voice priority is 100 and overrides parent without distance priority',props.get(6)==100.0 and flags & 3==1 and manifest['voicePriority']==100.0)
position=36+count+4*count
check('no randomized gain and 2D direct speaker positioning',sound[position:position+2]==bytes([0,1]))
peak=max(abs(x) for x in array.array('h',playable))/32768
check('authored gain at default volume retains source headroom',peak*10**(props[0]/20)*0.8<1 and abs(manifest['pcmPeakDbfs']-20*math.log10(peak))<1e-9)
check('manifest hashes identify the validated artifact',manifest['bankSha256']==hashlib.sha256(bank).hexdigest() and manifest['pcm']['sha256']==hashlib.sha256(playable).hexdigest())
print(f'RESULT {checks} offline bank checks passed; no game or audio device used.')
