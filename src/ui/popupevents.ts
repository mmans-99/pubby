// CODE.md 9an.5 (2.38, Part E-b): which session events can make a pop-up on a phone.
// The host uses this to know it must wait for the phone to answer (E-a); the phone's own
// pop-up code (`popupsFor` in game.ts) still decides what is actually shown. A test checks that
// every event type `popupsFor` handles is listed here, so a new pop-up can't be missed.

import type { PlayerId, SessionEvent } from '../session/types.ts';

export const POPUP_EVENTS: ReadonlySet<SessionEvent['type']> = new Set<SessionEvent['type']>([
  'cardsTaken', 'drawAtEnd', 'drawCoward', 'finalTwoChoice', 'forfeited', 'jokerPlayed', 'jokersDiscarded',
  'leaderChosen', 'pauseDeclined', 'peekAnswered', 'playerOut', 'playerRemoved', 'reactionTapReplay', 'resumed', 'roundEnded',
  'slapped', 'takeAnswered', 'takeRequested', 'targetReached', 'voteCalled', 'voteNeedsHost', 'voteResolved',
  'wastePilePickedUp',
]);

/**
 * True when this event may make a pop-up on `me`'s phone. Errs on the side of true: a superset only
 * makes the host wait for one more answer, which the phone always gives (E-a).
 */
export function makesPopup(e: SessionEvent, me: PlayerId): boolean {
  if (!POPUP_EVENTS.has(e.type)) return false;
  if (e.type === 'takeRequested') return me !== e.requester && me !== e.target;
  if (e.type === 'peekAnswered') return me === e.viewer && !e.accepted;
  return true;
}
