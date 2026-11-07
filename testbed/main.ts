/**
 * Pubby testbed. A play-test page that runs the real rules engine.
 * Not the game UI: every hand is visible so rules can be checked.
 * Hidden decks show only a card count.
 */

import {
  autoDealAll,
  autoDealStart,
  autoDealStep,
  cardLabel,
  dealerFor,
  decideLeader,
  forfeit,
  hiddenSwap,
  isDealComplete,
  isJoker,
  jokerCount,
  legalCards,
  manualDealCard,
  missingSuitPlayers,
  MAX_SWAP,
  pickUpWastePile,
  playCard,
  resolveReactionTap,
  resolveVote,
  scoreRound,
  seededRng,
  setDealMode,
  shuffleAndStartDeal,
  startPlay,
  swapAllowed,
  tallyVote,
  addScores,
  type Ballot,
  type Card,
  type DealState,
  type LeaderDecision,
  type PlayEvent,
  type PlayState,
  type RoundEnd,
  type RoundSetup,
  type Rng,
} from '../src/rules/index.ts';

type Stage = 'setup' | 'deal' | 'vote' | 'swap' | 'leader' | 'play' | 'roundEnd';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let stage: Stage = 'setup';
let cfg = { players: 4, jokers: true, seed: Math.floor(Math.random() * 100000) };
let ids: string[] = [];
let rng: Rng = seededRng(1);
let round = 1;
let previous: RoundSetup['previous'];
let totals: Record<string, number> = {};
let deal: DealState | null = null;
let hands: Record<string, Card[]> = {};
let hiddenDecks: Record<string, readonly Card[]> = {};
let swapDone: string[] = [];
let swapSelected: string[] = [];
let swapWho = '';
let votes: Record<string, Ballot> = {};
let reshuffleUsed = false; // only one reshuffle vote per round
let leaderDecision: LeaderDecision | null = null;
let tapPlayers: string[] = [];
let tapInputs: Record<string, { ms: string; fs: boolean }> = {};
let play: PlayState | null = null;
let roundEnd: RoundEnd | null = null;
let log: string[] = [];
interface Popup {
  title: string;
  lines?: string[];
  kind?: 'slap' | 'out' | 'end' | 'info';
}
let popups: Popup[] = [];
/** Places shown next to names this round (player -> place label). */
let places: Record<string, string> = {};

function pop(title: string, lines: string[] = [], kind: Popup['kind'] = 'info') {
  popups.push({ title, lines, kind });
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? 'th');
}

const HOST = 'P1';
const app = document.getElementById('app') as HTMLElement;

function setupFor(): RoundSetup {
  return { round, players: ids, hostId: HOST, jokerRuleEnabled: cfg.jokers, previous };
}

function say(line: string) {
  log.unshift(`R${round}: ${line}`);
  if (log.length > 200) log.length = 200;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string);
}

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

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

function newGame() {
  ids = Array.from({ length: cfg.players }, (_, i) => `P${i + 1}`);
  rng = seededRng(cfg.seed);
  round = 1;
  previous = undefined;
  totals = Object.fromEntries(ids.map((p) => [p, 0]));
  log = [];
  say(`New game: ${cfg.players} players, jokers ${cfg.jokers ? `on (${jokerCount(cfg.players, true)})` : 'off'}, seed ${cfg.seed}. Host is ${HOST}.`);
  startRound();
}

function startRound() {
  const dealer = dealerFor(setupFor());
  deal = shuffleAndStartDeal(setupFor(), rng, 'auto');
  hands = {};
  hiddenDecks = { ...deal.hiddenDecks };
  swapDone = [];
  swapSelected = [];
  votes = {};
  reshuffleUsed = false;
  leaderDecision = null;
  play = null;
  roundEnd = null;
  places = {};
  popups = [];
  stage = 'deal';
  const hidden = Object.values(deal.hiddenDecks).map((d) => d.length);
  say(`Round ${round}. ${dealer} shuffles and deals.${hidden.length ? ` Hidden decks set aside: ${hidden.join(' + ')} cards.` : ''}`);
}

function finishDeal() {
  if (!deal) return;
  hands = Object.fromEntries(Object.entries(deal.hands).map(([k, v]) => [k, v.slice()]));
  const sizes = ids.map((p) => `${p}:${hands[p]?.length}`).join(' ');
  say(`Deal done. Hands ${sizes}.`);
  if (reshuffleUsed) {
    say('Reshuffle vote already used this round.');
    proceedAfterVote();
    return;
  }
  stage = 'vote';
}

