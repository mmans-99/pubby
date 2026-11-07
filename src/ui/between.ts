/**
 * Between tricks and rounds (Phase 2 slice 4). See PROJECT.md sections 1.1,
 * 4.2, 8, 9 and 11, and CODE.md section 9c.
 *
 * - Results screen after every round: places, points, totals, trivia, ready
 *   up, target score vote, Ultimate Round vote; the host moves on.
 * - Game over screen: winner, Ultimate titles, standings, trivia.
 * - Target score vote before round 1 (during the deal or before the host
 *   starts round 1).
 * - Take-cards requests during play: ask, answer, withdraw, private notes.
 * - Pause: the host pauses or approves a player's request; the pause screen
 *   covers every screen until the host resumes (or the time limit runs out).
 *
 * Pass-and-play (one phone): votes are cast by passing the phone round (the
 * vote screens are in roundstart.ts). Take-cards requests are private to the
 * two players, so the asked player answers on their own hand screen.
 */

import { betweenTricks, takeAllowed } from '../rules/play.ts';
import { targetVoteAllowed } from '../session/session.ts';
import { computeTrivia, type Top } from '../session/trivia.ts';
import type { PlayerId, RoundRecord, Session, SessionPhase } from '../session/types.ts';
import { ordinal } from './cards.ts';
import { h, type Child } from './dom.ts';
import { nameOf, send } from './game.ts';
import { resetTap } from './roundstart.ts';
import type { SavedGame } from './storage.ts';
import { getState, update } from './store.ts';

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
}

function names(s: Session, ids: readonly PlayerId[]): string {
  return ids.map((p) => nameOf(s, p)).join(' & ');
}

/** A row of name buttons (no card counts), for "who is calling?" and ready up. */
function nameChips(
  s: Session,
  onTap: (id: PlayerId) => void,
  opts: { only?: readonly PlayerId[]; on?: readonly PlayerId[]; label?: string } = {},
): HTMLElement {
  const ids = opts.only ?? s.order;
  return h('div', { class: 'name-chips' }, ids.map((id) => {
    const on = opts.on?.includes(id) ?? false;
    return h('button', {
      class: on ? 'name-chip on' : 'name-chip',
      'aria-label': `${opts.label ?? ''} ${nameOf(s, id)}`.trim(),
      'aria-pressed': opts.on ? (on ? 'true' : 'false') : null,
      onclick: () => onTap(id),
    }, on ? `✓ ${nameOf(s, id)}` : nameOf(s, id));
  }));
}

// ---------------------------------------------------------------------------
// Results table and trivia
// ---------------------------------------------------------------------------

export function resultsTable(s: Session, rec: RoundRecord): HTMLElement {
  const n = rec.finishingOrder.length;
  return h('section', { class: 'panel' },
    h('table', { class: 'results' },
      h('thead', null, h('tr', null,
        h('th', null, ''), h('th', null, 'Player'),
        rec.ultimate ? null : h('th', null, 'Round'),
        h('th', null, 'Total'))),
      h('tbody', null, rec.finishingOrder.map((id, i) => {
        const shared = rec.sharedSecondLast?.includes(id);
        const place = shared ? n - 1 : i + 1;
        const isLoser = !rec.sharedSecondLast && i === n - 1;
        return h('tr', { class: isLoser || (shared && rec.ultimate) ? 'loser-row' : '' },
          h('td', null, ordinal(place)),
          h('td', null, nameOf(s, id),
            isLoser ? h('span', { class: 'tag' }, 'loser') : null,
            rec.forfeitedBy === id ? h('span', { class: 'tag' }, 'forfeit') : null),
          rec.ultimate ? null : h('td', null, signed(rec.points[id] ?? 0)),
          h('td', null, h('b', null, String(rec.totals[id] ?? 0))));
      })),
    ),
  );
}

function topText(s: Session, t: Top, unit: (n: number) => string): string {
  return `${names(s, t.players)} (${unit(t.count)})`;
}

const times = (n: number): string => `${n} ${n === 1 ? 'time' : 'times'}`;

