import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getOnlineClient, OnlineTransport, SERVER_URL, type MyOnlineGame, type OnlineView } from '../net/online';
import { outcome, when, type OpenReplay } from './RecentGames';
import { normalizeCode, type PublicUser } from '../net/protocol';
import { GameScreen, type OnlineBinding } from './GameScreen';
import type { PieceSet } from './pieces';
import type { BoardMode } from './BoardView';
import { useProgress } from '../learn/store';
import { OUTLINE_SHAPE as PATH_SHAPE } from '../learn/outline';
import { pathOrder } from '../learn/progress';
import { AuthModal } from './AuthModal';
import { LiveGames } from './social/LiveGames';
import { Avatar, presenceText } from './social/Avatar';
import type { FriendInfo } from '../net/protocol';
import './social/social.css';

export type OnlineIntent = { kind: 'join' | 'watch'; code: string } | null;

interface Props {
  pieceSet: PieceSet;
  boardMode: BoardMode;
  onToggleBoard: () => void;
  onTogglePieces: () => void;
  onHome: () => void;
  intent: OnlineIntent;
  onReplay: OpenReplay;
  /** Open Settings → Friends. */
  onFriends: () => void;
}

const client = getOnlineClient();
const useOnline = (): OnlineView => useSyncExternalStore((f) => client.subscribe(f), () => client.view);

