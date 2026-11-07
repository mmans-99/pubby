/**
 * Game screens for pass-and-play (one phone). See CODE.md section 9c.
 *
 * The phone moves between three stages (storage.ts `GameStage`):
 * - table: the shared screen (dealing, round start, results). No hands shown.
 * - handoff: "Pass the phone to X". Public information only.
 * - hand: X's own cards, during play or when everyone looks at their cards.
 *
 * Every move goes through `send()`, which runs the session layer, turns the
 * events into pop-ups and the "last trick" record, and decides who should
 * hold the phone next.
 *
 * Slice 2: dealing (auto with animation, manual, switchable), trick play,
 * slaps, jokers, the final two, going-out and last-two pop-ups, winner picks
 * the leader, and a basic results screen. Slice 3 (roundstart.ts): votes,
 * the hidden swap and Reaction Tap.
 */

import catchPhrasesMd from '../content/catch-phrases.md';
import type { Card } from '../rules/cards.ts';
import { defaultRng } from '../rules/rng.ts';
import { applyAction } from '../session/session.ts';
import type { PlayerId, Session, SessionAction, SessionEvent } from '../session/types.ts';
import { playerView, type PlayerView } from '../session/view.ts';
import { cardFace, cardFaceFromId, ordinal, shortLabel, sortHand, SUIT_NAME, SUIT_SYMBOL } from './cards.ts';
import { h, type Child } from './dom.ts';
import type { GameStage, LastTrick, SavedGame, TrickPlay } from './storage.ts';
import { getState, say, update, type Popup } from './store.ts';
import { reshuffleStage, roundStartHolder, roundStartScreen, voteOutcome } from './roundstart.ts';
import { lockedSeats } from '../rules/deal.ts';
import { jokersBlocked } from '../rules/play.ts';
import {
  askToTake, gameOverStage, notesPanel, passOnButton, pauseButton, pausePanel, pauseRequestsBanner, pauseTick, resultsStage,
  takeControls, takeHolder, takePrompts, targetPanel,
} from './between.ts';

const rng = defaultRng();
const AUTO_DEAL_MS = 150;

const CATCH_PHRASES = catchPhrasesMd
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.startsWith('- '))
  .map((l) => l.slice(2).trim())
  .filter(Boolean);

/** The SLAP! pop-up closes by itself after this long. */
const SLAP_MS = 4000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function nameOf(s: Session, id: PlayerId | null | undefined): string {
  if (!id) return '';
  return s.players.find((p) => p.id === id)?.sessionName ?? id;
}

export function nextClockwise(s: Session, id: PlayerId): PlayerId {
  const i = s.order.indexOf(id);
  return s.order[(i + 1) % s.order.length]!;
}

/** Who must hold the phone during play: the player choosing in the final two, or whose turn it is. */
function actorOf(s: Session): PlayerId | null {
  if (s.phase !== 'playing' || !s.play) return null;
  return s.play.pendingFinalTwo ?? s.play.turn;
}

export function publicView(s: Session): PlayerView {
  // Any player's view has the same public parts. The host's is used for table screens.
  return playerView(s, s.hostId);
}

/**
 * Redraws rebuild the screen, so entry animations would replay on every tap.
 * These remember what was last shown, so only new things animate.
 */
let shownHandKey = '';
let shownTrickCount = 0;

// ---------------------------------------------------------------------------
// Sending actions
// ---------------------------------------------------------------------------

/** For the deal animation: the seat that should receive a flying card after the next draw. */
let pendingFly: PlayerId | null = null;

/**
 * Run actions through the session layer. All or nothing: if one is not
 * allowed, nothing changes and the reason is shown.
 */
