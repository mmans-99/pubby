# TODO — Pubby

Status key: `[ ]` not started, `[~]` in progress, `[x]` done, `[!]` blocked on a decision.

## Phase 0 — Planning

- [x] Write the five MD files (`CLAUDE.md`, `PROJECT.md`, `CODE.md`, `TODO.md`, `DEVLOG.md`)
- [x] User answers the open questions (none remaining; local profiles for v1)
- [x] User picks the stack: Svelte + Vite + TypeScript (`CODE.md` section 3); changed 2026-11-07 to plain TypeScript with esbuild
- [x] User picks the multiplayer path: B, WebRTC with QR handshake, phones only (2026-11-07, `CODE.md` section 4)
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
- [x] Joker rule: own turn even when able to follow, joker leads, final-two joker cases (2026-11-07: joker last card and shared second-last place removed; see below)
- [x] Reshuffle vote (any player can call; majority; before every round; once per round; locked once the round begins)
- [x] Hidden swap (2 and 3 players, every round, choose up to 4 cards or none, given cards leave the round)
- [x] Reshuffle vote wired into the game flow (dealer deals again; the round then carries on)
- [x] Joker rule: on by default, host can turn off at setup; total jokers shown at game start (`gameStarted` event)
- [x] Dealing: auto deal (first-name tap, clockwise, step by step for the animation, dealer can switch to manual) and manual deal, switchable at any time
- [x] Voting: majority rule, majority of no fails, host decides on a tie or too few votes (used by reshuffle, target, and Ultimate)
- [x] Host pause and resume; player pause requests approved by host; optional host time limit (default none)
- [x] Forfeit scores last place
- [x] Shared second-last place scoring (final two both out on jokers). No longer reachable since 2026-11-07; kept for old saved games
- [x] Event log (slaps, reaction times, forfeits, jokers, reshuffle votes) for trivia and the game record
- [x] Game record built when the session ends (`buildGameRecord`); saved to phone storage in Phase 2 slice 5
- [x] Profile history: per-profile totals updated once per game at session end (`addGameToProfiles`)
- [x] Stats export: session and profile CSV (`sessionCsv`, `profileCsv`); share buttons added in Phase 2 slice 5
- [x] Scoring tables for 2 to 8 players
- [x] Target score vote; reaching the target starts an Ultimate Round vote
- [x] Ultimate Round (any player can trigger from a results screen; majority vote; outside the score; Ultimate Winner and Loser labels outrank scores; both Ultimate Loser if the final two share second-last on jokers)
- [x] Results screen trivia from the event log (`computeTrivia`)
- [~] Unit tests for every rule above (118 passing: cards, deal, scoring, voting, round start, trick play, final two, session flow, votes, pause, results, Ultimate Round, player views, take-cards requests, trivia, game record, profiles, CSV, saved games storage)
- [ ] Run `npm install` on a machine with network access and confirm `npm run build` (only esbuild, tsx and TypeScript are needed now)

## Phase 2 — Pass-and-play UI (one device, offline)

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
- [x] Reactions drawer: 😂 button slides it open any time, stays until put away; SLAP! stays up 4 seconds
- [x] Dealing screen: auto deal with animation (tap first name, clockwise), manual deal taps, switch any time, deal the rest now
- [x] Table: seat strip with card counts, turn highlight and place badges; the felt with the current trick, led suit, waste pile, last trick
- [x] Hand: legal cards lit, tap a card then Play; jokers playable on your turn
- [x] Final two: pick up the waste pile or forfeit; forfeit stays available after a pick-up
- [x] Winner picks who leads (round 2 on)
- [x] Basic results screen (places, points, totals, "X is the winner"), next round, end game, game over standings
- [x] Stand-ins until slice 3: host starts the round (no reshuffle vote), everyone keeps their hand (no swap), random pick (no Reaction Tap)
- [x] **Slice 3: round start** (approved by the user, committed)
- [x] Reshuffle vote: any player calls it, pass the phone to vote in secret with your hand shown, host can count early, host decides with no majority, result pop-up
- [x] Hidden swap (2 and 3 players): pick up to 4 cards or keep, see new cards marked
- [x] Reaction Tap: red then green pad, times in ms, false starts, tie replays, slowest leads
- [x] Slice 2 stand-ins removed
- [x] **Slice 4: between tricks and rounds** (tested by the user, committed)
  - [x] Results screen: places, points, totals, trivia, per-player slapped by most / slapped most, ready up, host moves on
  - [x] Target score vote (before round 1 and on the results screen); target shown in the game bar
  - [x] Ultimate Round vote (called by any player, or started by reaching the target); Ultimate Round flow; game over with titles
  - [x] Take-cards request: ask, answer, withdraw, private notes, "Cards taken!" pop-up
  - [x] Pause: host pause, player requests (approve / say no), pause screen, optional time limit with countdown
- [x] **Rule changes 2026-11-07** (tested by the user, committed)
  - [x] Final two: no jokers while the other player is on their last normal card
  - [x] Nobody holds only jokers: last normal card throws away the jokers left (also on pick-up); joker-as-last-card and shared second-last rules removed
  - [x] Manual deal: never two cards in a row to the same player (auto deal skips them too after a switch)
  - [x] Take-cards: only before a trick, one request at a time, several askers -> the asked player chooses; "Someone wants to take cards" on the hand-off screen
  - [x] Quick rules updated
  - [x] Deal starts in manual; even manual deal (greyed out until everyone has a card)
  - [x] More catch-phrases ("Hurry up!!", "Slap him!!" and more); slimmer reactions bar
