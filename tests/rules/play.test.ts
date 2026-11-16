import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Suit } from '../../src/rules/cards.ts';
import { legalCards, playCard, startPlay, type PlayState } from '../../src/rules/play.ts';

const c = (suit: Suit, rank: number): Card =>
  ({ kind: 'standard', id: `${suit}-${rank}`, suit, rank }) as Card;
const J = (n: number): Card => ({ kind: 'joker', id: `joker-${n}` });
const ids = (cards: readonly Card[] | undefined) => (cards ?? []).map((x) => x.id).sort();

function run(state: PlayState, moves: [string, string][]) {
  let s = state;
  const events = [];
  for (const [p, id] of moves) {
    const r = playCard(s, p, id);
    s = r.state;
    events.push(...r.events);
  }
  return { s, events };
}

test('must follow suit when able; any card when not', () => {
  const s = startPlay(['a', 'b'], { a: [c('hearts', 5)], b: [c('hearts', 9), c('spades', 2)] }, 'a');
  const s2 = playCard(s, 'a', 'hearts-5').state;
  assert.deepEqual(ids(legalCards(s2, 'b')), ['hearts-9']);
  assert.throws(() => playCard(s2, 'b', 'spades-2'), /follow/);
  assert.throws(() => playCard(s2, 'a', 'hearts-5'), /turn/);
});

test('normal trick: cards to waste pile, highest of led suit leads (Ace high)', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    {
      a: [c('hearts', 5), c('clubs', 2)],
      b: [c('hearts', 14), c('clubs', 3)],
      c: [c('hearts', 13), c('clubs', 4)],
    },
    'a',
  );
  const { s: after, events } = run(s, [
    ['a', 'hearts-5'],
    ['b', 'hearts-14'],
    ['c', 'hearts-13'],
  ]);
  assert.equal(after.turn, 'b');
  assert.deepEqual(ids(after.wastePile), ['hearts-13', 'hearts-14', 'hearts-5']);
  assert.ok(events.some((e) => e.type === 'trickResolved' && e.nextLeader === 'b'));
});

test('slap: trick stops, highest led-suit player picks up every card and leads', () => {
  const s = startPlay(
    ['a', 'b', 'c', 'd'],
    {
      a: [c('hearts', 5), c('clubs', 2)],
      b: [c('hearts', 12), c('clubs', 3)],
      c: [c('spades', 9), c('clubs', 4)], // no hearts
      d: [c('hearts', 14), c('clubs', 5)],
    },
    'a',
  );
  const { s: after, events } = run(s, [
    ['a', 'hearts-5'],
    ['b', 'hearts-12'],
    ['c', 'spades-9'], // SLAP - d never plays
  ]);
  const slap = events.find((e) => e.type === 'slapped');
  assert.deepEqual(slap, { type: 'slapped', slapper: 'c', slapped: 'b', cardsPickedUp: 3 });
  assert.deepEqual(ids(after.hands['b']), ['clubs-3', 'hearts-12', 'hearts-5', 'spades-9']);
  assert.equal(after.turn, 'b');
  assert.deepEqual(after.wastePile, []);
  assert.equal(after.hands['d']?.length, 2); // d did not play
});

test('going out and round end: finishing order and loser', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 5)], b: [c('hearts', 9)], c: [c('hearts', 2), c('clubs', 2)] },
    'a',
  );
  const { s: after, events } = run(s, [
    ['a', 'hearts-5'],
    ['b', 'hearts-9'],
    ['c', 'hearts-2'],
  ]);
  assert.equal(after.loser, 'c');
  assert.equal(after.turn, null);
  const end = events.find((e) => e.type === 'roundEnded');
  assert.deepEqual(end, {
    type: 'roundEnded',
    finishingOrder: ['a', 'b', 'c'],
    loser: 'c',
    sharedSecondLast: null,
    forfeitedBy: null,
  });
  assert.throws(() => playCard(after, 'c', 'clubs-2'), /over/);
});

test('highest card player is out: next highest card of the led suit leads', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    {
      a: [c('hearts', 5), c('clubs', 2)],
      b: [c('hearts', 14)], // goes out on the Ace
      c: [c('hearts', 10), c('clubs', 4)],
    },
    'a',
  );
  const { s: after } = run(s, [
    ['a', 'hearts-5'],
    ['b', 'hearts-14'],
    ['c', 'hearts-10'],
  ]);
  assert.deepEqual(after.finished, ['b']);
  assert.equal(after.turn, 'c');
});

