/**
 * The one door in (CODE.md 9m.1). A computer player only ever receives an
 * `AiSeen` made here: its own hand is real, every other hand and every hidden
 * card is blank, and the log is the public events since its last look.
 *
 * `redactSession` is the same function that makes a joining phone's copy in a
 * network game, so a bot sees no more than a person in its seat.
 */

import { redactSession } from '../net/netgame.ts';
import { playerView, type PlayerView } from '../session/view.ts';
import type { PlayerId, Session, SessionEvent } from '../session/types.ts';

export interface AiSeen {
  readonly me: PlayerId;
  /** redactSession(full, me): only my hand is real. */
  readonly session: Session;
  /** playerView(redacted, me). */
  readonly view: PlayerView;
  /** New log events since the bot last looked. All public. */
  readonly events: readonly SessionEvent[];
}

export function seenBy(full: Session, me: PlayerId, fromLogIndex: number): AiSeen {
  const session = redactSession(full, me);
  return {
    me,
    session,
    view: playerView(session, me),
    events: full.log.slice(fromLogIndex).map((entry) => entry.event),
  };
}
