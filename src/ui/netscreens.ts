/**
 * Game screens for a network game (Phase 4 slice 2, CODE.md section 9j).
 * Every phone shows its own player: no pass-the-phone screens. Dealing and
 * playing reuse the pass-and-play screens (game.ts); the round-start steps
 * each phone answers for itself (roundstart.ts `netRoundStart`).
 *
 * Slice 3 (2.5): between rounds, every phone can call a reshuffle vote, propose
 * a target and ask for the Ultimate Round, and each phone readies its own
 * player. The host still starts each round and moves on. A phone that drops
 * can't rejoin yet (slice 4).
 */

import { h, type Child } from './dom.ts';
import { icon } from './icons.ts';
import type { SavedGame } from './storage.ts';
import type { PlayerId, Session, SessionAction } from '../session/types.ts';
import { joinNames } from '../session/names.ts';
import { isAwayPlayer } from '../net/away.ts';
import { getState, update } from './store.ts';
import { chooseLeaderStage, dealingStage, fastForwardMenuItems, gameFrame, handBlock, isHostSeat, nameOf, noticeStage, ownSeat, playHandStage, publicView, reactionsToggle, send, stageLayout } from './game.ts';
import { miniDisc, netRoundStart } from './roundstart.ts';
import { awardCards, gameOverStage, scoreSheet, slappedByTable } from './between.ts';
import { ordinal } from './cards.ts';
import { scoreRows } from './scores.ts';
import { playerView } from '../session/view.ts';
import { netSeats } from './netlobby.ts';
import { voiceMenuItem } from './voicetable.ts';
import { removeSheet, clockText } from './removesheet.ts';
import { HINT_AWAY_MS, HINT_TURN_MS, hostClock, linkIdOf, playerOfLink, turnIdleMs } from './netplay.ts';
import { roundTable, wastePile } from './table.ts';
import { seatName } from '../net/lobby.ts';

/**
 * The screens of a network game, and of single player against the computer
 * (CODE.md 9m.6): this phone shows its own player only.
 */
export function netGameBody(g: SavedGame): Child {
  const s = g.session;
  const me = ownSeat(g)!;
  const rs = netRoundStart(g, me);
  let body: Child;
  if (rs) body = rs;
  else {
    switch (s.phase) {
      case 'dealing': body = dealingStage(g); break;
      case 'reshuffle': body = beforeRound(g); break;
      case 'chooseLeader': body = s.previous?.winner === me ? chooseLeaderStage(g) : waitingFor(g, `${nameOf(s, s.previous?.winner)} picks who leads`); break;
      case 'leadNotice': body = noticeStage(g); break;
      case 'playing': body = playHandStage(g); break;
      case 'results': body = results(g); break;
      case 'gameOver': body = gameOverStage(g); break;
      default: body = waitingFor(g, 'Waiting…');
    }
  }
  // 9ad.2 (2.34): on a game screen the notice floats inside the table area, so it never pushes the rows.
  const notice = connectionNotice(g);
  const sheet = removeSheet(g); // CODE.md 9an.8: the host's "Remove from game" sheet
  const frame = body instanceof HTMLElement && body.classList.contains('game-frame') ? body : null;
  const slot = frame?.querySelector('.game-table-slot');
  if (sheet && frame) frame.appendChild(sheet);
  if (notice && slot) { slot.appendChild(notice); return body; }
  return sheet && !frame ? [notice, body, sheet] : [notice, body]; // screens that scroll (results, waiting) keep it on top
}

/**
 * A phone is away or lost its link: the game waits for it. CODE.md 9an.8 (H-h, H-i): on the host's phone
 * the notice has a Remove button (it opens the sheet), and a hint appears when someone has not moved on
 * their turn for 90 seconds. Joining phones only see that the host is waiting.
 */
