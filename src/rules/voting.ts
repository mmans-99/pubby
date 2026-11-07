/**
 * Voting. See PROJECT.md section 1.1.
 *
 * A vote passes with a majority: more than half of the players.
 * If no majority is reached either way, the host decides.
 * Two players (decided 2026-11-07): no real vote and no host decision. Both
 * must agree: any "no" fails it, two "yes" pass it.
 */

export type Ballot = 'yes' | 'no';
export type VoteTally = 'passed' | 'failed' | 'hostDecides';

/**
 * Count a vote. `ballots` maps player id to their ballot; players who have
 * not voted are simply missing. `playerCount` is everyone in the game.
 *
 * - More than half say yes: passed.
 * - More than half say no: failed.
 * - Otherwise (a tie, or not enough votes either way): the host decides.
 */
export function tallyVote(
  ballots: Readonly<Record<string, Ballot>>,
  playerCount: number,
): VoteTally {
  if (!Number.isInteger(playerCount) || playerCount < 1) {
    throw new RangeError(`Bad player count: ${playerCount}`);
  }
  let yes = 0;
  let no = 0;
  for (const b of Object.values(ballots)) {
    if (b === 'yes') yes++;
    else no++;
  }
  if (yes + no > playerCount) throw new Error('More ballots than players');
  if (playerCount === 2) {
    if (no > 0) return 'failed';
    return yes === 2 ? 'passed' : 'hostDecides'; // 'hostDecides' here just means "still waiting"
  }
  if (yes * 2 > playerCount) return 'passed';
  if (no * 2 > playerCount) return 'failed';
  return 'hostDecides';
}

/** Final result of a vote, using the host's decision when needed. */
export function resolveVote(tally: VoteTally, hostSaysYes?: boolean): boolean {
  if (tally === 'passed') return true;
  if (tally === 'failed') return false;
  if (hostSaysYes === undefined) throw new Error('No majority: the host must decide');
  return hostSaysYes;
}
