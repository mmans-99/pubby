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
import { minimumTarget, targetVoteAllowed } from '../session/session.ts';
import { computeTrivia, type Top } from '../session/trivia.ts';
import type { PlayerId, RoundRecord, Session, SessionPhase } from '../session/types.ts';
import { ordinal } from './cards.ts';
import { h, type Child } from './dom.ts';
import { scoreRows } from './scores.ts';
import { nameOf, ownSeat, placeBadge, runsSession, send } from './game.ts';
import { icon, type IconName } from './icons.ts';
import { gameOverSaved } from './history.ts';
import { resetTap } from './roundstart.ts';
import { hostClock } from './netplay.ts';
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
    }, on ? [icon('check'), ` ${nameOf(s, id)}`] : nameOf(s, id));
  }));
}

// ---------------------------------------------------------------------------
// Results table and trivia
// ---------------------------------------------------------------------------

/**
 * CODE.md 9ad.4 (2.34): every player's points for each round, and the total.
 * Returns null when no normal round has been played yet.
 */
export function scoreSheet(s: Session, opts: { me?: PlayerId } = {}): HTMLElement | null {
  const rounds = s.rounds.filter((r) => !r.ultimate);
  if (!rounds.length) return null;
  const lastIndex = rounds.length - 1;
  const last = rounds[lastIndex]!;
  const lostLast = (id: PlayerId): boolean => !last.sharedSecondLast && last.finishingOrder[last.finishingOrder.length - 1] === id;
  return h('section', { class: 'panel score-sheet', 'aria-label': 'Points table', 'data-scroll': 'scores' },
    h('table', { class: 'results' },
      h('thead', null, h('tr', null,
        h('th', null, '#'), h('th', null, 'Player'),
        rounds.map((r) => h('th', null, `R${r.round}`)),
        h('th', null, 'Total'))),
      h('tbody', null, scoreRows(s).map((row) => h('tr', { class: row.id === opts.me ? 'me-row' : '' },
        h('td', null, row.place),
        h('td', null, nameOf(s, row.id),
          s.ultimateLabels?.winner === row.id ? h('span', { class: 'tag gold' }, 'Ultimate Winner') : null,
          s.ultimateLabels?.losers.includes(row.id) ? h('span', { class: 'tag' }, 'Ultimate Loser') : null),
        row.points.map((p, i) => h('td', { class: i === lastIndex && lostLast(row.id) ? 'lost' : '' }, signed(p))),
        h('td', null, h('b', null, String(row.total)))))),
    ),
  );
}

function topText(s: Session, t: Top, unit: (n: number) => string): string {
  return `${names(s, t.players)} (${unit(t.count)})`;
}

const times = (n: number): string => `${n} ${n === 1 ? 'time' : 'times'}`;

interface Award { label: string; short: string; long: string }

/** Trivia as awards: a short value for the award cards, a long one for "More". */
function awards(s: Session): Award[] {
  const t = computeTrivia(s.log, s.order);
  const out: Award[] = [];
  const add = (label: string, top: Top | null, unit: (n: number) => string): void => {
    if (top) out.push({ label, short: `${names(s, top.players)} ×${top.count}`, long: topText(s, top, unit) });
  };
  add('Most slapped', t.mostSlapped, times);
  add('Top slapper', t.mostSlapper, (n) => `${n} ${n === 1 ? 'slap' : 'slaps'}`);
  if (t.rivals.length) {
    out.push({
      label: 'Rivals',
      short: `${nameOf(s, t.rivals[0]!.slapper)} → ${nameOf(s, t.rivals[0]!.slapped)}`,
      long: t.rivals.map((r) => `${nameOf(s, r.slapper)} slaps ${nameOf(s, r.slapped)} most (${times(r.count)})`).join(' · '),
    });
  }
  add('Fighting for survival', t.alwaysFightingForSurvival, (n) => `bottom two ${times(n)}`);
  add('Biggest pick-up', t.biggestPickUp, (n) => `${n} ${n === 1 ? 'card' : 'cards'} in one slap`);
  add('Most forfeits', t.mostForfeits, (n) => String(n));
  add('Most reshuffles called', t.mostReshuffleVotes, (n) => String(n));
  add('Slowest reaction', t.slowestReaction, (n) => `${n} ms`);
  return out;
}