function connectionNotice(g: SavedGame): HTMLElement | null {
  if (!g.net || g.session.ended) return null;
  const host = g.net.role === 'host';
  const seats = (netSeats() ?? []).filter((x) => !x.isHost && !x.removed);
  const playerOf = (linkId: string): PlayerId | null => playerOfLink(linkId);
  const removeButton = (linkId: string): Child => {
    const p = playerOf(linkId);
    return p ? h('button', { class: 'link-btn', onclick: () => update({ armed: `remove:${p}` }) }, 'Remove') : null;
  };
  const away = seats.filter((x) => x.awaySince !== undefined);
  if (away.length) {
    const names = away.map(seatName).join(', ');
    const tail: Child[] = host ? [' · ', removeButton(away[0]!.id)] : [' · waiting for them'];
    // H-h: after 2 minutes the host's hint shows how long the seat has been away.
    const first = away[0]!;
    const longest = hostClock() - Math.min(...away.map((x) => x.awaySince!));
    const timed = host && away.length === 1 && longest >= HINT_AWAY_MS;
    return h('p', { class: 'note warn net-lost table-notice', role: 'status' },
      timed ? `${seatName(first)} has been away ${clockText(longest)}` : `${names} ${away.length === 1 ? 'is' : 'are'} away`, ...tail);
  }
  const gone = seats.filter((x) => !x.connected);
  if (gone.length) {
    const who = gone.map(seatName).join(', ');
    return h('p', { class: 'note warn net-lost table-notice', role: 'status' },
      `${who} lost connection`, ...(host ? [' · ', removeButton(gone[0]!.id)] : [' · waiting for the host'] as Child[]));
  }
  // H-h: the hint for a turn that has not moved for 90 seconds (host only, never for computer players).
  const turn = g.session.play?.turn;
  if (host && turn && g.session.phase === 'playing' && !g.session.players.find((x) => x.id === turn)?.computer) {
    const idle = turnIdleMs(turn);
    if (idle !== null && idle >= HINT_TURN_MS) {
      const linkId = linkIdOf(turn);
      return h('p', { class: 'note warn net-lost table-notice', role: 'status' },
        `${nameOf(g.session, turn)} hasn't moved for ${clockText(idle)}`, ' · ', linkId ? removeButton(linkId) : null);
    }
  }
  return null;
}

/**
 * 2.4: on the other phones whenever the host is the one deciding
 * ("Cat (host) is deciding: next round or end the game").
 */
export function hostLine(text: string): HTMLElement {
  return h('div', { class: 'host-line', role: 'status' }, icon('wait'), h('span', null, text));
}

function hostDeciding(s: Session, what: string): HTMLElement {
  return hostLine(`${nameOf(s, s.hostId)} (host) is deciding: ${what}`);
}

function waitingFor(g: SavedGame, text: string): Child {
  const s = g.session;
  const me = ownSeat(g)!;
  return h('div', { class: 'stack' },
    roundTable(s, publicView(s), { bottom: me, waste: wastePile(0), you: true }),
    h('p', { class: 'hint center wait-line' }, text),
    handBlock(s, playerView(s, me), null, { head: false }),
  );
}

/**
 * After the deal: everyone looks at their own cards. Every phone can call a
 * reshuffle vote (2.5); the host starts the round.
 */
function beforeRound(g: SavedGame): Child {
  const s = g.session;
  const me = ownSeat(g)!;
  const host = isHostSeat(g);
  const v = publicView(s);
  // 2.29: a fixed game screen: the table, your hand, the buttons; the target row floats over the table.
  const lay = stageLayout(true, 52);
  // 9an.4 (2.38): in a network game the round waits until everyone has kept their cards (or voted).
  const waiting = v.keepOn ? v.keepWaiting : [];
  const iKept = v.kept.includes(me);
  const awayWaiting = waiting.filter((p) => isAwayPlayer(p));
  const keepRow = v.keepOn && !host && !iKept
    ? h('button', { class: 'keep-go grow', onclick: () => send([{ type: 'keepCards', by: me }]) }, icon('hand'), ' Keep my cards')
    : null;
  const deal = v.canCallReshuffle
    ? h('button', {
      class: 'secondary grow',
      'aria-label': 'Deal again? Call a reshuffle vote',
      onclick: () => send([{ type: 'callVote', by: me, kind: 'reshuffle' }]),
    }, icon('shuffle'), ' Deal again?')
    : h('button', { class: 'secondary grow', disabled: true, 'aria-label': 'Deal again: already used this round' }, icon('shuffle'), ' Used');
  const startBtn = host
    ? h('button', {
      class: 'big grow',
      disabled: waiting.length > 0,
      // 9aq.18 A: the button says how many; the names are in the label for screen readers and in the seat strip.
      'aria-label': waiting.length ? `Start the round: waiting for ${joinNames(waiting.map((p) => nameOf(s, p)))}` : 'Start the round',
      onclick: () => send([{ type: 'startRound', by: s.hostId }]),
    }, icon('play'), waiting.length ? ` Waiting for ${waiting.length}` : ' Start')
    : null;
  // The host can start without a player who is away; they count as kept.
  const skipBtn = host && awayWaiting.length
    ? h('button', {
      class: 'secondary grow',
      onclick: () => send([{ type: 'startRound', by: s.hostId, skip: awayWaiting }]),
    }, `Start without ${joinNames(awayWaiting.map((p) => nameOf(s, p)))}`)
    : null;
  return gameFrame(lay, {
    table: roundTable(s, v, { bottom: me, waste: wastePile(0), you: true, box: lay.box }),
    hand: handBlock(s, playerView(s, me), null, { head: false, fit: lay.handH, width: lay.handW }),
    action: h('div', { class: 'row round-buttons' },
      keepRow,
      deal,
      startBtn,
      skipBtn,
    ),
    // 9aj.5 (2.36): the target is proposed from the top bar (targetButton), not a row here.
    extra: [
      host ? null : hostDeciding(s, 'when to start the round'),
      iKept && v.keepOn && !host ? h('p', { class: 'note good center', role: 'status' }, 'You kept your cards') : null,
    ],
    extraAt: 'top',
  });
}

