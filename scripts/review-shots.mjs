/**
 * Replay + review screenshots and an end-to-end smoke test (Playwright).
 *   VITE_SERVER_URL=http://localhost:8797 npm run build && npx vite preview --port 4310 &
 *   BASE_URL=http://localhost:4310 node scripts/review-shots.mjs
 * Writes screenshots/review-*.png. Plays a real game to the game-over screen and opens its review;
 * the other shots use deterministic saved games from scripts/review-fixtures.ts.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL ?? 'http://localhost:4310';
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = `${ROOT}screenshots/`;
mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY?.split(',');
const want = (k) => !ONLY || ONLY.includes(k);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: GL });
const FIX = JSON.parse(execFileSync('npx', ['tsx', 'scripts/review-fixtures.ts'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }));

async function open(name, viewport, { board = '2d', dsf = 2, mobile = false, seed = true, path = '/' } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript(([b]) => {
    localStorage.setItem('cu.sound', 'false');
    localStorage.setItem('cu.board', JSON.stringify(b));
    localStorage.setItem('cu.pieceSet', JSON.stringify('arcane'));
  }, [board]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/WebSocket|ERR_CONNECTION|GPU stall|swiftshader|Failed to load resource/i.test(m.text()) && errors.push(`${name} console: ${m.text()}`));
  await page.goto(BASE + '/');
  if (seed) {
    await page.evaluate(async (fix) => {
      const db = await new Promise((res, rej) => {
        const req = indexedDB.open('chess-uno', 1);
        req.onupgradeneeded = () => { for (const s of ['records', 'reviews']) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      await new Promise((res) => {
        const tx = db.transaction('records', 'readwrite');
        for (const r of fix.records) tx.objectStore('records').put(r, r.id);
        tx.oncomplete = res;
      });
      db.close();
      localStorage.setItem('cu.games', JSON.stringify(fix.index));
    }, FIX);
  }
  if (path !== '/' || seed) await page.goto(BASE + path);
  return page;
}
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}review-${name}.png` }); console.log('saved', `review-${name}.png`); };
const reviewDone = (page) => page.waitForFunction(() => !document.querySelector('[data-testid="coach-wait"]'), null, { timeout: 120_000 });
const openSaved = async (page, title) => {
  await page.getByTestId('recent-games').getByText(title).first().click();
  await page.getByTestId('replay').waitFor();
};

/** One UI step for the bottom human: draw, resolve overflow, promote, or a random legal move. */
async function humanStep(page, zoneSel = '.zone[data-player="0"]') {
  const promo = page.locator(`${zoneSel} .promo-btn`).first();
  if (await promo.count()) { await promo.click(); return 'promote'; }
  const discard = page.locator(`${zoneSel} .overflow-card .btn`).last();
  if (await discard.count()) { await discard.click(); return 'discard'; }
  const deck = page.locator(`${zoneSel} .deck-btn.deck-ready`).first();
  if (await deck.count()) { await deck.click({ force: true }); await wait(1150); return 'draw'; }
  const movable = page.locator('.sq-movable');
  const n = await movable.count();
  if (!n) return 'idle';
  for (let tries = 0; tries < 6; tries++) {
    await movable.nth(Math.floor(Math.random() * n)).click({ force: true });
    const caps = page.locator('.sq-target-capture');
    const tgts = (await caps.count()) ? caps : page.locator('.sq-target');
    const t = await tgts.count();
    if (t) { await tgts.nth(Math.floor(Math.random() * t)).click({ force: true }); await wait(350); return 'move'; }
  }
  return 'idle';
}

// ---------- 1. Real game -> game over -> Review game (end to end: saving + worker analysis)
if (want('gameover')) {
  const page = await open('gameover', { width: 390, height: 844 }, { mobile: true, seed: false, path: '/?seed=4242' });
  await page.getByTestId('level-easy').click();
  await page.getByTestId('start-bot').click();
  let moves = 0;
  for (let i = 0; i < 200 && moves < 8; i++) {
    const r = await humanStep(page);
    if (r === 'move') moves++;
    if (r === 'idle') await wait(300);
    if (await page.getByTestId('game-over').count()) break;
  }
  if (!(await page.getByTestId('game-over').count())) {
    await page.locator('.zone[data-player="0"] [aria-label="Resign"]').click({ force: true });
    await page.locator('.zone[data-player="0"] .btn.danger').click({ force: true });
  }
  await page.getByTestId('review-game').waitFor();
  await wait(800);
  await shot(page, '01-game-over-review-button');
  await page.getByTestId('review-game').click();
  await page.getByTestId('replay').waitFor();
  await page.getByTestId('review-summary').waitFor({ timeout: 120_000 });
  await wait(500);
  await shot(page, '01b-own-game-review');
  // It's in Recent games now.
  await page.getByTestId('replay-close').click();
  await page.getByTestId('recent-games').waitFor();
  const n = await page.getByTestId('recent-item').count();
  if (n !== 1) errors.push(`gameover: expected 1 recent game, got ${n}`);
  await page.context().close();
}

