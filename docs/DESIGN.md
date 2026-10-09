# Chess Uno — Game Design Document

**Version:** 0.1 (draft) · **Date:** 9 Oct 2026 · **Owner:** Prosper Olaoye

> Items marked **[Proposed]** are suggested defaults. They can be changed after playtesting. Unresolved questions are listed in [Open Questions](#14-open-questions).

---

## 1. Overview

**Chess Uno** is regular chess with one twist: at the start of every turn you **draw a card**, and the card decides how many moves you make in a row, or sets off an action like **Skip** or **Reverse**. Chess skill still wins most games, but the cards add surprise, comebacks, and new tactics.

| | |
|---|---|
| **Genre** | Strategy / board game with a card mechanic |
| **Players** | 2 (online multiplayer, Pass & Play on one device, or vs. bot) |
| **Match length** | About 10–20 minutes (10-minute clock per player) |
| **Platforms** | Web first (desktop and mobile browsers), then an Android app via Capacitor |
| **Look** | Stylized, characterful, glowing piece designs in 2D and 3D, plus a new seasonal theme every year |

**Design pillars**

1. **Chess you already know.** All standard chess rules apply. The cards change only *how many* moves you get and *who* plays which side.
2. **Big swings, fair odds.** Cards bring excitement and comebacks, and the deck is weighted so that skill still decides most games.
3. **Easy to learn.** A Duolingo-style learning path teaches both chess and the card rules in short lessons.
4. **Looks great.** A board and pieces worth showing off, with fresh seasonal sets every year.

---

## 2. Core Rules

### 2.1 Basics
- Standard 8×8 chess setup. **White takes the first turn.**
- Normal chess movement and rules: castling, en passant, promotion, check, checkmate, stalemate, and draws (agreement, threefold repetition, insufficient material, 50-move rule). Section 2.7 explains how these adapt to multi-move turns.
- Each player has **10 minutes** on their clock. **If your time runs out, you lose.** The standard exception applies: if your opponent doesn't have enough material to checkmate, it's a draw.

### 2.2 The Cards

| Card | Effect |
|---|---|
| **1** | Make 1 move this turn. |
| **2** | Make 2 moves in a row this turn. |
| **3** | Make 3 moves in a row this turn. |
| **Skip** (Cancel) | Your opponent's next turn is skipped, so you take another turn right after this one. |
| **Reverse** | You and your opponent **swap sides** on the board. If you were White, you're now Black, and the reverse for your opponent. |

Number cards only go from 1 to 3. Uno's higher numbers would allow too many moves in one turn.

### 2.3 Deck **[Proposed]**
Both players draw from **one shared 52-card deck**, weighted toward low numbers:

| Card | Count | Share |
|---|---|---|
| 1 | 19 | 37% |
| 2 | 18 | 35% |
| 3 | 5 | 10% |
| Skip | 6 | 12% |
| Reverse | 4 | 8% |
| **Total** | **52** | |

- A number card averages about **1.67 moves** (70 moves over 42 number cards). The chance of a 3 is about 12% per number card.
- **Rules v2 (playtesting: "cards feel too swingy"):** the original mix was 18×1, 15×2, 9×3 (about 1.79 moves, 21% threes). v2 moves four 3s to one extra 1 and three extra 2s, so 2s are the backbone and big triple-move turns are rare. The deck is still 52 cards with 42 number cards.
- Every drawn card is shown to both players. Players see how many cards are left in the draw pile and can view the discard pile.
- When the draw pile runs out, the discard pile is **shuffled** into a new draw pile. The server does all shuffling (see §10).

### 2.4 Action Cards: Hold and Play **[Proposed]**
Holding action cards gives players a real decision to make ("when should I use my Skip?").

- If you draw a **Skip** or **Reverse**, it goes into your **hand** and you **draw again** until you get a number card. Your turn then goes ahead as normal.
- You can hold up to **2 action cards**. If you draw a third, you must either discard one or play the new card immediately.
- At the **start of your turn, before drawing**, you can play **one** action card from your hand:
  - **Skip:** you draw and take your turn as usual. Your opponent's next turn is then skipped, and you draw again for another turn.
  - **Reverse:** sides swap immediately and **this uses up your turn** (you don't draw). The position stays the same and the same color moves next, but your opponent now controls that color. **Each player may play only one Reverse per game** (see §2.8).
- Your opponent can see **how many** action cards you hold, but not which ones.

### 2.5 Check, Checkmate, and Multi-Move Turns

**Confirmed rule: giving check ends your turn immediately.** Any moves you had left are forfeited. Other rows in this table are **[Proposed]** unless marked confirmed.

| Situation | Rule |
|---|---|
| You start your turn in check | Your **first move must get you out of check.** |
| During your turn | Each move has to be legal on its own, so you can never leave your own king in check, even between moves. |
| End of turn | Your turn **can't end with your king in check.** |
| Giving check **(confirmed)** | **Your turn ends immediately** after the checking move, and any remaining moves are forfeited. With a 3 card, for example, you can make two quiet setup moves and then deliver check (or mate) on the third, but a check on move 1 ends the turn there. |
| Capturing the king | **Never possible.** Because a check ends the turn, the opponent always gets a chance to respond before you move again. |
| Checkmate | Checked **at the end of your turn**, whether it ended after N moves or early because you gave check. If your opponent is in check and has no legal move that escapes it, you win. |
| Using all your moves | **Mandatory.** You must make all N moves unless you give check (which ends the turn) or run out of legal moves (your turn ends early). |
| Stalemate | Checked at the start of a player's turn: if they're not in check and have no legal moves, the game is a draw. |
| Skip vs. check | **Check cancels Skip.** If your opponent is in check when their skipped turn would begin, the Skip has no effect and they play normally. |

### 2.6 White's First Turn **(confirmed)**
White's **very first turn of the game is capped at 1 move**, whatever card is drawn:
- A **2 or 3 card counts as a 1** for that turn, then goes to the discard pile as normal.
- If White draws **Skip or Reverse**, it goes into White's hand as usual and White draws again until a number card comes up, which also counts as 1. Held cards can be played from White's second turn on (Reverse still has to wait for the opening protection in §2.8).
- The cap applies only to the opening turn. It doesn't apply again after a Reverse.

### 2.7 Special Chess Rules in Multi-Move Turns **[Proposed]**
- **Castling:** normal conditions apply. Castling counts as one move.
- **En passant:** you can only capture en passant on the **first move** of your turn, and only if your opponent's double pawn push was the **last move** of their turn.
- **Promotion:** happens immediately. The new piece can move later in the same turn.
- **50-move rule:** a draw after 50 turns by each player with no capture and no pawn move.
- **Threefold repetition:** the same position, with the same player to move and the same cards in hand, appearing three times.

### 2.8 How Reverse Works **[Proposed]**
- **Clocks belong to players, not colors.** Your remaining time stays with you after a swap.
- **Pending effects carry over.** A pending Skip still targets the same *player*, whatever color they now control.
- **Cards in hand stay with their owner.**
- **Board orientation (online):** both players' boards flip with an animation so your pieces are always at the bottom of your screen. You can turn this off in settings. In **Pass & Play**, players stay seated and the shared board re-orients instead (see §4.1).
- **Anti-ping-pong:** you can't play a Reverse on the turn right after your opponent played one.
- **Opening protection:** Reverse can't be played until **each player has finished 5 turns.**
- **One Reverse per player per game (rules v2).** Once you've played your Reverse, any other Reverse in your hand is **discarded at once**, and any Reverse you **draw later is discarded and you draw again** (like drawing past an action card, but it never reaches your hand). Dead Reverses therefore never take up a hand slot or force an overflow choice. Your opponent keeps their own Reverse until they use it. The rules engine (and so the server) rejects a second Reverse, the hand shows a greyed "USED" Reverse chip with a tooltip, and the notation marks a discarded Reverse as `[Reverse✕]`.

### 2.9 Turn Notation
Moves are recorded in an extended version of standard chess notation (PGN) that also logs cards. Example:
`7. [3] e4 Nf3 Bc4 | ... [Skip→hand][2] Nf6 d5` and `8. {Reverse}`

---

## 3. Game Flow / Turn Structure

```
Match start → coin flip assigns White/Black → shuffle deck → clocks set to 10:00
│
└─ TURN LOOP
   1. Start of turn → check stalemate/draw conditions;
      apply a pending Skip unless the player is in check
   2. (Optional) Play one action card from your hand
         • Reverse → swap sides, turn ends
         • Skip    → mark the opponent's next turn as skipped, continue
   3. Draw cards until you get a number card (any action cards drawn go to your hand)
      (White's very first turn: the number card counts as 1)
   4. Your clock starts once the card is revealed
      (about 1 second of grace for the animation)
   5. Make N legal moves (the first must escape check if you're in check)
      Giving check ends your turn immediately; remaining moves are forfeited
   6. End of turn (N moves made, or check given) → check for checkmate;
      if none, play passes to the opponent
      (or back to you if a Skip applies)
│
Game over: checkmate · time runs out · resignation · draw → results screen → Review / Rematch
```

---

## 4. Game Modes

| Mode | Description | Ranked? |
|---|---|---|
| **Quick Match (Online)** | Matchmaking against a player with a similar rating, 10+0 clock. | Yes (once the learning path is complete) |
| **Casual Online** | Same as Quick Match, but your rating doesn't change. | No |
| **Friend Challenge** | Share an invite link and choose the time control. | No (optionally rated later) |
| **Vs. Bot** | Single player with 5 difficulty levels. Can be played offline. | No |
| **Pass & Play (2 players, one device)** | Face-to-face on one phone or tablet lying flat between the players. Works fully offline (see §4.1). | No |

### 4.1 Pass & Play Layout

The phone or tablet lies **flat on a table between two players sitting face to face**. Neither player has to pick up, pass, or turn the device.

| Element | Design |
|---|---|
| **Board** | Centered on screen. Each player's pieces start at their own end. |
| **Player zones** | Each end of the screen has that player's **clock, name, card-draw button, and held action cards**. The top zone is **rotated 180°** so it reads the right way up for the player sitting opposite. |
| **Turn highlighting** | The active player's zone glows in their side color, and their clock and draw button light up. The waiting player's zone dims. A short haptic pulse and sound play when the turn changes. |
| **No screen flip** | The board never rotates between turns. Each player taps their own draw zone and moves their own pieces from where they sit. |
| **Prompts and dialogs** | Promotion choices, the Reverse/Skip "play card?" prompt, and draw offers appear in the zone of the player who needs to answer, facing them. Game-over results are shown to both ends. |
| **Reverse** | Players **stay seated** and swap colors. The board and pieces **re-orient with an animation** so each player's new pieces sit at their own end. Clocks and cards in hand stay with the player, as in §2.8. |
| **Offline** | Rules, clocks, and the deck all run on the device with no account or network needed. Finished games are saved locally for replay and synced for review once the device is back online. |
| **Devices** | Phone in portrait, plus **tablet layouts** with bigger zones and an optional landscape mode where the players sit at the short ends. Pause and resign buttons are available to both players. |

**Bot difficulty levels [Proposed]:** Pawn (beginner) → Knight → Bishop → Rook → Queen (expert). Levels differ in how far ahead the bot looks, how much time it gets to think, and how often it deliberately makes mistakes.

---

## 5. Visual Design

**Reference:** a glowing, characterful 3D chess set with dramatic lighting and pieces that look like little characters. The default set is **not** Halloween-themed.

**Default set concept [Proposed] — "Arcane Forge":**
- **Light side ("Ember"):** ivory and gold pieces with a warm amber glow.
- **Dark side ("Tide"):** obsidian pieces with a teal and violet glow.
- Each piece type has a personality (for example, a knight with a crested helm or a rook built like a tiny fortress tower). Silhouettes stay close to the classic shapes so every piece is easy to recognize at a glance.
- The cards match the theme. The draw animation flips the card over the board, and Reverse plays a big "board flip" effect.

**2D and 3D boards**

| | 2D | 3D |
|---|---|---|
| Best for | Phones, low-end devices, fast play | Desktop and high-end phones, spectating, showing off |
| Style | Flat vector versions of the same characters | Stylized models with glow effects, ambient particles, and an adjustable camera |
| Settings | Board colors, coordinates, piece set | Quality presets (Low/Med/High), camera angle, reduced motion |

A **Classic** piece set (standard Staunton pieces) is always available for accessibility and for purists.

**Seasonal themes:** examples include Halloween, Winter, Lunar New Year, and Summer. **Each season gets a brand-new design every year** (for example, Halloween 2026 and Halloween 2027 will look different). Past seasonal sets stay with players who earned them as collectibles.

**Accessibility:** colorblind-safe side colors, a high-contrast mode, a reduced-motion mode, and screen-reader move announcements on the 2D board.

---

## 6. Screens

| Screen | Purpose and key elements |
|---|---|
| **Home** | Play button, daily puzzle, streak and XP, continue learning, featured live game, friends online |
| **Play** | Mode picker: Quick Match, Casual, Friend Challenge, Vs. Bot (difficulty), Pass & Play |
| **Lobby** | Matchmaking status and cancel button, or a friend-challenge room with the invite link, settings, and a ready button |
| **Game** | Board (2D/3D), both clocks, draw pile and discard pile, current card, moves remaining this turn, cards in hand, move list, chat and emotes, resign/draw buttons |
| **Pass & Play Game** | Game screen variant for one shared device: centered board, a mirrored player zone at each end (clock, draw button, hand), with the top zone rotated 180°. Active-turn glow, prompts that face the player who must answer, and pause/resign at both ends |
| **Results (post-match)** | Outcome, rating change, key-moment highlight, Review / Rematch / New Game buttons. Free users see a banner ad here (the only place one appears) |
| **Review** | Replay controls, evaluation graph, mistakes flagged by turn, suggested better moves, card-decision feedback |
| **Leaderboard** | Main rankings with filters, your own row pinned, fun side boards |
| **Learn** | Learning-path map, lessons, stars, XP, badges, daily puzzle |
| **Live Games** | Games in progress (highest-rated first), filters, watch button, share-to-watch link |
| **Profile** | Avatar, rating graph, stats, badges, piece collection, recent games, friends |
| **Settings** | Account, 2D/3D, piece and board theme, sound, board-flip on Reverse, chat options, accessibility, notifications |

---

## 7. Leaderboard and Rating

**Rating:** an Elo-style system. Everyone **starts at 1200**. **Only ranked online games against real people count.** Bot, local, and casual games don't affect rating. **[Proposed]** K-factor of 32 for a player's first 20 games (provisional), then 20.

**Each row shows:**

| Column | Notes |
|---|---|
| Rank | Position under the current filter |
| Player | Username and avatar |
| Rating | Plus a recent trend arrow (▲/▼ and points over the last 7 days) |
| W / L / D | Wins, losses, and draws |
| Win rate | Percentage |
| Streak | Current win streak 🔥 |

**Filters:** All time · This month · This week · Friends.
**[Proposed]** The weekly and monthly views rank players by **rating points gained** in that period, with a minimum of 5 games.
**Your own row** is always pinned to the bottom of the list.

**Fun side boards:**
- **Most Reverses played**
- **Fastest checkmate** (fewest turns and least clock time)
- **Most comebacks after a Reverse** (losing on evaluation before the Reverse, then winning the game)

---

## 8. Learning Path (Duolingo-Style)

A map of short **1–3 minute** lessons that unlock one after another.

| Unit | Example lessons | Notes |
|---|---|---|
| **1. Chess Basics** | How each piece moves, capturing, check, checkmate, castling, en passant, promotion | Can be skipped with a short placement quiz |
| **2. The Cards** | Drawing cards, making 1–3 moves in a row, puzzles like "mate in one turn with a 3 card" (two quiet setup moves, then mate), "escape check, then counterattack with a 2", and **"Check ends your turn"**: when to hold back a check until your last move | |
| **3. Skip & Reverse** | Holding cards, when to save a Skip, how Reverse flips the board, spotting good and bad times to Reverse | |
| **4. Strategy** | Defending against quiet multi-move setups, using an early check to cut the opponent's plans short (and when it wastes your moves), keeping your king safe from multi-move attacks, managing the clock, tactics that only exist in Chess Uno | **Finishing this unit unlocks ranked play** |

**Engagement systems:**
- **XP** for every lesson and puzzle
- **Daily streak** with one streak-freeze item
- **1–3 stars** per lesson based on accuracy
- **Daily puzzle** (a new one every day, the same for everyone)
- **Badges** that unlock **cosmetic piece skins** and board themes

> **Implementation note (learning path v1):** the shipped path splits "Check ends your turn" into its own unit, giving five units: Chess Basics → The Cards → Check Ends Your Turn → Skip & Reverse → Strategy. Ranked unlocks when the whole path is complete. For now that is a client-side flag; server enforcement comes later. See the README's *Learning path* section.

---

## 9. Game Replay and AI Review

Every finished game can be replayed, and the replay **doubles as a review**:

- **Replay controls:** step through turn by turn or move by move, autoplay, and jump straight to the key moment.
- **Review bot:** a strong engine runs on the server at high depth and:
  - Draws an **evaluation graph** across the whole game.
  - Labels each turn as **Best / Good / Inaccuracy / Mistake / Blunder** based on how much winning chance was lost.
  - Shows the **best sequence for the card you drew** (for example, "with your 3 card, the quiet moves Nf5 and Qg4 followed by Qxg7# was mate"), and points out checks given too early that threw away remaining moves.
  - Gives feedback on card decisions, such as "Reverse here gave away a winning position" or "holding Skip until the endgame would have been stronger."
  - Includes a **luck meter** that compares the cards each player drew with the average, so players can tell bad luck apart from bad play.
- **"Try it yourself"** lets you replay a mistake position against the bot.

> **Implementation note (review branch):** the review bot runs **on the device in a Web Worker** by default, so local games are reviewed offline. For online games the server runs the same analysis in a `worker_thread` and caches it (`game_reviews`). Labels add **Brilliant** and **Great** on top of Best–Blunder. Skip feedback compares the double turn with a normal one, and is not an endgame-holding heuristic. "Try it yourself" is not built yet. See the README section *Replays and review*.

---

## 10. Social Features

| Feature | Details |
|---|---|
| **Friend invites** | Share a link (`chessuno.app/c/AB12CD`) that opens a challenge. Friend requests and an online/in-game status list |
| **Chat** | Quick emotes (GG, 👏, 😮, 😂, "Nice Reverse!") plus regular text chat. Profanity filter, mute, and report. Text chat can be turned off in settings |
| **Live Games** | A list of games in progress, **sorted by highest rating first**, filterable by friends or featured games, with spectator counts |
| **Spectator links** | Share-to-watch links (`chessuno.app/w/XY98ZT`) that open a specific game straight away. **[Proposed]** Ranked games are shown to spectators with a 1-turn delay to prevent cheating. Spectators can see how many cards each player holds, but not which ones |
| **Rematch** | One-tap rematch request after a game |

---

## 11. Technical Architecture

### 11.1 Stack **[Proposed]**

| Layer | Choice |
|---|---|
| Language | **TypeScript** everywhere, plus **Rust → WebAssembly** for the bot engine |
| Repository | pnpm monorepo: `apps/web`, `apps/server`, `packages/rules`, `packages/engine`, `packages/ui` |
| Frontend | **React + Vite**; **PixiJS** (or SVG) for the 2D board; **Three.js** via react-three-fiber for 3D; glTF models with Draco/KTX2 compression |
| Real-time | **Node.js** (Fastify) + **WebSockets** (Socket.IO, or Colyseus for game-room handling) |
| Database | **PostgreSQL** (Drizzle or Prisma) for users, games, ratings, progress, and badges |
| Cache / pub-sub | **Redis** for the matchmaking queue, presence, and spectator broadcast across server instances |
| Auth | Email, Google, and guest accounts (Supabase Auth or Auth.js). Guests can play casual games and bots, and must sign up for ranked |
| Hosting | Fly.io or Render for the backend, a CDN for static and 3D assets, managed Postgres and Redis |
| Mobile | **Capacitor** wraps the web app for Android, adding push notifications for challenges and streak reminders |

### 11.2 Server-Authoritative Design
- The shared **`rules` package** (pure, deterministic TypeScript) checks move legality, card effects, and game-end conditions. It runs on the client for instant feedback and on the server as the source of truth.
- **The server owns the deck.** Each game is shuffled with a secret random seed, which the server publishes after the game so anyone can verify the shuffle was fair. Clients only ever receive cards that have been revealed.
- **The server runs the clocks.** Turn timestamps are measured on the server, and clients display a predicted countdown. Lag compensation is capped at about 300 ms per turn.
- **Reconnecting:** if you disconnect, you get 90 seconds (1m30s) to rejoin while your clock keeps running. If you don't return, you lose by abandonment.
- **Move flow:** client sends a move intent → server validates it → server applies it → server broadcasts the new game state to both players and spectators.

```
 Browser / Android (Capacitor)
   React UI ── 2D (PixiJS) / 3D (Three.js) ── rules pkg ── engine (WASM, offline bots)
          │ WebSocket
 Node game servers (rooms, clocks, deck RNG, rules pkg) ── Redis (queue, presence, pub/sub)
          │
 Postgres (users, games, ratings, progress)   Review workers (native engine, job queue)
```

### 11.3 Bot Engine Approach
- Standard chess engines expect players to alternate single moves, so Chess Uno needs a **custom engine** written in Rust and compiled to WebAssembly.
- **Turn-level search:** for a turn with N moves, the engine searches every possible sequence of up to N moves (using pruning, move ordering, and a transposition table to stay fast). **Any checking move ends the sequence**, which prunes the tree and matches the rule. The search compares checking early with making quiet setup moves and checking (or mating) on the last move.
- **First turn:** White's opening turn is searched as a single move.
- **Card randomness:** the engine weighs the opponent's possible next cards by their probability, based on what's left in the deck (expectimax / Star1 search).
- **Evaluation:** standard chess factors (material, piece position, king safety, mobility), adjusted for multi-move threats. Because a check ends the turn, the danger comes from **quiet setup moves followed by a final check or mate**. The evaluation scores how many of the opponent's possible 2–3 move setups end in mate. A small neural network could be trained on self-play games later.
- **Action-card logic:** the engine scores when to play or hold Skip and Reverse (for example, a Reverse is good when the evaluation swing from switching sides is large).
- **Difficulty:** controlled by search depth, time limit, and deliberate random mistakes. Bots run in the browser, so single player and Pass & Play work offline.
- **Review:** the same engine runs natively on server workers at high depth.

### 11.4 Data Model (core)
`users`, `profiles`, `friendships`, `games` (players, result, seed, PGN+cards, ratings before/after), `ratings_history`, `lesson_progress`, `badges`, `cosmetics_owned`, `purchases`, `subscriptions`, `battle_pass_progress`, `ad_rewards`, `reports`.

---

## 12. Monetization **(confirmed)**

**Principle: strictly no pay-to-win.** Nothing you can buy affects the rules, cards, deck, clock, rating, matchmaking, or bot strength. Purchases are cosmetic or for convenience only. **All prices are TBD.**

| Revenue stream | Details | Price |
|---|---|---|
| **Banner ad (free users)** | The **only ad you don't choose to watch**: a single banner on the **post-match results screen**. **Never during a match** (ranked, casual, bot, Pass & Play, or spectating), and no pop-up or full-screen ads anywhere. Premium removes it. | n/a |
| **Rewarded ads (optional)** | Players choose to watch one in exchange for **extra AI reviews** beyond the free allowance, or **lesson hints** in the learning path. | n/a |
| **Cosmetic store** | Piece skins, board themes, emotes, card backs, and **yearly seasonal sets** (a new design every year, per §5). Items are previewed in 2D and 3D before buying. | TBD |
| **Premium subscription** | **No banner ad**, **unlimited AI reviews**, and an **exclusive skin every month**. Monthly and yearly plans. | TBD |
| **Seasonal battle pass** | A **free track** and a **premium track** of cosmetic rewards earned by playing games, finishing lessons, and daily puzzles. It follows the seasonal theme calendar. | TBD |

**Notes**
- **Payments:** Stripe on the web and Google Play Billing in the Android app (Google requires Play Billing for digital goods). Purchases and subscriptions are tied to the account and sync across platforms.
- **Ad networks:** a web ad provider plus AdMob on Android. Premium removes the results-screen banner.
- **Free AI review allowance:** a small number of full reviews per day (exact number TBD). The basic replay with no engine analysis is always free.
- Badge rewards from the learning path (§8) stay free and can't be bought.

---

## 13. Feature Priority

| Phase | Features |
|---|---|
| **MVP** | Core rules and deck · 2D board · **Pass & Play** (two players on one device, face-to-face layout, offline, phone + tablet) · online multiplayer (Quick Match + Friend Challenge link) · server clocks (10+0) · basic bot (2–3 levels) · guest + account auth · Classic and default 2D piece sets |
| **Phase 2** | 3D board and the "Arcane Forge" set · leaderboard and Elo · learning path, ranked unlock, XP and streaks · replay and AI review bot · all 5 bot levels |
| **Phase 3** | Text and emote chat · Live Games and spectator links · friends list · profiles and badges/cosmetics · daily puzzle · cosmetic store · results-screen banner ad and rewarded ads |
| **Phase 4** | Seasonal themes (new each year) · Premium subscription · seasonal battle pass · fun side boards · Android app via Capacitor · tournaments and events (stretch goal) |

*Note: the Android app can ship as early as Phase 2 if needed, because it reuses the web build.*

---

## 14. Open Questions

1. **Holding cards:** should action cards be held (the current proposal) or take effect immediately when drawn? If held, is a hand limit of 2 right?
2. **Skip strength:** with Skip, you draw for your turn *and* take an extra turn. Is that too strong? An alternative is that Skip replaces this turn's moves.
3. **Reverse rules:** *decided in rules v2:* once per player per game, plus the 5-turn opening protection and the no-back-to-back rule (§2.8).
4. **Using all moves:** should players be forced to make every move (the current proposal), or allowed to pass leftover moves?
5. **Deck mix:** v2 changed 18/15/9/6/4 to **19/18/5/6/4** after playtesters found the cards too swingy. Keep watching average game length and luck-meter readings.
6. **Clocks:** stay at 10+0 only, or add an increment (such as 10+2) and other time controls?
7. **Rating system:** stay with plain Elo, or move to Glicko-2 for better accuracy with new players?
8. **Ranked unlock:** can experienced chess players skip ahead with a placement test instead of finishing all 4 units?
9. **Spectator delay:** should all games have a delay, or only ranked ones?
10. **Monetization numbers:** prices for the store, Premium, and the battle pass, the free daily AI-review allowance (all TBD).
