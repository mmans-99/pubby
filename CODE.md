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

## 4. Multiplayer transport (decided 2026-11-07: B only)

**Decision (user, 2026-11-07 20:32): B, WebRTC with a QR handshake, phones only. No local server (A) and no fallback to A.** C (pass-and-play) is already built and stays as a separate mode. The Phase 4 plan is in section 4a.

Joining must work with no internet. The options that were considered:

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Host over LAN (recommended)** | One device runs a tiny local server. Others scan the QR code, which holds the host's local address, and join in their browser. | Simple, reliable, clear host | Needs a host that can run a server (laptop, Raspberry Pi, or a native wrapper), not a plain phone browser |
| B. WebRTC with QR handshake | Phones connect directly. Each join exchanges connection info through a QR code scanned between devices. | No server needed, works on phones alone | Harder to build, fragile with many players, manual handshake steps |
| C. Pass-and-play only at first | No networking yet | Lowest risk, lets rules be finished first | No online-ish play until a later phase |

**Recommended path:** Build **C** first (Phase 2 in `TODO.md`) to finish the rules. Then add **B** (WebRTC with a phone as host, star layout) so phones can play with no extra hardware. Keep **A** as a fallback if B is too fragile with 8 players. (Superseded: the user chose B only.)

## 4a. Phase 4 plan: WebRTC over QR (approved 2026-11-07 20:39)

**Layout: star.** The host's phone runs the session layer (as in pass-and-play) and is also a player. Every other phone connects only to the host over a WebRTC data channel. Phones send actions to the host; after every change the host sends each phone its own `playerView` plus the events (pop-ups, reactions). Nothing else changes in the rules engine or the session layer.

**Network.** All phones on the same Wi-Fi, or on the host's phone hotspot. No internet, no STUN or TURN server: phones connect using their local addresses only.

**Joining (two scans per player).**
1. The host taps "Add player". The host's phone shows QR code 1 (the connection offer).
2. The joining phone scans it and shows QR code 2 (its answer).
3. The host's phone scans QR code 2. The phones connect, and the new player appears in the lobby.
(Any phone scans inside Pubby; QR code 1 is also a link, so a Camera app can open Pubby joining.) Each player needs their own pair of scans (a 3-player game: 4 scans; 8 players: 14). The offer and answer are cut down to the few fields WebRTC needs (about 150 to 250 characters), so the QR codes stay small and scan quickly.

**Risks the first test must answer (slice 0).**
- Some Wi-Fi networks block phone-to-phone traffic (often guest or public networks). A phone hotspot normally allows it.
- Browsers hide local addresses behind `.local` names unless the page has camera permission. Pubby asks for the camera to scan, which should help, but this has to be checked on real phones (Samsung Internet and Chrome).
- QR scanning: Chrome and Samsung Internet on Android have a built-in barcode reader; iPhone Safari does not. Version 1.3 made the host's QR code a **join link** (`<Pubby address>#join=<code>`) so the iPhone Camera app could open Pubby joining; the user found it unreliable (22:18). Version 1.4 (user approved 22:23) adds **Pubby's own QR reader** (`src/net/qrread.ts`), used wherever there is no built-in reader, so iPhones scan inside Pubby and can host. The join link stays as a second way in, and now also works when Pubby is already open (section 9f). QR codes are drawn by a small bundled generator. No internet is needed.
- A phone that locks its screen or switches apps drops the connection. Pubby keeps the screen awake (Wake Lock) during a game and lets a phone rejoin its seat.

**Slices (each gets a test link and a checklist, `CLAUDE.md` rule 5).**
- **Slice 0: connection test (go / no-go).** Built 2026-11-07 (version 1.3, section 9f). **Go:** the user's test passed on a phone hotspot (Android + Android, Android + iPhone, mobile data on and off). Version 1.4 adds in-app scanning on iPhones. A "Connection test" screen: two phones do the two scans, then send pings and show the round-trip time. Test on home Wi-Fi, on a phone hotspot, and with mobile data off. If phones can't connect, stop and talk before building more.
- **Slice 1: network lobby.** Host or join from the home screen, scan to add players, names and profiles from each phone, seat order, host settings, start the game.
- **Slice 2: play over the network.** Every phone shows its own hand and the table; turns, slaps, final two, pop-ups on every phone. No pass-the-phone screens in network games.
- **Slice 3: everything between tricks and rounds.** Votes on each player's own phone (secret by default), reshuffle, hidden swap, Reaction Tap on every phone at once, take-cards requests, pause requests, reactions on every phone from the sender's side, results and Ultimate Round.
- **Slice 4: drops and rejoining.** Lost connection, rejoining a seat, the host's phone dropping, screen kept awake, game saved on the host's phone.
- **Slice 5: playtest with 2 to 8 phones.** Release as version 2.0 (a new phase: major bump).

