import { afterEach, describe, expect, it } from 'vitest';
import { api, privateGame, startApp, TestClient, type App } from './helpers';
import { botStep } from '../../src/engine/bot';
import { parseSquare } from '../../src/rules/chess';
import { updateElo, kFactor, expectedScore } from '../src/rating';
import { loadConfig } from '../src/config';
import type { GameAction, PlayerId } from '../../src/rules/game';

let app: App | null = null;
afterEach(async () => { await app?.close(); app = null; });

const sq = parseSquare;
const seatToMove = (c: TestClient) => c.snap!.state.current;

describe('elo', () => {
  it('uses K=32 for the first 20 rated games, then 20', () => {
    expect(kFactor(0)).toBe(32);
    expect(kFactor(19)).toBe(32);
    expect(kFactor(20)).toBe(20);
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
    expect(updateElo({ rating: 1200, ratedGames: 0 }, { rating: 1200, ratedGames: 0 }, 1)).toEqual([1216, 1184]);
    expect(updateElo({ rating: 1200, ratedGames: 30 }, { rating: 1200, ratedGames: 0 }, 0.5)).toEqual([1200, 1200]);
    expect(updateElo({ rating: 1400, ratedGames: 30 }, { rating: 1200, ratedGames: 30 }, 0)).toEqual([1385, 1215]);
  });
});

describe('accounts', () => {
  it('guest, signup (upgrading the guest), login, me', async () => {
    const s = await startApp(); app = s.app;
    const g = await api(s.base, '/api/guest', {});
    expect(g.status).toBe(200);
    expect(g.json.user.guest).toBe(true);
    expect(g.json.user.rating).toBe(1200);
    const up = await api(s.base, '/api/signup', { email: 'Ada@Example.com', password: 'correct horse', name: 'Ada' }, g.json.token);
    expect(up.status).toBe(200);
    expect(up.json.user).toMatchObject({ id: g.json.user.id, name: 'Ada', guest: false, email: 'ada@example.com' });
    expect((await api(s.base, '/api/signup', { email: 'ada@example.com', password: 'another pass' })).status).toBe(409);
    expect((await api(s.base, '/api/signup', { email: 'bob@example.com', password: 'short' })).status).toBe(400);
    expect((await api(s.base, '/api/login', { email: 'ada@example.com', password: 'wrong password' })).status).toBe(401);
    const login = await api(s.base, '/api/login', { email: 'ada@example.com', password: 'correct horse' });
    expect(login.status).toBe(200);
    const me = await api(s.base, '/api/me', undefined, login.json.token);
    expect(me.json.user.name).toBe('Ada');
    const row = await s.app.db.selectFrom('users').select('password_hash').where('id', '=', me.json.user.id).executeTakeFirstOrThrow();
    expect(row.password_hash).toMatch(/^\$2[aby]\$10\$/);
  });
  it('rejects sockets with a bad token', async () => {
    const s = await startApp(); app = s.app;
    const c = new TestClient(s.port, 'not-a-token');
    const m = await c.connect();
    expect(m).toMatchObject({ t: 'error', code: 'auth' });
  });
});

