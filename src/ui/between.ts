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
import { nameOf, ownSeat, placeBadge, publicView, runsSession, send } from './game.ts';
import { icon, type IconName } from './icons.ts';
import { gameOverSaved } from './history.ts';
import { miniDisc, resetTap } from './roundstart.ts';
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

/** 9ak.4 (2.37): the award cards as plain labels and values (the results screen's Awards tab). */
export function awardCards(s: Session): { label: string; short: string }[] {
  return awards(s).map((a) => ({ label: a.label, short: a.short }));
}

/** 9ak.4 (2.37): the slapped-by table (who slapped each player most, and who they slapped most). */
export function slappedByTable(s: Session): HTMLElement {
  const t = computeTrivia(s.log, s.order);
  const who = (top: Top | null): Child => (top ? `${names(s, top.players)} ×${top.count}` : h('span', { class: 'muted' }, '—'));
  return h('table', { class: 'trivia-table' },
    h('thead', null, h('tr', null, h('th', null, 'Player'), h('th', null, 'Slapped by most'), h('th', null, 'Slapped most'))),
    h('tbody', null, s.order.map((id) => {
      const p = t.perPlayer[id]!;
      return h('tr', null, h('td', null, nameOf(s, id)), h('td', null, who(p.slappedByMost)), h('td', null, who(p.slappedMost)));
    })),
  );
}

export function triviaPanel(s: Session): HTMLElement {
  const rows: [string, string][] = awards(s).map((a) => [a.label, a.long]);
  return h('section', { class: 'panel trivia' },
    h('h2', null, 'Trivia'),
    rows.length
      ? h('ul', { class: 'trivia-list' }, rows.map(([label, text]) =>
        h('li', null, h('span', null, h('b', null, `${label}: `), text))))
      : h('p', { class: 'muted' }, 'No slaps yet. Suspiciously peaceful.'),
    slappedByTable(s),
  );
}

// ---------------------------------------------------------------------------
// Target score and Ultimate Round votes
// ---------------------------------------------------------------------------

let targetDraft = 10;
const TARGET_MAX = 99;

/**
 * 9aj.5 (2.36): the target score is proposed from a gold-ringed button in the top bar, which opens a
 * solid sheet (not a row on the screen). Shown wherever a target can be proposed, including before round 1
 * (round 1 starts in the dealing phase, so this must not hide it).
 */
export function targetButton(s: Session): HTMLElement | null {
  if (!targetVoteAllowed(s)) return null;
  return h('button', {
    class: 'icon-btn target-btn',
    'aria-label': 'Target score: propose one',
    onclick: () => update({ armed: 'target', menuOpen: false }),
  }, icon('target'));
}

/** Sheets that were on screen at the last redraw (9ak.1). */
import { sheetSeen } from './sheetseen.ts';
export { sheetSeen };

/**
 * 9aj.5 (2.36): the target sheet, drawn from the game screen like the take sheet.
 * Network: Propose sends the vote for this phone's player. One phone: Propose, then "Who is proposing?".
 */
