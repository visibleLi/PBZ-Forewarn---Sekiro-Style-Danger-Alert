from pathlib import Path
import array
import json
import math
import shutil
import subprocess
import sys
import tempfile
import unittest
import wave
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from build_state import validated_inputs


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='forewarn-build-')
        self.root = Path(self.temporary.name) / 'source'
        self.root.mkdir()
        ignored = shutil.ignore_patterns('lib', '__pycache__', 'generated', 'cue.wav', '*results.json')
        for folder in ('js-package', 'hooks-package', 'audio-bank', 'player-docs', 'tests'):
            shutil.copytree(ROOT / folder, self.root / folder, ignore=ignored)
        for name in ('package.py', 'verify.py', 'build_state.py', 'Run-Checks.ps1', 'requirements-test.txt',
                     '.gitignore', '.gitattributes', 'README.txt', 'README_EN.txt', 'DEVELOPMENT.md',
                     'CREDITS.md', 'CHANGELOG.txt', 'PBZForewarn.example.txt', 'VALIDATION.md'):
            shutil.copy2(ROOT / name, self.root / name)
        (self.root / 'evidence').mkdir()
        shutil.copy2(ROOT / 'evidence/release2-tested-runtime-hashes.json',
                     self.root / 'evidence/release2-tested-runtime-hashes.json')
        self.write_audio()

    def tearDown(self):
        self.temporary.cleanup()

    def write_audio(self, rate=44100, channels=2, amplitude=256):
        samples = array.array('h')
        for frame in range(rate // 4):
            samples.extend([round(amplitude * math.sin(2 * math.pi * 440 * frame / rate))] * channels)
        with wave.open(str(self.root / 'js-package/PBZForewarn/cue.wav'), 'wb') as audio:
            audio.setparams((channels, 2, rate, 0, 'NONE', 'not compressed'))
            audio.writeframes(samples.tobytes())

    def run_script(self, name, *arguments):
        return subprocess.run([sys.executable, str(self.root / name), *arguments], cwd=self.root,
                              capture_output=True, text=True, encoding='utf8', errors='replace')

    def build(self):
        result = self.run_script('audio-bank/build_bank.py')
        self.assertEqual(result.returncode, 0, result.stderr)

    def record_mock_validation(self):
        folder = self.root / 'verification'
        folder.mkdir(exist_ok=True)
        report = {'version': '0.5.0-release.2', 'checks': 1,
                  'suites': [{'name': 'mock-fixture', 'checks': 1, 'exit': 0}],
                  'validatedInputs': validated_inputs(self.root)}
        (folder / 'summary.json').write_text(json.dumps(report), encoding='utf8')

    def test_custom_audio_generates_matching_duration_without_sha_lock(self):
        self.build()
        generated = self.root / 'audio-bank/generated'
        manifest = json.loads((generated / 'manifest.json').read_text(encoding='utf8'))
        self.assertEqual(manifest['pcm']['durationSeconds'], 0.25)
        self.assertEqual(manifest['trimStartFrames'], 0)
        self.assertFalse(manifest['baselineAudio'])
        self.assertIn('durationSeconds: 0.25', (generated / 'wwise-bank-config.js').read_text(encoding='utf8'))

    def test_custom_bank_passes_structural_pcm_checks(self):
        self.build()
        result = self.run_script('audio-bank/test_bank.py')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_wrong_sample_rate_fails_with_format_message(self):
        self.write_audio(rate=48000)
        result = self.run_script('audio-bank/build_bank.py')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('44100 Hz stereo 16-bit PCM', result.stderr)

    def test_loud_audio_fails_before_creating_bank(self):
        self.write_audio(amplitude=30000)
        result = self.run_script('audio-bank/build_bank.py')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('clip', result.stderr)
        self.assertFalse((self.root / 'audio-bank/generated/PBZForewarn.bnk').exists())

    def test_explicit_trim_never_removes_audible_samples(self):
        result = self.run_script('audio-bank/build_bank.py', '--trim-start-ms', '80')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('refuse trimming audible', result.stderr)

    def test_default_produces_only_installer_and_external_report(self):
        self.build()
        self.record_mock_validation()
        result = self.run_script('package.py')
        self.assertEqual(result.returncode, 0, result.stderr)
        destination = self.root / 'dist'
        self.assertEqual({path.name for path in destination.iterdir()},
                         {'PBZForewarn-custom.zip', 'PACKAGE_CHECK.json'})
        with zipfile.ZipFile(destination / 'PBZForewarn-custom.zip') as archive:
            self.assertEqual({name.split('/')[0] for name in archive.namelist()},
                             {'ProjectPBZ', 'platform', 'README.txt'})
            self.assertEqual(len(archive.namelist()), 16)
            self.assertIn('中文', archive.read('README.txt').decode('utf-8-sig'))
            self.assertIn('English', archive.read('README.txt').decode('utf-8-sig'))
            self.assertIn(b'durationSeconds: 0.25', archive.read(
                'ProjectPBZ/PBZModLoader/mods/PBZForewarn/wwise-bank-config.js'))
        self.assertFalse(json.loads((destination / 'PACKAGE_CHECK.json').read_text(encoding='utf8'))['matchesOriginalRuntime'])

    def test_source_archive_requires_explicit_flag_and_excludes_audio(self):
        self.build()
        self.record_mock_validation()
        result = self.run_script('package.py', '--source')
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.root / 'dist/PBZForewarn-0.5-Source.zip') as archive:
            self.assertIn('build_state.py', archive.namelist())
            self.assertIn('tests/test_build.py', archive.namelist())
            self.assertFalse(any(name.lower().endswith(('.wav', '.bnk', '.wem')) for name in archive.namelist()))
            self.assertFalse(any('/generated/' in name for name in archive.namelist()))

    def test_changed_source_requires_new_validation(self):
        self.build()
        self.record_mock_validation()
        with (self.root / 'js-package/PBZForewarn/core.js').open('a', encoding='utf8') as source:
            source.write(chr(10))
        result = self.run_script('package.py')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('changed after validation', result.stderr)

    def test_missing_validation_is_rejected(self):
        self.build()
        result = self.run_script('package.py')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('verify.py', result.stderr)

    def test_optional_baseline_check_rejects_custom_bank(self):
        self.build()
        self.record_mock_validation()
        result = self.run_script('package.py', '--check-baseline')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('differ from the original 0.5 baseline', result.stderr)

    def test_packaging_preserves_unrelated_old_outputs(self):
        self.build()
        self.record_mock_validation()
        (self.root / 'dist').mkdir()
        previous = self.root / 'dist/old-source.zip'
        previous.write_bytes(b'previous artifact')
        result = self.run_script('package.py')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(previous.read_bytes(), b'previous artifact')


class ReportingResult(unittest.TextTestResult):
    def addSuccess(self, test):
        super().addSuccess(test)
        print('PASS ' + test._testMethodName)


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(BuildTests)
    result = unittest.TextTestRunner(resultclass=ReportingResult).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