describe('learning progress sync', () => {
  it('guests are told to sign up; accounts store and merge progress', async () => {
    const s = await startApp(); app = s.app;
    const g = await api(s.base, '/api/guest', {});
    expect((await api(s.base, '/api/learn', undefined, g.json.token)).status).toBe(403);
    expect((await api(s.base, '/api/learn', undefined)).status).toBe(401);
    const up = await api(s.base, '/api/signup', { email: 'learner@example.com', password: 'correct horse' });
    const t = up.json.token;
    expect((await api(s.base, '/api/learn', undefined, t)).json.progress).toBeNull();
    const deviceA = { v: 1, xp: 40, lessons: { b1: { stars: 2 } }, days: ['2026-10-08'], badges: { 'first-steps': '2026-10-08' }, updatedAt: 1 };
    const saved = await api(s.base, '/api/learn', { progress: deviceA }, t);
    expect(saved.status).toBe(200);
    expect(saved.json.progress).toMatchObject({ xp: 40, lessons: { b1: { stars: 2 } } });
    // A second device with different progress: nothing is lost, best stars win.
    const deviceB = { v: 1, xp: 25, lessons: { b1: { stars: 3 }, b2: { stars: 1 } }, days: ['2026-10-09'], rankedUnlocked: false, updatedAt: 2, lessonsJunk: 1 };
    const merged = await api(s.base, '/api/learn', { progress: deviceB }, t);
    expect(merged.json.progress).toMatchObject({ xp: 40, lessons: { b1: { stars: 3 }, b2: { stars: 1 } }, days: ['2026-10-08', '2026-10-09'] });
    expect((await api(s.base, '/api/learn', undefined, t)).json.progress.lessons.b2.stars).toBe(1);
    // Garbage is sanitised, not stored verbatim.
    const junk = await api(s.base, '/api/learn', { progress: { xp: 'lots', lessons: { '<x>': { stars: 9 } } } }, t);
    expect(junk.status).toBe(200);
    expect(junk.json.progress.lessons['<x>']).toBeUndefined();
  });
});

