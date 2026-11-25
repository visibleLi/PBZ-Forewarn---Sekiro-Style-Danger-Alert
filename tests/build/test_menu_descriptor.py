"""Validate project-owned Menu metadata against runtime settings, not third-party code."""
from pathlib import Path
import json
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]


class DescriptorTests(unittest.TestCase):
    def test_descriptor_covers_keys_and_protects_reserved_values(self):
        descriptor = json.loads((ROOT / 'src/lua/PBZForewarnHooks.modsmenu.json').read_text(encoding='utf8'))
        rows = descriptor['settings']
        keyed = {row['key']: row for row in rows if 'key' in row}
        self.assertEqual(len(keyed), sum('key' in row for row in rows))
        source = (ROOT / 'src/js/PBZForewarn/main.js').read_text(encoding='utf8')
        default_block = re.search(r'const DEFAULTS = \{(.*?)\};', source, re.S).group(1)
        names = set(re.findall(r'\b(\w+):', default_block))
        visible = {'LeadMs', 'RangeCm', 'OnlyLockedTarget', 'SoundOn', 'SoundVolume',
                   'GlyphOn', 'GlyphFontSize', 'GlyphY'}
        self.assertEqual(set(keyed), visible)
        self.assertTrue(visible <= names)
        self.assertFalse({'SemanticFallback', 'YuZanCastWarning', 'YuZanCastLeadMs'} & names)
        self.assertEqual(len(names), 20)
        self.assertEqual(sum(row['type'] == 'heading' for row in rows), 3)
        self.assertNotIn('readonly', {row['type'] for row in rows})
        for row in rows:
            self.assertTrue({'en', 'zh-Hans', 'zh-Hant'} <= row['label'].keys())
        for lang in ('en', 'zh-Hans', 'zh-Hant'):
            self.assertTrue(descriptor['description'][lang])
        self.assertIn('save', descriptor['description']['en'].lower())

    def test_every_setting_has_localized_help_with_menu_text_limits(self):
        descriptor = json.loads((ROOT / 'src/lua/PBZForewarnHooks.modsmenu.json').read_text(encoding='utf8'))
        for row in descriptor['settings']:
            for lang in ('en', 'zh-Hans', 'zh-Hant'):
                with self.subTest(key=row.get('key', 'heading'), lang=lang):
                    self.assertTrue(row['label'][lang].strip())
                    self.assertLessEqual(len(row['label'][lang].encode('utf-16-le')) // 2, 80)
                    if 'key' in row:
                        self.assertTrue(row['help'][lang].strip())
                        self.assertLessEqual(len(row['help'][lang].encode('utf-16-le')) // 2, 400)
        keyed = {row['key']: row for row in descriptor['settings'] if 'key' in row}
        for key, row in keyed.items():
            if row['type'] != 'readonly':
                self.assertIn('Menu save', row['help']['en'])
                self.assertNotIn('restart', row['help']['en'].lower())
            elif key != 'FontPath':
                self.assertIn('restart', row['help']['en'])
        self.assertEqual(len(keyed), 8)

    def test_live_runtime_keys_match_editable_menu_rows(self):
        descriptor = json.loads((ROOT / 'src/lua/PBZForewarnHooks.modsmenu.json').read_text(encoding='utf8'))
        source = (ROOT / 'src/js/PBZForewarn/main.js').read_text(encoding='utf8')
        block = re.search(r'const reservedKeys = \[(.*?)\];', source, re.S).group(1)
        reserved = set(re.findall(r'"(\w+)"', block))
        rows = [row for row in descriptor['settings'] if 'key' in row]
        self.assertEqual(reserved, {'TickMs', 'DiscoverMs', 'ScanMs', 'LateGraceMs', 'MaxGlyphMs', 'FontPath'})
        self.assertFalse(reserved & {row['key'] for row in rows})
        self.assertNotIn('const legacyKeys', source)
        self.assertEqual(sum(row['type'] != 'readonly' for row in rows), 8)
        for row in rows:
            if row['type'] == 'readonly':
                self.assertNotEqual(row['label']['zh-Hans'], row['key'])
                self.assertNotEqual(row['label']['zh-Hant'], row['key'])

    def test_numeric_rows_stay_inside_runtime_bounds(self):
        descriptor = json.loads((ROOT / 'src/lua/PBZForewarnHooks.modsmenu.json').read_text(encoding='utf8'))
        source = (ROOT / 'src/js/PBZForewarn/main.js').read_text(encoding='utf8')
        block = re.search(r'const BOUNDS = \{(.*?)\};', source, re.S).group(1)
        bounds = {key: (float(lo), float(hi)) for key, lo, hi in
                  re.findall(r'(\w+): \[([\d.]+), ([\d.]+)\]', block)}
        for row in descriptor['settings']:
            if row['type'] == 'number':
                self.assertEqual((row['min'], row['max']), bounds[row['key']])
                self.assertLessEqual(row['min'], row['default'])
                self.assertLessEqual(row['default'], row['max'])
                self.assertGreater(row['step'], 0)


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(DescriptorTests)
    result = unittest.TextTestRunner(stream=sys.stdout, verbosity=2).run(suite)
    for _ in range(result.testsRun if result.wasSuccessful() else 0):
        print('PASS Menu descriptor consistency')
    print(json.dumps({'checks': result.testsRun, 'scope': 'Project descriptor consistency; no Menu execution.'}))
    raise SystemExit(not result.wasSuccessful())
