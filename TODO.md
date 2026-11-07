# TODO — Pubby

Status key: `[ ]` not started, `[~]` in progress, `[x]` done, `[!]` blocked on a decision.

## Phase 0 — Planning

- [x] Write the five MD files (`CLAUDE.md`, `PROJECT.md`, `CODE.md`, `TODO.md`, `DEVLOG.md`)
- [x] User answers the open questions (none remaining; local profiles for v1)
- [x] User picks the stack: Svelte + Vite + TypeScript (`CODE.md` section 3); changed 2026-11-07 to plain TypeScript with esbuild
- [ ] User picks the multiplayer path (`CODE.md` section 4)
- [x] User picks the missing-suit mini-game: Reaction Tap (`PROJECT.md` section 5)
- [x] User approves the full plan in writing
- [x] Create the GitHub repo (`mmans-99/pubby`) and make the first commit and push

## Phase 1 — Rules engine and session layer (no UI)

- [x] **Testbed page** (`testbed/index.html`, `CODE.md` section 8a): deal, reshuffle vote, swap, missing suits, Reaction Tap result, winner picks leader, tricks, slaps, jokers, final two, scoring across rounds. Published as a private link.
- [x] User play-tests the rules built so far (round start, tricks, slaps, jokers, final two)
- [x] **Session layer** (`src/session/`, `CODE.md` section 9b) ties rounds, votes, pause, results, target score, Ultimate Round and the event log together
- [~] User play-tests the session layer in the testbed (committed in `78962b7`)
- [x] User answers the four new open questions (all as proposed)
- [x] Target vote also before round 1 starts; hidden once a target or the Ultimate Round is agreed
- [x] Take-cards request (`PROJECT.md` section 4.2): rules, session layer, player views, tests, testbed

