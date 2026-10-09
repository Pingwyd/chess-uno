/**
 * Screenshots for the social features (settings, profile, friends, challenges, live games).
 * Starts its own game server (in-memory DB, port 8798) and a client build pointed at it, seeds
 * accounts / friendships / rated games / live games, then drives a phone-sized browser.
 *
 *   npx tsx scripts/social-shots.ts            → screenshots/social-*.png
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createApp } from '../server/src/app';
import { api, TestClient } from '../server/test/helpers';
import { botStep } from '../src/engine/bot';
import type { PlayerId } from '../src/rules/game';

const API_PORT = 8798;
const WEB_PORT = 4320;
const API = `http://localhost:${API_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const DIST = '/tmp/cu-social-shots-dist';
mkdirSync(OUT, { recursive: true });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ server + client
const app = await createApp({ databaseUrl: ':memory:', jwtSecret: 'shots-secret', clockMs: 600_000, disconnectGraceMs: 90_000, corsOrigin: '*' });
await app.listen(API_PORT);
execSync(`npx vite build --outDir ${DIST} --emptyOutDir`, { stdio: 'ignore', env: { ...process.env, VITE_SERVER_URL: API } });
const preview = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(WEB_PORT), '--strictPort'], { stdio: 'ignore', detached: true });
await wait(2500);

async function account(name: string) {
  const r = await api(API, '/api/signup', { email: `${name.toLowerCase()}@chessuno.test`, password: 'password123', name });
  if (r.status !== 200) throw new Error(JSON.stringify(r.json));
  return { id: r.json.user.id as string, token: r.json.token as string, name };
}
const ws = async (token: string) => { const c = new TestClient(API_PORT, token); await c.connect(); return c; };
const friends = async (a: { token: string }, b: { id: string; token: string }, aId: string) => {
  await api(API, '/api/friends/request', { userId: b.id }, a.token);
  await api(API, '/api/friends/accept', { userId: aId }, b.token);
};

/** Pair two sockets via rated quick match (both are accounts) and return the snapshot. */
async function quickMatch(a: TestClient, b: TestClient) {
  a.send({ t: 'queue' });
  await a.waitFor((m) => m.t === 'queued', 8000, 0);
  b.send({ t: 'queue' });
  const from = a.msgs.length;
  return a.waitFor<{ t: 'room'; snap: NonNullable<TestClient['snap']> }>((m) => m.t === 'room', 8000, from).then((m) => m.snap);
}

/** Let two seated sockets play `n` actions with the easy bot (game stays in progress). */
async function autoplay(a: TestClient, b: TestClient, n: number) {
  const bySeat = (seat: PlayerId) => (a.snap!.you === seat ? a : b);
  for (let i = 0; i < n; i++) {
    const s = a.snap!.state;
    if (s.phase === 'over') return;
    const me = bySeat(s.current);
    const view = me.snap!.state;
    const r = botStep(view, 'easy');
    const before = me.msgs.length;
    if (Array.isArray(r)) me.send({ t: 'action', action: { type: 'move', player: view.current, from: r[0].from, to: r[0].to, promotion: r[0].promotion } });
    else if (r) me.send({ t: 'action', action: r });
    else return;
    await me.waitFor((m) => m.t === 'room' || m.t === 'actionRejected', 8000, before);
    await wait(30);
  }
}

// ------------------------------------------------------------ seed
const me = await account('Prosper');
const ada = await account('Ada');
const kofi = await account('Kofi');
const mei = await account('Mei');
const lars = await account('Lars');
const zara = await account('Zara');
const theo = await account('Theo');
const nia = await account('Nia');