export function triviaPanel(s: Session): HTMLElement {
  const t = computeTrivia(s.log, s.order);
  const rows: [string, string, string][] = [];
  if (t.mostSlapped) rows.push(['😵', 'Most slapped', topText(s, t.mostSlapped, times)]);
  if (t.mostSlapper) rows.push(['👋', 'Most slapper', topText(s, t.mostSlapper, (n) => `${n} ${n === 1 ? 'slap' : 'slaps'}`)]);
  if (t.rivals.length) {
    rows.push(['⚔️', 'Rivals', t.rivals.map((r) => `${nameOf(s, r.slapper)} slaps ${nameOf(s, r.slapped)} most (${times(r.count)})`).join(' · ')]);
  }
  if (t.alwaysFightingForSurvival) {
    rows.push(['🛟', 'Always fighting for survival', topText(s, t.alwaysFightingForSurvival, (n) => `bottom two ${times(n)}`)]);
  }
  if (t.biggestPickUp) rows.push(['📦', 'Biggest pick-up', topText(s, t.biggestPickUp, (n) => `${n} ${n === 1 ? 'card' : 'cards'} in one slap`)]);
  if (t.mostForfeits) rows.push(['🏳️', 'Most forfeits', topText(s, t.mostForfeits, (n) => String(n))]);
  if (t.mostReshuffleVotes) rows.push(['🔀', 'Most reshuffle votes called', topText(s, t.mostReshuffleVotes, (n) => String(n))]);
  if (t.slowestReaction) rows.push(['🐢', 'Slowest reaction', topText(s, t.slowestReaction, (n) => `${n} ms`)]);

  const who = (top: Top | null): Child => (top ? `${names(s, top.players)} ×${top.count}` : h('span', { class: 'muted' }, '—'));
  return h('section', { class: 'panel trivia' },
    h('h2', null, 'Trivia'),
    rows.length
      ? h('ul', { class: 'trivia-list' }, rows.map(([icon, label, text]) =>
        h('li', null, h('span', { class: 'trivia-icon', 'aria-hidden': 'true' }, icon),
          h('span', null, h('b', null, `${label}: `), text))))
      : h('p', { class: 'muted' }, 'No slaps yet. Suspiciously peaceful.'),
    h('table', { class: 'trivia-table' },
      h('thead', null, h('tr', null, h('th', null, 'Player'), h('th', null, 'Slapped by most'), h('th', null, 'Slapped most'))),
      h('tbody', null, s.order.map((id) => {
        const p = t.perPlayer[id]!;
        return h('tr', null, h('td', null, nameOf(s, id)), h('td', null, who(p.slappedByMost)), h('td', null, who(p.slappedMost)));
      })),
    ),
    h('p', { class: 'muted small' }, 'This game so far. Trivia never changes the score.'),
  );
}

// ---------------------------------------------------------------------------
// Target score and Ultimate Round votes
// ---------------------------------------------------------------------------

let targetDraft = 10;
const TARGET_MAX = 99;

/** "Propose a target" panel: before round 1 starts, or on the results screen. */
export function targetPanel(s: Session): HTMLElement | null {
  if (!targetVoteAllowed(s)) return null;
  const st = getState();
  const choosing = st.armed === 'targetcaller';
  const set = (n: number): void => { targetDraft = Math.max(1, Math.min(TARGET_MAX, n)); update({}); };
  return h('section', { class: 'panel' },
    h('h2', null, '🎯 Target score'),
    h('p', { class: 'muted small' },
      'Optional. Anyone can propose a points goal; everyone votes. Once agreed it’s fixed. When someone reaches it, an Ultimate Round vote starts.'),
    h('div', { class: 'stepper' },
      h('button', { class: 'secondary step', 'aria-label': 'One less', onclick: () => set(targetDraft - 1) }, '−'),
      h('span', { class: 'step-value', 'aria-live': 'polite' }, `${targetDraft} pts`),
      h('button', { class: 'secondary step', 'aria-label': 'One more', onclick: () => set(targetDraft + 1) }, '+'),
    ),
    h('div', { class: 'chips' }, [5, 10, 15, 20].map((n) =>
      h('button', { class: n === targetDraft ? 'quick on' : 'quick', onclick: () => set(n) }, String(n)))),
    choosing
      ? [
        h('p', null, `Who is proposing ${targetDraft} points?`),
        nameChips(s, (id) => send([{ type: 'callVote', by: id, kind: 'target', value: targetDraft }]), { label: 'Proposed by' }),
        h('button', { class: 'ghost', onclick: () => update({ armed: null }) }, 'Cancel'),
      ]
      : h('button', { class: 'secondary', onclick: () => update({ armed: 'targetcaller' }) }, `Propose ${targetDraft} points`),
  );
}

