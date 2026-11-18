"""Read the live PBZForewarn logs after a game session and judge the dev.5 claims.

    python tools/analyze-run.py                  # uses %LOCALAPPDATA%\\ProjectPBZ\\Saved
    python tools/analyze-run.py --saved <dir>
    python tools/analyze-run.py --json

This reads files the mod already wrote. It never touches the game, the saves or the
installed mod, and it works while the game is still running.

Every check is stated as a claim with a verdict, so a run either supports the claim or
does not. "UNVERIFIED" means the session did not exercise the claim, which is not the
same as a failure: a run with no combat cannot show whether cue lead recovered.

The test.2 figures below are the frozen comparison point, measured on the user's own
0.6.1-test.2 session `mwhygcbb-hczgj5hb`. They are one session, not a distribution.
"""
from pathlib import Path
import argparse
import collections
import json
import os
import shutil
import statistics
import sys

# The expected build is the checkout's VERSION, not a frozen dev.5 string: the
# claims below are compared against test.2, and a diagnostic-only bump must not
# make the analyzer reject its own build.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_state import VERSION

DEFAULT_SAVED = Path(os.environ.get('LOCALAPPDATA', '')) / 'ProjectPBZ' / 'Saved'

# The build whose behaviour dev.5 is meant to change.
BASELINE = {
    'version': '0.6.1-test.2',
    'session': 'mwhygcbb-hczgj5hb',
    'cueCount': 26,
    'medianLeadMs': 285.0,
    'minLeadMs': 10.0,
    'maxLeadMs': 348.0,
    'tickGaps': 351,
    # Fraction of consecutive tick-gap records whose timestamps sit 4.5-6.5 s apart.
    # A periodic stall tied to a periodic write shows up here.
    'tickGapPeriodicShare': 0.966,
    'maxObservationSerializeMs': 403,
}

# A tick-gap record marks one main-loop iteration that took this long. Gaps under this
# are ordinary frame pacing and are not what the dev.5 report is about.
STALL_MS = 250
# Above this the loop was not running at all: a level load, a menu, an alt-tab or a
# minimised window. No frame in a shipping game takes this long, and the mod's own
# heaviest operation is reported separately (7 ms on the run that motivated this), so
# such a gap is not evidence about the mod either way.
LOOP_STOPPED_MS = 2000
# Records closer together than this cannot be told apart from the 5 s write cadence.
CADENCE_LOW_MS = 4500
CADENCE_HIGH_MS = 6500


def load(saved, name):
    path = saved / name
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding='utf-8-sig'))


