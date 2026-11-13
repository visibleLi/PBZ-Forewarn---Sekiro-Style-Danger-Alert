"""Build an independent Wwise v154 event bank from Forewarn's original PCM.

All HIRC objects are constructed field by field; no Gold bytes or audio are
copied. Version/layout and existing bus identifier were inspected as format
evidence. This does not prove PBZ will load the generated bank.
"""
from pathlib import Path
import argparse, hashlib, json, struct, wave, math, array, re

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / 'js-package/PBZForewarn/cue.wav'
OUT = ROOT / 'generated'
OUT.mkdir(exist_ok=True)
parser = argparse.ArgumentParser(description='Build a bank from a local 44100 Hz stereo 16-bit PCM WAV.')
parser.add_argument('--trim-start-ms', type=int, default=None,
                    help='leading silence to remove; default is zero except for the original 0.5 sound')
args = parser.parse_args()

def u8(n): return struct.pack('<B', n)
def u16(n): return struct.pack('<H', n)
def u32(n): return struct.pack('<I', n)
def chunk(tag, data): return tag.encode('ascii') + u32(len(data)) + data
def hirc(kind, data): return u8(kind) + u32(len(data)) + data
def fnv(name):
    value = 2166136261
    for b in name.lower().encode('ascii'):
        value = ((value * 16777619) ^ b) & 0xffffffff
    return value

names = {
    'event': 'PBZForewarn_Warning_0504',
    'action': 'PBZForewarn_Warning_Play_0504',
    'sound': 'PBZForewarn_Warning_PCM_0504',
    'media': 'PBZForewarn_Warning_Media_0504',
}
ids = {k: fnv(v) for k, v in names.items()}
ids['bank'] = ids['event']  # Wwise event-based bank convention.
assert len(set(ids[k] for k in names)) == len(names)
# Existing PBZ VFX sound container explicitly routes to this bus. We reference
# it without defining/replacing it. No inherited emitter attenuation or FX.
BUS = 2463295413
PROJECT = 13320
BANK_TYPE = 30  # Event bank, matches game's generated banks.
GAIN_DB = 6.0
VOICE_PRIORITY = 100.0
if not SOURCE.is_file():
    raise SystemExit('Provide js-package/PBZForewarn/cue.wav before building the bank.')
source_sha256 = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
baseline_audio = source_sha256 == '5ad6af4e012662d527e93c3044651c278536bac5498853eead4513f77928b7e8'
TRIM_START_MS = args.trim_start_ms if args.trim_start_ms is not None else (80 if baseline_audio else 0)
if TRIM_START_MS < 0:
    raise SystemExit('--trim-start-ms must not be negative.')

with wave.open(str(SOURCE), 'rb') as f:
    channels, sample_width, sample_rate, source_frame_count, codec, _ = f.getparams()
    if channels != 2 or sample_width != 2 or sample_rate != 44100 or codec != 'NONE':
        raise SystemExit('cue.wav must be uncompressed 44100 Hz stereo 16-bit PCM WAV.')
    source_pcm = f.readframes(source_frame_count)
if not 0 < source_frame_count <= sample_rate * 30:
    raise SystemExit('cue.wav must contain more than zero and at most 30 seconds of audio.')
assert len(source_pcm) == source_frame_count * channels * sample_width
# Remove the confirmed near-silent prefix only. The WAV is retained untouched;
# every playable sample is the exact original suffix, with no resampling,
# pitch/speed change, normalization, fade or additional PCM gain.
trim_start_frames = sample_rate * TRIM_START_MS // 1000
if trim_start_frames >= source_frame_count:
    raise SystemExit('Requested trim removes all audio.')
trim_start_bytes = trim_start_frames * channels * sample_width
removed_pcm = source_pcm[:trim_start_bytes]
assert max((abs(x) for x in array.array('h', removed_pcm)), default=0) <= 32, 'refuse trimming audible source samples'
pcm = source_pcm[trim_start_bytes:]
frame_count = source_frame_count - trim_start_frames
assert len(pcm) == frame_count * channels * sample_width
peak = max(abs(sample) for sample in array.array('h', pcm)) / 32768
if peak == 0:
    raise SystemExit('cue.wav contains no audible samples after trimming.')
if peak * 10 ** (GAIN_DB / 20) * 0.8 >= 1:
    raise SystemExit('Audio would clip at the default volume with the bank gain; lower the source level.')
