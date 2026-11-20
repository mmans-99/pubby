/**
 * 9aq.19 B (3.0.5): at the round end each phone plays only its own sound (trombone on the loser's
 * phone, fanfare or bells for everyone else, for its own place). Reads the sound queue (sfxLog).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventSounds, sfxLog, type Sfx } from '../../src/audio/sfx.ts';
import type { SessionEvent } from '../../src/session/types.ts';

/** A round-end batch: `out` lists players in the order they went out (place 1 first). */
function roundEnd(out: string[], extra: SessionEvent[] = []): SessionEvent[] {
  const playerOuts = out.map((player, i) => ({ type: 'playerOut', player, place: i + 1 }) as unknown as SessionEvent);
  return [...extra, ...playerOuts, { type: 'roundEnded', finishingOrder: out } as unknown as SessionEvent];
}

/** Plays the events on one phone and returns the sounds it played. */
function phoneHears(events: SessionEvent[], me: string | undefined): Sfx[] {
  sfxLog.length = 0;
  eventSounds(events, false, me);
  return [...sfxLog];
}

test('2 players: the winner hears only the fanfare, the loser only the trombone', () => {
  const ev = roundEnd(['ann', 'ben']);
  assert.deepEqual(phoneHears(ev, 'ann'), ['roundWinner']);
  assert.deepEqual(phoneHears(ev, 'ben'), ['lastPlace']);
});

test('4 players: the 2nd place phone hears only the bells, the last phone only the trombone, 1st only the fanfare', () => {
  const ev = roundEnd(['ann', 'ben', 'cat', 'dan']);
  assert.deepEqual(phoneHears(ev, 'ann'), ['roundWinner']);
  assert.deepEqual(phoneHears(ev, 'ben'), ['gotAway']);
  assert.deepEqual(phoneHears(ev, 'cat'), ['gotAway']);
  assert.deepEqual(phoneHears(ev, 'dan'), ['lastPlace']);
});

test('a slap ending: each phone still plays one sound, the loser the trombone', () => {
  const slap = [{ type: 'slapped', by: 'ann', of: 'dan', picked: 2 } as unknown as SessionEvent];
  const ev = roundEnd(['ann', 'ben', 'dan'], slap);
  assert.deepEqual(phoneHears(ev, 'dan'), ['lastPlace']);
  assert.deepEqual(phoneHears(ev, 'ben'), ['gotAway']);
});

test('a forfeit ending: the forfeiting player (last place) hears the trombone, the other the fanfare', () => {
  const ev = roundEnd(['ann', 'ben']);
  assert.deepEqual(phoneHears(ev, 'ben'), ['lastPlace']);
  assert.deepEqual(phoneHears(ev, 'ann'), ['roundWinner']);
});

test('no seat known (no me): the old rule still plays for everyone', () => {
  const ev = roundEnd(['ann', 'ben']);
  assert.deepEqual(phoneHears(ev, undefined), ['roundWinner', 'lastPlace']);
});

test('a player who went out before the round end is still heard by everyone (not a round-end batch)', () => {
  const ev: SessionEvent[] = [{ type: 'playerOut', player: 'ann', place: 1 } as unknown as SessionEvent];
  assert.deepEqual(phoneHears(ev, 'ben'), ['roundWinner']);
});
