# TODO — Pubby

Status key: `[ ]` not started, `[~]` in progress, `[x]` done, `[!]` blocked on a decision.

## Phase 0 — Planning (current)

- [x] Write the five MD files (`CLAUDE.md`, `PROJECT.md`, `CODE.md`, `TODO.md`, `DEVLOG.md`)
- [x] User answers the open questions (none remaining; local profiles for v1)
- [x] User picks the stack: Svelte + Vite + TypeScript (`CODE.md` section 3)
- [ ] User picks the multiplayer path (`CODE.md` section 4)
- [x] User picks the missing-suit mini-game: Reaction Tap (`PROJECT.md` section 5)
- [x] User approves the full plan in writing
- [x] Create the GitHub repo (`mmans-99/pubby`) and make the first commit and push

## Phase 1 — Rules engine (no UI)

- [x] **Testbed page** (`testbed/index.html`, `CODE.md` section 8a): deal, reshuffle vote, swap, missing suits, Reaction Tap result, winner picks leader, tricks, slaps, jokers, final two, scoring across rounds. Published as a private link.
- [~] User play-tests the rules built so far (round start, tricks, slaps, jokers, final two)

- [x] Scaffold Svelte + Vite + TypeScript project (placeholder screen only)
- [~] Define the game state and action types (`CODE.md` section 6) — draft in `src/rules/types.ts`
- [x] Deck creation (one 52-card deck, Ace high), joker count, and hidden decks by player count
- [x] Hidden decks dealt first, automatically in the background; dealer deals only to players
- [ ] Test that player views never include hidden decks (needs the session layer)
- [ ] `voteResolved` event with `decidedBy` (majority or host) for the result pop-up
- [x] Round-1 host shuffle/deal and host lead, later-round loser shuffle/deal, winner chooses leader
- [x] Full fresh deck every round; hidden decks every round (2 and 3 players)
- [x] Trick play: follow suit, slap, trick resolution, leading (next highest if the top card's player is out)
- [x] Going out, finishing order, round end and loser
- [x] Missing-suit declaration and Reaction Tap result (slowest leads, false start slowest, ties replay)
- [x] Final-two rule (all game sizes): higher last card picks up the waste pile or forfeits; lower card, joker or slap wins; forfeit stays available after a pick-up
- [x] Joker rule: own turn even when able to follow, joker leads, joker last card out at once, final-two joker cases, shared second-last place
- [ ] Reshuffle vote (any player can call; majority; before every round; once per round; locked once the round begins) — once-per-round is in the testbed, the session layer will enforce it
- [x] Hidden swap (2 and 3 players, every round, choose up to 4 cards or none, given cards leave the round)
- [~] Reshuffle vote: tally and fresh redeal done; wiring into the game flow comes with the session layer
- [ ] Joker rule: on by default, host can turn off at setup; total jokers shown at game start
- [x] Dealing: auto deal (first-name tap, clockwise, step by step for the animation, dealer can switch to manual) and manual deal, switchable at any time
- [x] Voting: majority rule, majority of no fails, host decides on a tie or too few votes (used by reshuffle, target, and Ultimate)
- [ ] Host pause and resume; player pause requests approved by host; optional host time limit (default none)
- [x] Forfeit scores last place
- [x] Shared second-last place scoring (final two both out on jokers)
- [ ] Event log (slaps, reaction times, forfeits, jokers, reshuffle votes) for trivia and the game record
- [ ] Game record saved on each phone when the session ends (no host export)
- [ ] Profile history: per-profile totals updated once per game at session end
- [ ] Stats export: session stats (results screen) and profile stats (profile screen), via phone share sheet (CSV)
- [x] Scoring tables for 2 to 8 players
- [ ] Target score vote; reaching the target starts an Ultimate Round vote
- [ ] Ultimate Round (any player can trigger from a results screen; majority vote; outside the score; Ultimate Winner and Loser labels outrank scores; both Ultimate Loser if the final two share second-last on jokers)
- [~] Unit tests for every rule above (59 passing: cards, deal, scoring, voting, round start, trick play, final two)
- [ ] Run `npm install` and confirm the Svelte build on a machine with network access

## Phase 2 — Pass-and-play UI (one device, offline)

- [ ] Profile setup and per-session names
- [ ] Lobby: 2 to 8 players
- [ ] Hot-seat hand screen (hide cards between turns)
- [ ] Table view and turn indicator
- [ ] SLAP! pop-up, emoji bar, and catch-phrases (content in `src/content/`)
- [ ] Missing-suit prompt and mini-game
- [ ] Peek and take-cards prompts
- [ ] Reshuffle vote and hidden-swap screens (phone layout); hidden decks never drawn, only the "Swap cards" option
- [ ] Vote result pop-up on every phone: "Majority says… YES/NO" or "Host says… YES/NO", naming what was decided
- [ ] Quick rules: button on every screen, opens on that phone only, game keeps running underneath (content in `src/content/quick-rules.md`, draft written)
- [ ] Pause overlay for all players, and pause-request button for non-host players
- [ ] Reaction Tap mini-game screen (chosen; slowest reactor leads, ties replay)
- [ ] Auto-deal animation with switch-to-manual control; manual deal taps
- [ ] Joker count banner at game start; host setup toggle for the joker rule
- [ ] Results screen after every round: scores, trivia, per-player "slapped by most" and "slapped most", no timer, ready-up for players, host moves on
- [ ] Target score vote and Ultimate Round vote on the results screen
- [ ] Slap pop-up: big SLAP!, who slapped who underneath in a smaller font, 😂 spam and catch-phrases, including "You got slapped by a kiiid"
- [ ] Going-out pop-up with the place, place badge next to the name, one last-two pop-up (second last + the loser), results headline "X is the winner"
- [ ] Ultimate Round button on the results screen and majority vote UI
- [ ] Round end, scoreboard, and vote screens
- [ ] Manual playtest at 2, 3, 5, and 8 players

## Phase 3 — Offline PWA

- [ ] Manifest and icons
- [ ] Service worker caches the app shell
- [ ] Confirmed working with no network

## Phase 4 — Multiplayer over local network

- [ ] Choose transport (`CODE.md` section 4)
- [ ] QR code: host display and camera scanner
- [ ] Host session, join flow, and reconnection
- [ ] Per-player private views (hidden hands never leave the device)
- [ ] Multiplayer playtest with 2 to 8 devices

## Phase 5 — Polish

- [ ] Animations for slap and trick resolution
- [ ] Sound (optional, DECIDE)
- [ ] Accessibility pass (contrast, tap targets, screen reader labels)
- [ ] User adds more catch-phrases to `src/content/`

## Phase 6 — Optional accounts and sync (later, not v1)

- [ ] Decide between local profiles only and hosted sign-in (`CODE.md`, section 6b)
- [ ] If chosen: sign-in, cloud sync of profile history, privacy policy

## Blocked

- [!] Multiplayer path in `CODE.md` section 4 (blocks Phase 4 only; Phases 1 to 3 can start)
