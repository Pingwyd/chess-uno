/**
 * 3D board screenshots + smoke test (WebGL through SwiftShader when there is no GPU).
 *   VITE_SERVER_URL=http://localhost:8797 npm run build && npx vite preview --port 4310 &
 *   BASE_URL=http://localhost:4310 node scripts/board3d-shots.mjs
 * Moves in 3D are made by tapping the canvas at projected square positions
 * (window.__cu3d.project), so the real raycast picking path is exercised.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4310';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY?.split(',');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: GL });

async function open(name, viewport, { board = '3d', set = 'arcane', url = BASE, dsf = 1, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript(([b, s]) => {
    localStorage.setItem('cu.sound', 'false');
    localStorage.setItem('cu.board', JSON.stringify(b));
    localStorage.setItem('cu.pieceSet', JSON.stringify(s));
  }, [board, set]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/WebSocket|ERR_CONNECTION|GPU stall|swiftshader/i.test(m.text()) && errors.push(`${name} console: ${m.text()}`));
  await page.goto(url);
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}3d-${name}.png` });
const ready3d = async (page) => { await page.waitForFunction(() => window.__cu3d?.frames() > 12, null, { timeout: 120000, polling: 250 }); await wait(2500); };
const tapSquare = async (page, sq, y = 0.35) => {
  const p = await page.evaluate(([s, yy]) => window.__cu3d.project(s, yy), [sq, y]);
  await page.mouse.click(p.x, p.y);
};
const SQ = (n) => (n.charCodeAt(1) - 49) * 8 + (n.charCodeAt(0) - 97);

/** Play the current human turn on a 3D board by tapping squares. Prefers captures and central pawn/knight moves. */
async function turn3d(page, { slowLast = 0, onLast } = {}) {
  await page.locator('.deck-btn.deck-ready').first().waitFor({ timeout: 60000 });
  const discard = page.locator('.overflow-card .btn').last();
  await page.locator('.deck-btn.deck-ready').first().click({ force: true });
  await wait(1800);
  if (await discard.count()) { await discard.click({ force: true }); await wait(800); }
  for (let i = 0; i < 6; i++) {
    const movable = await page.evaluate(() => window.__cu3d?.movable() ?? []);
    if (!movable.length) break;
    const pick = movable[Math.floor(Math.random() * movable.length)];
    await tapSquare(page, pick, 0.35);
    await wait(900);
    const targets = await page.evaluate(() => window.__cu3d.targets());
    if (!targets.length) continue;
    // For the slow-motion shot, take the longest move available so the glide is visible.
    const far = (t) => Math.hypot((t & 7) - (pick & 7), (t >> 3) - (pick >> 3));
    const to = slowLast ? targets.reduce((a, b) => (far(b) > far(a) ? b : a)) : targets[Math.floor(Math.random() * targets.length)];
    if (slowLast) await page.evaluate((k) => { window.__cu3dSlow = k; }, slowLast);
    await tapSquare(page, to, 0.02);
    if (slowLast && onLast) { await onLast(); await page.evaluate(() => { window.__cu3dSlow = 1; }); return; }
    await wait(1500);
    if (await page.getByTestId('game-over').count()) return;
    if (await page.locator('.deck-btn.deck-ready').count()) return; // turn over (check, or out of moves)
  }
}

/** Random legal play on the 2D board (fast) — used to reach Reverse/check positions. */
async function step2d(page) {
  if (await page.getByTestId('game-over').count()) return false;
  const promo = page.locator('.promo-btn').first();
  if (await promo.count()) { await promo.click({ force: true }); return true; }
  const discard = page.locator('.overflow-card .btn').last();
  if (await discard.count()) { await discard.click({ force: true }); return true; }
  const deck = page.locator('.deck-btn.deck-ready').first();
  if (await deck.count()) { await deck.click({ force: true }); await wait(1000); return true; }
  const movable = page.locator('.sq-movable');
  const n = await movable.count();
  if (!n) { await wait(150); return false; }
  await movable.nth(Math.floor(Math.random() * n)).click({ force: true });
  const caps = page.locator('.sq-target-capture');
  const t = (await caps.count()) ? caps : page.locator('.sq-target');
  const c = await t.count();
  if (c) { await t.nth(Math.floor(Math.random() * c)).click({ force: true }); await wait(300); }
  return true;
}
const want = (k) => !ONLY || ONLY.includes(k);

// ------------------------------------------------------------ desktop vs bot (Arcane) + mid-move
if (want('desktop')) {
  const page = await open('desktop', { width: 1440, height: 900 }, { url: `${BASE}/?seed=11` });
  await page.getByTestId('level-easy').click();
  await page.getByTestId('start-bot').click();
  await ready3d(page);
  await shot(page, 'desktop-start');
  await turn3d(page);
  await turn3d(page);
  await page.locator('.deck-btn.deck-ready').first().waitFor({ timeout: 60000 });
  await wait(2500);
  await shot(page, 'desktop');
  await turn3d(page, { slowLast: 20, onLast: async () => { await wait(3300); await shot(page, 'mid-move'); await wait(5000); } });
  console.log('desktop ok');
  await page.context().close();
}

