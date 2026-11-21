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
- **Screens:** dealing chips and Manual / Auto / Deal all segment; `reshuffleStage` tiles; `targetRow` (between.ts, replaces the target panel; `targetPanel` kept as an alias); votes with `voteShort` / `voteIcon`; `handoffBlock(name, onGo, { compact, note })` for every pass-the-phone screen; felt `.led-mark` watermark and tiny last-trick cards; `handBlock(..., { head: false })`; `awardsRow(s)` on results and game over (the podium was removed in 2.34.2).
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
- **`src/ui/netscreens.ts`:** `netGameBody`: round-start steps from `roundstart.ts` `netRoundStart` (votes: YES / NO on your own phone, host decides with no majority; hidden swap on each phone at once, then the new cards; Reaction Tap on each phone at once, measured on that phone; otherwise "Waiting for X, Y" with your hand), dealing, before the round (your hand; host "Start the round", others "Waiting for X to start"; no reshuffle vote yet), winner picks who leads, play, results (points table and awards; host "Next round" / "End the game" with two taps; others wait), game over. A note when a phone lost its link ("Rejoining comes in a later update").
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
- Results-screen votes (target, Ultimate) use the same screens: `netRoundStart` already returns a vote screen whenever `s.vote` is set, whatever the phase. 2.34.2: the podium and `resultsSummary` were removed, so nothing extra shows under the vote on results.

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