/** R2: the first three awards as small cards; "More" opens the rest and the slapped-by table. */
export function awardsRow(s: Session): HTMLElement {
  const list = awards(s);
  const open = getState().armed === 'trivia';
  if (!list.length) return h('p', { class: 'muted small center' }, 'No slaps yet. Suspiciously peaceful.');
  return h('div', { class: 'stack' },
    h('div', { class: 'awards' },
      list.slice(0, 3).map((a) => h('div', { class: 'award' }, h('b', null, a.label), a.short)),
      h('button', { class: 'award more', 'aria-expanded': open ? 'true' : 'false', onclick: () => update({ armed: open ? null : 'trivia' }) },
        h('b', null, open ? 'Less' : 'More'), open ? 'Hide' : `${Math.max(0, list.length - 3)} more`),
    ),
    open ? triviaPanel(s) : null,
  );
}

export function triviaPanel(s: Session): HTMLElement {
  const t = computeTrivia(s.log, s.order);
  const rows: [string, string][] = awards(s).map((a) => [a.label, a.long]);

  const who = (top: Top | null): Child => (top ? `${names(s, top.players)} ×${top.count}` : h('span', { class: 'muted' }, '—'));
  return h('section', { class: 'panel trivia' },
    h('h2', null, 'Trivia'),
    rows.length
      ? h('ul', { class: 'trivia-list' }, rows.map(([label, text]) =>
        h('li', null, h('span', null, h('b', null, `${label}: `), text))))
      : h('p', { class: 'muted' }, 'No slaps yet. Suspiciously peaceful.'),
    h('table', { class: 'trivia-table' },
      h('thead', null, h('tr', null, h('th', null, 'Player'), h('th', null, 'Slapped by most'), h('th', null, 'Slapped most'))),
      h('tbody', null, s.order.map((id) => {
        const p = t.perPlayer[id]!;
        return h('tr', null, h('td', null, nameOf(s, id)), h('td', null, who(p.slappedByMost)), h('td', null, who(p.slappedMost)));
      })),
    ),
  );
}

// ---------------------------------------------------------------------------
// Target score and Ultimate Round votes
// ---------------------------------------------------------------------------

let targetDraft = 10;
const TARGET_MAX = 99;

/**
 * T1: the target score as one slim row ("Target score · none · Propose"),
 * on the before-the-round screen in round 1 and on the results screen.
 * Propose opens the points picker, then "who is proposing?".
 */
export function targetRow(s: Session, opts: { me?: PlayerId } = {}): HTMLElement | null {
  const allowed = targetVoteAllowed(s);
  if (!allowed && s.target === null) return null;
  const st = getState();
  const open = allowed && (st.armed === 'target' || st.armed === 'targetcaller');
  // Network game (2.5): every phone proposes for its own player, so there's no "who is proposing?" step.
  const me = opts.me;
  const choosing = me === undefined && st.armed === 'targetcaller';
  const min = minimumTarget(s);
  if (targetDraft < min) targetDraft = Math.min(TARGET_MAX, min);
  const set = (n: number): void => { targetDraft = Math.max(min, Math.min(TARGET_MAX, n)); update({}); };
  return h('section', { class: open ? 'slim-panel open' : 'slim-panel' },
    h('div', { class: 'slim' },
      icon('target'), h('span', null, 'Target score'),
      h('span', { class: 'v' }, s.target !== null ? `${s.target} points` : 'none'),
      allowed && !open ? h('button', { class: 'act', onclick: () => update({ armed: 'target' }) }, 'Propose') : null,
      open ? h('button', { class: 'act ghost-act', onclick: () => update({ armed: null }) }, 'Cancel') : null,
    ),
    open
      ? [
        h('div', { class: 'stepper' },
          h('button', { class: 'secondary step', 'aria-label': 'One less', onclick: () => set(targetDraft - 1) }, '−'),
          h('span', { class: 'step-value', 'aria-live': 'polite' }, `${targetDraft}`),
          h('button', { class: 'secondary step', 'aria-label': 'One more', onclick: () => set(targetDraft + 1) }, '+'),
        ),
        h('div', { class: 'chips center-chips' }, [5, 10, 15, 20].filter((n) => n >= min).map((n) =>
          h('button', { class: n === targetDraft ? 'quick on' : 'quick', onclick: () => set(n) }, String(n)))),
        me !== undefined
          ? h('button', {
            class: 'secondary',
            onclick: () => { send([{ type: 'callVote', by: me, kind: 'target', value: targetDraft }]); update({ armed: null }); },
          }, `Propose ${targetDraft} points`)
          : choosing
            ? [h('p', { class: 'small center' }, 'Who is proposing?'),
              nameChips(s, (id) => send([{ type: 'callVote', by: id, kind: 'target', value: targetDraft }]), { label: 'Proposed by' })]
            : h('button', { class: 'secondary', onclick: () => update({ armed: 'targetcaller' }) }, `Propose ${targetDraft} points`),
      ]
      : null,
  );
}