export function targetSheet(s: Session, opts: { me?: PlayerId } = {}): HTMLElement | null {
  const st = getState();
  const open = targetVoteAllowed(s) && (st.armed === 'target' || st.armed === 'targetcaller');
  const seen = sheetSeen('target', open);
  if (!open) return null;
  const me = opts.me;
  const choosing = me === undefined && st.armed === 'targetcaller';
  const min = minimumTarget(s);
  if (targetDraft < min) targetDraft = Math.min(TARGET_MAX, min);
  const set = (n: number): void => { targetDraft = Math.max(min, Math.min(TARGET_MAX, n)); update({}); };
  const close = (): void => update({ armed: null });
  const propose = (by: PlayerId): void => {
    send([{ type: 'callVote', by, kind: 'target', value: targetDraft }]);
    update({ armed: null });
  };
  const body: Child = choosing
    ? [
      h('p', { class: 'small center' }, 'Who is proposing?'),
      h('div', { class: 'sheet-rows' }, s.order.map((id) =>
        h('button', { class: 'sheet-row', onclick: () => propose(id), 'aria-label': nameOf(s, id) },
          miniDisc(s, id, '40px'),
          h('span', { class: 'sheet-name' }, h('b', null, nameOf(s, id))),
          h('span', { class: 'ask-chip' }, 'Pick', icon('arrow'))))),
    ]
    : [
      // 9al.2 (2.37.1): the quick chips (5 / 10 / 15 / 20) are gone; − and + are the only controls.
      h('div', { class: 'stepper' },
        h('button', { class: 'secondary step', 'aria-label': 'One less', disabled: targetDraft <= min, onclick: () => set(targetDraft - 1) }, '−'),
        h('span', { class: 'step-value', 'aria-live': 'polite' }, `${targetDraft}`),
        h('button', { class: 'secondary step', 'aria-label': 'One more', disabled: targetDraft >= TARGET_MAX, onclick: () => set(targetDraft + 1) }, '+'),
      ),
      h('button', {
        class: 'big target-propose',
        onclick: () => (me === undefined ? update({ armed: 'targetcaller' }) : propose(me)),
      }, `Propose ${targetDraft} points`),
      h('p', { class: 'muted small center' }, `Everyone votes. First to ${targetDraft} points wins.`),
    ];
  return h('div', { class: seen ? 'overlay take-sheet-overlay seen' : 'overlay take-sheet-overlay' },
    h('section', { class: seen ? 'sheet take-sheet target-sheet seen' : 'sheet take-sheet target-sheet', role: 'dialog', 'aria-label': 'Target score' },
      h('span', { class: 'take-grab', 'aria-hidden': 'true' }),
      h('div', { class: 'sheet-head' },
        h('span', { class: 'take-icon-circle target-circle' }, icon('target')),
        h('div', null, h('h2', { class: 'take-title' }, 'Target score'), h('p', { class: 'take-sub' }, 'First to reach it wins the game'))),
      body,
      h('button', { class: 'ghost big', onclick: close }, 'Cancel'),
    ));
}

// ---------------------------------------------------------------------------
// Results screen
// ---------------------------------------------------------------------------

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
    scoreSheet(s),
    awardsRow(s),
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
  // 9ap.8 (2.38.2): the card is rebuilt on every redraw, so it is marked seen after its first draw (no replayed entrance).
  // Play waits for these answers (session.ts), so this overlay never stays open while cards are played.
  const seen = sheetSeen('take-prompt', asks.length > 0 && !!s.play);
  if (!asks.length || !s.play) return null;
  const nextPlace = s.play.finished.length + 1;
  const give = (requester: PlayerId): void => { send([{ type: 'answerTake', by: me, requester, accept: true }]); };
  const refuseAll = (): void => {
    send(asks.map((r) => ({ type: 'answerTake' as const, by: me, requester: r.requester, accept: false })));
  };
  // 9ai.5 (2.36): a solid card over a much darker screen. No tap to close: an answer is needed.
  const privateTag = h('p', { class: 'take-private' }, icon('eye'), ' Private · only you see this');
  const card: Child[] = asks.length > 1
    ? [
      h('h2', { class: 'take-title' }, `${asks.length} players want your cards`),
      h('p', { class: 'take-sub' }, `Pick one and you go out ${ordinal(nextPlace)}.`),
      h('div', { class: 'take-rows' }, asks.map((r) =>
        h('div', { class: 'take-row' },
          miniDisc(s, r.requester, '36px'),
          h('b', null, nameOf(s, r.requester)),
          h('button', { class: 'take-give-small', onclick: () => give(r.requester) }, 'Give')))),
      h('button', { class: 'big btn-outline-no', onclick: refuseAll }, 'Refuse everyone'),
      privateTag,
    ]
    : [
      h('div', { class: 'take-pair' },
        miniDisc(s, asks[0]!.requester, '56px'),
        h('span', { class: 'take-icon-circle' }, icon('take'))),
      h('h2', { class: 'take-title' }, `${nameOf(s, asks[0]!.requester)} wants your cards`),
      h('p', { class: 'take-sub' }, `Give them and you go out ${ordinal(nextPlace)}.`),
      privateTag,
      h('button', { class: 'big take-give', onclick: () => give(asks[0]!.requester) }, icon('check'), ` Give my cards to ${nameOf(s, asks[0]!.requester)}`),
      h('button', { class: 'big btn-outline-no', onclick: refuseAll }, 'Refuse'),
    ];
  return h('div', { class: seen ? 'overlay take-overlay seen' : 'overlay take-overlay' }, h('section', { class: 'take-card', role: 'alertdialog', 'aria-label': 'Take cards' }, card));
}