describe('online game', () => {
  it('two clients play a full game over sockets (bot-driven) and it is persisted', async () => {
    const s = await startApp(); app = s.app;
    const { a, b, snap } = await privateGame(s.base, s.port);
    expect(snap.rated).toBe(false);
    const clients: Record<PlayerId, TestClient> = { 0: a, 1: b };
    let actions = 0;
    while (actions < 4000) {
      const cur = a.snap!;
      if (cur.state.phase === 'over') break;
      const seat = cur.state.current;
      const me = clients[seat];
      const view = me.snap!;
      if (view.state.phase === 'over') break;
      const r = botStep(view.state, 'easy');
      const before = me.msgs.length;
      if (Array.isArray(r)) {
        const m = r[0];
        me.send({ t: 'action', action: { type: 'move', player: seat, from: m.from, to: m.to, promotion: m.promotion } });
      } else if (r) me.send({ t: 'action', action: r });
      const reply = await me.waitFor((m) => m.t === 'room' || m.t === 'actionRejected', 8000, before);
      if (reply.t !== 'room') throw new Error(JSON.stringify(reply) + ' ' + JSON.stringify({seat, phase: view.state.phase, cur: view.state.current, r}));
      const n = me.snap!.state.events.length;
      await a.waitSnap((x) => x.state.events.length === n);
      await b.waitSnap((x) => x.state.events.length === n);
      actions++;
    }
    const final = await a.waitSnap((x) => x.state.phase === 'over' && !!x.result);
    expect(final.state.result).not.toBeNull();
    expect(final.result!.seed).toBeTypeOf('number');
    const row = await s.app.db.selectFrom('games').selectAll().where('id', '=', final.gameId).executeTakeFirstOrThrow();
    expect(row.status).toBe('finished');
    expect(row.reason).toBe(final.state.result!.reason);
    const log = JSON.parse(row.log!);
    expect(log.actions.length).toBeGreaterThan(2); // seeds are random; easy bots can blunder into a quick mate
    expect(log.history.length).toBeGreaterThan(1);
    // The log replays to the same result with the published seed.
    const { createGame, applyAction } = await import('../../src/rules/game');
    let st = createGame({ seed: log.seed, clockMs: s.app.config.clockMs, player0Color: log.player0Color, players: [{ name: 'a', kind: 'human' }, { name: 'b', kind: 'human' }] }, 0);
    for (const x of log.actions) st = applyAction(st, x.action, 0);
    expect(st.result).toEqual(final.state.result);

    // Replay record (shareable, no chat): rebuilds the live game exactly, clocks included.
    const rep = await api(s.base, `/api/games/${final.gameId}/replay`);
    expect(rep.status).toBe(200);
    expect(rep.json.record).toMatchObject({ mode: 'online', online: { gameId: final.gameId, rated: false } });
    expect(JSON.stringify(rep.json)).not.toContain('"chat"');
    const { reconstruct } = await import('../../src/replay/record');
    const replay = reconstruct(rep.json.record);
    expect(replay.consistent).toBe(true);
    const live = s.app.hub.rooms.get(final.code)?.state;
    if (live) {
      expect(replay.final.history).toEqual(live.history);
      expect(replay.final.clocks).toEqual(live.clocks);
      expect(replay.final.pos).toEqual(live.pos);
    }
    // Server-side review (worker thread), cached after the first request.
    const rev = await api(s.base, `/api/games/${final.gameId}/review`);
    expect(rev.status).toBe(200);
    expect(rev.json.review.turns.length).toBeGreaterThan(0);
    expect(rev.json.review.players[0]).toHaveProperty('accuracy');
    const cached = await s.app.db.selectFrom('game_reviews').select('game_id').where('game_id', '=', final.gameId).executeTakeFirst();
    expect(cached?.game_id).toBe(final.gameId);
    // Each player's recent games list.
    const mine = await api(s.base, '/api/my/games', undefined, a.token);
    expect(mine.json.games[0]).toMatchObject({ gameId: final.gameId, seat: a.snap!.you });
    expect((await api(s.base, '/api/my/games')).status).toBe(401);
    expect((await api(s.base, '/api/games/00000000-0000-0000-0000-000000000000/replay')).status).toBe(404);
  }, 120_000);

  it('rejects illegal moves and out-of-turn actions', async () => {
    const s = await startApp(); app = s.app;
    const { a, b } = await privateGame(s.base, s.port);
    const white = a.snap!.state.colorOf[0] === 'w' ? a : b;
    const black = white === a ? b : a;
    const wSeat = white.snap!.you!;
    black.send({ t: 'action', action: { type: 'draw', player: wSeat } as GameAction }); // impersonation attempt
    expect((await black.waitFor((m) => m.t === 'actionRejected')).t).toBe('actionRejected');
    white.send({ t: 'action', action: { type: 'move', player: wSeat, from: sq('e2'), to: sq('e4') } });
    expect(await white.waitFor((m) => m.t === 'actionRejected')).toMatchObject({ message: expect.stringMatching(/phase/) });
    white.send({ t: 'action', action: { type: 'draw', player: wSeat } });
    await white.waitSnap((x) => x.state.phase === 'moving');
    const n = white.msgs.length;
    white.send({ t: 'action', action: { type: 'move', player: wSeat, from: sq('e2'), to: sq('e5') } });
    expect(await white.waitFor((m) => m.t === 'actionRejected', 4000, n)).toMatchObject({ message: 'Illegal move' });
    white.send({ t: 'action', action: { type: 'pause' } as GameAction });
    expect(await white.waitFor((m) => m.t === 'actionRejected', 4000, n + 1)).toMatchObject({ message: 'Unsupported action' });
  });

  it('server clock: flag fall ends the game for the player to move', async () => {
    const s = await startApp({ clockMs: 1200 }); app = s.app;
    const { a } = await privateGame(s.base, s.port);
    const toMove = seatToMove(a);
    const over = await a.waitSnap((x) => x.state.phase === 'over' && !!x.result, 5000);
    expect(over.state.result).toEqual({ winner: toMove === 0 ? 1 : 0, reason: 'timeout' });
    // The flag fall is in the log, so the replay ends the same way.
    await new Promise((r) => setTimeout(r, 100));
    const rep = await api(s.base, `/api/games/${over.gameId}/replay`);
    const { reconstruct } = await import('../../src/replay/record');
    expect(reconstruct(rep.json.record).final.result).toEqual(over.state.result);
  });

  it('disconnect grace defaults to 90 s (1m30s) and is advertised to the opponent', async () => {
    expect(loadConfig({}).disconnectGraceMs).toBe(90_000);
    expect(loadConfig({ DISCONNECT_GRACE_MS: '5000' }).disconnectGraceMs).toBe(5000);
    const s = await startApp(); app = s.app;
    expect(s.app.config.disconnectGraceMs).toBe(90_000);
    const { a, b } = await privateGame(s.base, s.port);
    const seat = b.snap!.you!;
    const t0 = Date.now();
    await b.close();
    const away = await a.waitSnap((x) => !x.seats[seat].connected);
    const left = away.seats[seat].graceUntil! - t0;
    expect(left).toBeGreaterThan(88_000);
    expect(left).toBeLessThanOrEqual(91_000);
  });

  it('reconnect resyncs state, and a player who stays away forfeits after the grace period', async () => {
    const s = await startApp({ disconnectGraceMs: 800 }); app = s.app;
    const { a, b } = await privateGame(s.base, s.port);
    const mover = seatToMove(a) === a.snap!.you ? a : b;
    const other = mover === a ? b : a;
    mover.send({ t: 'action', action: { type: 'draw', player: mover.snap!.you! } });
    await mover.waitSnap((x) => x.state.phase === 'moving');
    const eventsBefore = mover.snap!.state.events.length;
    await mover.close();
    const away = await other.waitSnap((x) => !x.seats[mover.snap!.you!].connected);
    expect(away.seats[mover.snap!.you!].graceUntil).toBeTypeOf('number');
    // Reconnect with the same token: full state comes back.
    const again = new TestClient(s.port, mover.token);
    const welcome = await again.connect();
    expect(welcome).toMatchObject({ t: 'welcome', activeRoom: a.snap!.code });
    const resync = await again.waitSnap(() => true);
    expect(resync.you).toBe(mover.snap!.you);
    expect(resync.state.phase).toBe('moving');
    expect(resync.state.events.length).toBe(eventsBefore);
    await other.waitSnap((x) => x.seats[mover.snap!.you!].connected);
    // Now leave for good.
    await again.close();
    const over = await other.waitSnap((x) => x.state.phase === 'over' && !!x.result, 5000);
    expect(over.state.result).toMatchObject({ winner: other.snap!.you, reason: 'resign' });
    expect(over.result!.note).toBe('abandoned');
    const row = await s.app.db.selectFrom('games').select('reason').where('id', '=', over.gameId).executeTakeFirstOrThrow();
    expect(row.reason).toBe('abandoned');
  });
});

