import { afterEach, describe, expect, it } from 'vitest';
import { api, startApp, TestClient, type App } from './helpers';
import { CHALLENGE_TTL_MS, type ChallengeInfo, type LiveGame, type ServerMsg } from '../../src/net/protocol';

let app: App | null = null;
afterEach(async () => { await app?.close(); app = null; });

async function account(base: string, name: string) {
  const r = await api(base, '/api/signup', { email: `${name.toLowerCase()}@x.io`, password: 'password123', name });
  expect(r.status).toBe(200);
  return { token: r.json.token as string, id: r.json.user.id as string, name };
}
async function online(port: number, token: string) {
  const c = new TestClient(port, token);
  await c.connect();
  return c;
}
async function befriend(base: string, a: { token: string }, b: { id: string; token: string }, aId: string) {
  expect((await api(base, '/api/friends/request', { userId: b.id }, a.token)).json.relation).toBe('outgoing');
  expect((await api(base, '/api/friends/accept', { userId: aId }, b.token)).json.relation).toBe('friends');
}
const is = <T extends ServerMsg['t']>(t: T) => (m: ServerMsg): m is Extract<ServerMsg, { t: T }> => m.t === t;

describe('friends', () => {
  it('search, request, accept, decline, cancel, remove — accounts only', async () => {
    const s = await startApp(); app = s.app;
    const ada = await account(s.base, 'Ada');
    const bob = await account(s.base, 'Bobby');
    const cy = await account(s.base, 'Cyrus');
    const guest = (await api(s.base, '/api/guest', {})).json.token;

    // Guests are asked to sign up.
    expect((await api(s.base, '/api/friends', undefined, guest)).status).toBe(403);
    expect((await api(s.base, '/api/users/search?q=bo', undefined, guest)).json.error).toMatch(/account/);
    // Search is case-insensitive, excludes yourself and guests, and reports the relation.
    const hits = (await api(s.base, '/api/users/search?q=BOB', undefined, ada.token)).json.users;
    expect(hits.map((u: { name: string }) => u.name)).toEqual(['Bobby']);
    expect(hits[0].relation).toBe('none');
    expect((await api(s.base, '/api/users/search?q=%25', undefined, ada.token)).json.users).toEqual([]);
    expect((await api(s.base, '/api/users/search?q=a', undefined, ada.token)).json.users).toEqual([]);

    // Ada → Bobby, Bobby sees it as incoming and accepts.
    expect((await api(s.base, '/api/friends/request', { userId: bob.id }, ada.token)).json.relation).toBe('outgoing');
    expect((await api(s.base, '/api/friends', undefined, bob.token)).json.incoming.map((f: { name: string }) => f.name)).toEqual(['Ada']);
    expect((await api(s.base, '/api/friends', undefined, ada.token)).json.outgoing.map((f: { name: string }) => f.name)).toEqual(['Bobby']);
    expect((await api(s.base, '/api/friends/accept', { userId: ada.id }, bob.token)).json.relation).toBe('friends');
    const list = (await api(s.base, '/api/friends', undefined, ada.token)).json;
    expect(list.friends).toMatchObject([{ name: 'Bobby', presence: { status: 'offline' } }]);
    expect(list.incoming).toEqual([]);

    // Cyrus → Ada: Ada declines. Cyrus → Ada again: Cyrus cancels. Cyrus → Ada, then Ada → Cyrus = auto-accept.
    await api(s.base, '/api/friends/request', { userId: ada.id }, cy.token);
    expect((await api(s.base, '/api/friends/decline', { userId: cy.id }, ada.token)).json.relation).toBe('none');
    await api(s.base, '/api/friends/request', { userId: ada.id }, cy.token);
    expect((await api(s.base, '/api/friends/cancel', { userId: ada.id }, cy.token)).json.relation).toBe('none');
    expect((await api(s.base, '/api/friends/decline', { userId: cy.id }, ada.token)).status).toBe(404);
    await api(s.base, '/api/friends/request', { userId: ada.id }, cy.token);
    expect((await api(s.base, '/api/friends/request', { userId: cy.id }, ada.token)).json.relation).toBe('friends');
    expect((await api(s.base, '/api/friends', undefined, ada.token)).json.friends.map((f: { name: string }) => f.name)).toEqual(['Bobby', 'Cyrus']);

    // Remove, and bad targets.
    expect((await api(s.base, '/api/friends/remove', { userId: cy.id }, ada.token)).json.relation).toBe('none');
    expect((await api(s.base, '/api/friends/remove', { userId: cy.id }, ada.token)).status).toBe(404);
    expect((await api(s.base, '/api/friends/request', { userId: ada.id }, ada.token)).status).toBe(400);
    expect((await api(s.base, '/api/friends/request', { userId: '00000000-0000-0000-0000-000000000000' }, ada.token)).status).toBe(404);

    // Leaderboard friend filter: you + friends.
    const lb = (await api(s.base, '/api/leaderboard?scope=friends', undefined, ada.token)).json.players;
    expect(lb.map((u: { name: string }) => u.name).sort()).toEqual(['Ada', 'Bobby']);
    expect((await api(s.base, '/api/leaderboard?scope=friends', undefined, guest)).status).toBe(403);
  });

  it('live presence and friend events over the socket', async () => {
    const s = await startApp(); app = s.app;
    const ada = await account(s.base, 'Ada');
    const bob = await account(s.base, 'Bobby');
    const a = await online(s.port, ada.token);
    // A request reaches Ada live.
    await api(s.base, '/api/friends/request', { userId: ada.id }, bob.token);
    expect(await a.waitFor(is('social'), 8000, 0)).toMatchObject({ event: 'request', user: { name: 'Bobby' } });
    const b = await online(s.port, bob.token);
    await api(s.base, '/api/friends/accept', { userId: bob.id }, ada.token);
    expect(await b.waitFor(is('social'), 8000, 0)).toMatchObject({ event: 'accepted', user: { name: 'Ada' } });
    expect(await b.waitFor((m) => m.t === 'presence' && m.userId === ada.id, 8000, 0)).toMatchObject({ presence: { status: 'online' } });
    // Bobby goes offline → Ada hears it.
    const from = a.msgs.length;
    await b.close();
    expect(await a.waitFor((m) => m.t === 'presence' && m.userId === bob.id && m.presence.status === 'offline', 4000, from)).toBeTruthy();
    // And online again.
    const b2 = await online(s.port, bob.token);
    expect(await a.waitFor((m) => m.t === 'presence' && m.userId === bob.id && m.presence.status === 'online', 4000, from)).toBeTruthy();
    void b2;
  });
});