// My rating history: 10 rated games against Ada (W W L W W L W W W L).
{
  const a = await ws(me.token);
  const b = await ws(ada.token);
  for (const win of [1, 1, 0, 1, 1, 0, 1, 1, 1, 0]) {
    const snap = await quickMatch(a, b);
    const loser = win ? b : a;
    const seat = loser.snap?.code === snap.code ? loser.snap!.you! : (snap.you === 0 ? (loser === a ? 0 : 1) : (loser === a ? 1 : 0));
    await loser.waitSnap((x) => x.code === snap.code);
    loser.send({ t: 'action', action: { type: 'resign', player: loser.snap!.you ?? seat } });
    await a.waitSnap((x) => x.code === snap.code && !!x.result);
    a.send({ t: 'leave' }); b.send({ t: 'leave' });
    await wait(60);
  }
  await a.close(); await b.close();
}
for (const [u, r] of [[ada, 1236], [kofi, 1342], [mei, 1288], [lars, 1190], [zara, 1255], [theo, 1418], [nia, 1384]] as const) {
  await app.db.updateTable('users').set({ rating: r, rated_games: 12 }).where('id', '=', u.id).execute();
}
await app.db.updateTable('users').set({ avatar: '🦉' }).where('id', '=', ada.id).execute();
await app.db.updateTable('users').set({ avatar: '🔥' }).where('id', '=', kofi.id).execute();
await app.db.updateTable('users').set({ avatar: '♛' }).where('id', '=', theo.id).execute();
await app.db.updateTable('users').set({ avatar: '♞' }).where('id', '=', me.id).execute();
for (const f of [ada, kofi, mei, lars]) await friends(me, f, me.id);
await api(API, '/api/friends/request', { userId: theo.id }, me.token); // outgoing, pending

// Live games: Kofi vs Mei (friends, rated), Theo vs Nia (rated, top), two guests (casual).
const adaWs = await ws(ada.token);
const kofiWs = await ws(kofi.token), meiWs = await ws(mei.token);
await quickMatch(kofiWs, meiWs);
await kofiWs.waitSnap(() => true); await meiWs.waitSnap(() => true);
await autoplay(kofiWs, meiWs, 26);
const theoWs = await ws(theo.token), niaWs = await ws(nia.token);
await quickMatch(theoWs, niaWs);
await theoWs.waitSnap(() => true); await niaWs.waitSnap(() => true);
await autoplay(theoWs, niaWs, 14);
const g1 = await TestClient.guest(API, API_PORT), g2 = await TestClient.guest(API, API_PORT);
g1.send({ t: 'queue' }); await g1.waitFor((m) => m.t === 'queued', 8000, 0); g2.send({ t: 'queue' });
await g1.waitSnap(() => true); await g2.waitSnap(() => true);
await autoplay(g1, g2, 8);
// A couple of spectators on the top game.
for (let i = 0; i < 3; i++) { const sp = await TestClient.guest(API, API_PORT); sp.send({ t: 'spectate', code: theoWs.snap!.code }); }

// ------------------------------------------------------------ browser
const chrome = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
// Some learning-path progress so the profile shows earned badges and an unlocked skin.
const lessons = Object.fromEntries(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'c1', 'c2', 'c3', 'c4', 'c5'].map((id, i) => [id, { stars: i % 3 === 2 ? 2 : 3 }]));
const learn = JSON.stringify({
  v: 1, xp: 620, lessons, days: ['2026-10-07', '2026-10-08', '2026-10-09'], frozen: [], freezes: 1, daily: {},
  badges: { 'first-steps': '2026-10-07', 'board-ready': '2026-10-08', 'card-shark': '2026-10-09', 'perfectionist': '2026-10-09', 'on-fire': '2026-10-09', scholar: '2026-10-09' },
  skins: { w: 'frost', b: 'tide' }, rankedUnlocked: false, updatedAt: Date.now(),
});
await ctx.addInitScript(([t, l]) => {
  if (!sessionStorage.getItem('cu.seeded')) {
    localStorage.setItem('cu.token', t);
    localStorage.setItem('cu.learn', l);
    localStorage.setItem('cu.sound', 'false');
    sessionStorage.setItem('cu.seeded', '1');
  }
}, [me.token, learn]);
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = async (name: string, full = false) => { await wait(350); await page.screenshot({ path: `${OUT}social-${name}.png`, fullPage: full }); console.log('  ✓', name); };
const tid = (id: string) => page.getByTestId(id);