/**
 * Network game (2.5): on every phone not involved, a line for each take-cards
 * request still waiting ("Amy asked Ben for their cards…"). The cards never show.
 */
export function takeStatus(s: Session, me: PlayerId): HTMLElement | null {
  const waiting = s.takeRequests.filter((r) => !r.agreed && r.requester !== me && r.target !== me);
  if (!waiting.length) return null;
  // 9ai.5 (2.36): a solid card per request: the asker's disc, the line, and a Waiting pill.
  return h('div', { class: 'stack take-statuses' }, waiting.map((r) =>
    h('div', { class: 'take-status', role: 'status' },
      miniDisc(s, r.requester, '34px'),
      h('span', { class: 'take-status-text' }, `${nameOf(s, r.requester)} asked ${nameOf(s, r.target)} for their cards`),
      h('span', { class: 'pill wait' }, icon('wait'), ' Waiting'))));
}

/**
 * 9ai.5 (2.36): the sheet for picking someone to ask (or who is asking, on one phone).
 * A solid bottom sheet with one row per player; a tap on a row (or its Ask chip) does it.
 */
function askSheet(s: Session, title: string, ids: readonly PlayerId[], onPick: (id: PlayerId) => void, onCancel: () => void, showCards: boolean, seen = false): HTMLElement {
  const counts = publicView(s).players;
  // 9an.1 (2.38): a tap outside the sheet is the same as Cancel.
  return h('div', { class: seen ? 'overlay take-sheet-overlay seen' : 'overlay take-sheet-overlay', onclick: (e: Event) => { if (e.target === e.currentTarget) onCancel(); } },
    h('section', { class: seen ? 'sheet take-sheet seen' : 'sheet take-sheet', role: 'dialog', 'aria-label': title },
      h('span', { class: 'take-grab', 'aria-hidden': 'true' }),
      h('div', { class: 'sheet-head' },
        h('span', { class: 'take-icon-circle' }, icon('take')),
        h('div', null, h('h2', { class: 'take-title' }, title), h('p', { class: 'take-sub' }, 'Your lead · ask instead of playing'))),
      h('div', { class: 'sheet-rows' }, ids.map((id) => {
        const n = counts.find((p) => p.id === id)?.cardCount ?? 0;
        return h('button', { class: 'sheet-row', onclick: () => onPick(id), 'aria-label': `${showCards ? `Ask ${nameOf(s, id)} for ${n} cards` : nameOf(s, id)}` },
          miniDisc(s, id, '40px'),
          h('span', { class: 'sheet-name' }, h('b', null, nameOf(s, id)), showCards ? h('small', null, `${n} ${n === 1 ? 'card' : 'cards'}`) : null),
          h('span', { class: 'ask-chip' }, showCards ? 'Ask' : 'Pick', icon('arrow')));
      })),
      h('p', { class: 'muted small center' }, 'Only you see their answer.'),
      h('button', { class: 'ghost big', onclick: onCancel }, 'Cancel')));
}

/**
 * Players `p` may ask right now: only the player about to lead, before a trick,
 * with nothing of their own open (9an.1).
 */
function takeTargets(s: Session, p: PlayerId): PlayerId[] {
  const play = s.play;
  if (s.phase !== 'playing' || !play || play.over || s.paused || !betweenTricks(play)) return [];
  if (play.turn !== p) return [];
  if (s.takeRequests.some((r) => r.requester === p)) return [];
  return s.order.filter((q) => !takeAllowed(play, p, q));
}

