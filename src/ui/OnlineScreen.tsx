import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getOnlineClient, OnlineTransport, SERVER_URL, type MyOnlineGame, type OnlineView } from '../net/online';
import { outcome, when, type OpenReplay } from './RecentGames';
import { CHALLENGE_TTL_MS, normalizeCode, type PublicUser } from '../net/protocol';
import { countdown } from './social/countdown';
import { GameScreen, type OnlineBinding } from './GameScreen';
import type { PieceSet } from './pieces';
import type { BoardMode } from './BoardView';
import { useProgress } from '../learn/store';
import { OUTLINE_SHAPE as PATH_SHAPE } from '../learn/outline';
import { pathOrder } from '../learn/progress';
import { AuthModal } from './AuthModal';
import type { SocialTab } from './social/SocialScreen';
import { Avatar } from './social/Avatar';
import type { FriendInfo } from '../net/protocol';
import './social/social.css';
import { Icon } from './icons';
import { ClockPicker } from './ClockPicker';
import { useSettings } from './settings/store';
import { TC_SHORT, asTimeControl, type TimeControl } from '../rules/timeControl';

export type OnlineIntent = { kind: 'join' | 'watch'; code: string } | null;

interface Props {
  pieceSet: PieceSet;
  boardMode: BoardMode;
  onToggleBoard: () => void;
  onTogglePieces: () => void;
  onHome: () => void;
  intent: OnlineIntent;
  onReplay: OpenReplay;
  /** Open the Social page (friends / live games) or the Leaderboard page. */
  onSocial: (tab: SocialTab) => void;
  onLeaderboard: () => void;
}

const client = getOnlineClient();
const useOnline = (): OnlineView => useSyncExternalStore((f) => client.subscribe(f), () => client.view);

export function OnlineScreen({ pieceSet, boardMode, onToggleBoard, onTogglePieces, onHome, intent, onReplay, onSocial, onLeaderboard }: Props) {
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
      rematch: view.rematch && view.rematch.code === view.snap.code ? view.rematch : null,
      onOfferRematch: () => client.offerRematch(),
      onDeclineRematch: () => client.declineRematch(),
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
  return <Lobby view={view} bootError={bootError} onHome={onHome} onReplay={onReplay} onSocial={onSocial} onLeaderboard={onLeaderboard} />;
}

