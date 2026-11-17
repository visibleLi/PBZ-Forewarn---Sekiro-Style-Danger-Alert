"""Checks for tools/analyze-run.py, the post-session log reader.

These build synthetic logs shaped like the ones the mod writes, so the analysis is
tested without a game session and without the user's real logs.
"""
from pathlib import Path
import json
import statistics
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ANALYZER = ROOT / 'tools/analyze-run.py'


def cue(lead):
    return {'kind': 'CUE', 'estimatedLeadGameMs': lead, 'at': 1000}


def gap(ms, at):
    return {'kind': 'tick-gap', 'ms': ms, 'at': at}


def diagnostics(version='0.6.1-dev.5', gaps=(), cues=(), errors=0, serialize=40,
                settings=None):
    return {
        'version': version, 'session': 'synthetic',
        'settings': settings if settings is not None else {'ObservationFlushMs': 20000, 'LeadMs': 350},
        'stats': {'errors': errors, 'recognized': len(cues), 'missed': 0, 'cancels': 0},
        'flush': {'observationWrites': 10, 'maxObservationSerializeMs': serialize},
        'maxObservedTickGapMs': max((g['ms'] for g in gaps), default=0),
        'recent': list(gaps) + list(cues),
    }


class AnalyzeRunTests(unittest.TestCase):
    def analyse(self, diag, observations=None):
        folder = Path(self.temporary.name)
        (folder / 'pbzforewarn_diagnostics.json').write_text(json.dumps(diag), encoding='utf8')
        (folder / 'pbzforewarn_observations.json').write_text(
            json.dumps(observations or {'flush': {'lastChars': 1000}}), encoding='utf8')
        result = subprocess.run([sys.executable, str(ANALYZER), '--saved', str(folder), '--json'],
                                capture_output=True, text=True, encoding='utf8')
        return result, json.loads(result.stdout) if result.stdout.strip() else None

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='forewarn-analyze-')

    def tearDown(self):
        self.temporary.cleanup()

    def verdict(self, payload, claim):
        for check in payload['checks']:
            if check['claim'] == claim:
                return check['verdict']
        raise AssertionError(f'no check named {claim!r}')

    def test_clean_dev5_session_passes_every_claim(self):
        gaps = [gap(120, 1_000 + i * 20_000) for i in range(6)]
        cues = [cue(lead) for lead in (340, 345, 350, 335)]
        result, payload = self.analyse(diagnostics(gaps=gaps, cues=cues))
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(payload['run']['version'], '0.6.1-dev.5')
        self.assertEqual({c['verdict'] for c in payload['checks']}, {'PASS'})

    def test_a_test2_log_is_rejected_before_anything_else(self):
        gaps = [gap(120, 1_000 + i * 5_000) for i in range(6)]
        result, payload = self.analyse(diagnostics(version='0.6.1-test.2', gaps=gaps, cues=[cue(285)]))
        self.assertEqual(result.returncode, 1)
        self.assertEqual(len(payload['checks']), 1)
        self.assertEqual(payload['checks'][0]['verdict'], 'FAIL')
        self.assertIn('test.2', payload['checks'][0]['detail'])

    def test_a_5s_cadence_fails_the_stall_claim(self):
        gaps = [gap(300, 1_000 + i * 5_000) for i in range(10)]
        result, payload = self.analyse(diagnostics(gaps=gaps, cues=[cue(340)]))
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.verdict(payload, 'the 5 s stall cadence is gone'), 'FAIL')

    def test_a_20s_cadence_passes_the_stall_claim(self):
        gaps = [gap(300, 1_000 + i * 20_000) for i in range(10)]
        _, payload = self.analyse(diagnostics(gaps=gaps, cues=[cue(340)]))
        self.assertEqual(self.verdict(payload, 'the 5 s stall cadence is gone'), 'PASS')

    def test_missing_timestamps_are_unverified_not_passed(self):
        # Zero stamps would otherwise score as "0% periodic", which reads as success.
        gaps = [gap(300, 0) for _ in range(10)]
        _, payload = self.analyse(diagnostics(gaps=gaps, cues=[cue(340)]))
        self.assertEqual(self.verdict(payload, 'the 5 s stall cadence is gone'), 'UNVERIFIED')

    def test_too_few_gap_records_are_unverified(self):
        _, payload = self.analyse(diagnostics(gaps=[gap(300, 1000)], cues=[cue(340)]))
        self.assertEqual(self.verdict(payload, 'the 5 s stall cadence is gone'), 'UNVERIFIED')

    def test_a_400ms_serialize_peak_fails_the_stall_claim(self):
        gaps = [gap(120, 1_000 + i * 20_000) for i in range(6)]
        result, payload = self.analyse(diagnostics(gaps=gaps, cues=[cue(340)], serialize=403))
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.verdict(
            payload, 'observation serialization no longer peaks near 400 ms'), 'FAIL')

    def test_a_session_without_combat_is_unverified_not_passed(self):
        gaps = [gap(120, 1_000 + i * 20_000) for i in range(6)]
        result, payload = self.analyse(diagnostics(gaps=gaps, cues=[]))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(self.verdict(payload, 'cues still fire on ordinary attacks'), 'UNVERIFIED')
        self.assertEqual(self.verdict(
            payload, 'cue lead recovered toward the 350 ms target'), 'UNVERIFIED')

    def test_lead_regression_fails_the_lead_claim(self):
        gaps = [gap(120, 1_000 + i * 20_000) for i in range(6)]
        cues = [cue(lead) for lead in (100, 120, 150, 200)]
        result, payload = self.analyse(diagnostics(gaps=gaps, cues=cues))
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.verdict(
            payload, 'cue lead recovered toward the 350 ms target'), 'FAIL')

    def test_runtime_errors_fail_the_error_claim(self):
        gaps = [gap(120, 1_000 + i * 20_000) for i in range(6)]
        result, payload = self.analyse(diagnostics(gaps=gaps, cues=[cue(340)], errors=3))
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.verdict(payload, 'the run logged no runtime errors'), 'FAIL')

    def test_a_dev5_log_without_the_setting_is_not_a_dev5_runtime(self):
        gaps = [gap(120, 1_000 + i * 20_000) for i in range(6)]
        result, payload = self.analyse(diagnostics(gaps=gaps, cues=[cue(340)], settings={'LeadMs': 350}))
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.verdict(payload, 'ObservationFlushMs is active'), 'FAIL')

    def test_the_median_lead_is_reported_from_the_cues(self):
        gaps = [gap(120, 1_000 + i * 20_000) for i in range(6)]
        cues = [cue(lead) for lead in (10, 200, 300, 350)]
        _, payload = self.analyse(diagnostics(gaps=gaps, cues=cues))
        self.assertEqual(payload['run']['medianLeadMs'], statistics.median([10, 200, 300, 350]))

    def test_a_missing_diagnostics_file_is_a_clear_error(self):
        folder = Path(self.temporary.name)
        result = subprocess.run([sys.executable, str(ANALYZER), '--saved', str(folder)],
                                capture_output=True, text=True, encoding='utf8')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('pbzforewarn_diagnostics.json', result.stderr)



class ReportingResult(unittest.TextTestResult):
    def addSuccess(self, test):
        super().addSuccess(test)
        print('PASS ' + test._testMethodName)


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(AnalyzeRunTests)
    result = unittest.TextTestRunner(resultclass=ReportingResult).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
