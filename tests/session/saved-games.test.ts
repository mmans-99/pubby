import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { addGameToProfiles, buildGameRecord, emptyProfile } from '../../src/session/record.ts';
import { deleteRecord, loadProfiles, loadRecords, saveProfiles, saveRecord } from '../../src/ui/storage.ts';
import { endGame, playRound, start } from './helpers.ts';

/** A stand-in for the phone's local storage. */
function fakeStorage(): void {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

function finished(seed: number) {
  const rng = seededRng(seed);
  const s = playRound(start(3, rng), rng);
  return endGame(s, rng);
}

test('saved games: newest first, never saved twice, can be deleted', () => {
  fakeStorage();
  assert.deepEqual(loadRecords(), []);
  const a = buildGameRecord(finished(301), new Date('2026-11-07T10:00:00Z'), 'A');
  const b = buildGameRecord(finished(302), new Date('2026-11-07T11:00:00Z'), 'B');
  assert.ok(saveRecord(a));
  assert.ok(saveRecord(b));
  assert.ok(saveRecord(b));
  assert.deepEqual(loadRecords().map((r) => r.id), ['B', 'A']);
  assert.ok(deleteRecord('A'));
  assert.deepEqual(loadRecords().map((r) => r.id), ['B']);
});

test('saved games: profile history survives a reload of the page', () => {
  fakeStorage();
  const rec = buildGameRecord(finished(303), new Date(0), 'G');
  const before = { 'Player 1': emptyProfile('Player 1'), 'Player 2': emptyProfile('Player 2') };
  const after = addGameToProfiles(before, rec, Object.keys(before));
  assert.ok(saveProfiles(after));
  const loaded = loadProfiles();
  assert.equal(loaded['Player 1']!.gamesPlayed, 1);
  assert.deepEqual(loaded['Player 2']!.games, ['G']);
  assert.equal(loaded['Player 3'], undefined, 'a profile not on this phone is not created');
});

test('saved games: storage that is full or blocked does not crash', () => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('full'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  assert.deepEqual(loadRecords(), []);
  assert.equal(saveRecord(buildGameRecord(finished(304), new Date(0), 'X')), false);
});