describe('matchmaking + ratings', () => {
  const account = async (base: string, port: number, email: string) => {
    const r = await api(base, '/api/signup', { email, password: 'password123', name: email.split('@')[0] });
    const c = new TestClient(port, r.json.token);
    await c.connect();
    return c;
  };
  it('rated quick match updates Elo for both players', async () => {
    const s = await startApp(); app = s.app;
    const a = await account(s.base, s.port, 'alice@x.io');
    const b = await account(s.base, s.port, 'bobby@x.io');
    a.send({ t: 'queue' });
    expect(await a.waitFor((m) => m.t === 'queued')).toMatchObject({ rated: true });
    b.send({ t: 'queue' });
    const snap = await a.waitSnap(() => true);
    expect(snap.rated).toBe(true);
    expect(snap.seats.map((x) => x.rating)).toEqual([1200, 1200]);
    a.send({ t: 'action', action: { type: 'resign', player: snap.you! } });
    const over = await b.waitSnap((x) => !!x.result);
    const aSeat = snap.you!;
    const delta: [number, number] = aSeat === 0 ? [-16, 16] : [16, -16];
    expect(over.result!.ratingChange).toEqual(delta);
    const rows = await s.app.db.selectFrom('users').select(['name', 'rating', 'rated_games', 'wins', 'losses']).orderBy('name').execute();
    expect(rows).toEqual([
      { name: 'alice', rating: 1184, rated_games: 1, wins: 0, losses: 1 },
      { name: 'bobby', rating: 1216, rated_games: 1, wins: 1, losses: 0 },
    ]);
    const lb = await api(s.base, '/api/leaderboard');
    expect(lb.json.players[0].name).toBe('bobby');
    // Both can queue again after the game.
    a.send({ t: 'queue' });
    expect((await a.waitFor((m) => m.t === 'queued' || m.t === 'error', 4000, a.msgs.length)).t).toBe('queued');
  });
  it('guests are matched in the casual (unrated) queue only; private rooms are unrated', async () => {
    const s = await startApp(); app = s.app;
    const acct = await account(s.base, s.port, 'carol@x.io');
    const g1 = await TestClient.guest(s.base, s.port);
    const g2 = await TestClient.guest(s.base, s.port);
    acct.send({ t: 'queue' });
    g1.send({ t: 'queue' });
    expect(await g1.waitFor((m) => m.t === 'queued')).toMatchObject({ rated: false });
    await new Promise((r) => setTimeout(r, 1200));
    expect(g1.snap).toBeNull();
    expect(acct.snap).toBeNull();
    g2.send({ t: 'queue' });
    const snap = await g1.waitSnap(() => true);
    expect(snap.rated).toBe(false);
    expect(s.app.hub.queue.map((q) => q.client.user.email)).toEqual(['carol@x.io']);
  });
  it('matches by rating window that widens over time', async () => {
    const s = await startApp({ matchWindow: 50, matchWidenPerSec: 1000 }); app = s.app;
    const a = await account(s.base, s.port, 'dave@x.io');
    const b = await account(s.base, s.port, 'erin@x.io');
    await s.app.db.updateTable('users').set({ rating: 1700 }).where('email', '=', 'erin@x.io').execute();
    a.send({ t: 'queue' });
    b.send({ t: 'queue' });
    await b.waitFor((m) => m.t === 'queued');
    expect(a.snap).toBeNull(); // 500 apart: not yet
    const snap = await a.waitSnap(() => true, 4000); // window widens past 500 within ~1s
    expect(snap.seats.map((x) => x.rating).sort()).toEqual([1200, 1700]);
  });
});