function ultimatePanel(s: Session): HTMLElement | null {
  if (s.ultimateRound) return null;
  const choosing = getState().armed === 'ultimatecaller';
  return h('section', { class: 'panel' },
    h('h2', null, '⚡ Ultimate Round'),
    h('p', { class: 'muted small' },
      'One final round outside the score. The winner takes the game; the loser ranks last. Anyone can call the vote.'),
    choosing
      ? [
        h('p', null, 'Who is calling the vote?'),
        nameChips(s, (id) => send([{ type: 'callVote', by: id, kind: 'ultimate' }]), { label: 'Called by' }),
        h('button', { class: 'ghost', onclick: () => update({ armed: null }) }, 'Cancel'),
      ]
      : h('button', { class: 'secondary', onclick: () => update({ armed: 'ultimatecaller' }) }, 'Call an Ultimate Round vote'),
  );
}

// ---------------------------------------------------------------------------
// Results screen
// ---------------------------------------------------------------------------

export function resultsStage(g: SavedGame): Child {
  const s = g.session;
  const rec = s.rounds[s.rounds.length - 1];
  if (!rec) return h('p', null, 'No results yet.');
  const armed = getState().armed === 'endsession';
  const host = nameOf(s, s.hostId);
  const loser = s.previous?.loser;
  const ready = (id: PlayerId): void => {
    if (s.ready.includes(id)) return;
    send([{ type: 'readyUp', by: id }]);
  };
  return h('div', { class: 'stack' },
    h('div', { class: 'banner' },
      h('div', { class: 'banner-big' }, `🏆 ${nameOf(s, rec.finishingOrder[0])} is the winner`),
      h('div', { class: 'small' }, `Round ${rec.round}${s.target !== null ? ` · Target: ${s.target} points` : ''}`),
    ),
    s.ultimateRound
      ? h('div', { class: 'banner ultimate' },
        h('div', { class: 'banner-big' }, '⚡ Next: the Ultimate Round'),
        h('div', { class: 'small' }, 'No points. The winner takes the game, the loser ranks last. The game ends after it.'))
      : null,
    resultsTable(s, rec),
    loser ? h('p', { class: 'muted center small' }, `${nameOf(s, loser)} deals next. ${nameOf(s, rec.finishingOrder[0])} picks who leads.`) : null,
    triviaPanel(s),
    h('section', { class: 'panel' },
      h('h2', null, 'Ready?'),
      h('p', { class: 'muted small' }, `Tap your name when you’re ready. ${host} (host) decides when to start.`),
      nameChips(s, ready, { on: s.ready, label: 'Ready:' }),
      h('p', { class: 'small' }, `${s.ready.length} of ${s.order.length} ready`),
    ),
    targetPanel(s),
    ultimatePanel(s),
    h('button', { class: 'big', onclick: () => send([{ type: 'advance', by: s.hostId }]) },
      s.ultimateRound ? `Start the Ultimate Round (${host})` : `Next round (${host})`),
    h('button', {
      class: armed ? 'danger' : 'secondary',
      onclick: () => {
        if (!armed) { update({ armed: 'endsession' }); return; }
        send([{ type: 'endSession', by: s.hostId }]);
      },
    }, armed ? `Tap again: ${host} ends the game` : `End the game (${host})`),
  );
}

/** Shown under "Pass the phone to X" while a results-screen vote goes round. */
export function resultsSummary(s: Session): HTMLElement | null {
  if (s.phase !== 'results') return null;
  const rec = s.rounds[s.rounds.length - 1];
  return rec ? resultsTable(s, rec) : null;
}

// ---------------------------------------------------------------------------
// Game over
// ---------------------------------------------------------------------------