function afterVote(reshuffle: boolean, how: 'majority' | 'host') {
  pop(`${how === 'majority' ? 'Majority' : 'Host'} says… ${reshuffle ? 'YES!' : 'NO!'}`, [reshuffle ? 'Reshuffle!' : 'Play on.']);
  say(`Reshuffle vote: ${reshuffle ? 'yes' : 'no'} (${how}).`);
  votes = {};
  reshuffleUsed = true;
  if (reshuffle) {
    startRoundSameNumber();
    return;
  }
  proceedAfterVote();
}

function proceedAfterVote() {
  if (swapAllowed(ids.length)) {
    stage = 'swap';
    swapWho = ids[0] as string;
  } else goToLeader();
}

function startRoundSameNumber() {
  deal = shuffleAndStartDeal(setupFor(), rng, 'auto');
  hiddenDecks = { ...deal.hiddenDecks };
  hands = {};
  stage = 'deal';
  say(`Reshuffled. ${dealerFor(setupFor())} deals again.`);
}

function goToLeader() {
  const missing = missingSuitPlayers(ids, hands);
  if (missing.length) {
    say(`Missing suits: ${missing.map((m) => `${m.player} (${m.suits.join(', ')})`).join('; ')}.`);
  }
  leaderDecision = decideLeader(setupFor(), hands);
  if (leaderDecision.kind === 'leader') {
    say(`${leaderDecision.leader} leads (${leaderDecision.reason === 'host' ? 'host leads round 1' : 'missing a suit'}).`);
    beginPlay(leaderDecision.leader);
    return;
  }
  if (leaderDecision.kind === 'reactionTap') {
    tapPlayers = leaderDecision.players.slice();
    tapInputs = Object.fromEntries(tapPlayers.map((p) => [p, { ms: '', fs: false }]));
    say(`Reaction Tap between ${tapPlayers.join(', ')}.`);
  }
  stage = 'leader';
}

function beginPlay(leader: string) {
  play = startPlay(ids, hands, leader);
  stage = 'play';
}

function applyEvents(events: readonly PlayEvent[]) {
  for (const e of events) {
    switch (e.type) {
      case 'cardPlayed':
        say(`${e.player} plays ${cardLabel(e.card)}.`);
        break;
      case 'jokerPlayed':
        say(`${e.player} plays a JOKER${e.asLeader ? ' as the lead (next player starts the trick)' : ''}.`);
        break;
      case 'slapped':
        pop('SLAP! 😂', [`${e.slapper} slapped ${e.slapped}`, `${e.slapped} picks up ${e.cardsPickedUp} cards`], 'slap');
        say(`SLAP! ${e.slapper} slaps ${e.slapped}, who picks up ${e.cardsPickedUp} cards.`);
        break;
      case 'trickResolved':
        if (e.nextLeader) say(`Trick over. ${e.nextLeader} leads.`);
        break;
      case 'playerOut':
        say(`${e.player} is out in place ${e.place}.`);
        // During the round: announce each player as they go out.
        // At round end the last two are announced together (see endRound).
        if (!events.some((x) => x.type === 'roundEnded')) {
          places[e.player] = ordinal(e.place);
          pop(`${e.player} is out!`, [`Came ${ordinal(e.place)}`], 'out');
        }
        break;
      case 'finalTwoChoice':
        pop(`${e.player}'s last card was higher!`, ['Pick up the waste pile or forfeit.']);
        say(`${e.player} played a higher last card: pick up or forfeit.`);
        break;
      case 'wastePilePickedUp':
        say(`${e.player} picks up the waste pile (${e.cards} cards) and plays on.`);
        break;
      case 'forfeited':
        say(`${e.player} forfeits.`);
        break;
      case 'roundEnded':
        endRound(e);
        break;
    }
  }
}