**Automated tests.** Two or more headless browser pages on one computer, joined over WebRTC by passing the QR text directly, then the bot playthrough on each page. Real QR scanning and real networks are only checked on phones.

**Decisions (user, 2026-11-07 20:36 and 20:38).** Own phones only; dropped phone pauses the game and rejoins its seat; host can remove a player who doesn't return (cards leave play, last place that round, game carries on with fewer players); no late joining; open votes; no host transfer, the game is saved on the host's phone. `PROJECT.md` section 12.

**Reaction Tap fairness.** Each phone measures its own reaction time from when it showed green, so network delay doesn't count against anyone.

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
    net/          # WebRTC link (peer.ts), short QR codes (signal.ts), QR maker (qr.ts), camera scanner (scan.ts)
    content/      # catch-phrases, emoji set, text (easy to edit)
    pwa/          # icon.svg (+ pre-rendered PNGs), manifest.webmanifest, sw.js template
    index.html    # page template (styles and script are inlined by build.mjs)
    main.ts       # starts the app
  build.mjs       # builds dist/ (index.html, sw.js, manifest, icons)
  testbed/        # rules test page (Phase 1), playthrough script (bot.js, playthrough.py), offline_check.py, back_check.py, net_check.py
  tests/
    rules/
    session/
    net/          # short codes and QR maker
  .github/workflows/pages.yml   # builds and deploys dist/ to GitHub Pages on push to main
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
- **Network (Phase 4):** `tests/net/` unit tests for the short codes (pack, unpack, rebuilt SDP, wrong codes) and the QR maker. `testbed/net_check.py` opens two phone-sized pages, reads each on-screen QR code from a screenshot with OpenCV (like a camera), feeds it to the other page, and checks the link, pings, 😂, wrong codes, Disconnect and Back, plus the join link (opened fresh, and set while Pubby is already open), Exit Pubby, and a real camera scan: a second browser's fake camera plays a video of the host's on-screen code, read by Pubby's reader (37 checks). `tests/net/qrread.test.ts`: Pubby's reader on turned, tilted, noisy and shaded codes, versions 1 to 15, mirrored codes, damaged grids and Reed-Solomon. Also checked against 60 OpenCV-made photos (levels L, M, Q, H; numeric, letters, bytes, emoji; perspective, blur, shading, JPEG): 60 of 60 read (OpenCV itself read 49), about 11 ms each.
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
| `src/rules/play.ts` | Trick play: legal cards, follow suit, slaps, jokers (joker leads; no joker block in the final two (dropped 2026-11-07); a last card met only by a joker wins; jokers thrown away when the last normal card is played, so a joker is never a last card), next leader, going out, the final-two rule (`pickUpWastePile`, `forfeit`), round end with finishing order. `sharedSecondLast` is kept in `RoundEnd` for old saved games but is always null now. Returns `PlayEvent`s (`cardPlayed`, `jokerPlayed`, `jokersDiscarded`, `slapped`, `trickResolved`, `playerOut`, `finalTwoChoice`, `wastePilePickedUp`, `forfeited`, `roundEnded`) for the UI and the trivia log |
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
| Rule batch 2026-11-07 (late afternoon) | `rules/voting.ts` `tallyVote`: with 2 players any "no" fails and two "yes" pass (no host). `session.ts`: `callVote` gives the asker a "yes" with 2 players; `closeVote` with 2 players counts as not agreed; `minimumTarget()` (highest score, at least 1) enforced on target votes; `endOrOfferDraw()` replaces a direct `endSession` when the host ends the game or the target Ultimate vote fails: a drawn top score starts an Ultimate vote with `vote.draw` 1 (event `drawAtEnd`), a refusal starts the second chance `draw` 2 (event `drawCoward`), a second refusal ends with reason `drawDeclined`. UI: `jokerLed()` (same-trick wording, all sizes), `jokerGivesWin()` (warning, public card counts only), 2-player "ask"/"Both agree…" wording, draw pop-ups and game over line, target stepper minimum, hidden-deck note on the round 1 banner and in setup. Tests: `tests/session/draw-target-two-players.test.ts`; `tests/session/helpers.ts` `endGame()` turns down draw offers. |
| `src/ui/history.ts` | Saved games and profile history (slice 5). `saveFinishedGame()` runs once when the session ends (called from `send()` on the `sessionEnded` event): builds the game record with a random id, saves it, and adds it to the profiles of the players whose profile is on this phone (a profile deleted mid-game is not brought back). The id goes into the saved game as `recordId`. Game over shows "Saved on this phone" (or a warning if storage failed) and "Share game stats (CSV)". Past games screen (from home): newest first, tap to open standings, share, delete (two taps; profile totals are not changed). Profile details on the profiles screen: totals, slapped by most / slapped most, "Share profile stats (CSV)". `shareCsv()` tries the share sheet with a .csv file; if the phone or browser can't share files (or a published test page blocks it), a sheet shows the CSV text with Copy and Download. |
| `src/ui/cards.ts` | Card faces, sorting a hand (jokers, then ♠ ♥ ♣ ♦, low to high), labels, `ordinal`. |
| `src/ui/dom.ts` | `h(tag, props, ...children)`: builds DOM elements. Props starting with `on` become event listeners. |
| `src/ui/storage.ts` | Phone storage (local storage, every call wrapped): profiles (`pubby.profiles`, `ProfileStats` keyed by profile name, names unique ignoring case) the game in progress (`pubby.currentGame`: session, stage, who holds the phone, current trick log, last trick, private notes, record id once saved), so a closed page can carry on, and finished games (`pubby.gameRecords`: `GameRecord` list, newest first, each id saved once). Older saved games are upgraded on load. |
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

