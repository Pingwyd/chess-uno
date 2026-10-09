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

## 6. Push notifications (server push, app closed)

Shipped (extras PR): **browser notifications while the app is open in a background tab.** Settings → Notifications has a "Browser notifications" switch that asks for permission; the per-kind toggles (your turn, challenges and rematch offers, friend requests, streak) apply. A notifications-only service worker (`public/sw.js`, no caching) shows them and focuses the app on click. The daily streak reminder is a local check on app open plus an evening (19:00) check while the app stays open.

Still to do:
- Web Push (VAPID) for the web; FCM via Capacitor for Android. Store push subscriptions per device server-side; the existing service worker gets a `push` handler.
- **Turn:** "Your move vs Ada" when the tab is closed or the device is asleep, only for games with a long enough clock (correspondence, or during the disconnect grace).
- **Streak:** a server-scheduled evening reminder in the user's zone when the app isn't open (Periodic Background Sync is Chromium-only and unreliable, so use push), plus a streak-freeze notice.
- **Friends / challenges:** a challenge is only worth a push if its TTL is extended for offline friends.
- Rate-limit per user; respect the toggles server-side (sync `cu.settings.notify` to the account); one-tap unsubscribe.

## 7. Rematch (done)

Shipped: Rematch on game over everywhere, with colours swapping. Vs bot flips your side; Pass & Play swaps the players' seats. Online: offer → the opponent sees Accept / Decline; withdrawing, declining, leaving the game screen or disconnecting cancels the offer. Accepting starts a new room with the same rated/private flag and clock. Finished rooms stay open for 10 minutes, so offers can be made until then.

Later: an offer timeout with a countdown, and "rematch" counts in the head-to-head record on profiles.

## 8. Time controls (done: 3 / 5 / 10 min)

Shipped: Bullet 3 min, Blitz 5 min and Rapid 10 min (the default, still `CLOCK_MS` on the server), picked with the "Clock" switch on Home (vs bot and Pass & Play), in the online lobby (quick match and invite links) and for friend challenges. The choice is one device setting.
- **Queues:** quick match only pairs players on the same control (one queue per rated/casual × control).
- **Ratings:** decision: **one shared rating across controls.** The player pool is small, and card luck plus multi-move turns make speed matter less than in chess. Splitting would leave many players provisional in every control. Revisit with a `ratings` table keyed by user + control, plus leaderboard tabs, once each control has enough players.
- The control rides on challenges, live-game rows, room snapshots and the replay log (`tc`, `clockMs`).

Later: 15-minute and increment controls (e.g. 5+3, which needs a per-turn increment in the shared reducer), and a `games.time_control` column for stats per control.

## 9. "Try it yourself" (done)

Shipped: from any reviewed turn (the coach card, or a better line), play the position on against Rook Bot. You get the same card and the same deck, with no clocks and nothing saved, plus Undo (your last turn and the reply), Reset and Back to review.

Later: a "hidden future" mode that reshuffles the remaining draw pile so the sandbox doesn't follow the real draws; a Pass & Play sandbox (both sides human); and auto-playing the better line before handing over control.

## Smaller items

- Draw offers (the engine already supports agreement).
- A full leaderboard screen with pagination and seasons.
- Report and block a player; chat mute. These are needed before public launch.
- Friend activity on profiles (recent games of friends) and shareable profile links.
- Bot levels 4–5 (Bishop, Queen).
