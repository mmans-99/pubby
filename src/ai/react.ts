/**
 * Reactions from computer players after a slap (PROJECT.md 12c, CODE.md 9m.3).
 *
 * `phrases` is the catch-phrase list from src/content/catch-phrases.md. The
 * app passes the list it already reads; tests and the arena read the file
 * themselves. Phrases are looked up by text, so editing the list does not
 * break this file: a phrase that is missing is simply not sent.
 */

import type { Rng } from '../rules/rng.ts';
import type { PlayerId, SessionEvent } from '../session/types.ts';
import { PERSONALITY_WEIGHTS, type Persona } from './persona.ts';

/** Returned for the 😂 button. Otherwise an index into the phrase list. */
export const LAUGH = -1;

function phraseIndex(phrases: readonly string[], text: string): number | null {
  const i = phrases.indexOf(text);
  return i === -1 ? null : i;
}

/**
 * What a computer player sends after an event, if anything: LAUGH, an index
 * into `phrases`, or null. Only `slapped` causes a reaction.
 *  - I slapped someone: reactRate x 1.5, "You got slapped" (1 time in 4 "You got slapped by a kiiid").
 *  - I was slapped: reactRate x 0.5, "Revenge time!!".
 *  - A person was slapped and I was not involved: reactRate, 😂.
 */
export function reactionFor(
  e: SessionEvent,
  me: PlayerId,
  humanIds: readonly PlayerId[],
  persona: Persona,
  rng: Rng,
  phrases: readonly string[],
): number | null {
  if (e.type !== 'slapped') return null;
  const rate = PERSONALITY_WEIGHTS[persona.personality].reactRate;
  if (e.slapper === me) {
    if (rng() >= rate * 1.5) return null;
    const text = rng() < 0.25 ? 'You got slapped by a kiiid' : 'You got slapped';
    return phraseIndex(phrases, text);
  }
  if (e.slapped === me) {
    if (rng() >= rate * 0.5) return null;
    return phraseIndex(phrases, 'Revenge time!!');
  }
  if (humanIds.includes(e.slapped) && rng() < rate) return LAUGH;
  return null;
}
