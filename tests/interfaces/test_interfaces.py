"""Developer-only interface checks over unchanged real JS and isolated mutations."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
CHECKER = ROOT / 'tools/check-interfaces.cjs'
SOURCE = ROOT / 'src/js/PBZForewarn/audio-environment.js'
NODE = os.environ.get('PBZ_NODE') or shutil.which('node')


def run(*args):
    return subprocess.run([NODE, *map(str, args)], cwd=ROOT, capture_output=True,
                          text=True, encoding='utf8', errors='replace')


class InterfaceChecks(unittest.TestCase):
    def test_real_source_passes_but_original_checks_miss_wrong_adapter_arity(self):
        valid = run(CHECKER)
        self.assertEqual(valid.returncode, 0, valid.stdout + valid.stderr)
        self.assertIn('PASS ', valid.stdout)
        source = SOURCE.read_text(encoding='utf8')
        before, after = 'adapter.path(cached)', 'adapter.path(cached, true)'
        self.assertEqual(source.count(before), 1, 'mutation anchor changed')
        with tempfile.TemporaryDirectory(prefix='forewarn-interfaces-') as folder:
            root = Path(folder)
            shutil.copytree(ROOT / 'src/js', root / 'src/js',
                            ignore=shutil.ignore_patterns('*.wav', '*.bnk', '*.wem'))
            wire = Path('src/lua/tests/observer-schema2-wire-fixture.json')
            (root / wire).parent.mkdir(parents=True)
            shutil.copyfile(ROOT / wire, root / wire)
            target = root / 'src/js/PBZForewarn/audio-environment.js'
            target.write_text(source.replace(before, after), encoding='utf8')
            scripts = list((root / 'src/js').rglob('*.js'))
            for script in scripts:
                syntax = run('--check', script)
                self.assertEqual(syntax.returncode, 0, syntax.stderr)
            tests = sorted((root / 'src/js/tests').glob('*.js'))
            original_checks = 0
            for test in tests:
                original = run(test)
                original_checks += original.stdout.count('PASS ')
                self.assertEqual(original.returncode, 0, str(test) + original.stdout + original.stderr)
                self.assertGreater(original.stdout.count('PASS '), 0, original.stdout)
                if test.name == 'audio-environment.test.js':
                    self.assertEqual(original.stdout.count('PASS '), 7, original.stdout)
            checked = run(CHECKER, '--source', target)
            self.assertNotEqual(checked.returncode, 0, checked.stdout + checked.stderr)
            self.assertIn('audio-environment.js(51,', checked.stderr)
            self.assertIn('TS2554', checked.stderr)
            self.assertIn('Expected 1 arguments, but got 2', checked.stderr)
            print(f'Original mutant comparison: {len(tests)} JS suites / {original_checks} checks; '
                  f'{len(scripts)} syntax checks; all passed.')
            print('Expected rejection: ' + checked.stderr.strip())
        self.assertEqual(SOURCE.read_text(encoding='utf8'), source, 'original source changed')

    def test_real_source_property_typo_has_location_and_member_diagnostic(self):
        source = SOURCE.read_text(encoding='utf8')
        before, after = 'adapter.path(cached)', 'adapter.paht(cached)'
        self.assertEqual(source.count(before), 1, 'mutation anchor changed')
        with tempfile.TemporaryDirectory(prefix='forewarn-interface-typo-') as folder:
            target = Path(folder) / 'audio-environment.js'
            target.write_text(source.replace(before, after), encoding='utf8')
            checked = run(CHECKER, '--source', target)
            self.assertEqual(checked.returncode, 1, checked.stdout + checked.stderr)
            self.assertIn('audio-environment.js(51,', checked.stderr)
            self.assertIn("Property 'paht' does not exist on type 'ProbeAdapter'", checked.stderr)

    def test_missing_compiler_fails_with_pinned_preparation_command(self):
        with tempfile.TemporaryDirectory(prefix='forewarn-interface-missing-') as folder:
            tools = Path(folder) / 'tools'
            declarations = tools / 'dev-types'
            declarations.mkdir(parents=True)
            shutil.copyfile(CHECKER, tools / CHECKER.name)
            shutil.copyfile(ROOT / 'tools/dev-types/package.json', declarations / 'package.json')
            checked = run(tools / CHECKER.name)
            self.assertEqual(checked.returncode, 2, checked.stdout + checked.stderr)
            self.assertIn('TypeScript 5.9.3', checked.stderr)
            self.assertIn('npm --prefix tools/dev-types ci --include=dev --ignore-scripts', checked.stderr)
            self.assertNotIn('PASS ', checked.stdout)


class ReportingResult(unittest.TextTestResult):
    def addSuccess(self, test):
        super().addSuccess(test)
        print('PASS ' + test._testMethodName)


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(InterfaceChecks)
    result = unittest.TextTestRunner(resultclass=ReportingResult).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