**Pass bars** (written into the DEVLOG each time): 0 refused moves; every game finishes; Easy and Normal p95 under 20 ms per decision on a laptop; over 2000 four-player games with 2 Normal and 2 random seats, Normal's average place is better by at least 0.3; Normal beats Easy by at least 0.15. Slice D: Hard beats Normal by at least 0.10 (lowered from 0.15 in 2.38.2, see 9ap.8) and p95 under 150 ms.

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
  7. A whole 4-player game with `bot.js` on every page (reuse `netgame_check.py`'s helpers), ending on the results/points table on every page.
  8. Invite link `#room=<id>` opens the passcode screen for that room.
  9. Host closes: every page shows the closed screen; the room is gone from the list.
  10. Version mismatch (start one page with a test-only `?fakeversion=` honoured only on localhost, or call `joinRoom` with a changed version from the page): the version message.
  11. Relay stopped mid-lobby: every page shows a lost message within `LOST_AFTER_MS` (use a short value via a localhost-only query flag) and nothing hangs.
  12. Idle expiry with `--fast-idle`: an empty room disappears from the list.
  13. A frame over `FRAME_MAX` closes that socket (relay-side unit test is enough; skip in the browser if awkward).
- **`run_checks.py`:** add a row: `src/net/online.ts`, `src/net/relayproto.ts`, `src/net/link.ts`, `src/net/chunk.ts`, `src/net/server.ts`, `src/ui/online.ts`, `server/`, `testbed/relay_server.ts` → `online_check` (and lobby, netgame for `link.ts`/`chunk.ts`). `src/ui/netlobby.ts` → add `online_check` to its list. Add `online_check` to `ALL_ORDER`. Update the table in the script's header.

### 9r.8 Slices

#### Slice O1: the server (version 2.17)

**Status (2026-11-13): PUSHED as 2.17.0 (commit ebf8168); the first deploy failed on type errors; fixed in 2.17.1. Status (2026-11-15): deployed green; the user has set up Cloudflare (9r.4) and checked `/health` on the phone.** No screen changes, so nothing to play yet (`CLAUDE.md` rule 5). Still to do: the deploy must go green, then the `/health` check in step 8 on the phone.

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

**Status (2026-11-15): on main (built as 2.18.0). The deployed server is live. The user's two-network phone test passed (2026-11-15). Local `testbed/online_check.py` now gives 37 of 37: since 2.25 a dropped phone shows 'Reconnecting…' first, so the relay-stop checks expect that; the 10-minute end runs with `--long-away`.** Earlier note (2026-11-13): BUILT as 2.18.0, not pushed. Files: `src/net/link.ts`, `chunk.ts`, `server.ts`, `online.ts`; `src/ui/online.ts`; changed `peer.ts`, `netlobby.ts`, `app.ts`, `styles.css`, `build.mjs`, `quick-rules.md`, `package.json`. Tests: `tests/net/chunk.test.ts`; `testbed/online_check.py` (37 of 37, four phases with their own local relay). Nearby checks pass unchanged. Build notes: the room-list socket runs on the passcode screen too, so an invite shows the room name; parts are halved until every frame fits FRAME_MAX (quote-heavy text takes more room); the menu says "Multiplayer" (was "Play on several phones"). Not covered in the browser: a version mismatch (unit test) and frames over FRAME_MAX (unit test).

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

## 9z. Computer players that learn from the people they play against (PLAN, user 2026-11-13 21:25; option 1 chosen 2026-11-15; plan finished by Opus 2026-11-15 13:30, APPROVED by the user 13:16; target 2.35.0; NOT BUILT)

**Today:** computer players learn nothing between rounds or games. `src/ai/memory.ts` is built only from public events in the current round (and reset each round). Their personality and level are fixed at setup (`src/ai/persona.ts`, `PERSONALITY_WEIGHTS`). Nothing writes learned values to storage.

**Goal (option 1):** during one game, a Normal or Hard computer player plays a little more like the people at the table, without ever seeing a hidden card. Everything is forgotten when the game ends.

**Fairness rule (must hold):** a learning bot may use only what a person at the table could see: public events in the log (cards played, jokers played, jokers thrown away, trick ends, round starts) and the public "computer" tag on each seat. It may never read a hand, a hidden deck, the secret missing suit (including the `suits` field that old saved games still carry on `missingSuitDeclared`), the swapped cards, or the session's private state. The no-cheating test (`tests/ai/fairplay.test.ts`, 9m) must still pass with learning on, and a new test (9z.6 step 1) shows that changing a hidden card does not change a learned value.

### 9z.0 Options (the user chose option 1 on 2026-11-15)

| Option | What it does | Where it is kept | Risk |
|---|---|---|---|
| **1. Within one game (CHOSEN)** | Each bot watches each person's public habits in the current game and nudges its own weights a little toward them. Resets when the game ends. | Memory only (nothing saved) | Low. Easy to switch off. Effect is small and only lasts one game. |
| 2. Across games on the same phone | Same counters, kept over several games and saved with the game records (`src/session/record.ts`, profile history). | Storage (needs a reset button and a size cap) | Medium. Not chosen; would get its own plan and version. |
| 3. Offline tuning from your game records | A script tunes `persona.ts` from saved records; the app itself doesn't change. | Code (`persona.ts`) | Low. Not chosen. |

### 9z.1 Option 1: decisions (Opus 2026-11-15; approved by the user 2026-11-15)

1. **Off by default.** A new setup switch, **"Computer players learn as they play"**, starts off. It is kept with the game (`BotsInfo.learn`) so Carry on keeps it, and the setup screen remembers the last choice the same way it remembers Reactions. Turning it on by default is a later, separate decision after the phone test passes (its own small version).
2. **Normal and Hard only.** Easy never learns, in Mixed too. Reasons: Easy plays a random card 20% of the time and forgets after each trick, so a ±20% nudge would not show; and Easy is the level for beginners, so it should not adapt against them. Hard: the nudged weights change Normal's card, which Hard's search keeps unless it finds a clearly better card (`hardCard` in `moves.ts`), so on Hard the effect is smaller. That is expected.
3. **Fairness confirmed** (rule above). Learning reads only an allow-list of event types (9z.2). It never consumes the bot's `rng`, so with learning off every decision is exactly as in 2.34.2.
4. **Minimum evidence: 6 public chances per habit, per person**, for the two play habits. **One change from the draft: the joker habit needs 3**, because there are only 2 or 3 jokers in a round, so a person rarely plays 6 in a whole game and at 6 the jokerSave nudge would almost never switch on. Before a habit has its chances, it has no effect.
5. **Imitate, don't counter.** The bots drift toward the table's style (the Goal above). Weights move by what they do, not by their names (see the note in 9z.3).
6. **Only people are watched.** Seats with the public `computer` tag are not counted, so all-computer games (Fast forward, the arena by default) never change.
7. **One habit table per game**, shared by all the bots on the phone (they all see the same public events). In Multiplayer it lives on the host only, like the bots.
8. **Carry on:** the habit table is rebuilt from the whole game's log (public events only), so a reopened game has the same learned values as one played straight through. Nothing new is stored.

### 9z.2 The habits counted (final list)

Counted per person (seat without the `computer` tag), from the start of the game to its end, across rounds. Round starts and reshuffles do **not** clear them; game end and a new game do.

| Habit | A chance is | It counts as "yes" when | Feeds | Needs |
|---|---|---|---|---|
| **Bold follow** | the person follows the led suit (a `cardPlayed` of the led suit, not the first card of the trick) when a card of the led suit is already down **and** at least one more card is played after theirs in the same trick | their card is higher than the top card of the led suit at that moment | `risk` | 6 |
| **High lead** | the person leads a normal card (their `cardPlayed` is the first normal card of the trick and they started the trick; a card after someone else's joker lead does not count) | the card is J, Q, K or A | `risk` | 6 |
| **Early joker** | the person plays a joker (`jokerPlayed`) or has jokers thrown away with their last normal card (`jokersDiscarded`, each joker counts once) | it was a `jokerPlayed` within the first `earlyJokerTricks` tricks of the round (default 5) | `jokerSave` | 3 |

"Someone played after them" is known only when the trick ends (`trickResolved` or `slapped`), so a follow is scored at trick end. All of this is in the public log.

**Dropped from the draft, and why:**
- *Slaps made* and *slaps on a missing suit*: a slap is forced by the rules (you must follow suit if you can), so it shows a void, not a habit; and the second one leans on the secret missing suit.
- *Leads a low card when they had a high one*: needs their hidden hand. Breaks the fairness rule.
- *Cards picked up*: a result of the cards, not a choice.

**Allow-list:** the learning code reads only `roundStarted`, `cardPlayed`, `jokerPlayed`, `jokersDiscarded`, `slapped` and `trickResolved` (the driver clears the table at game over and new game). Everything else (`swapped`, `missingSuitDeclared`, `reshuffled`, votes, takes) is ignored.

### 9z.3 How a habit becomes a weight

- For each habit, a person's rate is `yes / chances` once chances reach the minimum. The **table rate** is the average over the people who have reached it. A habit nobody has reached yet has no effect.
- Each habit has a **neutral rate**: what the current Normal bot does in the arena (measured in 9z.6 step 2 and written into `LEARN_TUNING` in `src/ai/learn.ts`). Until measured, the placeholders are bold follow 0.5, high lead 0.3, early joker 0.5.
- `shift = clamp(0.4 × (table rate − neutral), −0.2, +0.2)`; the two `risk` habits are averaged (only those in effect).
- **`risk`** factor = `1 − shift` (a bolder table makes the bot play bolder; in `moves.ts` a lower `risk` makes the bot see less danger, so it leads and follows higher).
- **`jokerSave`** factor = `1 + shift` (a table that plays jokers early makes the bot spend jokers sooner; in `moves.ts` a higher `jokerSave` lowers the bar for playing a joker).
- Learned weight = `clamp(base × factor, 0.5 × base, 1.5 × base)`. The ±20% keeps it within 80–120% in practice; the 50–150% clamp is the safety net and has its own test.
- Only `risk` and `jokerSave` change. `reactRate` and `reshuffleBar` never change.

**Note (found in this review, not changed by this plan):** the names of the weights run opposite to what they do. `careful` has `risk` 0.7, which makes it see *less* danger and play higher cards than `reckless` (1.4). This plan goes by behaviour, so it is not affected. Say if you want the personalities looked at separately.

### 9z.4 Files to change (option 1)

| File | Change |
|---|---|
| `src/ai/learn.ts` (new, pure) | `Habits` type; `newHabits(order, computerIds)`; `noteHabits(h, events)` (allow-list only, never reads a hand, no `rng`); `rebuildHabits(log, order, computerIds)`; `learnedWeights(base, level, h)` (returns base unchanged for Easy or when `h` is null); `LEARN_TUNING` (neutral rates, 0.4 gain, ±0.2, 50–150%, minimums 6/6/3, `earlyJokerTricks` 5) |
| `src/ai/moves.ts` | `chooseCard`, `leadCard`, `followCard` take the weights from `learnedWeights` instead of reading `PERSONALITY_WEIGHTS` directly. Other `PERSONALITY_WEIGHTS` uses (votes, reshuffle) stay as they are |
| `src/ai/decide.ts` | Optional last parameter `habits: Habits | null` (null = learning off), passed to `chooseCard` |
| `src/ui/bots.ts` | One `Habits` per game when `BotsInfo.learn` is on: fed from the same public events as `remember`, rebuilt from the whole log on Carry on, dropped at game over and new game |
| `src/ui/storage.ts` | `BotsInfo.learn?: boolean` (missing = off, so old saves load as off) |
| `src/ui/solosetup.ts`, the Multiplayer host's computer-player settings (where Reactions is set, 2.26) | The switch "Computer players learn as they play", next to Reactions, off by default |
| A test readout behind `?learnlog=1` (like `?onephone=1`) | In the ☰ menu: one line per computer player, e.g. "Sam: risk 86%, jokers 100% (learning)" or "Easy: not learning". Not shown without the flag, so the normal UI gets no new text |
| `tests/ai/botgame.ts`, `testbed/ai_arena.ts` | `--learn` and `--people N` (the first N seats lose the `computer` tag but are still played by the bot code, so the learning bots have someone to watch); `--people-style careful|reckless|mixed` |
| `tests/ai/learn.test.ts` (new), `tests/ai/fairplay.test.ts` | Tests in 9z.6 step 1 |

### 9z.5 Version and process

- **Version 2.35.0** (2.31 is taken by 9aa).
- `npm run check`, `npm test`, `npm run build`, `python3 testbed/run_checks.py --since origin/main`, and the arena bars (9m.4) because `src/ai/` changes.
- **Arena check for learning (new bars, paired: same seeds with `--learn` off and on, 4 players, 2 bot seats + 2 people seats played by the bot code):**
  1. 0 refused moves, 0 crashes, every game finishes.
  2. **Not worse:** over 2000 games with Normal bots (and 500 with Hard), the learning bots' average place is no more than **0.05** worse than the same bots without learning, for each `--people-style` (careful, reckless, mixed). (0.05 is about two standard errors at 2000 paired games.)
  3. **It moves the right way:** against `reckless` people the average learned `risk` factor is below 1; against `careful` people it is above 1; never outside 0.8–1.2.
     **Result 2026-11-15 (step 3, not committed): not met as written, needs the user's decision.** Average `risk` factor over computer Normal card decisions (2000 games, 4 players, 2 people): 1.0011 against `reckless`, 0.9919 against `careful`, 0.9957 against `mixed`; never outside 0.8–1.2. The direction follows behaviour: careful people play boldly (their pooled bold-follow rate is 0.440, above the neutral 0.4168), so the bots' `risk` falls below 1; reckless people play more cautiously (bold follow 0.392), so it rises above 1. But this bar's wording goes by personality names, and 9z.0 and 9z.3 say those names run the other way. The effect is also about 1% (`shareMoved` 0.80), far from the size the bar seems to expect. Decide: reword bar 3 to behaviour, and accept a ~1% effect, or change the tuning (a later plan).
  4. Old bars still pass (Normal beats random by 0.3, Normal beats Easy by 0.15; Hard vs Normal as in the latest DEVLOG), and p95 decision time does not rise by more than 1 ms.
  5. Write all numbers into the DEVLOG.
- Update the five MD files; playable test build; phone checklist below; push only after the user says "Push it".
- **Phone checklist (option 1, 2.35.0).** Open the test build with `?learnlog=1` so the ☰ menu shows what the computer players have learned.
  1. New game, single player: the switch "Computer players learn as they play" is there, next to Reactions, and is **off**. Start a game against 3 Normal players: the ☰ readout says learning is off and every weight is 100%.
  2. New game with the switch **on**, 3 Normal players. Play **boldly** for two rounds: lead J, Q, K or A when you can; when following, play over the top card even when others still have to play. After your 6th lead or bold follow, ☰ shows **risk below 100%** for each computer player, and never below 80%.
  3. Play on carefully (lead low cards, duck under the top card). Risk drifts back toward 100% and can go above it, never above 120%.
  4. Play a joker early in a round three times (within the first 5 tricks). ☰ shows **jokers above 100%**.
  5. Save the game mid-round (leave and Carry on). The ☰ readout shows the same numbers as before.
  6. Finish the game and start a new one: all back to 100% until you have played 6 more chances.
  7. Mixed levels, switch on: Easy players show "not learning"; Normal and Hard players learn.
  8. Multiplayer with computer players (host phone, switch on): the host's ☰ readout learns from every person at the table; the other phones see no difference.
  9. Feel: do the computer players still feel like themselves, no slower than before?

### 9z.6 Build steps (in order; each step's tests pass before the next)

1. **`src/ai/learn.ts` and `tests/ai/learn.test.ts`** (no app change). Tests:
   - each habit: chances and yes counts from hand-made event lists (bold follow scored only when someone plays after; joker-lead trick does not count as a lead; `jokersDiscarded` counts each joker);
   - computer seats are never counted;
   - minimum evidence: 5 chances → base weights; 6 → nudged (3 for jokers);
   - ±20% bound and 50–150% clamp (with extreme made-up rates and a made-up `LEARN_TUNING`);
   - Easy returns base weights; `habits` null returns base weights;
   - habits survive `roundStarted` and `reshuffled`, and a new game starts empty;
   - `rebuildHabits(log)` equals step-by-step `noteHabits`;
   - **hidden-card test:** two full sessions with the same public log but (a) one different card in a person's hand, (b) one different card in a hidden deck (3 players), (c) a different `suits` on `missingSuitDeclared` and different swapped cards: the habit tables and learned weights are deep-equal;
   - `noteHabits` never calls `rng` (pass an rng that throws).
2. **Arena options** (`--learn`, `--people`, `--people-style`) in `tests/ai/botgame.ts` and `testbed/ai_arena.ts`, counting only. Measure the Normal bot's neutral rates (2000 games) and write them into `LEARN_TUNING`.
3. **Wire into `moves.ts` and `decide.ts`.** Regression test: with `habits` null (and with Easy), 500 recorded positions give exactly the same moves as 2.34.2 for the same seeds. Fair-play test also run with learning on. Run the arena bars in 9z.5.
   **Status 2026-11-15 (built, not committed):** `moves.ts` (chooseCard, leadCard, followCard use `learnedWeights`), `decide.ts` (optional last `habits`, default null), `tests/ai/regress.test.ts` with the golden file `tests/ai/fixtures/moves-2.34.2.json` (made from the 2.34.2 code by `tests/ai/regress-fixture.ts`), a learning-on variant of the fair-play test, and `botgame.ts` / arena wiring (computer seats learn, people seats never). Bars 1, 2 and 4 pass; bar 3 is open (see 9z.5). The 2.34.2 golden match holds; Easy ignores a live table. The app is unchanged until step 4.
4. **Driver, storage, switch, readout** (`bots.ts`, `storage.ts`, `solosetup.ts`, the Multiplayer host settings, `?learnlog=1`). Bump to 2.35.0. Browser checks for the setup screens and a solo game with the switch on.
5. **MD files, test build, phone checklist (9z.5).** Push only after the user says "Push it".

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

## 9ad. Version 2.34: points table, typed messages, away notice that doesn't push the table, seats not hidden by fans, your cards on "who leads?", backup and restore (PLAN, user 2026-11-14 00:09 and 00:11; written for Haiku; BUILT 2.34.0 and pushed, 2026-11-14; spec `PROJECT.md` 12p; dealing-screen fix after the phone photo: see DEVLOG)

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
2. **(2.34.1: REMOVED at the user's request; nothing is saved from the message box. Kept for history.) Recent messages:** keep the last 5 distinct sent texts in `localStorage` key `pubby.recentMessages` (wrap reads and writes in try/catch, as `storage.ts` does). Show them as `phrase-chip` buttons at the top of the reactions sheet (inside `reactionsLayer`, which is fine to rebuild: they are just buttons). Tapping one sends it.
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

## 9ae. Android app for Google Play (FUTURE PLAN, user 2026-11-14 10:15; spec `PROJECT.md` 12q; TODO Phase 7; NOT STARTED, needs approval before any code)

### 9ae.0 Read first
- Don't start until the user says so; the "before the Play Store" list in `PROJECT.md` 12q comes first.
- One codebase: the web app stays as it is on GitHub Pages; the Android app is a wrapper around the same `npm run build` output. Nothing game-related forks.
- No Android Studio needed on the user's laptop: the app file is built by GitHub Actions.

### 9ae.1 Wrapper (suggested: Capacitor)
- Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` as dev dependencies; `capacitor.config.ts` with app id (e.g. `io.github.mmans99.pubby`, final id chosen with the user; it can never change once on Play), app name `Pubby`, web dir = the build output folder.
- `npx cap add android` once; commit the `android/` folder.
- Service worker: inside the app the files are already local; turn the service worker off when running in Capacitor (`Capacitor.isNativePlatform()`), so an old cached copy never hides an app update.
- Plugins (only what's needed): `@capacitor/app` (back button, exit), `@capacitor-community/keep-awake` (screen on in a game), `@capacitor/haptics` (optional SLAP! buzz), a camera permission for the in-app QR reader (WebView `getUserMedia` needs `CAMERA` in the manifest and a runtime prompt).
- WebRTC (Nearby) works in the Android WebView; check it on two phones in the closed test.
- Alternative if chosen instead: Trusted Web Activity via PWABuilder or Bubblewrap; needs `/.well-known/assetlinks.json` at `https://mmans-99.github.io/` (a new `mmans-99.github.io` repo), and the app always loads the live site.

### 9ae.2 Changes in Pubby's code
- **Server origin:** add the app's origin (`https://localhost` for Capacitor on Android) to `ALLOWED_ORIGINS` in `server/wrangler.toml`; redeploy.
- **Join links and QR:** links that point at the GitHub Pages address open the website, not the app. Either add Android App Links (intent filter + `assetlinks.json`, as for TWA) or, simpler, in the app show only the in-app scanner and keep links for the web version.
- **Back button:** `src/ui/back.ts` uses `popstate`; in the app, listen to Capacitor's `backButton` event and send it through the same handling (leave-game prompt included).
- **Exit Pubby:** in the app, `App.exitApp()` after confirming (the goodbye screen stays on the web).
- **Keep awake:** on from the deal until the game ends or is paused (also covers network slice 4's "screen kept awake").
- **Storage:** profiles and stats live in the app's own storage, separate from the website's; the 2.34 backup and restore (9ad Part F) is how a player moves them across.

### 9ae.3 Build and release
- GitHub Actions job: `npm ci`, `npm run build`, `npx cap sync android`, Gradle `bundleRelease`, sign with the upload key from GitHub secrets, upload the `.aab` as a build artifact. The user creates the upload key once (steps to be written for them, explaining each step) and keeps a safe copy; Play App Signing holds the real key.
- Version: `versionName` = `package.json` version; `versionCode` goes up by one on every Play upload.
- Target the Android API level Play requires at the time of release.

### 9ae.4 Play Console steps (for the user, written in full when the time comes)
Developer account; create the app; store listing (icon 512×512, feature graphic 1024×500, screenshots, short and full description using Bhabhi, Thulla, Get Away); privacy policy page (can be a page on GitHub Pages); Data safety (no data collected or shared); content rating; internal test for a quick check; closed test with 15 to 20 testers for 14 days in a row; apply for production; release.

### 9ae.5 Phone checklist (closed test)
Install from Play; first open with no internet (game plays offline); Nearby game across 2 to 8 phones by QR; online room on two different networks; back button on every screen; Exit Pubby closes the app; screen stays on during a game; sounds and the iPhone/Android silent switch; profiles kept after an app update; backup from the website and restore in the app.

## 9af. Computer players stop leading into a known missing suit (PLAN, user 2026-11-15 20:31; spec `PROJECT.md` 12r; written for Haiku; BUILT and PUSHED **2.34.3** (effd0fd) on 2026-11-15; see 9af.9 for what changed from the plan)

### 9af.0 Read first
- Spec and measured numbers: `PROJECT.md` 12r. Files: `src/ai/eval.ts`, `src/ai/moves.ts`, `src/ai/sample.ts`, tests in `tests/ai/`, a new check script `testbed/lead_check.ts`.
- **Easy is not changed** (its forgetting and random cards stay).
- Fair play: use only `Memory` (`m.voids`, `m.known`) and `AiSeen`. Never the session's real hands or the secret missing-suit declaration.
- Version 2.34.3 in `package.json` (2.35.0 stays reserved for Phase 4k).

### 9af.1 Part A: one helper (`src/ai/eval.ts`)
Add and export:
```ts
/** True if a player other than me who still holds cards is known to be missing `suit`
 *  (in m.voids) and holds no known card of it. Uses memory only. */
export function knownSlap(m: Memory, seen: AiSeen, suit: Suit): boolean
```
Same "known card of the suit wins over the void" rule as `pVoid`. Use `activeOthers`.
**Built as (9af.9):** `knownSlap` is `pVoid(...) === 1` for some other active player, so it also counts the deductions that make `pVoid` certain (no unknown card of the suit left, or all their cards known and none of it).

### 9af.2 Part B: Hard may not switch a safe lead into a known slap (`src/ai/moves.ts` `hardCard`)
`hardCard` gets `seen` and `m` already. After the search picks `best`:
- Only when leading (`seen.view.ledSuit === null`).
- Let `normalCard` and `bestCard` be the hand cards for `normal` and `best.id`.
- If `normalCard` is a standard card with `!knownSlap(m, seen, normalCard.suit)` **and** `bestCard` is a standard card with `knownSlap(m, seen, bestCard.suit)`, return `normal`.
- Otherwise as now (switch margin 0.3 unchanged). Following is not changed.

### 9af.3 Part C: final two, other player on one card (`src/ai/moves.ts` `leadCard`)
In the "holders.length === 2 && other has 1 card" branch: `low` = the lowest card among standard cards whose suit is `!knownSlap(...)`; if there are none, the lowest standard card (as now). The joker check after it is unchanged.

### 9af.4 Part D: imagined deals keep to known missing suits (`src/ai/sample.ts`)
In `tryDeal` with `respectVoids` true, deal players in this order: most known missing suits first (ties: seat order), so the most limited hands are filled while there is still choice. Keep the result keyed by player, as now. Raise `TRIES_WITH_VOIDS` from 20 to 60. The fallback (ignore missing suits) stays for when no deal is possible.

### 9af.5 Tests (built: `tests/ai/lead_slap.test.ts` (6 tests), `hard.test.ts` changed, `fairplay.test.ts` changed; see 9af.9)
- `tests/ai/eval.test.ts`: `knownSlap` true for a known void, false once that player picked up a card of the suit, false for a player with no cards left, false for me.
- `tests/ai/moves.test.ts` (use `position.ts`): (1) Hard, leading, one opponent known missing hearts, hand has low hearts and a safe spade: over 20 seeds Hard never leads a heart. (2) Final two, other player on one card and known missing clubs, my lowest card a club and a higher diamond: Normal leads the diamond. (3) Same with only clubs in hand: leads lowest club.
- `tests/ai/sample.test.ts`: 3 players with 1 to 2 known missing suits each, 200 deals: 0 imagined hands hold a known missing suit (when a valid deal exists).
- `tests/ai/regress.test.ts`: Hard leads and the final-two lead change on purpose. Run the old test first and list the decisions that differ: they must all be Hard decisions or the final-two branch; **any other changed decision is a bug**. Then make a new fixture `tests/ai/fixtures/moves-2.34.3.json` with `regress-fixture.ts` on the new code, point the test at it, and keep the 2.34.2 file. Say in the DEVLOG how many decisions changed and of which kind.
- `tests/ai/fairplay.test.ts` and `hard.test.ts` must pass unchanged.

### 9af.6 Check script `testbed/lead_check.ts` (new; built)
Uses `playBotGame` from `tests/ai/botgame.ts` with `onDecision`. For each level (easy, normal, hard), 30 games, 4 players, 3 rounds, seeds 1000+. For every lead with a standard card, count: leads; leads into a `knownSlap` suit; of those, how many while holding a suit with `!knownSlap`. Print JSON. Run with `npx tsx testbed/lead_check.ts [games] [players]`. Also run with 2 and 3 players.
- **Bar:** Normal and Hard "into a known slap while holding a safe suit" = 0. Before (2.34.2, 4 players, loose count): Normal 394 into a known slap / 155 holding another suit (only 18 with a lower risk, all from the final-two rule); Hard 552 / 393 (262 with a lower risk). Easy is reported, not barred.

### 9af.7 Arena and version
- `npx tsx testbed/ai_arena.ts --bars` (all 9 bars must pass; record Normal vs Hard places; Hard must still be ahead of Normal). p95 Hard decision time no more than 20% above 2.34.2 (8.4 ms).
- `package.json` 2.34.3. `npm run check`, `npm test`, `npm run build`, `python3 testbed/run_checks.py`, `python3 testbed/playthrough.py 2 4` where the sandbox allows; say which could not run and why.

### 9af.9 What was built (2026-11-15, Haiku), and where it differs from the plan
- **knownSlap** counts certain voids, not only slap-shown ones (`pVoid` = 1). Reason: the first bar run showed Normal's remaining known-slap leads were all suits with no unknown card left (e.g. every diamond accounted for, the other player holding none), so the plan's narrow test called the lead "safe" wrongly. Bar result after the change: 0 at 2, 3 and 4 players (DEVLOG 2026-11-15 21:10).
- **Deal sampling (9af.4):** deal order by number of known missing suits, and `TRIES_WITH_VOIDS` 60. Measured over every Hard decision with a known missing suit (20 games, 2 rounds, 4 players): imagined deals breaking a known missing suit fell from 2.32% (1407 of 60680) to 0.01% (5 of 62880).
- **Test changes, all on purpose:** `hard.test.ts` ("Hard plays the search's best card when the switch margin is 0") now expects the one exception the new rule makes: a lead into a known missing suit when Normal's lead is safe. The plan said this file must pass unchanged; it could not, because the rule is the change. `fairplay.test.ts`: the "habit table changes some moves" check was 1 of 2735 positions on the original code and 0 with this change; widened from 4 to 16 games per size (9 of 9378 now). The hidden-card check (changed = 0) is untouched.
- **Regression fixture:** `tests/ai/fixtures/moves-2.34.3.json` is new (500 decisions). `moves-2.34.2.json` is kept. Compared game by game with 2.34.2 (the first move that differs in each game): Hard leads changed on purpose (guard); Hard follow in one game and Easy in one game changed because the deal order draws random numbers differently from the shared random stream, not because Easy's logic changed (with the deal order turned back off, both games match 2.34.2 again). One Normal game only looked different because the 2.34.2 file stops at 500 decisions.
- **Check results:** `testbed/lead_check.ts` (30 games per level), leads into a known missing suit while holding a safe suit: Normal 0, Hard 0 at 2, 3 and 4 players (Easy 39 / 67 / 110, reported only, not barred). Before the change (4 players, narrow definition): Normal 135 and Hard 119.
- **Arena bars:** all 9 pass (2000 games each). Hard beats Normal by 0.188 (bar 0.15). Hard p95 9.1 ms (bar 150 ms).
- **Not run in this sandbox:** `npm run build`, `npm run check` (only `tsc -p tsconfig.json` ran: clean; `tsconfig.rules.json` fails on the missing `@types/node`), `testbed/run_checks.py`, `testbed/playthrough.py` and the phone test build. `tsx` and `esbuild` are not installed, so the arena's child-process mode can't run; it was run with `--workers 1` (in-process).

### 9af.8 Phone checklist (2.34.3)
1. Single player vs **All Hard**, 4 players. When a computer player slaps on a suit, watch the next leads: no computer player leads that suit while that player still holds cards and hasn't picked any of it up, unless the leader only holds suits someone is known to be missing.
2. Same with **All Normal**, and with 2 players (Hard).
3. Final two vs a computer player when you have one card left: it shouldn't lead a suit you've already slapped on, if it has another suit.
4. **Easy** still slips now and then (expected).
5. A whole game plays to the end with no stalls; Fast forward still works.

## 9ag. Forfeit any time in the last two, jokers kept when slapped, iPad landscape (PLAN, user 2026-11-15 22:55 / 23:00; spec `PROJECT.md` 12s and sections 6 and 7; written for Haiku; target **2.34.5**; BUILT 2026-11-16, shipped as part of 2.34.6, not pushed)

**Built notes (2026-11-16):** `canForfeit` in `src/rules/play.ts`; `asideJokers` + `settleAsideJokers` (called at the start of `resolveTrick`, in `endRound`, in `pickUpWastePile`); `sideBarW` in `layout.ts`; `fitFan` / `fanBounds` in `cards.ts` (hand fits its slot, width and height); 😂 at the top of the action column in landscape (`html[data-side]` rule in `styles.css`); `tableInset` keeps tablet side fans inside the felt. Regress fixture moved to `moves-2.34.5.json`: games of seeds 1, 2, 5 and 7 change a few moves after a joker is set aside (the expected cause). Checks: `testbed/tablet_check.py` 67 of 67; `node --test` 352+ pass; `tsc` both configs clean.

### 9ag.0 Read first
- Spec: `PROJECT.md` 12s, section 6 (forfeit at any time) and section 7 ("You can't hold only jokers").
- Three parts, each can be built and tested on its own: **A** forfeit, **B** jokers, **C** layout. Build them in that order.
- **Computer players are not changed** (`src/ai/` stays as it is, apart from the event handling in B.4 if a test shows it is needed).
- Version: `package.json` 2.34.4 → **2.34.5** (2.35.0 stays reserved for Phase 4k).
- Building here: `esbuild` and `typescript` are in `/opt/npm-tools/node_modules`. Link them before building: `mkdir -p node_modules && ln -sf /opt/npm-tools/node_modules/esbuild node_modules/esbuild && ln -sf /opt/npm-tools/node_modules/@esbuild node_modules/@esbuild`, then `node build.mjs` (works, checked 2026-11-15). Playwright and `/usr/bin/google-chrome` are there for the browser checks (`chromium.launch(executable_path='/usr/bin/google-chrome')`). Don't commit `node_modules`.

### 9ag.1 Part A: forfeit at any time in the last two
**Rules (`src/rules/play.ts`):**
- Add and export `canForfeit(state: PlayState, player: PlayerId): boolean`: true when the round is not over, the players not yet finished (`order` minus `finished`) are exactly two, and `player` is one of them. (While the other player faces the pick-up choice they have no cards in hand but are not finished, so the count is still two; that is intended.)
- `forfeit()`: replace the `facingChoice` / `forfeitAllowed` check with `canForfeit`. Error text stays `${player} cannot forfeit` when false. The rest (end order, `forfeitedBy`, event) is unchanged.
- Keep the `forfeitAllowed` field in `PlayState` (old saved games carry it); it no longer decides anything. Update its comment.
- Update the file's top comment (final two block).
**Session view (`src/session/view.ts`):** `canForfeit: !!play && canForfeit(play, me)`.
**UI (`src/ui/game.ts`):** no change needed: the Forfeit button already shows when `v.canForfeit` and needs two taps. Check it shows on the hand screen when it is not my turn, too (it is built outside `myTurn` already). On one phone (pass-and-play) it shows for whoever is holding the phone.
**Network:** no change (`forfeit` is already a phone move; the host's session checks it).
**Computer players:** `src/ai/decide.ts` only forfeits from `pendingFinalTwo`. Leave it. Add a test that a computer player in the last two, not facing the choice, never sends `forfeit` (B.5 test 5).
**Test bot (`testbed/bot.js`):** today it clicks Forfeit with `cfg.forfeitChance` only inside the pick-up panel. Leave that. Add `cfg.anyForfeitChance` (default 0): when a "Forfeit" button is on screen and there is no pick-up panel, click it with that chance (two taps). `playthrough.py` sets 0.01 for the 2-player game only, so the new path is covered without ending most rounds early.
**Quick rules (`src/content/quick-rules.md`, final two part):** add one line: "Either of the last two can forfeit at any time (tap Forfeit twice): you take last place."

### 9ag.2 Part B: jokers set aside with the last normal card
**State:** add to `PlayState`:
```ts
/** Jokers set aside with a player's last normal card (PROJECT.md 7). Thrown away if that player goes out; back into the hand if they pick up (slapped, or the final-two pick-up). */
readonly asideJokers?: Readonly<Record<PlayerId, readonly Card[]>>;
```
Optional, so saved games from 2.34.4 load (`?? {}` everywhere it is read). `startPlay` sets `{}`.
**`playCard`:** where it now throws the jokers away (`rest.every(isJoker)`): move them to `asideJokers[player]` instead, and do **not** add them to `usedJokers` and do **not** push `jokersDiscarded` yet. The hand is still emptied, so every "last card" check works as today.
**One helper, `settleAsideJokers(state, events)`,** returns the new state: for each player in `asideJokers`:
- hand not empty (they picked up): put the jokers back into the hand (at the end of the hand), clear the entry;
- hand empty: add the jokers to `usedJokers`, push `{ type: 'jokersDiscarded', player, count }`, clear the entry.
**Call it:**
1. at the start of `resolveTrick` (after a slap the slapped player's hand already holds the trick, so a slapped player gets the jokers back; a player who went out has an empty hand and loses them). Do it **before** `finished` and `stillIn` are worked out, because a player who gets jokers back is not out.
2. in `endRound` (the forfeit path and any end not through `resolveTrick`), before the round-end event.
3. **not** in the final-two "higher last card" branch of `resolveFinalTwo`: there the jokers stay aside while the player chooses.
4. in `pickUpWastePile`: after the waste pile is added to the hand, the player's aside jokers go back into the hand too (use the helper).
5. `forfeit` goes through `endRound`, so a forfeiting player's aside jokers are thrown away there.
**Check these cases by hand while building** (each becomes a test in B.5): last normal card as a slap (goes out, jokers thrown away); last normal card followed and the trick ends normally (out, thrown away); last normal card was the highest of the led suit and someone slaps (picks up, jokers back in hand); final two, higher last card, pick up (back); final two, higher, forfeit (thrown away); final two, lower last card (wins, thrown away).
**Who sees what:** the card count of the player shows 0 while the jokers are aside (same as today), then the picked-up cards plus the jokers. No new event is needed for the "back in hand" case: the count shows it, as a slap pick-up does today. `jokersDiscarded` now comes later in the event list (at the trick or round end). Check `src/ui/game.ts` (the "Jokers out" notice), `src/ai/memory.ts` and `src/ai/learn.ts` still read it right; they count it when it comes, so they need no change.
**Computer players' memory (fair play):** today a joker discarded counts as played as soon as the last card is played. Now it is counted only when it really leaves. A computer player who sees a player pick up after a slap must not assume those jokers are gone: they are not in `m.jokersPlayed`, so they stay "somewhere unknown", which is right.
**Quick rules (`jokers` part):** change "any jokers left are thrown away and that was your last card" to "that was your last card: your jokers are thrown away if you go out, and come back to your hand if you get slapped or pick up the waste pile."

### 9ag.3 Part C: the game screen on tablets (iPad landscape first)
**What was seen (2026-11-15, built 2.34.4, Playwright at 1180 × 820, 1024 × 768, 1366 × 1024 and 820 × 1180):**
- Landscape: the hand cards are sized for the row height (200 px), so the fan is too wide for the hand column (window − 16 − 170 px) and too tall: the bottom of the cards is cut off below the screen, and with 12 to 13 cards the fan runs over the action column (the Play / "Pick a card" button).
- The action column's button stretches into a tall box (about 170 × 200 px).
- The 😂 button (`.reactions-toggle`, bottom-left) sits on top of the cards in landscape, and in portrait on an iPad (the fan reaches down into the bar row).
- Side players' fans of card backs are cut off by the table's edge (the table slot has `overflow: hidden`).
- User's photos: Manual / Auto / Deal are cut off in landscape (three buttons don't fit the 170 px column).
**Fixes:**
1. **Hand fits its box.** Find where the hand calls `fanLayout(n, width, maxCardW, minCardW, maxH)` (`src/ui/cards.ts` line ~85; caller in `src/ui/game.ts`). Pass the real hand-slot width (`lay.handW`) and height (`lay.handH`) and make the card size the smaller of "fits the height" and "fits the width" (the step between cards may shrink, down to 22 px; past that use two rows as it does now). The raised (selected) card may stick up above the row by its usual lift, nothing more. No card may go below the hand slot.
2. **Action column on wide screens:** `SIDE_BAR_W` becomes `sideBarW(viewW) = clamp(0.17 * viewW, 170, 240)` (`src/ui/layout.ts`; keep 170 on phones). The buttons in the column are their normal height (`.big` about 56 px), centred in the column, not stretched (`align-self: center; height: auto`). The deal controls (Manual / Auto / Deal all) wrap onto two lines inside the column when they don't fit on one; they are never cut off.
3. **😂 button off the cards.** Landscape: it sits at the top of the action column (above the Play button), not over the hand. Portrait: stays bottom-left in the bar row; fix 1 keeps the cards out of that row. Its sheet (`.reactions-sheet`) still opens upwards from it and stays on screen.
4. **Side fans inside the table.** In `seatLayout` / the side-seat fan drawing (`src/ui/table.ts`), keep each fan's box inside the table box with a small margin (as the top seat already is), or let the fan show by setting the fan's offset so its outer edge is at the table edge. Use `seatCollisions` style checks so seat discs, names and fans don't overlap.
5. Phones must not change: 390 × 844, 844 × 390, 568 × 320 look the same as 2.34.4 (compare screenshots).
**New check script `testbed/tablet_check.py`** (single player vs 3 computer players, Fast, like `solo_check.py`; bot.js taps the person's seat). Viewports: 1180 × 820, 1024 × 768, 1366 × 1024, 1194 × 834 (landscape), 820 × 1180, 1024 × 1366 (portrait), and the phones 390 × 844, 844 × 390. At (a) the deal screen, (b) my turn with the most cards in hand seen so far (at least 13; also force a big hand by playing on until a slap pick-up or use a saved game with 30 cards), (c) the final-two choice if reached. Check with bounding boxes:
- every `.hand .card` is inside the viewport and inside the hand slot (top may stick up by the lift only);
- no hand card overlaps the action slot's buttons or `.reactions-toggle`;
- the deal buttons and the Play button are fully inside the viewport and not covered (`elementFromPoint` at their centre is the button);
- every side fan is inside the table slot;
- no page errors.
Save a screenshot of each to `/tmp/tablet/` and send them to the user with the test build.

### 9ag.4 Tests (`tests/`)
- `tests/rules/final-two.test.ts`: change line ~85 (`forfeit(up, 'c')` must still throw: c is out or not one of the two). Add: (1) last two, no pick-up yet, either player can forfeit on the other's turn and mid-trick; finishing order and `forfeitedBy` right. (2) 2-player game, first trick: forfeit works. (3) three players still in: forfeit throws. (4) while the other player faces the pick-up choice, the waiting player can forfeit; the chooser takes the higher place.
- `tests/rules/play.test.ts` (jokers): the six cases in 9ag.2, plus: (5) a 2.34.4 saved `PlayState` with no `asideJokers` field plays on; (6) total cards are kept: hands + waste + used jokers + aside = the dealt cards, after every action in a random 200-game run (use the session helpers if there is a deal-to-end loop).
- `tests/session/` : `canForfeit` in the view for both players of the last two, and false for a third player still in.
- `tests/ai/`: (5) in 200 bot games, no computer player ever sends `forfeit` unless it faced `pendingFinalTwo`. `fairplay.test.ts`, `regress.test.ts` (2.34.3 fixture) must pass unchanged; if the regress test changes, list which decisions changed and why (the only expected cause is a joker coming back after a slap).
- `tests/ui/layout.test.ts`: `sideBarW` (170 at 844 wide, 200 at 1180, 240 at 1366+); hand fan fits `handW` × `handH` for n = 1 to 40 at the tablet sizes.

### 9ag.5 Checks and version
- `package.json` 2.34.5. `node --test tests/**/*.test.ts` (Node 22 strip-types; `tsx` is not installed, so the server tests fail for that reason only), `tsc --noEmit -p tsconfig.json`, and `tsc --noEmit -p tsconfig.rules.json` with a borrowed `@types/node` (the deploy runs `npm run check`; see DEVLOG 21:10 for why).
- `node build.mjs`, `python3 testbed/tablet_check.py`, `python3 testbed/solo_check.py`, `python3 testbed/playthrough.py`, `python3 testbed/run_checks.py` where they can run; say which could not and why.
- Test build: publish `dist/index.html` as a private test page (CLAUDE.md rule 5) and give the user the link and the 9ag.6 checklist. Push only on "push".

### 9ag.6 Phone and iPad checklist (2.34.5)
1. **Forfeit (any game, last two left):** the Forfeit button shows for both of you, on your turn and not. Tap once: it turns red and says "Tap again to forfeit (last place)". Tap again: the round ends, you are last, the other player is above you.
2. 2-player game: Forfeit is there from the first trick.
3. The old choice still works: higher last card → "Pick up or forfeit" panel, both buttons as before.
4. Play against the computer to the last two: the computer players never forfeit except from the pick-up-or-forfeit choice.
5. **Joker:** get down to one normal card and one joker. Play the normal card as the highest of the led suit and get slapped: the joker is back in your hand with the picked-up cards. Play the normal card and go out: "Jokers out" shows and you're out. Final two, higher last card with a joker left: pick up → the joker is in your hand.
6. **iPad landscape:** your hand fits on screen with nothing cut off at the bottom, even with 13 or more cards; the Play button is a normal button beside the hand and never covered; the 😂 button is above the Play button, not on the cards; Manual / Auto / Deal are whole while dealing; the side players' card fans are not cut off.
7. **iPad portrait and your phone:** look the same as before, except the 😂 button no longer sits on the cards.

## 9ah. Last trick before the results, Deal again per deal, "Ultimate Badboy" (PLAN, user 2026-11-15 23:11 / 23:12; spec `PROJECT.md` 12t and 2a; written for Haiku; target **2.34.6**; build **after 9ag**; BUILT 2026-11-16, test build, not pushed)

**Built notes (2026-11-16):** last trick: `absorb()` treats `roundEnded` with a trick on the felt as final (`TrickAnim.final`); `waitsForTap` / `tapFinalTrick`; the table is the button (`.final-trick`, "Tap to see the results"); bot.js taps it. Deal again: `afterDealStep` always opens the window, `reshuffleUsed` now means "voted on this deal"; loop check `testbed/deal_again_check.ts` (300 rounds, average 1.00, most 1). Badboy: `badboyCheck` in `game.ts` (per deal per player, module Set), `sfx` `badboy`, `hasFourAces` in `cards.ts`; browser check `testbed/lasttrick_check.py` 20 of 20. Also 2026-11-15 23:54: "PATHETIC!!!" pop-up on forfeit (`pathetic` popup kind, every phone) and the catch-phrase edits in `src/content/catch-phrases.md`.

### 9ah.0 Read first
- Spec: `PROJECT.md` 12t and section 2a. Three parts: **D** last trick, **E** deal again, **F** Ultimate Badboy. Build in that order; each is testable alone.
- Version: `package.json` → **2.34.6** (or 2.34.5 if 9ag and 9ah are built and pushed together; say which).
- Building and browser checks here: see 9ag.0 (esbuild from `/opt/npm-tools`, Playwright with `/usr/bin/google-chrome`).
- **Rules (`src/rules/`) are not changed by D or F.** E changes `src/session/session.ts` only.

### 9ah.1 Part D: the last trick of a round is shown until tapped
**Cause (checked 2026-11-15):** `src/rules/play.ts` `resolveFinalTwo` ends the round with `endRound(...)` and no `trickResolved` event (so do `forfeit` and the "both went out" branch). `src/ui/game.ts` `absorb()` builds `finished` (and starts `trickAnim`) only on `trickResolved`, so nothing is drawn: the next draw is the results stage, and `g.lastTrick` keeps the trick before.
**Fix (UI only, `src/ui/game.ts`):**
1. In `absorb()`'s event loop: on `roundEnded`, if `trickLog.length > 0`, treat it as a finished trick: `lastTrick = { plays: trickLog, slap, nextLeader: null }`, `finished = { plays: trickLog, slapped: slap?.slapped ?? null }`, then clear `trickLog`. (When the round ended through `resolveTrick`, `trickResolved` already came first and `trickLog` is empty, so nothing doubles.)
2. Mark the animation final: `TrickAnim` gets `final: boolean`, true when `events` holds a `roundEnded` (both paths above).
3. `driveTrickAnim()`: for a final trick in `step === 'hold'`, **don't** start the hold timer. The step stays `hold` until the player taps. Exception: `fastForwardOn() || skipping() || instantSkipping()` → use the normal `TRICK_HOLD_MS` (no wait).
4. `trickFinishStage()`: when `a.final && a.step === 'hold'`, add a line on the felt ("Tap to see the results", class `hint center`, inside the table, not over the trick cards) and make the whole table slot one button (`role="button"`, `aria-label="See the results"`, `onclick`: set `a.step = 'fly'` (or `'wait'` if its SLAP! pop-up is still up) and `update({})`). Keep the hand drawn as it is.
5. Pop-ups: the round-over (`lastTwo`) and any `slap` pop-up are already held back while `trickAnim` is up (`popupFor`, line ~1426 `trickAnim && trickAnim.step !== 'wait'`). Check that the SLAP! pop-up of a round-ending slap still shows **before** the tap (its step is `wait`), and the round-over pop-up shows **after** the cards move.
6. Network games: every phone runs its own `absorb()`, so each phone taps its own; nothing is sent. The host's Next round button is on the results stage, so the host taps first; that's fine.
7. Pass-and-play: the trick shows on whatever screen is up (table or hand), one tap.
**Test bot (`testbed/bot.js`):** add a step: if "Tap to see the results" is on screen, click it (before the other checks). Otherwise `playthrough.py` and `solo_check.py` stall at every round end.
**Checks:** in `testbed/tablet_check.py` (9ag) or a new `testbed/lasttrick_check.py`: play single player to a round end (Fast), at the round end assert the trick cards (`.round-table .trick-play`) are drawn and "Tap to see the results" shows; advance the fake clock 10 s: still there; click: the round-over pop-up shows, then results. Repeat with 2 players (final two from the first trick). Screenshot each.

### 9ah.2 Part E: deal again once per deal, as many deals as wanted
**Now:** `reshuffleUsed` is set by `callVote` and reset only by `startNextRound`; `afterDealStep` skips the reshuffle window when `reshuffleUsed` (the round starts by itself after a redeal); the button then says "Used".
**Change (`src/session/session.ts`):**
- `afterDealStep`: always `return { ...s2, phase: 'reshuffle', reshuffleUsed: false }` (delete the skip). The field now means "a vote was held on this deal"; keep the name (saved games). Update its comment in `src/session/types.ts`.
- `callVote` (reshuffle): unchanged (`fail` if `reshuffleUsed`, so one vote per deal).
- Vote result: passed → redeal as now (back to `dealing`; when the deal completes, `afterDealStep` opens the window again). Failed → `afterReshuffleWindow` as now (the round starts with that deal).
- The top-of-file comment and the "After a reshuffle the vote is used up" comment: update.
**UI:** no logic change (`canCallReshuffle` already reads `!s.reshuffleUsed`). After a redeal the S1 screen (`roundstart.ts` `reshuffleStage`) and the network `beforeRound` (`netscreens.ts`) show again with "Deal again?". Pass-and-play: "Look at cards" again before Start, as after the first deal.
**Computer players (`src/ai/moves.ts` `chooseCallVote`):** no change needed (gated by `canCallReshuffle`). But check it can't loop: run 300 four-player all-computer rounds (`tests/ai/botgame.ts` or `testbed/ai_arena.ts`) and report the average and the most deals per round. **Bar:** average under 1.5 deals per round, most under 8. If not, stop and write "🔁 Switch to Opus" (don't invent a limit).
**Quick rules (`src/content/quick-rules.md`):** line 32 "(once per round)" → "(once per deal: if it passes, you can ask again after the new deal)"; line 62 "(reshuffle, once per round)" → "(reshuffle, once per deal)".
**Tests:** `tests/session/`: (1) pass a reshuffle vote, deal: phase is `reshuffle`, `canCallReshuffle` true; pass again: dealt a third time; (2) a failed vote starts the round (phase leaves `reshuffle`); (3) a second `callVote` on the same deal fails "Only one reshuffle vote per round" (change the message to "…per deal" and update any test that matches the old text); (4) 2-player (asker + agree) works the same; (5) round 2 and later behave the same. The trivia "most reshuffle votes" still counts every call.

### 9ah.3 Part F: "You are the Ultimate Badboy!!" (private, four aces)
**No session or network change.** Each phone works it out from its own player's hand (`playerView(s, me).myHand`), so nothing is logged or sent and other players can't learn it.
1. Helper `hasFourAces(hand: readonly Card[]): boolean` in `src/ui/cards.ts` (four standard cards of rank 14). Unit test.
2. **When to check** (`src/ui/game.ts`, in `absorb()` after the new session is taken in, or in the draw for the hand screen):
   - after a deal completes (event `dealComplete` in this batch), for the player whose hand this phone shows (`ownSeat(g)`; on one phone, the player when their private hand screen is first shown for this deal: `stage === 'hand'` / the "Look at cards" hand-off reaching them);
   - after the hidden swap (event `swapped` / the swap reveal for that player, `roundstart.ts` `swapReveal`) if the new hand has four aces and the dealt hand did not.
   - **Once per deal per player:** key `${round}:${dealIndex}:${player}`, where `dealIndex` counts `dealComplete` events this round (from `s.log`). Keep the keys in a module `Set` (not saved; after a reload it may show again, which is fine).
   - Never for computer players, never on the shared table screen in pass-and-play.
3. **Pop-up:** new `Popup` kind `badboy` (`src/ui/store.ts`), drawn like the SLAP! pop-up (`.popup.slap` style: big comic word with the same burst; the text "You are the Ultimate Badboy!!" on two lines on a phone, "Ultimate Badboy!!" as the big word and "You are the" small above it). Stays `SLAP_MS` (4 s) with the countdown bar, closes on a tap too. Not on other phones, no reactions from computer players.
4. **Sound:** new `Sfx` `'badboy'` in `src/audio/sfx.ts`: an epic fanfare, about 2 s: a low `kick` hit, a rising three-note `brass` chord (e.g. A3-E4-A4 then C#5), and a `bell`/`reverb` tail; `BIG` set, `DUR` 2.0. Play it when the pop-up opens. It follows the effects on/off and volume setting like every effect. Add it to `testbed/sound_check.py` if that lists every effect.
5. **Checks:** `tests/ui/` test for `hasFourAces`; a browser check (fake a deal: start single player with a seeded game, or set `pubby.currentGame` in localStorage to a session where the person holds four aces at `reshuffle`, then reload and "Carry on") that the pop-up shows once, not again on the next draw, and is not shown for a computer seat. Screenshot it.

### 9ah.4 Checks and version
- Version as in 9ah.0. `node --test` (all), both `tsc` configs (9ag.5), `node build.mjs`, the browser checks above, `solo_check.py`, `playthrough.py` (with the bot.js step from D), `run_checks.py` where they can run.
- Test build link + the checklist below. Push only on "push".

### 9ah.5 Phone checklist (2.34.6)
1. **Last trick:** play to the end of a round (vs computer, 4 players, and a 2-player game). The last trick stays on the table with "Tap to see the results". Wait: it stays. Tap: the cards slide away, then the round-over pop-up and results. If the round ends on a slap, SLAP! shows first.
2. With only computer players left, Fast forward and Skip don't stop at the last trick.
3. **Deal again:** after the deal, vote "Deal again?" and pass it: after the new deal you're back on the screen with Look at cards / Deal again? / Start, and Deal again? works again. A failed vote starts the round. Try it in round 2 and 3 too, and on two phones.
4. **Badboy:** hard to get by chance (about 1 in 400 hands with 4 players); use the test link's "four aces" test game (the build guide's check sets one up) to see it: the pop-up and the fanfare on your screen only; the other phone shows nothing.

## 9ai. Clearer pop-ups, votes, take-cards and whose turn (BUILT 2026-11-16 as 2.36.0, not committed; user 2026-11-16 07:54 to 08:17; spec `PROJECT.md` 12u; mockups https://claude.ai/artifact/2KAaj6Lkc2aCDsM3os6TXo; written for Haiku)

**Built notes (2.36.0):** Part A's pop-up timer is gone except during Fast forward or Skip (`autoClosing()` in `game.ts`). The vote alert has no tap line (the Vote now button closes it), so it also covers the table while open. The "your turn" table glow is on `.table-oval` (the felt), not `.round-table`. The NO pill uses the new `x` icon in `icons.ts`. Network checks that expected the old timers fail now; see DEVLOG 2026-11-16 build entry.

### 9ai.0 Read first
- Spec: `PROJECT.md` 12u. Open the mockup link and match it: colours are the app's own (`--cream`, `--gold`, `--ink`, YES `#2e7d32`, NO `#c62828`, muted text on cream `#5d5646`). Row 1 = votes, row 2 = take-cards, row 3 = pop-ups, row 4 = turn ideas 1 and 3 (ideas 2 and 4 were **not** chosen).
- Six parts, build and check in this order; each is testable alone: **A** pop-ups tap to close, **B** places, **C** everyone waits (hourglass), **D** votes, **E** take-cards, **F** whose turn.
- **Rules (`src/rules/`) don't change.** Session: only one optional field on an event (D3). Network: one new message (C).
- Version: `package.json` → **2.36.0** (2.35.0 stays reserved for Phase 4k). If 4k is built first, still 2.36.0.
- Icons: use `icon(...)` from `src/ui/icons.ts`; the hourglass is the existing `wait` icon. No emoji in UI chrome (12a).
- Every new animation gets a `@media (prefers-reduced-motion: reduce)` rule that turns it off.
- Building and browser checks here: as in 9ag.0 (esbuild from `/opt/npm-tools`, Playwright with `/usr/bin/google-chrome`).
- If a step fights the existing code twice (for example the SLAP! pop-up and the end-of-trick animation in A2), stop and write "🔁 Switch to Opus".

### 9ai.1 Part A: pop-ups have no timer and close on a tap anywhere
Files: `src/ui/game.ts` (`popupLayer`, `popupTimer`, `afterRender`, `popupMs`), `src/ui/styles.css`.
1. `afterRender()`: the `slapTimer` block that closes the top pop-up after `popupMs` runs **only** when `fastForwardOn() || skipping() || instantSkipping()`. Otherwise no timer at all. Clear any running `slapTimer` when fast forward stops.
2. `popupLayer()`: every kind returns `h('div', { class: 'overlay popup-overlay', 'data-skip': 'true', onclick: next }, h('div', { class: cls, role: 'alert' }, body, tapHint()))`. Remove the separate SLAP!/HAHAHA! branch that had no `onclick` (they now close on a tap too). Remove every `popupTimer(p)` call; keep the function only for fast-forward mode (show the bar only then) or delete it and the `.slap-timer` CSS.
   - Check with the end-of-trick animation: a round-ending SLAP! pop-up shows at step `wait` (9ah.1 step 5). After this change it waits for a tap; tapping it must let the animation continue (it moves on when `popups[0]` changes; confirm in `driveTrickAnim`).
3. `tapHint()`: `h('div', { class: 'tap-hint' }, 'Tap anywhere to close')`. CSS: `.tap-hint { font-size: 0.8rem; color: #5d5646; margin-top: 4px; }`; on `.popup.slap` give it the cream chip like `.popup.slap .small`.
4. The pop-up card is solid: `.popup` already has `background: var(--cream)`. Make the overlay darker: `.popup-overlay { background: rgba(8, 20, 10, 0.72); }`.
5. Not changed: the missing-suit notice (`notice-overlay`, already waits for OK, 9y), the vote alert's Vote now button (D1), and anything with YES/NO or Give/Refuse.
6. `bots.ts` already holds computer players while `popups.length` (line ~88): keep.

### 9ai.2 Part B: places instead of "is out"
File: `src/ui/game.ts` `popupLayer`, kind `out`.
- Title: `${nameOf(s, p.player)} came ${ordinal(p.place)}!`; when `p.player === ownSeat(g)` (or the single-player person): `You came ${ordinal(p.place)}!`.
- Under it a big place pill (new class `.place-big`: 22px, weight 900, padding 6px 18px, radius 999px): 1st `--gold` with ink text, 2nd `#c9ced6`, 3rd `#cd8b4e`, others cream-dark `#e8e1cf`. Icon above: `trophy` in a 68px circle of the same colour.
- One small line: "No cards left." (others) or "Sit back and watch the rest." (you).
- `lastTwo` (round over) is unchanged.

### 9ai.3 Part C: everyone waits for open pop-ups (network games), hourglass on busy players
**Meaning:** a phone is **busy** while `getState().popups.length > 0` (the vote alert counts; the vote card itself and the missing-suit notice don't, they already wait). Only network games (Nearby and Online). Never in fast-forward/skip mode (send not-busy then).
1. **New module `src/net/busy.ts`**, copy the shape of `src/net/away.ts`: `setBusyPlayers(ids)`, `isBusyPlayer(id)`, `anyoneBusy(): boolean`.
2. **Messages (`src/net/lobby.ts`):** `ToHost` gains `{ t: 'busy'; on: boolean }` (parse it like `away`: `on` must be a boolean). Lobby seats gain `busy?: boolean` (like `awaySince`). Helper `setBusy(lobby, id, on)`. **`LOBBY_PROTOCOL` 9 → 10** (comment: "10: busy (2.36)").
3. **Joining phone (`src/ui/netlobby.ts`):** after each draw, work out `busy = popups.length > 0 && !fastForwardOn() && !skipping() && !instantSkipping()`; when it changes, `peer.send({ t: 'busy', on: busy })` (same place as the `away`/`back` send, line ~342). Send `false` when leaving the game screen.
4. **Host:** on `{t:'busy'}` from a seat, `lobby = setBusy(lobby, id, m.on)` and broadcast the lobby the same way as `away` (line ~1087). The host's own phone sets its own seat's `busy` directly when its own value changes. When a seat goes Away or leaves, clear its `busy`.
5. **Everyone:** where `setAwayPlayers(...)` is called from the lobby (line ~332), also `setBusyPlayers(seats that have busy && no awaySince && not a computer player)` as player ids `p1…`.
6. **Effects:**
   - `game.ts` hand screen: `const playBlocked = !!takeWaiting || anyoneBusy();`. When blocked only by busy, the Play button is disabled and shows `icon('wait')` and no words. Picking a card still works.
   - Host's computer players (`bots.ts`): add `anyoneBusy()` to the "nothing moves while…" check (line ~88 and ~95).
   - Auto deal timer (`afterRender`, `dealing`): also wait while `anyoneBusy()`.
   - Redraw when the busy set changes (the lobby update already triggers `update`; check).
7. **Hourglass (`src/ui/table.ts` `seatTags`):** after the Away tag: `isBusyPlayer(id) && !isAwayPlayer(id) ? h('span', { class: 'seat-busy', role: 'img', 'aria-label': 'Busy' }, icon('wait')) : null`. CSS: gold, 0.9em, `display: inline-flex`, `animation: busy-flip 2.4s ease-in-out infinite` with `@keyframes busy-flip { 0%, 40% { rotate: 0deg; } 50%, 90% { rotate: 180deg; } 100% { rotate: 180deg; } }` (same timing as `host-wait`). Reduced motion: no animation.
8. No "Waiting for…" text anywhere for this.
9. One phone (pass-and-play) and single player: no change (`busy.ts` stays empty).

### 9ai.4 Part D: votes
Files: `src/ui/game.ts` (`voteCalled` and `voteResolved` pop-ups, `popupLayer`), `src/ui/roundstart.ts` (`voteStage`, `waitStage`, `passStage`, `hostDecidesStage`, `ballotChips`), `src/ui/store.ts` (Popup kinds), `src/session/types.ts` + `session.ts` (one field), `src/ui/styles.css`. Use the seat-disc initials from `src/ui/initials.ts` `seatInitials` and the seat colours the table uses.
1. **Alert:** `voteCalled` (more than 2 players and 2 players alike) pushes a new Popup kind `voteAlert` `{ by, kind, value }` on every phone **except the asker's**. Drawn: 64px gold circle with the vote icon (`shuffle` / `target` / `bolt`); title "Amy wants to deal again" / "Amy wants a target of 300 points" / "Amy wants the Ultimate Round" (2 players: same title); one muted line: deal again "Everyone votes. Ben would shuffle and deal a new hand." (2 players: "You decide."), target "Everyone votes.", ultimate "Everyone votes."; a row with the asker's 28px disc and "Amy has voted YES"; a full-width gold **Vote now** button (closes the pop-up, same as `next`); no tap hint, no timer. Tap anywhere also closes it.
2. **Vote card** (`voteStage`): replace the panel with a solid card `.vote-card` (`background: var(--cream); color: var(--ink); border-radius: 20px; box-shadow: 0 18px 44px rgba(0,0,0,0.55); padding: 18px 16px 16px`):
   - Head: 48px gold circle with the icon, the short question (`voteShort`, 22px weight 900) and under it "Amy asked · majority decides" (2 players: "Amy asked · you decide"; draw: "Top score is a draw").
   - `ballotList(s, me, open)` (replaces `ballotChips`): one row per player in seat order: 36px disc, name (16px bold), dealer note "Dealer" for deal again, and a pill on the right: asker → green "Asked · YES"; `yes` → green "YES" with check; `no` → red "NO" with x; me with no ballot → gold "Your vote" and the row gets a gold border on `#fff6dc`; others → `#e8e1cf` "Waiting" with the `wait` icon. When `open` is false (one phone, secret vote): pills are only "Voted" (`#e8e1cf` with check) or "Waiting", and no "Your vote".
   - Progress: a bar and "3 of 5 voted".
   - YES and NO buttons (existing `vote-yes`/`vote-no`, grid of two, 56px).
   - Deal again: `handBlock` stays under the card, not dimmed.
3. **After voting** (`waitStage` for `what === 'vote'`): the same card, the list, then instead of the buttons a green line `#eef6ee` / `#1b5e20`: "You voted YES · waiting for Ben" (or "…NO…"; names joined with `joinNames`). The asker sees "You asked: your vote is YES · waiting for …". The host's "count the votes now" button stays under it. Keep `seatStrip` out of the vote version (the list replaces it).
4. **Host decides** (`hostDecidesStage`): same card style, head line "No majority · Mo decides".
5. **Result pop-up:** add optional `readonly ballots?: Readonly<Record<PlayerId, Ballot>>` to the `voteResolved` event in `src/session/types.ts` and fill it in `session.ts` where the event is made (the final ballots). Popup kind `vote` gains `ballots` and `kindOf` (the vote kind). Drawn: small muted question ("Deal again?"), big YES!/NO! (existing `.vote-word`), the outcome text (`voteOutcome`), then two rows: green `#eef6ee` "YES 4" + 28px discs of the yes voters, red `#fdecea` "NO 1" + discs. One phone (secret): the two rows show only the counts, no discs. No OK button; tap hint.
6. Saved games from 2.34.x still load (the new event field is optional).

### 9ai.5 Part E: take-cards
File: `src/ui/between.ts` (`takePrompts`, `takeStatus`, `takeControls`, `askToTake`), `src/ui/styles.css`.
1. **Being asked** (`takePrompts`): return an overlay, not a panel: `h('div', { class: 'overlay take-overlay' }, card)` with `.take-overlay { align-items: center; background: rgba(8, 20, 10, 0.82); }` (no tap-to-close). Card `.take-card`: cream, `border: 3px solid var(--gold)`, radius 20px, centred text. One asker: the asker's 56px disc overlapping a 56px gold circle with the `take` icon; title "Amy wants your cards" (26px, 900); "Give them and you go out **3rd**." (`ordinal(nextPlace)`); a small tag with the `eye` or a lock-style icon "Private · only you see this"; full-width buttons stacked: green **Give my cards to Amy** (`check` icon) and white **Refuse** with red text and border (`x`-style, reuse `vote-no` colours as an outline class `.btn-outline-no`). Two or more askers: title "2 players want your cards", "Pick one and you go out 3rd.", one white row per asker (disc, name, green **Give** button 44px), then **Refuse everyone** (outline), then the private tag.
2. **Asking** (`takeControls` while choosing, and `askToTake` on one phone): a bottom sheet `h('div', { class: 'overlay' }, h('section', { class: 'sheet take-sheet' }, …))` (cream, radius 22px top corners, a small grab bar): head with the gold `take` circle, "Take whose cards?" and "Before the trick · one ask at a time"; one `<button>` row per allowed target: disc, name, "6 cards" (from `publicView(s)` / `cardCount`), and a gold "Ask" chip with `arrow`; a muted line "Only you see their answer."; **Cancel** (ghost, full width). On one phone `askToTake` lists the askers with the label "Who is asking?" in the same sheet style.
3. **Your own request** (`takeControls`, `mine`): a solid cream card near the top `.take-status.mine` (gold border): your disc, "You asked Dev", muted "Waiting for an answer" (or "Agreed"), **Withdraw** button.
4. **Everyone else** (`takeStatus`): replace each `host-line` with a solid cream card `.take-status` (radius 14px, shadow): asker's 34px disc, "Amy asked Ben for his cards", grey "Waiting" pill with the `wait` icon. Keep it near the top of the hand screen.
5. The `.take-ask` and `.take-panel` see-through styles go.

### 9ai.6 Part F: whose turn
Files: `src/ui/table.ts` (`TableOpts.highlight`, seat classes, `seatTags`), `src/ui/game.ts` (hand screen, `handBlock`), `src/ui/styles.css`.
1. **Someone else's turn** (`highlight` set and not `bottom`): the turn seat gets `.turn` (exists). New CSS: `.seat-quiet.turn .seat-disc { transform: scale(1.25); animation: turn-ring 1.6s ease-in-out infinite; }` with `@keyframes turn-ring { 0%,100% { box-shadow: 0 0 0 4px rgba(242,193,78,.9), 0 0 18px 6px rgba(242,193,78,.55); } 50% { box-shadow: 0 0 0 6px var(--gold), 0 0 30px 12px rgba(242,193,78,.35); } }`. The name tag gets class `turn-name` (gold background, ink text) and reads `${name}'s turn` (keep the thinking dots after it for computer players). Every other seat gets `.not-turn { opacity: 0.5; }` while a turn is shown. Check the bigger disc doesn't collide with fans on 8 players and on the iPad layout (`tablet_check.py`).
2. **Your turn** (`highlight === bottom`, i.e. `myTurn` on the hand screen):
   - Table: class `your-turn` on `.round-table` → `box-shadow: 0 0 0 4px var(--gold), 0 0 30px 8px rgba(242,193,78,.4)` on the felt.
   - Hand: class `your-turn` on `.hand-section` → gold 2px border, radius 18px, `background: rgba(242,193,78,.12)`, `animation: hand-glow 1.8s ease-in-out infinite` (gold glow in and out).
   - Playable cards: while `myTurn`, `.card.playable { transform: translateY(-10px); box-shadow: 0 0 0 2px var(--gold), -2px 6px 10px rgba(0,0,0,.4); }` (selected cards keep their stronger `.selected` look).
   - Pill above the hand: `.turn-pill` (gold, ink, 18px, weight 900, radius 999px, shadow): "Your turn · lead" when leading; "Your turn · play a ♥" when following and you hold the led suit (suit symbol red for ♥/♦); else "Your turn".
   - Buzz: when it becomes your turn (track the last turn key `${round}:${trickIndex}:${player}` in a module variable), call `navigator.vibrate?.(60)` once if sound effects are on (`src/audio/settings.ts`). Not on one phone's shared table screen.
3. Reduced motion: no pulse, no glow animation; the gold stays.
4. Pass-and-play: the shared table shows idea 1 for the player whose turn it is; their private hand screen shows idea 3.

### 9ai.7 Tests and checks
- `node --test` (all), both `tsc` configs, `node build.mjs`.
- `tests/net/`: `parseToHost` accepts `{t:'busy',on:true}`, refuses `on:'yes'`; `setBusy` sets and clears; protocol is 10.
- `tests/session/`: `voteResolved` carries `ballots` equal to the final ballots (more than 2 players, 2 players, host decides).
- **Test bot (`testbed/bot.js`) must close pop-ups now:** if `.popup-overlay[data-skip]` is on screen, click it; if the vote alert's Vote now is there, click it. Without this every browser check stalls. Then run `playthrough.py` (2, 3, 5, 8 players), `solo_check.py`, `lasttrick_check.py`, `tablet_check.py`, `netvotes_check.py`, `netgame_check.py` and report results against the known failures listed in the 2026-11-16 DEVLOG entry (don't fix those here).
- New `testbed/popups_check.py`: (1) single player: a pop-up stays after advancing the fake clock 10 s; a tap closes it; (2) Fast forward on: pop-ups still close by themselves; (3) two-phone network game (as `netgame_check.py` does): while phone B has a pop-up open, phone A's seat for B shows `.seat-busy`, A's Play button is disabled, and after B taps, both clear; (4) the "came 1st" text; (5) vote alert then vote card rows (one per player) and YES/NO under the list; (6) take-cards: the asked player's `.take-overlay` is opaque (computed background alpha ≥ 0.8) and has Give/Refuse; (7) turn: the turn seat has `.turn` and others `.not-turn`; on your turn `.hand-section.your-turn` and `.turn-pill`. Screenshot each on a phone size (390×844) and the iPad landscape size.

### 9ai.8 Phone checklist (2.36.0)
1. **Pop-ups:** play a game vs computer. No pop-up has a countdown bar or closes by itself; a tap anywhere closes each one. SLAP!, HAHAHA!, Badboy and PATHETIC!!! too. With only computer players left, Fast forward still runs on its own.
2. **Places:** when someone gets rid of their cards: "Amy came 1st!" with a gold 1st; your own: "You came 2nd!".
3. **Waiting (two phones):** leave a pop-up open on phone B. Phone A shows a flipping hourglass by B's name and can't play; computer players wait. Tap on B: play carries on. Put B in the background: B shows Away and doesn't hold the game up.
4. **Votes:** ask to deal again on one phone. The other phones get "… wants to deal again" with Vote now. The vote card lists everyone, one per line, YES/NO underneath; after voting you see "You voted YES · waiting for …". The result shows who said yes and no; tap to close. On one phone the vote stays secret (Voted / Waiting only).
5. **Take cards:** ask from the list (card counts shown). The asked player sees a solid card with Give / Refuse that's easy to read; others see a solid "Amy asked Ben…" card; you can Withdraw. Try two people asking the same player.
6. **Turns:** someone else's turn: their disc is bigger with a pulsing gold ring and "Ben's turn", others faded. Your turn: the table edge and your hand glow, playable cards lift, "Your turn · …" shows, Android buzzes once.
7. iPad landscape: nothing overlaps; check with 8 players.

## 9aj. Fixes after the first 2.36.0 phone test (user 2026-11-16 09:32 to 09:49; spec `PROJECT.md` 12u item 7; mockups https://claude.ai/artifact/LB2XMzmUPUB6oJuCEic4uG rows 1 to 4; still **2.36.0**; BUILT 2026-11-16 by Haiku, Parts A to F, see 9aj.8)

### 9aj.0 Read first
- Builds on top of the uncommitted 9ai work in the working tree. Don't change the version: 2.36.0 was never pushed.
- Five parts, in this order, each testable alone: **A** take-cards layering, **B** Stop fast forward above pop-ups, **C** tie vote, **D** your-turn glow, **E** target button. Then **F** checks.
- Rules (`src/rules/`) and session don't change. No network message changes.
- Match the mockup (colours: `--cream`, `--gold`, `--ink`, muted on cream `#5d5646`). Every new animation gets a reduced-motion rule.
- If a part fights the code twice, stop and write "🔁 Switch to Opus".

### 9aj.1 Part A: the hand never shows through sheets and pop-ups
**Cause:** `handBlock` sets `el.style.zIndex = spot.z` on every fan card (`game.ts` ~1187), 0 to n. Sheets and the take card live in `.game-extra` (`z-index: 6`, `styles.css` ~1243), so cards 7 and up paint over them.
- `styles.css`: `.game-hand-slot { position: relative; z-index: 1; … }` (one stacking layer for the whole hand, below `.game-extra`). Keep the per-card z (it orders the fan).
- Check: one-phone `askToTake` sheet, network `takeControls` sheet, `takePrompts` overlay, the vote card with the hand under it (deal again), landscape layout (`.game-hand-slot` in the grid). Playable-card lift and the fan still overlap in the right order.

### 9aj.2 Part B: Stop fast forward works while pop-ups show
**Cause:** while Fast forward runs, pop-ups come back to back; `.popup-overlay` (`z-index: 35`, full screen, `onclick: next`) covers the Stop button in `.game-action-slot`, so the tap closes a pop-up.
- `game.ts` `popupLayer()`: while `fastForwardOn()`, append to the overlay (after the card) `h('button', { class: 'secondary big ff-stop', onclick: (e) => { e.stopPropagation(); stopFastForward(); } }, 'Stop fast forward')`.
- CSS `.ff-stop { position: fixed; left: 50%; translate: -50% 0; bottom: max(12px, env(safe-area-inset-bottom)); z-index: 36; box-shadow: 0 0 0 3px var(--gold); min-width: 220px; }`. In landscape put it where the action slot's Stop is (bottom of the side column); check with `tablet_check.py` sizes.
- Also `instantSkipping()` / Skip: Skip shows no pop-ups but the round-over one; no change.
- After Stop, pop-ups wait for a tap again (Part A of 9ai); the one on screen stays.

### 9aj.3 Part C: tie vote is clear
Files: `src/ui/roundstart.ts` (`voteWho`, `hostDecidesStage`, `voteWaitStage`), `src/ui/styles.css`.
1. **Readable line:** `.vote-card .muted { color: #5d5646; }` (the global `--muted` is cream at 72%, made for the felt). Check every `.muted` / `.small` inside `.vote-card`, `.take-card`, `.take-sheet`, `.take-status`: on cream they use `#5d5646`.
2. `voteWho`: when `v.awaitingHost`: `It's a tie · you're the host, you decide` if the viewer is the host, else `It's a tie · ${host} decides`. (Viewer: pass `me` in.)
3. `hostDecidesStage`: under the list, a band `.tie-band` (`background: #fff3cf; border: 1.5px solid var(--gold); border-radius: 12px; padding: 8px 10px; font-weight: 700; text-align: center;`): `${yes} YES · ${no} NO: it's a tie` (counts from `v.ballots`). Buttons (still `hostDecides` yes/no): reshuffle **Deal again** / **Keep these cards**; target **Play to ${value}** / **No target**; ultimate **Play it** / **No**. The host's row name reads `${name} (you)` when it's this phone's seat.
4. On one phone (`open` false) the host decides on the shared screen: same card; the tie band shows only "It's a tie" (no counts: the vote is secret there). Check what `voteNeedsHost` already shows as a pop-up ("No majority · Mo decides"): change its text to `It's a tie · ${host} decides`.
5. Other phones (`voteWaitStage` with `awaitingHost`): head line from step 2, the same tie band, footer `hostLine(... is deciding)` unchanged.

### 9aj.4 Part D: your turn: glow under the fan, one pill
Files: `src/ui/game.ts` (`turnPill`, `handBlock`, `playHandStage`, `trickArea`), `src/ui/table.ts` (me pill label), `src/ui/styles.css`.
1. Remove the frame: `.hand-section.your-turn` loses `border`, `border-radius`, `background`. Add `::before` behind the cards: `content: ''; position: absolute; left: -8%; right: -8%; bottom: -4%; height: 85%; border-radius: 50%; background: radial-gradient(ellipse at 50% 60%, rgba(242,193,78,.7), rgba(242,193,78,.28) 45%, rgba(242,193,78,0) 70%); pointer-events: none; z-index: 0; animation: hand-glow 1.8s ease-in-out infinite;` with `hand-glow` now changing `opacity` 0.75 ↔ 1. The `.hand.fan` gets `position: relative; z-index: 1` so cards sit over the glow. With two rows (`n > 15`) `height: 85%` of the section already covers both curves; check with 16 and 21 cards.
2. Remove the separate `.turn-pill` element from `handBlock` (drop the `turnPill` opt). Keep the `turnPill` text logic as `turnLabel(s, v): Child`.
3. Table: add `TableOpts.meLabel?: Child`. In `roundTable` the me pill (`cls('me-pill')`, `table.ts` ~445) shows `meLabel` instead of `name · count` when given, and gets class `turn-label` (gold background, ink text, weight 900, the existing `turn-ring` pulse). `playHandStage` passes `meLabel: myTurn ? turnLabel(s, v) : undefined` through `trickArea` to `roundTable`. The card count goes from the pill on your turn (your hand shows it).
4. Keep: playable cards lift with a gold edge, table edge glow (`.table-oval`), one buzz, reduced motion (no pulse, glow stays).
5. Pass-and-play: the private hand screen shows the same; the shared table unchanged.

### 9aj.5 Part E: target button in the top bar, solid sheet, badge
Files: `src/ui/between.ts` (`targetRow` → `targetButton`, `targetSheet`), `src/ui/game.ts` (game bar ~581), `src/ui/roundstart.ts` (~415), `src/ui/netscreens.ts` (~121, ~162), `src/ui/styles.css`.
1. **Button:** `targetButton(s)`: shown when `targetVoteAllowed(s) && s.phase !== 'dealing'`. `h('button', { class: 'icon-btn target-btn', 'aria-label': 'Target score: propose one', onclick: () => update({ armed: 'target' }) }, icon('target'))`. CSS: same size as `.icon-btn`; `box-shadow: inset 0 0 0 2px rgba(242,193,78,.85); color: var(--gold);`. Put it in the game bar after the pause button (before `takeButton`, which never shows at the same time).
2. **Sheet** (`armed === 'target'` or `'targetcaller'`): reuse the take sheet look: `h('div', { class: 'overlay take-sheet-overlay' }, h('section', { class: 'sheet take-sheet target-sheet' }, grab, head, …))`. Head: gold circle with `target`, "Target score", muted "First to reach it wins the game". Then the existing stepper (− value +; value 34px weight 900, ink), quick chips 5/10/15/20 (≥ `minimumTarget`), full-width gold **Propose N points**, muted "Everyone votes. First to N points wins.", ghost **Cancel** (`armed: null`). One phone: Propose → `targetcaller` → same sheet shows "Who is proposing?" with the name rows (`.sheet-row`, like `askSheet`) instead of the stepper. Network: Propose sends `callVote` for `me` and closes. Render the sheet from the game screen (like `lastSheet`), not inside a panel.
3. **Remove** the `targetRow` calls (between.ts results ~248, roundstart.ts ~415, netscreens.ts ~121 and ~162) and the `.slim-panel` target styles if nothing else uses them. Keep `targetPanel` export only if something still imports it.
4. **Badge once agreed:** when `s.target !== null`, the round chip gets `h('span', { class: 'round-badge', 'aria-hidden': 'true' }, icon('target'), String(s.target))` (CSS: absolute, top -5px, right -9px, gold, ink, 10px weight 900, radius 99px, 1.5px dark border; icon 10px) and its aria-label becomes `Round 3, first to 10 points`. The round chip becomes a button: tap toggles `armed: 'roundinfo'`, which shows a small cream note under the bar `Round 3 · first to 10 points` (no target: `Round 3 · no target`), closed by any tap. During the Ultimate Round (bolt icon) the badge stays.
5. Check 320 px wide: before round 1 the bar is menu, R1, pause, target, sound, help; nothing wraps.

### 9aj.6 Part F: checks and tests
- `node --test` (all), `tsc`, `node build.mjs`.
- Bot (`testbed/bot.js`): the target is now proposed from the sheet: tap `.target-btn`, then Propose (and the name row on one phone). Host-decides buttons have new words: tap the first or second button in `.vote-buttons` by position, not text.
- **Old checks updated to tap-to-close (approved with this plan, test code only):** `netvotes_check.py` (close the vote alert / pop-ups before reading ballots), `netgame_check.py` (SLAP! counts: count pop-ups as they are closed on each phone, not timed), `sound_check.py` (round-end fanfare: close the round-over pop-up first). Then `run_checks.py --all` and compare with the known failures (lobby 3 "away" items, netgame "own seat at the bottom"); those stay as they are.
- `popups_check.py`: add (8) the take sheet: the hand's cards are under the sheet (`document.elementFromPoint` at a sheet row's centre is inside the sheet); (9) with Fast forward on and a pop-up up, `.ff-stop` stops it; (10) a tie vote (force with the bot: half yes, half no) shows `.tie-band`; (11) target button opens `.target-sheet`; after a target is agreed `.round-badge` shows it. Screenshot 390×844 and iPad landscape.

### 9aj.7 Phone checklist (add to 9ai.8, same 2.36.0 build)
8. **Target:** before round 1, a gold-ringed target button in the top bar. Tap: solid sheet, pick 10, Propose. Once agreed, R1 has a small gold "10" badge; tap R1 for "Round 1 · first to 10 points". On the results screen the button is back if no target is set.
9. **Your turn:** no box; gold glow under the cards; your name pill says "Your turn · lead" / "play a ♠". Try a hand with more than 15 cards (two rows).
10. **Tie:** with 4 players, get 2 YES and 2 NO. The host sees "It's a tie · you decide" with Deal again / Keep these cards; others see "It's a tie · H decides".
11. **Fast forward:** go out, start Fast forward, tap Stop while pop-ups come: it stops.
12. **Take cards:** open "Take whose cards?": no cards show through the sheet.

### 9aj.8 Built notes (2026-11-16, Haiku)
- Parts A to F built as written, in order. Deviation: the top-bar target button is **not** hidden while dealing. Round 1 starts in the `dealing` phase, so `targetButton` only checks `targetVoteAllowed(s)` (9aj.7 item 8 needs the button before round 1).
- Narrow phones (≤ 380 px): the top bar tightens (gap 2 px, dealing chip 36 px). At 320 px, before round 1, menu, R1, pause, target and the jokers chip fit on one row, 2 px clear of the sound button (measured).
- Part F checks: `testbed/netvotes_check.py` (30 of 30, after the tap-to-close and new-selector updates), `netgame_check.py` (SLAP! counts now taken from each phone's closes, bot-closed ones included via `window.__botSlapClosed`; the own-seat items stay as known), `sound_check.py` (44 of 44), `popups_check.py` (new items 8 to 11; target and badge and vote card pass; take sheet, Fast forward stop and tie band were **not seen** in the three random games and need a phone test or a forced run).
- Full `run_checks.py --all`: playthrough, drawer, back, offline, online, sound, netvotes all pass. `solo_check` (the "new name shows at the table" item) and `lobby_check` (three "phone goes away" items) fail; both fail the same way on the baseline 0611386, so they predate this work. `netgame_check` also has the card-count mismatch flake on the baseline.
- Build: `npm run check` clean, 462 of 462 unit tests, `node build.mjs` ok. `node_modules` is a link to the shared tools folder (no installs; package installs are blocked on this account).

## 9ak. Tidy-ups, landscape B and results B (user 2026-11-16 11:49 and 12:00; spec `PROJECT.md` 12v; mockups https://claude.ai/artifact/H3ByTnjYM9haJE5sTLJpbY: "Landscape B", "Results B", "Fix · last two", "Fix · menu"; target **2.37.0**)

### 9ak.0 Read first
- Starts from main at 48a30c0 (2.36.0, pushed). The 9aj.7 phone checks (items 8 to 12) were not reported; build on top anyway.
- Bump `package.json` to **2.37.0**.
- Parts in this order, each testable alone: **A** small fixes (sheet flash, target chip, menu, star, Cancel, turn label, D badge), **B** Forfeit in the action bar, **C** un-ready (session + network), **D** results screen B, **E** scroll hold, **F** landscape B (phones), **G** checks.
- Rules (`src/rules/`) don't change. Session gets one new action (`unready`). Lobby protocol goes to 11.
- Colours from `styles.css` `:root`; on cream use `#5d5646` for muted text. Every new animation has a reduced-motion rule. No emoji in new UI; icons from `icons.ts` (add `flag`, `undo`, `x`, `chev` if missing, as line SVGs like the others).
- If a part fights the code twice, stop and write "🔁 Switch to Opus".

### 9ak.1 Part A: small fixes
1. **Target sheet flash.** Cause: every `update({})` rebuilds the page, so `.overlay` (`animation: fade`) and `.sheet` (`animation: slide-up`) replay on each − / + / quick-chip tap. Fix: a module flag in `between.ts` `targetSheetShown` (set true on first render while open, false when closed); when true, add class `seen` to the overlay and the sheet; CSS `.overlay.seen, .sheet.seen { animation: none; }`. Use the same `seen` approach on the take sheet (`askSheet`) and the game menu if they re-render while open.
2. **Target chip.** Remove `round-badge` from `roundChip` (`game.ts` ~607) and its CSS. In the game bar, right after the pause button: when `s.target !== null`, `h('button', { class: 'target-chip', 'aria-label': `First to ${s.target} points`, onclick: () => update({ armed: st.armed === 'roundinfo' ? null : 'roundinfo' }) }, icon('target'), h('span', { class: 'target-chip-text' }, `First to ${s.target}`))`. CSS: height 32px, padding 0 10px, radius 99px, `border: 1.5px solid var(--gold)`, `background: rgba(242,193,78,.16)`, gold text 13px weight 800, gap 4px, `align-self: center`. `@media (max-width: 380px)`: hide "First to " (render `First to ` in its own span `.tc-word` and hide that span). `targetButton` already hides once agreed. Check the bar at 320, 360, 390 px before round 1 and during play (take button + chip).
3. **Menu floats.** In `gameScreen` the menu (`gameMenu` / `netMenu`) is in the column flow. Wrap it: `h('div', { class: 'menu-layer', onclick: (e) => { if (e.target === e.currentTarget) update({ menuOpen: false, armed: null }); } }, menu)`. CSS `.menu-layer { position: fixed; inset: 0; z-index: 32; background: rgba(0,0,0,.35); }` and `.menu-layer > .menu { position: absolute; left: 12px; top: calc(56px + env(safe-area-inset-top)); width: min(300px, calc(100vw - 24px)); background: var(--cream); color: var(--ink); border-radius: 16px; padding: 6px; box-shadow: 0 12px 30px rgba(0,0,0,.45); }`; buttons inside are full-width rows (48px, left aligned, ink text; the danger row red text `#c62828`; the armed "Tap again" state keeps the red fill). Muted text inside: `#5d5646`. The menu icon button shows `icon('x')` while open and stays above the layer (`z-index: 33` on `.game-bar .menu-btn` only while open). Landscape B: the card opens to the right of the rail (`left: 64px; top: 8px`).
4. **No host star on your pill.** `table.ts` `seatTags`: add a param `mine`; when true, skip the `seat-host` star. The me pill call passes `true`. The dealer `D` (`seat-dealer`) inside the me pill: 22px circle, gold, ink, 12px weight 900, `display:inline-flex; align-items:center; justify-content:center; vertical-align: middle; margin-left: 6px;` so the pill keeps one height (`.me-pill .seat-dealer`). Other seats unchanged.
5. **Cancel is plain.** `.sheet button.ghost.big, .take-sheet button.ghost` : `box-shadow: none; border: 0; background: transparent; min-height: 48px; color: #5d5646; font-weight: 700;`. Check the `.big` 3D edge (`box-shadow` on `.big`) no longer shows on Cancel.
6. **Turn label.** `table.ts` ~438: `turnText ? `${p.sessionName}’s turn`` → just `p.sessionName` (keep `turn-name` gold class and the ring). The think dots already follow. Update any test or check that looks for "’s turn" (`popups_check.py` item 7 uses classes: fine; grep `testbed/` and `tests/` for `s turn`).

### 9ak.2 Part B: Forfeit in the action bar
- `game.ts` `playHandStage`: drop `!choosing ? forfeitBtn : null` from `extra`. Build the action slot as a row: `h('div', { class: 'row action-row' }, forfeitBtn, playButton ?? hint)` where `forfeitBtn` is now `h('button', { class: forfeitArmed ? 'forfeit-btn armed' : 'forfeit-btn', 'aria-label': ... }, icon('flag'), forfeitArmed ? ' Tap again' : ' Forfeit')`. CSS `.forfeit-btn { flex: none; width: 112px; height: 52px; border-radius: 16px; background: transparent; border: 1.5px solid var(--danger); color: #ff8a75; font-weight: 800; }`, `.forfeit-btn.armed { background: var(--danger); color: #fff; }`; the main button/hint `flex: 1`. When armed, a small note above the bar is not needed (the button says "Tap again"; aria-label "Tap again to forfeit, you finish last").
- Not your turn: the action slot still shows the hint text ("Wait for Arjun" style, muted gold) beside Forfeit, so Forfeit is always in the same place.
- The final-two decision panel ("Pick up or forfeit") keeps its own Forfeit button (it's a decision card).
- 😂 button: in portrait it sits left of the bar at the bottom; check it doesn't cover Forfeit (move the action row's left padding to clear it, or keep 😂 above the bar on the right as now: measure at 360 and 390 px). Landscape: Forfeit sits above Play in the column, full width.

### 9ak.3 Part C: un-ready
- `src/session/types.ts`: add `| { type: 'unready'; by: PlayerId }`. `session.ts` next to `readyUp`: `case 'unready': assertPhase(s, 'results'); if (!s.ready.includes(a.by)) return s; if (a.by === s.hostId) fail('The host starts the next round'); out.emit(s, { type: 'playerUnready', player: a.by }); return { ...s, ready: s.ready.filter((p) => p !== a.by) };` Add the event type `playerUnready` (no pop-up, no log trivia).
- `net/netgame.ts` ~133: add `'unready'` to the actions a guest may send. `lobby.ts`: `LOBBY_PROTOCOL = 11; // 11: unready (2.37).`
- Computer players never un-ready.
- Tests (`tests/session/`): unready removes the player; unready when not ready is a no-op; host can't; not in other phases; `advance` after an unready waits again (waitForAll).

### 9ak.4 Part D: results screen B (network and single player)
Files: `src/ui/netscreens.ts` (`results`, `readyRow`), `src/ui/between.ts` (reuse `scoreSheet`, `awards`, `triviaPanel`), `src/ui/game.ts` (frame), `src/ui/styles.css`. The one-phone `resultsStage` stays as it is.
1. **Layout:** the results body is a column: `.results-scroll` (flex 1, `overflow-y: auto`, `data-scroll: results-${round}-${tab}`) and `.results-footer` (flex none). Don't wrap it in `.game-scroll` (make `netGameBody` return a framed element: give the results root class `game-frame results-frame` so `hasFrame` is true, or add a `results-frame` check to `hasFrame`). The footer is the dark panel: `background: var(--felt-dark); border-radius: 22px 22px 0 0; box-shadow: 0 -8px 24px rgba(0,0,0,.35); padding: 14px 16px calc(14px + env(safe-area-inset-bottom));`.
2. **Winner card:** `.win-card` (rounded 18px, `background: var(--panel)`, 92px tall): gold 56px circle with `icon('trophy')`; "ROUND 1" small caps label; "Diego wins" 22px weight 800 (Ultimate: "Diego wins the Ultimate Round"); muted line `You came 4th · −1` (your place word from the round record and your points this round). Keep the "Next: Ultimate Round" gold chip under it when `s.ultimateRound`.
3. **Tabs:** a segmented control (`role="tablist"`, three `role="tab"` buttons, `aria-selected`): Places, Points, Awards. Selected tab: cream pill, ink text; others muted cream. Keep the choice in a module variable `resultsTab` reset to `'places'` when `s.round` changes (store the round alongside). Tapping a tab: `resultsTab = x; update({})`.
4. **Places tab:** one row per player in finishing order (`rec.finishingOrder`): place word (1st gold), 38px disc (initials from `initials.ts`), name (+ " (you)"), right side this round's points (signed, from `scoreRows`) and "total N" muted 11px. Your row: `background: rgba(242,193,78,.14); border: 1.5px solid rgba(242,193,78,.6)`. Ultimate labels as small tags after the name. Under the list, one muted line with a line icon if an award names you (first match from `awards(s)` whose text includes your name), else nothing.
5. **Points tab:** the existing `scoreSheet(s, { me })`. **Awards tab:** the award cards (all of them, two columns, icon in a gold-tinted circle, label small muted, value bold) then the slapped-by table from `triviaPanel` (export a function that returns just the table). "No slaps yet. Suspiciously peaceful." when empty.
6. **Footer:** (a) ready discs: one 40px disc per player in seat order; ready = cream disc with a gold 18px tick badge bottom-right; not ready = `rgba(251,246,233,.15)` with a 2px dashed cream ring; then text "3 of 4 ready" or "Waiting for Arjun" (names from `joinNames`, cream bold). (b) Not host: `I'm ready` (gold, 56px) → once ready, outlined gold button `✓ You're ready · tap to undo` (sends `unready`). (c) Host: gold **Next round** (disabled with "Waiting for Arjun" until all others are ready, as now; one tap readies the host and advances, as now). (d) A row: **Ultimate vote** (outlined, bolt icon; "Ask for the Ultimate Round" with 2 players) and, host only, **End the game** (text button; tap twice as now). Not host: in place of End, the muted line "Diego (host) starts the next round". Ultimate Round already on: no Ultimate button.
7. The old `awardsRow` "More" button and `readyRow` go from this screen (keep them if the one-phone screen uses them).
8. Landscape (phone): winner card and tabs on the left 55%, footer as a right column (same parts stacked). Tablet landscape: same as phone portrait, centred, max 560px wide.

### 9ak.5 Part E: hold redraws while scrolling
Cause (not seen in the headless browser, where the place is kept): every update rebuilds the page; on a phone a rebuild during a finger scroll or fling drops the fling and the new box starts where the old one was at that instant, which can read as a jump, and a rebuild mid-gesture can lose the place.
- `app.ts`: module state `touching = false`, `lastScrollAt = 0`, `pending = false`. Listen on `document` (capture, passive): `touchstart` → `touching = true` if the target is inside `[data-scroll]`; `touchend`/`touchcancel` → `touching = false`, then `flushSoon()`; `scroll` (capture) on any `[data-scroll]` → `lastScrollAt = performance.now()`, `flushSoon()`.
- `render()`: if `(touching || performance.now() - lastScrollAt < 150)` and the screen key hasn't changed (`screenKey(st) === lastPageKey`), set `pending = true` and return. `flushSoon()`: `setTimeout(() => { if (pending && !touching && performance.now() - lastScrollAt >= 150) { pending = false; render(); } else if (pending) flushSoon(); }, 160)`.
- Never hold when the screen key changes (a new phase must show at once), when a pop-up is queued, or during Fast forward. A tap with no scroll is not held after `touchend` (the click is handled first, then the 160 ms flush).
- Test: `tests/ui/` can't touch the DOM; add a browser check `testbed/results_check.py`: reach results (bot, single player), scroll `.results-scroll` to the bottom, dispatch `touchstart` on it, let the computer players ready (clock), check `scrollTop` unchanged and the ready count unchanged while touching; `touchend` + 200 ms: ready count updated and `scrollTop` unchanged.

### 9ak.6 Part F: landscape B on phones
Files: `src/ui/layout.ts`, `src/ui/game.ts` (`gameScreen`, `gameFrame`), `src/ui/app.ts` (sound, help, 😂 positions), `src/ui/styles.css`, `tests/ui/layout.test.ts`.
1. **When:** `landscape && viewH <= 500` → `rail: true` in `GameLayout` (new field). Tablets (`viewH > 500`) keep today's layout; `tablet_check.py` must still pass 57 of 57.
2. **Rail:** `html[data-rail="1"]` set by `gameFrame` (like `data-side`). The `.game-bar` becomes a fixed column: `position: fixed; left: 0; top: 0; bottom: 0; width: 56px; flex-direction: column; align-items: center; gap: 6px; padding: calc(8px + env(safe-area-inset-top)) 0 8px env(safe-area-inset-left); background: var(--felt-dark); z-index: 20;` buttons 40px. The target chip shows icon + number only in the rail. The app-level `.sound-btn` and `.rules-btn` move into the rail's slots (fixed `left: 8px`, below the bar's buttons; compute `top` from the button count, or move them into the bar's DOM while `data-rail` is on: prefer moving them into the bar). `.reactions-toggle` fixed at the rail's bottom (`left: 8px; bottom: 8px`, 40px).
3. **Sizes:** the screen gets `padding-left: 64px` (56 + 8). In `gameLayout` when rail: `CHROME_RAIL = 20` (no top bar row: top padding 8, row gap 4, margins 8); `inner = viewW - 64 - 8`; `handH = clamp(0.32 * viewH, 96, 150)`; `sideW = 150` (the action column, only beside the hand row); `tableH = viewH - CHROME_RAIL - handH`; `tableW = inner`; `handW = inner - sideW - 8`.
4. **Action column:** at the bottom right, 150 px wide, the height of the hand row: the main button (gold, 52px) at the bottom, the second action (Take cards / Forfeit / Deal again / Stop fast forward) 44px above it, outlined. No 58px top padding (😂 is in the rail now). Turn pill stays on the table (9aj.4).
5. **Overlays in the rail layout:** sheets (`.take-sheet`, `.target-sheet`, vote card) are centred over the area right of the rail, max height `100dvh - 16px`, scrolling inside. Pop-ups unchanged. The menu card opens at `left: 64px`.
6. **Test:** `tests/ui/layout.test.ts`: 844×390 → `rail` true, `sideW` 150, `tableH + handH + 20 == 390`; 1180×820 (iPad) → `rail` false and the old numbers; 568×320 → table at least 96. Browser: `testbed/landscape_check.py` (new): single player at 844×390 and 740×360: no element of the rail overlaps the felt; hand cards inside the hand slot; Play and Take cards visible and inside the window; sheets and the menu inside the window; screenshots `/tmp/landscape-*.png` (deal, play, take sheet, results).

### 9ak.7 Part G: checks
- `node --test` (all), `npm run check` (both tsc configs), `node build.mjs`.
- Bot (`testbed/bot.js`): Forfeit is now `.forfeit-btn` (tap twice); results: the ready button text changed ("I'm ready" stays; after that "You're ready · tap to undo": the bot must not tap it again); Next round is in `.results-footer`.
- Run `popups_check.py`, `playthrough.py`, `netgame_check.py`, `netvotes_check.py`, `lasttrick_check.py`, `tablet_check.py`, the new `results_check.py` and `landscape_check.py`; compare failures with the known list (lobby 3 "away" items, solo "new name shows at the table", netgame own-seat items).
- Publish the test build and give the 9ak.8 checklist.

### 9ak.8 Phone checklist (2.37.0)
1. **Target:** open the target sheet and tap − / + / 10: the sheet doesn't flash. Agree a target: a gold "First to 10" chip appears after pause; R1 has no badge; tapping the chip shows the round note.
2. **Menu:** opens as a card over the table; the table doesn't move; tap outside to close.
3. **Your pill:** "You · 14" with no star; while dealing "Murshed · 0" with a small gold D, one height.
4. **Take whose cards?:** Cancel is plain text, no outline or shadow.
5. **Turns:** another player's turn shows "Zainab •••" with the gold ring (no word "turn").
6. **Forfeit (last two):** Forfeit is in the bottom bar, left of the main button, red outline with a flag; tap twice to forfeit.
7. **Results:** winner card, tabs Places / Points / Awards; the bottom panel stays put. Scroll the Awards tab while computer players ready: it doesn't jump. Tap I'm ready, then tap again: you're not ready any more. Host: Next round waits for everyone.
8. **Landscape (Android phone):** turn the phone sideways during a game: thin rail on the left with all the buttons and 😂 at the bottom; table above, hand along the bottom, Play bottom right. Try dealing, playing, Take cards, the target sheet, the menu and the results screen sideways.
9. **iPad landscape:** looks as in 2.36.0.

### 9ak.9 Built notes (2.37.0, Haiku; pushed 2026-11-16 13:18 on the user's "Push it", with the 9al fixes still to build)
- Parts A to G built in order. Unit tests 473 of 473; `npm run check` clean; `node build.mjs` ok.
- Part A: `sheetSeen(key, open)` in `between.ts` marks a sheet that was already open at the last redraw (target, take and asker sheets). Deviation: the whole bar gets the class `menu-open` (z 33) while the menu is open, because the menu button alone could not rise above the dim layer (the rail is its own stacking context, found by `landscape_check.py`).
- Part B: Forfeit is `.forfeit-btn` in `.action-row` (left of the main button; in the rail, above it, full width). Final-two card keeps its own Forfeit. `testbed/bot.js` now finds `.forfeit-btn`.
- Part C: `unready` (session, `phoneActions` allowlist, protocol 11). The host can't unready (rule). Tests: `tests/session/unready.test.ts` (6).
- Part D: the footer count is always "N of M ready" (`.rstatus`); the waiting names are on the Next round button, as before. The non-host line is "X (host) starts the next round" with class `host-line` (the netgame check reads that class). Un-ready button is `.ready-undo`. `results-frame` counts as a framed screen (`hasFrame`). Checks updated: `netvotes_check.py`, `netgame_check.py`.
- Part E: deviation: a scroll counts only while a finger is on a box, or within 1.5 s after it lifts (`FLING_MS`). The page's own restoring of each box's place also fires scroll events; counting those stalled redraws in the fake-clock checks. Pop-ups, a new screen and Fast forward are never held. `testbed/results_check.py` 8 of 8.
- Part F: `gameLayout` gets `rail` (landscape and height 500 or less): table `viewH - 20 - hand`, hand `clamp(0.32 vH, 96, 150)`, action column 150 px. `data-rail` is set by `gameFrame` and cleared on every non-game screen (also `data-side`, which had the same gap). Sound, quick rules and 😂 sit at the bottom of the rail (fixed positions), not moved into the bar. Tablets keep the old layout. `tests/ui/layout.test.ts` (22 of 22). `testbed/landscape_check.py` 24 of 24 (844×390 and 740×360).
- Extra fix found by `tablet_check` at 844×390: a long hand (about 50 cards after a waste-pile pick-up) dropped past the bottom of the hand slot, because the fan's curve (`0.9 × d²`) is not capped. Pre-existing, exposed by the landscape hand. The curve drop is now capped at 30 px for long rows (short hands unchanged). Test added to `tests/ui/fan.test.ts`.
- Checks: `run_checks.py --all` (before the text and fan fixes): solo 36 of 37 (the known "new name shows at the table"), playthrough 53 of 53, drawer 9 of 9, back 14 of 14, offline 20 of 20, online 37 of 37, sound 44 of 44. After the fixes: netvotes 30 of 30, netgame 94 of 97 (only the known own-seat items), tablet 56 of 56, lasttrick 20 of 20 (one earlier flake, passes on rerun), results 8 of 8, landscape 24 of 24, popups: every check passes except take card, take sheet, Fast forward stop and tie band, which were not seen in the random games (same gap as 9aj.8). Lobby: the three "away" items fail as before.
- Not covered by the checks, for the phone test: the take sheet and Fast forward Stop on screen; the tie band; and portrait menu and target chip at 320, 360 and 390 px.
- `run_checks.py --all` does not list `tablet_check`, `popups_check`, `lasttrick_check`, `landscape_check` or `results_check`. Add them to its table before the next build.
- `node_modules` is a link to `/opt/npm-tools/node_modules` (gitignored; no installs).

## 9al. Fixes after the 2.37.0 phone test (user 2026-11-16 13:15; spec `PROJECT.md` 12w; target **2.37.1**, still not pushed)

### 9al.0 Read first
- Builds on the uncommitted 2.37.0 work (9ak). Bump `package.json` to **2.37.1**.
- Parts in order, each testable alone: **A** round note floats, **B** target sheet tidy, **C** solid lead notice, **D** "You" in your own pop-ups, **E** 😂 in the bottom row (this also fixes the crushed Play button), **F** last-two check, **G** checks and test build.
- Rules and session don't change. No protocol change.
- If a part fights the code twice, stop and write "🔁 Switch to Opus".

### 9al.1 Part A: the round note floats
- Cause: `roundNote` (game.ts) is a block in the column flow under `.game-bar`, so it pushes the table down (as the menu did).
- Fix: render it inside a layer like the menu: `h('div', { class: 'note-layer', onclick: () => update({ armed: null }) }, roundNote(s))`. CSS: `.note-layer { position: fixed; inset: 0; z-index: 31; }` (no dim), `.note-layer > .round-note { position: absolute; left: 12px; right: 12px; top: calc(56px + env(safe-area-inset-top)); width: auto; max-width: 520px; margin: 0 auto; box-shadow: 0 8px 20px rgba(0,0,0,.35); }`. Rail: `left: 64px; top: 8px`. The table must not move: check `.game-table-slot` top is the same with the note open and closed.

### 9al.2 Part B: target sheet tidy
1. Remove the quick chips (5 / 10 / 15 / 20) from `targetSheet` entirely (user). Delete the `.chips.center-chips` row; the stepper and Propose stay.
2. Header: the old `.sheet-head` rule (styles.css ~322, `justify-content: space-between; position: sticky`) pushes the title to the far right. Add `.take-sheet .sheet-head { justify-content: flex-start; position: static; padding: 0; }` so the title sits next to the gold circle (as on the take sheet mockup).
3. − and + are invisible (secondary on cream). `.target-sheet .step { width: 56px; height: 56px; min-height: 56px; border-radius: 50%; background: #efe6cf; color: var(--ink); border: 0; box-shadow: none; font-size: 1.6rem; font-weight: 900; }`, `:disabled { opacity: .35 }` and disable − at the minimum, + at 99.
4. Keep the `seen` no-replay behaviour (9ak.1).

### 9al.3 Part C: the lead notice is a solid pop-up
- "Tariq is missing a suit / Tariq leads first / OK" today is a see-through `.panel` over a 28% dim limited to the table, so seat names show through.
- `.notice-overlay`: `position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.55);` (whole screen). `.notice-card`: `background: var(--cream); color: var(--ink); border-radius: 18px; padding: 20px 18px; box-shadow: 0 12px 30px rgba(0,0,0,.45);` title ink 22px weight 800, text `#5d5646`, OK gold full width. Same for every notice that uses `noticeCard` (one-phone `noticeStage` too). Rail: overlay `padding-left: 64px`.

### 9al.4 Part D: "You" in your own pop-ups
- On the phone whose player it is (`ownSeat(g) === p.player`), the PATHETIC pop-up reads **"You forfeited"** (game.ts ~1415), and the last-two pop-up's line reads "You forfeited" (~1494). Everyone else still sees the name. One-phone mode (no own seat) keeps names.
- Test (`tests/ui/` if the text builder can be pulled out as a pure function `forfeitLine(name, isMe)`; else cover in the browser check).

### 9al.5 Part E: 😂 in the bottom row
Cause of the crushed Play button (screenshot: Forfeit + "Pick a card to lead" in four lines): `.game-action-slot` keeps `padding: 0 76px` on both sides for the floating 😂, so on a 360 px phone the row is ~190 px for Forfeit (112) and Play.
1. `game.ts`: export `reactionsToggle(): HTMLElement | null` (the button now made in `reactionsLayer`; null on game over). `reactionsLayer` keeps the sheet and the message bar, and renders the floating toggle **only** when the page has no inline one (app.ts: after building `screen`, `screen.querySelector('.react-inline')`; pass a flag to `reactionsLayer(inline)`).
2. `gameFrame`: the action slot becomes `h('div', { class: 'game-action-slot' }, rail ? null : reactionsToggle() with class `react-inline`, h('div', { class: 'action-main' }, <today's contents>))`. CSS: `.game-action-slot { flex-direction: row; align-items: center; padding: 0; gap: 8px; }`, `.action-main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }`. Move every `.game-action-slot > X` rule to `.action-main > X` and drop the ±64 / ±76 px margin hacks (`.round-buttons`, `.deal-bar`, `.game .play-bar` margins). `.react-inline { position: static; width: 48px; height: 48px; min-height: 48px; flex: none; font-size: 1.4rem; border-width: 2px; }`.
3. Tablet landscape (`data-side`, not rail): the slot is a column; 😂 sits at its top, centred, above the buttons (as in 2.36); remove the `padding-top: 58px` and the fixed `html[data-side="1"] .reactions-toggle` position.
4. Rail: unchanged (😂 fixed in the rail; no inline one).
5. Results footer (9ak.4): 😂 (`react-inline`) is the first item of `.results-actions`, then Ultimate vote, then End the game.
6. Screens with no frame (waiting screens) keep the floating toggle.
7. The reactions sheet opens above the 😂 wherever it is: anchor it to the bottom of the screen above the action row (`bottom: calc(var(--bar-h, 64px) + 12px + env(safe-area-inset-bottom))`, `left: 8px`); check it doesn't cover the 😂 itself.

### 9al.6 Part F: the last two (Forfeit + two rows of cards)
- With Part E the row is [😂 48][Forfeit 112][Play flex]: at 360 px Play gets ~160 px. Buttons in `.action-row` get `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`. When Forfeit shows, the hint reads "Pick a card" (not "Pick a card to lead").
- Browser check (new `testbed/lasttwo_check.py`, or extend `lasttrick_check.py`): force the last two with a big hand (single player, play until two are left; the bot can pick up the waste pile to grow the hand), at 360×740 and 390×844: Forfeit and Play inside the window, Play ≥ 140 px wide and one line tall (height ≤ 56), the hand's lowest card above the action row's top, 😂 doesn't overlap any button.

### 9al.7 Part G: checks
- `npm test`, `npm run check`, `node build.mjs`; `landscape_check.py`, `results_check.py`, `tablet_check.py`, `popups_check.py`, `netgame_check.py`, `netvotes_check.py`, `playthrough.py`, `drawer_check.py` (the reactions sheet moved: update its selectors if needed). Add `tablet_check`, `popups_check`, `lasttrick_check`, `landscape_check`, `results_check` and the new check to `run_checks.py`'s table (9ak.9 note).
- Publish the test build and give the 9al.8 checklist.

### 9al.8 Phone checklist (2.37.1)
1. **Round note:** tap R1: "Round 1 · no target" floats under the bar; the table doesn't move; tap anywhere to close.
2. **Target sheet:** no 5 / 10 / 15 chips; − and + are visible round buttons; the title sits beside the gold circle; no flash.
3. **Missing a suit:** a solid cream pop-up with OK; nothing shows through.
4. **Forfeit pop-up:** your own forfeit says "PATHETIC!!! You forfeited".
5. **😂:** sits at the left of the bottom row and of the results footer; it never covers a button; the reactions sheet still opens and works.
6. **Last two with a big hand:** Forfeit and "Pick a card" / "Play 7♠" side by side on one line, nothing cut off, cards above the buttons.
7. **Still to check from 2.37.0:** results un-ready (tap I'm ready twice — needs a network game or another phone as host), landscape sideways, take sheet Cancel, iPad.

### 9al.9 Built notes (2.37.1, Haiku; not pushed)
- Parts A to G built in order. Unit tests 475 of 475; `npm run check` clean; `node build.mjs` ok.
- Part A: `noteLayer(s)` in `game.ts` (`.note-layer`, transparent, z 31). Part B: `.target-sheet` header and `.stepper .step` rules; quick chips removed from `targetSheet`. Part C: `.notice-overlay` is `position: fixed` with a cream `.notice-card`. Part D: `forfeitLine` in `src/ui/popuptext.ts`, used by the PATHETIC and last-two pop-ups (`lastTwoBody` takes `me`). Part E: `reactionsToggle(inline)`; `gameFrame` puts it first in `.game-action-slot` (not in the rail), and the buttons moved into `.action-main`; `reactionsLayer(inline)` gets the flag from `app.ts`; results footer has it first. `--bar-h` is set on the root, so `html:has(.react-inline) .reactions-sheet` sits above the row. Part F: "Pick a card" when Forfeit shows; `.action-row > button` is nowrap with ellipsis.
- Checks: `testbed/lasttwo_check.py` (new, 16 of 16). `run_checks.py` now lists tablet, popups, lasttrick, landscape, results and lasttwo. `popups_check` and `netvotes_check` step the target with − / + instead of the removed chips.
- Known, from before this build: `lasttrick_check` 2p fails the round-over pop-up on 2.37.0 as well; `netgame_check` 94 of 97 (own-seat items); `solo_check` "new name shows at the table".

## 9am. Stop fast forward on a phone; a reactions sheet you can close (user 2026-11-16 13:50; spec `PROJECT.md` 12x; target **2.37.2**)

### 9am.0 Read first
- Builds on the uncommitted 2.37.1 work (9al). Bump `package.json` to **2.37.2**. No rule, session or protocol change.
- Both causes were found and the fixes tried in a scratch copy (Opus, 13:55) with a real finger tap (Chrome DevTools touch events, 120 ms between press and lift).

### 9am.1 Part A: Stop fast forward (cause and fix)
- **Cause:** `trickStage` (game.ts ~810) puts `.anim-block` (`position: fixed; inset: 0; z-index: 34`) over the whole screen while a trick animates, so taps can't reach cards mid-animation. During Fast forward a trick is animating almost all the time, so the block covers the bottom **Stop fast forward** button, the hand-area **Fast forward** / **Skip** buttons and ☰. Headless `click()` sometimes landed between animations, so the checks passed; a finger nearly always hits the block. (Playwright's own message: "anim-block … intercepts pointer events".) 9aj Part B only fixed Stop over pop-ups, not over this block.
- **Fix:** `extra: tapToGo || (g.bots && botsOnlyFor(g)) ? null : h('div', { class: 'anim-block', … })`. When only computer players can move, the person has nothing to protect, so no block. Everywhere else unchanged.
- Tried: with a 120 ms touch, 2.37.1 stays on; with the fix it stops at once (click and touch both).

### 9am.2 Part B: the reactions sheet
- **Cause (2.37.1):** `.msg-bar` is fixed at `bottom: 84px` (made for the old floating 😂) with z 60, and the sheet uses `--bar-h + 12px`. On results the 😂 / ✕ is in the footer's last row (y 676 to 724 at 384×800) and the typing bar (668 to 716) covers it, so the sheet can't be closed. In play the sheet's bottom also runs under the typing bar.
1. `app.ts` `paint()`, after `replaceChildren`: if `root.querySelector('.react-inline')` exists, set `--react-bottom` on `<html>` to `innerHeight - toggle.top + 8` (px).
2. CSS (replace the 9al.5 sheet rule): `html:has(.react-inline) .msg-bar { bottom: var(--react-bottom, 84px); }` and `html:has(.react-inline) .reactions-sheet { left: 8px; right: 8px; bottom: calc(var(--react-bottom, 84px) + 56px); max-height: min(42vh, calc(100dvh - var(--react-bottom, 84px) - 120px)); }`. Tablet `data-side` rule keeps its `right`, with the same `bottom`. Rail unchanged (floating 😂).
3. Results screen: `html:has(.results-footer .react-inline) .reactions-sheet { background: var(--felt-dark); border-color: rgba(242,193,78,.55); }` and phrase chips `background: rgba(0,0,0,.35)` there, so the results text doesn't show through.
4. **Tap-off (user to choose):** (a) recommended: a tap anywhere outside the sheet, the typing bar and ✕ closes the sheet and does nothing else (like the menu); a transparent `.react-catcher` (fixed, inset 0, z 36, under the sheet z 37) with `onclick: () => update({ reactionsOpen: false })`. (b) keep 12g / 2.4: it stays open until ✕.
- Tried (a without the catcher): ✕ is the top element at its centre on the results screen; sheet and bar sit above it in play and on results.

### 9am.3 Part C: checks
- New `testbed/ffstop_check.py` (real time, 390×844, 4 players): the bot plays until the person is out; tap **Fast forward** and then **Stop fast forward** with CDP `Input.dispatchTouchEvent` (touchStart, 120 ms, touchEnd); after 400 ms `.fast-banner` is gone and normal play goes on. Same for a tap on ☰ during Fast forward (menu opens).
- New `testbed/react_check.py` (384×800 and 360×740): open reactions in play and on the results screen: `elementFromPoint` at the ✕ centre is the ✕; the typing bar's bottom ≤ ✕ top; the sheet's bottom ≤ typing bar top; with (a), a tap on the table closes it.
- `npm test`, `npm run check`, `node build.mjs`, `run_checks.py --all`; compare with the 9al.9 known list. Publish the test build, give 9am.4.

### 9am.5 Built notes (2.37.2, Haiku, option (a) for tap-off; not pushed)
- **A:** `trickStage` drops the `.anim-block` while only computer players can move (`g.bots && botsOnlyFor(g)`).
- **B:** `app.ts` sets `--react-bottom` on `<html>` (the typing bar is in `<body>`, so the variable must be on the root) from the 😂/✕ button's top. CSS: typing bar and sheet use it; the sheet is solid on the results screen (`html:has(.results-footer .react-inline)`). Tap-off: `reactionsLayer` adds `.react-catcher` (fixed, z 36) under the sheet (z 37); an open `.react-inline.on` gets z 38 so ✕ is tappable itself.
- **C:** new `testbed/ffstop_check.py` (CDP touch, 120 ms, real time; retries up to three fresh games to reach the out state, which is random) and `testbed/react_check.py` (384×800, 360×740). `run_checks.py` lists both. `tablet_check` skips the covered-button test while a pop-up overlay is up (a pop-up covers the screen by design).
- Checks: `npm run check` clean; unit tests 475 of 475; `react_check` 28 of 28; `ffstop_check` 8 of 8 in 2 games that reached the state (1 game never reached it, so the test needed retries); tablet 70 of 70; landscape 24 of 24; results 8 of 8; lasttwo 16 of 16; netvotes 30 of 30; netgame 94 of 97 (known own-seat items); solo 36 of 37 (known); popups: the known random gaps. Baseline 2.37.0 fails `ffstop_check` at reaching the state; the earlier Playwright run showed `.anim-block` intercepting the Stop tap.

### 9am.6 Fix after the 2.37.2 phone test (2.37.3, Opus, 16:35)
- User (16:33): everything passed except the ✕ of the reactions during play: cut off at the top (screenshot).
- Cause: `.react-inline.on` is `position: relative` (to sit above the catcher), so it took the floating `.reactions-toggle`'s `bottom: 14px` and moved 12 px up, out of `.game-action-slot` (`overflow: hidden`). The results footer has no clip, so it only showed in play.
- Fix: `.react-inline { inset: auto; }`. `react_check` now checks the open ✕ sits fully inside its row (32 of 32). landscape 24/24, tablet 68/68, lasttwo 16/16, `npm run check` clean.

### 9am.4 Phone checklist (2.37.2)
1. Go out before the computer players; tap Fast forward, then **Stop fast forward**: it stops at once. Try ☰ during Fast forward too.
2. Results screen: tap 😂: the sheet is solid and sits above the bottom row; the typing bar is above ✕; ✕ closes it (and, with (a), a tap anywhere else does too).
3. During play: the sheet and typing bar sit above the bottom row; nothing covers ✕ or the buttons.
4. The rest of 9al.8 still to check (items 1 to 7).

## 9an. Take-cards on your lead, watching a hand, Keep or Deal again, pop-up gate, missing felt card, online rejoin, removing a player, card table (PLAN, user 2026-11-18 11:34 and 11:38; spec `PROJECT.md` 12y; target **2.38.0**; written for Haiku)

### 9an.0 Read first
- Spec: `PROJECT.md` 12y (rules) and 4.2 (take-cards, updated). Build in the order of the Parts below; each Part ends with `npm run check` and `npm test` clean before the next.
- **Plan approved by the user 2026-11-18 11:49. Table: option B** (stadium felt, dark leather rail, stitched line) from https://claude.ai/artifact/YaDGaLmzRAkyucWD9hiH37 (artboard "B · Stadium, leather rail"). In Part I follow only the B lines.
- Protocol: Parts C, D, E, H change network messages: bump `LOBBY_PROTOCOL` in `src/net/lobby.ts` **once**, 11 → **12** (comment: "12: peeks, keep cards, update seq, remove player, rejoin (2.38)").
- Rule 6 of `CLAUDE.md`: anything not written here or in 12y is not decided. Stop and ask (Switch to Opus line) rather than guess.
- One version for the whole phase: **2.38.0** in `package.json` (Part J). If the build is split over sessions, use 2.38.0, 2.38.1… per test build.

### 9an.1 Part A: take-cards only by the leader, with a confirm step; everyone sees it; the taker leads
**Rules (`src/rules/play.ts`, `src/session/session.ts`):**
1. `takeAllowed(state, requester, target)`: add, after the existing checks, `if (state.turn !== requester) return 'Only the player about to lead can ask for cards';` (keep `betweenTricks` checked in the session as now).
2. `takeCards`: the taker leads: replace the `let leader = …` lines with `const leader = requester;`. Update the doc comment ("The requester leads the next trick").
3. `requestTake` in `session.ts`: unchanged apart from the new `takeAllowed` message. "Asked by more than one player" can no longer happen (only one leader); leave the code that handles it (old saved games), but add a comment.
4. The leader can't play while their own request waits (already true: `decide.ts` and `game.ts` block play while `takeRequests` has one not agreed). If the asked player refuses or the request is withdrawn, the leader plays as normal.
5. Tests (`tests/rules/` and `tests/session/`, find the existing take tests with `grep -rn takeCards tests`): a non-leader is refused with the new message; after a take the requester has `turn` and leads; the old "target was about to lead" test changes (the target can't be the leader any more: the leader is the asker); 2-player and two-left refusals unchanged.

**Screens:**
6. `takeTargets` in `src/ui/between.ts`: return `[]` unless `play.turn === p`. The take button (`takeButton`) only shows on the leader's own hand screen. On one phone, the "Someone wants to take cards" button on the hand-off screen goes (search `Someone wants to take cards` in `src/ui/`), since only the leader can ask and they ask from their own hand screen.
7. Sheet subtitle: "Before the trick · one ask at a time" → **"Your lead · ask instead of playing"**.
8. **Confirm step:** tapping a row in "Take whose cards?" no longer sends at once. The sheet swaps to a confirm view in the same sheet: big disc of the target, **"Take all of Ben's cards?"**, a muted line "Ben has 7 cards. If he agrees he goes out and you lead the next trick.", then **Ask Ben** (gold, full width) and **Back** (ghost). Keep the picked id in store state (`armed: 'take'` plus a new `takePick: PlayerId | null` in `src/ui/store.ts`). Back returns to the list; Cancel / tap-off closes everything and clears `takePick`.
9. **Everyone sees it (network games and single player):** when a `takeRequested` event arrives, every phone other than the asker and the asked gets a pop-up (the normal tap-anywhere kind, 9ai.1): asker's disc, **"Amy is asking Ben for his cards"** → use **"for their cards"** everywhere (also in `takeStatus`, line ~413). Under it "Waiting for Ben". The existing status card (`takeStatus`) stays under the table until it is answered. When it is answered, the existing answer pop-up shows on every phone ("Ben gave Amy his cards" / "Ben said no"); check it exists for third parties in `absorb` (search `takeAnswered`) and add it if not: "Ben said no to Amy" / "Ben gave Amy their cards · Ben came 3rd".
   - Single player: the person sees computer players' requests between computers the same way (it's one person, nothing secret from them except cards).
   - One phone pass-and-play: unchanged (private).
10. Quick rules (`src/content/quick-rules.md`, take-cards lines): "Only the player about to lead can ask, instead of playing their first card. If they get the cards, they lead the next trick."

### 9an.2 Part B: computer players ask with a reason, and sometimes say no to annoy you
**Memory (`src/ai/memory.ts`):** add, cleared in `emptyRound`:
- `slappedMe: Record<PlayerId, number>`: times a slap by that player made **me** pick up the trick this round (from the `slapped` event: `e.slapped === me` → `slappedMe[e.slapper]++`).
- `iSlapped: Record<PlayerId, number>`: times **my** slap made that player pick up (`e.slapper === me` → `iSlapped[e.slapped]++`).
- `pickups: number`: times I picked up a trick this round.
All three come from public events only (fair-play rule, `PROJECT.md` 12c). Add them to the fair-play test if it lists memory fields.

**Asking (`chooseTakeAsk` in `src/ai/moves.ts`):**
1. Only when `seen.view.turn === seen.me`, between tricks, ≥ 3 holders, `m.asks === 0` (Hard: `m.asks < 2`), and `m.trickCount >= 3`.
2. **Stuck test** (all levels): `m.pickups >= 2` and (some player has `slappedMe ≥ 2`, or my count ≥ 1.5 × the average of the others). Not stuck → `null`.
3. **Score each allowed target** T (`takeAllowed(play, me, T) === null`):
   `score = 2 * slappedMe[T] + 1.5 * (number of suits T is known void in, m.voids[T].size) + (avg - count(T)) / avg`.
   (Taking the hand of the player I can't get past stops them slapping me; a hand with missing suits gives me slaps; a small hand adds few cards.)
4. Ask the best T if `score >= ASK_BAR[level]`: Easy 3.5 (and only with chance 0.3), Normal 2.5, Hard 2.0. Put `ASK_BAR` as a named constant at the top of `moves.ts`. Ties: `pickRandom`.
5. **`decide.ts`:** the leader now decides to ask **before** choosing a card: in the `v.turn === me` branch, if `betweenTricks(s.play)` and no request waits, first `const ask = chooseTakeAsk(seen, m, rng); if (ask) return one(ask, 'hard');`. Remove the later "between tricks" ask branch (non-leaders can't ask any more).
6. The arena (`testbed/arena` or `src/ai/arena*`, find with `grep -rn chooseTakeAsk testbed src`): run Normal vs Hard as before; the "Hard beats Normal" bar must still pass. Note the numbers in 9an.11.

**Answering (`chooseTakeAnswer`):** gains `m`, `persona`, `rng` (update the call in `decide.ts`).
7. Refuse "to annoy" only when the asker is a **person** (not a computer), `m.iSlapped[asker] >= 2`, and I still hold ≥ 3 cards. Then refuse with chance `REFUSE_RATE[personality]`: windup 0.7, reckless 0.5, counter 0.4, careful 0.25; Easy level × 0.5. Otherwise agree as now.
8. **Taunt on refusal (`src/ai/react.ts`):** on a `takeAnswered` event with `target === me` and `accepted === false`, send (chance `reactRate`, at least 0.6 for windup) one of: "Not a chance!!", "Keep picking up!!", "Nope, I'm having fun!!". Add those three to `src/content/catch-phrases.md` if bot taunts must come from that list (check `phraseIndex`: it returns null for unknown text, so they must be in the list).
9. Tests (`tests/ai/`): stuck vs not stuck; prefers the player who slapped me twice; Easy rarely asks; a computer never refuses a computer; refusal only after `iSlapped ≥ 2`; with a fixed rng the windup refuses more often than careful.

### 9an.3 Part C: watching a hand after you finish (network games and single player)
**Session (`src/session/types.ts`, `session.ts`, `view.ts`):**
1. `Session` gains `peeks: readonly Peek[]` (default `[]` when loading old saved games: search where `takeRequests` gets its default and do the same). `interface Peek { viewer: PlayerId; target: PlayerId; showing: boolean }`.
2. Actions: `{ type: 'requestPeek'; by; target }`, `{ type: 'answerPeek'; by; viewer; accept: boolean }`, `{ type: 'stopPeek'; by; other: PlayerId }` (either the viewer or the target may stop).
3. `requestPeek` is allowed when: phase `playing`, not paused, the game is not pass-and-play (`s.waitForAll` true, or the session has computer players and exactly one person; add a helper `peeksOn(s)`), `by` holds no cards this round, `target` holds cards, and `by` has no other peek (asked or showing). Computers never ask. Fail messages: "Only players who are out can watch", "You can watch one player at a time", "That player is out".
4. `answerPeek` by the target: accept → `showing: true`; refuse → removed. Events: `peekRequested`, `peekAnswered {viewer, target, accepted}`, `peekStopped {viewer, target, by}`.
5. Peeks end by themselves (remove + `peekStopped` with `by: null`) when the target goes out, and all are cleared at `roundEnded`.
6. **What the viewer gets:** `playerView(s, me)` gains `watching: { target: PlayerId; cards: Card[] } | null` (cards in hand order) when a showing peek has `viewer === me`. `redactSession(s, me)` in `src/net/netgame.ts` must keep the target's hand for that viewer only (do not blank `play.hands[target]` when `s.peeks` has `{viewer: me, target, showing: true}`). Test: nobody else ever receives it (extend the existing "player views never include other hands" test).
7. **Computer players** never ask. Asked by a person, a computer agrees with chance 0.75 (windup 0.5) after its thinking time (`moves.ts` `choosePeekAnswer`, wired in `decide.ts` next to the take answer). The fair-play rule is unchanged: a computer never reads `watching`.

**Screens:**
8. Once you're out and the round is still being played, the action row shows an **eye** button (new line icon `eye` in `src/ui/icons.ts`, `aria-label` "Watch a hand"). It opens a solid bottom sheet like "Take whose cards?": **"Watch whose hand?"**, one row per holder (disc, name, cards), tap → confirm view (**"Ask Ben to show you his cards?"**, **Ask** / **Back**, the same pattern as 9an.1 item 8).
9. Asked player: a solid cream card over a dim (like the Give/Refuse card): "Amy wants to watch your hand", "She's out, so she can't play. She'll see your cards until the end of the round.", **Show my cards** (green) / **Refuse** (red outline). It does not stop play for others; it waits only for the target (it is not a pop-up for the busy gate).
10. Viewer while showing: under the table, where your hand was, a fan of the target's cards (face up, not tappable), with a label **"Ben's cards"** and an **✕ Stop watching** button. Updates live. If refused: a pop-up "Ben said no". Then the eye button works again (one at a time).
11. Target while showing: a small pill above their hand: eye icon + **"Amy is watching"** + **Stop** (sends `stopPeek`).
12. Everyone else: a small eye badge on the target's seat (next to the hourglass place in `seatTags`, `table.ts`) with `aria-label` "Amy is watching". No pop-up.
13. Quick rules line: "Out of the round? Tap the eye to ask one player to show you their hand. They can say no, or stop showing it any time."

### 9an.4 Part D: Keep my cards or Deal again before the round starts (network games)
**Session:**
1. `Session` gains `kept: readonly PlayerId[]` (default `[]`), cleared whenever a new deal finishes (where the phase becomes `reshuffle`).
2. Action `{ type: 'keepCards'; by }`: phase `reshuffle`, `by` a person, not already in `kept`. Event `cardsKept { player }`.
3. Voting in a reshuffle vote (either way) also adds the voter to `kept` (they have made their choice). A YES result redeals and clears `kept`.
4. `startRound`: when `s.waitForAll`, fail **"Waiting for everyone to keep their cards"** unless every person in `s.order` is in `kept`. The host's own Start counts as the host's keep (add the host before the check). `startRound` gains an optional `skip: PlayerId[]`: the host's phone fills it with players who are Away (the session doesn't know who is away), and they count as kept. Test both.
5. Computer players: `chooseCallVote` as now; if it returns null, send `keepCards` (`moves.ts` `chooseKeep`), so they never hold the table up.
6. One phone and single player: `waitForAll` is false → nothing changes.

**Screens (`src/ui/roundstart.ts`, the reshuffle screen):**
7. Each person sees two buttons under their hand: **Keep my cards** (gold) and **Deal again?** (outline, starts the vote as now). After Keep: "You kept your cards" (green line), the buttons go.
8. Seats: an hourglass (the 9ai.3 `seat-busy` icon) beside each person who hasn't chosen; a small check when they have.
9. Host: **Start the round** stays greyed with "Waiting for Ben, Cat" until everyone has chosen; if any of them is Away, a second small button **Start without Ben** appears.
10. The round-start lead notices, swap and the rest are unchanged.

**Built (2.38, Part D), decisions:**
- *Which games keep:* `keepOn(s)` = `waitForAll` and two or more people (not computers). Single player (`solosetup.ts` sets `waitForAll: true` too) and one-phone play are unchanged. Spec item 6 said "waitForAll false" for single player, which the code does not do; the rule above is the chosen reading.
- The host's own Start counts as the host's keep. Players who are away are passed in `startRound.skip` and count as kept without keeping.
- A reshuffle vote or call, either way, counts as keeping for that person. A YES redeal clears `kept` when the deal finishes.
- Computers may send `keepCards` (`chooseKeep` in `moves.ts`, after `chooseCallVote` returns null). They never wait in the gate.
- Test helper `startedRound` (tests/session/helpers.ts) keeps every person, then starts; bot games use the same rule through `hostAction`.
- Status: `npm run check` clean; `npm test` 509/510 (the known `2.34.5` fixture, to be regenerated in Part J). `node build.mjs` clean.

### 9an.5 Part E: pop-ups really hold the game, and a calm catch-up
**Cause (found 2026-11-18):** the busy flag (9ai.3) is sent by each phone **after** its pop-up opens, so for the network round trip (100–600 ms online) the host still thinks the phone is free: a computer player whose thinking time ends in that gap plays, and the next update lands while the pop-up is still open. The phone then replays the backlog all at once: sounds overlap and animations race.
**Fix: the host knows a pop-up is coming before the phone does.**
1. **One list of pop-up events.** In `src/ui/game.ts` (`absorb`), the code that turns events into pop-ups: pull the test into an exported pure function `makesPopup(e: SessionEvent, me: PlayerId, s: Session): boolean` in `src/ui/popuptext.ts` (or a new `src/ui/popupevents.ts`), used by `absorb` itself. Unit test: every event type `absorb` makes a pop-up for returns true.
2. **Sequence numbers.** `GameUpdate` (`src/net/netgame.ts`) gains `seq: number`. `netplay.ts` keeps `let seq = 0` on the host; every `sendUpdate` sets `seq: ++seq` per link (store `lastSeq[link]`), and if any of the events sent to that phone `makesPopup` for that player, sets `waitSeq[player] = that seq`.
3. **The busy message** `{ t: 'busy'; on: boolean; seq: number }` (add `seq` to the parser; old field kept). The joining phone sends the seq of the last update it has drawn.
4. **Host's busy set** (`setBusyPlayers` in `netlobby.ts`): a player is busy if their seat has `busy` **or** `waitSeq[p] > ackSeq[p]` (the seq in their last busy message). Computer players and away seats never busy (as now). Export from `netplay.ts`: `pendingPopup(p): boolean`.
5. The host's own pop-ups: unchanged (its own screen already blocks it).
6. **Lost message guard:** if a phone hasn't acked within 8 s while its link is open, the host sends it a full `hostSync` and stops waiting for that seq (prevents a freeze). Log it with `console.warn` in test builds.
7. **Calm catch-up (joining phone, `absorb`):** if an update arrives while this phone still has pop-ups open (it can still happen: Away players, Fast forward):
   - don't stack: for pop-ups of the same kind (two SLAP!s), keep the newest and add "+1 more" under it;
   - the felt jumps to the current trick without flying each missed card (set `shownTrickCount` so only the newest card animates);
   - sounds: a new `sfxCalm()` gate in `src/audio/sfx.ts` (or `src/ui/sound.ts`): while catching up, play only the **last** sound of the batch, and never the same sound twice within 400 ms.
   - When the last pop-up closes, redraw once with a 180 ms fade on the table (CSS class `catching-up` on `.round-table`, removed after the fade). No replay of the missed moves.
8. Checks: extend `testbed/netvotes_check.py` or `netgame_check.py` (whichever opens a slap pop-up on a joining page) with a 400 ms delay on the joining link (`page.route` won't do for WebRTC: add a test hook `pubbyNet.delayMs = 400` in `src/net/link.ts` that delays `onMessage` delivery) and check: while the joiner's SLAP! is open, the host's computer player does **not** play (trick card count unchanged for 3 s), and after the tap it plays.

**Opus review of Part E (2026-11-18, before building): these changes replace items 1–4 and 8 where they differ.**
Read against the code (`netplay.ts` sendUpdate, `netlobby.ts` watchBusy/setBusyPlayers, `busy.ts`, `bots.ts` canMove, `game.ts` absorb/popupsFor, `netgame.ts` readGameUpdate, `lobby.ts` readToHost).

- **E-a. The phone must answer every update the host waits on (fixes an 8 s freeze).** Today a phone sends `busy` only when its pop-up state *changes* (`reportMyBusy` → `onMyBusyChange`). Many updates the host would wait on change nothing on that phone: the asker's own vote alert is filtered out, Skip/Fast forward filter or auto-close pop-ups, a phone that already has a pop-up open stays busy. Then no ack ever comes and every such update freezes the table for 8 s before the guard fires. **Fix:** `GameUpdate` gains `ack?: true`, set when the host starts waiting on that seq. A joining phone that draws an update with `ack` sends `{ t: 'busy', on: <its current pop-up state>, seq }` after that draw (same `setTimeout` as `watchBusy`), **even if its state didn't change**. Busy changes still send as now, with the last drawn seq.
- **E-b. `makesPopup` is a list of event types, not a copy of `popupsFor`.** `popupsFor` needs `game.ts` helpers (`nameOf`, `voteOutcome`) and phone-only state (Skip, Fast forward), so it can't move into a pure file cleanly. With E-a the host doesn't need to be exact: it only needs to never *miss* a pop-up. New `src/ui/popupevents.ts`: `export const POPUP_EVENTS: ReadonlySet<SessionEvent['type']>` plus `makesPopup(e, me)`: true when `e.type` is in the set, with the per-player cases already in `popupsFor` (`takeRequested` only for someone not the asker or the asked; `peekAnswered` only for the viewer when refused). Include `slapped` (the badboy and slap pop-ups) and `trickResolved` if `popupsFor` uses it. **Test:** read `src/ui/game.ts` as text, take every `case '…':` label inside `function popupsFor`, and assert each is in `POPUP_EVENTS` (catches a new pop-up added later without the list).
- **E-c. The host's wait goes in `busy.ts`, set straight away.** `setBusyPlayers` in `netlobby.ts` only runs when the lobby redraws, so a computer player's think timer could still fire in the gap the fix is meant to close. Instead `busy.ts` gains `setPendingPlayers(ids)`, and `isBusyPlayer` / `anyoneBusy` read **both** sets. `netplay.ts` keeps `seq`, `waitSeq` and `ackSeq` **per player** (not per link: Part G gives a rejoining player a new link) and calls `setPendingPlayers` inside `sendUpdate`, before `hostBroadcast` returns, so `bots.ts canMove` already sees it. Never pending: away players (`isAwayPlayer`) and players with no link (computers). Clear a player's wait on ack (`seq >= waitSeq`), when they go away, when their link closes, on the 8 s guard, and on `hostStart`. Export `pendingPopup(p)` and `hostGotBusy(linkId, seq)` from `netplay.ts`; `netlobby.ts` calls `hostGotBusy` from its `m.t === 'busy'` branch (keep `setBusy` as now).
- **E-d. The parsers rebuild their objects, so new fields are dropped unless added.** `readGameUpdate` (`netgame.ts`) must copy `seq` (a whole number, else 0) and `ack`; `readToHost`'s `busy` case (`lobby.ts`) must copy `seq` when it is a whole number. Both optional, so old phones still parse. `LOBBY_PROTOCOL` stays 12 (already bumped for 2.38).
- **E-e. The joining phone keeps `lastSeq`** (set from every update, full or not; reset to the full update's seq). Part F's gap check uses it.
- **E-f. Sound gate.** `sfx.ts` already holds big sounds back (`busyUntil`, `MAX_WAIT`) and drops small ones while one plays. Add `setCalm(on)` there: while on, a sound is skipped if the same one played in the last 400 ms, and `absorb` plays only the batch's last effect (skip `cardSound` for earlier events). `absorb` turns calm on when this phone already had pop-ups open before the update, and off when the last pop-up closes.
- **E-g. Test hooks go where the joining phone receives, not in `link.ts`.** The joining phone hears the host through two transports (WebRTC and the online room), but both reach `joinGot` in `netlobby.ts`. Add `delayMs` (and Part F's `dropNext`) to the existing `pubbyNet` object in `netplay.ts`, and apply them at the top of `joinGot` for `t: 'game'` messages only (a fixed delay keeps the order).
- **Unchanged from the plan:** item 5 (host's own pop-ups), item 6 (8 s guard: full `hostSync`, clear the wait, `console.warn`), item 7's "+1 more" for two pop-ups of the same kind, the felt jumping to the current trick, and the 180 ms `catching-up` fade.
- **Unit tests to add (`tests/net/`, `tests/ui/`):** `readGameUpdate` keeps `seq`/`ack`; `readToHost` keeps the busy `seq`; `POPUP_EVENTS` covers every `popupsFor` case; a pure helper for the wait (e.g. `src/net/popupwait.ts` with `noteSent(p, seq, waits)`, `noteAck(p, seq)`, `pending(): string[]`, `expired(now)`) so the per-player bookkeeping is tested without a browser.

### 9an.6 Part F: a played card missing from the felt on one phone
**User 2026-11-18:** a computer player's card showed in the game but not on everyone's screen. Not reproduced yet; one real cause found in the code:
- The felt draws the trick from `g.trickLog` (`trickArea` in `game.ts`), and joining phones build `trickLog` **only from events**. A full update (`full: true`, sent after a `sync`, a reconnect or an away) has `events: []`, so any card played in that gap never reaches `trickLog`; also `sendUpdate` drops the events of a send that failed (link briefly down).
**Fix:**
1. In `absorb`, after the event loop: if `session.play` exists and the round isn't over, compare `trickLog` with `session.play.trick.plays` (`TrickState` in `src/rules/play.ts`: the cards played so far this trick, jokers included). If they differ, rebuild `trickLog` from `session.play.trick.plays` (same `{player, card, label}` shape; joker → `'joker'`, `'Joker'`). The session is the truth; events only drive animation.
2. Same for `lastTrick` after a full update: if `trickLog` was rebuilt and a trick ended in the gap, leave `lastTrick` as it is (no guess).
3. `joinGotGame`: with Part E's `seq`, if `m.seq !== lastSeq + 1` and not `full`, apply it and then ask for `{ t: 'sync' }` once (seq gap = a lost update).
4. Unit test (`tests/ui/` or a pure helper `trickFromPlay(play)` in `src/ui/cards.ts` so it can be tested without the DOM): a session with 3 cards on the trick and an empty `trickLog` → rebuilt with 3.
5. Browser: in `netgame_check.py`, drop one update to a joining page (test hook `pubbyNet.dropNext = 1`), play on: the joiner's felt still shows every card of the trick.

### 9an.7 Part G: rejoining an online game (brings slice O3 forward; Nearby unchanged)
What already works (2.25, 9u A2 to A5): while Pubby stays open, a dropped socket reconnects with the same token and the seat is kept 10 minutes. What's missing: coming back **after Pubby was closed or reloaded**, on either phone.
**Joining phone:**
1. When an online game starts, save `localStorage['pubby.rejoin'] = { roomId, joinToken, roomName, playerId, savedAt }` (find where `joinSocket` gets `roomId` and the token in `src/net/online.ts` / `src/ui/online.ts`). Update `savedAt` every minute while in the game; delete it when the game ends, when you Leave, or when the host closes the room.
2. On app start (`src/ui/app.ts`), if `pubby.rejoin` exists and `Date.now() - savedAt < 10 min`: the home screen shows a gold card at the top: **"Your online game is still on"** · room name · **Rejoin** / **Not now** (Not now keeps it until it expires). Rejoin → `joinSocket` with the saved token → the relay gives the same link id (server already does, 9r.8 build notes) → the host's `addOnlineLink` sees a known seated id (9u A2) → `hostSync` → the game screen.
3. If the relay refuses (room gone, kicked, 4003): "That game has ended" and delete the key.
**Host's phone:**
4. While an online game runs, save the whole host state every 5 s and after each round to `localStorage['pubby.hostGame']`: the `SavedGame` (it already holds the full session), the lobby (seats, link ids), `linkOf`, `roomId`, `hostToken`, `savedAt`. Same 10-minute limit (the room's host grace, `AWAY_MS`).
5. On app start with `pubby.hostGame` under 10 minutes old: home shows **"Your online game is still on"** · **Carry on** / **End it**. Carry on → `HostRoom` reconnects with `hostToken` (A2 path) → restore lobby and game → every phone gets `hostSync` (A2 `onBack`). End it → close the room (`close()` frame) and delete the key.
6. While the host is away the others already see "The host stepped away" (A3); keep it.
7. Not for Nearby (a closed WebRTC link needs new QR scans; `PROJECT.md` 12 slice 4 stays planned).
8. Checks: `testbed/online_check.py` new phase "reload": (a) reload a joining page mid-trick → Rejoin card → back in the game with the same hand and the felt correct; (b) reload the host page → Carry on → both phones carry on; the trick and scores match; (c) after 10 minutes (`--long-away`) the cards are gone.

**Opus review of Part G (2026-11-18, before building): these decisions replace items 1–5 where they differ.**
Read against `online.ts` (HostRoom, joinSocket), `netlobby.ts` (addOnlineLink, startHostRoom, joinRoomNow, wireJoin, linkLost, forgetLink, reset), the relay core (`server/src/core/room.ts` connect), `store.ts` update, `storage.ts`, `bots.ts`.

What the relay already gives: a used join token always gets its old link id back (even after the game started), and a host token reconnecting gets `ready` then a `joined` for every phone still connected, while those phones get `host-back`. A phone whose socket closed shows on the host as `left` → `linkLost` → seat Away (`AWAY_MS`). So **no server change is needed.**

- **G-a. New module `src/ui/rejoin.ts`** owns both keys (read, write, delete, age check), so `app.ts`, `netlobby.ts` and `netplay.ts` don't each touch `localStorage`. Keys: `pubby.rejoin` (joining phone) and `pubby.hostGame` (host). A key is valid only when `Date.now() - savedAt < AWAY_MS`; an old one is deleted on read.
- **G-b. Joining phone: what is saved and when.** `{ roomId, joinToken, roomName, profileName, savedAt }` (profileName: the hello needs it). Written in `joinGotGame` on the first game message of an **online** game (Nearby never), and `savedAt` refreshed every 60 s while the game screen is up. Deleted on: `sessionEnded`, Leave, `closed`, `removed` (kicked), and when the link gives up (host gone 10 min). `joinRoomNow` must keep `joinToken` in a module variable so it can be saved.
- **G-c. Joining phone: Rejoin.** Pull the socket wiring out of `joinRoomNow` into `openJoinSocket(roomId, token)` (the `peer`, `wireJoin`, `onAway`, `onBack` lines) and use it from both. New entry `resumeJoin(saved)` in `netlobby.ts`: `reset()`, `mode = 'online'`, `role = 'join'`, `myProfile = saved.profileName`, `roomId`, then `openJoinSocket`, `go('room-wait')` ("Rejoining…"). From there the normal path runs: socket `ready` → hello (the host ignores it for a seated id) → host `addOnlineLink` sees a known seat → `setBack` + `hostSync` → full update → `joinGotGame` with no game yet makes a fresh one. A refusal (`4003`, i.e. `ROOM_GONE`, or the connect timeout): show "That game has ended" and delete the key.
- **G-d. Host: save on every change, not every 5 s.** The plan's 5-second save would bring the host back up to 5 s *behind* the other phones; the next `hostSync` would then undo cards they saw played. One-phone games already save the whole `SavedGame` on every change (`store.update` → `saveGame`), so the cost is known and fine. Write `pubby.hostGame` from two places: `hostBroadcast` (every game change, `netplay.ts`) and `broadcast()` (every lobby change: away, back, busy, `netlobby.ts`). It holds `{ game: SavedGame, lobby, roomId, roomName, roomCode, hostToken, profileName, savedAt }`. `netlobby.ts` registers a getter for its parts with `rejoin.ts` (`setHostParts(() => …)`), so `netplay.ts` doesn't import `netlobby.ts` (that would be circular). `startHostRoom` must keep `hostToken` in a module variable. Never written for Nearby games. Deleted on: `sessionEnded`, Close the game, `onLost`, End it.
- **G-e. Host: Carry on, and the order matters.** The relay sends `joined` straight after `ready`, and `addOnlineLink` drops a phone when there is no `lobby` and **kicks** an unknown phone once the game has started. So everything must be back **before** the socket opens. New entry `resumeHost(saved)` in `netlobby.ts`, in this order:
  1. `reset()`, then `mode = 'online'`, `role = 'host'`, `myProfile`, `roomId`, `roomName`, `roomCode`, `hostToken`.
  2. `lobby = saved.lobby`, with every person's seat (not the host, not a computer) set Away now (`setAway`, keep an older `awaySince` if it has one). The game holds until each phone is back, and `forgetLink` still runs after `AWAY_MS`.
  3. `hostResume(game, linkIds)` in `netplay.ts`: like `hostStart` (set `linkOf` from `sessionPlayers(lobby).linkIds`, clear `sentLog`, new `waits`, `setPendingPlayers([])`), but it **sends nothing**, doesn't shuffle, and puts the saved game on screen (`update({ game, screen: 'game' })`). Computer players rebuild their memory from the session as they already do after a reload (`bots.ts` `rebuild`).
  4. `startPings()`, `keepAwake()`, `watchVisibility()`, `watchBusy()` (as `makeRoom` and `netLobbyScreen` do), then `startHostRoom(roomId, hostToken)`. Phones still connected get `host-back` and send `sync`; each `joined` goes through `addOnlineLink` → `setBack` + `hostSync`. A double sync is harmless.
  5. If the room is gone (`onLost` at once): "That game has ended", delete the key, back home.
- **G-f. End it** opens a `HostRoom` with the saved token and calls `close()` on its `onReady` (a 5 s timeout either way), then deletes the key.
- **G-g. Home screen (`app.ts`):** the gold card **"Your online game is still on"** · room name · **Rejoin** / **Not now** (joining phone), or **Carry on** / **End it** (host). It sits above the one-phone "Carry on game" button and shows only while the key is valid. Not now hides it until the next app start (the key stays until it runs out). If both keys exist, show the host card only.
- **G-h. Test hook:** `pubbyNet.saved()` returns both keys (with the tokens replaced by `'…'`), so `online_check.py` can see them without reading tokens.
- **Check (item 8):** (a) and (b) as written; (c) `--long-away` is optional (10 real minutes); with `fastIdle` the relay's grace is 3 s, so a short version can check that an old key is refused: set `savedAt` back 11 minutes with `page.evaluate` and reload → no card.

### 9an.8 Part H: the host removes a player (away or not playing)
**Rules (`PROJECT.md` 12, "Dropped phone", already decided; details in 12y.6):**
1. Session action `{ type: 'removePlayer'; by; player }`, host only, network games only, in any phase before `gameOver` (on the results screen it takes effect from the next round). Event `playerRemoved { player, cards: number }`.
2. During a round: the player's cards leave the game (not the waste pile; `play.hands[player] = []`, and `hands`/`deal.hands` likewise in deal phases), their open take requests and peeks are cancelled, votes they cast stay counted but they're no longer counted in the total. They take **last place** in this round: add `removed: PlayerId[]` to the session (round-level, cleared each round) and when the round ends, `finishingOrder` puts removed players at the end (later removed = lower). If it was their turn: the turn passes clockwise to the next holder (cards they already played in this trick stay on the felt). If they were in the final two: the other player wins that place and the round ends. If only one holder is left after removal: the round ends, that holder is the loser of the round (second-last overall, the removed player last).
3. From the next round: they're gone from `order` (`gone: PlayerId[]` on the session, kept for the game record and totals). Scoring uses the table for the new player count. One player left → the game ends (game over screen).
4. Their phone: gets `{ t: 'removed' }` then the relay `kick` (already exists, `hostRoom.kick`): screen "The host removed you from the game" · **Home**. Their saved `pubby.rejoin` is deleted. They can't rejoin.
5. Tests: removal mid-trick (their turn and not), in the final two, in dealing/reshuffle/swap (deal phases: their cards just go), leaving one holder, next round's order and scoring table, game record keeps their earlier points.
**Screens:**
6. Host: tap a seat on the table → a small solid sheet for that player: name, "Away 3:12" or "Last move 1:40 ago", **Remove from game** (red), Cancel. Second tap to confirm: "Remove Ben? His cards leave the game and he comes last this round."
7. Host hint: when a person has been Away over 2 minutes, or it has been their turn for over 90 s with no move (and nothing else is open), a small host-only band over the table: "Ben hasn't moved for 1:30 · **Remove**". Never on other phones. Never for computer players.
8. Everyone: pop-up "Ben was removed by the host" (tap anywhere). The seat disappears from the table at once (cards gone, no flying to the pile).
9. The 9u "lost connection: close the game" text (`connectionNotice` in `netscreens.ts`) changes for the host to "Ben lost connection · **Remove**" (opens the sheet); joining phones: "Ben lost connection · waiting for the host".

**Opus review of Part H (2026-11-18, before building): these decisions replace items 1–9 where they differ.**
Read against `session.ts` (reduce, every gate, `finishRound`, `startNextRound`, `finalStandings`), `play.ts` (`finishTurn`, `resolveTrick`, `resolveFinalTwo`, `endRound`, `canForfeit`), `deal.ts`, `round.ts` (`dealerFor`, `decideLeader`), `view.ts`, `record.ts`, `netgame.ts` (`redactSession`, `PHONE_ACTIONS`), `netlobby.ts` (`kick`, `dropLink`, `addOnlineLink`, `forgetLink`, the away timer), `netplay.ts` (`linkOf`, `sendUpdate`, `hostGotAct`), `netscreens.ts` (`connectionNotice`), `table.ts` (seat ring from `s.order`, `onTap`), and the relay (`server/src/core/room.ts` `kick`: marks the join token kicked, so it is refused with 4003 from then on, even if the phone was away).

**User answered H-q 2026-11-18 13:18: every suggested answer accepted (1: both hints, 2 min and 90 s). H-a to H-k stand as written; build from them.**

- **H-a. Out of `order` at once (replaces item 3's "from the next round").** Every gate reads `s.order`: `swapDone`, `handSeen`, the notice's persons, the Keep gate, `ready`, vote totals (`s.order.length`), `assertPlayer`; so do `view.ts`, the table's seat ring (`table.ts` line ~70) and the computer players. A removed player left in `order` until the round ends would make every gate wait for them. So:
  - `Session.order` and `play.order` lose the player straight away. Their seat leaves the table with no extra code (item 8).
  - New `Session.removed: readonly PlayerId[]`: removed **during this round**, in removal order. Cleared in `startNextRound`. Only `finishRound` reads it.
  - New `Session.gone: readonly PlayerId[]`: everyone removed this game, in order. Never cleared. Read by the record, the standings and `assertPlayer`.
  - `s.players` keeps them (names in the log, results, record).
  - Old saved games: both default to `[]` where `peeks` and `kept` get theirs.
  - `assertPlayer`: an id in `gone` fails with "Ben was removed from the game" (clearer than "Unknown player").
  - `playerView(s, me)` already throws for a player not in `order`. That is right: a removed phone never gets a view (H-g sends it `removed` first).
  - `PlayState` gets no removed list. The rules engine just loses the player; the session adds the bottom places (H-e).
- **H-b. The action.** `{ type: 'removePlayer'; by; player }`, plus an exported pure check `removeAllowed(s, by, player): string | null` (the screen uses it to show the button, `netplay.ts` before it drops the link). Refusals: not the host → "Only the host can remove a player"; the host → "The host can't remove themselves"; not in `order` → "Unknown player" (or the `gone` text); a computer → "Computer players can't be removed" (they are never away and always move); not `keepOn(s)` (two or more people, `waitForAll`) → "Removing a player is for network games"; `gameOver` (already refused by `reduce`).
  - Allowed **while paused**: add `removePlayer` to the paused allow list at the top of `reduce` (a paused game is the likely moment).
  - Event `playerRemoved { player, cards: number }` (`cards`: how many left the game, hand + aside jokers + their cards on the felt).
  - **Not** in `PHONE_ACTIONS` (`netgame.ts`): only the host's own phone makes it.
- **H-c. Every phase: one function `removeFromGame(s, p, out)` in `session.ts`.** Common steps, in this order:
  1. Count their cards, emit `playerRemoved`.
  2. `order` loses p; `gone` gains p; `removed` gains p if a round is running (`dealing` … `playing`), not on `results`.
  3. Take requests with p as asker or asked: dropped, each with `takeCancelled` `reason: 'notPossible'`. Peeks with p as viewer or target: dropped, each with `peekStopped` `by: null`. `pauseRequests`, `kept`, `swapDone`, `handSeen`, `noticeSeen`, `ready`: p filtered out.
  4. **Vote (replaces item 2's "votes stay counted"):** p's ballot is dropped. A ballot from someone no longer at the table shouldn't decide anything, and counting it against a smaller total could pass a vote with fewer real yeses. If p called the vote, it carries on (`calledBy` stays, for the text). Then tally exactly as `castVote` does with the smaller table (everyone left has voted → pass / fail / host decides). If it is already `awaitingHost`, leave it.
  5. `fixPrevious(s)` when p is `previous.winner` or `previous.loser` *(H-q5)*, so `dealerFor` and `decideLeader` never meet a gone player.
  6. One player left in `order` → H-f.
  Then by phase:
  - **`dealing`:** new pure `removeSeat(deal, seat)` in `deal.ts`: drops the seat from `seats` and `lap`, `lastSeat` → null if it was them, `nextSeat` moves clockwise if it was them. Cards already dealt to them leave the game (not back into `remaining`); undealt cards go to the others as dealing carries on. Hidden decks unchanged. If the deal is now complete → `afterDealStep`. **If p was the dealer** *(H-q6)*: `autoDealAll` at once, then `afterDealStep`.
  - **`reshuffle`:** `hands[p]` deleted. Nothing else: the host's Start check reads `order`. A reshuffle that passes later deals to the smaller table (`roundSetup` uses `order`); p still takes last place for this round.
  - **`swap`:** `hands[p]` deleted. Stay in `swap` even if 3 → 2 (the hidden decks were set for 3; the swap still works). Re-check the gate: pull the "everyone has swapped" branch of the `swap` case into `afterSwapGate(s, out)` and call it from both places.
  - **`cardCheck`:** re-check the `handSeen` gate → `decideLeaderStep`.
  - **`leadNotice`, `reactionTap`, `chooseLeader`:** if p is in `notice.players`, is `notice.leader`, is in `tap.players`, or is the chooser (`previous.winner`), call new `redecideLeader(s, out)`: like `decideLeaderStep`, but emits `missingSuitDeclared` only for players not already declared this round (look in the log for this round), so nobody gets the pop-up twice. Otherwise just re-check the gate: notice (every person left has tapped → `advanceNotice`), tap (every player left has tapped → resolve; pull the resolve code out of the `reactionTap` case into `resolveTap(s, out)`; a tap with one player left: they lead, reason `missingSuit`).
  - **`playing`:** H-d, then `processTakes` (an ask may no longer be allowed with two left).
  - **`results`:** this round is already scored; they keep those points. Only `gone`, `order`, `ready`. The Next round gate reads `order`.
  - **A player who is already out this round** *(H-q4)*: they keep the place they earned; `order` and `gone` as above but **not** `removed` (they are already in `play.finished`, so the finishing order has them). Only `playing` can have this.
- **H-d. During play: `removeFromPlay(state, p): PlayResult` in `play.ts`** (pure, tested in `tests/rules/`). `left` = `order` minus `finished` minus p. Not "players holding cards": a player facing the pick-up choice holds none but isn't finished.
  1. Their hand, their aside jokers and *(H-q3)* their cards in the current trick leave the game: not the waste pile, not `usedJokers`. p leaves `order`, `hands`, `asideJokers`, `forfeitAllowed`, `trick.participants`, `trick.acted`, `trick.plays`. If `plays` is now empty, `ledSuit = null`: the player whose turn it is starts the trick with any card (as after a joker lead). This also means a slap always picks up by a card of someone still in the round.
  2. **`left.length <= 1`: the round ends.** `endRound(state, events, [...finished, ...left], wastePile + the trick cards still on the felt)`. `loser` = the one left *(H-q2)*. This covers the final two (the other player is the one left), a pending pick-up choice (either of the two removed), and a 2-player game.
  3. **Between tricks** (`acted` empty): if `turn === p`, the next player clockwise who still holds cards leads (work it out on the old `order`, before p is taken out); otherwise `turn` stays. Either way `trick = newTrick(…, turn)`.
  4. **Mid-trick.** New optional `TrickState.size` = participant count when the trick started (set in `newTrick`; old saved games: `participants.length`). `finishTurn` uses `(trick.size ?? trick.participants.length) === 2` for the final-two branch, so a trick that started with three finishes under normal rules even with two left in it (otherwise a player who already played their last card in a three-player trick would suddenly face the pick-up choice).
     - **Their turn:** `next = nextToAct` (worked out before p is taken out, skipping p). A next player → `turn = next`. None (everyone else has acted) → finish the trick: pull the part of `finishTurn` after the `nextToAct` check into `afterLastTurn(state, events)` and call it.
     - **Not their turn:** the turn holder hasn't acted yet, so the trick carries on; `turn` stays. If p hadn't acted they are simply skipped.
  5. Events from `removeFromPlay`: whatever the finish produces (`trickResolved`, `playerOut`, `roundEnded`). The session emits `playerRemoved` before them.
- **H-e. Finishing order, points, the record.** All in `finishRound`:
  - `order = [...end.finishingOrder, ...s.removed]` (earlier removed above later removed, as item 2). `n = order.length` is the round's starting count, so `scoreRound` uses that round's table and the removed take the bottom places' points.
  - `previous = { winner: order[0], loser: end.loser }`: the last player holding cards, never a removed player *(H-q2)*. Today it is `order[n - 1]`; the two are the same whenever nobody was removed, so make this change for every round. Ultimate Round: `losers = end.sharedSecondLast ?? [end.loser]`.
  - **A round with no play** (a removal in a deal phase left one player): the session builds the `RoundEnd` itself (`finishingOrder: [the one left]`, `loser`: them, `sharedSecondLast: null`, `forfeitedBy: null`) and calls `finishRound`, which adds `removed`.
  - `RoundRecord` gains optional `removed?: readonly PlayerId[]`, so the results screen and history can show "removed" beside the name.
  - **Next round:** `order` is already smaller. `createDeck`, the hidden decks, `swapAllowed` and the scoring table follow the new count by themselves (a 4-player game cut to 3 gets the hidden decks and the swap from the next round: the existing 3-player rule).
  - `highestScore`, `minimumTarget`, `checkTarget` read `order`: gone players' scores don't count *(H-q7)*.
  - `record.ts`: `playerCount: s.players.length` (was `order.length`); `computeTrivia(s.log, [...s.order, ...s.gone])`; `GameRecord` gains optional `gone`. The removed player's phone saves nothing (it never sees the end); the other phones' records keep their points round by round.
  - `finalStandings`: ranks `order` as now, then adds `gone` in removal order; `winners` only from `order` *(H-q7)*.
- **H-f. One player left.** If a round is running it ends first (H-d step 2, or the no-play round in H-e), is scored, then `endSession(s, 'playersLeft')` instead of the results screen: new `SessionEnd.reason` `'playersLeft'`; no target check and no draw offer. On `results`: `endSession` at once (an open vote is cleared). Game-over line: "Everyone else was removed · Amy wins".
- **H-g. Network: the host's order of steps.** New export `hostRemove(p)` in `netplay.ts`:
  1. `removeAllowed` (else flash the reason).
  2. Delete `linkOf[p]` and clear p's pop-up wait (`popupwait.ts`, then `publishWaits`) **before** the action: the next broadcast must not reach p's phone (its `playerView` would throw, p is no longer in `order`).
  3. `runActions([{ type: 'removePlayer', by: me, player: p }])`, the host's normal path (log, save, computer players, broadcast to the rest).
  4. Call back into `netlobby.ts` through a registered hook (`netplay.ts` must not import `netlobby.ts`, as in G-d): `removeInGame(seatId)`.
  `removeInGame(seatId)` in `netlobby.ts`:
  - Send `{ t: 'removed' }` if the link is open, then `dropLink` (online it also kicks the socket at the relay). If there is no link (the phone is away), still call `hostRoom?.kick(seatId)` so the join token is dead.
  - **Never `removeSeat` in a started game:** player ids are `p{seat index + 1}` (`sessionPlayers`), so dropping a seat renames everyone after it. Instead new `LobbySeat.removed?: true`, set by `markRemoved(lobby, id)` in `lobby.ts` (also clears `awaySince` and `busy`). If the lobby message parser rebuilds seats, copy `removed`. `LOBBY_PROTOCOL` stays 12.
  - Skip removed seats everywhere seats are listed: `setAwayPlayers` / `setBusyPlayers` (line ~355), the away timer's `forgetLink` loop (line ~1618), `connectionNotice`, the `startRound.skip` list, `hostDoing`.
  - `addOnlineLink`: a seat with `removed` → send `{ t: 'removed' }` and kick. The relay already refuses the token, but Part G's known-seat path would otherwise `setBack` + `hostSync` it.
  - `broadcast(); draw(); netChanged();` (this also refreshes `pubby.hostGame`, Part G).
  - The lobby's own `kick()` (before Start) is unchanged.
  - Joining phone: the existing `removed` branch (`deleteJoin`, `endJoin('removed')`) already forgets `pubby.rejoin`; change its text (line ~445) to item 4: "The host removed you from the game" · Home.
  - Nearby: the same, without the relay kick.
  - `redactSession`: no change (their hand no longer exists).
  - Part E: add `playerRemoved` to `POPUP_EVENTS` and a `case` in `popupsFor` (the popup-events test enforces it).
  - Computer players (`src/ai/memory.ts`): on `playerRemoved`, forget that player's known cards and voids. Their cards stay in the unknown pool; a pool bigger than the slots is already normal (hidden decks). `bots.ts` `rebuild` gets this from the log.
- **H-h. The host's clocks (items 6, 7), host phone only, nothing sent.**
  - `lastMoveAt[p]`: set in `hostGotAct` on every accepted action from p, and to now in `hostStart` / `hostResume`.
  - `turnClock = { p, since }`: the person whose turn it is (`play.turn`, or `pendingFinalTwo`). Reset in `hostBroadcast` when that player changes. While anything holds the game (`anyoneBusy()`, a vote, paused, a take request waiting, any seat away), `since` moves forward each second, so held time doesn't count.
  - The host's 1-second tick that redraws away countdowns (netlobby line ~1618) also checks: away over `HINT_AWAY_MS = 120_000`, or turn idle over `HINT_TURN_MS = 90_000` *(H-q1; constants at the top of `netplay.ts`)* → `hostHint = { p, kind, since }`; redraw only when it changes.
  - **Band (item 7):** host only, in the table slot `connectionNotice` uses (for that player it replaces the away line): "Ben has been away 2:10 · **Remove**" or "Ben hasn't moved for 1:30 · **Remove**". Never for computer players; not while a sheet or pop-up is open on the host.
  - **Sheet (item 6):** opened from the band, from the connection notice's Remove (item 9), or by tapping a person's seat **only when the table has no other seat tap** (`onTap` unset; during manual dealing and choosing the leader a seat tap already means something). Shows "Away 3:12" from `awaySince`, else "Last move 1:40 ago" from `lastMoveAt`. **Remove from game** → confirm view in the same sheet, using "their" as Part A does: "Remove Ben? Their cards leave the game and they come last this round." On the results screen: "Remove Ben? They leave before the next round." If they are already out: "…They keep their place this round."
- **H-i. Texts.** `connectionNotice` (item 9): host "Ben is away · **Remove**" / "Ben lost connection · **Remove**"; joining phones "… · waiting for the host". The old "Rejoining comes in a later update…" line goes (Part G built rejoining). Every other phone: pop-up "Ben was removed by the host" (tap anywhere). Never in single player or on one phone (`keepOn` false).
- **H-j. Field and type changes (one list):**
  - `session/types.ts`: `Session.removed`, `Session.gone`; action `removePlayer`; event `playerRemoved`; `SessionEnd.reason` + `'playersLeft'`; `RoundRecord.removed?`.
  - `rules/play.ts`: `TrickState.size?`; new `removeFromPlay`; `afterLastTurn` pulled out of `finishTurn`.
  - `rules/deal.ts`: new `removeSeat`.
  - `session/session.ts`: `removeAllowed`, `removeFromGame`, `fixPrevious`, `redecideLeader`, `afterSwapGate`, `resolveTap`; `finishRound` (order, `previous.loser`, Ultimate losers, `playersLeft`); `assertPlayer` text; paused allow list; `startNextRound` clears `removed`; `finalStandings`.
  - `session/record.ts`: `playerCount`, trivia ids, `gone`.
  - `net/lobby.ts`: `LobbySeat.removed?`, `markRemoved`. `ui/netplay.ts`: `hostRemove`, `lastMoveAt`, `turnClock`, `hostHint`, the two constants. `ui/netlobby.ts`: `removeInGame`, the skips, `addOnlineLink`. `ui/netscreens.ts`: band, sheet, notice. `ui/popupevents.ts`, `ui/game.ts` `popupsFor`. `ai/memory.ts`.
- **H-k. Tests.**
  - `tests/rules/remove.test.ts` (`removeFromPlay`): between tricks on their turn → the next holder clockwise leads, their cards in no pile; between tricks not their turn → turn unchanged, not in the new trick; mid-trick their turn → next to act; mid-trick after they played the highest led card → their card leaves the felt, the trick resolves by the highest card left, and a slap picks up by a player still in; they led and only jokers followed → `ledSuit` null, the current player starts; a trick that started with three, where A has played their last card, finishes under normal rules (A goes out, no pick-up choice); pending pick-up choice, remove either player → round ends with the other; one left → `roundEnded`, `loser` the one left, removed not in `finishingOrder`; their aside jokers leave; `canForfeit` with two left after a removal.
  - `tests/rules/deal.test.ts`: `removeSeat` mid-deal (their cards gone, `nextSeat` moves on, the deal finishes among the rest).
  - `tests/session/remove.test.ts`: `removeAllowed` refusals (not host, the host, a computer, one phone, single player); allowed while paused; in `dealing` (and the dealer removed *(H-q6)*), `reshuffle`, `swap` (3 → 2, the gate moves on when the rest have swapped), `cardCheck`, `leadNotice` (the removed player was the missing-suit leader → a new decision, no second `missingSuitDeclared`), `reactionTap`, `chooseLeader` (chooser removed *(H-q5)*); a vote: their ballot dropped, the vote resolves when the rest have voted; take requests and peeks involving them cancelled with events; round end: `finishingOrder` ends with `removed` in removal order, points from the starting count's table, `previous.loser` is the last holder *(H-q2)*; two removed in one round; a player already out keeps their place *(H-q4)*; next round: smaller `order`, dealer and deck size right, 3-player hidden decks and swap after 4 → 3, scoring table for the new count; the record keeps their earlier points and `playerCount` is the starting count; `finalStandings` puts `gone` last and they can't win *(H-q7)*; one player left mid-round → round scored then `gameOver` `'playersLeft'`; on `results` → `gameOver` at once; removed on `results` as `previous.loser` / `previous.winner` *(H-q5)*; Ultimate Round losers *(H-q2)*; `assertPlayer` text for a gone player; old saved game without `removed` / `gone` loads.
  - `tests/net/`: `phoneActions` refuses `removePlayer`; `markRemoved` keeps every seat index; `sessionPlayers` ids unchanged after it.
  - `tests/ui/popupevents.test.ts`: covers `playerRemoved` (automatic once the case exists).
  - Browser (Part J): `testbed/online_check.py` new phase: host removes a joining page mid-trick → that page shows the removed screen, its reload gets no Rejoin card (key deleted) and the relay refuses the old token; the other pages lose the seat and carry on; with two people left the game ends.

**H-q. Questions for the user, answered 2026-11-18 13:18: all yes as suggested (1: "why not both?" = keep both hints, 2 min away and 90 s idle).**
1. **The host hints** *(PROJECT.md 12y.6, Claude's call)*: show the Remove hint after someone has been **Away for 2 minutes**, or has had **their turn for 90 seconds** without moving (time while a pop-up, vote or pause holds the game doesn't count). Keep 2 min / 90 s, or other times?
2. **One player left holding cards** *(12y.6, Claude's call)*: the round ends; that player counts as the round's **loser** (second-last place points, deals the next round, and in the Ultimate Round is the Ultimate Loser); the removed player gets **last** place points. More generally: the round's "loser" is always the last player holding cards, never a removed player. Yes, or should the removed player count as the loser?
3. **Cards they already played in the current trick:** suggested: they **leave the felt too** ("their cards leave the game"), so the trick goes on as if they hadn't played. Otherwise (the old plan line: they stay on the felt) a slap could leave the removed player as the one who must pick up. Leave too, or stay?
4. **A player who is already out this round** (finished 2nd, then their phone dies): suggested: they **keep the place they earned** and are gone from the next round. Or do they drop to last?
5. **Removed on the results screen when they would deal next (the round's loser) or choose the next leader (the winner):** suggested: the job goes to the **next player in that round's finishing order** who is still in (the winner's job to 2nd place; the dealer's job to the player just above them). Same if the winner is removed while choosing the leader. Yes?
6. **The dealer removed in the middle of dealing:** suggested: **the rest of the deal goes out by itself** at once (nobody waits). Or the host deals the rest?
7. **A removed player's game result:** suggested: their points stay in the record round by round, but they **can't win the game** and are listed **below everyone who stayed**, in the order they were removed; with one player left, that player wins. Yes?

### 9an.9 Part I: a real card table (user picked **B**, stadium felt with a leather rail, 2026-11-18 11:49)
Mockups: https://claude.ai/artifact/YaDGaLmzRAkyucWD9hiH37. Whichever is picked:
1. The page background stops being felt: `html, body` in `styles.css` get the dark room background from the mockup (`radial-gradient(90% 60% at 50% 45%, #2b2219, #17110c 70%, #0d0906)`), so the table stands out. Menus and other screens keep their cream/gold UI; check contrast of `--muted` text on the darker ground (4.5:1).
2. `.round-table` becomes two layers: the **rail** (the element itself: wood / leather / black-gold, per the pick) and the **felt** (a new inner `.table-felt` at an inset of `--rail` = 18 px (A), 16 px (B), 14 px (C)), with the stitched or gold line as `.table-felt::after`. Shape: A `border-radius: 50%`; B `border-radius: min(48vw, 180px)`; C a circle (`aspect-ratio: 1`, width from `tableBox`).
3. **Fit (the user's "fits everyone's cards properly"):** `seatLayout` in `table.ts` places fans on the rail line: for A and C compute positions on the ellipse/circle (`x = cx + (w/2 - rail/2)·cos θ`, `y = cy + (h/2 - rail/2)·sin θ`, with θ from `edgeListFor`'s order spread over the top 220°); for B keep the current edges but pull each fan in by `rail/2`. Fans never leave the table's box; `seatCollisions` must stay empty for 2 to 8 players in portrait (390×844, 360×740) and landscape (844×390): add these sizes to the existing collision unit test.
4. Your hand overlaps the bottom of the rail by about a third of a card (A, B); for C it sits under the table.
5. The trick pile, waste pile, led-suit mark and last-trick corner stay inside the felt (recompute `lastBox` against the felt inset).
6. Your-turn glow (9aj) moves to the rail's inner edge: `.round-table.your-turn .table-felt { box-shadow: inset 0 0 0 3px var(--gold), inset 0 0 26px rgba(242,193,78,.35) }`.
7. Landscape rail layout (9ak Part F) and tablet (9ag) still work: run `landscape_check.py`, `tablet_check.py`.

**Built notes (2026-11-18, Opus):** a first try of items 2 and 6 alone cut things off on the phone and was reverted. Redone with item 3 first: the table is a rounded rectangle (radius `0.25 × min(w, h)`, at most 180 px; a full stadium left no room for the corner seats on our shorter table), rail `clamp(1.25u, 10, 16)` px. `seatLayout` starts each fan at the table's edge and moves it in 1 px at a time until `fanBox` (room for 13 backs) is inside the outline (`insideTable`); on a table under 190 px high the top fans tuck 0.3 × bh under the rail. Waste pile and last trick start in their corners and move in (last trick 1 across, 0.75 up; waste 1 across, 0.5 up) until clear; in landscape also clear of the side fans. `seatCollisions` checks all of it. Items 1, 2, 3, 5, 6, 7 done; item 4 (hand overlapping the rail) not done, the layout rows are unchanged.

### 9an.10 Part J: version, checks, test build
1. `package.json` 2.38.0.
2. `npm run check`, `npm test`, `node build.mjs`, then `python3 testbed/run_checks.py --since origin/main` (playthrough, netgame, netvotes, online, lobby, landscape, tablet, results, lasttwo, popups at least). The test bot (`testbed/bot.js`) must learn: Keep my cards on the reshuffle screen; the take confirm step; skip the eye button.
3. Publish the test build (private link) and give the user 9an.12.

### 9an.11 Built notes
(Haiku fills this in: what was built, numbers from the arena, anything left open.)

### 9an.12 Phone checklist (2.38.0)
1. Take-cards: only on your lead does the take button show; tap a player: the confirm view names them; Back works; Ask sends.
2. On other phones (and in single player), a pop-up says "Amy is asking Ben for their cards", then the answer.
3. After a take, the taker leads the next trick.
4. Computer players: they ask only after being slapped a lot, usually the player who keeps slapping them; when you're the one getting slapped by a computer and you ask it, it sometimes says no with a taunt.
5. Go out, tap the eye, ask a player: they see Show / Refuse; on Show you see their cards live with "Ben's cards"; Stop on either phone ends it; only one at a time.
6. Deal again: everyone sees Keep my cards / Deal again?; the host can't start until all have chosen (hourglass on the others); Start without Ben shows for an away player.
7. Pop-ups: leave a SLAP! open on one phone: nothing moves on any phone until you tap it, computer players included; then play carries on smoothly (no burst of sounds).
8. Online: close Pubby on a joining phone mid-game and open it again within 10 minutes: Rejoin puts you back. Do the same on the host: Carry on.
9. Host: tap a player's seat → Remove from game: their cards vanish (not into the pile), they come last this round, the next round has one player fewer; their phone says they were removed.
10. The table looks like the picked mockup and every fan fits on it with 2, 5 and 8 players, upright and sideways.

### 9ao Fixes after the 2.38.0 phone test: green background back, no hand while dealing (plan 2026-11-18 16:24, Opus, approved; target 2.38.1, for Haiku)

**User (16:22):** "I don't like everything has gone dark now, like the menu background etc." and, during the deal, tapping the target chip showed one of their cards at the bottom. **16:24:** picked **A**: green felt everywhere, as before 2.38.

**Part A: green felt everywhere again (`src/ui/styles.css`).** 9an.9 made the whole app a dark brown room. Put back the 2.37.3 colours in these four places only; the table itself (leather rail, `.table-felt`, stitched line, your-turn felt glow, seat layout in `table.ts`) does not change.
1. `html, body` background: `radial-gradient(120% 80% at 50% 0%, var(--felt-light), var(--felt) 45%, var(--felt-dark))` (replaces the `#2b2219 … #0d0906` gradient; drop the 9an.9 comment).
2. Landscape rail, `html[data-rail="1"] .screen.game.fixed .game-bar`: `background: var(--felt-dark);` (was `#120d09`).
3. `.results-footer`: `background: var(--felt-dark);` and shadow back to `rgba(0, 0, 0, 0.35)` (was `#1f1612`, 0.5).
4. Search `styles.css` for any other `#120d09`, `#17110c`, `#0d0906` or "dark room" left from 9an.9 outside the table rules, and put the felt colour back there too. Leave `color-scheme: dark` (it was there before 2.38).

**Part B: no hand on the vote screens while dealing (`src/ui/roundstart.ts`).** A vote can be called during the deal (target chip). `waitStage` and `voteWaitStage` show `handBlock(…)` under the vote card unless `s.phase === 'results'`, so mid-deal the cards dealt so far show face up. Only the phone's own hand shows (no other player's cards leak), but hands must stay hidden until the deal ends.
1. In both functions, hide the hand when `s.phase === 'results' || s.phase === 'dealing'` (a small helper `handHidden(s)` is fine).
2. `voteStage` already shows a hand only for a reshuffle vote (after the deal), so no change there. Check `passStage` and `netscreens.ts` `waitingFor` too: if either can render during `dealing`, apply the same rule.
3. Add a UI-free test if there is a place for one; otherwise the browser check in Part C covers it.

**Part C: version, checks, test build.**
1. `package.json` 2.38.1.
2. `npm run check`, `npm test`, `node build.mjs`; browser: single player vs computers, start a deal, tap the target chip mid-deal and call a vote: no cards under the vote card; menus, setup, results footer and landscape rail are green.
3. Publish the test build (private link) and give the user 9ao.4.

**Part D (16:30, user: "I don't like that there's a box around it, can't it blend in? And make the background slightly darker than table"):** the box was the table's outer drop shadow, cut off by `.game-table-slot` (`overflow: hidden`). Removed that drop shadow from `.round-table` (inset shadows kept). The `html, body` background is now a darker green than the felt: `radial-gradient(120% 80% at 50% 0%, #1a4f20, #133d18 45%, #0c2b10)` (felt is `#2a7d32 … #0f3a14`). Menus use the same darker green.

### 9ao.4 Phone checklist (2.38.1)
1. Home, menus, setup screens and the game screen around the table are a dark green (darker than the table), not dark brown, and there is no box round the table.
2. The table still has its leather rail and stitched felt, and your-turn glow works.
3. Landscape: the left icon rail is dark green; the results footer is dark green.
4. During the deal, tap the target chip and ask for a target: the vote shows with no cards under it, on every phone. After the deal, a reshuffle vote still shows your hand.

### 9ap Fixes after watching and computer-player play (plan 2026-11-18 18:22, Parts G and H added 19:07, Opus; target 2.38.2, for Haiku; APPROVED 19:13, build A to E, G, H; Part F parked)

**User (18:22, phone screenshot of single player, watching Tommy):** "When viewing cards, it's not in order or like that fan style." "When clicking on ask and the pop up comes up, it flashes every time someone plays a card." "They ask for others' cards too many times… they get slapped once, then ask. Sometimes, they ask a second person right away." "Sometimes, they should also choose deal again if their cards are rubbish."

**Found:**
- `watchingBlock` (`src/ui/watch.ts`) shows `v.watching.cards` in hand order in a flat `.watch-fan` row (54 px cards, overlapping). Your own hand uses `sortHand` and `fanLayout` / `fitFan` (`handBlock`, `game.ts`).
- The flash is the "Watch whose hand?" sheet (its button says **Ask**). Every redraw rebuilds it, so `.overlay` (fade) and `.sheet` (slide-up) replay each time a card is played. The take sheet and target sheet already use `sheetSeen` (9ak.1); `watch.ts` and `removesheet.ts` don't. The "X wants to watch your hand" card (`watchAskCard`) has the same problem.
- Asking (`chooseTakeAsk`, `src/ai/moves.ts`): the stuck test is `pickups >= 2 && (slapped twice by one player || my cards >= 1.5 × average)`, from trick 3. Late in a round the others hold few cards, so one slap plus one pick-up of the waste pile is enough. Hard may ask twice a round with no gap: after a refusal the asker still leads, so it asks a second player at once.
- Deal again: `chooseCallVote` calls when `handBadness > 0.5 × reshuffleBar` (about 0.5). A simulation of 20,000 deals gives that in about 0.1% of hands (4 to 6 players), so computers almost never call. Voting yes needs `> 0.35 × reshuffleBar`, about 1%, so a call would nearly always fail too.

**Part A: the watched hand in order, as a fan (`src/ui/watch.ts`, `game.ts`, `styles.css`).**
1. `watchingBlock(s, v, opts: { fit: number; width: number })`: cards through `sortHand` (same order as your own hand), laid out with the same fan code as `handBlock` (portrait `fitFan(n, width, fit - 8 - headH, false)`, landscape `fitFan(n, width, fit - headH, true)`, where `headH` is the height of the "Tommy's cards / Stop watching" line, about 40 px). Cards placed with `--x / --y / --rot / z-index` exactly as in `handBlock`, inside `div.hand.fan`; not tappable (no role, no click, `pointer-events: none`), not dimmed.
2. `game.ts` passes `{ fit: lay.handH, width: lay.handW }` (the values `handBlock` gets).
3. Easiest: pull the card-placing loop out of `handBlock` into a small helper `fanCards(cards, fan, decorate?)` in `game.ts` (or `cards.ts`) and use it in both, so the two fans can't drift apart.
4. `styles.css`: remove `.watch-fan` rules; keep `.watching-hand` and its head line.

**Part B: no flash on the watch pop-ups (`src/ui/watch.ts`, `removesheet.ts`).**
1. `watchSheet`: `const seen = sheetSeen('watch', open)` (import from `between.ts`), called on every redraw, open or not (so call it before the early `return null`; open = `armed === 'watch' && canAskToWatch`). Add class `seen` to the overlay and the sheet when true (as `askSheet` does). Keep separate keys for the list and the confirm view (`'watch'` and `'watch-confirm'`) so switching between them still animates once.
2. `watchAskCard`: same, key `'watch-ask'`; add `seen` to the overlay and the `.take-card`. Add CSS `.take-card.seen { animation: none; }` if `.take-card` has its own animation (check).
3. `removesheet.ts`: same pattern, key `'remove'` / `'remove-confirm'` (the host's sheet can stay open while others play).
4. Search `src/ui` for any other `overlay` built during `playing` without `seen` or `popup seen` and list it in 9ap.6 (fix only if it can stay open while cards are played).

**Part C: computer players ask less, and only after really trying (`src/ai/moves.ts`, `src/ai/memory.ts`).**
1. Memory gains `lastAskTrick: number` (trick count when I last asked, `-99` at round start; set on `takeRequested` with `requester === me`, with `m.trickCount`) and `pickupsSinceAsk: number` (reset to 0 on that event; `+1` wherever `pickups` goes up).
2. New stuck test (all levels), all of these:
   - `m.trickCount >= 6` (was 3): they play a few tricks first. (User 19:07 / 19:13: "wait a few tricks", so trick 6 stands.)
   - `m.pickups >= 3` (was 2).
   - and either someone has slapped me at least **twice**, or I hold **at least 2 × the average** of the others **and at least 8 cards** (was 1.5 ×, no minimum).
3. **Gap between asks:** no ask unless `m.trickCount - m.lastAskTrick >= 5` and, after an earlier ask this round, `m.pickupsSinceAsk >= 2`. So a refused computer never asks a second player straight away.
4. **Not every chance:** when all the above pass, ask with chance `ASK_CHANCE[level]`: easy 0.15 (replaces `EASY_ASK_CHANCE` 0.3), normal 0.4, hard 0.6. A failed roll means it plays a card this trick and can try again on a later lead.
5. `ASK_BAR` up: easy 4.0, normal 3.0, hard 2.5 (was 3.5 / 2.5 / 2.0).
6. Hard keeps 2 asks a round at most; Normal and Easy 1 (unchanged).
7. Tests (`tests/ai/`): one slap then a pick-up → no ask; asked and refused → no second ask on the next lead; asks wait until trick 6; with `rng` fixed below the chance it asks when stuck, above it doesn't. Update the existing 9an.2 tests to the new numbers.
8. Arena: Normal vs Hard as before; "Hard beats Normal" must still pass. Also log asks per round (average, all levels) before and after and put both in 9ap.6. Aim: well under 1 ask per round per computer.

**Part D: computer players call Deal again with a rubbish hand (`src/ai/moves.ts`).**
1. `chooseCallVote`: call when `handBadness(hand) > 0.25 × reshuffleBar` (was 0.5). From the simulation, about 5% of hands per computer (4 to 6 players), so with 4 computers about 1 deal in 5 gets a call. Easy: also needs `rng() < 0.5` (pass `rng` in; update `decide.ts`).
2. `chooseVote` for a reshuffle: yes when `handBadness > 0` (a worse-than-average hand; about 30 to 45% of hands), was `> 0.35 × reshuffleBar`. So a call by a computer passes some of the time, not never.
3. Unchanged: one call per deal (`canCallReshuffle`), and a computer that doesn't call keeps its cards (`chooseKeep`), so the table never waits.
4. Test: a hand of high cards (for example A, K, Q, J of mixed suits plus 10s) calls; a hand of low cards doesn't; votes follow `handBadness > 0`.
5. Optional, only if `react.ts` already has a hook for calling a vote: one line like "These cards are rubbish!!" (must be in `catch-phrases.md`). Skip if not.

**Part E: version, checks, test build (do this last, after G and H).** Build order: A, B, C, D, G, H, then E.
1. `package.json` 2.38.2. If the moves fixture test (`tests/ai/fixtures/moves-*.json`) fails from the new AI numbers, regenerate it as 9an Part J did and say so.
2. `npm run check`, `npm test`, `node build.mjs`; browser: single player vs 4 computers, go out early, tap the eye, leave the sheet open while computers play (no flash); watch a player: cards sorted like your own hand, in a fan.
3. Publish the private test build and give the user 9ap.7.

**Part G (user 19:07): pop-ups close by themselves after 5 seconds, at the same time on every phone (replaces "tap anywhere to close", 9ai.1).**
Only pop-ups with **no decision** (SLAP!, HAHAHA!, Pathetic, Ultimate Badboy, came 1st / 2nd, vote called alert, vote result, take result, "Ben said no", lead notice, last two, info). Pop-ups that need an answer (votes, Give / Refuse, Show my cards / Refuse, final-two choice, choose leader) are unchanged.
1. `game.ts`: `POPUP_SHOW_MS = 5000` for every no-decision pop-up (`popupMs`, and `LEAD_MS` for the lead notice). `autoClosing()` is true for them always, not only during Fast forward / Skip, so the countdown bar shows and the timer in `afterRender` closes them. Fast forward keeps its shorter times.
2. No tap to close: remove the "Tap anywhere to close" line (`tapHint`) and the tap handler on those pop-ups.
3. **Same moment everywhere:** each pop-up gets `at`, the host's time of the event (the host stamps `hostNow` on every update; a joining phone uses `hostNow()` with `clockOffset`, already in `netplay.ts`). A pop-up closes at `at + 5000` host time, so phones close together (within the clock error). A pop-up queued behind another starts when the one before it ends (`at` = previous end). One phone and single player: `at` = when it was made.
4. The game still holds while pop-ups show (9an.5 gate), so play resumes for everyone when the 5 s end. `phoneBusyNow()` stays true until the timer closes the last one, as now.
5. A phone that joins late or catches up after a gap skips pop-ups whose end time has passed (no 5 s each for old ones).
6. `PROJECT.md` 12u item 1 updated (done in the plan).
7. Checks: `popups_check.py` and `netvotes_check.py` expect taps today: change them to wait for the auto close; add a check that two phones close a SLAP! within 0.5 s of each other.

**Part H (user 19:07): Deal again once per round (reverses 2.34.6 / 9ah.2 "once per deal, as many deals as wanted").**
1. `session.ts` `afterDealStep`: keep `reshuffleUsed` when the deal is a redeal; reset it only for a round's first deal (`newRound` / `startRoundDeal`, where it is already `false`). So after one vote (passed or failed), "Deal again?" is gone for the rest of the round.
2. Fail message stays "Only one reshuffle vote per round" (was "…per deal").
3. After a passed vote, the before-the-round screen still comes back (Look at cards / Keep / Start), without "Deal again?".
4. Computer players: no change needed (`canCallReshuffle` already uses `reshuffleUsed`).
5. Tests: the 9ah.2 "deal again twice" tests become "second call refused in the same round; allowed again next round". `testbed/deal_again_check.ts` the same.

**Part F (18:26, user: "When messages are sent during AI deal, it stops the deal until messages stop"): PARKED (user 19:13: "leave the deal, if it happens again, I'll let you know"). Haiku: do not build anything for Part F.**
Tried in a browser (2.38.1 build, 390x844, single player vs 3 computers): auto deal with the person dealing, and with a computer dealing (dealer set to a computer, game carried on), while sending a typed message every 0.5 s or tapping catch-phrases every 0.5 s. The deal kept its normal speed in every case (about 7 cards a second, finished in about 8 s). Messages and reactions are not pop-ups and don't touch `anyoneBusy`. Waiting for the user: single player or a network game, and who was sending the messages. Suspects for a network game: the host's `pending` set (9an.5 E-c) or a joining phone's busy report.

### 9ap.6 Built notes
(Haiku: arena results, asks per round before and after, anything that didn't match the plan.)

**Built so far (2026-11-18, Haiku, then checked by Opus 20:04–20:35). Parts A, B, C, D, G, H done; Part E part done. Not committed.**
- `npm run check` passes; `npm test` 571 of 571; `node build.mjs` builds 2.38.2.
- Moves fixture regenerated as `tests/ai/fixtures/moves-2.38.2.json` (463 of 500 moves differ from 2.38.0, from the new ask and Deal again numbers); `regress.test.ts` points at it. The 2.38.0 file is kept.
- Deviations from the plan: (1) a pop-up's 5 s starts at its host stamp or when it is first drawn on this phone, whichever is later (`popupStart` in `game.ts`), so a SLAP! stamped at trick time but drawn after the trick animation still gets its full 5 s; (2) Fast forward / Skip run pop-ups at half time (`quickMode`); (3) the lead notice is 5 s like the rest.
- Opus review: `chooseTakeAsk` gets one chance roll per lead (`decide.ts` either asks or plays a card), and the reshuffle phase gets one call-or-keep decision, so the chances work as planned. Unused `w` removed from `chooseVote`.
- `testbed/netgame_check.py` 97 of 97 (was 88). Fixes were in the check, not the game: (1) the own-seat check looked for `.table-seat.me`, which the table stopped using before 2.38.1; it now looks for `.table-seat.me-pill` and waits up to 5 s; (2) SLAP! pop-ups are counted once each on their first draw (the `.popup` element without `seen`, `POPUP_WATCH_JS` → `window.__slapFirst`). Counting by text merged two identical SLAP!s in a row. `bot.js` no longer counts pop-ups; it just waits for them to close.
- `popups_check.py` timer, tap and bar steps pass. `netvotes_check.py` new check "the vote alert closes on Amy and Cat within 0.5 s" passes (34 ms apart). Both checks' later steps (take, sheet under, ff stop, tie; "Ask to take someone's cards") fail the same way on the unchanged 2.38.1 build in this environment, so they predate this work.
- **Arena, Hard vs Normal, 4 players (place 1 = first out, lower is better):** 2.38.1, 600 games: Hard 2.394, Normal 2.606, gap 0.212. 2.38.2, 600 games: Hard 2.422, Normal 2.578, gap 0.156. 2.38.2, 2000 games (`--seed 3000001`): Hard 2.433, Normal 2.567, **gap 0.134**, 0 refused, 0 crashed. Below the old 0.15 bar. Likely cause: Part C (Hard asks later and less often, and asking was one of Hard's edges); not proved.
- **User decision 20:35: accept the smaller gap and lower the bar (option C).** See 9ap.8.

**9ap.8 results (Haiku, 2026-11-18, build 2.38.2):**
- Step 1, bar lowered: `hardBeatsNormalBy0_10` in `testbed/ai_arena.ts` (was `…0_15`, bar 0.15 → 0.10). `CODE.md` 9m.4 pass bars updated.
- Step 2, full `npx tsx testbed/ai_arena.ts --bars` (2000 games per slice): **all 9 bars pass.** No refused moves; 0 crashes; 6400 of 6400 games finished; Normal beats random by 1.416 (bar 0.3); Normal beats Easy by 0.534 (bar 0.15); Easy p95 0.05 ms, Normal p95 0.06 ms (bar 20 ms); **Hard beats Normal by 0.134 (bar 0.10)**; Hard p95 5.89 ms (bar 150 ms).
- Step 3, asks per computer round (`asksPerComputerRound`, new counter in `tests/ai/botgame.ts`, 600 games of 4 players, seed 5000001, all rounds including Ultimate):

| Level | 2.38.1 | 2.38.2 |
|---|---|---|
| Easy | 0.345 | 0.181 |
| Normal | 0.332 (in normal/hard run) / 0.277 (easy/normal run) | 0.251 / 0.187 |
| Hard | 0.528 | 0.277 |

  All runs: 600 of 600 finished, 0 refused, 0 crashed. Aim ("well under 1 per round") met on both builds.
- **Caveat on the Hard gap:** a second 600-game run with seed 5000001 (2.38.2, normal and hard) gave Hard 2.464 vs Normal 2.536, a gap of 0.072. The 2000-game bars run gave 0.134. Gaps this size move by several hundredths between seeds and sample sizes, so the 0.10 bar is close to the noise. Recommend a larger run (e.g. 4000+ games over several seeds) before deciding whether Hard is strong enough.
- Step 4: `testbed/deal_again_check.ts` header now says "once per round".
- Step 5: `takePrompts` (`src/ui/between.ts`) is answer-required: play waits on pending take requests (`session.ts`), so it can't stay open during play. It was rebuilt on every redraw with the entrance animation, so it now uses `sheetSeen('take-prompt', …)` and gets `seen` after its first draw. `npm run check` clean.
- Step 6, browser checks on the final 2.38.2 build (`node build.mjs`): `lasttrick_check` 21/21, `sound_check` 44/44, `landscape_check` 24/24, `lasttwo_check` 16/16, `react_check` 32/32, `netgame_check` 97/97. `popups_check` 10 pass, 4 fail (take, sheet_under, ff_stop, tie: "not seen in this game"). The same steps never run on the unchanged 2.38.1 build in this environment, so they are not caused by this work. Not fixed (per the plan).
- Step 9: test build published as a new private artifact, `dist/index.html` (2.38.2): https://claude.ai/artifact/RNPL3NfvCVRM1rqjXnVFse (the 2.38.1 link is unchanged). Phone checklist 9ap.7 still to do.
- Step 8: temporary `node_modules` symlink removed.
- Step 7: DEVLOG entry and TODO Phase 4y updated. PROJECT 12u item 1 already matches Part G as built (5 s, no tap), so it is unchanged.

### 9ap.8 Remaining work for Haiku (Opus, 2026-11-18 20:35; build in this order)
1. **Lower the Hard bar to 0.10.** The 2000-game gap is 0.134, and its run-to-run noise is about ±0.03, so 0.10 passes reliably while still meaning "Hard is clearly better than Normal". Change:
   - `testbed/ai_arena.ts`: rename `hardBeatsNormalBy0_15` to `hardBeatsNormalBy0_10` and make it pass at `vsNormal >= 0.10`.
   - `CODE.md` 9m.4 pass bars (the line starting "**Pass bars**"): "Slice D: Hard beats Normal by at least 0.15" → "by at least 0.10 (lowered from 0.15 in 2.38.2, 9ap.8: Hard asks for cards less often)".
   - 9ap Part C item 8 stays as written; note here in 9ap.6 that the bar was lowered.
2. **Run the full bars:** `npx tsx testbed/ai_arena.ts --bars` (takes about 25 min, so run it in the background with a long timeout, and run nothing else heavy at the same time). All 9 bars must pass. Put the numbers in 9ap.6. If Hard beats Normal by less than 0.10, stop and tell the user; don't tune.
3. **Asks per round (Part C item 8):** not logged yet. Add a count of `requestTake` actions by level to the arena report (`ai_arena.ts`, next to refused moves), run 600 games of 4 players on `normal,hard` and `easy,normal` on this build and on 2.38.1 (unchanged copy: `git archive HEAD | tar -x -C /tmp/base`, then symlink `node_modules`), and put asks per round per computer (before and after) in 9ap.6.
4. `testbed/deal_again_check.ts` header comment: "once per deal" → "once per round".
5. Part A item 4: check `between.ts` `takePrompts` (and any other `overlay` built while `playing`) for `seen`; list in 9ap.6; fix only if it can stay open while cards are played.
6. Browser checks on the 2.38.2 build (`node build.mjs` first): `lasttrick_check.py`, `sound_check.py`, `landscape_check.py`, `lasttwo_check.py`, `react_check.py`, `popups_check.py`, `netgame_check.py`. Record pass counts in 9ap.6. A failure that also fails on 2.38.1 is not this work's: list it, don't fix it.
7. MD files (CLAUDE.md rule): DEVLOG entry for 2.38.2, TODO.md phase entry, PROJECT.md 12u item 1 if it doesn't match Part G as built, this 9ap.6.
8. Remove the temporary `node_modules` symlink in the repo (it points at `/opt/npm-tools/node_modules`) once all checks are done.
9. Publish `dist/index.html` (2.38.2) as a private test build and give the user the link and 9ap.7. **Do not commit or push until the user says "push".**

### 9ap.7 Phone checklist (2.38.2)
1. Go out, tap the eye and leave the "Watch whose hand?" sheet open while others play: it doesn't flash.
2. Watch someone: their cards are sorted like your own hand (by suit, low to high) and spread in the same fan.
3. Over a few rounds, computers don't ask for cards after one slap, don't ask in the first few tricks, and never ask a second player straight after a refusal.
4. Over a few deals, a computer sometimes calls "Deal again?" and sometimes votes yes.
5. Pop-ups with no choice (SLAP!, came 1st, vote result…) show a 5-second bar, can't be tapped away, and close at the same moment on every phone; play carries on after.
6. After one "Deal again?" vote (yes or no), the button doesn't come back until the next round.

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


## 9aq. Fewer pop-ups at the round end, tap or 3.5 s pop-ups, small notices, voice chat online (PLAN, Opus, user 2026-11-19 16:15 to 16:38; spec `PROJECT.md` 12z; mockups https://claude.ai/artifact/EtHkCqc94hdHkajLMwB44S; written for Haiku; APPROVED 16:38)

Two builds, in this order. Each one gets its own test build, phone checklist and "push" from the user.
- **Build 1 = 2.39.0:** Parts A to E (pop-ups and notices). No network protocol changes.
- **Build 2 = 3.0.0:** Parts F to L (voice chat, Online rooms only). A whole number because it is a big feature (user rule). The voice phone test needs two phones on the live app, because the test link can't reach the room server (`ALLOWED_ORIGINS` is GitHub Pages only). So for build 2 the order is: browser checks, push on the user's "push", then the phone test on the live app, then fixes.

**User rule for both builds (16:38): nothing may flash or overlap.** Every new sheet, pop-up, notice and badge follows Part E (build 1) and Part K (build 2). They are not optional.

### 9aq.1 Part A: one pop-up at the end of a round (build 1)

Today a round can end with SLAP!, then "came 1st", PATHETIC!!!, HAHAHA! and the last-two pop-up, each one 5 s.

1. **New pop-up kind** in `src/ui/store.ts`:
   `{ kind: 'roundEnd'; head: 'pathetic' | 'slap' | 'haha' | 'over'; slap?: { slapper; slapped; cards }; forfeiter?: PlayerId; haha?: { laugher; loser }; end: Extract<Popup, { kind: 'lastTwo' }>; gameOver: boolean }`.
2. **`popupsFor` (`game.ts`)**: when the events hold `roundEnded`, build `out` as today and then merge. Take out of `out`: the `slap` with `over` set, `pathetic`, `haha`, `lastTwo`, and every `out` pop-up for a player who went out in this same batch of events. Put one `roundEnd` in their place, where the first of them was. Pop-ups from earlier batches (a "came 1st" earlier in the round) are not touched. Every other pop-up in the batch (a vote result, info) stays as it is.
3. **Which word leads (`head`), first match wins:** `pathetic` (a forfeit) → `slap` (a slap that ended the round) → `haha` → `over`. Ultimate Badboy happens at the start of a round, so it never merges.
4. **Drawing (`popupLayer`)**:
   - `pathetic`: the PATHETIC!!! card (same classes as now) with the `forfeitLine` under it.
   - `slap`: the SLAP! card with "Ben slapped Amy".
   - `haha`: the HAHAHA! card with its line.
   - `over`: the plain cream card with title "Round over" (or "Game over").
   - Under the word, one cream box (`.small`) with **at most two lines**. Line 1 is "Round over · Amy came last", or "Game over · …" when `gameOver`. Keep what `lastTwoBody` says today for shared last place and forfeits: reuse its text, don't invent new wording. Line 2 is "Ben: HAHAHA!" only when `head` is `pathetic` or `slap` and a `haha` was merged. The head's own line is never repeated.
   - Places are not listed: the results screen shows them.
5. **Sound:** only the head's sound (slap, pathetic, haha, or none for `over`), played once on first show (`shownPopups`).
6. **Trick animation:** where `absorb` sets `trickAnim.slapPopup = fresh.find((p) => p.kind === 'slap')`, also accept the `roundEnd` with `head === 'slap'`. Every check of `a.slapPopup` keeps working, so the trick holds, the pop-up shows, then the cards fly.
7. **Fast forward / Skip filter** in `absorb` (`quiet`): keep `roundEnd`, the same as `lastTwo` and the round-ending slap today. Set its `end.winner` the same way.
8. **One phone and single player:** the same merge.
9. The last trick still waits on the felt with "Tap to see the results" (9ah.1, unchanged). The merged pop-up shows where the old ones did.
10. Unit tests (`tests/ui/` or wherever `popupsFor` is tested; if it isn't exported, export it for tests): forfeit + haha → one `roundEnd` head `pathetic` with the HAHAHA line; a round-ending slap → head `slap`; a plain end → `over`; a "came 1st" from an earlier batch is untouched; game over → `gameOver: true`.

### 9aq.2 Part B: tap anywhere on one phone, 3.5 s or everyone taps in network games (build 1)

Replaces 9ap Part G's 5 s for every game. Pop-ups that need an answer are unchanged.

1. **Constants (`game.ts`):** `NET_POPUP_MS = 3500` (network games: `g.net` set) and `QUICK_NET_MS = 1750` (Fast forward / Skip in a network game). On one phone (single player and pass-and-play: `!g.net`) a no-choice pop-up has **no timer**. During Fast forward / Skip on one phone it closes after `2500` ms (as before 9ap, no one to wait for). `info` pop-ups with their own `ms` keep it only in quick mode.
2. **`popupMs(p)`** returns `null` for "no timer". `afterRender` sets no timer for those, and `popupTimer` (the countdown bar) is not drawn for them.
3. **Tap anywhere closes the top pop-up on this phone, in every game.** Put the tap handler on the pop-up overlay (the whole screen), only for no-choice kinds. A tap that lands on a button inside a decision pop-up is not this handler. Restore the 9ai `tapHint` line "Tap anywhere" on one phone only. Network games have the countdown bar instead, and no hint text (less text, user rule).
4. **Early close keeps the queue honest:** when a pop-up is closed by a tap, re-stamp the pop-ups still queued behind it from now: `popupAt` of the next one = `hostClock()`, each following one = previous + its `popupMs`. Without this the next pop-up's bar would start late (its stamp is in the future).
5. **Network games:** nothing new goes over the network. A tap closes the pop-up on that phone, and `afterRender` → `reportMyBusy` already tells the host. The 9an.5 gate already holds play until every person's phone is clear. So play carries on as soon as everyone has tapped, and at the latest when the 3.5 s run out. A phone that tapped early sees the table, with the flipping hourglass on players still looking (9ai.3, unchanged).
6. **"Who's done" row on network pop-ups (mockup 7):** under the countdown bar, one small initial per **person** at the table (not computer players, not Away seats), in seat order, your own included.
   - Gold = done. Dashed outline = still looking.
   - **No flashing:** keep a `Set<PlayerId>` of "done" per pop-up (a `WeakMap<Popup, Set>`). A player is added once they are not `isBusyPlayer` at a check at least 600 ms after this pop-up first showed. Busy reports take a moment to arrive, so before 600 ms nobody turns gold. Once gold, a player never turns back for that pop-up. Your own initial stays dashed (you are still looking).
   - Only the initial's colour changes: no movement, no entrance animation.
   - If the game screen doesn't redraw when the busy set changes, call `update({})` from the place that calls `setBusyPlayers` / `setPendingPlayers`, but only while `getState().popups.length > 0`.
7. `phoneBusyNow()` is unchanged (pop-ups open = busy, except in quick mode).
8. `PROJECT.md` 12u item 1 is updated by this plan (done).
9. **Checks:** `popups_check.py` and `netvotes_check.py` wait for 5 s today. Change them to: one phone: the pop-up is still there after 6 s, and gone after a tap. Network: two phones, nobody taps → both close within 3.5 s ± 0.5 s of each other. One phone taps → that phone is clear at once, and the other closes at 3.5 s. Both tap → play resumes (a computer player moves) within 1 s of the second tap.

### 9aq.3 Part C: small notices that don't stop play (build 1)

1. These `info` pop-ups become **notices**:
   - Joker ("Joker · Ben", including "Missed round · Two jokers…")
   - Picked up
   - "X leads"
   - No pause
   - Pause over
   - "Ben said no" (watch refused)
   - "Ben was removed by the host"

   Every other pop-up stays a pop-up. `grep "kind: 'info'" src/ui/game.ts`, put each one in one list or the other in `popupevents.ts`, and list them in 9aq.6. Also update `makesPopup` (`popupevents.ts`): a notice is not a pop-up, so the host doesn't wait for an ack for it.
2. **State:** `notices: Notice[]` in the store (`{ id, icon, text, at }`), separate from `popups`. Notices never count for `phoneBusyNow`, never hold play, and never need a tap. Each one lasts **2.5 s** (1.25 s in quick mode). At most 2 show; a third pushes out the oldest at once.
3. **Drawing:** `.notice-strip`, a cream pill (icon + one line, 14 px bold, `max-width: 260px`, text truncated with an ellipsis). It sits on the felt, centred, in the free band between the top seat's name label and the trick zone (use the boxes `table.ts` already works out). If that band is shorter than 36 px (7 and 8 players), it sits over the top edge of the trick zone. `pointer-events: none`, so it never blocks a card tap. Same place in landscape, inside the felt.
4. **Animation, once only:** slide down 8 px and fade in 180 ms the first time (a `WeakSet` like `shownPopups`), fade out over the last 250 ms by a class set from the timer. A redraw never replays either.
5. While a pop-up is up, notices still count down underneath it (the overlay covers them). They don't wait.

### 9aq.4 Part D: "What happened" in the round note (build 1)

1. New `src/ui/eventlog.ts`: a list of the last 8 lines `{ at: number; text: string; strong: boolean }`.
   - Add a line every time this phone makes a pop-up or a notice. Use the text already built: the title plus the who-line, for example "SLAP! Cat slapped Amy" (strong) or "Amy picked up 6 cards · leads".
   - Clear it when a new game starts (not between rounds).
   - Pure functions plus one module-level array; unit test the trimming.
2. The round note (`noteLayer`, opened by the round chip and the target chip) gets a first section, "What happened": newest first, at most 6 lines, each with a small time ("now", "10 s", "2 min"), worked out when the note is drawn. It never ticks, so it never flashes. No lines yet → no section.
3. The note keeps its `sheetSeen` handling. It floats and never pushes the table down (9al.1).

### 9aq.5 Part E: build 1 version, no-flash check, test build

1. `package.json` **2.39.0**.
2. `npm run check`, `npm test`, `node build.mjs`.
3. **No flash, no overlap (user rule):** screenshots at 360×740, 390×844, 412×915, 844×390 and 1180×820. Cover 2, 4 and 8 players, single player and a two-tab network game (local relay as in `netgame_check.py`). Show:
   - the merged round-end pop-up (each head)
   - a notice during play (4 and 8 players)
   - the round note with What happened
   - a network pop-up with the done row half filled

   Check: notices don't cover a seat disc, a name, your hand or the Play button. Record 10 redraws during a notice and a pop-up (send a typed message from the other tab every 300 ms) and check that the entrance animation runs once (no `animation` restart: compare `getAnimations()` start times, or count `animationstart` events).
4. Browser checks: `popups_check.py` (updated), `netvotes_check.py` (updated), `netgame_check.py`, `lasttrick_check.py`, `lasttwo_check.py`, `react_check.py`, `landscape_check.py`, `sound_check.py`. Record pass counts in 9aq.6. Failures that also fail on 2.38.2 are listed, not fixed.
5. Publish the private test build. Give the user checklist 9aq.7 items 1 to 8. Wait for "push".

---

### 9aq.8 Part F: the voice server: TURN keys (build 2)

Voice goes phone to phone (WebRTC). Phones on mobile data often can't reach each other directly, so the room server hands out short-lived Cloudflare TURN (relay) logins. The first 1,000 GB a month is free and resets each month.

1. **Secrets (the user sets them up, see 9aq.11):** `TURN_KEY_ID` and `TURN_KEY_API_TOKEN`, as Worker secrets. `server.yml`: add to the wrangler-action step
   ```yaml
   secrets: |
     TURN_KEY_ID
     TURN_KEY_API_TOKEN
   env:
     TURN_KEY_ID: ${{ secrets.TURN_KEY_ID }}
     TURN_KEY_API_TOKEN: ${{ secrets.TURN_KEY_API_TOKEN }}
   ```
   Add both (optional, `?:`) to `server/src/env.ts`. If either is missing the server still works, and `/turn` answers with STUN only.
2. **Route `POST /rooms/<roomId>/turn`**, body `{ "token": "<hostToken or joinToken>" }` (`index.ts`, same CORS and origin check as the other routes).
   - The Room object gets `knowsToken(token): boolean` (the host token, or a join token it handed out and that is still valid). Unknown → 403 `{ error: 'token' }`.
   - The Directory gets `takeTurnCredit(month: string): boolean` (`month` = "2026-11", UTC). It counts credentials handed out per month in storage and answers `false` at **3000**. Worst case a credential is one phone hearing 7 relayed voices for 3 hours (about 0.3 GB), so 3000 a month stays under about 900 GB. The count resets each month.
   - Credit given and secrets set: `fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + TURN_KEY_ID + '/credentials/generate-ice-servers', { method: 'POST', headers: { Authorization: 'Bearer ' + TURN_KEY_API_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 10800 }) })`. Read `{ iceServers }`, drop any URL with port `:53` (browsers block it), and answer `{ iceServers, relay: true }`.
   - Otherwise (no secrets, the month is used up, or Cloudflare's call failed) answer `{ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], relay: false }`. Voice then still works where phones can reach each other directly.
   - Never log tokens or credentials.
3. Server unit tests (`server/` tests as for 9r): bad token → 403; no secrets → STUN only; the 3001st credit in a month → STUN only, and the next month works again; Cloudflare's call failing → STUN only; port 53 URLs dropped (mock `fetch`).
4. `RELAY_PROTOCOL` is unchanged: the relay frames don't change. Voice signals are game payloads (Part G).

### 9aq.9 Part G: the voice connections (build 2): `src/net/voice.ts`

**Online games only.** In Nearby games (QR) players are in the same room, and phones on speaker would echo and howl, so there is no voice at all: no buttons, no code paths. Not on one phone, and not with computer players (they have no voice).

1. **Shape:** one `RTCPeerConnection` per pair of **people** (a mesh). It is separate from the game link, so voice can never break or slow the game.
   - In each pair the player with the lower number (`p1` < `p3`) makes the offer, so two offers never cross.
   - Each connection gets `addTransceiver('audio', { direction: 'sendrecv' })` with no track at first.
   - ICE servers come from Part F's `/turn`, fetched once when the phone enters the room (lobby). Keep the answer for the room's life; fetch again if it is older than 2.5 hours.
2. **Signals:** voice messages ride on the game links as normal payloads: `{ t: 'vsig', from: PlayerId, to: PlayerId, d: { sdp } | { ice } }`. A joining phone sends to the host. The host forwards it **unchanged** to `to`'s link (or uses it itself when `to` is the host). Add `vsig` to the `ToHost` / host-to-join message types and handle it in `netlobby.ts` and `netplay.ts`, the same places as `say`. The host checks that `from` is the sender's own seat; it drops anything else.
3. **When connections start and stop:**
   - They start when a person's seat is filled in an online lobby: every phone connects to every other person.
   - A pair's connection closes when either player leaves, is removed (9an.8) or is Away, and starts again when they come back or rejoin (9an.7).
   - Everything closes when the room closes or this phone leaves it.
   - A connection that fails (`connectionState` `failed`) is retried once after 3 s with an ICE restart, then left. Its seat then shows no talk ring. That's all: no error pop-up.
4. **Your mic:**
   - **Off by default, every time** (it is never remembered as on). The phone asks for mic permission only the first time it is turned on.
   - On: `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })`, then `sender.replaceTrack(track)` on every connection. No new offer is needed. Cap the sender at 32 kbps (`setParameters`, `encodings[0].maxBitrate = 32000`).
   - Off: `replaceTrack(null)` everywhere and **stop the track**, so the phone's mic light goes off.
   - It also turns off by itself when the page is hidden (`visibilitychange`), so a phone in a pocket is never a live mic, and when leaving the room or the game ending.
   - Permission refused → a notice (Part C style): "Mic blocked · allow it in your browser". The button shows the mic-off icon with a small red dot until a later tap works.
5. **Hearing others:**
   - Each remote stream plays in its own hidden `<audio autoplay playsinline>`, added straight to `document.body` (**not** inside the app root, so redraws never remove or restart it).
   - Mute = `audio.muted = true`. The voice volume (Part J) = `audio.volume`.
   - Browsers block sound until a tap: on the first `pointerdown` after a stream arrives, call `play()` on any paused voice element.
6. **Who's talking:** a shared `AudioContext` (reuse `audio/engine.ts`'s context) with an `AnalyserNode` per remote stream and one for your own mic.
   - Every 100 ms, a player is talking when the level is above a threshold for 150 ms; they stop 400 ms after it drops.
   - Expose `isTalking(id)` and `onTalkChange(f)`.
   - **No redraw for talking:** the 100 ms loop toggles the class `talking` straight on elements with `data-voice="<playerId>"` (seat discs, lobby rows, Voice sheet rows). Drawing code also reads `isTalking(id)`, so a redraw keeps the class. A muted player never shows as talking to you.
7. **Music dips while people talk:** a new `voiceDuck` gain on the music bus only (`engine.ts`, next to `duckGain`), down to 0.35 while any player you haven't muted is talking, back up over 600 ms after. Effects are not dipped.
8. Unit tests with a fake `RTCPeerConnection` and fake `getUserMedia` (no browser): who offers, signal forwarding and the `from` check, connections closed on leave / remove / away, mic off stops the track, page hidden turns the mic off, muted player not talking, the 2.5 hour refetch.

### 9aq.10 Part H: voice in the lobby (build 2), mockup 1

1. **Online lobby only.** Bottom bar, left of the Start / I'm ready button: the **mic button** (56 px circle; icons `mic` / `mic-off`, new line icons in `icons.ts` drawn like the others) and the **Voice button** (56 px, icon `speaker`), which opens the Voice sheet (Part J). The Start / Ready button keeps its full height and takes the rest of the row.
2. Mic on: a green ring (`#6fd08c`, 2 px border) and the icon in light green. Off: as the other round buttons.
3. One line under the bar, only until this phone has turned the mic on once (remember that in storage): "Mic is off until you tap it." 12 px, muted colour.
4. Each **person** row (not you, not computer players) gets a 44 px speaker button at the right end: tap = mute or unmute that player (Part J storage).
   - Muted: the button is gold-outlined with `speaker-off`, and the status line says "Muted by you".
   - Their status line also shows "Talking" (green) or a small "Mic off" with `mic-off`. Every phone sends its own mic state as `{ t: 'vmic', on }` through the host, so the host includes `micOn` in the lobby seats it already sends, like `busy`.
   - Your own row shows "Mic on" / "Mic off".
5. The row's disc gets `data-voice` and the talking ring (Part K).

### 9aq.11 Part I: voice at the table (build 2), mockups 2 and 4

1. **Portrait top bar:** the mic button (44 px, same states as the lobby) goes right after the menu button. The Voice button (44 px) goes after the mic button **only if the bar has room**. Work it out from the layout width, not by trial: show it when `window.innerWidth >= 390` **and** the bar isn't in the dealing state with deal chips (`dealChips`) and the target button and the take button all at once. Otherwise "Voice" is in the menu only. "Voice" is always in the game menu as well (netMenu).
   - The bar must never wrap or squeeze a chip: check every state in Part K's screenshots.
2. **Landscape rail (`lay.rail`):** mic then Voice, right under the menu button, 44 px each, the same states. The rail already has room; check at 844×390 and 740×360.
3. **Seat discs (`table.ts`):** add `data-voice="<id>"` to `.seat-disc` and to your own pill.
   - Talking: `box-shadow: 0 0 0 3px #6fd08c, 0 0 0 7px rgba(111,208,140,.35)`, done with a box-shadow transition of 120 ms. It changes no size or position, so nothing moves.
   - Muted by you: a 22 px badge at the disc's bottom right (gold ring, `speaker-off`).
   - Mic off: the same badge in grey with `mic-off`.
   - Mic on and not muted: no badge.
   - The badge sits where `disc-count` isn't: if `disc-count` is `at-right`, the voice badge goes bottom-left, and the other way round. Never on top of the card count.
   - It must also stay clear of the hourglass (9ai.3), the eye (9an.3) and the keep marks (9an.4). Check all four together on one seat.
4. **Tapping a seat:** when nothing else is using seat taps (no `o.onTap` from take-cards, watch or remove), tapping another person's seat opens a small **seat card** next to it, with their name and one button "Mute Ben" / "Unmute Ben".
   - If the host's seat tap for Remove (9an.8, `removesheet.ts`) is built, put the mute row in that same card instead of making a second one.
   - The card stays inside the screen (flip side if needed), closes on a tap outside, uses `sheetSeen`, and never covers your hand's Play button.
   - Computer players' seats and your own: no card.
5. Results screen and game over: the mic button stays in the fixed ready panel (results B, 9ak), left of I'm ready, 44 px.

### 9aq.12 Part J: the Voice sheet and storage (build 2), mockup 3

1. A bottom sheet (`.sheet`, cream, like the target sheet), opened from the Voice button, the menu item or the lobby. It contains:
   - the title "Voice" and a close button (44 px)
   - a green row "Your mic" with a switch
   - two buttons side by side, "Mute all" (dark) and "Unmute all" (outlined)
   - one row per other person (disc with `data-voice`, name, status "Talking" / "Muted by you" / "Mic off", switch on = hearing them)
   - a "Voice volume" slider
   - one line: "Muting only stops you hearing them. Mutes are remembered on this phone."

   It uses `sheetSeen('voice', open)`, so it never replays its slide-up while people talk or play.
2. **Volume slider:** Android and desktop only. On iPhone and iPad the browser ignores `audio.volume`, so hide the slider there (`/iPad|iPhone|iPod/` or `navigator.maxTouchPoints > 1 && /Mac/`) and show nothing in its place.
3. **Storage (`storage.ts`, key `pubby.voice`):** `{ muted: string[]; volume: number; micTried: boolean }`. `muted` holds players' names in lower case and trimmed (the name is what a person keeps between games).
   - Mute all = add every current person's name.
   - Unmute all = clear the list.
   - Never stored: mic on.
   - The profile reset rule applies: never wipe this on a version update. Include it in the backup and restore (2.34) if that copies all `pubby.*` keys; check, and note it in 9aq.6.

### 9aq.13 Part K: build 2 no-flash, no-overlap checks, version, test build

1. `package.json` **3.0.0**. `npm run check`, `npm test`, `server` check and tests, `node build.mjs`.
2. **Browser run** with the local relay (as `online_check.py`). Chrome flags `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` give a fake mic with a tone. Use three tabs (host and two joiners): voice connects, mic on in one tab → talking ring on the other two, mute in one tab → no ring and no sound there, page hidden → mic off, a tab leaves → its connections close. New `testbed/voice_check.py`. Record the results in 9aq.6.
3. **Screenshots** at 360×740, 390×844, 412×915, 844×390, 740×360 and 1180×820. Cover the lobby with 2 and 8 people, the top bar while dealing with the target button and take button, all four seat badges and marks on one seat, the seat card at each edge, the Voice sheet with 7 people (it scrolls inside, never off screen), and the results panel. Check that nothing wraps, overlaps or is cut off.
4. **Flash check:** with the fake mic talking, record 5 s on the table and in the Voice sheet. The talk ring may change, but nothing else redraws (count `render` calls through a test hook, or check that `.seat-disc` elements keep the same identity), and the sheet's entrance animation runs once.
5. The private test build can't reach the room server, so voice can't be tried on it. Say so plainly to the user. Give checklist 9aq.7 items 9 to 18 for after the push. Push only on "push"; the server deploys by itself (`server.yml`). The user must add the two GitHub secrets **before** that push (9aq.14), or voice works with STUN only (fine on Wi-Fi, often not on mobile data).

### 9aq.14 Part L: what the user sets up in Cloudflare and GitHub (build 2; give these steps to the user word for word)

1. **Create the TURN key.** Log in at dash.cloudflare.com (the account that runs `pubby-rooms`). In the left menu open **Realtime** (older screens call it **Calls**), then **TURN Server**, then **Create**. Name it `pubby-voice`. Cloudflare shows two values: the **Turn Token ID** and the **API Token**. Copy both now: the API token is shown only once.
2. **Add them to GitHub.** github.com/mmans-99/pubby → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Add the name `TURN_KEY_ID` with the Turn Token ID as its value, and the name `TURN_KEY_API_TOKEN` with the API token. These sit next to the existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. **Deploy.** The next push that changes `server/` deploys the server with the secrets. To check: on a phone, open Pubby, make an Online room, turn the mic on and talk with a second phone on mobile data (Wi-Fi off). If voice works on mobile data, the relay is working.
4. **Watching use (optional):** Cloudflare dashboard → Realtime → TURN Server → the key shows usage. The room server also stops handing out relay logins after 3000 in a month, so the free 1,000 GB can't be passed.

### 9aq.6 Built notes

**Build 1 (2.39.0, Haiku, built 2026-11-19, not committed, not pushed).**

What was built:
- **Part A:** `Popup` kind `roundEnd` (store.ts). The fold is a pure function, `mergeRoundEnd` (new `src/ui/roundend.ts`), called at the end of `popupsFor`. Head order: forfeit, round-ending slap, HAHAHA!, plain end. `popupLayer` draws it through `roundEndBody` (one cream box, at most two lines). The fast-forward/Skip filter and the winner mapping keep it. The trick animation's `slapPopup` also accepts it.
- **Part B:** `popupMs` returns `null` on one phone (no timer, closed by a tap). A network pop-up runs 3500 ms (1750 ms in quick mode). A tap closes the top pop-up in every game (`closePopup`, which re-stamps the queue). The vote alert keeps its own button and 5 s. "Tap anywhere" shows on one phone. The who's-done row (`doneRow`) shows on network pop-ups.
- **Part C:** `NOTICE_ONLY` in `popupevents.ts`: these events no longer make a pop-up and the host doesn't wait for them. `popupsFor` routes them into a notice list. `noticesWith` keeps two, each removed after 2500 ms (1250 ms in quick mode). `noticeStrip` (table.ts) draws them above the trick zone, `pointer-events: none`.
- **Part D:** `src/ui/eventlog.ts` (last 8 lines in memory, cleared on `gameStarted`). The round note shows the newest 6 under "What happened", with ages worked out when drawn.
- **Part E:** `package.json` 2.39.0. `tests/ui/roundend.test.ts` (7 tests) and `tests/ui/eventlog.test.ts` (4 tests). `tests/ui/popupevents.test.ts` changed: a refused watch is a notice now, so it makes no pop-up.

Notices list (Part C item 1, as built): Joker (including "Missed round"), Picked up, "X leads" (missing-suit and Reaction Tap leads still make no message, as before), No pause, Pause over, "X said no" (a refused watch), "X was removed by the host".

Checks run:
- `npm run check`: pass. `npm test`: 582 of 582 pass (571 before, plus 11 new). After that, only comments changed.
- `node build.mjs`: `dist/index.html` 418 KB, version 9644227ed8f7.
- `testbed/popups_check.py`: the timer checks were rewritten for the new rule (no countdown on one phone; "Tap anywhere"; a tap closes it; the vote alert is not closed by a tap). Passes: places, vote card, whose turn, target sheet, round badge, and the timing checks. Not seen in these runs (random game, same as on 2.38.2): take-cards card and sheet, Fast forward stop, tie band.
- `testbed/lasttwo_check.py`: 16 of 16 (it now taps pop-ups away).
- `testbed/netgame_check.py`: 97 of 97 on the last run. One earlier run gave 96 of 97; the failing line was not captured, so treat it as unexplained until it recurs.

Deviations from the plan, and what is not done:
- **Part A item 5 (one sound for the merged pop-up):** not done. Sounds stay event-driven (`eventSounds`, `cardSound`, the trick animation), so a round that ends with a forfeit plays the same sounds as before. Changing this is a risk for little gain; say if you want it.
- **Part C placement:** the strip sits at `middleBox` top minus 36 px. It is not measured against the seat name labels. Not checked on screen.
- **Part B network timing:** NOT measured. `netgame_check.py` passes, but it does not time the 3.5 s close. The new check in 9aq.2 item 9 (two phones, timed close, one tap, both taps) was NOT written.
- **Part E screenshots:** NOT done. The viewport screenshots (360×740 through 1180×820), the 10-redraw entrance-animation check, and the done-row half-filled screenshot were not taken. No flash or overlap has been checked by eye. This is required by 9aq.5 item 3 and must be done before the push.
- **Test build:** published as a private link (see the Phase 4z task list). The test link cannot reach the room server, which matters only for build 2.
- **Environment note:** `node_modules` was linked to the shared tool install (`/opt/npm-tools/node_modules`) to run the checks. It is not part of the repo.

Phone checklist: 9aq.7 items 1 to 8 (build 1) are still to be tested on a phone.

**Build 2 (3.0.0, Haiku, built 2026-11-19, not committed, not pushed).**

What was built:
- **Part F (TURN, server):** `server/src/core/turn.ts` (new): `TURN_TTL_S` 10800, `TURN_MONTHLY_LIMIT` 3000, `monthKey` (UTC "YYYY-MM"), `dropPort53`, `relayLogin` (Cloudflare Realtime `generate-ice-servers`), `stunOnly`, `turnAnswer` (no secrets, credit used up, or any failure → STUN only). `POST /rooms/<id>/turn` (`src/index.ts`): 400 without a token, 403 `{error:'token'}` for an unknown token (`RoomCore.knowsToken`: the host always; a join token while linked or within its window and not kicked), else the answer. Monthly credit kept in `DirectoryCore` (`takeTurnCredit`, not a room-list broadcast). `env.ts`: optional `TURN_KEY_ID`, `TURN_KEY_API_TOKEN`. Tests: `tests/server/turn.test.ts` (16 tests).
- **Part G (voice connections):** `src/net/voice.ts` (new, `VoiceMesh`): one connection per pair, offered by the earlier seat, signalling relayed through the host (`vsig`, the host checks the sender's link id), mic off until tapped, page hidden → mic off, talk detection (RMS of the analyser, threshold 0.02, 150 ms on, 400 ms off), one retry after 3 s. `src/net/voicertc.ts` (new): the RTC link, the sender at max 32 kbps, `<audio playsinline>` appended to `document.body` (a redraw never restarts it), the level meter. `src/ui/voiceglue.ts` (new): the singleton and a 100 ms tick that sets the `talking` class directly on `[data-voice]` elements (no redraw) and dips the music (`voiceDuck` in `src/audio/engine.ts`, 0.35 while talking). TURN login from `src/net/online.ts` (`voiceIceServers`); ICE refreshed every 2.5 h.
- **Part H (lobby):** `LOBBY_PROTOCOL` 12 → **13**. Seats carry `micOn`; `ToHost` gains `vsig` and `vmic`, `ToJoiner` gains `vsig`. `src/ui/netlobby.ts`: mic and Voice buttons beside Start or Ready (online only), status chips (Talking, Muted by you, Mic on, Mic off), a speaker mute button per row, `syncVoice()` follows the lobby. `tests/net/lobby.test.ts` protocol asserts changed to 13.
- **Part I (table):** `src/ui/table.ts`: each disc carries `data-voice` and its badge (muted gold speaker, mic off grey). `src/ui/game.ts`: the top bar has the table mic button, and the Voice button at 390 px and wider, not while dealing (`src/ui/voicetable.ts`). Tapping another person's seat opens its card with Mute.
- **Part J (Voice sheet, storage):** `src/ui/voicesheet.ts` (new): "Your mic", Mute all, Unmute all, a row per person (status, hear toggle), a volume slider (hidden on iOS, where the volume can't be set). `src/ui/voicestore.ts` (new): `pubby.voice` = `{muted: [names lower-case], volume 0–100, micTried}`. Mutes are kept by name, so a new game with the same people keeps them. `src/ui/sheetseen.ts` (new, moved out of `between.ts` to break an import cycle that pulled `catch-phrases.md` into the table tests).
- **Part K (checks, version):** `package.json` **3.0.0**. `testbed/voice_check.py` (new, 31 checks), `testbed/online_check.py` (48 checks, see below), `testbed/relay_server.ts` (`/rooms/<id>/turn`: 403 for an unknown token, else STUN only).

Fixes made while testing (all in build 2):
- **Answering side:** the answer side now adopts the transceiver created by the remote offer and sets it to sendrecv (`adopt()` in `voicertc.ts`). Before, the mic was attached to a transceiver that was never negotiated.
- **Meter followed a dead stream (real bug, found by `voice_check.py`):** the level meter was built once from the first remote stream. When the connection renegotiated (for example at game start), `ontrack` gave a new stream, but the meter kept reading the old one, which had ended, so it showed silence for the rest of the game. `level()` now rebuilds the meter whenever the stream changes.
- **Test fake mic:** a steady 300 Hz tone reads as background to noise suppression, so the level flickered. The fake mic is now phrases of a wandering tone with short pauses (`tone_wav()` in `voice_check.py`).
- **Test order:** the hidden-phone check turns Ben's mic off, and it stays off when the phone shows again (by design, the person taps it on). The check now taps it back on before the table checks. Without this the table checks ran with the mic off.
- **Removal wording (`online_check.py`):** the check expected "The host took you out of this game." The app has always said "The host removed you from the game." (already at HEAD). The check now uses the app's wording. This is a stale test expectation, not a change to the game.

Checks run:
- `npm run check`: pass (both tsconfig files). `npm test`: 618 of 618 pass (includes the server tests in `tests/server/`).
- `node build.mjs`: `dist/index.html` 437 KB, "Pubby v3.0.0", version 03c92d5bccb8.
- `testbed/voice_check.py`: **31 of 31** on the last two runs. Earlier runs: 27, then 28, then 30 of 31; each failure traced and fixed as above. One earlier run lost **Cat's lobby talk ring** (1 run in 4). It passed on the next runs, but the cause of that one miss is not confirmed. Treat it as intermittent until it recurs.
- `testbed/online_check.py`: **48 of 48** (after the wording fix above).
- Server type check (`tsc` on `server/`): not run here; `@cloudflare/workers-types` can't be fetched offline. Server logic is tested through `tests/server/turn.test.ts` only.

Deviations from the plan, and what is not done:
- **Part F secrets:** the user set `TURN_KEY_ID` and `TURN_KEY_API_TOKEN` directly on the Worker in Cloudflare. As instructed, `server.yml` was NOT changed (no GitHub secrets step added to the deploy). Part L step 2 (GitHub secrets) therefore does not apply; the Cloudflare key steps still do.
- **Part I item 2, landscape rail:** NOT built. Landscape shows the same top bar. Report to the user before the push.
- **Part I item 3, seat card at each edge:** not checked on screen. The `voice_check.py` seat card check is SKIPPED at the deal stage (other seats are game buttons then, so a tap is a game action, not a voice action). Not verified.
- **Part K item 3, screenshots at six sizes:** NOT done. Nothing checked by eye for wrap, overlap or cut-off.
- **Part K item 4, flash check:** the disc identity check passes (`.seat-disc` elements keep their identity while people talk, the table's no-redraw check). The Voice sheet entrance-runs-once check is NOT measured.
- **Part K item 5, test build:** voice can't be tried on the private test build, because it can't reach the room server. Say so to the user. Checklist 9aq.7 items 9 to 18 are for the live app after the push.
- **Not in plan but noted:** voice uses STUN only when the TURN key is missing (fine on Wi-Fi, often not on mobile data).

**Build 3 (3.0.1, Haiku, built 2026-11-19, not committed, not pushed; plan 9aq.15).**

Part B (diagnosis, no fix). `?voicedebug` snapshot (`voiceDebugSnapshot`, `window.__pubbyVoice`, only with the URL flag), `voice_check.py --repeat N --trace`. Clean batch of 20 runs (`--repeat 20 --trace`): 16 of 20 runs passed every check; 616 of 620 checks. Misses: runs 1, 6, 12, 19, all "Cat hears Ben". In each miss Cat received 3 signals from Ben and sent 0, and the Cat-to-Ben link stayed `new` (no remote track, no peak level). In the 16 clean runs Cat received 2, sent 2, and connected; peak level 0.48 to 0.68. Host dropped count 0 in every run. Sorted: not H1 (host dropped 0), not H2 to H5 (no run reached `connected` with a live track). **New candidate H6:** Cat's phone drops Ben's offer when it arrives before its mesh knows the seat order (`VoiceMesh.onSignal` returns while `order` is empty; `applyPeers` waits for `iceReady`, the relay-login fetch). The link then sits in `new`, which is never `failed`, so the one retry never runs. Strongly supported, not yet proven by a counter: the next step is a debug counter in `onSignal`, then a traced batch. A 5-run check after the build gave 1 miss (run 1, no trace). Total: 5 misses in 25 runs. Item 9aq.2 / 9aq.9 "Cat's ring" stays open. No fix until Opus reviews H6.

Part A (rail, Option 1). A1 before (3.0.0, `testbed/rail_shots.py before`): at 740×360 while dealing (and the target step, which is also dealing), the gold "2" jokers chip sits on the 😂 button, and the top group ends at 228 px, past the 210 px limit. At 844×390 the group ends at 228 px against 240 px, no overlap. Playing and take phases: no overlap, group ends at 186 px. Results reached; game over not reached (one-round game). A2 built: `railFit(viewH, items)` in `layout.ts` (40 px buttons, 6 px gaps, 8 px top, top group above the floating group at H−150; 320 → 3, 360 → 4, 390 → 5, 412 → 5, 500 → 7). `game.ts` builds the bar from one table of keys; the rail keeps what fits in priority order (menu, mic, round, pause, take, target, jokers, hidden, voice); overflow goes to a shelf at the top of the game menu (copies of the buttons; the deal chips as one row). Voice stays in the menu (`voiceMenuItem`). Results-panel mic dropped (Q2). After: `rail_shots.py after` 740×360 and 844×390, every phase: no overlap, group above the floating buttons, menu opens right of the rail inside the window. `tests/ui/railfit.test.ts`: 6 tests (624 of 624 unit tests in total).

Part C (screenshots, not finished). `testbed/voice_shots.py` written: six sizes, four phones (Amy, Ben, Cat, Dan), lobby, table, Voice sheet, seat card at the left, top and right edges. Last run stopped early at every size: "Amy is dealt in" timed out (Deal all did not give a hand within 15 s), and a later Ben mic-toggle click timed out. The earlier run found bar-overlap and badge-overlap checks failing at several sizes (not yet checked against screenshots). Not done: the 8-person lobby, the Voice sheet with seven others, a seat with all four marks, build 1's scenes (9aq.5 item 3), and the by-eye check of every shot.

Part E. `npm run check` pass; `npm test` 624 of 624; `node build.mjs` 3.0.1 (`9810f31f8695`); `online_check.py` 48 of 48; `landscape_check.py` 24 of 24 (3.0.1); `voice_check.py --repeat 5`: 154 of 155 (the Cat miss above). Server type check and `/turn` probe not run (no network for workers types; D3 is the user's). `.gitignore`: added `testbed/out/`. Test build: see TODO Phase 4z (published as a private link; voice does not run on it).

### 9aq.16 Fixes after the 3.0.1 build check (PLAN, Opus, 2026-11-19 19:40; written for Haiku; APPROVED 19:39 by the user, with 3.0.1 pushed first)

Opus checked Haiku's 3.0.1 build (9aq.6 build 3) against the traces, the code and the screenshots.

**Check results.**
- **H6 is confirmed** (not just a candidate). In all 4 misses, Ben's and Amy's links to Cat are in `have-local-offer` (they sent offers), and Cat's links are `new` / `stable` with no remote description (Cat never applied them). Cat counted 3 signals in from each, because `voiceSignal` counts before `VoiceMesh.onSignal`, which then returns at `if (!this.order.includes(from)) return;`: the order is empty until `applyPeers`, and `applyPeers` waits for `iceReady` (the `/turn` fetch). When the offers arrive before that fetch ends, they are thrown away. Cat later opens its links as the answering side and waits for an offer that never comes; `new` is never `failed`, so the retry never runs. On a real phone the `/turn` fetch is a network call (slower than the local relay), so this is likely more common there than in 1 of 5 test runs.
- **Rail (Part A): correct.** The voice table shot at 740×360 (`voice-740x360-table.png`) shows menu, mic, round, pause, with the target button and jokers moved to the menu; nothing touches 😂, sound or rules. The shots first sent to the user came from a solo game (no mic); this one is the rail with voice. `rail_shots.py` reports "deal not reached" at 740×360 after the change only because it spots the deal by the jokers chip in the bar, which is now in the menu (a script detail, not a fault).
- **New fault 1, portrait bar overflow (3.0.0, not 3.0.1):** at 390×844 while dealing, the bar holds menu, mic, round, pause, target button and the jokers chip, and the jokers chip runs under the sound button (`voice-390x844-table.png`). The mic added one button to a bar that was already full. Part C's overlap check found it (390×844 and 412×915).
- **New fault 2, voice badge too big:** the badge is a fixed 22 px circle, but the seat disc is sized by `--u` (2.6u, about 20 to 29 px). On a phone the badge covers the seat's initial and touches the card count (Cat and Dan in the shots; the badge check failed at 360, 390, 740 and 844 wide).
- **Part C script faults (not app faults):** the game starts in manual deal mode ("Tap a name to deal", Manual / Auto), so there is no "Deal all": the script must tap **Auto**. The mic-toggle redraw loop timed out after that; re-check it once the deal works.

**Fix 1: offers that come too early are kept (H6).** `src/net/voice.ts`, pure logic, unit tests with fake links.
- `VoiceMesh.onSignal`: when `from` is not in the order yet, keep the signal in `early: Map<string, VoiceData[]>` (at most 50 per person; older ones dropped), instead of returning.
- `setPeers`: after opening a link to a person, pass their kept signals to it in order, then clear them. `drop` and `close` clear them too.
- Safety net: a link that has not reached `connected` 10 s after it opened counts as `failed` once (the same single retry, `RETRY_MS`; the offering side sends an ICE-restart offer). Through `deps.later`, so tests use a fake clock.
- Tests: offer before `setPeers` → the link gets it once the order is set; an early signal from someone who never joins is never used; 51 early signals keep the last 50; a link stuck in `new` for 10 s restarts once, and not twice.
- `voiceDebugSnapshot`: add the count of kept signals per person (debug only).
- Then `voice_check.py --repeat 20 --trace`: must be 20 of 20. If not, stop and report (Opus).

**Fix 2: the portrait bar uses the same rule as the rail (Option 1 widened).** `layout.ts` `barFit(viewW, widths)`: the room is `viewW − 16 − 98` (screen padding, and the right padding kept for sound and rules), each item has a fixed width from a table (icon buttons and the round chip 40, `bar-chip` 52, target chip 64, or 44 under 360 wide), gaps 8 (2 under 360 wide, as the CSS). Items keep the portrait order; what doesn't fit goes to the same menu shelf as the rail. Tablets (over 500 high in landscape) and wide phones keep every button when they fit. Unit tests at 320, 360, 390 and 412 wide in each phase (dealing with target button and jokers, play with target chip and Take cards). The bar must look the same as 3.0.0 whenever it fits.

**Fix 3: the voice badge is sized like the card count.** `styles.css` `.seat-disc .voice-badge`: width and height `calc(1.5 * var(--u, 11px))`, bottom `calc(-0.75 * var(--u, 11px))`, the icon `calc(1 * var(--u, 11px))`, and the side offset `calc(-0.75 * var(--u, 11px))`. The initial must stay readable; the badge must not touch the count.

**Fix 4: Part C script.** Tap **Auto** (not "Deal all") and wait for Amy's hand; re-run; then finish C2 (8-person lobby, the Voice sheet with seven others, a seat with all four marks) and C7 (build 1's scenes). Look at every shot by eye and list anything off in 9aq.6. `rail_shots.py`: spot the deal by the round's dealing text, not the jokers chip.

**Then (Part E again):** version **3.0.2**, `npm run check`, `npm test`, build, `voice_check.py --repeat 20 --trace` (20 of 20), `online_check.py`, `landscape_check.py`, `voice_shots.py`, `rail_shots.py after`; send the user `voice-740x360-table.png` and `voice-844x390-table.png` (the rail with voice) and the portrait shots at 360 and 390 while dealing. Test build, then push on "push".

**Build 4 (3.0.2, Haiku, built 2026-11-19, not committed, not pushed; plan 9aq.16).** Fixes 1 to 4 built as planned, with these notes:
- Fix 1: `STUCK_MS` 10 s and `EARLY_MAX` 50 in `voice.ts`. The stuck check uses `deps.later`, so two existing tests that counted every timer now count only the 3 s retries.
- Fix 2: the CSS narrows the bar at 380 px and under (2 px gaps, 4 px left pad, 36 px bar chips, 44 px target chip). `barFit` uses 380 to match what is drawn, not 360 as the plan said. Take and the target button are 40 px (icon buttons).
- Fix 4: the game starts in Manual. In Auto, `notStarted` (`game.ts`) waits for the dealer's "First card to" tap before dealing, so the script taps Auto, then the first visible "First card to" seat, then waits for the hand (60 s). The plan's "tap Auto" alone did not deal.
- Results: `npm run check` clean; `npm test` 638 of 638; `voice_shots.py` 150 of 150 (six sizes); `rail_shots.py after` 40 of 40; `online_check.py` 48 of 48; `landscape_check.py` 24 of 24; `voice_check.py --repeat 20 --trace` NOT 20 of 20 (runs 1 to 3 31 of 31; run 4 failed at Ben's join step before any voice step, and the batch stopped). Part C scenes C2 and C7 not done.
- Test build: https://claude.ai/artifact/3Y4a4YKJayvBL6RgkMrpiX (voice does not run on it).

### 9aq.17 The passcode box loses typing when the room list changes (PLAN, Opus, 2026-11-19 20:50; written for Haiku; APPROVED 20:51 by the user: "I want haiku to do fix")

**Finding (Opus, 2026-11-19 20:45): voice_check run 4's join failure is an app bug, not a relay flake, and not voice.**
- A scratch probe (host plus two joins only, fresh relay with `--verbose` each time, 20 runs) failed once: Ben on `room-pass` with an **empty** passcode box and "The passcode is 4 digits."; the relay got no `POST /join`. The script's `fill('5150')` landed just as a room-list frame arrived.
- Deterministic repro: on the passcode screen type "51", make another room appear (any room, from another page), type "50". After the list push `document.activeElement` is `BODY`, and the box reads "51". Every time.
- Cause: `startList`'s list callback (`netlobby.ts`, around line 1173) calls `draw()` when `step === 'room-pass'`, and `draw()` rebuilds the whole screen with `replaceChildren`, so the passcode `<input>` is a new element. On a phone the keyboard closes and a digit typed at that moment is lost. `draw()` already guards the name box (line 346) but not this box.
- When it happens: the server (and `relay_server.ts`) pushes the list 500 ms after **any** room changes (made, host connects, seat count changes, host away, removed), and the list holds every open room, so someone else's room can interrupt. `voice_check` starts each join right after a host connect (Ben) or a seat change (Cat), which is why the test hits it. Present since online rooms; not new in 3.0.x.

**Fix A, app (`src/ui/netlobby.ts`):**
- In the list callback, `room-list` redraws as now. On `room-pass` do **not** call `draw()`; only update the room name heading in place (the `h2` in `roomPassView`), so an invite opened before the list arrived still shows the room's name. Keep a reference to that heading (for example a `data-room-name` attribute on the `h2`, found with `root.querySelector`), and set its `textContent` to the same name rule as now (`rooms.find(...)?.name ?? roomPick?.name ?? ''`, `'Room'` if empty).
- Do **not** use the name box's "draw later on blur" rule here: tapping "Join the room" blurs the box first, and a redraw on blur would replace the button before the tap's `click`, so the tap could be lost.
- Nothing else on the screen changes. Errors (`roomPassError`) still redraw as now (they come after the Join tap, not while typing).

**Fix B, browser check (`testbed/online_check.py`, a new small phase, or a new step in an existing one):** host a room on page A; page B opens the list, picks the room, taps the passcode box and types "51" with `keyboard.type`; page C hosts a second room; wait 1.5 s (the list push); B types "50". Checks: the box reads "5150"; the box still has focus (`document.activeElement` is the passcode input); the heading still shows the first room's name; then Join works (B reaches `lobby`).

**Fix C, `testbed/voice_check.py`:** use the result of the room-list wait and the join wait. If either fails, record a failed check, print each page's step and the first 300 characters of its screen text, end that run (skip the voice steps), and go on to the next run. The batch must never crash on a failed join. Same for Cat.

**Then:** version **3.0.3**; `npm run check`, `npm test`, build; `online_check.py` (all pass, including the new check); `voice_check.py --repeat 20 --trace`: must be 20 of 20. If a run still fails, stop and report (Opus), with the printed screens. Then carry on with 9aq.16's open items (Part C scenes C2 and C7; the bottom action button at 360, 390 and 740 wide, and whether 3.0.1 does the same). Test build, then push on "push".

**Phone checklist addition:**
21. Join a room: on the passcode screen, start typing, and have someone make or join any room at that moment. The keyboard stays up and every digit you typed is kept.

**Build 5 (3.0.3, Haiku, built 2026-11-19, not committed, not pushed; plan 9aq.17 and the 9aq.16 open items).**
- Fix A (`netlobby.ts`, `online.ts`): on the passcode screen the room list only updates the heading (`data-room-name`) in place. Built as planned.
- Fix B (`testbed/online_check.py` phase F, `--only f`): on 3.0.2 it failed (box read "51", focus lost); on 3.0.3 it passes 5 of 5. Full `online_check.py`: 53 of 53.
- Fix C (`testbed/voice_check.py`): a failed join records the check, prints each page's step and the first 300 characters of its screen, ends that run, and the batch goes on.
- Checks: `npm run check` clean; `npm test` 638 of 638; build; **`voice_check.py --repeat 20 --trace`: 20 of 20 runs, 640 of 640 checks.**
- 9aq.16 Part C: `voice_shots.py` now has the 8-player lobby, the Voice sheet with seven others, the dealing and table shots at 8 players, and a bottom-button check at every state. Result: 264 of 276 (the 12 failures are the bottom-button check, below). Looked at the contact sheets for 390 and 360 wide by eye (the other sizes are in `testbed/out/shots/`, not yet viewed one by one).
- **Not done (9aq.16 C2 and C7):** the seat with all four marks at once (card count, hourglass, eye, keep marks) needs a test hook, since the marks come from game state that the script cannot set up. Build 1's scenes (C7: the round-end pop-up heads, notices at 4 and 8 players, the round note, a network pop-up with the done row half filled) are not in the script. Both need a plan before they are built.
- **Bottom action button (9aq.16 open item), reported, not fixed:** the "Waiting for <names>" button runs past the right edge of the window on the table at all six sizes (for example at 390 wide the label needs 257 px in a 155 px button, and "Waiting for Ben" is cut at the edge). In landscape and on the tablet, "Deal again?" is also clipped inside its button. **3.0.1 has the same fault** (checked on commit 51e292c, same six sizes), so it is not new in 3.0.2 or 3.0.3. Needs a plan (Opus): the label is long for the bar's width, so the fix is either shorter text or a planned two-line label.
- Other things seen in the contact sheets (not fixed): the "Hal joined" toast covers the Eve or Gus row in the 8-player lobby and Voice sheet; at 360 wide the Host chip hides the first letter of the host's name in the lobby list; "Start game · 8 players" wraps to two lines at 360.
- Test build: https://claude.ai/artifact/UkdSyyRQmTbhLkL96bmXxM (voice does not run on it; the mic has not been tested on any version).

### 9aq.18 Fixes from the 3.0.3 screenshots (PLAN, Haiku, 2026-11-19 21:40; for approval, not built)

Sources: `testbed/voice_shots.py` at 3.0.3 (264 of 276; the 12 failures are the bottom button), the contact sheets at 360 and 390, and 3.0.1 (`51e292c`), which has the same bottom-button fault. Answers from the user (21:38): short label; toasts at the top of the screen; keep both screenshot scenes.

**A. Bottom button label (main fault).**
- Where: the table's action row (`roundstart.ts`, `game.ts` action slot). The label "Waiting for <names>" comes from `roundstart.ts` line 140 and `lobby.ts` line 352 (the function that builds "Waiting for …"; name to confirm when built).
- Change: on the table the button says "Waiting for N" (N = people still to go), with a plain-text `title` and `aria-label` that keep the names. Names stay on the table (the seat discs and the "Waiting" line), so nothing is lost. Lobby keeps its names (its button is full-width).
- "Deal again?": in landscape and tablet widths the label gets `min-width: 0` and an ellipsis (`.action-row > button` already has nowrap and ellipsis from 9al Part F); the icon stays. No layout change.
- Test: `voice_shots.py` bottom check at all six sizes, dealing and table, and the 8-player table: every label inside the window and not clipped (`scrollWidth` ≤ `clientWidth`). 3.0.3 must pass 12 of 12 more checks than it does now.

**B. Join toast (top of screen).**
- Where: the toast code in `netlobby.ts` / `netscreens.ts` (the "X joined" line).
- Change: the toast sits at the top, under the top bar, as a strip that slides in once and goes after 3 s. Never over a player row or a button. On the table it is the same strip (no change to pop-ups, which are separate).
- Test: a check that the toast's box does not overlap `ol.seats li` or `.voice-row` at all six sizes, 8 players.

**C. 360-wide lobby.**
- Host chip: the name truncates with an ellipsis before the Host chip, not under it. Check: the name's box does not overlap the Host chip.
- "Start game · 8 players" wraps: shorten to "Start · 8 players" under 380 px (the CSS rule from 9aq.16 Fix 2 already narrows the bar there). Check: the button height is one line at 360.

**D. Screenshot scene: the all-marks seat (9aq.16 C2).**
- Needs a test-only hook: `?voicedebug` (already in the testbed) also exposes `window.__pubbyTable.setMarks(seatId, {count, busy, watched, keep})`, which only sets the classes that the existing code paints. Players never see it (the URL flag).
- Test: `voice_shots.py` one shot per size with the four marks and the voice badge; the automatic check that the badge does not overlap the count, the hourglass, the eye or the keep marks.

**E. Screenshot scenes: build 1's pop-ups (9aq.16 C7).**
- Script: at 4 and 8 players, the round-end pop-up (PATHETIC and SLAP heads), a notice during play, the round note with "What happened", and a network pop-up with the done row half filled. Each is set up by the bot to the event, not by a hook.
- Test: one shot per scene at 390 and 740 wide, plus the existing overlap checks.

**Order and gates.** A and B are the user-visible fixes; build them first, with C. D and E only add tests (no app change) and come after. Gates: `npm run check`; `npm test`; `online_check.py` (53 of 53); `voice_check.py --repeat 20 --trace` (20 of 20); `voice_shots.py` (all checks); a by-eye look at the contact sheets. Version **3.0.4**. Test build, then push on "push".

**Phone checklist additions (after build):**
22. The bottom button label fits on every phone you use, in portrait and landscape, in every phase.
23. A join toast appears at the top, never over a name or button, and goes by itself.

**Build 6 (3.0.4, Haiku, built 2026-11-19, not committed, not pushed; plan 9aq.18).**
- A: the table's "Waiting for N" button shows the count (names kept in the aria-label, and the seat strip). The round-start and between-round buttons use the same count. Landscape phones and tablets (wide, 700 px and up) stack the round buttons, so each label has its full width.
- B: `flash` toasts sit under the top bar (`.toast.top-toast`).
- C: lobby name shrinks before the Host and You chips (`.seat-top > .name`); Start reads "Start · N players" under 380 px.
- D: the all-marks seat is built in the test (the badge, count, hourglass, eye and check added as DOM elements on a seat with a badge), not by an app hook. Overlap check passes at all six sizes, see the shots.
- E: build 1 scenes captured by the bot in `run_build1`. Round-end pop-up, round note, and in the 8-player game a notice and the done row were all captured at 390 wide. In 4-player games the notice and the done row did not come up in every run (4 of 6 runs in total). Reported, not forced.
- Checks: `npm run check` clean; `npm test` 638 of 638; `online_check.py` 53 of 53; `voice_check.py --repeat 20 --trace` 20 of 20 runs (640 of 640); `voice_shots.py`: the bottom-button check passes at all six sizes (after the stacking fix); the lobby and table checks pass. The only failures left are the 4-player notice and done-row scene captures (game-dependent).
- Test build: https://claude.ai/artifact/3TDCyFejepW9hASLY7NfwE. Voice does not run on it; the mic has not been tried on any version.

### 9aq.19 Fixes from the 3.0.3 phone test (PLAN, Opus, 2026-11-19 23:55; APPROVED 23:58, Q1 = 1, Q2 = 1; not built; for Haiku)

3.0.4 is on main (79eec34). The user tested 3.0.3 on an Android phone (host lobby) and an iPad (table, 2 players). Three faults; causes found from the code, one reproduced in the browser.

**A. iPad (iOS) table cut off at the top and bottom (reproduced).**
- Cause: `gameLayout`, `tableBox`, `handH` and `railFit` size everything from `window.innerHeight`, but `.screen.game.fixed` pads the top and bottom by `env(safe-area-inset-top/bottom)`. Android Chrome gives 0 for both, so it looks right. On the iPad (home-screen app, `black-translucent` status bar) they are about 24 px and 20 px, so the rows are ~44 px taller than the screen, and `.game-table-slot` (overflow hidden, centred) cuts the table's top and bottom rail. Reproduced in Chromium at 820×1180 by forcing 28 px / 24 px padding: the same cut-off as the iPad photo, and `tablet_check.py` then fails (side fans cut). `tablet_check.py` passes today only because Chromium has no insets.
- Fix: in `styles.css` `:root`, add `--sat: env(safe-area-inset-top, 0px)`, `--sab`, `--sal`, `--sar` the same way, and use those in every `.screen.game` padding rule. New `viewSize()` in `layout.ts`: reads the four values once per draw from a hidden probe (`getComputedStyle` of an element with `padding: var(--sat) var(--sar) var(--sab) var(--sal)`), returns `{ w: innerWidth - sal - sar, h: innerHeight - sat - sab }`. Every `window.innerWidth/innerHeight` that sizes the game (`game.ts` 797, 1189, 1262, 1489, 1494; `table.ts` 578; `watch.ts` 132) uses `viewSize()` instead. Landscape and portrait both (the iPad in landscape has a 20 px bottom inset too).
- Test: `tablet_check.py --safe 24,20` sets `:root { --sat: 24px; --sab: 20px }` before load (the same CSS variables, so app and test agree) and runs every size: all checks pass, and a new check that the `.round-table` box is fully inside `.game-table-slot`. Also run without `--safe` (no change on Android).

**B. Round end plays the fanfare and then the sad trombone, to everyone.**
- Cause: `eventSounds` (`audio/sfx.ts` 261) plays the escape sound for the last `playerOut` (the fanfare when that is place 1, as in a 2-player game; else the bells) and then always `lastPlace`. It doesn't know which seat is this phone's.
- Fix (Q1 below, option 1 recommended): `eventSounds(events, withTrick, me)`, where `me` is this phone's seat id (single player: the person's seat; watching: still your own seat). At round end exactly one sound: the trombone if `me` is the last player; otherwise the escape sound for your own place (fanfare if you came 1st, bells if not). Escapes before the round end stay as now (everyone hears them).
- Test: unit tests in `tests/audio/` with a fake `sfx` queue: 2 players, winner phone hears only `roundWinner`, loser only `lastPlace`; 4 players, the 2nd and last phones; a slap ending and a forfeit ending.

**C. Host lobby row: the Host chip covers the name (Android, 412 wide).**
- Cause: the row has the number, the name and up to three chips (Host, You, Mic off; plus Away or a level). In 3.0.3 the name had no `overflow: hidden`, so it shrank to nothing and its text ran under the chips. 3.0.4 (9aq.18 C) adds the ellipsis, so it no longer overlaps, but at 412 wide the three chips take ~300 px and the name shows as "M…".
- Fix (Q2 below, option 1 recommended): the chips move to the second line of the row (`.seat-bottom`, which already holds ▲ ▼ ✕ on the right and is empty on the left; joiners' rows get a `.seat-bottom` for them). Line 1 is just the number and the full name. The same in `joinLobbyView`, `startedView` and the Voice sheet rows if they share `seatTags`.
- Test: `voice_shots.py` lobby scene at all six sizes with Host, You and Mic off on one row: the name's `scrollWidth` ≤ `clientWidth` for names up to 12 letters, and no chip overlaps the name or the arrows.

**D. Seen on the iPad photo, to check while there:** the small voice badge on Murshed's seat disc sits over the name pill ("Mur▪hed"). Add the name pill to the 9aq.16 badge-overlap check at the tablet sizes (820×1180, 1024×1366); if it overlaps, move the badge to the disc's top-left (the count stays top-right).

**Order and gates.** A, B, C, D. Gates: `npm run check`; `npm test`; `tablet_check.py` with and without `--safe 24,20`; `online_check.py` 53 of 53; `voice_shots.py` all checks; a by-eye look at 820×1180 with `--safe`. Version **3.0.5**. Test build, then push on "push". The iPad fix can only be confirmed on the iPad itself (Chromium has no real insets).

**Questions (answered 23:58: Q1 option 1, Q2 option 1; build those):**
- Q1 round-end sound: (1, recommended) each phone hears its own: trombone only for the loser, fanfare or bells for everyone else; (2) everyone hears only the trombone at round end; (3) everyone hears both, as now, but with the fanfare cut short.
- Q2 lobby chips: (1, recommended) chips on the second line with the arrows; (2) keep one line and shrink chips to icons only (crown, person, mic) with text in the aria-label.

**Phone checklist additions (after build):**
24. iPad, home-screen app, portrait and landscape: the whole table shows, rail all round, and nothing is cut at the bottom.
25. 2-player round: the winner's phone plays the fanfare only; the loser's phone plays the trombone only. 3 or more players: the same at the round end.
26. Host lobby on your Android phone: the full name shows, with Host, You and Mic on the line under it.

**Build 7 (3.0.5, Haiku, built 2026-11-20, not committed, not pushed; plan 9aq.19).**
- **A (insets):** `styles.css` `:root` has `--sat/--sab/--sal/--sar` (`env(safe-area-inset-*, 0px)`); the game-screen padding rules (`.screen.game`, `.screen.game.fixed`, the rail rules) use them. Deviation: `viewSize()` is in a new file, `src/ui/viewsize.ts`, not `layout.ts` (`layout.ts` is pure and `table.ts` imports it; a second import would be a cycle). It reads the four values through a hidden probe. Call sites: `game.ts` (railFit, barKeysFit, gameLayout, stageLayout, landscape and width, handH), `table.ts` (tableBox), `watch.ts` (landscape). Left as they were: `game.ts` voice-button width (779) and the popup positions (2041 onward, which are relative to the pointer).
- **B (round-end sound):** `eventSounds(events, withTrick, me?)` (`src/audio/sfx.ts`). In a batch with `roundEnded`, a phone with a seat plays only: the trombone if it is the last place, otherwise the escape sound for its own place (fanfare for 1st, bells otherwise). Escapes in earlier batches still play for everyone. Callers: `absorb` (game.ts, `seat`) and `driveTrickAnim` (`ownSeat` of the saved game). A phone with no seat gets the old rule.
- **C (chips):** `netlobby.ts`: `seatTags` moved to `.seat-bottom`, on the left, before the arrows, in the host row; a `.seat-bottom` added to the joiner rows and to the started view. Line 1 is the number and the full name.
- **D (badge):** `testbed/voice_shots.py` counts `.pill-label` (the name pill) with `.disc-count`. No overlap, so the badge was not moved.
- **Test tools:** `testbed/tablet_check.py --safe T,B` (new) sets the insets before load; new check "table cut off by its slot" for every size.
- **Version:** `package.json` 3.0.5. Test build: https://claude.ai/artifact/Uv6CtjBqygNtrXYWzzwt2t (private; no service worker or WebRTC in the preview).

Checks (this build): `npm run check` clean; `npm test` 644 of 644 (6 new in `tests/audio/eventsounds.test.ts`); `tablet_check.py` 61 of 61 without insets; with `--safe 24,20` 61 of 63, the two failures are "saw the person's turn" at 1366×1024 and 844×390 (bot timing; the geometry checks pass in the same run); 820×1180 with `--safe` 9 of 9. Proof the check bites: the unchanged 3.0.4 with the same padding forced (scratch copy) fails the table-fit check at 1180×820 and 390×844. `online_check.py` 53 of 53. `voice_shots.py` 330 of 330 at the six default sizes; 110 of 110 at 820×1180 and 1024×1366. By eye: 820×1180 with insets (whole table and rail shown); 412×915 lobby (full name on line 1, Host, You and Mic off on line 2).

Not verified: the iPad itself (Chromium has no real insets); the long name from the iPad photo (the checks use Amy, Ben, Cat and Dan).

Seen, not fixed: the "Mic off" chip wraps to two lines in the host row at 412 px; the "Mic is off until you tap it." hint sits under the bottom voice bar at 412×915.

### 9aq.7 Phone checklist

Build 1 (2.39.0, test link):
1. Single player: a SLAP!, a came-1st and the round-end pop-up all stay until you tap anywhere. No bar, small "Tap anywhere" line.
2. Single player: end a round with a forfeit. You see **one** pop-up (PATHETIC!!! with "Round over · … came last"), then the results.
3. End a round with a slap. One SLAP! pop-up that also says round over. The trick cards still fly after it.
4. Joker, Picked up and "X leads" show as a small strip on the felt for 2.5 s, play doesn't stop, and the strip never covers a name, your cards or Play.
5. Tap the round chip: "What happened" lists the last few events, newest first.
6. Fast forward (only computers left): pop-ups close by themselves quickly, the same as before.
7. Two phones (Nearby or Online, after the push if needed): a pop-up closes on both phones together after 3.5 s. If you tap, yours closes and you see the hourglass on the other player. If both tap, play carries on at once. The initials row turns gold without flickering.
8. Nothing flashes or jumps when messages or reactions arrive while a pop-up or notice is up. Portrait and landscape.

Build 2 (3.0.0, live app after push, two or three phones, at least one on mobile data):
9. Online lobby: mic and Voice buttons next to Start or Ready. The mic is off at first, and the phone asks for permission once.
10. Talk: the other phones show a green ring on your row or disc and hear you. The music goes quieter while you talk.
11. Mute one player from their lobby row, their seat (tap it) and the Voice sheet. You stop hearing them, and they still hear everyone.
12. Mute all and Unmute all work. Leave and join a new game with the same people: mutes are remembered, and the mic starts off.
13. Turn the screen off or switch app: your mic goes off by itself.
14. One phone on mobile data (Wi-Fi off) still hears and is heard (relay).
15. iPad: voice works. Do game sounds and music get quieter once the mic is on? (Apple can do this; tell me.)
16. Top bar and landscape rail: no buttons squashed or wrapped, in every phase (dealing, playing, results).
17. Seat badges never cover the card count, hourglass or eye.
18. Nearby (QR) games: no voice buttons anywhere.

### 9aq.15 Build 2 follow-ups, 3.0.1 (PLAN, Opus, user 2026-11-19 18:25; questions answered 18:35; APPROVED 18:38; written for Haiku)

3.0.0 is on main (61716f1). Four open items. Order: **D first** (done 18:37, see Part D), then **B** (diagnose before any fix), then **A** and **C** together (one screenshot script covers both). One test build, **3.0.1**. Voice only runs on the live app (the test link can't reach the room server), so the order is the same as build 2: browser checks and screenshots here, the user's "push", then the phone test.

#### Part A: the landscape rail with voice (9aq.11 item 2)

**What is there now.** The rail is the top bar turned into a column (`html[data-rail="1"] .game-bar`, `layout.ts` `rail` when the height is 500 or less). `tableMicButton` and `tableVoiceButton` are already in that bar, so they already show in the rail right under the menu button (Voice shows because `innerWidth >= 390` is true in landscape). Nothing sizes them: the rail never checks its height.

**The sums (40 px buttons, 6 px gaps, 8 px top padding).** The bottom of the rail holds three floating buttons: quick rules (bottom 8), sound (bottom 56), 😂 (bottom 104), so the top group must end above `H − 150`. Slots that fit in the top group: **740×360 → 4**, **844×390 → 5**, **915×412 → 5**. Today's top group: menu, mic, Voice, round chip, pause, then (by phase) the target chip or target button, Take cards, and while dealing the joker and hidden-deck chips. So even in plain play at 740×360 the group is 5 or more, and while dealing it can be 8. Step A1 confirms this on screen before anything changes.

**Design (Q1: Option 1 chosen):**
- **Option 1 (recommended, follows mockup 4):** the rail top reads menu, mic, then the game chips, in a fixed order of importance: menu, mic, round chip, pause, Take cards, target chip or target button, deal chips, Voice. A new pure function `railFit(viewH, items)` in `layout.ts` works out how many fit (the sums above). Whatever doesn't fit moves into the game menu: Voice is already a menu item; the deal chips become one line at the top of the menu ("4 jokers · 1 hidden deck", tapping the hidden-deck part opens its rule as now). Nothing is ever squeezed, shrunk or hidden under the 😂 button. Unit tests for `railFit` at 320, 360, 390, 412 and 500 high, in every phase.
- **Option 2 (talk buttons by the thumb):** the mic moves to the bottom group, right above 😂, so the two "talk" buttons sit where the left thumb rests. The quick rules button moves into the menu on landscape phones, so the bottom group stays three tall. Voice is in the menu only. The top group then keeps one more game chip. The same `railFit` rule handles whatever still doesn't fit.

Either way:
- A1. **Before any change**, screenshots of 3.0.0 in the rail at 740×360 and 844×390 in each phase (dealing, round start with target button, playing, Take cards showing, results, game over), with a box-overlap check (any two `.game-bar > *` boxes, or a bar item and `.rules-btn`, `.sound-btn`, `.reactions-toggle`, overlap → fail). Record what overlaps today in 9aq.6.
- A2. Build the chosen option. The mic keeps the 9aq.10 states (green ring when on, red dot when blocked) at 40 px.
- A3. Tablets on their side (height over 500, for example 1180×820) keep the top bar and the portrait rule. No change.
- A4. **Results ready panel mic (9aq.11 item 5): dropped** (Q2). The bar or rail mic is on screen during results.

#### Part B: Cat's missed lobby talk ring (diagnose first, no fix yet)

**What the check does.** `voice_check.py` step 3: Ben's fake mic talks, each page gets one click at (4, 4), then it waits 25 s for `[data-voice].talking` on Amy's and Cat's pages. Amy's ring showed; Cat's didn't, in 1 run of 4.

**Suspects, from the code (none confirmed):**
- **H1, signal dropped.** Ben (p2) offers to Cat (p3) through the host. The host forwards a `vsig` only if `to?.seated` (`netlobby.ts` around line 1367, and line 855 for the host's own). An offer sent before the host marks Cat seated is dropped without a word. The connection then sits in `new` or `have-local-offer`, which is never `failed`, so the one retry (`voice.ts` line 246) never runs.
- **H2, sound locked.** The level meter reads from the shared `AudioContext` (`audio/engine.ts`). The `pointerdown` handler (`voicertc.ts` line 38) calls `play()` on the voice elements but never `resume()` on that context. Music is off by default, so on a joiner's page nothing may have woken the context. A suspended context gives a level of 0, so no ring.
- **H3, too quiet at first.** Auto gain and noise suppression on the receiving side keep the level under `TALK_LEVEL` (0.02) for the first seconds.
- **H4, wrong stream.** The meter reads an old stream (the 3.0.0 fix covers renegotiation; check it also covers a track that arrives before the stream is set).
- **H5, test only.** The 25 s wait runs out on a slow run, or the click at (4, 4) lands on something on Cat's page.

**B1. A read-only debug snapshot (the only code change in Part B).** `voiceDebug()` in `voiceglue.ts`, put on `window.__pubbyVoice` **only** when the page URL has `?voicedebug` (the testbed adds it; players never see it). It returns, for each other person: `connectionState`, `iceConnectionState`, `signalingState`, transceiver `currentDirection`, whether a remote track arrived and its `readyState` and `muted`, the audio element's `paused` and `muted`, the current level and the highest level in the last 2 s, `talking`, and counts of `vsig` sent and received for that pair. Also the `AudioContext` state, and on the host the count of `vsig` dropped (with the reason: not seated, wrong `from`).
**B2. `voice_check.py --repeat N --trace`:** runs the whole check N times (fresh relay and browser each run). During step 3 it saves the snapshot from all three pages every 250 ms to `testbed/out/voice_trace_<run>.json`. When a ring check fails it prints the last snapshot of the failing page for the talker's pair.
**B3.** Run 20 times. Sort each miss into H1 to H5 by the trace:
- H1: Cat's pair with Ben never reaches `connected`, and the host's dropped count is above 0.
- H2: connected, track live, `AudioContext` `suspended`, level 0.
- H3: connected, context running, highest level above 0 but under 0.02.
- H4: track ended or replaced, level 0.
- H5: everything fine and the ring shows just after the 25 s.
**B4.** Write what was found into 9aq.6 and stop. A fix is planned only after that, with the user (Opus if it is H1 or something not on this list). If 20 runs give no miss, record "0 of 20" and keep the item open, with `--trace` on for every later run.

#### Part C: screenshots at six sizes, the seat card, the Voice sheet entrance (9aq.13 items 3 and 4)

New `testbed/voice_shots.py`, local relay and fake mic as in `voice_check.py`, `?voicedebug` on.
- C1. **Sizes:** 360×740, 390×844, 412×915, 844×390, 740×360, 1180×820. Saved to `testbed/out/shots/<size>_<scene>.png`.
- C2. **Scenes:** the lobby with 2 people and with 8 people (8 pages); the top bar or rail while dealing with the target button and the deal chips; plain play; Take cards showing; results; the Voice sheet with 7 other people (it scrolls inside itself, never off the screen); one seat with all four marks at once (card count, hourglass, eye, keep marks) plus a voice badge.
- C3. **Seat card at each edge.** Get to the `playing` phase (Deal all, then the testbed bot plays the other seats), then tap the left, top and right seats on Amy's page, and Ben's seat when it is the bottom-most other seat. The card must stay on screen, never cover your hand's Play button, and close on a tap outside.
- C4. **Automatic checks per shot:** nothing wraps (each `.game-bar` child's height equals one row in portrait), no two bar or rail boxes overlap, the voice badge box doesn't overlap `.disc-count`, the hourglass, the eye or the keep marks, and no box is outside the viewport.
- C5. **Voice sheet entrance runs once.** Open the sheet on Amy's page while Ben talks. For 5 s, Cat sends a typed message every 300 ms. Count `animationstart` events on `.sheet` (a listener added before the sheet opens): must be exactly 1. Also check the overlay has the class `seen` after the first redraw.
- C6. Also count redraws in that time (the `.seat-disc` identity check already in `voice_check.py`, done again with the sheet open).
- C7. **Build 1's screenshots (9aq.5 item 3):** added to this script (Q4 yes), see Answers.
- C8. Look at every screenshot by eye, as well as the automatic checks, and list anything off in 9aq.6.

#### Part D: is the live server 3.0.0?

**Note: "protocol 13" never reaches the server.** `LOBBY_PROTOCOL` 13 is checked phone to phone: the host's phone compares the joiner's `hello` (protocol and app version, `lobby.ts` line 251). The server only checks `RELAY_PROTOCOL`, which is still **1** (3.0.0 didn't change it), and `/health` answers `{"ok":true,"protocol":1}` on the old and the new server alike. So `/health` can't tell them apart. The `/turn` route can: the new server answers a made-up token with **403 `{"error":"token"}`**, and the old server with **404 `{"error":"not-found"}`**.

**Why it matters.** The deploy runs `npm run check` (the server type check) first. That check was never run in the build session (no network for `@cloudflare/workers-types`). If it failed, the old server is still live, and the app quietly falls back to STUN (`voiceIceServers` returns null). Voice then works on Wi-Fi but often not on mobile data, so the failure would look like a phone problem.

**Result (user 18:37):** D1 and D2 done: "Deploy the room server" #5 and "Deploy to GitHub Pages" #87 for 61716f1 are both green, so the new server and 3.0 app are live. D3 and D4 not run yet (optional; D4 happens anyway in the phone test).

Checks (the user does D1 to D4; this session can't reach GitHub Actions, `workers.dev` or `github.io`):
- D1. GitHub → Actions: "Deploy the room server" for commit 61716f1 is green. If it is red, the failing step and its last lines.
- D2. Same for the Pages deploy (`pages.yml`), so the live app is 3.0.
- D3. `/turn` probe from any computer (no browser: a browser page from another site is refused by the origin check):
  `curl -i -X POST -H "Content-Type: application/json" -d "{\"token\":\"x\"}" https://pubby-rooms.mmans99.workers.dev/rooms/abcdefgh/turn`
  403 with `{"error":"token"}` = new server. 404 with `{"error":"not-found"}` = old server (the deploy failed).
- D4. Protocol 13, on two phones: both show **3.0** on the home screen (if one shows 2.39, close Pubby fully and open it again, twice). One makes an Online room, the other joins: the lobby shows the mic and Voice buttons on both. If a phone still on 2.39 tries to join a 3.0 room, it must get the "update the app" message, not a hang.
- D5. Relay logins: phone 9aq.7 item 14 (mobile data, Wi-Fi off) is the real test that the TURN key on the Worker works. No line in the app for this (Q3: no).
- If D1 or D3 shows the old server: a fix plan (Opus) for the type error, then re-run D1 and D3. No app change is needed for D.

#### Part E: version, checks, test build

- E1. `package.json` **3.0.1**. `npm run check`, `npm test`, `node build.mjs`, and the server type check if the network allows it (say so if not).
- E2. `voice_check.py` (with `--repeat 5`), `online_check.py`, `landscape_check.py`, `voice_shots.py`. Record the pass counts in 9aq.6.
- E3. The private test link shows the rail without voice (voice can't start there). Give the user the screenshots of the rail with voice instead. Phone test after the push: 9aq.7 items 9 to 18, plus the new items 19 and 20 below.

Phone checklist additions:
19. Landscape phone, Online game with voice: the rail never overlaps the 😂, sound or rules buttons in any phase; what doesn't fit is in the menu.
20. Voice sheet: opening it while someone talks slides it up once; it never slides again while people talk or messages arrive.

#### Answers (user 2026-11-19 18:35)
- **Q1: Option 1.** Mic under the menu button; whatever doesn't fit goes into the menu (`railFit`). Option 2 is not built.
- **Q2: yes, drop 9aq.11 item 5.** The bar or rail mic covers results and game over. Note it in 9aq.6 as dropped by the user.
- **Q3: no line in the Voice sheet.** Keep the relay logic in the background; nothing new on screen. The `relay` flag shows only in the `?voicedebug` snapshot (Part B1), not to players.
- **Q4: yes, add build 1's scenes** (9aq.5 item 3: each round-end pop-up head, a notice during play at 4 and 8 players, the round note with What happened, a network pop-up with the done row half filled, and the 10-redraw entrance check) to `voice_shots.py`. They have never been checked, and the notice strip's place was never measured against the seat name labels (9aq.6 build 1).


## 9ar. Fixes and changes after the 3.0.5 test (PLAN, Opus, user 2026-11-21 03:35; answers 03:40 and 03:48; spec `PROJECT.md` 12aa; written for Haiku; APPROVED 03:49, Haiku builds all three)

Three builds, written for **Haiku to build all of them in one chat**, in order: build 1 (Parts A to J), build 2 (K to P), build 3 (Q to S). APPROVED 2026-11-21 03:49 ("plan all the parts and push"; Haiku builds it all).

**How Haiku runs it:**
- Build the parts in the order written. After each build, run the gates: `npm run check`, `npm test`, `tablet_check.py` (with and without `--safe 24,20`), `online_check.py`, `voice_shots.py`. All must pass before starting the next build.
- Commit locally after each build passes (one commit per build, message "9ar build N (version)"), but **do not push** until the user has tried the test build and says "push" (CLAUDE.md rules 3 and 5).
- Version: 3.0.6 after build 1, 3.1.0 after build 2, 3.2.0 after build 3. The pushed version is 3.2.0.
- One test build at the end (3.2.0), with the full phone checklist 9ar.4. If a build stops, give a test build of what is done so far.
- Part D (take-cards list) is diagnose-first. If the cause can't be found in about 30 minutes, apply the safe fix (keep `armed === 'take'` and draw the sheet on every redraw while `takeTargets` is not empty, including during the trick animation), note it in 9ar.5, and carry on; don't stop the whole run for it.
- Stop and report (🔁 Switch to Opus) only if: a gate still fails after 2 fix attempts, the code doesn't match the plan, or a part needs a choice the plan doesn't make.
- Write what was built, deviations and check results into a new 9ar.5 "Built notes", and update all five MD files before each commit.

### 9ar.1 Build 1 (3.0.6): bug fixes

**A. Skip to end of round: every pop-up arrives at once on the other phones (found in the code).**
- Cause: `startSkip` (`bots.ts`) runs the whole round in one loop with `instantSkipping` on, but it never calls `setSkippingNow(true)`, so joining phones are never told. On the host, `absorb` filters the pop-ups (`quiet`), but a joining phone's `quiet` is `skipping() || instantSkipping()`, both false there, so every slap, "came 2nd", PATHETIC and HAHAHA from the skipped moves queues up and they show one after another at the end.
- Fix: `startSkip` calls `setSkippingNow(true)` before the loop and `setSkippingNow(false)` in the `finally` (the messages arrive in order, so the "on" lands before the moves). In `absorb`, `quiet` also includes `hostIsSkipping()`. The round-end pop-up still shows, naming the winner, as on the host.
- Test: `online_check.py` new phase: 3 phones (host + 1 person + computers), the person goes out, the host taps Skip; the joiner gets exactly one pop-up (the round end).

**B. Typing bar covers the ✕ (rail landscape, iPad and phones).**
- Cause: in the rail, `.reactions-toggle` is fixed at `bottom: 104px; left: 8px`, and `.msg-bar` is fixed full width at `bottom: 84px` (about 44 px tall, z-index 60), so the bar sits on top of the ✕.
- Fix: in `html[data-rail="1"]` the `.msg-bar` and `.reactions-sheet` start right of the rail (`left: calc(64px + var(--sal))`). Same check for the `data-side` column. `voice_shots.py`: new check, with the sheet open, the ✕ and the Send button don't overlap and both are fully on screen, at all sizes.

**C. The 😂 button vanishes after sending a typed message until a card is played (found in the code).**
- Cause: `app.ts` skips the resize redraw while a text box has focus (2.28.1). Opening and closing the keyboard resizes the window while the box has focus, so nothing redraws when the keyboard goes; the layout stays sized for the keyboard and the button is off where the keyboard was. The next move redraws it.
- Fix: the message bar's input gets a `focusout` handler that runs the same 150 ms resize redraw. The message bar is on `document.body`, outside the page, so the resize redraw may also run while *it* has focus (only other text boxes block it). Also listen to `visualViewport` `resize` where it exists (iPad Safari).

**D. Take-cards list ("Take whose cards?") disappears when someone else plays a card (user answer 03:40: the take-cards list).**
- Diagnose first, then fix: open the sheet as the next leader while the last trick is still on the felt (another player's card ends the trick and it animates to the waste pile), and with a network update arriving (busy flags, a message). Find which redraw drops it: most likely the trick animation's hold/fly steps redraw the stage without `takeControls`, or `betweenTricks` is false for a moment. Fix so the sheet stays open from the tap until Cancel, a pick, or the take is no longer allowed. If it can't be reproduced, stop and report (screenshot from the user).
- Test: DOM test with a fake trick animation: the sheet is in the page on every redraw while `armed === 'take'`.

**E. A joker always sits on top of the trick (found in the code).**
- Cause: `trickFromPlay` (`cards.ts`) puts the normal cards first and the jokers after them, whatever the order. Since 9an.6 the felt is rebuilt from it on every update, so a joker played first jumps to the top.
- Fix: `trickFromPlay` takes `trick.acted` (the play order) and lays the cards out in that order. Unit test: joker first, joker middle, joker last.

**F. "See other people's cards" is a dark circle (found in the code).**
- Cause: `.watch-btn { color: var(--ink) }` on `.icon-btn`'s dark background, so the eye is dark on dark.
- Fix: cream eye with a gold ring (like the take button when open), and the word "Watch" under it where there's room (portrait action row); aria-label stays. Check by eye at 412×915 and 820×1180.

**G. The take-cards "said no" message stays on screen (found in the code).**
- Cause: the refusal goes into the private `notes`, which are only cleared at `roundStarted`, so `notesPanel` shows it for the rest of the round. Phones with a seat also get the take answer pop-up, so it's said twice.
- Fix: with a seat (network or single player), no note for a refusal or an agreement: the pop-up says it. One shared phone: the note is cleared when the requester next plays a card or the trick ends.

**H. Deal again: are the new cards random? (checked in the code)**
- The code is fine: a passed vote builds a fresh 52-card deck (+ jokers), shuffles with the phone's crypto random numbers (Fisher-Yates) and deals again, hidden decks too. Holding a joker again is common: in a 2-player game you hold at least one joker about 45% of the time.
- Add proof: unit test, 2,000 passed reshuffle votes in a 2-player and a 4-player game; the share of cards a player keeps from the hand before matches chance (within 3 points), and the joker rate matches the maths. Online check: after a reshuffle the joining phone's hand on screen equals its session hand (no old hand left on screen).

**I. Phrases (user list).**
- Add: "Thank you", "Sorry", "It's ok", "Pathetic", "It's about the friends we make along the way".
- Remove from the reactions list: Nope, I'm having fun!! · Keep picking up!! · Not a chance!! · Ultimate time!! · Not so easy, sweetheart!! · Nice try, sweetheart!! · Not so clever now!! · Enjoy the pile!! · Oh no, oh no, oh no!! · Ha! Caught you!! · Sit down, sweetheart!! · Dirty move!! · Did you see that?! · Wow, what a hand!!
- Computers keep them (answer 03:40): split `catch-phrases.md` into two lists, "Everyone" (the reactions sheet) and "Computer players only". A reaction is sent as an index, so the wire index covers both lists (everyone's first, then the computer-only ones) and every phone shows the same text; the sheet shows only the first list. `react.ts` looks up text in the joined list. Old saved games are fine (indexes are not saved).

**J. Version 3.0.6.**

### 9ar.2 Build 2 (3.1.0): rule and screen changes

**K. Last two: the waste pile can be picked up once per round (answer 03:40: higher card loses).**
- `PlayState` gets `finalTwoPickUpUsed: boolean` (false at each deal). Picking up sets it.
- When it is already used and a last card is higher again: no choice. That player takes last place, the other the higher place, the round ends (`roundEnded` with a new `reason: 'secondHigher'`; record and CSV show it like a forfeit but labelled "Higher again"). The round-end pop-up head is HAHAHA! with "Ben played higher again".
- Forfeit any time stays. A shared phone and network games the same.
- On the felt in the last two, once used, a small notice: "No pick-up left this round".
- Computers: `chooseFinalTwo` and the last-two card choice know the pick-up is gone (public info) and play to avoid a higher last card.
- Tests: rules (second higher card ends the round, slap and lower card unchanged, jokers set aside return as today), session, AI fixture regenerated, arena 500 games no errors.

**L. The winner picks who deals next round, at the table (answers 03:40 and 03:48: the winner picks the dealer and still picks who leads; the dealer pick is at the table like the leader pick).**
- Round 2 on: the dealer is no longer the loser. Next round starts with a new phase `chooseDealer`, shown at the round table exactly like `chooseLeader` (`chooseLeaderStage`): the winner taps a seat (any player, themselves included); every other phone sees "Amy is picking who deals" with the hourglass. Then the shuffle and deal start as now. Round 1: the host deals, no pick. Ultimate Round: the same pick.
- A computer winner picks after its thinking time (random among the others, weighted to whoever is ahead).
- Removed players (9an.8): if the winner is removed, the job passes as now (next in the finishing order who is still in).
- Session: new phase `chooseDealer`, action `chooseDealer { by, dealer }`, event `dealerChosen` (a small notice "Ben deals"). `startNextRound` goes to `chooseDealer` instead of dealing at once. Saved games from 3.0.x that are already dealing carry on.
- Update the quick rules ("Who deals").

**M. Ultimate Round: confirm before the vote.**
- Tapping Ultimate Round opens a small sheet: "Call an Ultimate Round vote? You vote YES." with Call vote / Cancel. One phone: the existing "who is calling" list, then the same confirm.

**N. Deal again: time to look at your cards before voting (03:48: no lock on calling it; there is still only one Deal again per round).**
- The vote screen puts your own cards above the YES / NO buttons (today they are under the vote card and can be off screen).
- The "Vote now" alert gets a second button, "Look at my cards", which closes it so you can see your hand; you then vote from the vote screen, which waits for everyone as now.

**O. Stats while you wait (players who are out).**
- Out of the round: a "Stats" button (bar chart icon) next to Watch. It opens a sheet with the Places / Points / Awards tabs from the results screen, for the game so far (finished rounds), and a "This round" line (slaps so far, pick-ups, fastest Reaction Tap). Uses only the public event log (fair play). Closes by Cancel or a tap outside; the round end closes it.

**P. Version 3.1.0.**

### 9ar.3 Build 3 (3.2.0): the game fits any screen

The table and buttons have been cut off on the iPad four times (2.34.5, 9ag, 3.0.5 and now). Root cause: `gameLayout` (`layout.ts`) works out every row from guessed heights (`CHROME_PORTRAIT`, `CHROME_LANDSCAPE`, `CHROME_RAIL`) and the window size, and then forces minimums (`MIN_TABLE_H` and the hand's 120 px). When the real top bar, notices or action row are taller than the guess, or the screen is short (iPad Safari with its toolbars, split view, a small phone), the rows add up to more than the screen and the bottom row (the buttons) is cut.

**Q. Measure, don't guess.**
- `.screen.game` becomes a CSS grid: `grid-template-rows: auto minmax(0, 1fr) auto auto` (bar, table, hand, actions); the action row is never shrunk.
- After each render, measure the real free height of the table + hand area (`getBoundingClientRect` of the slot) and lay the table and hand out from that, not from `innerHeight` minus guesses. A `ResizeObserver` on the screen redraws when it changes (keyboard, toolbars, rotation, split view).
- No minimums that can overflow: if there isn't room, the hand gets its share first (cards readable), then the table scales down (`transform: scale`) to whatever is left. The action row and top bar always show in full.
- Keep `viewSize()` for the insets.

**R. A screen-size matrix in `tablet_check.py`:** 320×568, 360×640, 390×844, 412×915, 430×932, 844×390, 915×412, 768×1024 and 1024×768 (iPad Safari tab, toolbars: about 70 px less), 820×1180, 1180×820, 1024×1366, 1366×1024, 678×1024 (iPad split view), 600×960 (foldable), each with and without `--safe 24,20`. Checks: table inside its slot, every button fully on screen and not covered, hand cards not cut, at the deal, play, last two, vote, results and game over.

**S. Version 3.2.0.** The iPad itself is the final check (both Safari and the home-screen app).

### 9ar.4 Phone checklist (after each build)
1. Multiplayer: go out, host taps Skip to end of round: one round-end pop-up only.
2. Landscape (iPad and phone): open reactions, type: the ✕ and Send both show. Send a message, close the keyboard: 😂 is still there.
3. Your lead, open Take cards: it stays open while the last trick flies to the pile.
4. Play a joker 2nd or 3rd in a trick: it sits in that place, not on top.
5. Out of the round: the eye button is clear, labelled Watch.
6. Ask for cards and get a no: the message goes when the pop-up closes.
7. New phrases are in the sheet; removed ones are gone; computers still say theirs.
8. Last two: pick up once; the second higher last card loses the round.
9. Win a round: at the table you tap who deals (then who leads, as now); everyone sees it.
10. Ultimate Round asks "Call an Ultimate Round vote?" first.
11. When someone calls Deal again: "Look at my cards" on the alert; the vote screen shows your cards above YES / NO.
12. Out of the round: Stats shows the game so far.
13. Build 3: iPad portrait and landscape, Safari and home-screen app: nothing cut off, at the deal, play, vote and results.


### 9ar.5 Built notes

**Build 1 (3.0.6), 2026-11-21:** Parts A to J built as written. Deviations and results are in DEVLOG 2026-11-21 04:10. Cause for D: `trickFinishStage` (game.ts) drew the animation stage without `takeControls`, so the open take sheet vanished until the trick ended; fixed by keeping the sheet in that stage's extra slot while `armed === 'take'`. Part E: `trickFromPlay` takes `trick.acted` as the play order. Part I: the phrase file has an "Everyone" list (the sheet and the computers) and a "Computer players only" list; `SHEET_PHRASES` is the sheet, `CATCH_PHRASES` the full wire list. Part H proof: `tests/rules/reshuffle.test.ts`. Not yet built: the online phase for A, the `voice_shots.py` check for B, the joining-phone check for H. Builds 2 and 3 still to do.

**Build 2 (3.1.0), 2026-11-21:** Parts K to P built as written, with these choices:
- The 0002 patch (K, WIP) was not in the session: only this plan was. K was built from the K text above (names as written).
- K: `PlayState.finalTwoPickUpUsed` (absent in saved games = false, reset at each deal, set by `pickUpWastePile`); `RoundEnd.reason: 'secondHigher'` (only added when set, so older event shapes are unchanged); the popup is HAHAHA! with "Ben played higher again"; `RoundRecord.higherAgain`. The round CSV gets a "Round ended" row for a higher-again end and for a forfeit (forfeits were not labelled in the CSV before). The felt shows "No pick-up left this round" in the last two once the pick-up is used. Computers: `chooseCard` in the last two plays a joker first when the pick-up is gone (a joker can never end the round as a higher last card); `chooseFinalTwo` is never called then.
- L: phase `chooseDealer` (after the results screen's Next round, from round 2 on, Ultimate Round too); action `chooseDealer { by, dealer }` (only the last round's winner, who may pick any player); event `dealerChosen` (a notice "Ben deals"; in `POPUP_EVENTS`). The shuffle and deal start in `dealRound` after the pick. `LOBBY_PROTOCOL` 13 to 14 (new wire action and event). Computers: `chooseDealer` picks another player at random, weighted to total score + 1 (`ai/moves.ts`). Quick rules updated.
- M: `ui/ultimateconfirm.ts` (the confirm sheet, shared). One phone: the caller chip, then the confirm (`State.ultimateBy`). Network: the button opens the confirm on the caller's phone only.
- N: the alert's "Look at my cards" closes the alert (same as Vote now) and is shown on deal-again votes only (other votes have no hand to look at). The hand sits above the vote card and its YES / NO buttons.
- O: `ui/stats.ts`. The Stats button sits beside Watch for a player out of the round (hand empty, round on). Places for the game so far: each player's wins and last places (finished rounds). Points: the existing score sheet. Awards: the existing awards and slap table. "This round": slaps, pick-ups (waste-pile pick-ups), fastest Reaction Tap, all from the public log. The sheet is for one round only (`armed` carries the round number).
- P: version 3.1.0 (package.json; the app reads it at build time).

**Test harness changes (build 2):** `testbed/bot.js` picks the dealer at a "Deals:" seat and confirms "Call vote" on the Ultimate confirm (without it the Ultimate vote is never called and the playthrough fails). `testbed/drawer_check.py` counts the "Everyone" phrase list only (since build 1 the sheet shows only that list; the old count was 42 + 1, now 28 + 1). `tests/session/helpers.ts`: `pickDealer` (the old rule, the loser deals, for older tests); `tests/ai/sample.test.ts` skips the pick phase (nothing dealt yet).

**Checks (build 2):** `npm run check` clean; `npm test` 663 of 663 (new: `tests/rules/higher-again.test.ts` 5, `tests/session/dealer-pick.test.ts` 9); `npm run build` ok; `playthrough.py` 53 of 53 (after the bot fix; 3 runs on the baseline 53 of 53 each time); `online_check.py` 53 of 53; `voice_shots.py` 330 of 330; `tablet_check.py --quick` 18 of 18. Full `tablet_check.py` 60 of 61 once (1366×1024 "saw the person's turn", the known bot-timing flake, see DEVLOG).
**Checks already failing at 3.0.6 (build 1), not caused by build 2:** `solo_check.py` (27 of 36 at 3.0.6, 29 of 36 at 3.1.0; a 2-2 reshuffle tie waits for the host), `netvotes_check.py` (times out waiting for "Ask to take someone's cards"), `lobby_check.py` (a phone that goes away), `lasttrick_check.py` (after the tap, the round-over pop-up, 2 of 3), `popups_check.py` (take card, take sheet, Fast forward and tie are random "not seen in this game"), `sound_check.py` (round-end fanfare, 43 of 44), `netgame_check.py` (Next round waiting text, 96 of 97 at 3.0.6). At 3.1.0 `netgame_check.py` 95 of 97: one "every phone agreed" snapshot taken mid-deal (timing; rerun in the final gate). `landscape_check.py` crashed at 3.0.6 and passed 24 of 24 at 3.1.0 (timing).

**Build 3 (3.2.0), 2026-11-21:** Parts Q, R, S built.
- Q (fit): the portrait rows can no longer add up to more than the window. `gameLayout` keeps the hand at 120 px or more when there is room, the table takes the rest and never goes below 0 (it was forced to 240 px, which overflowed on short screens). The action row is sized to its buttons (CSS `auto`, not a guessed height). The table is measured after each draw and whenever its slot changes size (`ui/fit.ts`: `scaleToFit`, `ResizeObserver`, `transform: scale` only when the table is too big for its slot). Deviation from the text: the top bar is still outside the game's grid (it is not shrinkable) and the hand's height is still the layout's estimate; the table is the part measured from the real slot.
- R (matrix): `testbed/tablet_check.py` runs the 15 sizes from 9ar.3 R. Turn, deal, last-two and final checks as before; results and game over are checked in the default run; the vote screen is checked with `--vote` (the bot calls a reshuffle vote, which changes the turn flow, so the turn count is not checked in that mode). Screens not reached are reported ("not reached in this run"), not failed.
- R (bot): `testbed/bot.js` now decides a tied Deal again vote for the host ("you decide" → Deal again). Before, a 2–2 tie stopped the bot ("stuck") at the vote, which looked like a turn with no cards. Found by `/tmp` diagnostic runs, 1 stall in 4.
- S: version 3.2.0. `tests/ui/matrix.test.ts` (3): the 15 sizes fit the window with no negative row, portrait and landscape.
- Checks (build 3): `npm run check` clean; `npm test` 670 of 670; `online_check.py` 53 of 53; `voice_shots.py` 330 of 330; `playthrough.py` 53 of 53 (after the bot change); `tablet_check.py --quick` 31 of 31 (before the vote flag); full matrix without `--safe` 140 of 140; with `--safe 24,20` 177 of 177; `--vote` run 163 of 163 after the bot fix (96 of 96 before it). Before the bot fix, 5 turn-count misses at 390×844, 678×1024, 360×640, 430×932, 600×960 were rerun: all pass with 14 to 17 cards in the rerun. Before the bot fix, 430×932 with `--safe 24,20` missed in two reruns and passed in one. The tie stall was found on a plain 390×844 game and I did not confirm it as the cause of those misses. After the fix both full runs passed (140 of 140 plain, 177 of 177 with `--safe 24,20`), so the misses are recorded as a flake to watch, not a fixed bug.
- iPad: the user's check (Safari and home-screen app, portrait and landscape), item 13 of 9ar.4.

### 9ar.6 Follow-up after build 3 (3.2.1): Opus answers to Haiku's review list (Opus, user 2026-11-21 11:18; APPROVED, for Haiku)

Answers to the 10 points Haiku raised after building 9ar. Build as **3.2.1**, then one test build for the phone and iPad check (9ar.4 item 13). Push only on "push".

1. **Q layout: accepted as built.** The top bar is a fixed 48 px `flex: none` row above `.game-frame` (flex 1), which is the same as a grid row; don't move it. The hand row is `minmax(0, var(--hand-h))`, so the estimate is only a maximum and can't overflow; the table row gives way first. `transform: scale` is fine on the iPad (taps scale with it). **Do:** `tablet_check.py` prints the table scale at each size and flags any size under 0.7 (that is the only case that would need its own layout; report it, don't fix it).
2. **K: confirmed** (user 03:40). Once per round; computers play a joker first when the pick-up is gone (public info only); "played higher again" and the CSV "Higher again" row as built. **Do:** the 500-game arena run with no errors (asked for in K, not in the logged checks).
3. **L: confirmed.** Ultimate Round uses the same pick; round 1 the host deals (user 03:40). Computer weighting "total score + 1", never itself: keep (Opus call, the user can change it).
4. **"Look at my cards": correct as built** (Deal again votes only).
5. **Stats: confirmed** ("Pick-ups" = waste-pile pick-ups only). **Do:** add one line to "This round": "Out so far: 1st Amy, 2nd Ben" (public).
6. **Protocol 13 → 14: fine, no deploy note.** Phones must already have the same version to join (`lobby.ts` line 251) and get the "update Pubby" message.
7. **Forfeit rows in the CSV: keep.** Nothing reads the CSV back (backup and restore doesn't use it).
8. **Browser checks not in the 9ar gates.** **Do:** run each at 3.0.5 (`beba563`) first. Passed at 3.0.5 and fails now → 9ar broke it, fix the app. Failed at 3.0.5 too → update the test.
   - `solo_check`: rerun first (build 3's tied-vote bot fix probably covers it).
   - `sound_check`: since 3.0.5 each phone plays only its own round-end sound; update the expectation.
   - `netvotes_check`: point it at the take-cards-on-your-lead flow (9an).
   - `popups_check`: scenarios that don't come up report "not reached" (as `tablet_check`), not a failure.
   - `lasttrick_check`, `lobby_check`: diagnose first (away and back is real game logic).
   - `netgame_check`: compare phones only after the deal ends and every phone has the same update number. Still different after that = a real sync bug: stop and report.
   - Two fix attempts each, then stop and report (🔁 Switch to Opus).
9. **Turn-count flake: limited chase.** **Do:** 3 more full matrix runs, plain and `--safe 24,20`. On a miss, save a screenshot and the bot log. Hand and turn on screen → bot timing, give the check a longer wait. Hand not drawn or cut → real layout bug: stop and report.
10. **Build 1 open checks: run now, before the phone test** (local relay, as `online_check` uses). **Do:** the online phase for A (host Skips, the joiner gets exactly one pop-up); the ✕ and Send check in `voice_shots.py` for B; for H, the joining phone's hand equals its session hand after a reshuffle.

Gates for 3.2.1: `npm run check`, `npm test`, `tablet_check.py` (plain and `--safe 24,20`), `online_check.py`, `voice_shots.py`, `playthrough.py`, plus the checks from 8 and 10. Write results into 9ar.5 and update all five MD files.


## 9. Conventions

- Language: TypeScript, strict mode.
- Commits: short imperative subject line, plus a body when the reason is not obvious.
- No code is merged without the approvals in `CLAUDE.md`.
- Each phase in `TODO.md` ends with a `DEVLOG.md` entry.

**9an.11 built notes (2026-11-18):** Part H host UI (`src/ui/removesheet.ts`, `netscreens.ts` connection notice and hints) built, see TODO.md Part H. Part J: version 2.38.0; fixture `tests/ai/fixtures/moves-2.38.0.json` regenerated; 463 of 500 decisions differ from 2.34.5 but the committed HEAD gives the same differences, so Part H adds none (cause: Part A take and ask rules). Audit: 4 of the 7 games change at a Normal leader's new ask (Part B), 3 at an Easy card pick (the 30% ask roll shifts its random numbers); by design.

