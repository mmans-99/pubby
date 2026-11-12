# DEVLOG — Pubby

Newest entries at the top. One entry per session, added before each commit.

---

## 2026-11-12 (evening, latest) — Phase 4b slice C built and pushed as 2.9.0: computer players' levels, names and icon

**Done**
- **User (19:42):** "Build slice c and then push it to the site once done." Read `CODE.md` 9m.1 to 9m.9, `PROJECT.md` 12c, and the code of slices A and B. Built slice C; checks pass; pushed to `main` as 2.9.0 on the user's instruction. The phone check of slice C is still to do (`CODE.md` 9m.9 checklist).
- **Setup screen (`src/ui/solosetup.ts`):** level chips All Easy, All Normal, Mixed (lit when the seats share a level, Mixed when they differ). Each computer player has a row: name field and a level chip (Easy or Normal) that changes just that player. "New names" re-rolls names and keeps levels. Adding a computer player gives a new name at Normal. Choosing or adding a profile re-rolls any computer player who has that name.
- **Name check (`botNamesProblem`, `src/ai/names.ts`):** refuses an empty name, more than 16 letters, or two players with the same name (ignoring case; the person's name included). Shown live under the list, and Start stays off until it is fixed.
- **Hard is not offered (deviation from the plan's chip list):** Hard is still the same as Normal (slice D adds search). So Mixed draws from Easy and Normal only (`MIXED_LEVELS`, `mixedLevel()` in `src/ai/persona.ts`). Slice D adds Hard to both.
- **Table:** a computer seat's name has a small computer icon in front (`table.ts`, `.seat-bot`).
- **Store:** `SoloSetup.bots` replaced by `SoloSetup.seats: SetupBot[]` (name and level for each computer player). Nothing else in the saved game format changed; the game still stores `bots.seats` with level and personality.
- **Reactions and speed:** already in the slice B setup; checked in the browser (reactions float from computer seats when on, none appear when off).
- **Version 2.9.0** (`package.json`, `CLAUDE.md` rule 8). Shown as 2.9 on the home screen and quick rules.
- **Docs:** `CODE.md` (9m header, 9m.7, slice C results, 9e version history), `PROJECT.md` 12c (status for levels and names), `TODO.md` (slice C tasks), this entry.

**Checks**
- `npm run check` clean; `npm test` 207 of 207 (4 new in `tests/ai/names.test.ts`).
- `testbed/solo_check.py --slice-c` 14 of 14: a clashing name blocks Start and Start comes back once fixed; an All Easy game with one player renamed (name and computer icon at the table, levels saved as Easy, reactions seen, game finished); a Mixed game with reactions off (levels saved as Easy or Normal, switch saved off, no reaction seen, game finished).
- `testbed/solo_check.py` slice B 18 of 18 (run after the setup change, all pass).
- `back_check.py` 14 of 14; `offline_check.py` 20 of 20; `testbed/ai_arena.ts --bars` all pass (Normal beats Easy by 0.536 against a bar of 0.15).
- Not rerun: `playthrough.py`, `sound_check.py`, `lobby_check.py`, `netgame_check.py`, `netvotes_check.py`. The only change they could touch is the computer icon at the table, which shows only for computer players.

**Environment notes (for later sessions)**
- The repo is cloned shallow to `/home/claude/pubby`. `npm install` is blocked here (no network), so `node_modules` is a symlink to `/opt/npm-tools/node_modules`, which has esbuild, tsx, typescript and `@types/node`. It is gitignored. `npm run build` and `npm run check` work through it.
- A first run of `solo_check.py` hit a race in the test's setup helper (it clicked a profile before the setup screen had drawn). Fixed in the helper; the app was fine.
- Test builds: `CLAUDE.md` rule 5 asks for the phone test before a commit. The user asked to push after building, so it was pushed on that instruction; the phone checklist is still open.

## 2026-11-12 (evening) — Phase 4b slice B built and pushed as 2.7.0: play against the computer on the phone

**Done**
- **User (19:32):** a slap that ends the game shows "Game over." under the SLAP! icon instead of "X picks up N cards and leads." (`src/ui/game.ts` popupsFor / popupLayer; `Popup` slap `over` flag in `store.ts`). Checks: `npm run check`, `npm test` 203 of 203, `solo_check.py` 18 of 18. Pushed as 2.8.0 on the user's request (19:40).
- **User (18:32):** "Build slice b". Read `CODE.md` 9m.5 to 9m.9 and `PROJECT.md` 12c; built slice B; test build ready; pushed on the user's request (19:17).
- Version 2.7.0 (`package.json`, `CLAUDE.md` rule 8).
- Built:
  - `src/ui/bots.ts`: the computer players' driver. Only `seenBy()` output reaches `decide()`; moves go through `runActions`; one move at a time; "thinking…" on the seat (`src/ui/thinking.ts`, `table.ts`); reactions with limits; memory rebuilt on Carry on.
  - Own-seat screens: `ownSeat`, `runsSession` and `isHostSeat` in `game.ts`. The network screens (`netscreens.ts`, `roundstart.ts`, `between.ts`) now use them, so one-phone and network games take the same paths as before.
  - `src/ui/solosetup.ts`: "Play against the computer" on the home screen. You, 1 to 7 computer players, Normal level only, speed, reactions, jokers, pause limit. Names are picked at random.
  - Stats: `pubby.profiles.vsComputer`. A vs-computer game goes only there. Profile details, the profile CSV and past games show it. Deleting a profile removes its vs-computer stats too.
  - Carry on ignores computer players (they have no profile on the phone).
- Deviations from `CODE.md` 9m, all recorded in 9m.9 "Slice B results": the speed and reactions switches are in B; the vs-computer totals are a block in the profile CSV; the driver runs from `afterRender` (`botsTick`), with no timer loop of its own.
- Checks:
  - `npm run check` clean.
  - `npm test` 203 of 203.
  - `testbed/solo_check.py` 18 of 18 (4 players, Fast speed): game plays to the end, bots play cards, "thinking…" seen, nothing refused, record saved as vs computer, normal profile untouched, pause stops the bots, Resume restarts them, reload then Carry on keeps them playing.
  - Existing browser checks, all pass: `playthrough.py` 53 of 53, `netgame_check.py` 94 of 94, `netvotes_check.py` 30 of 30, `lobby_check.py` 67 of 67, `back_check.py` 14 of 14, `offline_check.py` 20 of 20, `sound_check.py` 44 of 44.
- Docs: `TODO.md` (slice B status), `CODE.md` 9m (status and slice B results), `PROJECT.md` 12c header. `CLAUDE.md`: no rule change.
- Pushed to `main` as the GitHub Pages test build at the user's request (19:17). `node_modules` symlink removed before the commit (npm has no network here; `/opt/npm-tools` holds the tools).

**Not checked yet**
- The feel of Normal play on a phone (the user's test). The arena already shows Normal beats random and Easy.
- Hard and Easy levels, personalities, name editing, mixed levels (slice C and D).

**Next**
- User tests the link (artifact `9WZrZURQCn2hRiFLKGWy2j`, and the Pages build) with the checklist in `CODE.md` 9m.9 and sends feedback.

## 2026-11-12 (evening, later) — Phase 4b slice A built and pushed as 2.6.0: AI brain and arena

**Done**
- **User (17:20):** build Phase 4b slice A from `CODE.md` 9m, run its checks, do not push until told.
- Built slice A (no screen changes yet; nothing playable on the phone, `CLAUDE.md` rule 5):
  - `CODE.md` 9m.2: `computer?` on session players and setup, copied by `createSession`; `GameRecord.vsComputer` (`isVsComputer` helper); `loadRecords` reads old records as false.
  - `src/ai/`: `persona.ts`, `names.ts` (66 names), `seen.ts` (the one door, `seenBy`), `memory.ts`, `eval.ts`, `moves.ts`, `decide.ts`, `react.ts`.
  - `tests/ai/`: `botgame.ts` (whole all-computer games, shared by tests and arena), `position.ts` (hand-made positions), and tests `imports`, `seen`, `fairplay`, `memory`, `eval`, `moves`, `decide`, `names`, `react` (55 tests).
  - `testbed/ai_arena.ts` (`--bars` runs the pass bars).
- Deviations from the plan, and why: `CODE.md` 9m.3 "As built in slice A". Main ones: `reactionFor` takes the phrase list as a parameter; memory has a `leader` and an `asks` field.
- Checks: `npm run check` passes; `npm test` 203 of 203 (148 existing, 55 new); `npm run build` passes; mutation check: with redaction turned off, `seen.test` fails (then restored).
- Arena, 2000 four-player games per bar, 3 rounds per game: 0 refused moves, 0 crashes, 4200 of 4200 games finished. Normal beats random by 1.424 places (bar 0.3). Normal beats Easy by 0.536 places (bar 0.15). Decision p95: Easy 0.04 ms, Normal 0.05 ms (bar 20 ms). All bars pass. Hard search (slice D) is not built.
- Existing browser check `testbed/playthrough.py`: 2 players 11 of 11 pass. The full four-game run is slow (over 15 min); see the result line below.
- Found, not changed: the engine refuses `endSession` once an Ultimate Round has been agreed ("The Ultimate Round has already been agreed"), e.g. after a draw at the top score. The arena advances into the Ultimate Round instead. The app's results screen should be checked for an "End session" button in that state. Changing it is a rule change, so it needs approval.

**Not done**
- **User (18:30):** "Push it." Version bumped to 2.6.0 (`package.json`, `CLAUDE.md` rule 8), committed to main and pushed as the GitHub Pages test build.
- `node_modules` symlink to `/opt/npm-tools/node_modules` (npm had no network) removed before the commit.
- PROJECT.md and CLAUDE.md unchanged: no rule or design decision changed.

**Checks:** full bot playthrough 53 of 53; network game 94 of 94; existing browser checks all pass: netvotes 30 of 30, lobby 67 of 67, back 14 of 14, offline 20 of 20, sound 44 of 44.

**Next**
- Nothing to test on the phone for slice A (the arena numbers are the check). Slice B (`CODE.md` 9m.5 to 9m.8) starts when the user asks for it.

---

## 2026-11-12 (evening) — Plan for single player with computer players

**Done**
- **User (17:06):** "Push it": v2.5 committed and pushed (57fe769) as the GitHub Pages test build; phone test still to do.
- **User (17:08):** asked for a detailed plan for a single-player mode with computer players that play like real people and don't cheat.
- Plan written: `PROJECT.md` 12c (what a computer player may know, levels, how they play, feeling human, how a game runs, 7 open questions), `CODE.md` 9m (no-cheating design built on the network redaction, `src/ai/` modules, the `solo.ts` driver, slices A to E, checks), `TODO.md` Phase 4b. `CLAUDE.md`: no rule changes. Doc-only: no version bump, no test build.
- Nothing coded.

- **User (17:15) answered:** Mixed levels; fixed random names from many cultures, editable; computer reactions on; separate vs-computer stats; computer players with people on one phone and in network games go in the plan; single player before any more network work; version numbers: any number, just say there's a new one. Asked for the plan written so it can be coded with Haiku.
- Plan rewritten as a step-by-step build guide: `CODE.md` 9m (no-cheating design with tests, every `src/ai/` module with types and rules of thumb, memory update table, arena and pass bars, bot driver, own-seat screens, setup screen, separate stats, slices A to G with checks and phone checklists). `PROJECT.md` 12c answers and the two mixed modes; `TODO.md` Phase 4b; `CLAUDE.md` rule 8 (version: any new number, tell the user).

**Next**
- Build Phase 4b slice A from `CODE.md` 9m (a new session can start there). Phone test of v2.5 is still waiting.

---

## 2026-11-12 — Version 2.5 built: votes, take-cards, pause and ready-up on every phone (slice 3)

**Done**
- **User (14:44): "start building it"** (approved the slice 3 plan in `CODE.md` 9l).
- Built slice 3 (version 2.5.0, minor bump: a new network slice). Details and file list in `CODE.md` 9l.
  - Host's clock for pauses: the host stamps pause times and sends `hostNow`; phones count down on the host's clock. `LOBBY_PROTOCOL` 4.
  - Live ballots on every phone during network votes; "count now" for the host (two players: counts as no).
  - Every phone calls the reshuffle, proposes a target and asks for the Ultimate Round; each phone readies its own player, and every phone shows who is ready.
  - Take-cards requests are public in network games (who asked whom, never the cards); the leader's Play waits for the answer.
  - Pause: the host pauses straight away; others ask; only the host resumes or sets a limit; the Reaction Tap drops on any pause.
  - Back gesture closes the take-cards and ask-to-pause panels first; quick rules updated.
- Checks: `npm run check` clean; unit tests 148 of 148; `testbed/netgame_check.py` 94 of 94; new `testbed/netvotes_check.py` 30 of 30; `testbed/lobby_check.py` 67 of 67.
- Environment note: this session has no network, so `npm install` can't run. For checks, `node_modules` was a local symlink to the preinstalled `/opt/npm-tools/node_modules` (tsx, esbuild, typescript). It's not part of the repo and was removed before finishing; recreate it the same way in a session without network.
- Docs: `PROJECT.md` 12, `CODE.md` 8 and 9l, `TODO.md`, `src/content/quick-rules.md`, this entry. `CLAUDE.md`: no rule changes.

**Not yet**
- Not committed or pushed. The GitHub Pages build (the test build) needs the user's approval to push, then their phone test with the `CODE.md` 9l checklist.
- Slice 4: rejoining after a drop, saving to carry on later, screen kept awake.

**Next**
- Ask the user to approve pushing v2.5 as the test build, then run the `CODE.md` 9l phone checklist.

---

## 2026-11-12 — v2.4 tested; plan for slice 3 (votes, take-cards, pause, ready-up on every phone)

**Done**
- **User (14:00):** v2.4 phone test "was fine". Asked for the next slice written up so another model can code it.
- **User's answers (2026-11-12):** network votes show live (every ballot on every phone as it's cast); take-cards requests in network games show who asked whom on every phone (not just the two players).
- Plan written as `CODE.md` 9l: what already exists, decisions, seven build steps naming the files and functions, checks to add, the phone test checklist, and what's left for slice 4. Proposed version 2.5.
- Docs: `PROJECT.md` 4.2, 12 and Decided (the two answers); `TODO.md` (2.3 and 2.4 tested, slice 3 broken into tasks); `CODE.md` 4a slice 3 line and new 9l; this entry. `CLAUDE.md` checked: no rule changes. Doc-only, so no version bump and no test build.
- Nothing coded.

**Next**
- User approves the slice 3 plan, then it's built (a new session can start from `CODE.md` 9l).

---

## 2026-11-08 (evening, later) — Version 2.4 built: round table, reactions on every phone, host line, shuffle fix

**Done**
- **User (18:43):** "Looks good" to the mockup; built version 2.4 (minor bump: changes from testing 2.3).
- Round table (`src/ui/table.ts`, `CODE.md` 9k): one-phone and network games, during the shuffle, dealing, play, the end of a trick and picking who leads (network: also before the round). Bottom seat = this phone's player (network) or whoever holds the phone.
- Shuffle fix: the shuffle now shows at the start of a network game on every phone.
- Reactions sent to every phone, rising from the sender's seat with their name; button hidden on game over.
- Host line on other phones: lobby "X is adding a player…" / "X is setting up the game"; game "X (host) is deciding: when to start the round / next round or end the game / when to start the Ultimate Round", "X (host) is deciding the vote".
- Checks: unit tests 147 (lobby test for `adding` and `react`); `npm run check` clean; `netgame_check.py` 3 players 29 of 29, 2 and 5 players + leaving + kept 65 of 65; `lobby_check.py` 67 of 67 (now reads the version from `package.json`); back 14 of 14; offline 20 of 20; sound 44 of 44; playthrough 53 of 53; after moving the before-round screen onto the table, 2 players again 28 of 28.
- Docs: `PROJECT.md` 12 (2.4 network notes) and 12a (round table); `CODE.md` 7, version history, new 9k; `TODO.md` Version 2.4 items ticked; this entry. `CLAUDE.md` checked: no rule changes.
- **User (19:22): "Push".** Committed and pushed to main; GitHub Pages deploys it.

**Next**
- User tests v2.4 on phones (one-phone game and 2 or more phones).

---

## 2026-11-08 (evening) — Plan for version 2.4 (from the v2.3 phone test)

**Done**
- **User (16:38), from testing v2.3:** no shuffling animation; wants all players around the board instead of names on top; emojis and catch-phrases didn't show on the other phone; asked for a note saying the host is setting up.
- Findings: the shuffle bug is real (network game start draws the first screen before the shuffle starts, so nothing redraws until it's over); reactions across phones were planned for slice 3.
- **User (17:55):** table layout on one-phone games too; reactions visible from the start of the game until it ends; the host note anywhere the host is making a decision.
- Mockup made for approval: https://claude.ai/artifact/RBHyfJN8dkByCmMG9aCe6B (now vs after at 4, 8 and 2 players; host deciding on results; host setting up in the lobby). Plan recorded in `TODO.md` (Version 2.4). Nothing coded.

**Next**
- User approves (or changes) the mockup, then build 2.4.

---

## 2026-11-08 (afternoon, later) — Phase 4 slice 2: play over the network (version 2.3)

**Done**
- **User (15:12):** "Test is fine. Build slice 2" (v2.2 tested on phones; the hosting-phone-is-host question not answered, so it stays as it is).
- Built version 2.3 (minor bump: a slice of Phase 4, like 2.1; the multiplayer release stays 3.0). The host's phone runs the game; each other phone gets its own copy after every move, with every other hand, the cards still to deal, the waste pile and the hidden decks blank (`src/net/netgame.ts`), and sends its moves to the host, which refuses any move not for that phone's own player and says why. Pass-and-play screens reused with no pass-the-phone steps (`src/ui/netplay.ts`, `src/ui/netscreens.ts`, `game.ts` `send` split into `runActions` / `receive` / `absorb`, `roundstart.ts` `netRoundStart`). Start in the lobby now starts the game everywhere ("Back to the lobby" removed); lobby protocol 2.
- In: dealing from the dealer's phone, play, slaps, final two, HAHAHA!, every pop-up, sounds and animations on every phone; hidden swap, Reaction Tap and answering votes on each phone at once (the screens worked as they were); host starts each round and moves on after results; saved on every phone at the end, each to its own profile. Not yet (slice 3): calling votes, take-cards, pause, reactions across phones, ready-up. Not yet (slice 4): rejoining, saving a network game.
- `peer.ts`: long messages are sent in parts (older Safari allows about 64 KB per message; a whole game is bigger), and the log is sent in parts after the first message.
- A network game is never saved as the phone's game in progress, so a one-phone game saved there is kept.
- Found and fixed while testing: a move from another phone cleared this phone's half-done "tap again" (e.g. Leave the game); only this phone's own moves clear it now.
- Checks: new `tests/net/netgame.test.ts` (6), unit tests 147; `npm run check` clean; new `testbed/netgame_check.py` (whole games on 2, 3 and 5 pages over WebRTC; leaving; closing; one-phone game kept): 2 players 21 of 21, 3 players 21 of 21 (with a Reaction Tap), 5 players + leaving + kept 29 of 29; `lobby_check.py` 67 of 67 (Start part rewritten); back 14 of 14; offline 20 of 20; sound 44 of 44; playthrough 53 of 53.
- Docs: `CODE.md` 4a, 7, 8, 9e, 9f, 9i, new 9j; `PROJECT.md` 12; `TODO.md` Phase 4. `CLAUDE.md` checked, no changes.
- Test build: like 2.1 and 2.2, network play needs HTTPS and the camera, which the private test page blocks, so GitHub Pages is the test build (`CLAUDE.md` rule 5). - **User (16:14): "Commit and push".** Committed and pushed to main; GitHub Pages deploys it.

**Next**
- User tests v2.3 on 2 and 3 or more phones with the checklist (hotspot, and home Wi-Fi if possible).
- Then slice 3.

---

## 2026-11-08 (afternoon) — Version 2.2: profiles in a saved game, connection test removed

**Done**
- **User (13:26–13:30):** asked what a quiet phone is (explained: no message for 20 s; screen lock, app switch, out of range, Pubby closed) and was fine with 20 s. Found on 2.1: with a game saved, they deleted one of its profiles and could still carry the game on; they don't think it should. Also: the connection test is still on the main menu.
- Checked: the game carried on fine, but at the end `history.ts` only adds the game to profiles still on the phone, so the deleted player's game was silently left out.
- **User picked:** block deleting a profile that's in the saved game (and block Carry on if one goes missing another way), and remove the connection test.
- Built version 2.2 (minor: a fix and a removal): profiles screen refuses to delete a profile in the saved game; main menu turns Carry on off with a note naming who is missing (New game twice ends it). Connection test removed: home link, `src/ui/nettest.ts`, `#join=` links, `joinLink`/`linkKind`, `testbed/net_check.py`; its checks for a link tapped while Pubby is open, Exit Pubby and a real camera scan moved into `lobby_check.py`, plus checks for the profile rules.
- Found while repeating the checks: the joining phone's name sometimes didn't reach the host (2 runs in 8), so the phone was dropped. It now resends its name every second until the host answers. 20 of 20 targeted runs and 4 of 4 full lobby runs pass since.
- Checks: unit tests 141; `npm run check` clean; `lobby_check.py` 67 of 67 (four runs); back 14 of 14; offline 20 of 20; sound 44 of 44; playthrough 53 of 53.
- Docs: `PROJECT.md` (profiles in a saved game; connection test marked removed; quiet phone confirmed; "hosting phone is always the host" still to confirm), `CODE.md` (7, 8, 9f, 9i), `TODO.md`. `CLAUDE.md` checked, no changes.
- **User (14:16): "Yes"** to commit and push v2.2 as the GitHub Pages test build. Committed and pushed to main.

**Next**
- User tests v2.2 on phones: 2.1's lobby checklist plus the profile rules; answers whether the hosting phone is always the host.

---

## 2026-11-08 (midday) — Phase 4 slice 1: network lobby (version 2.1)

**Done**
- **User (12:23 / 12:26):** "What's next" → "Yes build it": build Phase 4 slice 1, the network lobby, on the approved Phase 4 plan (`CODE.md` 4a).
- Built version 2.1 (minor bump: the first slice of Phase 4, not a whole phase): `src/net/lobby.ts` (lobby and messages, pure), `src/ui/netlobby.ts` (the screen), `#lobby=` links in `src/net/signal.ts`, "Play on several phones" on the main menu ("New game · one phone" for pass-and-play), back gesture in `back.ts`, link handling in `app.ts`, a few styles. Details in `CODE.md` 9i, behaviour in `PROJECT.md` 12.
- Start doesn't deal yet: every phone shows "All set · N players" with the same seat list (slice 2 deals to every phone).
- Found in testing: the joining phone's name could arrive before the host's own "open" event and was lost; the host now takes the link in on whichever comes first. A phone silent for 10 s lost its seat even under heavy test load, and a short app switch on a real phone would do the same, so the limit is now 20 s.
- Checks: new `tests/net/lobby.test.ts` (9), unit tests 141 passing; `npm run check` clean; new `testbed/lobby_check.py` 50 of 50 (four pages: host and three joining phones); `net_check.py` 37 of 37; playthrough 53 of 53; back 14 of 14; offline 20 of 20; sound 44 of 44.
- Docs: `CODE.md` 4a (slice 1 built; multiplayer release renamed 3.0 because 2.0 went to sound), 7, 8, new 9i; `PROJECT.md` 12 (lobby, plus two things for the user to confirm: the hosting phone is always the host; a silent phone loses its lobby seat after 20 s); `TODO.md` Phase 4. `CLAUDE.md` checked, no changes.
- Test build: like v1.3 and v1.4, the lobby needs HTTPS and the camera, which the private test page blocks, so GitHub Pages is the test build (`CLAUDE.md` rule 5, explained before asking).
- **User (13:16): "Yes"** to commit and push v2.1 as the test build. Committed and pushed to main; GitHub Pages deploys it.

**Next**
- User tests v2.1 on two or more phones (hotspot and home Wi-Fi) with the checklist; answers the two lobby choices in `PROJECT.md` 12.
- Then slice 2: dealing and playing over the network.

---

## 2026-11-08 (morning) — Last sound choices

**Done**
- **User (07:29):** SLAP! = Huge; fireplace crackle yes; keep the other effects as they are; start with sound on but lower volume for both music and effects; the volume and on/off switch must be changeable in game too.
- `PROJECT.md` 12b and Decided, `CODE.md` 9g (proposed `src/audio/` plan with defaults: music 40%, effects 60%), `TODO.md` Phase 5.
- **User (07:31):** "Yes build it, make it 2". Built version 2.0: `src/audio/engine.ts`, `music.ts`, `sfx.ts`, `settings.ts`, `src/ui/sound.ts`; hooks in `game.ts`, `app.ts`, `roundstart.ts`, `back.ts`; styles for the sound button and sheet; the game bar now wraps on small phones so the 🔊 and ? buttons fit. All sounds ported from the sample page; Reaction Tap's "ready… GO" split so GO sounds when the pad turns green.
- Checks: new `testbed/sound_check.py` 37 of 37; playthrough 53 of 53; back 14 of 14; offline 20 of 20; unit tests 132 passing; `npm run check` clean. (The build here used the preinstalled esbuild/tsx/TypeScript, as npm has no network in this session.)
- Test link (private): https://claude.ai/artifact/MSgwk5EHWy6Ri3hREFPYjf. `CLAUDE.md` checked, no changes. Not committed yet.

- **User tested (08:22):** doesn't like the ding when a card is placed; effects overlap and sound messy; the trick just vanishes (wants the cards to move to the waste pile, or into the slapped player's hand); shuffle sound with nothing to see (wants a shuffle animation before the deal); too much text, wants the game more visual. Plan proposed (`TODO.md` Phase 5), waiting for approval.

- **User approved (08:24).** Built into v2.0 (not pushed): your-turn chime dropped; effect queue and music ducking; no tap click on in-game buttons; end-of-trick animation (hold, SLAP! pop-up, cards slide to the waste pile or the slapped player's seat); shuffle animation before every deal. Bot waits for the animations. `sound_check.py` 43 of 43; back 14 of 14; offline 20 of 20; unit tests 132; playthrough rerun with the animations.
- Screenshotted every screen and made the less-text mockup (https://claude.ai/artifact/FdJS1U4j3LroH7G9SZuYej): now vs proposed for the top bar, dealing, before the round, votes, swap, pass the phone, your turn, pop-ups and results; 23 yes/no picks and a "Copy my picks" button. Found a bug while doing it: unplayable cards aren't greyed when the hand first appears (G4).
- New test link: see TODO.md.

- **User (08:56):** music should start off (effects on); the final-two "your last card was higher" text is confusing: wants a SLAP!-style HAHAHA! pop-up instead; "Lead any card" button not centred; likes the less-text version but not the emoji everywhere (wants it professional), and the target score not in the top bar.
- Done: music off by default; HAHAHA! pop-up with a laugh sound, choice panel cut to "Pick up or forfeit"; Play button centred. `sound_check.py` 44 of 44; a 2-player bot run showed the HAHAHA! pop-up. Mockup version 2: line icons instead of emoji, place badges, target score as a slim row on the before-the-round and results screens, Ultimate Round button next to Next round.

- **User picks (09:27): yes to all 25** less-text changes. Built: `src/ui/icons.ts`; icon top bar with take button; ? opens at the right rules card; self-closing pop-ups with icons and place badges; dealing chips; before-the-round tiles; target score row; short vote, swap and pass-the-phone screens; felt suit watermark and tiny last-trick cards; podium and award cards on results; G4 dim fix; quick rules gained what the screens lost (new Dealing card) and the rules tables now render. Bot and checks updated.

- **User (10:07): "Commit and push".** Version 2.0 (major: Phase 5 sound and the less-text redesign) committed and pushed to main; GitHub Pages deploys it. `CLAUDE.md` checked, no changes.

**Next**
- Check v2.0 on GitHub Pages (installed app, offline, iPhone silent switch).
- Still open: home Wi-Fi connection test; Phase 4 slice 1 (network lobby); user's own playtest at 2, 3, 5 and 8 players. Then build the picks, test, commit and push.

---

## 2026-11-07 / 08 (late night) — Choosing sound and music

**Done**
- **User (23:35):** asked for music and sound effects, starting with how the game should sound. Described it as a cosy pub card night: cheeky, comic effects, music quietly underneath. Built a sample page that makes every sound live in the browser (no files): https://claude.ai/artifact/Q54YRtsC8xME6LN7uAHzvZ
- Rounds of feedback (23:44 to 00:04): Paused = Click; take-cards = Knock knock; a slap with more oomph (Big and Huge versions added); Boogie Woogie for play, made longer; results music must not be sentimental; menu slower; then "cosier versions of all the songs, with an instrument theme; they all seem disjointed".
- Rebuilt the music as three cosy sets, each with one instrument theme and one shared Pubby tune across menu, play, Ultimate Round and results: Fireside Piano, Snug Guitar, Lamplight Keys. Fireplace crackle option.
- **User chose Fireside Piano (00:12)** and asked to save it in the MD files to carry on in another chat.
- `PROJECT.md` 12b (sound and music: what's chosen, what's left, what was turned down), `CODE.md` 9g (planned audio modules), `TODO.md` Phase 5 sound tasks. `CLAUDE.md` checked, no changes. Doc-only: no code, no version bump.
- Still from earlier tonight: user's v1.5 zoom test on the Samsung phone not reported yet.

**Next**
- User picks SLAP! (original / Big / Huge), fireplace crackle yes or no, the remaining effects, sound on or off by default.
- Then a plan for `src/audio/` for approval (`CODE.md` 9g), build, phone test.
- Also open: v1.5 zoom check on Samsung Internet; home Wi-Fi connection test; Phase 4 slice 1 (network lobby).

---

## 2026-11-07 (night) — Version 1.5: zoom fix

**Done**
- **User (23:06):** v1.4 connection test worked on a hotspot with and without mobile data. Exit shows a second screen (wanted it to close once confirmed). Pinch zoom sometimes works in some spots after many attempts.
- Explained Exit: iPhones never let a web app close itself; on Android Chrome refuses `window.close()` once the back-gesture guards are in the history. **User (23:12): leave Exit as it is.**
- Zoom: happens only in Samsung Internet on Android, not on iPhone (user, 23:12; leave iPhone). Headless Chromium never zoomed. Likely causes: Samsung's "Manual zoom" setting (user to check), or a pinch whose first finger had already started a scroll, when a `touchmove` can't be cancelled any more. **User approved the fix (23:15).**
- Built version 1.5 (small change: a fix): `touch-action: pan-x pan-y` on every element (scrolling areas start their own chain; the Reaction Tap pad keeps `none`), and `blockZoom()` also cancels a two-finger `touchstart` (`CODE.md` 9e).
- Checks: 132 unit tests, strict type check, zoom check (touch-action inside the rules sheet, two-finger touchstart cancelled, one-finger not), back 14 of 14, offline 20 of 20, `net_check.py` 37 of 37, playthroughs 53 of 53.
- `CLAUDE.md` checked, no changes. User approved building and pushing it (23:15); GitHub Pages is the test build (`CLAUDE.md` rule 5).

**Next**
- User checks Samsung Internet's Manual zoom setting and tries to pinch in v1.5 (quick rules, hand of cards, lists, the table).
- Home Wi-Fi connection test when convenient, then slice 1: network lobby.

---

## 2026-11-07 (late) — Connection test passed; version 1.4

**Done**
- **User tested v1.3 (22:18):** worked flawlessly on a phone hotspot, Android + Android and Android + iPhone, with mobile data on and off. Home Wi-Fi not tried. Slice 0 is a **go**.
- User didn't like the iPhone path: no camera in Pubby, and the Camera app's yellow link sometimes needed more than one try. Cause found: Pubby only read `#join=` at start-up; when Pubby was already open in Safari, the link only changed the `#join=` part and the page didn't start again.
- **User approved (22:23):** fix the link, write Pubby's own QR reader, and an "Exit Pubby" button on the main menu (iPhones have no back gesture). Asked for the network code as a separate file for another game.
- Built version 1.4 (small change: fixes and a scanner for iPhones within slice 0, no new game rules):
  - `src/net/qrread.ts`: Pubby's own QR reader (`CODE.md` 9f). `src/net/scan.ts` uses it wherever the browser has no reader. iPhones now scan inside Pubby and can host.
  - `src/ui/app.ts`: `hashchange` listener, so the join link also works when Pubby is already open.
  - Exit Pubby button, goodbye screen with how to leave on this phone, Open Pubby again (`CODE.md` 9e, `PROJECT.md`).
  - Connection test wording updated for in-app scanning on every phone.
- Checks: 132 unit tests (7 new for the reader), strict type check, `net_check.py` 37 of 37 (new: link while open, Exit Pubby, real fake-camera scan through Pubby's reader, read in 0.2 s), 60 of 60 OpenCV-made photos (OpenCV read 49), offline 20 of 20, back 14 of 14, playthroughs 2 and 3 players 22 of 22.
- Network code for the user's other game: `pubby-link.js` (one file, ES module: QR maker, Pubby's reader, scanner, `Peer`, short codes, `warmCamera`), with notes on why it works with no internet. Sent in the chat; not part of the repo.
- UI choices not in the spec, flagged to the user: where the Exit Pubby button sits (under Past games), the goodbye screen wording, coming back from the app switcher goes to the main menu.
- `CLAUDE.md` checked, no changes. GitHub Pages is the test build again (camera needs HTTPS; `CLAUDE.md` rule 5, explained before asking to push).
- User approved commit and push of v1.4 (22:44).

**Next**
- User tests v1.4 on GitHub Pages: iPhone scanning in Pubby (joining and hosting), the Camera app link with Pubby already open, Exit Pubby on both phones. Home Wi-Fi when convenient.
- Then slice 1: network lobby.

---

## 2026-11-07 (evening) — Multiplayer path chosen

**Done**
- User asked "What's next?" (20:29). Answer: test v1.2 on the phone (version, back gesture, airplane mode, a real game), and choose the multiplayer path.
- **User chose B only (20:32):** WebRTC with a QR handshake, phones only, no local server and no fallback to A.
- `CODE.md` section 4 marked decided; new section 4a: Phase 4 plan (star layout with the host's phone running the session, two scans per player, risks, slices 0 to 5, automated tests). Draft, awaiting approval.
- `PROJECT.md` section 12 updated (joining by two scans); five new multiplayer open questions (mixed games, dropped phones, late joining, host dropping, secret votes).
- `TODO.md` Phase 4 split into slices. `CLAUDE.md` checked, no changes.
- **User answered (20:36):** own phones only; dropped phone pauses the game and rejoins; host can remove a player who doesn't return, their cards leave play (not the waste pile); no late joining, only rejoining; votes open. User asked whether the host can be transferred if the host's phone drops.
- Three follow-up questions added to `PROJECT.md` (removed player's place, later rounds after a removal, host transfer or saved game).
- **User answered (20:38):** saved game only (no host transfer); removed player takes last place unless they rejoin; game carries on with fewer players. All recorded in `PROJECT.md` section 12; no open questions left.
- **User approved the plan and slice 0 (20:39).**
- Built the connection test (version 1.3, `CODE.md` 9f): QR maker (`src/net/qr.ts`, no package), short codes (`src/net/signal.ts`, about 130 characters instead of 1,000+), the link (`src/net/peer.ts`), camera scanner (`src/net/scan.ts`, the browser's built-in reader), and the screen (`src/ui/nettest.ts`), opened from a new small link on the home screen.
- UI choices not in the spec, flagged to the user: the home-screen link, what the test shows (round trip, lost messages, addresses), 😂 button, screen kept awake while connected.
- Checks: QR maker against OpenCV (116 codes, versions 1 to 15, all decode); 124 unit tests (6 new); strict type check; `net_check.py` 25 of 25 (two pages connect by reading each other's on-screen QR codes from screenshots); offline check 20 of 20; back check 14 of 14; 2-player playthrough 11 of 11.
- Found in the check: once the camera is allowed, Chrome shows the phone's real local address instead of a hidden `.local` name. Good for phones finding each other.
- Not covered by automated checks: the real camera scan (headless Chromium has no QR reader), real Wi-Fi and hotspots, phones locking. That's what the user's two-phone test is for.
- The test needs the camera and HTTPS, which the private test page doesn't allow, so GitHub Pages is the test build again (`CLAUDE.md` rule 5: explained before asking to push).
- **User (20:49):** has one Android and one iPhone, asked for the test to work between them. iPhone Safari can't read QR codes in a page, so the host's QR code is now a join link: the iPhone Camera app opens Pubby in Safari already joining, and the iPhone shows its code for the Android host to scan. Phones with no reader get Camera app steps instead of the camera. The host now allows the camera before making its code (may give the real local address). `net_check.py` 29 of 29 (new: join link path with a third page), 125 unit tests, offline 20 of 20, back 14 of 14.
- `CLAUDE.md` checked, no changes.

**Next**
- User approves pushing v1.3, then tests Android (host) + iPhone (joins by Camera app): home Wi-Fi, then the Android's hotspot with mobile data off.
- Go / no-go for slices 1 to 5.

---

## 2026-11-07 — Phase 3: offline app

**Done**
- User approved starting Phase 3 (17:03).
- Icon: new original design in `src/pwa/icon.svg` (felt green, two cards with a P, gold star), rendered to 192, 512 and 180 (iPhone) PNGs. The 512 is also the maskable icon.
- `src/pwa/manifest.webmanifest`: Pubby, standalone, portrait, felt colours. Head tags in `src/index.html` (manifest, icons, iPhone home-screen tags).
- `src/pwa/sw.js` + `src/ui/offline.ts`: service worker caches every app file under a versioned cache; the app opens from the cache with no network; a new build downloads in the background and shows next open; old caches are deleted. Does nothing on `file://` and inside the private test link.
- `build.mjs` now writes `dist/` with `index.html`, `sw.js` (version and file list filled in), manifest and icons.
- `.github/workflows/pages.yml`: type check, tests, build and deploy to GitHub Pages on every push to `main`.
- `testbed/offline_check.py`: 20 of 20 checks (see `CODE.md` 9d). 118 unit tests passing, strict type check clean, 2-player playthrough 11 of 11.
- UI choices not in the spec, flagged to the user: the icon design, silent updates (no "new version" pop-up), portrait lock.
- No private test link this time: the published test page blocks service workers, so it can't show installing or offline play. GitHub Pages is the test build (`CLAUDE.md` rule 5: explained before asking to commit).
- `CODE.md` (7, 8a, 9d), `PROJECT.md` (12), `TODO.md` updated. `CLAUDE.md` checked, no changes.
- User approved commit and push (17:13).

- First Pages deploy showed a 404: Pages was set to "Deploy from a branch". User switched Source to GitHub Actions (17:21); deploy re-run, succeeded.
- **User asked (17:24):** a version number that shows a big change as a whole version and a small change as a point version; no pinch zoom; no pull-down-to-refresh. Built: `package.json` 1.0.0, shown as "Version 1.0" on the home screen and in the quick rules; proposed `CLAUDE.md` rule 8 (how to bump). Zoom blocked by the viewport tag, CSS `touch-action` and `src/ui/nozoom.ts` (iPhone gestures); pull-to-refresh by `overscroll-behavior: none`. Checks: zoom test (two-finger moves and gestures cancelled, one-finger scroll not), offline check 20 of 20, 118 tests, 3-player playthrough 12 of 12.

- User asked whether it was pushed (17:40), taken as approval: v1.0 and `CLAUDE.md` rule 8 committed and pushed.

- User explained GitHub didn't seem to update: checked, commit, deploy run and Pages deployment were all there at 17:41; the delay is GitHub's 10-minute cache plus the app showing a new version on the next open.
- **User asked (17:50):** back gesture should go back one screen, and ask before exiting on the main menu (it was closing Pubby at once). Asked what back should do during a game: user chose "do nothing". Built `src/ui/back.ts` (`CODE.md` 9e), "Exit Pubby?" sheet, version 1.1 (small change). Checks: `testbed/back_check.py` 10 of 10, offline check 20 of 20, 118 tests, 2-player playthrough 11 of 11.

- User asked for it to be committed and pushed (17:55): v1.1 pushed.

- **User tested (18:07):** back still closed the installed app. Cause: Chrome's back gesture skips history entries a page adds without a real tap; v1.1 added its guard at start-up and inside `popstate`, and re-added it on `pointerdown`, which isn't a tap on a touch screen. Fixed in v1.2 (`CODE.md` 9e): guards only added inside `click` / `touchend` / `keydown`, two kept, exit question jumps over the rest. Back check 14 of 14 (now also checks the history entries).

- User uses Samsung Internet (same engine as Chrome, same fix); install steps added to `PROJECT.md` 12. User approved push (18:10).

**Next**
- User tests v1.2 on the phone install and airplane mode on the phone.
- Decide the multiplayer path (`CODE.md` section 4) before Phase 4.

---

## 2026-11-07 — Phase 2 slice 5: saved games and profile history

**Done**
- User approved step 1 of "what's next": save each game when it ends, then playtest at 2, 3, 5 and 8 players.
- New `src/ui/history.ts` (`CODE.md` 9c). When the session ends, `send()` calls `saveFinishedGame()` once: game record saved on the phone (`pubby.gameRecords`, newest first, each id once) and added to the profile of every player whose profile is on this phone (a profile deleted mid-game is not brought back).
- Game over: "Saved on this phone" panel (which profiles got the game, or a warning if storage is full or blocked) and "Share game stats (CSV)".
- Home: new "Past games" screen. Tap a game for the final standings, share it, or delete it (two taps; profile totals don't change).
- Profiles: tap a profile for its totals, slapped by most / slapped most, and "Share profile stats (CSV)".
- Share: the phone share sheet with a .csv file. If the phone or browser can't share a file (the private test link blocks the share sheet and downloads), a sheet shows the CSV text with Copy and Download.
- UI choices not in the spec, flagged to the user: the Past games screen, deleting a past game, and the profile details panel (`PROJECT.md` section 10 updated to describe them).
- New automated playthrough: `testbed/bot.js` plays like a person, using only what's on screen; `testbed/playthrough.py` runs four full games in a phone-sized headless browser (2 players: manual deal, swaps, forfeits; 3: reshuffle vote, swap, Ultimate Round played; 5: manual deal, jokers off, Ultimate Round voted down; 8: reshuffle vote, Ultimate Round played; 1 normal round because every SLAP! holds the screen for 4 real seconds), then checks Past games, profile totals, both CSV sheets, deleting, and a page reload. Result: 52 of 52 checks passed, no page errors, no uneven manual deal, no turn without a playable card. A full run takes about 20 minutes.
- **Rule change (user, afternoon):** in the final two, jokers are always allowed. The user hit the morning's "no jokers while the other player is on their last normal card" block in play (P1 led a joker, P2 couldn't answer with one). First change: a joker may answer a joker lead. Then the user asked for their example (both on a joker and one normal card) to play however they like, and chose to drop the block completely. Outcomes: joker + normal card, the normal-card player goes out and wins (joker thrown away); two jokers, missed round, then the normal cards decide; two normal cards, lower or slapper wins; a last card answered by a joker wins. `jokersBlocked()` and the "No jokers now" note removed; tests rewritten for these cases (107 passing).
- **Wording (user approved):** the game already treated a joker lead in the final two as the same trick, but the screens said "The next player starts the trick" and "Lead any card". Now, in the final two: pop-up "P1 played a joker. P2 plays next, in the same trick.", a note on P2's screen, and the button says "Play any card". New "Missed round!" pop-up when both play jokers. Checked in the browser with a set-up final-two position.
- **Spec review (user asked for weird or confusing moments):** answers and decisions: take-cards is meant to favour the asked player; jokers in the hidden decks are fine but now explained (round 1 banner and setup in 2 and 3 player games, new "Hidden decks and the swap" quick rules section); 2-player games ask instead of voting, both must agree, no host decision (user chose this over "either decides" and "keep votes"); target can't be lower than the highest score, equal starts the Ultimate vote; a drawn top score at the end gets an Ultimate vote (everyone votes), then "No one's a winner! Coward!" and a second chance (also after a failed target Ultimate vote), then shared scores; joker lead is the same trick in every game size (only wording changed: the engine already worked that way); warning before a joker that would hand the other player the win in the final two. User corrected my claim that high cards are good in normal tricks: low cards are usually the winning hand.
- Joker warning uses card counts only, so it never reveals that the other player holds a joker (no warning when their hand is one normal card plus jokers).
- Browser checks with set-up positions: draw flow (pop-ups, vote titles, "Coward!", game over "Draw: Amy & Ben share the top score"), target panel minimum, joker warning. Bot playthroughs at 2 players (asked for a reshuffle) and 3 players: 22 of 22 checks passed. 5 and 8 player runs not repeated (no changes affect them beyond wording).
- Checks: strict type check; 118 tests passing (new: saved games newest first and never twice, delete, profile history survives a reload, full or blocked storage doesn't crash; final-two joker cases).
- New test link (this session can't update the old one). Its saved profiles start empty, because each link keeps its own storage.
- `PROJECT.md` (section 10), `CODE.md` (7, 8a, 9c), `TODO.md` updated. `CLAUDE.md` checked, no changes.

- User tested the test link and approved commit and push (17:01).

**Next**
- Phase 3: offline app (manifest, icons, service worker, GitHub Pages).
- Decide the multiplayer path (`CODE.md` section 4) before Phase 4.

---

## 2026-11-07 — Rule changes: jokers, manual deal, take-cards before tricks

**Done**
- User asked for four changes after testing. Questions asked and answered first (CLAUDE.md rule 6):
  - Leftover jokers when the last normal card is played: thrown away, even if the player then picks up the waste pile.
  - Delete "joker as your last card takes you out" and "both down to a single joker share second-last place" (they can't happen any more).
  - "Only ask one person" means one open request at a time.
  - On one phone, others ask with a "Someone wants to take cards" button on the hand-off screen before a trick.
- Rules engine (`play.ts`): `jokersBlocked` — in the final two, no jokers while the other player is down to their last normal card (counted at the start of the trick, jokers not counted). Last normal card with only jokers left: the jokers are thrown away (`jokersDiscarded` event) and that card is the last card (also for a slap). Joker-last-card and both-on-jokers code removed; `sharedSecondLast` is now always null.
- Dealing (`deal.ts`): `lastSeat`; manual deal refuses the player who just got a card; auto deal skips them if they're next after a switch. The UI greys out that player.
- Session (`session.ts`): `requestTake` only between tricks and one open request per player; agreeing to one requester answers no to the others asking the same player.
- UI: take-cards only before a trick; "Someone wants to take cards" on the hand-off screen (pick who's asking, phone goes to them); asked player sees every asker ("Give them to X" / "Refuse everyone"); "gave their cards to X instead" note; "Hide my cards · pass to X" for a player holding the phone out of turn; "Jokers thrown away" pop-up; "No jokers now" note in the final two. Quick rules updated.
- Interpretation flagged to the user: "one card" means one normal card (a player with a 5♥ and a joker is on their last card).
- Checks: strict type check; 98 tests passing (new: no jokers against a last card, jokers allowed otherwise, jokers thrown away including slaps and pick-ups, manual deal lock, take only before a trick, two askers); automated phone-browser playthroughs (53 checks, no errors), including two players asking the same player, no take buttons mid-trick, the manual deal lock, and a jokers-held run that hit "Jokers thrown away" and "No jokers now".
- Test link updated (same link as slice 4).
- `PROJECT.md` (2b, 4.2, 6, 7, 9, decided list), `CODE.md`, `TODO.md` updated. `CLAUDE.md` checked, no changes.
- Follow-up from the user: the deal now starts in manual mode. The "never two in a row" lock still let the dealer swap between two players, so it is now an even deal: anyone who has had a card is greyed out until everyone has one, then all open up again (except the player who just got one). Auto deal skips greyed-out players after a switch. New catch-phrases: "Hurry up!!", "Slap him!!", "Slap her!!", "Come on!!", "Too slow!!", "Get them!!", "Oof!!", "Revenge time!!". The reactions bar is now one slim strip beside the 😂 button that scrolls sideways. 99 tests passing; 56 phone-browser checks, no errors (including manual deal coming out even). Test link updated.

- User tested and approved commit and push (slice 4 and these rule changes together).

**Next**
- Save the game record and profile history when a game ends; playtest at 2, 3, 5 and 8 players; Phase 3 (offline PWA).

---

## 2026-11-07 — Phase 2 slice 4: results, trivia, votes, take-cards, pause

**Done**
- User approved slice 4. New `src/ui/between.ts` (`CODE.md` 9c); the slice 2 stand-in results screen is gone.
- Results screen after every round: winner banner, places, round points and totals, trivia (most slapped, most slapper, rivals, always fighting for survival, biggest pick-up, most forfeits, most reshuffle votes, slowest reaction) and a per-player table (slapped by most, slapped most). No timer. Ready up: tap your name, the count shows; the host still decides. Host buttons: Next round (or Start the Ultimate Round) and End the game (two taps).
- Target score: panel with a stepper and quick picks (5, 10, 15, 20), pick who proposes, then the vote goes round the phone. Shown during the round 1 deal, before the host starts round 1, and on results screens; hidden once a target or the Ultimate Round is agreed. The target shows in the game bar (🎯).
- Ultimate Round: any player calls the vote from the results screen. Reaching the target shows a "Target reached!" pop-up and starts the vote. Results-screen votes show the results table under "Pass the phone to". Passed: banner on results, the game bar says "⚡ Ultimate Round". Failed at the target: game over, highest score wins.
- Game over: winners and why, Ultimate Winner and Loser titles, final standings with title tags, the Ultimate Round table, trivia.
- Take-cards request (one phone): "Ask to take someone's cards" on your own hand screen, pick a player. Between tricks the phone goes straight to the asked player ("Something for X only"); mid-trick it waits for them. Agree or Refuse on their hand screen. The requester can withdraw. Private notes to the requester when refused, agreed but waiting, or cancelled. Everyone gets a "Cards taken!" pop-up when cards move.
- Pause: "⏸ Pause" in the game bar during a round (not during a vote). The host pauses now, or a player asks (pick who); the host gets a banner (Pause / Say no; "No pause" pop-up). The pause screen covers everything, says who asked, has Resume, a countdown for a timed pause and the time-limit choice. The auto deal and a running Reaction Tap stop while paused. When the time limit runs out: "Pause over" pop-up.
- Home screen note updated.
- Checks: strict type check; 97 tests passing; automated phone-browser playthroughs (44 checks, no errors): target vote before round 1, ready up, target reached to Ultimate Round to game over, take-cards agree/refuse/withdraw, host pause, pause request declined and approved, timed pause running out, pause on a hand screen, Ultimate vote tie decided by the host, host ending the game, Ultimate vote failing at the target, and full random games at 2, 3, 6 and 8 players with swaps and take requests.
- New test link published (the old one couldn't be updated from this session). Profiles saved on the old link don't carry over.
- `CODE.md`, `TODO.md` updated. `PROJECT.md` checked: no rule changes. `CLAUDE.md` checked, no changes.

**Not done**
- Saving the game record and profile history when a game ends (added to `TODO.md`).

**Next**
- User tests slice 4 on their phone. Then: game record saving, playtest at 2, 3, 5 and 8 players, Phase 3 (offline PWA).

---

## 2026-11-07 — Phase 2 slice 3: reshuffle vote, hidden swap, Reaction Tap

**Done**
- User approved slice 3. New `src/ui/roundstart.ts` (`CODE.md` 9c); the slice 2 stand-ins are gone.
- Reshuffle vote: after the deal, "Call a reshuffle vote" asks who is calling (any player), then the phone goes to each player clockwise from the caller. Each votes YES or NO in secret, with their own hand on screen so they can judge the deal. The host can count the votes early (two taps). A majority decides at once; with no majority the host decides. Result pop-up: "Majority says…" or "Host says…" with a big YES!/NO! and what it means ("Reshuffle! X shuffles and deals again." / "No reshuffle. The round goes on."). Passed: the dealer deals again, then the round moves straight on. Once per round. The host can still just tap "Start the round".
- Hidden swap (2 and 3 players, every round): the phone goes to each player; pick up to 4 cards (tap to raise) and "Swap N cards", or "Keep my hand". Then the player sees their hand with the new cards starred, hides it and passes on.
- Reaction Tap (two or more players missing a suit): each in turn taps Start; the pad shows red "Wait…" for a random 1.5 to 4 seconds, then green "TAP!". Time is measured from when the green pad is on screen. Tapping on red is "Too early!" (slowest). Each player sees their time, then passes on. Ties for slowest replay (pop-up). The slowest leads (pop-up says why).
- Checks: strict type check; 97 tests passing; automated phone-browser playthroughs at 2, 3, 4, 7 and 8 players: reshuffle votes passed and failed, host deciding, counting early, swaps of 0 to 4 cards (new cards checked against the number swapped), Reaction Taps with false starts, no errors.
- Test link republished.
- `CODE.md`, `TODO.md` updated. `PROJECT.md` checked: no rule changes. `CLAUDE.md` checked, no changes.

- User approved commit and push.

**Next**
- Slice 4 (results screen with trivia and ready up, target and Ultimate votes, take-cards requests, pause).

---

## 2026-11-07 — Reactions drawer, longer SLAP!

**Done**
- User asked for the reactions bar to be there all the time: a 😂 button (bottom left of every game screen) now slides it open; it stays open until put away. It works during the SLAP! pop-up too. The after-slap-only bar is gone.
- SLAP! pop-up now stays up 4 seconds (was 3), "to infuriate the other player".
- User's idea for multiplayer: reactions should show who sent them, coming from that side of the table. Recorded in `PROJECT.md` (4.1 and multiplayer section), `CODE.md` 9c (send as a network message, float in from the sender's seat) and a Phase 4 task in `TODO.md`. Not built yet.
- Checked in automated 4-player playthroughs: drawer opens and closes, reactions float and fade, drawer usable during the SLAP!, SLAP! closes after about 4 seconds, no errors. 97 tests passing.
- Test link republished. `CLAUDE.md` checked, no changes.

- User approved commit and push.

**Next**
- Slice 3 (reshuffle vote, hidden swap, Reaction Tap).

---

## 2026-11-07 — Phase 2 slice 2: dealing, table and play

**Done**
- User approved slice 2.
- Dealing screen: auto deal (dealer taps who gets the first card, a card flies from the deck to each seat in turn, clockwise), manual deal (tap a name for one card), switch either way at any time, and "Deal the rest now". Hidden decks never appear.
- Play on one phone: the phone goes to whoever must act. "Pass the phone to X" shows only the table; X then sees their hand with legal cards lit, taps a card and presses Play (or taps it twice). Seat strip with card counts, turn highlight and place badges. The felt shows the current trick, led suit and waste pile count, plus the last trick and how it ended.
- Final two: the player whose last card was higher picks up the waste pile or forfeits; forfeit stays available after a pick-up (two taps to confirm).
- Pop-ups in a queue: SLAP! (comic style, who slapped who, cards picked up, random catch-phrase, 😂 button), joker played, going out with place, one last-two pop-up at round end, waste pile pick-up, who leads and why.
- Catch-phrases moved to `src/content/catch-phrases.md` (one per line, easy to add).
- Round 2 on: last round's winner picks who leads.
- Basic results (places, points, totals, "X is the winner", who deals next), next round, end game, game over standings.
- Stand-ins (clearly marked on screen) so a round can be played before slice 3: host taps "Start the round" instead of the reshuffle vote; "Everyone keeps their hand" instead of the hidden swap; a random pick instead of Reaction Tap. "Pass the phone round" lets everyone look at their cards before the round.
- Animations only play for new things (a hand when first shown, the newest card on the felt), so tapping cards doesn't make the screen flicker.
- Code split into `store.ts`, `game.ts`, `cards.ts` (`CODE.md` section 9c).
- Checks: strict type check; 97 tests passing; automated phone-browser playthroughs of 18 full games (2 to 8 players, jokers on and off, 3 rounds each, about 4,000 cards played, 750+ slaps, pick-ups and forfeits, manual dealing), no errors and no blocked moves.
- Test link republished.
- `CODE.md`, `TODO.md`, `src/content/README.md` updated. `PROJECT.md` checked: no rule changes. `CLAUDE.md` checked, no changes.

- User tested slice 2: fine, with one change to the SLAP! pop-up. Now: no emoji or catch-phrase on the pop-up; it closes by itself after 3 seconds (countdown bar, no tap needed). After it, the hand-off screen shows a reactions bar where everyone can spam 😂 and the catch-phrases; each one appears, floats up and fades out. Bar stays until the next card. `PROJECT.md` 4.1 updated. Checked in automated playthroughs at 3 and 4 players: the pop-up has no buttons, closes after about 3 seconds, reactions float and are gone after 2.5 seconds, no errors. Test link republished. User asked to commit and push after this change.

**Next**
- Slice 3: reshuffle vote, hidden swap, Reaction Tap (replacing the stand-ins).

---

## 2026-11-07 — Phase 2 slice 1: lobby and setup (plain TypeScript)

**Done**
- Note: the session layer, take-cards request and testbed (entry below) were committed and pushed as `78962b7`, even though that entry still says "not committed".
- User approved Phase 2 slice 1 (lobby and setup).
- Svelte could not be installed here (network for packages is off). The user chose to drop Svelte and build the UI in plain TypeScript. `CODE.md` section 3 updated. Removed `svelte.config.js`, `vite.config.ts`, the root `index.html` and `src/ui/App.svelte`; `package.json` now needs only esbuild, tsx, TypeScript and the Node types. New `build.mjs` builds one self-contained page, `dist/index.html`.
- Built slice 1 (`src/ui/`, `CODE.md` section 9c): home screen; profiles (add, delete, saved on the phone, names unique ignoring case); game setup with 2 to 8 seats from saved profiles or new names, optional name for this game, seat order arrows, "Make host", joker rule toggle with the joker count, pause time limit; game start with the joker banner and seat list; a temporary quick deal (host taps who gets the first card); pass-the-phone (hand-off screen with just a name, then that player's hand from `playerView`, then pass clockwise); menu to go home (game kept) or end the game; game in progress saved on the phone; quick rules on every screen.
- One UI check added: two players can't show the same name in one game. Not a game rule, just to keep names clear. Flagged to the user.
- Checks: strict type check of all of `src/`; 97 tests passing; headless phone-browser playthroughs at 2, 3, 5, 6 and 8 players, jokers on and off: correct card totals (hidden decks never shown: 28 cards seen at 2 players, 39 at 3 with no jokers), carry on after reload, quick rules, duplicate checks, no errors.
- Published as a private test link (new artifact "Pubby").
- `PROJECT.md` status line, `CODE.md`, `TODO.md` updated. `CLAUDE.md` checked, no changes.

- User tested slice 1 on their phone: everything worked. Approved commit and push.

**Next**
- Slice 2 (table and hand: dealing screen, trick play, slaps, going out).

---

## 2026-11-07 — Session layer

**Done**
- User approved starting the session layer.
- Built `src/session/` (`CODE.md` section 9b): `createSession` and `applyAction` run a whole game on top of the rules engine. Covers the round flow, the reshuffle vote wired in (any player calls it, once per round, dealer deals again), target score and Ultimate Round votes (majority, host on no majority, host can close a vote early), target reached starting an automatic Ultimate vote (if it fails the session ends and the highest score wins), the Ultimate Round outside the score with its titles, final standings, host pause and resume, pause requests, the optional pause time limit, the results screen (ready up, host moves on or ends), the event log, trivia, the game record, profile history (once per game) and CSV export.
- `playerView`: what each phone may see. Tested at every step of whole rounds at 2, 3, 5 and 8 players: no other hands, no hidden decks.
- Removed the old draft `Game` and `Action` types from `src/rules/types.ts`; the real ones are in `src/session/types.ts`.
- 86 tests passing (27 new). Rules engine, session layer and tests pass a strict type check.
- Testbed rebuilt on the session layer (votes, pause, results, trivia, Ultimate Round, game over, profiles, CSV, player-view check). Automated phone-sized browser playthrough: 14 sessions, 2 to 8 players, jokers on and off, about 60 rounds, Ultimate Rounds, target endings, 40+ pauses, no errors and no blocked moves. Pause time limit checked: the game resumed on its own after 15 seconds.
- The old testbed link could not be updated from this session (network access is off here), so the new testbed was published as a new private link.
- Four choices came up that the spec didn't cover. Each is built with a proposed answer and listed in `PROJECT.md` Open questions: who starts the round when nobody calls a reshuffle vote (host), when a vote is counted (as soon as there's a majority; host can close early), who proposes a target (any player), and whether the Ultimate Round counts in round wins, losses and bottom-two stats (no).
- `PROJECT.md`: removed a duplicated reshuffle line; marked the proposed answers. `CODE.md`, `TODO.md` updated. `CLAUDE.md` checked, no changes.

**Done (later in the session)**
- User accepted all four proposed answers. `PROJECT.md` has no open questions again; the answers are in "Decided".
- User couldn't find the target and Ultimate votes. They were low on the results screen; moved into a "Votes" box straight under the round results, with a reminder during play.
- User asked for the target vote before round 1 too, and for it to disappear once agreed (it was still offered after a target and the Ultimate Round were agreed). Now: target vote before round 1 starts (during the deal or before the host starts round 1) or on any results screen; once a target passes, no more target votes; none once the Ultimate Round is agreed. Dealing waits while a vote is open. 2 new tests (88 passing). Testbed republished; automated playthrough also checks the target vote is never offered after agreement.

- User asked where the option to request another player's cards was. It was removed on purpose in the planning stage (revision 5: no peek or take-cards; the hidden swap is the only card exchange). Removed a leftover "Peek and take-cards prompts" task from `TODO.md` Phase 2.

- User explained the real idea behind it: a take-cards request. The name "peek and take" had confused them, which is why it was removed. Written up in `PROJECT.md` section 4.2: take all of another player's cards without seeing them, nobody else told which cards; always available; tapped any time but dealt with only between tricks; the asked player can refuse; host approves; no cost to ask. Six questions added to Open questions (what happens to the giver, name, host involvement, limits, hand counts, final two). Not built yet.

- User answered the questions: the giver goes out by the normal rules; name "take-cards request"; no host approval, just the two players; unlimited; card counts changing is fine; not allowed with two players left. Built it: `takeCards` in `play.ts`, `requestTake` / `answerTake` / `withdrawTake` in the session layer, private to the two players in `playerView`. One detail filled in: if the player whose cards are taken was about to lead, the next player clockwise leads (recorded in `PROJECT.md` 4.2). 9 new tests (97 passing), including full sessions with random requests at 3 to 8 players. Testbed has a take-cards panel; automated playthrough made 100 requests with no errors. Testbed republished.

**Not done**
- Not committed or pushed: waiting for the user to test and approve.

**Next**
- User play-tests the testbed and answers the four open questions.
- After approval: commit and push. Then Phase 2 (pass-and-play UI) or the multiplayer path decision.

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
