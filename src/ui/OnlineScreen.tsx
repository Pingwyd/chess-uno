import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getOnlineClient, OnlineTransport, SERVER_URL, type OnlineView } from '../net/online';
import { normalizeCode, type PublicUser } from '../net/protocol';
import { GameScreen, type OnlineBinding } from './GameScreen';
import type { PieceSet } from './pieces';
import type { BoardMode } from './BoardView';
import { useProgress } from '../learn/store';
import { OUTLINE_SHAPE as PATH_SHAPE } from '../learn/outline';
import { pathOrder } from '../learn/progress';

export type OnlineIntent = { kind: 'join' | 'watch'; code: string } | null;

interface Props {
  pieceSet: PieceSet;
  boardMode: BoardMode;
  onToggleBoard: () => void;
  onTogglePieces: () => void;
  onHome: () => void;
  intent: OnlineIntent;
}

const client = getOnlineClient();
const useOnline = (): OnlineView => useSyncExternalStore((f) => client.subscribe(f), () => client.view);

export function OnlineScreen({ pieceSet, boardMode, onToggleBoard, onTogglePieces, onHome, intent }: Props) {
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
      />
    );
  }
  return <Lobby view={view} bootError={bootError} onHome={onHome} />;
}

function Lobby({ view, bootError, onHome }: { view: OnlineView; bootError: string | null; onHome: () => void }) {
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
          <p>Start the game server with <code>npm run server</code>, or point the client at one with <code>VITE_SERVER_URL</code>. Currently using <code>{SERVER_URL}</code>.</p>
        </div>
      )}

      <section className="lobby-card account" data-testid="account">
        {user ? (
          <>
            <div className="avatar">{user.name.slice(0, 1)}</div>
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
        <WaitingRoom code={view.lobby.code} />
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

          <Leaderboard me={user} />
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

function WaitingRoom({ code }: { code: string }) {
  const link = `${location.origin}${location.pathname}?join=${code}`;
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

function Leaderboard({ me }: { me: PublicUser | null }) {
  const [rows, setRows] = useState<PublicUser[] | null>(null);
  useEffect(() => { client.leaderboard().then(setRows).catch(() => setRows([])); }, [me?.rating]);
  return (
    <section className="lobby-card leaderboard">
      <h2>Leaderboard</h2>
      {rows === null ? <p>Loading…</p> : rows.length === 0 ? <p>No rated games yet. Sign up and play a Quick Match to get on the board.</p> : (
        <ol>
          {rows.slice(0, 10).map((u, i) => (
            <li key={u.id} className={u.id === me?.id ? 'me' : ''}>
              <span className="lb-rank">{i + 1}</span>
              <span className="lb-name">{u.name}</span>
              <span className="lb-rating">{u.rating}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function AuthModal({ mode, onMode, onClose }: { mode: 'login' | 'signup'; onMode: (m: 'login' | 'signup') => void; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'signup') await client.signup(email, password, name);
      else await client.login(email, password);
      onClose();
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="overlay" onClick={onClose}>
      <form className="panel auth" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="auth-modal">
        <div className="seg seg-small">
          <button type="button" className={`seg-btn ${mode === 'signup' ? 'on' : ''}`} onClick={() => onMode('signup')}>Sign up</button>
          <button type="button" className={`seg-btn ${mode === 'login' ? 'on' : ''}`} onClick={() => onMode('login')}>Log in</button>
        </div>
        {mode === 'signup' && <p className="auth-note">Your guest stats carry over. Rated Quick Match unlocks with an account.</p>}
        <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label>Password<input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label>
        {mode === 'signup' && (
          <label><span>Display name <small>(optional)</small></span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} pattern="[A-Za-z0-9 _\-]{3,20}" /></label>
        )}
        {err && <div className="auth-error">{err}</div>}
        <div className="panel-actions">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? '…' : mode === 'signup' ? 'Create account' : 'Log in'}</button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
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