def tick_gap_cadence(gaps):
    """How often consecutive tick-gap records land on the old 5 s write period.

    Returns (share, buckets) or (None, {}) when the timestamps cannot answer the
    question. Zero or repeated stamps mean the clock was not recorded; a share of
    0.0 there would read as "no 5 s cadence", which is the opposite of evidence.
    """
    if len(gaps) < 2:
        return None, {}
    stamps = sorted(record['at'] for record in gaps)
    deltas = [b - a for a, b in zip(stamps, stamps[1:])]
    usable = [delta for delta in deltas if delta > 0]
    if len(usable) < len(deltas) / 2:
        return None, {}
    buckets = collections.Counter(delta // 1000 * 1000 for delta in usable)
    periodic = sum(1 for delta in usable if CADENCE_LOW_MS <= delta <= CADENCE_HIGH_MS)
    return periodic / len(usable), dict(sorted(buckets.items()))


def paused_spans(recent):
    """Intervals during which the mod was paused, from its own state records."""
    spans, opened = [], None
    for record in sorted((r for r in recent if r.get('kind') == 'state'), key=lambda r: r['at']):
        if record.get('paused') is True:
            opened = record['at'] if opened is None else opened
        elif opened is not None:
            spans.append((opened, record['at']))
            opened = None
    if opened is not None:
        spans.append((opened, float('inf')))
    return spans


def spans_pause(record, spans):
    """True when a tick-gap record covers time the mod was paused.

    A pause stops the loop, so the first tick after resuming reports the whole
    menu or loading screen as one gap. That is not a stall and must not be
    counted as one.
    """
    end = record['at']
    start = end - record.get('ms', 0)
    return any(start <= close and end >= open_ for open_, close in spans)


def analyse(saved):
    diagnostics = load(saved, 'pbzforewarn_diagnostics.json')
    observations = load(saved, 'pbzforewarn_observations.json')
    if diagnostics is None:
        raise SystemExit(f'no pbzforewarn_diagnostics.json in {saved}')

    recent = diagnostics.get('recent') or []
    spans = paused_spans(recent)
    gaps = [record for record in recent if record.get('kind') == 'tick-gap']
    played = [record for record in gaps if not spans_pause(record, spans)]
    cues = [record for record in recent if record.get('kind') == 'CUE']
    leads = [record['estimatedLeadGameMs'] for record in cues
             if isinstance(record.get('estimatedLeadGameMs'), (int, float))]
    skipped = [record for record in recent if record.get('kind') == 'condition-not-met']

    periodic_share, buckets = tick_gap_cadence(played)
    stats = diagnostics.get('stats') or {}
    flush = diagnostics.get('flush') or {}
    observation_flush = (observations or {}).get('flush') or {}
    settings = diagnostics.get('settings') or {}

    return {
        'version': diagnostics.get('version'),
        'session': diagnostics.get('session'),
        'settingsKeys': sorted(settings),
        'cues': len(cues),
        'leads': leads,
        'medianLeadMs': statistics.median(leads) if leads else None,
        'minLeadMs': min(leads) if leads else None,
        'maxLeadMs': max(leads) if leads else None,
        'tickGaps': len(gaps),
        'tickGapsWhilePaused': len(gaps) - len(played),
        'stalls': sorted((record['ms'] for record in played
                          if STALL_MS <= record.get('ms', 0) < LOOP_STOPPED_MS), reverse=True),
        'loopStopped': sorted((record['ms'] for record in played
                               if record.get('ms', 0) >= LOOP_STOPPED_MS), reverse=True),
        'maxTickGapMs': diagnostics.get('maxObservedTickGapMs'),
        'tickGapPeriodicShare': periodic_share,
        'tickGapBuckets': buckets,
        'observationWrites': flush.get('observationWrites'),
        'maxObservationSerializeMs': flush.get('maxObservationSerializeMs'),
        'observationFileChars': observation_flush.get('lastChars'),
        'errors': stats.get('errors'),
        'recognized': stats.get('recognized'),
        'missed': stats.get('missed'),
        'cancels': stats.get('cancels'),
        'saved': str(saved),
        'conditionsNotMet': stats.get('conditionsNotMet'),
        'skipped': [{'ability': record.get('ability'), 'reason': record.get('reason'),
                     'eligibilityReason': record.get('eligibilityReason'),
                     'lateByMs': round(record['lateBy'] * 1000)
                     if isinstance(record.get('lateBy'), (int, float)) else None,
                     'at': record.get('at')} for record in skipped],
    }


def verdicts(run):
    """Each claim from the dev.5 report, judged against this run only."""
    out = []

    def add(claim, verdict, detail):
        out.append({'claim': claim, 'verdict': verdict, 'detail': detail})

    if run['version'] != VERSION:
        add('this run is the current build', 'FAIL',
            f"log says {run['version']!r}; this checkout builds {VERSION!r}")
        return out
    add('this run is the current build', 'PASS', run['version'])

    if 'ObservationFlushMs' in run['settingsKeys']:
        add('ObservationFlushMs is active', 'PASS',
            'present in the settings snapshot the mod wrote')
    else:
        add('ObservationFlushMs is active', 'FAIL',
            'absent from the settings snapshot; this build does not write ObservationFlushMs')

    if run['tickGapPeriodicShare'] is None:
        add('the 5 s stall cadence is gone', 'UNVERIFIED', 'fewer than two tick-gap records')
    else:
        share = run['tickGapPeriodicShare']
        before = BASELINE['tickGapPeriodicShare']
        detail = (f'{share:.1%} of tick-gap records sit {CADENCE_LOW_MS / 1000:g}-'
                  f'{CADENCE_HIGH_MS / 1000:g} s apart; test.2 was {before:.1%}')
        if share <= before / 2:
            add('the 5 s stall cadence is gone', 'PASS', detail)
        elif share < before:
            add('the 5 s stall cadence is gone', 'PARTIAL', detail)
        else:
            add('the 5 s stall cadence is gone', 'FAIL', detail)

    if run['maxObservationSerializeMs'] is None:
        add('observation serialization no longer peaks near 400 ms', 'UNVERIFIED', 'no flush record')
    else:
        peak = run['maxObservationSerializeMs']
        detail = f'peak {peak} ms; test.2 was {BASELINE["maxObservationSerializeMs"]} ms'
        add('observation serialization no longer peaks near 400 ms',
            'PASS' if peak < BASELINE['maxObservationSerializeMs'] / 2 else 'FAIL', detail)

    if not run['leads']:
        add('cue lead recovered toward the 350 ms target', 'UNVERIFIED', 'no cue carried a lead estimate')
    else:
        median = run['medianLeadMs']
        detail = (f'median {median:.0f} ms over {len(run["leads"])} cues '
                  f'(min {run["minLeadMs"]:.0f}, max {run["maxLeadMs"]:.0f}); '
                  f'test.2 median was {BASELINE["medianLeadMs"]:.0f} ms')
        if median >= BASELINE['medianLeadMs']:
            add('cue lead recovered toward the 350 ms target', 'PASS', detail)
        elif median >= BASELINE['medianLeadMs'] - 50:
            add('cue lead recovered toward the 350 ms target', 'PARTIAL', detail)
        else:
            add('cue lead recovered toward the 350 ms target', 'FAIL', detail)

    if run['errors'] is None:
        add('the run logged no runtime errors', 'UNVERIFIED', 'no stats block')
    else:
        add('the run logged no runtime errors', 'PASS' if run['errors'] == 0 else 'FAIL',
            f"{run['errors']} errors")

    if run['cues'] == 0:
        add('cues still fire on ordinary attacks', 'UNVERIFIED',
            'no cue in this session; play some supported attacks')
    else:
        add('cues still fire on ordinary attacks', 'PASS', f"{run['cues']} cues")

    return out


def render(run, checks):
    lines = [f"log    {run['saved']}",
             f"build  {run['version']}  session {run['session']}",
             f"cues   {run['cues']}"
             + (f"  lead median {run['medianLeadMs']:.0f} ms"
                f" (min {run['minLeadMs']:.0f}, max {run['maxLeadMs']:.0f})" if run['leads'] else ''),
             f"gaps   {run['tickGaps']} records"
             f" ({run['tickGapsWhilePaused']} span a pause)"
             f", {len(run['stalls'])} hitch(es) of {STALL_MS}-{LOOP_STOPPED_MS} ms"
             + (f", worst {run['stalls'][0]} ms" if run['stalls'] else '')
             + (f", {len(run['loopStopped'])} loop-stopped span(s)"
                f" worst {run['loopStopped'][0]} ms" if run['loopStopped'] else ''),
             f"flush  {run['observationWrites']} observation writes,"
             f" peak serialize {run['maxObservationSerializeMs']} ms", '']
    if run['skipped']:
        counts = collections.Counter(f"{item['eligibilityReason'] or 'unknown'}"
                                     for item in run['skipped'])
        lines.append(f"skips  {len(run['skipped'])} retained condition-not-met record(s): "
                     + ', '.join(f'{reason} x{n}' for reason, n in counts.most_common()))
        for item in run['skipped'][:5]:
            lines.append(f"       {item['ability']}  late {item['lateByMs']} ms")
        lines.append('')
    if run['tickGapBuckets']:
        lines.append('tick-gap spacing (consecutive record timestamps):')
        for low, count in run['tickGapBuckets'].items():
            lines.append(f'  {low / 1000:>6.0f}-{(low + 999) / 1000:<4.0f} s  {count}')
        lines.append('')
    for check in checks:
        lines.append(f"{check['verdict']:<9} {check['claim']}")
        lines.append(f"          {check['detail']}")
    worst = 'FAIL' if any(c['verdict'] == 'FAIL' for c in checks) else \
            'UNVERIFIED' if any(c['verdict'] == 'UNVERIFIED' for c in checks) else \
            'PARTIAL' if any(c['verdict'] == 'PARTIAL' for c in checks) else 'PASS'
    lines += ['', f'verdict: {worst}']
    return '\n'.join(lines)


LOG_FILES = ('pbzforewarn_diagnostics.json', 'pbzforewarn_observations.json')


def save(snapshot_dir, saved, run, checks, report):
    """Copy the logs and the report aside.

    The mod rewrites pbzforewarn_diagnostics.json and pbzforewarn_observations.json
    under the same names every session, so starting a second run erases the first.
    Copying before that happens is the only way the evidence for a verdict survives.
    """
    session = str(run.get('session') or 'unknown')
    target = Path(snapshot_dir) / session
    target.mkdir(parents=True, exist_ok=True)
    for name in LOG_FILES:
        source = Path(saved) / name
        if source.is_file():
            shutil.copy2(source, target / name)
    (target / 'analysis.txt').write_text(report, encoding='utf8')
    (target / 'analysis.json').write_text(
        json.dumps({'run': run, 'checks': checks}, ensure_ascii=False, indent=2), encoding='utf8')
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--saved', default=str(DEFAULT_SAVED), help='folder holding the mod logs')
    parser.add_argument('--json', action='store_true', help='machine-readable output')
    parser.add_argument('--save', metavar='DIR',
                        help='copy the logs and this report into DIR/<session>/ before '
                             'a later session overwrites them')
    args = parser.parse_args()

    run = analyse(Path(args.saved))
    checks = verdicts(run)
    report = (json.dumps({'run': run, 'checks': checks}, ensure_ascii=False, indent=2)
              if args.json else render(run, checks))
    if args.save:
        target = save(args.save, args.saved, run, checks, report)
        print(f'saved {target}', file=sys.stderr)
    print(report)
    return 1 if any(check['verdict'] == 'FAIL' for check in checks) else 0


if __name__ == '__main__':
    sys.exit(main())