export function OnlineScreen({ pieceSet, boardMode, onToggleBoard, onTogglePieces, onHome, intent, onReplay, onFriends }: Props) {
  const view = useOnline();
  const [bootError, setBootError] = useState<string | null>(null);
  const transport = useMemo(() => new OnlineTransport(client), []);

  useEffect(() => {
    let cancelled = false;
    client.ensureSession()
      .then(() => {
        if (cancelled) return;
        client.connect();
        if (intent?.kind === 'join') client.joinRoom(intent.code);
        if (intent?.kind === 'watch') client.spectate(intent.code);
      })
      .catch((e: Error) => !cancelled && setBootError(e.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh rating/stats whenever a game finishes.
  const finished = view.snap?.result != null;
  useEffect(() => { if (finished) void client.refreshMe(); }, [finished]);

  if (view.snap) {
    const online: OnlineBinding = {
      transport,
      snap: view.snap,
      chat: view.chat,
      error: view.error,
      onChat: (t) => client.sendChat(t),
      onEmote: (e) => client.sendEmote(e),
      onLeave: () => client.leave(),
    };
    return (
      <GameScreen
        setup={{ mode: 'online', botLevel: 'medium', humanColor: 'w' }}
        pieceSet={pieceSet}
        boardMode={boardMode}
        onToggleBoard={onToggleBoard}
        onTogglePieces={onTogglePieces}
        onHome={() => { client.leave(); onHome(); }}
        online={online}
        onReview={(src, tab) => { client.leave(); onReplay(src, tab); }}
      />
    );
  }
  return <Lobby view={view} bootError={bootError} onHome={onHome} onReplay={onReplay} onFriends={onFriends} />;
}

function Lobby({ view, bootError, onHome, onReplay, onFriends }: { view: OnlineView; bootError: string | null; onHome: () => void; onReplay: OpenReplay; onFriends: () => void }) {
  const [auth, setAuth] = useState<'login' | 'signup' | null>(null);
  const [code, setCode] = useState('');
  const user = view.user;
  const statusText = bootError ? 'Server unreachable' : view.status === 'online' ? 'Connected' : view.status === 'connecting' ? 'Connecting…' : view.status === 'offline' ? 'Reconnecting…' : '…';
  const ready = view.status === 'online';

  return (
    <div className="lobby" data-testid="lobby">
      <header className="lobby-bar">
        <button className="icon-btn" onClick={() => { if (view.lobby.kind === 'queued') client.cancelQueue(); if (view.lobby.kind === 'waiting') client.leave(); onHome(); }} aria-label="Home">⌂</button>
        <h1>Online</h1>
        <span className={`conn conn-${bootError ? 'offline' : view.status}`} data-testid="conn-status"><i />{statusText}</span>
      </header>

      {bootError && (
        <div className="lobby-card warn">
          <b>{bootError}</b>
          {import.meta.env.DEV || import.meta.env.VITE_SERVER_URL ? <p>Start the game server with <code>npm run server</code>, or point the client at one with <code>VITE_SERVER_URL</code>. Currently using <code>{SERVER_URL}</code>.</p> : <p>Online play is coming soon. Until then, try Pass &amp; Play, the bots, or the Learn path.</p>}
        </div>
      )}

      <section className="lobby-card account" data-testid="account">
        {user ? (
          <>
            <Avatar name={user.name} avatar={user.avatar} size={48} />
            <div className="account-info">
              <div className="account-name" data-testid="account-name">{user.name}{user.guest && <span className="guest-tag">GUEST</span>}</div>
              <div className="account-sub">
                {user.guest ? 'Playing as a guest — sign up to keep a rating' : <>Rating <b>{user.rating}</b> · {user.wins}W {user.losses}L {user.draws}D</>}
              </div>
            </div>
            <div className="account-actions">
              {user.guest ? (
                <>
                  <button className="btn primary small" onClick={() => setAuth('signup')} data-testid="open-signup">Sign up</button>
                  <button className="btn ghost small" onClick={() => setAuth('login')}>Log in</button>
                </>
              ) : (
                <button className="btn ghost small" onClick={() => void client.logout()}>Log out</button>
              )}
            </div>
          </>
        ) : (
          <div className="account-sub">Getting you a guest name…</div>
        )}
      </section>

      {view.lobby.kind === 'waiting' ? (
        <WaitingRoom code={view.lobby.code} invitee={view.lobby.invitee} since={view.lobby.since} />
      ) : (
        <div className="lobby-grid">
          <section className="lobby-card">
            <h2>Quick Match</h2>
            <p>{user && !user.guest ? 'Rated · paired with a player near your rating' : 'Casual · guests are paired with other guests'}</p>
            <RankedNote />
            {view.lobby.kind === 'queued' ? (
              <QueueStatus since={view.lobby.since} rated={view.lobby.rated} />
            ) : (
              <button className="btn primary wide" disabled={!ready} onClick={() => client.quickMatch()} data-testid="quick-match">Find opponent</button>
            )}
          </section>

          <section className="lobby-card">
            <h2>Play a friend</h2>
            <p>Unrated private room — share a link or a 6-letter code.</p>
            <button className="btn primary wide" disabled={!ready || view.lobby.kind === 'queued'} onClick={() => client.createRoom()} data-testid="create-invite">Create invite link</button>
            <form
              className="code-form"
              onSubmit={(e) => { e.preventDefault(); const c = normalizeCode(code); if (c) client.joinRoom(c); }}
            >
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code or link" aria-label="Invite code" data-testid="join-code" />
              <button className="btn small" type="submit" disabled={!ready || !code.trim()} data-testid="join-btn">Join</button>
              <button className="btn ghost small" type="button" disabled={!ready || !code.trim()} onClick={() => { const c = normalizeCode(code); if (c) client.spectate(c); }} data-testid="watch-btn">Watch</button>
            </form>
          </section>

          {!bootError && <FriendsCard view={view} ready={ready} onFriends={onFriends} />}
          {!bootError && <LiveGames onWatch={(c) => client.spectate(c)} />}
          <Leaderboard me={user} />
          {user && <MyGames me={user} onReplay={onReplay} />}
        </div>
      )}

      {view.error && <div className="toast" role="alert">{view.error}</div>}
      {auth && <AuthModal mode={auth} onMode={setAuth} onClose={() => setAuth(null)} />}
    </div>
  );
}

function QueueStatus({ since, rated }: { since: number; rated: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);
  const s = Math.floor((now - since) / 1000);
  return (
    <div className="queue" data-testid="queued">
      <div className="spinner" />
      <div>
        <b>Searching{rated ? ' (rated)' : ''}…</b>
        <small>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</small>
      </div>
      <button className="btn ghost small" onClick={() => client.cancelQueue()}>Cancel</button>
    </div>
  );
}

function WaitingRoom({ code, invitee, since }: { code: string; invitee?: FriendInfo; since?: number }) {
  const link = `${location.origin}${location.pathname}?join=${code}`;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!invitee) return; const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, [invitee]);
  if (invitee) {
    const left = Math.max(0, 60 - Math.floor((now - (since ?? now)) / 1000));
    return (
      <section className="lobby-card waiting challenge-wait" data-testid="challenge-wait">
        <Avatar name={invitee.name} avatar={invitee.avatar} size={72} />
        <h2>Challenge sent</h2>
        <p>Waiting for <b>{invitee.name}</b> ({invitee.rating}) to accept… The game starts the moment they do.</p>
        <div className="cw-timer">{left}s</div>
        <div className="spinner big" />
        <button className="btn ghost" onClick={() => client.leave()} data-testid="challenge-cancel">Cancel challenge</button>
      </section>
    );
  }
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch { /* clipboard blocked */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <section className="lobby-card waiting" data-testid="waiting-room">
      <h2>Waiting for your friend…</h2>
      <p>Send them this link or code. The game starts as soon as they join.</p>
      <div className="invite-code" data-testid="invite-code">{code}</div>
      <div className="invite-link" data-testid="invite-link">{link}</div>
      <div className="panel-actions">
        <button className="btn primary" onClick={copy}>{copied ? 'Copied!' : 'Copy link'}</button>
        {'share' in navigator && (
          <button className="btn" onClick={() => navigator.share({ title: 'Chess UNO', text: `Play Chess UNO with me — code ${code}`, url: link }).catch(() => {})}>Share</button>
        )}
        <button className="btn ghost" onClick={() => client.leave()}>Cancel</button>
      </div>
      <div className="spinner big" />
    </section>
  );
}

function MyGames({ me, onReplay }: { me: PublicUser; onReplay: OpenReplay }) {
  const [rows, setRows] = useState<MyOnlineGame[] | null>(null);
  useEffect(() => { client.myGames().then(setRows).catch(() => setRows([])); }, [me.id, me.wins, me.losses, me.draws]);
  if (!rows?.length) return null;
  return (
    <section className="lobby-card recent" data-testid="my-online-games">
      <h2>Your recent games</h2>
      {rows.slice(0, 6).map((g) => {
        const o = outcome({ result: { winner: g.winner, reason: g.reason } as never, you: g.seat });
        return (
          <button key={g.gameId} className="recent-item" onClick={() => onReplay({ gameId: g.gameId })}>
            <span className={`ri-res ${o.cls}`}>{o.text}</span>
            <span className="ri-main"><b>vs {g.players[g.seat === 0 ? 1 : 0]}</b><small>{g.rated ? 'Rated' : 'Casual'} · {g.reason} · {g.turns} turn{g.turns === 1 ? '' : 's'} · {when(g.endedAt)}</small></span>
            <span className="ri-go">Review ›</span>
          </button>
        );
      })}
    </section>
  );
}

function Leaderboard({ me }: { me: PublicUser | null }) {
  const [rows, setRows] = useState<PublicUser[] | null>(null);
  const [scope, setScope] = useState<'all' | 'friends'>('all');
  const account = !!me && !me.guest;
  useEffect(() => {
    setRows(null);
    client.leaderboard(scope === 'friends' && account ? 'friends' : 'all').then(setRows).catch(() => setRows([]));
  }, [me?.rating, scope, account]);
  return (
    <section className="lobby-card leaderboard" data-testid="leaderboard">
      <div className="card-head">
        <h2>Leaderboard</h2>
        {account && (
          <div className="fchips">
            <button className={`fchip ${scope === 'all' ? 'on' : ''}`} onClick={() => setScope('all')} data-testid="lb-all">Everyone</button>
            <button className={`fchip ${scope === 'friends' ? 'on' : ''}`} onClick={() => setScope('friends')} data-testid="lb-friends">★ Friends</button>
          </div>
        )}
      </div>
      {rows === null ? <p>Loading…</p> : rows.length === 0 ? <p>No rated games yet. Sign up and play a Quick Match to get on the board.</p> : (
        <ol>
          {rows.slice(0, 10).map((u, i) => (
            <li key={u.id} className={u.id === me?.id ? 'me' : ''}>
              <span className="lb-rank">{i + 1}</span>
              <span className="lb-name"><Avatar name={u.name} avatar={u.avatar} size={22} /> {u.name}</span>
              <span className="lb-rating">{u.rating}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Friends at a glance in the lobby: who's online, challenge or watch them. */
function FriendsCard({ view, ready, onFriends }: { view: OnlineView; ready: boolean; onFriends: () => void }) {
  const user = view.user;
  if (!user) return null;
  if (user.guest) {
    return (
      <section className="lobby-card friends-card">
        <div className="card-head"><h2>Friends</h2></div>
        <p>Sign up to add friends, see when they’re online and challenge them directly.</p>
      </section>
    );
  }
  const list = view.friends?.friends ?? [];
  const live = list.filter((f) => f.presence && f.presence.status !== 'offline');
  const req = view.friends?.incoming.length ?? 0;
  return (
    <section className="lobby-card friends-card" data-testid="lobby-friends">
      <div className="card-head">
        <h2>Friends</h2>
        <button className="link-btn" onClick={onFriends} data-testid="lobby-friends-all">{req ? <span className="count-pill">{req} new</span> : null} All {list.length} ›</button>
      </div>
      {!list.length ? <p>No friends yet — find players by name in Friends.</p> : !live.length ? <p>None of your {list.length} friends are online right now.</p> : live.slice(0, 4).map((f) => (
        <div key={f.id} className="friend-row compact">
          <Avatar name={f.name} avatar={f.avatar} size={34} presence={f.presence} />
          <div className="fr-main"><b>{f.name} <small className="fr-rating">{f.rating}</small></b><small><span className={`ps ps-${f.presence!.status}`}>{presenceText(f.presence)}</span></small></div>
          <div className="fr-actions">
            {f.presence!.status === 'playing' && f.presence!.code
              ? <button className="btn tiny" onClick={() => client.spectate(f.presence!.code!)} data-testid={`lobby-watch-${f.name}`}>👁 Watch</button>
              : <button className="btn tiny primary" disabled={!ready || view.lobby.kind !== 'idle'} onClick={() => client.challenge(f.id)} data-testid={`lobby-challenge-${f.name}`}>⚔ Challenge</button>}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Learning-path ranked flag (client-side for now; not enforced by matchmaking yet). */
function RankedNote() {
  const p = useProgress();
  const order = pathOrder(PATH_SHAPE);
  const done = order.filter((id) => p.lessons[id]).length;
  return (
    <p className={`ranked-note ${p.rankedUnlocked ? 'on' : ''}`} data-testid="ranked-note">
      {p.rankedUnlocked ? '🎓 Ranked unlocked — learning path complete' : `📘 Learning path ${done}/${order.length} — finish it to unlock ranked`}
    </p>
  );
}
