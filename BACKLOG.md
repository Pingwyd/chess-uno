# Backlog

Work that is planned but not built yet, roughly in priority order within each section. Each item lists what "done" looks like and what's already in place.

## 1. Hosting & deploy

- **Deploy the server and Postgres.** Today only the static client is public (GitHub Pages, built without `VITE_SERVER_URL`, so online features show "coming soon").
  - Pick Render, Fly.io or Railway; the README "Hosting notes" covers each.
  - Run one long-lived Node instance: live rooms, presence and challenges are held in memory.
  - Use managed Postgres via `DATABASE_URL`. Migrations `001`–`004` run on boot.
  - Set `JWT_SECRET`, `CORS_ORIGIN` (the Pages origin) and HTTPS (so the socket is `wss`).
  - Rebuild the Pages bundle with `VITE_SERVER_URL=https://…`.
  - Add a `/health` check, uptime alerting, nightly DB backups and log retention.
  - **Done when:** a public URL plays Quick Match, friends and live games end to end, and redeploys don't lose finished games.
- **Enforce the ranked unlock server-side.** The learning-path "Graduate" flag is client-side only, and `hub.ts` puts any account in the rated queue.
  - The server already stores synced progress (`learn_progress`). On `queue` with `rated`, check `pathDone(progress)` from the shared `src/learn/progress.ts`, or a `ranked_unlocked` column set when a synced progress completes the path.
  - Otherwise reply with an error and offer casual.
  - Also covers challenges if rated challenges are ever added.
  - Keep a placement escape hatch (test-out) so strong players aren't forced through every lesson.
- **Scaling later:** sticky sessions plus a shared room/presence store (Redis pub/sub) before running more than one instance; rate limiting at the edge.
- **CI:** GitHub Actions running `npx tsc -b`, the server typecheck and `npm test` on PRs, and the Pages deploy on merge to `main`.

## 2. Store, ads, Premium & season pass

- **Store:** cosmetic-only piece skins, boards, card backs and avatars, reusing the skin system from learning badges (`ownedSkins`). No pay-to-win: nothing that changes the deck or the clock.
- **Ads:** rewarded ads only (e.g. an extra streak freeze, a daily-puzzle retry); never mid-game. They need a consent flow (GDPR/UMP) and must stay off for Premium users.
- **Premium:** ad-free, unlimited game reviews (cap server reviews for free users if CPU cost matters), extra skins, advanced review stats.
- **Season pass:** a free and a premium track with XP from games, lessons and dailies; seasonal rating resets (soft, toward the median) and season badges on the profile.
- **Billing:** Google Play Billing via Capacitor on Android, Stripe on the web. Entitlements are stored server-side (`entitlements` table) and checked by the API, never trusted from the client.

## 3. Android app via Capacitor

- Wrap the Vite build with Capacitor (`@capacitor/android`), point it at the hosted server, and set the app id, icons and splash.
- Native plugins: Haptics (replacing `navigator.vibrate`), Push Notifications, App (back button to close modals and leave screens), Status bar, Keep awake during games.
- Handle deep links: `/?spectate=CODE`, `/?replay=…`, invite links.
- Play Store listing, internal testing track, privacy policy and data-safety form (accounts, deletion: already supported in Settings → Account).

## 4. Design / UI refresh

- Do a design pass with a proper type scale, a spacing system and tokens extracted from `styles.css` and `social.css`.
- Polish the light theme or drop it; check contrast on every surface.
- Desktop layouts: Settings/Profile is a single centred column today. Use two columns on wide screens.
- Onboarding: a first-run flow (choose a name, quick rules tour, first lesson).
- Better empty states and skeleton loaders on Profile, Friends and Live games.
- Accessibility audit: focus order, screen-reader labels for board squares and cards, a 44 px minimum on all targets.

## 5. Sound & music settings polish

- Replace the generated ambient loop with recorded tracks (2–3, crossfaded), separate volumes for UI/game/clock, and mute when the tab is hidden.
- Low-time clock ticking, opponent-move sound, distinct Skip/Reverse stingers.
- Respect the OS silent mode on Android (Capacitor).
- Add a test-sound button per channel; persist settings to the account.

## 6. Push notifications (turn + streak)

- The Settings → Notifications toggles exist as **placeholders** (saved in `cu.settings.notify`, marked PREVIEW).
- Web Push (VAPID) for the web; FCM via Capacitor for Android. Store tokens per device server-side.
- **Turn:** "Your move vs Ada", sent only when the player is backgrounded/offline and the game has a long enough clock (correspondence or the disconnect grace).
- **Streak:** a daily reminder at the user's local evening if today's lesson or daily puzzle isn't done, plus a streak-freeze notice.
- **Friends / challenges:** a friend request received or accepted, and a challenge received. A challenge is only worth a push if its TTL is extended for offline friends.
- Rate-limit per user; respect the toggles server-side; one-tap unsubscribe.

## 7. Rematch button

- On game over (online), offer **Rematch**. The server keeps the room for ~30 s after `finished`. If both players accept, start a new game with colours swapped and the same rated/casual flag.
- Show "Opponent wants a rematch" with accept/decline. Declining or timing out returns both players to the lobby.
- For bot and pass & play: "Play again" with swapped colours (partly there).

## 8. Extra time controls

- Today every game is 10 minutes per player (`CLOCK_MS`).
- Add **5-min blitz** and maybe 3-min and 15-min.
- Each time control gets its own matchmaking queue and **its own rating** (`ratings` table keyed by user + control), with leaderboard tabs per control.
- Store the control on the game (`games.time_control`) and in the replay config.
- A clock increment option (e.g. 5+3) needs a per-turn increment in the shared reducer.
- Show the control on Live games rows and in challenges (challenge settings: control, colour, rated).

## 9. "Try it yourself" from review positions

- From any replay or review position, branch into a sandbox. You keep playing from that exact state (board, hands, deck order hidden or reshuffled) against the bot or pass & play, then return to the review.
- The engine supports starting from a snapshot (`GameConfig.fen`-style setups are used by lessons). The deck needs a "remaining cards, unknown order" mode so the sandbox can't peek at the real future draws.
- Also add it to "Better line" suggestions: "Play this line" auto-plays the suggested moves, then hands control to you.

## Smaller items

- Draw offers (the engine already supports agreement).
- A full leaderboard screen with pagination and seasons.
- Report and block a player; chat mute. These are needed before public launch.
- Friend activity on profiles (recent games of friends) and shareable profile links.
- Bot levels 4–5 (Bishop, Queen).
