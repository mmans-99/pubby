// CODE.md 9m.1 rule 4 (fairplay.test.ts): at every decision of an all-computer
// game, shuffle every card the bot cannot see (other hands, the cards still to
// deal, the hidden decks, the waste pile) with a different seed, keep every
// pile's size, and check that the bot makes the same move. A bot that used a
// hidden card would fail here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card } from '../../src/rules/cards.ts';
import { seededRng, shuffle } from '../../src/rules/rng.ts';
import type { PlayerId, Session } from '../../src/session/types.ts';
import { decide } from '../../src/ai/decide.ts';
import { seenBy } from '../../src/ai/seen.ts';
import { playBotGame } from './botgame.ts';

/**
 * The same session with every unseen card moved around (for the bot `me`).
 * Piles keep their sizes; the bot's own hand, the played cards and the log are unchanged.
 */
export function scrambled(full: Session, me: PlayerId, seed: number): Session {
  const rng = seededRng(seed);
  const handsSrc = full.play ? full.play.hands : full.deal ? full.deal.hands : full.hands;
  const hands: Record<string, readonly Card[]> = { ...handsSrc };
  const hidden: Record<string, readonly Card[]> = { ...full.hiddenDecks };
  const dealHidden: Record<string, readonly Card[]> = full.deal ? { ...full.deal.hiddenDecks } : {};
  const box: Record<string, readonly Card[]> = {
    remaining: full.deal?.remaining ?? [],
    waste: full.play?.wastePile ?? [],
  };

  const piles: [Record<string, readonly Card[]>, string][] = [];
  for (const p of full.order) if (p !== me && hands[p]) piles.push([hands, p]);
  for (const k of Object.keys(hidden)) piles.push([hidden, k]);
  for (const k of Object.keys(dealHidden)) piles.push([dealHidden, k]);
  if (full.deal) piles.push([box, 'remaining']);
  if (full.play) piles.push([box, 'waste']);

  const pool: Card[] = [];
  for (const [c, k] of piles) pool.push(...(c[k] ?? []));
  const mixed = shuffle(pool, rng);
  let at = 0;
  for (const [c, k] of piles) {
    const len = (c[k] ?? []).length;
    c[k] = mixed.slice(at, at + len);
    at += len;
  }

  return {
    ...full,
    hands: full.deal ? full.hands : hands,
    hiddenDecks: hidden,
    deal: full.deal ? { ...full.deal, remaining: box.remaining ?? [], hands, hiddenDecks: dealHidden } : null,
    play: full.play ? { ...full.play, hands, wastePile: box.waste ?? [] } : null,
  };
}

test('the bot makes the same move whatever the hidden cards are (at least 500 positions)', () => {
  let positions = 0;
  let changed = 0;
  for (const n of [2, 3, 5, 8]) {
    for (let g = 0; g < 4; g++) {
      playBotGame({
        players: n,
        levels: ['normal', 'easy', 'hard'],
        rounds: 2,
        seed: 3000 + n * 10 + g,
        onDecision: ({ seen, memory, persona, session }) => {
          const seenAfter = scrambled(session, seen.me, 4242 + positions);
          const seenFake = seenBy(seenAfter, seen.me, session.log.length - seen.events.length);
          const real = decide(seen, memory, persona, seededRng(99));
          const fake = decide(seenFake, memory, persona, seededRng(99));
          if (JSON.stringify(real) !== JSON.stringify(fake)) changed++;
          positions++;
        },
      });
    }
  }
  assert.ok(positions >= 500, `only ${positions} positions checked`);
  assert.equal(changed, 0, `${changed} of ${positions} decisions changed when hidden cards moved`);
});

test('scrambling keeps every pile the same size and the bot\'s own hand', () => {
  playBotGame({
    players: 3,
    levels: ['normal'],
    rounds: 1,
    seed: 5150,
    onDecision: ({ session, seen }) => {
      const copy = scrambled(session, seen.me, 9);
      for (const p of session.order) {
        const before = (session.play ? session.play.hands : session.hands)[p] ?? [];
        const after = (copy.play ? copy.play.hands : copy.hands)[p] ?? [];
        assert.equal(after.length, before.length);
        if (p === seen.me) assert.deepEqual(after.map((c) => c.id), before.map((c) => c.id));
      }
    },
  });
});
