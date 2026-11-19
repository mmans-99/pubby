/**
 * 9aq.1 (2.39, Part A): one pop-up at the end of a round. Pure: no DOM, so it is tested without a browser
 * (tests/ui/roundend.test.ts). `popupsFor` (game.ts) builds the list for one batch of session events; this
 * folds the round's end pop-ups of that batch into one `roundEnd` pop-up.
 */

import type { Popup } from './store.ts';

type RoundEnd = Extract<Popup, { kind: 'roundEnd' }>;
type Slap = Extract<Popup, { kind: 'slap' }>;
type LastTwo = Extract<Popup, { kind: 'lastTwo' }>;

/** A pop-up that the round's end replaces (the others, such as a vote result, stay as they are). */
function merged(p: Popup): boolean {
  return p.kind === 'lastTwo' || p.kind === 'pathetic' || p.kind === 'haha' || p.kind === 'out'
    || (p.kind === 'slap' && p.over !== undefined);
}

/**
 * `raw`: the pop-ups made from one batch of events, in order. If the batch ends the round (it has a last-two
 * pop-up), the round-end pop-ups and the "came Nth" pop-ups of the same batch become one `roundEnd`, placed
 * where the first of them was. The head word is the first match of: forfeit, round-ending slap, HAHAHA!, plain end.
 * A batch without a round end comes back unchanged.
 */
export function mergeRoundEnd(raw: readonly Popup[], gameOver: boolean): Popup[] {
  const end = raw.find((p): p is LastTwo => p.kind === 'lastTwo');
  if (!end) return [...raw];
  const pathetic = raw.find((p): p is Extract<Popup, { kind: 'pathetic' }> => p.kind === 'pathetic');
  const slap = raw.find((p): p is Slap => p.kind === 'slap' && p.over !== undefined);
  const haha = raw.find((p): p is Extract<Popup, { kind: 'haha' }> => p.kind === 'haha');
  const head: RoundEnd['head'] = pathetic ? 'pathetic' : slap ? 'slap' : haha ? 'haha' : 'over';
  const one: RoundEnd = { kind: 'roundEnd', head, slap, forfeiter: pathetic?.player, haha, end, gameOver };

  const out: Popup[] = [];
  let placed = false;
  for (const p of raw) {
    if (!merged(p)) { out.push(p); continue; }
    if (!placed) { out.push(one); placed = true; }
  }
  return out;
}