export function send(actions: readonly SessionAction[], opts: { stage?: GameStage; holder?: PlayerId } = {}): boolean {
  const g = getState().game;
  if (!g) return false;
  let session = g.session;
  const events: SessionEvent[] = [];
  try {
    for (const a of actions) {
      const r = applyAction(session, a, rng);
      session = r.session;
      events.push(...r.events);
    }
  } catch (e) {
    say(e instanceof Error ? e.message : 'Not allowed.');
    return false;
  }

  // Last trick record.
  let trickLog = g.trickLog.slice();
  let lastTrick: LastTrick | null = g.lastTrick;
  let slap: LastTrick['slap'] = null;
  for (const e of events) {
    if (e.type === 'roundStarted') { trickLog = []; lastTrick = null; }
    if (e.type === 'cardPlayed') trickLog.push({ player: e.player, card: e.card.id, label: shortLabel(e.card) });
    if (e.type === 'jokerPlayed') trickLog.push({ player: e.player, card: 'joker', label: 'Joker' });
    if (e.type === 'slapped') slap = { slapper: e.slapper, slapped: e.slapped };
    if (e.type === 'trickResolved') {
      if (trickLog.length) lastTrick = { plays: trickLog, slap, nextLeader: e.nextLeader };
      trickLog = [];
      slap = null;
    }
  }

  // Private notes (take-cards answers): only the requester sees them, on their own hand screen.
  const notes: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(g.notes ?? {})) notes[k] = v.slice();
  const note = (p: PlayerId, text: string): void => { (notes[p] ??= []).push(text); };
  const taken = new Set(events.filter((e) => e.type === 'cardsTaken').map((e) => e.type === 'cardsTaken' ? `${e.requester}>${e.target}` : ''));
  for (const e of events) {
    if (e.type === 'roundStarted') for (const k of Object.keys(notes)) notes[k] = [];
    if (e.type === 'takeAnswered' && !e.accepted) {
      const gaveTo = events.find((x) => x.type === 'cardsTaken' && x.target === e.target);
      note(e.requester, gaveTo && gaveTo.type === 'cardsTaken'
        ? `${nameOf(session, e.target)} gave their cards to ${nameOf(session, gaveTo.requester)} instead.`
        : `${nameOf(session, e.target)} said no to your take-cards request.`);
    }
    if (e.type === 'takeAnswered' && e.accepted && !taken.has(`${e.requester}>${e.target}`)) {
      note(e.requester, `${nameOf(session, e.target)} agreed. You take their cards when this trick is over.`);
    }
    if (e.type === 'takeCancelled' && e.reason === 'notPossible') {
      note(e.requester, `Your request for ${nameOf(session, e.target)}'s cards was cancelled: it can't happen any more.`);
    }
  }

  // Who holds the phone next.
  let stage: GameStage = opts.stage ?? 'table';
  let holder = opts.holder ?? g.holder;
  if (!opts.stage) {
    const rs = roundStartHolder(session);
    const next = rs ?? takeHolder(session) ?? actorOf(session);
    if (next) {
      // During play the same player keeps their cards up; private round-start steps always pass the phone.
      stage = !rs && session.phase === 'playing' && g.stage === 'hand' && next === g.holder ? 'hand' : 'handoff';
      holder = next;
    }
  }

  const popups = [...getState().popups, ...popupsFor(session, events)];
  update({ game: { session, stage, holder, trickLog, lastTrick, notes }, popups, selected: null, armed: null });
  return true;
}