## 9d. Offline app (Phase 3)

- **Build output (`build.mjs`):** `dist/index.html` (the whole game, one file), `dist/manifest.webmanifest`, `dist/sw.js`, `dist/icons/` (`icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`). All paths are relative, so it works from a sub-path like `https://mmans-99.github.io/pubby/`.
- **Icons:** `src/pwa/icon.svg` is the source (felt background edge to edge, two cards with a P and a gold star inside the central safe zone, so the same 512 PNG is also the maskable icon). The PNGs are pre-rendered and committed, so the build needs no image tools. To redraw them: `rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png` (and 512, and 180 for `apple-touch-icon.png`).
- **Manifest:** name Pubby, standalone, portrait, felt green theme and background, start URL and scope `./`.
- **Service worker (`src/pwa/sw.js`, filled in by the build):** the build puts in a version (first 12 characters of a SHA-256 of every app file) and the list of app files. Install saves all of them in a cache called `pubby-<version>` and takes over at once. Fetch: cache first (pages always get the saved app page, ignoring query strings), with a background refresh for other files. Activate deletes old `pubby-` caches. So a new build is downloaded in the background and shows the next time Pubby is opened. Saved games and profiles are in local storage, which the service worker never touches.
- **Registration (`src/ui/offline.ts`):** `registerOffline()` registers `sw.js` after the page loads, only where service workers exist and the page is on https (or localhost). On `file://` pages and inside the private test link (which blocks service workers) it does nothing and the game works as before.
- **No update pop-up:** updates are silent (next open). No UI was added for offline or updates.
- **Hosting:** `.github/workflows/pages.yml` runs on every push to `main` (and by hand): `npm install`, `npm run check`, `npm test`, `npm run build`, then deploys `dist/` to GitHub Pages. One-time repo setting: Settings > Pages > Source: GitHub Actions.
- **Check:** `python3 testbed/offline_check.py` (after `npm run build`) serves `dist/` from a sub-path on localhost, opens it in a phone-sized headless browser and checks: service worker active with the right scope, every app file cached, manifest and icons, the app opens offline (plain, with a query string, with a hash), saved data kept, the new game screen works offline, and a new build replaces the old one on the next open with the old cache deleted.

## 9e. Version number and touch behaviour