pcm_hash = hashlib.md5(pcm).digest()
cache_id = int.from_bytes(pcm_hash[:4], 'little')
# Wwise packed extensible PCM header: cbSize 6, samples/block 0, channel config
# 0x3102 (2 channels, standard speaker layout, FL|FR mask 3).
fmt = struct.pack('<HHIIHHHHI', 0xfffe, channels, sample_rate,
    sample_rate*channels*sample_width, channels*sample_width, 16, 6, 0, 0x3102)
wem_body = b'WAVE' + chunk('fmt ', fmt) + chunk('hash', pcm_hash) + chunk('junk', bytes(12)) + chunk('data', pcm)
wem = chunk('RIFF', wem_body)
assert wem.index(b'data') + 8 == 96

source_data = u32(0x00010001) + u8(0) + u32(ids['media']) + u32(cache_id) + u32(len(wem)) + u8(0)
# NodeBaseParams: FX override/no FX; metadata override/no entries; existing bus
# and no actor-mixer parent; explicit local gain and voice priority;
# independent non-spatial stereo positioning; no aux/reflection routing; normal
# voice defaults; no states/RTPCs. Wwise v154 uses AkPropID_150: Volume=0,
# Priority=6. Gain belongs only to this sound; PCM and shared buses stay intact.
node = bytes([1,0,1,0]) + u32(BUS) + u32(0) + u8(1)  # override priority, no distance factor
node += u8(2) + bytes([0,6]) + struct.pack('<ff', GAIN_DB, VOICE_PRIORITY)
node += bytes([0,1])  # ranged cProps, 2D positioning override
node += u8(0x14) + u32(0)  # override user aux + reflections, no sends
node += bytes([0x10,0]) + u16(0) + bytes([0,0])  # advanced voice behavior
node += bytes([0,0]) + u16(0)  # state counts + RTPC count
sound = hirc(2, u32(ids['sound']) + source_data + node)
action = hirc(3, u32(ids['action']) + u16(0x0403) + u32(ids['sound']) + bytes([0,0,0,4]) + u32(ids['bank']) + u32(BANK_TYPE))
event = hirc(4, u32(ids['event']) + u8(1) + u32(ids['action']))
hierarchy = chunk('HIRC', u32(3) + sound + action + event)
header_data = u32(154) + u32(ids['bank']) + u32(fnv('SFX')) + u32(16) + u32(PROJECT) + u32(BANK_TYPE)
header_data += hashlib.md5(hierarchy + wem).digest()
bank = chunk('BKHD', header_data)
# Account for the 20-byte DIDX and 8-byte DATA header, and align embedded media.
padding = (-len(bank)-20-8) % 16
bank += chunk('DIDX', u32(ids['media']) + u32(padding) + u32(len(wem)))
bank += chunk('DATA', bytes(padding) + wem) + hierarchy
bank_name = 'PBZForewarn.bnk'
(OUT/bank_name).write_bytes(bank)
(OUT/(str(ids['media'])+'.wem')).write_bytes(wem)  # inspection only; embedded in bank
config_template = (ROOT.parent / 'js-package/PBZForewarn/wwise-bank-config.js').read_bytes().decode('utf8')
config_text, replacements = re.subn(r'durationSeconds:\s*[0-9.]+',
    'durationSeconds: ' + str(frame_count / sample_rate), config_template)
assert replacements == 1, 'runtime bank configuration must contain one durationSeconds field'
(OUT/'wwise-bank-config.js').write_bytes(config_text.encode('utf8'))
manifest = dict(schema=1, names=names, ids=ids, bankFile=bank_name, bankVersion=154,
    bankType=BANK_TYPE, projectId=PROJECT, existingOutputBusId=BUS,
    authoredGainDb=GAIN_DB, voicePriority=VOICE_PRIORITY, priorityOverridesParent=True,
    trimStartMs=TRIM_START_MS, trimStartFrames=trim_start_frames,
    sourceFrames=source_frame_count, sourcePcmSha256=hashlib.sha256(source_pcm).hexdigest(),
    pcmPeakDbfs=20*math.log10(max(abs(x) for x in array.array('h', pcm))/32768),
    pcm=dict(channels=channels,sampleRate=sample_rate,frames=frame_count,durationSeconds=frame_count/sample_rate,
        sha256=hashlib.sha256(pcm).hexdigest()),
    sourceWavSha256=source_sha256, baselineAudio=baseline_audio,
    runtimeConfigSha256=hashlib.sha256(config_text.encode('utf8')).hexdigest(),
    bankSha256=hashlib.sha256(bank).hexdigest(),bankBytes=len(bank),wemBytes=len(wem),
    hircObjects=3, externalMediaFilesRequired=False, originalAssetsOverwritten=False,
    runtimeValidation='not-yet-tested-in-PBZ')
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
print(json.dumps(manifest,indent=2))
