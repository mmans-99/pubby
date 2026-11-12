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
import type { PlayerId, Session } from '../session/types.ts';
import { getState, update } from './store.ts';
import { chooseLeaderStage, dealingStage, handBlock, isHostSeat, nameOf, ownSeat, playHandStage, publicView, send } from './game.ts';
import { netRoundStart } from './roundstart.ts';
import { awardsRow, gameOverStage, podium, targetRow } from './between.ts';
import { playerView } from '../session/view.ts';
import { netSeats } from './netlobby.ts';
import { roundTable, wasteMiddle } from './table.ts';
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
      case 'playing': body = playHandStage(g); break;
      case 'results': body = results(g); break;
      case 'gameOver': body = gameOverStage(g); break;
      default: body = waitingFor(g, 'Waiting…');
    }
  }
  return [connectionNotice(g), body];
}

/** A phone lost its link: the game can't go on until rejoining exists (slice 4). */
function connectionNotice(g: SavedGame): HTMLElement | null {
  if (!g.net || g.session.ended) return null;
  const gone = (netSeats() ?? []).filter((x) => !x.connected);
  if (!gone.length) return null;
  const who = gone.map(seatName).join(', ');
  return h('p', { class: 'note warn net-lost', role: 'status' },
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
    roundTable(s, publicView(s), { bottom: me, middle: wasteMiddle(0) }),
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
  return h('div', { class: 'stack' },
    roundTable(s, v, { bottom: me, middle: wasteMiddle(0) }),
    handBlock(s, playerView(s, me), null, { head: false }),
    targetRow(s, { me }),
    h('div', { class: 'row' },
      v.canCallReshuffle
        ? h('button', {
          class: 'secondary grow',
          'aria-label': 'Deal again? Call a reshuffle vote',
          onclick: () => send([{ type: 'callVote', by: me, kind: 'reshuffle' }]),
        }, icon('shuffle'), ' Deal again?')
        : h('button', { class: 'secondary grow', disabled: true, 'aria-label': 'Deal again: already used this round' }, icon('shuffle'), ' Used'),
      host
        ? h('button', { class: 'big grow', onclick: () => send([{ type: 'startRound', by: s.hostId }]) }, icon('play'), ' Start the round')
        : null,
    ),
    host ? null : hostDeciding(s, 'when to start the round'),
  );
}

/** Ready-up (2.5): who is ready, on every phone; each phone readies only its own player. */
function readyRow(s: Session, me: PlayerId): HTMLElement {
  const iReady = s.ready.includes(me);
  return h('section', { class: 'ready-row', 'aria-label': 'Ready' },
    h('div', { class: 'name-chips' }, s.order.map((p) => {
      const on = s.ready.includes(p);
      return h('span', {
        class: on ? 'name-chip on' : 'name-chip',
        'aria-label': `${nameOf(s, p)} ${on ? 'ready' : 'not ready'}`,
      }, on ? [icon('check'), ` ${nameOf(s, p)}`] : nameOf(s, p));
    })),
    h('p', { class: 'muted small center' }, `${s.ready.length} of ${s.order.length} ready`),
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
  return h('div', { class: 'stack' },
    h('h2', { class: 'center results-head' }, icon('trophy'), ` ${nameOf(s, rec.finishingOrder[0])} wins ${rec.ultimate ? 'the Ultimate Round' : `round ${rec.round}`}`),
    s.ultimateRound ? h('p', { class: 'center' }, h('span', { class: 'chip-info gold' }, icon('bolt'), ' Next: Ultimate Round')) : null,
    podium(s, rec),
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
        h('button', { class: 'big', onclick: () => send([{ type: 'advance', by: s.hostId }]) },
          icon('play'), s.ultimateRound ? ' Start the Ultimate Round' : ` Next round · ${nameOf(s, s.hostId)}`),
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