export function gameOverStage(g: SavedGame): Child {
  const s = g.session;
  const end = s.ended!;
  const labels = s.ultimateLabels;
  const last = s.rounds[s.rounds.length - 1];
  const why =
    end.reason === 'ultimatePlayed' ? (labels?.winner ? 'The Ultimate Round decided it.' : 'No Ultimate Winner, so the highest score wins.')
    : end.reason === 'ultimateVoteFailedAtTarget' ? `Target reached and no Ultimate Round, so the highest score wins.`
    : `${nameOf(s, s.hostId)} (host) ended the game. Highest score wins.`;
  return h('div', { class: 'stack' },
    h('div', { class: 'banner' },
      h('div', { class: 'banner-big' }, `🏆 ${names(s, end.winners)} ${end.winners.length > 1 ? 'win' : 'wins'} the game`),
      h('div', { class: 'small' }, why),
    ),
    labels
      ? h('section', { class: 'panel titles' },
        labels.winner ? h('div', { class: 'title-line' }, '👑 Ultimate Winner: ', h('b', null, nameOf(s, labels.winner))) : null,
        labels.losers.length ? h('div', { class: 'title-line' }, `💀 Ultimate ${labels.losers.length > 1 ? 'Losers' : 'Loser'}: `, h('b', null, names(s, labels.losers))) : null,
      )
      : null,
    h('section', { class: 'panel' },
      h('h2', null, 'Final standings'),
      h('ol', { class: 'standings' }, end.standings.map((id) =>
        h('li', null,
          h('span', { class: 'grow' }, nameOf(s, id),
            labels?.winner === id ? h('span', { class: 'tag gold' }, 'Ultimate Winner') : null,
            labels?.losers.includes(id) ? h('span', { class: 'tag' }, 'Ultimate Loser') : null),
          h('b', null, `${s.scores[id] ?? 0} pts`)))),
    ),
    last?.ultimate ? [h('h2', { class: 'center' }, 'Ultimate Round'), resultsTable(s, last)] : null,
    triviaPanel(s),
    h('p', { class: 'muted small center' }, `${s.rounds.length} ${s.rounds.length === 1 ? 'round' : 'rounds'} played.`),
    h('button', { class: 'big', onclick: () => update({ game: null, screen: 'home', popups: [] }) }, 'Back to home'),
  );
}

// ---------------------------------------------------------------------------
// Take-cards requests (PROJECT.md section 4.2)
// ---------------------------------------------------------------------------

/**
 * Between tricks the next trick waits for every request to be answered, so
 * the phone goes to the oldest asked player who hasn't answered yet.
 */
export function takeHolder(s: Session): PlayerId | null {
  if (s.phase !== 'playing' || !s.play || s.paused || s.vote) return null;
  if (!betweenTricks(s.play)) return null;
  return s.takeRequests.find((r) => !r.agreed)?.target ?? null;
}

/** Requests asking `me` for my cards, waiting for my answer. */
export function takePrompts(s: Session, me: PlayerId): HTMLElement | null {
  const asks = s.takeRequests.filter((r) => r.target === me && !r.agreed);
  if (!asks.length || !s.play) return null;
  const nextPlace = s.play.finished.length + 1;
  const who = names(s, asks.map((r) => r.requester));
  const give = (requester: PlayerId): void => { send([{ type: 'answerTake', by: me, requester, accept: true }]); };
  const refuseAll = (): void => {
    send(asks.map((r) => ({ type: 'answerTake' as const, by: me, requester: r.requester, accept: false })));
  };
  return h('section', { class: 'panel take-ask' },
    h('h2', null, asks.length > 1 ? `🤝 ${who} all want your cards` : `🤝 ${who} wants your cards`),
    h('p', null, asks.length > 1
      ? `You choose who gets them. They take all your cards, unseen, before this trick starts. You go out at once and take the next place (${ordinal(nextPlace)}).`
      : `If you agree, ${who} takes all your cards, unseen, before this trick starts. You go out at once and take the next place (${ordinal(nextPlace)}).`),
    h('p', { class: 'muted small' }, 'Only the players asking know about this.'),
    asks.length > 1
      ? [
        h('div', { class: 'stack' }, asks.map((r) =>
          h('button', { class: 'big vote-yes', onclick: () => give(r.requester) }, `Give them to ${nameOf(s, r.requester)}`))),
        h('button', { class: 'big vote-no', onclick: refuseAll }, 'Refuse everyone'),
      ]
      : h('div', { class: 'vote-buttons' },
        h('button', { class: 'big vote-yes', onclick: () => give(asks[0]!.requester) }, 'Agree'),
        h('button', { class: 'big vote-no', onclick: refuseAll }, 'Refuse'),
      ),
  );
}

/** Players `p` may ask right now (before a trick, nothing open). */
function takeTargets(s: Session, p: PlayerId): PlayerId[] {
  const play = s.play;
  if (s.phase !== 'playing' || !play || play.over || s.paused || !betweenTricks(play)) return [];
  if (s.takeRequests.some((r) => r.requester === p)) return [];
  return s.order.filter((q) => !takeAllowed(play, p, q));
}

