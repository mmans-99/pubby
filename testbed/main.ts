/**
 * Pubby testbed. A play-test page that runs the real rules engine and the
 * real session layer (src/session). Not the game UI: every hand is visible
 * and you make every player's move, so the rules can be checked on one phone.
 * Hidden decks only show a card count.
 */

import { cardLabel, isJoker, MAX_SWAP, seededRng, type Card, type Rng } from '../src/rules/index.ts';
import {
  addGameToProfiles,
  applyAction,
  buildGameRecord,
  computeTrivia,
  createSession,
  playerView,
  profileCsv,
  profileRivals,
  sessionCsv,
  targetVoteAllowed,
  type GameRecord,
  type LogEntry,
  type ProfileStats,
  type Session,
  type SessionAction,
  type SessionEvent,
  type Top,
} from '../src/session/index.ts';
import { legalCards } from '../src/rules/play.ts';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const NAMES = ['Ferrari', 'Speedy', 'Bubbles', 'Ace', 'Rocket', 'Biscuit', 'Tiger', 'Pickle'];
let cfg = { players: 4, jokers: true, seed: Math.floor(Math.random() * 100000), pauseLimit: 0 };
let s: Session | null = null;
let rng: Rng = seededRng(1);
let swapWho = '';
let swapSelected: string[] = [];
let tapInputs: Record<string, { ms: string; fs: boolean }> = {};
let targetInput = '10';
let viewAs = 'p1';
let record: GameRecord | null = null;
let profiles: Record<string, ProfileStats> = loadProfiles();
let csvShown: { filename: string; csv: string } | null = null;
let takeAsker = '';

interface Popup {
  title: string;
  lines?: string[];
  kind?: 'slap' | 'out' | 'end' | 'info' | 'vote';
}
let popups: Popup[] = [];
const CATCH_PHRASES = [
  "Don't let the cards control you, you control the cards.",
  'Craftyyyy',
  'You got slapped',
  'You got slapped by a kiiid',
];

const app = document.getElementById('app') as HTMLElement;

function pop(title: string, lines: string[] = [], kind: Popup['kind'] = 'info') {
  popups.push({ title, lines, kind });
}

function ordinal(n: number): string {
  const sfx = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (sfx[(v - 20) % 10] ?? sfx[v] ?? sfx[0] ?? 'th');
}

function esc(x: string) {
  return x.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string);
}

function nm(id: string | null | undefined): string {
  if (!id) return '—';
  return s?.players.find((p) => p.id === id)?.sessionName ?? id;
}

function names(ids: readonly string[] | undefined): string {
  return (ids ?? []).map(nm).join(' & ');
}

function loadProfiles(): Record<string, ProfileStats> {
  try {
    return JSON.parse(localStorage.getItem('pubby-testbed-profiles') ?? '{}') as Record<string, ProfileStats>;
  } catch {
    return {};
  }
}

function saveProfiles() {
  try {
    localStorage.setItem('pubby-testbed-profiles', JSON.stringify(profiles));
  } catch {
    /* storage not available: profiles last for this visit only */
  }
}

// ---------------------------------------------------------------------------
// Sending actions
// ---------------------------------------------------------------------------

function send(a: SessionAction) {
  if (!s) return;
  const r = applyAction(s, a, rng);
  s = r.session;
  popUpFor(r.events);
  if (s.phase === 'gameOver' && !record) finishSession();
  if (s.phase === 'swap' && (!swapWho || s.swapDone.includes(swapWho))) {
    swapWho = s.order.find((p) => !s!.swapDone.includes(p)) ?? '';
    swapSelected = [];
  }
  if (s.phase === 'reactionTap' && s.tap) {
    for (const p of s.tap.players) if (!tapInputs[p] || !s.tap.results[p]) tapInputs[p] ??= { ms: '', fs: false };
  }
}

function finishSession() {
  if (!s) return;
  const id = `game-${cfg.seed}-${Date.now()}`;
  record = buildGameRecord(s, new Date(), id);
  profiles = addGameToProfiles(profiles, record, s.players.map((p) => p.profileName));
  saveProfiles();
}

