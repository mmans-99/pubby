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
- **Slice 1: network lobby.** Host or join from the home screen, scan to add players, names and profiles from each phone, seat order, host settings, start the game. **Built 2026-11-08 (version 2.1, section 9i).** Start shows every phone the same "All set" list for now; the deal comes in slice 2.
- **Slice 2: play over the network.** Every phone shows its own hand and the table; turns, slaps, final two, pop-ups on every phone. No pass-the-phone screens in network games. **Built 2026-11-08 (version 2.3, section 9j).** Also built because the screens could be reused as they are: each phone answers votes, the hidden swap and Reaction Tap for itself. Still slice 3: calling votes, take-cards, pause, reactions across phones, ready-up and the target and Ultimate buttons; still slice 4: rejoining and saving.
- **Slice 3: everything between tricks and rounds.** (Planned 2026-11-12, section 9l: votes open and live, take-cards public in network games.) Votes on each player's own phone, reshuffle, hidden swap, Reaction Tap on every phone at once, take-cards requests, pause requests, reactions on every phone from the sender's side, results and Ultimate Round.
- **Slice 4: drops and rejoining.** Lost connection, rejoining a seat, the host's phone dropping, screen kept awake, game saved on the host's phone.
- **Slice 5: playtest with 2 to 8 phones.** Release as version 3.0 (a new phase: major bump; 2.0 went to sound and the less-text redesign).

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
    ui/           # rendering, popups, emojis; round table (table.ts), network screens (netplay.ts, netscreens.ts)
    net/          # WebRTC link (peer.ts), short QR codes (signal.ts), QR maker (qr.ts), camera scanner (scan.ts), QR reader (qrread.ts), lobby (lobby.ts), network game copies and messages (netgame.ts)
    content/      # catch-phrases, emoji set, text (easy to edit)
    pwa/          # icon.svg (+ pre-rendered PNGs), manifest.webmanifest, sw.js template
    index.html    # page template (styles and script are inlined by build.mjs)
    main.ts       # starts the app
  build.mjs       # builds dist/ (index.html, sw.js, manifest, icons)
  testbed/        # rules test page (Phase 1), playthrough script (bot.js, playthrough.py), offline_check.py, back_check.py, sound_check.py, lobby_check.py, netgame_check.py (net_check.py removed with the connection test in 2.2)
  tests/
    rules/
    session/
    net/          # short codes, QR maker and reader, lobby, network game copies
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
- **Network (Phase 4):** (`testbed/net_check.py` below was removed with the connection test in 2.2; its link-while-open, Exit Pubby and camera-scan checks moved to `lobby_check.py`.) `tests/net/` unit tests for the short codes (pack, unpack, rebuilt SDP, wrong codes) and the QR maker. `testbed/net_check.py` opens two phone-sized pages, reads each on-screen QR code from a screenshot with OpenCV (like a camera), feeds it to the other page, and checks the link, pings, 😂, wrong codes, Disconnect and Back, plus the join link (opened fresh, and set while Pubby is already open), Exit Pubby, and a real camera scan: a second browser's fake camera plays a video of the host's on-screen code, read by Pubby's reader (37 checks). `tests/net/qrread.test.ts`: Pubby's reader on turned, tilted, noisy and shaded codes, versions 1 to 15, mirrored codes, damaged grids and Reed-Solomon. Also checked against 60 OpenCV-made photos (levels L, M, Q, H; numeric, letters, bytes, emoji; perspective, blur, shading, JPEG): 60 of 60 read (OpenCV itself read 49), about 11 ms each.
- **Network lobby (slice 1):** `tests/net/lobby.test.ts` (seats, names, problems, joining rules, messages, link kinds, session players accepted by `createSession`). `testbed/lobby_check.py` opens four phone-sized pages (a host and three joining phones), reads the QR codes from screenshots and checks the whole lobby (67 checks, section 9i).
- **Network play (slice 2):** `tests/net/netgame.test.ts`: at every step of games at 2, 3, 5 and 8 players, each phone's copy holds only its own cards (hands, deck, waste pile, hidden decks blank) with the same counts and the same player view as the host's; take-cards requests reach only the two players; moves for another player and the clock are refused; messages read back; the log sent in parts adds up to the whole. `testbed/netgame_check.py` plays whole games over WebRTC on 2, 3 and 5 phone-sized pages at once with `bot.js` on every page (each phone acts only for its own player), plus leaving, closing and a one-phone game kept (section 9j).
- **Single player (Phase 4b, slice A built 2026-11-12):** `tests/ai/` unit tests (imports, seen, fairplay, memory, eval, moves, decide, names, react), `testbed/ai_arena.ts` pass bars (run `npx tsx testbed/ai_arena.ts --bars`). `testbed/solo_check.py` comes with slice B (section 9m).
- **Network votes, take-cards, pause and ready-up (slice 3, 2.5):** `testbed/netvotes_check.py` drives three phones by hand (live ballots, reshuffle and target votes, take-cards held back and answered, pause asked, approved and timed on every phone, ready-up and the Ultimate vote on the results screen), with the bot only to reach the results screen (30 checks, section 9l).
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

- **Version:** `package.json` `version` (`MAJOR.MINOR.0`) is the single source. `build.mjs` passes `MAJOR.MINOR` into the bundle as `__PUBBY_VERSION__`; `src/ui/version.ts` exports it as `VERSION` ("dev" if missing). Shown as "Version 1.0" at the bottom of the home screen and "Pubby version 1.0" at the bottom of the quick rules sheet (reachable from every screen, including mid-game). Rules for bumping: `CLAUDE.md` rule 8. History: 1.0 = Phase 3 offline app with version number, no zoom, no pull-to-refresh. 1.1 = back gesture. 1.2 = back gesture fix for the installed app. 1.3 = connection test screen (Phase 4 slice 0). 1.4 = Pubby's own QR reader. 1.5 = Samsung zoom fix. 2.0 = sound and the less-text redesign. 2.1 = network lobby. 2.2 = profiles in a saved game, connection test removed. 2.3 = play over the network (Phase 4 slice 2). 2.4 = round table, reactions on every phone, host line, shuffle fix.
- **No zoom:** viewport tag `maximum-scale=1.0, user-scalable=no`; CSS `touch-action: pan-x pan-y` on `html, body` and, since v1.5, on every element (`*`), because `touch-action` isn't inherited and a scrolling area (quick rules, the hand, lists) starts its own chain; the Reaction Tap pad keeps `none`. `src/ui/nozoom.ts` `blockZoom()` cancels iPhone Safari gesture events, a `touchstart` with two or more fingers (v1.5: always cancellable, unlike a `touchmove` after a scroll has started) and two-finger moves. v1.5 fix for the user's report (2026-11-07 23:06): Samsung Internet sometimes zoomed in some spots after many pinches; iPhone didn't. Samsung Internet's own "Manual zoom" setting overrides any page. Headless Chromium never zoomed before or after (it honours the viewport tag), so the fix is checked on the phone; automated check: computed `touch-action` inside the rules sheet, a two-finger `touchstart` cancelled, a one-finger one not.
- **Back gesture (v1.1, fixed in v1.2, `src/ui/back.ts`):** Pubby keeps two "guard" entries in the browser history (`{ pubby: 1 }`, `{ pubby: 2 }`); a back gesture pops one (`popstate`) and Pubby does its own back step. v1.1 still closed the installed app: Chrome's back gesture skips history entries added without a real tap, and v1.1 added them at start-up and inside `popstate`, and listened to `pointerdown` (not a tap on touch screens). v1.2 only adds guards inside `click` / `touchend` / `keydown`, keeps two so two quick backs stay inside Pubby, and tops them up on the next tap. Opening Pubby and swiping back before touching the screen still closes it (no tap yet, so no guards). The exit question jumps back over the remaining guards (`history.go`, that `popstate` ignored), so the next back gesture leaves; "Stay" tops the guards up. Order: close an open sheet (quick rules, CSV sheet, in-game menu, exit question); in a game do nothing (user choice); close an opened profile or past game; profiles, past games and setup go to the main menu; on the main menu show "Exit Pubby?" (Stay / Exit). Version 1.4: an "Exit Pubby" button on the main menu opens the same question (iPhones have no back gesture). "Exit" (`leavePubby()`) drops the guards, tries `window.close()`, and if Pubby is still showing after 300 ms shows the `bye` screen: how to leave on this phone (`isApplePhone()`, standalone or Safari) and "Open Pubby again" (`comeBack()`, tops the guards up). Coming back from the app switcher (`visibilitychange`) on the `bye` screen goes to the main menu. Check: `python3 testbed/back_check.py` (14 checks, including the history entries themselves).
- **No pull-to-refresh:** CSS `overscroll-behavior: none` on `html, body` (also stops the bounce at the ends of the page). An installed Pubby has no pull-to-refresh anyway.

## 9f. Network modules (Phase 4)

