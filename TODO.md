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

- [ ] Define the game state and action types (`CODE.md` section 6)
- [ ] Deck creation, joker handling, and hidden decks by player count
- [ ] Deal, round-1 host shuffle/deal and host lead, later-round loser shuffle/deal, winner chooses leader
- [ ] Trick play: follow suit, slap, trick resolution, leading
- [ ] Missing-suit declaration and the tie-break mini-game hook
- [ ] Final-two waste-pile rule and forfeit
- [ ] Joker rule, including the final-two joker cases
- [ ] Reshuffle vote (any player can call; majority; before every round; locked once the round begins)
- [ ] Hidden swap (2 and 3 players, round 1 only, choose up to 4 cards or none, given cards leave the game)
- [ ] Joker rule: on by default, host can turn off at setup; total jokers shown at game start
- [ ] Dealing: auto deal (first-name tap, clockwise, animated, dealer can switch to manual during the animation) and manual deal, switchable at any time
- [ ] Voting: majority rule, host decides if no majority (used by reshuffle, target, and Ultimate)
- [ ] Host pause and resume; player pause requests approved by host; optional host time limit (default none)
- [ ] Forfeit scores last place
- [ ] Event log (slaps, reaction times, forfeits, jokers, reshuffle votes) for trivia and the game record
- [ ] Game record saved on each phone when the session ends (no host export)
- [ ] Profile history: per-profile totals updated once per game at session end
- [ ] Stats export: session stats (results screen) and profile stats (profile screen), via phone share sheet (CSV)
- [ ] Scoring tables for 2 to 8 players
- [ ] Target score vote; reaching the target starts an Ultimate Round vote
- [ ] Ultimate Round (any player can trigger from a results screen; majority vote; outside the score; Ultimate Winner and Loser labels outrank scores)
- [ ] Unit tests for every rule above

## Phase 2 — Pass-and-play UI (one device, offline)

- [ ] Profile setup and per-session names
- [ ] Lobby: 2 to 8 players
- [ ] Hot-seat hand screen (hide cards between turns)
- [ ] Table view and turn indicator
- [ ] SLAP! pop-up, emoji bar, and catch-phrases (content in `src/content/`)
- [ ] Missing-suit prompt and mini-game
- [ ] Peek and take-cards prompts
- [ ] Reshuffle vote and hidden-swap screens (phone layout)
- [ ] Pause overlay for all players, and pause-request button for non-host players
- [ ] Reaction Tap mini-game screen (chosen; slowest reactor leads, ties replay)
- [ ] Auto-deal animation with switch-to-manual control; manual deal taps
- [ ] Joker count banner at game start; host setup toggle for the joker rule
- [ ] Results screen after every round: scores, trivia, per-player "slapped by most" and "slapped most", no timer, ready-up for players, host moves on
- [ ] Target score vote and Ultimate Round vote on the results screen
- [ ] Slap pop-up: 😂 spam and catch-phrases, including "You got slapped by a kiiid"
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
- [!] Approval to scaffold the Svelte + Vite project (blocks Phase 1 code)
