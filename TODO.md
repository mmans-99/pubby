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

## Phase 4 — Multiplayer over local network (WebRTC, phones only) (slice 4 waits until Phase 4b is done)

- [x] Choose transport: B, WebRTC with QR handshake, no server (`CODE.md` section 4)
- [x] User approves the Phase 4 plan (`CODE.md` section 4a, 20:39)
- [x] User answers the multiplayer open questions (2026-11-07, `PROJECT.md` section 12)
- [x] **Slice 0: connection test** (go / no-go; screen removed in 2.2): version 1.3; user's test passed on a hotspot (Android + Android, Android + iPhone, mobile data on and off), 2026-11-07 22:18. Home Wi-Fi not tried yet.
- [x] **Version 1.4:** Pubby's own QR reader (iPhones scan in Pubby and can host), join link fixed when Pubby is already open, Exit Pubby button. Pushed 22:44; connection test passed again on a hotspot (23:06)
- [~] **Version 1.5:** stop pinch zoom slipping through in Samsung Internet. Pushed; user to test on the Samsung phone
- [x] **Slice 1: network lobby** (version 2.1, built 2026-11-08, `CODE.md` 9i; pushed; user tested 2.2 on phones: "Test is fine", 15:12)
  - [x] "Multiplayer" on the main menu; one-phone game renamed "New game · one phone"
  - [x] Host or Join; "Who's on this phone?" (profile or new name)
  - [x] Add player: code 1 as a `#lobby=` link QR, scan code 2, connect; one at a time; Try again / Cancel
  - [x] Every phone sees the same seats and settings (Host / You tags); names for this game set on each phone
  - [x] Host: seat order, remove (asks first), joker rule, pause limit, Start (2+ players, no duplicate names)
  - [x] No late joining; different Pubby versions refused; lobby and connection-test codes kept apart
  - [x] Keep-alive pings; a silent phone (20 s) loses its seat; Leave / Close ask first; back gesture handled
  - [x] Start: every phone shows "All set" with the same list (deal is slice 2); host can go back to the lobby
  - [x] Checks: `tests/net/lobby.test.ts` (9), `testbed/lobby_check.py` 50 of 50
  - [x] Commit and push v2.1 as the GitHub Pages test build (user approved 13:16)
  - [x] User tests on phones (user 15:12: "Test is fine")
  - [x] User confirmed the 20 s quiet-phone rule (13:30)
- [x] **Version 2.2** (user 13:30, from testing 2.1; pushed 14:16; tested by the user, 15:12)
  - [x] A profile in the saved game can't be deleted; a missing one turns Carry on off and says why
  - [x] Connection test removed (button, screen, `#join=` links, `net_check.py`); its checks moved to `lobby_check.py` (67 of 67)
  - [x] Commit and push v2.2 as the GitHub Pages test build (user approved 14:16)
  - [x] User tests v2.2 on phones ("Test is fine", 15:12)
- [~] **Slice 2: play over the network** (version 2.3, user 15:12 "Build slice 2"; built, `CODE.md` 9j; pushed 16:14 as the GitHub Pages test build; waiting for the user's phone test)
  - [x] Host runs the game; each other phone gets its own copy with every other hand, the deck, the waste pile and the hidden decks blank (`src/net/netgame.ts`)
  - [x] Moves from a phone only for its own player; refused moves come back with the reason
  - [x] Long messages sent in parts; the log sent in parts after the first message
  - [x] Start begins the game on every phone; "Back to the lobby" removed
  - [x] Dealing from the dealer's phone only (auto deal driven by the host's phone); others watch with the flying cards and sounds
  - [x] Play on your own phone: legal cards lit, glowing seat for whoever acts, "X's turn"; slaps, final two, HAHAHA!, pop-ups, animations and sounds on every phone
  - [x] Hidden swap, Reaction Tap and answering votes on each phone at once (screens reused from pass-and-play)
  - [x] Before the round: your own cards; host starts the round. Results: podium; host Next round / End the game. Game over on every phone
  - [x] Game saved on every phone at the end, to that phone's own profile only; a network game never replaces a saved one-phone game
  - [x] Menu: host Close the game (every phone), others Leave the game; a lost or leaving phone shown on every phone
  - [x] Checks: `tests/net/netgame.test.ts` (6), unit tests 147; `testbed/netgame_check.py` (2, 3, 5 players, leaving, closing, one-phone game kept); `lobby_check.py` updated for the new Start
  - [x] Commit and push v2.3 as the GitHub Pages test build (user approved 16:14)
  - [x] User tests v2.3 on phones (feedback built into 2.4)
