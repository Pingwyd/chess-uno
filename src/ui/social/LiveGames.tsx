import { useEffect, useState } from 'react';
import type { LiveGame } from '../../net/protocol';
import { Avatar } from './Avatar';
import { client, useOnline } from './useOnline';

type Filter = 'all' | 'rated' | 'casual' | 'friends';

const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.floor((now - t) / 60_000));
  return m < 1 ? 'just started' : `${m} min`;
};

/** Games in progress, live-updated over the socket. Tap one to spectate (ranked games run one turn behind). */
export function LiveGames({ onWatch }: { onWatch: (code: string) => void }) {
  const view = useOnline();
  const [filter, setFilter] = useState<Filter>('all');
  const [now, setNow] = useState(Date.now());
  useEffect(() => client.watchLive(), []);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const games = view.live;
  const account = !!view.user && !view.user.guest;
  const shown = (games ?? []).filter((g) => filter === 'all' || (filter === 'rated' ? g.rated : filter === 'casual' ? !g.rated : g.friend));
  const filters: Filter[] = account ? ['all', 'rated', 'casual', 'friends'] : ['all', 'rated', 'casual'];
  return (
    <section className="lobby-card live-card" data-testid="live-games">
      <div className="card-head">
        <h2>Live games</h2>
        <span className="live-pill"><i />{games ? games.length : '…'} live</span>
      </div>
      <div className="fchips" role="radiogroup" aria-label="Filter live games">
        {filters.map((f) => (
          <button key={f} role="radio" aria-checked={filter === f} className={`fchip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)} data-testid={`live-filter-${f}`}>
            {f === 'all' ? 'All' : f === 'rated' ? 'Rated' : f === 'casual' ? 'Casual' : '★ Friends'}
          </button>
        ))}
      </div>
      {games === null ? <p>{view.status === 'online' ? 'Loading…' : 'Connecting…'}</p> : !shown.length ? (
        <p className="live-empty">{games.length ? 'No games match this filter.' : 'No games right now — start a Quick Match and you’ll be the first on the board.'}</p>
      ) : (
        <div className="live-list">
          {shown.map((g) => <LiveRow key={g.code} g={g} now={now} onWatch={onWatch} />)}
        </div>
      )}
    </section>
  );
}

function LiveRow({ g, now, onWatch }: { g: LiveGame; now: number; onWatch: (code: string) => void }) {
  const [a, b] = g.players;
  return (
    <button className={`live-row ${g.friend ? 'friend' : ''}`} onClick={() => onWatch(g.code)} data-testid="live-row" data-code={g.code}>
      <span className="lr-avs"><Avatar name={a.name} avatar={a.avatar} size={30} /><Avatar name={b.name} avatar={b.avatar} size={30} className="lr-av2" /></span>
      <span className="lr-main">
        <b><span>{a.name}</span> <small>{a.rating}</small> <em>vs</em> <span>{b.name}</span> <small>{b.rating}</small></b>
        <small>
          {g.rated ? <span className="rated-tag">RATED</span> : <span className="casual-tag">CASUAL</span>}
          {g.friend && <span className="friend-tag">★ FRIEND</span>}
          {' '}Turn {g.turn} · {ago(g.startedAt, now)}{g.rated ? ' · 1-turn delay' : ''}
        </small>
      </span>
      <span className="lr-watch"><span className="lr-eye">👁 {g.spectators}</span><span className="lr-go">Watch ›</span></span>
    </button>
  );
}
