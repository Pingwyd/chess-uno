/** Captures the Reverse card in Pass & Play (seed 2 deals Player 1 a Reverse by turn 6). */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const BASE = process.env.BASE_URL ?? 'http://localhost:4300';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync) }); }
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/?seed=2`);
await page.evaluate(() => localStorage.setItem('cu.sound', 'false'));
await page.reload();
await page.getByTestId('mode-pass').click();
let found = false;
for (let i = 0; i < 400 && !found; i++) {
  const rev = page.locator('.zone[data-player="0"] .hand-card-btn.playable[title="Play reverse"]');
  if (await rev.count()) { found = true; break; }
  const discard = page.locator('.overflow-card .btn').last();
  if (await discard.count()) { await discard.click(); continue; }
  const deck = page.locator('.deck-btn.deck-ready').first();
  if (await deck.count()) { await deck.click({ force: true }); await wait(1100); continue; }
  const movable = page.locator('.sq-movable');
  const n = await movable.count();
  if (!n) { await wait(150); continue; }
  await movable.nth(Math.floor(Math.random() * n)).click({ force: true });
  const caps = page.locator('.sq-target-capture');
  const t = (await caps.count()) ? caps : page.locator('.sq-target');
  const c = await t.count();
  if (c) { await t.nth(Math.floor(Math.random() * c)).click({ force: true }); await wait(330); }
  if (await page.getByTestId('game-over').count()) break;
}
console.log('reverse playable:', found);
if (found) {
  await page.screenshot({ path: `${OUT}14-pass-reverse-ready-390x844.png` });
  await page.locator('.zone[data-player="0"] .hand-card-btn.playable[title="Play reverse"]').click({ force: true });
  await page.locator('.zone[data-player="0"] .confirm-pop .btn.primary').click({ force: true });
  await wait(450);
  await page.screenshot({ path: `${OUT}15-pass-reverse-flipping-390x844.png` });
  await wait(1500);
  await page.screenshot({ path: `${OUT}16-pass-after-reverse-390x844.png` });
}
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
