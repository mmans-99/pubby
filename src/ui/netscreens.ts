/**
 * Game screens for a network game (Phase 4 slice 2, CODE.md section 9j).
 * Every phone shows its own player: no pass-the-phone screens. Dealing and
 * playing reuse the pass-and-play screens (game.ts); the round-start steps
 * each phone answers for itself (roundstart.ts `netRoundStart`).
 *
 * Slice 2 keeps the between-rounds parts simple: the host starts each round
 * (no reshuffle vote yet), the results screen shows the podium with the
 * host's Next round / End the game, and there is no pause, take-cards
 * request, target vote, Ultimate call or reactions across phones yet
 * (slice 3). A phone that drops can't rejoin yet (slice 4).
 */

import { h, type Child } from './dom.ts';
import { icon } from './icons.ts';
import type { SavedGame } from './storage.ts';
import type { Session } from '../session/types.ts';
import { getState, update } from './store.ts';
import { chooseLeaderStage, dealingStage, handBlock, nameOf, playHandStage, publicView, send } from './game.ts';
import { netRoundStart } from './roundstart.ts';
import { awardsRow, gameOverStage, podium } from './between.ts';
import { playerView } from '../session/view.ts';
import { netSeats } from './netlobby.ts';
import { roundTable, wasteMiddle } from './table.ts';
import { seatName } from '../net/lobby.ts';

export function netGameBody(g: SavedGame): Child {
  const s = g.session;
  const me = g.net!.me;
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
  if (g.session.ended) return null;
  const gone = (netSeats() ?? []).filter((x) => !x.connected);
  if (!gone.length) return null;
  const who = gone.map(seatName).join(', ');
  return h('p', { class: 'note warn net-lost', role: 'status' },
    `${who} lost connection. Rejoining comes in a later update: `,
    g.net!.role === 'host' ? 'close the game from the menu and start again.' : 'the host can close the game.');
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
  return h('div', { class: 'stack' },
    roundTable(s, publicView(s), { bottom: g.net!.me, middle: wasteMiddle(0) }),
    h('p', { class: 'hint center wait-line' }, text),
    handBlock(s, playerView(s, g.net!.me), null, { head: false }),
  );
}

/** After the deal: everyone looks at their own cards; the host starts the round. */
function beforeRound(g: SavedGame): Child {
  const s = g.session;
  const host = g.net!.role === 'host';
  return h('div', { class: 'stack' },
    roundTable(s, publicView(s), { bottom: g.net!.me, middle: wasteMiddle(0) }),
    handBlock(s, playerView(s, g.net!.me), null, { head: false }),
    host
      ? h('button', { class: 'big', onclick: () => send([{ type: 'startRound', by: s.hostId }]) }, icon('play'), ' Start the round')
      : hostDeciding(s, 'when to start the round'),
  );
}

function results(g: SavedGame): Child {
  const s = g.session;
  const rec = s.rounds[s.rounds.length - 1];
  if (!rec) return h('p', null, 'No results yet.');
  const host = g.net!.role === 'host';
  const armed = getState().armed === 'endsession';
  return h('div', { class: 'stack' },
    h('h2', { class: 'center results-head' }, icon('trophy'), ` ${nameOf(s, rec.finishingOrder[0])} wins ${rec.ultimate ? 'the Ultimate Round' : `round ${rec.round}`}`),
    s.ultimateRound ? h('p', { class: 'center' }, h('span', { class: 'chip-info gold' }, icon('bolt'), ' Next: Ultimate Round')) : null,
    podium(s, rec),
    awardsRow(s),
    host
      ? [
        h('button', { class: 'big', onclick: () => send([{ type: 'advance', by: s.hostId }]) },
          icon('play'), s.ultimateRound ? ' Start the Ultimate Round' : ' Next round'),
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