- [x] Scaffold Svelte + Vite + TypeScript project (placeholder screen only); replaced by the plain TypeScript build in Phase 2
- [x] Define the game state and action types (`src/session/types.ts`)
- [x] Deck creation (one 52-card deck, Ace high), joker count, and hidden decks by player count
- [x] Hidden decks dealt first, automatically in the background; dealer deals only to players
- [x] Test that player views never include hidden decks or other hands (`playerView`)
- [x] `voteResolved` event with `decidedBy` (majority or host) for the result pop-up
- [x] Round-1 host shuffle/deal and host lead, later-round loser shuffle/deal, winner chooses leader
- [x] Full fresh deck every round; hidden decks every round (2 and 3 players)
- [x] Trick play: follow suit, slap, trick resolution, leading (next highest if the top card's player is out)
- [x] Going out, finishing order, round end and loser
- [x] Missing-suit declaration and Reaction Tap result (slowest leads, false start slowest, ties replay)
- [x] Final-two rule (all game sizes): higher last card picks up the waste pile or forfeits; lower card, joker or slap wins; forfeit stays available after a pick-up
- [x] Joker rule: own turn even when able to follow, joker leads, joker last card out at once, final-two joker cases, shared second-last place
- [x] Reshuffle vote (any player can call; majority; before every round; once per round; locked once the round begins)
- [x] Hidden swap (2 and 3 players, every round, choose up to 4 cards or none, given cards leave the round)
- [x] Reshuffle vote wired into the game flow (dealer deals again; the round then carries on)
- [x] Joker rule: on by default, host can turn off at setup; total jokers shown at game start (`gameStarted` event)
- [x] Dealing: auto deal (first-name tap, clockwise, step by step for the animation, dealer can switch to manual) and manual deal, switchable at any time
- [x] Voting: majority rule, majority of no fails, host decides on a tie or too few votes (used by reshuffle, target, and Ultimate)
- [x] Host pause and resume; player pause requests approved by host; optional host time limit (default none)
- [x] Forfeit scores last place
- [x] Shared second-last place scoring (final two both out on jokers)
- [x] Event log (slaps, reaction times, forfeits, jokers, reshuffle votes) for trivia and the game record
- [x] Game record built when the session ends (`buildGameRecord`); saving to phone storage comes with the Phase 2 UI
- [x] Profile history: per-profile totals updated once per game at session end (`addGameToProfiles`)
- [x] Stats export: session and profile CSV (`sessionCsv`, `profileCsv`); the share sheet button comes with the Phase 2 UI
- [x] Scoring tables for 2 to 8 players
- [x] Target score vote; reaching the target starts an Ultimate Round vote
- [x] Ultimate Round (any player can trigger from a results screen; majority vote; outside the score; Ultimate Winner and Loser labels outrank scores; both Ultimate Loser if the final two share second-last on jokers)
- [x] Results screen trivia from the event log (`computeTrivia`)
- [~] Unit tests for every rule above (97 passing: cards, deal, scoring, voting, round start, trick play, final two, session flow, votes, pause, results, Ultimate Round, player views, take-cards requests, trivia, game record, profiles, CSV)
- [ ] Run `npm install` on a machine with network access and confirm `npm run build` (only esbuild, tsx and TypeScript are needed now)

## Phase 2 — Pass-and-play UI (one device, offline) (current)

Built in slices; each slice gets a test link and a checklist.

- [x] Switch the UI to plain TypeScript (no Svelte): `build.mjs` with esbuild, one-file `dist/index.html`
- [x] **Slice 1: lobby and setup** (tested by the user on their phone, committed)
- [x] Home screen: new game, carry on game, profiles
- [x] Profile setup (saved on the phone) and per-session names
- [x] Lobby: 2 to 8 players, seat order, host choice, joker rule toggle, pause time limit
- [x] Game saved on the phone, so closing the page doesn't lose it
- [x] Hot-seat hand screen (pass-the-phone screen, hide cards between players)
- [x] Quick rules: button on every screen (content from `src/content/quick-rules.md`)
- [x] **Slice 2: table and play** (tested by the user, committed)
- [x] SLAP! pop-up closes itself after 3 seconds, no emoji or catch-phrase on it; reactions bar (😂 and catch-phrases that float up and fade) after the slap
- [x] Dealing screen: auto deal with animation (tap first name, clockwise), manual deal taps, switch any time, deal the rest now
- [x] Table: seat strip with card counts, turn highlight and place badges; the felt with the current trick, led suit, waste pile, last trick
- [x] Hand: legal cards lit, tap a card then Play; jokers playable on your turn
- [x] Final two: pick up the waste pile or forfeit; forfeit stays available after a pick-up
- [x] Winner picks who leads (round 2 on)
- [x] Basic results screen (places, points, totals, "X is the winner"), next round, end game, game over standings
- [x] Stand-ins until slice 3: host starts the round (no reshuffle vote), everyone keeps their hand (no swap), random pick (no Reaction Tap)
- [ ] Slice 3: round start (reshuffle vote, hidden swap, missing suits, Reaction Tap); replaces the slice 2 stand-ins
- [ ] Slice 4: between tricks and rounds (results, trivia, votes, take-cards, pause)
- [x] Table view and turn indicator
- [x] SLAP! pop-up, emoji bar, and catch-phrases (content in `src/content/catch-phrases.md`)
- [ ] Missing-suit prompt and mini-game
- [ ] Reshuffle vote and hidden-swap screens (phone layout); hidden decks never drawn, only the "Swap cards" option
- [ ] Vote result pop-up on every phone: "Majority says… YES/NO" or "Host says… YES/NO", naming what was decided
- [ ] Pause overlay for all players, and pause-request button for non-host players
- [ ] Take-cards request: button, request prompt for the asked player, "cards taken" pop-up
- [ ] Reaction Tap mini-game screen (chosen; slowest reactor leads, ties replay)
- [x] Auto-deal animation with switch-to-manual control; manual deal taps
- [x] Joker count banner at game start; host setup toggle for the joker rule
- [ ] Results screen after every round: scores, trivia, per-player "slapped by most" and "slapped most", no timer, ready-up for players, host moves on
- [ ] Target score vote and Ultimate Round vote on the results screen
- [x] Slap pop-up: big SLAP!, who slapped who underneath in a smaller font, 😂 spam and catch-phrases, including "You got slapped by a kiiid"
- [x] Going-out pop-up with the place, place badge next to the name, one last-two pop-up (second last + the loser), results headline "X is the winner"
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