function Lobby({ view, bootError, onHome, onReplay, onSocial, onLeaderboard }: { view: OnlineView; bootError: string | null; onHome: () => void; onReplay: OpenReplay; onSocial: (t: SocialTab) => void; onLeaderboard: () => void }) {
  const [auth, setAuth] = useState<'login' | 'signup' | null>(null);
  const [code, setCode] = useState('');
  const { timeControl: tc } = useSettings();
  const user = view.user;
  const statusText = bootError ? 'Server unreachable' : view.status === 'online' ? 'Connected' : view.status === 'connecting' ? 'Connecting…' : view.status === 'offline' ? 'Reconnecting…' : '…';
  const ready = view.status === 'online';

  return (
    <div className="lobby" data-testid="lobby">
      <header className="page-head with-back">
        <button className="icon-btn" onClick={() => { if (view.lobby.kind === 'queued') client.cancelQueue(); if (view.lobby.kind === 'waiting') client.leave(); onHome(); }} aria-label="Home"><Icon name="chevron-left" size={20} /></button>
        <h1 className="page-title">{view.lobby.kind === 'queued' ? 'Matchmaking' : 'Online'}</h1>
        <span className={`conn conn-${bootError ? 'offline' : view.status}`} data-testid="conn-status"><i />{statusText}</span>
      </header>

      {bootError && (
        <div className="lobby-card warn">
          <b>{bootError}</b>
          {import.meta.env.DEV || import.meta.env.VITE_SERVER_URL ? <p>Start the game server with <code>npm run server</code>, or point the client at one with <code>VITE_SERVER_URL</code>. Currently using <code>{SERVER_URL}</code>.</p> : <p>Online play is coming soon. Until then, try Pass &amp; Play, the bots, or the Learn path.</p>}
        </div>
      )}

      {view.lobby.kind !== 'queued' && <section className="account" data-testid="account">
        {user ? (
          <>
            <Avatar name={user.name} avatar={user.avatar} size={48} />
            <div className="account-info">
              <div className="account-name" data-testid="account-name">{user.name}{user.guest && <span className="guest-tag">Guest</span>}</div>
              <div className="account-sub">
                {user.guest ? 'Playing as a guest. Sign up to keep a rating.' : <>Rating <b>{user.rating}</b> · {user.wins}W {user.losses}L {user.draws}D</>}
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
      </section>}

      {view.lobby.kind === 'waiting' ? (
        <WaitingRoom code={view.lobby.code} invitee={view.lobby.invitee} since={view.lobby.since} tc={asTimeControl(view.lobby.tc)} />
      ) : view.lobby.kind === 'queued' ? (
        <Matchmaking since={view.lobby.since} rated={view.lobby.rated} user={user} tc={asTimeControl(view.lobby.tc)} />
      ) : (
        <div className="lobby-grid">
          <section className="lobby-clock" data-testid="lobby-clock"><ClockPicker label="Clock for quick match and invites" /></section>
          <section className="lobby-card ink qm-card">
            <span className="eyebrow">{user && !user.guest ? 'Rated' : 'Casual'}</span>
            <h2>Quick match</h2>
            <p>{user && !user.guest ? `Paired with a player near your rating on the same clock. ${TC_SHORT[tc]} each.` : `Guests are paired with other guests. ${TC_SHORT[tc]} each.`}</p>
            <RankedNote />
            <button className="btn primary wide" disabled={!ready} onClick={() => client.quickMatch(tc)} data-testid="quick-match">Find opponent <Icon name="arrow-right" size={18} /></button>
          </section>

          <section className="lobby-card">
            <h2>Play a friend</h2>
            <p>Unrated private room. Share a link or a 6-letter code.</p>
            <button className="btn wide" disabled={!ready} onClick={() => client.createRoom(tc)} data-testid="create-invite">Create invite link</button>
            <form
              className="code-form"
              onSubmit={(e) => { e.preventDefault(); const c = normalizeCode(code); if (c) client.joinRoom(c); }}
            >
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code or link" aria-label="Invite code" data-testid="join-code" />
              <button className="btn small" type="submit" disabled={!ready || !code.trim()} data-testid="join-btn">Join</button>
              <button className="btn ghost small" type="button" disabled={!ready || !code.trim()} onClick={() => { const c = normalizeCode(code); if (c) client.spectate(c); }} data-testid="watch-btn">Watch</button>
            </form>
          </section>

          {!bootError && <LobbyLinks view={view} onSocial={onSocial} onLeaderboard={onLeaderboard} />}
          {user && <MyGames me={user} onReplay={onReplay} />}
        </div>
      )}

      {view.error && <div className="toast" role="alert">{view.error}</div>}
      {auth && <AuthModal mode={auth} onMode={setAuth} onClose={() => setAuth(null)} />}
    </div>
  );
}

/** Mirrors the server's defaults (MATCH_WINDOW 100, widening 25 per second) to show the search range. */
const MATCH_WINDOW = 100;
const MATCH_WIDEN_PER_SEC = 25;

function Matchmaking({ since, rated, user, tc }: { since: number; rated: boolean; user: PublicUser | null; tc: TimeControl }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const w = Math.round(MATCH_WINDOW + MATCH_WIDEN_PER_SEC * s);
  const r = user?.rating ?? 1200;
  return (
    <section className="matchmaking" data-testid="queued">
      <div className="mm-timer num" aria-label="Time searching">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</div>
      <div className="mm-strip">
        <div><span className="eyebrow">Mode</span><b>{rated ? 'Rated' : 'Casual'}</b></div>
        <div><span className="eyebrow">Clock</span><b>{TC_SHORT[tc]}</b></div>
        <div><span className="eyebrow">{rated ? 'Rating range' : 'Pool'}</span><b className="num">{rated ? `${Math.max(0, r - w)}–${r + w}` : 'Guests'}</b></div>
      </div>
      {rated && (
        <div className="mm-range" aria-hidden="true">
          <i style={{ left: `${Math.max(0, 50 - (w / 800) * 50)}%`, right: `${Math.max(0, 50 - (w / 800) * 50)}%` }} />
          <b style={{ left: '50%' }} />
        </div>
      )}
      <p className="mm-note">{rated ? 'The range widens the longer you wait.' : 'Searching for another guest.'} You’ll go straight to the board when someone is found.</p>
      <button className="btn wide" onClick={() => client.cancelQueue()}>Cancel search</button>
    </section>
  );
}

function WaitingRoom({ code, invitee, since, tc }: { code: string; invitee?: FriendInfo; since?: number; tc: TimeControl }) {
  const link = `${location.origin}${location.pathname}?join=${code}`;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!invitee) return; const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, [invitee]);
  if (invitee) {
    return (
      <section className="lobby-card waiting challenge-wait" data-testid="challenge-wait">
        <Avatar name={invitee.name} avatar={invitee.avatar} size={72} />
        <h2>Challenge sent</h2>
        <p>Waiting for <b>{invitee.name}</b> ({invitee.rating}) to accept. {TC_SHORT[tc]} each; the game starts the moment they do.</p>
        <div className="cw-timer" data-testid="challenge-wait-timer">{countdown((since ?? now) + CHALLENGE_TTL_MS - now)}</div>
        <small className="cw-note">The invite expires in {CHALLENGE_TTL_MS / 60_000} minutes.</small>
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
      <span className="eyebrow">Invite code</span>
            <div className="invite-code" data-testid="invite-code">{code}</div>
      <h2>Waiting for your friend</h2>
      <p className="wait-clock"><Icon name="timer" size={15} /> {TC_SHORT[tc]} each</p>
      <div className="invite-link" data-testid="invite-link">{link}</div>
      <div className="panel-actions">
        <button className="btn" onClick={copy}><Icon name={copied ? 'check' : 'link'} size={16} /> {copied ? 'Copied' : 'Copy link'}</button>
        {'share' in navigator && (
          <button className="btn" onClick={() => navigator.share({ title: 'Chess UNO', text: `Play Chess UNO with me — code ${code}`, url: link }).catch(() => {})}>Share</button>
        )}
        <button className="btn ghost" onClick={() => client.leave()}>Cancel</button>
      </div>
    </section>
  );
}

function MyGames({ me, onReplay }: { me: PublicUser; onReplay: OpenReplay }) {
  const [rows, setRows] = useState<MyOnlineGame[] | null>(null);
  useEffect(() => { client.myGames().then(setRows).catch(() => setRows([])); }, [me.id, me.wins, me.losses, me.draws]);
  if (!rows?.length) return null;
  return (
    <section className="recent" data-testid="my-online-games">
      <div className="recent-head"><h3>Your recent games</h3></div>
      {rows.slice(0, 6).map((g) => {
        const o = outcome({ result: { winner: g.winner, reason: g.reason } as never, you: g.seat });
        return (
          <button key={g.gameId} className="recent-item" onClick={() => onReplay({ gameId: g.gameId })}>
            <span className={`ri-res ${o.cls}`}>{o.text}</span>
            <span className="ri-main"><b>vs {g.players[g.seat === 0 ? 1 : 0]}</b><small>{g.rated ? 'Rated' : 'Casual'} · {g.reason} · {g.turns} turn{g.turns === 1 ? '' : 's'} · {when(g.endedAt)}</small></span>
            <span className="ri-go">Review <Icon name="chevron-right" size={15} /></span>
          </button>
        );
      })}
    </section>
  );
}

/** Friends, live games and rankings have their own pages now; the lobby links to them. */
function LobbyLinks({ view, onSocial, onLeaderboard }: { view: OnlineView; onSocial: (t: SocialTab) => void; onLeaderboard: () => void }) {
  const user = view.user;
  const account = !!user && !user.guest;
  const friends = view.friends?.friends ?? [];
  const on = friends.filter((f) => f.presence && f.presence.status !== 'offline').length;
  const req = view.friends?.incoming.length ?? 0;
  return (
    <section className="rows lobby-links" data-testid="lobby-links">
      <button className="row lobby-link" onClick={() => onSocial('friends')} data-testid="lobby-to-friends">
        <span className="row-icon"><Icon name="users" size={22} /></span>
        <span className="row-main"><b>Friends {req > 0 && <span className="row-new">{req} new</span>}</b>
          <small>{!account ? 'Sign up to add friends and challenge them' : friends.length ? `${on} of ${friends.length} online · challenge or watch` : 'Find players by name'}</small></span>
        <Icon name="chevron-right" size={18} className="chev" />
      </button>
      <button className="row lobby-link" onClick={() => onSocial('live')} data-testid="lobby-to-live">
        <span className="row-icon"><Icon name="radio" size={22} /></span>
        <span className="row-main"><b>Live games</b><small>Games in progress, top rated first</small></span>
        <Icon name="chevron-right" size={18} className="chev" />
      </button>
      <button className="row lobby-link" onClick={onLeaderboard} data-testid="lobby-to-leaderboard">
        <span className="row-icon"><Icon name="trophy" size={22} /></span>
        <span className="row-main"><b>Leaderboard</b><small>{account ? `You: ${user!.rating}` : 'Top rated players'}</small></span>
        <Icon name="chevron-right" size={18} className="chev" />
      </button>
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
      <Icon name={p.rankedUnlocked ? 'graduation-cap' : 'book'} size={16} /> {p.rankedUnlocked ? 'Ranked unlocked: learning path complete.' : `Learning path ${done}/${order.length}. Finish it to unlock ranked.`}
    </p>
  );
}
