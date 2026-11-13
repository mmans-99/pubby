// Slice D (CODE.md 9m.3): the Hard level's card search always returns a legal
// card on the bot's turn, and never more than the decision budget allows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../../src/rules/rng.ts';
import { searchCard, _rolloutCard } from '../../src/ai/search.ts';
import { playCard, startPlay } from '../../src/rules/play.ts';
import { cards } from './position.ts';
import { playBotGame } from './botgame.ts';

test('the Hard search returns a legal card on the bot\'s turn', () => {
  let searched = 0;
  for (let g = 0; g < 6; g++) {
    playBotGame({
      players: 2 + (g % 4),
      levels: ['hard'],
      rounds: 1,
      seed: 9100 + g,
      onDecision: ({ seen, memory }) => {
        if (seen.view.turn !== seen.me || seen.view.legalCardIds.length < 2) return;
        const id = searchCard(seen, memory, seededRng(searched + 1));
        assert.ok(id !== null, 'search gave no card');
        assert.ok(seen.view.legalCardIds.includes(id), `search chose an illegal card ${id}`);
        searched++;
      },
    });
  }
  assert.ok(searched >= 50, `only ${searched} searches checked`);
});

// D2.2: the imagined players' rule, on hand-made positions. Player a leads spades-9;
// it is b's turn; c is the player still to play after b.
function afterLead(b: string[], c: string[]) {
  const s0 = startPlay(['a', 'b', 'c'], { a: cards('spades-9', 'hearts-2'), b: cards(...b), c: cards(...c) }, 'a');
  return playCard(s0, 'a', 'spades-9').state;
}

test('rollout: nobody after me is void in the led suit, so play my highest of it (D2.2)', () => {
  const state = afterLead(['spades-4', 'spades-11'], ['spades-12', 'hearts-3']);
  assert.equal(_rolloutCard(state, 'b')?.id, 'spades-11');
});

test('rollout: someone after me is void, so play my highest card under the top (D2.2)', () => {
  const state = afterLead(['spades-4', 'spades-11'], ['hearts-12', 'clubs-3']);
  assert.equal(_rolloutCard(state, 'b')?.id, 'spades-4');
});

test('rollout: with no card of the led suit, slap with a card that is not a joker (D2.2)', () => {
  const state = afterLead(['clubs-5', 'hearts-3'], ['spades-12', 'clubs-3']);
  assert.equal(_rolloutCard(state, 'b')?.id, 'clubs-5');
});
