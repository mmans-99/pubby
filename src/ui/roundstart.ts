/**
 * Round-start screens for pass-and-play (slice 3): votes, the hidden swap and
 * Reaction Tap. See PROJECT.md sections 1.1, 2a, 3 and 5, and CODE.md 9c.
 *
 * Each of these needs every player in turn, privately, so the phone is
 * passed: "Pass the phone to X" (handoff), then X's own screen (hand).
 * `whoMustHold()` works out who is next; game.ts `send()` uses it after
 * every move.
 */

import type { Card } from '../rules/cards.ts';
import { MAX_SWAP } from '../rules/round.ts';
import type { PlayerId, Session, VoteKind } from '../session/types.ts';
import { playerView } from '../session/view.ts';
import { h, type Child } from './dom.ts';
import { handBlock, nameOf, nextClockwise, publicView, seatStrip, send } from './game.ts';
import type { SavedGame } from './storage.ts';
import { getState, update } from './store.ts';
import { resultsSummary, targetPanel } from './between.ts';

// ---------------------------------------------------------------------------
// Who holds the phone next
// ---------------------------------------------------------------------------

/** Clockwise from `start` (inclusive), the first player matching `want`. */
function firstClockwise(s: Session, start: PlayerId, want: (p: PlayerId) => boolean): PlayerId | null {
  const i = Math.max(0, s.order.indexOf(start));
  for (let k = 0; k < s.order.length; k++) {
    const p = s.order[(i + k) % s.order.length]!;
    if (want(p)) return p;
  }
  return null;
}

export function nextVoter(s: Session): PlayerId | null {
  const v = s.vote;
  if (!v || v.awaitingHost) return null;
  return firstClockwise(s, v.calledBy ?? s.hostId, (p) => !v.ballots[p]);
}

export function nextSwapper(s: Session): PlayerId | null {
  if (s.phase !== 'swap') return null;
  return firstClockwise(s, nextClockwise(s, s.dealer), (p) => !s.swapDone.includes(p));
}

export function nextTapper(s: Session): PlayerId | null {
  if (s.phase !== 'reactionTap' || !s.tap) return null;
  return s.tap.players.find((p) => !s.tap!.results[p]) ?? null;
}

/** Who must have the phone for a private step (vote, swap, Reaction Tap), if anyone. */
export function roundStartHolder(s: Session): PlayerId | null {
  if (s.vote) return nextVoter(s);
  return nextSwapper(s) ?? nextTapper(s);
}

// ---------------------------------------------------------------------------
// Screen dispatch
// ---------------------------------------------------------------------------

/** The round-start screen to show, or null if none applies. */
export function roundStartScreen(g: SavedGame): Child | null {
  const s = g.session;
  if (swapReveal && swapReveal.player === g.holder && g.stage === 'hand') return swapRevealStage(g);
  if (s.vote) {
    if (s.vote.awaitingHost) return hostDecidesStage(g);
    const voter = nextVoter(s);
    if (!voter) return null;
    return g.stage === 'hand' && g.holder === voter ? voteStage(g, voter) : passStage(g, voter, 'vote');
  }
  if (s.phase === 'swap') {
    const p = nextSwapper(s);
    if (!p) return null;
    return g.stage === 'hand' && g.holder === p ? swapStage(g, p) : passStage(g, p, 'swap');
  }
  if (s.phase === 'reactionTap') {
    const p = nextTapper(s);
    if (!p) return null;
    return g.stage === 'hand' && g.holder === p ? tapStage(g, p) : passStage(g, p, 'tap');
  }
  return null;
}