// ------------------------------------------------------------ mobile portrait vs bot
if (want('mobile')) {
  const page = await open('mobile', { width: 390, height: 844 }, { url: `${BASE}/?seed=5`, dsf: 2, mobile: true });
  await page.getByTestId('start-bot').click();
  await ready3d(page);
  await turn3d(page);
  await page.locator('.deck-btn.deck-ready').first().waitFor({ timeout: 60000 });
  await wait(2500);
  await shot(page, 'mobile-portrait');
  console.log('mobile ok');
  await page.context().close();
}

// ------------------------------------------------------------ Pass & Play: Reverse spin, then check
if (want('pass')) {
  const page = await open('pass', { width: 390, height: 844 }, { url: `${BASE}/?seed=2`, board: '2d', dsf: 2, mobile: true });
  await page.getByTestId('mode-pass').click();
  const rev = page.locator('.hand-card-btn.playable[title="Play reverse"]').first();
  for (let i = 0; i < 3000 && !(await rev.count()); i++) {
    if (await page.getByTestId('game-over').count()) await page.getByTestId('game-over').getByRole('button', { name: 'Rematch' }).first().click();
    await step2d(page);
  }
  if (!(await rev.count())) { await shot(page, 'debug-no-reverse'); throw new Error('no Reverse reached'); }
  await page.getByTestId('toggle-board').click();
  await ready3d(page);
  await shot(page, 'pass-play');
  await page.evaluate(() => { window.__cu3dSlow = 6; });
  await rev.click({ force: true });
  await page.locator('.confirm-pop .btn.primary').first().click({ force: true });
  await wait(3200);
  await shot(page, 'reverse-spin');
  await wait(8000);
  await page.evaluate(() => { window.__cu3dSlow = 1; });
  await shot(page, 'after-reverse');
  // Find a check: play on the 2D board, then flip back to 3D.
  await page.getByTestId('toggle-board').click();
  let found = false;
  for (let i = 0; i < 1500 && !found; i++) {
    await step2d(page);
    found = (await page.locator('.sq-check').count()) > 0 && !(await page.getByTestId('game-over').count());
    if (await page.getByTestId('game-over').count()) break;
  }
  console.log('check found:', found);
  if (found) {
    await page.getByTestId('toggle-board').click();
    await ready3d(page);
    await wait(1500);
    await shot(page, 'check');
  }
  await page.context().close();
}

// ------------------------------------------------------------ Classic set
if (want('classic')) {
  const page = await open('classic', { width: 1440, height: 900 }, { url: `${BASE}/?seed=3`, set: 'classic' });
  await page.getByTestId('start-bot').click();
  await ready3d(page);
  await turn3d(page);
  await page.locator('.deck-btn.deck-ready').first().waitFor({ timeout: 60000 });
  await wait(2500);
  await shot(page, 'classic');
  // Toggle to 2D and back from the in-game button.
  await page.getByTestId('toggle-board').click();
  await page.locator('.board-frame').waitFor();
  await page.getByTestId('toggle-board').click();
  await page.getByTestId('board-3d').waitFor();
  console.log('classic ok');
  await page.context().close();
}

// ------------------------------------------------------------ Online: spectator in 3D
if (want('online')) {
  const host = await open('host', { width: 1280, height: 800 }, { board: '2d' });
  await host.getByTestId('mode-online').click();
  await host.getByTestId('create-invite').click();
  const code = (await host.getByTestId('invite-code').textContent()).trim();
  const guest = await open('guest', { width: 1280, height: 800 }, { board: '3d', url: `${BASE}/?join=${code}` });
  await host.locator('.board-frame').waitFor({ timeout: 20000 });
  await ready3d(guest);
  const watcher = await open('watcher', { width: 1440, height: 900 }, { board: '3d', url: `${BASE}/?watch=${code}` });
  await ready3d(watcher);
  // Host plays on 2D, guest in 3D.
  for (let t = 0; t < 4; t++) {
    const hostTurn = await host.locator('.deck-btn.deck-ready').count();
    if (hostTurn) { for (let i = 0; i < 12; i++) if (!(await step2d(host)) && !(await host.locator('.deck-btn.deck-ready').count())) break; }
    else await turn3d(guest);
    await wait(1500);
  }
  await wait(2500);
  await shot(guest, 'online-player');
  await shot(watcher, 'online-spectator');
  console.log('online ok');
  for (const p of [host, guest, watcher]) await p.context().close();
}

// ------------------------------------------------------------ no WebGL → 2D fallback
if (want('fallback')) {
  const b2 = await chromium.launch({ executablePath: exe, args: ['--disable-webgl', '--disable-3d-apis'] });
  const ctx = await b2.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { localStorage.setItem('cu.board', '"3d"'); localStorage.setItem('cu.sound', 'false'); });
  const page = await ctx.newPage();
  await page.goto(BASE);
  const disabled = await page.getByTestId('board-3d-opt').isDisabled();
  await page.getByTestId('start-bot').click();
  await page.locator('.board-frame').waitFor();
  console.log('no-webgl fallback: 3D option disabled =', disabled, ', 2D board shown =', (await page.locator('.board-frame').count()) === 1);
  await b2.close();
}

await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
else console.log('3d shots ok');