describe('challenges', () => {
  it('challenge → accept starts an unrated private game; presence shows playing with a code to watch', async () => {
    const s = await startApp(); app = s.app;
    const ada = await account(s.base, 'Ada');
    const bob = await account(s.base, 'Bobby');
    const cy = await account(s.base, 'Cyrus');
    await befriend(s.base, ada, bob, ada.id);
    await befriend(s.base, cy, bob, cy.id);
    const a = await online(s.port, ada.token);
    const b = await online(s.port, bob.token);
    const c = await online(s.port, cy.token);

    // Not friends → refused.
    c.send({ t: 'challenge', userId: ada.id });
    expect(await c.waitFor(is('error'), 8000, 0)).toMatchObject({ code: 'challenge', message: /only challenge friends/ });

    a.send({ t: 'challenge', userId: bob.id });
    expect(await a.waitFor(is('roomCreated'), 8000, 0)).toMatchObject({ invitee: { name: 'Bobby' } });
    const ch = ((await b.waitFor(is('challenge'), 8000, 0)) as Extract<ServerMsg, { t: 'challenge' }>).challenge;
    expect(ch.from.name).toBe('Ada');
    b.send({ t: 'challengeReply', id: ch.id, accept: true });
    const snap = await a.waitSnap(() => true);
    expect(snap.rated).toBe(false);
    expect(snap.seats.map((x) => x.name).sort()).toEqual(['Ada', 'Bobby']);
    expect(await a.waitFor(is('challengeUpdate'), 8000, 0)).toMatchObject({ status: 'accepted', by: 'Bobby' });

    // Cyrus (Bobby's friend) sees Bobby playing, with a code to spectate.
    const p = await c.waitFor((m) => m.t === 'presence' && m.userId === bob.id && m.presence.status === 'playing', 8000, 0);
    expect(p).toMatchObject({ presence: { status: 'playing', code: snap.code, rated: false } });
    const friends = (await api(s.base, '/api/friends', undefined, cy.token)).json.friends;
    expect(friends[0].presence).toMatchObject({ status: 'playing', code: snap.code });
    c.send({ t: 'spectate', code: snap.code });
    expect((await c.waitSnap((x) => x.code === snap.code)).you).toBeNull();

    // Busy players can't be challenged.
    c.send({ t: 'leave' });
    c.send({ t: 'challenge', userId: bob.id });
    expect(await c.waitFor((m) => m.t === 'error' && m.code === 'challenge', 4000, c.msgs.length)).toMatchObject({ message: /in a game/ });
  });

  it('decline closes the waiting room; leaving cancels; offline friends cannot be challenged', async () => {
    const s = await startApp(); app = s.app;
    const ada = await account(s.base, 'Ada');
    const bob = await account(s.base, 'Bobby');
    await befriend(s.base, ada, bob, ada.id);
    const a = await online(s.port, ada.token);
    a.send({ t: 'challenge', userId: bob.id });
    expect(await a.waitFor(is('error'), 8000, 0)).toMatchObject({ message: /offline/ });

    const b = await online(s.port, bob.token);
    a.send({ t: 'challenge', userId: bob.id });
    const ch = ((await b.waitFor(is('challenge'), 8000, 0)) as Extract<ServerMsg, { t: 'challenge' }>).challenge;
    b.send({ t: 'challengeReply', id: ch.id, accept: false });
    expect(await a.waitFor(is('challengeUpdate'), 8000, 0)).toMatchObject({ status: 'declined', by: 'Bobby' });
    await a.waitFor(is('left'), 8000, 0);
    expect(s.app.hub.rooms.size).toBe(0);

    // Challenger cancels by leaving the waiting room → Bobby's prompt is withdrawn.
    const fromB = b.msgs.length;
    a.send({ t: 'challenge', userId: bob.id });
    const ch2 = (await b.waitFor((m) => m.t === 'challenge', 4000, fromB) as { challenge: ChallengeInfo }).challenge;
    a.send({ t: 'leave' });
    expect(await b.waitFor((m) => m.t === 'challengeUpdate' && m.id === ch2.id, 8000, 0)).toMatchObject({ status: 'cancelled', by: 'Ada' });
    b.send({ t: 'challengeReply', id: ch2.id, accept: true });
    expect(await b.waitFor((m) => m.t === 'error' && m.code === 'challenge', 8000, 0)).toMatchObject({ message: /no longer open/ });
  });
});

