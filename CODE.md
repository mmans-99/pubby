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

**Online play (planned 2026-11-13, section 9r):** a relay server on Cloudflare's free plan carries the same messages between phones over the internet, for an "Online" mode with named rooms and passcodes. It does not replace B: Nearby (WebRTC with QR codes, no internet) stays as its own mode, and the host's phone still runs the game.

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
- **Single player (Phase 4b, slices A to C built 2026-11-12):** `tests/ai/` unit tests (imports, seen, fairplay, memory, eval, moves, decide, names, react), `testbed/ai_arena.ts` pass bars (run `npx tsx testbed/ai_arena.ts --bars`). `testbed/solo_check.py` comes with slice B (section 9m).
- **Network votes, take-cards, pause and ready-up (slice 3, 2.5):** `testbed/netvotes_check.py` drives three phones by hand (live ballots, reshuffle and target votes, take-cards held back and answered, pause asked, approved and timed on every phone, ready-up and the Ultimate vote on the results screen), with the bot only to reach the results screen (30 checks, section 9l).
- **Which checks to run (9q.1, built 2026-11-13):** `python3 testbed/run_checks.py --since origin/main` runs only the browser checks for the files changed since `origin/main` (`--dry-run` lists them; `--all` runs all nine). Its path-to-script table is in the script's header. Network checks (lobby, netgame, netvotes) run only for `src/net/`, the three network screens (`netlobby.ts`, `netplay.ts`, `netscreens.ts`), and rules or session changes; a style or game-screen change does not run them (2026-11-13). Before asking to push, run it with `--since origin/main`, plus `npm run check`, `npm test`, and the arena bars if `src/ai/` changed.
- **Check speed rules (2.15, section 9o):** Browser checks run on a fake clock (`page.clock`) that moves only when the script advances it; `--real-time` runs the old way. Slice C and D games are one round each. A game with no new log event for 30 seconds fails with a dump of the screen and state. Run only the test files for what changed during each small step; before asking to push, run `npm run check`, `npm test`, the browser checks for the screens touched (all of them if `src/session/` or `src/rules/` changed), and the full `--bars` only if `src/ai/` changed. Never run two heavy jobs (arena, browser checks) at once. `testbed/ai_arena.ts --workers N` splits games across N processes with the same results.
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