describe('spectators and chat', () => {
  it('spectators join by code read-only, see redacted state, and ranked games are one turn behind', async () => {
    const s = await startApp(); app = s.app;
    const { a, b, code } = await privateGame(s.base, s.port);
    const spec = await TestClient.guest(s.base, s.port);
    spec.send({ t: 'spectate', code });
    const view = await spec.waitSnap(() => true);
    expect(view.you).toBeNull();
    expect(view.delayed).toBe(false); // private rooms are unrated -> live
    expect(view.state.drawPile.every((c) => c.id < 0)).toBe(true);
    expect(view.state.rng).toBe(0);
    await a.waitSnap((x) => x.spectators === 1);
    spec.send({ t: 'chat', text: 'hi' });
    expect(await spec.waitFor((m) => m.t === 'error')).toMatchObject({ code: 'chat' });
    spec.send({ t: 'action', action: { type: 'resign', player: 0 } });
    expect(await spec.waitFor((m) => m.t === 'actionRejected')).toBeTruthy();
    void b;

    // Ranked delay: snapshot builder uses the previous turn start for spectators.
    const room = s.app.hub.rooms.get(code)!;
    (room as unknown as { rated: boolean }).rated = true;
    const mover = seatToMove(a) === a.snap!.you ? a : b;
    const seat = mover.snap!.you!;
    mover.send({ t: 'action', action: { type: 'draw', player: seat } });
    await mover.waitSnap((x) => x.state.phase === 'moving');
    const live = room.snapshot(seat);
    const delayed = room.snapshot(null);
    expect(delayed.delayed).toBe(true);
    expect(delayed.state.turnNumber).toBeLessThanOrEqual(live.state.turnNumber);
    expect(delayed.state.phase).toBe('start');
    expect(delayed.state.clockSince).toBeNull();
  });

  it('opponent hands are hidden; chat has emotes, length and rate limits', async () => {
    const s = await startApp(); app = s.app;
    const { a, b } = await privateGame(s.base, s.port);
    // Hidden-hand redaction: give seat 0 a held card directly and inspect seat 1's view.
    const room = [...s.app.hub.rooms.values()][0];
    room.state!.hands[0].push({ id: 999, kind: 'reverse' });
    const viewB = room.snapshot(1);
    expect(viewB.hiddenCardIds).toContain(999);
    expect(viewB.state.hands[0].find((c) => c.id === 999)!.kind).toBe('skip');
    expect(room.snapshot(0).state.hands[0].find((c) => c.id === 999)!.kind).toBe('reverse');

    a.send({ t: 'chat', emote: 'gg' });
    expect(await b.waitFor((m) => m.t === 'chat')).toMatchObject({ msg: { emote: 'gg', seat: a.snap!.you } });
    a.send({ t: 'chat', text: 'x'.repeat(500) });
    const long = await b.waitFor((m) => m.t === 'chat' && !!m.msg.text);
    expect((long as { msg: { text: string } }).msg.text).toHaveLength(200);
    for (let i = 0; i < 5; i++) a.send({ t: 'chat', text: `spam ${i}` });
    expect(await a.waitFor((m) => m.t === 'error' && m.code === 'rate')).toBeTruthy();
  });
  it('enforces one Reverse per player per game (rules v2)', async () => {
    const s = await startApp(); app = s.app;
    const { a, b } = await privateGame(s.base, s.port);
    const room = [...s.app.hub.rooms.values()][0];
    expect(room.state!.config.rules).toBe(2);
    expect(room.exportLog()).toMatchObject({ rules: 2 });
    const seat = room.state!.current;
    // Pretend this seat already used its Reverse and somehow still holds one.
    room.state = { ...room.state!, reversesUsed: seat === 0 ? [1, 0] : [0, 1], turnsCompleted: [9, 9], isOpeningTurn: false, openingCapPending: false, hands: [[], []] };
    room.state.hands[seat] = [{ id: 998, kind: 'reverse' }];
    const err = room.apply(seat, { type: 'playCard', player: seat, cardId: 998 });
    expect(err).toMatch(/used your Reverse/);
    void a; void b;
  });
});