- **Version:** `package.json` `version` (`MAJOR.MINOR.0`) is the single source. `build.mjs` passes `MAJOR.MINOR` into the bundle as `__PUBBY_VERSION__`; `src/ui/version.ts` exports it as `VERSION` ("dev" if missing). Shown as "Version 1.0" at the bottom of the home screen and "Pubby version 1.0" at the bottom of the quick rules sheet (reachable from every screen, including mid-game). Rules for bumping: `CLAUDE.md` rule 8. History: 1.0 = Phase 3 offline app with version number, no zoom, no pull-to-refresh. 1.1 = back gesture. 1.2 = back gesture fix for the installed app. 1.3 = connection test screen (Phase 4 slice 0).
- **No zoom:** viewport tag `maximum-scale=1.0, user-scalable=no`; CSS `touch-action: pan-x pan-y` on `html, body` and, since v1.5, on every element (`*`), because `touch-action` isn't inherited and a scrolling area (quick rules, the hand, lists) starts its own chain; the Reaction Tap pad keeps `none`. `src/ui/nozoom.ts` `blockZoom()` cancels iPhone Safari gesture events, a `touchstart` with two or more fingers (v1.5: always cancellable, unlike a `touchmove` after a scroll has started) and two-finger moves. v1.5 fix for the user's report (2026-11-07 23:06): Samsung Internet sometimes zoomed in some spots after many pinches; iPhone didn't. Samsung Internet's own "Manual zoom" setting overrides any page. Headless Chromium never zoomed before or after (it honours the viewport tag), so the fix is checked on the phone; automated check: computed `touch-action` inside the rules sheet, a two-finger `touchstart` cancelled, a one-finger one not.
- **Back gesture (v1.1, fixed in v1.2, `src/ui/back.ts`):** Pubby keeps two "guard" entries in the browser history (`{ pubby: 1 }`, `{ pubby: 2 }`); a back gesture pops one (`popstate`) and Pubby does its own back step. v1.1 still closed the installed app: Chrome's back gesture skips history entries added without a real tap, and v1.1 added them at start-up and inside `popstate`, and listened to `pointerdown` (not a tap on touch screens). v1.2 only adds guards inside `click` / `touchend` / `keydown`, keeps two so two quick backs stay inside Pubby, and tops them up on the next tap. Opening Pubby and swiping back before touching the screen still closes it (no tap yet, so no guards). The exit question jumps back over the remaining guards (`history.go`, that `popstate` ignored), so the next back gesture leaves; "Stay" tops the guards up. Order: close an open sheet (quick rules, CSV sheet, in-game menu, exit question); in a game do nothing (user choice); close an opened profile or past game; profiles, past games and setup go to the main menu; on the main menu show "Exit Pubby?" (Stay / Exit). Version 1.4: an "Exit Pubby" button on the main menu opens the same question (iPhones have no back gesture). "Exit" (`leavePubby()`) drops the guards, tries `window.close()`, and if Pubby is still showing after 300 ms shows the `bye` screen: how to leave on this phone (`isApplePhone()`, standalone or Safari) and "Open Pubby again" (`comeBack()`, tops the guards up). Coming back from the app switcher (`visibilitychange`) on the `bye` screen goes to the main menu. Check: `python3 testbed/back_check.py` (14 checks, including the history entries themselves).
- **No pull-to-refresh:** CSS `overscroll-behavior: none` on `html, body` (also stops the bounce at the ends of the page). An installed Pubby has no pull-to-refresh anyway.

## 9f. Network modules (Phase 4)

- **`src/net/qr.ts`:** QR code maker written for Pubby (no package, works offline): byte mode, versions 1 to 40, error correction L or M, all eight masks scored with the standard penalty. `qrSvg()` draws black on white with a 4-module quiet zone. Checked by decoding 116 codes (1 to 400 characters, versions 1 to 15) with OpenCV.
- **`src/net/signal.ts`:** `joinLink()` / `codeFromText()`: the host's QR code is `<page address>#join=<code>` (also undoes `%` escapes); `src/ui/app.ts` opens the test screen joining when the page starts with `#join=`, then removes it from the address with `history.replaceState`. v1.4 fix: a `hashchange` listener does the same when the link is opened while Pubby is already open (iPhone Safari reuses the tab and only changes the `#join=` part, so the page didn't start again: the cause of links that only worked on a second try). Short codes, `PUBBY1~o|a~ufrag~pwd~fingerprint(base64url)~addr:port,...`. Keeps up to 4 UDP host candidates (IPv4 first, then hidden `.local` names, then IPv6) and rebuilds a full data-channel SDP from them (`a=setup:actpass` for offers, `active` for answers). About 100 to 140 characters, so QR version 6 or 7.
- **`src/net/peer.ts`:** `Peer` wraps one `RTCPeerConnection` with no ICE servers and one ordered data channel `pubby` made by the host. Waits for ICE gathering to finish (4 s at most) before making a code, since there's no way to send more candidates later. JSON messages. `path()` reads the selected candidate pair from `getStats()`.
- **`src/net/qrread.ts` (v1.4):** QR reader written for Pubby (no package, offline). Black and white two ways (local mean with an integral image; Otsu for the whole picture); finds the three corner squares by 1:1:3:1:1 runs checked across, down and diagonally; picks the best right-angled triple; module size measured along the code's sides; version from the distance (and its neighbours); alignment square by template search; perspective transform from four points (nudged up to 2 modules if the first read fails and the format bits read); format and version bits by nearest valid code; unmask, de-interleave, Reed-Solomon (Berlekamp-Massey, Chien, Forney); numeric, alphanumeric, byte (UTF-8) and ECI. Levels L, M, Q, H, versions 1 to 40, mirrored codes too. Gives up on a frame after 150 ms.
- **`src/net/scan.ts`:** back camera, checked every 150 ms. Uses the browser's `BarcodeDetector` where there is one (Chrome and Samsung Internet on Android; switches to Pubby's reader if it keeps failing), otherwise draws the frame (longest side 720 px) to a canvas and runs `readQr`. `canScan()` = the phone has a camera API, so every phone can host and join. Camera permission also stops Chrome hiding the phone's local address behind a `.local` name which should help phones find each other (not confirmed: headless Chromium kept hidden names).
- **`src/ui/nettest.ts`:** the Connection test screen. Keeps its own element and state so the camera and link survive the app's re-renders; `stopNetTest()` (called when the app leaves the screen, including by the back gesture) stops the camera and closes the link. The host allows the camera before making its code (`warmCamera()`), hoping Chrome then puts the real local address in the code; headless Chromium kept the hidden name either way, so this is checked on phones. Pings every second both ways; a ping with no reply after 3 s counts as lost. Keeps the screen awake while connected (Wake Lock, where allowed). `window.pubbyNetTest` lets `net_check.py` feed scanned codes.