function popupsFor(s: Session, events: readonly SessionEvent[]): Popup[] {
  const out: Popup[] = [];
  const end = events.find((e) => e.type === 'roundEnded');
  const lastTwo = end && end.type === 'roundEnded' ? end.finishingOrder.slice(-2) : [];
  const missing = events.filter((e) => e.type === 'missingSuitDeclared');
  for (const e of events) {
    switch (e.type) {
      case 'slapped':
        out.push({ kind: 'slap', slapper: e.slapper, slapped: e.slapped, cards: e.cardsPickedUp });
        break;
      case 'jokerPlayed':
        out.push({
          kind: 'info', icon: '🃏', title: 'Joker!',
          text: `${nameOf(s, e.player)} played a joker.${e.asLeader ? ' The next player starts the trick.' : ''}`,
        });
        break;
      case 'playerOut':
        if (!lastTwo.includes(e.player)) out.push({ kind: 'out', player: e.player, place: e.place });
        break;
      case 'wastePilePickedUp':
        out.push({
          kind: 'info', icon: '🗑️', title: 'Waste pile picked up',
          text: `${nameOf(s, e.player)} picks up the waste pile (${e.cards} cards) and leads.`,
        });
        break;
      case 'roundEnded':
        out.push({ kind: 'lastTwo', order: e.finishingOrder, shared: e.sharedSecondLast, forfeitedBy: e.forfeitedBy });
        break;
      case 'voteCalled':
        if (e.by) out.push({ kind: 'info', icon: '🗳️', title: 'Vote!', text: `${nameOf(s, e.by)} called a ${e.kind === 'reshuffle' ? 'reshuffle' : e.kind === 'target' ? `target (${e.value} points)` : 'Ultimate Round'} vote. Pass the phone round to vote.` });
        break;
      case 'voteNeedsHost':
        out.push({ kind: 'info', icon: '⚖️', title: 'No majority', text: `${nameOf(s, s.hostId)} (host) decides.` });
        break;
      case 'voteResolved':
        out.push({ kind: 'vote', decidedBy: e.decidedBy, result: e.result, text: voteOutcome(s, e.kind, e.result, e.value) });
        break;
      case 'jokersDiscarded':
        out.push({
          kind: 'info', icon: '🃏', title: 'Jokers thrown away',
          text: `${nameOf(s, e.player)} played their last normal card, so their ${e.count === 1 ? 'joker is' : `${e.count} jokers are`} thrown away. That was their last card.`,
        });
        break;
      case 'targetReached':
        out.push({
          kind: 'info', icon: '🎯', title: 'Target reached!',
          text: `${e.players.map((x) => nameOf(s, x)).join(' and ')} reached ${e.target} points. Vote now: play the Ultimate Round? If the vote fails, the game ends and the highest score wins.`,
        });
        break;
      case 'cardsTaken':
        out.push({
          kind: 'info', icon: '🤝', title: 'Cards taken!',
          text: `${nameOf(s, e.requester)} took all ${e.count} of ${nameOf(s, e.target)}'s cards.`,
        });
        break;
      case 'pauseDeclined':
        out.push({ kind: 'info', icon: '▶️', title: 'No pause', text: `${nameOf(s, s.hostId)} (host) said no to ${nameOf(s, e.requester)}'s pause request.` });
        break;
      case 'resumed':
        if (e.reason === 'timeLimit') out.push({ kind: 'info', icon: '⏰', title: 'Pause over', text: 'The pause time limit ran out. Back to the game.' });
        break;
      case 'reactionTapReplay':
        out.push({ kind: 'info', icon: '🔁', title: 'Tie for slowest!', text: `${e.players.map((x) => nameOf(s, x)).join(' and ')} tap again.` });
        break;
      case 'leaderChosen': {
        const who = nameOf(s, e.leader);
        const lines = missing.map((m) => m.type === 'missingSuitDeclared'
          ? `${nameOf(s, m.player)} has no ${m.suits.map((x) => `${SUIT_SYMBOL[x]} ${SUIT_NAME[x]}`).join(' or ')}.`
          : '');
        const why =
          e.reason === 'missingSuit' ? `${who} is missing a suit, so ${who} leads.`
          : e.reason === 'reactionTap' ? `${who} was slowest in Reaction Tap, so ${who} leads.`
          : e.reason === 'host' ? `${who} is the host and leads round 1.`
          : `${who} leads.`;
        out.push({ kind: 'info', icon: '▶️', title: `${who} leads`, text: [...lines, why].join(' ') });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function gameScreen(g: SavedGame): HTMLElement {
  if (g.stage !== 'hand') shownHandKey = '';
  const s = g.session;
  const st = getState();
  let body: Child;
  const rs = roundStartScreen(g);
  if (rs) {
    body = rs;
  } else if (s.phase === 'playing') {
    body = g.stage === 'hand' ? playHandStage(g) : playHandoffStage(g);
  } else if (g.stage === 'hand' && s.phase !== 'dealing' && s.phase !== 'results' && s.phase !== 'gameOver') {
    body = lookHandStage(g);
  } else if (g.stage === 'handoff' && s.phase !== 'dealing' && s.phase !== 'results' && s.phase !== 'gameOver') {
    body = lookHandoffStage(g);
  } else {
    body = tableStage(g);
  }
  const label = s.phase === 'gameOver' ? 'Game over'
    : s.ultimateRound && s.phase !== 'results' ? '⚡ Ultimate Round'
    : `Round ${s.round}`;
  return h('main', { class: 'screen game' },
    h('div', { class: 'game-bar' },
      h('button', { class: 'ghost', onclick: () => update({ menuOpen: !st.menuOpen, armed: null }) }, '☰ Menu'),
      h('span', { class: 'bar-right' },
        h('span', { class: 'muted' }, label),
        s.target !== null && s.phase !== 'gameOver' ? h('span', { class: 'tag gold' }, `🎯 ${s.target}`) : null,
        pauseButton(s),
      ),
    ),
    st.menuOpen ? gameMenu() : null,
    pausePanel(g),
    pauseRequestsBanner(g),
    body,
  );
}

function gameMenu(): HTMLElement {
  const armed = getState().armed === 'endgame';
  return h('div', { class: 'panel menu' },
    h('button', { class: 'secondary', onclick: () => update({ screen: 'home', menuOpen: false }) }, 'Home (game is kept)'),
    h('button', {
      class: armed ? 'danger' : 'secondary',
      onclick: () => {
        if (!armed) { update({ armed: 'endgame' }); return; }
        update({ game: null, screen: 'home', menuOpen: false, armed: null, popups: [] });
      },
    }, armed ? 'Tap again to end the game' : 'End this game'),
  );
}

// ---------------------------------------------------------------------------
// Table pieces (public information only)
// ---------------------------------------------------------------------------

export function seatStrip(s: Session, v: PlayerView, opts: { highlight?: PlayerId | null; onTap?: (id: PlayerId) => void; tapLabel?: string; disabled?: readonly PlayerId[] } = {}): HTMLElement {
  return h('div', { class: 'seat-strip' }, s.order.map((id) => {
    const p = v.players.find((x) => x.id === id)!;
    const out = p.place !== null;
    const cls = ['seat-chip', id === opts.highlight ? 'turn' : '', out ? 'out' : '', opts.onTap ? 'tappable' : ''].join(' ');
    const inner: Child[] = [
      h('span', { class: 'seat-name' }, p.sessionName),
      h('span', { class: 'seat-count' }, out ? `${ordinal(p.place!)}` : `${p.cardCount} 🂠`),
      id === s.dealer && s.phase === 'dealing' ? h('span', { class: 'seat-tag' }, 'Deals') : null,
      p.isHost ? h('span', { class: 'seat-host', 'aria-label': 'Host' }, '★') : null,
    ];
    return opts.onTap
      ? h('button', { class: cls, 'data-seat': id, disabled: opts.disabled?.includes(id) ?? false, 'aria-label': `${opts.tapLabel ?? ''} ${p.sessionName}`.trim(), onclick: () => opts.onTap!(id) }, inner)
      : h('div', { class: cls, 'data-seat': id }, inner);
  }));
}

function trickArea(s: Session, g: SavedGame, v: PlayerView): HTMLElement {
  const turn = v.pendingFinalTwo ? null : v.turn;
  const plays = g.trickLog;
  const felt = h('section', { class: 'felt' },
    h('div', { class: 'felt-top' },
      h('span', null, v.ledSuit ? h('span', { class: 'led' }, 'Led: ', h('b', { class: v.ledSuit === 'hearts' || v.ledSuit === 'diamonds' ? 'red-text' : '' }, `${SUIT_SYMBOL[v.ledSuit]} ${SUIT_NAME[v.ledSuit]}`)) : h('span', { class: 'muted' }, 'New trick')),
      h('span', { class: 'waste', 'aria-label': `Waste pile: ${v.wastePileCount} cards` }, h('span', { class: 'waste-pile', 'aria-hidden': 'true' }), `${v.wastePileCount}`),
    ),
    plays.length
      ? h('div', { class: 'trick' }, plays.map((p, i) => h('div', { class: i >= shownTrickCount ? 'trick-play new' : 'trick-play', style: `--i:${i}` },
        cardFaceFromId(p.card, 'small-card'),
        h('span', { class: 'trick-name' }, nameOf(s, p.player)))))
      : h('div', { class: 'trick empty-trick' }, turn ? `${nameOf(s, turn)} to lead` : ''),
    turn && plays.length ? h('p', { class: 'small center' }, `${nameOf(s, turn)} to play`) : null,
    g.lastTrick ? lastTrickRow(s, g.lastTrick) : null,
  );
  shownTrickCount = plays.length;
  return felt;
}

function lastTrickRow(s: Session, t: LastTrick): HTMLElement {
  const result = t.slap
    ? `${nameOf(s, t.slap.slapper)} slapped ${nameOf(s, t.slap.slapped)}`
    : t.nextLeader ? `${nameOf(s, t.nextLeader)} leads next` : '';
  return h('div', { class: 'last-trick' },
    h('span', { class: 'muted small' }, 'Last trick: '),
    t.plays.map((p: TrickPlay) => h('span', { class: 'lt-card' }, `${nameOf(s, p.player)} `, h('b', { class: /[♥♦]/.test(p.label) ? 'red-text' : '' }, p.label))),
    result ? h('span', { class: 'small lt-result' }, ` · ${result}`) : null,
  );
}

// ---------------------------------------------------------------------------
// Table stage: dealing, round start, results, game over
// ---------------------------------------------------------------------------

function tableStage(g: SavedGame): Child {
  const s = g.session;
  switch (s.phase) {
    case 'dealing': return dealingStage(g);
    case 'reshuffle': return reshuffleStage(g);
    case 'swap':
    case 'reactionTap': return roundStartScreen(g) ?? h('p', null, 'Waiting…');
    case 'chooseLeader': return chooseLeaderStage(g);
    case 'results': return resultsStage(g);
    case 'gameOver': return gameOverStage(g);
    case 'playing': return playHandoffStage(g);
  }
}

function dealingStage(g: SavedGame): Child {
  const s = g.session;
  const v = publicView(s);
  const d = v.deal!;
  const dealer = s.dealer;
  const notStarted = d.mode === 'auto' && d.nextSeat === null;
  const manual = d.mode === 'manual';
  const total = s.order.reduce((n, id) => n + (v.players.find((p) => p.id === id)?.cardCount ?? 0), 0) + d.remaining;
  const tap = notStarted
    ? (id: PlayerId) => send([{ type: 'autoDealStart', by: dealer, firstSeat: id }])
    : manual
      ? (id: PlayerId) => { pendingFly = id; send([{ type: 'manualDealCard', by: dealer, seat: id }]); }
      : undefined;
  return h('div', { class: 'stack' },
    s.round === 1 ? h('div', { class: 'banner' },
      h('div', { class: 'banner-big' }, s.jokerRuleEnabled ? `🃏 ${s.jokerTotal} jokers this game` : 'No jokers this game'),
      h('div', { class: 'small' }, `${s.order.length} players · Host: ${nameOf(s, s.hostId)}`),
    ) : null,
    h('h2', { class: 'center' }, `${nameOf(s, dealer)} deals`),
    seatStrip(s, v, { highlight: manual || notStarted ? null : d.nextSeat, onTap: tap, tapLabel: notStarted ? 'First card to' : 'Deal a card to', disabled: manual && s.deal ? lockedSeats(s.deal) : [] }),
    h('div', { class: 'deck-area' },
      h('div', { class: 'deck', id: 'deck', 'aria-label': `${d.remaining} cards left to deal` },
        h('div', { class: 'card-back' }), h('div', { class: 'card-back' }), h('div', { class: 'card-back top' }),
        h('span', { class: 'deck-count' }, String(d.remaining))),
      h('p', { class: 'muted small' }, `${total - d.remaining} of ${total} dealt`),
    ),
    notStarted
      ? h('p', { class: 'note center' }, `${nameOf(s, dealer)}: tap who gets the ${total - d.remaining === 0 ? 'first' : 'next'} card. Cards go clockwise from them.`)
      : manual
        ? h('p', { class: 'note center' }, 'Manual deal: tap a name to give them one card. Once someone has a card they’re greyed out until everyone has one, so the deal stays even.')
        : h('p', { class: 'muted center' }, 'Dealing clockwise…'),
    notStarted ? null : h('div', { class: 'row' },
      manual
        ? h('button', { class: 'secondary grow', onclick: () => send([{ type: 'setDealMode', by: dealer, mode: 'auto' }]) }, d.nextSeat ? 'Back to auto deal' : 'Switch to auto deal')
        : h('button', { class: 'secondary grow', onclick: () => send([{ type: 'setDealMode', by: dealer, mode: 'manual' }]) }, 'Switch to manual'),
      !manual ? h('button', { class: 'ghost', onclick: () => send([{ type: 'autoDealAll', by: dealer }]) }, 'Deal the rest now') : null,
    ),
    targetPanel(s),
  );
}

function chooseLeaderStage(g: SavedGame): Child {
  const s = g.session;
  const v = publicView(s);
  const winner = s.previous!.winner;
  return h('div', { class: 'stack' },
    h('div', { class: 'banner' },
      h('div', { class: 'banner-big' }, `${nameOf(s, winner)} picks who leads`),
      h('div', { class: 'small' }, 'Last round’s winner chooses, and can choose themselves.'),
    ),
    seatStrip(s, v, { onTap: (id) => send([{ type: 'chooseLeader', by: winner, leader: id }]), tapLabel: 'Leads:' }),
    h('p', { class: 'muted center small' }, 'Tap a name.'),
  );
}

// ---------------------------------------------------------------------------
// Looking at hands before the round (pass the phone round)
// ---------------------------------------------------------------------------

function lookHandoffStage(g: SavedGame): Child {
  const s = g.session;
  const who = nameOf(s, g.holder);
  return h('div', { class: 'handoff' },
    h('div', { class: 'handoff-icon', 'aria-hidden': 'true' }, '📱'),
    h('p', { class: 'muted' }, 'Pass the phone to'),
    h('h1', { class: 'handoff-name' }, who),
    h('p', { class: 'muted small' }, 'Everyone else, look away.'),
    h('button', { class: 'big', onclick: () => update({ game: { ...g, stage: 'hand' } }) }, `I'm ${who}, show my cards`),
    h('button', { class: 'ghost', onclick: () => update({ game: { ...g, stage: 'table' } }) }, 'Everyone has looked · back to the table'),
  );
}

function lookHandStage(g: SavedGame): Child {
  const s = g.session;
  const v = playerView(s, g.holder);
  const next = nextClockwise(s, g.holder);
  return h('div', { class: 'stack' },
    handBlock(s, v, null),
    h('button', { class: 'big', onclick: () => update({ game: { ...g, stage: 'handoff', holder: next } }) },
      `Hide my cards · pass to ${nameOf(s, next)}`),
    h('button', { class: 'ghost', onclick: () => update({ game: { ...g, stage: 'table' } }) }, 'Hide my cards · back to the table'),
  );
}

// ---------------------------------------------------------------------------
// Play
// ---------------------------------------------------------------------------

function playHandoffStage(g: SavedGame): Child {
  const s = g.session;
  const v = publicView(s);
  const asked = takeHolder(s);
  const actor = asked ?? actorOf(s) ?? g.holder;
  const who = nameOf(s, actor);
  const choosing = !asked && v.pendingFinalTwo === actor;
  return h('div', { class: 'stack' },
    seatStrip(s, v, { highlight: actor }),
    trickArea(s, g, v),
    h('div', { class: 'handoff compact' },
      h('p', { class: 'muted' }, choosing ? 'Decision time. Pass the phone to' : 'Pass the phone to'),
      h('h1', { class: 'handoff-name' }, who),
      h('button', { class: 'big', onclick: () => update({ game: { ...g, stage: 'hand', holder: actor } }) }, `I'm ${who}, show my cards`),
      asked ? h('p', { class: 'muted small' }, `Something for ${who} only.`) : null,
    ),
    askToTake(g),
  );
}

/**
 * A player's hand. With `onTap`, legal cards are lit and tappable (during play).
 * `opts.all` makes every card tappable (hidden swap); `opts.picked` marks cards
 * as raised; `opts.mark` puts a star on them instead (new cards after a swap).
 */
export function handBlock(
  s: Session,
  v: PlayerView,
  onTap: ((c: Card) => void) | null,
  opts: { picked?: ReadonlySet<string>; all?: boolean; mark?: boolean } = {},
): HTMLElement {
  const hand = sortHand(v.myHand);
  const legal = new Set(opts.all ? v.myHand.map((c) => c.id) : v.legalCardIds);
  const selected = getState().selected;
  const raised = (id: string): boolean => (opts.picked ? opts.picked.has(id) && !opts.mark : selected === id);
  const key = `${s.round}:${v.me}:${s.phase}`;
  const fresh = key !== shownHandKey;
  shownHandKey = key;
  return h('section', { class: 'hand-section' },
    h('div', { class: 'hand-head' },
      h('h2', null, `${nameOf(s, v.me)}'s cards`),
      h('span', { class: 'count' }, String(hand.length)),
    ),
    hand.length
      ? h('div', { class: fresh ? 'hand fresh' : 'hand' }, hand.map((c, i) => {
        const playable = onTap !== null && legal.has(c.id);
        const el = cardFace(c, [onTap && !playable ? 'dim' : '', raised(c.id) ? 'selected' : '', playable ? 'playable' : '', opts.mark && opts.picked?.has(c.id) ? 'new-card' : ''].join(' '));
        el.style.setProperty('--i', String(i));
        if (playable) {
          el.setAttribute('role', 'button');
          el.setAttribute('tabindex', '0');
          el.addEventListener('click', () => onTap(c));
          el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') onTap(c); });
        }
        return el;
      }))
      : h('p', { class: 'empty' }, 'No cards left.'),
  );
}

function playHandStage(g: SavedGame): Child {
  const s = g.session;
  const v = playerView(s, g.holder);
  const st = getState();
  const myTurn = v.turn === v.me && !v.pendingFinalTwo;
  const choosing = v.pendingFinalTwo === v.me;
  const other = s.play ? s.order.find((p) => p !== v.me && (s.play!.hands[p]?.length ?? 0) > 0) : undefined;
  const selected = st.selected && v.legalCardIds.includes(st.selected) ? st.selected : null;
  const selCard = selected ? v.myHand.find((c) => c.id === selected) : undefined;

  const play = (id: string): void => { send([{ type: 'playCard', by: v.me, cardId: id }]); };
  const onTap = myTurn
    ? (c: Card) => { if (selected === c.id) play(c.id); else update({ selected: c.id }); }
    : null;
  const forfeitArmed = st.armed === 'forfeit';
  const forfeitBtn = v.canForfeit
    ? h('button', {
      class: forfeitArmed ? 'danger' : 'ghost',
      onclick: () => {
        if (!forfeitArmed) { update({ armed: 'forfeit' }); return; }
        send([{ type: 'forfeit', by: v.me }]);
      },
    }, forfeitArmed ? 'Tap again to forfeit (last place)' : 'Forfeit')
    : null;

  return h('div', { class: 'stack' },
    seatStrip(s, v, { highlight: v.me }),
    trickArea(s, g, v),
    notesPanel(g, v.me),
    takePrompts(s, v.me),
    choosing
      ? h('section', { class: 'panel choice' },
        h('h2', null, 'Your last card was higher'),
        h('p', null, `It beat ${nameOf(s, other)}'s card, so you don't go out. Choose:`),
        h('button', { class: 'big', onclick: () => send([{ type: 'pickUpWastePile', by: v.me }]) },
          `Pick up the waste pile (${v.wastePileCount} cards) and lead`),
        h('p', { class: 'muted small' }, 'You can still forfeit later while two players are left.'),
        forfeitBtn,
      )
      : null,
    handBlock(s, v, onTap),
    myTurn
      ? h('div', { class: 'play-bar' },
        h('button', { class: 'big grow', disabled: !selCard, onclick: () => selected && play(selected) },
          selCard ? `Play ${shortLabel(selCard)}` : (v.trick.length ? (v.ledSuit ? `Play a card (follow ${SUIT_SYMBOL[v.ledSuit]} if you can)` : 'Play a card') : 'Lead any card')),
      )
      : null,
    myTurn ? h('p', { class: 'muted small center' }, 'Tap a card, then Play. Or tap the same card twice.') : null,
    myTurn && s.play && jokersBlocked(s.play, v.me) && v.myHand.some((c) => c.kind === 'joker')
      ? h('p', { class: 'note' }, `No jokers now: ${nameOf(s, s.order.find((p) => p !== v.me && (s.play!.hands[p]?.length ?? 0) > 0))} is on their last card. Play a normal card.`)
      : null,
    !choosing ? forfeitBtn : null,
    takeControls(s, v.me),
    !myTurn && !choosing && !s.takeRequests.some((r) => r.target === v.me && !r.agreed)
      ? passOnButton(g)
      : null,
  );
}

// ---------------------------------------------------------------------------
// Pop-ups
// ---------------------------------------------------------------------------

/** When each SLAP! pop-up first appeared, so its countdown bar survives a redraw. */
const slapShownAt = new WeakMap<Popup, number>();

function slapElapsed(p: Popup): number {
  const now = Date.now();
  if (!slapShownAt.has(p)) slapShownAt.set(p, now);
  return Math.min(SLAP_MS, now - slapShownAt.get(p)!);
}

/** Pop-ups already on screen, so a redraw doesn't replay their entrance. */
const shownPopups = new WeakSet<Popup>();

export function popupLayer(): HTMLElement | null {
  const st = getState();
  const p = st.popups[0];
  const g = st.game;
  if (!p || !g) return null;
  const s = g.session;
  const next = (): void => update({ popups: st.popups.slice(1) });
  let body: Child;
  let cls = shownPopups.has(p) ? 'popup seen' : 'popup';
  shownPopups.add(p);
  if (p.kind === 'slap') {
    cls += ' slap';
    body = [
      h('div', { class: 'slap-word', 'aria-label': 'Slap!' }, 'SLAP!'),
      h('div', { class: 'slap-who' }, `${nameOf(s, p.slapper)} slapped ${nameOf(s, p.slapped)}`),
      h('div', { class: 'small' }, `${nameOf(s, p.slapped)} picks up ${p.cards} ${p.cards === 1 ? 'card' : 'cards'} and leads.`),
      h('div', { class: 'slap-timer', 'aria-hidden': 'true' }, h('span', { style: `animation-duration:${SLAP_MS}ms;animation-delay:-${slapElapsed(p)}ms` })),
    ];
  } else if (p.kind === 'out') {
    body = [
      h('div', { class: 'popup-icon' }, p.place === 1 ? '🏆' : '🎉'),
      h('div', { class: 'popup-title' }, `${nameOf(s, p.player)} is out!`),
      h('div', null, `Came ${ordinal(p.place)}`),
    ];
  } else if (p.kind === 'lastTwo') {
    body = lastTwoBody(s, p);
  } else if (p.kind === 'vote') {
    cls += ' vote-pop';
    body = [
      h('div', { class: 'vote-says' }, p.decidedBy === 'host' ? 'Host says…' : 'Majority says…'),
      h('div', { class: p.result ? 'vote-word yes' : 'vote-word no' }, p.result ? 'YES!' : 'NO!'),
      h('div', { class: 'popup-title small-title' }, p.text),
    ];
  } else {
    body = [
      h('div', { class: 'popup-icon' }, p.icon),
      h('div', { class: 'popup-title' }, p.title),
      h('div', null, p.text),
    ];
  }
  // The SLAP! pop-up closes by itself (afterRender); the others wait for a tap.
  if (p.kind === 'slap') {
    return h('div', { class: 'overlay popup-overlay' }, h('div', { class: cls, role: 'alert' }, body));
  }
  return h('div', { class: 'overlay popup-overlay', onclick: next },
    h('div', { class: cls, role: 'alertdialog' },
      body,
      h('button', { class: 'popup-ok', onclick: (e) => { e.stopPropagation(); next(); } }, st.popups.length > 1 ? 'Next' : 'OK'),
    ),
  );
}

function lastTwoBody(s: Session, p: Extract<Popup, { kind: 'lastTwo' }>): Child[] {
  const n = p.order.length;
  if (p.shared) {
    return [
      h('div', { class: 'popup-icon' }, '🃏🃏'),
      h('div', { class: 'popup-title' }, 'Both out on jokers!'),
      h('div', null, `${p.shared.map((x) => nameOf(s, x)).join(' and ')} share ${ordinal(n - 1)} place.`),
    ];
  }
  const second = p.order[n - 2]!;
  const loser = p.order[n - 1]!;
  const forfeit = p.forfeitedBy ? h('div', { class: 'small' }, `${nameOf(s, p.forfeitedBy)} forfeited.`) : null;
  if (n === 2) {
    return [
      h('div', { class: 'popup-icon' }, '🏁'),
      h('div', { class: 'popup-title' }, `${nameOf(s, second)} wins!`),
      h('div', { class: 'loser-line' }, `${nameOf(s, loser)} is the loser`),
      forfeit,
    ];
  }
  return [
    h('div', { class: 'popup-icon' }, '🏁'),
    h('div', { class: 'popup-title' }, 'Round over'),
    h('div', null, `${nameOf(s, second)} came ${ordinal(n - 1)}.`),
    h('div', { class: 'loser-line' }, `${nameOf(s, loser)} is the loser`),
    forfeit,
  ];
}

/**
 * Reactions: anyone can spam 😂 and the catch-phrases at any time in a game.
 * A button slides the drawer open; it stays open until it's put away, and it
 * sits above pop-ups so people can react while the SLAP! is on screen. Each
 * tap floats up from where it was tapped and fades out.
 * Multiplayer (Phase 4): each reaction will show who sent it and come from
 * that player's side of the table (CODE.md section 9c).
 */
let drawerWasOpen = false;

export function reactionsLayer(): HTMLElement[] {
  const open = getState().reactionsOpen;
  const opening = open && !drawerWasOpen;
  drawerWasOpen = open;
  const toggle = h('button', {
    class: open ? 'reactions-toggle on' : 'reactions-toggle',
    'aria-label': open ? 'Put reactions away' : 'Open reactions',
    'aria-expanded': open ? 'true' : 'false',
    onclick: () => update({ reactionsOpen: !open }),
  }, open ? '✕' : '😂');
  if (!open) return [toggle];
  const drawer = h('section', { class: opening ? 'reactions-drawer opening' : 'reactions-drawer', 'aria-label': 'Reactions' },
    h('button', { class: 'emoji-btn', 'aria-label': 'Laugh', onclick: (e) => floatText('😂', e as MouseEvent, true) }, '😂'),
    h('div', { class: 'phrase-chips' }, CATCH_PHRASES.map((ph) =>
      h('button', { class: 'phrase-chip', onclick: (e) => floatText(ph, e as MouseEvent, false) }, ph))),
  );
  return [drawer, toggle];
}

function floatText(text: string, e: MouseEvent, emoji: boolean): void {
  const el = document.createElement('div');
  el.className = emoji ? 'float-emoji' : 'float-phrase';
  el.textContent = text;
  const x = e.clientX || window.innerWidth / 2;
  const y = e.clientY || window.innerHeight / 2;
  el.style.left = `${Math.max(8, Math.min(window.innerWidth - 40, x + (Math.random() * 80 - 40)))}px`;
  el.style.top = `${y - 30}px`;
  el.style.setProperty('--drift', `${Math.round(Math.random() * 80 - 40)}px`);
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
  window.setTimeout(() => el.remove(), 2500);
}

// ---------------------------------------------------------------------------
// After each draw: auto deal timer and the flying card
// ---------------------------------------------------------------------------

let dealTimer: number | null = null;

let slapTimer: { popup: Popup; id: number } | null = null;

export function afterRender(): void {
  pauseTick();
  const top = getState().popups[0];
  if (top?.kind === 'slap' && slapTimer?.popup !== top) {
    if (slapTimer) window.clearTimeout(slapTimer.id);
    const id = window.setTimeout(() => {
      slapTimer = null;
      const cur = getState().popups;
      if (cur[0] === top) update({ popups: cur.slice(1) });
    }, SLAP_MS);
    slapTimer = { popup: top, id };
  }
  if (pendingFly) {
    flyCard(pendingFly);
    pendingFly = null;
  }
  const st = getState();
  const s = st.game?.session;
  const dealing = st.screen === 'game' && s?.phase === 'dealing' && s.deal?.mode === 'auto' && s.deal.nextSeat !== null && !s.vote && !s.paused;
  if (!dealing) {
    if (dealTimer !== null) { window.clearTimeout(dealTimer); dealTimer = null; }
    return;
  }
  if (dealTimer !== null) return;
  dealTimer = window.setTimeout(() => {
    dealTimer = null;
    const cur = getState().game?.session;
    if (!cur || cur.paused || cur.phase !== 'dealing' || cur.deal?.mode !== 'auto' || !cur.deal.nextSeat) { afterRender(); return; }
    pendingFly = cur.deal.nextSeat;
    send([{ type: 'autoDealStep', by: cur.dealer }]);
  }, AUTO_DEAL_MS);
}

function flyCard(seat: PlayerId): void {
  const from = document.getElementById('deck');
  const to = document.querySelector(`[data-seat="${seat}"]`);
  if (!from || !to || !('animate' in HTMLElement.prototype)) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'card-back flying';
  el.style.left = `${a.left + a.width / 2 - 18}px`;
  el.style.top = `${a.top + a.height / 2 - 25}px`;
  document.body.appendChild(el);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = el.animate(
    [
      { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${dx > 0 ? 200 : -200}deg) scale(0.6)`, opacity: 0.2 },
    ],
    { duration: 320, easing: 'cubic-bezier(.2,.7,.3,1)' },
  );
  anim.onfinish = () => el.remove();
}
