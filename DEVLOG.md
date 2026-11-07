# DEVLOG — Pubby

Newest entries at the top. One entry per session, added before each commit.

---

## 2026-11-06 — New rule: test before commit

**Done**
- User asked for a playable test build before every commit and push, so they can test before approving. Added as `CLAUDE.md` rule 5 and to the session checklist (rules renumbered).
- `CODE.md` section 8a: how test builds work. A testbed page that runs the real rules engine until the Svelte UI exists, then the real app on GitHub Pages.
- `TODO.md`: added the testbed and a play-test of everything built so far. `PROJECT.md` status line notes that every change is play-tested before commit.

- Built the testbed (`testbed/`): a phone-friendly page that runs the real rules engine, bundled into one file with esbuild. All hands visible; hidden decks show only a count. Covers dealing (auto, manual, switching), reshuffle vote with the "Majority says / Host says" pop-up, hidden swap, missing suits and Reaction Tap, winner picks leader, trick play with illegal cards blocked, slaps, jokers, final-two pick-up or forfeit, round results and running totals, event log, seed for replays.
- Automated browser playthrough: 21 rounds across 2 to 8 players, jokers on and off, no errors.
- Published the testbed as a private link for the user.

- User tested the testbed: fine. Change: only one reshuffle vote per round (`PROJECT.md` 2a). Testbed updated and republished; checked in a headless browser that a second vote is not offered after a reshuffle.
- User asked whether the testbed is how the game will look. It is not: it is a rules test tool. The real table UI (Phase 2) is planned as a card-table layout with animations.

- User feedback on pop-ups, now in `PROJECT.md` (sections 4 and 4.1) and in the testbed: SLAP! made big with who slapped who underneath in a smaller font; a pop-up each time someone goes out, saying their place, with a place badge kept next to their name; one pop-up for the last two (second last, and the loser); the round's 1st place is "the winner", never "the Pubby". Pop-ups now queue, so none are lost when several happen at once.
- Testbed republished; browser playthrough of 21 rounds, 2 to 8 players, no errors.

**Next**
- User play-tests and reports anything wrong (with the seed).
- After approval: commit this session's changes, then build the session layer.

---

## 2026-11-06 — Round start and trick play

**Done**
- User decided: full deck every round; hidden decks set aside every round (swap still round 1 only); if the top card's player is out, the next highest card of the led suit leads; a joker led as the first card passes the lead to the next player clockwise.
- `src/rules/round.ts`: dealer by round, fresh shuffled deal (also used for a reshuffle), hidden swap, missing-suit players, Reaction Tap result, who leads.
- `src/rules/play.ts`: legal cards, follow suit, slaps, jokers, next leader, going out, round end and finishing order, with events for the UI and trivia.
- 43 tests passing; rules and tests pass a strict type check.
- `PROJECT.md`: new rules recorded; six open questions added (final-two rule, joker timing, edge cases). `CODE.md` module table and `TODO.md` updated. `CLAUDE.md` checked, no changes.

**Done (later in the session)**
- User answered all six open questions and changed the swap: it is now offered every round in 2 and 3 player games.
- Final-two rule built for all game sizes: a higher last card must pick up the waste pile (forfeit stays available) or forfeit; a lower last card, a joker, or a slap wins; both out in one trick: lower card, joker or slapper wins; both down to a single joker: shared second-last place points, and both Ultimate Loser in the Ultimate Round.
- A joker as your last card takes you out at that moment.
- `scoreRound` supports shared second-last place.
- 59 tests passing; strict type check clean.
- `PROJECT.md` sections 2, 3, 6, 7 and 9 updated; no open questions. Quick rules updated. `CODE.md`, `TODO.md` updated. `CLAUDE.md` checked, no changes.

**Next**
- The session layer: ties rounds, votes, pause, results, target score, Ultimate Round and the event log together.

---

## 2026-11-06 — Scaffold and first rules

**Done**
- User approved the scaffold and the start of Phase 1.
- User decided: one 52-card deck for every player count; Ace high; hidden decks are dealt first, automatically and face down, and the dealer deals only to players. Each hidden deck gets one player's share (from the earlier answer "deal them like a player").
- Scaffolded Svelte + Vite + TypeScript: `package.json`, `tsconfig.json`, `vite.config.ts`, `svelte.config.js`, `index.html`, `src/main.ts`, placeholder `src/ui/App.svelte`.
- Rules engine: `cards.ts`, `rng.ts`, `deal.ts`, `scoring.ts`, `voting.ts`, draft `types.ts`.
- Tests: 23 passing with Node's built-in test runner via `tsx`. Rules engine passes a strict type check.
- Updated `PROJECT.md` (deck, ranking, hidden-deck dealing), `CODE.md` (test runner, randomness, module table), `TODO.md`. `CLAUDE.md` checked, no changes.

