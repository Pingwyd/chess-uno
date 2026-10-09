/**
 * End-to-end check of online play against a running server + client:
 *   PORT=8797 npm run server &                                  # game server
 *   VITE_SERVER_URL=http://localhost:8797 npm run build && npx vite preview --port 4310 &
 *   BASE_URL=http://localhost:4310 node scripts/online-e2e.mjs
 *
 * Host (desktop, signs up) creates an invite link; a guest (phone) joins through it;
 * both chat; a spectator watches by link; then two accounts play a rated Quick Match
 * to show the rating change. Screenshots land in screenshots/online-*.png.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4310';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const stamp = Date.now().toString(36);

let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync) }); }

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

async function open(label, viewport, url = BASE, mobile = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript(() => localStorage.setItem('cu.sound', 'false'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/WebSocket|ERR_CONNECTION/.test(m.text()) && errors.push(`${label} console: ${m.text()}`));
  await page.goto(url);
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}online-${name}.png` });
const connected = (page) => page.getByTestId('conn-status').filter({ hasText: 'Connected' }).waitFor({ timeout: 15000 });

async function signup(page, email, name) {
  await page.getByTestId('open-signup').click();
  const m = page.getByTestId('auth-modal');
  await m.locator('input[type=email]').fill(email);
  await m.locator('input[type=password]').fill('correct-horse-battery');
  await m.locator('input').nth(2).fill(name);
  await wait(400); // let the overlay fade-in finish
  return m;
}

/** Take one step for whichever player can act on this page. Returns true if it did something. */
async function step(page) {
  if (await page.getByTestId('game-over').count()) return false;
  const promo = page.locator('.promo-btn').first();
  if (await promo.count()) { await promo.click({ force: true }); return true; }
  const discard = page.locator('.overflow-card .btn').last();
  if (await discard.count()) { await discard.click({ force: true }); return true; }
  const deck = page.locator('.deck-btn.deck-ready').first();
  if (await deck.count() && await deck.isEnabled()) { await deck.click({ force: true }); await wait(1000); return true; }
  const movable = page.locator('.sq-movable');
  const n = await movable.count();
  if (!n) return false;
  await movable.nth(Math.floor(Math.random() * n)).click({ force: true });
  const caps = page.locator('.sq-target-capture');
  const t = (await caps.count()) ? caps : page.locator('.sq-target');
  const c = await t.count();
  if (c) { await t.nth(Math.floor(Math.random() * c)).click({ force: true }); await wait(250); return true; }
  return false;
}
async function play(pages, turns) {
  for (let i = 0; i < 600; i++) {
    let acted = false;
    for (const p of pages) acted = (await step(p)) || acted;
    if (!acted) await wait(150);
    if (await pages[0].getByTestId('game-over').count()) return;
    if (i % 10 === 0) {
      const t = Number(await pages[0].getByTestId('game').getAttribute('data-turns'));
      if (t >= turns) return;
    }
  }
}

// ------------------------------------------------------------ 1. lobby + signup (host)
const host = await open('host', DESKTOP);
await host.getByTestId('mode-online').click();
await connected(host);
await shot(host, '01-lobby-guest');
const modal = await signup(host, `host-${stamp}@example.com`, `Host${stamp.slice(-5)}`);
await shot(host, '02-signup');
await modal.locator('button[type=submit]').click();
await host.getByTestId('account-name').filter({ hasNotText: 'GUEST' }).waitFor();
await connected(host);

// ------------------------------------------------------------ 2. invite link
await host.getByTestId('create-invite').click();
await host.getByTestId('waiting-room').waitFor();
const link = (await host.getByTestId('invite-link').textContent()).trim();
const code = (await host.getByTestId('invite-code').textContent()).trim();
console.log('invite', link);
await shot(host, '03-waiting-room');