test('slapped player who had played their last card picks up and stays in', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    {
      a: [c('hearts', 14)], // leads their last card
      b: [c('spades', 3), c('clubs', 3)], // no hearts: slaps
      c: [c('hearts', 2), c('clubs', 4)],
    },
    'a',
  );
  const { s: after } = run(s, [
    ['a', 'hearts-14'],
    ['b', 'spades-3'],
  ]);
  assert.deepEqual(after.finished, []);
  assert.deepEqual(ids(after.hands['a']), ['hearts-14', 'spades-3']);
  assert.equal(after.turn, 'a');
});

test('joker: skips the turn, leaves the game, never enters the waste pile', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    {
      a: [c('hearts', 5), c('clubs', 2)],
      b: [J(1), c('hearts', 9)], // has hearts but can still play the joker
      c: [c('hearts', 3), c('clubs', 4)],
    },
    'a',
  );
  const { s: after, events } = run(s, [
    ['a', 'hearts-5'],
    ['b', 'joker-1'],
    ['c', 'hearts-3'],
  ]);
  assert.ok(events.some((e) => e.type === 'jokerPlayed' && e.player === 'b' && !e.asLeader));
  assert.deepEqual(ids(after.usedJokers), ['joker-1']);
  assert.ok(!after.wastePile.some((x) => x.id === 'joker-1'));
  assert.equal(after.turn, 'a'); // highest heart: a's 5
  assert.deepEqual(ids(after.hands['b']), ['hearts-9']);
});

test('joker as the lead: next player clockwise starts the trick with any card', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [J(1), c('hearts', 5)], b: [c('spades', 9), c('hearts', 2)], c: [c('spades', 3), c('clubs', 4)] },
    'a',
  );
  const r1 = playCard(s, 'a', 'joker-1');
  assert.equal(r1.state.turn, 'b');
  assert.equal(r1.state.trick.ledSuit, null);
  assert.equal(legalCards(r1.state, 'b').length, 2);
  const { s: after } = run(r1.state, [
    ['b', 'spades-9'],
    ['c', 'spades-3'],
  ]);
  // a skipped this trick with the joker; b wins with the 9 of spades.
  assert.equal(after.turn, 'b');
  assert.deepEqual(ids(after.wastePile), ['spades-3', 'spades-9']);
});

test('last normal card with only jokers left: jokers thrown away, player goes out', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 5), c('clubs', 9)], b: [c('hearts', 2), J(1), J(2)], c: [c('hearts', 3), c('clubs', 4)] },
    'a',
  );
  const { s: after, events } = run(s, [
    ['a', 'hearts-5'],
    ['b', 'hearts-2'],
    ['c', 'hearts-3'],
  ]);
  assert.ok(events.some((e) => e.type === 'jokersDiscarded' && e.player === 'b' && e.count === 2));
  assert.deepEqual(after.finished, ['b']);
  assert.deepEqual(ids(after.usedJokers), ['joker-1', 'joker-2']);
});

test('slap with the last normal card: jokers thrown away, the slapper goes out', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 5), c('clubs', 9)], b: [c('spades', 2), J(1)], c: [c('hearts', 3), c('clubs', 4)] },
    'a',
  );
  const { s: after } = run(s, [
    ['a', 'hearts-5'],
    ['b', 'spades-2'],
  ]);
  assert.deepEqual(after.finished, ['b']);
  assert.equal(after.turn, 'a');
});

test('play functions never change the state passed in', () => {
  const s = startPlay(['a', 'b'], { a: [c('hearts', 5)], b: [c('hearts', 9), c('spades', 2)] }, 'a');
  const before = JSON.stringify(s);
  playCard(s, 'a', 'hearts-5');
  assert.equal(JSON.stringify(s), before);
});

// ---------------------------------------------------------------------------
// 2.34.5: jokers set aside with the last normal card (PROJECT.md 7, 12s)
// ---------------------------------------------------------------------------

test('last normal card is highest of the led suit and someone slaps: the jokers come back', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 5), c('clubs', 9)], b: [c('hearts', 13), J(1)], c: [c('spades', 3), c('clubs', 4)] },
    'a',
  );
  const r1 = run(s, [['a', 'hearts-5'], ['b', 'hearts-13']]);
  assert.deepEqual(ids(r1.s.asideJokers?.['b']), ['joker-1']);
  assert.deepEqual(r1.s.hands['b'], []);
  const r2 = playCard(r1.s, 'c', 'spades-3'); // slap: b picks up
  assert.ok(!r2.events.some((e) => e.type === 'jokersDiscarded'));
  assert.deepEqual(ids(r2.state.hands['b']), ['hearts-13', 'hearts-5', 'joker-1', 'spades-3']);
  assert.deepEqual(r2.state.usedJokers, []);
  assert.ok(!r2.state.finished.includes('b'));
  assert.deepEqual(r2.state.asideJokers ?? {}, {});
});