await page.goto(WEB);
await tid('open-profile').waitFor();
await page.getByText('Prosper').first().waitFor();
await shot('home');

// Settings
await tid('open-settings').click();
await tid('prefs').waitFor();
await shot('settings', true);

// Profile with rating chart
await tid('tab-profile').click();
await page.locator('.rating-chart svg').waitFor();
await shot('profile', true);
await tid('avatar-btn').click();
await tid('avatar-picker').waitFor();
await shot('avatar-picker');
await tid('avatar-btn').click();

// Friends with presence
await tid('tab-friends').click();
await tid('friend-Kofi').waitFor();
await page.waitForFunction(() => document.querySelectorAll('.presence-dot.pd-playing').length >= 2);
await shot('friends', true);

// Friend request flow: search + add, then an incoming request arrives live.
await tid('friend-search').fill('ni');
await tid('add-Nia').waitFor();
await shot('friend-search');
await tid('add-Nia').click();
await page.getByText('Requested').first().waitFor();
await api(API, '/api/friends/request', { userId: me.id }, zara.token);
await tid('notice').waitFor();
await tid('incoming').waitFor();
await shot('friend-request');
await tid('accept-Zara').click();
await tid('friend-Zara').waitFor();
await tid('friend-search').fill('');

// Incoming challenge (on Home), declined.
await tid('settings-home').click();
await tid('home').waitFor();
adaWs.send({ t: 'challenge', userId: me.id });
await tid('challenge-card').waitFor();
await wait(1200);
await shot('challenge');
await tid('challenge-decline').click();
await adaWs.waitFor((m) => m.t === 'challengeUpdate' && m.status === 'declined', 8000, 0);

// Outgoing challenge from Friends → waiting room → Ada accepts → game.
await tid('open-profile').click();
await tid('tab-friends').click();
await tid('challenge-Ada').click();
await tid('challenge-wait').waitFor();
await wait(1500);
await shot('challenge-sent');
const ch = await adaWs.waitFor<{ t: 'challenge'; challenge: { id: string } }>((m) => m.t === 'challenge', 8000, adaWs.msgs.findIndex((m) => m.t === 'challengeUpdate') + 1);
adaWs.send({ t: 'challengeReply', id: ch.challenge.id, accept: true });
await tid('game').waitFor();
await wait(1500);
await shot('challenge-accepted');
const adaSnap = await adaWs.waitSnap(() => true);
adaWs.send({ t: 'action', action: { type: 'resign', player: adaSnap.you! } });
await tid('game-over').waitFor();
await wait(800);
await shot('challenge-won');
await page.getByRole('button', { name: 'New game' }).click();

// Live games in the lobby
await tid('live-games').waitFor();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="live-row"]').length >= 3);
await tid('live-games').scrollIntoViewIfNeeded();
await shot('live');
await tid('live-games').screenshot({ path: `${OUT}social-live-card.png` });
await tid('live-filter-friends').click();
await wait(300);
await tid('live-games').screenshot({ path: `${OUT}social-live-friends.png` });
await tid('live-filter-all').click();
await tid('lobby-friends').scrollIntoViewIfNeeded();
await shot('lobby-friends');

// Spectate Kofi vs Mei (rated → one turn behind)
await page.locator(`[data-testid="live-row"][data-code="${kofiWs.snap!.code}"]`).click();
await tid('game').waitFor();
await autoplay(kofiWs, meiWs, 6);
await wait(1500);
await shot('spectate');

// Desktop profile
const desk = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
await desk.addInitScript(([t]) => { localStorage.setItem('cu.token', t); localStorage.setItem('cu.sound', 'false'); }, [me.token]);
const dp = await desk.newPage();
await dp.goto(WEB + '/?settings');
await dp.getByTestId('tab-profile').click();
await dp.locator('.rating-chart svg').waitFor();
await wait(500);
await dp.screenshot({ path: `${OUT}social-profile-desktop.png`, fullPage: true });
console.log('  ✓ profile-desktop');

console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
try { process.kill(-preview.pid!); } catch { /* already gone */ }
await app.close();
process.exit(0);