describe('challenge expiry', () => {
  it('challenges stay open for 5 minutes by default and expire (closing the room) when the TTL lapses', async () => {
    let s = await startApp(); app = s.app;
    let ada = await account(s.base, 'Ada');
    let bob = await account(s.base, 'Bobby');
    await befriend(s.base, ada, bob, ada.id);
    let a = await online(s.port, ada.token);
    let b = await online(s.port, bob.token);
    const t0 = Date.now();
    a.send({ t: 'challenge', userId: bob.id });
    const ch = ((await b.waitFor(is('challenge'), 8000, 0)) as Extract<ServerMsg, { t: 'challenge' }>).challenge;
    expect(CHALLENGE_TTL_MS).toBe(5 * 60_000);
    expect(ch.expiresAt - t0).toBeGreaterThan(CHALLENGE_TTL_MS - 5000);
    expect(ch.expiresAt - t0).toBeLessThanOrEqual(CHALLENGE_TTL_MS + 1000);
    await a.close(); await b.close();
    await app.close();

    // Short TTL to watch it lapse: both sides are told, the waiting room closes.
    s = await startApp({ challengeTtlMs: 300 }); app = s.app;
    ada = await account(s.base, 'Ada');
    bob = await account(s.base, 'Bobby');
    await befriend(s.base, ada, bob, ada.id);
    a = await online(s.port, ada.token);
    b = await online(s.port, bob.token);
    a.send({ t: 'challenge', userId: bob.id });
    const ch2 = ((await b.waitFor(is('challenge'), 8000, 0)) as Extract<ServerMsg, { t: 'challenge' }>).challenge;
    expect(await a.waitFor(is('challengeUpdate'), 8000, 0)).toMatchObject({ id: ch2.id, status: 'expired' });
    expect(await b.waitFor(is('challengeUpdate'), 8000, 0)).toMatchObject({ id: ch2.id, status: 'expired' });
    await a.waitFor(is('left'), 8000, 0);
    expect(s.app.hub.rooms.size).toBe(0);
  });
});

