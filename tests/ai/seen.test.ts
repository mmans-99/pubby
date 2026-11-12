// CODE.md 9m.9 (seen.test.ts): over whole games at 2 to 8 players, a computer
// player's view holds no card but its own, and the only events that carry a
// card are cardPlayed (face up on the table).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card } from '../../src/rules/cards.ts';
import { handOf } from '../../src/session/session.ts';
import { isBlank } from '../../src/net/netgame.ts';
import type { PlayerId, Session } from '../../src/session/types.ts';
import { seenBy } from '../../src/ai/seen.ts';
import { playBotGame } from './botgame.ts';

/** Every real card id a player other than `me` holds right now, plus the hidden piles. */
function unseenIds(s: Session, me: PlayerId): Set<string> {
  const ids = new Set<string>();
  const add = (cs: readonly Card[] | undefined): void => {
    for (const c of cs ?? []) if (!isBlank(c)) ids.add(c.id);
  };
  for (const p of s.order) if (p !== me) add(handOf(s, p));
  for (const d of Object.values(s.hiddenDecks)) add(d);
  if (s.deal) {
    add(s.deal.remaining);
    for (const d of Object.values(s.deal.hiddenDecks)) add(d);
  }
  if (s.play) add(s.play.wastePile);
  return ids;
}

function realIdsIn(cs: readonly Card[]): string[] {
  return cs.filter((c) => !isBlank(c)).map((c) => c.id);
}

test('a computer player never receives a card but its own, in whole games at 2, 3, 5 and 8 players', () => {
  for (const n of [2, 3, 5, 8]) {
    let checks = 0;
    playBotGame({
      players: n,
      levels: ['normal', 'easy', 'hard'],
      rounds: 2,
      seed: 900 + n,
      onDecision: ({ session, seen }) => {
        const hidden = unseenIds(session, seen.me);
        const copy = seen.session;
        // Other hands are blank; the hidden piles are empty or blank.
        for (const p of copy.order) {
          if (p === seen.me) continue;
          assert.ok(realIdsIn(handOf(copy, p)).length === 0, `${n} players: ${p}'s hand leaked`);
        }
        assert.deepEqual(copy.hiddenDecks, {});
        if (copy.deal) {
          assert.deepEqual(copy.deal.hiddenDecks, {});
          assert.ok(realIdsIn(copy.deal.remaining).length === 0, 'deal pile leaked');
        }
        if (copy.play) assert.ok(realIdsIn(copy.play.wastePile).length === 0, 'waste pile leaked');
        // No real unseen card id appears anywhere in the copy.
        const visible = new Set<string>();
        for (const p of copy.order) for (const c of handOf(copy, p)) if (!isBlank(c)) visible.add(c.id);
        for (const id of hidden) assert.ok(!visible.has(id), `${n} players: unseen card ${id} visible`);
        // My own hand is real and matches the table.
        assert.deepEqual(
          seen.view.myHand.map((c) => c.id),
          handOf(session, seen.me).map((c) => c.id),
        );
        checks++;
      },
    });
    assert.ok(checks > 50, `${n} players: too few decisions checked (${checks})`);
  }
});

test('the only public events that carry a card are cardPlayed', () => {
  for (const n of [2, 3, 5, 8]) {
    const result = playBotGame({ players: n, levels: ['normal'], rounds: 2, seed: 1200 + n });
    assert.ok(result.finished, `${n} players: game did not finish`);
    for (const id of result.session.order) {
      const { events } = seenBy(result.session, id, 0);
      for (const e of events) {
        if ('card' in e) assert.equal(e.type, 'cardPlayed', `${n} players: ${e.type} carries a card`);
      }
    }
  }
});

test('a computer player sees every event since its last look, and only those', () => {
  const result = playBotGame({ players: 3, levels: ['normal'], rounds: 1, seed: 77 });
  const first = seenBy(result.session, 'p1', 0).events;
  assert.equal(first.length, result.session.log.length);
  const rest = seenBy(result.session, 'p1', 5).events;
  assert.equal(rest.length, result.session.log.length - 5);
  assert.deepEqual(rest, first.slice(5));
});
