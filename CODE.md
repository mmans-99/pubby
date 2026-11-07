# CODE.md — Technical plan for Pubby

**Status:** Plan approved. Stack: plain TypeScript, no framework (section 3, changed 2026-11-07). Phase 1: rules engine built (section 9a), session layer built (section 9b). Phase 2: UI in progress (section 9c). Items marked **DECIDE** need the user's choice.

---

## 1. Goals

- Works offline (installable PWA).
- Pass-and-play on one device for 2 to 8 players.
- Multiplayer over a local network, joined by QR code, no internet needed.
- Game rules are testable without any UI.

## 2. Architecture

Split the code into three layers. Each layer only talks to the one below it.

1. **Rules engine (pure logic).** No DOM, no network. Takes a game state and an action, and returns a new state and events. Holds all of section 2 to 11 of `PROJECT.md`. This is where most of the testing lives.
2. **Session layer.** Holds the game state, enforces turn order, hides private information, and handles join/leave. In pass-and-play, it runs locally. In multiplayer, one device runs it as the host.
3. **UI layer.** Renders the state, sends player actions to the session, and shows popups (SLAP!, emojis, catch-phrases, prompts).

Keeping the rules engine pure means the same logic runs in pass-and-play, in multiplayer, and in tests.

## 3. Stack (decided: plain TypeScript, no framework)

**Changed by the user on 2026-11-07: plain TypeScript, no UI framework, built with esbuild.** It replaces Svelte + Vite (chosen 2026-11-06). Reason: Svelte could not be installed in the cloud workspace (no network for packages), and the user preferred building now in plain TypeScript. The app is still an ordinary offline web app for phones, hosted on GitHub Pages.

| Option | Pros | Cons |
|---|---|---|
| **A. Plain TypeScript, no framework (chosen)** | Small, fast, easy to keep offline, nothing extra to install, no framework lock-in | Screens, redraws and animations are written by hand |
| B. React + Vite | Familiar component model, lots of tooling | Heavier bundle, more to keep offline |
| C. Svelte + Vite (was chosen, dropped) | Built-in transitions, tidy components | Needs packages this workspace can't install |