describe('live games', () => {
  it('lists games in progress (top-rated first), hides private rooms from strangers, flags friends, and pushes updates', async () => {
    const s = await startApp(); app = s.app;
    const [p1, p2, p3, p4, fan] = await Promise.all(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((n) => account(s.base, n)));
    await s.app.db.updateTable('users').set({ rating: 1500 }).where('id', 'in', [p3.id, p4.id]).execute();
    await befriend(s.base, fan, p1, fan.id);
    const fanWs = await online(s.port, fan.token);
    fanWs.send({ t: 'live', on: true });
    expect(await fanWs.waitFor(is('liveGames'), 8000, 0)).toMatchObject({ games: [] });

    // Rated quick match between the 1500s, and a private room between Alpha and Bravo.
    const [c1, c2, c3, c4] = await Promise.all([p1, p2, p3, p4].map((p) => online(s.port, p.token)));
    c3.send({ t: 'queue' });
    c4.send({ t: 'queue' });
    await c3.waitSnap(() => true);
    c1.send({ t: 'createRoom' });
    const { code } = (await c1.waitFor(is('roomCreated'), 8000, 0)) as Extract<ServerMsg, { t: 'roomCreated' }>;
    c2.send({ t: 'joinRoom', code });
    await c2.waitSnap(() => true);

    const fanView = (await fanWs.waitFor((m) => m.t === 'liveGames' && m.games.length === 2, 8000, 0)) as { games: LiveGame[] };
    expect(fanView.games.map((g) => [g.rated, g.private, g.friend])).toEqual([[true, false, false], [false, true, true]]);
    expect(fanView.games[0].players.map((p) => p.rating)).toEqual([1500, 1500]);

    // Anonymous/stranger view: only the public quick match.
    const anon = (await api(s.base, '/api/live')).json.games as LiveGame[];
    expect(anon).toHaveLength(1);
    expect(anon[0].rated).toBe(true);

    // Spectating from the list bumps the spectator count (pushed), and ranked stays one turn behind.
    const watcher = await TestClient.guest(s.base, s.port);
    watcher.send({ t: 'spectate', code: anon[0].code });
    expect((await watcher.waitSnap(() => true)).delayed).toBe(true);
    expect(await fanWs.waitFor((m) => m.t === 'liveGames' && m.games.some((g) => g.spectators === 1), 8000, 0)).toBeTruthy();

    // Game over → it drops off the list.
    const snap3 = c3.snap!;
    const mark = fanWs.msgs.length;
    c3.send({ t: 'action', action: { type: 'resign', player: snap3.you! } });
    expect(await fanWs.waitFor((m) => m.t === 'liveGames' && m.games.length === 1, 8000, mark)).toBeTruthy();
  });
});