/** Ask to take someone's cards (only the player about to lead, before a trick), and see or withdraw my request. */
export function takeControls(s: Session, me: PlayerId): HTMLElement | null {
  const play = s.play;
  const mine = s.takeRequests.filter((r) => r.requester === me);
  const targets = takeTargets(s, me);
  const choosing = getState().armed === 'take' && targets.length > 0;
  // 9an.1 item 8: a tap on a player first shows the confirm view in the same sheet (takePick).
  const pick = getState().takePick ?? null;
  const confirming = choosing && pick !== null && targets.includes(pick);
  // 9ak.1: the sheet's `seen` state is tracked on every redraw, so it resets when the sheet closes.
  const seen = sheetSeen('take', choosing && s.phase === 'playing' && !!play && !play.over && betweenTricks(play));
  if (s.phase !== 'playing' || !play || play.over || !betweenTricks(play)) return null;
  if (!mine.length && !choosing) return null;
  // 9ai.5 (2.36): your own request is a solid card with Withdraw; picking someone is a bottom sheet.
  return h('div', { class: 'stack' },
    mine.map((r) => h('div', { class: 'take-status mine', role: 'status' },
      miniDisc(s, me, '34px'),
      h('span', { class: 'take-status-text' },
        h('b', null, `You asked ${nameOf(s, r.target)}`),
        h('small', { class: 'muted' }, r.agreed ? 'Agreed' : 'Waiting for an answer')),
      h('button', { class: 'ghost', onclick: () => send([{ type: 'withdrawTake', by: me, target: r.target }], { stage: 'hand', holder: me }) }, 'Withdraw'))),
    choosing && confirming && pick !== null
      ? takeConfirmSheet(s, me, pick, seen)
      : choosing
        ? askSheet(s, 'Take whose cards?', targets,
          (id) => update({ takePick: id }),
          () => update({ armed: null, takePick: null }), true, seen)
        : null,
  );
}

/** 9an.1 item 8 (2.38): the confirm view for one player; nothing is sent until "Ask". */
function takeConfirmSheet(s: Session, me: PlayerId, target: PlayerId, seen: boolean): HTMLElement {
  const name = nameOf(s, target);
  const n = publicView(s).players.find((p) => p.id === target)?.cardCount ?? 0;
  const close = (): void => update({ armed: null, takePick: null });
  return h('div', { class: seen ? 'overlay take-sheet-overlay seen' : 'overlay take-sheet-overlay', onclick: (e: Event) => { if (e.target === e.currentTarget) close(); } },
    h('section', { class: seen ? 'sheet take-sheet take-confirm seen' : 'sheet take-sheet take-confirm', role: 'dialog', 'aria-label': `Take all of ${name}’s cards?` },
      h('span', { class: 'take-grab', 'aria-hidden': 'true' }),
      h('div', { class: 'take-confirm-disc' }, miniDisc(s, target, '64px')),
      h('h2', { class: 'take-title center' }, `Take all of ${name}’s cards?`),
      h('p', { class: 'muted small center' }, `${name} has ${n} ${n === 1 ? 'card' : 'cards'}. If they agree they go out and you lead the next trick.`),
      h('button', { class: 'big take-go', onclick: () => { send([{ type: 'requestTake', by: me, target }]); update({ takePick: null }); } }, `Ask ${name}`),
      h('button', { class: 'ghost big', onclick: () => update({ takePick: null }) }, 'Back'),
    ));
}

/** H6: the take-cards button in the top bar (before a trick, on the leader's own hand screen only, 9an.1). */
export function takeButton(g: SavedGame): HTMLElement | null {
  const s = g.session;
  if (s.phase !== 'playing' || !s.play || s.play.over || !betweenTricks(s.play) || s.paused) return null;
  if (g.stage !== 'hand') return null;
  if (takeTargets(s, g.holder).length === 0) return null;
  const open = getState().armed === 'take';
  return h('button', {
    class: open ? 'icon-btn on' : 'icon-btn',
    'aria-label': 'Ask to take someone’s cards',
    'aria-expanded': open ? 'true' : 'false',
    onclick: () => update({ armed: open ? null : 'take', menuOpen: false, takePick: null }),
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
