/**
 * Deterministic saved games for scripts/review-shots.mjs: bot-vs-bot games played through the
 * real LocalTransport (fake clock), relabelled as a vs-bot game, an online game and Pass & Play.
 *   npx tsx scripts/review-fixtures.ts > fixtures.json
 */
import { LocalTransport } from '../src/net/transport';
import { botStep, type BotLevel } from '../src/engine/bot';
import { summarize, type GameRecord } from '../src/replay/record';

function playBotGame(seed: number, levels: [BotLevel, BotLevel], maxActions = 600): GameRecord {
  let t = 1_700_000_000_000;
  let r = seed;
  const rand = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
  const tr = new LocalTransport({ seed, players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }] }, () => t);
  for (let i = 0; i < maxActions && tr.getState().phase !== 'over'; i++) {
    const s = tr.getState();
    t += 700 + Math.floor(rand() * 2500);
    const res = botStep(s, levels[s.current], rand);
    if (Array.isArray(res)) {
      const m = res[0];
      if (!m) break;
      tr.send({ type: 'move', player: s.current, from: m.from, to: m.to, promotion: m.promotion });
    } else if (res) tr.send(res);
  }
  if (tr.getState().phase !== 'over') { t += 1000; tr.send({ type: 'resign', player: tr.getState().current }); }
  return { v: 1, id: `seed-${seed}`, mode: 'bot', config: tr.config, startedAt: tr.startedAt, endedAt: t, actions: tr.log, result: tr.getState().result };
}

const DAY = 86_400_000;
const now = Date.now();
const shape = (rec: GameRecord, id: string, mode: GameRecord['mode'], names: [string, string], kinds: ['human' | 'bot', 'human' | 'bot'], ago: number, extra: Partial<GameRecord> = {}): GameRecord => {
  const shift = now - ago - rec.endedAt;
  return {
    ...rec, id, mode,
    config: { ...rec.config, players: [{ name: names[0], kind: kinds[0] }, { name: names[1], kind: kinds[1] }] },
    startedAt: rec.startedAt + shift, endedAt: rec.endedAt + shift,
    actions: rec.actions.map((a) => ({ ...a, at: a.at + shift })),
    ...extra,
  };
};
const ONLINE_ID = '0b5e6a52-1f7c-4c1e-9a7e-3d2f1c0b9a88';
const records = [
  shape(playBotGame(21, ['medium', 'hard']), 'shot-main', 'bot', ['You', 'Rook Bot'], ['human', 'bot'], 4 * 60_000, { botLevel: 'hard' }),
  shape(playBotGame(30, ['medium', 'hard']), `online-${ONLINE_ID}`, 'online', ['Prosper', 'Kemi'], ['human', 'human'], 3 * 3_600_000,
    { online: { gameId: ONLINE_ID, code: 'QX7KPM', rated: true, you: 0 } }),
  shape(playBotGame(35, ['medium', 'hard']), 'shot-pass', 'pass', ['Tolu', 'Ada'], ['human', 'human'], DAY + 3_600_000),
  shape(playBotGame(25, ['medium', 'hard']), 'shot-win', 'bot', ['You', 'Knight Bot'], ['human', 'bot'], 2 * DAY, { botLevel: 'medium' }),
  shape(playBotGame(26, ['medium', 'hard']), 'shot-short', 'bot', ['You', 'Rook Bot'], ['human', 'bot'], 4 * DAY, { botLevel: 'hard' }),
];
process.stdout.write(JSON.stringify({ records, index: records.map((r) => summarize(r)) }));
