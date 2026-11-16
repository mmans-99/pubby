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
import { joinNames } from '../session/names.ts';
import { playerView } from '../session/view.ts';
import { h, type Child } from './dom.ts';
import { handBlock, handoffBlock, nameOf, nextClockwise, ownSeat, publicView, seatStrip, send } from './game.ts';
import { hostLine } from './netscreens.ts';
import { icon, type IconName } from './icons.ts';
import type { SavedGame } from './storage.ts';
import { getState, update, type Popup } from './store.ts';
import { seatInitials } from './initials.ts';
import { sfx } from '../audio/sfx.ts';

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

/**
 * Network game (slice 2): the round-start step this phone answers for itself,
 * all phones at once. Null when it isn't in one.
 */
export function netRoundStart(g: SavedGame, me: PlayerId): Child | null {
  const s = g.session;
  // 2.20 (Part B): after the swap, nobody leads until every phone has pressed Done on its new hand.
  if (s.phase === 'cardCheck') {
    if (s.handSeen.includes(me)) return waitStage(g, me, 'cards', s.order.filter((p) => !s.handSeen.includes(p)));
    return newHandStage(g, me);
  }
  if (swapReveal && swapReveal.player === me) {
    // The new hand shows once the host has made the swap.
    return s.swapDone.includes(me) || s.phase !== 'swap' ? swapRevealStage(g) : waitStage(g, me, 'swap', [me]);
  }
  const v = s.vote;
  if (v) {
    if (v.awaitingHost) return me === s.hostId ? hostDecidesStage(g) : waitStage(g, me, 'vote', [s.hostId]);
    if (!v.ballots[me]) return voteStage(g, me);
    return waitStage(g, me, 'vote', s.order.filter((p) => !v.ballots[p]));
  }
  if (s.phase === 'swap') {
    if (!s.swapDone.includes(me)) return swapStage(g, me);
    return waitStage(g, me, 'swap', s.order.filter((p) => !s.swapDone.includes(p)));
  }
  if (s.phase === 'reactionTap' && s.tap) {
    const t = s.tap;
    if (t.players.includes(me) && !t.results[me]) return tapStage(g, me);
    return waitStage(g, me, 'tap', t.players.filter((p) => !t.results[p]));
  }
  return null;
}

/** Network game: this phone has answered; waiting for the others. */
function waitStage(g: SavedGame, me: PlayerId, what: 'vote' | 'swap' | 'tap' | 'cards', waitingFor: readonly PlayerId[]): Child {
  const s = g.session;
  if (what === 'vote' && s.vote) return voteWaitStage(g, me);
  const [ic, title]: [IconName, string] =
    what === 'swap' ? ['swap', 'Hidden swap']
    : what === 'cards' ? ['hand', 'New hands']
    : ['hand', 'Reaction Tap'];
  const who = joinNames(waitingFor.map((p) => nameOf(s, p)));
  return h('div', { class: 'stack' },
    h('div', { class: 'step-head' }, h('div', { class: 'step-title' }, icon(ic), ` ${title}`),
      h('div', { class: 'muted small' }, `Waiting for ${who}`)),
    seatStrip(s, publicView(s), {}),
    s.phase === 'results' ? null : handBlock(s, playerView(s, me), null, { head: false }),
  );
}

/**
 * 9ai.4 (2.36): the vote, after this phone has voted (or while the host decides).
 * The same card as the vote itself, with no YES/NO buttons: a line says what happens next.
 */
