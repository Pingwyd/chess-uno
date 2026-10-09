/**
 * Learning-path screenshots + end-to-end smoke test (Playwright).
 *   VITE_SERVER_URL=http://localhost:8797 npm run build && npx vite preview --port 4310 &
 *   BASE_URL=http://localhost:4310 node scripts/learn-shots.mjs
 * Writes screenshots/learn-*.png. Plays real lessons by tapping board squares.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL ?? 'http://localhost:4310';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY?.split(',');
const want = (k) => !ONLY || ONLY.includes(k);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: GL });

// Today's daily puzzle (same function the app uses), so the script can solve it.
const daily = JSON.parse(execFileSync('npx', ['tsx', '-e',
  "import { dailyFor } from './src/learn/content'; import { utcDay } from './src/learn/progress'; console.log(JSON.stringify(dailyFor(utcDay())))"],
{ cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' }));

const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** A learner partway through: unit 1 and most of unit 2 done, a 3-day streak. */
const SEED = {
  v: 1, xp: 205, freezes: 1, frozen: [], daily: {}, skins: { w: 'ember', b: 'tide' }, rankedUnlocked: false, updatedAt: 1,
  lessons: { b1: { stars: 3 }, b2: { stars: 3 }, b3: { stars: 2 }, b4: { stars: 3 }, b5: { stars: 2 }, b6: { stars: 3 }, c1: { stars: 3 }, c2: { stars: 2 }, c3: { stars: 3 } },
  days: [day(-3), day(-2), day(-1)],
  badges: { 'first-steps': day(-3), 'board-ready': day(-2), 'on-fire': day(-1) },
};