**Done (later in the session)**
- Hidden decks are never shown on any screen, even during the deal. Only the swap option appears. (`PROJECT.md` sections 2b and 3, `CODE.md` section 5a.)
- Vote question answered: a majority of no fails; the host only decides on a tie or too few votes. Added the "Majority says… / Host says…" result pop-up. `PROJECT.md` has no open questions again.
- Added Quick rules (`PROJECT.md` section 13): any player can open it any time, on their own phone only, without affecting the game. Drafted the content in `src/content/quick-rules.md`.
- Added the matching Phase 1 and Phase 2 tasks to `TODO.md`. `CLAUDE.md` checked, no changes.
- User approved commit and push.

**Not done**
- `npm install` could not run here (no network for packages), so the Svelte build is untested. Rules tests ran with locally available tools.

**Next**
- Continue Phase 1: round start (who shuffles, deals, leads), trick play and slaps.

---

## 2026-11-06 — Stack chosen

**Done**
- GitHub repo `mmans-99/pubby` is live with the first commit.
- User chose the stack: **Svelte + Vite + TypeScript** (`CODE.md` section 3). Rules engine and session layer stay plain TypeScript; Svelte is the UI layer only.
- Tidied `TODO.md`: removed the duplicate open-questions line, marked the mini-game (Reaction Tap) and repo creation done, updated the Blocked list.
- Checked `CLAUDE.md` and `PROJECT.md`: no changes needed.

**Next**
- User picks the multiplayer path (`CODE.md` section 4).
- Ask for approval to scaffold the project and start Phase 1.

---

## 2026-11-06 — Plan approved, first commit

**Done**
- User approved the full plan in writing.
- Local git repo at `/home/claude/pubby` (branch `main`) committed with the five MD files.
- Could not create the GitHub repo from this session: the session is bound to its configured repositories, so the repo has to be attached (or created by the user) before pushing.

**Next**
- Attach or create `mmans-99/pubby`, then push `main`.

**Done (revision 11)**
- Stats export format confirmed: CSV only. No open questions remain in `PROJECT.md`.
- Added a proposed stats export: session stats from the results screen, and profile stats from the profile screen. Uses the phone's share sheet, works offline. Format is open (text, CSV, or JSON).
- Updated `PROJECT.md`, `CODE.md`, and `TODO.md`.
- Still waiting for explicit approval before creating the GitHub repo and pushing.

**Done (revision 10)**
- User decided: local profiles for v1. Accounts deferred.
- `PROJECT.md` now has no open questions. `TODO.md` marks the open-question step done.
- Waiting for the user's explicit approval of the full plan before creating the GitHub repo and pushing.

**Done (revision 9)**
- Profile history confirmed.
- Added per-player slap stats: "slapped by most" and "slapped most", shown per session on the results screen and overall on profiles.
- Explained accounts. Added `CODE.md` section 6b with three options. Recommended local profiles for v1, with hosted sign-in as a later option. Added a Phase 6 to `TODO.md`.
- Updated `PROJECT.md`, `CODE.md`, and `TODO.md`.

**Done (revision 8)**
- Confirmed: target fails → session ends, highest score wins. No target and no Ultimate → host ends from results screen, scores recorded from there.
- Dropped the host export. Each phone keeps its own game record.
- Confirmed: pending pause requests are cleared while paused.
- Confirmed: host phone holds all hands in memory (accepted for v1).
- Proposed profile history: each game is added to each player's profile on that phone (games, points, wins, Ultimate titles, bottom-two count, slaps given and received). Limit: profiles are per-phone, no accounts. Marked as open for confirmation.
- Updated `CODE.md` and `TODO.md`.

**Done (revision 7)**
- Votes only happen before a round (reshuffle) or on the results screen (target, Ultimate). No votes in progress during a pause.
- Results screen: no timer. Players can ready up. Host moves on.
- Catch-phrases are random.
- Ultimate Round is the final round and ends the session. Target score defined as the points goal agreed by vote.
- Trivia: removed "most jokers". Added "always fighting for survival" (most rounds in the bottom two). Rivals show all tied pairs.
- Host's phone: the screen never shows other hands, but the data is in memory, so it could be read technically. Documented in `PROJECT.md` and `CODE.md`.
- Host export is now an open question (each phone already keeps its own record).
- Updated `CODE.md` (actions, trivia events) and `TODO.md`.

**Done (revision 6)**
- Clarified pause requests (only pause requests and Ultimate Round triggers are requests). Added two proposed defaults to confirm: requests clear while paused, and votes freeze during a pause.
- Added the game record: saved when the session ends, with profile and session names, round results, totals, Ultimate Round labels, final standings, and trivia. Saved on each phone; host can export.
- Added the results screen trivia: most slapped, most slapper, rivals, plus optional fun stats for the user to pick.
- Slap emoji reduced to 😂 only. Added the catch-phrase "You got slapped by a kiiid".
- Explained the host trust issue: the host's phone must hold every hand to run the game. Updated `CODE.md`, section 5, to say so.
- Added `CODE.md` section 6a (game record and trivia from an event log), and new `TODO.md` tasks.

