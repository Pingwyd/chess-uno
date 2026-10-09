/**
 * Crispness check for the 3D board on a 3x phone (WebGL through SwiftShader, which is slow,
 * so the adaptive-quality governor gets exercised the way a weak phone would).
 *   BASE_URL=http://localhost:4310 TAG=after [GRAPHICS=auto|high|low] node scripts/dpr-shots.mjs
 * → screenshots/3d-dpr-<TAG>.png (full phone) and 3d-dpr-<TAG>-crop.png (board, 1:1 device pixels)
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4310';
const TAG = process.env.TAG ?? 'after';
const SETTLE = Number(process.env.SETTLE ?? 20000);
const OUT = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: GL });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
await ctx.addInitScript((graphics) => {
  if (graphics) localStorage.setItem('cu.settings', JSON.stringify({ graphics }));
  localStorage.setItem('cu.sound', 'false');
  localStorage.setItem('cu.board', JSON.stringify('3d'));
  localStorage.setItem('cu.pieceSet', JSON.stringify('arcane'));
}, process.env.GRAPHICS ?? null);
const page = await ctx.newPage();
await page.goto(BASE);
await page.getByRole('button', { name: /Play vs .* Bot/ }).click();
await page.waitForFunction(() => window.__cu3d?.frames() > 12, null, { timeout: 120000, polling: 250 });
await wait(SETTLE);
const info = await page.evaluate(() => {
  const c = document.querySelector('[data-testid="board-3d"] canvas');
  const r = c.getBoundingClientRect();
  return { css: [Math.round(r.width), Math.round(r.height)], buffer: [c.width, c.height], ratio: +(c.width / r.width).toFixed(2), quality: window.__cu3d?.quality?.() ?? null };
});
console.log(TAG, JSON.stringify(info));
await page.screenshot({ path: `${OUT}3d-dpr-${TAG}.png` });
const box = await page.getByTestId('board-3d').boundingBox();
const cx = box.x + box.width * 0.3, cy = box.y + box.height * 0.55;
await page.screenshot({ path: `${OUT}3d-dpr-${TAG}-crop.png`, clip: { x: cx - 70, y: cy - 70, width: 140, height: 140 } });
await browser.close();