describe('time controls', () => {
  const account = async (base: string, port: number, email: string) => {
    const r = await api(base, '/api/signup', { email, password: 'password123', name: email.split('@')[0] });
    const c = new TestClient(port, r.json.token);
    await c.connect();
    return c;
  };
  it('quick match keeps one queue per time control; the room clock follows the control', async () => {
    const s = await startApp(); app = s.app;
    const a = await account(s.base, s.port, 'fay@x.io');
    const b = await account(s.base, s.port, 'gus@x.io');
    const c = await account(s.base, s.port, 'hal@x.io');
    a.send({ t: 'queue', tc: 'blitz' });
    expect(await a.waitFor((m) => m.t === 'queued')).toMatchObject({ rated: true, tc: 'blitz' });
    b.send({ t: 'queue', tc: 'bullet' });
    await b.waitFor((m) => m.t === 'queued');
    await new Promise((r) => setTimeout(r, 1200));
    expect(a.snap).toBeNull(); // same rating, different controls: no match
    c.send({ t: 'queue', tc: 'blitz' });
    const snap = await a.waitSnap(() => true);
    expect(snap.tc).toBe('blitz');
    expect(snap.state.config.clockMs).toBe(5 * 60_000);
    expect(snap.state.clocks).toEqual([5 * 60_000, 5 * 60_000]);
    expect(s.app.hub.queue.map((q) => [q.client.user.email, q.tc])).toEqual([['gus@x.io', 'bullet']]);
  });
  it('rooms and challenges carry the control; unknown values fall back to rapid (server clock)', async () => {
    const s = await startApp({ clockMs: 420_000 }); app = s.app;
    const a = await TestClient.guest(s.base, s.port);
    const b = await TestClient.guest(s.base, s.port);
    a.send({ t: 'createRoom', tc: 'bullet' });
    const created = await a.waitFor<{ t: 'roomCreated'; code: string; tc: string }>((m) => m.t === 'roomCreated');
    expect(created.tc).toBe('bullet');
    b.send({ t: 'joinRoom', code: created.code });
    expect((await b.waitSnap(() => true)).state.config.clockMs).toBe(3 * 60_000);
    const c = await TestClient.guest(s.base, s.port);
    c.send({ t: 'createRoom', tc: 'hyper' as never });
    expect(await c.waitFor((m) => m.t === 'roomCreated')).toMatchObject({ tc: 'rapid' });
    expect(s.app.hub.rooms.get((c.msgs.find((m) => m.t === 'roomCreated') as { code: string }).code)!.clockMs).toBe(420_000);
  });
});

