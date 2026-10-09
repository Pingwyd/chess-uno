import { useState } from 'react';
import type { GameSummary } from '../replay/record';
import { deleteGame, useRecentGames } from '../replay/store';
import { Icon } from './icons';

export type OpenReplay = (src: { id: string } | { gameId: string }, tab?: 'replay' | 'review') => void;

const REASON_SHORT: Record<string, string> = {
  checkmate: 'checkmate', timeout: 'time', resign: 'resignation', stalemate: 'stalemate', threefold: 'repetition',
  'fifty-move': '50 moves', insufficient: 'material', agreement: 'agreement', 'timeout-vs-insufficient': 'time vs material',
};

export function when(t: number) {
  const d = Date.now() - t;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} h ago`;
  if (d < 7 * 86_400_000) return `${Math.floor(d / 86_400_000)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function outcome(g: Pick<GameSummary, 'result' | 'you'>): { cls: string; text: string } {
  if (!g.result || g.result.winner === null) return { cls: 'ri-draw', text: '½' };
  if (g.you === null) return { cls: 'ri-draw', text: g.result.winner === 0 ? '1–0' : '0–1' };
  return g.result.winner === g.you ? { cls: 'ri-win', text: 'W' } : { cls: 'ri-loss', text: 'L' };
}

function title(g: GameSummary) {
  if (g.mode === 'bot') return `You vs ${g.players[1]}`;
  if (g.mode === 'pass') return `${g.players[0]} vs ${g.players[1]}`;
  const opp = g.you === null ? null : g.players[g.you === 0 ? 1 : 0];
  return opp ? `Online vs ${opp}` : `${g.players[0]} vs ${g.players[1]}`;
}

function sub(g: GameSummary) {
  const r = g.result;
  const res = !r ? 'unfinished' : r.winner === null ? `draw · ${REASON_SHORT[r.reason]}` : `${g.players[r.winner]} won · ${REASON_SHORT[r.reason]}`;
  const mode = g.mode === 'pass' ? 'Pass & Play' : g.mode === 'online' ? (g.online?.rated ? 'Rated' : 'Online') : g.botLevel ? g.botLevel[0].toUpperCase() + g.botLevel.slice(1) : 'Bot';
  return `${mode} · ${res} · ${g.turns} turn${g.turns === 1 ? '' : 's'} · ${when(g.endedAt)}`;
}

function Item({ g, onOpen }: { g: GameSummary; onOpen: OpenReplay }) {
  const o = outcome(g);
  return (
    <button className="recent-item" onClick={() => onOpen({ id: g.id })} data-testid="recent-item">
      <span className={`ri-res ${o.cls}`}>{o.text}</span>
      <span className="ri-main"><b>{title(g)}</b><small>{sub(g)}</small></span>
      <span className="ri-go">Review <Icon name="chevron-right" size={15} /></span>
    </button>
  );
}

/** Recent games saved on this device (home screen). */
export function RecentGames({ onOpen }: { onOpen: OpenReplay }) {
  const games = useRecentGames();
  const [all, setAll] = useState(false);
  if (!games.length) return null;
  return (
    <section className="recent-card recent" data-testid="recent-games">
      <div className="recent-head">
        <h3>Recent games</h3>
        {games.length > 3 && <button className="btn ghost tiny" onClick={() => setAll(true)} data-testid="recent-all">All {games.length} <Icon name="chevron-right" size={15} /></button>}
      </div>
      {games.slice(0, 3).map((g) => <Item key={g.id} g={g} onOpen={onOpen} />)}
      {all && (
        <div className="overlay" onClick={() => setAll(false)}>
          <div className="panel recent-panel" onClick={(e) => e.stopPropagation()} data-testid="recent-panel">
            <h2>Your games</h2>
            <p className="recent-empty">Saved on this device · replays and reviews work offline.</p>
            <div className="recent-all">
              {games.map((g) => (
                <div className="recent-row" key={g.id}>
                  <Item g={g} onOpen={onOpen} />
                  <button className="recent-del" aria-label="Delete game" title="Delete" onClick={() => void deleteGame(g.id)}><Icon name="x" size={16} /></button>
                </div>
              ))}
            </div>
            <button className="btn primary wide" onClick={() => setAll(false)}>Close</button>
          </div>
        </div>
      )}
    </section>
  );
}