How it fits the architecture (section 2):
- **Rules engine** (`src/rules/`) and **session layer** (`src/session/`): plain TypeScript, unchanged.
- **UI layer** (`src/ui/`): plain TypeScript and the browser DOM. One `state` object; every change goes through `update()`, which saves and redraws the screen. Screens are functions that return DOM nodes, built with a tiny `h()` helper (`src/ui/dom.ts`). Animations use CSS animations and transitions (later the browser's Web Animations API for cards moving between places). Animations look the same as they would with Svelte.
- **Build:** `npm run build` runs `build.mjs`: esbuild bundles `src/main.ts` (with the rules engine and session layer), inlines `src/ui/styles.css` into `src/index.html`, and writes one self-contained page, `dist/index.html`. Markdown files in `src/content/` are bundled as text.

Other choices:
- **Offline:** Service worker (via Workbox or a hand-written one) to cache the app shell.
- **Tests:** Node's built-in test runner (`node:test` and `node:assert`), run on TypeScript with `tsx`. Command: `npm test`. Chosen over Vitest because the rules engine needs no browser and this adds no extra test library. The UI is checked by automated playthroughs in a headless phone-sized browser before each test build.
- **Type check:** `npm run check` checks the rules engine, the session layer and the tests (`tsconfig.rules.json`), then all of `src/` including the UI (`tsconfig.json`), in strict mode. (In this cloud workspace `@types/node` can't be installed, so the check is run on `src/` alone, and on the tests with a small stand-in for the Node test types.)
- **esbuild here:** esbuild is not installed through npm in this workspace (no network for packages); `node_modules/esbuild` is linked to a copy already on the machine (`ln -s /opt/npm-tools/node_modules/esbuild node_modules/esbuild`). On a normal machine, `npm install` provides it. esbuild is the only build tool (app and testbed).
- **Randomness:** The rules engine never calls `Math.random`. It takes an `Rng` function, so tests use a fixed seed (`seededRng`) and real games use the phone's crypto random source (`defaultRng`).
- **QR codes:** A small QR generator library for display, and a camera-based scanner for joining (DECIDE which library).

## 4. Multiplayer transport (DECIDE)

Joining must work with no internet. Three options:

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Host over LAN (recommended)** | One device runs a tiny local server. Others scan the QR code, which holds the host's local address, and join in their browser. | Simple, reliable, clear host | Needs a host that can run a server (laptop, Raspberry Pi, or a native wrapper), not a plain phone browser |
| B. WebRTC with QR handshake | Phones connect directly. Each join exchanges connection info through a QR code scanned between devices. | No server needed, works on phones alone | Harder to build, fragile with many players, manual handshake steps |
| C. Pass-and-play only at first | No networking yet | Lowest risk, lets rules be finished first | No online-ish play until a later phase |

**Recommended path:** Build **C** first (Phase 2 in `TODO.md`) to finish the rules. Then add **B** (WebRTC with a phone as host, star layout) so phones can play with no extra hardware. Keep **A** as a fallback if B is too fragile with 8 players.

## 5. Hidden information (DECIDE trust model)

Pubby relies on hidden hands and hidden decks. In multiplayer, the host device runs the game. To deal, check moves, and enforce rules, it must hold every player's hand and the hidden decks in memory. The host's screen never displays other players' hands, but the data is in the host's phone's memory, so the host's phone can technically see every card. A player who uses the host's phone, or inspects the app running on it, can see all hands. Other phones only ever receive their own hand and public information.

Options:
1. **Trust the host.** Simple. Fine for friends playing together. The host device is the only one that knows all cards.
2. **Commit-reveal shuffling.** Each player contributes randomness to the shuffle so no single device controls the deal. Adds complexity; a reasonable later step.
3. **Full cryptographic dealing (mental poker).** Strongest, but a lot of work for a casual game. Not recommended for v1.

Recommended: **1** for v1, with **2** planned. Each client should only ever receive its own hand and public state, so a player who inspects their own network traffic still cannot see others' hands.

## 5a. What each screen may show

- **Hidden decks:** Never sent to any player view, never rendered, no count or animation, including on the host's phone. The rules engine keeps them in `DealState.hiddenDecks`, separate from the seats. The only UI is the "Swap cards" option in round 1 of 2 and 3 player games.
- **Quick rules:** Pure UI state on one phone (`src/ui/`). Opening it sends no action to the session, so it cannot pause or affect other players. Content is loaded from `src/content/quick-rules.md`.
- **Pop-ups queue:** Several pop-ups can come from one move (a slap, then a player going out, then the round end). They are shown one after another, never dropped. Going-out pop-ups come from `playerOut` events; the last two are combined into one pop-up from `roundEnded`.
- **Vote result pop-up:** Driven by a `voteResolved` event carrying the vote kind, the result, the value (target votes), and `decidedBy` (`majority` or `host`). Every phone shows "Majority says… YES/NO" or "Host says… YES/NO".
- **Player views:** `playerView(session, playerId)` (`src/session/view.ts`) is the only thing a phone receives. It has the player's own hand, card counts for everyone else, the current trick, a waste-pile count, scores, votes (who has voted, and only your own ballot), and pause requests (all of them for the host, only your own for others). It never contains the hidden decks in any form. A test walks whole rounds at 2, 3, 5 and 8 players and checks every view at every step.

## 6. Data model (draft)

- `Player`: `id`, `profileName`, `sessionName`, `hand`, `status` (`active` / `out`), `missingSuits`.
- `Game`: `players`, `turnOrder`, `leader`, `currentTrick`, `wastePile`, `hiddenDecks`, `jokersInPlay`, `round`, `scores`, `target`, `ultimateRound`, `pendingRequests`, `phase` (`setup` / `reshuffleVote` / `swap` / `missingSuit` / `playing` / `roundEnd` / `paused` / `gameOver`), `paused`, `gameStarted` (locks the reshuffle vote once true).
- `Action` (examples): `chooseLeader` (round winner), `setDealMode` (auto / manual, switchable any time), `autoDealStart`, `manualDealCard`, `switchToManual` (during auto-deal animation), `readyUp` (results screen), `advanceFromResults` (host only), `voteReshuffle`, `playCard`, `slap` (off-suit play), `playJoker`, `declareMissingSuit`, `reactionTap` (mini-game), `swapHidden` (choose up to 4 cards, possibly zero), `forfeit`, `requestPause`, `respondPause`, `pause` (host only), `resume` (host only), `setPauseTimeLimit` (host only, optional), `voteTarget`, `triggerUltimate` (any player, results screen), `voteUltimate`, `hostDecides` (used when a vote has no majority).
- `Game` also tracks `dealMode`, `dealDirection` (fixed to clockwise), `jokerRuleEnabled` (host setup option), `jokerTotal` (shown at game start), `ultimateTriggered`, `ultimateLabels` (`winner`, `loser`), `pauseTimeLimit` (optional).
- `Event` (examples): `trickResolved`, `slapped`, `playerOut`, `roundEnded`, `scoreUpdated`, `requestPending`, `gamePaused`, `gameResumed`, `voteResolved` (kind, result, `decidedBy`: `majority` or `host`).

The real types now live in `src/session/types.ts` (`Session`, `SessionAction`, `SessionEvent`, `LogEntry`), section 9b. The old drafts in `src/rules/types.ts` were removed; it now only holds `PlayerId`.

## 6a. Game record and trivia (draft)

- **Game record:** Built from events during play, and saved when the session ends. Each phone saves its own copy in local device storage, so it works offline. The host can export a copy.
- **Events needed for trivia:** Every slap event records the slapper's ID, the slapped player's ID, and the number of cards picked up. Every Reaction Tap records each player's reaction time. Every round records each player's finishing position (used for "always fighting for survival"). Forfeits and reshuffle votes are logged the same way.
- **Trivia calculations:** Computed from the event log, not stored separately, so they can't drift from the record. Per-pair slap counts (slapper to slapped) drive "slapped by most", "slapped most", and rivals, both per session and overall.
- **Names:** Each record stores both the profile name and the session name for every player at the time of play.
- **Profile history (proposed):** At session end, each game is also written into the local profile of each player on that phone. Profile totals (games, points, wins, Ultimate titles, bottom-two count, slaps given and received) are stored with the profile, not recomputed from scratch, and are updated once per game so a crash mid-session cannot double-count.
- **No host export.** The host does not get a separate copy.
- **Stats export:** CSV, built from the stored game record and profile totals, then passed to the phone's share sheet (Web Share API, with a download fallback). No network needed.

## 6b. Accounts (options, not in v1)

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Local profiles (v1)** | Profiles and history live on each phone. | Works fully offline, no servers, no personal data held | History doesn't follow a person to another phone |
| B. Hosted sign-in and sync | A hosted service (for example Supabase or Firebase) handles sign-in and stores profile history in the cloud. The app syncs when online. | Hosted services take care of login, password resets, and storage. The app just calls them. | Needs internet to sign in and sync, a free-tier or paid plan, and a privacy policy because emails and history are personal data |
| C. Passkeys or device-linked codes | Sign in with the phone's own biometrics. Or link a second phone with a short code from the first. | No passwords to store or lose | More complex to build and explain. Still needs a backend to sync. |

Recommended: **A** for v1. Revisit **B** after the core game is working. Setup for B is a few hours with a hosted service. The bigger cost is the ongoing account and privacy work.

## 7. Repo layout (proposed)

```
pubby/
  CLAUDE.md
  PROJECT.md
  CODE.md
  TODO.md
  DEVLOG.md
  src/
    rules/        # pure rules engine
    session/      # state, turns, hidden info, join/leave
    ui/           # rendering, popups, emojis
    net/          # LAN/WebRTC transport (later phase)
    content/      # catch-phrases, emoji set, text (easy to edit)
    index.html    # page template (styles and script are inlined by build.mjs)
    main.ts       # starts the app
  build.mjs       # builds dist/index.html
  testbed/        # rules test page (Phase 1)
  tests/
    rules/
  public/         # icons, manifest, service worker
```

The `content/` folder keeps catch-phrases and emojis in one editable place, since the user plans to add more over time.

## 8. Testing

- **Rules engine:** Unit tests for every rule in `PROJECT.md`. Each open question gets a test once it is decided.
- **Scoring:** A table-driven test for each player count, copied from section 11 of `PROJECT.md`.
- **Hidden information:** Tests that a client's view never contains another player's hand or hidden deck.
- **Jokers:** Tests the count per player count (2 for 2–5, 3 for 6–8), that the joker rule can be switched off at setup, and that a joker never enters the waste pile.
- **Pause:** Tests that only the host can pause or resume, and that a paused game accepts no play actions.
- **Round-start order:** Tests that the reshuffle vote is offered before every round, only once per round, and is locked once the round begins; and that the hidden swap is offered every round in 2–3 player games only.
- **Ultimate Round:** Tests that any player can trigger it from a results screen only, that it is decided by majority vote, that it does not change scores, that the Ultimate Winner label outranks the highest score, and that the Ultimate Loser label ranks below every score.
- **Voting:** Tests that a majority passes, and that no majority hands the decision to the host.
- **Dealing:** Tests for auto deal (every card dealt, uneven hands allowed) and manual deal (even deal: locked until everyone has a card this lap, never two in a row), and that the dealer can switch modes mid-deal. Hidden decks get one share each before the deal, and the dealer cannot deal to them.
- **Reaction Tap:** Tests that the slowest reactor leads, that a false start counts as the slowest time, and that tied slowest players replay until one is decided.
- **Forfeit:** Tests that a forfeit scores last place and gives the other player the higher place, straight away or later after a pick-up.
- **Final two:** Tests for every last-card case: lower, higher (pick up or forfeit), slap, both out in one trick, missed round (both play jokers), no jokers while the other player is on their last normal card, last normal card with jokers left (jokers thrown away, also on pick-up), and that it applies from the first trick in a 2-player game.
- **Manual:** Pass-and-play playthroughs at 2, 3, 5, and 8 players before each release.

## 9a. Rules engine modules (built so far)

| File | What it does |
|---|---|
| `src/rules/cards.ts` | Suits, ranks (Ace high = 14), the 52-card deck, joker count by player count, missing suits |
| `src/rules/rng.ts` | Seeded and crypto random sources, Fisher-Yates shuffle |
| `src/rules/deal.ts` | Hidden decks dealt first (face down, one share each), then auto deal (clockwise from the tapped player) and manual deal to players only, switchable at any time. `lastSeat` and `lap` record who got the last card and who has had one this lap; `lockedSeats()` is both. Manual deal refuses locked seats; auto deal skips them. Rounds start in manual mode |
| `src/rules/scoring.ts` | Points table for 2 to 8 players, round scoring, running totals |
| `src/rules/voting.ts` | Majority vote tally; no majority goes to the host |
| `src/rules/round.ts` | Dealer by round, full fresh deck each round (also used for a reshuffle), hidden swap, missing-suit players, Reaction Tap result, who leads |
| `src/rules/play.ts` | Trick play: legal cards, follow suit, slaps, jokers (joker leads; `jokersBlocked` in the final two while the other player is on their last normal card; jokers thrown away when the last normal card is played, so a joker is never a last card), next leader, going out, the final-two rule (`pickUpWastePile`, `forfeit`), round end with finishing order. `sharedSecondLast` is kept in `RoundEnd` for old saved games but is always null now. Returns `PlayEvent`s (`cardPlayed`, `jokerPlayed`, `jokersDiscarded`, `slapped`, `trickResolved`, `playerOut`, `finalTwoChoice`, `wastePilePickedUp`, `forfeited`, `roundEnded`) for the UI and the trivia log |
| `src/rules/types.ts` | Draft `Game`, `Player`, `Trick`, `Vote` and `Action` types |

`play.ts` also has the take-cards request (`PROJECT.md` 4.2): `takeAllowed` (why not, or null), `betweenTricks`, and `takeCards` (moves every card, marks the giver out with the next place, picks the next leader if needed; event `cardsTaken` with a count, never card ids).

`scoring.ts` `scoreRound` takes an optional `sharedSecondLast` pair: both get the points for place (players − 1).

## 9b. Session layer modules (built)

Plain TypeScript in `src/session/`, no Svelte. It ties the rules together into a whole game and runs on the host's phone (or the one phone in pass-and-play).

| File | What it does |
|---|---|
| `src/session/types.ts` | `Session` (the full game state), `SessionAction` (everything a player can send, each with `by`), `SessionEvent`, `LogEntry`, `RoundRecord`, `SessionEnd` |
| `src/session/session.ts` | `createSession(setup, rng)` and `applyAction(session, action, rng)`: checks who may act and when, runs the round flow (deal, reshuffle window and vote, swap, missing suits, Reaction Tap, winner picks leader, play), votes (reshuffle, target, Ultimate; majority, host on no majority, host can close early), pause (host pause and resume, requests, optional time limit via a `tick` action), results screen (ready up, host moves on or ends), target reached starts an automatic Ultimate vote, the Ultimate Round (outside the score, titles), and `finalStandings` |
| `src/session/view.ts` | `playerView`: what one phone may see (section 5a) |
| `src/session/trivia.ts` | `computeTrivia(log, players)`: every stat in `PROJECT.md` section 11, computed from the event log |
| `src/session/record.ts` | `buildGameRecord`, `addGameToProfiles` (once per game, keyed by record id), `profileRivals`, `sessionCsv`, `profileCsv` |

- **Flow:** `dealing` → `reshuffle` → `swap` (2 and 3 players) → `reactionTap` or `chooseLeader` (if needed) → `playing` → `results` (or `gameOver` after the Ultimate Round).
- **Events:** every action returns its events, and they are also added to `session.log`, each stamped with its round. Trivia and the game record are built only from the log.
- **Take-cards requests:** actions `requestTake` (only between tricks; one open request per player), `answerTake` (the asked player; agreeing to one requester answers no to everyone else asking the same player), `withdrawTake`. Stored in `session.takeRequests`. Agreed requests are carried out at once (play is between tricks); requests that can no longer happen are cancelled (`takeCancelled`). The leader's first card is blocked while a request is waiting for an answer. `playerView.myTakeRequests` shows a request only to the two players in it.
- **Target vote window:** `targetVoteAllowed(session)`: round 1 before it starts (`dealing` or `reshuffle`), or `results`; never once a target or the Ultimate Round is agreed. Dealing waits while a vote is open. `playerView` exposes it as `canProposeTarget`.
- **Illegal actions throw** an `Error` with a short message the UI shows (the testbed shows "Not allowed").
- **Time:** the session never reads the clock. Pause actions carry `at` (ms), and the UI sends `tick` once a second while paused so the optional time limit can end the pause.
- **Saving:** the session layer returns plain data. Saving the record and profiles to phone storage, and opening the share sheet, are UI jobs (Phase 2). The testbed keeps profiles in the browser's local storage to try profile history across games.

Every function is pure: it returns a new state and never changes the one passed in.

## 9c. UI modules (Phase 2, in progress)

| File | What it does |
|---|---|
| `src/ui/app.ts` | Starts the app and draws every frame (`render`). Home, profiles and game setup (lobby) screens. Quick rules button on every screen. |
| `src/ui/store.ts` | App state, `update()` (save and redraw), `say()` (short message), the `Popup` types. |
| `src/ui/roundstart.ts` | Round-start screens (slice 3). Votes: any player calls a reshuffle vote (pick who's calling), the phone goes to each voter clockwise from the caller, secret YES/NO with their own hand shown, host can count the votes early, "No majority" goes to the host, then the "Majority says… / Host says… YES!/NO!" pop-up naming what was decided. Hidden swap (2 and 3 players): each player in turn picks up to 4 cards or keeps their hand, then sees their new cards marked with a star. Reaction Tap: each missing-suit player in turn taps Start, waits for the red pad to turn green (random 1.5–4 s), taps; time measured from when the green pad is on screen; tapping on red is a false start; ties replay. `roundStartHolder()` says who needs the phone next. |
| `src/ui/game.ts` | The game on one phone. `send()` runs actions through the session layer, turns events into pop-ups and the "last trick" record, and decides who holds the phone next. Screens: dealing (auto with a flying-card animation, manual taps, switch any time, "Deal the rest now"), looking at hands, winner picks the leader, play (seat strip, the felt with the current trick, led suit, waste pile, last trick; hand with legal cards lit; tap a card then Play), final-two choice (pick up or forfeit), forfeit. Results and game over screens are in `between.ts`. |
| `src/ui/between.ts` | Between tricks and rounds (slice 4). Results screen after every round: places, points, totals, trivia (`computeTrivia`: most slapped, most slapper, rivals, the other fun stats, and a per-player "slapped by most / slapped most" table), ready up (tap your name; host sees who), target score panel (stepper and 5/10/15/20, pick who proposes; also shown during the round 1 deal and before the host starts round 1), Ultimate Round vote (pick who calls it), host's Next round / Start the Ultimate Round and End the game. Game over: winners and why, Ultimate Winner/Loser titles, final standings, the Ultimate Round table, trivia. Take-cards (before a trick only): `askToTake()` on the hand-off screen ("Someone wants to take cards", pick who's asking, the phone goes to them), `takeControls()` on a hand screen (ask, one at a time; withdraw), `takePrompts()` for the asked player (Agree/Refuse, or with several askers "Give them to X" / "Refuse everyone"), `passOnButton()` for a player holding the phone out of turn; `takeHolder()` sends the phone to the asked player. Private notes (refused, gave to someone else, cancelled) show only on the requester's hand screen. Pause: ⏸ Pause button in the game bar (host pauses now, or pick a player asking), request banner for the host (Pause / Say no), full-cover pause screen with Resume, countdown and the time-limit choice; `pauseTick()` sends a `tick` each second during a timed pause. |
| `src/ui/cards.ts` | Card faces, sorting a hand (jokers, then ♠ ♥ ♣ ♦, low to high), labels, `ordinal`. |
| `src/ui/dom.ts` | `h(tag, props, ...children)`: builds DOM elements. Props starting with `on` become event listeners. |
| `src/ui/storage.ts` | Phone storage (local storage, every call wrapped): profiles (`pubby.profiles`, `ProfileStats` keyed by profile name, names unique ignoring case) and the game in progress (`pubby.currentGame`: session, stage, who holds the phone, current trick log, last trick, private notes), so a closed page can carry on. Older saved games are upgraded on load. |
| `src/ui/markdown.ts` | Renders the small markdown files in `src/content/` (headings, paragraphs, lists, bold, code) as DOM nodes, never as HTML. Quick rules skip the file's title and developer note. |
| `src/ui/styles.css` | All styles. Phone first, card-table green, 48px tap targets, respects reduced motion. |

- **Pass-and-play stages:** `table` (shared screen: dealing, round start, results), `handoff` ("Pass the phone to X", public information only), `hand` (X's cards). Private steps (each vote, each swap, each Reaction Tap) always pass the phone; a vote on the results screen shows the results table under "Pass the phone to". During play the phone goes to whoever must act: a player asked for their cards (between tricks, oldest request first), then the final-two chooser, otherwise whose turn it is. If that's the player already holding it, their cards stay up.
- **Take-cards on one phone:** only before a trick (nothing is shown during a trick). The leader can ask from their hand; anyone else uses "Someone wants to take cards" on the hand-off screen. After a request the phone goes to the asked player ("Something for X only"); that hand-off screen still has the button, so others can ask the same player before they answer. Only the asked player's hand screen shows the request. When cards move, everyone gets a "Cards taken!" pop-up (who, from whom, how many).
- **Pause on one phone:** pause actions keep whoever holds the phone on the same screen. The pause screen covers everything, hands included. A pause stops a Reaction Tap that is under way (the player starts again) and stops the auto deal.
- **Pop-ups (queue):** SLAP! (big, who slapped who, cards picked up; no emoji or catch-phrase; closes by itself after 4 seconds with a countdown bar that keeps time through redraws). The others wait for a tap: joker played, player out with place, one last-two pop-up at round end (second last and the loser; 2 players: winner and loser), jokers thrown away, waste pile picked up, who leads and why (missing suit, Reaction Tap, host, winner's choice), vote called, no majority, vote result ("Majority says…" / "Host says…" with a stamped YES!/NO! and what was decided), Reaction Tap tie, target reached (the Ultimate vote starts), cards taken, pause declined, pause time up.
- **Reactions drawer:** a 😂 button (bottom left of every game screen) slides open a slim bar beside it (one row, scrolls sideways) with 😂 and every catch-phrase from `src/content/catch-phrases.md`. It stays open until put away (`reactionsOpen` in the store) and sits above pop-ups, so people can react during a SLAP!. Each tap floats up from where it was tapped and fades out. Purely on this phone: no session action.
- **Reactions in multiplayer (Phase 4, keep in mind):** a reaction becomes a network message (sender, emoji or phrase index), not a session action, so it never touches the game state. Each phone shows it floating in from the sender's seat, with their name. Seat positions on the table layout should be known to the reactions layer.
- **Animations:** only new things animate. A hand animates when it's first shown, and only the newest card on the felt drops in. Redraws don't replay pop-up entrances. The deal animation uses the Web Animations API (a card back flies from the deck to the seat).
- **Hidden information:** hand screens only use `playerView(session, holder)`; table and hand-off screens use public parts only. Hidden decks are never rendered (no pile, count or animation). The pass-the-phone screen shows only public information.
- **Text input:** typing in a box does not redraw the screen (so the keyboard stays open); leaving the box does.
- **Setup checks (UI only):** 2 to 8 players; one profile per seat; two players can't show the same name in one game (case ignored). The host is chosen with "Make host" (first player by default).
- **Seat ids:** `p1` to `p8` by seat order when the game starts.

## 8a. Playable test builds (required before every commit)

`CLAUDE.md` rule 5: the user tests every change on their phone before approving a commit.

- **Phase 1 (rules only):** a single self-contained test page, `testbed/index.html`. It bundles the real rules engine (`src/rules/`) with esbuild into one file, so it runs the same code the game will use. It is published as a private link the user opens on their phone.
- **Files:** `testbed/main.ts` (test UI), `testbed/template.html` (styles), `testbed/build.mjs` (bundles them into `testbed/index.html`). Build with `npm run testbed`. Before publishing, it is played through automatically in a headless browser across 2 to 8 players.
- **Testbed features (session layer version):** runs the real session layer, so every rule goes through the same code the app will use. Adds: votes for every player (reshuffle, target, Ultimate) with host close and host decide, pause and resume, pause requests, the optional pause time limit with a countdown, the results screen (ready up, trivia, per-player stats), the target and Ultimate flow, the end of the session with standings, titles, the game record, saved profiles, CSV (copied to the clipboard and shown, because the share sheet and downloads are blocked inside a published page), and a "What a player's phone receives" panel that checks the hidden decks never reach a player.
- **Earlier testbed features:** pick 2 to 8 players and the joker rule; see every hand (it is a test tool, so all hands are visible, but hidden decks show only a count, to check sizes); deal; swap; play cards with illegal moves blocked; slaps, jokers, final-two pick-up or forfeit; a log of every event; round scores. A seed box so the same deal can be replayed when reporting a bug.
- **From Phase 2:** the real app, `dist/index.html` built with `npm run build`, published as a private test link for each change (GitHub Pages once the app is pushed). Before publishing it is played through automatically in a headless phone-sized browser.
- Every test build comes with a short checklist: what to try and what should happen.

## 9. Conventions

- Language: TypeScript, strict mode.
- Commits: short imperative subject line, plus a body when the reason is not obvious.
- No code is merged without the approvals in `CLAUDE.md`.
- Each phase in `TODO.md` ends with a `DEVLOG.md` entry.
