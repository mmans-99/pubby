# Pubby — Game Spec

**Status:** Phase 1 (rules engine and session layer) done. Phase 2 (pass-and-play UI) in progress. Each change is play-tested by the user before it is committed (see `CLAUDE.md`). Items marked **OPEN** need a decision before they are built.

Pubby is a multiplayer shedding card game based on Bhabhi (also called Get Away). It is played as a phone-only, offline-capable web app. The goal of each round is to get rid of all your cards. The last player holding cards is the round loser (the "Bhabhi").

---

## 1. Players and sessions

- **Player count:** 2 to 8.
- **Platform:** Phones only, for now.
- **Profiles:** Each person has a saved profile with a name. This is their default name everywhere. Profiles are stored on the phone that created them (see section 10).
- **Profiles in a saved game (user 2026-11-08, version 2.2):** a profile that is in the game in progress can't be deleted ("Sam is in the game in progress. Finish or end that game first."). If a profile still goes missing another way (the phone or browser clears its storage), the saved game can't carry on: "Carry on" is off, the main menu says who is missing, and New game (tapped twice) ends it.
- **Session names:** When a game is set up, a player can choose a different name for that session only. Example: profile "Ferrari", session name "Speedy". Everyone sees the session name during that game. The profile name returns afterwards.
- **Host:** One player hosts the game. The host sets up the game (including the joker option, section 7), can pause and resume the game, moves the game on from the results screen, ends the session if needed, and decides any vote that has no majority (section 1.1).
- **Chaos scaling:** Higher player counts are meant to be more chaotic. Rules that depend on player count are listed below.

