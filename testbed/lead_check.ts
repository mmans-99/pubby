// CODE.md 9af.6 (PROJECT.md 12r): counts leads into a suit someone is known to be missing.
//   node --experimental-strip-types --no-warnings testbed/lead_check.ts [games=30] [players=4]
//   (or: npx tsx testbed/lead_check.ts [games] [players])
// For each level (easy, normal, hard), plays all-computer games and counts every lead with a
// standard card:
//   leads                      all leads
//   intoKnownSlap              the led suit is known missing (a slap showed it, no known card of it)
//   intoKnownSlapWithSafe      ...while holding a standard card of a suit that is not known missing
// Bar (9af.6): normal and hard have intoKnownSlapWithSafe = 0. Easy is reported, not barred.
// Only the bot's own memory and AiSeen are used; the hidden hands are never read.

import { playBotGame, type SeatLevel } from '../tests/ai/botgame.ts';
import { knownSlap } from '../src/ai/eval.ts';
import { isStandard } from '../src/rules/cards.ts';

const games = Number(process.argv[2] ?? 30);
const players = Number(process.argv[3] ?? 4);
const levels: SeatLevel[] = ['easy', 'normal', 'hard'];
const out: Record<string, { leads: number; intoKnownSlap: number; intoKnownSlapWithSafe: number }> = {};

for (const level of levels) {
  const row = { leads: 0, intoKnownSlap: 0, intoKnownSlapWithSafe: 0 };
  out[level] = row;
  for (let g = 0; g < games; g++) {
    playBotGame({
      players,
      levels: [level],
      rounds: 3,
      seed: 1000 + g,
      onDecision: ({ seen, memory, decision }) => {
        const a = decision.actions[0];
        if (!a || a.type !== 'playCard' || seen.view.ledSuit !== null) return;
        const played = seen.view.myHand.find((c) => c.id === a.cardId);
        if (!played || !isStandard(played)) return;
        row.leads++;
        if (!knownSlap(memory, seen, played.suit)) return;
        row.intoKnownSlap++;
        const safe = seen.view.myHand.some((c) => isStandard(c) && !knownSlap(memory, seen, c.suit));
        if (safe) row.intoKnownSlapWithSafe++;
      },
    });
  }
}
console.log(JSON.stringify({ games, players, byLevel: out }, null, 1));
