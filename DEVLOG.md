# DEVLOG — Pubby

Newest entries at the top. One entry per session, added before each commit.

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