describe('rematch', () => {
  const finish = async (a: TestClient, b: TestClient) => {
    a.send({ t: 'action', action: { type: 'resign', player: a.snap!.you! } });
    await a.waitSnap((x) => !!x.result);
    return b.waitSnap((x) => !!x.result);
  };
  it('offer + accept starts a new game with the same seats and swapped colours', async () => {
    const s = await startApp(); app = s.app;
    const { a, b, code } = await privateGame(s.base, s.port);
    const first = a.snap!;
    await finish(a, b);
    a.send({ t: 'rematch', code });
    const offer = await b.waitFor((m) => m.t === 'rematch');
    expect(offer).toMatchObject({ status: 'offered', by: first.you });
    expect(s.app.hub.rooms.get(code)!.rematchBy).toBe(first.you);
    b.send({ t: 'rematch', code });
    const next = await a.waitSnap((x) => x.code !== code);
    expect(next.gameId).not.toBe(first.gameId);
    expect(next.you).toBe(first.you);
    expect(next.state.colorOf[next.you!]).not.toBe(first.state.colorOf[first.you!]);
    expect(next.rated).toBe(first.rated);
    expect(next.tc).toBe(first.tc);
    expect((await b.waitSnap((x) => x.code === next.code)).state.phase).not.toBe('over');
  });
  it('decline, withdraw, and leaving cancel the offer; no rematch after the opponent left', async () => {
    const s = await startApp(); app = s.app;
    const { a, b, code } = await privateGame(s.base, s.port);
    await finish(a, b);
    a.send({ t: 'rematch', code });
    await b.waitFor((m) => m.t === 'rematch');
    let n = a.msgs.length;
    b.send({ t: 'rematchDecline', code });
    expect(await a.waitFor((m) => m.t === 'rematch', 4000, n)).toMatchObject({ status: 'declined', by: b.snap!.you });
    n = b.msgs.length;
    a.send({ t: 'rematch', code });
    await b.waitFor((m) => m.t === 'rematch' && m.status === 'offered', 4000, n);
    n = b.msgs.length;
    a.send({ t: 'rematchDecline', code }); // withdraw own offer
    expect(await b.waitFor((m) => m.t === 'rematch', 4000, n)).toMatchObject({ status: 'cancelled' });
    a.send({ t: 'rematch', code });
    await b.waitFor((m) => m.t === 'rematch' && m.status === 'offered', 4000, n + 1);
    n = b.msgs.length;
    a.send({ t: 'leave' });
    expect(await b.waitFor((m) => m.t === 'rematch', 4000, n)).toMatchObject({ status: 'cancelled' });
    expect(s.app.hub.rooms.get(code)!.rematchBy).toBeNull();
    n = b.msgs.length;
    b.send({ t: 'rematch', code });
    expect(await b.waitFor((m) => m.t === 'error', 4000, n)).toMatchObject({ code: 'rematch', message: expect.stringMatching(/left/) });
  });
});