/** Kept for older callers: the target row. */
export const targetPanel = targetRow;

// ---------------------------------------------------------------------------
// Results screen
// ---------------------------------------------------------------------------

/** R1: places as a podium (1st, 2nd, Last for three; top three and a short list for more). */
export function podium(s: Session, rec: RoundRecord): HTMLElement {
  const order = rec.finishingOrder;
  const n = order.length;
  const place = (i: number): number | 'last' => (i === n - 1 ? 'last' : i + 1);
  const pts = (id: PlayerId): string => rec.ultimate ? `${rec.totals[id] ?? 0}` : `${signed(rec.points[id] ?? 0)} · ${rec.totals[id] ?? 0}`;
  const step = (i: number): HTMLElement => {
    const id = order[i]!;
    const p = place(i);
    return h('div', { class: `step ${i === 0 ? 'p1' : p === 'last' ? 'plast' : `p${i + 1}`}` },
      placeBadge(p),
      h('span', { class: 'step-name' }, nameOf(s, id)),
      h('small', null, pts(id)),
      rec.forfeitedBy === id ? h('small', { class: 'forfeit' }, 'forfeit') : null);
  };
  const top = n <= 3 ? order.map((_, i) => i) : [0, 1, 2];
  const visual = top.length === 3 ? [top[1]!, top[0]!, top[2]!] : top.length === 2 ? [top[1]!, top[0]!] : top;
  const rest = n > 3 ? order.slice(3).map((id, k) => {
    const i = k + 3;
    return h('li', null, placeBadge(place(i)), h('span', { class: 'grow' }, nameOf(s, id), rec.forfeitedBy === id ? h('small', { class: 'forfeit' }, ' forfeit') : null), h('span', { class: 'muted' }, pts(id)));
  }) : [];
  return h('section', { class: 'podium-wrap', 'aria-label': `Results: ${order.map((id, i) => `${p2s(place(i))} ${nameOf(s, id)}`).join(', ')}` },
    h('div', { class: 'podium' }, visual.map(step)),
    rest.length ? h('ol', { class: 'rest-list' }, rest) : null,
    h('p', { class: 'muted small center' }, rec.ultimate ? 'Total' : 'Round · total'),
  );
}

const p2s = (p: number | 'last'): string => (p === 'last' ? 'Last' : ordinal(p));

/** R4: Ultimate Round button next to Next round; tap it, then pick who is calling. */
function ultimateCall(s: Session): HTMLElement | null {
  if (s.ultimateRound || getState().armed !== 'ultimatecaller') return null;
  return h('section', { class: 'panel' },
    h('p', { class: 'small center' }, s.order.length === 2 ? 'Who is asking for the Ultimate Round?' : 'Who is calling the Ultimate Round vote?'),
    nameChips(s, (id) => send([{ type: 'callVote', by: id, kind: 'ultimate' }]), { label: 'Called by' }),
    h('button', { class: 'ghost', onclick: () => update({ armed: null }) }, 'Cancel'),
  );
}