- [x] **Version 2.4: table and fixes from the v2.3 test** (user 16:38 and 17:55; mockup https://claude.ai/artifact/RBHyfJN8dkByCmMG9aCe6B approved 18:43 "Looks good"; built, `CODE.md` 9k; pushed 19:22 as the GitHub Pages test build; tested by the user on phones 2026-11-12: "it was fine")
  - [x] Fix: no shuffle animation at the start of a network game (first screen drawn before the shuffle starts)
  - [x] Players around an oval table, you at the bottom (one-phone games too: whoever holds the phone), others clockwise; played cards in front of each player, waste pile in the middle, glowing seat for whose turn; deal and end-of-trick animations to the seats
  - [x] Reactions (emoji and catch-phrases) sent to every phone, floating from the sender's seat with their name; shown from the start of the game to the end only
  - [x] "Host is deciding / setting up" line on other phones wherever the host makes a decision (lobby: adding a player, settings, seat order, starting; game: starting the round, next round or end, no-majority votes, removing a player)
- [~] **Slice 3: votes, take-cards, pause, ready-up on every phone** (plan approved and built 2026-11-12, `CODE.md` 9l; version 2.5; **built, not pushed: waiting for the user's approval to push and their phone test**)
  - [x] Host clock for pauses: host stamps `at`, `hostNow` in game messages, countdown with the clock offset, only the host ticks; `LOBBY_PROTOCOL` 4
  - [x] Open live votes: ballot chips on every phone; host "Count now" (2 players: "Stop waiting")
  - [x] Call votes from your own phone: Deal again? before the round, Propose target (round 1 and results), Ultimate on results
  - [x] Ready-up: "I'm ready" on each phone, ready row on every phone, "N of M ready" on the host's
  - [x] Take-cards: public in network games (redaction and events), ask / answer / withdraw on own phone, status line on other phones, leader's Play off with the reason, notes
  - [x] Pause: host pauses directly, others ask; banner on the host only; pause screen on every phone, Resume and limits host only; Reaction Tap reset on pause
  - [x] Quick rules, back gesture, comments and `PROJECT.md` 12 "not yet" lines
  - [x] Checks: unit tests, `netgame_check.py` additions, all other checks still pass
  - [ ] User approves pushing v2.5 as the GitHub Pages test build, then tests it with the `CODE.md` 9l checklist (checks pass: `testbed/netvotes_check.py` 30 of 30, `netgame_check.py` 94 of 94, `lobby_check.py` 67 of 67)
- [ ] **Slice 4: drops, rejoining, screen kept awake**
- [x] QR code: host display and camera scanner (bundled maker; Android built-in reader; Camera app join link)
- [x] Bundled QR reader so an iPhone can scan in Pubby and host (v1.4, user asked 22:23)
- [~] Host session (slice 2), join flow (lobby done in slice 1), and reconnection (slice 4)
- [x] Per-player private views (hidden hands never leave the host's phone; slice 2)
- [x] Reactions sent to every phone, showing who sent them and floating in from the sender's side of the table (2.4)
- [ ] Multiplayer playtest with 2 to 8 devices

## Phase 4b — Single player with computer players (current; plan approved 2026-11-12, `PROJECT.md` 12c, build guide `CODE.md` 9m)

Built before network slice 4 (user 2026-11-12). One slice at a time; each needs checks, a test build and the user's "push".

- [x] User answers the single-player questions and approves the plan (2026-11-12 17:15)
- [x] **Slice A: AI brain and arena** (`CODE.md` 9m.1 to 9m.4, 9m.9). Built and pushed 2026-11-12 as version 2.6.0; checks pass
  - [x] `computer` flag on players; `vsComputer` on game records (9m.2)
  - [x] `src/ai/`: persona, names, seen, memory, eval, moves, decide, react
  - [x] Tests: imports, seen (public log), fair play, memory, eval, moves, decide (plus names and react)
  - [x] `testbed/ai_arena.ts` and its pass bars (all pass; numbers in `CODE.md` 9m.9)
  - [ ] Phone check: nothing to play yet (rule 5); the arena numbers are the check for this slice
- [~] **Slice B: single player on the phone, Normal only** (9m.5 to 9m.8; built as version 2.7.0 on 2026-11-12, pushed as the GitHub Pages test build on 2026-11-12 at the user's request; phone test still to do)
  - [x] Bot driver `src/ui/bots.ts` (one move at a time, "thinking…" on the seat, reactions, memory rebuilt on Carry on); `thinking.ts`
  - [x] Own-seat screens for single player (`ownSeat`, `runsSession`, `isHostSeat` in `game.ts`; network screens reused)
  - [x] Setup screen "Play against the computer" (`solosetup.ts`): you, 1 to 7 computer players, Normal level, speed, reactions, jokers, pause limit
  - [x] Vs-computer stats kept apart (`pubby.profiles.vsComputer`); profile details and CSV show a "Vs computer" block; past games tag
  - [x] Checks: `npm test` 203 of 203, `testbed/solo_check.py` 18 of 18, and every existing browser check passes (see DEVLOG)
  - [ ] User's phone test (checklist in `CODE.md` 9m.9)
- [~] **Slice C: Easy, Mixed levels, personalities, names (many cultures, editable), reactions (on by default), speed** (built as 2.9.0 and pushed as the test build; phone check still to do, `CODE.md` 9m.9)
  - [x] Setup screen: All Easy, All Normal, Mixed; each computer player's own level chip (Easy or Normal); Hard not offered until slice D
  - [x] Names: each computer player's name editable on setup, checked for clashes (`botNamesProblem`), "New names", names re-rolled when a clashing profile is chosen
  - [x] Computer icon before the name at the table
  - [x] Reactions switch and speed checked in the browser (they were added in slice B)
  - [x] Personalities, Easy forgetting and slips (built in slice A); arena: Normal beats Easy (bar 0.15, measured 0.536)
  - [x] Checks: `npm test` 207 of 207; `solo_check.py --slice-c` 14 of 14; `solo_check.py` 18 of 18; `back_check.py` 14 of 14; `offline_check.py` 20 of 20
  - [ ] User's phone check (`CODE.md` 9m.9, slice C checklist: All Easy and All Normal games, reactions not spammy, speeds)
- [x] **Slice D: Hard** (sampling and search). Pushed to main as 2.13.0 on 2026-11-13 (commit b878519). All arena bars pass (Hard beats Normal by 0.242 over 2000 games); unit tests 219 of 219; browser check `solo_check.py --slice-d` (see DEVLOG). Waiting for the user's phone test after "push" (`CODE.md` 9m.9).
  - [x] D2.1 Score card quality at the cut-off (`handDanger`, `SEARCH_WEIGHTS`)
  - [x] D2.2 Imagined opponents play like Normal (`_rolloutCard`)
  - [x] D2.3 Search as a second opinion (`searchScores`, `HARD_TUNING.switchMargin` = 0.3)
  - [x] D2.4 Longer look-ahead / more samples: not needed (gap over 0.2)
  - [x] Full `--bars` (all pass), checks, version 2.13.0
  - [x] `solo_check.py --slice-d` 11 of 11; `--slice-c` 14 of 14; `back_check.py` 14 of 14; `offline_check.py` 20 of 20
  - [ ] User's phone test (`CODE.md` 9m.9, slice D checklist)
- [x] **Version 2.14:** antagonising reactions and 6 s lead pop-up (pushed 2026-11-13 as a test build; phone test to do)
- [x] **Version 2.15** (plan `CODE.md` 9n to 9p, approved 2026-11-13; built locally 2026-11-13, not committed or pushed)
  - [x] 9o.1 Fake clock in browser checks (solo, drawer, playthrough; lobby, netgame, netvotes stay on real time)
  - [x] 9o.2 Stuck-game check (solo and playthrough: 30 s without a new log event fails with a dump)
  - [x] 9o.3 Shorter browser games (slice C and D one round; slice D one Mixed game)
  - [x] 9o.4 "Which checks when" rule in `CODE.md` 8
  - [x] 9o.5 Arena on both cores (`--workers`, same results as one worker; `--bars` 460 s with 2 workers)
  - [x] 9o.6 All Easy stall: the test bot never answered take-cards requests on the person's seat (test script, not app); fixed in `testbed/bot.js`
  - [x] 9p Secret missing suits (session, pop-up, computer memory, tests)
  - [x] 9n.1 Checks all pass; pushed as d14b4a1; user's phone test passed (2026-11-13)
- [~] **Version 2.16:** computer players react more (rates, going out always, round-end triggers, 2.5 s gap, three per event); built locally, checks pass; waiting for the user's phone test and "push"
- [x] **Faster checks, part 2** (plan `CODE.md` 9q, approved 2026-11-13; pushed 2026-11-13, test-only)
  - [x] 9q.1 `testbed/run_checks.py`: run only the checks for what changed
  - [x] 9q.2 netgame: 3-player game 1 round
  - [x] 9q.3 Shorter real sleeps in fast mode (keep only if faster)
  - [x] 9q.4 Full run once, times in the DEVLOG, then "push"
- [ ] **Slice E: people and computer players on one phone**
- [ ] **Slice F: computer players in network games** (now Phase 4f, version 2.26, `CODE.md` 9u Part C)
- [ ] **Slice G: tuning from the user's games**

## Phase 4c — Online play: rooms over the internet (plan written 2026-11-13, `PROJECT.md` 12d, build guide `CODE.md` 9r; O1 deployed, O2 built as 2.18.0 not pushed)

Order against Phase 4b slice E is the user's call. One slice at a time; each needs checks, a test build and the user's "push".

- [x] Plan written and pushed (docs only, 2026-11-13)
- [ ] User confirms the four defaults (`PROJECT.md` Open questions): keep Nearby, room list, 4-digit passcode, Cloudflare
- [ ] User's one-time Cloudflare setup: account, workers.dev name, Account ID, API token, two GitHub secrets (`CODE.md` 9r.4)
- [~] **Slice O1: the server** (version 2.17.1; pushed 2.17.0, fixed in 2.17.1, deploy green; the user's `/health` check on the phone is still open; `CODE.md` 9r.8)
  - [x] `src/net/relayproto.ts` + tests
  - [x] `RoomCore`, `DirectoryCore`, ids, api checks + tests (`tests/server/`)
  - [x] Cloudflare wrappers, `wrangler.toml`, `server/package.json`, `server/tsconfig.json` (bundled with esbuild; not type checked here, CI does it)
  - [x] `testbed/relay_server.ts` + its test (`tests/server/relay_server.test.ts`)
  - [x] `.github/workflows/server.yml` written
  - [ ] User's Cloudflare setup (`CODE.md` 9r.4), then push, then the deploy works and `/health` opens on the user's phone
  - [x] Free plan: open-WebSocket limit checked and written in 9r.1 (no published cap; still to check on the dashboard after the first deploy)
- [~] **Slice O2: online rooms in the app** (version 2.18.0; built 2026-11-13, not pushed; `CODE.md` 9r.8)
  - [x] `Link` interface and `chunk.ts`; Nearby checks unchanged (lobby 67/67, netgame 94/94, votes 30/30)
  - [x] `server.ts`, `online.ts` (createRoom, joinRoom, watchRooms, HostRoom, OnlineLink)
  - [x] Screens: Online/Nearby, room form, room list, passcode, Share invite, `#room=` links
  - [x] `testbed/online_check.py` (37/37 against the local relay), `run_checks.py` row
  - [ ] Real online test: the deployed server only accepts the GitHub Pages origin, so this needs the push
  - [ ] User's phone test on two different networks (9r.8 checklist)
- [ ] **Slice O3: rejoin online** (version 2.19; with Nearby slice 4)
- [ ] Slice O4 (game on the server): only if the user asks

## Phase 4d — Everyone at the table before a game starts (plan 2026-11-13, `PROJECT.md` 12e, build guide `CODE.md` 9s; pushed as 2.19.0, f487bd8)

- [x] Plan written (docs only, 2026-11-13)
- [x] User answers the four questions (2026-11-13: arrival at the table; no start without a player who left; "Waiting for" in lobby and after Start; quick rules unchanged)
- [x] Read-first checks in `CODE.md` 9s.0 (card screen is a stage inside the game; reconnect cannot enter a game before start), recorded in 9s
- [x] Build Option A (`CODE.md` 9s.2): ready flag per seat, Start gated, "Waiting for" text on host and joining phones (2.19.0)
- [x] Unit tests: `tests/net/pregame.test.ts` (ready set, waiting text, messages); `tests/net/lobby.test.ts` updated. 293/293 pass
- [x] Browser checks: `lobby_check.py` 67/67, `netgame_check.py` 94/94, `online_check.py` 37/37
- [ ] `testbed/pregame_check.py`: not written (the "Waiting for" text lasts only until the joiner's ready message, so it can't be seen in a browser run without a delay hook)
- [ ] Known gap vs `PROJECT.md` 12e: under Option A the cards screen is inside the game, so a slow player's cards screen still does not hold others back (user chose Option A, 2026-11-13)
- [x] Pushed as 2.19.0 (f487bd8), GitHub Pages test build; version told to the user
- [x] User's phone test (2026-11-13 17:10): lobby fine, but after the swap one phone was still on Done while the host played (the known gap). Fixed by Phase 4e

## Phase 4e — Version 2.20: lobby scroll place, cards seen before play, Next round waits for ready (plan 2026-11-13, `PROJECT.md` 12f, build guide `CODE.md` 9t; built and pushed as 2.20.0)

- [x] Cause found and plan written (docs only, 2026-11-13)
- [x] User answered 12f (2026-11-13): host can't skip a slow player; no quick-rules line; Next round waits for everyone ready
- [x] User approves the build
- [x] Part A: `draw()` in `netlobby.ts` keeps the scroll place; `lobby_check.py` scroll checks
- [x] Part B1-B5: session `waitForAll` flag, `handSeen`, phase `cardCheck`, action `seenHand`, view, `PHONE_ACTIONS`, `LOBBY_PROTOCOL` 6, on for Multiplayer and games against the computer
- [x] Part B6: screens (Done sends `seenHand`; "Waiting for X"; screen without marks after a reopen)
- [x] Part B7: computer players press Done
- [x] Part C: `advance` held until all ready (`waitForAll` games); host button "Waiting for X"; End the game not held
- [x] Part B9 and C5: `tests/session/card-check.test.ts`, netgame test, `netgame_check.py` hold check, `solo_check.py`, arena; all existing checks pass
- [x] Version 2.20.0, MD files, DEVLOG; push as the test build when the user says; phone test with the 12f checklist
- [x] Pushed as 2.20.0 (GitHub Pages test build); version told to the user. Tests: 312 unit, all browser checks pass (lobby 70, netgame 97, solo incl. 2-player, arena 2/3/8 players)
- [ ] Phone test by the user (checklist in `PROJECT.md` 12f)

## Phase 4g — Fast forward and skip to end of round when only computer players are left (plan 2026-11-13, `PROJECT.md` 12h, build guide `CODE.md` 9v; 2.27.0 pushed as 469d086)

- [x] Plan written (docs only)
- [x] User answers the five open questions in `PROJECT.md` 12h (recorded 2026-11-13 19:59)
- [x] **2.27.0 (built, not pushed):** `botsOnlyNow` (9v.2) with tests; fast forward (9v.3); skip to end (9v.4); host-only network part and the joiner line (9v.5); unit tests 349 pass; build OK
- [x] Pushed (469d086, user "Push it and commit" 2026-11-13)
- [ ] Phone test of 2.27.0 (one-phone game with 3 computer players, you out; then a network game)

## Phase 4h — Quiet seats (Option C) and a table that fits any screen (plan 2026-11-13 20:16, `PROJECT.md` 12i, build guide `CODE.md` 9w; 2.28.0 pushed as ebb7c74; 2.28.1 keyboard fix pushed; phone test to do)

- [x] Mockup with four options; user chose C
- [x] Plan written for Haiku (docs only)
- [ ] **2.28.0:** `tableBox` (9w.2) and `seatLayout` (9w.3) with tests; Option C seat markup and CSS (9w.1); any screen and landscape (9w.4); hand sizing (9w.5); checks; user's phone test; push

## Phase 5 — Polish

- [ ] Animations for slap and trick resolution
- [~] **Sound and music** (`PROJECT.md` 12b, `CODE.md` 9g; samples: https://claude.ai/artifact/Q54YRtsC8xME6LN7uAHzvZ)
  - [x] Feel decided: cosy pub card night, comic effects, not sentimental
  - [x] Music: Fireside Piano set (menu, during play, Ultimate Round, results) (2026-11-08)
  - [x] Paused = Click; take-cards request = Knock knock
  - [x] SLAP! = Huge; fireplace crackle kept; Resumed = click up; every other effect as on the sample page (2026-11-08 07:29)
  - [x] Sound on by default, music and effects both quieter; music and effects on/off and volume changeable mid-game from the sound button (2026-11-08 07:29)
  - [x] Plan for `src/audio/` approved (07:31), version 2.0
  - [x] Built: `src/audio/` (engine, music, sfx, settings), `src/ui/sound.ts` (sound button and sheet), hooks in the game; `testbed/sound_check.py` 37 of 37; playthrough 53 of 53, back 14 of 14, offline 20 of 20, unit tests 132
  - [x] User tested v2.0 on the phone (test link https://claude.ai/artifact/MSgwk5EHWy6Ri3hREFPYjf); iPhone silent switch still worth a check on GitHub Pages
  - [x] Commit and push v2.0 (10:07)
  - [x] **User feedback on the v2.0 test (08:22), approved 08:24, built into v2.0:**
    - [x] "Ding" after a card removed (the your-turn chime is no longer played)
    - [x] Effects no longer pile up: one big effect at a time (queued), small ones skipped while a big one plays, no tap sound on in-game buttons, music dips under big effects
    - [x] End-of-trick animation: trick stays on the felt 0.7 s, then (after the SLAP! pop-up) the cards slide to the waste pile or into the slapped player's seat; taps, pop-ups and sounds wait for it
    - [x] Shuffle animation (two riffles, 1.7 s) before the deal at game start, every new round and after a reshuffle vote
    - [x] Music off by default, effects on (user 08:56; settings key now `pubby.sound.v2`)
    - [x] HAHAHA! pop-up and laugh sound in the final two (higher last card); choice panel text cut to "Pick up or forfeit"
    - [x] "Lead any card" / Play button centred (same space on both sides of it)
    - [x] Less text, more visual: all 25 picks approved (09:27) and built (PROJECT.md 12a, CODE.md 9h): G1 to G5, D1 to D4, S1, T1, V1, W1, P1, H1 to H6, U1, R1 to R4
    - [x] G4 fixed: unplayable cards are greyed out from the moment the hand appears
    - [x] Quick rules: new Dealing card, how to play a card, what the table shows, secret votes, the target row, next round; the ? opens at the card for the screen; rules tables and one paragraph per line now render properly
    - [x] User asked to commit and push v2.0 (10:07)
- [ ] Accessibility pass (contrast, tap targets, screen reader labels)
- [ ] User adds more catch-phrases to `src/content/`

## Phase 6 — Optional accounts and sync (later, not v1)

- [ ] Decide between local profiles only and hosted sign-in (`CODE.md`, section 6b)
- [ ] If chosen: sign-in, cloud sync of profile history, privacy policy

## Blocked

- (none)

## Phase 4f — Classic cards, see-through reactions, staying connected, computer players in Multiplayer (plan 2026-11-13, `PROJECT.md` 12g, build guide `CODE.md` 9u; not built)

- [x] Plan and mockup written (docs only)
- [ ] User approves the plan and the mockup
- [x] **2.24.0 (built, not pushed):** Part B see-through reactions sheet; Part D classic card faces and fanned hand; Part E table (edge fans, thrown pile, waste pile in the corner); checks; user's phone test; push
- [x] **2.25.0 (built, not pushed):** Part A away seats (10 minutes), host and joiner reconnect online, room kept on the list, server change and deploy; checks; phone test on two networks; push
- [x] **2.26.0 (built, not pushed):** Part C computer players in Multiplayer (replaces Phase 4b slice F); checks; phone test; push

## Phase 4i — The game fits on one screen, full version number (plan 2026-11-13 20:48, `PROJECT.md` 12j, build guide `CODE.md` 9x; built, not committed)

- [x] Answer the three open questions in `PROJECT.md` 12j (defaults used; user has not objected)
- [~] **2.29.0:** full version and "updated" notice (9x.1); `gameLayout` with tests; `fanLayout maxH`; fixed game grid for every stage (9x.2); landscape (9x.3); checks passed; user's phone test pending; push pending

## Phase 4j — Missing-suit notices that stay until everyone taps OK (plan 2026-11-13 20:54, `PROJECT.md` 12k, build guide `CODE.md` 9y; built, not committed)

- [~] **2.30.0:** `leadNotice` phase and `seenNotice` action with tests (9y.2, 9 tests pass); notice screens (9y.3, not yet seen in a browser); checks passed (377 tests); user's phone test pending; push pending

## Phase 4k — Computer players that learn from you (plan 2026-11-13 21:25, `PROJECT.md` 12l, build guide `CODE.md` 9z; NOT BUILT; decision pending)

- [!] **Decision:** user picks option 1 (within a game), 2 (across games on the phone), 3 (offline tuning), or a mix (`PROJECT.md` 12l)
- [ ] Build the chosen option per `CODE.md` 9z (next free version; 2.31 is 9aa), with the fairness test (hidden-card test) and the arena check
- [ ] Phone checklist (`CODE.md` 9z.5) and push, after the user says "Push it"


## Phase 4l — Scroll place, Fast forward in the hand area, buttons that fit, neater last-trick stack (plan 2026-11-13 21:33, `PROJECT.md` 12m, build guide `CODE.md` 9aa; BUILT 2.31.0, not committed)

- [x] User approves the plan ("Build CODE.md 9aa (version 2.31)", 2026-11-13)
- [x] **2.31.0:** Part A scroll place kept on every redraw; Part B Fast forward / Skip where your cards were; Part C deal bar and round-start buttons fit, jokers chip in the top bar, target row at the top of the table; Part D last-trick stack step and corner index; tests; checks
- [ ] User's phone test (`CODE.md` 9aa.2); push to main after "Push it"
- [ ] Test bot gap (found 2026-11-13): `testbed/bot.js` does not tap the 2.30 missing-suit notice's OK, so the 5- and 8-player playthroughs stop there (the unmodified 2.30 build does the same). Fix needs approval (`CLAUDE.md` rule 2).

## Phase 4m — The asker's vote is YES; a vote waits until everyone has voted (plan 2026-11-13 22:04, `PROJECT.md` 12n, build guide `CODE.md` 9ab; BUILT 2.32.0, not committed)

- [x] User answered the two questions (asker is YES on every vote; everyone votes before a decision)
- [x] User confirmed the open detail in `PROJECT.md` 12n ("Count early is fine": missing votes count as not-yes)
- [x] **2.32.0:** Part A rules (`tallyVote` waiting, asker's ballot); Part B screens and quick rules; Part C tests (386 pass); `npm run check` and `npm run build` pass
- [ ] Testbed (`testbed/main.ts`) still shows YES / NO buttons to every player, so an asker's tap gets "already YES"; change only after the user approves
- [ ] User's phone test (`CODE.md` 9ab.5); push to main after "Push it"

## Phase 4n — Seat discs with initials, option D (plan 2026-11-13 22:46, `PROJECT.md` 12o, build guide `CODE.md` 9ac; BUILT 2.33.0, not committed)

- [x] User chose option D from the mock-ups; same initial → second letter (user)
- [x] **2.33.0:** Part A `seatInitials` + tests; Part B layout; Part C drawing and CSS; Part D checks and headless screenshots
- [ ] User's phone test (`CODE.md` 9ac.5); push to main after "Push it"

Also open from this session (not committed): 2.32.1 and 2.32.2 fixes (Fast forward and Skip, one Stop, no sound while they run, "You" pill not cut off); see `DEVLOG.md`. Phone test of 2.32.2 still to do.

## Phase 4o — Points table, typed messages, away notice, seats over fans, cards on "who leads?" (plan 2026-11-14 00:09, `PROJECT.md` 12p, build guide `CODE.md` 9ad; BUILT 2.34.0, pushed; phone test pending)

- [x] Part A: seat discs and names drawn over the fans
- [x] Part B: away notice floats over the table
- [x] Part C: your cards on "who leads?" (one phone: "Show my cards")
- [x] Part D: points table on results and game over
- [x] Part E: typed messages (protocol 9)
- [x] Part F: keep storage, back up and restore stats, old profiles load
- [x] Version 2.34.0 and checks done; the dealing-screen fix is in
- [x] Version 2.34.2: podium, "Last" row and "Round · total" caption removed on every results, game-over and network screen
- [ ] User's phone test (`CODE.md` 9ad.7)
- [x] Version 2.34.1: recent-message chips removed; nothing is saved from the reactions box (`CODE.md` 9ad.5 note)
- [ ] Watch: a played card or a suit symbol on the table once drew as a solid red or white box (phone screenshot, 2026-11-14; not reproduced in 46 plays; the last-trick spades showed the same). Fix only if it comes back.