/** Ask to take someone's cards (before a trick only, one at a time), and see or withdraw my request. */
export function takeControls(s: Session, me: PlayerId): HTMLElement | null {
  const play = s.play;
  if (s.phase !== 'playing' || !play || play.over || !betweenTricks(play)) return null;
  const mine = s.takeRequests.filter((r) => r.requester === me);
  const targets = takeTargets(s, me);
  if (!mine.length && !targets.length) return null;
  const choosing = getState().armed === 'take';
  return h('section', { class: 'panel take-panel' },
    mine.map((r) => h('div', { class: 'row take-mine' },
      h('span', { class: 'grow small' }, `You asked ${nameOf(s, r.target)}: `,
        h('b', null, r.agreed ? 'agreed' : 'waiting for an answer')),
      h('button', { class: 'ghost', onclick: () => send([{ type: 'withdrawTake', by: me, target: r.target }], { stage: 'hand', holder: me }) }, 'Withdraw'))),
    targets.length
      ? choosing
        ? [
          h('p', { class: 'small' }, 'Take all the cards of… (you won’t see them first, and you can ask one player at a time)'),
          nameChips(s, (id) => send([{ type: 'requestTake', by: me, target: id }]), { only: targets, label: 'Ask' }),
          h('button', { class: 'ghost', onclick: () => update({ armed: null }) }, 'Cancel'),
        ]
        : h('button', { class: 'ghost take-btn', onclick: () => update({ armed: 'take' }) }, '🤝 Ask to take someone’s cards')
      : null,
    h('p', { class: 'muted small' }, 'Only before a trick starts.'),
  );
}

/**
 * On the hand-off screen before a trick: any player can ask to take cards.
 * Pick who's asking, then the phone goes to them in private.
 */
export function askToTake(g: SavedGame): HTMLElement | null {
  const s = g.session;
  const askers = s.order.filter((p) => takeTargets(s, p).length > 0);
  if (!askers.length) return null;
  const choosing = getState().armed === 'asker';
  return h('section', { class: 'panel take-panel' },
    choosing
      ? [
        h('p', { class: 'small' }, 'Who wants to ask? The phone goes to them.'),
        nameChips(s, (id) => update({ game: { ...g, stage: 'hand', holder: id }, armed: 'take' }), { only: askers, label: 'Asking:' }),
        h('button', { class: 'ghost', onclick: () => update({ armed: null }) }, 'Cancel'),
      ]
      : h('button', { class: 'ghost take-btn', onclick: () => update({ armed: 'asker' }) }, '🤝 Someone wants to take cards'),
  );
}

/** For a player holding the phone out of turn (asking to take cards): hide and pass on. */
export function passOnButton(g: SavedGame): HTMLElement {
  const s = g.session;
  const next = takeHolder(s) ?? s.play?.pendingFinalTwo ?? s.play?.turn ?? g.holder;
  return h('button', {
    class: 'secondary',
    onclick: () => update({ game: { ...g, stage: 'handoff', holder: next }, armed: null }),
  }, `Hide my cards · pass to ${nameOf(s, next)}`);
}

/** Private messages for one player (take-cards answers). */
export function notesPanel(g: SavedGame, me: PlayerId): HTMLElement | null {
  const notes = g.notes?.[me] ?? [];
  if (!notes.length) return null;
  return h('section', { class: 'panel private-note' },
    notes.map((n) => h('p', null, n)),
    h('button', { class: 'ghost', onclick: () => update({ game: { ...g, notes: { ...g.notes, [me]: [] } } }) }, 'Got it'),
  );
}

// ---------------------------------------------------------------------------
// Pause (PROJECT.md section 8)
// ---------------------------------------------------------------------------

const ROUND_PHASES: readonly SessionPhase[] = ['dealing', 'reshuffle', 'swap', 'reactionTap', 'chooseLeader', 'playing'];

export function canPause(s: Session): boolean {
  return ROUND_PHASES.includes(s.phase) && !s.vote && !s.paused && !s.ended;
}

/** Pause actions keep whoever has the phone on the same screen. */
function sendKeep(g: SavedGame, actions: Parameters<typeof send>[0]): boolean {
  return send(actions, { stage: g.stage, holder: g.holder });
}

export function pauseButton(s: Session): HTMLElement | null {
  if (!canPause(s)) return null;
  const open = getState().armed === 'pause';
  return h('button', { class: open ? 'ghost pause-btn on' : 'ghost pause-btn', 'aria-expanded': open ? 'true' : 'false', onclick: () => update({ armed: open ? null : 'pause', menuOpen: false }) }, '⏸ Pause');
}