export function resultsStage(g: SavedGame): Child {
  const s = g.session;
  const rec = s.rounds[s.rounds.length - 1];
  if (!rec) return h('p', null, 'No results yet.');
  const armed = getState().armed === 'endsession';
  const host = nameOf(s, s.hostId);
  const ready = (id: PlayerId): void => {
    if (s.ready.includes(id)) return;
    send([{ type: 'readyUp', by: id }]);
  };
  return h('div', { class: 'stack' },
    h('h2', { class: 'center results-head' }, icon('trophy'), ` ${nameOf(s, rec.finishingOrder[0])} wins ${rec.ultimate ? 'the Ultimate Round' : `round ${rec.round}`}`),
    s.ultimateRound ? h('p', { class: 'center' }, h('span', { class: 'chip-info gold' }, icon('bolt'), ' Next: Ultimate Round')) : null,
    podium(s, rec),
    scoreSheet(s),
    awardsRow(s),
    targetRow(s),
    h('div', { class: 'ready-row', 'aria-label': 'Ready' }, h('span', { class: 'muted small' }, 'Ready'), nameChips(s, ready, { on: s.ready, label: 'Ready:' })),
    ultimateCall(s),
    h('div', { class: 'row' },
      h('button', { class: 'big grow', onclick: () => send([{ type: 'advance', by: s.hostId }]) },
        icon('play'), s.ultimateRound ? ` Start the Ultimate Round · ${host}` : ` Next round · ${host}`),
      !s.ultimateRound
        ? h('button', { class: getState().armed === 'ultimatecaller' ? 'secondary ultimate-btn on' : 'secondary ultimate-btn', 'aria-label': 'Ultimate Round', onclick: () => update({ armed: getState().armed === 'ultimatecaller' ? null : 'ultimatecaller' }) }, icon('bolt'), ' Ultimate')
        : null,
    ),
    h('button', {
      class: armed ? 'danger' : 'ghost',
      onclick: () => {
        if (!armed) { update({ armed: 'endsession' }); return; }
        send([{ type: 'endSession', by: s.hostId }]);
      },
    }, armed ? `Tap again: ${host} ends the game` : `End the game · ${host}`),
  );
}