function popUpFor(events: readonly SessionEvent[]) {
  const ending = events.some((e) => e.type === 'roundEnded');
  for (const e of events) {
    switch (e.type) {
      case 'gameStarted':
        pop(
          e.jokerRuleEnabled ? `${e.jokerTotal} jokers in the deck!` : 'No jokers this game',
          [`${e.players.length} players. Host: ${nm(e.hostId)}`],
        );
        break;
      case 'roundStarted':
        if (e.ultimate) pop('ULTIMATE ROUND!', ['Outside the score. Titles only.', `${nm(e.dealer)} deals.`], 'vote');
        break;
      case 'voteCalled':
        if (e.by === null) pop('Vote: Ultimate Round?', ['Started automatically: the target was reached.'], 'vote');
        break;
      case 'voteNeedsHost':
        pop('No majority', ['The host decides.']);
        break;
      case 'voteResolved': {
        const what =
          e.kind === 'reshuffle'
            ? e.result ? 'Reshuffle!' : 'No reshuffle.'
            : e.kind === 'target'
              ? e.result ? `Target: ${e.value} points` : `No target of ${e.value}`
              : e.result ? 'Ultimate Round!' : 'No Ultimate Round.';
        pop(`${e.decidedBy === 'majority' ? 'Majority' : 'Host'} says… ${e.result ? 'YES!' : 'NO!'}`, [what], 'vote');
        break;
      }
      case 'targetReached':
        pop('Target reached!', [`${names(e.players)} reached ${e.target} points.`, 'Vote on the Ultimate Round.'], 'vote');
        break;
      case 'reactionTapReplay':
        pop('Tie!', [`${names(e.players)} play Reaction Tap again.`]);
        break;
      case 'leaderChosen':
        if (e.reason === 'reactionTap') pop(`${nm(e.leader)} leads!`, ['Slowest in Reaction Tap.']);
        break;
      case 'slapped':
        pop('SLAP! 😂', [
          `${nm(e.slapper)} slapped ${nm(e.slapped)}`,
          `${nm(e.slapped)} picks up ${e.cardsPickedUp} cards`,
          CATCH_PHRASES[Math.floor(Math.random() * CATCH_PHRASES.length)] as string,
        ], 'slap');
        break;
      case 'playerOut':
        if (!ending) pop(`${nm(e.player)} is out!`, [`Came ${ordinal(e.place)}`], 'out');
        break;
      case 'cardsTaken':
        pop('Cards taken!', [`${nm(e.requester)} took all of ${nm(e.target)}'s cards (${e.count})`, 'Nobody else knows which cards.'], 'vote');
        break;
      case 'takeAnswered':
        if (!e.accepted) pop('Request refused', [`${nm(e.target)} said no to ${nm(e.requester)}.`]);
        else pop('Request agreed', [`${nm(e.target)} said yes to ${nm(e.requester)}.`, 'The cards move between tricks.']);
        break;
      case 'finalTwoChoice':
        pop(`${nm(e.player)}'s last card was higher!`, ['Pick up the waste pile or forfeit.']);
        break;
      case 'roundEnded': {
        const order = e.finishingOrder;
        const n = order.length;
        const before = events.filter((x) => x.type === 'playerOut' && x.place < n - 1);
        for (const x of before) if (x.type === 'playerOut') pop(`${nm(x.player)} is out!`, [`Came ${ordinal(x.place)}`], 'out');
        const second = order[n - 2] as string;
        const last = order[n - 1] as string;
        if (e.sharedSecondLast) {
          pop('Both out on jokers!', [`${nm(second)} and ${nm(last)} share second last (${ordinal(n - 1)})`], 'end');
        } else {
          const lines = [n === 2 ? `${nm(second)} wins (1st)` : `${nm(second)} is second last (${ordinal(n - 1)})`, `${nm(last)} is the LOSER!`];
          if (e.forfeitedBy) lines.push(`(${nm(e.forfeitedBy)} forfeited)`);
          pop('Round over', lines, 'end');
        }
        break;
      }
      case 'ultimateLabels':
        pop('Ultimate titles', [
          e.winner ? `🏆 Ultimate Winner: ${nm(e.winner)}` : 'No Ultimate Winner',
          `Ultimate Loser: ${names(e.losers)}`,
        ], 'end');
        break;
      case 'paused':
        pop('PAUSED', [e.requestedBy ? `${nm(e.requestedBy)} asked, the host agreed.` : 'The host paused the game.']);
        break;
      case 'pauseDeclined':
        pop('Pause declined', [`The host said no to ${nm(e.requester)}.`]);
        break;
      case 'resumed':
        pop('Game on!', [e.reason === 'timeLimit' ? 'The pause time ran out.' : 'The host resumed.']);
        break;
      case 'sessionEnded':
        pop('Game over', [`${names(e.winners)} ${e.winners.length > 1 ? 'win' : 'wins'} the game!`, e.decidedBy === 'ultimate' ? '(Ultimate Winner)' : '(highest score)'], 'end');
        break;
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Event log text
// ---------------------------------------------------------------------------

function logLine(entry: LogEntry): string | null {
  const e = entry.event;
  switch (e.type) {
    case 'gameStarted': return `New game: ${e.players.length} players, jokers ${e.jokerRuleEnabled ? `on (${e.jokerTotal})` : 'off'}, seed ${cfg.seed}. Host is ${nm(e.hostId)}.`;
    case 'roundStarted': return `${e.ultimate ? 'ULTIMATE ROUND' : `Round ${e.round}`}. ${nm(e.dealer)} shuffles and deals.`;
    case 'dealModeChanged': return `Dealer switches to ${e.mode} deal.`;
    case 'dealComplete': return `Deal done. Hands ${Object.entries(e.handSizes).map(([p, n]) => `${nm(p)}:${n}`).join(' ')}.`;
    case 'voteCalled': return `${e.by ? nm(e.by) : 'The game'} calls a ${e.kind} vote${e.value !== null ? ` (${e.value} points)` : ''}.`;
    case 'voteCast': return `${nm(e.by)} votes ${e.ballot}.`;
    case 'voteNeedsHost': return 'No majority: the host decides.';
    case 'voteResolved': return `${e.kind} vote: ${e.result ? 'YES' : 'NO'} (${e.decidedBy}).`;
    case 'reshuffled': return `${nm(e.dealer)} reshuffles and deals again.`;
    case 'reshuffleWindowClosed': return 'Host starts the round. Reshuffle vote no longer available.';
    case 'swapped': return e.count ? `${nm(e.player)} swaps ${e.count} card(s).` : `${nm(e.player)} keeps their hand.`;
    case 'missingSuitDeclared': return `${nm(e.player)} is missing a suit (secret).`;
    case 'reactionTapStarted': return `Reaction Tap: ${names(e.players)}.`;
    case 'reactionTapped': return `${nm(e.player)} taps: ${e.falseStart ? 'FALSE START' : `${e.ms} ms`}.`;
    case 'reactionTapReplay': return `Tie: ${names(e.players)} replay.`;
    case 'leaderChosen': return `${nm(e.leader)} leads (${{ host: 'host leads round 1', missingSuit: 'missing a suit', reactionTap: 'slowest in Reaction Tap', winnerChose: "last round's winner chose" }[e.reason]}).`;
    case 'cardPlayed': return `${nm(e.player)} plays ${cardLabel(e.card)}.`;
    case 'jokerPlayed': return `${nm(e.player)} plays a JOKER${e.asLeader ? ' as the lead' : ''}.`;
    case 'slapped': return `SLAP! ${nm(e.slapper)} slaps ${nm(e.slapped)}, who picks up ${e.cardsPickedUp}.`;
    case 'trickResolved': return e.nextLeader ? `Trick over. ${nm(e.nextLeader)} leads.` : null;
    case 'playerOut': return `${nm(e.player)} is out in place ${e.place}.`;
    case 'finalTwoChoice': return `${nm(e.player)} played a higher last card: pick up or forfeit.`;
    case 'wastePilePickedUp': return `${nm(e.player)} picks up the waste pile (${e.cards}).`;
    case 'forfeited': return `${nm(e.player)} forfeits.`;
    case 'roundEnded': return `Round over: ${e.finishingOrder.map(nm).join(' > ')}.`;
    case 'roundScored': return e.ultimate ? 'Ultimate Round: no points.' : `Points: ${e.finishingOrder.map((p) => `${nm(p)} ${fmt(e.points[p] ?? 0)}`).join(', ')}.`;
    case 'ultimateLabels': return `Ultimate Winner: ${nm(e.winner)}. Ultimate Loser: ${names(e.losers)}.`;
    case 'targetReached': return `${names(e.players)} reached the target (${e.target}).`;
    case 'takeRequested': return `${nm(e.requester)} asks to take ${nm(e.target)}'s cards.`;
    case 'takeAnswered': return `${nm(e.target)} ${e.accepted ? 'agrees' : 'refuses'} (${nm(e.requester)}'s take-cards request).`;
    case 'takeCancelled': return `${nm(e.requester)}'s request to take ${nm(e.target)}'s cards is ${e.reason === 'withdrawn' ? 'withdrawn' : 'cancelled (no longer possible)'}.`;
    case 'cardsTaken': return `${nm(e.requester)} takes all ${e.count} of ${nm(e.target)}'s cards.`;
    case 'pauseRequested': return `${nm(e.by)} asks to pause.`;
    case 'pauseDeclined': return `Host declines ${nm(e.requester)}'s pause.`;
    case 'paused': return 'Game paused.';
    case 'resumed': return `Game resumed${e.reason === 'timeLimit' ? ' (time limit)' : ''}.`;
    case 'pauseTimeLimitSet': return `Pause time limit: ${e.seconds ? `${e.seconds}s` : 'none'}.`;
    case 'playerReady': return `${nm(e.player)} is ready.`;
    case 'sessionEnded': return `Session over (${e.reason}). Winner: ${names(e.winners)}.`;
  }
}

function fmt(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

// ---------------------------------------------------------------------------
// UI actions
// ---------------------------------------------------------------------------

function act(action: string, arg: string) {
  try {
    doAct(action, arg);
  } catch (err) {
    pop('Not allowed', [(err as Error).message]);
  }
  render();
}

function doAct(action: string, arg: string) {
  const now = Date.now();
  const host = s?.hostId ?? 'p1';
  switch (action) {
    case 'players': cfg.players = Number(arg); return;
    case 'jokers': cfg.jokers = !cfg.jokers; return;
    case 'pauseLimit': cfg.pauseLimit = Number(arg); return;
    case 'randomSeed': cfg.seed = Math.floor(Math.random() * 100000); return;
    case 'start': {
      cfg.seed = Number((document.getElementById('seed') as HTMLInputElement).value) || 1;
      rng = seededRng(cfg.seed);
      record = null;
      csvShown = null;
      popups = [];
      tapInputs = {};
      swapWho = '';
      viewAs = 'p1';
      const r = createSession({
        players: Array.from({ length: cfg.players }, (_, i) => ({ id: `p${i + 1}`, profileName: NAMES[i] as string })),
        hostId: 'p1',
        jokerRuleEnabled: cfg.jokers,
        pauseTimeLimitSec: cfg.pauseLimit || null,
      }, rng);
      s = r.session;
      popUpFor(r.events);
      return;
    }
    case 'restart': s = null; return;
    case 'closePopup': popups.shift(); return;
    case 'clearProfiles': profiles = {}; saveProfiles(); return;

    // Dealing
    case 'autoStart': send({ type: 'autoDealStart', by: s!.dealer, firstSeat: arg }); return;
    case 'autoStep': send({ type: 'autoDealStep', by: s!.dealer }); return;
    case 'autoAll': send({ type: 'autoDealAll', by: s!.dealer }); return;
    case 'mode': send({ type: 'setDealMode', by: s!.dealer, mode: arg as 'auto' | 'manual' }); return;
    case 'manual': send({ type: 'manualDealCard', by: s!.dealer, seat: arg }); return;

    // Votes
    case 'callReshuffle': send({ type: 'callVote', by: arg, kind: 'reshuffle' }); return;
    case 'callTarget': {
      const [p] = arg.split(':') as [string];
      send({ type: 'callVote', by: p, kind: 'target', value: Number(targetInput) });
      return;
    }
    case 'callUltimate': send({ type: 'callVote', by: arg, kind: 'ultimate' }); return;
    case 'vote': {
      const [p, b] = arg.split(':') as [string, 'yes' | 'no'];
      send({ type: 'castVote', by: p, ballot: b });
      return;
    }
    case 'closeVote': send({ type: 'closeVote', by: host }); return;
    case 'hostDecide': send({ type: 'hostDecides', by: host, yes: arg === 'yes' }); return;
    case 'startRound': send({ type: 'startRound', by: host }); return;

    // Swap
    case 'swapWho': swapWho = arg; swapSelected = []; return;
    case 'swapPick':
      if (swapSelected.includes(arg)) swapSelected = swapSelected.filter((x) => x !== arg);
      else if (swapSelected.length < MAX_SWAP) swapSelected = [...swapSelected, arg];
      else pop(`You can swap at most ${MAX_SWAP} cards.`);
      return;
    case 'swapDo': {
      const ids = swapSelected;
      swapSelected = [];
      send({ type: 'swap', by: swapWho, cardIds: ids });
      return;
    }

    // Reaction Tap
    case 'tapFs': { const t = (tapInputs[arg] ??= { ms: '', fs: false }); t.fs = !t.fs; return; }
    case 'tapSend': {
      const t = tapInputs[arg] ?? { ms: '', fs: false };
      if (!t.fs && !(Number(t.ms) > 0)) throw new Error(`Enter a time for ${nm(arg)} or tick false start`);
      send({ type: 'reactionTap', by: arg, ms: Number(t.ms) || 0, falseStart: t.fs });
      tapInputs[arg] = { ms: '', fs: false };
      return;
    }
    case 'winnerPicks': send({ type: 'chooseLeader', by: s!.previous!.winner, leader: arg }); return;

    // Play
    case 'play': {
      const [p, id] = arg.split('|') as [string, string];
      send({ type: 'playCard', by: p, cardId: id });
      return;
    }
    case 'pickUp': send({ type: 'pickUpWastePile', by: arg }); return;
    case 'forfeit': send({ type: 'forfeit', by: arg }); return;

    // Take-cards request
    case 'takeAsker': takeAsker = takeAsker === arg ? '' : arg; return;
    case 'requestTake': send({ type: 'requestTake', by: takeAsker, target: arg }); takeAsker = ''; return;
    case 'answerTake': {
      const [req, target, yes] = arg.split(':') as [string, string, string];
      send({ type: 'answerTake', by: target, requester: req, accept: yes === 'yes' });
      return;
    }
    case 'withdrawTake': {
      const [req, target] = arg.split(':') as [string, string];
      send({ type: 'withdrawTake', by: req, target });
      return;
    }

    // Pause
    case 'pause': send({ type: 'pause', by: host, at: now }); return;
    case 'resume': send({ type: 'resume', by: host }); return;
    case 'requestPause': send({ type: 'requestPause', by: arg }); return;
    case 'respondPause': {
      const [p, yes] = arg.split(':') as [string, string];
      send({ type: 'respondPause', by: host, requester: p, approve: yes === 'yes', at: now });
      return;
    }
    case 'setLimit': send({ type: 'setPauseTimeLimit', by: host, seconds: Number(arg) || null }); return;

    // Results
    case 'ready': send({ type: 'readyUp', by: arg }); return;
    case 'advance': send({ type: 'advance', by: host }); return;
    case 'endSession': send({ type: 'endSession', by: host }); return;
    case 'viewAs': viewAs = arg; return;

    // Export
    case 'shareSession': if (record) shareCsv('pubby-game.csv', sessionCsv(record)); return;
    case 'shareProfile': { const p = profiles[arg]; if (p) shareCsv(`pubby-${arg}.csv`, profileCsv(p)); return; }
    case 'closeCsv': csvShown = null; return;
  }
}

/**
 * The testbed runs inside a sandboxed page where the share sheet and downloads
 * are blocked, so it shows the CSV and copies it. The real app opens the
 * phone's share sheet.
 */
function shareCsv(filename: string, csv: string) {
  csvShown = { filename, csv };
  try {
    void navigator.clipboard?.writeText(csv).then(
      () => pop('CSV copied', [`${filename} is on the clipboard. Paste it into a spreadsheet or a note.`]),
      () => pop('CSV ready', ['Copy it from the box below.']),
    );
  } catch {
    pop('CSV ready', ['Copy it from the box below.']);
  }
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function cardHtml(c: Card, attrs = '', extraClass = '') {
  const red = !isJoker(c) && (c.suit === 'hearts' || c.suit === 'diamonds');
  const cls = `card ${isJoker(c) ? 'joker' : red ? 'red' : 'black'} ${extraClass}`;
  return `<button class="${cls}" ${attrs}>${esc(cardLabel(c))}</button>`;
}

function sortHand(h: readonly Card[]): Card[] {
  const order = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 } as const;
  return h.slice().sort((a, b) => {
    if (isJoker(a)) return 1;
    if (isJoker(b)) return -1;
    return order[a.suit] - order[b.suit] || a.rank - b.rank;
  });
}

function handOf(p: string): readonly Card[] {
  if (!s) return [];
  if (s.phase === 'dealing') return s.deal?.hands[p] ?? [];
  return s.hands[p] ?? [];
}

function placeBadge(p: string): string {
  if (!s || s.phase !== 'playing' || !s.play) return '';
  const i = s.play.finished.indexOf(p);
  return i === -1 ? '' : ` <span class="place">${ordinal(i + 1)}</span>`;
}

function handsBlock(opts: { playable?: boolean; swapPick?: boolean } = {}) {
  const ss = s!;
  return ss.order
    .map((p) => {
      const h = sortHand(handOf(p));
      const play = ss.play;
      const legal = opts.playable && play && !ss.paused ? new Set(legalCards(play, p).map((c) => c.id)) : null;
      const isTurn = ss.phase === 'playing' && play?.turn === p;
      const cards = h
        .map((c) => {
          if (opts.swapPick && p === swapWho) {
            return cardHtml(c, `data-act="swapPick" data-arg="${c.id}"`, swapSelected.includes(c.id) ? 'picked' : '');
          }
          if (legal) {
            return legal.has(c.id) ? cardHtml(c, `data-act="play" data-arg="${p}|${c.id}"`, 'legal') : cardHtml(c, 'disabled', 'dim');
          }
          return cardHtml(c, 'disabled');
        })
        .join('');
      const forfeitBtn =
        ss.phase === 'playing' && play && !play.over && play.forfeitAllowed.includes(p) && play.pendingFinalTwo !== p
          ? `<button class="small warn" data-act="forfeit" data-arg="${p}">Forfeit</button>` : '';
      return `<div class="hand ${isTurn ? 'turn' : ''}">
        <div class="who">${esc(nm(p))}${p === ss.hostId ? ' (host)' : ''}${placeBadge(p)} · ${h.length} cards ${isTurn ? '<b>← turn</b>' : ''} ${forfeitBtn}</div>
        <div class="cards">${cards || '<span class="note">no cards</span>'}</div>
      </div>`;
    })
    .join('');
}

function hiddenInfo() {
  const sizes = Object.values(s!.hiddenDecks).map((d) => d.length);
  return sizes.length ? `<p class="note">Hidden decks (never shown in the real game): ${sizes.join(' + ')} cards</p>` : '';
}

function topLine(label: string, t: Top | null, unit = '') {
  return `<tr><td>${label}</td><td>${t ? `${esc(names(t.players))} (${t.count}${unit})` : '—'}</td></tr>`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  let body = '';
  if (!s) body = renderSetup();
  else {
    const ss = s;
    body = `
      <div class="bar">
        <div><b>${ss.ultimateRound && ss.phase !== 'results' ? 'ULTIMATE ROUND' : `Round ${ss.round}`}</b> · ${ss.order.length} players · jokers ${ss.jokerRuleEnabled ? ss.jokerTotal : 'off'} · seed ${cfg.seed}</div>
        <button class="small" data-act="restart">New game</button>
      </div>
      <div class="scores">${ss.order.map((p) => `<span>${esc(nm(p))}${p === ss.hostId ? ' (host)' : ''}: <b>${ss.scores[p]}</b></span>`).join('')}${ss.target !== null ? `<span>🎯 target <b>${ss.target}</b></span>` : ''}${ss.ultimateRound && ss.phase === 'results' ? '<span>⚡ Ultimate next</span>' : ''}</div>
      ${renderPauseBar()}
      ${['dealing', 'reshuffle', 'swap', 'reactionTap', 'chooseLeader', 'playing'].includes(ss.phase) ? '<p class="note">🎯 Target score: before round 1 starts, or on the results screen. ⚡ Ultimate Round: on the results screen after each round.</p>' : ''}
      ${renderVote()}
      ${renderStage()}
      ${renderViewAs()}
      <h3>Event log</h3>
      <div class="log">${ss.log.slice().reverse().map((e) => { const l = logLine(e); return l ? `<div>R${e.round}: ${esc(l)}</div>` : ''; }).join('')}</div>`;
  }
  const p = popups[0];
  const more = popups.length > 1 ? ` (${popups.length - 1} more)` : '';
  const paused = s?.paused ? renderPausedOverlay() : '';
  app.innerHTML =
    body + paused +
    (p
      ? `<div class="popup ${p.kind ?? 'info'}" data-act="closePopup"><div>
          <div class="ptitle">${esc(p.title)}</div>
          ${(p.lines ?? []).map((l, i) => `<div class="pline ${i === 0 ? 'first' : ''} ${p.kind === 'slap' && i === 2 ? 'phrase' : ''}">${esc(l)}</div>`).join('')}
          <small>tap to close${more}</small></div></div>`
      : '');
}

function renderSetup() {
  const saved = Object.values(profiles);
  return `
    <h1>Pubby testbed</h1>
    <p class="note">Play-tests the real rules engine and session layer. Every hand is shown and you make every player's move. P1 is always the host. Hidden decks only show a card count.</p>
    <h3>Players</h3>
    <div class="row">${[2, 3, 4, 5, 6, 7, 8].map((n) => `<button class="${n === cfg.players ? 'on' : ''}" data-act="players" data-arg="${n}">${n}</button>`).join('')}</div>
    <h3>Joker rule (host setup)</h3>
    <div class="row"><button class="${cfg.jokers ? 'on' : ''}" data-act="jokers">Jokers ${cfg.jokers ? 'ON' : 'OFF'}</button></div>
    <h3>Pause time limit (host setup, optional)</h3>
    <div class="row">${[0, 15, 60].map((n) => `<button class="small ${n === cfg.pauseLimit ? 'on' : ''}" data-act="pauseLimit" data-arg="${n}">${n ? `${n}s` : 'None'}</button>`).join('')}</div>
    <h3>Seed</h3>
    <p class="note">Same seed = same shuffles. Note it down if something looks wrong.</p>
    <div class="row"><input id="seed" type="number" inputmode="numeric" value="${cfg.seed}"><button data-act="randomSeed">Random</button></div>
    <div class="row"><button class="go" data-act="start">Start game</button></div>
    ${saved.length ? `<h3>Saved profiles on this phone</h3>${renderProfiles()}${renderCsv()}<div class="row"><button class="small warn" data-act="clearProfiles">Clear saved profiles</button></div>` : ''}`;
}

function renderProfiles() {
  return `<div class="scroll"><table class="tight"><tr><th>Profile</th><th>Games</th><th>Pts</th><th>W/L</th><th>Slapped by most</th><th>Slapped most</th><th></th></tr>${Object.values(profiles)
    .map((p) => {
      const r = profileRivals(p);
      return `<tr><td>${esc(p.profileName)}</td><td>${p.gamesPlayed}</td><td>${p.points}</td><td>${p.roundWins}/${p.roundLosses}</td>
        <td>${esc(r.slappedByMost.join(' & ') || '—')}</td><td>${esc(r.slappedMost.join(' & ') || '—')}</td>
        <td><button class="small" data-act="shareProfile" data-arg="${esc(p.profileName)}">CSV</button></td></tr>`;
    })
    .join('')}</table></div>`;
}

function renderPauseBar() {
  const ss = s!;
  const inRound = ['dealing', 'reshuffle', 'swap', 'reactionTap', 'chooseLeader', 'playing'].includes(ss.phase);
  if (!inRound || ss.paused) return '';
  const reqs = ss.pauseRequests
    .map((p) => `<div class="row"><span>${esc(nm(p))} asks to pause:</span>
      <button class="small" data-act="respondPause" data-arg="${p}:yes">Host: approve</button>
      <button class="small warn" data-act="respondPause" data-arg="${p}:no">Host: decline</button></div>`)
    .join('');
  return `<div class="pausebar">
    <div class="row"><button class="small" data-act="pause">⏸ Host pauses</button>
      <span class="note">Ask to pause:</span>${ss.order.filter((p) => p !== ss.hostId).map((p) => `<button class="small" data-act="requestPause" data-arg="${p}">${esc(nm(p))}</button>`).join('')}</div>
    ${reqs}</div>`;
}

function renderPausedOverlay() {
  const ss = s!;
  let left = '';
  if (ss.pauseTimeLimitSec && ss.pausedAt) {
    const secs = Math.max(0, Math.ceil(ss.pauseTimeLimitSec - (Date.now() - ss.pausedAt) / 1000));
    left = `<p>Resumes on its own in <b>${secs}s</b></p>`;
  }
  return `<div class="paused"><div>
    <div class="ptitle">PAUSED</div>
    <p>Every phone is frozen. Nobody can play or ask to pause.</p>${left}
    <div class="row"><button class="go" data-act="resume">Host: resume</button></div>
    <p class="note">Host can change the pause time limit:</p>
    <div class="row">${[0, 15, 60].map((n) => `<button class="small ${(ss.pauseTimeLimitSec ?? 0) === n ? 'on' : ''}" data-act="setLimit" data-arg="${n}">${n ? `${n}s` : 'None'}</button>`).join('')}</div>
  </div></div>`;
}

function renderVote() {
  const ss = s!;
  const v = ss.vote;
  if (!v) return '';
  const title =
    v.kind === 'reshuffle' ? 'Reshuffle?' : v.kind === 'target' ? `Target score: ${v.value} points?` : 'Play the Ultimate Round?';
  const by = v.calledBy ? `${nm(v.calledBy)} called this vote.` : 'Started automatically: the target was reached.';
  if (v.awaitingHost) {
    return `<div class="votebox"><h2>${esc(title)}</h2><p>No majority. Host ${esc(nm(ss.hostId))} decides:</p>
      <div class="row"><button data-act="hostDecide" data-arg="yes">YES</button><button data-act="hostDecide" data-arg="no">NO</button></div></div>`;
  }
  const rows = ss.order
    .map((p) => `<div class="row"><span class="w">${esc(nm(p))}</span>
      <button class="small ${v.ballots[p] === 'yes' ? 'on' : ''}" data-act="vote" data-arg="${p}:yes">Yes</button>
      <button class="small ${v.ballots[p] === 'no' ? 'on' : ''}" data-act="vote" data-arg="${p}:no">No</button></div>`)
    .join('');
  return `<div class="votebox"><h2>Vote: ${esc(title)}</h2><p class="note">${esc(by)} More than half decides it at once. A tie or too few votes goes to the host.</p>
    ${rows}<div class="row"><button class="small" data-act="closeVote">Host: close vote now</button></div></div>`;
}

function renderStage(): string {
  const ss = s!;
  switch (ss.phase) {
    case 'dealing': {
      const d = ss.deal!;
      const seatBtns = (a: string) => ss.order.map((p) => `<button data-act="${a}" data-arg="${p}">${esc(nm(p))} (${d.hands[p]?.length ?? 0})</button>`).join('');
      let controls = '';
      if (d.mode === 'auto') {
        controls =
          d.nextSeat === null
            ? `<p>Dealer ${esc(nm(ss.dealer))}: tap the first player to start the auto deal.</p><div class="row">${seatBtns('autoStart')}</div>`
            : `<p>Next card goes to <b>${esc(nm(d.nextSeat))}</b>.</p><div class="row"><button data-act="autoStep">Deal 1 card</button><button data-act="autoAll">Deal the rest</button></div>`;
        controls += `<div class="row"><button class="small" data-act="mode" data-arg="manual">Switch to manual</button></div>`;
      } else {
        controls = `<p>Manual deal: tap a player to give them one card.</p><div class="row">${seatBtns('manual')}</div>
          <div class="row"><button class="small" data-act="mode" data-arg="auto">Switch to auto</button></div>`;
      }
      if (ss.vote) controls = '<p class="note">Dealing waits until the vote is finished.</p>';
      return `<h2>Deal${ss.reshuffleUsed ? ' again (reshuffled)' : ''}</h2>${preRoundTarget()}<p>${d.remaining.length} cards left to deal.</p>${controls}${hiddenInfo()}`;
    }
    case 'reshuffle':
      return `<h2>Before the round</h2>
        <p class="note">Everyone looks at their cards. Any player can call a reshuffle vote (one per round). The host starts the round when ready, and then no reshuffle vote can be called.</p>
        ${ss.vote ? '' : `<div class="row"><span class="note">Call reshuffle vote:</span>${ss.order.map((p) => `<button class="small" data-act="callReshuffle" data-arg="${p}">${esc(nm(p))}</button>`).join('')}</div>
        <div class="row"><button class="go" data-act="startRound">Host: start the round</button></div>`}
        ${preRoundTarget()}
        ${hiddenInfo()}${handsBlock()}`;
    case 'swap': {
      const done = ss.swapDone.includes(swapWho);
      return `<h2>Hidden swap</h2><p class="note">Each player may swap up to ${MAX_SWAP} cards (or none) for random hidden cards, once this round. The round goes on when everyone has chosen.</p>
        <div class="row">${ss.order.map((p) => `<button class="small ${p === swapWho ? 'on' : ''}" data-act="swapWho" data-arg="${p}">${esc(nm(p))}${ss.swapDone.includes(p) ? ' ✓' : ''}</button>`).join('')}</div>
        <p>${done ? `${esc(nm(swapWho))} has already swapped.` : `${esc(nm(swapWho))}: tap up to ${MAX_SWAP} cards, then Swap (or Swap 0 to keep).`}</p>
        <div class="row"><button data-act="swapDo" ${done ? 'disabled' : ''}>Swap ${swapSelected.length} card(s)</button></div>
        ${hiddenInfo()}${handsBlock({ swapPick: !done })}`;
    }
    case 'reactionTap': {
      const tap = ss.tap!;
      const rows = tap.players
        .map((p) => {
          if (tap.results[p]) return `<div class="row"><span class="w">${esc(nm(p))}</span><span class="note">tapped ✓</span></div>`;
          const t = (tapInputs[p] ??= { ms: '', fs: false });
          return `<div class="row"><span class="w">${esc(nm(p))}</span>
            <input type="number" inputmode="numeric" placeholder="ms" value="${esc(t.ms)}" data-input="tapMs" data-p="${p}">
            <button class="small ${t.fs ? 'on' : ''}" data-act="tapFs" data-arg="${p}">False start</button>
            <button class="small" data-act="tapSend" data-arg="${p}">Tap</button></div>`;
        })
        .join('');
      return `<h2>Reaction Tap</h2><p class="note">More than one player is missing a suit. Enter each reaction time (ms) or tick false start, then Tap. Slowest leads; a false start counts as slowest; ties replay.</p>
        ${rows}${handsBlock()}`;
    }
    case 'chooseLeader':
      return `<h2>Who leads?</h2><p>${esc(nm(ss.previous!.winner))} won last round and picks the leader:</p>
        <div class="row">${ss.order.map((p) => `<button data-act="winnerPicks" data-arg="${p}">${esc(nm(p))}</button>`).join('')}</div>${handsBlock()}`;
    case 'playing': {
      const p = ss.play!;
      const trick = p.trick.plays.map((t) => `<span class="tp">${esc(nm(t.player))}: ${cardHtml(t.card, 'disabled')}</span>`).join('');
      const choice = p.pendingFinalTwo
        ? `<div class="choice"><b>${esc(nm(p.pendingFinalTwo))}</b> played a higher last card:
            <button data-act="pickUp" data-arg="${p.pendingFinalTwo}">Pick up waste pile (${p.wastePile.length})</button>
            <button class="warn" data-act="forfeit" data-arg="${p.pendingFinalTwo}">Forfeit</button></div>` : '';
      return `<h2>Play</h2>
        <div class="table">
          <div>Led suit: <b>${p.trick.ledSuit ?? '—'}</b> · Waste pile: ${p.wastePile.length} · Jokers used: ${p.usedJokers.length}</div>
          <div class="trick">${trick || '<span class="note">No cards in this trick yet</span>'}</div>
        </div>
        ${choice}
        ${renderTakePanel()}
        <p class="note">Bright cards can be played. Dimmed cards are blocked (must follow suit).</p>
        ${handsBlock({ playable: true })}`;
    }
    case 'results':
      return renderResults();
    case 'gameOver':
      return renderGameOver();
  }
}

/** Target score proposal. Hidden once a target (or the Ultimate Round) is agreed. */
function targetRows(): string {
  const ss = s!;
  if (ss.target !== null) return `<h3>🎯 Target score</h3><p><b>Agreed: ${ss.target} points.</b></p>`;
  if (!targetVoteAllowed(ss)) return '';
  return `<h3>🎯 Target score (not set)</h3>
    <div class="row"><span class="note">Points:</span><input id="target" type="number" inputmode="numeric" value="${esc(targetInput)}" data-input="target"></div>
    <div class="row"><span class="note">Proposed by:</span>${ss.order.map((p) => `<button class="small" data-act="callTarget" data-arg="${p}">${esc(nm(p))}</button>`).join('')}</div>`;
}

/** Before round 1: the target vote can happen during the deal or before the host starts the round. */
function preRoundTarget(): string {
  const ss = s!;
  if (ss.round !== 1 || ss.vote || !(ss.phase === 'dealing' || ss.phase === 'reshuffle')) return '';
  const rows = targetRows();
  return rows ? `<div class="votebox proposebox">${rows}<p class="note">Optional. You can also set it on any results screen.</p></div>` : '';
}

function renderTakePanel(): string {
  const ss = s!;
  const play = ss.play!;
  const holding = ss.order.filter((p) => (play.hands[p] ?? []).length > 0);
  const reqs = ss.takeRequests
    .map((r) => r.agreed
      ? `<div class="row"><span>${esc(nm(r.requester))} → ${esc(nm(r.target))}: <b>agreed</b>, cards move when this trick is over</span></div>`
      : `<div class="row"><span>${esc(nm(r.requester))} asks to take <b>${esc(nm(r.target))}</b>'s cards</span>
          <button class="small" data-act="answerTake" data-arg="${r.requester}:${r.target}:yes">${esc(nm(r.target))}: agree</button>
          <button class="small warn" data-act="answerTake" data-arg="${r.requester}:${r.target}:no">${esc(nm(r.target))}: refuse</button>
          <button class="small" data-act="withdrawTake" data-arg="${r.requester}:${r.target}">${esc(nm(r.requester))}: withdraw</button></div>`)
    .join('');
  const blocked = ss.takeRequests.some((r) => !r.agreed) && play.trick.acted.length === 0
    ? '<p class="note"><b>The next trick waits until the request is answered.</b></p>' : '';
  let ask = '';
  if (holding.length < 3) ask = '<p class="note">Not allowed with only two players holding cards.</p>';
  else {
    ask = `<div class="row"><span class="note">Who asks?</span>${holding.map((p) => `<button class="small ${p === takeAsker ? 'on' : ''}" data-act="takeAsker" data-arg="${p}">${esc(nm(p))}</button>`).join('')}</div>`;
    if (takeAsker && holding.includes(takeAsker)) {
      ask += `<div class="row"><span class="note">${esc(nm(takeAsker))} asks to take all cards of:</span>${holding.filter((p) => p !== takeAsker).map((p) => `<button class="small" data-act="requestTake" data-arg="${p}">${esc(nm(p))}</button>`).join('')}</div>`;
    }
  }
  return `<details class="takebox" ${ss.takeRequests.length || takeAsker ? 'open' : ''}><summary>🤝 Take-cards request${ss.takeRequests.length ? ` (${ss.takeRequests.length})` : ''}</summary>
    <p class="note">Take all of another player's cards, unseen. Ask any time; it happens between tricks. The other player can agree or refuse. In the real game only the two players see the request.</p>
    ${ask}${reqs}${blocked}</details>`;
}

function renderRoundTable() {
  const ss = s!;
  const r = ss.rounds[ss.rounds.length - 1];
  if (!r) return '';
  const rows = r.finishingOrder
    .map((p, i) => {
      const badge = r.ultimate
        ? ss.ultimateLabels?.winner === p ? ' 🏆 Ultimate Winner' : ss.ultimateLabels?.losers.includes(p) ? ' 💀 Ultimate Loser' : ''
        : '';
      return `<tr><td>${i + 1}</td><td>${esc(nm(p))}${badge}</td><td>${r.ultimate ? '—' : fmt(r.points[p] ?? 0)}</td><td>${ss.scores[p]}</td></tr>`;
    })
    .join('');
  return `<p class="winner">🏆 ${esc(nm(r.finishingOrder[0]))} is the winner${r.ultimate ? ' of the Ultimate Round' : ''}!</p>
    ${r.forfeitedBy ? `<p>${esc(nm(r.forfeitedBy))} forfeited.</p>` : ''}
    ${r.sharedSecondLast ? `<p>${esc(names(r.sharedSecondLast))} went out on jokers and share second-last place.</p>` : ''}
    <table><tr><th>Place</th><th>Player</th><th>Points</th><th>Total</th></tr>${rows}</table>`;
}

function renderTrivia() {
  const ss = s!;
  const t = computeTrivia(ss.log, ss.order);
  const per = ss.order
    .map((p) => {
      const x = t.perPlayer[p]!;
      return `<tr><td>${esc(nm(p))}</td><td>${x.slapsGiven}</td><td>${x.timesSlapped}</td><td>${esc(names(x.slappedByMost?.players) || '—')}</td><td>${esc(names(x.slappedMost?.players) || '—')}</td></tr>`;
    })
    .join('');
  return `<h3>Trivia (this session)</h3>
    <table>
      ${topLine('Most slapped', t.mostSlapped)}
      ${topLine('Most slapper', t.mostSlapper)}
      <tr><td>Rivals</td><td>${t.rivals.length ? t.rivals.map((r) => `${esc(nm(r.slapper))} slaps ${esc(nm(r.slapped))} most (${r.count})`).join('<br>') : '—'}</td></tr>
      ${topLine('Always fighting for survival', t.alwaysFightingForSurvival)}
      ${topLine('Biggest pick-up', t.biggestPickUp, ' cards')}
      ${topLine('Most forfeits', t.mostForfeits)}
      ${topLine('Most reshuffle votes', t.mostReshuffleVotes)}
      ${topLine('Slowest reaction', t.slowestReaction, ' ms')}
    </table>
    <h3>Per player (this session)</h3>
    <table><tr><th>Player</th><th>Slaps</th><th>Slapped</th><th>Slapped by most</th><th>Slapped most</th></tr>${per}</table>`;
}

function renderResults() {
  const ss = s!;
  const r = ss.rounds[ss.rounds.length - 1]!;
  const voteBtns = ss.vote
    ? ''
    : `<div class="votebox proposebox"><h2>🗳 Votes</h2>
      <p class="note">Only between rounds. Tap the name of the player who proposes it, then everyone votes.</p>
      ${targetRows()}
      <h3>⚡ Ultimate Round</h3>
      ${ss.ultimateRound ? '<p><b>Agreed: the next round is the Ultimate Round.</b></p>' : `<div class="row"><span class="note">Triggered by:</span>${ss.order.map((p) => `<button class="small" data-act="callUltimate" data-arg="${p}">${esc(nm(p))}</button>`).join('')}</div>`}
      </div>`;
  return `<h2>Round ${r.round} results</h2>
    ${renderRoundTable()}
    ${voteBtns}
    <h3>Ready up (no timer; the host decides)</h3>
    <div class="row">${ss.order.map((p) => `<button class="small ${ss.ready.includes(p) ? 'on' : ''}" data-act="ready" data-arg="${p}">${esc(nm(p))}${ss.ready.includes(p) ? ' ✓' : ''}</button>`).join('')}</div>
    ${renderTrivia()}
    <p class="note">Next round: ${esc(nm(ss.previous?.loser))} deals, ${esc(nm(ss.previous?.winner))} picks who leads (unless someone is missing a suit).</p>
    <div class="row"><button class="go" data-act="advance">Host: ${ss.ultimateRound ? 'start the ULTIMATE ROUND' : 'next round'}</button></div>
    <div class="row"><button class="warn" data-act="endSession">Host: end the session</button></div>`;
}

function renderGameOver() {
  const ss = s!;
  const e = ss.ended!;
  const reason = { ultimatePlayed: 'The Ultimate Round was played.', ultimateVoteFailedAtTarget: 'The target was reached and the Ultimate vote failed.', hostEnded: 'The host ended the session.' }[e.reason];
  const rows = e.standings
    .map((p, i) => {
      const title = ss.ultimateLabels?.winner === p ? '🏆 Ultimate Winner' : ss.ultimateLabels?.losers.includes(p) ? '💀 Ultimate Loser' : '';
      return `<tr><td>${i + 1}</td><td>${esc(nm(p))}</td><td>${ss.scores[p]}</td><td>${title}</td></tr>`;
    })
    .join('');
  return `<h2>Game over</h2>
    <p>${reason}</p>
    <p class="winner">🏆 ${esc(names(e.winners))} ${e.winners.length > 1 ? 'win' : 'wins'} the game (${e.decidedBy === 'ultimate' ? 'Ultimate Winner' : 'highest score'})</p>
    <table><tr><th>Place</th><th>Player</th><th>Score</th><th>Title</th></tr>${rows}</table>
    ${ss.rounds.some((r) => r.ultimate) ? `<h3>Ultimate Round</h3>${renderRoundTable()}` : ''}
    ${renderTrivia()}
    <h3>Game record</h3>
    <p class="note">Saved on this phone. Every profile in this game has been updated once.</p>
    <div class="row"><button data-act="shareSession">Session stats CSV</button></div>
    <h3>Profiles on this phone (all saved games)</h3>
    ${renderProfiles()}
    ${renderCsv()}
    <div class="row"><button class="go" data-act="restart">New game</button></div>`;
}

function renderCsv() {
  if (!csvShown) return '';
  return `<div class="csvbox"><div class="row"><b>${esc(csvShown.filename)}</b><button class="small" data-act="closeCsv">Close</button></div>
    <p class="note">In the real app this opens the phone's share sheet. Here it is copied to the clipboard (or copy it from the box).</p>
    <textarea readonly rows="10">${esc(csvShown.csv)}</textarea></div>`;
}

function renderViewAs() {
  const ss = s!;
  const v = playerView(ss, viewAs);
  const json = JSON.stringify(v);
  const leak = Object.values(ss.hiddenDecks).some((d) => d.some((c) => json.includes(`"${c.id}"`)));
  return `<details class="viewas"><summary>What a player's phone receives</summary>
    <div class="row">${ss.order.map((p) => `<button class="small ${p === viewAs ? 'on' : ''}" data-act="viewAs" data-arg="${p}">${esc(nm(p))}</button>`).join('')}</div>
    <p>Own hand: ${v.myHand.length} cards. Others: ${v.players.filter((p) => p.id !== viewAs).map((p) => `${esc(p.sessionName)} ${p.cardCount}`).join(', ')}.</p>
    <p>Hidden decks in this phone's data: <b>${leak || /hidden/i.test(json) ? 'YES (bug!)' : 'none ✓'}</b></p>
    <p class="note">${v.isHost ? 'Host. ' : ''}${v.legalCardIds.length ? `Can play ${v.legalCardIds.length} card(s) now. ` : ''}${v.canSwap ? 'Can swap. ' : ''}${v.canCallReshuffle ? 'Can call a reshuffle vote. ' : ''}${v.canForfeit ? 'Can forfeit. ' : ''}</p>
  </details>`;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

app.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!el || (el as HTMLButtonElement).disabled) return;
  act(el.dataset['act'] as string, el.dataset['arg'] ?? '');
});

app.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.dataset['input'] === 'tapMs') (tapInputs[el.dataset['p'] as string] ??= { ms: '', fs: false }).ms = el.value;
  if (el.dataset['input'] === 'target') targetInput = el.value;
});

// Clock for the pause time limit.
setInterval(() => {
  if (!s?.paused) return;
  const before = s.paused;
  try {
    send({ type: 'tick', at: Date.now() });
  } catch {
    return;
  }
  if (before && !s.paused) render();
  else {
    // Refresh the countdown without disturbing pop-ups.
    const el = document.querySelector('.paused p b');
    if (el && s.pauseTimeLimitSec && s.pausedAt) {
      el.textContent = `${Math.max(0, Math.ceil(s.pauseTimeLimitSec - (Date.now() - s.pausedAt) / 1000))}s`;
    }
  }
}, 1000);

render();