function endRound(end: RoundEnd) {
  roundEnd = end;
  const pts = scoreRound(end.finishingOrder, end.sharedSecondLast);
  totals = addScores(totals, pts);
  const order = end.finishingOrder;
  const n = order.length;
  previous = { winner: order[0] as string, loser: order[n - 1] as string };
  say(`Round over. Order: ${order.join(' > ')}.${end.sharedSecondLast ? ` ${end.sharedSecondLast.join(' and ')} share second-last.` : ''}`);

  // Anyone who went out in the final trick but is not one of the last two.
  order.slice(0, n - 2).forEach((p, i) => {
    if (!places[p]) {
      places[p] = ordinal(i + 1);
      pop(`${p} is out!`, [`Came ${ordinal(i + 1)}`], 'out');
    }
  });

  // The last two, in one pop-up.
  const second = order[n - 2] as string;
  const last = order[n - 1] as string;
  if (end.sharedSecondLast) {
    places[second] = `${ordinal(n - 1)}=`;
    places[last] = `${ordinal(n - 1)}=`;
    pop('Both out on jokers!', [`${second} and ${last} share second last (${ordinal(n - 1)})`], 'end');
  } else {
    places[second] = ordinal(n - 1);
    places[last] = 'LOSER';
    const lines = [n === 2 ? `${second} wins (1st)` : `${second} is second last (${ordinal(n - 1)})`, `${last} is the LOSER!`];
    if (end.forfeitedBy) lines.push(`(${end.forfeitedBy} forfeited)`);
    pop('Round over', lines, 'end');
  }
  stage = 'roundEnd';
}

// ---------------------------------------------------------------------------
// Actions
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
  switch (action) {
    case 'players':
      cfg.players = Number(arg);
      return;
    case 'jokers':
      cfg.jokers = !cfg.jokers;
      return;
    case 'seed':
      cfg.seed = Number((document.getElementById('seed') as HTMLInputElement).value) || 1;
      newGame();
      return;
    case 'randomSeed':
      cfg.seed = Math.floor(Math.random() * 100000);
      return;
    case 'closePopup':
      popups.shift();
      return;
    case 'restart':
      stage = 'setup';
      return;

    // Dealing
    case 'autoStart':
      deal = autoDealStart(deal as DealState, arg);
      say(`Auto deal starts at ${arg}.`);
      return;
    case 'autoStep':
      deal = autoDealStep(deal as DealState);
      if (isDealComplete(deal)) finishDeal();
      return;
    case 'autoAll':
      deal = autoDealAll(deal as DealState);
      finishDeal();
      return;
    case 'mode':
      deal = setDealMode(deal as DealState, arg as 'auto' | 'manual');
      say(`Dealer switches to ${arg} deal.`);
      return;
    case 'manual':
      deal = manualDealCard(deal as DealState, arg);
      if (isDealComplete(deal)) finishDeal();
      return;

    // Reshuffle vote
    case 'vote': {
      const [p, b] = arg.split(':') as [string, Ballot];
      votes = { ...votes, [p]: b };
      return;
    }
    case 'countVote': {
      const tally = tallyVote(votes, ids.length);
      if (tally === 'hostDecides') {
        pop('No majority', ['The host decides.']);
        hostDeciding = true;
        return;
      }
      afterVote(resolveVote(tally), 'majority');
      return;
    }
    case 'hostDecide':
      hostDeciding = false;
      afterVote(resolveVote('hostDecides', arg === 'yes'), 'host');
      return;
    case 'skipVote':
      votes = {};
      say('No reshuffle vote called.');
      proceedAfterVote();
      return;

    // Swap
    case 'swapWho':
      swapWho = arg;
      swapSelected = [];
      return;
    case 'swapPick':
      if (swapSelected.includes(arg)) swapSelected = swapSelected.filter((x) => x !== arg);
      else if (swapSelected.length < MAX_SWAP) swapSelected = [...swapSelected, arg];
      else pop(`You can swap at most ${MAX_SWAP} cards.`);
      return;
    case 'swapDo': {
      if (swapDone.includes(swapWho)) throw new Error(`${swapWho} already swapped this round`);
      const res = hiddenSwap(hands[swapWho] ?? [], hiddenDecks, swapSelected, rng);
      hands = { ...hands, [swapWho]: res.hand.slice() };
      hiddenDecks = { ...res.hiddenDecks };
      say(
        swapSelected.length
          ? `${swapWho} swaps ${swapSelected.length} card(s): gave ${res.removed.map(cardLabel).join(' ')} (out of the round).`
          : `${swapWho} keeps their hand.`,
      );
      swapDone = [...swapDone, swapWho];
      swapSelected = [];
      const next = ids.find((p) => !swapDone.includes(p));
      if (next) swapWho = next;
      return;
    }
    case 'swapFinish':
      goToLeader();
      return;

    // Leader
    case 'tapMs': {
      const [p, v] = arg.split(':') as [string, string];
      (tapInputs[p] as { ms: string }).ms = v;
      return;
    }
    case 'tapFs': {
      const t = tapInputs[arg] as { fs: boolean };
      t.fs = !t.fs;
      return;
    }
    case 'tapResolve': {
      const results = tapPlayers.map((p) => {
        const t = tapInputs[p] as { ms: string; fs: boolean };
        if (!t.fs && !(Number(t.ms) > 0)) throw new Error(`Enter a time for ${p} or tick false start`);
        return { player: p, ms: Number(t.ms) || 0, falseStart: t.fs };
      });
      const out = resolveReactionTap(results);
      if (out.kind === 'replay') {
        tapPlayers = out.players.slice();
        tapInputs = Object.fromEntries(tapPlayers.map((p) => [p, { ms: '', fs: false }]));
        pop('Tie!', [`${tapPlayers.join(' & ')} play Reaction Tap again.`]);
        say(`Reaction Tap tie: ${tapPlayers.join(', ')} replay.`);
        return;
      }
      pop(`${out.slowest} leads!`, ['Slowest in Reaction Tap.']);
      say(`Reaction Tap: ${out.slowest} slowest, leads.`);
      beginPlay(out.slowest);
      return;
    }
    case 'winnerPicks':
      say(`${previous?.winner} (last round's winner) picks ${arg} to lead.`);
      beginPlay(arg);
      return;

    // Play
    case 'play': {
      const [p, id] = arg.split('|') as [string, string];
      const r = playCard(play as PlayState, p, id);
      play = r.state;
      hands = Object.fromEntries(Object.entries(play.hands).map(([k, v]) => [k, v.slice()]));
      applyEvents(r.events);
      return;
    }
    case 'pickUp': {
      const r = pickUpWastePile(play as PlayState, arg);
      play = r.state;
      hands = Object.fromEntries(Object.entries(play.hands).map(([k, v]) => [k, v.slice()]));
      applyEvents(r.events);
      return;
    }
    case 'forfeit': {
      const r = forfeit(play as PlayState, arg);
      play = r.state;
      applyEvents(r.events);
      return;
    }
    case 'nextRound':
      round++;
      startRound();
      return;
  }
}

