/**
 * Reactions from computer players (PROJECT.md 12c, CODE.md 9m.3). Computer
 * players are antagonists: they taunt people after the table events they see.
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
 * into `phrases`, or null. Each event has a chance from the personality's
 * reactRate, scaled by who is involved:
 *  - slapped: I slapped (x1.5, "You got slapped" or the kiiid version); I was
 *    slapped (x0.5, "Revenge time!!"); a person was slapped (x1, 😂).
 *  - wastePilePickedUp: a person picked up (x1); I did (x0.5).
 *  - playerOut: a person went out (x1, "Too slow!!"); I went out (x1, "Bye bye, losers!!").
 *  - cardsTaken: I took a person's cards (x1.5); a person took mine (x0.5).
 *  - roundEnded: a person lost the round (x1).
 *  - forfeited: a person forfeited (x1, "Coward!!").
 */
export function reactionFor(
  e: SessionEvent,
  me: PlayerId,
  humanIds: readonly PlayerId[],
  persona: Persona,
  rng: Rng,
  phrases: readonly string[],
): number | null {
  const rate = PERSONALITY_WEIGHTS[persona.personality].reactRate;
  const human = (p: PlayerId | null | undefined): boolean => !!p && humanIds.includes(p);
  const roll = (chance: number, texts: readonly string[]): number | null => {
    if (rng() >= chance) return null;
    const text = texts[Math.floor(rng() * texts.length)] ?? texts[0];
    return text === undefined ? null : phraseIndex(phrases, text);
  };

  switch (e.type) {
    case 'slapped':
      if (e.slapper === me) return roll(rate * 1.5, ['You got slapped', 'You got slapped', 'You got slapped', 'You got slapped by a kiiid']);
      if (e.slapped === me) return roll(rate * 0.5, ['Revenge time!!']);
      if (human(e.slapped)) return rng() < rate ? LAUGH : null;
      return null;
    case 'wastePilePickedUp':
      if (e.player === me) return roll(rate * 0.5, ['Oofaa!!!!', 'Nooo, not again!!']);
      return human(e.player) ? roll(rate, ['Pick them up!!', 'Enjoy the pile!!']) : null;
    case 'playerOut':
      if (e.player === me) return roll(rate, ['Bye bye, losers!!']);
      return human(e.player) ? roll(rate, ['Too slow!!', 'Hurry up!!']) : null;
    case 'cardsTaken':
      if (e.requester === me) return human(e.target) ? roll(rate * 1.5, ['Ha! Caught you!!', 'Not so clever now!!']) : null;
      if (e.target === me) return human(e.requester) ? roll(rate * 0.5, ['Dirty move!!']) : null;
      return null;
    case 'roundEnded':
      return human(e.loser) ? roll(rate, ['Sit down, sweetheart!!', 'Who dealt this?!']) : null;
    case 'forfeited':
      return human(e.player) ? roll(rate, ['Coward!!']) : null;
    default:
      return null;
  }
}