export function pausePanel(g: SavedGame): HTMLElement | null {
  const s = g.session;
  if (getState().armed !== 'pause' || !canPause(s)) return null;
  const host = nameOf(s, s.hostId);
  const askers = s.order.filter((p) => p !== s.hostId && !s.pauseRequests.includes(p));
  return h('div', { class: 'panel menu' },
    h('button', {
      class: 'big',
      onclick: () => { resetTap(); sendKeep(g, [{ type: 'pause', by: s.hostId, at: Date.now() }]); update({ armed: null }); },
    }, `⏸ Pause now (${host})`),
    askers.length
      ? [
        h('p', { class: 'small' }, 'Or ask the host to pause:'),
        nameChips(s, (id) => { sendKeep(g, [{ type: 'requestPause', by: id }]); update({ armed: null }); }, { only: askers, label: 'Asked by' }),
      ]
      : null,
    h('button', { class: 'ghost', onclick: () => update({ armed: null }) }, 'Cancel'),
  );
}

/** Pause requests waiting for the host, shown on every game screen. */
export function pauseRequestsBanner(g: SavedGame): HTMLElement | null {
  const s = g.session;
  if (s.paused || !s.pauseRequests.length) return null;
  const host = nameOf(s, s.hostId);
  return h('div', { class: 'stack' }, s.pauseRequests.map((p) =>
    h('section', { class: 'note pause-req' },
      h('div', null, `⏸ ${nameOf(s, p)} asks to pause. ${host} (host):`),
      h('div', { class: 'row' },
        h('button', { class: 'secondary grow', onclick: () => { resetTap(); sendKeep(g, [{ type: 'respondPause', by: s.hostId, requester: p, approve: true, at: Date.now() }]); } }, 'Pause'),
        h('button', { class: 'ghost grow', onclick: () => sendKeep(g, [{ type: 'respondPause', by: s.hostId, requester: p, approve: false, at: Date.now() }]) }, 'Say no'),
      ),
    )));
}

const PAUSE_LIMITS: readonly { label: string; sec: number | null }[] = [
  { label: 'No limit', sec: null },
  { label: '1 min', sec: 60 },
  { label: '2 min', sec: 120 },
  { label: '5 min', sec: 300 },
];

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

/** The pause screen: covers everything (hands included) until the host resumes. */
export function pauseLayer(): HTMLElement | null {
  const g = getState().game;
  if (!g || !g.session.paused) return null;
  const s = g.session;
  const host = nameOf(s, s.hostId);
  let by: PlayerId | null = null;
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i]!.event;
    if (e.type === 'paused') { by = e.requestedBy; break; }
  }
  const limit = s.pauseTimeLimitSec;
  const left = limit !== null && s.pausedAt !== null
    ? Math.max(0, Math.ceil(limit - (Date.now() - s.pausedAt) / 1000))
    : null;
  return h('div', { class: 'overlay pause-overlay', role: 'dialog', 'aria-label': 'Paused' },
    h('div', { class: 'pause-box' },
      h('div', { class: 'pause-icon', 'aria-hidden': 'true' }, '⏸'),
      h('h1', null, 'Paused'),
      h('p', { class: 'muted' }, by ? `${nameOf(s, by)} asked, ${host} (host) said yes.` : `${host} (host) paused the game.`),
      left !== null ? h('div', { class: 'pause-clock', 'aria-live': 'polite' }, `Back in ${clock(left)}`) : null,
      h('button', { class: 'big', onclick: () => sendKeep(g, [{ type: 'resume', by: s.hostId }]) }, `▶ Resume (${host})`),
      h('p', { class: 'small' }, 'Host: pause time limit'),
      h('div', { class: 'chips center-chips' }, PAUSE_LIMITS.map((o) =>
        h('button', {
          class: o.sec === limit ? 'quick on' : 'quick',
          onclick: () => sendKeep(g, [{ type: 'setPauseTimeLimit', by: s.hostId, seconds: o.sec }]),
        }, o.label))),
    ),
  );
}

let pauseTimer: number | null = null;

/** While a timed pause is on, tick once a second (countdown, and resume at the limit). */
export function pauseTick(): void {
  const st = getState();
  const g = st.game;
  const timed = st.screen === 'game' && !!g?.session.paused && g.session.pauseTimeLimitSec !== null;
  if (!timed) {
    if (pauseTimer !== null) { window.clearTimeout(pauseTimer); pauseTimer = null; }
    return;
  }
  if (pauseTimer !== null) return;
  pauseTimer = window.setTimeout(() => {
    pauseTimer = null;
    const cur = getState().game;
    if (cur?.session.paused) sendKeep(cur, [{ type: 'tick', at: Date.now() }]);
  }, 1000);
}
