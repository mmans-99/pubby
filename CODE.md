# CODE.md — Technical plan for Pubby

**Status:** Proposal only. Nothing here is built or approved yet. Items marked **DECIDE** need the user's choice.

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

## 3. Proposed stack (DECIDE)

| Option | Pros | Cons |
|---|---|---|
| **A. Vanilla TypeScript + Vite, no framework** (recommended) | Small, fast, easy to keep offline, no framework lock-in | More manual UI work |
| B. React + Vite | Familiar component model, lots of tooling | Heavier bundle, more to keep offline |
| C. Svelte + Vite | Small bundle, nice animations for popups | Less familiar, smaller ecosystem |

Recommended: **A**. It suits a small phone-first game and keeps the offline build simple.

Other choices:
- **Offline:** Service worker (via Workbox or a hand-written one) to cache the app shell.
- **Tests:** Vitest for the rules engine.
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

## 6. Data model (draft)

- `Player`: `id`, `profileName`, `sessionName`, `hand`, `status` (`active` / `out`), `missingSuits`.
- `Game`: `players`, `turnOrder`, `leader`, `currentTrick`, `wastePile`, `hiddenDecks`, `jokersInPlay`, `round`, `scores`, `target`, `ultimateRound`, `pendingRequests`, `phase` (`setup` / `reshuffleVote` / `swap` / `missingSuit` / `playing` / `roundEnd` / `paused` / `gameOver`), `paused`, `gameStarted` (locks the reshuffle vote once true).
- `Action` (examples): `chooseLeader` (round winner), `setDealMode` (auto / manual, switchable any time), `autoDealStart`, `manualDealCard`, `switchToManual` (during auto-deal animation), `readyUp` (results screen), `advanceFromResults` (host only), `voteReshuffle`, `playCard`, `slap` (off-suit play), `playJoker`, `declareMissingSuit`, `reactionTap` (mini-game), `swapHidden` (choose up to 4 cards, possibly zero), `forfeit`, `requestPause`, `respondPause`, `pause` (host only), `resume` (host only), `setPauseTimeLimit` (host only, optional), `voteTarget`, `triggerUltimate` (any player, results screen), `voteUltimate`, `hostDecides` (used when a vote has no majority).
- `Game` also tracks `dealMode`, `dealDirection` (fixed to clockwise), `jokerRuleEnabled` (host setup option), `jokerTotal` (shown at game start), `ultimateTriggered`, `ultimateLabels` (`winner`, `loser`), `pauseTimeLimit` (optional).
- `Event` (examples): `trickResolved`, `slapped`, `playerOut`, `roundEnded`, `scoreUpdated`, `requestPending`, `gamePaused`, `gameResumed`.

Final field names are for the Phase 1 design review, not fixed yet.

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
- **Round-start order:** Tests that the reshuffle vote happens before every round, the hidden swap only in 2–3 player games and only in round 1, and that the reshuffle vote is locked once the round begins.
- **Ultimate Round:** Tests that any player can trigger it from a results screen only, that it is decided by majority vote, that it does not change scores, that the Ultimate Winner label outranks the highest score, and that the Ultimate Loser label ranks below every score.
- **Voting:** Tests that a majority passes, and that no majority hands the decision to the host.
- **Dealing:** Tests for auto deal (every card dealt, uneven hands allowed) and manual deal, and that the dealer can switch modes mid-deal.
- **Reaction Tap:** Tests that the slowest reactor leads, that a false start counts as the slowest time, and that tied slowest players replay until one is decided.
- **Forfeit:** Tests that a forfeit scores last place and gives the other player 1st.
- **Manual:** Pass-and-play playthroughs at 2, 3, 5, and 8 players before each release.

## 9. Conventions

- Language: TypeScript, strict mode.
- Commits: short imperative subject line, plus a body when the reason is not obvious.
- No code is merged without the approvals in `CLAUDE.md`.
- Each phase in `TODO.md` ends with a `DEVLOG.md` entry.
