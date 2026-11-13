// CODE.md 9v.2, 9v.3 and 9v.7 (version 2.27): when the game is waiting only on
// computer players, and the fast-forward factor on computer thinking times.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botsOnlyNow, fastForwardMs, FAST_FORWARD_FACTOR, personsOut, type BotsOnlyInput } from '../../src/ai/fastforward.ts';
import { thinkMs } from '../../src/ai/persona.ts';
import { seededRng } from '../../src/rules/rng.ts';
import type { Session } from '../../src/session/types.ts';

const isBot = (id: string) => id.startsWith('bot');

/** A case where the rule is true, then each case changes one thing. */
const OK: BotsOnlyInput = {
  actor: 'bot1',
  isComputer: isBot,
  waitingForPerson: false,
  personOut: true,
  paused: false,
  ended: false,
};

test('botsOnlyNow: true when a computer player is to act and the person is out', () => {
  assert.equal(botsOnlyNow(OK), true);
});

test('botsOnlyNow: true between moves (no actor) when the person is out', () => {
  assert.equal(botsOnlyNow({ ...OK, actor: null }), true);
});

test('botsOnlyNow: false when the actor is a person', () => {
  assert.equal(botsOnlyNow({ ...OK, actor: 'you' }), false);
});

test('botsOnlyNow: false while the person is still in the round', () => {
  assert.equal(botsOnlyNow({ ...OK, personOut: false }), false);
});

test('botsOnlyNow: false while a pop-up, vote, tap or take request waits for a person', () => {
  assert.equal(botsOnlyNow({ ...OK, waitingForPerson: true }), false);
});

test('botsOnlyNow: false when paused', () => {
  assert.equal(botsOnlyNow({ ...OK, paused: true }), false);
});

test('botsOnlyNow: false when the game has ended', () => {
  assert.equal(botsOnlyNow({ ...OK, ended: true }), false);
});

test('fastForwardMs: a quarter of the normal time when on, unchanged when off', () => {
  assert.equal(FAST_FORWARD_FACTOR, 0.25);
  assert.equal(fastForwardMs(2000, true), 500);
  assert.equal(fastForwardMs(2000, false), 2000);
});

test('thinkMs with fast forward is a quarter of the normal time for the same random draw', () => {
  const normal = thinkMs('hard', 'normal', seededRng(42));
  const fast = fastForwardMs(thinkMs('hard', 'normal', seededRng(42)), true);
  assert.equal(fast, Math.round(normal * 0.25));
});

/** A minimal session: one person (you) and two computer players. */
function sessionWith(finished: string[], playing = true): Session {
  return {
    players: [
      { id: 'you', computer: false },
      { id: 'bot1', computer: true },
      { id: 'bot2', computer: true },
    ],
    play: playing ? { finished } : null,
  } as unknown as Session;
}

test('personsOut: false while the person still holds cards', () => {
  assert.equal(personsOut(sessionWith([])), false);
  assert.equal(personsOut(sessionWith(['bot1', 'bot2'])), false);
});

test('personsOut: true once the person is in the rules engine finished list', () => {
  assert.equal(personsOut(sessionWith(['you'])), true);
  assert.equal(personsOut(sessionWith(['bot1', 'you', 'bot2'])), true);
});

test('personsOut: false when there is no play state', () => {
  assert.equal(personsOut(sessionWith([], false)), false);
});