- **One-phone menu (version 2.10):** "New game · one phone" is hidden from the home menu (`ONE_PHONE_MENU` in `app.ts`). Its code stays, and the browser checks still play it by opening the page with `?onephone=1`, which shows the button. A saved one-phone game still shows Carry on.
- **Pass-and-play stages:** `table` (shared screen: dealing, round start, results), `handoff` ("Pass the phone to X", public information only), `hand` (X's cards). Private steps (each vote, each swap, each Reaction Tap) always pass the phone; a vote on the results screen shows the results table under "Pass the phone to". During play the phone goes to whoever must act: a player asked for their cards (between tricks, oldest request first), then the final-two chooser, otherwise whose turn it is. If that's the player already holding it, their cards stay up.
- **Take-cards on one phone:** only before a trick (nothing is shown during a trick). The leader can ask from their hand; anyone else uses "Someone wants to take cards" on the hand-off screen. After a request the phone goes to the asked player ("Something for X only"); that hand-off screen still has the button, so others can ask the same player before they answer. Only the asked player's hand screen shows the request. When cards move, everyone gets a "Cards taken!" pop-up (who, from whom, how many).
- **Pause on one phone:** pause actions keep whoever holds the phone on the same screen. The pause screen covers everything, hands included. A pause stops a Reaction Tap that is under way (the player starts again) and stops the auto deal.
- **Pop-ups (queue):** SLAP! (big, who slapped who, cards picked up; no emoji or catch-phrase; closes by itself after 4 seconds with a countdown bar that keeps time through redraws). The others wait for a tap: joker played, player out with place, one last-two pop-up at round end (second last and the loser; 2 players: winner and loser), jokers thrown away, waste pile picked up, who leads and why (missing suit, Reaction Tap, host, winner's choice), vote called, no majority, vote result ("Majority says…" / "Host says…" with a stamped YES!/NO! and what was decided), Reaction Tap tie, target reached (the Ultimate vote starts), cards taken, pause declined, pause time up.
- **Reactions drawer:** a 😂 button (bottom left of every game screen) slides open a slim bar beside it (one row, scrolls sideways) with 😂 and every catch-phrase from `src/content/catch-phrases.md`. It stays open until put away (`reactionsOpen` in the store) and sits above pop-ups, so people can react during a SLAP!. Each tap floats up from where it was tapped and fades out. Purely on this phone: no session action. Version 2.10: the drawer keeps its scroll position when the screen redraws (`render()` in `app.ts`), so a move no longer sends it back to the 😂. Checked by `testbed/drawer_check.py`.
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

- **Version:** `package.json` `version` (`MAJOR.MINOR.0`) is the single source. `build.mjs` passes `MAJOR.MINOR` into the bundle as `__PUBBY_VERSION__`; `src/ui/version.ts` exports it as `VERSION` ("dev" if missing). Shown as "Version 1.0" at the bottom of the home screen and "Pubby version 1.0" at the bottom of the quick rules sheet (reachable from every screen, including mid-game). Rules for bumping: `CLAUDE.md` rule 8. History: 1.0 = Phase 3 offline app with version number, no zoom, no pull-to-refresh. 1.1 = back gesture. 1.2 = back gesture fix for the installed app. 1.3 = connection test screen (Phase 4 slice 0). 1.4 = Pubby's own QR reader. 1.5 = Samsung zoom fix. 2.0 = sound and the less-text redesign. 2.1 = network lobby. 2.2 = profiles in a saved game, connection test removed. 2.3 = play over the network (Phase 4 slice 2). 2.4 = round table, reactions on every phone, host line, shuffle fix. 2.5 = votes, take-cards, pause and ready-up on every phone (slice 3). 2.6 = computer player brain and arena (slice A). 2.7 = play against the computer on the phone (slice B). 2.8 = "Game over." on a slap that ends the game. 2.9 = computer players' levels (All Easy, All Normal, Mixed), names and icon at the table (slice C). 2.10 = reactions drawer keeps its scroll on redraw, one-phone game hidden from the menu (`?onephone=1` for the checks), new catch-phrases, Ultimate button and round chip fixed in the top bar. 2.11 = reactions as a grid sheet above the 😂 button (scrolls up and down, replaces the sideways strip), top-bar items never shrink. 2.13 = Hard level (slice D): imagined-deal search as a second opinion on Normal's card. 2.14 = computer players taunt more and after more events (pick-ups, going out, takes, round losses, forfeits), six new catch-phrases, "X leads" pop-up stays 6 s. 2.15 = missing suits are secret (the leader pop-up says "Missing a suit", never which suit; computer players learn voids from slaps only); browser checks on a fake clock (faster), one-round slice C and D games, a stall detector, arena `--workers`. 2.16 = computer players react more: going out always gets a reaction, rates raised (careful 50%, reckless 75%, counter 60%, wind-up 100%), a computer player's own round loss and a person's round win are new triggers (four new catch-phrases), one reaction per computer player every 2.5 s (was 4 s), up to three per event (was two).
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

- **Main menu:** "New game · one phone" (pass-and-play, unchanged) and "Multiplayer" (new). (The connection test link went in 2.2.)
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

## 9m. Single player with computer players: build guide (APPROVED PLAN, 2026-11-12; slice A built and pushed as 2.6.0; slice B built and pushed as 2.7.0; slice C built as 2.9.0; slice D built as 2.13.0 locally, not pushed; slices E to G not built)

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
| `missingSuitDeclared {player}` | nothing (secret since 2.15: no suit is logged; old saves may still carry `suits`, never read) |
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

### 9m.7 Single-player setup screen (slice B; per-player names and levels added in slice C)

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

**Slice B results (2026-11-12, version 2.7.0, pushed as the test build).** Built to 9m.5 to 9m.8. Deviations, all small: (1) the speed and reactions switches are in slice B, because 9m.7 lists them on the setup screen; (2) the vs-computer totals are a second block in the profile CSV, not a separate file; (3) the thinking line is "thinking…" under the seat name (`table.ts`, `.think-dots`); (4) the driver runs from `afterRender` through `botsTick()` and has no timer loop of its own: each move's redraw asks for the next one; (5) bots wait while any pop-up, the end-of-trick animation, the shuffle or an auto deal is on screen; (6) the person is always host (the setup screen has no host choice in single player), so "Start the round", "Next round" and "End the game" are the person's taps, as in a network game. Helpers: `ownSeat(g)` (network player or single-player seat), `runsSession(g)` (false only for a joining network phone), `isHostSeat(g)`. Checks: `npm run check` clean; `npm test` 203 of 203; `testbed/solo_check.py` 18 of 18 (4 players, Fast speed: the game ends, bots play cards, "thinking…" seen, nothing refused, record saved as vs computer, normal profile untouched, pause stops the bots, Resume restarts them, reload then Carry on keeps them playing). Existing checks: back 14 of 14, offline 20 of 20, sound 44 of 44, netvotes 30 of 30, lobby 67 of 67, netgame 94 of 94, playthrough (see DEVLOG). Not checked on a phone yet: the Normal level's feel (the user's test), and iPhone audio.

**Slice C: levels, Mixed, personalities, names, reactions, speed.** Easy (forgetting, random slips), personality weights, Mixed and level chips, the name list and editing, reactions on/off, speed. Arena: Normal beats Easy by the 9m.4 bar. Browser check additions: Mixed levels saved in the game, edited names show at the table, reactions float from bot seats and stop when switched off. **Phone checklist:** play one game on All Easy and one on All Normal: does Easy feel beatable and Normal like a decent player? Are reactions fun, not spammy? Do Relaxed and Fast speeds feel right?

**Slice C results (2026-11-12, version 2.9.0, pushed as the test build on the user's request).** Built to the plan above, with these choices: (1) the setup screen has All Easy, All Normal and Mixed; **Hard is not offered yet**, so Mixed draws from Easy and Normal only (`MIXED_LEVELS` in `src/ai/persona.ts`; slice D adds Hard to it). (2) Each computer player has its own row on the setup screen: a name field (`SetupBot` in `store.ts`, kept until the screen is left) and a level chip that flips just that player between Easy and Normal. A level chip is lit when every seat shares that level, and Mixed is lit when they differ. (3) `botNamesProblem()` (`src/ai/names.ts`) refuses an empty name, a name over 16 letters, or two players with the same name (ignoring case, the person included). It shows live under the list, and Start stays off until it is fixed. Choosing a profile or adding one re-rolls any computer player who already has that name. "New names" re-rolls all names and keeps the levels. (4) Each computer seat at the table shows a small computer icon before its name (`table.ts`, `.seat-bot`). (5) Reactions and speed were already in the setup from slice B. Their behaviour was checked here. Checks: `npm test` 207 of 207 (4 new tests in `tests/ai/names.test.ts`); `testbed/solo_check.py --slice-c` 14 of 14 (validation; All Easy game with a renamed player, names and icon at the table, reactions seen; Mixed game with reactions off, levels saved, no reaction seen, game finished); `testbed/solo_check.py` slice B 18 of 18 (run again after the setup change, all pass; the slice C part of the same run failed in a test helper, fixed and rerun with `--slice-c`); `back_check.py` 14 of 14; `offline_check.py` 20 of 20; `testbed/ai_arena.ts --bars` all pass (Normal beats Easy by 0.536 against the bar of 0.15). Not checked on a phone yet: whether All Easy feels beatable and Normal like a decent player, and whether reactions and speeds feel right (the phone checklist below). The browser checks confirm the rules, not the feel.

**Slice D: Hard.** `sample.ts`, `search.ts`, tests (`sample.test.ts`: every sample keeps hand sizes, known cards and voids; `search` returns a legal card within budget; fair-play test also run for Hard). Arena: Hard beats Normal, p95 under 150 ms; if a slow phone stutters, use a Web Worker. **Phone checklist:** play against 3 Hard bots; do moves still come within a couple of seconds; does it feel noticeably stronger but still fair?

**Slice D results (2026-11-13, built locally, NOT pushed; bar FAILS).** `sample.ts` and `search.ts` built to the plan above, with two deviations: (1) the search stops after three tricks ahead (the plan's "current trick plus two more") and uses a fixed 40 samples instead of a clock budget, so the fair-play test stays deterministic; (2) the setup level chip cycles Easy -> Normal -> Hard. Checks: `npm test` 210 of 210 (new `sample.test.ts`, `search.test.ts`; fair-play test also runs Hard). Arena, 200 games, 4 players, 2 Hard + 2 Normal: Hard place 2.81, Normal 2.19 (Hard worse; bar is Hard better by 0.15). Hard decision p95 about 7 ms (bar 150 ms, passes). The search picks the top card 25% of the time against Normal's 59%, and plays a joker about 3% of the time. Tried without success: score weights, one-trick horizon, high or low rollout follow, no jokers as candidates, an oracle with the real hidden hands. Next step: fix the search model (rollout policy for other seats, joker and low-card value at the cut-off), then re-measure before the phone test.

**Slice D fix plan (D2), written 2026-11-13 for any model (Haiku included). Approved approach: fix how the search judges a position; don't just tune numbers.**

*Why Hard loses:* the search scores a position by how many cards I hold, and every card counts the same. In Pubby a high card is a liability (it wins tricks and gets slapped), and a missing suit or a kept joker is an asset. Normal's main habit is to dump high cards while it's safe. The search can't see why, so it keeps them (top card 25% of the time against Normal's 59%). The oracle run with the real hands also lost, which confirms the fault is the scoring, not the sampling.

*Ground rules:* change only `src/ai/eval.ts`, `src/ai/search.ts`, `src/ai/moves.ts` (Hard branch only), `tests/ai/*`, `testbed/ai_arena.ts`, `testbed/solo_check.py`. No clock in the search (fixed sample and trick counts), so the fair-play test stays deterministic. Never read the real session in `src/ai/` (`imports.test.ts` guards it). Don't change Easy or Normal: their arena numbers must stay as they are (Normal beats Easy by about 0.54).

*How to measure (every step):* `npx tsx testbed/ai_arena.ts --games 200 --levels hard,normal --seed 1` and again with `--seed 2`. Gap = Normal's average place minus Hard's (positive = Hard better). Write both gaps and Hard's p95 in the DEVLOG. Baseline before D2: gap about -0.62, p95 about 7 ms. Keep a step if the average gap goes up by 0.05 or more; otherwise undo it and note the result.

**Step D2.1: score card quality at the cut-off (the main fix).**
- Add to `eval.ts`:
  ```ts
  /** How dangerous a hand is to be left holding. Higher = worse. */
  export function handDanger(hand: readonly Card[]): number;
  // per standard card: 0.1 + ((rank - 2) / 12) ** 2      (2 -> 0.1, 8 -> 0.35, A -> 1.1)
  // per joker: -0.5                                       (a kept joker is an asset)
  // if the hand holds any standard card: -0.3 per suit it has none of
  // empty hand: 0
  ```
- In `search.ts` put the weights in one exported object so they're easy to try:
  ```ts
  export const SEARCH_WEIGHTS = { out: 3, pick: 0.5, danger: 2 };
  ```
  Score = `(out ? w.out : 0) - w.pick * picked - w.danger * handDanger(myHandAtEnd)` (replaces `- 0.2 * handLeft`). Picked-up cards are also in the hand, so `pick` is lower than before.
- Try `danger` at 1, 2 and 4 (with `pick` 0.5), then `pick` at 0.25 and 1 with the best `danger`. Keep the best pair. At most 5 runs of two seeds each.
- Tests (`eval.test.ts`): an A-K hand is more dangerous than a 2-3 hand; adding a joker lowers danger; a hand missing a suit is less dangerous than the same hand with one low card of that suit added; empty hand = 0.

**Step D2.2: imagined opponents play like Normal.** Replace `rolloutCard` in `search.ts`. Inside a rollout every hand is an imagined one, so the rollout player may look at the imagined hands to check who is void (these are not the real cards). "Void after me" = a player still to act in this trick, holding cards, with no card of the suit in their imagined hand.
- Leading: for each suit I hold, count players void in it. Pick the suit with the fewest. If that count is 0, lead my highest card of it, else my lowest. Never lead a joker unless I have no standard card.
- Following, holding the led suit: if nobody after me is void in it (or I'm last), play my highest of the suit. Else play my highest card under the current top card. Else my lowest of the suit. No jokers.
- Slapping (no card of the led suit): the standard card with the highest `rank + (only card of its suit ? 6 : 0)` (same as `slapCard` in `moves.ts`). A joker only if I have no standard card.
- Final-two pick-up in a rollout: keep picking up (as now).
- Tests (`search.test.ts`): hand-made `PlayState`s where (a) nobody after me is void, so the rollout plays the highest card of the suit; (b) a player after me is void, so it plays under the top card; (c) no card of the led suit, so it slaps with a singleton high card. To test it, export `rolloutCard` as `_rolloutCard` (tests only).
- Measure. Keep if the gap improves.

**Step D2.3: search as a second opinion.**
- Split `searchCard` into `searchScores(seen, m, rng, samples): { id: string; avg: number }[]` (every legal card, all scored on the **same** imagined deals) and keep `searchCard` as the best of them.
- In `moves.ts` `chooseCard`, for Hard: work out Normal's card first (the existing lead/follow code with the persona's level treated as normal). Then call `searchScores`. Switch to the search's best card only if `best.avg - normalCard.avg >= SWITCH_MARGIN` (start at 0.3; also try 0.15 and 0.5). Otherwise play Normal's card. Hard never makes Easy's random slips.
- Tests (`moves.test.ts`): with a margin so large nothing switches, Hard plays exactly Normal's card on 50 positions from an arena game (proves the fallback). With the margin at 0, Hard plays the search's best card.
- Measure. Keep if the gap improves.

**Step D2.4 (only if the gap is still under 0.2 on 200 games):** raise `TRICKS_AHEAD` to 5, then try "to the end of the round" (`MAX_STEPS` guard stays), and `HARD_SAMPLES` 60. Keep Hard's p95 under 150 ms on a laptop (aim for under 60 ms, since phones are slower).

**When to stop:** if after D2.4 the two-seed average gap is still under 0.2, **stop coding**. Write the numbers into this section and the DEVLOG, and ask the user. Options to offer: keep Hard hidden for now; ship it with a lower bar; or try a different approach. Don't lower the bar yourself.

**D2 results (2026-11-13, version 2.13.0, not pushed):** gap = Normal's place minus Hard's, 200 games, seeds 1 and 2 (positive = Hard better). Baseline before D2: -0.62.
- D2.1 (`handDanger`; weights `SEARCH_WEIGHTS`): danger 1 gave -0.11; danger 2 gave -0.11; danger 4 gave -0.07/-0.06; then pick 0.25 with danger 4 gave -0.045/-0.036 (best). Kept `{ out: 3, pick: 0.25, danger: 4 }`.
- D2.2 (`_rolloutCard`, Normal-like imagined opponents): gap +0.16 on both seeds.
- D2.3 (`hardCard` in `moves.ts`, search as second opinion, `HARD_TUNING.switchMargin`): margin 0.3 gave +0.355/+0.358 (best); margin 0.15 gave +0.33; margin 0.5 gave +0.315. Kept 0.3.
- D2.4 not needed (gap over 0.2).
- Full `--bars` (2000 games): all 9 bars pass. Hard beats Normal by 0.242 (bar 0.15). Hard p95 10.86 ms (bar 150). Normal beats Easy by 0.536; Normal beats random by 1.424; no refused moves, no crashes, 6400 of 6400 games finished.
- Tests: `npm run check` clean; `npm test` 219 of 219 (new: `handDanger` tests in `eval.test.ts`; rollout and search tests in `search.test.ts`; `hard.test.ts` for the fallback and margin-0 cases).
- Browser: `testbed/solo_check.py --slice-d` added (All Hard game, and three Mixed games with at least one Hard seat).

**Phone checklist (slice D):** play against 3 Hard bots; do moves still come within a couple of seconds; does it feel noticeably stronger than Normal but still fair (no obvious peeking at hidden cards)?

**When the gap is 0.2 or more on 200 games:**
1. `npx tsx testbed/ai_arena.ts --bars` (2000 games, about 20 minutes). Every bar must pass, including `hardBeatsNormalBy0_15` and `hardP95UnderMs150`.
2. `npm run check`, `npm test` (the fair-play test runs Hard too).
3. `npm run build`, then the browser checks: add `--slice-d` to `testbed/solo_check.py`, modelled on `--slice-c`: tap "All Hard", play to game over, check every computer level saved as `hard`, no refused moves, no page errors, and a Mixed game shows at least one Hard seat in its levels (use several seeds or re-roll until it does). Also run `solo_check.py --slice-c`, `back_check.py`, `offline_check.py`.
4. Update the five MD files and bump the version to 2.13.0. Give the user the test link and the slice D phone checklist (above), then wait for "push".
5. Before committing: `rm node_modules` (it's a symlink).


**Slice E: people and computer players on one phone.** One-phone setup (`app.ts` `setupScreen`) gets "Add computer player" (name, level); bots get `computer: true`. `SavedGame.bots` without `me`. The phone is only passed between people: in `roundstart.ts` `nextVoter`, `nextSwapper`, `nextTapper`, in `between.ts` `takeHolder`, and in `game.ts` `actorOf` / the holder choice in `absorb`, skip bot players (they act through the driver). When the game waits only on bots, show the table with "Ben is thinking…" (new small screen `botsWaitStage` in `game.ts`). Votes stay secret (bots vote unseen; only the result pop-up shows). Take-cards involving a bot follow one-phone privacy (a bot's request to a person reaches that person's hand screen; requests between two bots are not shown). The host must be a person (setup refuses a bot host). Browser check: a 2-people + 2-bots game to the end with `bot.js` playing the people. **Phone checklist:** play with a friend plus 2 bots: the phone only goes between the two of you, bots play in between.

**Slice F: computer players in network games.** In the lobby (`netlobby.ts`, `lobby.ts`) the host gets "Add computer player" (name, level) for an empty seat: a seat with no link (`link: 'bot'`), not counted for pings, not refused for version. At Start, `hostStart` keeps bot seats out of `linkOf`; `SavedGame.bots` (no `me`) on the host's phone; the driver runs on the host's phone only (`runsSession`). Bots follow network rules (open votes, public take-cards). Other phones see bots like any player (bot icon from `computer`). Check: `netgame_check.py` game with 2 phones + 2 bots to the end, plus the fair-play test still green. **Phone checklist:** two phones plus two bots: bots play on both screens; a bot's vote shows live on both.

**Slice G: tuning.** Change weights and thresholds in `moves.ts` / `persona.ts` from the user's phone games; rerun the arena; record numbers in the DEVLOG.


## 9n. Next version (2.15) build guide: faster checks, then secret missing suits (APPROVED PLAN, user 2026-11-13; written for any model, Haiku included; BUILT as 2.15.0 on 2026-11-13, not pushed yet)

**Order:** step 0, then 9o (faster checks), then the stall hunt (9o.6), then 9p (secret missing suits), then 9n.1 (finish). Use the faster checks from 9o for everything after it.

**Step 0: already done and pushed as 2.14.0 (user 2026-11-13 "push it", as a test build before 9o and 9p):**
- Reactions (user 2026-11-13: "they should be antagonising the other players"): `src/ai/react.ts` reacts to slaps, pick-ups, players going out, cards taken, round losses and forfeits; higher `reactRate` per personality (careful 0.25, reckless 0.5, counter 0.35, windup 0.9); six new phrases in `src/content/catch-phrases.md`; tests in `tests/ai/react.test.ts`.
- The "X leads" pop-up stays 6 s (`LEAD_MS` in `src/ui/game.ts`, `ms` field on info pop-ups in `store.ts`), user: "far too quick".
- State: `npm run check` clean, `npm test` 225 of 225. `solo_check.py --slice-c` 13 of 14: the All Easy game stalled at 71 log events (see 9o.6).

### 9n.1 Finish (after 9o and 9p)
1. Full unit tests: `npm test`. All pass.
2. Arena: the computer players' knowledge changed in 9p, so run the full `npx tsx testbed/ai_arena.ts --bars` (on both cores after 9o.5). Every bar must pass. If one fails, stop and tell the user the numbers; don't change the bars.
3. `npm run build`, then the fast browser checks: `solo_check.py`, `--slice-c`, `--slice-d`, `back_check.py`, `offline_check.py`, `netgame_check.py`, `playthrough.py`.
4. Version 2.15.0 in `package.json` and the history line in 9e. Update all five MD files (`CLAUDE.md` rule 4).
5. Tell the user the version, give the phone checklist below, and wait for "push". Before committing: `rm node_modules` if it's the symlink.

**Phone checklist (2.15):** (1) start a game where someone is missing a suit: the pop-up says who leads and "Missing a suit", never which suit; it stays up long enough to read. (2) Computer players taunt you often: after you pick up the pile, go out, lose a round, forfeit, or when they take your cards; not so much that it floods the screen. (3) A network game: the other phone never shows which suit the leader is missing.

---

## 9o. Faster checks (APPROVED PLAN, user 2026-11-13: "it's getting way too long for each step"; BUILT 2026-11-13, see the results in the DEVLOG)

**Why it's slow (measured 2026-11-13):** browser checks play in real time: up to about 1.2 s per computer move even at Fast, slap pop-up 4 s, other pop-ups 2.4 s, lead pop-up 6 s, trick hold 0.7 s, shuffle 1.7 s; about 250 log events per 2-round game, so 5 to 10 minutes per game. The full arena is about 6400 games (about 40 minutes). Unit tests take about 1 minute (fine). This machine has 2 CPU cores: two heavy jobs at once slow each other down.

**Rules for this work:** test files only (`testbed/*`, `tests/*`), unless 9o.1 step 5 is needed (then ask the user first). A faster check must give the same pass/fail results as the slow one (compare once, see each step).

### 9o.1 Fake clock in browser checks (biggest win)
Playwright 1.63 is installed; its clock API fakes `setTimeout`, `setInterval`, `Date`, `performance` and `requestAnimationFrame` in the page.
1. In `testbed/solo_check.py` add, near the top: `FAST = '--real-time' not in sys.argv` and `TICK_MS = 1000`.
2. In `new_page()`: if `FAST`, call `page.clock.install()` **before** `page.goto(APP)`.
3. Add a helper and use it wherever the script waits for the game to move on (replace `time.sleep(...)` waits for the game; keep tiny real sleeps of 0.02 s so the page can draw):
   ```python
   def advance(page, ms=TICK_MS):
       if FAST:
           page.clock.run_for(ms)
       else:
           time.sleep(ms / 1000)
   ```
   In `play_until_over()`, call `advance(page)` once per loop after `pubbyBot.step`.
4. Check how `trickAnimating()` and `shuffling()` (`src/ui/game.ts`) end. If they end on a timer, the fake clock covers them. If they wait for a CSS `animationend` event, CSS animations still run in real time (under 2 s); that's fine, leave them.
5. **Only if** the checks still wait on something the fake clock doesn't cover: stop and ask the user before adding a test-only link option (`?testspeed=20`, like `?onephone=1`) to app code.
6. Acceptance: run `solo_check.py --slice-d` once with `--real-time` and once without. Same checks pass in both. Write both run times in the DEVLOG (goal: under 3 minutes without `--real-time`).
7. Then add the same `FAST` / `advance()` to `playthrough.py`, `back_check.py`, `offline_check.py`, `lobby_check.py`, `netgame_check.py`, `netvotes_check.py`, `sound_check.py`, `drawer_check.py` where they wait on the game. If a script uses real network timing (WebRTC in `netgame_check.py`, `lobby_check.py`) and breaks under the fake clock, leave that script on real time and note it in 8 Testing.

### 9o.2 Stuck-game check (fail fast)
In `play_until_over()` (and any loop like it): remember the last time the log grew. If the log hasn't grown for 30 real seconds, stop, and `check(False, ...)` with a dump: the screen's headings and pop-up title (`.popup-title`), and from `stored(page, 'pubby.currentGame')['session']`: `phase`, `play.turn`, `play.pendingFinalTwo`, `vote`, `takeRequests`, `paused`. Save a screenshot to `/tmp/stuck-<check name>.png`. Return `over=False`. Keep `limit_s` as an upper limit.

### 9o.3 Shorter browser games
- Slice C and slice D checks: play 1 round instead of 2 (`cfg['rounds']`; if the round count is set on the setup screen instead, set it there).
- Slice D Mixed: one Mixed game only, checking every level is Easy, Normal or Hard. Drop "at least one Hard seat in 3 games" from the browser check (the unit test `names.test.ts` already checks Mixed gives Hard).
- Keep the slice B check (`solo_check.py` with no flag) at 2 rounds: it tests Carry on between rounds.

### 9o.4 Which checks to run when (working rule)
- **During each small step:** only the test files for what changed (for example `npx tsx --test tests/ai/react.test.ts`), plus `npx tsx testbed/ai_arena.ts --games 200 --levels hard,normal` only if `src/ai/` changed.
- **Before asking the user to push:** `npm run check`, `npm test`, the fast browser checks for the screens touched (all of them if `src/session/` or `src/rules/` changed), and the full `--bars` only if `src/ai/` changed.
- **Never run two heavy jobs at once** (arena, browser checks): wait for one to finish.
Copy this rule into section 8 Testing.

### 9o.5 Arena on both cores
- Add `--workers N` to `testbed/ai_arena.ts` (default: `os.cpus().length`). `runMany()` splits its games into N chunks by game number and runs each chunk in a child process (`node:child_process` `fork` with `tsx`, or `worker_threads`). Each game keeps its own seed (`seedBase + g`), so results don't depend on the number of workers. The parent merges the totals (`absorb`), including the decision times.
- Acceptance: `--games 100 --levels hard,normal --workers 1` and `--workers 2` print the same `averagePlaceByLevel`, `finished`, `refusedMoves` and `crashedMoves`. Then time `--bars` with 2 workers and write it in the DEVLOG (goal: about 20 minutes).
- Don't change the number of games in the bars (2000): that's the user's call.

### 9o.6 The stalled All Easy game (after 9o.1 and 9o.2)
Run `solo_check.py --slice-c` (fast). If a game gets stuck, read the dump from 9o.2. If the cause is in the test script, fix it. **If it's in the app** (a game that really can't go on), don't fix it yet: write what you found in the DEVLOG and ask the user, with a one-line description of the bug and the fix you'd make.

---

## 9p. Secret missing suits (APPROVED RULE CHANGE, user 2026-11-13: "no one should know what suit is missing until they find out during play"; spec in `PROJECT.md` 5; BUILT 2026-11-13 as 2.15.0)

**What changes:** the declaration still happens and still decides who leads (unchanged rule), but which suit is missing is never shown or sent to anyone. Other players (people and computer players) only find out during play, from a slap. The leader pop-up still says who leads and why ("Missing a suit"; "Slowest in Reaction Tap"), but no suits.

**Where the suits leak today:** the session event `missingSuitDeclared { player, suits }` goes into the public log. The log is sent to every phone in a network game, the leader pop-up prints the suits (`popupsFor` in `src/ui/game.ts`), and computer players add them to their known voids (`src/ai/memory.ts`).

**Changes:**
1. `src/session/types.ts`: `missingSuitDeclared` becomes `{ readonly type: 'missingSuitDeclared'; readonly player: PlayerId; /** Old saved games only; never written now (PROJECT.md 5: secret). */ readonly suits?: readonly Suit[] }`.
2. `src/session/session.ts` `decideLeaderStep`: emit `{ type: 'missingSuitDeclared', player: m.player }` (no suits). Nothing else in the session changes: `decideLeader` still uses the real hands.
3. `src/ui/game.ts` `popupsFor`, case `leaderChosen`: drop the `lines` that list `no ♥` etc.; the text is only the reason. Remove the `missing` variable if nothing else uses it. Search `src/ui/` for any other place that shows a declared suit (`grep -rn "missingSuitDeclared\|suits" src/ui`) and remove the suit from it.
4. `src/ai/memory.ts`: `missingSuitDeclared` does nothing now (computer players learn voids only from slaps). Update the comment and the table in 9m.3 ("missingSuitDeclared: nothing; secret since 2026-11-13").
5. Old saved games: a saved log may still hold `suits`. Nothing may read it (steps 3 and 4). Carry on from an old save must still work.
6. Tests:
   - New, in the session tests: deal a round where one player has no hearts. The log has `missingSuitDeclared` for that player with **no** `suits` field, and the right leader is chosen (the rule is unchanged).
   - `tests/ai/seen.test.ts`: over whole games at 2 to 8 players, no `missingSuitDeclared` event has a `suits` field.
   - `tests/ai/memory.test.ts`: "missingSuitDeclared adds the suits to voids" becomes "missingSuitDeclared adds nothing".
   - `tests/ai/eval.test.ts` (lines with `missingSuitDeclared` around 18 and 96) and `tests/ai/moves.test.ts` (around 35 and 95): these used a declaration to make a known void. Keep each test's meaning by making the void another way: a slap in the events (an off-suit `cardPlayed` after a lead) or set `m.voids[p].add(suit)` directly. Each test must still check the same behaviour.
   - Browser: in `testbed/playthrough.py` or `solo_check.py`, when a "leads" pop-up shows, check its text has none of ♠ ♥ ♦ ♣. In `netgame_check.py`, check no joining phone's stored log has a `missingSuitDeclared` with `suits`.
7. Arena: computer players now know less, so run the full bars in 9n.1. Hard and Normal both lose the declared voids; every bar must still pass.

## 9q. Faster checks, part 2 (APPROVED PLAN, user 2026-11-13: "Yes, code it so haiku can make the changes"; written for any model, Haiku included; BUILT 2026-11-13 as test-only changes, no version bump; results in the DEVLOG)

**Why:** the full browser run is still about 16.5 minutes (2.15: 979 s, 2.16: 1006 s). netgame (430 to 490 s) and netvotes (120 to 180 s) run in real time and take about 60% of it. In the fast checks, about half the time is fixed real sleeps: `playthrough.py` waits 120 ms after each "wait" step, about 600 times a run (70 to 80 s).

**Rules for this work:** test files only (`testbed/*`). No app code. A changed check must still pass the same checks. Don't run two heavy jobs at once. Write each before/after time in the DEVLOG.

**Order:** 9q.1, then 9q.2, then 9q.3, then 9q.4 (finish).

### 9q.1 A runner that picks the checks for what changed (biggest win)
New file `testbed/run_checks.py`.
1. Usage: `python3 testbed/run_checks.py` (checks for the files changed since the last commit), `--all` (every check), `--dry-run` (print the list, run nothing), `--since REF` (changed since a git ref, e.g. `origin/main`).
2. Changed files: `git diff --name-only HEAD` plus `git ls-files --others --exclude-standard` (new files), or `git diff --name-only REF` with `--since`. Ignore `node_modules`.
3. Map each changed path to scripts (first match wins per path; the set of scripts is the union over all paths):
   | Changed path | Scripts |
   |---|---|
   | `src/rules/`, `src/session/`, `build.mjs`, `testbed/bot.js` | all |
   | `src/ai/`, `src/ui/bots.ts`, `src/content/catch-phrases.md` | `solo_check.py`, `drawer_check.py` |
   | `src/net/` | `lobby_check.py`, `netgame_check.py`, `netvotes_check.py` |
   | `src/audio/` | `sound_check.py` |
   | `src/ui/back.ts` | `back_check.py` |
   | `src/sw.ts`, `src/manifest*`, any file with `offline` or `sw` in its name | `offline_check.py` |
   | other `src/ui/` files | `solo_check.py`, `playthrough.py`, `drawer_check.py`, `back_check.py`, `netgame_check.py` |
   | `testbed/<name>.py` | that script (and for `solo_check.py` also `drawer_check.py`, which imports it) |
   | `*.md`, `package.json`, `tests/` | none (unit tests cover `tests/`) |
   | anything else | all |
   "all" = `solo_check.py`, `playthrough.py`, `drawer_check.py`, `back_check.py`, `offline_check.py`, `netvotes_check.py`, `netgame_check.py`, `lobby_check.py`, `sound_check.py` (this order).
   Check the real file names with `ls src/ui src/net src/audio src` first and adjust the table if a name differs; write the final table in a comment at the top of the script.
4. If any script is picked: run `npm run build` once first (stop if it fails). Then run each script one after another with `subprocess.run([sys.executable, 'testbed/<name>.py'], timeout=1800)`, capturing output to `/tmp/checks/<name>.log`.
5. Print one line per script: name, pass/fail (exit code), seconds, and the last line that matches `checks? (pass|passed)`. Then the total time. Exit 1 if any script failed.
6. Nothing picked: print "No browser checks needed for these changes" and exit 0.
7. Acceptance: `--dry-run` with only `src/ai/react.ts` changed lists solo and drawer; with only `CODE.md` changed lists nothing; with `src/session/session.ts` lists all nine. Show these three in the DEVLOG.
8. Update the working rule in `CODE.md` 8 ("Check speed rules"): before asking to push, run `python3 testbed/run_checks.py --since origin/main` (plus `npm run check`, `npm test`, and the arena bars if `src/ai/` changed).

### 9q.2 Shorter network games
In `testbed/netgame_check.py` `GAMES`: keep the 2-player game at 2 rounds (it still checks the "next round or end the game" host line); set the 3-player game to `'rounds': 1`; the 5-player game is already 1. The check on line about 275 already handles `rounds == 1`. Acceptance: 94 checks still pass (or the same number as before); write old and new time in the DEVLOG (old: about 430 to 490 s).

### 9q.3 Shorter real sleeps in fast mode
In `testbed/playthrough.py` `play_game()` and `testbed/solo_check.py` `play_until_over()`: when `FAST`, sleep 20 ms after a "wait"/"stuck" step (was 120) and 10 ms after other steps (was 15 / 40). Leave real-time mode as it is.
Acceptance: run `playthrough.py` and `solo_check.py --slice-d` before and after, each twice (times vary because games are random). Keep the change only if both pass every check and the average time is lower. If it fails or is slower, revert it and write the numbers in the DEVLOG. (A 20 ms try on 2026-11-13 was slower, but that run also hit the take-cards stall that is now fixed, so it wasn't a fair test.)

### 9q.4 Finish
1. `npm run check`, `npm test`, `python3 testbed/run_checks.py --all` once (the full run; write its total time in the DEVLOG; goal: under 13 minutes).
2. Test files only, so the app doesn't change; if this goes in the same push as an app change, use that version. If it's pushed on its own, no new version is needed (`CLAUDE.md` rule 8: doc and test-only changes).
3. Update all five MD files (`CLAUDE.md` rule 4): `CODE.md` 8 and this section's status, `TODO.md`, `DEVLOG.md`.
4. Nothing to test on the phone (test files only). Tell the user the before/after times and wait for "push". Before committing: `rm node_modules` if it's the symlink.

**Not in this plan (ask the user first):** fake clock for netgame/netvotes (risky with WebRTC); a test-only `?seed=` link option so games are the same every run (app code); running light checks side by side.

---

## 9r. Online play (rooms over the internet): build guide (PLAN, user 2026-11-13: "write up a detailed plan for every step ... so I can code it with haiku"; slice O1, the server, PUSHED as 2.17.0 and fixed in 2.17.1, deployed; slice O2 BUILT 2026-11-13 as 2.18.0, not pushed; O3 not built)

Written for any model, Haiku included. Read the whole section once before starting a slice. The spec (what the player sees) is `PROJECT.md` 12d. Do one slice at a time. Every slice follows `CLAUDE.md` (checks, a test build, the user's phone test and "push" before committing).

### 9r.0 The idea in one paragraph

Today a network game is a star: the host's phone runs the game and talks to each other phone over its own WebRTC link (`src/net/peer.ts`). Online play keeps that exactly. The only new thing is **how the messages travel**: instead of a direct WebRTC link, each phone opens one WebSocket to a small **relay server** on Cloudflare, and the relay passes messages between the host's phone and each other phone. The relay never reads the game. It only knows rooms, passcodes and who is connected. So `src/net/lobby.ts`, `src/net/netgame.ts`, `src/ui/netplay.ts` and the rules do not change. Nearby play (the QR codes) stays as it is.

```
   Joining phone ──wss──┐
   Joining phone ──wss──┤   Cloudflare Worker "pubby-rooms"
   Joining phone ──wss──┼── Room (one Durable Object per room) ──wss── Host's phone (runs the game, as now)
                        │
   Join screen ───wss── Directory (one Durable Object: the list of open rooms)
```

Words used below:
- **Worker:** a small program that runs on Cloudflare's servers when a request arrives. Ours is called `pubby-rooms`.
- **Durable Object (DO):** a named, single instance of a class that Cloudflare keeps alive somewhere, with its own storage. One `Room` object per room, one `Directory` object for the list. Every request for room `k7m2xq9p` goes to the same object, so it can hold that room's sockets.
- **WebSocket:** a connection that stays open so both sides can send messages at any time. `wss://` is the encrypted form (needed because GitHub Pages is `https://`).
- **Hibernation:** a Room with open sockets but no messages can be "put to sleep" by Cloudflare and woken by the next message. Sleeping costs nothing. We use Cloudflare's WebSocket Hibernation API so this happens.
- **Relay:** the server passes text through without reading it.
- **Token:** a long random secret the server gives a phone, which proves "I'm the host of this room" or "I'm the phone in seat o3". Never shown on screen.

### 9r.1 Free plan facts (check them on the build day; they change)

Checked 2026-11-13 on developers.cloudflare.com (Workers and Durable Objects pricing and limits pages):
- Workers Free plan: 100,000 requests a day (resets 00:00 UTC), 10 ms CPU per request, burst limit 1,000 requests a minute.
- Durable Objects are on the Free plan **only with the SQLite storage backend** (so `new_sqlite_classes` in the config, never `new_classes`). 100,000 DO requests a day; about 13,000 GB-s of awake time a day; 5 GB storage.
- WebSocket messages **into** a DO count 20 messages = 1 request. Messages **out** of a DO are free.
- Over a free limit, the extra operations fail with an error. **No bill.** The app must show a plain message (9r.6) and point to Nearby.
- A Cloudflare free account needs no card.

**Open WebSockets (answer, checked 2026-11-13 in slice O1):** Cloudflare publishes no cap on open WebSockets for the free plan. The Hibernatable WebSockets API allows up to 32,768 connections per Durable Object instance, and one room has at most 8 phones, so the room limit is not the constraint. Cloudflare's network page lists the free plan's concurrent connections only as "Low (hobby projects)", with no number. **Still to check** on the dashboard (9r.4 step 7): the Durable Objects metrics for the free plan. The first deploy has gone out, so this can be checked now.

**Message budget (estimate, keep it true while building):**
- Each phone sends the text `ping` every 25 seconds. The relay answers `pong` with Cloudflare's auto-response, which does not wake the room. 8 phones for an hour ≈ 1,150 pings ≈ 58 billed requests (if auto-response pings are billed at all; check).
- Each move: the host sends one message per other phone (each phone gets its own copy with only its own cards), so a move at 8 players ≈ 7 messages in + 1 from the player who moved. A game of about 500 moves ≈ 4,000 messages ≈ 200 billed requests.
- So an hour-long 8-player game ≈ 260 billed requests, about **380 such games a day** inside 100,000. Smaller tables cost less.
- Rules that keep it this way (do not break them):
  1. No app-level pings over online links (the `{t:'ping'}` every 2 s in `netlobby.ts` is for Nearby only).
  2. The room list is **pushed** by the Directory when it changes. The Join screen never polls.
  3. The relay never wakes on a timer while players are connected, except the one idle-cleanup alarm (9r.3.6).
  4. Storage is written only when the room's membership changes (create, join, leave, start, close), never per relayed message.

### 9r.2 Files

New:

| File | What it is |
|---|---|
| `src/net/relayproto.ts` | The relay's message format, shared by the app and the server (pure TypeScript, no DOM, no Cloudflare) |
| `src/net/link.ts` | The `Link` interface both `Peer` (Nearby) and `OnlineLink` (online) implement |
| `src/net/chunk.ts` | Sending long messages in parts, moved out of `peer.ts` unchanged |
| `src/net/online.ts` | App side of online play: `createRoom`, `joinRoom`, `watchRooms`, `HostRoom`, `OnlineLink`, `joinSocket` |
| `src/net/server.ts` | The relay's address (`ROOM_SERVER`) and the localhost override for checks |
| `src/ui/online.ts` | The online screens (choose Online/Nearby, room form, room list, passcode) as view functions; state stays in `netlobby.ts` |
| `server/package.json` | The server's own packages: `wrangler`, `@cloudflare/workers-types`, `typescript` |
| `server/wrangler.toml` | Cloudflare settings: name, entry file, the two Durable Object classes |
| `server/tsconfig.json` | Type check for the server (Cloudflare types) |
| `server/src/index.ts` | The Worker: reads the address, CORS, sends each request to the right object |
| `server/src/room.ts` | `Room` Durable Object: a thin wrapper that feeds sockets and requests to `RoomCore` |
| `server/src/directory.ts` | `Directory` Durable Object: thin wrapper around `DirectoryCore` |
| `server/src/core/room.ts` | `RoomCore`: all room logic, pure (no Cloudflare types), unit tested |
| `server/src/core/directory.ts` | `DirectoryCore`: the room list and the rate limits, pure, unit tested |
| `server/src/core/ids.ts` | Room ids and tokens from `crypto.getRandomValues` |
| `.github/workflows/server.yml` | Deploys the server to Cloudflare on every push that changes it |
| `tests/server/room.test.ts`, `tests/server/directory.test.ts`, `tests/net/relayproto.test.ts`, `tests/net/chunk.test.ts` | Unit tests (run by `npm test`, already matches `tests/**/*.test.ts`) |
| `testbed/relay_server.ts` | A local stand-in for Cloudflare: Node `http` + the `ws` package, using the **same** `RoomCore` and `DirectoryCore`, so browser checks test the real logic |
| `testbed/online_check.py` | Browser check: rooms, list, passcodes and whole games on several pages through the local relay |

Changed: `src/net/peer.ts` (uses `chunk.ts`, implements `Link`), `src/ui/netlobby.ts` (Link type, online mode), `src/ui/app.ts` (`#room=` invite links), `src/ui/styles.css` (room list, passcode box), `build.mjs` (define `__PUBBY_SERVER__`), `package.json` (version; `ws` as a dev dependency), `testbed/run_checks.py` (map the new files), `src/content/quick-rules.md` (one line on online play).

Not changed: `src/rules/`, `src/session/`, `src/ai/`, `src/net/lobby.ts`, `src/net/netgame.ts`, `src/ui/netplay.ts` (if one of these seems to need a change, stop and ask).

### 9r.3 The relay protocol (`src/net/relayproto.ts`)

#### 9r.3.1 Frames

Every WebSocket message (a **frame**) is text: a short JSON **header**, a newline, then the **payload** (may be empty).

```
{"c":"to","to":"o3"}
{"t":"game", ...the existing message, already JSON...}
```

The relay parses only the header (`text.slice(0, text.indexOf('\n'))`) and passes the payload on **without parsing it**. This keeps each request inside the free plan's 10 ms CPU limit even for a whole-game message.

```ts
export const RELAY_PROTOCOL = 1;
export const FRAME_MAX = 262_144;          // characters; bigger frames are refused (socket closed with code 1009)
export const ONLINE_CHUNK_CHARS = 200_000;  // OnlineLink splits payloads longer than this (chunk.ts)
export const PING_TEXT = 'ping';            // exact text, no header: auto-answered
export const PONG_TEXT = 'pong';
export const PING_EVERY_MS = 25_000;
export const LOST_AFTER_MS = 60_000;        // nothing heard (not even pong) for this long = lost

// Host's phone -> relay
export type HostOut =
  | { c: 'to'; to: string }                            // payload goes to that link
  | { c: 'update'; seats: number; started: boolean }   // for the room list; no payload
  | { c: 'kick'; link: string }                        // host removed that player
  | { c: 'close' };                                    // host closed the game
// Relay -> host's phone
export type HostIn =
  | { c: 'ready'; roomId: string }                     // socket accepted
  | { c: 'joined'; link: string }                      // a phone connected (link id like "o3")
  | { c: 'from'; from: string }                        // payload came from that link
  | { c: 'left'; link: string };                       // that phone's socket closed or was lost
// Joining phone -> relay
export type JoinOut = { c: 'up' };                     // payload goes to the host
// Relay -> joining phone
export type JoinIn =
  | { c: 'ready'; link: string }
  | { c: 'down' }                                      // payload came from the host
  | { c: 'host-gone' }                                 // host's socket closed
  | { c: 'closed' }                                    // host closed the game, or the room expired
  | { c: 'kicked' };

export function frame(header: object, payload = ''): string;   // JSON.stringify(header) + '\n' + payload
export function readFrame(text: string): { header: Record<string, unknown>; payload: string } | null;
// readFrame: null if no newline, header not an object, header has no string "c", or text.length > FRAME_MAX.
```

Unit tests (`tests/net/relayproto.test.ts`): round trip; a payload containing newlines survives (only the **first** newline splits); `ping`/`pong` are not frames; bad headers and too-long text give null.

#### 9r.3.2 HTTP API (all JSON, all on the Worker)

| Request | Body | Answer |
|---|---|---|
| `GET /health` | | `200 {"ok":true,"protocol":1}` |
| `POST /rooms` | `{name, passcode, hostName, version, protocol}` | `200 {roomId, hostToken}`; `400 {error:"bad-name"|"bad-passcode"|"protocol"}`; `429 {error:"too-many-rooms"}` |
| `POST /rooms/<roomId>/join` | `{passcode, version, protocol}` | `200 {joinToken}`; `403 {error:"wrong-passcode"}`; `404 {error:"no-room"}`; `409 {error:"started"|"full"}`; `409 {error:"version", need:"2.18"}`; `429 {error:"too-many-tries"}` |
| `GET /rooms` with `Upgrade: websocket` | | The room list socket (Directory) |
| `GET /rooms/<roomId>/socket?token=<t>` with `Upgrade: websocket` | | A room socket (host or joiner, decided by the token) |

Any Cloudflare "limit reached" error (the Worker or a DO call throws or returns 5xx) is answered `503 {error:"busy"}`; the app shows the busy message (9r.6).

Rules the Worker checks before calling an object:
- **Origin:** the request's `Origin` header must be in `ALLOWED_ORIGINS` (`https://mmans-99.github.io` and, for checks, `http://127.0.0.1` / `http://localhost` with any port). Otherwise `403`. Answer `OPTIONS` (the browser's "preflight" check before a JSON POST) with `204` and the `Access-Control-Allow-Origin` / `-Methods: GET, POST, OPTIONS` / `-Headers: content-type` headers for allowed origins; add `Access-Control-Allow-Origin` to every answer.
- **Room name:** trimmed, control characters removed, 1 to 20 characters (`ROOM_NAME_MAX = 20`). `hostName`: same cleaning, 1 to 16 (`NAME_MAX` in `lobby.ts`).
- **Passcode:** exactly 4 digits (`/^\d{4}$/`).
- **protocol** must equal `RELAY_PROTOCOL`.
- The phone's address for rate limits is the `CF-Connecting-IP` header (the stand-in uses the socket's address).

#### 9r.3.3 Ids and tokens (`server/src/core/ids.ts`)

- Room id: 8 characters from `23456789abcdefghjkmnpqrstuvwxyz` (no 0/o, 1/l/i), from `crypto.getRandomValues`. The Worker makes it and asks the Directory whether it's free (try again up to 5 times).
- Tokens: 16 random bytes as base64url (22 characters). Host token and one join token per seat.
- Link ids: `o1`, `o2`, … in join order, never reused inside a room. (Nearby links are `c1`, `c2`…; a room has only online links.)

#### 9r.3.4 RoomCore (`server/src/core/room.ts`): pure, the heart of the server

No Cloudflare types. The Room object gives it the time and carries out what it returns. This is what makes it testable here and reusable by `testbed/relay_server.ts`.

```ts
export interface RoomSettings { roomId: string; name: string; hostName: string; version: string; passHash: string; createdAt: number }
export type Effect =
  | { send: string; text: string }        // send text to the socket with this id
  | { close: string; code: number; reason: string }
  | { list: ListEntry | null }            // tell the Directory: update this room, or remove it (null)
  | { save: true }                        // write toJSON() to storage
  | { alarm: number }                     // set the wake-up alarm at this time (ms)
  | { forget: true };                     // delete storage: the room is gone

export class RoomCore {
  static create(s: RoomSettings, hostToken: string, now: number): { core: RoomCore; effects: Effect[] };
  static fromJSON(j: unknown): RoomCore;            // after the object wakes up
  toJSON(): unknown;                                // settings, tokens -> link ids, kicked tokens, started, seats, lastActive

  tryPasscode(ip: string, passHash: string, version: string, now: number):
    { ok: true; joinToken: string; effects: Effect[] } | { ok: false; error: 'wrong-passcode' | 'started' | 'full' | 'version' | 'too-many-tries'; need?: string };
  /** A socket opened with a token. socketId is the wrapper's name for it. */
  connect(token: string, socketId: string, now: number): { ok: true; effects: Effect[] } | { ok: false; code: number; reason: string };
  frame(socketId: string, text: string, now: number): Effect[];   // a message arrived
  closed(socketId: string, now: number): Effect[];                // that socket closed or errored
  alarm(now: number): Effect[];                                    // the wake-up alarm went off
}
```

What it does:
1. **Passcode:** the Worker hashes the passcode with SHA-256 (`roomId + ':' + passcode`, hex) before it reaches the core; the core compares hashes. Wrong tries: at most 5 per address per 5 minutes, and 20 per room per 10 minutes; past either one, answer `too-many-tries` (even for the right passcode) until the window passes. A 4-digit code has 10,000 values, so this keeps guessing slow.
2. **Seats:** host + at most 7 others (`MAX_PLAYERS` = 8 in `src/rules/cards.ts`; copy the number, don't import the rules into the server). A join token is given only if there is a free seat and the room hasn't started. Tokens not used to connect within 2 minutes are dropped.
3. **Version:** a join from a different `version` (the `MAJOR.MINOR` shown in the app) gets `version` with `need` = the room's version. The lobby also checks this on `hello` (`joinProblem`), but answering here gives a clearer message before the passcode is spent.
4. **connect:** the host token makes `socketId` the host socket (an older host socket is closed with `4000 "replaced"`), effect `send ready`. A join token gets its link id (a new one the first time, the same one when the same token connects again), closes an older socket with the same token, sends the joiner `ready` and the host `joined`. A kicked or unknown token gets `close 4003 "not-allowed"`.
5. **frame from the host:** `to` → `send` the payload to that link's socket as `{c:'down'}` + payload (dropped quietly if that link isn't connected). `update` → remember seats and started, `list` effect (or `list: null` once started), `save`. `kick` → close that link's socket `4001 "kicked"` after sending `{c:'kicked'}`, mark its token kicked, `save`. `close` → send every joiner `{c:'closed'}`, close every socket `1000`, `list: null`, `forget`.
6. **frame from a joiner:** `up` → `send` to the host socket as `{c:'from', from: link}` + payload. If the host isn't connected, drop it.
7. **Anything else** (bad frame, a joiner sending `to`, wrong side): close that socket `4002 "bad-frame"`. Too-long frames: `1009`.
8. **closed:** a joiner's socket → host gets `{c:'left', link}`. The host's socket → every joiner gets `{c:'host-gone'}`; the room is kept for `HOST_GRACE_MS = 120_000` (alarm) so the host can come back with the host token (slice O3 uses this); `list: null` straight away.
9. **Idle and age:** `lastActive` is updated on every frame (in memory; saved at most once a minute with other saves). The alarm is set to the earliest of: `lastActive + 30 min` (no messages at all), `createdAt + 12 h`, host grace end. When it fires and the time has really passed: send everyone `{c:'closed'}`, close all, `list: null`, `forget`. Otherwise set the next alarm.

Unit tests (`tests/server/room.test.ts`), each with a fake clock: create; right and wrong passcode; the two try limits and their windows; full at 8; started; version; token expiry; connect host and joiners; replace an older socket; relay both ways (payload passed through byte for byte, including a 200,000-character payload with newlines); `to` an absent link dropped; kick (socket closed, token refused afterwards); close; host gone then back inside the grace time; grace time running out; idle and 12-hour expiry; bad frames; `toJSON`/`fromJSON` round trip in the middle of a game keeps link ids and tokens.

#### 9r.3.5 DirectoryCore (`server/src/core/directory.ts`): the room list and rate limits

```ts
export interface ListEntry { roomId: string; name: string; hostName: string; seats: number; maxSeats: 8; version: string; createdAt: number }
export class DirectoryCore {
  reserve(roomId: string, ip: string, now: number): 'ok' | 'taken' | 'too-many-rooms';  // max 10 rooms per address per hour
  upsert(e: ListEntry, now: number): void;
  remove(roomId: string): void;
  list(now: number): ListEntry[];      // not started, seats < 8, newest first, at most 50, entries older than 12 h dropped
  changed(): boolean;                  // true once after upsert/remove changed the list
  toJSON(): unknown; static fromJSON(j: unknown): DirectoryCore;
}
```

The Directory object holds the list sockets (tag `list`). After any change it waits 500 ms (so several changes go out as one), then sends every list socket `{"c":"rooms"}` + `JSON.stringify(list(now))`. A new list socket gets the list straight away. It saves to storage on change (at most once a second). Room objects call it with RPC (`await env.DIRECTORY.get(env.DIRECTORY.idFromName('main')).upsert(entry)`; DO RPC needs a `compatibility_date` of 2024-04-03 or later).

Unit tests: reserve and its hourly limit; list filtering, order and the 50 cap; changed(); JSON round trip.

#### 9r.3.6 The Cloudflare wrappers (`server/src/room.ts`, `directory.ts`, `index.ts`)

Keep these thin; anything that can be wrong belongs in the cores.

- `Room extends DurableObject`. In the constructor: `this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))`, and load `RoomCore.fromJSON(await this.ctx.storage.get('room'))` inside `this.ctx.blockConcurrencyWhile(...)`.
  - Socket upgrade: `const pair = new WebSocketPair()`; `this.ctx.acceptWebSocket(pair[1], [socketId])` (the tag is the socket id, a fresh random string); `pair[1].serializeAttachment({ socketId })`; run `core.connect`; return `new Response(null, { status: 101, webSocket: pair[0] })`. **Use `ctx.acceptWebSocket`, never `ws.accept()`**: only the first lets the room hibernate.
  - `webSocketMessage(ws, msg)`: ignore non-strings; `core.frame(ws.deserializeAttachment().socketId, msg, Date.now())`; run the effects.
  - `webSocketClose` and `webSocketError`: `core.closed(...)`.
  - `alarm()`: `core.alarm(Date.now())`.
  - Running effects: `send` → `this.ctx.getWebSockets(id)[0]?.send(text)` (wrapped in try/catch); `close` → `.close(code, reason)`; `list` → Directory RPC (`upsert` or `remove`); `save` → `this.ctx.storage.put('room', core.toJSON())`; `alarm` → `this.ctx.storage.setAlarm(t)`; `forget` → `this.ctx.storage.deleteAll()`.
  - RPC methods for the Worker: `create(settings, hostToken)`, `tryPasscode(ip, passHash, version)`.
- `Directory extends DurableObject`: the same pattern, sockets tagged `list`; RPC methods `reserve`, `upsert`, `remove`.
- `index.ts` (`export default { fetch(request, env) }` plus `export { Room, Directory }`): the routes in 9r.3.2, the origin and input checks, hashing, then the RPC call or `stub.fetch(request)` for socket upgrades. Wrap everything in try/catch: an unexpected error → `503 busy` (and `console.error`, which shows in the Cloudflare dashboard logs).

`server/wrangler.toml`:

```toml
name = "pubby-rooms"
main = "src/index.ts"
compatibility_date = "2026-11-01"   # use the build day's date

[[durable_objects.bindings]]
name = "ROOMS"
class_name = "Room"

[[durable_objects.bindings]]
name = "DIRECTORY"
class_name = "Directory"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Room", "Directory"]   # SQLite backend: the only one on the free plan

[vars]
ALLOWED_ORIGINS = "https://mmans-99.github.io"
```

(Check on the build day whether Cloudflare now prefers `wrangler.jsonc`; either works, use the one their current docs show.)

`server/package.json`: `"private": true`, `"type": "module"`, scripts `"check": "tsc --noEmit -p tsconfig.json"`, `"deploy": "wrangler deploy"`; devDependencies `wrangler`, `@cloudflare/workers-types`, `typescript` (latest at build time). `server/tsconfig.json`: like the root one but `"types": ["@cloudflare/workers-types"]`, `"lib": ["ES2022"]` (no DOM), include `src/**/*.ts` and `../src/net/relayproto.ts`.

**This workspace can't install packages**, so the server wrappers can't be type checked or run here. The cores and `relayproto.ts` are plain TypeScript and are fully tested here. GitHub Actions installs the packages and type checks the wrappers before deploying (9r.3.7). If the deploy fails, its log is in the repo's Actions tab.

#### 9r.3.7 Deploying (`.github/workflows/server.yml`)

```yaml
# Deploys the online-play relay (server/) to Cloudflare Workers.
# Needs two repo secrets: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (CODE.md 9r.4).
name: Deploy the room server
on:
  push:
    branches: [main]
    paths: ['server/**', 'src/net/relayproto.ts', '.github/workflows/server.yml']
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install --no-audit --no-fund
        working-directory: server
      - run: npm run check
        working-directory: server
      - uses: cloudflare/wrangler-action@v3     # check the latest major version on the build day
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: server
```

The app (`pages.yml`) and the server deploy separately. A push that changes both deploys both. The server must accept the previous app version's frames for as long as phones may still run it; with `RELAY_PROTOCOL` unchanged, that's automatic. If the protocol ever has to change, bump `RELAY_PROTOCOL` and have the server answer the old one with `protocol` so the app says "Update Pubby".

### 9r.4 The user's one-time Cloudflare setup (done 2026-11-13: subdomain `mmans99`, token and Account ID saved as GitHub secrets)

Give the user these steps when slice O1 is ready to push. They're written for a phone or a computer browser. About 10 minutes.

1. **Make a Cloudflare account.** Go to `dash.cloudflare.com/sign-up`, enter an email and a password, and confirm the email Cloudflare sends. The free plan is the default; no card is asked for.
2. **Pick your workers.dev name.** In the dashboard's left menu tap **Compute (Workers)** (on some layouts **Workers & Pages**). The first time, Cloudflare asks you to choose a **subdomain**: a name that becomes part of the server's address, `pubby-rooms.<your-name>.workers.dev`. Pick something short (for example your GitHub name). Tell Claude the name: it goes into the app (9r.5.1).
3. **Copy your Account ID.** On the same Workers page the right side (or the bottom on a phone) shows **Account ID**: a 32-character code. It tells the deploy which account to use. It's not a secret on its own, but keep it with the token. Copy it.
4. **Make an API token.** An API token is a password-like key that lets GitHub upload the server to your account, and nothing else. Tap your profile icon (top right) → **Profile** → **API Tokens** → **Create Token** → next to **Edit Cloudflare Workers** tap **Use template**. Leave the permissions as they are; under **Account Resources** pick your account; under **Zone Resources** pick **All zones** (you have none, which is fine). Tap **Continue to summary** → **Create Token**. Copy the token straight away: Cloudflare shows it **only once**. If you lose it, delete it and make a new one.
5. **Put both into GitHub as secrets.** A secret is a value stored privately in the repo: workflows can use it, but nobody (including Claude) can read it back. On github.com open `mmans-99/pubby` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Name `CLOUDFLARE_API_TOKEN`, paste the token, **Add secret**. Again: name `CLOUDFLARE_ACCOUNT_ID`, paste the Account ID, **Add secret**.
6. **After the push, check the deploy.** In the repo tap **Actions** → **Deploy the room server**: a green tick means it worked; a red cross means open it and send Claude the error lines. Then open `https://pubby-rooms.<your-name>.workers.dev/health` on your phone: it should show `{"ok":true,"protocol":1}`.
7. **Where to watch usage later.** Cloudflare dashboard → Compute (Workers) → `pubby-rooms` → **Metrics** shows requests and errors; the **Durable Objects** part of the dashboard shows rooms and storage. Free limits reset at midnight UTC (midnight UK time in winter, 1 am in summer).

Never paste the API token into a chat, a file or a commit. If it leaks: Cloudflare → API Tokens → roll or delete it, then update the GitHub secret.

### 9r.5 App side

#### 9r.5.1 Server address (`src/net/server.ts`, `build.mjs`)

- `build.mjs`: add `__PUBBY_SERVER__: JSON.stringify(process.env.PUBBY_SERVER ?? 'https://pubby-rooms.<name>.workers.dev')` to `define` (fill in the user's workers.dev name from 9r.4 step 2). Declare `__PUBBY_SERVER__` next to `__PUBBY_VERSION__` (see how `version.ts` declares it).
- `src/net/server.ts`: `export function roomServer(): string`. It returns `__PUBBY_SERVER__`, except **only when the page itself is on `localhost` or `127.0.0.1`**, a `?server=http://127.0.0.1:<port>` query parameter overrides it (for the checks). On GitHub Pages the override is ignored, so no link can point a player's app at another server. `wsUrl(path)` turns `https:` into `wss:` (and `http:` into `ws:` for the checks).

#### 9r.5.2 `Link` and chunking (do this first in slice O2; no behaviour change)

`src/net/link.ts`:

```ts
export interface Link {
  readonly kind: 'nearby' | 'online';
  /** true: the link notices a lost phone itself (online); netlobby sends no app pings over it. */
  readonly keepsAlive: boolean;
  readonly isOpen: boolean;
  send(msg: unknown): boolean;
  close(): void;               // on purpose: no onClose
  onOpen: () => void;
  onMessage: (msg: unknown) => void;
  onClose: (why: string) => void;
}
```

- Move `CHUNK_CHARS`, the `~part` sending and `whole()` from `peer.ts` into `src/net/chunk.ts` as `splitText(text, max): string[]` and `class Rejoin { take(raw: unknown): unknown | null }`. `peer.ts` uses them with `max = CHUNK_CHARS` (16,000), so Nearby behaves exactly as before; add `kind = 'nearby'`, `keepsAlive = false`, `implements Link`.
- `tests/net/chunk.test.ts`: split and rejoin at both sizes; out-of-order part resets; non-part messages pass through.
- In `netlobby.ts` change the types `Peer` → `Link` where a link is stored (`Link.peer`, the joiner's `peer`, `closeSoon`); `Adding` keeps `Peer` (only Nearby adds players by scanning). `startPings()` skips links with `keepsAlive`, and the joiner skips its pings when `peer.keepsAlive`.
- Run `npm run check`, `npm test` and `python3 testbed/run_checks.py --since origin/main` (it runs lobby, netgame and netvotes): Nearby must pass unchanged before going on.

#### 9r.5.3 `src/net/online.ts`

```ts
export class OnlineError extends Error {}   // message = the text to show (9r.6)
export interface RoomInfo extends ListEntry {}   // re-export the shape from relayproto or the core

export async function createRoom(o: { name: string; passcode: string; hostName: string }): Promise<{ roomId: string; hostToken: string }>;
export async function joinRoom(roomId: string, passcode: string): Promise<{ joinToken: string }>;
/** Live room list. Returns stop(). onList gets the whole list each time it changes. */
export function watchRooms(onList: (rooms: RoomInfo[]) => void, onProblem: (text: string) => void): () => void;

/** Host's phone: one socket to the room; each joining phone appears as an OnlineLink. */
export class HostRoom {
  constructor(roomId: string, hostToken: string);
  onReady: () => void;
  onJoined: (link: OnlineLink) => void;    // a new phone, or the same link id coming back (slice O3)
  onLost: (why: string) => void;           // the host's own socket is gone
  update(seats: number, started: boolean): void;
  kick(linkId: string): void;
  close(): void;                           // sends {c:'close'} then closes
}
/** Joining phone: its link to the host. */
export function joinSocket(roomId: string, joinToken: string): OnlineLink;

export class OnlineLink implements Link {
  readonly kind = 'online'; readonly keepsAlive = true;
  readonly id: string;     // link id ("o3") on the host's side; "host" on a joining phone
  // send(msg): JSON.stringify, splitText at ONLINE_CHUNK_CHARS, each part as frame({c:'to', to:id}) (host side) or frame({c:'up'}) (joiner)
}
```

How it works:
- **fetch** calls: `POST` JSON with a 10-second timeout (`AbortController`). Map answers to `OnlineError` texts (9r.6). A network failure (fetch throws) = "Couldn't reach the Pubby server…".
- **One socket class** inside the file (`RoomSocket`) used by HostRoom, joinSocket and watchRooms: opens `new WebSocket(wsUrl(...))`; sends `ping` every `PING_EVERY_MS`; any message (including `pong`) updates `lastHeard`; nothing for `LOST_AFTER_MS` → close it and report lost. Uses `visibilitychange`: when the page becomes visible again, send a `ping` at once and check `lastHeard` (phones freeze timers in the background).
- **HostRoom** reads frames: `ready` → `onReady`; `joined` → make (or reuse, for the same id) an `OnlineLink` with `isOpen = true`, call `onJoined(link)` and then that link's `onOpen()`; `from` → rejoin parts (`Rejoin` per link) and call that link's `onMessage`; `left` → that link's `isOpen = false`, `onClose('left')`. The host socket closing → every link `onClose('lost')` and `onLost`.
- **joinSocket**: `ready` → `onOpen()`; `down` → rejoin and `onMessage`; `host-gone` → `onClose('host-gone')`; `closed` → `onMessage({ t: 'closed' })` (the lobby already handles that message) then close quietly; `kicked` → `onMessage({ t: 'removed' })` then close quietly; socket lost → `onClose('lost')`.
- **watchRooms**: socket to `/rooms`; on `{c:'rooms'}` parse the payload and call `onList`. If the socket is lost, try again after 3 s, then 10 s, then show `onProblem("The room list isn't updating. Check your internet.")` and keep trying every 30 s while the Join screen is open. `stop()` closes everything.

#### 9r.5.4 Screens and `netlobby.ts` changes

Screens are in `PROJECT.md` 12d. Code shape:

- `src/ui/online.ts` exports view functions that take what they show and callbacks, in the style of `netscreens.ts`: `modeView`, `roomFormView`, `roomListView`, `passcodeView`, `busyView`. They use `h()` and existing classes (`big`, `secondary`, `panel`, `note warn`); new styles go in `styles.css` with a `room-` prefix. Line icons from `icons.ts`, no emoji.
- `netlobby.ts` keeps all state. Add `let mode: 'nearby' | 'online' = 'nearby'`, `let hostRoom: HostRoom | null`, `let stopList: (() => void) | null`, `let rooms: RoomInfo[]`, `let roomPick: RoomInfo | null`, `let roomName`, `let passcode`. New steps: `'mode'` (first screen), `'room-form'`, `'room-list'`, `'room-pass'`, `'room-wait'` (making or joining). Online flow: `mode` → Host/Join (`pick`) → `name` (as now) → host: `room-form` → `room-wait` → `lobby`; join: `room-list` → `room-pass` → `room-wait` → `lobby`.
- **Host:** after `createRoom` → `hostRoom = new HostRoom(...)`; `hostRoom.onJoined = (link) => addOnlineLink(link)`. `addOnlineLink` does what `promote()` does for a scanned phone: `links.set(link.id, { peer: link, lastHeard: now, seated: false })`, wire `onMessage` to `hostGot(link.id, m)` and `onClose` to `linkLost(link.id)`, and start the hello timeout. Share the existing code rather than copying it: pull the body of `promote()` into `addLink(id, link)` used by both.
  - In `broadcast()`: also `hostRoom?.update(lobby.seats.length + 1 /* host */, lobby.started)`. (Check how the host's own seat is counted in `lobby.seats` and keep `seats` = people in the room.)
  - Removing a player: `hostRoom?.kick(id)` as well as what it does now.
  - "Close the game" and `reset()`: `hostRoom?.close()`.
  - The lobby view shows the room line and **Share invite** (online) instead of **Add player** (Nearby).
- **Joiner:** after `joinRoom` → `peer = joinSocket(roomId, joinToken)`, then wire it with the same code as `newJoinPeer()`'s handlers: pull them into `wireJoin(p: Link)` used by both, so hello resends, `joinGot`, `lost()` and the version check all stay shared.
- **Lost connections in slices O1 to O2** behave exactly like Nearby today: a joiner losing the host, or the host losing a joiner, shows the same messages, and during a game the host closes it. Rejoining is slice O3.
- `app.ts`: an invite link `<Pubby address>#room=<roomId>` opens `netlobby` in online join mode at `room-pass` for that room (after "Who's on this phone?" if no profile is picked yet). Copy how `#lobby=` is handled, including the `hashchange` listener and removing the hash with `history.replaceState`. If the room isn't in the list (started, full, gone), `joinRoom` answers and the screen shows why.
- `stopNetLobby()` (leaving the screen, back gesture) also stops `watchRooms` and closes the room socket.
- **Share invite:** `navigator.share({ text })` where available, else copy to the clipboard and flash "Invite copied". Text: `Join my Pubby game "<room name>": <link>  Passcode: <1234>`.
- **Offline phone:** if `navigator.onLine === false` when Online is tapped, show "You're offline. Play Nearby, or connect to the internet." and stay on the mode screen.

### 9r.6 Messages the app shows (exact text, keep them short)

| Case | Text |
|---|---|
| fetch failed / timeout | "Couldn't reach the Pubby server. Check your internet, or play Nearby." |
| `busy` (503) | "Online play is busy right now. Try again later, or play Nearby." |
| `too-many-rooms` | "Too many rooms made from this connection. Try again in an hour." |
| `wrong-passcode` | "Wrong passcode." |
| `too-many-tries` | "Too many wrong tries. Wait a few minutes." |
| `no-room` | "That room has closed." |
| `started` | "That game has already started." |
| `full` | "That room is full." |
| `version` | "This room needs Pubby <need>. You have <VERSION>. Close Pubby and open it again to update." |
| `protocol` | "Update Pubby to play online: close it and open it again." |
| room list lost | "The room list isn't updating. Check your internet." |
| host-gone (lobby) | the existing "lost the host" screen |
| kicked | the existing "removed" screen |

### 9r.7 Local relay and browser check

- **`ws` package:** add `"ws": "^8"` to the root `devDependencies` (only `testbed/` uses it; CI's `npm install` gets it). In this workspace link it like esbuild: `ln -s /opt/npm-tools/node_modules/ws node_modules/ws` (it's on the machine; checked 2026-11-13).
- **`testbed/relay_server.ts`** (`npx tsx testbed/relay_server.ts --port 8787`): Node `http` server with the HTTP API of 9r.3.2 and a `ws` `WebSocketServer({ noServer: true })` for the two socket paths. It keeps `RoomCore`s and one `DirectoryCore` in a `Map`, runs their effects (alarms with `setTimeout`, storage as a JSON copy so `fromJSON` is exercised), answers the text `ping` with `pong`, and allows any `127.0.0.1`/`localhost` origin. Options: `--fast-idle` (idle 5 s, grace 3 s) for the expiry checks. It prints one line per request with `--verbose`.
- **`testbed/online_check.py`** (needs a built `dist/`): starts the relay and the static server (like `lobby_check.py`), opens pages with `?server=http://127.0.0.1:8787`. Checks:
  1. Mode screen shows Online and Nearby; Nearby opens the existing scan flow.
  2. Host makes a room ("Cat's table", passcode shown, 4 digits). It shows on two other pages' Join lists within 2 s, with host name and 1/8.
  3. Wrong passcode refused; 5 wrong tries → too-many-tries; right passcode afterwards still refused until the window ends (use `--fast-idle`-style short windows, or a relay flag `--fast-limits`).
  4. Three phones join; the host's lobby and every phone show the same seats; the list shows 4/8.
  5. The host removes one; that page shows "removed"; it can join again with the passcode.
  6. Start: the room leaves the list; a new join gets "already started".
  7. A whole 4-player game with `bot.js` on every page (reuse `netgame_check.py`'s helpers), ending on the results/podium on every page.
  8. Invite link `#room=<id>` opens the passcode screen for that room.
  9. Host closes: every page shows the closed screen; the room is gone from the list.
  10. Version mismatch (start one page with a test-only `?fakeversion=` honoured only on localhost, or call `joinRoom` with a changed version from the page): the version message.
  11. Relay stopped mid-lobby: every page shows a lost message within `LOST_AFTER_MS` (use a short value via a localhost-only query flag) and nothing hangs.
  12. Idle expiry with `--fast-idle`: an empty room disappears from the list.
  13. A frame over `FRAME_MAX` closes that socket (relay-side unit test is enough; skip in the browser if awkward).
- **`run_checks.py`:** add a row: `src/net/online.ts`, `src/net/relayproto.ts`, `src/net/link.ts`, `src/net/chunk.ts`, `src/net/server.ts`, `src/ui/online.ts`, `server/`, `testbed/relay_server.ts` → `online_check` (and lobby, netgame for `link.ts`/`chunk.ts`). `src/ui/netlobby.ts` → add `online_check` to its list. Add `online_check` to `ALL_ORDER`. Update the table in the script's header.

### 9r.8 Slices

#### Slice O1: the server (version 2.17)

**Status (2026-11-13): PUSHED as 2.17.0 (commit ebf8168); the first deploy failed on type errors; fixed in 2.17.1.** No screen changes, so nothing to play yet (`CLAUDE.md` rule 5). Still to do: the deploy must go green, then the `/health` check in step 8 on the phone.

**Build notes (what was decided where this plan left room):**
- Files built: `src/net/relayproto.ts`; `server/src/core/ids.ts`, `api.ts` (input and origin checks, shared by the Worker and the stand-in; not in the list below), `room.ts`, `directory.ts`; `server/src/env.ts`, `room.ts`, `directory.ts`, `index.ts`; `server/wrangler.toml`, `server/package.json`, `server/tsconfig.json`; `testbed/relay_server.ts`; `.github/workflows/server.yml`; tests `tests/net/relayproto.test.ts`, `tests/server/room.test.ts`, `directory.test.ts`, `ids.test.ts`, `relay_server.test.ts`.
- **Seats** = people in the room, the host included, as the host reports them with `update`. A join token holds a seat from the moment it is issued until it is used or 2 minutes pass. The host's lobby stays the authority for seats.
- **Wrong passcodes:** the 5-per-address limit counts an address's tries in one room; the 20-per-room limit counts across all addresses. The room limit is the one that stops guessing.
- **Origin:** a request with no `Origin` header is allowed (a plain request, such as opening `/health` in a tab; CORS only concerns browsers). An `Origin` that is present must be in `ALLOWED_ORIGINS`, else 403. The stand-in also allows `127.0.0.1` and `localhost`.
- **`lastActive` is saved at most once a minute while messages flow**, not only with other saves. Without this, a room that Cloudflare put to sleep during a long game could expire while still in use. Still no write per relayed message (9r.1 rule 4).
- **Alarms, not timers:** the alarm is set to the earliest expiry and re-checked when it fires. The room list's 500 ms wait is also an alarm, so the Directory can sleep.
- **Order of checks in `tryPasscode`:** rate limit, then version, then passcode, then started, then full. Version comes before passcode so a version mismatch does not spend a try.
- **Rejoin keeps the link id:** a phone that reconnects with its own token gets the same link id (needed for slice O3). After the game starts, only a phone that already had a seat can connect.
- **Stand-in test:** `tests/server/relay_server.test.ts` starts `testbed/relay_server.ts` as a child process on a random port, so the type check never follows its `ws` import (`@types/ws` is not installed here, and the testbed is not type checked).
- **Picker (`testbed/run_checks.py`):** `server/`, `testbed/relay_server.ts`, `.github/workflows/server.yml` and `.gitignore` select no browser check (no app screen uses the relay before O2). The O2 row in step 4 is partly done here.
- **`package.json`:** `ws` `^8` added as a dev dependency (9r.7); version 2.17.1 (2.17.0 was pushed first; 2.17.1 fixes the type errors that stopped the first deploy).
- **Not checked here:** the Worker files in `server/src` cannot be type checked, because `@cloudflare/workers-types` is not on this machine. They were bundled with esbuild (every import resolves). The `npm run check` step in `server.yml` type checks them on push, and the first deploy is still to do. Pin the `latest` versions in `server/package.json` on the day of the first deploy.
- **Checks run here:** `npm run check` (both projects) clean; `npm test` 280 of 280 in 33 files; `node build.mjs` builds 2.17; the three network browser checks (see the DEVLOG entry for the results).

1. `src/net/relayproto.ts` + tests.
2. `server/src/core/ids.ts`, `room.ts`, `directory.ts` + tests (`tests/server/`). Put `RoomCore` and `DirectoryCore` constants at the top of each file.
3. `server/src/index.ts`, `room.ts`, `directory.ts`, `wrangler.toml`, `package.json`, `tsconfig.json`.
4. `testbed/relay_server.ts`, and a small Node script check (`tests/server/relay_server.test.ts` starting it on a random port and using Node 22's built-in `WebSocket` client): create, list socket gets the room, join, frames both ways, close.
5. `.github/workflows/server.yml`.
6. `package.json` version 2.17.1 (rule 8; no screen changes yet).
7. Docs: this section's status, `TODO.md`, `DEVLOG.md` (results), `PROJECT.md` 12d status.
8. **Test for the user (doc rule 5: nothing to play yet, say so):** done up to the deploy: the push went out, the first deploy failed on type errors, and 2.17.1 deployed green. Still open: the user opens `https://pubby-rooms.mmans99.workers.dev/health` on their phone (expect `{"ok":true,"protocol":1}`), and the free-plan WebSocket question in 9r.1 is still to check on the dashboard.

#### Slice O2: online rooms in the app (version 2.18)

**Status (2026-11-13): BUILT as 2.18.0, not pushed.** Files: `src/net/link.ts`, `chunk.ts`, `server.ts`, `online.ts`; `src/ui/online.ts`; changed `peer.ts`, `netlobby.ts`, `app.ts`, `styles.css`, `build.mjs`, `quick-rules.md`, `package.json`. Tests: `tests/net/chunk.test.ts`; `testbed/online_check.py` (37 of 37, four phases with their own local relay). Nearby checks pass unchanged. Build notes: the room-list socket runs on the passcode screen too, so an invite shows the room name; parts are halved until every frame fits FRAME_MAX (quote-heavy text takes more room); the menu says "Multiplayer" (was "Play on several phones"). Not covered in the browser: a version mismatch (unit test) and frames over FRAME_MAX (unit test).

1. `link.ts` and `chunk.ts`, Peer changes, netlobby types (9r.5.2). Nearby checks pass unchanged.
2. `server.ts`, `build.mjs` define, `online.ts`.
3. Screens (`online.ts` UI) and netlobby online mode (9r.5.4), invite links in `app.ts`, quick rules line.
4. `online_check.py` and `run_checks.py` row (9r.7). Run `npm run check`, `npm test`, `python3 testbed/run_checks.py --since origin/main`.
5. Version 2.18.0, docs.
6. **Phone checklist for the user** (on GitHub Pages after "push", since it needs the real server):
   - Two phones on **different networks** (one on home Wi-Fi, one on mobile data with Wi-Fi off). Phone A: Multiplayer → Online → Host a room. Room name and a 4-digit passcode show.
   - Phone B: Online → Join a room: the room appears by itself with A's name and 1/8.
   - Wrong passcode is refused; the right one joins; both lobbies show both players.
   - Share invite on A sends a link; opening it on a third phone (or B after leaving) goes straight to the passcode screen.
   - Start and play a whole game to the podium. Reactions, votes, take-cards and pause work as on Nearby.
   - Close the game on A: B shows the closed screen.
   - Nearby still works with the QR codes.

#### Slice O3: rejoin online (version 2.19; this is Phase 4 slice 4 for online games)

Do this together with, or right after, Nearby slice 4 (`PROJECT.md` 12: dropped phone pauses the game and rejoins its seat; the host can remove a player who doesn't come back; the host's phone carries on). Online makes rejoining automatic, since the token is the seat:
1. `OnlineLink` (joiner) keeps `roomId` and `joinToken` in `sessionStorage` (survives a reload of the tab, not a new tab). When its socket is lost it tries to reconnect: after 1 s, 2 s, 4 s, then every 5 s, for up to 2 minutes, showing "Reconnecting…". The relay gives back the same link id; the host sees `joined` for an id it knows and treats it as the same seat (`setConnected(true)`, `hostSync(linkId)` so the phone gets the whole game).
2. The host's `HostRoom` does the same with the host token inside `HOST_GRACE_MS`; joiners see "Waiting for the host…" instead of the lost screen while the relay says `host-gone`.
3. Game rules for a phone that doesn't come back follow Nearby slice 4 (pause for everyone, host can remove). Write the details in this section when slice 4's plan is written; don't invent them here.

#### Slice O4 (not planned yet, only if wanted): the game on the server

Run `src/session/` inside the Room object instead of on the host's phone, so the game survives the host's phone. Bigger change (CPU limits, per-move storage writes against the free plan's write limit). Only plan it if the user asks.

### 9r.9 Things not to do

- Don't use `ws.accept()` in the Durable Objects (it stops hibernation and costs awake time).
- Don't add app-level pings, room-list polling or a per-message storage write (9r.1 budget).
- Don't send any game information the relay doesn't need in headers. Payloads are the existing messages; each phone already only gets its own cards (`redactSession`).
- Don't log payloads on the server (`console.log` only for errors, with the room id and the error, never message text).
- Don't mix Nearby and online links in one game (not in this plan).
- Don't put the API token, Account ID or any secret in the repo; the workers.dev address is public and fine.
- Don't change `src/rules/`, `src/session/`, `src/ai/`, `lobby.ts`, `netgame.ts` or `netplay.ts` without asking.

## 9s. Everyone at the table before a game starts (BUILT and PUSHED as 2.19.0 with Option A, f487bd8, 2026-11-13; spec `PROJECT.md` 12e; the swap gap the user then found is fixed by plan 9t)

Build guide for the user's rule: all players at the table before a game starts, and a "Waiting for X" message while anyone is missing. The user answered the four questions and chose Option A on 2026-11-13. What was built is in the DEVLOG entry of that date and in the paragraph below.

**Built:** `ready` on each seat in `src/net/lobby.ts` (`setReady`, `waitingSeats`, `waitingText`); the joining phone sends `{t:'ready'}` once when the lobby arrives (`src/ui/netlobby.ts`, `readySent`); the host ignores repeats, because answering each one re-broadcast the lobby and looped between phones; Start is greyed and `startGame` refuses while `waitingText` is not null. `LOBBY_PROTOCOL` is 5.

### 9s.0 Read first (before any code)

1. `CLAUDE.md`, `PROJECT.md` 12e, `TODO.md` Phase 4d, the latest `DEVLOG.md` entry.
2. Confirm the stage a joiner is in while looking at cards in network play: is the card screen a stage of the shared game (`roundstart.ts`, `g.stage`), or a screen before the game? This decides between Option A and Option B below. Record the answer in this section before coding.
3. Confirm how a joiner reaches the game after a reconnect (`hostSync` and `joinGotGame` in `netplay.ts`). Any path that sets `screen: 'game'` must wait for the start signal.

**Read-first answers (checked 2026-11-13 on main at 925f7bd, read only, no code changed):**
- Step 2: the cards screen is a stage of the shared game, not a screen before it. `roundstart.ts` shows the hand screen when `g.stage === 'hand'` and `g.holder` is that player (lines 64-82). The joiner is already on the game screen when this starts. Its Done calls `update({})` for the own seat (line 365 area) and sends nothing. So Option A is the right fit; the cards screen does not need its own wait.
- Step 3: `joinGotGame` (`netplay.ts` ~133-146) sets `screen: 'game'` on any full `GameUpdate`. `hostSync` (~111-115) answers a joiner's `sync` request with a full update, so a reconnect or a late sync enters the game with no start signal. This path must be changed in Option A: a full update may enter the game only after a start has been sent for this game (e.g. a `started` flag on the session or the link). A mid-game reconnect is the case where a start has already been sent, so it still works. A reconnect before start must stay on the table screen.

### 9s.1 Why it happens (as read at 2.18.0)

- `hostStart()` in `src/ui/netplay.ts` (around lines 67-76) sets the host's screen to `game` and sends every joiner a full `GameUpdate` at once.
- `joinGotGame()` in `src/ui/netplay.ts` (around lines 133-146) sets the joiner's screen to `game` on arrival, without checking whether that phone has finished its own card screen.
- The card screen's Done in `src/ui/roundstart.ts` (around lines 360-372) is local: for the player's own seat it calls `update({})` and sends nothing.
- The Reaction Tap Start button (`roundstart.ts`, around line 444) is a separate mini-game. Do not change it.

### 9s.2 Options (the user picks; `PROJECT.md` 12e)

- **Option A (recommended): gate on the table screen before the game starts.** Each phone is at the table screen (lobby, seat list) and sends `{t:'ready', seat}` to the host on arrival. The host keeps a ready set per seat and sends `{t:'table', seats:[{seat, name, ready, online}]}` to every phone on each change. The host's Start is enabled only when all seats are ready. On Start the host sends the start signal (the full game update, as today) to everyone. Phones enter the game only on that signal.
- **Option B: gate on the card screen.** A phone's Done on its card screen sends `{t:'ready'}`. The host starts the game when all are ready. More fragile: one slow player holds up everyone, and pass-the-phone steps do not apply online.

Under Option A the cards screen still runs inside the game after the start signal. Step 9s.0.2 decides whether the cards screen also needs a wait; if it does, Option A is extended with the same ready set for that stage, and that is written back into this section before coding.

### 9s.3 Behaviour rules (from `PROJECT.md` 12e)

- Host's Start greyed while any seat is not ready; the host sees "Waiting for Fay" (or "Waiting for Ben and Fay").
- Joiner's table screen shows the seat list (name, ready or waiting) and the same waiting text.
- A seat that leaves or loses the connection shows "Waiting for X (reconnecting)", or "X left" if the host removes them. Its ready state is cleared; on rejoin it must be ready again.
- A join that happens as Start is tapped: Start is re-checked on every change, so no game begins with a seat that is not ready.
- Host leaves before start: existing behaviour (room ends) stays.

### 9s.4 Messages (`src/net/`)

- `{t:'ready', seat}` joiner to host.
- `{t:'table', seats:[...]}` host to joiners, on every change.
- The existing full `GameUpdate` is the start signal, sent only after all seats are ready. Its shape does not change.
- Keep the chunking and `FRAME_MAX` rules (`src/net/chunk.ts`, `relayproto.ts`). Type the new messages in `relayproto.ts` only if they travel over the relay; Nearby (`Peer`) uses the same `Link` (`src/net/link.ts`).

### 9s.5 Files likely to change

- `src/ui/netplay.ts`: split `hostStart` into "send table" and "start"; ready tracking on the host; `joinGotGame` only on the start signal. Note: `CODE.md` 9r.9 says not to change `netplay.ts` without asking. This change is asked for by the user in this plan, but the approval must name it.
- `src/ui/netlobby.ts`: table screen, "Waiting for" text, greyed Start.
- `src/net/link.ts`, `src/net/relayproto.ts`: message types if needed.
- `src/ui/roundstart.ts`: no change under Option A, unless 9s.0.2 says otherwise.
- `src/content/quick-rules.md`: one line, only if decision 4 is yes.

### 9s.6 Tests

- Unit (`tests/`): ready set (join, leave, rejoin, ready twice, start with all ready, start blocked by one missing).
- Browser (`testbed/pregame_check.py`, new): 3-4 phones via `testbed/bot.js` and the local relay. Start greyed while a bot is not ready; the waiting text; all phones enter the game in the same run; a leaver is shown and cleared. Add it to `testbed/run_checks.py` (`ALL_ORDER` and the path table).
- Existing checks must still pass: `online_check.py` (37), `lobby_check.py`, `netgame_check.py`, `netvotes_check.py`; unit tests (286); type check.
- Real phones: host on mobile data, joiners on Wi-Fi (the same test as 9r.8).

### 9s.7 Version and process

- Version: the next free number when built. Slice O3 (9r.8) is also planned as 2.19, so whichever ships first takes 2.19 and the other goes to the next number. Tell the user the number when asking to push.
- Before any commit: update all five MD files, add a DEVLOG entry, give the user a playable test build and checklist (`PROJECT.md` 12e and the draft in `claude/pubby-pregame-sync-plan.md` in the Pubby project), and wait for the user's test.

## 9t. Version 2.20: lobby keeps its scroll place, everyone has seen their cards before play, and Next round waits for everyone ready (BUILT and PUSHED as 2.20.0, 2026-11-13; spec `PROJECT.md` 12f)

Three fixes from the user's phone test of 2.19 and the follow-up check (2026-11-13, 17:06, 17:10 and 17:24). Written so Haiku can build them step by step. Build Part A first (tiny, safe), then Part B, then Part C (it uses the flag from Part B). One version for all three: **2.20.0**. Nothing here may be built until the user approves (CLAUDE.md rules 1 and 2).

### 9t.0 Read first

1. `CLAUDE.md`, `PROJECT.md` 12e and 12f, `TODO.md` Phase 4e, the latest `DEVLOG.md` entry.
2. Part A: `src/ui/netlobby.ts` `draw()` (about line 302).
3. Part B: `src/session/session.ts` (`case 'swap'` ~line 265, `decideLeaderStep` ~line 570, `case 'readyUp'` ~line 392 as the pattern to copy), `src/session/types.ts` (`Session`, `SessionSetup`, `SessionPhase`, `SessionAction`, events), `src/session/view.ts` (`canSwap`, `reactionTap`), `src/ui/roundstart.ts` (`netRoundStart` ~line 91, `waitStage`, `swapRevealStage` ~line 356), `src/net/netgame.ts` (`PHONE_ACTIONS` ~line 126), `src/ai/decide.ts` (~line 66, after `canSwap`), `src/ai/moves.ts` (`chooseReady` ~line 312 as the pattern), `src/ui/netlobby.ts` `startGame` (~line 629), `src/ui/solosetup.ts` (~line 258).

---

### Part A — the Multiplayer lobby jumps up when a host option changes

**What the user saw:** while setting up a Multiplayer game, changing a host option (joker rule, pause time limit) sends the screen back up.

**Cause (checked 2026-11-13 in headless Chromium, 390 × 500 phone size, read only):** every option change calls `setOption` → `draw()`, and `draw()` rebuilds the whole lobby with `root.replaceChildren(...)`. When the tapped element is replaced, the browser loses the page's scroll place. Measured: scrolled to 250 px, tap the joker toggle → 192 px. Focusing the toggle alone does not move the page; only the redraw does. Lobby changes from other phones (a join, a rename, a ready) redraw the same way and can jump too.

Not affected: "Play against the computer" setup keeps its place (measured 774 → 774). Only the Multiplayer lobby (`netlobby.ts`) has its own `draw()`.

**Fix (tested on a throwaway copy on 2026-11-13: 250 → 250 after the joker toggle and after the pause select; the change was then undone):** in `draw()` in `src/ui/netlobby.ts`, keep the window's scroll place across the rebuild:

```ts
function draw(): void {
  if (!root) return;
  if (nameBox && document.activeElement === nameBox) { drawLater = true; return; }
  drawLater = false;
  // 2.20: keep the scroll place; a rebuild under the finger sent the page up.
  const y = window.scrollY;
  root.replaceChildren(...body().filter((x): x is HTMLElement => x !== null));
  if (window.scrollY !== y) window.scrollTo(0, y);
}
```

Do not change anything else in Part A. If a step changes (for example from the lobby to "All set"), the page may be shorter; `scrollTo` simply stops at the bottom, which is fine.

**Check for Part A:** add to `testbed/lobby_check.py`, after the "pause limit reaches every phone" check: set the host page viewport to 390 × 500, `window.scrollTo(0, document.body.scrollHeight)`, read `scrollY`, then `label.toggle` → `scroll_into_view_if_needed()` → read `scrollY` again (y0) → `click()` → wait 400 ms → `check('changing a host option keeps the scroll place', abs(scrollY - y0) <= 2, ...)`. Do the same for the pause `select` (`select_option`). Put the joker setting back afterwards so later checks are unchanged, and the viewport back to 390 × 844.

---

### Part B — a phone is still on its new-hand screen while play starts

**What the user saw (2026-11-13, 2.19 test, two phones, both swapped):** the host was in the game while the other phone was still on the "Done" screen (its new hand after the hidden swap). The user expected 2.19 to stop this.

**Why 2.19 didn't fix it:** 2.19 (9s, Option A) only gates the **lobby**, before the game is created. The hidden swap happens **inside** each round, later:

1. In a 2- or 3-player round, the phase goes `reshuffle` → `swap` (`afterReshuffleWindow`).
2. Each phone swaps or keeps (`{type:'swap'}`), and then shows its new hand with a **Done** button (`swapRevealStage`). That screen and its Done are **local to the phone** (module variable `swapReveal` in `roundstart.ts`). Done sends nothing.
3. When the **last** player's swap arrives, `case 'swap'` in `session.ts` calls `decideLeaderStep` at once, so the phase becomes `playing` (or `reactionTap` / `chooseLeader`) on the host straight away.
4. The host taps its own Done and is in play. Another phone is still on its new-hand screen. The leader can even play the first card before the others have seen their cards.

This happens every round with a swap (2 and 3 players), not only the first. With 4 to 8 players there is no swap and no new-hand screen, so there is nothing to wait for (players see their hand during the reshuffle window, and the host's Start begins the round).

The same gap exists in "Play against the computer" (one person, computer players): a computer leader can start while the person is still on Done.

**Fix: a shared "cards seen" step in the session, after the swap.** The host's rules engine waits until every player has pressed Done.

#### B1. Session types (`src/session/types.ts`)

- `SessionSetup`: add `readonly waitForAll?: boolean;` with the comment: "2.20: wait for every player (after the hidden swap until all have pressed Done on their new hand, Part B; and on the results screen until all are ready, Part C). On for network games and games against the computer. Off for one-phone pass-and-play, where the phone is passed anyway."
- `Session`: add `readonly waitForAll: boolean;` and `readonly handSeen: readonly PlayerId[];`.
- `SessionPhase`: add `| 'cardCheck' // 2.20: after the swap, until every player has seen their new hand`.
- `SessionAction`: add `| { type: 'seenHand'; by: PlayerId }`.
- `SessionEvent`: add `| { type: 'handSeen'; player: PlayerId }` (copy the shape of `playerReady`).

#### B2. Session rules (`src/session/session.ts`)

- `createSession`: `waitForAll: setup.waitForAll ?? false`, `handSeen: []` in `base`.
- Every place that starts a new round and resets `swapDone: []` (search `swapDone: []`, lines ~129, ~166, ~566) also resets `handSeen: []`.
- `case 'swap'`: replace
  `if (s2.order.every((p) => s2.swapDone.includes(p))) return decideLeaderStep(s2, out);`
  with
  ```ts
  if (s2.order.every((p) => s2.swapDone.includes(p))) {
    if (s2.waitForAll) return { ...s2, phase: 'cardCheck', handSeen: [] };
    return decideLeaderStep(s2, out);
  }
  ```
- New `case 'seenHand'` (next to `'swap'`):
  ```ts
  case 'seenHand': {
    assertPhase(s, 'cardCheck');
    if (s.handSeen.includes(a.by)) return s;          // a repeat is harmless
    out.emit(s, { type: 'handSeen', player: a.by });
    const s2: Session = { ...s, handSeen: [...s.handSeen, a.by] };
    if (s2.order.every((p) => s2.handSeen.includes(p))) return decideLeaderStep(s2, out);
    return s2;
  }
  ```
  Call `assertPlayer(s, a.by)` first if the other per-player cases do (see `assertPlayer`, ~line 68).
- Add `'cardCheck'` to `ROUND_PHASES` (line ~49) after `'swap'`. Do the same in `src/ui/between.ts` (`ROUND_PHASES`, line ~481).
- Old saved games (made before 2.20) have no `waitForAll`/`handSeen`. Wherever a saved session is loaded (search `storage.ts` and `saved-games` tests for how other new fields were defaulted), treat missing `waitForAll` as `false` and missing `handSeen` as `[]`. With `waitForAll` false the phase `cardCheck` is never entered and Next round is not held, so old games behave as before.
- The log/event text: wherever events are turned into words (search `playerReady` in `src/ui` and `src/session`), add `handSeen` → nothing shown (return null / skip), so the log is not filled with "X has seen their cards". Follow what `playerReady` does.

#### B3. Player view (`src/session/view.ts`)

- Add `readonly cardCheck: { readonly seen: readonly PlayerId[] } | null;` to the view type.
- Fill it: `cardCheck: s.phase === 'cardCheck' ? { seen: s.handSeen } : null`.
- `handSeen` contains no secret, so `redactSession` (`netgame.ts`) needs no change.

#### B4. Network moves (`src/net/netgame.ts`)

- Add `'seenHand'` to `PHONE_ACTIONS`.
- Bump `LOBBY_PROTOCOL` in `src/net/lobby.ts` from 5 to 6 (a 2.19 phone must not join a 2.20 host). Update the comment: "6: cards seen after the swap (2.20)."

#### B5. Turn it on (`waitForAll: true`)

- `src/ui/netlobby.ts` `startGame`: `createSession({ ..., waitForAll: true }, ...)`.
- `src/ui/solosetup.ts` (~line 258, games against the computer): `waitForAll: true`.
- `src/ui/app.ts` (~line 535, one-phone pass-and-play): leave it off (no change). The phone is passed between players there, so nobody is ahead.

#### B6. Screens (`src/ui/roundstart.ts`, `netRoundStart` — used by network games and games against the computer)

Current code (top of `netRoundStart`):
```ts
if (swapReveal && swapReveal.player === me) {
  return s.swapDone.includes(me) || s.phase !== 'swap' ? swapRevealStage(g) : waitStage(g, me, 'swap', [me]);
}
```
New behaviour, in this order:

1. `s.phase === 'cardCheck'`:
   - If `me` is **not** in `s.handSeen`: show the new-hand screen. If `swapReveal` is set for `me`, use `swapRevealStage(g)` as now (new cards marked). If it is not set (the app was reopened or the phone rejoined and the local memory is gone), show the same screen without marks: title "Your hand", the hand, and Done. Add a small helper for that rather than copying the whole stage.
   - If `me` **is** in `s.handSeen`: `waitStage(g, me, 'cards', notSeen)` where `notSeen = s.order.filter((p) => !s.handSeen.includes(p))`.
2. `swapReveal` set for `me` and the phase is still `swap` and `me` has not been applied yet: `waitStage(g, me, 'swap', [me])` as now.
3. `swapReveal` set for `me` and the phase is past `cardCheck` (`reactionTap`, `chooseLeader`, `playing`): this only happens in games with `waitForAll` off. Keep today's behaviour (`swapRevealStage`).

Done on the new-hand screen when `waitForAll` is on (`swapRevealStage`'s `done`, the `ownSeat(g)` branch): clear `swapReveal`, then `send([{ type: 'seenHand', by: me }])`. A joining phone's `send` goes to the host as today. If `send` fails, keep the screen (do not clear `swapReveal`).

`waitStage`: add `'cards'` to the `what` type. Icon `'hand'`, title `'New hands'`, and the line `Waiting for X` (it already prints `Waiting for ${who}`). Join two names with " and " and three or more with ", … and …", the same as `waitingText` in `src/net/lobby.ts` (export a small `joinNames(names)` helper from `lobby.ts` or a UI util and use it in both, so the wording matches the lobby).

The pass-and-play `roundStartScreen` (one phone, phone passed) is unchanged: `waitForAll` is off there.

The phase label in `src/ui/app.ts` (~line 174, `case 'swap': return 'Hidden decks';`): add `case 'cardCheck': return 'Hidden decks';` so the top bar does not go blank. In `src/ui/game.ts` (~line 675, the `switch` on `s.phase`), add `case 'cardCheck':` next to `case 'swap':`.

#### B7. Computer players (`src/ai/decide.ts`, `src/ai/moves.ts`)

- `moves.ts`: add `chooseSeenHand(seen)` next to `chooseReady`: returns `{ type: 'seenHand', by: seen.me }` when `seen.view.cardCheck` is set and `seen.me` is not in `seen.view.cardCheck.seen`; otherwise null.
- `decide.ts`: right after the `canSwap` line: `if (v.cardCheck && !v.cardCheck.seen.includes(me)) return one(chooseSeenHand(seen), 'easy');`
- `src/ui/bots.ts`: no change expected, because it runs whatever `decide` returns. Check that a computer player does act in the new phase in the arena (B9).

#### B8. Rules text

The user said no quick-rules line for the lobby wait (12e). Ask the user before adding anything to `src/content/quick-rules.md` for this step (`PROJECT.md` 12f, open question 2). Default: no change.

#### B9. Tests

Unit (`tests/session/`, new file `card-check.test.ts`; use `tests/session/helpers.ts` to make a 2- and 3-player session and get to the swap):
1. `waitForAll` off: after the last swap the phase is not `cardCheck` (same as 2.19).
2. `waitForAll` on: after the last swap the phase is `cardCheck`; `handSeen` empty; nobody can `playCard`.
3. `seenHand` from one player: still `cardCheck`, `handSeen` has that player, event `handSeen` emitted.
4. A repeat `seenHand` changes nothing.
5. The last `seenHand` moves on exactly as `decideLeaderStep` would (leader chosen, or `reactionTap`, or `chooseLeader` in round 2+).
6. `seenHand` in any other phase fails.
7. Next round: `handSeen` is `[]` again.
8. View: `cardCheck` is `{seen: [...]}` in the phase and null otherwise.
9. `phoneActions([{type:'seenHand', by:'p2'}], 'p2')` is accepted; with `by:'p1'` from p2 it is refused (`tests/net/netgame.test.ts`).
10. An old saved session without `waitForAll`/`handSeen` loads and plays a round with a swap as before.
11. AI: in `cardCheck`, `decide` returns `seenHand` for a player who has not seen; null after.

Existing unit tests that list every phase or every action type may need the new entries; fix them, do not weaken them.

Browser:
- `testbed/bot.js`: the bot already presses the reveal `Done` (line ~49). Check it still does in the new phase and that it also copes with the wait screen (it should simply do nothing there).
- `testbed/netgame_check.py`: in the 2- and 3-player runs with `'swap': True`, add a check: give one joining phone a delay before its bot presses Done (for example a `window.pubbyBotHold = true` flag the bot respects for the reveal Done, cleared after 3 s), and check that while it is held **no phone's session is in `playing`** (`window.pubbyNet.session().phase`), that the host shows "Waiting for <name>", and that play starts on every phone after it is released.
- `testbed/solo_check.py`: a 2-player game against the computer reaches play after the person presses Done, and the computer player does not lead before that.
- Arena (`testbed/ai_arena.ts`): run a short arena (e.g. 50 games at 2 and 3 players) to check computer-only games still finish. Turn `waitForAll` on there to match games against the computer.
- Must still pass: unit tests (293 + new), `tsc`, `lobby_check.py` (67 + Part A checks), `netgame_check.py` (94 + new), `netvotes_check.py`, `online_check.py` (37), `solo_check.py`, `playthrough.py`.

Running here: `node_modules` must exist for the relay tests and the build. In the Claude cloud workspace, link the shared packages: `ln -s /opt/npm-tools/node_modules node_modules` (it is gitignored; also add `node_modules` to `.git/info/exclude` because a symlink is not matched by `node_modules/`).

#### B10. Edge cases

- A phone loses its link during `cardCheck`: the game waits, as it does today during the swap. Nothing new. (Rejoining is slice O3 / Nearby slice 4.)
- Pause during `cardCheck`: nothing to add. `applyAction` already refuses every move except the pause controls while paused (`session.ts` ~line 200).
- A vote called during `cardCheck`: the reshuffle vote is refused outside `reshuffle` (`callVote` ~line 448). Check the target and Ultimate vote checks (~line 511 and nearby) also refuse `cardCheck`, and add a unit test.
- Take-cards requests: only in `playing`; not affected.

---

### Part C — Next round waits until everyone is ready (user 2026-11-13 17:24: "Yes")

**What happens today:** on the results screen each phone can tap "I'm ready" (`readyUp`, shown as name chips with a tick). The host's **Next round** (and **Start the Ultimate Round**, the same `advance` action) works whether anyone is ready or not, so a phone still looking at the podium is pulled into the next deal. The old rule was "the host still decides when to move on" (`PROJECT.md` section 6, Ready up). The user changed it on 2026-11-13: in Multiplayer and against the computer, the host waits.

**Scope:** games with `waitForAll` on (Multiplayer, against the computer). One-phone pass-and-play is unchanged: ready stays a signal there.

#### C1. Session (`src/session/session.ts`, `case 'advance'` ~line 397)

After the existing checks add:
```ts
if (s.waitForAll && !s.order.every((p) => s.ready.includes(p))) {
  fail(`Waiting for ${joinNames(s.order.filter((p) => !s.ready.includes(p)).map((p) => nameOf(s, p)))}`);
}
```
Use the same `joinNames` helper as B6. If `src/net/lobby.ts` should not be imported from the session layer, put `joinNames` in a small shared file such as `src/session/names.ts` and import it from `lobby.ts`, the session and the UI.

`endSession` (End the game) is **not** held: the host can still end the game at any time.

`ready` is already reset to `[]` when a round ends (`session.ts` ~line 681), so nothing else is needed for the next round.

#### C2. View

The view already has each player's `ready` (`chooseReady` in `moves.ts` reads `me.ready`). Nothing to add.

#### C3. Screens (`src/ui/netscreens.ts`, `results()` ~line 130)

- The host's **Next round** / **Start the Ultimate Round** button: `disabled` while anyone **other than the host** is not ready, and its text becomes `Waiting for Ben and Fay` (same `joinNames`). When everyone else is ready it shows the normal text.
- The host is a player too and must be ready. When the host taps Next round and has not readied, send both in one batch: `send([{ type: 'readyUp', by: hostId }, { type: 'advance', by: hostId }])`. One tap for the host, as today.
- Every other phone: under the ready chips, show `Waiting for X` while anyone is not ready (next to the `n of m ready` line).
- One-phone `resultsStage` in `between.ts`: unchanged.

#### C4. Computer players

`chooseReady` already readies a computer player on the results screen (`decide.ts`). Check in the arena and `solo_check.py` that a game against the computer still moves on. If a computer player has not readied yet when the person looks, the button is briefly off with "Waiting for <computer name>"; that is fine.

#### C5. Tests

Unit (new `tests/session/ready-gate.test.ts`):
1. `waitForAll` off: `advance` works with nobody ready (as today).
2. `waitForAll` on: `advance` fails with "Waiting for Ben" when Ben is not ready; works when all are ready.
3. Only the host missing: `readyUp` by the host then `advance` in one batch works.
4. `endSession` works with nobody ready.
5. After the next round's results, `ready` is empty again.
6. AI: on results, `decide` returns `readyUp`.

Browser: in `netgame_check.py`, on the results screen, hold one joining phone's bot from tapping "I'm ready" (same hold flag as B9), check the host's Next round is disabled and says "Waiting for <name>", release, check the next round starts. `testbed/bot.js` must tap "I'm ready" on results; check it does and add it if missing. `solo_check.py`: results → Next round still moves on.

#### C6. Quick rules

The user said no quick-rules lines for these waits (12f). Search `src/content/quick-rules.md` for "ready": if a sentence says the host moves on without waiting, ask the user before changing it.

### 9t.1 Version and process

- Version **2.20.0** (`package.json`). Tell the user the number when asking to push.
- Before any commit: update all five MD files, add a DEVLOG entry, run every check in Part A, B9 and C5, then ask the user to push to GitHub Pages as the test build (CLAUDE.md rule 5, and the user's habit: "Push it"). Test checklist: `PROJECT.md` 12f.

## 9u. Versions 2.24 to 2.26: classic cards, see-through reactions, staying connected when you leave the screen, computer players in Multiplayer (PLAN, user 2026-11-13 19:07; written for any model, Haiku included; BUILT as 2.24.0, 2.25.0, 2.26.0 on 2026-11-13, not yet pushed; spec `PROJECT.md` 12g; mockups https://claude.ai/artifact/Vi55KTC1TtVWwiktGXVqnM and https://claude.ai/artifact/1EPeaQaijP1bwD1oPQjoyC (table))

Four changes from the user's Multiplayer test of 2.23. Nothing here may be built until the user approves (CLAUDE.md rules 1 and 2). Build and push them as **three versions**, each with its own phone test, in this order:

| Version | Parts | Why this order |
|---|---|---|
| 2.24.0 | B (see-through reactions), D (classic cards, fanned hand), E (table: edge fans, thrown pile, waste pile in the corner) | Screen-only, no network risk |
| 2.25.0 | A (stay connected when a phone leaves the screen) | Needs a server deploy as well as the app |
| 2.26.0 | C (computer players in Multiplayer, was slice F of 9m) | Uses the "away" seats from Part A |

Rules for every part:
- Change only the files named. If a named function is not where this guide says, search for its name; never rewrite a whole file.
- After each numbered step run `npm run check`. After each part run `npm test` and `python3 testbed/run_checks.py --since origin/main`.
- Exact on-screen text is in quotes. Use it word for word. No emoji in new UI (user rule, 2.0).

### 9u.0 Read first

1. `CLAUDE.md`, `PROJECT.md` 12g, `TODO.md` Phase 4f, the latest `DEVLOG.md` entry.
2. Part B: `src/ui/styles.css` "Reactions drawer" block (~line 476), `src/ui/game.ts` drawer code (~line 1042), `testbed/drawer_check.py`.
3. Part D: `src/ui/cards.ts` (`cardFace`), `src/ui/game.ts` `handBlock` (~line 819), `src/ui/styles.css` `.card` (~line 246), `.small-card` (~387), `.tiny-card` (~790), `.card.dim/.selected` (~399).
4. Part A: `src/net/online.ts` (`RoomSocket`, `HostRoom`, `joinSocket`), `src/net/relayproto.ts`, `server/src/core/room.ts` (`connect`, `closed`, `listEntry`), `src/ui/netlobby.ts` (`startHostRoom`, `addOnlineLink`, `addLink`, `linkLost`, `wireJoin`, `joinGot`, `startPings`, `hostSeatRow`, `waitingText` use), `src/net/lobby.ts` (`LobbySeat`, messages, `readToJoiner`), `tests/server/room.test.ts`.
5. Part C: `CODE.md` 9m slice F (the old outline, replaced by Part C here), `src/ui/bots.ts`, `src/ui/solosetup.ts` (level chips, speed, reactions, names), `src/ai/names.ts` (`pickNames`, `botNamesProblem`), `src/ai/persona.ts` (`randomPersona`), `src/net/lobby.ts` (`sessionPlayers`), `src/ui/netplay.ts` (`hostStart`, reaction relay ~line 160), `src/ui/storage.ts` (`BotsInfo`).

---

### Part B — see-through reactions sheet (2.24)

**User:** "Make the reactions tab transparent, so can still see the gameplay in the back."

B1. In `src/ui/styles.css`, `.reactions-sheet`: change
- `background: rgba(20, 30, 20, 0.96);` → `background: rgba(20, 30, 20, 0.28);`
- `border: 2px solid var(--gold);` → `border: 1px solid rgba(242, 193, 78, 0.55);`
- `box-shadow: ...` → `box-shadow: none;`
- `max-height: 55vh;` → `max-height: 42vh;` (more of the table stays in view).

B2. `.phrase-chip`: `background: var(--ink);` → `background: rgba(29, 29, 27, 0.55);` and add `text-shadow: 0 1px 2px #000;` so the gold text still reads over cards.

B3. Do not add `backdrop-filter` (blurs the game, slow on older Android). Do not change the toggle button.

B4. Check: in `testbed/drawer_check.py`, after the sheet opens, read `getComputedStyle(sheet).backgroundColor` and check the alpha is `<= 0.35` ("reactions sheet is see-through").

---

### Part D — classic card faces and a fanned hand (2.24)

**User:** "see attached screenshot, can you make the cards like that instead?" (a classic Hearts app: cream cards, big rank and suit in the top-left corner, a large suit shape in the bottom-right corner, overlapping hand in an arc). The look is copied, **not** the other app's artwork: court cards (J, Q, K) get Pubby's own simple design below. The mockup shows the result.

#### D1. Suit shapes (no font symbols)

Font suits (♥ ♠) turn into emoji on some phones. Draw them as SVG. In `src/ui/cards.ts` add:

```ts
const SUIT_PATH: Record<Suit, string> = {
  hearts: '<path d="M50 92C22 68 2 50 2 29 2 13 14 2 28 2c10 0 18 6 22 14C54 8 62 2 72 2c14 0 26 11 26 27 0 21-20 39-48 63z"/>',
  diamonds: '<path d="M50 2 90 50 50 98 10 50z"/>',
  spades: '<path d="M50 2C62 22 98 38 98 63c0 14-11 24-24 24-9 0-16-4-20-10 1 9 5 16 12 21H34c7-5 11-12 12-21-4 6-11 10-20 10C13 87 2 77 2 63 2 38 38 22 50 2z"/>',
  clubs: '<circle cx="50" cy="26" r="22"/><circle cx="25" cy="58" r="22"/><circle cx="75" cy="58" r="22"/><path d="M46 56c0 20-5 32-14 42h36c-9-10-14-22-14-42z"/>',
};
const CROWN_PATH: Record<'J' | 'Q' | 'K', string> = {
  K: '<path d="M4 46 10 10 30 30 50 4 70 30 90 10 96 46z"/>',
  Q: '<path d="M6 46 14 18a6 6 0 1 1 6 0l12 16 12-26a6 6 0 1 1 6 0l12 26 12-16a6 6 0 1 1 6 0l8 28z"/>',
  J: '<path d="M10 46 18 16h64l8 30zM30 16 50 4l20 12z"/>',
};
const STAR_PATH = '<path d="M50 4 62 38 98 38 69 60 80 95 50 74 20 95 31 60 2 38 38 38z"/>';

/** An SVG element from fixed path text (our own constants only, never user text). */
function shape(paths: string, cls: string, viewBox = '0 0 100 100'): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="${cls}" viewBox="${viewBox}" fill="currentColor" aria-hidden="true">${paths}</svg>`;
  return t.content.firstElementChild as SVGSVGElement;
}
export function suitShape(suit: Suit, cls = ''): SVGSVGElement { return shape(SUIT_PATH[suit], cls); }
```

Check `h()` in `src/ui/dom.ts` accepts an `SVGSVGElement` as a child; if its child type is `HTMLElement` only, widen it to `Element`.

#### D2. New `cardFace`

Keep the signature and the `aria-label`s. New markup:

- Standard card: `div.card[.red]` containing
  - `div.idx` with `span.r` (rank; add class `ten` when the rank is 10) and `suitShape(suit)`;
  - ranks 11 to 13: `div.court` with `shape(CROWN_PATH[r], 'crown', '0 0 100 50')`, `span.big-letter` (the letter), `suitShape(suit, 'crest')`;
  - every other rank (2 to 10 and Ace): `suitShape(suit, 'pip-big')`.
- Joker: `div.card.joker` with `div.idx > span.r` "JOKER" and `shape(STAR_PATH, 'jstar')`.

Callers that read `.rank` / `.suit` classes (search `querySelector('.rank` and `.suit` in `src/ui/` and `testbed/`) must be updated to `.idx .r`. `testbed/bot.js` reads cards by `aria-label` (check; if it reads `.rank`, update it).

`.card.tiny-card` (seat badges, last trick row): keep it tiny. In CSS hide `.pip-big`, `.court` and `.jstar` inside `.tiny-card` and keep only the index.

#### D3. CSS

Replace the `.card` rules at ~line 246 to ~259 (keep `.hand.fresh` and `deal-in`) with:

```css
/* ===== 2.24 card faces (CODE.md 9u Part D) ===== */
.card {
  position: relative; overflow: hidden;
  aspect-ratio: 5 / 7;
  border-radius: 7%/5%;
  background: #fbf8f1;
  color: var(--ink);
  border: 1px solid rgba(0, 0, 0, 0.18);
  box-shadow: -2px 2px 6px rgba(0, 0, 0, 0.35);
  container-type: inline-size;
  font-family: Georgia, 'Times New Roman', serif;
}
.card.red { color: #d0312d; }
.card .idx { position: absolute; left: 3%; top: 3%; width: 30%; display: flex; flex-direction: column; align-items: center; line-height: 1; z-index: 2; }
.card .idx .r { font-size: 34cqw; font-weight: 700; letter-spacing: -0.04em; }
.card .idx .r.ten { font-size: 29cqw; letter-spacing: -0.09em; }
.card .idx svg { width: 22cqw; height: 22cqw; margin-top: 2cqw; }
.card .pip-big { position: absolute; width: 74%; right: -14%; bottom: -10%; opacity: 1; }
.card .court {
  position: absolute; left: 34%; top: 6%; right: 6%; bottom: 6%;
  border: 2px solid currentColor; border-radius: 4cqw;
  background: linear-gradient(170deg, #fff5d8, #f4dfa6);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2cqw;
}
.card .court .crown { width: 46cqw; height: 26cqw; }
.card .court .big-letter { font-size: 44cqw; font-weight: 700; line-height: 0.9; }
.card .court .crest { width: 20cqw; height: 20cqw; }
.card.joker { background: linear-gradient(160deg, #fffaf0, #f6e3ad); color: #6a3fa0; }
.card.joker .idx .r { font-size: 15cqw; writing-mode: vertical-rl; text-orientation: upright; letter-spacing: -0.1em; }
.card.joker .jstar { position: absolute; width: 62%; right: 6%; bottom: 8%; }
```

Notes: `container-type: inline-size` makes `cqw` units follow the card's own width, so the same face works at every size (hand, trick, swap). Remove the old `.card .rank` / `.card .suit` / `.small-card .rank/.suit` font sizes. `.card.small-card` keeps its width.

#### D4. Fanned hand

In `handBlock` (`src/ui/game.ts`), the hand `div` gets class `hand fan` and each card gets its place from a new pure helper in `src/ui/cards.ts` (pure so it can be unit-tested):

```ts
export interface FanSpot { x: number; y: number; rot: number; z: number }
/** Places n cards in one fanned row, or two rows when there are more than 16. */
export function fanLayout(n: number, width: number): { cardW: number; height: number; spots: FanSpot[] } {
  const cardW = Math.min(96, Math.max(64, width * 0.19));
  const cardH = cardW * 1.4;
  const rows = n > 16 ? [Math.ceil(n / 2), n - Math.ceil(n / 2)] : [n];
  const spots: FanSpot[] = [];
  rows.forEach((m, ri) => {
    const usable = width - cardW * 0.5;
    const step = m > 1 ? Math.min(cardW * 0.62, (usable - cardW) / (m - 1)) : 0;
    const x0 = (width - (cardW + step * (m - 1))) / 2;
    const ang = Math.min(3, 30 / Math.max(1, m));
    const mid = (m - 1) / 2;
    for (let i = 0; i < m; i++) {
      const d = i - mid;
      spots.push({ x: x0 + i * step, y: ri * cardH * 0.55 + d * d * 0.9, rot: d * ang, z: spots.length + 1 });
    }
  });
  return { cardW, height: cardH + (rows.length > 1 ? cardH * 0.55 : 0) + 30, spots };
}
```

- Width: `Math.min(window.innerWidth, 520) - 12` (the app's max width is 520; check `styles.css` for the real value and use it). No layout reads.
- Set on the hand div: `--card-w` and `--fan-h` (px). On each card: `--x`, `--y`, `--rot` (px, px, deg) and `style.zIndex = z`. Keep `--i` for the deal-in animation.
- Cards stay sorted as today (`sortHand`), left to right, later cards on top, as in the screenshot.
- Redraw on `resize` is not needed (phones don't resize mid-game; rotation is locked by the PWA manifest; check `manifest.webmanifest` `orientation`; if not portrait, add a `resize` listener that calls the game's existing redraw).
- `.hand.fresh .card` animation: the `deal-in` keyframe uses `transform`, which would fight the fan's transform. Change `deal-in` to animate only `opacity` and add `translate: 0 14px` → `translate: 0 0` (the separate `translate` property does not clash with `transform`).
- Every `handBlock` caller (play, swap, new-hand screens) gets the fan; the swap screen's raised cards use `.selected`, so they lift the same way.
- `.dim` in a fan must not be see-through (overlapped cards would show through): `.hand.fan .card.dim { opacity: 1; filter: brightness(0.55) saturate(0.6); }` (already in D3).
- Tap targets: the visible strip of each card is at least `step` wide (about 22 px at 22 cards on a 360 px phone). If `step < 20` in `fanLayout`, that is a bug: add a unit test that 26 cards on 320 px give `step >= 20` (the two-row split makes this hold).

#### D5. Checks

- Unit (new `tests/ui/fan.test.ts`, or next to the other ui tests if that folder doesn't exist): 1 card centred; 14 cards fit inside the width (first `x >= 0`, last `x + cardW <= width`); 17 cards make two rows; 26 cards on 320 px: every step ≥ 20; z rises left to right.
- Browser: `solo_check.py` and `playthrough.py` must still play to the end (they tap cards by `aria-label`). Take a phone-size screenshot of the hand in `solo_check.py` and save it to `testbed/out/hand.png` for the DEVLOG.
- **Phone checklist (2.24):** cards look like the mockup; tapping a card in the middle of the fan picks that card (not its neighbour); the lifted card is clearly raised; cards you can't play are darker; a 2-player game (big hands) shows two rows and every card can be tapped; the trick cards on the table and the swap screen use the new faces; reactions sheet shows the table through it.

---

### Part A — stay connected when a phone leaves the screen (2.25)

**User:** "as soon as the screen is left, it times out, so can never share a code through messages as it doesn't have the room anymore."

**Causes (read 2026-11-13 at 2.23):**
1. Online, host: when the host opens Messages, the phone closes or freezes the room socket. `HostRoom` `onLost` → `startHostRoom` sends the host to `room-lost` at once. The server would wait 2 minutes (`hostGraceMs`) for the same host token, but the app never reconnects.
2. Online, server: while the host's socket is gone the room is taken off the room list (`{ list: null }` in `RoomCore.closed`), so friends who got the invite can't find it.
3. Online, any phone coming back: `RoomSocket` judges silence from `heard`, which is stale after the phone slept. The timer that fires first on return can call it lost before the fresh pong arrives.
4. Online, a joining phone that leaves the screen: its socket closes, the host gets `left` and `linkLost` removes the seat at once. The server would let it back in with the same join token, but the app never tries.
5. Nearby: pings stop while a phone is in the background; after 20 s (`LOST_AFTER_MS` in `netlobby.ts`) the seat is gone.

**Rule (PROJECT.md 12g):** a phone that leaves the screen is **away**, not gone. Its seat is kept for **10 minutes** in the lobby and in the game. Everyone sees "Away" on that seat with the time left. The host can still remove it. Start stays off while someone is away ("Waiting for Sam", the 2.19 rule). In a game, play simply waits when it is the away player's turn (no auto-play, no skip).

#### A1. `RoomSocket`: don't judge silence after sleeping (`src/net/online.ts`)

- Add `private hiddenAt: number | null = null;`. In `onVisible`: when `document.visibilityState === 'hidden'`, set `hiddenAt = Date.now()` and return. When visible again: set `this.heard = Date.now()` first (the gap was sleep, not silence), then the existing ping and 5 s check.
- In `beat()`: if `document.visibilityState === 'hidden'`, return without judging.
- If on return `ws.readyState` is `CLOSING` or `CLOSED`, call `this.lost('lost')` at once (the reconnect in A2/A3 handles it).

#### A2. Host reconnects with the same token (`HostRoom`)

- `HostRoom` keeps `roomId` and `hostToken`. On socket lost (not `close()` on purpose): do **not** clear `links`; set each link `isOpen = false` but don't call their `onClose`; call a new callback `onAway()`; then reconnect: new `RoomSocket` with the same URL, tries at 0 s (or as soon as the page is visible again), 2 s, 5 s, 10 s, then every 15 s.
- Give up and call the old `onLost` only when: the server refuses the socket with close code 4003 (room gone), or 10 minutes have passed since the first loss.
- New callback `onBack()` when the new socket gets `ready`.
- When the server sends `joined` for a link id already in `links`, reuse that `OnlineLink` (the code already does) and set `isOpen = true`.

In `netlobby.ts` `startHostRoom`:
- `hr.onAway = () => { hostAway = true; draw(); }` → the lobby stays on screen with a banner at the top: "Reconnecting… your room is kept". Buttons that send (Start, Add, options) are off while `hostAway`.
- `hr.onBack = () => { hostAway = false; broadcast(); draw(); netChanged(); }` (`broadcast` sends the lobby to every phone again; in a game, also send every phone a full game: call `hostSync` for each player, the same as when a phone asks for `sync`).
- `hr.onLost` unchanged (room-lost screen), but now it only fires after A2's give-up.
- `addOnlineLink`: if the link id already has a **seated** seat in the lobby, this is that phone coming back: set `connected`/away off (A5), do not call `addLink` (which would wait for a new hello and drop it after 10 s), send it the lobby (and in a game, a full game update). Otherwise as today.

#### A3. Joining phone reconnects with its join token (`joinSocket`)

- `joinRoomNow` keeps the join token (module variable `joinToken` in `netlobby.ts`); pass it to `joinSocket`.
- In `joinSocket`, on socket lost (and on `host-gone`): don't close the link; set `isOpen = false`, call a new `link.onAway?.()`; reconnect with the same token on the A2 timetable; on `ready` set `isOpen = true` and call `link.onOpen()`; give up (call `onClose`) after 10 minutes or on close code 4003.
- New frame `host-back` (A4): call `link.onBack?.()`.
- In `wireJoin`: `onAway` → banner "Reconnecting…" (own socket) or "The host stepped away. Waiting for them to come back." (`host-gone`); `onBack`/`onOpen` after an away → clear the banner, send `{ t: 'hello', ... }` again only if the host asks (it won't: A2 recognises the seat); in a game, send `{ t: 'sync' }` so the screen catches up.
- `joinGot` already handles `lobby`; make sure `readySent` is not sent twice.

#### A4. Server (`server/src/core/room.ts`, `src/net/relayproto.ts`)

1. `hostGraceMs`: 120 000 → **600 000** (10 minutes).
2. In `closed()` for the host socket: keep the room on the list. Replace `{ list: null }` with `{ list: this.listEntry() }` and add `away: true` to the list entry while `hostSocket === null` (add `away?: boolean` to `RoomInfo` in `relayproto.ts` and to `isRoom` in `online.ts`). The room list shows "Host away" under such a room; joining still works.
3. In `connect()` for the host token (a reconnect): after `ready`, also send `{ c: 'joined', link }` to the host for **every** link in `linkSockets`, and send `{ c: 'host-back' }` to every link socket. Add `| { c: 'host-back' }` to `JoinIn`.
4. In `connect()` for a join token while `hostSocket === null`: after `ready`, also send that socket `{ c: 'host-gone' }` so it waits (A3) instead of timing out on hello.
5. A joining phone that closes its socket: unchanged (`left` to the host); the host now treats `left` as away (A5).
6. Tests in `tests/server/room.test.ts`: host drops → room still listed with `away: true`; host back within 10 min → `joined` for each link + `host-back` to each; host back after 10 min → refused 4003 and room ended; join while host away → `ready` then `host-gone`; old `left`/`kicked` tests still pass.
7. Deploy: the server deploys from `.github/workflows/server.yml` on push. The app and server go out in the same push; the app must not break against the old server (it won't: unknown frames are ignored).

#### A5. Away seats in the lobby and the game (`src/net/lobby.ts`, `netlobby.ts`)

- `LobbySeat`: add `awaySince?: number` (host clock, ms). `readToJoiner` reads it (`typeof === 'number'`). `LOBBY_PROTOCOL` 6 → **7**.
- New pure helpers in `lobby.ts`: `setAway(lobby, id, at)` and `setBack(lobby, id)`; `waitingText` counts an away seat as not ready (so Start shows "Waiting for Sam").
- New messages: joining phone → host `{ t: 'away' }` and `{ t: 'back' }` (add to `ToHost` and `readToHost`); host → joining phones `{ t: 'hostAway' }` / `{ t: 'hostBack' }` (add to `ToJoiner` and `readToJoiner`). Sent from a `visibilitychange` listener in `netlobby.ts` (hidden → away, visible → back), best effort (the send may fail; that's fine).
- Host: `linkLost(id)` becomes "away": instead of removing the seat or marking it disconnected, call `setAway`, keep the link object if it is online (it may come back, A2), broadcast, draw. A 1-second check in `startPings` turns an away seat older than 10 minutes into today's `linkLost` behaviour (lobby: seat removed; game: `connected: false`, host can remove the player as before).
- Nearby pings: a seat marked away (by its `away` message) is not judged by `LOST_AFTER_MS`; only by the 10-minute limit. A Nearby phone whose WebRTC link really closed can't come back without a new QR (that is slice 4); it stays "Away" until the 10 minutes run out or the host removes it.
- Joining phone, Nearby: after `hostAway`, don't judge `hostHeard` for 10 minutes.
- Seat row text (`seatTags`): "Away 4:12" (minutes:seconds left, counting down). In the game, the seat at the table shows the same small tag (use the existing seat badge place in `table.ts`; search "lost" or `connected` there).

#### A6. Checks

- Unit: `tests/net/lobby.test.ts` (away/back messages parse; `waitingText` counts away seats; `setAway`/`setBack`); `tests/server/room.test.ts` (A4.6).
- Browser `testbed/online_check.py` (local relay): host page `page.evaluate` fires `visibilitychange` hidden (override `document.visibilityState` with `Object.defineProperty`) and closes its socket (test hook: add `pubbyLobby.dropSocket()` to `exposeTestHook`), wait 3 s, check the joining page shows "The host stepped away"; make the host visible again → both lobbies match and Start works. Same for a joining phone: drop → host shows "Away"; back → seat normal. A joiner joining while the host is away gets in once the host is back.
- `lobby_check.py` (Nearby): send `away` from a joining page, wait 25 s (more than the old 20 s), seat still there with "Away".
- **Phone checklist (2.25), two phones on different networks:** host makes a room, taps Share invite, sends it in Messages, comes back: the lobby is still there (maybe "Reconnecting…" for a second). Friend opens the link from Messages, finds the room, joins. Friend switches to another app for a minute: the host sees "Away" with a countdown; friend comes back: seat normal. Mid-game, each phone leaves for 30 s and comes back: the game carries on where it was.

---

### Part C — computer players in Multiplayer (2.26; replaces the 9m slice F outline)

**User:** "I want to add computer players into multiplayer too, but it should be an option, like I can remove them or add them and should have the same rules as single player, that is no cheating and 3 difficulty levels."

Works for Nearby and Online. The computer players run **on the host's phone only**, with the same brain (`decide`), the same one door to the game (`seenBy`, no hidden cards) and the same driver (`bots.ts`) as single player.

#### C1. Lobby model (`src/net/lobby.ts`)

- `LobbySeat`: add `bot?: { level: Level }` (import `Level` from `src/ai/persona.ts`). Bot seat ids are `"b1"`, `"b2"`… (never `host`, `cN` or `oN`). A bot seat is always `connected: true`, `ready: true`.
- `readToJoiner`: read `bot` when it's an object with `level` in `easy|normal|hard`.
- New pure helpers: `addBot(lobby, name, level)`, `setBotLevel(lobby, id, level)`, `removeSeat` (existing) works for bots.
- `lobbyProblems`: unchanged count rules (2 to 8 seats, bots included); add: "Add at least one other player" is not needed — host + 1 computer player is allowed (works like single player).
- `sessionPlayers`: players from bot seats get `computer: true`; their `linkIds` entry is `'bot'`.
- Names: `pickNames(1, takenNames, rng)` from `src/ai/names.ts`, taken = every seat's shown name. A person joining with a name a bot has: the bot gets a new name (`pickNames` again), the person keeps theirs.
- `LOBBY_PROTOCOL` 7 → **8**.

#### C2. Host screen (`netlobby.ts` `hostLobbyView`, `hostSeatRow`)

- Under the seat list, host only, not started, fewer than 8 seats: button "Add computer player". Tap: adds a Normal computer player at the end with a new name. No dialog.
- A bot's seat row: the computer icon (`icon('bot')`, as at the table), the name, a three-part level switch "Easy" / "Normal" / "Hard" (reuse the solo setup's `seg-btn` styles), and a remove button (`icon('close')`, `aria-label` "Remove <name>"). Removing a computer player doesn't ask first.
- Renaming: tapping the name opens the same small text box the host uses for their own game name; checked with `botNamesProblem` (no clash with any seat).
- Host options, shown only when at least one computer player is seated: "Computer speed" (Relaxed / Normal / Fast, default Normal) and "Reactions from the computer players" (on by default). Copy the controls from `solosetup.ts`. Keep them in `Lobby` (`botSpeed`, `botReactions`) so other phones see them in the settings summary.
- Seat order arrows work for bots like for people.
- Online: `hostRoom.update(seats, started)` counts bots as seats (so the room list shows how full the table is and the server refuses joins at 8).

Other phones: a bot seat shows the icon, name and a small level tag ("Hard"); no controls.

#### C3. Starting (`startGame` → `hostStart`)

- `hostStart(session, linkIds, hostId, bots?)`: `linkOf` skips `'bot'` links (as it skips `'host'`). Build `bots: BotsInfo = { seats: { [playerId]: { level, personality: randomPersona(level, rng).personality } }, speed, reactions }` with **no `me`** and put it on the `SavedGame` (`{ ..., net: {...}, bots }`). No bots → no `bots` field (today's behaviour).
- `waitingText` ignores bot seats (they are always ready).

#### C4. Driver on the host (`src/ui/bots.ts`)

- The driver already runs only where `runsSession(g)` is true (check `botsTick`; if it checks `g.bots.me`, change it to only need `g.bots`).
- Network rules apply as they are (open live votes, public take-cards, ready-up, cards seen after the swap): bots answer through `decide`, which already handles these phases in single player. Check each one with the browser check below.
- Reactions: where `bots.ts` calls `showReaction(id, r)` (~line 122), also pass it to the other phones when `g.net?.role === 'host'`: add `export function hostSendReaction(from: PlayerId, r: number)` in `netplay.ts` that sends `{ t: 'react', from, r }` to every link in `linkOf` (same as the host's own reaction), and call it there.
- "Thinking…": only on the host's phone (others see whose turn it is by the glowing seat). No new message.
- The host's screen gates the bots (`canMove`: pop-ups, animations, game screen). If the host is on the pause screen or away, bots wait. That's accepted (12g).
- Votes in a network game are live and open, so a bot's ballot shows on every phone as it is cast (this is the existing broadcast; no change).

#### C5. Fair play

- `redactSession` already blanks every hand but the phone's own, so bot hands never leave the host's phone; add a unit test in `tests/net/netgame.test.ts`: a session with a `computer: true` player, `redactSession(s, 'p2')` has only blank cards for the bot.
- `tests/ai/fairplay` must still pass unchanged.
- Game records: any game with a computer player is a vs-computer game (`vsComputer`), on every phone, as in single player.

#### C6. Checks

- Unit: `tests/net/lobby.test.ts`: `addBot`, `setBotLevel`, remove, names never clash, `sessionPlayers` marks `computer`, bot seats ignored by `waitingText`, protocol 8 round trip of a bot seat.
- Browser `netgame_check.py`: new game "2 phones + 2 computer players (Easy, Hard)" to the end of the game (one round is enough, per 9q.2), with `bot.js` playing the two people: the bots' ballots appear on both pages; a bot reaction appears on the joining page; nobody's hand is seen on the other page. `online_check.py`: 1 phone + 1 joining + 1 computer player plays one round.
- Arena: no change to `src/ai/` brains, so no arena run needed unless `bots.ts` changes `decide` calls.
- **Phone checklist (2.26):** host adds two computer players, sets one to Hard, renames one, removes and re-adds one; the friend's phone sees them with their levels; play a round: computer players play on both phones, their reactions show on both, their votes show live; past games on both phones say "vs computer".

---

### Part E — the table: players' fans at the edges, a thrown pile in the middle, waste pile in the corner (2.24, with Part D)

**User (2026-11-13 19:18 to 19:26, from the table mockup https://claude.ai/artifact/1EPeaQaijP1bwD1oPQjoyC):** other players should look like the screenshot (a fan of card backs at the edge); the waste pile moves to the side "so everyone can throw their played cards in the centre"; the trick cards "pulled on top of each other" with "randomness being thrown on the table", but every card underneath must still show at least its corner. No name on each trick card ("we should know who put it by the order").

Files: `src/ui/table.ts`, `src/ui/styles.css`, `src/ui/game.ts` (only where it calls `roundTable` / `wasteMiddle` and the end-of-trick target at ~line 605). Everything stays public information only (CLAUDE.md fair play: card backs and counts only).

#### E1. Felt fills the table area

- `.round-table` keeps its place in the game screen but loses the wooden oval: remove the `.table-oval` border and shadow, and give `.round-table` the felt background (`radial-gradient(120% 70% at 50% 40%, #2e7d32, #14421a 80%)`), `overflow: hidden`, `border-radius: 18px`. Height: `height: clamp(330px, 52vh, 460px)` (all player counts). Keep the led-suit mark in the middle (faint, behind the pile).
- Keep `data-seat`, `.seat-chip`, `.turn`, `.thinking`, `.out`, the place badge, Deals tag, host star and bot icon exactly as today: only the position and the card backs change.

#### E2. Where each other player sits (new pure helper in `table.ts`)

```ts
export type Edge = 'top' | 'left' | 'right';
/** Edge spots for the other players, clockwise from your left (k = 1 … n-1). t is 0..1 along that edge (top: left→right; sides: top→bottom). */
const EDGE_SPOTS: Record<number, [Edge, number][]> = {
  2: [['top', 0.5]],
  3: [['top', 0.28], ['top', 0.72]],
  4: [['left', 0.4], ['top', 0.5], ['right', 0.4]],
  5: [['left', 0.4], ['top', 0.28], ['top', 0.72], ['right', 0.4]],
  6: [['left', 0.45], ['top', 0.2], ['top', 0.5], ['top', 0.8], ['right', 0.45]],
  7: [['left', 0.7], ['left', 0.22], ['top', 0.3], ['top', 0.7], ['right', 0.22], ['right', 0.7]],
  8: [['left', 0.75], ['left', 0.2], ['top', 0.18], ['top', 0.5], ['top', 0.82], ['right', 0.2], ['right', 0.75]],
};
export function edgeSpot(n: number, k: number): { edge: Edge; t: number } { const s = EDGE_SPOTS[n]![k - 1]!; return { edge: s[0], t: s[1] }; }
```

Clockwise from you means: your left-hand side first (bottom of the left edge), up the left, across the top, down the right. `tableOrder` already gives seats clockwise; seat k ≥ 1 uses `edgeSpot(n, k)`. Seat 0 (you, or whoever holds the phone) keeps a chip at the bottom centre, above the hand.

#### E3. Edge fans of card backs (replaces `miniBacks` on other players)

For each other seat, before the chip, add `div.edge-fan.edge-<top|left|right>` (`aria-hidden`) holding `min(cardCount, 13)` `span.edge-back` (the existing red `.card-back` look, 44 × 62 px, 2 px cream border):

- Top edge: the fan is centred at `left: t*100%`, its cards' top at −22 px (partly off the felt, as in the mockup), rotated `180deg + d*2.5deg` where `d = i - (k-1)/2`, spaced `step = min(8, 70/k)` px, `top` nudged by `|d|*0.8` px. Chip under it (`top: 60px` from the felt's top).
- Left/right edges: the fan is centred at `top: 70px + (feltHeight − 70px) * t`, cards at `left`/`right: −30px + |d|*0.6px`, rotated `±90deg + d*2.5deg`, spaced `min(6, 55/k)` px vertically. Chip just inside (62 px from that edge, same height).
- A player who is out (place badge) shows no fan. The chip still shows the count number (the fan is decoration; the number is the truth).
- Set positions with inline `left/top/right` styles in px or % from the helpers; no layout reads.
- Keep `miniBacks` for seat 0? No: your own count is in the hand header; seat 0 shows name and count only.

#### E4. The thrown pile in the middle (replaces the per-seat `table-play` spots)

New pure helper in `table.ts` (unit-tested):

```ts
/** A number 0..1 from a text, always the same for the same text (so a card never jumps on a redraw). */
export function seeded(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}
/** Where each card of the trick lands: down-right of the one before, with a random tilt, so every earlier card keeps its top-left corner showing. */
export function pileSpots(cardIds: readonly string[], salt: string): { x: number; y: number; rot: number }[] {
  let x = 0, y = 0;
  const out = cardIds.map((id, k) => {
    if (k > 0) { x += 20 + seeded(`${salt}:${id}:x`) * 7; y += 8 + seeded(`${salt}:${id}:y`) * 14; }
    return { x, y, rot: (seeded(`${salt}:${id}:r`) - 0.5) * 28 };
  });
  // Centre the whole pile on (0, 0).
  const cx = x / 2, cy = y / 2;
  return out.map((p) => ({ x: p.x - cx, y: p.y - cy, rot: p.rot }));
}
```

- `salt` = `${s.round}:${trick number}` (use the play state's trick counter; search `session/types.ts` for it; if there is none, use the id of the trick's first card). A new trick gets a new random look; the same trick never changes.
- In `roundTable`, draw the plays in play order inside `div.trick-pile` (centred in the felt, slightly above the middle: `top: 45%`). Each card: `cardFaceFromId(p.card, 'small-card')` in `div.table-play.trick-play` with `translate: calc(-50% + Xpx) calc(-50% + Ypx); rotate: Rdeg; z-index: 2 + i`. Use the separate `translate`/`rotate` properties, so the existing drop-in animation on `.new` (if it uses `transform`) still works.
- Card width in the pile: 56 px (`.trick-pile .card.small-card { width: 56px; }`).
- The newest card (`i === plays.length - 1`) gets class `newest`: `box-shadow: 0 0 0 2px var(--gold), 0 3px 8px rgba(0,0,0,.4)`.
- Keep each card's `aria-label` "<name> played" (screen readers and `testbed/bot.js` may read it).
- Why the corner stays visible: each next card sits at least 20 px right and 8 px lower; the corner index is about 17 × 24 px at 56 px wide. Unit test: for 8 random ids and 20 salts, every step has `dx >= 20` and `rot` within ±14°.

#### E5. Waste pile in the corner

- `wasteMiddle` → rename to `wastePile(count)` (update callers); it is drawn outside `table-middle`, as `div.table-waste.corner` at `right: 16px; bottom: 16px` of the felt, with the label "Waste" + count (`span.waste-count` "Waste 14").
- `table-middle` keeps only the deck while dealing (and nothing during play).
- End-of-trick slide (`game.ts` ~line 605) targets `.round-table .waste-pile` already; check it still finds it and slides to the corner. A slap still slides to the slapped seat's chip.
- The final-two "pick up the waste pile" cards fly from the corner (search `waste-pile` in `game.ts` and `between.ts`).

#### E6. Checks for Part E

- Unit (new `tests/ui/table.test.ts`): `edgeSpot` has n−1 spots for n = 2…8 and every `t` is in 0..1; `seeded` is stable; `pileSpots` as in E4; the pile for one trick is the same on two calls.
- Browser: `solo_check.py`, `playthrough.py`, `netgame_check.py` (they use `data-seat`; must pass unchanged). Add to `solo_check.py`: after the second card of a trick, every `.trick-play` except the last has its top-left 14 × 18 px not covered (use `document.elementFromPoint` at the card's top-left + (8, 10) after un-rotating: simplest is to check that point's element is inside that card).
- Screenshots at 3, 5 and 8 players into `testbed/out/` for the DEVLOG.
- **Phone checklist (2.24, added):** other players hold a fan at the edge; their fan shrinks as they play; the trick lands as a messy pile in the middle and you can still read every card's corner; the newest card has a gold edge; the waste pile is in the bottom-right corner and the end-of-trick cards slide into it; a slap still sends the cards to the slapped player.


### 9u.1 Version and process

- 2.24.0 (B + D + E), 2.25.0 (A, app and server), 2.26.0 (C). Each: update all five MD files, DEVLOG entry, checks in that part, then ask the user to push (CLAUDE.md rule 5; the user says "Push it"). Tell the user the version number each time.
- Don't start the next version until the user has pushed the last one (or says to go on).

## 9v. Version 2.27: fast forward and skip to end of round when only computer players are left to act (PLAN, user 2026-11-13 19:58; answers recorded 19:59; BUILT as 2.27.0 on 2026-11-13, pushed as 469d086; spec `PROJECT.md` 12h)

Nothing here may be built until the user approves this plan and answers the open questions in `PROJECT.md` 12h (CLAUDE.md rules 1 and 2). It is written so that any model can build it.

### 9v.0 Read first

Terms used below:
- **Computer player** (also "bot"): a player whose `computer` flag is true. Their moves come from `decide()` in `src/ai/decide.ts`. They only see what `seenBy()` gives them.
- **Driver**: the code in `src/ui/bots.ts` that picks the next computer move, waits a "thinking" time, and sends the move through `runActions()`. It runs after every redraw (`botsTick()`), so there is no loop of its own.
- **Thinking time**: `thinkMs()` in `src/ai/persona.ts`. It is a random time in a range for each kind of decision, multiplied by a speed factor (relaxed 1.5, normal 1, fast 0.5). Speed is set in one-phone setup (`solosetup.ts`) and in Multiplayer (`netlobby.ts`, "Computer speed").
- **Actor**: the player whose turn it is, from `actorOf()` in `src/ui/game.ts` (the player choosing in the final two, or the player whose turn it is). Returns null when the game is not in play.
- **Bots-only moment**: the game is waiting only on computer players. No person's seat has anything to do. Defined exactly in 9v.2.
- **Fast forward**: the same game, with shorter thinking times. Every move still shows on screen.
- **Skip to end**: the rest of the game is played at once, with no thinking time, no pop-ups and no reactions. The screen shows the result at the end.

### 9v.1 What the user sees

- During a bots-only moment, the game menu (the same menu as "Quick rules" and "Leave" in the top bar; check `src/ui/game.ts` for the menu it uses) gets two new items: **Fast forward** and **Skip to end of round**. A small banner under the top bar shows **Fast forward on** or **Skipping to the end of the round…** while it runs, with a **Stop** button.
- Outside a bots-only moment, both items are hidden, not greyed out.
- **Stop** ends fast forward or skip at the next move. Fast forward stays on until the person stops it or a person must act. Skip stops by itself at the end of the round, where the round-over pop-up shows and waits for the person's tap as normal, or when a person must act.
- While a person must act, the banner goes away and the game returns to normal. The person sees the same screen as in a normal game at that point.

### 9v.2 The bots-only rule (one function, tested on its own)

Create `src/ai/fastforward.ts` with one pure function, `botsOnlyNow(input)`, that takes:
- `actor`: the actor from `actorOf()` (or null),
- `isComputer(id)`: true for a computer player,
- `waitingForPerson`: true if any person's seat has a pending vote, swap, tap, take-cards request or reshuffle vote, or if a pop-up is on screen,
- `paused` and `ended`.

It also takes `personOut`: true when every person's seat on this phone is out of the round (see below). It returns true when `actor` is a computer player (or null, meaning a round is between moves and the driver is waiting), `personOut` is true, `waitingForPerson` is false, `paused` is false, and `ended` is false. Everything else returns false. This function is what the menu items and the stop rule both use.

**Answered 2026-11-13 19:59 (user): bots-only means the person is out of the round.** Before building, read the rules engine (`src/rules/`) for how a player is out of a round, and use that exact state for `personOut`. If the rules engine has no such state, stop and ask the user before building.

### 9v.3 Fast forward (changes time only)

1. In `src/ui/bots.ts`, add a module setting `fastForward: boolean` (false at start, reset when a game is left or a new game starts) with functions `setFastForward(on)` and `fastForwardOn()`.
2. In `schedule()`, when `fastForwardOn()` is true, pass the thinking time through a factor of 0.25 (so "normal" speed becomes a quarter of its time). Do not change the random draw itself; multiply the result.
3. Reactions: when fast forward is on, reactions stay on (they are part of the table feel) but their 300 to 1200 ms delay becomes 0 to 300 ms. Do not change `REACT_GAP_MS`.
4. Trick animation: `trickAnimating()` in `src/ui/game.ts` waits for the trick-end animation before the next move. When fast forward is on, the animation may run at half its normal time. Look at the animation code first and change only the duration, not the order of steps.
5. Every move still goes through `runActions()`, so the log, the table and the history are the same as a normal game.

### 9v.4 Skip to end of round (plays the rest of the round in chunks)

1. Add `skipping: boolean` in `src/ui/bots.ts`, with `startSkip()`, `stopSkip()` and `skipping()`.
2. `startSkip()` sets the flag, then calls `skipChunk()`. `skipChunk()` plays up to 20 computer moves, each by calling the same decision and `runActions()` used by `fire()`, then returns to the browser with `setTimeout(skipChunk, 30)`. Chunks keep the screen responsive so the **Stop** button still works.
3. Before each move, `skipChunk()` checks `botsOnlyNow()`. If it returns false, or the round is over, or `stopSkip()` was called, it stops and calls `botsTick()` so the normal driver takes over.
4. Pop-ups: the round-over pop-up is shown as normal and waits for the person's tap, as in a normal round. No other pop-up (such as the "X leads" pop-up) is added during a skip. The round's scores are recorded as normal.
5. Reactions: off while skipping (set a flag checked in `reactTo()`; the flag is not saved).
6. Safety cap: stop after 2000 moves in one skip, show a note "Stopped: too many moves", and log it with `console.error`. This stops a bug from looping forever.
7. If `runActions()` returns an error during a skip, stop the skip, log the error, and call `botsTick()` (the same handling `fire()` uses).

### 9v.5 Network games (host only)

- Only the host's phone runs the computer players (`runsSession()` in `game.ts`), so only the host sees **Fast forward** and **Skip to end**. Joining phones do not show the items.
- The host's moves reach the other phones through the existing sync path (`hostSendReaction` and the session sync in `src/ui/netplay.ts`). Skipping sends the same messages as normal play, so nothing new goes on the wire. Confirm this by reading `src/ui/netplay.ts` before building; if a skip sends many moves at once, send them in the same order as the chunks.
- A joining phone can see a small note "Host is skipping to the end" when it receives moves quickly. This is optional; ask the user (open question 4).

### 9v.6 Privacy: skipping must not show anything more

- A computer player's hand is never shown during fast forward or skip. The skip uses the same `decide()` and `seenBy()` as normal play, so it cannot see more.
- A person's own hand is shown only on that person's own phone, as normal.
- Skipping does not change the result, only the time. A test checks that a skipped game and a normal game with the same seed reach the same final scores (9v.7).

### 9v.7 Tests

- `tests/ai/fastforward.test.ts` (new): `botsOnlyNow` returns true only in the cases listed in 9v.2 (table of cases: actor bot, actor person, actor null, pop-up on, vote open, paused, ended).
- `tests/ai/fastforward.test.ts`: `thinkMs` with the fast-forward factor is a quarter of the normal time for the same random draw (the factor is applied after the draw).
- `tests/ui/skip.test.ts` (new, if the driver can run without a browser; if not, skip this file and say so in DEVLOG): a skipped round with a fixed seed ends with the same scores as a normal round with the same seed.
- Browser check `testbed/skip_check.py` (new; do not run it unless the user asks, since they asked for no long tests): one-phone game with 3 computer players and the person out; check the menu items show only while the person is out, Stop works, Skip to end of round stops at the round-over pop-up, and the scores are saved.

### 9v.8 Files likely to change

| File | Change |
|---|---|
| `src/ai/fastforward.ts` (new) | `botsOnlyNow()` |
| `src/ai/persona.ts` | none, unless the factor is best put there (then add a `FAST_FORWARD_FACTOR = 0.25` constant) |
| `src/ui/bots.ts` | fast-forward flag, factor in `schedule()`, skip loop `startSkip` / `skipChunk` / `stopSkip`, reactions flag |
| `src/ui/game.ts` | the two menu items, the banner with **Stop**, `trickAnimating` duration, no pop-ups while skipping |
| `src/ui/netplay.ts` | check only (host-only items) |
| `src/ui/history.ts` | check only (one save per game) |
| `src/ui/styles.css` | banner style |
| `tests/ai/fastforward.test.ts`, `tests/ui/skip.test.ts` (new) | 9v.7 |

### 9v.9 Version and process

- This is **2.27.0** (the number after 2.26.0; `CLAUDE.md` rule 8).
- Build order: 9v.2 first (with its tests), then 9v.3, then 9v.4, then 9v.5. Run `npm run check` and `npm test` after each step (the unit tests only, not the browser checks).
- **Built notes (2.27.0):** shared on/off state lives in `src/ai/fastforward.ts` (not `bots.ts`, to avoid a new import cycle). `personOut` is the rules engine's `play.finished` (every person out). Fast forward is cleared when a person must act; a pop-up alone does not clear it. A skip shows only the round-over pop-up (`lastTwo`, or a slap that ends the round). Joining phones get a new host frame `{ t: 'skipping', on }` (`src/net/lobby.ts`; relay unchanged, `LOBBY_PROTOCOL` not bumped). Not done: `tests/ui/skip.test.ts` and `testbed/skip_check.py` (the skip result is not checked against a same-seed normal game, because reactions and fast-forward timing use the shared random draws; the phone test is the check). Browser checks not run (no long tests requested).
- Then: `npm run build` (playable build), update all five MD files (CLAUDE.md rule 4) and `DEVLOG.md`, then ask the user to test on a phone and approve the push (CLAUDE.md rules 3 and 5).
- Phone checklist (2.27): one-phone game with 3 computer players, you out of the round: Fast forward speeds the moves up; Skip to end of round stops at the round-over pop-up; Stop works during both; the menu items are hidden while you are still in the round. Network game: only the host sees the items.

## 9w. Version 2.28: quiet seats ("the fan is the seat", Option C) and a table that fits any screen, portrait or landscape (PLAN, user 2026-11-13 20:16; written for any model, Haiku included; BUILT as 2.28.0 on 2026-11-13, not pushed; spec `PROJECT.md` 12i; mockup https://claude.ai/artifact/GkFLKsbdpWnqocf1zf61Jp artboard "C: the fan is the seat")

**Built notes (2.28.0):** `tableBox`, `handH`, `seatLayout`, `ownSeatBox`, `wasteBox`, `middleBox`, `fitBox` and `seatCollisions` are pure in `src/ui/table.ts`; tests in `tests/ui/seats.test.ts` (new file, not appended to `table.test.ts`). Deviations, each made so the plan holds on real screens:
- Landscape table minimum is **160 px**, not 200 (9w.2): at 568 × 320, 200 px does not fit the top bar, table and hand (test 1 would fail).
- `fitBox` (9w.3 rule 7) is applied in `roundTable`: shrink `u` by 5%, up to 6 times. The survey shows it clears every 9w.7 size except the **known tight cases** listed in the test file: all player counts at 568 × 320 (the middle zone and the top names collide), and 8 players at 320 × 568, 360 × 640, 375 × 667 and 667 × 375 (the right-hand name meets the waste pile). These are real limits of the geometry in short windows, not yet fixed.
- `fanLayout` takes an optional fourth argument `minCardW` (default 64) so landscape can use 48 px; the third argument is `maxCardW` as planned.
- The own seat says "You" when `you` is passed (trick, leader and network screens). The dealing screen does not pass it yet.
- Side-edge fans with 13 backs are not checked for overlapping each other or the names; a phone check is needed.
- 2.28.1: the resize redraw is skipped while a text field has focus (the keyboard opening resizes the window and closed it on name entry).
- Not run: `npm run build` (esbuild is not installed in this session, and the network is off, so the bundle was not made), browser checks (`testbed/table_check.py` not written), and the phone checklist below.

Build only this plan (CLAUDE.md rules 1 and 2: the user approved it at 20:16 by asking for it to be written and pushed for Haiku). It changes how the table looks and how the game screen sizes itself. It changes no game rule and nothing sent between phones.

### 9w.0 Read first

- `src/ui/table.ts`: `roundTable()` (the felt, the trick pile, the seats), `edgeSpot()` / `EDGE_SPOTS` (which edge each other player sits on), `edgeFan()` (the card backs), `seatSpot()` (your own seat at the bottom), `wastePile()`.
- `src/ui/styles.css`: `.round-table`, `.edge-fan`, `.edge-back`, `.table-seat`, `.seat-chip`, `.seat-name`, `.seat-count`, `.seat-tag`, `.seat-host`, `.think-dots`, `.screen` (max-width 520px).
- `src/ui/game.ts`: the five `roundTable(...)` calls, and the hand: `fanLayout(hand.length, Math.min(window.innerWidth, 520) - 12)` (about line 856).
- `src/ui/cards.ts`: `fanLayout()`.
- `src/pwa/manifest.webmanifest`: `"orientation": "portrait"`.
- `tests/ui/table.test.ts`, `tests/ui/fan.test.ts`: existing tests to keep passing.

Terms:
- **Seat**: one other player's place at the table: their fan of card backs, their count bubble and their name. Your own seat is the small pill at the bottom of the felt.
- **Table box**: the felt's size in CSS pixels, `w` × `h`.
- **Unit `u`**: one size number for the table, so everything grows and shrinks together (9w.2).
- **Portrait / landscape**: portrait when the screen is taller than wide (`innerHeight >= innerWidth`), landscape otherwise.

### 9w.1 What the user sees (Option C)

Every other player's seat is just their fan, with two small things on it:
- **Count bubble**: a cream circle with the card count, on the fan, on the side nearest the middle of the table (top edge: below the fan's centre; left edge: right of it; right edge: left of it). Ink text, bold.
- **Name**: small text (about 11 px on a phone, scales with `u`), weight 600, cream at 70% with a soft dark text shadow, no box and no background. Top edge: centred under the bubble. Side edges: under the fan, lined up with the screen edge (left edge: left-aligned; right edge: right-aligned). Long names end in "…" (max width 9 × `u`).
- **Computer player**: the small computer icon before the name, as now.
- **Host**: a small gold ★ after the name.
- **Whose turn**: the fan's card backs get a gold border and a soft gold glow (the mockup's `.fan.glow`), and the name turns gold. No other marker.
- **Thinking** (computer player choosing): three dots after the name that fade in and out (no word "thinking"). With reduced motion: the dots stay still.
- **Dealer**: a small gold circle with "D" after the name (`aria-label="Deals"`).
- **Away** (CODE.md 9u A5): the name is shown in the danger colour with the word "Away" after it.
- **Out of the round**: no fan and no bubble. The name stays, at 50% opacity, with the gold place badge after it ("1st").
- **Your own seat** (bottom centre of the felt): one small pill "You · 6" (one-phone pass-and-play: the holder's name). Gold border when it is your turn. Out: the place badge in place of the count.
- **Tappable seats** (choose who leads, take-cards target, and any other `onTap` use): the whole seat (fan, bubble and name) is one `<button>` at least 44 × 44 px, with the same `aria-label` as now. When tappable the name shows at full cream (not 70%) and the fan gets a thin cream outline, so it reads as a button. Disabled seats: 40% opacity.
- The middle of the table (where the trick lands) has nothing over it: no name or bubble may enter the middle zone (9w.3).

Nothing else on the table changes: trick pile, led-suit mark, waste pile in the corner, deck in the middle during the deal, flying dealt card.

### 9w.2 Sizes from one function (pure, tested)

Add to `src/ui/table.ts` (no DOM inside these functions):

```ts
export interface TableBox { w: number; h: number; u: number; landscape: boolean }
export function tableBox(viewW: number, viewH: number): TableBox
```

- `landscape = viewW > viewH`.
- **Portrait:** `w = min(viewW - 12, 760)`; `h = clamp(0.52 * viewH, 300, 0.9 * w + 80)` (so a tall phone gets a taller table, a tablet does not get a very tall one).
- **Landscape:** the game screen is the full window height. `w = min(viewW - 12, 1100)`; the hand area below the table is `handH(viewW, viewH)` (9w.5); `h = max(200, viewH - TOP_BAR - handH - 12)`, where `TOP_BAR` is the top bar's height (48 px in landscape, see 9w.4).
- `u = clamp(min(w, h * 1.3) / 34, 8, 16)`. On a 390 × 844 phone `u` is about 11.3; on a 568 × 320 landscape phone about 8; on an iPad about 16.
- Card back size on the edges: `bw = round(3.9 * u)`, `bh = round(bw * 1.4)` (44 × 62 at `u` ≈ 11.3, as now).
- Count bubble: `2 * u` high, min width `2 * u`, font `1.05 * u`.
- Name font: `max(10, u)` px.
- Trick cards (`.trick-pile .card.small-card`): width `round(5 * u)`.

`roundTable()` takes the box as a new option `box?: TableBox` (default `tableBox(innerWidth, innerHeight)`), sets the felt's `width` and `height` in px from it, and sets CSS variables on the felt: `--u`, `--bw`, `--bh`. CSS uses only these variables for seat sizes (no fixed `44px`, `60px`, `62px`, `70px` left in the seat rules).

### 9w.3 Where each seat goes (pure, tested)

Add `export function seatLayout(n: number, box: TableBox): SeatSpot[]` in `src/ui/table.ts`, one entry for each other player (k = 1 … n−1, same order as now):

```ts
interface SeatSpot {
  edge: 'top' | 'left' | 'right';
  fan: { x: number; y: number };      // centre of the fan, px from the felt's top-left
  bubble: { x: number; y: number };   // centre of the count bubble
  name: { x: number; y: number; align: 'center' | 'left' | 'right' }; // anchor of the name line
  hit: { x: number; y: number; w: number; h: number };  // the seat's tap area (fan + bubble + name), ≥ 44 × 44
}
```

Rules:
1. **Edges:** portrait uses `EDGE_SPOTS` exactly as now. Landscape uses a new table `EDGE_SPOTS_WIDE`, because there is more room on top and less on the sides: 2: top .5 · 3: top .3, .7 · 4: left .45, top .5, right .45 · 5: left .5, top .3, top .7, right .5 · 6: left .5, top .2, .5, .8, right .5 · 7: left .55, top .15, .38, .62, .85, right .55 · 8: left .6, left .15, top .25, .5, .75, right .15, right .6. (Keep clockwise order from your left, as now.)
2. **Fan position:** top edge: `x = t * w`, `y = 0` (the fan hangs half off the top of the felt, as now). Left: `x = 0`; right: `x = w`; sides: `y = topBand + (h - topBand - bottomBand) * t`, with `topBand = 6.2 * u` and `bottomBand = 4.5 * u` (keeps side fans clear of the top fans and of your pill and the waste pile). Replaces the fixed `70px`.
3. **Bubble:** top: `(x, 0.95 * bh)`; left: `(0.95 * bh, y)`; right: `(w - 0.95 * bh, y)`.
4. **Name:** top: `(x, bubble.y + 1.4 * u)`, centred. Left: `(0.5 * u, y + 0.75 * bh)`, left-aligned. Right: `(w - 0.5 * u, y + 0.75 * bh)`, right-aligned.
5. **Middle zone** (kept clear for the trick): the centred box `0.36 * w` × `0.36 * h` around `(w/2, 0.45 * h)`. No bubble or name box may overlap it.
6. **No overlaps:** treat each name as a box `9u` wide and `1.4u` high at its anchor (with its alignment), and each bubble as `2u` square. No two of these boxes (across all seats, plus your own pill box `9u × 2.2u` at bottom centre, plus the waste pile box `5u × 6.5u` in the bottom-right corner) may overlap, and all must be inside the felt.
7. If rule 5 or 6 fails for a size, shrink `u` by 5% and try again (at most 6 times) before giving up. This is the only fallback; it should never be needed at the sizes in 9w.7.

`roundTable()` uses `seatLayout()` for all positions (absolute `left`/`top` in px with `translate` for alignment). `seatSpot()` stays for your own seat only.

### 9w.4 Any screen: portrait, landscape, phone, tablet

1. `src/pwa/manifest.webmanifest`: `"orientation": "any"` (installed app can turn). Note: iPhone Safari ignores this; it follows the phone's own rotation lock.
2. `.screen` max-width 520 px stays for menus and setup screens. The game screen only (`.screen.game`) gets `max-width: min(100vw, 1100px)`; the table and hand are sized by `tableBox` and `handH`, not by the 520 cap.
3. Use `100dvh` (with `100vh` before it as a fallback) where the game screen needs the full height, so phone browser bars don't cut the bottom off.
4. **Landscape game screen layout:** top bar 48 px high (smaller buttons: 40 px, still ≥ 44 px tap area with padding), then the table, then the hand, in one column, no page scroll. Panels that open (menu, pause, reactions drawer, pop-ups) keep their current `max-height` in `vh` and scroll inside themselves.
5. **Redraw on resize:** in `src/ui/app.ts`, one `resize` listener (also fired by orientation change) that calls `update({})` after 150 ms of no further resize (debounce). The table and hand read `innerWidth` / `innerHeight` on each draw, so they re-fit. Don't redraw while a trick is flying (`trickAnimating()`): wait and redraw when it ends (it already calls `update`).
6. **Safe areas** (notches in landscape): pad the game screen with `env(safe-area-inset-left)` / `right` / `bottom`. Check that `index.html` has `viewport-fit=cover` in the viewport meta; add it if missing.
7. Pinch-zoom stays blocked and pull-to-refresh stays off (`nozoom.ts`): check after the change.

### 9w.5 Your hand in any size

- `handH(viewW, viewH)`: portrait: as now (the height `fanLayout` returns for the hand's width). Landscape: `clamp(0.30 * viewH, 96, 200)`.
- `fanLayout(n, width)` gains an optional third argument `maxCardW`. The call in `game.ts` passes the hand's width (`min(innerWidth, 1100) - 12`, not the 520 cap) and, in landscape, `maxCardW = (handH - 30) / 1.4` so the cards fit the shorter height. With 13 cards in landscape the hand stays in one row if it fits (`width ≥ cardW + 12 × 0.45 × cardW`), else two rows as now.
- Card size limits stay 64–96 px wide in portrait; in landscape the lower limit drops to 48 px.

### 9w.6 Files likely to change

| File | Change |
|---|---|
| `src/ui/table.ts` | `tableBox`, `seatLayout`, `EDGE_SPOTS_WIDE`, Option C seat markup in `roundTable`, `edgeFan` sizes from `--bw`/`--bh` |
| `src/ui/styles.css` | new seat styles (`.seat-quiet`, `.seat-bubble`, `.seat-label`, `.fan.turn`, `.think-dots` as dots), remove fixed px from seat rules, `.screen.game` width, landscape layout, safe areas |
| `src/ui/cards.ts` | `fanLayout` optional `maxCardW` |
| `src/ui/game.ts` | hand width and `maxCardW`; pass `box` where `roundTable` is called if helpful |
| `src/ui/netscreens.ts` | check only (its two `roundTable` calls get the same look) |
| `src/ui/app.ts` | debounced resize redraw |
| `src/pwa/manifest.webmanifest` | `"orientation": "any"` |
| `src/index.html` | `viewport-fit=cover` if missing |
| `tests/ui/table.test.ts` | new tests (9w.7) |
| `testbed/table_check.py` (new) | screenshots at every size (do not run unless the user asks) |

Keep `data-seat` on each seat (the flying dealt card aims at it), keep `aria-label`s, and keep the seat a `<button>` only when `onTap` is set.

### 9w.7 Tests

`tests/ui/table.test.ts` (unit, no browser), for every screen size below and every player count 2 to 8, for both the portrait and landscape tables where the size is that shape:

Sizes (CSS px): 320 × 568, 360 × 640, 375 × 667, 390 × 844, 430 × 932, 412 × 915, 768 × 1024, 820 × 1180, 1024 × 768, 1180 × 820, 568 × 320, 667 × 375, 844 × 390, 932 × 430, 1280 × 800, 1920 × 1080.

1. `tableBox`: `w ≤ viewW`, `h > 0`, `8 ≤ u ≤ 16`, and in landscape `TOP_BAR + h + handH ≤ viewH`.
2. `seatLayout`: returns n−1 seats; every bubble and name box is inside the felt; none overlaps another, your own pill or the waste pile; none overlaps the middle zone (9w.3 rules 5 and 6).
3. Every `hit` box is at least 44 × 44.
4. Portrait seats use `EDGE_SPOTS` (same edges as 2.27, so nothing moves to another edge in portrait); landscape seats use `EDGE_SPOTS_WIDE`.
5. `fanLayout` with `maxCardW`: no card wider than `maxCardW`; all cards inside the width.
6. Existing `table.test.ts` and `fan.test.ts` tests still pass (update any that check the old fixed positions, and say which in DEVLOG).

Browser check `testbed/table_check.py` (new; written, not run unless the user asks): opens a one-phone game with 7 computer players at each size above, takes a screenshot of the table, and fails if any `.seat-label` or `.seat-bubble` box overlaps another or leaves the felt.

### 9w.8 Version and process

- This is **2.28.0** (CLAUDE.md rule 8).
- Build order: 9w.2 (`tableBox`) with tests → 9w.3 (`seatLayout`) with tests → markup and CSS (9w.1) → 9w.4 → 9w.5. `npm run check` and `npm test` after each step (unit tests only).
- Then `npm run build`, update all five MD files and `DEVLOG.md`, then ask the user to test on a phone and approve the push (CLAUDE.md rules 3 and 5). Tell the user the version number.
- **Phone checklist (2.28):**
  1. One-phone game vs 7 computer players, portrait: each other player is a fan with a count bubble and a small name; nothing covers the trick; whose turn shows as a gold fan and gold name; thinking dots show.
  2. Same game, turn the phone to landscape (rotation lock off): the table fills the width, the hand fits below, no scrolling, names still clear of each other and of the middle. Turn back: the same.
  3. 2, 3 and 5 players: seats look balanced on both orientations.
  4. Choose who leads (round 2 onwards): tap a fan: it works; the seat looks tappable.
  5. Take-cards request: pick a target by tapping their fan.
  6. A player goes out: their fan and bubble go, the name fades with "1st".
  7. Multiplayer (two phones): host shows ★, a phone that leaves shows "Away" in red.
  8. Tablet or a desktop browser window, if one is handy: resize the window: the table re-fits.
  9. Pinch zoom and pull-to-refresh are still blocked.

## 9x. Version 2.29: the whole game fits on one screen (no scrolling), the full version number, and an "updated" notice (PLAN, user 2026-11-13 20:48; written for any model, Haiku included; NOT BUILT; spec `PROJECT.md` 12j)

Build only after the user approves this plan (CLAUDE.md rules 1 and 2). No game rule changes; nothing new is sent between phones.

### 9x.0 Why it scrolls today (measured with `tableBox` and `fanLayout`, 2.28.1)

Play screen on the user's phone (Samsung, 1080 × 2340, Samsung Internet: about 384 × 730 CSS px visible):

| Part | px |
|---|---|
| Top padding + top bar | 54 |
| Table (`0.52 × viewH`) | 380 |
| "last" trick row | 34 |
| "Haruto's turn" line | 22 |
| Hand heading (name + count) | 30 |
| Hand, 13 cards (two rows) | 183 |
| Play button | 56 |
| Bottom padding (room for the sticky button and 😂) | 84 |
| Gaps (14 px × 6) | 84 |
| **Total** | **≈ 927 (197 px too tall)** |

Also: the hand is 183 px with 13+ cards (two rows) and 129 px with 12 or fewer (one row). When the hand drops from 13 to 12 cards, everything below it moves about 54 px. On a scrolled page this looks like the screen zooming. This is the likely cause of the "zoom" the user reported (20:24); the frame-by-frame recording showed no real zoom.

### 9x.1 Part A: version you can see (2.29)

1. `build.mjs`: `__PUBBY_VERSION__` gets the full `pkg.version` (e.g. `2.29.0`), not just `MAJOR.MINOR`. Home screen and quick rules show it as is. CLAUDE.md rule 8 wording: "shows in the app as `MAJOR.MINOR.PATCH`" (needs the user's OK, as it is a rules file).
2. "Updated" notice: in `src/main.ts` (or wherever the service worker is registered), listen for `navigator.serviceWorker` `controllerchange`. If the page was already controlled before (so this is an update, not the first install), show a toast: "Pubby updated. Tap to reload." Tapping reloads. A game in progress is safe: it is in localStorage.
3. Also on every open: call `registration.update()` once, so a new build is looked for straight away (today the phone only finds it after a full close and reopen).

### 9x.2 Part B: the game screen is one fixed screen (portrait)

Rule: the game screen (`.screen.game`, every stage: deal, look at hands, play, choose who leads, final two) is exactly the window height (`100dvh`, `100vh` fallback) and never scrolls. Pop-ups, the menu, pause and the reactions sheet stay on top as overlays and may scroll inside themselves. Results and scoreboard screens: see open question 1.

Layout, top to bottom, one column (CSS grid `grid-template-rows: auto 1fr auto auto`):
1. **Top bar** (44 px): menu, round chip, pause, take-cards, sound, ? (as now). The "2 jokers" chip moves out of the deal stage's body and into the top bar as a small icon chip (`icon('joker')` + number), or into quick rules (open question 2).
2. **Table**: takes all the height that is left (`1fr`). `tableBox` gets the real space: `roundTable` is drawn with `box = tableBox(width, availableH)` where `availableH = innerHeight − topBar − handArea − actionBar − gaps − safe areas`, computed in one pure function `gameLayout(viewW, viewH): { tableH, handH, barH }` (tested). Minimum table height 240 px; if the window is smaller, the hand shrinks first (see 4), then `u` (the table already shrinks with `u`).
3. **Inside the table** (so they cost no height):
   - The **last trick** goes into the felt's top-left corner as a small overlapping stack (4 small card corners, `5u` wide each, overlapped like the trick pile), with "last" in small text above it. Tap it to see it bigger (pop-up). It must stay clear of the seats and the middle zone (add it as a box to `seatCollisions`, like the waste pile).
   - **Whose turn**: the gold fan and gold name already show it, so the "Haruto's turn" line is removed during play. Lines that say something only text can say ("pick up or forfeit", "X is dealing", "Tap a name to deal") move into the action bar (5).
4. **Hand area**: fixed height for the whole round, so it never jumps:
   - The hand heading (name + count) is removed: the "You · 12" pill on the felt shows it.
   - One row up to 15 cards (on a 372 px hand, 15 cards still give each card a 20 px strip, the tap minimum); two rows only above 15.
   - `fanLayout` gets a `maxH` argument: card size is chosen so the hand fits `maxH` both with one row and with two. The hand area's height is fixed from the window (`handH = clamp(0.2 × viewH, 120, 190)` in portrait), not from the card count. With two rows the cards get smaller instead of the area getting taller.
5. **Action bar** (52 px, fixed at the bottom, inside the layout, not sticky over the page): 😂 on the left, the main button in the middle ("Pick a card", "Play", "Deal all"…), or the one-line hint when there is no button. The 84 px bottom padding goes (the bar is now part of the layout). Deal stage: Manual / Auto / Deal all sit in this bar.
6. Safe areas: top, bottom, left, right with `env(safe-area-inset-*)`.

Height budget after the change on 384 × 730: bar 44 + table ≈ 450 + hand 146 + action bar 52 + gaps and padding ≈ 38 = 730. On 360 × 640: table ≈ 380. On 320 × 568: table ≈ 330, hand 120.

### 9x.3 Part C: landscape uses the same layout

Landscape already has no page scroll (2.28). It uses the same `gameLayout` so the action bar and hand are the same parts. In landscape the action bar may sit to the right of the hand (one row: hand left, button right) to save height; `gameLayout` decides.

### 9x.4 Files likely to change

| File | Change |
|---|---|
| `build.mjs` | full version string |
| `src/main.ts` (service worker registration) | `update()` on open, `controllerchange` toast |
| `src/ui/layout.ts` (new) | pure `gameLayout(viewW, viewH)` |
| `src/ui/game.ts` | stages render into the fixed grid; last trick into the table; hand heading and turn line removed; action bar |
| `src/ui/table.ts` | last-trick corner stack; `lastBox` in `seatCollisions` |
| `src/ui/cards.ts` | `fanLayout` `maxH`, one row up to 15 |
| `src/ui/styles.css` | `.screen.game` grid at `100dvh`, `.action-bar`, remove `.game` 84 px padding and the sticky play bar |
| `src/ui/netscreens.ts` | same grid for network stages |
| `tests/ui/layout.test.ts` (new) | 9x.5 |

### 9x.5 Tests

For the 16 sizes in 9w.7 (and 384 × 730):
1. `gameLayout`: `topBar + tableH + handH + barH + gaps ≤ viewH`; `tableH ≥ 240` (or the documented smallest size); `handH ≥ 120` in portrait.
2. `fanLayout(n, width, maxCardW, minCardW, maxH)`: height ≤ `maxH` for every n from 1 to 27; the same `maxH` for 12 and 13 cards (no jump).
3. `seatCollisions` with the last-trick box: same known tight cases as 2.28, no new ones.
4. Existing tests keep passing.

### 9x.6 Version and process

- **2.29.0.** Build order: Part A (version + notice) → `gameLayout` with tests → `fanLayout maxH` with tests → play stage → deal, look and choose-leader stages → network stages → landscape.
- `npm run check`, `npm test`, `npm run build`; update the five MD files; ask the user to test, then push.
- **Phone checklist (2.29):**
  1. Home screen shows **2.29.0**. After the next push, "Pubby updated. Tap to reload" appears without closing the app.
  2. One-phone game vs 7 computer players, portrait: the deal, playing and choose-who-leads screens all fit; no scrolling at any point.
  3. Play until your hand drops from 13 to 12 cards: nothing moves or jumps.
  4. The last trick shows in the table's top-left corner; tap it to see it big.
  5. 😂 and the main button sit in the bottom bar; the button is not covered.
  6. Turn to landscape and back: still no scrolling.
  7. Type a name on the setup screen: the keyboard stays open (2.28.1 fix).

## 9y. Version 2.30: missing-suit notices that stay until everyone has tapped OK (PLAN, user 2026-11-13 20:54; written for any model, Haiku included; NOT BUILT; spec `PROJECT.md` 12k)

Build only after the user approves this plan. Changes only what is shown and when play starts; no game rule changes. Network games send one new action (`seenNotice`), like `seenHand` (2.20).

### 9y.0 Today

`decideLeaderStep` (`src/session/session.ts` ~line 590), after everyone pressed Done on their cards: one player missing a suit → `beginPlay(..., 'missingSuit')`, and the UI shows "Bilal leads · Missing a suit" for 6 s (`LEAD_MS`, `game.ts`); two or more → phase `reactionTap` straight away. Users miss the 6 s pop-up.

### 9y.1 What the user sees

All notices are big centred cards (not toasts), with one button **OK**. They stay until this phone taps OK, then leave this phone's screen. If others still have to tap, this phone shows the small "Waiting for Rohan" line (the 2.20 wait line) until they do. Play (or Reaction Tap) starts only when everyone has tapped.

1. **One player missing a suit:** "**Bilal is missing a suit**" / "Bilal leads first." → OK.
2. **Two or more:** first notice "**Bilal and Rohan are missing a suit**" → OK. Then a second notice "**Reaction Tap**" / "Bilal and Rohan play Reaction Tap. Tap when the screen turns green. The slowest leads first." → OK. Then Reaction Tap runs as now.
3. **After Reaction Tap:** "**Rohan leads first**" / "Slowest in Reaction Tap" (with the times, e.g. "Rohan 412 ms · Bilal 288 ms"; a false start says "tapped too soon") → OK. A tie still shows "Bilal and Rohan tap again" (same wait for OK), then Reaction Tap again.
4. The suit is **never named** (PROJECT.md section 5, secret suits). The notice says "missing a suit", not which.

Who must tap OK: every person on their own phone (Multiplayer). Computer players count as tapped at once. A shared phone (one-phone game, pass-and-play, or you vs computer players) needs **one** tap. The host cannot skip a phone that has not tapped (same as 9t); an Away phone is waited for, as for the cards-seen wait.

Pause and reactions work as now during a notice.

### 9y.2 Session (`src/session/session.ts`, `types.ts`, `view.ts`)

- New phase `leadNotice`, with `notice: { kind: 'missingOne' | 'missingMany' | 'tapIntro' | 'tapResult' | 'tapTie'; players: PlayerId[]; leader?: PlayerId; times?: Record<PlayerId, { ms: number; falseStart: boolean }> } | null` and `noticeSeen: PlayerId[]`.
- New action `seenNotice { by }` (like `seenHand`): adds `by`; when every **person** in `order` has seen it (computer players skipped; with `waitForAll` false one tap is enough), move on:
  - `missingOne` → `beginPlay(leader, 'missingSuit')`.
  - `missingMany` → notice `tapIntro` (same players).
  - `tapIntro` → phase `reactionTap` (as today).
  - `tapTie` → phase `reactionTap` with the tied players.
  - `tapResult` → `beginPlay(leader, 'reactionTap')`.
- `decideLeaderStep` and the `reactionTap` result branch go to `leadNotice` instead of straight on. Round 1 "Host leads" and "winner picks" are unchanged (no notice).
- `view.ts`: `notice` and `noticeSeen` are public (no hidden information in them).
- Old saved games in `reactionTap` or `playing` load as before (`notice` defaults to `null`).

### 9y.3 Screens (`src/ui/game.ts`, `roundstart.ts`, `netscreens.ts`)

- New stage view `leadNoticeStage`: the table (as now) with the notice card on top, OK button sends `seenNotice` for this phone's player (shared phone: the holder, then the session treats it as everyone's).
- After this phone tapped: the card goes; the wait line shows who is left.
- The 6 s "X leads" pop-up for `missingSuit` and `reactionTap` is removed (the notice replaces it). `LEAD_MS` stays for any other use.
- Computer players (`src/ui/bots.ts`): never send `seenNotice` (they are skipped in the count).

### 9y.4 Tests

- `tests/session/notice.test.ts` (new): one missing → notice → all seen → playing with that leader; two missing → `missingMany` → `tapIntro` → `reactionTap` → `tapResult` → playing; tie → `tapTie` → `reactionTap`; computer players never block; `waitForAll` false needs one `seenNotice`; repeat `seenNotice` is harmless; `seenNotice` in the wrong phase fails.
- Network: `tests/net/netgame` style check that two phones both have to send `seenNotice`.
- Existing session tests that expect play to start straight after the card check with a missing suit are updated (list them in DEVLOG).

### 9y.5 Version and process

- **2.30.0** (after 2.29, or alone if the user wants it first).
- `npm run check`, `npm test`, `npm run build`; update the five MD files; phone test; push.
- **Phone checklist (2.30):**
  1. Game vs computer players until someone is missing a suit: the notice stays until you tap OK.
  2. Two players missing a suit (try several deals, or 7 players): two notices, then Reaction Tap, then "X leads first" with the times.
  3. Multiplayer on two phones: tap OK on one; it shows "Waiting for …" until the other taps; play starts only then.
  4. The suit is never named.

## 9z. Computer players that learn from the people they play against (PLAN, user 2026-11-13 21:25; NOT BUILT; decision pending in `PROJECT.md` 12l)

**Today:** computer players learn nothing between rounds or games. `src/ai/memory.ts` is built only from public events in the current round (and reset each round). Their personality and level are fixed at setup (`src/ai/persona.ts`, `PERSONALITY_WEIGHTS`). Nothing writes learned values to storage.

**Goal:** after several games, a computer player plays a little more like the people it actually plays against, without ever seeing a hidden card.

**Fairness rule (must hold):** a learning bot may use only what a person at the table could see: public events in the log (plays, slaps, pick-ups, takes, round results, who led). It may never read a hand, a hidden deck, the declared-but-secret missing suit, or the session's private state. The no-cheating test (`tests/ai/fair` style check, CODE.md 9m) must still pass, and a new test must show that changing a hidden card does not change a learned value.

### 9z.0 Options (the user chooses; none is built)

| Option | What it does | Where it is kept | Risk |
|---|---|---|---|
| 1. Within one game (recommended first step) | Each bot watches each human's public habits in the current game (slap rate, joker timing, leads high or low, cards picked up) and nudges its own weights a little toward or away from them. Resets when the game ends. | Memory only (nothing saved) | Low. Easy to switch off. Effect is small and only lasts one game. |
| 2. Across games on the same phone | Same counters, kept over several games and saved with the game records (`src/session/record.ts`, profile history). A bot's personality weights drift slowly toward the saved habits of its opponents. | Storage (needs a reset button and a size cap) | Medium. Needs storage design and a clear "reset learning" control. |
| 3. Offline tuning from your game records | A script (arena, `npm run` arena scripts) uses your saved records to tune the weights, then the new weights are written into `persona.ts` by hand. No change to the app at run time. | Code (`persona.ts`) | Low. Changes only happen when you run and approve the tune. |

### 9z.1 Option 1 in detail (if chosen)

- **Counters per human player, this game only:** slaps made, slaps on a suit they were missing (shown by the slap, so public), jokers played and how early, leads of a low card when they had a high one (only when the lead is public), cards picked up.
- **Nudge, not rewrite:** each counter moves the bot's `risk` and `jokerSave` weight by at most ±20% of its base value (base values are in `persona.ts`). A bot never goes below 50% or above 150% of its base weight, so its personality stays recognisable.
- **Minimum evidence:** no nudge until the human has had at least 6 public chances to show the habit (e.g. 6 slap chances). Before that the bot plays its normal personality.
- **Reset:** the nudge is cleared when the game ends or when a new game starts. Option 1 saves nothing.
- **Setting:** a new setup switch, "Computer players learn from me" (on or off, default off until the user tests it).

### 9z.2 Option 2 in detail (if chosen, after option 1 is tested)

- Same counters, kept in a profile record per human name (the names in profile history), capped at the last 20 games.
- A "Reset computer learning" button in the profiles screen. Deleting a profile deletes its learning.
- Stored only on the phone that holds the saved game. Nothing leaves the phone.

### 9z.3 Option 3 in detail (if chosen)

- A script reads exported game records, runs the arena with the proposed weights, and prints the win rate and average score before and after.
- Weights are changed in `persona.ts` only after the user reads the printed result and says so. Each change is a normal versioned build.

### 9z.4 Files likely to change (option 1)

| File | Change |
|---|---|
| `src/ai/memory.ts` | Count public habits per human player this game |
| `src/ai/persona.ts` | Nudge helper with the ±20% bound and the 50–150% clamp |
| `src/ai/moves.ts` | Use the nudged `risk` and `jokerSave` (only when the setting is on) |
| `src/session/types.ts`, `src/ui/solosetup.ts` | The "learn from me" switch |
| `tests/ai/` | New tests: bound and clamp; minimum evidence; hidden-card test; reset at game end |

### 9z.5 Version and process (when built)

- Proposed version: the next free number when built (2.31 is taken by 9aa) (option 1). Options 2 and 3 get their own version numbers when chosen.
- `npm run check`, `npm test`, `npm run build`; arena check that the learning bot does not get worse than the current bot (win rate within the arena's usual margin); update the five MD files; playable test build; phone checklist; push only after the user says "Push it".
- **Phone checklist (option 1, when built):**
  1. Turn on "Computer players learn from me". Play one game where you slap often. Do the bots slap you back more by the end of the game than at the start?
  2. Start a new game. Do the bots go back to their normal habits?
  3. Turn the switch off. The bots play as before.

## 9aa. Version 2.31: screens keep their scroll place, Fast forward buttons in your hand area, deal and round-start buttons that fit, and a neater last-trick stack (PLAN, user 2026-11-13 21:33; written for any model, Haiku included; BUILT 2.31.0, not committed; spec `PROJECT.md` 12m)

Build only after the user approves this plan (CLAUDE.md rules 1 and 2). No game rule changes; nothing new is sent between phones. Four parts; build them in order A, B, C, D and run `npm run check` and `npm test` after each part.

### 9aa.0 Read first

- `src/ui/app.ts` `render()` (about line 120 to 165): every redraw calls `root.replaceChildren(...)`, which throws away every element and builds new ones. A new element starts scrolled to the top. Only the reactions sheet keeps its place today (lines 158 to 162). `src/ui/netlobby.ts` line 321 keeps the window's place for the lobby only.
- `src/ui/game.ts` `gameScreen()`: stages that are not a fixed frame (results, game over, the one-phone round-start tiles) are wrapped in `div.game-scroll`, which scrolls inside itself.
- `src/ui/game.ts` `gameFrame()` and `styles.css` `.game-frame`, `.game-action-slot` (padding `0 64px`), `.deal-bar`.
- `src/ui/game.ts` `lastCorner()` and `src/ui/table.ts` `lastBox()`, `lastStyle()`; CSS `.lt-corner`, `.card.tiny-card .idx .r` (fixed 9 px).
- `src/ui/game.ts` `fastForwardMenuItems()`, `gameMenu()`, `playHandStage()`; `src/ui/netscreens.ts` line 194 (network menu: host only).

### Part A — screens keep their scroll place on every redraw (all screens)

**The bug (user screenshot 1):** on the results screen, each time a player taps "I'm ready" (or a computer player readies), the screen jumps back to the top. **Cause:** `render()` rebuilds the whole page; the new `div.game-scroll` starts at scrollTop 0. The same happens to every scrolling box whenever anything redraws: computer moves, reactions arriving, network messages, votes, timers.

**Where it happens today (all fixed by this part):**

| Scrolling box | Redraws that reset it |
|---|---|
| `div.game-scroll` (results, game over, one-phone round-start tiles) | ready-ups, votes, target proposals, reactions, network messages |
| `.game-extra` (panels floating over the table) | every move during play |
| `.rules-sheet` (? quick rules) | anything that redraws while the rules are open (bot moves, reactions) |
| `.sound-sheet`, history `.sheet`, `.last-sheet`, pause overlay | the same |
| The window itself (home, setup, history, lobby) | network lobby messages (already fixed in netlobby.ts only), saves |

**Fix: one general rule in `render()`, replacing the reactions-sheet special case.**

1. Every scrolling box gets a `data-scroll` attribute with a stable name. The name must change when it is a *different* screen, so a new screen still opens at the top:
   - `div.game-scroll` in `gameScreen()`: `data-scroll="game-${s.phase}-${s.round}"`.
   - `.game-extra` in `gameFrame()`: `data-scroll="extra"`.
   - Rules sheet: `"rules"`. Sound sheet: `"sound"`. History sheet: `"history-" + sheet.title`. Last-trick sheet: `"last"`. Pause overlay's sheet: `"pause"`. Reactions sheet: `"reactions"`.
   - Any other element whose CSS has `overflow-y: auto` (search `styles.css` for `overflow-y`, lines about 314 and 525): give it a name too.
2. In `render()`, just before `root.replaceChildren(...)`:
   ```ts
   const kept = new Map<string, number>();
   root.querySelectorAll<HTMLElement>('[data-scroll]').forEach((el) => kept.set(el.dataset.scroll!, el.scrollTop));
   const pageKey = screenKey(st);           // see 3
   const pageY = window.scrollY;
   ```
   Just after it:
   ```ts
   root.querySelectorAll<HTMLElement>('[data-scroll]').forEach((el) => {
     const y = kept.get(el.dataset.scroll!);
     if (y !== undefined) el.scrollTop = y;
   });
   if (pageKey === lastPageKey && window.scrollY !== pageY) window.scrollTo(0, pageY);
   lastPageKey = pageKey;
   ```
   Delete the old `sheetScroll` lines (the reactions sheet is now covered by `data-scroll="reactions"`).
3. `screenKey(st)` (pure, exported, in a new file `src/ui/scrollkeep.ts`): returns `st.screen` plus, for `'game'`, the phase and round (`game:results:1`). Moving to a new screen gives a new key, so it opens at the top as now. `lastPageKey` is a module variable in `app.ts`.
4. Leave the netlobby.ts fix in place (it is harmless and covers its own redraw path).
5. **Do not** scroll to the top on purpose anywhere unless the screen changes. Search for `scrollTo(` and `scrollIntoView(` (app.ts line ~212 is the rules topic jump, which is on purpose; keep it).

**Tests:** `tests/ui/scrollkeep.test.ts`: `screenKey` gives the same key for two states that differ only in ready players or votes, and a different key when the phase, round or screen changes. (The DOM part is checked on the phone; tests run without a DOM.)

### Part B — Fast forward and Skip in your hand area when you have no cards

**User (screenshot 2):** when you are out and only computer players are left, Fast forward and Skip to end of round are hidden in the ☰ menu, and the hand area just says "No cards left." Put the buttons where the cards were.

1. In `playHandStage()` (`src/ui/game.ts`), work out the items:
   ```ts
   const ffItems = !g.net || isHostSeat(g) ? fastForwardMenuItems(g) : [];   // 9v.5: host only in network games
   ```
2. If `v.myHand.length === 0 && ffItems.length > 0`, pass `hand: h('div', { class: 'hand-actions' }, ...ffItems)` to `gameFrame` instead of `handBlock(...)`. Otherwise keep `handBlock` exactly as now.
3. Buttons: `Fast forward` and `Skip to end of round`, side by side (stacked on screens under 340 px wide), each at least 48 px tall, cream `secondary` style as in the menu. Change the class in `fastForwardMenuItems` only for this use: give it an optional `opts: { big?: boolean }` that adds `big` to the class.
4. While Fast forward is on, the hand area shows `Stop fast forward` and `Skip to end of round` (Stop calls `stopFastForward()`); while a skip runs, it shows `Stop` only. The `fastBanner` under the top bar stays as it is.
5. Keep the same items in the ☰ menu too (people may look there). **End this game stays only in the menu** (it ends the whole game, and needs its "tap again" safety; it should not sit where a stray tap lands).
6. A joining phone in a network game still sees "No cards left." (9v.5: only the host can skip).
7. CSS: `.hand-actions { height: 100%; display: flex; gap: 10px; align-items: center; justify-content: center; padding: 0 12px; } .hand-actions button { flex: 1; max-width: 220px; min-height: 48px; }` plus `@media (max-width: 339px) { .hand-actions { flex-direction: column; } }`.

### Part C — Deal and round-start buttons that fit

**User (screenshots 5 and 6):** "Deal again?" and "Start the round" are cut off; on the deal screen the "2 jokers" chip is cut off at the top and Manual / Auto at the bottom.

**Cause, round start (`netscreens.ts` `beforeRound()`, used by vs-computer and network games):** the action slot is 52 px tall, `overflow: hidden`, with `padding: 0 64px`. On a 384 px phone that leaves 256 px for two `grow` buttons, so "Deal again?" wraps to 2 lines and "Start the round" to 3, and the extra lines are clipped.

**Cause, deal screen (`dealingStage()`):** the deal bar holds three rows (chips, hint, Manual / Auto / Deal all) in 92 px; they need about 120 px.

Fix:
1. `.game-action-slot` padding: the 😂 button sits bottom-left only, so use `padding: 0 12px 0 76px` (left room for 😂, small right). Check in landscape (`@media (orientation: landscape)` block) that it still uses its own `padding: 0 4px`.
2. Round-start buttons: shorter words and one line each:
   - `Deal again?` stays; `Used` stays.
   - `Start the round` becomes `Start`.
   - CSS `.round-buttons { display: flex; gap: 8px; flex-wrap: nowrap; } .round-buttons button { white-space: nowrap; min-height: 44px; padding: 0 12px; font-size: 1rem; }`.
   - Also the one-phone tiles (`roundstart.ts` `reshuffleStage`): check `Start · Name` doesn't wrap past the tile on 320 px; add `overflow-wrap: anywhere` to `.tile span` if it does.
3. Jokers chip moves out of the deal bar into the top bar (this was in 9x.2 item 1 and not done in 2.29): in `gameScreen()`, during `s.phase === 'dealing'`, add after the pause button a small chip `h('span', { class: 'bar-chip' }, icon('joker'), String(s.jokerTotal))` (or `icon('joker')` + `0` styled muted when jokers are off), with `aria-label="2 jokers"`. The hidden-deck chip (2 and 3 players) moves with it, as `icon('eyeoff')` + the number, still a button that opens ? rules at "Hidden decks". Remove `chips` from both `deal-bar`s in `dealingStage()`.
4. The deal bar then holds two rows (hint, then Manual / Auto / Deal all). Set its height with `stageLayout(false, 76)` in portrait (64 in landscape as now). Check: nothing is clipped at 320 × 568, 360 × 640, 384 × 730.
5. While here: on the round-start screen the floating target-score row (`extra`) covers the "You · 14" pill (screenshot 5). Make `.game-extra` sit at the top of the table slot on this stage (`top: 8px; bottom: auto;`) by giving `gameFrame` an `extraAt: 'top' | 'bottom'` option (default `'bottom'`) and passing `'top'` from `beforeRound()`.

**Tests:** extend `tests/ui/layout.test.ts`: for the sizes in 9w.7, `gameLayout(..., { bar: 76 })` still keeps `tableH ≥ 240` (or the documented smallest size).

### Part D — the last-trick stack lines up with its cards

**User (screenshots 3 and 4, circled):** the "last" stack in the table corner looks off: the numbers run together ("Q7810", "5910") and don't sit on their own cards.

**Cause:** each small card is moved only `0.5u` (about 5 px) past the one under it, but its corner number and suit are about 16 px wide (`.idx` is 40 % of the card, and `.idx .r` is a fixed 9 px font). So each card covers most of the number below it, and the numbers overlap each other. The fixed 9 px font also doesn't grow or shrink with the card (card width is `3.6u`), so the number doesn't sit in the card's corner.

Fix (same idea as the thrown pile in the middle: every card underneath still shows its whole corner):
1. **Step between cards:** new pure function in `table.ts`:
   ```ts
   /** How far each last-trick card sits from the one under it: enough to show its whole corner (number + suit). */
   export function lastStep(box: TableBox, n: number): number {
     const want = 1.6 * box.u;                       // one corner index wide
     const maxW = 0.4 * box.w;                       // stay left of the "You" pill
     return n <= 1 ? 0 : Math.max(1.0 * box.u, Math.min(want, (maxW - 3.6 * box.u) / (n - 1)));
   }
   ```
   `lastBox` uses it: `w: 3.6 * u + (n - 1) * lastStep(box, n)`. `lastCorner` sets `--step` on the button (`style="--step:Npx"`), and CSS uses `left: calc(var(--i) * var(--step))` instead of `0.5 * var(--u)`. `game.ts` needs the box: pass `lay.box` into `lastCorner` from `trickArea` (it already has `lay`).
2. **Corner index sized from the card:** in `.lt-corner` only, `.idx { width: auto; left: 0.25u; top: 0.2u; } .idx .r { font-size: calc(1.15 * var(--u)); line-height: 1; } .idx svg { width: calc(0.9 * var(--u)); height: calc(0.9 * var(--u)); }`. The number and suit then sit in the top-left corner of each card at the same place on every card, and the step (1.6u) is wider than the index (≈1.3u), so nothing overlaps.
3. **Label and slap mark:** keep "last" above the cards, left-aligned with the first card's left edge (both at `left: 0`). Move the slap hand icon to sit just past the right edge of the top card (`left: calc((n - 1) * step + 3.6u + 2px)`), so it never covers a number. `lastBox` width adds `1.4u` when there is a slap.
4. **Order:** first card played at the bottom-left, last card played on top at the right (as now).
5. Remove the old unused `.lt-card { margin-right: 8px; white-space: nowrap; }` rule (styles.css ~line 419) if nothing else uses it (search for `lt-card` first).

**Tests:** in `tests/ui/layout.test.ts`:
- `lastStep(box, n) ≥ 1.0u` for n = 2 … 8 on all sizes in 9w.7, and `= 1.6u` when n ≤ 5 on 384 × 730.
- `lastBox(box, 8).x + lastBox(box, 8).w ≤ 0.4 × box.w + 8`.
- `seatCollisions` with the new `lastBox`: no new collisions beyond the known tight cases in `tests/ui/seats.test.ts`.

### 9aa.1 Files likely to change

| File | Change |
|---|---|
| `src/ui/scrollkeep.ts` (new) | `screenKey(st)` |
| `src/ui/app.ts` | `render()` saves and restores `[data-scroll]` boxes and the window place (Part A) |
| `src/ui/game.ts` | `data-scroll` names; `playHandStage` hand actions; `fastForwardMenuItems` `big` option; jokers chip into the top bar; `gameFrame` `extraAt`; `lastCorner` step |
| `src/ui/netscreens.ts` | `beforeRound` "Start", `extraAt: 'top'` |
| `src/ui/roundstart.ts`, `between.ts`, `sound.ts`, `history.ts`, `app.ts` (rules sheet) | `data-scroll` names on scrolling boxes |
| `src/ui/table.ts` | `lastStep`, `lastBox` width |
| `src/ui/styles.css` | `.game-action-slot` padding, `.round-buttons`, `.hand-actions`, `.bar-chip`, `.lt-corner` index sizes |
| `tests/ui/scrollkeep.test.ts` (new), `tests/ui/layout.test.ts` | tests above |

### 9aa.2 Version and process

- **2.31.0** in `package.json` (9z option 1 takes the next number after this when it is built).
- `npm run check`, `npm test`, `npm run build`; update the five MD files; ask the user to test; push to main only when the user says "Push it".

### 9aa.3 What was built (2.31.0) and where it differs from the plan

Built in order A, B, C, D; `npm run check` and `npm test` (383 pass) after the build. Differences, all small:

- **Part A:** `scrollkeep.ts` (`screenKey`) and `render()` in `app.ts` keep each `[data-scroll]` box's place. Named: `game-<phase>-<round>` (results, game over, round start), `extra`, `reactions`, `last`, `rules`, `sound`, `history-<title>`, `exit`. The pause overlay is not named: it has no scrolling box (no `overflow-y` rule applies to it).
- **Part B:** the hand-area buttons come from a new `handFastItems(g)` in `game.ts`, which applies the labels of item 4 (`Stop fast forward`, `Stop`). `fastForwardMenuItems` is unchanged, so the ☰ menu keeps its items as before. The `big` option of item 3 was not needed.
- **Part C:** the jokers and hidden-deck chips are built by `dealChips(s)` and sit after the pause button in the top bar. They show a number beside the icon (jokers: `icon` + `2`, with the aria label "2 jokers"). When jokers are off the chip shows `0`. `gameFrame` takes `extraAt: 'top'`, which `beforeRound()` uses. `testbed/bot.js` now finds the round-start button by its exact label `Start` (the bot matched the old label).
- **Part D:** the step is computed in `roundTable` from the box it draws with (`lastStyle` sets `--step` on `.table-last`), not from `lay.box`, because `roundTable` may shrink the box with `fitBox`. The cards and the slap mark inherit `--step`. The old `.lt-card` margin rule was removed (the cards are absolutely placed now).
- **Known, not part of 9aa:** the 2.30 missing-suit notice has an OK button that `testbed/bot.js` never taps, so `python3 testbed/playthrough.py` stops at 5 and 8 players (the unmodified 2.30 build stops at the same place). Fixing the bot needs approval (`CLAUDE.md` rule 2).

Browser checks (headless Chromium, 384 × 730, scripted games; probe kept outside the repo):

- Against the computer, 3 and 5 players: finished, no page errors. Round-start buttons "Deal again?" and "Start" are 44 px tall, one line, no overflow. The target row sits at the top of the table, and "You" is not covered.
- One phone, 8 players: finished, no page errors. The top bar shows the jokers chip during the deal; the last-trick stack shows each card's number and suit.
- Against the computer, 5 players: the hand area shows Fast forward and Skip to end of round when the player has no cards. At this width "Skip to end of round" wraps to two lines (48 px tall, not cut off).
- Results screen: the scroll place stayed the same across three redraws (the list is short, so it sat at its maximum).

Not checked: landscape phones, widths under 340 px (the stacked hand buttons), the network game on two phones, and the "Stop" states in the hand area.

**2.31.1 (fix after the first phone test):** Manual / Auto, the hint and the Play button were about 32 px right of centre, because the action slot's padding was 76 px left and 12 px right. The padding is now 76 px on both sides, and `.round-buttons` reaches into the right padding (`margin-right: -64px`), so its width is unchanged. The selected card at the peak of the fan was cut off at the top, because `.game-hand-slot` had `overflow: hidden`; it is now `visible`. Checked in the headless browser at 384 × 730: the deal bar's centre offset is 0 px, Play is centred, the raised 4♥ shows in full, and "Deal again?" / "Start" are still 136 px wide and 44 px tall.

#### Phone checklist (2.31)
  1. vs-computer game, finish a round. On the results screen, scroll down to the ready buttons. As the computer players tap ready (and as you tap yours), the screen stays where you scrolled it.
  2. Open ? quick rules mid-game and scroll down; the page stays put while computer players move.
  3. Go out before the computer players. "Fast forward" and "Skip to end of round" sit where your cards were. Tap Fast forward: the buttons change to "Stop fast forward" and "Skip to end of round". Tap Skip: the round finishes. End this game is still in ☰ only.
  4. Deal screen: the jokers chip is in the top bar; the hint and Manual / Auto / Deal all are fully visible.
  5. After the deal: "Deal again?" and "Start" are each on one line and not cut off; the target-score row no longer covers your "You" pill.
  6. Play a few tricks with 4 and with 8 players. The "last" stack shows each card's number and suit in its own corner, nothing overlapping; a slap shows the red hand beside the stack, not over it. Tap it: the big last-trick sheet still opens.
  7. Network game (two phones): results screen keeps its scroll place when the other phone taps ready.

## 9ab. Version 2.32: the asker's vote is YES, and a vote waits until everyone has voted (PLAN, user 2026-11-13 22:04; BUILT 2.32.0, not committed; spec `PROJECT.md` 12n)

Built after the user said "Build CODE.md 9ab" (CLAUDE.md rules 1 and 2). This is a rules change: the spec in `PROJECT.md` 12n is the decision; section 1.1 and 2a are updated in the same build. Nothing new is sent between phones (the ballots already are). Status: Parts A to C done; `npm run check`, `npm test` (386 pass) and `npm run build` pass. Testbed not changed (see `TODO.md` Phase 4m).

### 9ab.0 Read first

- `src/rules/voting.ts` `tallyVote(ballots, playerCount)`: today it returns `passed` as soon as more than half say yes, `failed` as soon as more than half say no, else `hostDecides`. Two-player branch: `failed` on any no, `passed` on two yes, else "still waiting" (it reuses `hostDecides`).
- `src/session/session.ts`: `callVote` (about line 476) sets the asker's ballot as yes only when `s.order.length === 2`. `castVote` (about line 237) resolves on `passed`/`failed` and does nothing on `hostDecides`. `closeVote` (about line 249) tallies, then the host decides if there is no majority. `needsHost` (about line 555) sets `awaitingHost`.
- `src/ui/roundstart.ts`: the vote screen (about lines 41 to 171) shows YES / NO buttons to every player, "Waiting for …", the host's "Count now" (`countNowButton`), and `hostDecidesStage` (about line 273).
- `src/content/quick-rules.md`: the Votes card.
- Tests: `tests/rules/scoring-voting.test.ts`, `tests/session/session.test.ts`, `tests/session/draw-target-two-players.test.ts`, `tests/ai/moves.test.ts`, and `tests/ai/botgame.ts` (computer players play whole games with votes).
- Testbed: `testbed/main.ts` and `testbed/bot.js` vote as well; check every call of `tallyVote` and every "YES" tap.

### 9ab.1 Part A: the rules (`src/rules/voting.ts`, `src/session/session.ts`)

1. `tallyVote(ballots, playerCount, final = false)`:
   - Two players: unchanged.
   - Otherwise, if `!final` and the number of ballots is less than `playerCount`, return `waiting` (a new value of `VoteTally`).
   - Otherwise: more than half yes → `passed`; more than half no → `failed`; else `hostDecides`.
   - Update the doc comment to match.
2. `callVote`: when `by !== null`, the ballots start as `{ [by]: 'yes' }` for every kind (reshuffle, target, ultimate), not only for two players. When `by === null` (the automatic Ultimate vote), start empty.
3. `castVote`:
   - Refuse with `fail('You already voted')` if the player already has a ballot (the asker).
   - Tally with `tallyVote(ballots, n)`. `passed` or `failed` → `resolveVote` as now. `waiting` → keep the vote open. `hostDecides` → now the everyone-has-voted tie: call `needsHost(...)` so the host decides (before, this case was only reached on a tie as well, so check the code path).
4. `closeVote`: `tallyVote(v.ballots, n, true)`. `passed`/`failed` → resolve. `hostDecides` → `needsHost` (as now). Remove nothing else.
5. The two-player `closeVote` line (`if (s.order.length === 2) return resolveVote(s, false, ...)`) stays.
6. Computer players (`src/ai/decide.ts`) keep voting as now. They always cast a ballot, so the vote completes.

### 9ab.2 Part B: the screens (`src/ui/roundstart.ts`, `src/content/quick-rules.md`)

1. The asker's phone (the player whose id is `calledBy`, when it is not null) shows no YES / NO buttons. It shows the question and "You asked: your vote is YES". The live ballot list shows the asker as YES on every phone.
2. Everyone else: YES / NO as now. While the vote is `waiting`, every phone shows "Waiting for <names of players with no ballot yet>" (the existing "Waiting for …" text, with the names listed). Remove the "No majority" line from `waiting`; it only belongs to `awaitingHost`.
3. The host keeps "Count now" (`closeVote`). The host's count-now button shows once at least one ballot exists (as now).
4. Quick rules, Votes card: "The person who asks is a YES. Nothing is decided until everyone has voted. A majority of more than half the players passes or fails the vote; a tie goes to the host. The host can count the votes early."
5. The result pop-up is unchanged.

### 9ab.3 Part C: tests

- `tests/rules/scoring-voting.test.ts`:
  - `tallyVote` with 3 players and 1 yes: `waiting`. With 3 yes: `passed`. With 2 yes and 1 no: `passed`. With 1 yes, 2 no: `failed`.
  - 4 players, 2 yes and 2 no, all voted: `hostDecides`. With `final = true` and 2 yes of 4 (two missing): `hostDecides`; with 3 yes of 4 and `final = true`: `passed`.
  - Two players: the existing tests still pass.
- `tests/session/session.test.ts` (new cases):
  - 3 players call a reshuffle: the asker's ballot is yes, the vote is open. One other votes yes: still open. The last votes yes: `passed`.
  - 4 players: asker yes, one yes, one no: still open; the fourth votes no: `hostDecides` → `awaitingHost`, then the host's `hostDecides` resolves it.
  - The asker's `castVote` is refused.
  - Automatic Ultimate Round (asker `null`): no ballot from anyone at the start.
  - `closeVote` with 3 of 5 yes (the asker plus two) and two missing: `passed` (more than half of five).
- `tests/ai/botgame.ts` and `tests/ai/moves.test.ts`: whole games with computer players still finish (votes complete).
- Run `npm run check`, `npm test`, `npm run build`.

### 9ab.4 Version and process

- **2.32.0** in `package.json`.
- Update all five MD files: `PROJECT.md` 1.1 and 2a (the rule text), 12n status; `CODE.md` 9ab status; `TODO.md` Phase 4m; `DEVLOG.md`; `CLAUDE.md` unchanged unless the rules change.
- Playable test build (`CLAUDE.md` rule 5): publish `dist/index.html` as the private test link; the user tests before "Push it".

### 9ab.5 Phone checklist (2.32)

1. Three players (one-phone or network). Player A calls "Deal again?": A's phone shows "You asked: your vote is YES" and no YES / NO buttons. The live ballots show A as YES. Player B votes YES: the vote stays open, "Waiting for C". C votes: the vote passes.
2. Four players: A asks; B YES; C NO. The vote stays open. D votes NO: the host decides (the host sees "Count now"-style host decision screen; the others see "the host is deciding").
3. Four players: A asks; B votes YES, C votes NO, D votes YES: passed (3 of 4 > half).
4. Target score vote on the results screen with 3 players: the proposer's yes counts; the vote waits for the third player.
5. Count now: with 3 players, A asks, B votes YES, the host taps "Count now" (C not voted): passed only if more than half of all 3 said yes (A and B: 2 > 1.5 → passed). Check it matches `PROJECT.md` 12n's open detail.
6. Two players: unchanged (asking agrees; the other player answers; no host decision).
7. Target reached: the automatic Ultimate vote has no asker; everyone votes (no automatic yes).

## 9ac. Version 2.33: seat discs with initials (option D) (PLAN, user 2026-11-13 22:46; BUILT 2.33.0, not committed; spec `PROJECT.md` 12o)

Built on the user's "Build CODE.md 9ac" (CLAUDE.md rules 1 and 2). Status: `seatInitials` and its tests, the layout, the discs and CSS done; `npm run check`, `npm test` (394 pass) and `npm run build` pass; headless screenshots at 384 × 730 (3, 5, 8 players), 320 × 568 (8) and 844 × 390 (5) checked by eye, no page errors. Build changes from the plan, all made for legibility: the count badge is `disc-count` (not `seat-count`, which the seat strip uses) and sits on the disc's upper corner, 1.3u out (plan said 1u), so it no longer covers two-letter tags; two-letter tags are 1u, three-letter tags 0.8u; tags compare every player in the session, the person included (so a bot named Soo-ah shows "So" when you are Sam). The user chose option D from the mock-ups of 2026-11-13 22:43: each other player's seat shows a round disc with their initial, the card count as a small badge on the disc, and the name under the disc. **Haiku builds this.** Follow the steps in order; do not change anything that is not listed. If something here does not match the code, stop and ask the user (do not guess).

What stays the same: your own seat (the "You · 13" pill), the fans of card backs, the waste pile, the last-trick corner, the middle zone, the tap areas (at least 44 × 44), `fitBox` and the collision rules (9w.3 rules 5 to 7), and every seat tag (host ★, dealer D, Away, place badge, thinking dots, computer icon).

### 9ac.0 Read first

- `src/ui/table.ts`:
  - `SeatSpot` (about line 116): `fan`, `bubble` (centre of the count bubble), `name` (top of the name line, with `align`), `hit`.
  - `seatLayout(n, box)` (about line 200): where each seat's fan, bubble and name go. Top edge: `bubble = { x, y: 0.95 * bh }`, `name = { x, y: by + 1.4u, align: 'center' }`. Left / right edges: `bubble.x = 0.95 * bh` in from the edge, `name` at the edge with `align: 'left'` / `'right'`.
  - `hitBox`, `bubbleBox` (2u square), `nameBox` (9u × 1.4u), `seatCollisions`, `fitBox`.
  - `roundTable` (about line 373): the seat loop (about line 400). For another player it pushes `edgeFan(...)`, a `span.seat-bubble` with the count, and a `span.seat-label` with `nameKids` (computer icon + `span.table-name`) and `seatTags(...)`.
- `src/ui/styles.css` (about line 915 to 950): `.seat-quiet`, `.seat-bubble`, `.seat-label`, `.table-name`, `.seat-quiet.turn .table-name` (gold), `.seat-quiet.away .table-name` (red), `.seat-quiet.out .seat-label` (half strength).
- Tests: `tests/ui/seats.test.ts` (no name or bubble in the middle, none over another, all inside the felt, tap areas 44 × 44), `tests/ui/layout.test.ts`.

### 9ac.1 Part A: the initials (new file `src/ui/initials.ts`, pure, no DOM)

Write one exported function:

```ts
/** CODE.md 9ac.1: the short tag on each seat's disc. Same input, same output. */
export function seatInitials(players: readonly { id: string; name: string }[]): Record<string, string>
```

Rules, in this order:

1. Clean each name: trim spaces. Split it into characters with `Array.from(name)` (so an accented letter or emoji counts as one character). Drop spaces inside it for the tag only (so "Soo ah" → "Sooah" for the tag; the name shown under the disc is unchanged). If the name is empty, use `?`.
2. Every player starts with **one character**: the first character, upper case (`toLocaleUpperCase()`).
3. If two or more players have the same tag (compare case-insensitively), **each of those players gets the first two characters**: the first upper case, the second lower case. Example: Mikhail and Maya → "Mi" and "Ma". Players whose first letter is not shared keep one letter (Soo-ah stays "S").
4. Still the same (for example Mikhail and Mike → "Mi" and "Mi"): those players get the first three characters ("Mik" and "Mik" is still the same, so go to rule 5). Never more than three characters.
5. Still the same after three characters (same start, or the same name twice): keep the one-letter tag and add a number by the order in `players`: "M1", "M2".
6. A name of one character just uses that character (it can't grow; rule 5 gives it a number if needed).

Who is compared: **every player in the session** (`s.players`), not only the players on this phone's screen, so a player's tag is the same on every phone and after the phone is passed. Use `sessionName` (the name shown at the table).

Tests, new file `tests/ui/initials.test.ts`:
- Soo-ah, Mikhail, Leila → S, M, L.
- Mikhail, Maya, Leila → Mi, Ma, L.
- Mikhail, Mike → "Mi" / "Mi" (same), then "Mik" / "Mik" (same), so rule 5: M1, M2.
- Mikhail, Mila → "Mi" / "Mi" (same), then "Mik" / "Mil" (different) → Mik, Mil.
- Sam, sam (same name, different case) → S1, S2.
- "  leila " → L. "Émile", "Eve" → É, E (different characters, so one letter each).
- One-character names "A", "Ab" → rule 3 gives "A" and "Ab" (different) → A, Ab.
- Empty name → "?".
- Eight players: every tag is different.

### 9ac.2 Part B: the seat layout (`src/ui/table.ts`)

1. The disc replaces the count bubble, **in the bubble's place**: `SeatSpot.bubble` stays the disc's centre (rename the doc comment to "Centre of the disc"; keep the field name `bubble` so the rest of the code still compiles).
2. Disc size: **2.6u** across (was a 2u bubble). Change `bubbleBox` to a 2.6u square around `bubble`, plus the badge (step 3): return the box that covers both (x from the disc's left to the badge's right, and so on).
3. The count badge: a circle **1.5u** across, centred **1u right and 1u up** from the disc's centre for the top and left edges, and **1u left and 1u up** for the right edge (towards the middle of the table, as in mock-up D). Hidden when the player is out.
4. The name goes **under the disc, centred**: in `seatLayout`, for every edge set `name = { x: bubble.x, y: bubble.y + 1.5u, align: 'center' }`.
5. `nameBox`: the name is **7u wide** (was 9u), 1.4u high, centred on `name.x`.
6. `hitBox` already joins the fan, the bubble box and the name box; with the new boxes it covers the disc and badge. Keep the 44 × 44 minimum.
7. Run the existing tests in `tests/ui/seats.test.ts` and `tests/ui/layout.test.ts`. They must pass unchanged: no disc, badge or name in the middle zone, none over another, over your pill, the waste pile or the last-trick corner, and all inside the felt (after `fitBox`). If one fails for some player count, change only the numbers in steps 2 to 5 (for example the badge offset 1u → 0.9u), never the tests, and write what you changed in `DEVLOG.md`.

### 9ac.3 Part C: drawing it (`src/ui/table.ts` `roundTable`, `src/ui/styles.css`)

1. In `roundTable`, work out the tags once per draw: `const tags = seatInitials(s.players.map((p) => ({ id: p.id, name: p.sessionName })))` (import from `./initials.ts`).
2. For another player (not `k === 0`), replace the `span.seat-bubble` with:
   ```ts
   h('span', { class: 'seat-disc', 'aria-hidden': 'true', style: rel(L.bubble.x, L.bubble.y) },
     h('span', { class: 'seat-initial' }, tags[id] ?? '?'),
     !out ? h('span', { class: `seat-count ${L.edge === 'right' ? 'at-left' : 'at-right'}` }, String(p.cardCount)) : null)
   ```
   The disc shows even when the player is out (at half strength, like the name now).
3. The name line (`span.seat-label`) stays as it is (computer icon, name, tags such as ★, D, Away, place, thinking dots), but it is now centred under the disc: use `translate:-50% 0` for every edge (the `align` is always `center` after 9ac.2 step 4), and class `al-center`.
4. The seat's `aria-label` keeps the full name (it already does, through `seatEl`).
5. CSS (`src/ui/styles.css`), next to `.seat-bubble` (leave `.seat-bubble` in place; it is no longer used by the table but other screens might use it, so check with a search before removing anything; if nothing else uses it, leave it anyway and note it in `DEVLOG.md`):
   ```css
   .seat-disc {
     position: absolute; translate: -50% -50%;
     width: calc(2.6 * var(--u, 11px)); height: calc(2.6 * var(--u, 11px)); border-radius: 50%;
     display: flex; align-items: center; justify-content: center;
     background: var(--cream); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
   }
   .seat-initial { font-weight: 800; line-height: 1; font-size: calc(1.2 * var(--u, 11px)); }
   .seat-disc .seat-count {
     position: absolute; top: calc(-0.35 * var(--u, 11px));
     min-width: calc(1.5 * var(--u, 11px)); height: calc(1.5 * var(--u, 11px)); padding: 0 0.2em; box-sizing: border-box;
     display: flex; align-items: center; justify-content: center; border-radius: 999px;
     background: var(--ink); color: var(--cream); font-size: calc(0.85 * var(--u, 11px)); font-weight: 800; line-height: 1;
   }
   .seat-disc .seat-count.at-right { right: calc(-0.35 * var(--u, 11px)); }
   .seat-disc .seat-count.at-left { left: calc(-0.35 * var(--u, 11px)); }
   .seat-quiet.turn .seat-disc { box-shadow: 0 0 0 3px var(--gold), 0 0 10px 2px rgba(242, 193, 78, 0.55); }
   .seat-quiet.away .seat-disc { box-shadow: 0 0 0 3px var(--danger); }
   .seat-quiet.out .seat-disc { opacity: 0.5; }
   ```
   Check the class name `seat-count` is not already used inside `.seat-quiet` for something else (it is used by the seat strip, `.seat-count` at about line 372 and 785 of `styles.css`). Because the new rules are scoped with `.seat-disc .seat-count`, the seat strip is not affected; check it still looks the same on the vote and swap screens (they use `seatStrip`).
6. A three-character tag ("Mik") must fit the disc: if it doesn't (in the headless check, 9ac.4), make `.seat-initial` smaller only when the tag has 3 characters (add class `three` and `font-size: calc(0.9 * var(--u, 11px))`).

### 9ac.4 Part D: checks and version

- `npm run check`, `npm test` (the new `tests/ui/initials.test.ts` plus all old tests), `npm run build`.
- Headless browser (Playwright, as in 9aa): a single-player game with 3, 5 and 8 players at 384 × 730 and 320 × 568, and one landscape 844 × 390. Screenshot each. Check by eye: every disc, badge and name visible and inside the felt; nothing over the trick in the middle, the waste pile, the last-trick corner or the "You" pill; the turn ring shows on the player whose turn it is.
- Version **2.33.0** in `package.json`.
- Update all five MD files: `PROJECT.md` 12o status; `CODE.md` 9ac status; `TODO.md` Phase 4n; `DEVLOG.md`; `CLAUDE.md` unchanged.
- Publish the test build to the usual private test link (`CLAUDE.md` rule 5). Do not commit or push until the user says "Push it".

### 9ac.5 Phone checklist (2.33)

1. Single player, 4 players (you + 3 computer players with different first letters): each other seat shows a disc with one letter, a dark count badge on the disc, and the name with the computer icon under it.
2. Rename two computer players so they start with the same letter (for example Mikhail and Maya): their discs show "Mi" and "Ma"; the others keep one letter.
3. The player whose turn it is has a gold ring on the disc.
4. A player who goes out: no badge, the disc and name fade, the place badge shows after the name.
5. 8 players: nothing overlaps; the trick in the middle is clear.
6. Network game: the same tags on every phone.
7. Landscape: the discs and names fit.

## 9ad. Version 2.34: points table, typed messages, away notice that doesn't push the table, seats not hidden by fans, your cards on "who leads?", backup and restore (PLAN, user 2026-11-14 00:09 and 00:11; written for Haiku; NOT BUILT; spec `PROJECT.md` 12p)

From the user's network game test of 2.33 (three screenshots). **Haiku builds this, one part at a time, in the order below.** Do not change anything that is not listed. If something here does not match the code, stop and ask the user (do not guess). Run `npm run check` and `npm test` after every part.

The problems:
1. The results screen has no table of points.
2. People can only send the fixed catch-phrases; they want to type their own messages during the game.
3. When someone is away, the red "X is away. The game waits for them to come back." note pushes the whole game screen down and cuts off the bottom (your hand, the "You" pill, the waste pile).
4. Other players' names, discs and card counts are covered by their fans of card backs (top seat: the count badge is hidden; left and right seats: the name runs under the fan).
5. Picking who leads (last round's winner): your cards are not shown until you have picked, so you can't use them to decide.
6. (00:11) Profiles seem to reset when the version updates; wants to export stats and import them again (Part F).

### 9ad.0 Read first

- `src/ui/netscreens.ts`: `netGameBody` (about line 31) returns `[connectionNotice(g), body]`; `connectionNotice` (about line 52); `results` (about line 142).
- `src/ui/game.ts`: `gameFrame` (about line 795); `chooseLeaderStage` (about line 949); `handBlock` (about line 1024); `reactionsLayer`, `react`, `showReaction`, `floatText` (about line 1257 to 1345).
- `src/ui/between.ts`: `resultsTable` (about line 67, **not used anywhere now**), `podium`, `resultsStage` (about line 259), `gameOverStage` (about line 305).
- `src/ui/table.ts`: `roundTable` seat loop (about line 425): kids are pushed in this order: `edgeFan`, `seat-disc`, `seat-label`.
- `src/ui/styles.css`: `.edge-fan` (z-index 1, about line 902), `.seat-disc`, `.seat-label` (about line 936 to 960), `.game-table-slot` (about line 1076, already `position: relative`), `.float-react` (about line 995).
- `src/net/lobby.ts`: `LOBBY_PROTOCOL` (line 16), message types `FromJoiner` / `ToJoiner` (about line 55 to 90), readers (about line 107 and 144).
- `src/ui/netplay.ts`: `sendReaction`, `hostGotReact`, `joinGotReact`, the burst limit (`REACT_BURST`, `REACT_WINDOW_MS`).
- `src/ui/netlobby.ts`: where `react` messages are routed (about line 1093 and 1311).
- `src/ui/app.ts` `render()` (about line 133): **every redraw rebuilds the page with `root.replaceChildren`**. This matters for Part B.

### 9ad.1 Part A: seats are never hidden by fans (`src/ui/styles.css` only)

Cause: inside a seat, `.edge-fan` has `z-index: 1`; `.seat-disc` and `.seat-label` have no z-index, so the fan is drawn over them.

1. Add `z-index: 2;` to `.seat-disc` and to `.seat-label`.
2. So a name stays readable on top of red card backs, give `.seat-label` a soft dark backing: `background: rgba(0, 0, 0, 0.45); padding: 1px 6px; border-radius: 999px;`. Keep the existing text-shadow and the 0.7 opacity rule; change `.seat-quiet .seat-label` opacity only if the name becomes hard to read in the headless screenshots (then use `opacity: 0.85`).
3. Do not move any seat. The layout tests (`tests/ui/seats.test.ts`, `tests/ui/layout.test.ts`) must pass unchanged.

Check: headless screenshots (as in 9ac.4) at 384 × 730 with 4, 5 and 8 players, mid-trick: every disc, count badge and name is fully visible on top of the fans.

### 9ad.2 Part B: the away notice floats over the table (`src/ui/netscreens.ts`, `src/ui/styles.css`)

Today `netGameBody` returns the notice **before** the game screen, so the fixed-size game screen (sized to the whole window by `gameLayout`) is pushed down by the notice's height and its bottom is cut off.

1. Shorter text in `connectionNotice`:
   - one away: `"<name> is away · waiting for them"`; several: `"<a>, <b> are away · waiting for them"`.
   - lost (the `gone` case): keep the current words.
   - Give it the classes `note warn net-lost table-notice`.
2. In `netGameBody`, build `body` first, then the notice. If the notice is not null **and** the body is a game screen, put the notice inside the table area instead of before it:
   ```ts
   const notice = connectionNotice(g);
   const frame = body instanceof HTMLElement && body.classList.contains('game-frame') ? body : null;
   const slot = frame?.querySelector('.game-table-slot');
   if (notice && slot) { slot.appendChild(notice); return body; }
   return [notice, body]; // screens that scroll (results, waiting) keep it on top, as now
   ```
   (`dealingStage`, `beforeRound`, `chooseLeaderStage`, `noticeStage`, `playHandStage` all return `gameFrame(...)`; check each one in the code. If one returns an array or wrapper, find the `.game-frame` with `querySelector` on it instead.)
3. CSS, new rule:
   ```css
   /* 9ad.2: the away notice floats in the empty band above the "You" pill; it never moves the rows. */
   .game-table-slot > .table-notice {
     position: absolute; left: 50%; bottom: 22%; translate: -50% 0; z-index: 6;
     max-width: 80%; margin: 0; padding: 6px 12px; border-radius: 12px;
     font-size: 0.85rem; line-height: 1.25; text-align: center;
     background: rgba(60, 22, 16, 0.88); border: 1px solid var(--danger); border-left-width: 1px;
     pointer-events: none; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
   }
   ```
4. The away seat already shows a red ring and "Away" (2.33), so the notice is a reminder, not the only sign.

Check: headless, network game is hard to fake, so add a test hook only if one exists already; otherwise check by eye on the phone (9ad.7). At minimum, in a headless single-player game, inject a fake `.table-notice` into `.game-table-slot` with the browser console and screenshot it: the table, hand and buttons do not move.

### 9ad.3 Part C: your cards on the "who leads?" screen (`src/ui/game.ts` `chooseLeaderStage`)

Today: `stageLayout(false, 52)` (no hand row) and no `hand`. 

1. Work out whose cards to show: `const mine = ownSeat(g) === winner;` (network game and single player: this phone's player is the winner).
2. If `mine`: use `stageLayout(true, 52)` and pass
   `hand: handBlock(s, playerView(s, winner), null, { head: false, fit: lay.handH, width: lay.handW })`
   to `gameFrame` (same call as `beforeRound` in `netscreens.ts`). The cards are not tappable (`onTap` null).
3. One-phone game (`ownSeat(g) === null`): everyone can see the screen, so the hand is hidden by default. **Default (user can change):** a button `Show my cards` in the action bar beside the question; tapping it shows `winner`'s hand (store a flag in module state `leaderPeek = s.round`; clear it when the phase changes). The question line then reads `<winner>: who leads?`.
4. The screen's text stays `You: who leads?` / `<winner>: who leads?`.
5. `netscreens.ts` already calls `chooseLeaderStage(g)` for the winner's phone; other phones keep `waitingFor(...)`, which already shows their own hand. No change there.

Check: unit tests unchanged; headless single-player game where you win round 1 (use the existing playthrough bot or Fast forward): the "who leads?" screen shows your cards in the hand row and tapping a seat still picks the leader.

### 9ad.4 Part D: a points table on the results screen (`src/ui/between.ts`, `src/ui/netscreens.ts`, `src/ui/styles.css`)

Replace the unused `resultsTable` with a full score sheet. Keep the podium.

1. New exported function in `between.ts`:
   ```ts
   /** CODE.md 9ad.4: every player's points for each round, and the total. */
   export function scoreSheet(s: Session, opts: { me?: PlayerId } = {}): HTMLElement | null
   ```
   - Rounds: `s.rounds.filter((r) => !r.ultimate)`. If there are none, return `null`.
   - Rows: every player in `s.order`, sorted by the latest `totals` (highest first; ties keep `s.order`).
   - Columns: `#` (place by total, shared place for equal totals: "1st", "=2nd"), `Player`, one column per round headed `R1`, `R2`, … with that round's `points` signed (`+2`, `−1`, `0`), then `Total` in bold.
   - The player's own row (`opts.me`) gets class `me-row` (gold text). The loser of the latest round keeps the existing `loser-row` look on their cell for that round only (class `lost` on the cell).
   - More than 6 rounds: the table scrolls sideways inside the panel; `Player` (left) and `Total` (right) stay put (`position: sticky`).
   - Ultimate Round: not a column (it is outside the score). If `s.ultimateLabels` exists, show a small `Ultimate Winner` / `Ultimate Loser` tag after the name, as in the game-over screen.
   - Wrap it: `h('section', { class: 'panel score-sheet', 'aria-label': 'Points table', 'data-scroll': 'scores' }, h('table', { class: 'results' }, …))`. The `data-scroll` keeps its sideways place between redraws (2.31): also keep `scrollLeft`, not just `scrollTop`; see step 5.
2. Delete `resultsTable` (it is not used; search first to be sure).
3. Put it on the screens, right **under the podium**:
   - one phone: `resultsStage` in `between.ts`;
   - network and single player: `results` in `netscreens.ts` (pass `{ me }`);
   - game over: `gameOverStage` in `between.ts`, under the final standings (check what it already shows; if it already has a per-round table, leave it and tell the user).
4. CSS:
   ```css
   .score-sheet { overflow-x: auto; padding: 8px; }
   .score-sheet table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; font-size: 0.9rem; }
   .score-sheet th, .score-sheet td { padding: 4px 6px; text-align: center; white-space: nowrap; }
   .score-sheet th:nth-child(2), .score-sheet td:nth-child(2) { text-align: left; position: sticky; left: 0; background: var(--panel, #1f3b2a); }
   .score-sheet th:last-child, .score-sheet td:last-child { position: sticky; right: 0; background: var(--panel, #1f3b2a); font-weight: 800; }
   .score-sheet tr.me-row td { color: var(--gold); }
   .score-sheet td.lost { color: var(--danger); }
   ```
   Use the real panel colour variable from `styles.css` (search `.panel {`), not the fallback.
5. `src/ui/app.ts` `render()`: where it saves and restores `scrollTop` for `[data-scroll]`, also save and restore `scrollLeft` (same map, store `{ top, left }`). Update `tests/ui/scrollkeep.test.ts` only if it tests that shape.
6. Tests, new file `tests/ui/scoresheet.test.ts` — test a **pure** helper, not the DOM: move the row and place logic into `export function scoreRows(s: Session): { id: PlayerId; place: string; points: number[]; total: number }[]` in `between.ts` (or a new pure file `src/ui/scores.ts` if `between.ts` imports DOM code that breaks under `tsx --test`; check how `initials.test.ts` imports). Cases: sorted by total; equal totals share a place ("=2nd"); Ultimate rounds are not columns; a player with no points in a round shows 0.

### 9ad.5 Part E: type your own message (`src/ui/game.ts`, `src/net/lobby.ts`, `src/ui/netplay.ts`, `src/ui/netlobby.ts`, `src/ui/styles.css`)

What the user sees: the 😂 sheet gets a text box at the top: `Say something…` and a `Send` button. A sent message floats up from the sender's seat with their name, on every phone, the same way a catch-phrase does (but stays a little longer: 4 s). Under the box, the phone's last 5 sent messages show as chips to send again with one tap.

**Defaults chosen (user can change):** 60 characters at most; works in every game type (on one phone it simply floats on that phone); messages are not saved in the game record or stats; no word filter; computer players don't answer typed messages; the same flood limit as reactions (6 in 3 s per phone).

1. **The text box must survive redraws.** `render()` rebuilds the whole page on every update (network moves, votes, other people's reactions), which would wipe what you've typed and close the keyboard. So the message bar is **not** built in `reactionsLayer`. Instead:
   - In `game.ts`, create it **once** (module-level, lazily on first use): `const msgBar = h('form', { class: 'msg-bar' }, input, sendBtn)`, with `input = h('input', { type: 'text', maxlength: 60, placeholder: 'Say something…', 'aria-label': 'Your message', autocomplete: 'off', enterkeyhint: 'send' })`.
   - Append it to `document.body` (not to the app root) the first time, and from then on only toggle a class: `msgBar.classList.toggle('open', open)` from `reactionsLayer` every render (open = `getState().reactionsOpen` and the game is on show and not `gameOver`). Because it lives outside the root, `replaceChildren` never touches it.
   - The `resize` handler in `app.ts` already skips redraws while an input has focus (2.28.1); keep that.
   - `onsubmit`: `preventDefault()`; text = `input.value.trim()` with runs of spaces squashed to one; if empty, do nothing; else `sendMessage(text)`, clear the input, keep focus (so the keyboard stays up for the next one).
2. **Recent messages:** keep the last 5 distinct sent texts in `localStorage` key `pubby.recentMessages` (wrap reads and writes in try/catch, as `storage.ts` does). Show them as `phrase-chip` buttons at the top of the reactions sheet (inside `reactionsLayer`, which is fine to rebuild: they are just buttons). Tapping one sends it.
3. **Showing a message:** generalise the reaction float. Add `export function showMessage(from: PlayerId, text: string): boolean` next to `showReaction`; it reuses the same seat lookup and `.float-react` element with an extra class `msg` (longer animation, 4 s, wraps to two lines, max-width 70vw). This phone's own message floats from its own seat (the "You" pill), not from the finger, so it reads as "you said". Plays the `reaction` sound.
4. **Network messages** (`src/net/lobby.ts`):
   - Bump `LOBBY_PROTOCOL` to **9** and add to the comment: `9: typed messages (2.34)`.
   - `FromJoiner`: `| { t: 'say'; text: string }`. `ToJoiner`: `| { t: 'say'; from: string; text: string }`.
   - Readers: accept only a string; trim it; reject empty; cut to 60 characters with `Array.from(text).slice(0, 60).join('')` (so an emoji is not cut in half). Same in both readers.
   - Tests in `tests/net/lobby.test.ts`: a good `say` reads; empty, non-string and missing text are refused; 80 characters come back as 60.
5. **Passing it round** (`src/ui/netplay.ts`): copy the reaction functions:
   - `sendMessage(text)` (export): shows it here with `showMessage(me, text)`, then joining phone → `transport.sendHost({ t: 'say', text })`; host → every link `{ t: 'say', from: me, text }`. On a one-phone game (no `g.net`), just `showMessage` on this phone with the current player's id (one-phone: use the host's id, `s.hostId`, since nobody is "this phone's player").
   - `hostGotSay(linkId, text)`: same burst check as `hostGotReact` (share the `reactTimes` map so reactions and messages count together), `showMessage(p, text)`, then send to every other link.
   - `joinGotSay(from, text)`: `showMessage(from, text)`.
   - Route them in `src/ui/netlobby.ts` next to the two `react` branches (about line 1093 and 1311).
6. **Online rooms (Cloudflare relay):** the relay passes messages through without reading them (checked: nothing in `server/` looks at `t`), so no server change.
7. CSS:
   ```css
   .msg-bar { position: fixed; left: 8px; right: 8px; bottom: calc(env(safe-area-inset-bottom, 0px) + 84px); z-index: 60; display: none; gap: 6px; }
   .msg-bar.open { display: flex; }
   .msg-bar input { flex: 1; min-width: 0; font-size: 16px; /* 16px stops iPhone zooming in on focus */ padding: 10px 12px; border-radius: 999px; border: 1px solid var(--cream); background: rgba(0, 0, 0, 0.55); color: var(--cream); }
   .msg-bar button { border-radius: 999px; padding: 0 16px; }
   .float-react.msg { max-width: 70vw; white-space: normal; animation-duration: 4s; }
   ```
   Then place the reactions sheet just above the bar: find `.reactions-sheet` and raise its `bottom` by the bar's height (about 48px). Check by eye that the bar sits above the 😂 button and the sheet sits above the bar, and nothing covers the bar when the keyboard is open (iPhone and Android move fixed elements with the keyboard differently: test both, 9ad.7).
8. The quick rules: add one line to the Reactions card in `src/content/quick-rules.md`: "Type your own message in the box at the top of the reactions."

### 9ad.5b Part F: profiles survive updates; back up and restore stats (`src/ui/storage.ts`, new `src/ui/backup.ts`, `src/ui/app.ts` profiles screen, `src/ui/history.ts`)

User (2026-11-14 00:11): "each time the version updates, it shouldn't reset profile", and wants to export stats and import them again.

**What the code does today (checked):** nothing in Pubby clears profiles on a new version. They live in `localStorage` under fixed keys (`pubby.profiles`, `pubby.profiles.vsComputer`, `pubby.gameRecords`, `pubby.currentGame`); `sw.js` deletes only old *caches*, not storage. So when profiles vanish, the phone or browser threw the storage away. Likely causes, most likely first:
- **iPhone Safari deletes a website's storage after 7 days without a visit**, unless the site is added to the Home Screen.
- **Different address = different storage.** The private test links (claude.ai) and GitHub Pages (`mmans-99.github.io/pubby`) each have their own profiles; so do the Home Screen app and the same page in the browser on iPhone; and Chrome vs Samsung Internet on Android.
- The browser cleared "site data" when storage was low.

So the fix is (1) ask the browser to keep the storage, (2) a backup file to save and restore, (3) a test that old saved profiles still load.

1. **Ask to keep storage.** In `src/ui/storage.ts` add `export async function keepStorage(): Promise<boolean>`: if `navigator.storage?.persist` exists and `await navigator.storage.persisted()` is false, call `navigator.storage.persist()`; return the result; wrap in try/catch (return false). Call it once at start-up in `app.ts` (not awaited), and again right after a profile is created or a game record is saved (some browsers only grant it after the user has done something).
2. **Backup file** — new file `src/ui/backup.ts`. Split it so the logic is pure and testable:
   - Pure part (no DOM, no storage), e.g. in `src/session/backup.ts`:
     ```ts
     export interface Backup { app: 'pubby'; backup: 1; version: string; savedAt: number; profiles: Profiles; vsProfiles: Profiles; records: GameRecord[] }
     export function makeBackup(p: Profiles, vs: Profiles, recs: GameRecord[], version: string, now: number): Backup
     export function readBackup(raw: unknown): Backup | null   // checks app, backup === 1, objects/arrays and each profile's number fields; null if anything is wrong
     export function mergeBackup(local: { profiles: Profiles; vsProfiles: Profiles; records: GameRecord[] }, b: Backup): { profiles: Profiles; vsProfiles: Profiles; records: GameRecord[]; kept: string[]; replaced: string[]; added: string[] }
     ```
     (Move the `Profiles` type out of `storage.ts` into this file and re-export it from `storage.ts`, so the pure file doesn't import browser code.)
   - **Merge rules** (default; user can change):
     - Game records: join both lists by `id` (no doubles), newest first.
     - A profile only in the backup: added (`added`).
     - A profile in both (names compared ignoring case, as `findProfile` does): compare their `games` lists (the record ids already counted). If one list holds every id of the other, keep the one with more (`replaced` if the backup's wins, `kept` if this phone's wins). If each has games the other doesn't (played on two phones), keep the one with more `gamesPlayed` and list it in `kept`/`replaced`; the stats can't be added without counting shared games twice. Same for `vsProfiles`.
     - The game in progress (`pubby.currentGame`) is **not** in the backup and is never touched.
   - Tests `tests/session/backup.test.ts`: make → JSON → read gives the same data; a wrong `app`, a missing field, a text where a number should be → null; merge: a new profile is added; a smaller copy of the same profile is kept as the bigger one; records with the same id are not doubled; a name in a different case counts as the same profile.
3. **Saving the file** (`src/ui/backup.ts`, DOM): `saveBackupFile()`: `JSON.stringify(makeBackup(...), null, 1)` → `File` named `pubby-backup-YYYY-MM-DD.json`, type `application/json`. Share it with `navigator.share({ files })` when `navigator.canShare({ files })` (same pattern as `shareCsv` in `history.ts`); otherwise download it with a temporary `<a download>` link. If both fail, show the existing sheet (`csvSheetLayer`) with the JSON text and Copy (reuse `CsvSheet` with the JSON as `csv` and the `.json` filename).
4. **Restoring** (`src/ui/backup.ts`): a hidden `<input type="file" accept=".json,application/json">` created on tap (not kept in the page, so redraws don't matter). On pick: read with `file.text()`, `JSON.parse` in try/catch, `readBackup`. Bad file → toast "That isn't a Pubby backup." Good file → a confirm panel: "This backup has N profiles and M games (saved <date>, version X). Add it to this phone?" with **Add to this phone** (merge) and **Cancel**. After merging: save all three keys, then a toast like "Added 2 profiles, updated 1, 14 games." Block restoring while a game is in progress only if it would change a profile in that game (reuse the 2.2 rule that blocks deleting such a profile): say "Finish or close the current game first."
5. **Where the buttons go:** the Profiles screen (`profilesScreen` in `app.ts`), at the bottom: `Back up stats` and `Restore from backup` (line icons, no emoji). Keep the existing CSV share buttons as they are (CSV is for spreadsheets; the backup file is the one that can be read back in).
6. **Old saved data still loads (the "update" check).** In `storage.ts` `loadProfiles` / `loadVsProfiles`: fill in any missing field from `emptyProfile(name)` (`{ ...emptyProfile(k), ...v }` for each entry), and skip entries that aren't objects instead of failing. Test in `tests/session/backup.test.ts` (pure helper `normaliseProfiles(raw: unknown): Profiles`): a profile saved by an old build without `slapped`/`games` loads with them empty; junk entries are dropped; the rest stays.
7. **Quick rules:** one line in the Profiles card of `src/content/quick-rules.md`: "Your phone can delete saved data. Use Back up stats now and then; Restore puts it back. Add Pubby to your Home Screen so iPhone keeps it."

Phone checks (add to 9ad.7):
8. Profiles → Back up stats: the share sheet (or a download) gives a `pubby-backup-….json` file. Save it to Files / Drive.
9. Delete a test profile, then Restore from backup with that file: it comes back with its stats; nothing doubles if you restore twice.
10. Open the backup on the other phone (or GitHub Pages vs Home Screen app): Restore adds the profiles there.
11. Next version after 2.34: profiles are still there (on GitHub Pages, same browser).

### 9ad.6 Files likely to change

`src/ui/styles.css`, `src/ui/netscreens.ts`, `src/ui/game.ts`, `src/ui/between.ts` (or new `src/ui/scores.ts`), `src/ui/app.ts` (scrollLeft), `src/net/lobby.ts`, `src/ui/netplay.ts`, `src/ui/netlobby.ts`, `src/content/quick-rules.md`, `package.json`; Part F: `src/ui/storage.ts`, new `src/session/backup.ts` and `src/ui/backup.ts`, `src/ui/history.ts`, `src/ui/app.ts` profiles screen; tests `tests/ui/scoresheet.test.ts` (new), `tests/net/lobby.test.ts`, `tests/session/backup.test.ts` (new).

### 9ad.7 Version, checks and process

- Version **2.34.0** in `package.json`. Protocol 9 means phones on 2.33 can't join phones on 2.34 (they get the usual "update Pubby" refusal): tell the user everyone must reload.
- `npm run check`, `npm test`, `npm run build`; headless screenshots for Parts A, C and D (384 × 730 and 320 × 568, one landscape 844 × 390).
- Update all five MD files (`PROJECT.md` 12p status, `CODE.md` 9ad status, `TODO.md` Phase 4o, `DEVLOG.md`; `CLAUDE.md` unchanged).
- Do not commit or push until the user says "Push it" (push straight to main).

Phone checklist (2.34):
1. Results screen: a points table under the podium, one column per round, Total on the right, your row in gold, sorted by total. After 7+ rounds it scrolls sideways with names and totals staying put.
2. Open 😂: a text box at the top. Type a message and Send: it floats up from your seat on your phone and from your seat on every other phone, with your name. The keyboard stays up. Your last messages show as chips; tap one to send it again.
3. Type slowly while others are playing: what you've typed is not wiped by their moves.
4. Have one phone leave the app: the "is away" note shows as a small box over the table; the table, your hand and the buttons don't move or get cut off.
5. Top, left and right seats mid-trick: every name, initial and card count is fully visible over the fans.
6. Win a round, then at "who leads?": your cards show in the hand row before you pick.
7. One-phone game, the winner at "who leads?": cards hidden until "Show my cards" is tapped.

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
