import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankCards, eventFor, isBlank, logFor, phoneActions, readGameUpdate, redactSession } from '../../src/net/netgame.ts';
import { readToHost, readToJoiner } from '../../src/net/lobby.ts';
import { seededRng } from '../../src/rules/rng.ts';
import { handOf } from '../../src/session/session.ts';
import { playerView } from '../../src/session/view.ts';
import type { Card } from '../../src/rules/cards.ts';
import type { Session } from '../../src/session/types.ts';
import { act, dealAll, start, step } from '../session/helpers.ts';

/** Every real card id a session copy holds (hands, deck, waste pile, hidden decks). */
function realCards(s: Session): Set<string> {
  const ids = new Set<string>();
  const add = (cards: readonly Card[] | undefined): void => { for (const c of cards ?? []) if (!isBlank(c)) ids.add(c.id); };
  for (const p of s.order) add(s.hands[p]);
  for (const d of Object.values(s.hiddenDecks)) add(d);
  if (s.deal) {
    add(s.deal.remaining);
    for (const h of Object.values(s.deal.hands)) add(h);
    for (const d of Object.values(s.deal.hiddenDecks)) add(d);
  }
  if (s.play) {
    for (const h of Object.values(s.play.hands)) add(h);
    add(s.play.wastePile);
  }
  return ids;
}

test('blank cards are recognisable and never look like real cards', () => {
  const b = blankCards(3, 'p2');
  assert.equal(b.length, 3);
  assert.ok(b.every(isBlank));
  assert.equal(new Set(b.map((c) => c.id)).size, 3);
});

test('a phone copy holds only its own cards, at every point of a game (2, 3, 5 and 8 players)', () => {
  for (const n of [2, 3, 5, 8]) {
    const rng = seededRng(100 + n);
    let s = start(n, rng);
    for (let i = 0; i < 400 && s.phase !== 'results'; i++) {
      for (const me of s.order) {
        const r = redactSession(s, me);
        const mine = new Set(handOf(s, me).map((c) => c.id));
        const real = realCards(r);
        // Only cards in this player's hand (and none elsewhere).
        for (const id of real) assert.ok(mine.has(id), `${n} players, ${s.phase}: ${me} got ${id}`);
        // Counts are kept, so the table looks the same.
        for (const p of s.order) assert.equal(handOf(r, p).length, handOf(s, p).length);
        if (s.deal) assert.equal(r.deal!.remaining.length, s.deal.remaining.length);
        if (s.play) assert.equal(r.play!.wastePile.length, s.play.wastePile.length);
        assert.deepEqual(r.hiddenDecks, {});
        // The phone's own view matches the host's view of that player.
        const a = playerView(s, me);
        const b = playerView(r, me);
        assert.deepEqual(b.myHand, a.myHand);
        assert.deepEqual(b.legalCardIds, a.legalCardIds);
        assert.deepEqual(b.players, a.players);
        assert.equal(b.turn, a.turn);
        assert.equal(r.log.length, 0);
      }
      s = step(s, rng);
    }
  }
});

test('take-cards requests and their events reach only the two players in them', () => {
  const rng = seededRng(7);
  let s = dealAll(start(4, rng), rng);
  s = act(s, { type: 'startRound', by: s.hostId }, rng);
  while (s.phase !== 'playing') s = step(s, rng);
  s = act(s, { type: 'requestTake', by: 'p2', target: 'p3' }, rng);
  assert.equal(redactSession(s, 'p2').takeRequests.length, 1);
  assert.equal(redactSession(s, 'p3').takeRequests.length, 1);
  assert.equal(redactSession(s, 'p1').takeRequests.length, 0);
  assert.equal(redactSession(s, 'p4').takeRequests.length, 0);
  const asked = s.log.filter((x) => x.event.type === 'takeRequested');
  assert.equal(asked.length, 1);
  assert.equal(logFor(s.log, 'p2').filter((x) => x.event.type === 'takeRequested').length, 1);
  assert.equal(logFor(s.log, 'p1').filter((x) => x.event.type === 'takeRequested').length, 0);
  assert.equal(eventFor({ type: 'takeRequested', requester: 'p2', target: 'p3' }, 'p4'), false);
  assert.equal(eventFor({ type: 'slapped', slapper: 'p1', slapped: 'p2', cardsPickedUp: 3 }, 'p4'), true);
});

test('a phone can only send moves for its own player, and never the clock', () => {
  const ok = phoneActions([{ type: 'playCard', by: 'p2', cardId: 'hearts-5' }], 'p2');
  assert.ok('actions' in ok && ok.actions.length === 1);
  assert.match((phoneActions([{ type: 'playCard', by: 'p1', cardId: 'x' }], 'p2') as { why: string }).why, /own player/);
  assert.match((phoneActions([{ type: 'tick', at: 5 }], 'p2') as { why: string }).why, /Not a move/);
  assert.match((phoneActions([{ type: 'hack', by: 'p2' }], 'p2') as { why: string }).why, /Not a move/);
  assert.match((phoneActions([], 'p2') as { why: string }).why, /Not a move/);
  assert.match((phoneActions('nope', 'p2') as { why: string }).why, /Not a move/);
  assert.match((phoneActions([{ type: 'playCard', by: 'p2' }, { type: 'castVote', by: 'p3', ballot: 'yes' }], 'p2') as { why: string }).why, /own player/);
});

test('game messages are read on both sides; anything else is ignored', () => {
  const rng = seededRng(3);
  const s = start(3, rng);
  const msg = { t: 'game', me: 'p2', full: true, session: redactSession(s, 'p2'), log: logFor(s.log, 'p2'), events: [] };
  const back = readToJoiner(JSON.parse(JSON.stringify(msg)));
  assert.ok(back && back.t === 'game');
  assert.equal(back.me, 'p2');
  assert.equal(back.full, true);
  assert.equal(back.log.length, s.log.length);
  assert.equal(readGameUpdate({ t: 'game', me: 'p2' }), null);
  assert.deepEqual(readToJoiner({ t: 'nope', why: 'Not your turn' }), { t: 'nope', why: 'Not your turn' });
  assert.deepEqual(readToHost({ t: 'act', actions: [1] }), { t: 'act', actions: [1] });
  assert.deepEqual(readToHost({ t: 'sync' }), { t: 'sync' });
});

test('the incremental log adds up to the full log for each phone', () => {
  const rng = seededRng(11);
  let s = start(4, rng);
  const sent: Record<string, number> = {};
  const got: Record<string, unknown[]> = { p2: [], p3: [], p4: [] };
  for (let i = 0; i < 300 && s.phase !== 'results'; i++) {
    s = step(s, rng);
    for (const p of Object.keys(got)) {
      got[p]!.push(...logFor(s.log.slice(sent[p] ?? 0), p));
      sent[p] = s.log.length;
    }
  }
  for (const p of Object.keys(got)) assert.deepEqual(got[p], logFor(s.log, p));
});