## 8a. Playable test builds (required before every commit)

`CLAUDE.md` rule 5: the user tests every change on their phone before approving a commit.

- **Phase 1 (rules only):** a single self-contained test page, `testbed/index.html`. It bundles the real rules engine (`src/rules/`) with esbuild into one file, so it runs the same code the game will use. It is published as a private link the user opens on their phone.
- **Files:** `testbed/main.ts` (test UI), `testbed/template.html` (styles), `testbed/build.mjs` (bundles them into `testbed/index.html`). Build with `npm run testbed`. Before publishing, it is played through automatically in a headless browser across 2 to 8 players.
- **Testbed features (session layer version):** runs the real session layer, so every rule goes through the same code the app will use. Adds: votes for every player (reshuffle, target, Ultimate) with host close and host decide, pause and resume, pause requests, the optional pause time limit with a countdown, the results screen (ready up, trivia, per-player stats), the target and Ultimate flow, the end of the session with standings, titles, the game record, saved profiles, CSV (copied to the clipboard and shown, because the share sheet and downloads are blocked inside a published page), and a "What a player's phone receives" panel that checks the hidden decks never reach a player.
- **Earlier testbed features:** pick 2 to 8 players and the joker rule; see every hand (it is a test tool, so all hands are visible, but hidden decks show only a count, to check sizes); deal; swap; play cards with illegal moves blocked; slaps, jokers, final-two pick-up or forfeit; a log of every event; round scores. A seed box so the same deal can be replayed when reporting a bug.
- **From Phase 2:** the real app, `dist/index.html` built with `npm run build`, published as a private test link for each change (GitHub Pages once the app is pushed). Before publishing it is played through automatically in a headless phone-sized browser.
- **From Phase 3:** the private test link blocks service workers, so installing and offline play can only be tested on GitHub Pages (`https://mmans-99.github.io/pubby/`). Offline work is checked first with `testbed/offline_check.py`; the user then tests it on Pages after the push.
- **Playthrough script (slice 5):** `python3 testbed/playthrough.py` (needs Python Playwright and a built `dist/index.html`). `testbed/bot.js` is injected into the page and plays like a person: it only taps what is on screen (pop-ups, pass-the-phone, votes, swap, Reaction Tap, deal, cards, final-two choice, results). Four full games: 2 players (manual deal, swap, forfeits), 3 players (reshuffle vote, swap, Ultimate Round played), 5 players (manual deal, jokers off, Ultimate Round voted down), 8 players (reshuffle vote, Ultimate Round played). Then it checks Past games, profile totals, the CSV sheets and a page reload. Pass player counts to run only some games (`python3 testbed/playthrough.py 2 8`). The bot also flags an uneven manual deal and a turn with no playable card.
- Every test build comes with a short checklist: what to try and what should happen.

## 9. Conventions

- Language: TypeScript, strict mode.
- Commits: short imperative subject line, plus a body when the reason is not obvious.
- No code is merged without the approvals in `CLAUDE.md`.
- Each phase in `TODO.md` ends with a `DEVLOG.md` entry.