async function open(name, viewport, { board = '2d', dsf = 1, mobile = false, seed = SEED, path = '/' } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript(([b, s]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('cu.sound', 'false');
    localStorage.setItem('cu.board', JSON.stringify(b));
    localStorage.setItem('cu.pieceSet', JSON.stringify('arcane'));
    if (s) localStorage.setItem('cu.learn', JSON.stringify(s)); else localStorage.removeItem('cu.learn');
  }, [board, seed]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/WebSocket|ERR_CONNECTION|GPU stall|swiftshader|api\/learn|Failed to load resource/i.test(m.text()) && errors.push(`${name} console: ${m.text()}`));
  await page.goto(BASE + path);
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}learn-${name}.png` });
const tap = async (page, sq) => { await page.locator(`[data-square="${sq}"]`).click(); await wait(220); };
const play = async (page, moves) => {
  for (const m of moves) {
    if (m === 'skip' || m === 'reverse') { await page.getByTestId(`play-${m}`).click(); await wait(500); continue; }
    await page.waitForFunction(() => document.querySelector('.turn-info b')?.textContent?.startsWith('Move'), null, { timeout: 10000 });
    await tap(page, m.slice(0, 2));
    await tap(page, m.slice(2, 4));
    if (m.length === 5) { await page.getByTestId(`promo-${m[4]}`).click(); await wait(200); }
    await wait(350);
  }
};
const cont = async (page) => { await page.getByTestId('continue').click(); await wait(450); };

async function lessonFlow(page, tag) {
  await page.getByTestId('open-learn').click();
  await page.getByTestId('path-map').waitFor();
  await wait(900);
  await shot(page, `path-${tag}`);
  // Lesson c4: explainer with an animated demo.
  await page.getByTestId('node-c4').click({ force: true });
  await page.getByTestId('explain').waitFor();
  await wait(4300);
  await shot(page, `explainer-${tag}`);
  await cont(page);
  // Puzzle in progress: first quiet move made.
  await play(page, ['c2c7']);
  await wait(500);
  await shot(page, `puzzle-${tag}`);
  // Wrong: an early check that isn't mate ends the turn.
  await page.getByTestId('reset').click();
  await wait(700);
  await play(page, ['c2c8']);
  await page.getByTestId('feedback-wrong').waitFor();
  await wait(600);
  await shot(page, `wrong-${tag}`);
  await page.getByTestId('try-again').click();
  await wait(700);
  await play(page, ['c2c7', 'd3e3', 'e3e8']);
  await page.getByTestId('feedback-correct').waitFor();
  await wait(700);
  await shot(page, `correct-${tag}`);
  await cont(page);
  await play(page, ['a3c1', 'c1h6', 'd1d8']);
  await page.getByTestId('feedback-correct').waitFor();
  await cont(page);
  await page.getByTestId('option-1').click();
  await wait(400);
  await cont(page);
  await page.getByTestId('lesson-complete').waitFor();
  await wait(2200);
  await shot(page, `complete-${tag}`);
}

if (want('mobile')) {
  const page = await open('mobile', { width: 390, height: 844 }, { dsf: 2, mobile: true });
  await page.getByTestId('learn-card').waitFor();
  await shot(page, 'home-mobile');
  await lessonFlow(page, 'mobile');
  // Next lesson (c5) finishes unit 2 → Card Shark badge + Frost Ember skin.
  await page.getByTestId('next-lesson').click();
  await page.getByTestId('explain').waitFor();
  await cont(page);
  await play(page, ['c3d1', 'd4d8']);
  await page.getByTestId('feedback-correct').waitFor();
  await cont(page);
  await page.getByTestId('hint').click();
  await wait(300);
  await play(page, ['e1f1', 'f3h4']);
  await page.getByTestId('feedback-correct').waitFor();
  await cont(page);
  await page.getByTestId('option-0').click();
  await wait(300);
  await cont(page);
  await page.getByTestId('new-badge').first().waitFor();
  await wait(2400);
  await shot(page, 'badge-earned-mobile');
  await page.getByTestId('complete-continue').click();
  await page.getByTestId('tab-badges').click();
  await wait(500);
  await page.getByTestId('skin-frost').click();
  await wait(300);
  await page.evaluate(() => { document.querySelectorAll('*').forEach((el) => { if (el.scrollTop) el.scrollTop = 0; }); window.scrollTo(0, 0); });
  await wait(400);
  await shot(page, 'badges-mobile');
  await page.getByTestId('tab-daily').click();
  await wait(500);
  await shot(page, 'daily-mobile');
  await page.getByTestId('daily-start').click();
  await page.getByTestId('puzzle').waitFor();
  await wait(1200);
  await shot(page, 'daily-puzzle-mobile');
  await play(page, daily.solution);
  await page.getByTestId('feedback-correct').waitFor();
  await cont(page);
  await page.getByTestId('lesson-complete').waitFor();
  await wait(1500);
  await shot(page, 'daily-done-mobile');
  await page.getByTestId('complete-continue').click();
  await page.getByTestId('daily-solved').waitFor();
  // Frost skin shows on the board too.
  await page.getByTestId('learn-home').click();
  await page.getByTestId('learn-card').waitFor();
  console.log('mobile ok');
  await page.context().close();
}

if (want('desktop')) {
  const page = await open('desktop', { width: 1440, height: 900 });
  await page.getByTestId('learn-card').waitFor();
  await shot(page, 'home-desktop');
  await lessonFlow(page, 'desktop');
  await page.getByTestId('complete-continue').click();
  await page.getByTestId('tab-badges').click();
  await wait(400);
  await shot(page, 'badges-desktop');
  await page.getByTestId('tab-daily').click();
  await wait(300);
  await page.getByTestId('daily-start').click();
  await page.getByTestId('puzzle').waitFor();
  await wait(1000);
  await shot(page, 'daily-desktop');
  console.log('desktop ok');
  await page.context().close();
}

if (want('placement')) {
  // A brand-new player tests out of Chess basics.
  const page = await open('placement', { width: 390, height: 844 }, { dsf: 2, mobile: true, seed: null });
  await page.getByTestId('open-learn').click();
  await page.getByTestId('placement').click({ force: true });
  await play(page, ['d1d8']); await page.getByTestId('feedback-correct').waitFor(); await cont(page);
  await page.getByTestId('option-1').click(); await cont(page);
  await play(page, ['e5f6']); await page.getByTestId('feedback-correct').waitFor(); await cont(page);
  await page.getByTestId('option-1').click(); await cont(page);
  await play(page, ['c2a1']); await page.getByTestId('feedback-correct').waitFor(); await cont(page);
  await page.getByTestId('lesson-complete').waitFor();
  await wait(1500);
  await shot(page, 'placement-mobile');
  await page.getByTestId('complete-continue').click();
  await page.getByTestId('node-c1').waitFor();
  const done = await page.locator('[data-testid^="node-b"].done').count();
  console.log('placement ok, unit 1 lessons done:', done);
  await page.context().close();
}

if (want('3d')) {
  const page = await open('3d', { width: 1440, height: 900 }, { board: '3d' });
  await page.getByTestId('open-learn').click();
  await page.getByTestId('node-c4').click({ force: true });
  await cont(page);
  await page.waitForFunction(() => window.__cu3d?.frames() > 12, null, { timeout: 120000, polling: 250 });
  await wait(2500);
  // Make the first quiet move by tapping the 3D board.
  const SQ = (n) => (n.charCodeAt(1) - 49) * 8 + (n.charCodeAt(0) - 97);
  for (const [sq, y] of [['c2', 0.35], ['c7', 0.02]]) {
    const p = await page.evaluate(([s, yy]) => window.__cu3d.project(s, yy), [SQ(sq), y]);
    await page.mouse.click(p.x, p.y);
    await wait(1500);
  }
  await wait(3000);
  await shot(page, 'puzzle-3d');
  console.log('3d ok');
  await page.context().close();
}

await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('learn shots ok');