test('2.34.4 saved state without asideJokers plays on', () => {
  const s = startPlay(
    ['a', 'b', 'c'],
    { a: [c('hearts', 5), c('clubs', 9)], b: [c('hearts', 2), J(1)], c: [c('hearts', 3), c('clubs', 4)] },
    'a',
  );
  const old = { ...s } as Record<string, unknown>;
  delete old['asideJokers'];
  const { s: after, events } = run(old as unknown as PlayState, [['a', 'hearts-5'], ['b', 'hearts-2'], ['c', 'hearts-3']]);
  assert.ok(events.some((e) => e.type === 'jokersDiscarded' && e.player === 'b'));
  assert.deepEqual(after.finished, ['b']);
});

test('cards are kept: hands + waste + used + aside = dealt, after every action (200 random games)', async () => {
  const { createDeck } = await import('../../src/rules/cards.ts');
  const { canForfeit, forfeit, pickUpWastePile } = await import('../../src/rules/play.ts');
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // Every dealt card is in exactly one place (trick cards may also be in the
  // waste pile once the trick is closed, so count distinct ids, and check no
  // card is in two hands).
  const count = (st: PlayState) => {
    const inHands = Object.values(st.hands).flat().map((x) => x.id);
    assert.equal(new Set(inHands).size, inHands.length, 'a card in two hands');
    const held = new Set(inHands);
    for (const x of [...st.wastePile, ...st.usedJokers, ...Object.values(st.asideJokers ?? {}).flat()]) {
      assert.ok(!held.has(x.id), `${x.id} in a hand and elsewhere`);
    }
    const all = [
      ...inHands,
      ...st.wastePile.map((x) => x.id),
      ...st.usedJokers.map((x) => x.id),
      ...st.trick.plays.map((x) => x.card.id),
      ...Object.values(st.asideJokers ?? {}).flat().map((x) => x.id),
    ];
    return new Set(all).size;
  };
  let jokerBacks = 0;
  for (let g = 0; g < 200; g++) {
    const n = 2 + (g % 7);
    const deck = createDeck(n, true).sort(() => rnd() - 0.5);
    const order = Array.from({ length: n }, (_, i) => `p${i}`);
    const hands: Record<string, Card[]> = Object.fromEntries(order.map((p) => [p, [] as Card[]]));
    // Small hands so the last-card and final-two cases come up often.
    const per = 3 + (g % 4);
    deck.slice(0, per * n).forEach((card, i) => hands[order[i % n] as string]!.push(card));
    for (const p of order) {
      const hp: Card[] = hands[p]!;
      if (!hp.some((x) => x.kind !== 'joker')) hp.push(deck[per * n + order.indexOf(p)] as Card);
    }
    const total = Object.values(hands).reduce((k, h) => k + h.length, 0);
    let st = startPlay(order, hands, 'p0');
    for (let step = 0; step < 2000 && !st.over; step++) {
      let r;
      if (st.pendingFinalTwo) {
        r = rnd() < 0.8 ? pickUpWastePile(st, st.pendingFinalTwo) : forfeit(st, st.pendingFinalTwo);
      } else {
        const p = st.turn as string;
        if (canForfeit(st, p) && rnd() < 0.005) r = forfeit(st, p);
        else {
          const legal = legalCards(st, p);
          r = playCard(st, p, (legal[Math.floor(rnd() * legal.length)] as Card).id);
        }
      }
      if (r.events.some((e) => e.type === 'wastePilePickedUp' || e.type === 'slapped')) {
        const before = Object.values(st.asideJokers ?? {}).reduce((k, h) => k + h.length, 0);
        if (before > 0) jokerBacks++;
      }
      st = r.state;
      assert.equal(count(st), total, `game ${g} step ${step}`);
    }
    assert.ok(st.over, `game ${g} ended`);
    assert.deepEqual(st.asideJokers ?? {}, {}, 'nothing aside at the end');
  }
  assert.ok(jokerBacks > 0, 'the joker-back case came up');
});
