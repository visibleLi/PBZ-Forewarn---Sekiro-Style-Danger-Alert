from pathlib import Path
import array
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import wave
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
from build_state import VERSION, test_cases, SOURCE_ROOT_FILES, source_paths, validated_inputs


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='forewarn-build-')
        self.root = Path(self.temporary.name) / 'source'
        self.root.mkdir()
        ignored = shutil.ignore_patterns('lib', '__pycache__', 'generated', 'cue.wav', '*results.json')
        for folder in ('src', 'tools', 'tests', 'docs', 'evidence'):
            shutil.copytree(ROOT / folder, self.root / folder, ignore=ignored)
        for name in SOURCE_ROOT_FILES:
            (self.root / name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, self.root / name)
        self.write_audio()

    def tearDown(self):
        self.temporary.cleanup()

    def write_audio(self, rate=44100, channels=2, amplitude=256):
        samples = array.array('h')
        for frame in range(rate // 4):
            samples.extend([round(amplitude * math.sin(2 * math.pi * 440 * frame / rate))] * channels)
        with wave.open(str(self.root / 'src/js/PBZForewarn/cue.wav'), 'wb') as audio:
            audio.setparams((channels, 2, rate, 0, 'NONE', 'not compressed'))
            audio.writeframes(samples.tobytes())

    def run_script(self, name, *arguments):
        return subprocess.run([sys.executable, str(self.root / name), *arguments], cwd=self.root,
                              capture_output=True, text=True, encoding='utf8', errors='replace')

    def build(self):
        result = self.run_script('tools/audio-bank/build_bank.py')
        self.assertEqual(result.returncode, 0, result.stderr)

    def record_mock_validation(self):
        folder = self.root / 'verification'
        folder.mkdir(exist_ok=True)
        report = {'version': VERSION, 'javascriptSyntax': 'passed',
                  'distributionName': 'PBZForewarn-' + VERSION,
                  'suites': [{'name': name, 'checks': 1, 'exit': 0} for name, _ in test_cases(self.root)],
                  'validatedInputs': validated_inputs(self.root)}
        report['checks'] = len(report['suites'])
        (folder / 'summary.json').write_text(json.dumps(report), encoding='utf8')

    def test_custom_audio_generates_matching_duration_without_sha_lock(self):
        self.build()
        generated = self.root / 'tools/audio-bank/generated'
        manifest = json.loads((generated / 'manifest.json').read_text(encoding='utf8'))
        self.assertEqual(manifest['pcm']['durationSeconds'], 0.25)
        self.assertEqual(manifest['trimStartFrames'], 0)
        self.assertFalse(manifest['baselineAudio'])
        self.assertIn('durationSeconds: 0.25', (generated / 'wwise-bank-config.js').read_text(encoding='utf8'))

    def test_custom_bank_passes_structural_pcm_checks(self):
        self.build()
        result = self.run_script('tools/audio-bank/test_bank.py')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_wrong_sample_rate_fails_with_format_message(self):
        self.write_audio(rate=48000)
        result = self.run_script('tools/audio-bank/build_bank.py')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('44100 Hz stereo 16-bit PCM', result.stderr)

    def test_loud_audio_fails_before_creating_bank(self):
        self.write_audio(amplitude=30000)
        result = self.run_script('tools/audio-bank/build_bank.py')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('clip', result.stderr)
        self.assertFalse((self.root / 'tools/audio-bank/generated/PBZForewarn.bnk').exists())

    def test_explicit_trim_never_removes_audible_samples(self):
        result = self.run_script('tools/audio-bank/build_bank.py', '--trim-start-ms', '80')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('refuse trimming audible', result.stderr)

    def test_default_produces_only_installer_and_external_report(self):
        self.build()
        self.record_mock_validation()
        result = self.run_script('tools/package.py')
        self.assertEqual(result.returncode, 0, result.stderr)
        destination = self.root / 'dist'
        self.assertEqual({path.name for path in destination.iterdir()},
                         {f'PBZForewarn-{VERSION}.zip', 'PACKAGE_CHECK.json'})
        with zipfile.ZipFile(destination / f'PBZForewarn-{VERSION}.zip') as archive:
            self.assertEqual({name.split('/')[0] for name in archive.namelist()},
                             {'ProjectPBZ', 'platform', 'README.txt'})
            self.assertEqual(len(archive.namelist()), 24)
            self.assertIn('中文', archive.read('README.txt').decode('utf-8-sig'))
            self.assertIn('English', archive.read('README.txt').decode('utf-8-sig'))
            self.assertIn(b'durationSeconds: 0.25', archive.read(
                'ProjectPBZ/PBZModLoader/mods/PBZForewarn/wwise-bank-config.js'))
        self.assertFalse(json.loads((destination / 'PACKAGE_CHECK.json').read_text(encoding='utf8'))['matchesOriginalRuntime'])

    def test_source_archive_requires_explicit_flag_and_excludes_audio(self):
        self.build()
        self.record_mock_validation()
        result = self.run_script('tools/package.py', '--source')
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.root / f'dist/PBZForewarn-{VERSION}-Source.zip') as archive:
            self.assertIn('tools/build_state.py', archive.namelist())
            self.assertIn('tests/build/test_build.py', archive.namelist())
            self.assertFalse(any(name.lower().endswith(('.wav', '.bnk', '.wem')) for name in archive.namelist()))
            self.assertFalse(any('/generated/' in name for name in archive.namelist()))
            self.assertIn('docs/PBZForewarn.example.txt', archive.namelist())
            self.assertIn('src/js/tests/fixtures/trial1-generic-attack-evidence.json', archive.namelist())
            self.assertEqual(set(archive.namelist()),
                             {path.relative_to(self.root).as_posix() for path in source_paths(self.root)})
            self.assertFalse(any(name.lower().endswith(('.exe', '.dll', '.pyd', '.log'))
                                 for name in archive.namelist()))

    def test_source_archive_builds_audio_free_fixture_without_repository_generated_files(self):
        self.build()
        self.record_mock_validation()
        result = self.run_script('tools/package.py', '--source')
        self.assertEqual(result.returncode, 0, result.stderr)
        with tempfile.TemporaryDirectory(prefix='forewarn-source-') as extracted:
            with zipfile.ZipFile(self.root / f'dist/PBZForewarn-{VERSION}-Source.zip') as archive:
                archive.extractall(extracted)
            source_root = Path(extracted)
            self.assertEqual({path.relative_to(source_root).as_posix() for path in source_paths(source_root)},
                             {path.relative_to(self.root).as_posix() for path in source_paths(self.root)})
            self.assertTrue(all(path.is_file() for path in source_paths(source_root)))
            self.write_source_fixture_audio(source_root)
            build = subprocess.run([sys.executable, str(source_root / 'tools/audio-bank/build_bank.py')],
                                   cwd=source_root, capture_output=True, text=True,
                                   encoding='utf8', errors='replace')
            self.assertEqual(build.returncode, 0, build.stderr)
            bank = subprocess.run([sys.executable, str(source_root / 'tools/audio-bank/test_bank.py')],
                                  cwd=source_root, capture_output=True, text=True,
                                  encoding='utf8', errors='replace')
            self.assertEqual(bank.returncode, 0, bank.stdout + bank.stderr)

    def test_changed_source_requires_new_validation(self):
        self.build()
        self.record_mock_validation()
        with (self.root / 'src/js/PBZForewarn/core.js').open('a', encoding='utf8') as source:
            source.write(chr(10))
        result = self.run_script('tools/package.py')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('changed after validation', result.stderr)

    def test_packaging_rejects_mismatched_js_and_lua_versions(self):
        self.build()
        self.record_mock_validation()
        main = self.root / 'src/js/PBZForewarn/main.js'
        main.write_text(main.read_text(encoding='utf8').replace(
            f'const VERSION = "{VERSION}";',
            'const VERSION = "0.6.0-trial.1";'), encoding='utf8')
        report = json.loads((self.root / 'verification/summary.json').read_text(encoding='utf8'))
        report['validatedInputs'] = validated_inputs(self.root)
        (self.root / 'verification/summary.json').write_text(json.dumps(report), encoding='utf8')
        result = self.run_script('tools/package.py')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Runtime version mismatch', result.stderr)

    def test_missing_validation_is_rejected(self):
        self.build()
        result = self.run_script('tools/package.py')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('verify.py', result.stderr)

    def test_optional_baseline_check_rejects_custom_bank(self):
        self.build()
        self.record_mock_validation()
        result = self.run_script('tools/package.py', '--check-baseline')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('differ from the original 0.5 baseline', result.stderr)

    def test_packaging_preserves_unrelated_old_outputs(self):
        self.build()
        self.record_mock_validation()
        (self.root / 'dist').mkdir()
        previous = self.root / 'dist/old-source.zip'
        previous.write_bytes(b'previous artifact')
        result = self.run_script('tools/package.py')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(previous.read_bytes(), b'previous artifact')

    def test_incomplete_failed_or_inconsistent_validation_is_rejected(self):
        self.build()
        report_path = self.root / 'verification/summary.json'
        for case in ('missing-suite', 'duplicate-suite', 'failed-suite', 'bad-total',
                     'negative-count', 'bad-version', 'bad-distribution', 'bad-syntax'):
            with self.subTest(case=case):
                self.record_mock_validation()
                report = json.loads(report_path.read_text(encoding='utf8'))
                if case == 'missing-suite':
                    report['suites'].pop()
                    report['checks'] -= 1
                elif case == 'duplicate-suite':
                    report['suites'][-1] = report['suites'][0]
                elif case == 'failed-suite':
                    report['suites'][0]['exit'] = 1
                elif case == 'bad-total':
                    report['checks'] += 1
                elif case == 'negative-count':
                    report['suites'][0]['checks'] = -1
                    report['checks'] -= 2
                elif case == 'bad-version':
                    report['version'] = '0.5.0-release.2'
                elif case == 'bad-distribution':
                    report['distributionName'] = 'wrong-package'
                else:
                    report['javascriptSyntax'] = 'failed'
                report_path.write_text(json.dumps(report), encoding='utf8')
                result = self.run_script('tools/package.py')
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('verify.py again', result.stderr)
                self.assertFalse((self.root / 'dist').exists())

    def test_source_document_change_requires_validation_but_test_outputs_do_not(self):
        self.build()
        self.record_mock_validation()
        before = validated_inputs(self.root)
        (self.root / 'src/lua/tests/results.json').write_text('{"changed":true}', encoding='utf8')
        self.assertEqual(validated_inputs(self.root), before)
        with (self.root / 'src/lua/README-hooks.md').open('a', encoding='utf8') as document:
            document.write('\nChanged after checks.\n')
        result = self.run_script('tools/package.py', '--source')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('changed after validation', result.stderr)

    def test_archives_are_identical_after_rebuild_and_file_timestamp_changes(self):
        self.build()
        self.record_mock_validation()
        first = self.run_script('tools/package.py', '--source')
        self.assertEqual(first.returncode, 0, first.stderr)
        archives = sorted((self.root / 'dist').glob('*.zip'))
        before = {path.name: path.read_bytes() for path in archives}
        for path in source_paths(self.root):
            os.utime(path, (1000000000, 1000000000))
        second = self.run_script('tools/package.py', '--source')
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual({path.name: path.read_bytes() for path in archives}, before)
        for path in archives:
            with zipfile.ZipFile(path) as archive:
                self.assertTrue(all(info.create_system == 3 and info.external_attr == 0o100644 << 16
                                    and info.date_time == (2026, 11, 13, 0, 0, 0)
                                    for info in archive.infolist()))

    def write_source_fixture_audio(self, root):
        samples = array.array('h')
        for frame in range(44100 // 4):
            samples.extend([round(256 * math.sin(2 * math.pi * 440 * frame / 44100))] * 2)
        with wave.open(str(root / 'src/js/PBZForewarn/cue.wav'), 'wb') as audio:
            audio.setparams((2, 2, 44100, 0, 'NONE', 'not compressed'))
            audio.writeframes(samples.tobytes())


class ReportingResult(unittest.TextTestResult):
    def addSuccess(self, test):
        super().addSuccess(test)
        print('PASS ' + test._testMethodName)


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(BuildTests)
    result = unittest.TextTestRunner(resultclass=ReportingResult).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