describe('profiles and account', () => {
  it('profile edit, rating history + streak, password change, account deletion', async () => {
    const s = await startApp(); app = s.app;
    const ada = await account(s.base, 'Ada');
    const bob = await account(s.base, 'Bobby');
    const guest = (await api(s.base, '/api/guest', {})).json.token;

    expect((await api(s.base, '/api/profile', { name: 'Ada Lovelace', avatar: '🦉' }, ada.token)).json.user).toMatchObject({ name: 'Ada Lovelace', avatar: '🦉' });
    expect((await api(s.base, '/api/profile', { avatar: 'nope' }, ada.token)).status).toBe(400);
    expect((await api(s.base, '/api/profile', { name: '<script>' }, ada.token)).status).toBe(400);
    expect((await api(s.base, '/api/profile', { name: 'Guesty' }, guest)).status).toBe(403);
    expect((await api(s.base, '/api/profile', { avatar: '♞' }, guest)).json.user.avatar).toBe('♞');

    // Two rated games: Ada wins both (Bobby resigns).
    const a = await online(s.port, ada.token);
    const b = await online(s.port, bob.token);
    for (let i = 0; i < 2; i++) {
      a.send({ t: 'queue' });
      b.send({ t: 'queue' });
      const snap = await b.waitSnap((x) => !x.result && x.state.phase !== 'over');
      b.send({ t: 'action', action: { type: 'resign', player: snap.you! } });
      await a.waitSnap((x) => !!x.result && x.code === snap.code);
      a.send({ t: 'leave' });
      b.send({ t: 'leave' });
      await new Promise((r) => setTimeout(r, 50));
    }
    const prof = (await api(s.base, '/api/my/profile', undefined, ada.token)).json.profile;
    expect(prof.ratingHistory.map((p: { r: number }) => p.r)).toEqual([1200, 1216, 1231]);
    expect(prof.streak).toEqual({ current: 2, best: 2 });
    expect(prof.games).toBe(2);
    expect(prof.user.email).toBe('ada@x.io');
    const pub = (await api(s.base, `/api/users/${ada.id}/profile`, undefined, bob.token)).json.profile;
    expect(pub.user.email).toBeUndefined();
    expect(pub.relation).toBe('none');
    expect((await api(s.base, `/api/users/${bob.id}/profile`)).json.profile.streak).toEqual({ current: 0, best: 0 });

    // Password change.
    expect((await api(s.base, '/api/account/password', { current: 'wrong', next: 'newpassword1' }, ada.token)).status).toBe(401);
    expect((await api(s.base, '/api/account/password', { current: 'password123', next: 'short' }, ada.token)).status).toBe(400);
    expect((await api(s.base, '/api/account/password', { current: 'password123', next: 'newpassword1' }, ada.token)).status).toBe(200);
    expect((await api(s.base, '/api/login', { email: 'ada@x.io', password: 'newpassword1' })).status).toBe(200);

    // Delete: wrong password refused; then anonymised, token dead, login fails, games kept.
    await befriend(s.base, ada, bob, ada.id);
    expect((await api(s.base, '/api/account/delete', { password: 'nope' }, ada.token)).status).toBe(401);
    expect((await api(s.base, '/api/account/delete', { password: 'newpassword1' }, ada.token)).status).toBe(200);
    expect(await a.waitFor((m) => m.t === 'error' && m.code === 'auth', 8000, 0)).toBeTruthy();
    expect((await api(s.base, '/api/me', undefined, ada.token)).status).toBe(401);
    expect((await api(s.base, '/api/login', { email: 'ada@x.io', password: 'newpassword1' })).status).toBe(401);
    expect((await api(s.base, '/api/friends', undefined, bob.token)).json.friends).toEqual([]);
    expect((await api(s.base, '/api/users/search?q=ada', undefined, bob.token)).json.users).toEqual([]);
    const row = await s.app.db.selectFrom('users').selectAll().where('id', '=', ada.id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ deleted: 1, email: null, password_hash: null, name: 'Deleted player' });
    expect((await s.app.db.selectFrom('games').selectAll().execute()).length).toBe(2);
    // The email can be registered again.
    expect((await api(s.base, '/api/signup', { email: 'ada@x.io', password: 'password123', name: 'Ada' })).status).toBe(200);
  });
});
