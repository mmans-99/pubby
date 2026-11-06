# Pubby — Game Spec

**Status:** Planning. No code yet. Items marked **OPEN** need a decision before they are built.

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
- If no majority is reached, **the host decides**.
- **Votes only happen outside a round.** There are two places they can happen:
  - Before a round starts: the reshuffle vote (section 2a).
  - On the results screen after a round: the target score vote and the Ultimate Round vote (section 9).

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
4. **Hidden swap** (section 3). 2 and 3 player games, round 1 only.
5. Missing-suit declarations and mini-game (section 5).
6. The round begins.

The order of steps 3 and 4 does not matter to the players, so the order above is fixed.

### 2a. Reshuffle vote
- **Players:** 2 to 8. Applies to all game sizes.
- **Who can call it:** Any player.
- **When:** Before every round, after everyone has looked at their cards. Once the round has begun, it can no longer be called.
- **Passing rule:** Majority vote. If there is no majority, the host decides.
- **If it passes:** The dealer of that round shuffles the cards again and deals them again. This includes the hidden decks.

### 2b. Dealing
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
  - 2 players: 2 hidden decks are drawn alongside the player deck.
  - 3 players: 1 hidden deck is drawn alongside the player deck.
  - 4 to 8 players: no hidden decks.
- **Purpose:** Players cannot work out exactly what the others hold.
- **Timing:** Round 1 only, after the reshuffle vote.
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
5. The player who played the highest card of the led suit leads the next trick.
6. A player who empties their hand is **out** and can watch the rest of the round.
7. Cards from completed tricks go to the **waste pile** (see section 6 for the exception).

The Ace of Spades has no special rule. It is an ordinary card.

### 4.1 Slap
- A slap happens when a player plays an off-suit card (step 3 above). That player is the **slapper**.
- **Effect:** The trick stops immediately. The player who holds the highest card of the led suit picks up **all the cards played in that trick**, including the slap card, and adds them to their hand. That player is the **slapped** player. They then lead the next trick.
- **Feedback:**
  - A comic-book style **"SLAP!"** pop-up appears on every screen.
  - All players can spam the laughing-with-tears emoji 😂. No other emoji for now.
  - A random catch-phrase appears with the pop-up. Starting set:
    - "Don't let the cards control you, you control the cards."
    - "Craftyyyy"
    - "You got slapped"
    - "You got slapped by a kiiid"
  - More catch-phrases will be added by the user later. The catch-phrase list must be easy to edit.

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
- **Exception (last two players only):** When only two players still hold cards, and the last card of the trick is played, the player with the higher card may either:
  - **Forfeit**, or
  - **Pick up the whole waste pile** and continue playing.
- **Forfeit:** The forfeiting player takes last place for the round's scoring (the same as a Bhabhi). The other player takes 1st place. The round ends.
- A player in this position may forfeit at any time while there are two players left.

---

## 7. Joker Rule

- **Setup option:** When the host sets up the game, they can turn the joker rule off. It is on by default.
- **Joker count (when on):**
  - 2 jokers for 2 to 5 players.
  - 3 jokers for 6 to 8 players.
- **Dealt from the player deck.** Jokers are part of the normal deal, not set aside.
- **Joker count shown:** The game shows the total number of jokers in the deck to all players at the start of the game. It is not updated during play. It is there to make players aware that jokers are in play somewhere.
- **Jokers are playing cards.** They count as cards in a player's hand, for everything, including going out.
- **Use:** A joker is a wild card. A player may play it at any time, and playing it skips their turn.
- **After use:** The joker leaves the game. It does not go into the waste pile.
- **Going out with a joker:** If a player plays their last card, including a joker, they go out and do not come last.
- **Last two players, one joker played:** If one of the two players plays a joker first, the other player may play any card they want, then they lead.
- **Last two players, both play a joker in the same round:** This counts as a missed round. The player who played first leads again.

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
  - Round wins and round losses.
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
- **Always fighting for survival:** The player who has finished in the bottom two of a round the most times in the session so far.
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

## Open questions (summary)

Answer these in any order. Each one unblocks part of the build.

None. The spec has no open questions.

### Decided (for reference)
- Peek and take-cards are not in the game. The only card exchange is the hidden swap.
- Votes happen only before a round (reshuffle) or on the results screen (target score, Ultimate Round). No votes during a round or a pause.
- The results screen has no timer. The host moves on. Players can ready up.
- The target score is a points goal agreed by vote. Reaching it starts an Ultimate Round vote.
- If the target is reached and the Ultimate vote fails, the session ends and the highest score wins.
- With no target and no Ultimate Round, the host ends the session from the results screen. Scores are recorded from that point.
- The Ultimate Round is one final round, outside the score. It ends the session.
- Ultimate Loser ranks below all scores. Ultimate Winner outranks the highest score.
- Auto deal runs clockwise. The dealer can switch to manual during the animation.
- Any player can call a reshuffle vote.
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
