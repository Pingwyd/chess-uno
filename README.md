# Chess Uno

Chess where a card decides how many moves you make. At the start of every turn you draw a card: a **1, 2 or 3** gives you that many moves in a row, while **Skip** and **Reverse** shake things up. Everything else is regular chess with a 10-minute clock.

This is the **MVP**: a polished, offline-capable web game with Pass & Play (two players, one device) and a vs-Bot mode. The full design lives in [`docs/DESIGN.md`](docs/DESIGN.md).

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
  net/        transport.ts: GameTransport seam (LocalTransport today, socket transport later)
  ui/         React screens/components, pieces/ (SVG sets), styles.css
tests/        Vitest: chess.test.ts (perft etc.), game.test.ts (card rules), bot.test.ts
docs/         DESIGN.md, screenshots/
scripts/      screenshots.mjs, reverse-shot.mjs (Playwright), preview-pieces.tsx
```

### Built to grow

- **Online multiplayer:** the rules are a pure, deterministic reducer, `applyAction(state, action, now)`, with a seeded RNG stored in the state, so the same code can run on the authoritative server. Every action carries the acting `player`. The UI only talks to a `GameTransport`, so a WebSocket transport can replace `LocalTransport` without touching the screens.
- **3D (Three.js):** the board is a view over `GameState`. A react-three-fiber board can sit beside `Board.tsx`, and the piece set is already a swappable module.
- **Android (Capacitor):** the build uses a relative `base`, is fully offline (bundled fonts, synthesized audio, no CDNs), and is built for touch with portrait-first layouts. Run `npx cap init` and `npx cap add android` on top of `dist/`.
- **Stronger bots:** `botStep(state, level)` is the only bot interface, so the planned Rust→WASM engine can slot in behind it.

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

Online play, accounts, the leaderboard, the learning path, replay/AI review, 3D, chat and spectating, monetization, and bot levels 4–5 (Bishop and Queen). See the roadmap in `docs/DESIGN.md` §13.
