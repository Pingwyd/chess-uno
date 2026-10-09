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
  - The Chess Uno layer: a shared, seeded 52-card deck (18×1, 15×2, 9×3, 6 Skip, 4 Reverse) that reshuffles the discard pile when the draw pile runs out. A number card gives that many moves in a row. **Giving check ends your turn.** **White's first turn is capped at 1 move.** Skip and Reverse are held in your hand (max 2) and played at the start of a turn. Reverse swaps sides, and clocks and hands stay with their players. Checkmate is checked at the end of a turn, and the king can never be captured.
  - A 10-minute clock per player. Running out of time loses, unless your opponent can't possibly mate, in which case it's a draw. There's a 1-second grace period for the card reveal, plus pause.
  - Extended turn notation such as `[3] e5 Nf6 Nc6`, `[Skip→hand] [2] d5 Nc6`, and `{Reverse}`.
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
  engine/     evaluate.ts, bot.ts (turn search), bot.worker.ts, botClient.ts
  net/        transport.ts (GameTransport seam + LocalTransport), protocol.ts (wire types shared with
              the server), online.ts (OnlineClient + OnlineTransport)
  ui/         React screens/components, pieces/ (SVG sets), styles.css
server/       Node game server (npm workspace): src/{index,app,hub,room,redact,auth,http,db,rating,config}.ts
              and test/ (two simulated clients over real sockets)
tests/        Vitest: chess.test.ts (perft etc.), game.test.ts (card rules), bot.test.ts
docs/         DESIGN.md, screenshots/
scripts/      screenshots.mjs, reverse-shot.mjs, online-e2e.mjs (Playwright), preview-pieces.tsx
```

### Built to grow

- **Online multiplayer:** the rules are a pure, deterministic reducer, `applyAction(state, action, now)`, with a seeded RNG stored in the state, so the same code can run on the authoritative server. Every action carries the acting `player`. The UI only talks to a `GameTransport`, so a WebSocket transport can replace `LocalTransport` without touching the screens.
- **3D (Three.js):** the board is a view over `GameState`. A react-three-fiber board can sit beside `Board.tsx`, and the piece set is already a swappable module.
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

## Not in the MVP yet

A leaderboard screen beyond the lobby top 10, seasons, friends lists, rematch offers, draw offers, replay/AI review, the learning path, 3D, monetization, and bot levels 4–5 (Bishop and Queen). Online play is groundwork: it hasn't been deployed or load-tested. See the roadmap in `docs/DESIGN.md` §13.