function passStage(g: SavedGame, who: PlayerId, what: 'vote' | 'swap' | 'tap'): Child {
  const s = g.session;
  const name = nameOf(s, who);
  const v = s.vote;
  const title =
    what === 'vote' ? voteTitle(s, v!.kind, v!.value)
    : what === 'swap' ? 'Hidden swap'
    : 'Reaction Tap';
  const button =
    what === 'vote' ? (s.order.length === 2 && v!.calledBy ? `I'm ${name}, let me answer` : `I'm ${name}, let me vote`)
    : what === 'swap' ? `I'm ${name}, show my cards`
    : `I'm ${name}, I'm ready`;
  const progress =
    what === 'vote' ? (s.order.length === 2 && v!.calledBy ? `${nameOf(s, v!.calledBy)} asked` : `${Object.keys(v!.ballots).length} of ${s.order.length} have voted`)
    : what === 'swap' ? `${s.swapDone.length} of ${s.order.length} done`
    : tapProgress(s);
  const armed = getState().armed === 'closevote';
  return h('div', { class: 'stack' },
    h('div', { class: 'banner' },
      h('div', { class: 'banner-big' }, title),
      h('div', { class: 'small' }, progress),
    ),
    seatStrip(s, publicView(s), { highlight: who }),
    h('div', { class: 'handoff compact' },
      h('p', { class: 'muted' }, 'Pass the phone to'),
      h('h1', { class: 'handoff-name' }, name),
      h('p', { class: 'muted small' }, 'Everyone else, look away.'),
      h('button', { class: 'big', onclick: () => update({ game: { ...g, stage: 'hand', holder: who } }) }, button),
    ),
    what === 'vote' && Object.keys(v!.ballots).length > 0
      ? h('button', {
        class: armed ? 'danger' : 'ghost',
        onclick: () => {
          if (!armed) { update({ armed: 'closevote' }); return; }
          send([{ type: 'closeVote', by: s.hostId }]);
        },
      }, s.order.length === 2
        ? (armed ? 'Tap again: not agreed' : 'Host: stop waiting (counts as no)')
        : armed ? `Tap again: ${nameOf(s, s.hostId)} counts the votes now` : `Host: count the votes now`)
      : null,
    resultsSummary(s),
  );
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

export function voteTitle(s: Session, kind: VoteKind, value: number | null): string {
  if (kind === 'ultimate' && s.vote?.draw === 1) return 'It’s a draw: Ultimate Round?';
  if (kind === 'ultimate' && s.vote?.draw === 2) return 'Coward! Last chance: Ultimate Round?';
  if (s.order.length === 2) {
    if (kind === 'reshuffle') return 'Reshuffle? Both must agree';
    if (kind === 'target') return `Target ${value} points? Both must agree`;
    return 'Ultimate Round? Both must agree';
  }
  if (kind === 'reshuffle') return 'Reshuffle vote';
  if (kind === 'target') return `Target vote: ${value} points`;
  return 'Ultimate Round vote';
}

function voteQuestion(s: Session, kind: VoteKind, value: number | null): string {
  if (kind === 'reshuffle') return `Should ${nameOf(s, s.dealer)} shuffle and deal again?`;
  if (kind === 'target') return `Play to a target of ${value} points?`;
  return 'Play the Ultimate Round?';
}

/** What a vote result means, for the "Majority says…" pop-up. */
export function voteOutcome(s: Session, kind: VoteKind, result: boolean, value: number | null): string {
  if (kind === 'reshuffle') return result ? `Reshuffle! ${nameOf(s, s.dealer)} shuffles and deals again.` : 'No reshuffle. The round goes on.';
  if (kind === 'target') return result ? `Target: ${value} points` : 'No target.';
  if (result) return 'Ultimate Round! One last round, outside the score.';
  if (s.phase !== 'gameOver') return s.vote?.draw ? 'No Ultimate Round… yet.' : 'No Ultimate Round.';
  return s.ended?.reason === 'drawDeclined'
    ? 'No Ultimate Round. Game over: the top score is shared.'
    : 'No Ultimate Round. Game over: the highest score wins.';
}

function voteStage(g: SavedGame, me: PlayerId): Child {
  const s = g.session;
  const v = s.vote!;
  const view = playerView(s, me);
  const caller =
    v.draw === 1 ? 'The top score is a draw, so the game called this vote.'
    : v.draw === 2 ? 'Coward! The top score is still a draw. Last chance: if it’s a no again, the top score is shared.'
    : v.calledBy && s.order.length === 2 ? `${nameOf(s, v.calledBy)} asked. It only happens if you agree.`
    : v.calledBy ? `${nameOf(s, v.calledBy)} called this vote.`
    : 'Someone reached the target, so the game called this vote.';
  const cast = (yes: boolean): void => { send([{ type: 'castVote', by: me, ballot: yes ? 'yes' : 'no' }]); };
  return h('div', { class: 'stack' },
    h('section', { class: 'panel vote-panel' },
      h('h2', null, voteTitle(s, v.kind, v.value)),
      h('p', null, voteQuestion(s, v.kind, v.value)),
      h('p', { class: 'muted small' }, `${caller} Your vote is secret. More than half wins; no majority and the host decides.`),
      h('div', { class: 'vote-buttons' },
        h('button', { class: 'big vote-yes', onclick: () => cast(true) }, 'YES'),
        h('button', { class: 'big vote-no', onclick: () => cast(false) }, 'NO'),
      ),
    ),
    v.kind === 'reshuffle' ? handBlock(s, view, null) : null,
  );
}

function hostDecidesStage(g: SavedGame): Child {
  const s = g.session;
  const v = s.vote!;
  const host = nameOf(s, s.hostId);
  const decide = (yes: boolean): void => { send([{ type: 'hostDecides', by: s.hostId, yes }]); };
  return h('div', { class: 'stack' },
    h('div', { class: 'banner' },
      h('div', { class: 'banner-big' }, 'No majority'),
      h('div', { class: 'small' }, `${voteTitle(s, v.kind, v.value)} · ${host} (host) decides`),
    ),
    h('section', { class: 'panel vote-panel' },
      h('h2', null, `${host}, you decide`),
      h('p', null, voteQuestion(s, v.kind, v.value)),
      h('div', { class: 'vote-buttons' },
        h('button', { class: 'big vote-yes', onclick: () => decide(true) }, 'YES'),
        h('button', { class: 'big vote-no', onclick: () => decide(false) }, 'NO'),
      ),
    ),
  );
}

/** Reshuffle phase (after the deal): look at cards, call a vote, or the host starts the round. */
export function reshuffleStage(g: SavedGame): Child {
  const s = g.session;
  const v = publicView(s);
  const st = getState();
  const choosing = st.armed === 'reshufflecaller';
  return h('div', { class: 'stack' },
    h('div', { class: 'banner' },
      h('div', { class: 'banner-big' }, 'Cards dealt'),
      h('div', { class: 'small' }, s.reshuffleUsed ? 'The reshuffle vote has been used this round.' : 'Anyone can call one reshuffle vote this round.'),
    ),
    seatStrip(s, v),
    h('section', { class: 'panel' },
      h('h2', null, '1. Look at your cards'),
      h('p', { class: 'muted' }, 'Pass the phone round so everyone sees their own hand.'),
      h('button', { class: 'secondary', onclick: () => update({ game: { ...g, stage: 'handoff', holder: nextClockwise(s, s.dealer) } }) }, 'Pass the phone round'),
    ),
    v.canCallReshuffle
      ? h('section', { class: 'panel' },
        h('h2', null, '2. Reshuffle?'),
        h('p', { class: 'muted' }, 'Don’t like the deal? Anyone can call a vote. If it passes, the dealer shuffles and deals again.'),
        choosing
          ? [
            h('p', null, 'Who is calling the vote?'),
            seatStrip(s, v, { onTap: (id) => send([{ type: 'callVote', by: id, kind: 'reshuffle' }]), tapLabel: 'Called by' }),
            h('button', { class: 'ghost', onclick: () => update({ armed: null }) }, 'Cancel'),
          ]
          : h('button', { class: 'secondary', onclick: () => update({ armed: 'reshufflecaller' }) }, s.order.length === 2 ? 'Ask for a reshuffle' : 'Call a reshuffle vote'),
      )
      : null,
    targetPanel(s),
    h('button', { class: 'big', onclick: () => send([{ type: 'startRound', by: s.hostId }]) }, `Start the round (${nameOf(s, s.hostId)})`),
    h('p', { class: 'muted small center' }, 'Only the host starts the round.'),
  );
}

// ---------------------------------------------------------------------------
// Hidden swap (2 and 3 players)
// ---------------------------------------------------------------------------

/** After a swap, the player sees their new hand with the new cards marked. */
let swapReveal: { player: PlayerId; before: Set<string> } | null = null;
let swapPicked: { player: PlayerId; ids: string[] } = { player: '', ids: [] };

function swapStage(g: SavedGame, me: PlayerId): Child {
  const s = g.session;
  const view = playerView(s, me);
  if (swapPicked.player !== me) swapPicked = { player: me, ids: [] };
  const picked = swapPicked.ids;
  const toggle = (c: Card): void => {
    const i = picked.indexOf(c.id);
    if (i >= 0) picked.splice(i, 1);
    else if (picked.length < MAX_SWAP) picked.push(c.id);
    update({});
  };
  const doSwap = (ids: string[]): void => {
    swapReveal = { player: me, before: new Set(view.myHand.map((c) => c.id)) };
    swapPicked = { player: '', ids: [] };
    if (!send([{ type: 'swap', by: me, cardIds: ids }], { stage: 'hand', holder: me })) swapReveal = null;
  };
  return h('div', { class: 'stack' },
    h('section', { class: 'panel' },
      h('h2', null, 'Hidden swap'),
      h('p', null, `Pick up to ${MAX_SWAP} cards to swap for random unseen cards, or keep your hand. Swapped cards leave the round.`),
      h('p', { class: 'muted small' }, `${picked.length} of ${MAX_SWAP} picked`),
    ),
    handBlock(s, view, toggle, { picked: new Set(picked), all: true }),
    h('button', { class: 'big', disabled: picked.length === 0, onclick: () => doSwap(picked.slice()) },
      picked.length ? `Swap ${picked.length} ${picked.length === 1 ? 'card' : 'cards'}` : 'Pick cards to swap'),
    h('button', { class: 'secondary', onclick: () => doSwap([]) }, 'Keep my hand'),
  );
}

function swapRevealStage(g: SavedGame): Child {
  const s = g.session;
  const me = swapReveal!.player;
  const view = playerView(s, me);
  const fresh = new Set(view.myHand.filter((c) => !swapReveal!.before.has(c.id)).map((c) => c.id));
  const done = (): void => {
    swapReveal = null;
    const next = roundStartHolder(s) ?? (s.phase === 'playing' ? (s.play?.pendingFinalTwo ?? s.play?.turn ?? null) : null);
    update({ game: { ...g, stage: next ? 'handoff' : 'table', holder: next ?? g.holder } });
  };
  const next = roundStartHolder(s);
  return h('div', { class: 'stack' },
    h('section', { class: 'panel' },
      h('h2', null, fresh.size ? `Your ${fresh.size} new ${fresh.size === 1 ? 'card' : 'cards'}` : 'You kept your hand'),
      fresh.size ? h('p', { class: 'muted small' }, 'New cards are marked with a star.') : null,
    ),
    handBlock(s, view, null, { picked: fresh, all: false, mark: true }),
    h('button', { class: 'big', onclick: done }, next ? `Hide my cards · pass to ${nameOf(s, next)}` : 'Hide my cards · carry on'),
  );
}

// ---------------------------------------------------------------------------
// Reaction Tap (two or more players missing a suit)
// ---------------------------------------------------------------------------

type TapState =
  | { step: 'ready' }
  | { step: 'wait'; timer: number }
  | { step: 'go'; at: number }
  | { step: 'done'; ms: number; falseStart: boolean };

let tap: { player: PlayerId; state: TapState } = { player: '', state: { step: 'ready' } };

/** A pause stops a Reaction Tap that is under way; the player starts again after. */
export function resetTap(): void {
  if (tap.state.step === 'wait') window.clearTimeout(tap.state.timer);
  if (tap.state.step === 'wait' || tap.state.step === 'go') tap = { ...tap, state: { step: 'ready' } };
}

function tapProgress(s: Session): string {
  const t = s.tap;
  if (!t) return '';
  return `${t.players.map((p) => nameOf(s, p)).join(', ')} are missing a suit. Slowest leads.`;
}

function setTap(state: TapState): void {
  tap = { ...tap, state };
  update({});
}

function tapStage(g: SavedGame, me: PlayerId): Child {
  const s = g.session;
  if (tap.player !== me) tap = { player: me, state: { step: 'ready' } };
  const st = tap.state;

  const onPad = (e: Event): void => {
    e.preventDefault();
    const cur = tap.state;
    if (cur.step === 'wait') {
      window.clearTimeout(cur.timer);
      setTap({ step: 'done', ms: 0, falseStart: true });
    } else if (cur.step === 'go') {
      setTap({ step: 'done', ms: Math.max(0, Math.round(performance.now() - cur.at)), falseStart: false });
    }
  };
  const start = (): void => {
    const delay = 1500 + Math.random() * 2500;
    const timer = window.setTimeout(() => {
      tap = { ...tap, state: { step: 'go', at: performance.now() } };
      update({});
      // Time from when the green pad is actually on screen.
      requestAnimationFrame(() => {
        if (tap.state.step === 'go') tap = { ...tap, state: { step: 'go', at: performance.now() } };
      });
    }, delay);
    setTap({ step: 'wait', timer });
  };
  const finish = (): void => {
    if (st.step !== 'done') return;
    tap = { player: '', state: { step: 'ready' } };
    send([{ type: 'reactionTap', by: me, ms: st.ms, falseStart: st.falseStart }]);
  };

  const pad = st.step === 'wait'
    ? h('div', { class: 'tap-pad wait', role: 'button', 'aria-label': 'Wait', onpointerdown: onPad }, 'Wait…')
    : st.step === 'go'
      ? h('div', { class: 'tap-pad go', role: 'button', 'aria-label': 'Tap now', onpointerdown: onPad }, 'TAP!')
      : null;

  return h('div', { class: 'stack' },
    h('div', { class: 'banner' },
      h('div', { class: 'banner-big' }, `Reaction Tap · ${nameOf(s, me)}`),
      h('div', { class: 'small' }, 'Tap the pad as soon as it turns green. Tapping early counts as slowest. The slowest player leads.'),
    ),
    st.step === 'ready' ? h('button', { class: 'big tap-start', onclick: start }, 'Start') : null,
    pad,
    st.step === 'done'
      ? h('div', { class: 'stack center' },
        h('div', { class: 'tap-result' }, st.falseStart ? 'Too early!' : `${st.ms} ms`),
        h('p', { class: 'muted' }, st.falseStart ? 'A false start counts as the slowest time.' : 'Your reaction time.'),
        h('button', { class: 'big', onclick: finish }, 'Done · pass the phone on'),
      )
      : null,
  );
}
