// CODE.md 9an.7 (2.38, Part G-a, G-b, G-d): the saved online game. A save is usable for 10 minutes
// only; a joining phone refreshes its save at most once a minute; the host saves its whole game.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteJoin, isFresh, loadHost, loadJoin, saveHost, saveJoinNow, saveJoin, setHostParts, setJoinParts,
  type JoinSaved,
} from '../../src/ui/rejoin.ts';
import { AWAY_MS } from '../../src/net/relayproto.ts';

/** A tiny Storage stand-in for the tests (node has no localStorage). */
function memory(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

const join = (savedAt: number, token = 'tok-1'): JoinSaved => ({ roomId: 'r1', joinToken: token, roomName: 'Friday', profileName: 'Amy', savedAt });

test('a save is usable for less than the 10 minutes of AWAY_MS, and not after', () => {
  const t = 1_000_000;
  assert.equal(isFresh(t, t), true);
  assert.equal(isFresh(t, t + AWAY_MS - 1), true);
  assert.equal(isFresh(t, t + AWAY_MS), false);
  assert.equal(isFresh(Number.NaN, t), false);
});

test('an old join save is removed when it is read, and not returned', () => {
  const store = memory();
  saveJoin(join(1_000), store);
  assert.equal(loadJoin(store, 1_000 + AWAY_MS + 1), null);
  assert.equal(store.data.has('pubby.rejoin'), false, 'the expired key is deleted');
});

test('a fresh join save is returned intact', () => {
  const store = memory();
  saveJoin(join(5_000), store);
  assert.deepEqual(loadJoin(store, 6_000), join(5_000));
});

test('a joining phone refreshes its save at most once a minute for the same token', () => {
  const store = memory();
  setJoinParts(() => ({ roomId: 'r1', joinToken: 'tok-1', roomName: 'Friday', profileName: 'Amy' }));
  saveJoinNow(10_000, store);
  saveJoinNow(40_000, store);
  assert.equal(loadJoin(store, 40_000)?.savedAt, 10_000, 'not refreshed inside a minute');
  saveJoinNow(71_000, store);
  assert.equal(loadJoin(store, 71_000)?.savedAt, 71_000, 'refreshed after a minute');
  setJoinParts(() => null);
});

test('the host saves its whole game with the lobby and the host token, and reads it back', () => {
  const store = memory();
  const game = { session: { ended: false }, stage: 'hand' } as unknown as Parameters<typeof saveHost>[0]['game'];
  setHostParts(() => ({
    game, lobby: { seats: [] } as never, roomId: 'r1', roomName: 'Friday', roomCode: '4821', hostToken: 'host-x', profileName: 'Cat',
  }));
  // saveHostNow is reached through the registered parts; write one directly to check the round trip.
  saveHost({ game, lobby: { seats: [] } as never, roomId: 'r1', roomName: 'Friday', roomCode: '4821', hostToken: 'host-x', profileName: 'Cat', savedAt: 2_000 }, store);
  assert.equal(loadHost(store, 2_000)?.hostToken, 'host-x');
  setHostParts(() => null);
});

test('deleting removes the join save', () => {
  const store = memory();
  saveJoin(join(1_000), store);
  deleteJoin(store);
  assert.equal(loadJoin(store, 1_000), null);
});