/** Shown under "Pass the phone to X" while a results-screen vote goes round. */
export function resultsSummary(s: Session): HTMLElement | null {
  if (s.phase !== 'results') return null;
  const rec = s.rounds[s.rounds.length - 1];
  return rec ? podium(s, rec) : null;
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
    : end.reason === 'drawDeclined' ? 'A draw, and nobody wanted the Ultimate Round. The top score is shared.'
    : `${nameOf(s, s.hostId)} (host) ended the game. Highest score wins.`;
  return h('div', { class: 'stack' },
    h('div', { class: 'banner' },
      h('div', { class: 'banner-big' }, end.reason === 'drawDeclined'
        ? `Draw: ${names(s, end.winners)} share the top score`
        : `${names(s, end.winners)} ${end.winners.length > 1 ? 'win' : 'wins'} the game`),
      h('div', { class: 'small' }, why),
    ),
    labels
      ? h('section', { class: 'panel titles' },
        labels.winner ? h('div', { class: 'title-line' }, icon('crown'), ' Ultimate Winner: ', h('b', null, nameOf(s, labels.winner))) : null,
        labels.losers.length ? h('div', { class: 'title-line' }, placeBadge('last'), ` Ultimate ${labels.losers.length > 1 ? 'Losers' : 'Loser'}: `, h('b', null, names(s, labels.losers))) : null,
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
    scoreSheet(s),
    last?.ultimate ? [h('h2', { class: 'center' }, 'Ultimate Round'), podium(s, last)] : null,
    awardsRow(s),
    h('p', { class: 'muted small center' }, `${s.rounds.length} ${s.rounds.length === 1 ? 'round' : 'rounds'} played.`),
    gameOverSaved(g.recordId),
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
    h('h2', null, icon('take'), asks.length > 1 ? ` ${who} all want your cards` : ` ${who} wants your cards`),
    h('p', { class: 'small' }, `Give them and you go out ${ordinal(nextPlace)}. Private.`),
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

/**
 * Network game (2.5): on every phone not involved, a line for each take-cards
 * request still waiting ("Amy asked Ben for their cards…"). The cards never show.
 */
export function takeStatus(s: Session, me: PlayerId): HTMLElement | null {
  const waiting = s.takeRequests.filter((r) => !r.agreed && r.requester !== me && r.target !== me);
  if (!waiting.length) return null;
  return h('div', { class: 'stack' }, waiting.map((r) =>
    h('div', { class: 'host-line', role: 'status' }, icon('take'),
      h('span', null, `${nameOf(s, r.requester)} asked ${nameOf(s, r.target)} for their cards…`))));
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
  const choosing = getState().armed === 'take' && targets.length > 0;
  if (!mine.length && !choosing) return null;
  return h('section', { class: 'panel take-panel' },
    mine.map((r) => h('div', { class: 'row take-mine' },
      h('span', { class: 'grow small' }, icon('take'), ` ${nameOf(s, r.target)}: `,
        h('b', null, r.agreed ? 'agreed' : 'waiting')),
      h('button', { class: 'ghost', onclick: () => send([{ type: 'withdrawTake', by: me, target: r.target }], { stage: 'hand', holder: me }) }, 'Withdraw'))),
    choosing
      ? [
        h('p', { class: 'small' }, 'Take all the cards of:'),
        nameChips(s, (id) => send([{ type: 'requestTake', by: me, target: id }]), { only: targets, label: 'Ask' }),
        h('button', { class: 'ghost', onclick: () => update({ armed: null }) }, 'Cancel'),
      ]
      : null,
  );
}

/** On the hand-off screen before a trick: pick who is asking, then the phone goes to them in private. */
export function askToTake(g: SavedGame): HTMLElement | null {
  const s = g.session;
  const askers = s.order.filter((p) => takeTargets(s, p).length > 0);
  if (!askers.length || getState().armed !== 'asker') return null;
  return h('section', { class: 'panel take-panel' },
    h('p', { class: 'small' }, 'Who wants to take cards?'),
    nameChips(s, (id) => update({ game: { ...g, stage: 'hand', holder: id }, armed: 'take' }), { only: askers, label: 'Asking:' }),
    h('button', { class: 'ghost', onclick: () => update({ armed: null }) }, 'Cancel'),
  );
}

/** H6: the take-cards button in the top bar (before a trick, when someone can ask). */
export function takeButton(g: SavedGame): HTMLElement | null {
  const s = g.session;
  if (s.phase !== 'playing' || !s.play || s.play.over || !betweenTricks(s.play) || s.paused) return null;
  const onHand = g.stage === 'hand';
  const can = onHand ? takeTargets(s, g.holder).length > 0 : s.order.some((p) => takeTargets(s, p).length > 0);
  if (!can) return null;
  const mode = onHand ? 'take' : 'asker';
  const open = getState().armed === mode;
  return h('button', {
    class: open ? 'icon-btn on' : 'icon-btn',
    'aria-label': onHand ? 'Ask to take someone’s cards' : 'Someone wants to take cards',
    'aria-expanded': open ? 'true' : 'false',
    onclick: () => update({ armed: open ? null : mode, menuOpen: false }),
  }, icon('take'));
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

const ROUND_PHASES: readonly SessionPhase[] = ['dealing', 'reshuffle', 'swap', 'cardCheck', 'leadNotice', 'reactionTap', 'chooseLeader', 'playing'];

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
  return h('button', { class: open ? 'icon-btn on' : 'icon-btn', 'aria-label': 'Pause', 'aria-expanded': open ? 'true' : 'false', onclick: () => update({ armed: open ? null : 'pause', menuOpen: false }) }, icon('pause'));
}

/**
 * Network game (2.5): the host's pause button pauses straight away; any other
 * phone asks the host (its button shows "Asked" while the request waits).
 */
export function netPauseButton(g: SavedGame): HTMLElement | null {
  const s = g.session;
  if (!canPause(s)) return null;
  const me = ownSeat(g)!;
  if (me === s.hostId) {
    return h('button', {
      class: 'icon-btn',
      'aria-label': 'Pause',
      onclick: () => { resetTap(); sendKeep(g, [{ type: 'pause', by: me, at: Date.now() }]); },
    }, icon('pause'));
  }
  const asked = s.pauseRequests.includes(me);
  const open = getState().armed === 'askpause';
  return h('button', {
    class: asked || open ? 'icon-btn on' : 'icon-btn',
    'aria-label': asked ? 'Pause asked: waiting for the host' : 'Ask the host to pause',
    'aria-expanded': open ? 'true' : 'false',
    onclick: () => { if (!asked) update({ armed: open ? null : 'askpause', menuOpen: false }); },
  }, icon('pause'));
}

/** Network game (2.5): a phone other than the host's asks the host to pause. */
export function askPausePanel(g: SavedGame): HTMLElement | null {
  const s = g.session;
  const me = ownSeat(g);
  if (!me || me === s.hostId || getState().armed !== 'askpause' || !canPause(s)) return null;
  return h('div', { class: 'panel menu' },
    h('p', { class: 'small center' }, `Ask ${nameOf(s, s.hostId)} (host) to pause?`),
    h('button', {
      class: 'big',
      onclick: () => { sendKeep(g, [{ type: 'requestPause', by: me }]); update({ armed: null }); },
    }, icon('pause'), ' Ask to pause'),
    h('button', { class: 'ghost', onclick: () => update({ armed: null }) }, 'Cancel'),
  );
}

/** Network game (2.5): what every other phone says while the host is deciding about a pause. */
function hostDecidingLine(text: string): HTMLElement {
  return h('div', { class: 'host-line', role: 'status' }, icon('wait'), h('span', null, text));
}

export function pausePanel(g: SavedGame): HTMLElement | null {
  const s = g.session;
  if (ownSeat(g) || getState().armed !== 'pause' || !canPause(s)) return null;
  const host = nameOf(s, s.hostId);
  const askers = s.order.filter((p) => p !== s.hostId && !s.pauseRequests.includes(p));
  return h('div', { class: 'panel menu' },
    h('button', {
      class: 'big',
      onclick: () => { resetTap(); sendKeep(g, [{ type: 'pause', by: s.hostId, at: Date.now() }]); update({ armed: null }); },
    }, icon('pause'), ` Pause now · ${host}`),
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
  const me = ownSeat(g);
  if (me && me !== s.hostId) {
    return hostDecidingLine(`${host} (host) is deciding: ${names(s, s.pauseRequests)} asked to pause`);
  }
  return h('div', { class: 'stack' }, s.pauseRequests.map((p) =>
    h('section', { class: 'note pause-req' },
      h('div', null, icon('pause'), ` ${nameOf(s, p)} asks to pause. ${host}:`),
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
  // The countdown runs on the host's clock, so every phone shows the same time (2.5).
  const left = limit !== null && s.pausedAt !== null
    ? Math.max(0, Math.ceil(limit - (hostClock() - s.pausedAt) / 1000))
    : null;
  // Network game: only the host resumes or sets the limit; the other phones see a host line.
  const seat = ownSeat(g);
  const hostOnly = !!seat && seat !== s.hostId;
  return h('div', { class: 'overlay pause-overlay', role: 'dialog', 'aria-label': 'Paused' },
    h('div', { class: 'pause-box' },
      h('div', { class: 'pause-icon' }, icon('pause')),
      h('h1', null, 'Paused'),
      h('p', { class: 'muted' }, by ? `${nameOf(s, by)} asked, ${host} (host) said yes.` : `${host} (host) paused the game.`),
      left !== null ? h('div', { class: 'pause-clock', 'aria-live': 'polite' }, `Back in ${clock(left)}`) : null,
      hostOnly
        ? hostDecidingLine(`${host} (host) is deciding when to carry on`)
        : [
          h('button', { class: 'big', onclick: () => sendKeep(g, [{ type: 'resume', by: s.hostId }]) }, icon('play'), ` Resume · ${host}`),
          h('p', { class: 'small' }, 'Host: pause time limit'),
          h('div', { class: 'chips center-chips' }, PAUSE_LIMITS.map((o) =>
            h('button', {
              class: o.sec === limit ? 'quick on' : 'quick',
              onclick: () => sendKeep(g, [{ type: 'setPauseTimeLimit', by: s.hostId, seconds: o.sec }]),
            }, o.label))),
        ],
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
    if (!cur?.session.paused) return;
    // Network game: only the host's phone ends a timed pause; other phones just redraw the countdown.
    if (!runsSession(cur)) { update({}); return; }
    sendKeep(cur, [{ type: 'tick', at: Date.now() }]);
  }, 1000);
}