/** 9ak.4 (2.37): the results tab (Places, Points or Awards). Back to Places when the round changes. */
type ResultsTab = 'places' | 'points' | 'awards';
let resultsTab: ResultsTab = 'places';
let resultsTabRound = -1;

const signedPts = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/**
 * 9ak.4 (2.37): results screen B. A column: the winner card, three tabs and the scrolling body on top;
 * a fixed footer (ready discs, the ready button, Next round, Ultimate vote and End the game) below.
 * The footer stays put while the body scrolls, so the buttons never move under a finger.
 */
function results(g: SavedGame): Child {
  const s = g.session;
  const me = ownSeat(g)!;
  const rec = s.rounds[s.rounds.length - 1];
  if (!rec) return h('p', null, 'No results yet.');
  if (resultsTabRound !== rec.round) { resultsTab = 'places'; resultsTabRound = rec.round; }
  const host = isHostSeat(g);
  const armed = getState().armed === 'endsession';
  // 2.20 (Part C): the host's button waits for every other player to be ready.
  const missingOthers = s.waitForAll ? s.order.filter((p) => p !== s.hostId && !s.ready.includes(p)) : [];
  const winner = rec.finishingOrder[0];
  const myIndex = rec.finishingOrder.indexOf(me);
  const myRow = scoreRows(s).find((r) => r.id === me);
  // Points only count for normal rounds (the Ultimate Round is outside the score).
  const myPts = !rec.ultimate && myRow ? myRow.points[myRow.points.length - 1] : undefined;
  const youCame = myIndex >= 0 ? `You came ${ordinal(myIndex + 1)}${myPts !== undefined ? ` · ${signedPts(myPts)}` : ''}` : '';

  const winCard = h('div', { class: 'win-card' },
    h('span', { class: 'win-trophy', 'aria-hidden': 'true' }, icon('trophy')),
    h('div', { class: 'win-text' },
      h('small', { class: 'win-kicker' }, `Round ${rec.round}`),
      h('b', { class: 'win-name' }, rec.ultimate ? `${nameOf(s, winner)} wins the Ultimate Round` : `${nameOf(s, winner)} wins`),
      youCame ? h('span', { class: 'win-you' }, youCame) : null));

  const tabLabels: [ResultsTab, string][] = [['places', 'Places'], ['points', 'Points'], ['awards', 'Awards']];
  const tabs = h('div', { class: 'results-tabs', role: 'tablist', 'aria-label': 'Results' },
    tabLabels.map(([t, label]) => h('button', {
      class: resultsTab === t ? 'results-tab on' : 'results-tab',
      role: 'tab',
      'aria-selected': resultsTab === t ? 'true' : 'false',
      onclick: () => { resultsTab = t; update({}); },
    }, label)));

  const placesBody = (): Child => {
    const scores = s.scores;
    const mine = awardCards(s).find((a) => a.short.includes(nameOf(s, me)));
    return h('div', { class: 'stack' },
      h('div', { class: 'place-list' }, rec.finishingOrder.map((id, i) => {
        const pts = rec.points[id] ?? 0;
        return h('div', { class: id === me ? 'place-row mine' : 'place-row' },
          h('span', { class: i === 0 ? 'place-word gold' : 'place-word' }, ordinal(i + 1)),
          miniDisc(s, id, '38px'),
          h('span', { class: 'place-name' }, nameOf(s, id), id === me ? ' (you)' : '',
            s.ultimateLabels?.winner === id ? h('span', { class: 'tag gold' }, 'Ultimate Winner') : null,
            s.ultimateLabels?.losers.includes(id) ? h('span', { class: 'tag' }, 'Ultimate Loser') : null),
          h('span', { class: 'place-pts' },
            rec.ultimate ? null : h('b', null, signedPts(pts)),
            h('small', null, `total ${scores[id] ?? 0}`)));
      })),
      mine ? h('p', { class: 'award-mine small' }, icon('trophy'), ` ${mine.label}: ${mine.short}`) : null);
  };

  const pointsBody = (): Child => scoreSheet(s, { me }) ?? h('p', { class: 'muted small center' }, 'No points yet.');

  const awardsBody = (): Child => {
    const cards = awardCards(s);
    return h('div', { class: 'stack' },
      cards.length
        ? h('div', { class: 'awards-grid' }, cards.map((a) => h('div', { class: 'award-card' },
          h('span', { class: 'award-icon', 'aria-hidden': 'true' }, icon('trophy')),
          h('small', { class: 'award-label' }, a.label),
          h('b', { class: 'award-value' }, a.short))))
        : h('p', { class: 'muted small center' }, 'No slaps yet. Suspiciously peaceful.'),
      slappedByTable(s));
  };

  const body = resultsTab === 'places' ? placesBody() : resultsTab === 'points' ? pointsBody() : awardsBody();

  // Footer: who is ready, then the ready button (every phone), then the host's Next round.
  const readyCount = s.ready.length;
  const iReady = s.ready.includes(me);
  const readyStrip = h('div', { class: 'ready-strip', 'aria-label': 'Ready' },
    h('div', { class: 'rdiscs' }, s.order.map((p) => {
      const on = s.ready.includes(p);
      return h('span', { class: on ? 'rdisc on' : 'rdisc', 'aria-label': `${nameOf(s, p)} ${on ? 'ready' : 'not ready'}` },
        miniDisc(s, p, '40px'),
        on ? h('span', { class: 'rtick', 'aria-hidden': 'true' }, icon('check')) : null);
    })),
    h('p', { class: 'rstatus' }, `${readyCount} of ${s.order.length} ready`));
  const readyButton: Child = host
    ? null
    : iReady
      ? h('button', { class: 'ready-undo', onclick: () => send([{ type: 'unready', by: me }]) }, icon('check'), " You're ready · tap to undo")
      : h('button', { class: 'big ready-big', onclick: () => send([{ type: 'readyUp', by: me }]) }, "I'm ready");
  const nextButton: Child = host
    ? h('button', {
      class: 'big gold-big',
      disabled: missingOthers.length > 0,
      onclick: () => {
        // One tap for the host: ready the host (if not yet) and move on.
        const acts: SessionAction[] = s.ready.includes(s.hostId) ? [] : [{ type: 'readyUp', by: s.hostId }];
        send([...acts, { type: 'advance', by: s.hostId }]);
      },
    }, icon('play'), missingOthers.length
      // 9aq.18 A: the count only; the names are in the label for screen readers.
      ? ` Waiting for ${missingOthers.length}`
      : s.ultimateRound ? ' Start the Ultimate Round' : ` Next round · ${nameOf(s, s.hostId)}`)
    : h('p', { class: 'rhost host-line muted small center' }, `${nameOf(s, s.hostId)} (host) starts the next round`);
  const ultimateButton: Child = s.ultimateRound
    ? null
    : h('button', {
      class: 'secondary ultimate-btn',
      onclick: () => send([{ type: 'callVote', by: me, kind: 'ultimate' }]),
    }, icon('bolt'), s.order.length === 2 ? ' Ask for the Ultimate Round' : ' Ultimate Round vote');
  const endButton: Child = host
    ? h('button', {
      class: armed ? 'danger end-btn' : 'ghost end-btn',
      onclick: () => {
        if (!armed) { update({ armed: 'endsession' }); return; }
        send([{ type: 'endSession', by: s.hostId }]);
      },
    }, armed ? 'Tap again to end the game' : 'End the game')
    : null;

  return h('div', { class: 'results-frame' },
    h('div', { class: 'results-scroll', 'data-scroll': `results-${rec.round}-${resultsTab}` },
      winCard,
      s.ultimateRound ? h('p', { class: 'center' }, h('span', { class: 'chip-info gold' }, icon('bolt'), ' Next: Ultimate Round')) : null,
      tabs,
      body),
    h('div', { class: 'results-footer' },
      readyStrip,
      readyButton,
      nextButton,
      // 9al.5 (2.37.1): 😂 is the first item of the footer's buttons, so it never covers one.
      h('div', { class: 'row results-actions' }, reactionsToggle(true), ultimateButton, endButton),
    ));
}

/** Game menu in a network game: the host closes the game for everyone; others leave. */
export function netMenu(g: SavedGame): HTMLElement {
  const host = g.net!.role === 'host';
  const armed = getState().armed === 'leavenet';
  return h('div', { class: 'panel menu' },
    // 9v.5: only the host's phone runs the computer players, so only the host sees these items.
    ...(host ? fastForwardMenuItems(g) : []),
    voiceMenuItem(), // 9aq.11 item 5 (3.0.0): Voice is always in the game menu
    h('button', {
      class: armed ? 'danger' : 'secondary',
      onclick: () => {
        if (!armed) { update({ armed: 'leavenet' }); return; }
        // Leaving the game screen closes the links (app.ts render → stopNetLobby).
        update({ game: null, screen: 'home', menuOpen: false, armed: null, popups: [] });
      },
    }, armed
      ? (host ? 'Tap again: close the game on every phone' : 'Tap again to leave the game')
      : (host ? 'Close the game' : 'Leave the game')),
    h('p', { class: 'muted small' }, host ? 'Network games aren’t saved yet.' : 'You can’t rejoin yet: the host would have to start again.'),
  );
}
