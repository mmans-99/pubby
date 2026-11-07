# Pubby — Game Spec

**Status:** Phase 1 (rules engine and session layer) done. Phase 2 (pass-and-play UI) in progress. Each change is play-tested by the user before it is committed (see `CLAUDE.md`). Items marked **OPEN** need a decision before they are built.

Pubby is a multiplayer shedding card game based on Bhabhi (also called Get Away). It is played as a phone-only, offline-capable web app. The goal of each round is to get rid of all your cards. The last player holding cards is the round loser (the "Bhabhi").

---

## 1. Players and sessions

- **Player count:** 2 to 8.
- **Platform:** Phones only, for now.
- **Profiles:** Each person has a saved profile with a name. This is their default name everywhere. Profiles are stored on the phone that created them (see section 10).
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
- **Two deal modes.** The dealer can switch between them at any time, including during an auto deal.

**Auto deal**
- The dealer taps the first player's name.
- Cards are dealt one at a time, **clockwise**, moving around the table until every card is dealt.
- Each card is shown with an animation as it moves to its player. During the animation, the dealer can switch to manual dealing.

**Manual deal**
- The dealer taps a player's name, and one card goes to that player.
- The dealer repeats this for each card.

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
  - All players can spam the laughing-with-tears emoji 😂. No other emoji for now.
  - A random catch-phrase appears with the pop-up. Starting set:
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
- **Always available, unlimited, no cost:** The request button is there all through the round. A player can ask as often as they like. Asking costs nothing.
- **Timing:** A request can be tapped at any time. The cards only move **between tricks**: after one trick ends and before the first card of the next trick is played. If a trick is under way, an agreed request waits until that trick is over.
- **The next trick waits:** Between tricks, the leader can't play the first card while a request is still waiting for an answer.
- **Agreement:** Only the two players decide. The asked player agrees or refuses. The host does not approve (the user may add host approval back later). The requester can withdraw a request that hasn't happened yet.
- **Private:** Only the two players see the request. The cards moving is shown to everyone (who took from whom, and how many), never which cards.
- **The player whose cards are taken** has no cards left, so they are **out**, by the normal rules, and take the next finishing place at that moment.
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
- **Last card lower** than the other player's card, **a joker**, or **a slap**: that player goes out and **wins** the round.
- **Last card higher** than the other player's card: that player must choose:
  - **Pick up the whole waste pile** (including this trick) and play on. They lead next. They keep the option to forfeit at any time while two players are left.
  - **Forfeit:** they take last place (the same as a Bhabhi) and the other player takes the higher place. The round ends.
- **Last card answered with a joker:** there is no card to compare, so the last card wins.
- **Both go out in the same trick:** the lower card, the joker, or the slapper wins. The other takes last place.
- **Only the player who played their last card** can face the pick-up-or-forfeit choice.

---

## 7. Joker Rule

- **Setup option:** When the host sets up the game, they can turn the joker rule off. It is on by default.
- **Joker count (when on):**
  - 2 jokers for 2 to 5 players.
  - 3 jokers for 6 to 8 players.
- **Dealt from the player deck.** Jokers are part of the normal deal, not set aside.
- **Joker count shown:** The game shows the total number of jokers in the deck to all players at the start of the game. It is not updated during play. It is there to make players aware that jokers are in play somewhere.
- **Jokers are playing cards.** They count as cards in a player's hand, for everything, including going out.
- **Use:** A joker is a wild card. A player may play it on their own turn, even if they could follow suit. Playing it skips their turn.
- **Joker as the lead:** If the leader plays a joker as the first card of a trick, the joker is gone and the next player clockwise starts the trick with any card.
- **After use:** The joker leaves the game. It does not go into the waste pile.
- **Going out with a joker:** A joker as your last card takes you out **at that moment**, and you take your place in the standings. In the final two, it beats a normal last card.
- **Last two players, one joker played:** If one of the two players plays a joker first, the other player may play any card they want, then they lead.
- **Last two players, both play a joker in the same trick:** This counts as a missed round. The player who played first leads again.
- **Last two players, both down to a single joker:** Both go out on jokers. They share second-last place and both get the points for it (in a 2-player game that is 1st place, +2 each). In the Ultimate Round, both are Ultimate Loser.

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
  - **Ultimate Loser:** Last place in that round. If the final two both go out on jokers, both are Ultimate Loser.
