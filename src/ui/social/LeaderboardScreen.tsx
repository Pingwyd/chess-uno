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

  const Row = ({ u, rank }: { u: PublicUser; rank: number }) => (
    <li className={`lb-row ${u.id === me?.id ? 'me' : ''} ${rank <= 3 ? `top top-${rank}` : ''}`}>
      <span className="lb-rank">{String(rank).padStart(2, '0')}</span>
      <Avatar name={u.name} avatar={u.avatar} size={rank <= 3 ? 40 : 32} />
      <span className="lb-who"><b>{u.name}</b><small>{u.wins}W <i className="w">·</i> {u.losses}L <i>·</i> {u.draws}D</small></span>
      <span className="lb-rating">{u.rating}</span>
    </li>
  );

  return (
    <div className="lobby lb-screen" data-testid="leaderboard-page">
      <header className="page-head">
        <span className="eyebrow">{scope === 'friends' ? 'You and your friends' : 'Global · top 50'}</span>
        <h1 className="page-title">Leaderboard</h1>
        {account && (
          <div className="seg seg-small lb-scope">
            <button className={`seg-btn ${scope === 'all' ? 'on' : ''}`} onClick={() => setScope('all')} data-testid="lb-all">Everyone</button>
            <button className={`seg-btn ${scope === 'friends' ? 'on' : ''}`} onClick={() => setScope('friends')} data-testid="lb-friends">Friends</button>
          </div>
        )}
      </header>

      {!HAS_SERVER ? (
        <section className="cta">
          <div><b>Rankings are coming soon</b><small>Rated play launches with online accounts. Practise on the Learn path and against the bots until then.</small></div>
        </section>
      ) : (
        <>
          {rows === null ? <p className="prof-note lb-loading">Loading…</p> : !rows.length ? (
            <section className="cta"><div><b>{err ? 'Couldn’t load the leaderboard' : 'No rated games yet'}</b><small>{err ? 'Check your connection and try again.' : 'Play a rated quick match to take the top spot.'}</small></div></section>
          ) : (
            <div className="lb-table">
              <div className="lb-cols" aria-hidden="true"><span>Rank</span><span>Player</span><span>Rating</span></div>
              <ol className="lb-podium" data-testid="lb-podium">
                {podium.map((u, i) => <Row key={u.id} u={u} rank={i + 1} />)}
              </ol>
              {!!rest.length && (
                <ol className="lb-list" start={4} data-testid="leaderboard">
                  {rest.map((u, i) => <Row key={u.id} u={u} rank={i + 4} />)}
                </ol>
              )}
            </div>
          )}
          {me && (
            <section className={`ink lb-me ${account ? '' : 'guest'}`} data-testid="lb-me">
              <div className="lb-me-rank"><small>Your rank</small><b>{account && myRank >= 0 ? `#${myRank + 1}` : '—'}</b></div>
              <div className="lb-me-text">
                <b>{me.name}</b>
                <small>{account ? `${me.wins}W ${me.losses}L ${me.draws}D · ${me.ratedGames} rated game${me.ratedGames === 1 ? '' : 's'}` : 'Guests are unrated'}</small>
              </div>
              {account ? <div className="lb-me-rating"><small>Rating</small><b>{me.rating}</b></div>
                : <button className="btn primary small" onClick={onSignUp} data-testid="lb-signup">Sign up</button>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
