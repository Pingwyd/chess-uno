# Chess Uno

Chess where a card decides how many moves you make. At the start of every turn you draw a card: a **1, 2 or 3** gives you that many moves in a row, while **Skip** and **Reverse** shake things up. Everything else is regular chess with a 10-minute clock.

This is the **MVP**: a polished, offline-capable web game with Pass & Play (two players, one device) and a vs-Bot mode, plus the **online multiplayer groundwork**: an authoritative game server, accounts, ratings, quick match, invite links, chat and spectating (see [Online multiplayer](#online-multiplayer)). The full design lives in [`docs/DESIGN.md`](docs/DESIGN.md).

| Pass & Play (phone) | Reverse! | Vs Bot (desktop) |
|---|---|---|
| ![Pass & Play](docs/screenshots/pass-midgame.jpg) | ![Reverse](docs/screenshots/reverse-flip.jpg) | ![Vs bot](docs/screenshots/bot-desktop.jpg) |

## Run it

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173 (exposed on your LAN so you can open it on a phone)
npm test           # rules engine + bot tests (Vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Optional: `?seed=123` in the URL gives a reproducible deck (handy for bug reports and demos).

Screenshots / browser smoke test (needs a running preview server):

```bash
npx vite preview --port 4300 &
BASE_URL=http://localhost:4300 npm run screenshots   # plays both modes with Playwright -> screenshots/
```

## What's in the MVP

- **Rules engine** (`src/rules`), pure TypeScript, no DOM:
  - Full chess with castling, en passant, promotion, check, checkmate, stalemate, and automatic draws by threefold repetition, the 50-move rule, and insufficient material. Move generation is checked against standard perft positions.
  - The Chess Uno layer: a shared, seeded 52-card deck (19×1, 18×2, 5×3, 6 Skip, 4 Reverse; about 1.67 moves per number card) that reshuffles the discard pile when the draw pile runs out. A number card gives that many moves in a row. **Giving check ends your turn.** **White's first turn is capped at 1 move.** Skip and Reverse are held in your hand (max 2) and played at the start of a turn. Reverse swaps sides, and clocks and hands stay with their players. **Each player gets one Reverse per game.** Checkmate is checked at the end of a turn, and the king can never be captured.
  - A 10-minute clock per player. Running out of time loses, unless your opponent can't possibly mate, in which case it's a draw. There's a 1-second grace period for the card reveal, plus pause.
  - Extended turn notation such as `[3] e5 Nf6 Nc6`, `[Skip->hand] [2] d5 Nc6`, and `{Reverse}`.
- **Bot** (`src/engine`) that understands multi-move turns. It searches sequences of up to N moves, where any check ends the sequence just like the rule. It then scores the result against the opponent's best 1- or 2-move reply, weighted by deck odds. There are three levels: **Pawn** (easy), **Knight** (medium) and **Rook** (hard). They differ in search width, reply depth and deliberate noise, and they also decide when to play Skip and Reverse. The bot runs in a Web Worker.
- **UI** (`src/ui`), built with React and Vite:
  - The **Arcane Forge** SVG piece set: ivory and gold "Ember" pieces against obsidian "Tide" pieces with teal and violet glow, each piece a little character. A **Classic** set is also available.
  - Card draw with a flip animation, a move-pips indicator, numbered move badges for the current and previous turn, legal-move hints, a check glow, a SKIP, REVERSE, or CHECK banner, and a board that spins on Reverse.
  - **Pass & Play** uses a face-to-face layout. The top player's zone (clock, deck, hand, prompts) and pieces are rotated 180° toward them. The active zone glows, and the device gives a haptic pulse and sound on turn change. Results are shown to both ends. The layout is portrait-first and tablet-friendly.
  - **Vs Bot** gives a phone layout, or on wide screens a big board with a side column holding both zones and the turn log.
  - The home screen has the mode picker, bot difficulty, side choice, piece-set and sound toggles, and a how-to-play sheet.

## Project layout

```
src/
  rules/      chess.ts (move gen), cards.ts (deck + seeded RNG), game.ts (Chess Uno reducer)
  engine/     evaluate.ts, bot.ts (turn search), bot.worker.ts, botClient.ts,
              review.ts (review bot), review.worker.ts, reviewClient.ts
  replay/     record.ts (game records, reconstruct), store.ts (IndexedDB recent games), remote.ts
  net/        transport.ts (GameTransport seam + LocalTransport), protocol.ts (wire types shared with
              the server), online.ts (OnlineClient + OnlineTransport)
  ui/         React screens/components, pieces/ (SVG sets), styles.css,
              useBoardInteraction.ts (selection/targets shared by 2D and 3D), BoardView.tsx (2D/3D switch),
              three/ (lazy 3D board: Board3D.tsx, pieceGeometry.ts, materials.ts, mapping.ts),
              learn/ (lazy learning-path screens: LearnScreen, LessonPlayer, PuzzleView, DemoBoard),
              replay/ (lazy replay viewer + review), RecentGames.tsx
  learn/      learning path: types, engine.ts (puzzle runner/judge/solver), progress.ts (XP/streak/badges,
              shared with the server), store.ts (localStorage + /api/learn sync), outline.ts, content/
server/       Node game server (npm workspace): src/{index,app,hub,room,redact,auth,http,db,rating,config,review}.ts
              and test/ (two simulated clients over real sockets)
tests/        Vitest: chess.test.ts (perft etc.), game.test.ts (card rules), bot.test.ts, board3d.test.ts,
              learn.test.ts (every puzzle verified against the engine + progress model),
              review.test.ts (classification, crafted positions, replay reconstruction, store)
docs/         DESIGN.md, screenshots/
scripts/      screenshots.mjs, reverse-shot.mjs, online-e2e.mjs, board3d-shots.mjs, learn-shots.mjs, review-shots.mjs
              (Playwright), review-fixtures.ts, preview-pieces.tsx
```

### Built to grow

- **Online multiplayer:** the rules are a pure, deterministic reducer, `applyAction(state, action, now)`, with a seeded RNG stored in the state, so the same code can run on the authoritative server. Every action carries the acting `player`. The UI only talks to a `GameTransport`, so a WebSocket transport can replace `LocalTransport` without touching the screens.
- **3D (Three.js):** shipped — see [3D board](#3d-board). It is a second renderer over the same `GameState` and the same interaction hook as `Board.tsx`.
- **Android (Capacitor):** the build uses a relative `base`, is fully offline (bundled fonts, synthesized audio, no CDNs), and is built for touch with portrait-first layouts. Run `npx cap init` and `npx cap add android` on top of `dist/`.
- **Stronger bots:** `botStep(state, level)` is the only bot interface, so the planned Rust→WASM engine can slot in behind it.

## Online multiplayer

| Lobby | Invite link | Phone: chat | Spectator | Rated result |
|---|---|---|---|---|
| ![Lobby](docs/screenshots/online-lobby.jpg) | ![Invite](docs/screenshots/online-invite.jpg) | ![Chat](docs/screenshots/online-phone-chat.jpg) | ![Spectator](docs/screenshots/online-spectator.jpg) | ![Rating](docs/screenshots/online-rating-change.jpg) |

### Run it locally

```bash
npm install                      # installs the client and the server workspace
npm run server                   # game server on http://localhost:8787 (WebSocket at /ws), SQLite in server/data/
npm run dev                      # client on http://localhost:5173 (talks to localhost:8787 by default)
npm run test:server              # server tests only (npm test runs everything)
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:server   # same tests on Postgres (fresh DB per test)
```

Open the client, pick **Online**, and you're signed in as a guest straight away. Use **Create invite link** and open the link in a second browser (or a private window) to play yourself. To test against a server on another host or port, set `VITE_SERVER_URL` when you start or build the client:

```bash
PORT=8797 npm run server
VITE_SERVER_URL=http://localhost:8797 npm run build && npx vite preview --port 4310
BASE_URL=http://localhost:4310 node scripts/online-e2e.mjs   # Playwright: invite link, chat, spectator, rated quick match
```

### How it works

- **Authoritative server** (`server/`, Node + TypeScript + `ws`). It imports the same pure rules engine as the client (`src/rules`). The server holds the seeded deck, applies every action through `applyAction`, rejects illegal or out-of-turn actions (and pause, which is offline-only), runs both clocks (a timer fires at flag fall), and decides the result. Clients only send intents and render the snapshots they get back.
- **No peeking:** each player gets a redacted snapshot. The draw-pile order and RNG state are never sent, and the opponent's held Skip/Reverse cards (including the overflow card and draw events) are masked, so you only see how many cards they hold. When the game ends, the deck seed is published, and the stored action log replays to the same result, so the shuffle can be verified.
- **Reconnect:** the client keeps the token in `localStorage` and reconnects with backoff. The server re-attaches you to your active game and resends the full state. Opening a second tab takes over the session. If a player stays away longer than the grace period (90 s by default; the opponent sees a countdown), the game is lost by abandonment. Their clock keeps running meanwhile.
- **Accounts:** you can play as a guest instantly with a generated name such as *SwiftKnight123*. Email+password signup or login uses bcrypt and a JWT that lasts 30 days, and signing up from a guest session upgrades that guest, keeping its stats. Auth endpoints are rate-limited per IP.
- **Ratings:** Elo starting at 1200. K is 32 for your first 20 rated games, then 20. Only rated online games count. Rated **Quick Match** needs an account; guests are matched into a casual queue. Matching pairs the closest rating within ±100, and the window widens by 25 per second of waiting.
- **Private rooms:** unrated. **Create invite link** gives a 6-character code and a `?join=CODE` link. **Join** accepts a code or a pasted link.
- **Spectators:** open `?watch=CODE` (the 🔗 button in-game copies it). Spectators are read-only and see both hands masked. **Ranked games are shown one full turn behind** to stop live coaching.
- **Chat:** text (max 200 characters, control characters stripped) plus quick emotes (GG, 👏, 😮, 😂, *Nice Reverse!*), limited to 5 messages per 10 s per player. Spectators can read the chat but not post. Opponent messages also pop up over the board.
- **Storage:** Kysely, a typed query builder, with migrations. SQLite (better-sqlite3) by default, and the same schema runs on Postgres. Tables: `users` (rating, games, W/L/D), `games` (players, colours, seed, result, rating before/after, and the full JSON log of every action with a server timestamp, the turn history and the chat).
- **REST:** `POST /api/guest`, `POST /api/signup`, `POST /api/login`, `GET /api/me`, `GET /api/leaderboard`, `GET /api/games/:id` (finished games with their log), `GET /health`.

### Environment variables

| Variable | Where | Default | Notes |
|---|---|---|---|
| `PORT` | server | `8787` | HTTP + WebSocket (`/ws`) port |
| `DATABASE_URL` | server | `sqlite:./data/chess-uno.db` | `postgres://user:pass@host:5432/db` switches to Postgres; `sqlite::memory:` for throwaway runs |
| `JWT_SECRET` | server | dev-only fallback | **Required in production** (the server refuses to start with `NODE_ENV=production` and no secret) |
| `CORS_ORIGIN` | server | `*` | Set to your client's origin in production |
| `CLOCK_MS` | server | `600000` | Per-player clock (10 min) |
| `DISCONNECT_GRACE_MS` | server | `90000` | How long a disconnected player has before forfeiting (1m30s) |
| `MATCH_WINDOW` / `MATCH_WIDEN_PER_SEC` | server | `100` / `25` | Quick Match rating window and how fast it widens |
| `VITE_SERVER_URL` | client (build time) | `http://localhost:8787` | Base URL of the game server; `ws(s)://…/ws` is derived from it |

### Hosting notes (nothing is deployed yet)

The client is static and can stay on GitHub Pages (or any static host); build it with `VITE_SERVER_URL=https://your-server`. Use `https` so the socket becomes `wss`. The server is one long-lived Node process holding live games in memory, so run **a single instance** (or add sticky sessions plus a shared room store before scaling out). Use Postgres in production:

- **Render:** a *Web Service* from the repo root (the server imports `src/rules`), build command `npm install`, start command `npm run start -w server`. Add a Render Postgres database and set `DATABASE_URL`, `JWT_SECRET` and `CORS_ORIGIN`. WebSockets work out of the box. Free instances sleep, which drops live games.
- **Fly.io:** `fly launch` with a small Node Dockerfile (copy the repo, `npm ci`, `CMD npm run start -w server`), `internal_port = 8787`, `fly postgres create` + `fly postgres attach` (sets `DATABASE_URL`), `fly secrets set JWT_SECRET=…`. Keep `min_machines_running = 1` so games aren't cut off by auto-stop.
- **Railway:** a new service from the repo with start command `npm run start -w server`, plus the Postgres plugin (reference its `DATABASE_URL`). Set `JWT_SECRET` and `CORS_ORIGIN`. Railway provides `PORT`.
- **Postgres:** migrations run automatically on boot. If you prefer SQLite on a single VM, mount a persistent volume for `server/data/`.

## 3D board

An alternate renderer of the same game (react-three-fiber + drei + postprocessing on Three.js). It works in every mode: vs bot, Pass & Play, online and spectating.

- **Toggle:** "2D board / 3D board" on the home screen, plus a 2D/3D button on the board in-game. The choice is stored in `localStorage` (`cu.board`). Default is 2D.
- **Pieces:** procedural geometry only (lathe/extrude/primitive compositions merged per material, ≤5 draw calls per piece), no external assets.
  - *Arcane Forge 3D:* ivory and gold Ember acolytes, towers, mages and royals with glowing amber eyes, vs obsidian Tide pieces with teal trim, cyan eyes and violet gems. Every piece stands on a plinth with a glowing rim, and the pieces turn to face their player.
  - *Classic 3D:* Staunton-style lathed pieces. Follows the existing piece-set setting.
- **Atmosphere:** key and rim lights with soft PCF shadows, a small procedural studio environment for reflections, bloom only on HDR emissives (eyes, gems, highlights), a vignette, a framed board with gold, teal and violet inlays, rank/file labels on all four sides, and sparse floating sparkles.
- **Interaction:** tap/click to select and move. Legal targets show as glowing dots, captures as red rings, and last-move/from squares are tinted. Pieces glide with a small hop (knights hop higher), and captured pieces shrink and sink. Numbered move badges appear for multi-move turns, and the king glows red when in check.
- **Camera:** orbit (no pan) with polar and zoom limits, plus a reset button. The camera auto-fits the board to the viewport and sits on the bottom player's side. Reverse swings it smoothly round to the other side. Pass & Play uses a near-top-down view, and the face-to-face zones stay as they are.
- **Performance and fallbacks:**
  - The 3D code is a lazy chunk (~270 KB gzip) loaded only when 3D is chosen. The main 2D bundle stays small (~100 KB gzip, including the learning-path home card).
  - Rendering stays sharp: DPR is `min(devicePixelRatio, 2)` and never drops below 1.25 on high-DPI screens (1 elsewhere). In **Auto** graphics mode (Settings → Board → 3D graphics: Auto / High / Low), a `PerformanceMonitor` feeds a governor (`src/ui/three/quality.ts`) that sheds work one step at a time in this order: particles, half-res bloom, bloom off, 1024 shadow map, baked contact shadows instead of real-time shadows, studio reflections off, and only then one modest DPR step. It has hysteresis (a cooldown between steps, a slow climb back, and a climb followed straight away by a drop pins the level), so quality doesn't flip back and forth. **Low** pins every effect off at full resolution.
  - Antialiasing: the plain renderer uses MSAA; with bloom on, the composer renders a multisampled scene pass (FXAA on GPUs without multisampled targets) at the canvas DPR and applies the same ACES tone mapping, so switching the composer on or off doesn't shift colours. Board labels and badges are drawn on 2x canvases with anisotropic filtering.
  - `node scripts/dpr-shots.mjs` checks this on a 390x844 @3x phone (`TAG=before|after`, `GRAPHICS=auto|high|low`) and writes the full screen plus a 1:1 crop to `screenshots/3d-dpr-*.png`.
  - Without WebGL the 3D option is disabled and the 2D board is used. If the 3D chunk fails at runtime, it falls back to 2D.
  - `prefers-reduced-motion` turns off particles and makes moves and camera changes instant.
- **Screenshots:** `node scripts/board3d-shots.mjs` (needs `vite preview` on 4310 and the game server for the online flow; `ONLY=desktop,mobile,pass,classic,online,fallback`). It runs Chrome with SwiftShader WebGL and writes `screenshots/3d-*.png`.

Crispness on a 3x phone (390x844, SwiftShader): before (dropped to DPR 1, no AA), after (Auto, DPR 2 with MSAA through the composer), Low (effects off, still DPR 2):

![](docs/screenshots/3d-dpr-crops.jpg)

| Desktop vs bot | Mid-move | Mobile |
|---|---|---|
| ![](docs/screenshots/3d-desktop.jpg) | ![](docs/screenshots/3d-mid-move.jpg) | ![](docs/screenshots/3d-mobile-portrait.jpg) |

| Pass & Play | Reverse spin | Check | Classic |
|---|---|---|---|
| ![](docs/screenshots/3d-pass-play.jpg) | ![](docs/screenshots/3d-reverse-spin.jpg) | ![](docs/screenshots/3d-check.jpg) | ![](docs/screenshots/3d-classic.jpg) |

## Learning path

A Duolingo-style path that teaches Chess Uno from zero. Open it with **Learn** on the home screen (or `?learn` in the URL). It is fully offline; it works with the 2D and 3D boards and is mobile-first, with a side-by-side layout on wide screens.

- **Path map:** a winding path of nodes for 24 short (1–3 min) lessons in 5 units. Lessons unlock in order, and each unit ends in a badge trophy.
  1. **Chess basics** (6 lessons): piece moves, check, checkmate, castling, promotion, en passant. Experienced players can test out with a 5-question placement check (pass with at most 1 mistake). That marks the unit done at 1 star; you can replay any lesson for more stars.
  2. **The cards** (5): drawing, moves in a row, every move counts, quiet setup then mate with a 3, escaping then striking.
  3. **Check ends your turn** (4): holding back a check, check as the final move, and when checks waste moves.
  4. **Skip & Reverse** (5): holding cards, when to save a Skip, Reverse timing, and the 5-turn Reverse protection.
  5. **Strategy** (4): defending against 3-move turns (luft, guards, cutting a plan short with a check), the clock, and Chess Uno tactics.
- **Step types:**
  - Explainers with animated board demos that loop, with captions taken from the engine's events.
  - Multiple-choice questions.
  - Interactive puzzles: a fixed position plus fixed card(s), and sometimes a hand of Skip/Reverse cards.
- **Puzzles run on the real rules engine** (`src/rules`, shared with live games). The learner's moves go through `applyAction`, and the puzzle ends when the learner's turn ends (card used up, check, mate, Skip/Reverse). The result is then judged on the final state against declarative goals: `mate`, `check`, `occupy`, `capture`, `captureType`, `promote`, `safe` (the opponent can't mate with an N-move turn), `keep` (the opponent can't win a given piece), `keepCard`, `lead` (material lead) and `noCheck`. **Any line that meets the goals is accepted**, not just the authored one. An early check that ends your turn gets its own explanation.
- **Help:** hints (they cost a star), Reset, "Show solution" after a miss (it animates the line), and a 2D/3D toggle. There are no hearts: mistakes only lower the stars.
- **Gamification:**
  - **XP:** 10 + 5 per star for a lesson; replays earn 5 + 5 per extra star; 20 for the daily puzzle, 30 for passing placement.
  - **Daily streak** with one streak freeze. The freeze bridges one missed day and refills every 7 streak days.
  - **1–3 stars** per lesson: 0 slips earns 3, 1–2 slips earn 2, and a hint counts as a slip.
  - **Daily puzzle:** the same one for everyone, picked by UTC date from a pool of 8, with a week strip.
  - **11 badges.** Four of them unlock **piece skins** for the Arcane Forge set in both 2D and 3D: Card Shark → *Frost Ember*, Patient Hunter → *Rose Tide*, Graduate → *Gilded Ember*, Unstoppable (7-day streak) → *Aurora Tide*. Equip skins on the Badges tab.
  - **Ranked unlock:** finishing the whole path sets `rankedUnlocked`. For now it is **client-side and informational**: the Quick Match card shows the status, but nothing is enforced on the server.
  - Lesson complete gets confetti, a star pop and an XP count-up, all disabled under `prefers-reduced-motion`.
- **Progress storage:** `localStorage` (`cu.learn`) for everyone. Signed-in (non-guest) online accounts also sync through `GET/POST /api/learn` (JWT; 401 without a token, 403 for guests). The server stores one JSON row per user (`learn_progress`, migration `002_learn`). It sanitizes and **merges** uploads with the stored copy, using the same `mergeProgress` the client uses: best stars, unions of days, badges and dailies, max XP, and the newest settings. Nothing earned is lost across devices.
- **Content validation:** `tests/learn.test.ts` covers all **55 puzzles** (44 in lessons, 3 in placement, 8 daily):
  - It plays each authored solution through the engine and checks the goals.
  - It exhaustively enumerates every legal line, checks the accepted solution set is non-empty and contains the authored line, and that key puzzles really need the full card (no solution with one move fewer).
  - It replays every demo script and checks ids, MCQ answers and lesson length.
  - It also unit-tests the progress model: unlocking, XP, stars, streak and freeze, placement, daily, badges and skins, merge and sanitize.
- **Code:** `src/learn/` (types, `engine.ts` puzzle runner/judge/solver, `progress.ts` pure model shared with the server, `store.ts` local + server sync, `outline.ts` tiny id/title outline for the home screen, `content/` units + daily pool) and `src/ui/learn/` (lazy-loaded chunk, ~21 KB gzip).
- **Screenshots:** `node scripts/learn-shots.mjs` (needs `vite preview` on 4310; `ONLY=mobile,desktop,placement,3d`). It plays real lessons by tapping squares and writes `screenshots/learn-*.png`.

| Path map | Explainer + demo | Puzzle in progress | Wrong | Correct |
|---|---|---|---|---|
| ![](docs/screenshots/learn-path-mobile.jpg) | ![](docs/screenshots/learn-explainer-mobile.jpg) | ![](docs/screenshots/learn-puzzle-mobile.jpg) | ![](docs/screenshots/learn-wrong-mobile.jpg) | ![](docs/screenshots/learn-correct-mobile.jpg) |

| Lesson complete | Badge + skin reward | Badges | Daily | Daily puzzle |
|---|---|---|---|---|
| ![](docs/screenshots/learn-complete-mobile.jpg) | ![](docs/screenshots/learn-badge-earned-mobile.jpg) | ![](docs/screenshots/learn-badges-mobile.jpg) | ![](docs/screenshots/learn-daily-mobile.jpg) | ![](docs/screenshots/learn-daily-puzzle-mobile.jpg) |

| Desktop path | Desktop puzzle | 3D puzzle |
|---|---|---|
| ![](docs/screenshots/learn-path-desktop.jpg) | ![](docs/screenshots/learn-puzzle-desktop.jpg) | ![](docs/screenshots/learn-puzzle-3d.jpg) |

## Replays and review

Every finished game is saved and can be replayed and reviewed — vs bot, Pass & Play and online. Open one with **Review game** on the game-over screen, from **Recent games** on the home screen (all games in a sheet, with delete), from **Your recent games** in the online lobby, or through a shared link `?replay=<gameId>` for online games.

- **Saving:**
  - A game record is the **seeded config, the start time, and the timestamped action log** (`src/replay/record.ts`). The rules are a deterministic reducer, so `reconstruct(record)` re-runs `applyAction` to rebuild **every state exactly, clocks included**. Card actions also log the card kind, so a log stays replayable even if card ids ever change.
  - Local games are recorded by `LocalTransport`. Records and cached reviews live in **IndexedDB** (localStorage fallback). A small index (`cu.games`, newest 40) drives the lists (`src/replay/store.ts`).
  - **Online games** are recorded by the server Room: action log v2 with `startedAt`, players and `graceMs`, plus a logged flag-fall `tick`. The log is stored in the existing `games` table. Clients only ever see redacted snapshots, so when an online game ends the players fetch the full record from `GET /api/games/:id/replay` and keep a local copy. Spectators don't save a copy.
- **Replay viewer** (`src/ui/replay/`, a lazy ~12 KB gzip chunk):
  - Step per move or per turn, a scrub bar with review markers, autoplay at 0.5×–4×, and jump to start or end. Keyboard: ← → for moves, ↑ ↓ for turns, space to play, Home and End.
  - Shows the card each turn and its move pips, the cards each player holds, **both clocks at that moment**, and an event chip for draws, Skip, skipped turns, Reverse, check and game over. The board flips after a Reverse like it does live.
  - Works on the 2D board and the 3D board. Online games have a **Share** button that copies or shares the `?replay=` link.
- **Review bot** (`src/engine/review.ts`):
  - A deeper analysis mode of the bot's own turn search: a wider beam, a 2-move reply search and no noise, plus an **exhaustive mate-in-turn search** where a check that doesn't mate ends the turn.
  - For each turn it works out, **given the card actually drawn**, the best full-turn line and its evaluation. It compares that with the turn played and labels the turn **Brilliant / Great / Best / Good / Inaccuracy / Mistake / Blunder** by win-chance lost. The thresholds are 2 / 5 / 10 / 20 % (`THRESHOLDS`). Brilliant is a best turn that was a sacrifice or a mate needing the whole card; Great is a best turn that swung the game by 20 % or more.
  - **Flags with plain-language explanations:**
    - **Early checks that wasted moves**, e.g. "You checked on move 1 of a 3-card, ending your turn; Be7, Bf6 then Rd8# was mate."
    - **Missed and found mates**, plus "allowed mate".
    - **Hanging pieces**, e.g. "Black can answer Kxd7, winning a queen".
    - **Reverse timing** (good or bad), and **Skip timing**: a well-timed double turn, or a Skip wasted.
  - **Show better line** draws the engine's line as numbered green arrows and the played line as red dashed arrows, on the 2D and 3D boards. **Play the line** animates it.
  - The **Review tab** has:
    - accuracy % per player, using a chess-style accuracy-from-loss curve;
    - an **evaluation graph** (win % for each side) with markers you can click to jump;
    - a **luck meter**: for each turn, the best turn with the card drawn compared with the deck-weighted average over 1/2/3 cards, plus average card against the deck's average (1.67 for v2 games, 1.79 for older ones) and action cards drawn;
    - **key moments**, the biggest swings (up to 5), with **View** and **Better line**;
    - label counts.
  - It runs in a **Web Worker on the device**, so reviews work offline. A 40-turn game takes about 5–9 s (measured in Node on the dev box). Reviews are cached with the record.
  - For online games the client first asks the server, via `GET /api/games/:id/review`. The server runs the same code in a `worker_thread` and caches the result in a new `game_reviews` table (migration `003_reviews`, keyed by review version). If the server is unreachable, the device analyses the game itself.
- **API additions:**
  - `GET /api/games/:id/replay`: public by the unguessable game id, **chat excluded**.
  - `GET /api/games/:id/review`.
  - `GET /api/my/games`: needs auth; returns your last 30 finished games.
- **Tests:** `tests/review.test.ts` covers:
  - classification thresholds and the special labels;
  - crafted positions: it finds the quiet 3-move mate and the rook-ladder mate, flags early checks with the expected text, labels a hung queen as a blunder, and scores a played mate as best;
  - **replay reconstruction**: every live state of a real `LocalTransport` game, including fresh events, timestamps and clocks, matches the rebuilt frames; also card-id remapping, server-log conversion and whole-game aggregates;
  - the recent-games store.

  The server test checks the replay and review endpoints end to end against the live room state.
- **Screenshots:** `node scripts/review-shots.mjs` (needs `vite preview` on 4310; `ONLY=gameover,mobile,desktop,3d,recent,online`). It plays a real game to game over and opens its review, and uses deterministic saved games from `scripts/review-fixtures.ts` for the rest. `scripts/online-e2e.mjs` also reviews a finished rated game through the server.

| Game over | Replay | Better line (arrows) | Review summary | 3D replay |
|---|---|---|---|---|
| ![](docs/screenshots/review-game-over.jpg) | ![](docs/screenshots/review-replay-mobile.jpg) | ![](docs/screenshots/review-better-line-mobile.jpg) | ![](docs/screenshots/review-summary-mobile.jpg) | ![](docs/screenshots/review-3d.jpg) |

| Desktop replay | Desktop review + better line | Shared online replay |
|---|---|---|
| ![](docs/screenshots/review-replay-desktop.jpg) | ![](docs/screenshots/review-desktop.jpg) | ![](docs/screenshots/review-online-shared.jpg) |

| Recent games | All games |
|---|---|
| ![](docs/screenshots/review-recent-home.jpg) | ![](docs/screenshots/review-recent-all.jpg) |

## Settings, profile, friends and live games

**Navigation.** The app has a nav bar with Home, Learn, Social, Leaderboard and Profile, plus ⚙ Settings. It sits at the top on desktop/web widths (≥760px) and becomes a bottom tab bar on phones (`src/ui/nav/AppNav.tsx`). It's hidden during games, lessons, daily puzzles, replays and while spectating. Home stays focused on play modes, Learn and recent games. The piece-set, board, sound and how-to controls moved into Settings, and a "How to play" link stays under the logo. Deep links: `?settings`, `?social` / `?social=live`, `?leaderboard`.

- **Profile** (nav → Profile):
  - avatar picker (16 symbols, or your initial) and display-name edit;
  - rating with a **rating-history chart** (rated games, from `GET /api/my/profile`);
  - W/L/D, win rate, current and best win streak;
  - a "Badges & skins" shortcut;
  - recent games (online and local merged), each linking to its review.

  Guests and offline players get the same profile built from games saved on the device (`src/ui/settings/stats.ts`), plus a "create a free account" prompt.
- **Badges & skins** (the Collection tab next to Profile and Settings; `src/ui/settings/CollectionTab.tsx`):
  - collection summary (badges and skins owned, current pairing);
  - piece-skin selector for white and black, showing which badge unlocks each locked skin;
  - Arcane/Classic set switch;
  - every badge with its description, earned date and skin reward, filterable by All / Earned / To earn;
  - a link to the Learn path.
- **Social** (nav → Social; `src/ui/social/SocialScreen.tsx`): Friends and Live games. They're sub-tabs on phones and two columns on wide screens.
  - **Friends** (accounts only; guests are asked to sign up):
    - search players by name;
    - send, accept, decline or cancel requests, and remove friends;
    - each friend shows a **live presence** dot: online, in a game or in a rated game;
    - **Watch** a friend's game, or **Challenge** a friend who is online.
  - **Live games:** see below.
- **Leaderboard** (nav → Leaderboard; `src/ui/social/LeaderboardScreen.tsx`):
  - a podium for the top three, then the top 50;
  - your own rank card;
  - an Everyone / ★ Friends filter.
- **Online lobby:** Quick Match, Play a friend, your recent online games, and links to Friends, Live games and the Leaderboard. It no longer duplicates them.
- **Settings** (nav → ⚙):
  - Board: 2D/3D default, piece set, legal-move hints, **confirm moves** (stage a move, then press Play ✓).
  - Sound: master sound, effects volume, generative ambient music (default off), vibration.
  - Notifications: placeholder toggles, marked PREVIEW (push is in `BACKLOG.md`).
  - Reduced motion: system, on or off. It turns off board spins, card flips, piece slides and sparks.
  - Account: sign in or out, change password, delete account (needs your password and typing DELETE).
  - About and how to play.

  Device settings live in `localStorage` (`cu.settings`, `src/ui/settings/store.ts`).

**Server** (`server/src/social.ts`, `hub.ts`, `http.ts`; migration `004_social`): adds `users.avatar`, `users.deleted` and a `friendships` table (one row per pair, `pending`/`accepted`).

- **REST:**

  | Method | Path | Notes |
  |---|---|---|
  | GET | `/api/users/search?q=` | |
  | GET | `/api/friends` | Includes presence |
  | POST | `/api/friends/{request,accept,decline,cancel,remove}` | `{userId}` |
  | GET | `/api/users/:id/profile`, `/api/my/profile` | |
  | POST | `/api/profile` | Name and avatar |
  | POST | `/api/account/password` | |
  | POST | `/api/account/delete` | |
  | GET | `/api/leaderboard?scope=friends` | |
  | GET | `/api/live` | |

  A request to someone who already asked you is accepted automatically. The cap is 200 friends.
- **WebSocket:**
  - `presence` updates go to your friends.
  - `social` events cover requests, accepts, declines, cancels and removals, and show up as in-app notices.
  - Challenges: `challenge` → `challengeUpdate`.
  - `live` subscribes to the live-games list. Pushes are throttled to once a second.
  - With a saved login, the app keeps a background socket open on any screen, so friends see you online and challenges reach you everywhere.
- **Challenges:**
  - friends only;
  - the target must be online and not already in a game;
  - one outstanding challenge per player.

  A challenge creates a private, unrated room with the friend as the invitee. Challenges stay open for **5 minutes** (`CHALLENGE_TTL_MS` in `src/net/protocol.ts`; the server's `CHALLENGE_TTL_MS` env var overrides it). The friend gets an Accept/Decline card with an m:ss countdown, and the challenger sees the same countdown in the waiting room. Accepting seats them and starts the game. A decline, timeout or the challenger leaving closes the room.
- **Live games** (Social page):
  - games in progress, highest average rating first;
  - friends' games highlighted;
  - filters: All / Rated / Casual / Friends;
  - spectator counts, updated live.

  Tapping a game spectates it; rated games keep the one-turn spectator delay. Quick Match games are public. Private rooms (invites and challenges) are listed only for the players and their friends.
- **Delete account** anonymises the user rather than removing the row: name "Deleted player", email and password cleared, sessions rejected. Friendships and learning progress are deleted. Opponents' game histories and replays stay intact, and the email can be used again. It's blocked while you're in a game.
- **Tests:**
  - `server/test/social.test.ts`:
    - friend lifecycle, search, guest rules, friends leaderboard;
    - presence and social pushes;
    - challenge accept/decline/cancel/offline/busy, the 5-minute TTL and expiry;
    - live list ordering, privacy, spectators and the delayed ranked view;
    - profile, rating history, streaks, password change, account deletion.
  - `tests/social.test.ts`: local stats, avatars, settings store, challenge countdown.
- **Screenshots:** `npx tsx scripts/social-shots.ts`. It starts an in-memory server on 8798 and a preview on 4320, seeds eight accounts with friendships, rated history and live bot-driven games, and writes `screenshots/social-*.png`.

| Home (mobile) | Leaderboard | Social: friends | Social: live games | Badges & skins |
|---|---|---|---|---|
| ![](docs/screenshots/social-home.jpg) | ![](docs/screenshots/social-leaderboard.jpg) | ![](docs/screenshots/social-friends.jpg) | ![](docs/screenshots/social-live.jpg) | ![](docs/screenshots/social-collection.jpg) |

| Profile + rating chart | Settings | Friend request | Challenge | Challenge sent | Spectating |
|---|---|---|---|---|---|
| ![](docs/screenshots/social-profile.jpg) | ![](docs/screenshots/social-settings.jpg) | ![](docs/screenshots/social-friend-request.jpg) | ![](docs/screenshots/social-challenge.jpg) | ![](docs/screenshots/social-challenge-sent.jpg) | ![](docs/screenshots/social-spectate.jpg) |

| In-game chat (Lucide emotes) |
|---|
| ![](docs/screenshots/social-chat.jpg) |

| Home (desktop) | Social (desktop) | Leaderboard (desktop) |
|---|---|---|
| ![](docs/screenshots/social-home-desktop.jpg) | ![](docs/screenshots/social-social-desktop.jpg) | ![](docs/screenshots/social-leaderboard-desktop.jpg) |

## UI guidelines

- **Icons: Lucide only, no emoji.** Every UI icon is a [Lucide](https://lucide.dev) icon from `lucide-react`, used through `src/ui/icons.tsx` (`<Icon name="..." />`, named per-icon imports so only the used icons ship). Use the default 18px size and a 2px stroke unless the layout needs otherwise. Icons are `aria-hidden`; give icon-only buttons an `aria-label`, or pass `label` to `Icon` when the icon carries meaning by itself. Data (badges, lessons, avatars, notices) stores icon names, not glyphs.
- No emoji or unicode symbol glyphs (arrows, stars, check marks, chess symbols and so on) in UI text. `tests/icons.test.ts` scans `src` for them. Real chess annotations (`!!`, `!`, `?!`, `?`, `??`, `+`, `#`) are fine, and so is the chess piece art (SVG and 3D).
- Chat quick emotes are Lucide icons plus a short label, or styled text ("GG").

## Rule decisions made for the MVP

These follow `docs/DESIGN.md`. Where the doc left a gap, this is what the code does:

1. **The clock runs from the start of your turn**, including any time spent deciding whether to play a held card, so nobody can stall before drawing. A 1-second grace period covers the card reveal.
2. **Threefold repetition, the 50-move rule and insufficient material are automatic draws**; there's no claim button. Repetition compares position, colour to move, which *player* controls it, and both hands. The 50-move rule counts **50 turns each** with no capture or pawn move.
3. **En passant** is only allowed on the first move of a turn, and only if the double push was the last move of the opponent's turn. A Reverse turn (no moves) doesn't clear it.
4. **Hand overflow:** when you draw a third action card, you discard any one of the three, or play the new card immediately if it's playable. Playing a Skip this way counts as your one action card for the turn, and you keep drawing.
5. **One action card per turn.** You can play another Skip on the extra turn a Skip gives you.
6. **Reverse protection** counts finished turns, including a turn spent on Reverse. Skipped turns don't count. The anti-ping-pong block ends after the blocked player's next turn.
7. **Running out of legal moves mid-turn** ends the turn early. **Stalemate** is checked at the start of a turn.
8. **Flag fall:** if your opponent can't possibly mate (a lone king, king + one minor piece, or same-coloured bishops only), it's a draw.
9. **White's opening cap** applies only to games that start from the standard position.
10. **Pass & Play:** the top player's pieces face them, as in the reference screenshot. Player 1 sits at the bottom and starts as White. After a Reverse, the board spins so each player's new pieces end up in front of them.
11. Draw by agreement exists in the engine but has no button in this MVP.
12. **Rules v2** (after playtesting found the cards too swingy):
    - **Fewer 3s:** the deck is now 19×1, 18×2, 5×3, 6 Skip, 4 Reverse (was 18×1, 15×2, 9×3). A number card averages 70/42 ≈ **1.67 moves** (was 1.79), and P(3) per number card drops from 21% to 12%.
    - **One Reverse per player per game.** After you play yours, any other Reverse in your hand is discarded, and any Reverse you draw later is discarded and you draw again (`[Reverse-burned]` in the notation). It never takes a hand slot. The shared reducer rejects a second Reverse, so the online server enforces it too. Your hand shows a greyed "USED" Reverse with a tooltip.
    - **Versioned:** `GameConfig.rules` (`src/rules/cards.ts`: `RULES_VERSION = 2`). Saved and online games recorded before v2 have no `rules` field and replay with the v1 deck and no Reverse limit, so old replays stay exact. The bot and review engine use the v2 card odds; the review is cached by `REVIEW_VERSION`, now 3.

## Not in the MVP yet

A leaderboard screen beyond the lobby top 10, seasons, rematch offers, draw offers, "try it yourself" from a review position, server-enforced ranked unlock, monetization, and bot levels 4–5 (Bishop and Queen). Online play is groundwork: it hasn't been deployed or load-tested. See `BACKLOG.md` and the roadmap in `docs/DESIGN.md` §13.
