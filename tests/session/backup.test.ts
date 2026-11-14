/** Stats backup and restore (CODE.md 9ad.5b, Part F, 2.34). Pure: no browser needed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, mergeBackup, normaliseProfiles, readBackup, type Profiles } from '../../src/session/backup.ts';
import { emptyProfile, type GameRecord, type ProfileStats } from '../../src/session/record.ts';

/** A profile that has played the given games (ids). */
function player(name: string, games: string[], gamesPlayed = games.length): ProfileStats {
  return { ...emptyProfile(name), games, gamesPlayed, points: gamesPlayed * 2 };
}

/** Only the fields the backup code reads. */
const game = (id: string, savedAt: string): GameRecord => ({ id, savedAt }) as unknown as GameRecord;

const NOW = Date.UTC(2026, 10, 14);

test('a backup survives a trip through JSON unchanged', () => {
  const profiles: Profiles = { Ann: player('Ann', ['g1', 'g2']) };
  const vs: Profiles = { Ann: player('Ann', ['v1']) };
  const records = [game('g2', '2026-11-13T10:00:00Z'), game('g1', '2026-11-12T10:00:00Z')];
  const backup = makeBackup(profiles, vs, records, '2.34.0', NOW);
  const back = readBackup(JSON.parse(JSON.stringify(backup)));
  assert.ok(back);
  assert.equal(back.version, '2.34.0');
  assert.deepEqual(back.profiles, profiles);
  assert.deepEqual(back.vsProfiles, vs);
  assert.deepEqual(back.records, records);
});

test('files that are not Pubby backups are refused', () => {
  const good = JSON.parse(JSON.stringify(makeBackup({}, {}, [], '2.34.0', NOW)));
  assert.equal(readBackup(null), null);
  assert.equal(readBackup('pubby'), null);
  assert.equal(readBackup({ ...good, app: 'other' }), null);
  assert.equal(readBackup({ ...good, backup: 2 }), null);
  const { profiles: _p, ...noProfiles } = good;
  assert.equal(readBackup(noProfiles), null);
  assert.equal(readBackup({ ...good, records: 'none' }), null);
  assert.equal(readBackup({ ...good, records: [{ noId: true }] }), null);
  // A number field holding text is refused.
  assert.equal(readBackup({ ...good, profiles: { Ann: { ...emptyProfile('Ann'), points: 'lots' } } }), null);
});

test('merge: a profile only in the backup is added', () => {
  const local = { profiles: { Ann: player('Ann', ['g1']) }, vsProfiles: {}, records: [game('g1', '2026-11-12T10:00:00Z')] };
  const b = readBackup(JSON.parse(JSON.stringify(makeBackup({ Bo: player('Bo', ['g2']) }, {}, [game('g2', '2026-11-13T10:00:00Z')], '2.34.0', NOW))))!;
  const m = mergeBackup(local, b);
  assert.deepEqual(m.added, ['Bo']);
  assert.ok(m.profiles['Bo']);
  assert.equal(m.records.length, 2);
});

test('merge: a smaller copy of the same profile is not used; this phone keeps its bigger one', () => {
  const local = { profiles: { Ann: player('Ann', ['g1', 'g2', 'g3']) }, vsProfiles: {}, records: [] };
  const b = readBackup(JSON.parse(JSON.stringify(makeBackup({ Ann: player('Ann', ['g1']) }, {}, [], '2.34.0', NOW))))!;
  const m = mergeBackup(local, b);
  assert.deepEqual(m.kept, ['Ann']);
  assert.deepEqual(m.replaced, []);
  assert.deepEqual(m.profiles['Ann']!.games, ['g1', 'g2', 'g3']);
});

test('merge: a bigger copy in the backup replaces this phone\'s smaller one', () => {
  const local = { profiles: { Ann: player('Ann', ['g1']) }, vsProfiles: {}, records: [] };
  const b = readBackup(JSON.parse(JSON.stringify(makeBackup({ Ann: player('Ann', ['g1', 'g2']) }, {}, [], '2.34.0', NOW))))!;
  const m = mergeBackup(local, b);
  assert.deepEqual(m.replaced, ['Ann']);
  assert.deepEqual(m.profiles['Ann']!.games, ['g1', 'g2']);
});

test('merge: games played on two phones keep the profile with more games played (this phone on a tie)', () => {
  const local = { profiles: { Ann: player('Ann', ['g1', 'g2'], 5) }, vsProfiles: {}, records: [] };
  const theirs = readBackup(JSON.parse(JSON.stringify(makeBackup({ Ann: player('Ann', ['g1', 'g3'], 3) }, {}, [], '2.34.0', NOW))))!;
  const m = mergeBackup(local, theirs);
  assert.deepEqual(m.kept, ['Ann']);
  assert.equal(m.profiles['Ann']!.gamesPlayed, 5);
  const tie = readBackup(JSON.parse(JSON.stringify(makeBackup({ Ann: player('Ann', ['g1', 'g3'], 2) }, {}, [], '2.34.0', NOW))))!;
  const local2 = { profiles: { Ann: player('Ann', ['g1', 'g2'], 2) }, vsProfiles: {}, records: [] };
  assert.deepEqual(mergeBackup(local2, tie).kept, ['Ann']);
});

test('merge: game records with the same id are not doubled, newest first', () => {
  const local = { profiles: {}, vsProfiles: {}, records: [game('g1', '2026-11-12T10:00:00Z')] };
  const b = readBackup(JSON.parse(JSON.stringify(makeBackup({}, {}, [game('g1', '2026-11-12T10:00:00Z'), game('g2', '2026-11-13T10:00:00Z')], '2.34.0', NOW))))!;
  const m = mergeBackup(local, b);
  assert.deepEqual(m.records.map((r) => r.id), ['g2', 'g1']);
});

test('merge: a name in a different case is the same profile', () => {
  const local = { profiles: { Ann: player('Ann', ['g1']) }, vsProfiles: {}, records: [] };
  const b = readBackup(JSON.parse(JSON.stringify(makeBackup({ ANN: player('ANN', ['g1', 'g2']) }, {}, [], '2.34.0', NOW))))!;
  const m = mergeBackup(local, b);
  assert.deepEqual(m.added, []);
  assert.deepEqual(m.replaced, ['Ann']);
  assert.deepEqual(Object.keys(m.profiles), ['Ann']);
});

test('old saved profiles load with the newer fields filled in; junk entries are dropped', () => {
  const old = { Ann: { profileName: 'Ann', gamesPlayed: 3, points: 7 }, junk: 'text', nothing: null };
  const p = normaliseProfiles(old);
  assert.deepEqual(Object.keys(p), ['Ann']);
  assert.equal(p['Ann']!.gamesPlayed, 3);
  assert.deepEqual(p['Ann']!.games, []);
  assert.deepEqual(p['Ann']!.slapped, {});
  assert.equal(p['Ann']!.slapsGiven, 0);
  assert.deepEqual(normaliseProfiles(null), {});
  assert.deepEqual(normaliseProfiles([1, 2]), {});
});