- **The titles have no number, but they outweigh scores.**
  - The **Ultimate Winner** beats the highest score when deciding the game winner.
  - The **Ultimate Loser** ranks last overall, below every score.

### End of game
- **Ultimate Round played:** The session ends after it. The Ultimate Winner is the game winner. If no Ultimate Winner is recorded, the highest score wins.
- **Target reached and the Ultimate vote fails:** The session ends and the highest score wins.
- **No target, no Ultimate Round:** The host ends the session from the results screen. Scores are recorded from that point.

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
- **Limit:** Profiles are stored on each phone. A profile's history lives only on the phone that holds that profile. There are no accounts, so one person's history on another phone is separate.
- **Confirmed.**

### Stats export (proposed)
- **What can be exported:**
  - **Session stats:** The game record and the per-player stats from the session (section 11).
  - **Profile stats:** The overall totals for one profile (above).
- **How:** A button on the results screen (session stats) or on the profile (profile stats). It opens the phone's share sheet so the stats can be saved to Files, sent to a group chat, or shared elsewhere.
- **Works offline.** Nothing is uploaded by Pubby. The phone's share sheet does the sending.
- **Format:** CSV only (opens in a spreadsheet). Confirmed.

### Accounts (not in v1)
- Accounts would let one person's history follow them across phones. This needs a hosted backend, a sign-in method, and cloud storage.
- Sign-in needs internet. Local play over Wi-Fi or a hotspot would still work offline, and profile history would sync when online.
- Trade-offs are listed in `CODE.md`, section 6b. Decision deferred.

---

## 11. Results screen trivia

The trivia shows on the results screen after every round. It has no effect on scores.

### Core trivia
- **Most slapped:** The player who has been the slapped player the most times in the session so far.
- **Most slapper:** The player who has made the most slaps in the session so far.
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
- **Multiplayer:** Players join from their own phones on the same local network (Wi-Fi or a phone hotspot). No internet is needed.
- **Joining:** The host shows a **QR code** that other players scan to join. See `CODE.md` for the technical options.
- **What's shown on screen:** Each phone shows only its own hand and public information, including the host's phone. The host's screen never displays other players' hands.
- **What's held in memory:** The host's phone holds every hand in memory, because it runs the game. This is accepted for v1 (see `CODE.md`, section 5).

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

The testbed (`CODE.md` section 8a) is only a rules test tool and does not use this look.

---

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
  - Hidden swap (2 and 3 player games only)
  - Votes, the target score, and the Ultimate Round
  - Scoring table
- **Content:** Kept in `src/content/quick-rules.md` so it is easy to edit. It must match this spec.

---

## Open questions (summary)

Answer these in any order. Each one unblocks part of the build.

None. The spec has no open questions.

### Decided (for reference)
- Take-cards request (section 4.2): take all of another player's cards, unseen; agreed between the two players only (no host approval for now); unlimited; no cost; moves between tricks; the giver goes out with the next place; not with only two players left.
- If nobody calls a reshuffle vote, the host taps "Start the round". After a reshuffle vote, the round carries on by itself.
- A vote is decided as soon as more than half agree. The host can close a vote early; with no majority, the host decides.
- Any player can propose a target score. It can be voted on before round 1 starts or on any results screen. Once agreed it is fixed, and no more target votes appear (also none once the Ultimate Round is agreed).
- The Ultimate Round is not counted in round wins, round losses, or bottom-two stats.
- Final two (all game sizes): the pick-up-or-forfeit choice only applies to a player whose last card is higher than the other player's. A lower last card, a joker, or a slap wins. After picking up, the forfeit option stays.
- Jokers are played on your own turn, even if you could follow suit.
- If nobody who played the led suit still holds cards, the next player clockwise still holding cards leads.
- Going out is checked at the end of the trick: a player who played their last card and is then slapped picks up and stays in.
- Both final players go out in the same trick: lower card, joker, or slapper wins. Both on jokers: shared second-last place points; both Ultimate Loser in the Ultimate Round.
- A joker as your last card takes you out at that moment.
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