**Done (revision 5)**
- Removed peek and take-cards entirely. The only card exchange is the hidden swap.
- Ultimate Loser label now ranks below every score, as well as the Ultimate Winner label outranking scores.
- Auto deal is clockwise. The dealer can switch to manual during the animation; the stop option was dropped.
- Any player can call the reshuffle vote.
- Reaction Tap false start counts as the slowest time.
- Jokers are dealt from the player deck. Total joker count is shown at game start. Host can turn the joker rule off at setup.
- Order of reshuffle vote and hidden swap is fixed as stated, since the user said order doesn't matter.
- Updated `CODE.md` (actions, tests) and `TODO.md`.

**Done (revision 4)**
- Applied the user's answers to `PROJECT.md`:
  - Reshuffle: the dealer of that round reshuffles and redeals when it passes.
  - Ultimate Round: any player can trigger it; everyone votes; majority rules. Reaching the target score starts an Ultimate Round vote.
  - Labels: the Ultimate Winner label outweighs scores. The Ultimate Round itself adds no points.
  - Dealing: auto deal (first-name tap, animated, dealer can intervene) and manual deal, switchable at any time. Uneven hands are fine.
  - Jokers count as playing cards. Playing a last card, including a joker, means going out.
  - Hidden swap: players choose up to 4 of their own cards (or none), and receive random hidden cards. Given cards leave the game. Not a peek or take.
  - Pause: no time limit by default. The host can optionally set one.
  - Target score vote: majority rule.
  - Voting rule for all votes: majority, otherwise the host decides.
  - Reaction Tap: the slowest reactor leads. Ties replay between the tied players.
  - Forfeit: last place score.
- Peek and take-cards kept as separate mechanics from the original notes, with a question to confirm.
- Updated `CODE.md` (actions, tests) and `TODO.md`.

**Done (revision 3)**
- Applied the user's answers to `PROJECT.md`:
  - Round 1: host shuffles, deals, and leads. Claim buttons removed. Later rounds: loser shuffles and deals; winner picks the leader.
  - Missing-suit player leads regardless. Two or more missing-suit players: mini-game decides, loser leads.
  - Hidden swap: given-away cards leave the game entirely.
  - Reshuffle vote: all game sizes, before every round, majority vote, locked once the round begins.
  - Pause: players request, host approves.
  - Ultimate Round: requested on any results screen after a round, never mid-round; host approves.
  - Ace of Spades has no special rule. The leader plays any card.
  - Mini-game chosen: Reaction Tap.
- Updated `CODE.md` (actions, tests) and `TODO.md` to match.

**Done (revision 2)**
- Applied the user's corrections to `PROJECT.md`:
  - 2-player scoring keeps +2 / +1. 8-player 4th place is +1.
  - Joker count: 2 for 2–5 players, 3 for 6–8 players.
  - Final-two rule: the last card of a trick decides; the higher card picks up the waste pile or forfeits.
  - Ultimate Round is outside the score. It sets Ultimate Winner (1st) and Ultimate Loser (last) for bragging rights only.
  - Hidden swap happens once per game, before round 1, not every round. Up to 4 cards can be swapped; opt-out allowed.
  - Reshuffle vote added: once per game, after everyone looks at their cards, before round 1. Locked once round 1 starts.
  - Host can pause and resume; the pause freezes every phone.
  - Phones only for now.
- Rechecked the game-start rules against the user's notes. The shuffle/deal and go-first claims are separate, and the later-round rules match. Added the claim-tie case as an open question.
- Updated `CODE.md` (game phases, new actions, tests) and `TODO.md` (new tasks).

**Done (revision 1)**
- Captured the full game spec from the user's notes: setup, hidden decks for 2–3 players, slap mechanic, missing-suit declaration, final-two waste-pile rule, joker rule, peek and take-cards requests, scoring tables for 2–8 players, target score and Ultimate Round, and feedback (SLAP! pop-up, emojis, catch-phrases).
- Named the game **Pubby**.
- Set working rules in `CLAUDE.md`: plan first, no code without approval, commit and push only after approval, update all five MD files before each commit and push.
- Drafted `CODE.md` with architecture (pure rules engine, session layer, UI layer), stack options, multiplayer options (LAN host, WebRTC with QR handshake, pass-and-play first), and the hidden-information trust model.
- Listed 18 Open Questions in `PROJECT.md`, including several scoring and joker edge cases in the notes that need confirmation.

**Decisions**
- Multiplayer offline via local network with QR join (path to choose).
- Build pass-and-play before networking.

**Not done**
- No game code written.
- No GitHub repo created and nothing committed or pushed (waiting for approval).

**Next**
- User answers Open Questions and approves the plan.