function voteWaitStage(g: SavedGame, me: PlayerId): Child {
  const s = g.session;
  const v = s.vote!;
  const waitingFor = s.order.filter((p) => !v.ballots[p]);
  const names = joinNames(waitingFor.map((p) => nameOf(s, p)));
  const mine = v.ballots[me];
  let foot: Child;
  if (v.awaitingHost) foot = hostLine(`${nameOf(s, s.hostId)} (host) is deciding the vote`);
  else if (v.calledBy === me) foot = h('p', { class: 'vote-said-line asked' }, `You asked: your vote is YES · waiting for ${names || 'the count'}`);
  else if (mine) foot = h('p', { class: `vote-said-line ${mine}` }, `You voted ${mine === 'yes' ? 'YES' : 'NO'} · waiting for ${names || 'the count'}`);
  else foot = null;
  return h('div', { class: 'stack' },
    voteCard(s, me, !!ownSeat(g), voteWho(s, v, !!ownSeat(g), me), [v.awaitingHost ? tieBand(s, v, !!ownSeat(g)) : null, foot]),
    me === s.hostId && !v.awaitingHost && Object.keys(v.ballots).length > 0 ? countNowButton(s) : null,
    s.phase === 'results' ? null : handBlock(s, playerView(s, me), null, { head: false }),
  );
}

function passStage(g: SavedGame, who: PlayerId, what: 'vote' | 'swap' | 'tap'): Child {
  const s = g.session;
  const name = nameOf(s, who);
  const v = s.vote;
  const [ic, title]: [IconName, string] =
    what === 'vote' ? [voteIcon(v!.kind), voteShort(s, v!.kind, v!.value)]
    : what === 'swap' ? ['swap', 'Hidden swap']
    : ['hand', 'Reaction Tap'];
  const progress =
    what === 'vote' ? (s.order.length === 2 && v!.calledBy ? `${nameOf(s, v!.calledBy)} asked` : `${Object.keys(v!.ballots).length} of ${s.order.length} voted`)
    : what === 'swap' ? `${s.swapDone.length} of ${s.order.length} done`
    : `${s.tap?.players.length ?? 0} missing a suit · slowest leads`;
  const armed = getState().armed === 'closevote';
  return h('div', { class: 'stack' },
    h('div', { class: 'step-head' }, h('div', { class: 'step-title' }, icon(ic), ` ${title}`), h('div', { class: 'muted small' }, progress)),
    seatStrip(s, publicView(s), { highlight: who }),
    handoffBlock(name, () => update({ game: { ...g, stage: 'hand', holder: who } }), { compact: true }),
    what === 'vote' && Object.keys(v!.ballots).length > 0 ? countNowButton(s) : null,
  );
}

