// CODE.md 9ah.2 (2.34.6): with "Deal again" once per deal, computer players must not loop.
// Plays 300 four-player all-computer rounds and reports deals per round (bar: average under 1.5, most under 8).
// Usage: node --experimental-strip-types testbed/deal_again_check.ts [rounds]
import { playBotGame } from '../tests/ai/botgame.ts';

const want = Number(process.argv[2] ?? 300);
const perRound: number[] = [];
let called = 0;
let passed = 0;
for (let seed = 1; perRound.length < want; seed++) {
  const r = playBotGame({ players: 4, levels: ['easy', 'normal', 'hard', 'normal'], rounds: 3, seed });
  const deals = new Map<number, number>();
  let round = 0;
  for (const e of r.session.log) {
    if (e.event.type === 'roundStarted') { round = e.event.round; deals.set(round, 0); }
    if (e.event.type === 'dealComplete') deals.set(round, (deals.get(round) ?? 0) + 1);
    if (e.event.type === 'voteCalled' && e.event.kind === 'reshuffle') called++;
    if (e.event.type === 'voteResolved' && e.event.kind === 'reshuffle' && e.event.result) passed++;
  }
  for (const n of deals.values()) if (n > 0 && perRound.length < want) perRound.push(n);
}
const avg = perRound.reduce((a, b) => a + b, 0) / perRound.length;
const most = Math.max(...perRound);
console.log(`${perRound.length} rounds: average ${avg.toFixed(3)} deals per round, most ${most}; reshuffle votes called ${called}, passed ${passed}`);
console.log(avg < 1.5 && most < 8 ? 'PASS' : 'FAIL');
process.exit(avg < 1.5 && most < 8 ? 0 : 1);