let hostDeciding = false;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  let body = '';
  if (stage === 'setup') body = renderSetup();
  else {
    body = `
      <div class="bar">
        <div><b>Round ${round}</b> · ${ids.length} players · jokers ${cfg.jokers ? 'on' : 'off'} · seed ${cfg.seed}</div>
        <button class="small" data-act="restart">New game</button>
      </div>
      <div class="scores">${ids.map((p) => `<span>${p}${p === HOST ? ' (host)' : ''}: <b>${totals[p]}</b></span>`).join('')}</div>
      ${renderStage()}
      <h3>Event log</h3>
      <div class="log">${log.map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;
  }
  const p = popups[0];
  const more = popups.length > 1 ? ` (${popups.length - 1} more)` : '';
  app.innerHTML =
    body +
    (p
      ? `<div class="popup ${p.kind ?? 'info'}" data-act="closePopup"><div>
          <div class="ptitle">${esc(p.title)}</div>
          ${(p.lines ?? []).map((l, i) => `<div class="pline ${i === 0 ? 'first' : ''}">${esc(l)}</div>`).join('')}
          <small>tap to close${more}</small></div></div>`
      : '');
}

function renderSetup() {
  return `
    <h1>Pubby testbed</h1>
    <p class="note">Play-tests the real rules engine. Every hand is shown so you can check the rules. You make every player's move. Hidden decks only show a card count.</p>
    <h3>Players</h3>
    <div class="row">${[2, 3, 4, 5, 6, 7, 8].map((n) => `<button class="${n === cfg.players ? 'on' : ''}" data-act="players" data-arg="${n}">${n}</button>`).join('')}</div>
    <h3>Joker rule</h3>
    <div class="row"><button class="${cfg.jokers ? 'on' : ''}" data-act="jokers">Jokers ${cfg.jokers ? 'ON' : 'OFF'}</button></div>
    <h3>Seed</h3>
    <p class="note">Same seed = same shuffles. Note it down if something looks wrong.</p>
    <div class="row"><input id="seed" type="number" inputmode="numeric" value="${cfg.seed}"><button data-act="randomSeed">Random</button></div>
    <div class="row"><button class="go" data-act="seed">Start game</button></div>`;
}

function handsBlock(opts: { playable?: boolean; swapPick?: boolean } = {}) {
  return ids
    .map((p) => {
      const h = sortHand(hands[p] ?? []);
      const legal = opts.playable && play ? new Set(legalCards(play, p).map((c) => c.id)) : null;
      const isTurn = play?.turn === p;
      const out = play?.finished.includes(p);
      const cards = h
        .map((c) => {
          if (opts.swapPick && p === swapWho) {
            return cardHtml(c, `data-act="swapPick" data-arg="${c.id}"`, swapSelected.includes(c.id) ? 'picked' : '');
          }
          if (legal) {
            return legal.has(c.id)
              ? cardHtml(c, `data-act="play" data-arg="${p}|${c.id}"`, 'legal')
              : cardHtml(c, 'disabled', 'dim');
          }
          return cardHtml(c, 'disabled');
        })
        .join('');
      const forfeitBtn =
        play && !play.over && play.forfeitAllowed.includes(p) ? `<button class="small warn" data-act="forfeit" data-arg="${p}">Forfeit</button>` : '';
      return `<div class="hand ${isTurn ? 'turn' : ''}">
        <div class="who">${p}${p === HOST ? ' (host)' : ''}${places[p] ? ` <span class="place ${places[p] === 'LOSER' ? 'loser' : ''}">${places[p]}</span>` : ''} · ${h.length} cards ${isTurn ? '<b>← turn</b>' : ''} ${forfeitBtn}</div>
        <div class="cards">${cards || '<span class="note">no cards</span>'}</div>
      </div>`;
    })
    .join('');
}

function hiddenInfo() {
  const sizes = Object.values(hiddenDecks).map((d) => d.length);
  return sizes.length ? `<p class="note">Hidden decks (never shown in the real game): ${sizes.join(' + ')} cards</p>` : '';
}

function renderStage(): string {
  switch (stage) {
    case 'deal': {
      const d = deal as DealState;
      const dealer = dealerFor(setupFor());
      const seatBtns = (a: string) => ids.map((p) => `<button data-act="${a}" data-arg="${p}">${p} (${d.hands[p]?.length ?? 0})</button>`).join('');
      let controls = '';
      if (d.mode === 'auto') {
        controls =
          d.nextSeat === null
            ? `<p>Dealer ${dealer}: tap the first player to start the auto deal.</p><div class="row">${seatBtns('autoStart')}</div>`
            : `<p>Next card goes to <b>${d.nextSeat}</b>.</p><div class="row"><button data-act="autoStep">Deal 1 card</button><button data-act="autoAll">Deal the rest</button></div>`;
        controls += `<div class="row"><button class="small" data-act="mode" data-arg="manual">Switch to manual</button></div>`;
      } else {
        controls = `<p>Manual deal: tap a player to give them one card.</p><div class="row">${seatBtns('manual')}</div>
          <div class="row"><button class="small" data-act="mode" data-arg="auto">Switch to auto</button></div>`;
      }
      return `<h2>Deal</h2><p>${d.remaining.length} cards left to deal.</p>${controls}${hiddenInfo()}`;
    }
    case 'vote': {
      if (hostDeciding) {
        return `<h2>Reshuffle vote</h2><p>No majority. Host ${HOST} decides:</p>
          <div class="row"><button data-act="hostDecide" data-arg="yes">Reshuffle</button><button data-act="hostDecide" data-arg="no">Play on</button></div>`;
      }
      const rows = ids
        .map(
          (p) => `<div class="row"><span class="w">${p}</span>
          <button class="small ${votes[p] === 'yes' ? 'on' : ''}" data-act="vote" data-arg="${p}:yes">Yes</button>
          <button class="small ${votes[p] === 'no' ? 'on' : ''}" data-act="vote" data-arg="${p}:no">No</button></div>`,
        )
        .join('');
      return `<h2>Reshuffle vote?</h2><p class="note">Look at the hands below. Any player can call a reshuffle vote (only one per round); set the votes and count, or skip.</p>
        ${rows}<div class="row"><button data-act="countVote">Count votes</button><button data-act="skipVote">No vote called</button></div>
        ${hiddenInfo()}${handsBlock()}`;
    }
    case 'swap': {
      const done = swapDone.includes(swapWho);
      return `<h2>Hidden swap</h2><p class="note">Each player may swap up to ${MAX_SWAP} cards (or none) for random hidden cards, once this round.</p>
        <div class="row">${ids.map((p) => `<button class="small ${p === swapWho ? 'on' : ''}" data-act="swapWho" data-arg="${p}">${p}${swapDone.includes(p) ? ' ✓' : ''}</button>`).join('')}</div>
        <p>${done ? `${swapWho} has already swapped.` : `${swapWho}: tap up to ${MAX_SWAP} cards, then Swap (or Swap with none to keep).`}</p>
        <div class="row"><button data-act="swapDo" ${done ? 'disabled' : ''}>Swap ${swapSelected.length} card(s)</button><button data-act="swapFinish">Done swapping</button></div>
        ${hiddenInfo()}${handsBlock({ swapPick: !done })}`;
    }
    case 'leader': {
      const ld = leaderDecision as LeaderDecision;
      if (ld.kind === 'reactionTap') {
        const rows = tapPlayers
          .map((p) => {
            const t = tapInputs[p] as { ms: string; fs: boolean };
            return `<div class="row"><span class="w">${p}</span>
              <input type="number" inputmode="numeric" placeholder="ms" value="${esc(t.ms)}" data-input="tapMs" data-p="${p}">
              <button class="small ${t.fs ? 'on' : ''}" data-act="tapFs" data-arg="${p}">False start</button></div>`;
          })
          .join('');
        return `<h2>Reaction Tap</h2><p class="note">More than one player is missing a suit. Enter each reaction time (ms) or tick false start. Slowest leads; false start counts as slowest; ties replay.</p>
          ${rows}<div class="row"><button data-act="tapResolve">Who leads?</button></div>${handsBlock()}`;
      }
      if (ld.kind === 'winnerChooses') {
        return `<h2>Who leads?</h2><p>${ld.winner} won last round and picks the leader:</p>
          <div class="row">${ids.map((p) => `<button data-act="winnerPicks" data-arg="${p}">${p}</button>`).join('')}</div>${handsBlock()}`;
      }
      return '';
    }
    case 'play': {
      const p = play as PlayState;
      const trick = p.trick.plays.map((t) => `<span class="tp">${t.player}: ${cardHtml(t.card, 'disabled')}</span>`).join('');
      const choice = p.pendingFinalTwo
        ? `<div class="choice"><b>${p.pendingFinalTwo}</b> played a higher last card:
            <button data-act="pickUp" data-arg="${p.pendingFinalTwo}">Pick up waste pile (${p.wastePile.length})</button>
            <button class="warn" data-act="forfeit" data-arg="${p.pendingFinalTwo}">Forfeit</button></div>`
        : '';
      return `<h2>Play</h2>
        <div class="table">
          <div>Led suit: <b>${p.trick.ledSuit ?? '—'}</b> · Waste pile: ${p.wastePile.length} · Jokers used: ${p.usedJokers.length}</div>
          <div>Out: ${p.finished.join(', ') || 'nobody yet'}</div>
          <div class="trick">${trick || '<span class="note">No cards in this trick yet</span>'}</div>
        </div>
        ${choice}
        <p class="note">Bright cards can be played. Dimmed cards are blocked (must follow suit).</p>
        ${handsBlock({ playable: true })}`;
    }
    case 'roundEnd': {
      const e = roundEnd as RoundEnd;
      const pts = scoreRound(e.finishingOrder, e.sharedSecondLast);
      const rows = e.finishingOrder
        .map((p, i) => `<tr><td>${i + 1}</td><td>${p}</td><td>${pts[p]! > 0 ? '+' : ''}${pts[p]}</td><td>${totals[p]}</td></tr>`)
        .join('');
      return `<h2>Round ${round} results</h2>
        <p class="winner">🏆 ${esc(e.finishingOrder[0] as string)} is the winner!</p>
        ${e.forfeitedBy ? `<p>${e.forfeitedBy} forfeited.</p>` : ''}
        ${e.sharedSecondLast ? `<p>${e.sharedSecondLast.join(' & ')} went out on jokers and share second-last place.</p>` : ''}
        <table><tr><th>Place</th><th>Player</th><th>Points</th><th>Total</th></tr>${rows}</table>
        <p class="note">Next round: ${previous?.loser} deals, ${previous?.winner} picks who leads (unless someone is missing a suit).</p>
        <div class="row"><button class="go" data-act="nextRound">Next round</button></div>`;
    }
  }
  return '';
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
  if (el.dataset['input'] === 'tapMs') {
    (tapInputs[el.dataset['p'] as string] as { ms: string }).ms = el.value;
  }
});

render();