/** The host counts the votes now (2 players: a vote not agreed counts as no). Tap twice. */
function countNowButton(s: Session): HTMLElement {
  const armed = getState().armed === 'closevote';
  return h('button', {
    class: armed ? 'danger' : 'ghost',
    onclick: () => {
      if (!armed) { update({ armed: 'closevote' }); return; }
      send([{ type: 'closeVote', by: s.hostId }]);
    },
  }, s.order.length === 2
    ? (armed ? 'Tap again: not agreed' : 'Host: stop waiting (counts as no)')
    : armed ? `Tap again: ${nameOf(s, s.hostId)} counts the votes now` : 'Host: count the votes now');
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

export function voteIcon(kind: VoteKind): IconName {
  return kind === 'reshuffle' ? 'shuffle' : kind === 'target' ? 'target' : 'bolt';
}

/** 9ai.4: the short tag on each seat's disc, the same tags the table uses. */
function discTags(s: Session): Record<string, string> {
  return seatInitials(s.players.map((p) => ({ id: p.id, name: p.sessionName ?? p.profileName })));
}

/** 9ai.4: a player's small cream disc with their tag. */
export function miniDisc(s: Session, id: PlayerId, size: string): HTMLElement {
  return h('span', { class: 'vote-disc', style: `--d:${size}`, role: 'img', 'aria-label': nameOf(s, id) }, discTags(s)[id] ?? '?');
}

/** 9ai.4: the vote's question under the card, e.g. "Amy asked · majority decides". */
function voteWho(s: Session, v: NonNullable<Session['vote']>, open: boolean, me: PlayerId | null = null): string {
  // 9aj.3 (2.36): a tie goes to the host. The host's phone says so to the host; everyone else gets the host's name.
  if (v.awaitingHost) return me === s.hostId ? "It's a tie · you're the host, you decide" : `It's a tie · ${nameOf(s, s.hostId)} decides`;
  if (v.draw) return 'Top score is a draw';
  if (v.calledBy && s.order.length === 2) return `${nameOf(s, v.calledBy)} asked · you decide`;
  const secret = open ? '' : ' · secret vote';
  if (v.calledBy) return `${nameOf(s, v.calledBy)} asked · majority decides${secret}`;
  return `Target reached${secret}`;
}

/**
 * 9ai.4 (2.36): one solid card for every vote step: the question, who asked, one row
 * per player in seat order, a progress bar, then what the player does (`after`).
 * On one phone (`open` false) the rows show only Voted or Waiting: the vote is secret.
 */
function voteCard(s: Session, me: PlayerId | null, open: boolean, who: string, after: Child[]): HTMLElement {
  const v = s.vote!;
  const cast = Object.keys(v.ballots).length;
  const pct = Math.round((cast / s.order.length) * 100);
  return h('section', { class: 'vote-card', 'aria-label': 'Vote' },
    h('div', { class: 'vote-head' },
      h('span', { class: 'vote-icon' }, icon(voteIcon(v.kind))),
      h('div', { class: 'vote-head-text' },
        h('h2', { class: 'vote-q' }, voteShort(s, v.kind, v.value)),
        h('p', { class: 'muted small' }, who))),
    ballotList(s, me, open),
    h('div', { class: 'vote-progress' },
      h('span', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${pct}%` })),
      h('small', null, `${cast} of ${s.order.length} voted`)),
    ...after);
}

/** 9ai.4: every player in seat order with their ballot, as it is cast, on every phone. */
function ballotList(s: Session, me: PlayerId | null, open: boolean): HTMLElement {
  const v = s.vote!;
  return h('div', { class: 'ballot-list', role: 'list', 'aria-label': 'Votes' }, s.order.map((p) => {
    const b = v.ballots[p];
    const asked = v.calledBy === p;
    const mine = open && me === p && !b;
    let pill: HTMLElement;
    if (!open) pill = b ? h('span', { class: 'pill voted' }, icon('check'), ' Voted') : h('span', { class: 'pill wait' }, icon('wait'), ' Waiting');
    else if (asked) pill = h('span', { class: 'pill yes' }, icon('check'), ' Asked · YES');
    else if (b === 'yes') pill = h('span', { class: 'pill yes' }, icon('check'), ' YES');
    else if (b === 'no') pill = h('span', { class: 'pill no' }, icon('x'), ' NO');
    else if (mine) pill = h('span', { class: 'pill mine' }, 'Your vote');
    else pill = h('span', { class: 'pill wait' }, icon('wait'), ' Waiting');
    return h('div', { class: `ballot-row${mine ? ' mine' : ''}`, role: 'listitem', 'aria-label': `${nameOf(s, p)}${asked ? ', asked' : ''}` },
      miniDisc(s, p, '36px'),
      h('div', { class: 'ballot-name' },
        // 9aj.3 (2.36): the host's own row on the host's phone while the host decides: "Mo (you)".
        h('b', null, nameOf(s, p) + (v.awaitingHost && open && me === p && p === s.hostId ? ' (you)' : '')),
        v.kind === 'reshuffle' && p === s.dealer ? h('small', null, 'Dealer') : null),
      pill);
  }));
}

/** 9ai.4: the question as a short phrase (the result pop-up's small line). */
export function resultQuestion(kind: VoteKind, value: number | null): string {
  return kind === 'reshuffle' ? 'Deal again?' : kind === 'target' ? `Play to ${value}?` : 'Ultimate Round?';
}

/**
 * 9ai.4 (2.36): the alert, shown on every phone except the asker's. Solid, no timer;
 * "Vote now" or a tap anywhere closes it.
 */
export function voteAlertBody(s: Session, p: Extract<Popup, { kind: 'voteAlert' }>, next: () => void): Child[] {
  const who = nameOf(s, p.by);
  const title = p.vote === 'reshuffle' ? `${who} wants to deal again`
    : p.vote === 'target' ? `${who} wants a target of ${p.value} points`
    : `${who} wants the Ultimate Round`;
  const line = p.vote === 'reshuffle'
    ? (p.twoPlayers ? 'You decide.' : `Everyone votes. ${nameOf(s, p.dealer)} would shuffle and deal a new hand.`)
    : 'Everyone votes.';
  return [
    h('div', { class: 'vote-alert-icon' }, icon(voteIcon(p.vote))),
    h('div', { class: 'popup-title' }, title),
    h('div', { class: 'popup-text' }, line),
    h('div', { class: 'vote-said' }, miniDisc(s, p.by, '28px'), h('span', null, `${who} has voted YES`)),
    h('button', { class: 'big vote-now', onclick: (e: Event) => { e.stopPropagation(); next(); } }, 'Vote now'),
  ];
}

/**
 * 9ai.4 (2.36): the result. A small question, big YES! or NO!, what happens, then one
 * row each for YES and NO with the discs of who said so. On one phone only the counts.
 */
export function voteResultBody(s: Session, p: Extract<Popup, { kind: 'vote' }>, seeDiscs: boolean): Child[] {
  const ballots = p.ballots ?? {};
  const row = (word: string, ids: PlayerId[], cls: string): HTMLElement =>
    h('div', { class: `vote-row ${cls}` },
      h('b', null, `${word} ${ids.length}`),
      seeDiscs ? h('span', { class: 'vote-discs' }, ids.map((id) => miniDisc(s, id, '28px'))) : null);
  return [
    h('div', { class: 'vote-says' }, p.kindOf ? resultQuestion(p.kindOf, p.value ?? null) : 'Vote'),
    h('div', { class: p.result ? 'vote-word yes' : 'vote-word no' }, p.result ? 'YES!' : 'NO!'),
    h('div', { class: 'popup-title small-title' }, p.text),
    h('div', { class: 'vote-rows' },
      row('YES', s.order.filter((id) => ballots[id] === 'yes'), 'yes'),
      row('NO', s.order.filter((id) => ballots[id] === 'no'), 'no')),
  ];
}

/** V1: the vote as a short question. */
export function voteShort(s: Session, kind: VoteKind, value: number | null): string {
  if (kind === 'ultimate' && s.vote?.draw === 1) return 'Draw: Ultimate Round?';
  if (kind === 'ultimate' && s.vote?.draw === 2) return 'Coward! Last chance: Ultimate Round?';
  if (kind === 'reshuffle') return 'Deal again?';
  if (kind === 'target') return `Play to ${value}?`;
  return 'Ultimate Round?';
}

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
  // Network votes and single-player votes are open (PROJECT.md 12), so no "secret vote" there.
  const open = !!ownSeat(g);
  const cast = (yes: boolean): void => { send([{ type: 'castVote', by: me, ballot: yes ? 'yes' : 'no' }]); };
  // 9ai.4 (2.36): the solid card with the list; YES and NO sit under it, side by side.
  return h('div', { class: 'stack' },
    voteCard(s, me, open, voteWho(s, v, open, me), [
      h('div', { class: 'vote-buttons' },
        h('button', { class: 'big vote-yes', onclick: () => cast(true) }, 'YES'),
        h('button', { class: 'big vote-no', onclick: () => cast(false) }, 'NO'),
      ),
    ]),
    open && me === s.hostId && Object.keys(v.ballots).length > 0 ? countNowButton(s) : null,
    v.kind === 'reshuffle' ? handBlock(s, view, null) : null,
  );
}

/** 9aj.3 (2.36): the tie band: "2 YES · 2 NO: it's a tie". On one phone the vote is secret, so only "It's a tie". */
function tieBand(s: Session, v: NonNullable<Session['vote']>, open: boolean): HTMLElement {
  const yes = Object.values(v.ballots).filter((b) => b === 'yes').length;
  const no = Object.values(v.ballots).filter((b) => b === 'no').length;
  return h('div', { class: 'tie-band', role: 'status' }, open ? `${yes} YES · ${no} NO: it's a tie` : "It's a tie");
}

/** 9aj.3 (2.36): the words on the host's two buttons, by what is being decided. */
function hostButtonWords(s: Session, v: NonNullable<Session['vote']>): [string, string] {
  if (v.kind === 'reshuffle') return ['Deal again', 'Keep these cards'];
  if (v.kind === 'target') return [`Play to ${v.value}`, 'No target'];
  return ['Play it', 'No'];
}

function hostDecidesStage(g: SavedGame): Child {
  const s = g.session;
  const v = s.vote!;
  const me = ownSeat(g);
  const decide = (yes: boolean): void => { send([{ type: 'hostDecides', by: s.hostId, yes }]); };
  const [yesWords, noWords] = hostButtonWords(s, v);
  return h('div', { class: 'stack' },
    voteCard(s, me, !!me, voteWho(s, v, !!me, me), [
      tieBand(s, v, !!me),
      h('div', { class: 'vote-buttons' },
        h('button', { class: 'big vote-yes', onclick: () => decide(true) }, yesWords),
        h('button', { class: 'big vote-no', onclick: () => decide(false) }, noWords),
      ),
    ]),
  );
}

/** S1: after the deal: three picture buttons (look at cards, deal again?, start), and the target row (T1). */
export function reshuffleStage(g: SavedGame): Child {
  const s = g.session;
  const v = publicView(s);
  const st = getState();
  const choosing = st.armed === 'reshufflecaller';
  const host = nameOf(s, s.hostId);
  return h('div', { class: 'stack' },
    seatStrip(s, v),
    h('div', { class: 'tiles' },
      h('button', { class: 'tile', onclick: () => update({ game: { ...g, stage: 'handoff', holder: nextClockwise(s, s.dealer) } }) },
        icon('eye', 'xl'), h('span', null, 'Look at cards')),
      h('button', {
        class: choosing ? 'tile on' : 'tile', disabled: !v.canCallReshuffle,
        'aria-label': v.canCallReshuffle ? 'Deal again? Call a reshuffle vote' : 'Deal again: already used this round',
        onclick: () => update({ armed: choosing ? null : 'reshufflecaller' }),
      }, icon('shuffle', 'xl'), h('span', null, v.canCallReshuffle ? 'Deal again?' : 'Used')),
      h('button', { class: 'tile go', onclick: () => send([{ type: 'startRound', by: s.hostId }]) },
        icon('play', 'xl'), h('span', null, `Start · ${host}`)),
    ),
    choosing && v.canCallReshuffle
      ? h('section', { class: 'panel' },
        h('p', { class: 'small center' }, 'Who wants to deal again?'),
        seatStrip(s, v, { onTap: (id) => send([{ type: 'callVote', by: id, kind: 'reshuffle' }]), tapLabel: 'Called by' }),
        h('button', { class: 'ghost', onclick: () => update({ armed: null }) }, 'Cancel'),
      )
      : null,
  );
}

// ---------------------------------------------------------------------------
// Hidden swap (2 and 3 players)
// ---------------------------------------------------------------------------

/** After a swap, the player sees their new hand with the new cards marked. */
let swapReveal: { player: PlayerId; before: Set<string> } | null = null;
let swapPicked: { player: PlayerId; ids: string[] } = { player: '', ids: [] };

/** Network game: the host refused a move, so a swap waiting to show is dropped. */
export function clearSwapReveal(): void {
  swapReveal = null;
}

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
    h('h2', { class: 'center vote-q' }, icon('swap'), ` Swap up to ${MAX_SWAP}?`),
    handBlock(s, view, toggle, { picked: new Set(picked), all: true, head: false }),
    h('p', { class: 'muted small center' }, `${picked.length} of ${MAX_SWAP}`),
    h('div', { class: 'row' },
      h('button', { class: 'big grow', disabled: picked.length === 0, onclick: () => doSwap(picked.slice()) },
        picked.length ? `Swap ${picked.length}` : 'Swap'),
      h('button', { class: 'big secondary grow', onclick: () => doSwap([]) }, 'Keep'),
    ),
  );
}

/**
 * 2.20: the new hand on a network phone, after the swap, before Done. Used when the
 * app was reopened or the phone rejoined and this phone no longer remembers its swap.
 */
function newHandStage(g: SavedGame, me: PlayerId): Child {
  if (swapReveal && swapReveal.player === me) return swapRevealStage(g);
  const s = g.session;
  const view = playerView(s, me);
  const done = (): void => {
    if (!send([{ type: 'seenHand', by: me }], { stage: 'hand', holder: me })) return;
    update({});
  };
  return h('div', { class: 'stack' },
    h('h2', { class: 'center' }, 'Your hand'),
    handBlock(s, view, null, { picked: new Set(), all: false, mark: false, head: false }),
    h('button', { class: 'big', onclick: done }, 'Done'),
  );
}

function swapRevealStage(g: SavedGame): Child {
  const s = g.session;
  const me = swapReveal!.player;
  const view = playerView(s, me);
  const fresh = new Set(view.myHand.filter((c) => !swapReveal!.before.has(c.id)).map((c) => c.id));
  const done = (): void => {
    if (s.waitForAll && s.phase === 'cardCheck') {
      // 2.20: tell the others this phone has seen its hand. The screen stays if the host refuses.
      if (!send([{ type: 'seenHand', by: me }], { stage: 'hand', holder: me })) return;
      swapReveal = null;
      update({});
      return;
    }
    swapReveal = null;
    if (ownSeat(g)) { update({}); return; }
    const next = roundStartHolder(s) ?? (s.phase === 'playing' ? (s.play?.pendingFinalTwo ?? s.play?.turn ?? null) : null);
    update({ game: { ...g, stage: next ? 'handoff' : 'table', holder: next ?? g.holder } });
  };
  const next = roundStartHolder(s);
  return h('div', { class: 'stack' },
    h('h2', { class: 'center' }, fresh.size ? `${fresh.size} new ${fresh.size === 1 ? 'card' : 'cards'} ★` : 'Hand kept'),
    handBlock(s, view, null, { picked: fresh, all: false, mark: true, head: false }),
    h('button', { class: 'big', onclick: done }, ownSeat(g) ? 'Done' : next ? `Hide · pass to ${nameOf(s, next)}` : 'Hide · carry on'),
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
      sfx('tapGo');
      update({});
      // Time from when the green pad is actually on screen.
      requestAnimationFrame(() => {
        if (tap.state.step === 'go') tap = { ...tap, state: { step: 'go', at: performance.now() } };
      });
    }, delay);
    sfx('tapReady');
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
    h('div', { class: 'step-head' },
      h('div', { class: 'step-title' }, icon('hand'), ` Reaction Tap · ${nameOf(s, me)}`),
      h('div', { class: 'muted small' }, 'Tap when it turns green'),
    ),
    st.step === 'ready' ? h('button', { class: 'big tap-start', onclick: start }, 'Start') : null,
    pad,
    st.step === 'done'
      ? h('div', { class: 'stack center' },
        h('div', { class: 'tap-result' }, st.falseStart ? 'Too early!' : `${st.ms} ms`),
        h('button', { class: 'big', onclick: finish }, ownSeat(g) ? 'Done' : 'Done · pass on'),
      )
      : null,
  );
}
