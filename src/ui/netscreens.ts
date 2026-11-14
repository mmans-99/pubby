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
import { getState, update } from './store.ts';
import { chooseLeaderStage, dealingStage, fastForwardMenuItems, gameFrame, handBlock, isHostSeat, nameOf, noticeStage, ownSeat, playHandStage, publicView, send, stageLayout } from './game.ts';
import { netRoundStart } from './roundstart.ts';
import { awardsRow, gameOverStage, scoreSheet, targetRow } from './between.ts';
import { playerView } from '../session/view.ts';
import { netSeats } from './netlobby.ts';
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
  const frame = body instanceof HTMLElement && body.classList.contains('game-frame') ? body : null;
  const slot = frame?.querySelector('.game-table-slot');
  if (notice && slot) { slot.appendChild(notice); return body; }
  return [notice, body]; // screens that scroll (results, waiting) keep it on top
}

/** A phone lost its link: the game can't go on until rejoining exists (slice 4). */
function connectionNotice(g: SavedGame): HTMLElement | null {
  if (!g.net || g.session.ended) return null;
  // CODE.md 9u A5: an away phone is kept for 10 minutes; the game waits for it (no auto-play).
  // 9ad.2 (2.34): shorter text; `table-notice` floats it over the table.
  const away = (netSeats() ?? []).filter((x) => x.awaySince !== undefined && !x.isHost);
  if (away.length) return h('p', { class: 'note warn net-lost table-notice', role: 'status' }, `${away.map(seatName).join(', ')} ${away.length === 1 ? 'is' : 'are'} away · waiting for them`);
  const gone = (netSeats() ?? []).filter((x) => !x.connected);
  if (!gone.length) return null;
  const who = gone.map(seatName).join(', ');
  return h('p', { class: 'note warn net-lost table-notice', role: 'status' },
    `${who} lost connection. Rejoining comes in a later update: `,
    g.net.role === 'host' ? 'close the game from the menu and start again.' : 'the host can close the game.');
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
  return gameFrame(lay, {
    table: roundTable(s, v, { bottom: me, waste: wastePile(0), you: true, box: lay.box }),
    hand: handBlock(s, playerView(s, me), null, { head: false, fit: lay.handH, width: lay.handW }),
    action: h('div', { class: 'row round-buttons' },
      v.canCallReshuffle
        ? h('button', {
          class: 'secondary grow',
          'aria-label': 'Deal again? Call a reshuffle vote',
          onclick: () => send([{ type: 'callVote', by: me, kind: 'reshuffle' }]),
        }, icon('shuffle'), ' Deal again?')
        : h('button', { class: 'secondary grow', disabled: true, 'aria-label': 'Deal again: already used this round' }, icon('shuffle'), ' Used'),
      host
        ? h('button', { class: 'big grow', onclick: () => send([{ type: 'startRound', by: s.hostId }]) }, icon('play'), ' Start')
        : null,
    ),
    // 2.31 (CODE.md 9aa Part C item 5): the target row sits at the top of the table, off the "You" pill.
    extra: [targetRow(s, { me }), host ? null : hostDeciding(s, 'when to start the round')],
    extraAt: 'top',
  });
}

/** Ready-up (2.5): who is ready, on every phone; each phone readies only its own player. */
function readyRow(s: Session, me: PlayerId): HTMLElement {
  const iReady = s.ready.includes(me);
  // 2.20 (Part C): on every phone except the host's and the player's own, say who the host is waiting for.
  const waitingFor = s.waitForAll ? s.order.filter((p) => p !== s.hostId && p !== me && !s.ready.includes(p)) : [];
  const hostPhone = me === s.hostId;
  return h('section', { class: 'ready-row', 'aria-label': 'Ready' },
    h('div', { class: 'name-chips' }, s.order.map((p) => {
      const on = s.ready.includes(p);
      return h('span', {
        class: on ? 'name-chip on' : 'name-chip',
        'aria-label': `${nameOf(s, p)} ${on ? 'ready' : 'not ready'}`,
      }, on ? [icon('check'), ` ${nameOf(s, p)}`] : nameOf(s, p));
    })),
    h('p', { class: 'muted small center' }, `${s.ready.length} of ${s.order.length} ready`),
    waitingFor.length && !hostPhone ? h('p', { class: 'warn center' }, `Waiting for ${joinNames(waitingFor.map((p) => nameOf(s, p)))}`) : null,
    iReady
      ? h('button', { class: 'secondary', disabled: true }, icon('check'), ' Ready')
      : h('button', { class: 'big', onclick: () => send([{ type: 'readyUp', by: me }]) }, "I'm ready"),
  );
}

function results(g: SavedGame): Child {
  const s = g.session;
  const me = ownSeat(g)!;
  const rec = s.rounds[s.rounds.length - 1];
  if (!rec) return h('p', null, 'No results yet.');
  const host = isHostSeat(g);
  const armed = getState().armed === 'endsession';
  // 2.20 (Part C): the host's button waits for every other player to be ready.
  const missingOthers = s.waitForAll ? s.order.filter((p) => p !== s.hostId && !s.ready.includes(p)) : [];
  return h('div', { class: 'stack' },
    h('h2', { class: 'center results-head' }, icon('trophy'), ` ${nameOf(s, rec.finishingOrder[0])} wins ${rec.ultimate ? 'the Ultimate Round' : `round ${rec.round}`}`),
    s.ultimateRound ? h('p', { class: 'center' }, h('span', { class: 'chip-info gold' }, icon('bolt'), ' Next: Ultimate Round')) : null,
    scoreSheet(s, { me }),
    awardsRow(s),
    targetRow(s, { me }),
    readyRow(s, me),
    // Every phone can ask for the Ultimate Round (2.5); the host moves on.
    s.ultimateRound
      ? null
      : h('button', {
        class: 'secondary',
        onclick: () => send([{ type: 'callVote', by: me, kind: 'ultimate' }]),
      }, icon('bolt'), s.order.length === 2 ? ' Ask for the Ultimate Round' : ' Ultimate Round vote'),
    host
      ? [
        h('button', {
          class: 'big',
          disabled: missingOthers.length > 0,
          onclick: () => {
            // One tap for the host: ready the host (if not yet) and move on.
            const acts: SessionAction[] = s.ready.includes(s.hostId) ? [] : [{ type: 'readyUp', by: s.hostId }];
            send([...acts, { type: 'advance', by: s.hostId }]);
          },
        }, icon('play'), missingOthers.length
          ? ` Waiting for ${joinNames(missingOthers.map((p) => nameOf(s, p)))}`
          : s.ultimateRound ? ' Start the Ultimate Round' : ` Next round · ${nameOf(s, s.hostId)}`),
        h('button', {
          class: armed ? 'danger' : 'ghost',
          onclick: () => {
            if (!armed) { update({ armed: 'endsession' }); return; }
            send([{ type: 'endSession', by: s.hostId }]);
          },
        }, armed ? 'Tap again to end the game' : 'End the game'),
      ]
      : hostDeciding(s, s.ultimateRound ? 'when to start the Ultimate Round' : 'next round or end the game'),
  );
}

/** Game menu in a network game: the host closes the game for everyone; others leave. */
export function netMenu(g: SavedGame): HTMLElement {
  const host = g.net!.role === 'host';
  const armed = getState().armed === 'leavenet';
  return h('div', { class: 'panel menu' },
    // 9v.5: only the host's phone runs the computer players, so only the host sees these items.
    ...(host ? fastForwardMenuItems(g) : []),
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