- [x] **Slice 5: saved games and profile history** (tested by the user, committed 2026-11-07)
  - [x] Save the game record and profile history on the phone when a game ends (`buildGameRecord`, `addGameToProfiles`; Phase 1 built them)
  - [x] Game over: "Saved on this phone" note (which profiles got the game) and "Share game stats (CSV)"
  - [x] Past games screen (home): every finished game, newest first, standings, share, delete (two taps)
  - [x] Profile details (tap a profile): overall totals, slapped by most / slapped most, "Share profile stats (CSV)"
  - [x] Share: phone share sheet with a .csv file; if the phone can't, a sheet with the CSV text, Copy and Download
  - [x] Final two: jokers always allowed ("no jokers against a last card" block dropped, user 2026-11-07); "same trick" wording (pop-up, note, "Play any card" button); "Missed round!" pop-up when both play jokers
  - [x] Rule batch (user, late afternoon): 2-player games ask instead of voting (both must agree); target minimum = highest score; draw at the end → Ultimate vote, "Coward!", second chance, shared scores; joker lead "same trick" wording in all sizes; final-two joker warning; hidden-deck notes (round 1 banner, setup, quick rules)
  - [x] Automated playthrough script (`testbed/playthrough.py`, `testbed/bot.js`): full games at 2, 3, 5 and 8 players through the real screens
- [x] Table view and turn indicator
- [x] SLAP! pop-up, emoji bar, and catch-phrases (content in `src/content/catch-phrases.md`)
- [x] Missing-suit prompt and mini-game
- [x] Reshuffle vote and hidden-swap screens (phone layout); hidden decks never drawn, only the "Swap cards" option
- [x] Vote result pop-up: "Majority says… YES/NO" or "Host says… YES/NO", naming what was decided
- [x] Pause overlay for all players, and pause-request button for non-host players (slice 4)
- [x] Take-cards request: button, request prompt for the asked player, "cards taken" pop-up (slice 4)
- [x] Reaction Tap mini-game screen (chosen; slowest reactor leads, ties replay)
- [x] Auto-deal animation with switch-to-manual control; manual deal taps
- [x] Joker count banner at game start; host setup toggle for the joker rule
- [x] Results screen after every round: scores, trivia, per-player "slapped by most" and "slapped most", no timer, ready-up for players, host moves on (slice 4)
- [x] Target score vote and Ultimate Round vote on the results screen (slice 4)
- [x] Slap pop-up: big SLAP!, who slapped who underneath in a smaller font, 😂 spam and catch-phrases, including "You got slapped by a kiiid"
- [x] Going-out pop-up with the place, place badge next to the name, one last-two pop-up (second last + the loser), results headline "X is the winner"
- [x] Ultimate Round button on the results screen and majority vote UI (slice 4)
- [x] Round end, scoreboard, and vote screens (slice 4)
- [~] Playtest at 2, 3, 5, and 8 players (automated runs pass; user's own playtest still to do)

## Phase 3 — Offline PWA (current)

- [x] Manifest and icons (`src/pwa/`; original Pubby icon, maskable)
- [x] Service worker caches the app (versioned cache, silent update on next open, old caches deleted)
- [x] Build writes `dist/` with `index.html`, `sw.js`, manifest and icons
- [x] GitHub Pages workflow (`.github/workflows/pages.yml`)
- [x] Automated offline check (`testbed/offline_check.py`: 20 of 20)
- [x] User turns on GitHub Pages (Settings > Pages > Source: GitHub Actions)
- [x] Commit and push (user approved 17:13; the private test link blocks service workers, so Pages is the test build)
- [x] Version number on the home screen and quick rules (v1.0; bump rule in `CLAUDE.md` rule 8)
- [x] No pinch zoom, no double-tap zoom, no pull-to-refresh
- [x] Push v1.0 (user asked for it at 17:40)
- [x] Back gesture: one screen back, nothing during a game, "Exit Pubby?" on the main menu (v1.1, `testbed/back_check.py` 10 of 10)
- [x] Push v1.1 (user asked 17:55)
- [x] Fix: back still closed the installed app (v1.2; guards only added inside a tap; `back_check.py` 14 of 14)
- [x] Push v1.2 (user approved 18:10)
- [~] Confirmed working with no network (automated check passes; user's own test on the phone still to do)

## Phase 4 — Multiplayer over local network (WebRTC, phones only)

- [x] Choose transport: B, WebRTC with QR handshake, no server (`CODE.md` section 4)
- [x] User approves the Phase 4 plan (`CODE.md` section 4a, 20:39)
- [x] User answers the multiplayer open questions (2026-11-07, `PROJECT.md` section 12)
- [x] **Slice 0: connection test** (go / no-go): version 1.3; user's test passed on a hotspot (Android + Android, Android + iPhone, mobile data on and off), 2026-11-07 22:18. Home Wi-Fi not tried yet.
- [~] **Version 1.4:** Pubby's own QR reader (iPhones scan in Pubby and can host), join link fixed when Pubby is already open, Exit Pubby button. Built and checked; user to test on phones after the push
- [ ] **Slice 1: network lobby**
- [ ] **Slice 2: play over the network**
- [ ] **Slice 3: votes, swap, Reaction Tap, requests, pause, reactions, results on every phone**
- [ ] **Slice 4: drops, rejoining, screen kept awake**
- [x] QR code: host display and camera scanner (bundled maker; Android built-in reader; Camera app join link)
- [x] Bundled QR reader so an iPhone can scan in Pubby and host (v1.4, user asked 22:23)
- [ ] Host session, join flow, and reconnection
- [ ] Per-player private views (hidden hands never leave the device)
- [ ] Reactions sent to every phone, showing who sent them and floating in from the sender's side of the table
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

- (none)
