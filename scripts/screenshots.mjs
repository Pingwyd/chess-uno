/**
 * Plays through both modes in a real browser and captures screenshots.
 *   npm run build && npx vite preview --port 4300 &
 *   BASE_URL=http://localhost:4300 node scripts/screenshots.mjs
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4300';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const launch = async () => {
  try {
    return await chromium.launch();
  } catch {
    const chrome = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
    return chromium.launch({ executablePath: chrome });
  }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

async function newPage(browser, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: !!opts.mobile, isMobile: !!opts.mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${viewport.width}x${viewport.height}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('cu.sound', 'false'));
  await page.reload();
  return page;
}

/** One UI step for whichever human is to act: draw, resolve overflow, promote, or make a random legal move. */
async function humanStep(page, zoneSel = '.zone') {
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
    // The board can change under us (bot reply, game over): treat a vanished square as an idle step.
    if (!(await movable.nth(Math.floor(Math.random() * n)).click({ force: true, timeout: 3000 }).then(() => true, () => false))) return 'idle';
    const caps = page.locator('.sq-target-capture');
    const tgts = (await caps.count()) ? caps : page.locator('.sq-target');
    const t = await tgts.count();
    if (t) {
      await tgts.nth(Math.floor(Math.random() * t)).click({ force: true });
      await wait(380);
      return 'move';
    }
  }
  return 'idle';
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log('saved', name);
}

const browser = await launch();

// ---------- Home
{
  const page = await newPage(browser, { width: 1440, height: 900 });
  await wait(600);
  await shot(page, '01-home-desktop');
  await page.close();
}
{
  const page = await newPage(browser, { width: 390, height: 844 }, { mobile: true });
  await wait(600);
  await shot(page, '02-home-mobile');

  // ---------- Pass & Play (mobile portrait)
  await page.getByTestId('mode-pass').click();
  await wait(500);
  await shot(page, '03-pass-start-390x844');
  await page.locator('.zone[data-player="0"] .deck-btn').click({ force: true });
  await wait(420);
  await shot(page, '04-pass-card-reveal-390x844');
  await wait(900);
  await page.locator('[data-square="e2"]').click({ force: true });
  await wait(150);
  await shot(page, '05-pass-move-highlights-390x844');
  await page.locator('[data-square="e4"]').click({ force: true });
  await wait(500);
  // Top player draws and plays.
  await page.locator('.zone[data-player="1"] .deck-btn').click({ force: true });
  await wait(1200);
  await shot(page, '06-pass-top-player-card-390x844');
  for (let i = 0; i < 40; i++) {
    const r = await humanStep(page);
    if (r === 'idle') await wait(200);
    if (await page.getByTestId('game-over').count()) break;
  }
  await wait(300);
  await shot(page, '07-pass-midgame-390x844');
  // Resign from the bottom zone -> two-sided game over.
  if (!(await page.getByTestId('game-over').count())) {
    await page.locator('.zone[data-player="0"] [aria-label="Resign"]').click({ force: true });
    await page.locator('.zone[data-player="0"] .btn.danger').click({ force: true });
  }
  await wait(700);
  await shot(page, '08-pass-game-over-390x844');
  await page.close();
}

// ---------- Pass & Play tablet
{
  const page = await newPage(browser, { width: 820, height: 1180 }, { mobile: true });
  await page.getByTestId('mode-pass').click();
  for (let i = 0; i < 14; i++) await humanStep(page);
  await page.locator('.deck-btn.deck-ready').first().click({ force: true }).catch(() => {});
  await wait(1200);
  await shot(page, '09-pass-tablet-820x1180');
  await page.close();
}

// ---------- Vs Bot desktop
{
  const page = await newPage(browser, { width: 1440, height: 900 });
  await page.getByTestId('level-medium').click();
  await page.getByTestId('start-bot').click();
  await wait(400);
  await page.locator('.zone[data-player="0"] .deck-btn').click({ force: true });
  await wait(1250);
  await shot(page, '10-bot-desktop-card-drawn');
  let humanMoves = 0;
  for (let i = 0; i < 160 && humanMoves < 6; i++) {
    const r = await humanStep(page, '.zone[data-player="0"]');
    if (r === 'move') humanMoves++;
    if (r === 'idle') await wait(400);
    if (await page.getByTestId('game-over').count()) break;
  }
  // Wait until it's our turn again with a card drawn for a nice shot.
  for (let i = 0; i < 40; i++) {
    if (await page.locator('.zone[data-player="0"] .deck-btn.deck-ready').count()) break;
    await wait(300);
  }
  await page.locator('.zone[data-player="0"] .deck-btn.deck-ready').click({ force: true }).catch(() => {});
  await wait(1300);
  await shot(page, '11-bot-desktop-midgame');
  await page.close();
}

// ---------- Vs Bot mobile
{
  const page = await newPage(browser, { width: 390, height: 844 }, { mobile: true });
  await page.getByTestId('level-hard').click();
  await page.getByTestId('start-bot').click();
  let humanMoves = 0;
  for (let i = 0; i < 120 && humanMoves < 6; i++) {
    const r = await humanStep(page, '.zone[data-player="0"]');
    if (r === 'move') humanMoves++;
    if (r === 'idle') await wait(400);
  }
  for (let i = 0; i < 40; i++) {
    if (await page.locator('.zone[data-player="1"].zone-active').count()) break;
    await wait(200);
  }
  await wait(1700);
  await shot(page, '12-bot-mobile-390x844');
  await page.locator('.zone[data-player="0"] [aria-label="Resign"]').click({ force: true }).catch(() => {});
  await page.locator('.zone[data-player="0"] .btn.danger').click({ force: true }).catch(() => {});
  await wait(700);
  await shot(page, '13-bot-game-over-mobile');
  await page.close();
}

await browser.close();
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exitCode = 1;
} else console.log('No page errors.');