const friend = await open('friend', PHONE, link, true);
await friend.locator('.board-frame').waitFor({ timeout: 15000 });
await host.locator('.board-frame').waitFor({ timeout: 15000 });
await wait(800);
await shot(host, '04-game-start-host');
await shot(friend, '05-game-start-friend-phone');

await play([host, friend], 6);

// ------------------------------------------------------------ 3. chat
await host.locator('.chat-form input').fill('Good luck, have fun!');
await host.locator('.chat-form button').click();
await friend.locator('.chat-bubble').waitFor({ timeout: 5000 });
await shot(friend, '06-chat-bubble-phone');
await friend.getByTestId('side-toggle').click();
await friend.locator('.side-panel.open .emote-btn[data-emote="niceReverse"]').click();
await friend.locator('.side-panel.open .chat-form input').fill('gl hf 🙂');
await friend.locator('.side-panel.open .chat-form button').click();
await wait(500);
await shot(friend, '07-chat-panel-phone');
await friend.getByTestId('side-toggle').click();
await host.locator('.chat-msg').filter({ hasText: 'gl hf' }).waitFor({ timeout: 5000 });
await shot(host, '08-chat-host');

// ------------------------------------------------------------ 4. spectator
const watcher = await open('spectator', DESKTOP, `${BASE}/?watch=${code}`);
await watcher.locator('.board-frame').waitFor({ timeout: 15000 });
await play([host, friend], 10);
await wait(600);
const readOnly = await watcher.locator('.chat-readonly').count();
const watcherMovable = await watcher.locator('.sq-movable, .deck-btn.deck-ready').count();
console.log('spectator read-only chat:', readOnly === 1, 'spectator controls:', watcherMovable);
await shot(watcher, '09-spectator');
await host.locator('.spectators').filter({ hasText: '1' }).waitFor({ timeout: 5000 });
await shot(host, '10-host-with-spectator');

// ------------------------------------------------------------ 5. resign → game over
await friend.locator('.zone-menu [aria-label="Resign"]').click({ force: true });
await friend.locator('.zone-menu .btn.danger').click({ force: true });
await host.getByTestId('game-over').waitFor({ timeout: 10000 });
await watcher.getByTestId('game-over').waitFor({ timeout: 10000 });
await wait(600);
await shot(host, '11-game-over-host');
await shot(watcher, '12-game-over-spectator');

// ------------------------------------------------------------ 6. rated quick match between two accounts
await host.getByTestId('game-over').getByRole('button', { name: 'New game' }).click();
await host.getByTestId('lobby').waitFor();
const rival = await open('rival', DESKTOP);
await rival.getByTestId('mode-online').click();
await connected(rival);
const m2 = await signup(rival, `rival-${stamp}@example.com`, `Rival${stamp.slice(-5)}`);
await m2.locator('button[type=submit]').click();
await rival.getByTestId('account-name').filter({ hasNotText: 'GUEST' }).waitFor();
await connected(rival);
await connected(host);
await host.getByTestId('quick-match').click();
await host.getByTestId('queued').waitFor();
await shot(host, '13-quick-match-searching');
await rival.getByTestId('quick-match').click();
await host.locator('.board-frame').waitFor({ timeout: 15000 });
await rival.locator('.board-frame').waitFor({ timeout: 15000 });
await play([host, rival], 4);
await shot(rival, '14-rated-game');
await rival.locator('.zone-menu [aria-label="Resign"]').click({ force: true });
await rival.locator('.zone-menu .btn.danger').click({ force: true });
await host.getByTestId('rating-change').waitFor({ timeout: 10000 });
await wait(600);
await shot(host, '15-rated-win-rating-change');
console.log('rating change:', await host.getByTestId('rating-change').textContent());
await host.getByTestId('game-over').getByRole('button', { name: 'New game' }).click();
await host.getByTestId('lobby').waitFor();
await wait(800);
await shot(host, '16-lobby-account-leaderboard');

await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
else console.log('online e2e ok');