- **`src/net/qr.ts`:** QR code maker written for Pubby (no package, works offline): byte mode, versions 1 to 40, error correction L or M, all eight masks scored with the standard penalty. `qrSvg()` draws black on white with a 4-module quiet zone. Checked by decoding 116 codes (1 to 400 characters, versions 1 to 15) with OpenCV.
- **`src/net/signal.ts`:** (2.2: `joinLink()` and `#join=` removed with the connection test; see 9i for `lobbyLink()`.) Before: `joinLink()` / `codeFromText()`: the host's QR code is `<page address>#join=<code>` (also undoes `%` escapes); `src/ui/app.ts` opens the test screen joining when the page starts with `#join=`, then removes it from the address with `history.replaceState`. v1.4 fix: a `hashchange` listener does the same when the link is opened while Pubby is already open (iPhone Safari reuses the tab and only changes the `#join=` part, so the page didn't start again: the cause of links that only worked on a second try). Short codes, `PUBBY1~o|a~ufrag~pwd~fingerprint(base64url)~addr:port,...`. Keeps up to 4 UDP host candidates (IPv4 first, then hidden `.local` names, then IPv6) and rebuilds a full data-channel SDP from them (`a=setup:actpass` for offers, `active` for answers). About 100 to 140 characters, so QR version 6 or 7.
- **`src/net/peer.ts`:** `Peer` wraps one `RTCPeerConnection` with no ICE servers and one ordered data channel `pubby` made by the host. Waits for ICE gathering to finish (4 s at most) before making a code, since there's no way to send more candidates later. JSON messages. `path()` reads the selected candidate pair from `getStats()`. Version 2.3: a message longer than 16,000 characters is sent in parts (`{"~part": id, i, n, d}`) and put back together on arrival (older Safari allows about 64 KB per message, and a whole game is bigger); an error in a message handler is logged instead of hidden.
- **`src/net/qrread.ts` (v1.4):** QR reader written for Pubby (no package, offline). Black and white two ways (local mean with an integral image; Otsu for the whole picture); finds the three corner squares by 1:1:3:1:1 runs checked across, down and diagonally; picks the best right-angled triple; module size measured along the code's sides; version from the distance (and its neighbours); alignment square by template search; perspective transform from four points (nudged up to 2 modules if the first read fails and the format bits read); format and version bits by nearest valid code; unmask, de-interleave, Reed-Solomon (Berlekamp-Massey, Chien, Forney); numeric, alphanumeric, byte (UTF-8) and ECI. Levels L, M, Q, H, versions 1 to 40, mirrored codes too. Gives up on a frame after 150 ms.
- **`src/net/scan.ts`:** back camera, checked every 150 ms. Uses the browser's `BarcodeDetector` where there is one (Chrome and Samsung Internet on Android; switches to Pubby's reader if it keeps failing), otherwise draws the frame (longest side 720 px) to a canvas and runs `readQr`. `canScan()` = the phone has a camera API, so every phone can host and join. Camera permission also stops Chrome hiding the phone's local address behind a `.local` name which should help phones find each other (not confirmed: headless Chromium kept hidden names).
- **`src/ui/nettest.ts` (removed in 2.2, user's request):** the Connection test screen. Keeps its own element and state so the camera and link survive the app's re-renders; `stopNetTest()` (called when the app leaves the screen, including by the back gesture) stops the camera and closes the link. The host allows the camera before making its code (`warmCamera()`), hoping Chrome then puts the real local address in the code; headless Chromium kept the hidden name either way, so this is checked on phones. Pings every second both ways; a ping with no reply after 3 s counts as lost. Keeps the screen awake while connected (Wake Lock, where allowed). `window.pubbyNetTest` lets `net_check.py` feed scanned codes.

## 9g. Sound (Phase 5, built in v2.0, waiting for the user's phone test)

- **No audio files:** every sound is synthesised with the Web Audio API, ported from the sample page (https://claude.ai/artifact/Q54YRtsC8xME6LN7uAHzvZ). Small, offline, no licences.
- **`src/audio/engine.ts`:** one AudioContext, made on the first tap anywhere (capture listeners for pointerdown, touchend and keydown, so the first button already sounds). Music bus and effects bus, each with its own level (slider curve as on the sample page: music `(v/100)² × 0.7`, effects `(v/100)²`, 0 when switched off; changes glide over ~50 ms), into a gentle compressor. Suspends while the page is hidden and resumes when it comes back. Holds the building blocks and instruments (`feltPiano`, `upright`, `softKick`, `softBrush`, `crackle`, `brass`, `bell`, `snare`, `kick`, `reverb`, `drive`).
- **`src/audio/music.ts`:** the four Fireside Piano tracks note for note (`menu`, `play`, `ultimate`, `results`) with the fireplace crackle; a 40 ms look-ahead scheduler; `setTrack(name | null)` fades the old track out over 0.4 s and starts the new one only when the track changes. Nothing plays when music is off or at 0.
- **Effect queue (2026-11-08, user: "a lot of the sounds overlap"):** each effect has a length; big effects (shuffle, slap, pick-up, joker, got away, sad trombone, fanfares, Coward!, vote result, Reaction Tap ready, knock) play one after another, dropped if they would wait more than 4 s; small ones (tap, deal, card, trick done, reaction, not allowed) are skipped while a big one plays; Reaction Tap GO and the pause clicks always play at once. The music dips to a third under the slap, fanfares, got away, sad trombone, Coward! and vote result (a duck gain between the music bus and the master). The your-turn chime is no longer played (the user's "ding"). In a game, buttons only click if they are in the menu, a sheet or the top bar.
- **`src/audio/sfx.ts`:** every effect (Huge SLAP!, Click down / up, Knock knock, the rest as on the sample page; Reaction Tap "ready… GO" split into `tapReady` at the start and `tapGo` when the pad turns green). `sfx(name, delayMs)` never throws. `playFor(events)` maps session events: `roundStarted`/`reshuffled` shuffle; `slapped` slap then pick-up (a slap wins over the card that caused it); `jokerPlayed` joker; `cardPlayed` play; `trickResolved` with no slap, trick done; `wastePilePickedUp`/`cardsTaken` pick-up; `playerOut` place 1 round-winner fanfare, other places "got away" (not the loser); `roundEnded` sad trombone; `ultimateLabels` with a winner, Ultimate Winner; `drawCoward` Coward!, otherwise `voteResolved` vote result; `takeRequested` knock; `paused`/`resumed` clicks.
- **`src/audio/settings.ts`:** music on/off and volume, effects on/off and volume in local storage (`pubby.sound.v1`). Defaults: music off, effects on, music 40, effects 60 (the sample page was 55 and 80; the user asked for quieter, then music off at start, 08:56). Key `pubby.sound.v2`, so old test settings don't keep music on.
- **`src/ui/sound.ts`:** the 🔊 button (🔇 when both are off) next to "?", on every screen except the goodbye screen, above pop-ups and the pause screen (z-index 39) so it works mid-game; the sound sheet (z-index 45): two switches, two sliders (drag changes the sound without redrawing; letting go of the effects slider plays a sample card sound), "only this phone changes" and the iPhone silent switch note. `trackFor(state)`: goodbye none; outside a game menu; in a game paused none, results / game over results, Ultimate Round ultimate, otherwise play. `syncSound()` runs after every draw (app.ts `render`). Every button gives the tap sound (capture click listener).
- **Hooks:** game.ts `send` (deal sound for deal actions, `cardSound(events)` straight away, `eventSounds(events)` straight away or when the end-of-trick animation is done, not-allowed buzz when an action is refused); tapping a dimmed card buzzes; reactions (😂 and catch-phrases) chirp; app.ts plays the shuffle when a game starts; roundstart.ts plays the Reaction Tap sounds. Back gesture closes the sound sheet.
- **HAHAHA! pop-up:** `popupsFor` turns `finalTwoChoice` into a `haha` pop-up (laugher = the other player still in, loser = the player who must choose), drawn like SLAP! (green and purple, wobbling word) and closed by the same 4 s timer; `eventSounds` plays `laugh` (four formant-filtered sawtooth "ha"s, falling). It shows after the end-of-trick animation.
- **End-of-trick animation (game.ts `TrickAnim`):** when a move ends a trick, `send` keeps the trick's plays. `gameScreen` then shows `trickFinishStage` (seat strip and the finished trick on the felt, the last card dropping in) with an `.anim-block` layer that stops taps. Steps, driven from `afterRender`: hold 700 ms; with a slap, the SLAP! pop-up and slap sound (the pop-up's 4 s timer starts only now), and the step waits until that pop-up has gone; then the cards slide (Web Animations, 480 ms, staggered) to the waste pile or the slapped player's seat chip with the trick-done swish or pick-up sound; then the rest of the move's sounds, the other pop-ups and the next screen (results if the round ended). Pop-ups other than SLAP! are hidden until it is done. Not saved: a reload skips it.
- **Shuffle animation (game.ts `startShuffle`):** 1.7 s on the dealing screen ("Amy shuffles", the deck splits into two halves that riffle back together twice, CSS `riffle-l` / `riffle-r`), with two shuffle sounds. Started by app.ts when a game starts and by `send` on `roundStarted` or `reshuffled`. Auto deal waits for it. No animation with reduced motion.
- **Bar layout:** `.top-bar` and `.game-bar` keep 98 px free on the right for the two round buttons; the game bar wraps to two lines on small phones when the target tag is shown.
- **Phones:** iPhones play nothing while the silent switch is on (Web Audio follows it); the sheet says so. Audio starts from a tap.
- **Multiplayer (Phase 4):** each phone will play its own sounds from the events it receives; nothing extra is sent.
- **Checks:** `python3 testbed/sound_check.py` (43 checks: shuffle animation and sound before the deal, no your-turn ding, end-of-trick animation shown, trick-done or pick-up sound, defaults, first tap starts menu music, switches and sliders, 0 volume stops music, settings kept after reload, 🔇 with both off, the sheet on home, setup, dealing, mid-game and results, the game unchanged by opening it, music per screen, pause and resume clicks, deal / shuffle / card / your-turn / fanfare / sad trombone effects, all 22 effects run without an error).

## 9h. Less text (v2.0, 2026-11-08)

- **`src/ui/icons.ts`:** `icon(name, cls)` returns a span with an inline 24 × 24 line SVG (stroke = text colour). No emoji in the UI except the 😂 reactions button and the catch-phrases. Pop-up `info` items carry an `IconName`.
- **Top bar (game.ts `gameScreen`):** `.icon-btn` menu, `.round-chip` (aria-label "Round N", "Ultimate Round" or "Game over"), pause `icon-btn` (aria-label "Pause"), `takeButton` (between.ts) before a trick.
- **? rules (app.ts):** `rulesTopicFor(state)` picks the card ("Dealing", "Playing a trick", "The last two", "Votes", "Scoring"…); the overlay scrolls to the matching `h3` and flashes it. `State.rulesTopic`. markdown.ts now renders `|` tables and one paragraph per line.
- **Pop-ups:** all close by themselves (`popupMs`: SLAP! / HAHAHA! 4 s, round over 3 s, others 2.4 s) with a timer bar; non-slap ones can be tapped away (`data-skip`). `placeBadge(place | 'last')`.
- **Screens:** dealing chips and Manual / Auto / Deal all segment; `reshuffleStage` tiles; `targetRow` (between.ts, replaces the target panel; `targetPanel` kept as an alias); votes with `voteShort` / `voteIcon`; `handoffBlock(name, onGo, { compact, note })` for every pass-the-phone screen; felt `.led-mark` watermark and tiny last-trick cards; `handBlock(..., { head: false })`; `podium(s, rec)` and `awardsRow(s)` on results and game over.
- **Bot (`testbed/bot.js`):** follows the new labels (skips tappable pop-ups, "I'm X", Keep / Swap N, Deal all, "Deal again? Call…", "Start ·", round from `.round-chip`, Ultimate button).

## 9i. Network lobby (Phase 4 slice 1, version 2.1)

- **Main menu:** "New game · one phone" (pass-and-play, unchanged) and "Play on several phones" (new). (The connection test link went in 2.2.)
- **Version 2.3:** Start now starts the game on every phone (section 9j); "Back to the lobby" is gone. `LOBBY_PROTOCOL` is 2 (game messages).
- **`src/net/lobby.ts` (pure, unit-tested):** the `Lobby` (seats in order, joker rule, pause limit, `started`) kept on the host's phone, and the messages. Seats have a link id (`host`, `c1`, `c2`…), profile name, optional name for this game, host flag and `connected`. `joinProblem()` refuses a phone with a different Pubby version or `LOBBY_PROTOCOL`, a game already started (no late joining) and a full game (8). `lobbyProblems()` = at least 2 players and no two shown names alike (same check as the one-phone setup). `sessionPlayers()` turns the seats into `p1`, `p2`… in seat order with the host's id and the link id of each player, ready for `createSession` in slice 2.
- **Messages (JSON over the data channel):** joining phone → host: `hello` (protocol, version, profile name, game name), `rename`, `leave`, `ping`. Host → joining phone: `lobby` (the whole lobby and which seat is yours, sent after every change), `refused` (why), `removed`, `closed`, `ping`. `readToHost` / `readToJoiner` check every message and ignore anything else.
- **`src/net/signal.ts`:** "Add player" codes are links, `<page address>#lobby=<code>` (`lobbyLink()`; `codeFromText()` takes the code out of one). `app.ts` opens the lobby's join screen for `#lobby=` at start-up or on `hashchange` (a link tapped while Pubby is already open). Version 2.1 kept the connection test's `#join=` codes apart with `linkKind()`; both went in 2.2, and an old `#join=` code is now just refused as not a Pubby code.
- **`src/ui/netlobby.ts`:** the screen, built like the connection test (own element and state, so the camera and links survive the app's redraws; `stopNetLobby()` when the app leaves the screen tells the other phones and closes every link). Steps: Host or Join › "Who's on this phone?" (profile chips or a new name, saved as a profile) › host: the lobby; joining phone: scan the host's code, show its own code, then the lobby the host sends.
  - **Host:** seat list (arrows to reorder, ✕ then "Remove?" to remove; the host's own seat can't be removed), "Add player" (one at a time: code 1 as a lobby link QR, "Scan their code", connecting, or "Couldn't connect" with Try again), "Your name for this game", host options (joker rule, pause limit), and Start (off while there are problems or a phone is still connecting). Each added phone gets a new `Peer`. A phone that connects but sends no name within 10 s is dropped.
  - **Joining phone:** "You're in", the seat list with tags (Host, You), the settings line, "Your name for this game", the duplicate-name warning, and Leave.
  - **Start:** the host checks `createSession` accepts the players, sets `started` (phones still connecting are refused) and every phone shows "All set · N players" with the same seat list and settings. Test-build note: dealing to every phone comes next. The host can go "Back to the lobby" (phones that dropped since the start lose their seat) or close the game.
  - **Keep-alive:** both sides ping every 2 s; a phone not heard from for 20 s is gone (10 s was too quick: a short app switch would cost a seat). In the lobby its seat is removed and everyone sees "X lost connection"; after Start it shows "Lost link". The joining phone shows "Connection lost" with "Join again" (the host adds it again; rejoining a seat is slice 4).
  - **Race fixed in testing:** the joining phone sends `hello` as soon as its side of the link opens, which can arrive before the host's own `open` event; the host now takes the link in on whichever comes first.
  - **Name resent (2.2):** in repeated test runs the joining phone's first message was sometimes lost (2 runs in 8: both sides open, the host never got the name, the phone was dropped after 10 s). The joining phone now sends `hello` again every second until the host answers with `lobby` or `refused`; the host ignores a `hello` from a phone that already has a seat. 20 of 20 runs and 4 full `lobby_check.py` runs pass since.
  - **Back gesture (`back.ts`):** closes Add player; in a lobby with other phones asks "Close the game?" / "Leave the game?" (Stay / Close or Leave); otherwise back to the main menu.
  - **Name box:** one input kept across redraws; redraws wait while it has focus, so the keyboard stays open when someone joins. Lobby messages use their own toast, which doesn't redraw the screen.
  - **Screen kept awake** in the lobby (Wake Lock, where allowed).
  - `window.pubbyLobby` lets `lobby_check.py` feed scanned codes.
- **Checks:** `python3 testbed/lobby_check.py` (67 checks since 2.2; 50 in 2.1: main menu button and version, host seated, Start off with one player, new name saved as a profile, lobby link QR, random and connection-test codes refused, host refuses its own code, joining, every phone sees the same seats, "You" tag, camera off after joining, duplicate names block Start and every phone sees why, renaming on the joining phone, seat order / joker rule / pause limit / host's name reach every phone, joining by link (name first, link removed from the address bar), remove asks first and tells the phone, Leave asks first, joining again with a saved profile, Start shows every phone the same list, no Add player after Start, Back to the lobby, a phone that goes away is dropped within ~20 s, the host's back gesture asks, Close tells every phone, one-phone New game still opens, no page errors; added in 2.2: no connection test on the main menu, old connection-test link refused, lobby link tapped while Pubby is open, a real camera scan read by Pubby's reader from a fake camera, a phone whose browser closes is dropped, camera off after leaving, Exit Pubby, a profile in the saved game can't be deleted but others can, a missing profile turns Carry on off with the reason, New game twice ends it).
- **Profiles in a saved game (2.2, `app.ts`):** the profiles screen refuses to delete a profile used by `state.game` (`inSavedGame`); the main menu turns "Carry on" off and shows a warning note when a player's profile is missing (`missingProfiles`), so a game is never carried on with a profile its history can't be saved to (`history.ts` only adds the game to profiles still on the phone).

## 9j. Network play (Phase 4 slice 2, version 2.3)

- **Model:** the host's phone runs the session exactly as in pass-and-play. Every other phone gets its own copy after each move and never runs the rules. The links, pings and lost phones stay in `netlobby.ts`; Start hands them to the game (`app.ts` keeps them open while a network game is on screen).
- **`src/net/netgame.ts` (pure, unit-tested):** `redactSession(session, me)`: the phone's own hand is real; every other hand (`hands`, `deal.hands`, `play.hands`), the cards still to deal and the waste pile become blank cards with the same counts (`{ kind: 'joker', id: 'hidden-…' }`, `isBlank`), the hidden decks are removed, take-cards requests not involving the phone are left out, and the log is left out. `eventFor` / `logFor` drop take-cards events for anyone but the two players in them. `phoneActions(actions, me)`: at most 8 moves, known move types only, every `by` must be the phone's own player, never `tick` (the host's clock). Messages: host → phone `game` (`me`, `full`, `session`, `log`, `events`) and `nope` (why a move was refused); phone → host `act` (moves) and `sync` (send everything again). `NetInfo` (`role`, `me`) is kept on the app's game as `game.net`.
- **Log in parts:** the first message (and any `sync`) has the whole log; after that each phone gets only the new entries. The host remembers per link how much of its full log it has sent.
- **`src/ui/netplay.ts`:** `hostStart` (the game begins on every phone, full copies sent), `hostBroadcast` (after every move: each phone its copy and the move's events), `hostGotAct` (checks with `phoneActions`, runs through `runActions`, sends `nope` with the reason), `hostSync`; `joinSend` (moves to the host; clears the raised card and any "tap again"), `joinGotGame` (first message opens the game; later ones go to `receive`; a part without a base asks for `sync`), `joinNope` (buzz and the reason), `joinEnded` (link to the host gone: a finished game stays on screen, otherwise the lobby screen says lost / closed / removed), `netChanged` (redraw the lost-connection note). `window.pubbyNet` (info, session, send) for `netgame_check.py`.
- **`game.ts`:** `send` → on a joining phone `joinSend`; otherwise `runActions` (also used for moves from other phones) → `absorb`. `receive` (joining phone) → `absorb`. `absorb` does what `send` did after the rules: last-trick record, notes, who holds the phone (network: always `hand` and this phone's player), saving a finished game (network: to this phone's own player's profile only, `saveFinishedGame(session, me)`), pop-ups, sounds, end-of-trick and shuffle animations, the flying dealt card (now found from the hand counts, so it works for moves from any phone). A move from another phone keeps this phone's raised card and any "tap again". `publicView` uses this phone's player in a network game. Auto deal is driven by the host's phone (it applies `autoDealStep` for the dealer). Dealing: only the dealer's phone has the name taps and Manual / Auto / Deal all; others see "X is dealing". Play: the glowing seat is whoever must act, with "X's turn" or "X: pick up or forfeit" on other phones; no take-cards, notes or pass-on in network games yet. Game bar: no pause or take button in network games yet; the menu has "Close the game" (host, every phone) or "Leave the game" (two taps).
- **`src/ui/netscreens.ts`:** `netGameBody`: round-start steps from `roundstart.ts` `netRoundStart` (votes: YES / NO on your own phone, host decides with no majority; hidden swap on each phone at once, then the new cards; Reaction Tap on each phone at once, measured on that phone; otherwise "Waiting for X, Y" with your hand), dealing, before the round (your hand; host "Start the round", others "Waiting for X to start"; no reshuffle vote yet), winner picks who leads, play, results (podium and awards; host "Next round" / "End the game" with two taps; others wait), game over. A note when a phone lost its link ("Rejoining comes in a later update").
- **Saving:** a network game is never written to `pubby.currentGame`, so a one-phone game saved on the phone stays (and comes back when the network game ends: `store.ts`). Saving and carrying on a network game is slice 4. The finished game is saved on every phone (game record, and the phone's own profile).
- **Ending:** host "Back to home" or "Close the game" closes every link; a joining phone still on game over keeps its screen; one that isn't sees "Game closed". A joining phone that leaves: the others see "X lost connection".
- **Checks:** `tests/net/netgame.test.ts` (6); `testbed/netgame_check.py` (2, 3 and 5 pages: every phone in the game, own seat, only the dealer deals, forged and out-of-turn moves refused with a message, played to the end, no copy ever held another player's card, every phone agrees with the host after each move, every phone played its own cards, hidden swap on each phone, same standings, pop-ups and SLAP! alike on every phone, saved on every phone and to its own profile only, not saved as the one-phone game, game over kept when the host leaves, no page errors; leaving asks first and tells the others; closing tells the others; a one-phone game kept through a network game).

## 9k. Version 2.4: round table, reactions across phones, host line

- **`src/ui/table.ts`:** `roundTable(session, view, opts)` draws the oval table: `opts.bottom` sits at the bottom, the others clockwise (`tableOrder`: `order` rotated to start at `bottom`), seat `k` of `n` at angle 90° + k·360°/n on an ellipse (`seatSpot`, % of the box: 39% across, 41% down; played cards at half that). Seats are `seat-chip table-seat` (`data-seat`, `me` on the bottom one; buttons when `onTap`), with a mini fan of backs and the count, or the place badge. `plays` (this trick) lie in front of the players, newest drop in (`newFrom`); `middle` is the waste pile (`wasteMiddle`) or the deck. Centring uses the CSS `translate` property so the drop-in and end-of-trick animations (which use `transform`) still line up. Height 330 px (370 px for 6–8 players).
- **`game.ts`:** `trickArea` → the table plus the last-trick row; used by play (bottom: the player whose hand is shown), the pass-the-phone play screen (bottom: the next player), the end-of-trick animation (`flyTrick` now looks in `.round-table`), dealing and the shuffle (bottom: the dealer; deck in the middle, seats tappable to deal), picking who leads (bottom: the winner); in network games also before the round and while waiting for the winner to pick who leads (`netscreens.ts`). `bottomSeat(g, holder)`: in a network game always this phone's player. Other screens keep `seatStrip`.
- **Shuffle fix:** `hostStart` / `joinGotGame` call `startShuffle()` before the first `update`, so the first screen already shows the shuffle (before, nothing redrew until it was over).
- **Reactions across phones:** the drawer's buttons call `react(r)`: shown where tapped (as before) and `sendReaction(r)` (`netplay.ts`): a joining phone sends `{ t: 'react', r }` to the host; the host shows it (`showReaction`) and passes `{ t: 'react', from, r }` to every other phone; the host's own go to every phone. `r` = -1 for the laugh, else the catch-phrase number (same list on every phone; unknown numbers are dropped). Shown from the sender's seat (`[data-seat]`, the table's first) with their name (`.float-react`), else near the top. The host drops more than 6 reactions in 3 s from one phone. The drawer and button are hidden on game over. `LOBBY_PROTOCOL` 3.
- **Host line (`netscreens.ts` `hostLine`):** a gold-bordered status line with a turning hourglass on the other phones. Lobby: the host's `broadcast` adds `adding: true` while its Add player screen is open (`Lobby.adding`), shown as "X is adding a player…", otherwise "X is setting up the game". Game: before the round ("…is deciding: when to start the round"), results ("…: next round or end the game" / "…: when to start the Ultimate Round"), no-majority votes ("X (host) is deciding the vote").
- **Checks:** `netgame_check.py` adds: the adding / setting-up line, the shuffle on every phone at the start, the table with the phone's own seat at the bottom, reactions both ways with the sender's name and no echo, the host line before the round and after results, no reactions button on game over. `lobby.test.ts`: `adding`, `react` messages. `bot.js` reads seat counts from the table.

## 9l. Phase 4 slice 3: votes, take-cards, pause and ready-up on every phone (version 2.5, built 2026-11-12)

**Status:** planned 2026-11-12 after the user's v2.4 phone test; the user approved the plan and asked for the build the same day. **Built as version 2.5, not pushed yet.** The user approves the push and tests the GitHub Pages build on phones (`CLAUDE.md` rule 5) before it's committed as done.

**What was built (2026-11-12):**
- `src/net/netgame.ts`: `stampHostTime` (the host replaces `at` on pause and respondPause moves with its own clock); `GameUpdate.hostNow`; take-cards requests and their events go to every phone (`eventFor` returns true, `redactSession` keeps every `takeRequests` entry; hands stay blank).
- `src/net/lobby.ts`: `LOBBY_PROTOCOL` 4.
- `src/ui/netplay.ts`: `hostGotAct` stamps pause times; `sendUpdate` sends `hostNow`; `joinGotGame` sets the clock offset; `hostClock()` for countdowns.
- `src/ui/roundstart.ts`: `ballotChips` (live YES / NO / waiting per player, "asked" on the caller) on every phone during a network vote; `countNowButton` (host; two-player label "stop waiting (counts as no)") in `voteStage`, `waitStage` and the one-phone pass stage.
- `src/ui/netscreens.ts`: before the round, "Deal again?" (or "Used") on every phone, the target row (`targetRow(s, { me })`), host Start; results: target row, `readyRow` (chips, "N of M ready", "I'm ready" for own player), "Ultimate Round vote" ("Ask for the Ultimate Round" with two players) on every phone, host Next round / End.
- `src/ui/between.ts`: `targetRow` with `me` (Propose sends straight away, no name chips); `netPauseButton` (host pauses directly, others ask, "Asked" while waiting), `askPausePanel`; `pauseRequestsBanner` shows a host line on other phones; `pauseLayer` uses `hostClock()` and shows Resume / limits to the host only; `pauseTick` only ticks on the host's phone (others redraw); `takeStatus` ("X asked Y for their cards…" on phones not involved).
- `src/ui/game.ts`: network game bar shows the net pause button and the take button; `takeControls`, `takePrompts`, `notesPanel` on in network games; the leader's Play is off with "Waiting for Y to answer X" while a request waits; `absorb` drops a Reaction Tap and closes open panels on any `paused` event.
- `src/ui/back.ts`: the take-cards and "ask the host to pause" panels close first.
- Content: `src/content/quick-rules.md` (votes, take-cards, a "Several phones" section). Version 2.5.0 in `package.json`.

**Checks run (2026-11-12):** `npm run check` clean; unit tests 148 of 148 (`tests/net/netgame.test.ts` now covers public take-cards, `stampHostTime`, `hostNow`); `testbed/netgame_check.py` 94 of 94; new `testbed/netvotes_check.py` 30 of 30 (3 phones: live target and reshuffle ballots, a reshuffle turned down, take-cards asked and agreed with the leader held back, pause asked and approved, host-only Resume, a one-minute timed pause with the same countdown on every phone that resumes by itself, ready-up, Ultimate vote turned down); `testbed/lobby_check.py` 67 of 67.

**Deviations from the plan:** the ready chips are display-only (each phone readies its own player with "I'm ready"); "Count now" also appears on the host's vote screen when the host hasn't voted yet (it's needed when the others have); the take-cards "Cards taken!" pop-up replaces the "agreed" note when the cards move at once.

**Proposed version:** 2.5 (minor bump, same as slices 1 and 2: 2.1 and 2.3). The user has the final say (`CLAUDE.md` rule 8).

### Goal

After this slice, a network game can do everything a one-phone game does between tricks and rounds, each player on their own phone. Only slice 4 (rejoining after a drop, saving to carry on later, screen kept awake in the game) is left.

### What's already there (don't rebuild)

- **The session layer handles every rule.** `callVote`, `castVote`, `closeVote`, `hostDecides`, `requestTake`, `answerTake`, `withdrawTake`, `requestPause`, `respondPause`, `pause`, `resume`, `setPauseTimeLimit`, `readyUp` all exist (`src/session/types.ts`) and are tested. **No rule changes in this slice.** If a rule seems missing, add it to `PROJECT.md` Open questions and ask the user (`CLAUDE.md` rule 6).
- **Joining phones may already send them.** `PHONE_ACTIONS` in `src/net/netgame.ts` already lists every move above (`tick` stays host-only). `phoneActions` checks `by === me`.
- **Answering votes on each phone** works (2.3): `roundstart.ts` `netRoundStart` → `voteStage` / `hostDecidesStage` / `waitStage`. The vote result pop-ups already show on every phone from the events.
- **One-phone UI to reuse** (`src/ui/between.ts`, `src/ui/roundstart.ts`): `targetRow`, `ultimateCall`, `resultsStage` ready row, `takeControls`, `takePrompts`, `notesPanel`, `pauseButton`, `pausePanel`, `pauseRequestsBanner`, `pauseLayer`, `pauseTick`, `reshuffleStage`. Most of them pick "who is doing this" from name chips because one phone is shared. In a network game the answer is always **this phone's player** (`g.net.me`), so add a `me` option (or a small network version next to each) instead of the name chips. Keep the one-phone screens exactly as they are.
- **Places that switch these off in network games today** (turn them on): `game.ts` around line 483 (`g.net ? null : pauseButton(s)`, `g.net ? null : takeButton(g)`), line 850 (`notesPanel`), 851 (`takePrompts`), 876 (`takeControls`), 877 (pass-on button: stays off, there's no phone to pass); `netscreens.ts` `beforeRound` (no reshuffle call or target row) and `results` (no target row, Ultimate call or ready-up).

### Decisions this slice follows

From `PROJECT.md` (sections 1.1, 2a, 4.2, 8, 9, 12) plus two answers from the user (2026-11-12):

1. **Votes are open and live (user 2026-11-12).** During a vote every phone shows each player's ballot as soon as it's cast: a name chip per player, green YES, red NO, grey for waiting. This is network games only. One-phone votes stay secret.
2. **Take-cards requests are public in network games (user 2026-11-12: "show who asked whom").** Every phone sees "Amy asked Ben for his cards" while the request waits, and sees the answer (agreed, refused, withdrawn). The cards themselves stay hidden: nobody but the taker sees which cards moved. In one-phone games the request stays private as now.
3. Any player calls a vote from their own phone: a reshuffle (before the round), a target score (before round 1 and on results), or an Ultimate Round (on results). The session layer already refuses calls in the wrong place or time.
4. Two-player games ask and agree (`PROJECT.md` 1.1): the asker counts as a yes, the other phone sees "Amy asked · you decide". The host's "Count now" counts as a no there. All of this already happens in the session layer; just show it.
5. Pause: the host pauses or resumes from their phone; other phones ask the host. A pause freezes every phone. Only the host sees Resume and the time-limit chips.
6. Ready-up: each phone readies only its own player; everyone sees who's ready; the host still decides when to move on.

### Build steps

**Step 1. Host clock for pauses (`src/net/netgame.ts`, `src/ui/netplay.ts`, `src/ui/between.ts`)**
- `pause.at` and `respondPause.at` come from the phone's clock, and the timed-pause countdown compares `pausedAt` with `Date.now()`, so phones whose clocks differ by a few seconds would disagree. Fix:
  - In `hostGotAct`, before `runActions`, replace `at` on `pause` and `respondPause` moves with the host's `Date.now()`. Put this in a pure helper in `netgame.ts` (`stampHostTime(actions, now)`) so it can be unit-tested.
  - Add `hostNow: number` to the `game` message (`GameUpdate`; `readGameUpdate` accepts it). On every update the joining phone keeps `clockOffset = hostNow - Date.now()`.
  - `pauseLayer` works out the countdown with `Date.now() + clockOffset` (export a `hostClock()` from `netplay.ts`; it returns `Date.now()` on the host and in one-phone games).
  - Only the host runs `pauseTick` (it sends `tick`, which joining phones may not send). On a joining phone `pauseTick` just redraws the countdown once a second.
- Bump `LOBBY_PROTOCOL` to 4 (the `game` message changed).

**Step 2. Open live votes (`src/ui/roundstart.ts`)**
- New `ballotChips(s)`: one chip per player in seat order with their name and a YES / NO / waiting mark (icons, not emoji: `PROJECT.md` 12a). The caller's chip is marked "asked". Label for screen readers: "Amy yes, Ben no, Cat waiting".
- In a network game, show `ballotChips` in `voteStage` (above the YES / NO buttons), `waitStage` (instead of "Waiting for X, Y") and `hostDecidesStage`.
- Host's "Count now" in a network game: on the host's `waitStage`, a button that sends `closeVote` (same as the one-phone pass screen, `roundstart.ts` around line 155). With 2 players its label is "Stop waiting (counts as no)".
- Results-screen votes (target, Ultimate) use the same screens: `netRoundStart` already returns a vote screen whenever `s.vote` is set, whatever the phase. Check that the podium (`resultsSummary`) still shows under it on results.

**Step 3. Calling votes from your own phone (`src/ui/netscreens.ts`, `src/ui/between.ts`)**
- **Reshuffle:** in `beforeRound`, a "Deal again?" button for every phone that sends `callVote { by: me, kind: 'reshuffle' }`. It's off, with the label "Used", when `publicView(s).canCallReshuffle` is false. Use the same tile look as `reshuffleStage`: Look at cards isn't needed (your cards are already showing), so it's just two tiles on the host's phone (Deal again?, Start) and one on the others (Deal again?, with the host line underneath).
- **Target score:** `targetRow(s, { me })`. With `me` set, the Propose button sends `callVote { by: me, kind: 'target', value }` straight away, with no "Who is proposing?" chips. Show it in `beforeRound` (round 1 only, where `targetVoteAllowed` already decides) and in `results`. Every phone can propose.
- **Ultimate Round:** in `results`, an "Ultimate" button on every phone (not after the Ultimate Round is agreed) that sends `callVote { by: me, kind: 'ultimate' }`. Two players: label "Ask for the Ultimate Round".
- The automatic votes (target reached, a drawn top score, "Coward!" second chance) already start in the session layer; check they show on every phone.

**Step 4. Ready-up (`src/ui/netscreens.ts`)**
- In `results`: every phone sees the ready row (name chips lit for ready players, from `s.ready`). A joining phone has one big "I'm ready" button for its own player (it sends `readyUp { by: me }` and turns into "Ready" when it's done). The host's phone shows the row with "N of M ready" next to Next round. The host doesn't need to ready up.

**Step 5. Take-cards requests (`src/net/netgame.ts`, `src/ui/between.ts`, `src/ui/game.ts`)**
- **Make them public in network games (decision 2):** in `redactSession`, stop filtering `takeRequests`; in `eventFor`, stop dropping `takeRequested` / `takeAnswered` / `takeCancelled`. Update `tests/net/netgame.test.ts` to match. Hands stay blank as before, so the taken cards are still only seen by the taker. (The redaction is only used by network games, so one-phone privacy is unchanged.)
- **Asking:** turn on `takeButton` in the network game bar with `onHand` true and the holder being `me` (no "Someone wants to take cards" asker chips). `takeControls(s, me)` lists who you may ask and your own request with Withdraw.
- **Answering:** turn on `takePrompts(s, me)` on the asked player's phone (Agree / Refuse, or "Give them to X" for each asker plus Refuse everyone). Add the knock sound when a request for you arrives (the `takeRequested` event already plays it, so check it plays on the asked phone).
- **Everyone else:** a status line on every other phone while a request waits, for example "Amy asked Ben for his cards…" (new `takeStatus(s, me)` in `between.ts`, shown above the table). It goes away on answer or withdraw. The "Cards taken!" pop-up already shows on every phone.
- **The leader:** while any request waits, the leader's Play button is off with the reason "Waiting for Ben to answer Amy". The session layer already refuses the first card of a trick then, but a clear screen beats a refused move.
- **Notes:** turn on `notesPanel(g, me)` so the asker sees "Ben agreed: you took 6 cards" or "Ben said no". Notes are made in `absorb` (`game.ts` around line 262), which joining phones also run (`receive` → `absorb`), so they should arrive. Check it.

**Step 6. Pause (`src/ui/between.ts`, `src/ui/game.ts`)**
- Game bar in a network game: pause button for every phone (`pauseButton(s)`).
  - **Host:** tap → pauses straight away (`pause { by: host, at }`), with no panel.
  - **Others:** tap → "Ask Cat (host) to pause?" (Ask / Cancel) → `requestPause { by: me }`. While your request waits, the button shows as on and the label says "Asked".
- `pauseRequestsBanner` on the host's phone only (Pause / Say no for each request). Other phones see a host line instead: "Cat (host) is deciding: Amy asked to pause".
- `pauseLayer` on every phone. Only the host gets Resume and the time-limit chips; the others get the host line "Cat (host) is deciding: when to carry on" and the countdown if there's a time limit (step 1).
- **When a pause arrives:** call `resetTap()` on every phone (a Reaction Tap in progress is dropped, as in one-phone games), close any open panel (`armed: null`), and keep the raised card.
- Auto deal already stops while paused (`game.ts` around line 1106 checks `!s.paused`); check it carries on after resume. The end-of-trick animation should finish before the pause screen shows.
- Sounds: the click down / click up effects come from the `paused` / `resumed` events on every phone already.

**Step 7. Tidy-ups**
- Remove the slice 3 notes from `netscreens.ts`'s top comment and the "not yet" lines in `PROJECT.md` 12.
- `phoneActions`: nothing to add. Do keep the 8-move limit; a refuse-everyone answer for 7 askers fits.
- Quick rules (`src/content/quick-rules.md`): in network games, votes are open and you can see who voted what live; take-cards requests show who asked whom; pause: the host pauses, others ask.
- Back gesture (`back.ts`): closes the take-cards panel and the "Ask the host to pause?" panel first.

### Checks to add or update

- **Unit tests** (`tests/net/netgame.test.ts`): `stampHostTime` replaces `at` on `pause` / `respondPause` only; `readGameUpdate` takes `hostNow`; take requests and events now reach every phone, but hands stay blank (the taker's new hand real only on the taker's copy). Every existing test still passes (147 at 2.4).
- **`testbed/netgame_check.py`** (2, 3 and 5 phones), new checks:
  - a joining phone calls a reshuffle; ballots show live on every phone; the result pop-up shows on every phone; "Used" afterwards; the new deal shows on every phone;
  - 2 players: ask → "you decide" on the other phone; host "Stop waiting" counts as no;
  - a joining phone proposes a target before round 1 and on results; it shows on every phone once agreed; no Propose afterwards;
  - a joining phone calls the Ultimate Round; no majority → host line on other phones, the host decides;
  - ready-up from each joining phone shows on the host;
  - take-cards: ask, the status line on the other phones, the leader's Play off with the reason, agree (counts change on every phone, the taker's hand real only on the taker's phone, no other copy ever holds a real card of someone else: the existing check), refuse, withdraw, two askers → the asked phone chooses;
  - pause: host pause covers every phone; joining phone asks → host banner → yes / no; timed pause counts down the same on every phone (fake a 5 s clock difference on one page) and the host's phone resumes at zero; a Reaction Tap in progress is dropped by a pause;
  - forged moves still refused (a phone readying or voting for another player).
- **Still pass:** `lobby_check.py` (expects `LOBBY_PROTOCOL` 4 now), `playthrough.py` (one-phone games unchanged, votes still secret there), `back_check.py`, `offline_check.py`, `sound_check.py`, `npm test`, `npm run check`.

### Test build and phone checklist (for `CLAUDE.md` rule 5)

The test build is GitHub Pages (service workers need it, `CODE.md` 8a), so the pushed build is the test build, as with 2.1 to 2.4. Ask the user to approve that push first, then give them this checklist (3 phones is best; 2 for the ask-and-agree case):

1. After the deal, a non-host phone taps Deal again?: every phone votes, and every phone sees each vote appear live.
2. Before round 1, a non-host phone proposes a target: every phone votes; once it's agreed, the target row shows it and there's no Propose.
3. On results, everyone taps I'm ready: the host sees who's ready.
4. On results, someone calls the Ultimate Round; try a split vote so the host decides (the other phones show "Cat (host) is deciding the vote").
5. Before a trick, ask someone for their cards: every phone shows who asked whom; the leader can't play until it's answered; try agree, refuse and withdraw.
6. Host pauses: every phone shows Paused; only the host can resume. A non-host phone asks to pause: the host gets Pause / Say no.
7. Set a 1-minute pause limit: the countdown matches on every phone and the game resumes by itself.
8. With 2 phones: Deal again? asks the other phone, and the host's Stop waiting counts as no.
9. A one-phone game still works as before (votes still secret).

### Not in this slice

- Rejoining after a lost connection, saving and carrying on a network game, keeping the screen awake during a network game (slice 4).
- Host transfer (decided: none, `PROJECT.md` 12).
- Any rule change.

## 9m. Single player with computer players: build guide (APPROVED PLAN, 2026-11-12; slice A built and pushed as 2.6.0 on 2026-11-12, slices B to G not built)

Game design and the user's answers: `PROJECT.md` 12c. The user approved this plan and wants it built slice by slice (any model, including Haiku). **Build one slice at a time, in order (A to G).** After each slice: run every check listed for it, give the user the test build and checklist (`CLAUDE.md` rule 5), update the five MD files, and wait for "push" before committing (rule 3). New version number per pushed code change, any number, just tell the user (rule 8).

**Working without network:** if `npm install` fails (no network), link the preinstalled tools: `ln -sfn /opt/npm-tools/node_modules node_modules` (it has tsx, esbuild, typescript, @types). Remove the link before committing (`rm node_modules`); never commit it. Browser checks use Python Playwright (`python3 testbed/<name>.py` after `npm run build`).

**Rules that never change in this work:** no game rule changes (`src/rules/`, `src/session/session.ts` logic) except the small additions listed below. If something seems missing, add it to `PROJECT.md` Open questions and ask (`CLAUDE.md` rule 6). One-phone and network games must keep working exactly as before: every existing check must still pass after every slice.

---

### 9m.1 The no-cheating design (read this first; every slice depends on it)

1. **One door in.** A computer player ("bot") only ever receives an `AiSeen` built by `seenBy()` in `src/ai/seen.ts`:
   ```ts
   export interface AiSeen {
     readonly me: PlayerId;
     readonly session: Session;     // redactSession(fullSession, me): only my hand is real
     readonly view: PlayerView;     // playerView(redacted, me)
     readonly events: readonly SessionEvent[]; // new log events since last call (all public)
   }
   export function seenBy(full: Session, me: PlayerId, fromLogIndex: number): AiSeen
   ```
   `redactSession` (`src/net/netgame.ts`) is the same function that makes a joining phone's copy in a network game. It is already tested to hold no card but the player's own (other hands, deck, waste pile and hidden decks are blank cards).
2. **Forbidden imports.** Files in `src/ai/` may import: `src/rules/*` (pure rules and card helpers), `src/session/types.ts`, `src/session/view.ts`, and `src/net/netgame.ts` (only in `seen.ts`). Never `src/session/session.ts`, `src/ui/*`, `src/audio/*`, or other `src/net/*` files. Test `tests/ai/imports.test.ts` reads every `src/ai/*.ts` file and fails on any other import.
3. **The log is public.** Every log event is already sent to every phone in network games. Test `tests/ai/seen.test.ts` must check, over whole games at 2 to 8 players, that the only events carrying a `Card` are `cardPlayed` (face up on the table). If a future event adds private cards, this test fails.
4. **Fair-play test** (`tests/ai/fairplay.test.ts`): run games where every seat is a bot. At each decision (at least 500 positions across 2, 3, 5 and 8 players), make a scrambled copy of the full session: collect every card the bot can't see (all other hands, `deal.remaining`, `hiddenDecks`, `deal.hiddenDecks`, the waste pile), shuffle them with a different seed, put them back keeping every pile's size. Call `decide()` on `seenBy(original)` and `seenBy(scrambled)` with the same bot memory and the same rng seed. **The two moves must be identical.** If a bot ever used a hidden card, this fails.
5. **Hard players only simulate imagined deals** (`sample.ts`), built from the bot's memory, never from the real session.

---

### 9m.2 Small additions outside `src/ai/` (slice A unless said)

- `src/session/types.ts`: `SessionPlayer` and `SessionSetup.players[]` get `readonly computer?: boolean`. `createSession` (`session.ts`) copies it onto `players`. Nothing else in the rules reads it.
- `src/session/record.ts`: `GameRecord` gets `readonly vsComputer: boolean` (true if any player has `computer`), and each record player keeps `computer`. Old records without the field read as `false`.
- Bots' `profileName` is `computer:<name>` (so it can never match a real profile), `sessionName` is the shown name.

---

### 9m.3 `src/ai/` modules (slice A builds all but `search.ts`; slice D adds it)

All pure TypeScript, no DOM, seeded randomness only (`Rng` from `src/rules/rng.ts`). Unit tests in `tests/ai/`.

**As built in slice A (2026-11-12). Differences from the plan above, all small:**
- `react.ts`: `reactionFor` takes a sixth argument, `phrases` (the list from `catch-phrases.md`). The app already reads that list; tests run under tsx, which can't import a `.md` file. Phrases are still looked up by text.
- `memory.ts`: two fields the table did not list. `leader` is the first player to act in the current trick (needed for "still to play" in `eval.ts` `yetToPlay`). `asks` counts this bot's take-cards requests this round (for "at most once per round"). `order` is kept so the memory knows the seats. `jokersDiscarded` adds its count to `jokersPlayed` (the thrown-away jokers are out of the game). `slapped` and `wastePilePickedUp` also remove the cards they move from `played` (they are in a hand now, not played).
- `rebuild(me, level, s, rng)` takes `Pick<Session, 'log' | 'order'>`: it only reads the public log.
- `moves.ts`: `chooseTap(persona, rng, me)` takes `me` too (the tap needs the seat).
- `decide.ts`: order is paused or game over, then an open vote (my ballot), then the rest as listed above. `think`: `forced` for one legal card and for a Reaction Tap (the tap's own time is the move); `hard` for a considered choice (a card with several options, final two, swap, leader, asking for cards); `easy` for the rest. The app's driver (slice B) decides how the delay is shown.
- Hard is the same as Normal until slice D (no search yet).
- Shared loop: `tests/ai/botgame.ts` plays whole all-computer games (it is the driver in miniature and does the host's jobs). The arena and the tests both use it. It is in `tests/` because `src/ai/` may not import `applyAction`.
- Arena: each game is 3 non-Ultimate rounds (the plan did not give a number). The host ends a session only when no Ultimate Round is agreed; once one is agreed, the host advances into it (the engine refuses `endSession` at that point, see DEVLOG; the rules were not changed).

**`persona.ts`**
```ts
export type Level = 'easy' | 'normal' | 'hard';
export type Personality = 'careful' | 'reckless' | 'counter' | 'windup';
export type Speed = 'relaxed' | 'normal' | 'fast';
export interface Persona { readonly level: Level; readonly personality: Personality; }
export const PERSONALITY_WEIGHTS: Record<Personality, { risk: number; jokerSave: number; reactRate: number; reshuffleBar: number }>;
// careful: risk 0.7, jokerSave 1.3, reactRate 0.1; reckless: risk 1.4, jokerSave 0.7, reactRate 0.25;
// counter: risk 1.0, jokerSave 1.0, reactRate 0.15; windup: risk 1.0, jokerSave 1.0, reactRate 0.6
export function randomPersona(level: Level, rng: Rng): Persona;
export function thinkMs(kind: 'forced' | 'easy' | 'hard', speed: Speed, rng: Rng): number;
// forced 400–700, easy 900–1800, hard 1300–2500 ms; × relaxed 1.5, normal 1, fast 0.5
```

**`names.ts`**: a fixed list of at least 60 first names from many cultures, roughly evenly spread, for example: Aisha, Ravi, Mei, Kwame, Sofia, Yusuf, Priya, Hiro, Amara, Mateo, Zainab, Arjun, Leila, Chen, Nia, Omar, Sana, Diego, Fatima, Tariq, Adebayo, Ingrid, Kofi, Noor, Rohan, Yuki, Imran, Lucia, Bilal, Esi, Farah, Jamal, Anika, Tomas, Halima, Kenji, Ayesha, Samir, Thandiwe, Javier, Mariam, Haruto, Chiamaka, Luca, Zara, Dev, Soo-ah, Emeka, Rania, Pablo, Hana, Kamal, Olga, Ines, Musa, Lin, Asha, Malik, Elif, Kai. `pickNames(n, taken: string[], rng)` returns `n` different names, none equal (ignoring case) to `taken`.

**`memory.ts`**: what one bot remembers this round. Updated **only** from events.
```ts
export interface Memory {
  me: PlayerId; level: Level;
  round: number;
  trick: { player: PlayerId; cardId: string; card: StandardCard }[]; // current trick so far (from cardPlayed)
  ledSuit: Suit | null;
  played: Map<string, Card>;          // cards seen played this round (still remembered)
  waste: Set<string>;                 // ids of seen cards that went to the waste pile
  known: Record<PlayerId, Map<string, Card>>; // cards known to be in a player's hand
  voids: Record<PlayerId, Set<Suit>>; // suits a player is known to have none of
  jokersPlayed: number;
  trickCount: number;
}
export function newMemory(me: PlayerId, level: Level, order: readonly PlayerId[]): Memory;
export function remember(m: Memory, events: readonly SessionEvent[], rng: Rng): void;
export function rebuild(me: PlayerId, level: Level, s: Session, rng: Rng): Memory; // replay this round's log (for Carry on)
export function unknownPool(m: Memory, seen: AiSeen): Card[];
// the full deck (52 cards + s.jokerTotal jokers if jokerRuleEnabled) minus my hand, minus played, minus every known card, minus jokers played
```
How each event updates memory:
| Event | Update |
|---|---|
| `roundStarted` | reset everything for the new round |
| `missingSuitDeclared {player, suits}` | add `suits` to `voids[player]` |
| `swapped {player}` | clear `known[player]` (their hand changed unseen) |
| `cardPlayed {player, card}` | push to `trick`; set `ledSuit` if first; add to `played`; remove from `known[player]`; if `card.suit !== ledSuit` it's a slap: add `ledSuit` to `voids[player]` |
| `jokerPlayed` | `jokersPlayed++` (a joker lead: `ledSuit` stays null until the next card) |
| `slapped {slapper, slapped}` | every card in `trick` goes into `known[slapped]`; remove those cards' suits from `voids[slapped]`; clear `trick` |
| `trickResolved` | if `trick` not empty (no slap): add its ids to `waste`; clear `trick`, `ledSuit`; `trickCount++`; then forgetting (below) |
| `wastePilePickedUp {player}` | every remembered `waste` card goes into `known[player]`; clear `waste`; remove those suits from `voids[player]` |
| `cardsTaken {requester, target}` | move `known[target]` into `known[requester]`; `voids[requester]` = suits in both `voids[requester]` and `voids[target]`; clear target |
| `jokersDiscarded` | nothing (count only) |

**Forgetting (Easy only):** after each `trickResolved`, each remembered `played` card is forgotten with chance 0.5 (removed from `played` and `waste`, so it counts as unknown again), each `known` card with chance 0.3, and each void with chance 0.15. Normal and Hard forget nothing.

**`eval.ts`**: plain numbers the decisions use.
```ts
export function rankValue(c: Card): number;             // 2..14, joker 0
export function pVoid(m: Memory, seen: AiSeen, p: PlayerId, suit: Suit): number;
// 1 if suit in voids[p] and no known card of suit; 0 if known[p] has a card of suit;
// else with u = unknown cards of suit, U = all unknown cards, k = p's card count minus known cards:
//   ((U - u) / U) ** k   (chance none of their unknown cards is that suit); 0 if U = 0
export function pSlapAfterMe(m: Memory, seen: AiSeen, suit: Suit): number;
// players still to play in this trick (clockwise after me, still holding cards):
//   1 - product of (1 - pVoid(p, suit))
export function leadRisk(m: Memory, seen: AiSeen, suit: Suit): number; // same, over every other active player
export function handBadness(hand: readonly Card[]): number;
// average over standard cards of (rankValue - 8) / 6, + 0.15 per suit longer than 5, - 0.3 per missing suit, - 0.4 per joker
```

**`moves.ts`**: the rules of thumb (`PROJECT.md` 12c). Each returns a `SessionAction` (or null). `w` = personality weights; `L` = my legal cards (`view.legalCardIds`).
- `chooseCard(seen, m, persona, rng)` (my turn, `view.turn === me`, no `pendingFinalTwo`):
  - **Leading** (trick empty and no joker lead pending): for each suit I hold, `risk = leadRisk(suit) * w.risk`. Pick the suit with the lowest risk (ties: the suit with more unknown cards still out, then my longest suit). If `risk < 0.15`, lead my **highest** card of it, else my **lowest**. If every suit's risk > 0.7 and I hold a joker, lead the joker.
  - **Following** (I hold the led suit): `d = pSlapAfterMe(ledSuit) * w.risk`; `top` = highest led-suit card in the trick. If `d < 0.25` or I'm the last to play: play my highest card of the suit. Else if I have cards under `top`: play my highest card under `top`. Else (all mine beat `top`): if I hold a joker and `d > 0.6 / w.jokerSave`, play the joker; else play my lowest card of the suit.
  - **Slapping** (I don't hold the led suit): never a joker. Pick the standard card with the highest `rankValue + (it is my only card of its suit ? 6 : 0)`.
  - **Joker lead before me** (`ledSuit` null, trick has only a joker): treat as leading.
  - **Final two** (two players hold cards): if I hold 2+ cards, prefer keeping my **lowest** card for last (play the higher legal card when following safely); if the other player has 1 card and I'm leading, lead my lowest card unless a joker lead is safer (only with a joker and when my lowest is higher than the other's likely card: compare to the average of the unknown pool).
  - **Easy:** with chance 0.2 play a random legal card instead.
- `chooseFinalTwo(seen, persona, rng)` (`pendingFinalTwo === me`): `pile = view.wastePileCount`. Pick up if `pile < 12`; forfeit if `pile > 25`; between, pick up with chance `(25 - pile) / 13` (careful ×1.2, reckless ×0.8).
- `chooseSwap(seen, m, persona, rng)` (`phase === 'swap'`, not done): find my shortest suit with 1 to 4 cards; if its highest card is 9 or more, swap all of it (makes a missing suit). Fill the remaining slots (up to 4 in total) with my standard cards of rank Q, K or A, highest first. Never swap jokers. Easy: swap only my 0 to 2 highest cards (random count). Send `{ type: 'swap', by: me, cardIds }` (empty list = keep).
- `chooseVote(seen, persona, rng)` (vote open, I haven't voted): reshuffle: yes if `handBadness(myHand) > 0.35 * w.reshuffleBar` (reshuffleBar: careful 0.9, reckless 1.1, others 1). Target: yes if my score is in the top half. Ultimate: yes if I'm not alone in the lead, or with chance 0.5 if personality is reckless or windup; draw Ultimate (`vote.draw`): yes if I'm one of the drawn players, else 50/50.
- `chooseCallVote(seen, persona, rng)`: in phase `reshuffle` with `canCallReshuffle`, call it if `handBadness > 0.5 * w.reshuffleBar` (each bot decides once per round). Bots never propose a target or call an Ultimate Round vote themselves (keeps the human in charge of game length).
- `chooseTakeAnswer(seen)` (a request asks me): always agree (if several askers, give to the first in seat order).
- `chooseTakeAsk(seen, m, rng)`: only between tricks, at most once per round per bot, only if my card count ≥ 2 × the average of the others still holding cards and at least 3 players hold cards: ask the player with the fewest cards. Otherwise null.
- `chooseLeader(seen, rng)` (`view.chooser === me`): the previous round's loser (`session.previous.loser`) with chance 0.6, else a random other player.
- `chooseDeal(seen, rng)` (I'm the dealer, deal not started): `[{ type: 'setDealMode', by: me, mode: 'auto' }, { type: 'autoDealStart', by: me, firstSeat: <random player> }]`; the app's existing auto deal (host phone, `afterRender`) then deals with the animation.
- `chooseTap(persona, rng)`: `ms` from a normal curve, mean 310, spread 60, kept between 190 and 650; false start with chance 0.03 (Easy 0.06). Returns `{ type: 'reactionTap', by: me, ms, falseStart }`.
- `chooseReady(seen)`: on `results`, if not ready: `readyUp`.

**`decide.ts`**
```ts
export interface Decision { readonly actions: SessionAction[]; readonly think: 'forced' | 'easy' | 'hard'; }
export function decide(seen: AiSeen, m: Memory, persona: Persona, rng: Rng): Decision | null;
```
Order of checks (first that applies wins): game paused or ended → null; I'm the dealer and the deal hasn't started → deal; open vote I haven't voted in → vote (votes are checked before anything else); `swap` phase → swap; `reactionTap` and I'm in it without a result → tap; `chooseLeader` and I'm the chooser → leader; take-cards request to me waiting → answer; `pendingFinalTwo === me` → pick up or forfeit; my turn → card (if a take-cards request is waiting, null: the trick waits); between tricks → maybe ask to take; `reshuffle` phase → maybe call a reshuffle; `results` → ready. `think` is `forced` when there was only one legal choice. **Every returned move must pass the session rules**; the arena counts refusals and must report 0.

**`react.ts`**: `reactionFor(e: SessionEvent, me, humanIds, persona, rng): number | null` (−1 = 😂, otherwise an index into `CATCH_PHRASES` from `src/content/catch-phrases.md`). After `slapped`: if I'm the slapper, chance `reactRate × 1.5`: "You got slapped" (or "You got slapped by a kiiid" 1 time in 4); if a human was slapped and I'm not involved, chance `reactRate`: 😂; if I was slapped, chance `reactRate × 0.5`: "Revenge time!!". Look phrases up by text, so editing the list doesn't break it (skip if the text isn't there). The driver limits each bot to one reaction per 4 seconds and at most 2 bots per event.

**`sample.ts` and `search.ts` (slice D, Hard only)**
- `sampleDeals(m, seen, n, rng): Record<PlayerId, Card[]>[]`: deal `unknownPool` into each other player's unknown slots (card count minus known cards), respecting `voids` (a player can't get a suit they're void in), plus their known cards. Leftover cards are "out of play" (hidden decks, swapped out). Retry up to 20 times per sample; if constraints can't be met, ignore voids for that sample.
- `search(seen, m, persona, rng, budgetMs = 150)`: for each legal card, for each sampled deal (up to 40, stop when the time budget is spent): build a `PlayState` from `seen.session.play` with the sampled hands, play my card with `playCard` (`src/rules/play.ts`), finish the trick and 2 more tricks with every player using `chooseCard` logic on their imagined hand (a quick version that doesn't need memory: lowest-risk play), and score: −1 per card I picked up, +3 if I went out, −0.2 × my hand size at the end. Pick the best average; Hard uses it for card choices only (everything else uses `moves.ts`).
- If moves on a slow phone take longer than the thinking time, move `search` into a Web Worker (esbuild can bundle a worker as a string; keep one file output). Measure first (slice D).

---

### 9m.4 Arena (`testbed/ai_arena.ts`, slice A; run with `npx tsx testbed/ai_arena.ts`)

Plays whole games with only bots, using `createSession` and `applyAction` from the session layer (the arena is allowed the full session; the bots still only get `seenBy`). The arena itself does the host's jobs: `startRound` when no bot calls a reshuffle, `advance` on results (after every bot is ready), `endSession` after a set number of rounds, and the `tick` clock. Options: `--games N --players 2..8 --levels normal,easy,... --seed S`. It prints JSON: games finished, refused moves (must be 0), moves that crashed (must be 0), average place by level and personality, decision time p50 / p95 per level, and per-seat average place. Also a `random` level used only here (random legal move) as the baseline.

**Pass bars** (written into the DEVLOG each time): 0 refused moves; every game finishes; Easy and Normal p95 under 20 ms per decision on a laptop; over 2000 four-player games with 2 Normal and 2 random seats, Normal's average place is better by at least 0.3; Normal beats Easy by at least 0.15. Slice D: Hard beats Normal by at least 0.15 and p95 under 150 ms.

---

### 9m.5 The bot driver in the app (`src/ui/bots.ts`, slice B)

- `SavedGame` (`src/ui/storage.ts`) gets `readonly bots?: BotsInfo`:
  ```ts
  export interface BotInfo { readonly level: Level; readonly personality: Personality; }
  export interface BotsInfo {
    readonly seats: Readonly<Record<PlayerId, BotInfo>>;
    readonly speed: Speed;
    readonly reactions: boolean;
    readonly me?: PlayerId;   // set in single player (one person, own-seat screens); unset in one-phone games with several people
  }
  ```
  Saved with the game (unlike `net`), so Carry on works.
- `botsTick()` is called at the end of `afterRender()` (`game.ts`). It does nothing unless `screen === 'game'`, the game has `bots`, and this phone runs the session (not a joining phone). It also waits (returns) while the game is paused, a pop-up is showing, the end-of-trick animation or shuffle is on (`trickAnimating()`, `shuffling()`), or an auto deal is running.
- Memory: `Map<PlayerId, Memory>` plus the log index each bot has seen. On every tick each bot's memory takes the new log events (`remember`). When a game is loaded (Carry on) or the map is empty, `rebuild` from the log.
- One move at a time: go through bots in seat order starting after the last one that moved; the first `decide` that returns a move is scheduled with `setTimeout(thinkMs(...))`. While waiting, that bot's seat shows "thinking…" (a small dots line on its seat in `table.ts`, via a `thinking: PlayerId | null` value the table reads). When the timer fires: if the session log length changed since deciding, throw the move away and tick again; else send it with `runActions(actions)` (the same path as moves from a network phone). If refused (shouldn't happen), `console.error` it, mark that bot as skipped until the next log change, and tick again.
- Votes: bots vote one by one with their own thinking time (so ballots appear live, one at a time).
- Reactions: after new events, for each bot `reactionFor(...)`; show with `showReaction(bot, r)` (2.4) after a short random delay (300–1200 ms), respecting the limits in `react.ts`, only if `reactions` is on.
- The person's own Reaction Tap and moves work exactly as now.

### 9m.6 Own-seat screens for single player (slice B)

Single player uses the network-game screens (your hand always shown, the round table, live ballots, take status, the host's pause) with no network. Add two helpers in `game.ts` and use them instead of `g.net` where the meaning is "this phone shows one player's own seat":
```ts
export function ownSeat(g: SavedGame): PlayerId | null { return g.net?.me ?? g.bots?.me ?? null; }
export function runsSession(g: SavedGame): boolean { return !g.net || g.net.role === 'host'; }
```
Places to switch (from the 2.5 code; check each with `grep -n "g.net" src/ui/*.ts`):
- `game.ts`: `publicView` (use `ownSeat`), `absorb` holder (`ownSeat`), `saveFinishedGame` call (pass nothing in single player; see stats below), `keep` for other players' moves (`ownSeat(g) !== null`), `gameScreen` (use `netGameBody` when `ownSeat(g)`), the game bar (`netPauseButton` when `ownSeat(g)`), the menu (`netMenu` for network; for single player the normal `gameMenu` "Home (game is kept)" / "End this game"), the hand-holder line 538, dealing "You:" texts and `watching` (a bot dealer: "Ben is dealing"), the wait line, take-cards wait and `takeStatus`, the pass-on button (off when `ownSeat(g)`).
- `netscreens.ts`: replace `g.net!.me` with `ownSeat(g)!` and `g.net!.role === 'host'` with `ownSeat(g) === s.hostId`; `connectionNotice` returns null unless `g.net`; `netMenu` stays network-only.
- `roundstart.ts`: ballots and "no secret vote" when `ownSeat(g)` (single player votes are open); `swapRevealStage` and `tapStage` button texts ("Done") when `ownSeat(g)`.
- `between.ts`: `netPauseButton`, `askPausePanel`, `pausePanel`, `pauseRequestsBanner`, `pauseLayer` use `ownSeat(g)`; `pauseTick` checks `runsSession(cur)` instead of the role.
- `app.ts`: the `stopNetLobby` line is unchanged (only `net`).
- Take-cards: in single player, requests are shown like network games (`PROJECT.md` 12c). Notes and prompts already work for `me`.

### 9m.7 Single-player setup screen (slice B; levels and names in slice C)

- Home screen: new button **"Play against the computer"** under "New game · one phone" (icon: a new line icon `bot` in `icons.ts`, a simple robot head).
- New screen `solo` (`Screen` type in `store.ts`; screen code in `src/ui/solosetup.ts`): your profile (pick or new, like "Who's on this phone?"), number of computer players (1 to 7, stepper), level (All Easy / All Normal / All Hard / Mixed chips; slice B only offers Normal), speed (Relaxed / Normal / Fast), reactions on/off, joker rule, pause limit, and the list of computer players (name, level chip, personality hidden; tap the name to edit, tap the level chip to cycle when Mixed or always). Start.
- Start: players `p1` = you (host, at seat 1), `p2..` = bots with `computer: true`, `profileName: 'computer:<name>'`, `sessionName: <name>`; personas from `randomPersona`; `createSession`; `SavedGame` with `stage: 'hand'`, `holder: 'p1'`, `bots: { seats, speed, reactions, me: 'p1' }`; `startShuffle()`; go to `game`.
- Seats: you sit at the bottom of the round table (already true for `bottom = ownSeat`).
- Names: start from `pickNames`; editing uses the same name rules as session names (`NAME_MAX`, no duplicates, not empty).

### 9m.8 Stats kept separate (slice B)

- New storage key `pubby.profiles.vsComputer` (same `Profiles` shape) with `loadVsProfiles()` / `saveVsProfiles()` in `storage.ts`.
- `saveFinishedGame` (`history.ts`): build the record; if `record.vsComputer`, add the game to the human players' entries in the vs-computer map (never the normal map); computer players are never added anywhere.
- Profile screen (`profileDetails`): a second section "Vs computer" with the same totals, shown only if that profile has any vs-computer games. Profile CSV: an extra block for vs-computer totals.
- Past games: a "vs computer" tag on those records; computer players' names show with the bot icon.

### 9m.9 Slices, checks and phone checklists

**Slice A: AI brain and arena (no app changes except 9m.2).** Files: `src/ai/persona.ts`, `names.ts`, `seen.ts`, `memory.ts`, `eval.ts`, `moves.ts`, `decide.ts`, `react.ts`; `testbed/ai_arena.ts`; tests `tests/ai/imports.test.ts`, `seen.test.ts`, `fairplay.test.ts`, `memory.test.ts` (one test per event row in 9m.3, plus Easy forgetting with a fixed seed, plus `rebuild` equals step-by-step `remember`), `eval.test.ts` (`pVoid` cases: known void, known card, the formula), `moves.test.ts` (hand-made positions: follows low when a known void is after me; dumps high when last to play; slaps with a singleton high card; never slaps with a joker; swap makes a void; always agrees to a take; final two pick-up thresholds), `decide.test.ts` (random positions from arena games: every move legal). Checks: `npm run check`, `npm test`, arena pass bars (9m.4). Test build: nothing to play on the phone yet; tell the user so (rule 5) and show the arena numbers.

**Slice A results (2026-11-12):** `npm run check` and `npm test` pass (148 existing tests and 55 new). The fair-play test checked over 500 decisions (2, 3, 5 and 8 players). Arena with 2000 four-player games for each pass bar: 0 refused moves, 0 crashes, every game finished (4200 of 4200). Normal beats random by 1.424 places; Normal beats Easy by 0.536 places; decision p95 0.04 ms (Easy) and 0.05 ms (Normal), against 20 ms. All bars pass. Hard search (slice D) is not built, so the Hard numbers are not yet measured.

**Slice B: single player on the phone (Normal level only).** 9m.5 to 9m.8. Browser check `testbed/solo_check.py`: start "Play against the computer" with 2, 3, 5 and 8 players; the person's seat is played by `bot.js` (inject it as `netgame_check.py` does); play to game over; checks: bots move on their own, "thinking…" shows, ballots appear live, the swap and Reaction Tap work, take-cards status shows, pausing stops the bots and resuming restarts them, closing the page mid-game and Carry on continues with bots that still play (memory rebuilt), the record is "vs computer", normal profile totals unchanged and vs-computer totals added, no page errors. All existing checks still pass. **Phone checklist:** start a game against 3 Normal bots; watch a full round (do they wait like people? any strange plays?); call a reshuffle and see the bots vote; pause and resume; close Pubby mid-round and Carry on; finish the game and look at the profile's "Vs computer" section; check a normal one-phone game is unchanged.

**Slice C: levels, Mixed, personalities, names, reactions, speed.** Easy (forgetting, random slips), personality weights, Mixed and level chips, the name list and editing, reactions on/off, speed. Arena: Normal beats Easy by the 9m.4 bar. Browser check additions: Mixed levels saved in the game, edited names show at the table, reactions float from bot seats and stop when switched off. **Phone checklist:** play one game on All Easy and one on All Normal: does Easy feel beatable and Normal like a decent player? Are reactions fun, not spammy? Do Relaxed and Fast speeds feel right?

**Slice D: Hard.** `sample.ts`, `search.ts`, tests (`sample.test.ts`: every sample keeps hand sizes, known cards and voids; `search` returns a legal card within budget; fair-play test also run for Hard). Arena: Hard beats Normal, p95 under 150 ms; if a slow phone stutters, use a Web Worker. **Phone checklist:** play against 3 Hard bots; do moves still come within a couple of seconds; does it feel noticeably stronger but still fair?

**Slice E: people and computer players on one phone.** One-phone setup (`app.ts` `setupScreen`) gets "Add computer player" (name, level); bots get `computer: true`. `SavedGame.bots` without `me`. The phone is only passed between people: in `roundstart.ts` `nextVoter`, `nextSwapper`, `nextTapper`, in `between.ts` `takeHolder`, and in `game.ts` `actorOf` / the holder choice in `absorb`, skip bot players (they act through the driver). When the game waits only on bots, show the table with "Ben is thinking…" (new small screen `botsWaitStage` in `game.ts`). Votes stay secret (bots vote unseen; only the result pop-up shows). Take-cards involving a bot follow one-phone privacy (a bot's request to a person reaches that person's hand screen; requests between two bots are not shown). The host must be a person (setup refuses a bot host). Browser check: a 2-people + 2-bots game to the end with `bot.js` playing the people. **Phone checklist:** play with a friend plus 2 bots: the phone only goes between the two of you, bots play in between.

**Slice F: computer players in network games.** In the lobby (`netlobby.ts`, `lobby.ts`) the host gets "Add computer player" (name, level) for an empty seat: a seat with no link (`link: 'bot'`), not counted for pings, not refused for version. At Start, `hostStart` keeps bot seats out of `linkOf`; `SavedGame.bots` (no `me`) on the host's phone; the driver runs on the host's phone only (`runsSession`). Bots follow network rules (open votes, public take-cards). Other phones see bots like any player (bot icon from `computer`). Check: `netgame_check.py` game with 2 phones + 2 bots to the end, plus the fair-play test still green. **Phone checklist:** two phones plus two bots: bots play on both screens; a bot's vote shows live on both.

**Slice G: tuning.** Change weights and thresholds in `moves.ts` / `persona.ts` from the user's phone games; rerun the arena; record numbers in the DEVLOG.


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