// ---------- 2. Replay viewer, mobile
if (want('mobile')) {
  const page = await open('mobile', { width: 390, height: 844 }, { mobile: true });
  await openSaved(page, 'You vs Rook Bot');
  await reviewDone(page);
  // Step to a mid-game card turn.
  await page.getByTestId('ctl-start').click();
  for (let i = 0; i < 9; i++) await page.getByTestId('ctl-next-turn').click();
  await page.getByTestId('ctl-next').click();
  await page.getByTestId('ctl-next').click();
  await wait(700);
  await shot(page, '02-replay-mobile');
  // Review summary (scrolled to the review tab).
  await page.getByTestId('tab-review').click();
  await page.getByTestId('review-summary').waitFor();
  await page.getByTestId('tab-review').scrollIntoViewIfNeeded();
  await page.evaluate(() => { const el = document.querySelector('.replay-scroll'); const t = document.querySelector('[data-testid="tab-review"]'); el.scrollTop = t.offsetTop - 60; });
  await wait(500);
  await shot(page, '04-review-summary-mobile');
  // A flagged mistake with the better line.
  const line = page.getByTestId('moment-line').first();
  await line.click();
  await page.getByTestId('coach-line').waitFor();
  await page.evaluate(() => { document.querySelector('.replay-scroll').scrollTop = 0; });
  await wait(1600);
  await shot(page, '05-mistake-better-line-mobile');
  await page.getByTestId('play-line').click();
  await wait(4200);
  await page.context().close();
}

// ---------- 3. Replay viewer + review, desktop
if (want('desktop')) {
  const page = await open('desktop', { width: 1440, height: 900 }, { dsf: 1 });
  await openSaved(page, 'You vs Rook Bot');
  await reviewDone(page);
  await page.getByTestId('ctl-start').click();
  for (let i = 0; i < 14; i++) await page.getByTestId('ctl-next-turn').click();
  await page.getByTestId('ctl-next').click();
  await wait(700);
  await shot(page, '03-replay-desktop');
  await page.getByTestId('tab-review').click();
  await wait(400);
  await page.getByTestId('moment-line').first().click();
  await page.getByTestId('coach-line').waitFor();
  await page.getByTestId('tab-review').click();
  await wait(1600);
  await shot(page, '06-review-desktop-better-line');
  // Autoplay smoke test.
  await page.getByTestId('exit-line').click();
  await page.getByTestId('ctl-start').click();
  await page.getByTestId('ctl-speed').click();
  await page.getByTestId('ctl-speed').click();
  await page.getByTestId('ctl-play').click();
  await wait(2500);
  const pos = await page.locator('.ctl-pos').textContent();
  if (/step 1\//.test(pos ?? '')) errors.push(`desktop: autoplay did not advance (${pos})`);
  await page.getByTestId('ctl-play').click();
  await page.context().close();
}

// ---------- 4. 3D replay
if (want('3d')) {
  const page = await open('3d', { width: 390, height: 844 }, { mobile: true, board: '3d' });
  await openSaved(page, 'You vs Rook Bot');
  await reviewDone(page);
  await page.getByTestId('tab-review').click();
  await page.getByTestId('moment-line').first().click();
  await page.getByTestId('coach-line').waitFor();
  await page.waitForSelector('.board3d canvas', { timeout: 30_000 });
  await page.evaluate(() => { document.querySelector('.replay-scroll').scrollTop = 0; });
  await wait(8000);
  await shot(page, '07-replay-3d-better-line');
  await page.context().close();
}

// ---------- 5. Recent games (home + all games) and the shared online replay link
if (want('recent')) {
  const page = await open('recent', { width: 390, height: 844 }, { mobile: true });
  await page.getByTestId('recent-games').scrollIntoViewIfNeeded();
  await wait(400);
  await shot(page, '08-recent-games-home');
  await page.getByTestId('recent-all').click();
  await page.getByTestId('recent-panel').waitFor();
  await wait(400);
  await shot(page, '09-recent-games-all');
  await page.context().close();
}
if (want('online')) {
  const page = await open('online', { width: 1280, height: 800 }, { dsf: 1, path: '/?replay=0b5e6a52-1f7c-4c1e-9a7e-3d2f1c0b9a88' });
  await page.getByTestId('replay').waitFor();
  await page.getByTestId('share-replay').waitFor();
  await reviewDone(page);
  await page.getByTestId('ctl-start').click();
  for (let i = 0; i < 20; i++) await page.getByTestId('ctl-next-turn').click();
  await wait(1800);
  await shot(page, '10-online-replay-share');
  await page.context().close();
}

await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('ok');
