import { useEffect, useState } from 'react';
import { HAS_SERVER } from '../../net/online';
import type { PublicUser } from '../../net/protocol';
import { Avatar } from './Avatar';
import { client, useOnline } from './useOnline';
import './social.css';

type Scope = 'all' | 'friends';

/** Leaderboard page: top 50 rated players (or you + your friends), podium for the top three. */
export function LeaderboardScreen({ onSignUp }: { onSignUp: () => void }) {
  const view = useOnline();
  const me = view.user;
  const account = !!me && !me.guest;
  const [scope, setScope] = useState<Scope>('all');
  const [rows, setRows] = useState<PublicUser[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!HAS_SERVER) return;
    setRows(null); setErr(false);
    client.leaderboard(scope === 'friends' && account ? 'friends' : 'all').then(setRows).catch(() => { setRows([]); setErr(true); });
  }, [scope, account, me?.rating]);

  const myRank = rows && me ? rows.findIndex((u) => u.id === me.id) : -1;
  const podium = rows?.slice(0, 3) ?? [];
  const rest = rows?.slice(3) ?? [];

  return (
    <div className="lobby lb-screen" data-testid="leaderboard-page">
      <header className="lobby-bar">
        <h1>Leaderboard</h1>
        {account && (
          <div className="fchips">
            <button className={`fchip ${scope === 'all' ? 'on' : ''}`} onClick={() => setScope('all')} data-testid="lb-all">Everyone</button>
            <button className={`fchip ${scope === 'friends' ? 'on' : ''}`} onClick={() => setScope('friends')} data-testid="lb-friends">★ Friends</button>
          </div>
        )}
      </header>

      {!HAS_SERVER ? (
        <section className="set-card cta">
          <span className="cta-icon">🏆</span>
          <div><b>Rankings are coming soon</b><small>Rated play launches with online accounts. Sharpen up on the Learn path and against the bots until then.</small></div>
        </section>
      ) : (
        <>
          {me && (
            <section className={`set-card lb-me ${account ? '' : 'guest'}`} data-testid="lb-me">
              <Avatar name={me.name} avatar={me.avatar} size={44} />
              <div className="lb-me-text">
                <b>{me.name}</b>
                <small>{account ? `${me.wins}W ${me.losses}L ${me.draws}D · ${me.ratedGames} rated game${me.ratedGames === 1 ? '' : 's'}` : 'Guests are unrated'}</small>
              </div>
              {account ? (
                <div className="lb-me-rank"><b>{myRank >= 0 ? `#${myRank + 1}` : '—'}</b><small>{me.rating}</small></div>
              ) : <button className="btn primary small" onClick={onSignUp} data-testid="lb-signup">Sign up</button>}
            </section>
          )}

          {rows === null ? <p className="prof-note lb-loading">Loading…</p> : !rows.length ? (
            <section className="set-card cta"><span className="cta-icon">🏁</span><div><b>{err ? 'Couldn’t load the leaderboard' : 'No rated games yet'}</b><small>{err ? 'Check your connection and try again.' : 'Play a rated Quick Match to claim the top spot.'}</small></div></section>
          ) : (
            <>
              <section className="lb-podium" data-testid="lb-podium">
                {[1, 0, 2].map((i) => podium[i] && (
                  <div key={podium[i].id} className={`pod pod-${i + 1} ${podium[i].id === me?.id ? 'me' : ''}`}>
                    <span className="pod-crown">{i === 0 ? '👑' : i === 1 ? '🥈' : '🥉'}</span>
                    <Avatar name={podium[i].name} avatar={podium[i].avatar} size={i === 0 ? 64 : 52} />
                    <b>{podium[i].name}</b>
                    <small>{podium[i].rating}</small>
                    <div className="pod-step">{i + 1}</div>
                  </div>
                ))}
              </section>
              {!!rest.length && (
                <section className="set-card lb-list" data-testid="leaderboard">
                  <ol start={4}>
                    {rest.map((u, i) => (
                      <li key={u.id} className={u.id === me?.id ? 'me' : ''}>
                        <span className="lb-rank">{i + 4}</span>
                        <Avatar name={u.name} avatar={u.avatar} size={32} />
                        <span className="lb-who"><b>{u.name}</b><small>{u.wins}W {u.losses}L {u.draws}D</small></span>
                        <span className="lb-rating">{u.rating}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
