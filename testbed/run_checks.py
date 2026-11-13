"""Run only the browser checks that match what changed (CODE.md 9q.1).

Usage:
  python3 testbed/run_checks.py                  checks for files changed since the last commit (HEAD)
  python3 testbed/run_checks.py --since origin/main   checks for files changed since a git ref
  python3 testbed/run_checks.py --all            every browser check
  python3 testbed/run_checks.py --dry-run        print the list (and why), run nothing

Each picked script runs in its own process, output in /tmp/checks/<name>.log.
Exit code 1 if any script fails.

Path to script table (the first row that matches a path wins; a path can pick several scripts):

  path                                                    scripts
  ------------------------------------------------------  -------------------------------------
  node_modules/, dist/, tests/, package.json, testbed/run_checks.py,
  *.md outside src/ (CODE.md, DEVLOG.md, ...)             none (unit tests cover tests/)
  src/rules/, src/session/, build.mjs, testbed/bot.js     all
  src/ai/, src/ui/bots.ts, src/content/catch-phrases.md   solo_check, drawer_check
  src/net/, src/ui/netlobby.ts, netplay.ts, netscreens.ts  lobby_check, netgame_check, netvotes_check
  src/audio/                                              sound_check
  src/ui/back.ts                                          back_check
  src/pwa/, any file named *offline* or sw.* / sw.ts      offline_check
  other src/ui/ files                                     solo_check, playthrough, drawer_check,
                                                          back_check
  testbed/<name>.py                                       that script (solo_check also runs drawer_check)
  anything else                                           all

"all" = every script in ALL_ORDER below.
"""
import argparse
import pathlib
import re
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOG_DIR = pathlib.Path('/tmp/checks')

# Order used for runs, and the full list for "all".
ALL_ORDER = [
    'solo_check.py',
    'playthrough.py',
    'drawer_check.py',
    'back_check.py',
    'offline_check.py',
    'netvotes_check.py',
    'netgame_check.py',
    'lobby_check.py',
    'sound_check.py',
]
ALL = set(ALL_ORDER)
PASS_LINE = re.compile(r'checks? (passed|pass)\b')


def scripts_for(path):
    """Return (set of scripts, reason) for one changed path."""
    name = pathlib.PurePosixPath(path).name
    stem = name.split('.')[0]
    if path.startswith(('node_modules/', 'dist/', 'tests/')) or path in ('package.json', 'testbed/run_checks.py'):
        return set(), 'no browser check'
    if path.endswith('.md') and not path.startswith('src/'):
        return set(), 'docs only'
    if path.startswith(('src/rules/', 'src/session/')) or path in ('build.mjs', 'testbed/bot.js'):
        return set(ALL), 'rules, session or shared test code'
    if path.startswith('src/ai/') or path in ('src/ui/bots.ts', 'src/content/catch-phrases.md'):
        return {'solo_check.py', 'drawer_check.py'}, 'computer players'
    if path.startswith('src/net/') or path in ('src/ui/netlobby.ts', 'src/ui/netplay.ts', 'src/ui/netscreens.ts'):
        return {'lobby_check.py', 'netgame_check.py', 'netvotes_check.py'}, 'network'
    if path.startswith('src/audio/'):
        return {'sound_check.py'}, 'sound'
    if path == 'src/ui/back.ts':
        return {'back_check.py'}, 'back button'
    if path.startswith('src/') and (path.startswith('src/pwa/') or 'offline' in name or stem == 'sw'):
        return {'offline_check.py'}, 'offline / service worker'
    if path.startswith('src/ui/'):
        return {'solo_check.py', 'playthrough.py', 'drawer_check.py', 'back_check.py'}, 'other screens'
    if path.startswith('testbed/') and path.endswith('.py'):
        if name == 'solo_check.py':
            return {'solo_check.py', 'drawer_check.py'}, 'solo check (drawer imports it)'
        if name in ALL:
            return {name}, 'that check'
        return set(), 'helper script'
    return set(ALL), 'anything else'


def git(*args):
    out = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f'git {" ".join(args)} failed: {out.stderr.strip()}')
    return [line for line in out.stdout.splitlines() if line.strip()]


def changed_files(since):
    if since:
        files = git('diff', '--name-only', since)
    else:
        files = git('diff', '--name-only', 'HEAD')
    files += git('ls-files', '--others', '--exclude-standard')
    return sorted({f for f in files if not f.startswith('node_modules/')})


def pick(files):
    picked = {}
    for f in files:
        scripts, reason = scripts_for(f)
        for s in scripts:
            picked.setdefault(s, set()).add(reason)
    return picked


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--all', action='store_true', help='run every browser check')
    ap.add_argument('--dry-run', action='store_true', help='print the list, run nothing')
    ap.add_argument('--since', metavar='REF', help='use files changed since a git ref (e.g. origin/main)')
    args = ap.parse_args()

    if args.all:
        picked = {s: {'--all'} for s in ALL}
        files = []
    else:
        files = changed_files(args.since)
        picked = pick(files)
        print(f'{len(files)} changed file(s):')
        for f in files:
            print(f'  {f}  ->  {", ".join(sorted(scripts_for(f)[0])) or "none"}')

    scripts = [s for s in ALL_ORDER if s in picked]
    if not scripts:
        print('No browser checks needed for these changes')
        return 0

    print('\nChecks to run:')
    for s in scripts:
        print(f'  {s}  ({"; ".join(sorted(picked[s]))})')
    if args.dry_run:
        return 0

    build = subprocess.run(['npm', 'run', 'build'], cwd=ROOT)
    if build.returncode != 0:
        print('npm run build failed; no checks run')
        return 1

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    results = []
    t_all = time.time()
    for s in scripts:
        t0 = time.time()
        log_path = LOG_DIR / (s.replace('.py', '') + '.log')
        print(f'\nRunning {s} ...', flush=True)
        with open(log_path, 'w') as log:
            try:
                proc = subprocess.run([sys.executable, str(ROOT / 'testbed' / s)], cwd=ROOT,
                                      stdout=log, stderr=subprocess.STDOUT, timeout=1800)
                code = proc.returncode
            except subprocess.TimeoutExpired:
                code = -1
                log.write('\nTIMED OUT after 1800 s\n')
        secs = time.time() - t0
        last = ''
        for line in log_path.read_text(errors='replace').splitlines():
            if PASS_LINE.search(line):
                last = line.strip()
        results.append((s, code == 0, secs, last))
        status = 'PASS' if code == 0 else 'FAIL'
        print(f'  {status}  {s}  {secs:.0f} s  {last}', flush=True)

    total = time.time() - t_all
    print('\nSummary:')
    for s, ok, secs, last in results:
        print(f'  {"PASS" if ok else "FAIL"}  {s:<18} {secs:6.0f} s  {last}')
    print(f'Total: {total:.0f} s ({total / 60:.1f} min). Logs in {LOG_DIR}')
    return 0 if all(ok for _, ok, _, _ in results) else 1


if __name__ == '__main__':
    sys.exit(main())