### 1.1 Voting (applies to every vote in the game)
- A vote passes with a **majority**: more than half of the players.
- If more than half vote no, the vote **fails**. The host is not asked.
- If no majority is reached either way (a tie, or too few votes), **the host decides**.
- **Counting:** A vote is decided the moment more than half say the same thing, without waiting for the rest. If everyone has voted and there is no majority, it goes to the host. The host can also close a vote early (for example if someone won't vote); with no majority, the host then decides.
- **Result pop-up:** Every vote ends with a bold pop-up on every phone showing the decision, for example:
  - "Majority says… YES!" or "Majority says… NO!"
  - "Host says… YES!" or "Host says… NO!" when the host decided.
  - It names what was decided (for example "Reshuffle!", "Target: 15 points", "Ultimate Round!").
- **Two players: no votes (decided 2026-11-07).** With 2 players, every split vote used to go to the host. Instead, one player asks and the other agrees or refuses. It only happens if both agree; the host never decides. The asker counts as a yes. If the host stops waiting for an answer, that counts as no. This covers the reshuffle, the target score, the Ultimate Round (including the automatic one when the target is reached) and the draw offer. Pop-ups say "Both agree… YES!" or "Not agreed… NO!".
- **Votes only happen outside a round.** There are two places they can happen:
  - Before a round starts: the reshuffle vote (section 2a).
  - On the results screen after a round: the target score vote and the Ultimate Round vote (section 9).
  - The target score vote can also happen before round 1 starts (section 9).

---

## 2. Round start: who shuffles, deals, and leads

A **game** is a match made of several **rounds**. Each round ends when one player is left holding cards.

- **Round 1:** The host shuffles, deals, and leads.
- **Later rounds:** The round loser (Bhabhi) shuffles and deals.
- **Who leads after round 1:** The round winner chooses who leads, including themselves.
- **Missing-suit override:** A player who is missing a suit leads regardless of the above (section 5).

### Sequence at the start of each round
1. Deal (section 2b).
2. Every player looks at their own cards.
3. **Reshuffle vote** (section 2a). Happens before every round.
4. **Hidden swap** (section 3). 2 and 3 player games, every round.
5. Missing-suit declarations and mini-game (section 5).
6. The round begins.

The order of steps 3 and 4 does not matter to the players, so the order above is fixed.

### 2a. Reshuffle vote
- **Players:** 2 to 8. Applies to all game sizes.
- **Who can call it:** Any player.
- **When:** Before every round, after everyone has looked at their cards. Once the round has begun, it can no longer be called.
- **Passing rule:** Majority vote. If there is no majority, the host decides.
- **Closing the window:** If nobody calls a vote, the host taps "Start the round". After a vote, the round carries on by itself (after the new deal if it passed).
- **If it passes:** The dealer of that round shuffles the cards again and deals them again. This includes the hidden decks.
- **Once per round:** Only one reshuffle vote per round. After a vote (passed or failed), no other reshuffle vote can be called that round. After a reshuffle, players keep the new deal.

### 2b. Dealing
- **The deck:** One standard 52-card deck for every player count, plus jokers when the joker rule is on (section 7).
- **Full deck every round:** Every round starts with all 52 cards and all jokers again. Cards swapped out and jokers used only leave the game for that round.
- **Hidden decks every round:** In 2 and 3 player games, hidden decks are set aside every round (so nobody can count cards), and the hidden swap is offered every round.
- **Hidden decks first (2 and 3 player games):** Before the dealer starts, the game deals the hidden decks automatically in the background. **They are never shown on any screen, not even during the deal.** There is no hidden-deck pile, count, or animation. The only sign they exist is the swap option (section 3). Each hidden deck gets one player's share: the number of cards divided by (players + hidden decks), rounded down. Example: 2 players with jokers on is 54 cards, so each hidden deck gets 13 and 28 are left for the players.
- **The dealer deals only to players.** The remaining cards go to the players, never to the hidden decks.
- **Remainder cards:** Not an issue. Hands can end up uneven, and that's fine.
- **Two deal modes.** The dealer can switch between them at any time, including during an auto deal. **The deal starts in manual mode.**

**Auto deal**
- The dealer taps the first player's name.
- Cards are dealt one at a time, **clockwise**, moving around the table until every card is dealt.
- Each card is shown with an animation as it moves to its player. During the animation, the dealer can switch to manual dealing.

**Manual deal**
- The dealer taps a player's name, and one card goes to that player.
- The dealer repeats this for each card.
- **Even deal:** once a player gets a card they are greyed out until every player has had one in that lap; then everyone opens up again, except the player who just got the last card (never two in a row). This keeps hands as even as possible. It also holds across switches: auto deal skips players who are greyed out.

---

## 3. Hidden swap (2 and 3 player games only)

- **Players:** 2 or 3 only.
- **Hidden decks:**
  - 2 players: 2 hidden decks.
  - 3 players: 1 hidden deck.
  - 4 to 8 players: no hidden decks.
  - They are dealt automatically in the background before the dealer deals the players (section 2b).
  - **Never shown.** No screen ever displays the hidden decks. Players only see a "Swap cards" option at the start of each round in 2 and 3 player games.
- **Purpose:** Players cannot work out exactly what the others hold.
- **Timing:** At the start of every round, after the reshuffle vote. Each player can swap once per round.
- **How it works:**
  1. Each player looks at their cards.
  2. The player chooses up to 4 of their own cards to swap, or none.
  3. The chosen cards leave the game. The player receives the same number of random, unknown cards from the hidden decks.
- **Given-away cards** leave the game. They do not go into the hidden decks or the waste pile.
- **Jokers can be hidden (decided 2026-11-07):** jokers can end up in the hidden decks or be swapped out, so fewer jokers than the count shown may be in play. That's fine. In 2 and 3 player games the joker count message adds a note that some jokers may be in the hidden decks, and the quick rules explain how the hidden decks work.

---

## 4. Turn structure and tricks

1. The leader plays any card face up to start a trick. There is no special opening card.
2. Clockwise, each player must play a card of the led suit if they have one.
3. **Slap (the cut):** If a player has no card of the led suit, they may play any card of any suit. This is a **slap**, and it stops the trick (see section 4.1).
4. When every player has played or the trick is stopped, the trick is resolved.
5. The player who played the highest card of the led suit leads the next trick. If that player has gone out, whoever played the **next highest** card of the led suit leads instead.
6. A player who empties their hand is **out** and can watch the rest of the round.
   - **Going-out pop-up:** Each time a player goes out, a pop-up shows their name and the place they came (for example "Ferrari is out! Came 2nd").
   - **Place badge:** Their place stays visible next to their name for the rest of the round.
   - **Last two:** When the round ends, one pop-up announces both: who came second last (with the place), and the last player, called **the loser**. In a 2-player game it says who wins and who is the loser.
   - **Wording:** The round's 1st place is called **the winner**. The round end never calls anyone "the Pubby".
7. Cards from completed tricks go to the **waste pile** (see section 6 for the exception).

**Card ranking:** Ace is high. Within a suit, 2 is lowest, then 3 to 10, J, Q, K, and A is highest.

The Ace of Spades has no special rule. It is an ordinary card.

### 4.1 Slap
- A slap happens when a player plays an off-suit card (step 3 above). That player is the **slapper**.
- **Effect:** The trick stops immediately. The player who holds the highest card of the led suit picks up **all the cards played in that trick**, including the slap card, and adds them to their hand. That player is the **slapped** player. They then lead the next trick.
- **Feedback:**
  - A comic-book style **"SLAP!"** pop-up appears on every screen. It must be big and hard to miss. Underneath, in a smaller font: who slapped who (for example "Speedy slapped Ferrari") and how many cards were picked up.
  - **The pop-up has no emoji or catch-phrase on it.** It stays up for 4 seconds (a countdown bar shows this; long enough to rub it in), then closes by itself. Nobody has to tap it.
  - **Reactions, any time:** a 😂 button on every game screen slides open a reactions bar. Everyone can spam the laughing-with-tears emoji 😂 and the catch-phrases, including while the SLAP! pop-up is up. Each tap appears, floats up and fades out. The bar stays open until it's put away. No other emoji for now.
  - **Multiplayer (later):** each reaction shows who sent it and comes from that player's side of the table.
  - Catch-phrases (tap to send). Starting set:
    - "Don't let the cards control you, you control the cards."
    - "Craftyyyy"
    - "You got slapped"
    - "You got slapped by a kiiid"
  - More catch-phrases will be added by the user later. The catch-phrase list must be easy to edit.

### 4.2 Take-cards request

- **Why:** A player who keeps getting slapped by the same person, and can't get past them, can try to take another player's cards to change their hand.
- **What it does:** The requester takes **all** of another player's cards.
  - The requester does not see the cards before taking them.
  - Nobody else is told which cards moved. Everyone can see the card counts change.
- **Who can be asked:** Any other player still holding cards. This includes the player who keeps slapping them, or someone else whose cards would help.
- **Before a trick only:** Requests can only be made **before a trick starts**: after one trick ends and before the first card of the next trick is played. The option is not shown during a trick. It must be decided before the trick starts: the leader can't play the first card while a request is still waiting for an answer.
- **One at a time, no cost:** A player can ask only one player at a time. Once that request is answered or withdrawn, they can ask again before a later trick. Asking costs nothing.
- **Agreement:** The asked player agrees or refuses. The host does not approve (the user may add host approval back later). The requester can withdraw a request that hasn't happened yet.
- **Asked by more than one player:** If two or more players ask the same player before a trick, that player chooses who gets their cards (or refuses everyone). The others are told no.
- **Private (one-phone games):** Only the players involved see the request. In network games everyone sees who asked whom (section 12, user 2026-11-12). The cards moving is shown to everyone (who took from whom, and how many), never which cards.
- **On one phone (pass-and-play):** Before a trick, the "Pass the phone to (leader)" screen has a "Someone wants to take cards" button. Pick who is asking; the phone goes to them in private to choose a player. The leader can also ask from their own hand screen. The phone then goes to the asked player to answer.
- **The player whose cards are taken** has no cards left, so they are **out**, by the normal rules, and take the next finishing place at that moment.
- **Who it helps (confirmed 2026-11-07):** the asked player gets the advantage: they go out straight away with the next place. The asker gets a new hand (and more cards). This is intended.
- **Who leads after:** If the player whose cards were taken was about to lead the next trick, the next player clockwise still holding cards leads instead.
- **Not with two left:** Not allowed when only two players hold cards (it would just be a forfeit), so never in a 2-player game. Any waiting requests are cancelled when the round gets down to two players, or when either player goes out.

---

## 5. Missing-suit declaration (before a round starts)

- After the deal, if a player holds **no cards of a suit**, they must **declare** it.
- A player who declares a missing suit **leads first in that round**, regardless of any other rule.
- **If more than one player is missing a suit:** a mini-game decides who leads. The **slowest** player in the mini-game leads first.

### Mini-game: Reaction Tap (chosen)
- Only the players who are missing a suit take part.
- The screen shows "Wait…", then turns green after a random delay.
- Each player taps as soon as the screen turns green. Reaction times are recorded.
- **The slowest reactor leads first.**
- **If the slowest reactors are tied,** only those tied players play Reaction Tap again. This repeats until one slowest player is decided.
- **A false start** (tapping before the screen turns green) counts as the slowest time, so that player loses.

---

## 6. Waste pile and the final two

- The waste pile is normally out of play. Cards go there after a trick and are not picked up again.
- **Exception (final two, every game size):** When only two players still hold cards, the rule applies when one of them plays their **last card**. In a 2-player game this is from the very first trick. Tricks where nobody plays their last card follow the normal rules.
- **Last card lower** than the other player's card, or **a slap**: that player goes out and **wins** the round.
- **Last card higher** than the other player's card: that player must choose:
  - **Pick up the whole waste pile** (including this trick) and play on. They lead next. They keep the option to forfeit at any time while two players are left.
  - **Forfeit:** they take last place (the same as a Bhabhi) and the other player takes the higher place. The round ends.
- **Jokers in the final two:** Jokers can always be played, including against a last card. A last card that meets only a joker (no normal card from the other player) goes out unopposed and **wins** (section 7).
- **Both go out in the same trick:** the lower card, or the slapper, wins. The other takes last place.
- **Only the player who played their last card** can face the pick-up-or-forfeit choice.

---

## 7. Joker Rule

- **Setup option:** When the host sets up the game, they can turn the joker rule off. It is on by default.
- **Joker count (when on):**
  - 2 jokers for 2 to 5 players.
  - 3 jokers for 6 to 8 players.
- **Dealt from the player deck.** Jokers are part of the normal deal, not set aside.
- **Joker count shown:** The game shows the total number of jokers in the deck to all players at the start of the game. It is not updated during play. It is there to make players aware that jokers are in play somewhere.
- **Jokers are playing cards.** They count as cards in a player's hand (for card counts and taking cards).
- **You can't hold only jokers:** When a player plays their **last normal card** and only jokers are left in their hand, those jokers are thrown away (they leave the game) and that normal card counts as their **last card**. This is the same when the last card is a slap. In the final two, the last card is compared as usual; if it was higher and the player picks up the waste pile, the jokers are still gone. A joker is never a last card.
- **Use:** A joker is a wild card. A player may play it on their own turn, even if they could follow suit. Playing it skips their turn.
- **Joker as the lead:** If the leader plays a joker as the first card of a trick, they have started the trick and are part of it, but nothing in it affects them: they can't be slapped and don't play again in that trick. The joker is gone and the next player clockwise plays any card, which sets the suit for the rest of the trick. This is the same in the final two. (Wording settled 2026-11-07: the screens say "same trick", not "starts the trick".)
- **After use:** The joker leaves the game. It does not go into the waste pile.
- **Warning (2026-11-07):** in the final two, if you pick a joker when it would hand the other player the win, the screen warns you: "Careful: if you play this joker, Ben can play their last card unopposed and win the round." It only uses what everyone can see (card counts), so it shows when you're leading and the other player holds one card, or when they've just played their last card. It doesn't show when the other player's hand is one normal card plus jokers, because that would give away that they hold a joker.
- **Last two players, jokers always allowed (2026-11-07, afternoon):** There is no block on jokers in the final two; each player plays the trick how they like. Example, both players on a joker and one normal card:
  - Joker then normal card: the player who played the normal card has played their last normal card, so their joker is thrown away and they go out and **win** (their last card met no normal card).
  - Joker then joker: missed round; the first player leads again, and both then play their last normal card.
  - Normal card then normal card: both play their last card in the same trick: the lower card, or the slapper, wins.
  - Normal card then joker: the first player's last card met no normal card, so they go out and win.
  - *Replaces* this morning's "no jokers while the other player is on their last normal card" and its joker-answers-joker exception.
- **Last two players, one joker played:** If one of the two players starts the trick with a joker, it is still the same trick: the other player may play any card they want (or a joker, see below). If they play a normal card, they lead next. The screen says it's the same trick, and the button says "Play any card".
- **Last two players, both play a joker in the same trick:** This counts as a missed round. The player who played first leads again. A "Missed round!" pop-up says so.
- *Removed 2026-11-07:* "a joker as your last card takes you out" and "both down to a single joker share second-last place". Neither can happen now, because nobody can hold only jokers.

---

## 8. Pause

- **Host** can pause and resume the game at any time during a round.
- **Other players** can request a pause. The host approves or declines.
- A pause freezes the game on every player's phone.
- **No time limit by default.** The host can optionally set a time limit for a pause.
- **No votes during a pause.** Votes only happen before a round or on the results screen, and neither is in progress during a round.
- **While paused:** Pending pause requests are cleared, and no new pause requests can be made until the game resumes.

---

## 9. Scoring, the target score, and the Ultimate Round

After each round, points are awarded by finishing position. The first player out is 1st. The last player holding cards is last. A forfeit counts as last place.

| Players | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th |
|---|---|---|---|---|---|---|---|---|
| 2 | +2 | +1 | | | | | | |
| 3 | +2 | +1 | 0 | | | | | |
| 4 | +2 | +1 | 0 | −1 | | | | |
| 5 | +3 | +2 | +1 | 0 | −1 | | | |
| 6 | +3 | +2 | +1 | 0 | −1 | −2 | | |
| 7 | +3 | +2 | +1 | 0 | −1 | −2 | −3 | |
| 8 | +4 | +3 | +2 | +1 | 0 | −1 | −2 | −3 |

### Results screen
- Appears after every round.
- **No timer.** The host decides when to move on to the next round.
- **Ready up:** Players can tap "ready" to show the host they are ready. Ready status is visible to the host. The host still decides when to move on.
- Votes (target score, Ultimate Round) happen here, and only here, after a round.

### Target score (the points goal)
- The **target score** is a number of points that players agree on by vote. It is the goal the game is played towards.
- The vote happens on the results screen, between rounds. Majority rule.
- **Who proposes it:** Any player can propose a target number, which starts the vote.
- **When:** Before round 1 starts (during the deal, or before the host starts round 1), or on the results screen after any round.
- **Minimum (decided 2026-11-07):** a proposed target can't be lower than the current highest score. If it equals the highest score, that player has reached it, so the Ultimate Round vote starts straight away (below).
- **Once agreed, it's fixed.** After a target vote passes, no more target votes can be called for the rest of the session. A failed target vote can be tried again. No target votes once the Ultimate Round has been agreed.
- If the target score is set and a player reaches it, a vote on the Ultimate Round starts.
- If no target score is set, the game does not end because of points. The Ultimate Round can still be triggered (below).

### Ultimate Round
- **What it is:** One final round, played outside the score. It does not add or remove any points.
- **Who can trigger it:** Any player, on the results screen after a round. It is never triggered mid-round.
- **How it's decided:** Everyone votes. Majority rule. If no majority, the host decides.
- **Target reached:** When a player reaches the target score, a vote on the Ultimate Round starts automatically.
- **Session ends:** The session ends after the Ultimate Round.
- **Titles:**
  - **Ultimate Winner:** 1st place in that round.
  - **Ultimate Loser:** Last place in that round.
- **The titles have no number, but they outweigh scores.**
  - The **Ultimate Winner** beats the highest score when deciding the game winner.
  - The **Ultimate Loser** ranks last overall, below every score.

### End of game
- **Ultimate Round played:** The session ends after it. The Ultimate Winner is the game winner. If no Ultimate Winner is recorded, the highest score wins.
- **Target reached and the Ultimate vote fails:** The session ends and the highest score wins.
- **No target, no Ultimate Round:** The host ends the session from the results screen. Scores are recorded from that point.
- **A draw for the top score (decided 2026-11-07):** whenever the game would end on points with two or more players sharing the top score, it doesn't end straight away:
  1. A pop-up says it's a draw, and **everyone votes** on an Ultimate Round to settle it (normal voting rules; with 2 players, both must agree).
  2. If it's a no: a "**No one's a winner! Coward!**" pop-up, then one more vote on the Ultimate Round.
  3. If it's a no again: the game ends and the tied players share the top score ("Draw: Amy & Ben share the top score").
  - If the target was reached and the automatic Ultimate vote failed with a drawn top score, that failed vote counts as the first offer: the "Coward!" pop-up and the second chance come next.
  - If the Ultimate Round is agreed, it's played as usual and its winner wins the game.

---

## 10. Game record and profile history

### Game record
When a session ends, the full record is saved.

- **Contents:**
  - Date and time, and the number of players.
  - Each player's profile name and session name.
  - Joker rule on or off.
  - For each round: finishing order, points awarded, and running totals.
  - Target score, if one was set.
  - Ultimate Round: whether it was played, its finishing order, and the Ultimate Winner and Ultimate Loser.
  - Final winner and final standings, with the rule that decided them.
  - The trivia stats from section 11.
- **Where it is saved:** Each player's phone keeps its own copy, so it works offline.
- **No host export.** The host does not get a separate copy.
- **On screen (built 2026-11-07):** the game over screen says the game was saved and which profiles it was added to, with a "Share game stats" button. A **Past games** screen on the home screen lists every finished game on this phone, newest first; tap one for the final standings, share, or delete it (two taps). Deleting a past game does not change the profile totals.

### Profile history (proposed)
- When a session ends, each game is added to the profile of every player on that phone. The game is stored under the profile name, and the session name stays in the game record.
- Each profile keeps running totals:
  - Games played.
  - Points scored in total.
  - Round wins and round losses (normal rounds only; the Ultimate Round has its own titles).
  - Ultimate Winner and Ultimate Loser titles.
  - Times finished in the bottom two of a round.
  - Times slapped, and times slapped others.
  - Slapped by most, and slapped most (overall, across every saved session).
- **On screen (built 2026-11-07):** tap a profile on the profiles screen to see its totals, slapped by most and slapped most, and a "Share profile stats" button.
- **Limit:** Profiles are stored on each phone. A profile's history lives only on the phone that holds that profile. There are no accounts, so one person's history on another phone is separate.
- **Confirmed.**

### Stats export (proposed)
- **What can be exported:**
  - **Session stats:** The game record and the per-player stats from the session (section 11).
  - **Profile stats:** The overall totals for one profile (above).
- **How:** A button on the results screen (session stats) or on the profile (profile stats). It opens the phone's share sheet so the stats can be saved to Files, sent to a group chat, or shared elsewhere.
- **Works offline.** Nothing is uploaded by Pubby. The phone's share sheet does the sending.
- **Format:** CSV only (opens in a spreadsheet). Confirmed.
- **If the phone can't share a file** (some browsers, and the private test link): the CSV is shown as text with Copy and Download buttons instead.

### Accounts (not in v1)
- Accounts would let one person's history follow them across phones. This needs a hosted backend, a sign-in method, and cloud storage.
- Sign-in needs internet. Local play over Wi-Fi or a hotspot would still work offline, and profile history would sync when online.
- Trade-offs are listed in `CODE.md`, section 6b. Decision deferred.

---

## 11. Results screen trivia

The trivia shows on the results screen after every round. It has no effect on scores.

### Core trivia
- **Most slapped:** The player who has been the slapped player the most times in the session so far.
- **Most slapper** (shown as "Top slapper"): The player who has made the most slaps in the session so far.
- **Rivals:** For each pair where one player (the slapper) has slapped another player (the slapped) more often than any other pair, shown by session name. If several pairs tie, all of them are shown. Example: "Speedy slaps Ferrari most."
- **Per player, this session:**
  - **Slapped by most:** The player who has slapped this player the most times.
  - **Slapped most:** The player this player has slapped the most times.
  - Shown for every player on the results screen, so each person can see who gets them and who they get.
- **Overall (profile history):** The same two stats, across every session saved on that phone, shown on each profile (section 10).

### Other fun stats
- **Always fighting for survival:** The player who has finished in the bottom two of a round the most times in the session so far. The Ultimate Round is not counted.
- **Biggest pick-up:** The most cards picked up in a single slap.
- **Most forfeits** in the session.
- **Most reshuffle votes** called.
- **Slowest reaction** in a Reaction Tap.

---

## 12. Multiplayer and offline

- **Platform:** Phones only. Web app, installable and usable offline (PWA).
- **Offline play:** Single-device "pass and play" needs no network at all.
- **Version number:** shown at the bottom of the home screen and the quick rules ("Version 1.0"). Big changes bump the first number (1.x → 2.0), small changes the second (1.0 → 1.1).
- **Touch:** no pinch or double-tap zoom, and no pull-down-to-refresh.
- **Back gesture (Android):** closes an open sheet (quick rules, share text, game menu) first. Profiles, past games and new game setup go back one screen. During a game it does nothing (use the game menu to go home). On the main menu it asks "Exit Pubby?" (Stay / Exit); a second back gesture exits. Phones only let a web app catch the back gesture after the screen has been touched once, so swiping back straight after opening Pubby still closes it.
- **Exit Pubby (version 1.4, user's request 2026-11-07):** an "Exit Pubby" button on the main menu works on every phone (iPhones have no back gesture). It asks "Exit Pubby?" (Stay / Exit). Pubby tries to close; phones often don't let a web app close itself (iPhones never do), so it then shows "See you next time!" with how to leave on that phone (iPhone: swipe up from the bottom edge, or close the Safari tab; Android: swipe back or tap Home) and an "Open Pubby again" button. Coming back from the app switcher shows the main menu. A saved game is kept.
- **Installing (Phase 3):** Pubby is hosted on GitHub Pages. Open it once with internet, then add it to the home screen (Samsung Internet, the user's browser: menu ☰ > Add page to > Home screen; Chrome: menu > Add to home screen or Install app; iPhone Safari: Share > Add to Home Screen). It opens full screen with the Pubby icon and works with no signal from then on. Updates download by themselves and show the next time Pubby is opened; saved games and profiles are kept.
- **Multiplayer:** Players join from their own phones on the same local network (Wi-Fi or a phone hotspot). No internet is needed.
- **Joining:** Phones connect directly (WebRTC), with no server and no internet (decided 2026-11-07: phones only). For each player: the host's phone shows a QR code, the joining phone scans it and shows its own QR code, and the host's phone scans that back (two scans per player). See `CODE.md` section 4a.
- **Pass-and-play** stays as its own mode on one phone.
- **Connection test (versions 1.3 to 2.1, removed in 2.2 at the user's request 2026-11-08):** a "Connection test (two phones)" link on the home screen that linked two phones with the two scans and showed the round trip time. It proved the WebRTC plan (user's test 2026-11-07: worked flawlessly Android + Android and Android + iPhone on a phone hotspot, mobile data on and off). The lobby now does the same job.
- **No zoom (version 1.5):** pinch zoom is blocked on every part of the screen. If Samsung Internet's "Manual zoom" setting (Settings › Accessibility) is on, the browser allows zoom on every site and Pubby can't stop it.
- **Network lobby (version 2.1, Phase 4 slice 1):** "Play on several phones" on the main menu (the one-phone game is now "New game · one phone"). Host a game or Join a game, then "Who's on this phone?" (a saved profile or a new name). The host taps "Add player" for each phone and the two phones scan each other (the host's code is also a link for a Camera app). Every phone sees the same seat list and settings, with Host and You tags. Each player can set a name for this game on their own phone. The host orders the seats, removes a player (asks first), sets the joker rule and pause limit, and starts. Start needs at least 2 players and no two players with the same name. Phones on different Pubby versions can't join each other. Leaving or closing asks first. **Quiet phone (user confirmed 2026-11-08 13:30):** a phone the host hasn't heard from for 20 seconds (screen locked, switched app, out of Wi-Fi range, Pubby closed) loses its lobby seat and is added again with two scans; rejoining a seat during a game is slice 4. **Still to confirm:** the hosting phone is always the host (no "Make host" in a network game; asked again 2026-11-08, no answer yet, so it stays this way). Start begins the game on every phone (version 2.3).
- **Network play (version 2.3, Phase 4 slice 2):** every phone shows its own cards and the table; no pass-the-phone screens. The dealer deals from their own phone (the others watch "X is dealing"); each phone plays its own cards on its turn, and the glowing seat shows whose turn it is. Slaps, the final two (pick up or forfeit), HAHAHA!, going out, round over and every other pop-up show on every phone, with each phone's own sounds. Each phone does its own hidden swap and Reaction Tap at the same time, and answers votes on its own phone (YES / NO; the host decides with no majority). After the deal everyone looks at their own cards and the host starts the round. After a round every phone shows the podium; the host taps Next round or End the game. At the end the game is saved on every phone, each to its own player's profile. A phone can't make a move for someone else or out of turn: the host's phone refuses it and says why.
  - **Version 2.5 (slice 3, built 2026-11-12, awaiting the user's phone test):** any player can call the reshuffle vote, propose a target and ask for the Ultimate Round from their own phone (votes are open; a reshuffle, target or Ultimate vote needs the same rules as in pass-and-play). Take-cards requests show who asked whom on every phone (never the cards). The host pauses straight away; other players ask, and only the host resumes or sets the time limit. A timed pause counts down on the host's clock, so every phone shows the same time. Ready-up: each phone readies its own player, and every phone shows who is ready. **Slice 4:** rejoining after a lost connection, and saving the game to carry on later. Until then, if a phone loses its link or leaves, every phone says so and the host closes the game.
  - **Version 2.4:** reactions sent to every phone (they rise from the sender's seat with their name; the sender sees its own as before); the 😂 button shows from the start of the game until game over. Other phones see a gold "host" line wherever the host decides: in the lobby "Cat is adding a player…" / "Cat is setting up the game"; in the game "Cat (host) is deciding: when to start the round", "…: next round or end the game", "…: when to start the Ultimate Round", "Cat (host) is deciding the vote" (no majority). The shuffle now shows at the start of a network game.
  - **Decided for 2.4 (user 2026-11-08 17:55):** players sit around the table (you at the bottom; in one-phone games, whoever holds the phone), in network and one-phone games. Reactions (emoji and catch-phrases) show on every phone, from the start of the game until it ends. Other phones see a "host is deciding / setting up" line wherever the host makes a decision.
  - **Menu in a network game:** the host has "Close the game" (closes it on every phone), other phones "Leave the game" (both ask with a second tap). A network game is not saved on the phone and never replaces a one-phone game saved there.
- **Own phones only:** in a network game every player uses their own phone (no shared seats). New players can only join in the lobby; after the start, only a dropped player can rejoin their own seat.
- **Dropped phone:** the game pauses for everyone until the player rejoins with the two scans. If they don't come back, the host can remove them: their cards leave play (not into the waste pile), they take last place in that round, and later rounds carry on with fewer players (scoring table for the new count; one player left ends the game).
- **Host's phone drops:** no host transfer. The game is saved on the host's phone; the host opens Pubby, taps "Carry on", and everyone rejoins with the two scans.
- **Votes in network games are open:** everyone sees who voted what. **Live (user 2026-11-12):** each player's YES or NO shows on every phone the moment it's cast. One-phone votes stay secret.
- **Take-cards in network games are public (user 2026-11-12):** every phone sees who asked whom and the answer (agreed, refused, withdrawn), so the leader knows why the trick can't start yet. Which cards moved is still never shown. One-phone games keep the request private (section 4.2).
- **What's shown on screen:** Each phone shows only its own hand and public information, including the host's phone. The host's screen never displays other players' hands.
- **What's held in memory:** The host's phone holds every hand in memory, because it runs the game. This is accepted for v1 (see `CODE.md`, section 5).
- **Reactions in multiplayer:** 😂 and catch-phrases sent from one phone appear on every phone, showing who sent them and floating in from that player's side of the table (section 4.1).

---

## 12a. Look and feel (target for the real game UI)

The user wants a polished card-table look, like popular online card games:
- A green felt table filling the screen.
- Other players placed around the table, with their cards shown face down as card backs, their name, and a score badge.
- Your own hand at the bottom, fanned, with big readable cards. Cards you can't play are greyed out.
- The current trick in the middle of the table, each card in front of the player who played it.
- Round icon buttons for home, quick rules (?), and sound.
- Animations: dealing cards out to each player, cards sliding to the middle when played, the trick sweeping to the waste pile or to the slapped player, the SLAP! pop-up, and vote result pop-ups.
- Pubby's own design: no copying another game's artwork, logos or card designs.

**Round table (version 2.4, user approved the mockup https://claude.ai/artifact/RBHyfJN8dkByCmMG9aCe6B on 2026-11-08 18:43):** during the shuffle, the deal, play, the end of a trick and picking who leads, the players sit around an oval table. The bottom seat is this phone's player in a network game; in a one-phone game it's whoever holds the phone (the dealer while dealing, the player whose cards are shown, the next player on a pass-the-phone screen). The others sit clockwise in play order. Each seat shows the name, a small fan of card backs with the count (or the place once out), the host star and the Deals tag; the glowing seat is whose turn it is. Cards played this trick lie in front of whoever played them; the waste pile (or the deck while dealing) is in the middle. Other screens (swap, votes, results) keep the row of names.

**Less text, more visual (decided 2026-11-08 09:27, all 25 changes in the mockup https://claude.ai/artifact/FdJS1U4j3LroH7G9SZuYej):**
- **One icon style:** thin line icons everywhere, no emoji (the 😂 reactions button is the only one). Places are coloured badges: 1st gold, 2nd silver, 3rd bronze, Last red.
- **Top bar:** menu, round number ("R1", or Ultimate) and pause as icons on one line; the take-cards button sits there too, before a trick, when someone can ask. Sound and ? on the right.
- **Explanations live in the ? rules**, which open at the card for the screen on show (dealing, playing a trick, the last two, votes, scoring…).
- **Pop-ups:** a line icon, one big word and a short line; they close by themselves after about 2.5 seconds with a timer bar (tap to skip). SLAP! and HAHAHA! keep their cartoon look and 4 seconds.
- **Dealing:** two chips ("2 jokers", "1 hidden deck" with an i that opens the rules), the deck with its count, "Tap a name to deal", and Manual / Auto / Deal all chips.
- **Before the round:** three picture buttons: Look at cards, Deal again? (reshuffle vote), Start (host).
- **Target score:** one slim row "Target score · none · Propose" on the before-the-round screen (round 1) and the results screen; not in the top bar or on the dealing screen. Propose opens the points picker, then who is proposing.
- **Votes:** the question with its icon ("Deal again?", "Play to 20?", "Ultimate Round?"), who asked, "secret vote", big YES / NO.
- **Swap:** "Swap up to 4?", your cards, Swap / Keep.
- **Pass the phone:** phone and arrow, the name big, one "I'm Dan" button.
- **Playing:** the led suit as a big faint symbol on the felt; the glowing seat shows whose turn it is; the last trick as tiny cards (the slapped player's ringed in red); the Play button says "Play 2♥"; only playable cards are bright; no "X's cards" heading.
- **Results:** a podium (1st, 2nd, Last; top three and a short list for bigger games) with round points and total; trivia as small award cards (Most slapped, Top slapper, Rivals) with More for the rest and the slapped-by table; Ready name chips with a tick; Next round with an Ultimate button beside it.

The testbed (`CODE.md` section 8a) is only a rules test tool and does not use this look.

---

## 12b. Sound and music (Phase 5, built in version 2.0)

Chosen from a sample page the user listens to on their phone: **Pubby sound samples**, https://claude.ai/artifact/Q54YRtsC8xME6LN7uAHzvZ (a private Claude artifact owned by the user; open it, or read it in a new chat, to hear and reuse every sound). All sounds are made live in the browser (Web Audio), so there are no audio files, nothing is borrowed, and it all works offline.

**Feel:** a cosy, warm pub card night: cheeky and fun, never sentimental. Music sits quietly under the game; effects are comic.

**Music (decided 2026-11-08 00:12): "Fireside Piano" soundtrack.** One instrument theme for every screen (soft felt piano, upright bass, brushes) and one shared Pubby tune in every track, so it all sounds like one game:
- **Menu and lobby:** slow and settled (66 bpm), the Pubby tune played slowly.
- **During play:** a softened boogie woogie (112 bpm), two 12-bar choruses, the Pubby tune in the second chorus, a turnaround before it loops.
- **Ultimate Round:** heartbeat kick and a minor-key piano pattern, the tune in a minor key from the second half.
- **Results:** light and bouncy (104 bpm), the tune again. Not sentimental.

**Fireplace crackle (decided 2026-11-08 07:29):** yes, kept quietly under the music, as on the sample page.

**Sound effects (all decided 2026-11-08 07:29):**
- **SLAP!:** the **Huge** version.
- **Paused:** Click (one soft click down). **Resumed:** the matching click up.
- **Take-cards request:** Knock knock (two knocks on a door).
- **Every other effect exactly as on the sample page:** tap, shuffle, deal, play a card, picked up the pile, trick done, joker, got away, last place (sad trombone), round winner, Ultimate Winner, Coward!, vote result, Reaction Tap countdown, 😂 reaction, your turn, not allowed.

**Sound at start (decided 2026-11-08 07:29, changed 08:56):** music starts switched off, effects on; both start at a lower volume than the sample page.

**After the first test (2026-11-08 08:22, approved 08:24):** no "ding" after a card (the your-turn chime is dropped); effects play one at a time instead of piling up, and the music dips under the big ones; buttons in the game don't click (the move has its own sound).

**Animations (2026-11-08 08:24):** when a trick ends, it stays on the table for a moment, then the cards slide to the waste pile, or, after the SLAP! pop-up, into the slapped player's seat. Before every deal (game start, new round, after a reshuffle vote) the dealer's deck is shown being shuffled, with the shuffle sound.

**HAHAHA! (2026-11-08 08:56):** in the final two, when a player's last card is higher and they must pick up the waste pile or forfeit, a pop-up in the SLAP! style shows a big "HAHAHA!" and "[lower player] played a lower card than [higher player]!", with a cartoon laugh sound; it closes by itself like SLAP!. The choice panel then just says "Pick up or forfeit" with the two buttons (the explanation lines are gone).

**Less text:** decided 2026-11-08 09:27, see section 12a.

**Sound controls (decided 2026-11-08 07:29):** the sound settings can be changed at any time, including in the middle of a game, not only from the menu: music on/off and volume, effects on/off and volume. They open from the round sound button (🔊, 🔇 when both are off) next to the quick rules button, on every screen, also over pop-ups and the pause screen. Changing them never pauses the game or affects other players' phones. Settings are kept on the phone.

**Earlier samples the user turned down:** Pub Piano, Knees-Up, Saloon Rag, Skank Night, Darts Night (menu: wanted slower and cosier); Back Room, Bossa Table, Smoky Corner (play); Last Orders (results: "I don't need it sentimental"), Scoreboard, Closing Time Shuffle, Victory Lap; the two other cosy sets (Snug Guitar, Lamplight Keys). The user liked the original Ultimate Round track and Boogie Woogie; both live on in the Fireside Piano set. Paused three-note bells and the first take-cards sound were turned down.

---

## 12c. Single player: computer players (PLAN, 2026-11-12; answers given, build plan in `CODE.md` 9m; slice A, the AI brain, pushed as 2.6.0; slice B, Normal level on the phone, pushed as 2.7.0; slice C, Easy, Mixed and names, built as 2.9.0)

**Goal:** one person plays Pubby on their own phone against computer players that play like real people: they think for a moment, make human-sized mistakes on easier levels, react to slaps, and **never cheat**. A computer player only ever knows what a person in its seat could know.

### What a computer player may know (the "fair play" rule)
A computer player knows exactly what a person sitting in its seat could see or remember, and nothing else:
- **Its own hand.** Never anyone else's, never the deck still to deal, never the hidden decks, never the waste pile order beyond what it saw.
- **Every card played face up** in a trick (everyone at the table sees these).
- **Cards a player picked up after a slap.** The trick was face up, so everyone saw which cards went into the slapped player's hand. A sharp person remembers that "Ben is holding the K♥ he picked up".
- **Missing suits:** declared at the start of the round, and shown by a slap (a player who slaps on hearts had no hearts at that moment, until they pick up hearts).
- **Card counts, scores, places, votes, take-cards requests and answers** (all public in a game with computer players, see below), and how many cards moved in a take.
- **The joker count** shown at game start, and every joker seen played.
- **Not known:** which cards were swapped out or swapped in (hidden swap), which cards moved in a take-cards request (only how many), and anything in the hidden decks.

How much of this it remembers depends on its level (Easy forgets a lot, Hard remembers everything a good card counter would).

### Levels
| Level | Remembers | Plays like |
|---|---|---|
| **Easy** | Its hand, the current trick, declared missing suits. Forgets most played cards after a trick or two. | A casual player. Follows the obvious rules of thumb (play low when a slap could come), sometimes gets it wrong, holds jokers too long or wastes them. |
| **Normal** | Every card played this round, who picked up what, who is out of which suit. | A decent regular. Plays safe when a slap is likely, dumps high cards when it's safe, saves jokers for dangerous moments, chooses slap cards sensibly. |
| **Hard** | Everything Normal remembers, plus careful counting of what's still out. | A strong player. Before each move it imagines many possible ways the unknown cards could be spread (only ones that fit what it knows) and picks the move that works best across them. It still can't see cards; it can only guess well. |

**Choosing levels (user 2026-11-12: "Mixed"):** in setup, pick **All Easy**, **All Normal**, **All Hard** or **Mixed**. Mixed gives each computer player a random level; tap a computer player's level chip to change just that one. Each computer player keeps its level for the whole game. *Status (slice C, 2.9.0):* All Easy, All Normal and Mixed are on the setup screen. All Hard is on the setup screen, and Mixed includes Hard (slice D, pushed as 2.13.0). Hard beats Normal in the arena by 0.242 places over 2000 games; it still needs the phone test (`CODE.md` 9m.9).

### How they play (rules of thumb used by every level, tuned by level and personality)
- **Following suit:** if someone still to play might be out of the led suit (known missing suit, or that suit is nearly gone), play your **lowest** card of the suit so you're not the one who picks up the slap. If everyone still to play surely has the suit (or you're last), it's safe to get rid of a **high** card.
- **Leading:** lead a suit nobody is known to be out of, preferably one with plenty of cards still out; lead high when it's safe to clear big cards, low when it's risky. Avoid leading into a known missing suit.
- **Slapping (when out of the led suit):** pick the card you most want rid of: usually a high card, or the last card of a short suit (to become out of that suit and slap again later).
- **Jokers:** played instead of following when following would very likely make you the one who picks up a slap, or to get through a dangerous trick near the end. Kept, not wasted, early in the round. In the final two, used the way a good player would (section 7 cases), including the "missing round" case.
- **Final two:** aims for its last card to be lower than the other player's. When its last card was higher: **pick up** the waste pile if it's small or it still has a good chance; **forfeit** if the pile is huge and the scores make last place acceptable.
- **Hidden swap (2 and 3 players):** swaps away high cards and tries to empty a short suit (to slap later and lead first). Keeps a good hand.
- **Reshuffle vote:** calls or votes yes when its hand is bad (lots of high cards, no short suits); votes no with a good hand.
- **Target score and Ultimate Round votes:** says yes when it helps it (ahead for a target, behind for an Ultimate Round), with some personality on top.
- **Take-cards requests:** answering, it almost always agrees (giving your cards takes you out with the next place); asking, it only asks when it's likely to come last anyway and a bigger hand can't make things worse. Taking adds the other player's cards to its own hand (section 4.2).
- **Choosing who leads** (as last round's winner): usually picks the round loser or whoever has the most points, to keep the pressure on.
- **Dealing (when it's the dealer):** auto deal from a random first player, so you watch the cards fly round as usual.
- **Reaction Tap:** a human-like reaction time (about 0.2 to 0.45 seconds, sometimes slower, now and then a false start). It never sees your time first.

### Feeling like real people
- **Thinking time:** each computer player waits before playing, about 0.6 to 2.5 seconds: quick when there's only one card it can play, longer for hard choices. A speed setting (Relaxed / Normal / Fast) scales it.
- **Personalities:** each computer player gets one: *Careful* (plays safe, hoards jokers), *Reckless* (dumps high cards early, takes risks), *Counter* (plays the odds closely), *Wind-up* (sends the most reactions). Personality nudges choices; it never lets a player see cards.
- **Reactions (on by default, user 2026-11-12):** computer players sometimes send 😂 and catch-phrases after a slap (more when they did the slapping, or when you got slapped), from their seat, like a network game. An off switch in setup.
- **Names (user 2026-11-12):** each computer player gets a random name from a fixed list of names from many cultures (South Asian, Arabic, African, East Asian, European, Latin American and more, not just Western names), never the same as another player in the game. You can edit any computer player's name in setup. A small computer icon sits next to the name so it's never mistaken for a person.
- **Mistakes (Easy, a little on Normal):** forgetting played cards, misjudging who is out of a suit, now and then a careless card. Never an illegal move.

### How a single-player game runs
- **Main menu:** "Play against the computer". Pick your profile, how many computer players (1 to 7, so 2 to 8 players in all), level, speed, joker rule and pause limit. You are the host and sit at the bottom of the table.
- **Screens:** like a network game on your phone: your cards always shown (no pass-the-phone screens), the round table, glowing seat for whose turn it is, "Ben is thinking…" while a computer player decides.
- **Votes** are open (live ballots, as in network games): you see each computer player's vote appear.
- **Take-cards requests** between any players are shown to you (who asked whom, never which cards), as in network games.
- **Pause:** you pause straight away (you're the host); the computer players freeze. Ready-up: they're always ready; you move on.
- **Saved and carry on:** the game is saved on the phone as you go, like a one-phone game, so you can close Pubby and carry on.
- **History and stats (user 2026-11-12: separate):** finished games appear in Past games marked "vs computer". They never change your normal profile totals; each profile gets separate "Vs computer" totals, shown in its own section of the profile screen. Computer players never become profiles.
- **Offline:** works with no signal; nothing is sent anywhere.

### Computer players with other people (user 2026-11-12: "put it in the plan")
Built after single player works (`CODE.md` 9m slices E and F):
- **One phone, people and computer players:** the one-phone setup gets "Add computer player". The phone is only passed between the people; computer players act on their own while the table shows "Ben is thinking…". Votes stay secret, as in every one-phone game; computer players vote secretly too. Take-cards requests stay private to the two players, as in one-phone games.
- **Network games with computer players:** in the lobby the host can add computer players to empty seats. They run on the host's phone, see only what a joining phone would see, and follow the network rules (open votes, public take-cards). If the host's phone leaves, the game ends as now.
- In both, a game with any computer player counts as a "vs computer" game for stats.

### Decided (single player, user 2026-11-12)
1. Levels: Mixed is offered (plus All Easy / All Normal / All Hard), and each computer player's level can be changed.
2. Names: fixed list of names from many cultures, picked at random, editable. *Status (slice C, 2.9.0):* each computer player's name is editable on the setup screen, and Start is blocked while two players share a name (the person's name included).
3. Reactions from computer players: on by default, with an off switch.
4. Stats: separate "vs computer" totals; normal profile totals are never changed by these games.
5. Mixed games: computer players with people on one phone, and in network games, are in the plan (built after single player).
6. Order: single player (this whole section) is built **before** network slice 4 and the multiplayer release.
7. Version numbers: the user doesn't mind which number; every pushed code change gets a new version and the user is told the new number (`CLAUDE.md` rule 8).

## 13. Quick rules (in-game help)

- **What it is:** A short, simplified rules guide inside the app.
- **When:** Any player can open it at any time: in the lobby, during the deal, mid-round, during a vote, or on the results screen.
- **Private and real time:** It opens only on that player's own phone. It does not pause the game, notify anyone, or change anything for other players. The game carries on underneath, and the player's turn prompt still appears if it becomes their turn.
- **Layout:** One short card per topic, so a player can jump straight to what they need. Topics:
  - How to win a round
  - Playing a trick and following suit
  - Slaps
  - Jokers
  - Missing a suit and Reaction Tap
  - The last two players and the waste pile
  - Hidden decks and the swap (2 and 3 player games only): how the hidden decks work, and that jokers can be in them
  - Votes (and asking instead of voting with 2 players), the target score minimum, the Ultimate Round, and a draw at the end
  - Scoring table
- **Content:** Kept in `src/content/quick-rules.md` so it is easy to edit. It must match this spec.

---

## Open questions (summary)

Answer these in any order. Each one unblocks part of the build.

None. (2026-11-07 20:38: the multiplayer questions were answered; see section 12 and Decided.)

### Decided (for reference)
- 2026-11-12, single player (section 12c): Mixed levels plus All Easy / Normal / Hard; fixed random names from many cultures, editable; computer reactions on by default; separate vs-computer stats; computer players with people on one phone and in network games are in the plan; single player is built before network slice 4; version numbers: any new number per pushed change, just say it.
- 2026-11-12, network slice 3: votes in network games show live (each ballot on every phone as it's cast); take-cards requests in network games show who asked whom on every phone (answers too), never which cards.
- 2026-11-08 (09:27), look: all 25 less-text changes approved (section 12a): line icons, no emoji, explanations in ? rules, self-closing pop-ups, target score row on the before-the-round and results screens, podium results.
- 2026-11-08 (07:29), sound: Huge SLAP!; fireplace crackle kept; every other effect as on the sample page (Resumed = click up); sound on by default with music and effects both quieter; music and effects on/off and volume can be changed during a game from the sound button (section 12b).
- 2026-11-07 (20:36), multiplayer: every player uses their own phone (no shared seats); a dropped phone pauses the game for everyone and can rejoin its seat; the host can remove a player who doesn't come back, and their cards leave play (not into the waste pile); no new players once the game has started, only rejoining; votes are open (everyone sees who voted what).
- 2026-11-07 (20:38), multiplayer: a removed player gets last place in that round (only if they don't rejoin); later rounds carry on with fewer players, using the scoring table for the new number of players, and the game ends if only one player is left; no host transfer: if the host's phone drops, the game is saved on it, the host opens Pubby and taps "Carry on", and everyone rejoins with the two scans.
- 2026-11-07 (late afternoon): take-cards help goes to the asked player (intended); jokers can be in the hidden decks (note on screen and in the quick rules); 2-player games ask instead of voting (both must agree); target can't be lower than the highest score; a drawn top score at the end gets an Ultimate Round vote, then "Coward!" and a second chance, then shared scores; joker lead is the same trick in every game size; warning before a joker that hands the other player the win in the final two.
- Take-cards request (section 4.2): take all of another player's cards, unseen; only before a trick starts and decided before it starts (not shown during a trick); one request at a time per player; the asked player agrees or refuses (no host approval for now); if several ask the same player, that player chooses who gets them; no cost; the giver goes out with the next place; not with only two players left. (Changed 2026-11-07: was "any time, unlimited, moves between tricks".)
- If nobody calls a reshuffle vote, the host taps "Start the round". After a reshuffle vote, the round carries on by itself.
- A vote is decided as soon as more than half agree. The host can close a vote early; with no majority, the host decides.
- Any player can propose a target score. It can be voted on before round 1 starts or on any results screen. Once agreed it is fixed, and no more target votes appear (also none once the Ultimate Round is agreed).
- The Ultimate Round is not counted in round wins, round losses, or bottom-two stats.
- Final two (all game sizes): the pick-up-or-forfeit choice only applies to a player whose last card is higher than the other player's. A lower last card or a slap wins. After picking up, the forfeit option stays.
- Jokers are played on your own turn, even if you could follow suit.
- If nobody who played the led suit still holds cards, the next player clockwise still holding cards leads.
- Going out is checked at the end of the trick: a player who played their last card and is then slapped picks up and stays in.
- Both final players go out in the same trick: lower card or slapper wins.
- Nobody can hold only jokers: playing your last normal card throws away any jokers left, and that card is your last card (also when picking up the waste pile afterwards). A joker is never a last card. (2026-11-07: replaces "a joker as your last card takes you out" and the shared second-last place on jokers.)
- Final two: jokers are always allowed; a joker led is still the same trick; both jokers is a missed round and the first player leads again; a last card that meets only a joker wins. (2026-11-07, afternoon: replaces "no jokers while the other player is on their last normal card".)
- Dealing starts in manual mode. Manual deal is even: a player who has had a card is greyed out until everyone has one, then all open up (never two in a row). (2026-11-07)
- The hidden swap is offered every round in 2 and 3 player games.
- Every round starts with the full deck. Hidden decks (2 and 3 players) are set aside every round, and the swap is offered every round.
- If the highest card's player is out, the next highest card of the led suit leads.
- A joker led as the first card of a trick: the next player clockwise starts the trick with any card.
- A majority of no votes fails the vote; the host only decides on a tie or too few votes. Every vote result shows a "Majority says… / Host says…" pop-up.
- Hidden decks are never shown on any screen. Only the swap option appears.
- Any player can open the quick rules at any time, on their own phone only (section 13).
- One standard 52-card deck for every player count. Ace is high.
- Hidden decks are dealt first, automatically and face down, one player's share each. The dealer deals only to players.
- The old "peek and take-cards" wording was confusing and was removed. The real idea is the take-cards request (section 4.2).
- Votes happen only before a round (reshuffle) or on the results screen (target score, Ultimate Round). No votes during a round or a pause.
- The results screen has no timer. The host moves on. Players can ready up.
- The target score is a points goal agreed by vote. Reaching it starts an Ultimate Round vote.
- If the target is reached and the Ultimate vote fails, the session ends and the highest score wins.
- With no target and no Ultimate Round, the host ends the session from the results screen. Scores are recorded from that point.
- The Ultimate Round is one final round, outside the score. It ends the session.
- Ultimate Loser ranks below all scores. Ultimate Winner outranks the highest score.
- Auto deal runs clockwise. The dealer can switch to manual during the animation.
- Any player can call a reshuffle vote. Only one reshuffle vote per round.
- A false start in Reaction Tap counts as the slowest time.
- Jokers are dealt from the player deck. The total is shown at game start. The host can turn the joker rule off at setup.
- The order of the reshuffle vote and the hidden swap does not matter.
- Pending pause requests are cleared while paused.
- No host export. Each phone keeps its own game record.
- Profile history confirmed: per-phone, including overall slapped-by-most and slapped-most stats.
- Per-session stats for every player: slapped by most, slapped most.
- Local profiles for v1. Accounts deferred to a later phase.
- Stats export is CSV only, via the phone's share sheet.
- The host's phone holds all hands in memory. Accepted for v1.
- Slap emoji: 😂 only. Catch-phrases are random.
- Trivia: most slapped, most slapper, rivals (all tied pairs shown), always fighting for survival, biggest pick-up, most forfeits, most reshuffle votes, slowest reaction.
