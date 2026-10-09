import { useEffect, useMemo, useState } from 'react';
import { AVATARS, type ProfileInfo, type PublicUser } from '../../net/protocol';
import { HAS_SERVER, storedToken, type MyOnlineGame } from '../../net/online';
import { useRecentGames } from '../../replay/store';
import { useProgress } from '../../learn/store';
import { BADGES, SKIN_NAMES } from '../../learn/progress';
import { Avatar } from '../social/Avatar';
import { RatingChart } from '../social/RatingChart';
import { client, useOnline } from '../social/useOnline';
import { outcome, when, type OpenReplay } from '../RecentGames';
import { setSettings, useSettings } from './store';
import { localStats, type Stats } from './stats';
import type { GameSummary } from '../../replay/record';
import { Icon, asIcon } from '../icons';


const pct = (s: Pick<Stats, 'w' | 'l' | 'd'>) => {
  const n = s.w + s.l + s.d;
  return n ? `${Math.round(((s.w + s.d / 2) / n) * 100)}%` : '—';
};

export function ProfileTab({ onSignUp, onReplay, onCollection }: {
  onSignUp: () => void; onReplay: OpenReplay; onCollection: () => void;
}) {
  const progress = useProgress();
  const earned = BADGES.filter((b) => progress.badges[b.id]);
  const view = useOnline();
  const settings = useSettings();
  const user = view.user;
  const account = !!user && !user.guest;
  const games = useRecentGames();
  const local = useMemo(() => localStats(games), [games]);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [online, setOnline] = useState<MyOnlineGame[] | null>(null);
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (!account) { setProfile(null); setOnline(null); return; }
    client.profile().then(setProfile).catch(() => setProfile(null));
    client.myGames().then(setOnline).catch(() => setOnline([]));
  }, [account, user?.id, user?.rating, user?.wins, user?.losses, user?.draws]);

  const avatar = user?.avatar ?? settings.avatar;
  const name = user?.name ?? 'You';
  const chooseAvatar = (a: string | null) => {
    setSettings({ avatar: a });
    setPicker(false);
    if (user && storedToken()) void client.updateProfile({ avatar: a }).catch((e: Error) => client.flashError(e.message));
  };

  const stats: Stats = account && user
    ? { w: user.wins, l: user.losses, d: user.draws, streak: profile?.streak.current ?? 0, best: profile?.streak.best ?? 0 }
    : local;

  return (
    <div className="prof" data-testid="profile">
      <section className="set-card prof-head">
        <button className="prof-avatar" onClick={() => setPicker((v) => !v)} aria-label="Change avatar" data-testid="avatar-btn">
          <Avatar name={name} avatar={avatar} size={76} />
          <span className="prof-avatar-edit"><Icon name="pencil" size={13} /></span>
        </button>
        <div className="prof-id">
          <NameRow user={user} account={account} />
          <div className="prof-sub">
            {account ? <>Member since {new Date(profile?.memberSince ?? Date.now()).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</>
              : user ? 'Guest · stats on this device' : 'Playing offline · stats on this device'}
          </div>
        </div>
        <div className={`prof-rating ${account ? '' : 'muted'}`} data-testid="profile-rating">
          <b>{account ? user!.rating : '—'}</b>
          <small>{account ? (user!.ratedGames ? `${user!.ratedGames} rated` : 'provisional') : 'no rating'}</small>
        </div>
      </section>

      {picker && (
        <section className="set-card avatar-picker" data-testid="avatar-picker">
          <button className={`av-opt ${!avatar ? 'on' : ''}`} onClick={() => chooseAvatar(null)} title="Initial"><Avatar name={name} size={44} /></button>
          {AVATARS.map((a) => (
            <button key={a} className={`av-opt ${avatar === a ? 'on' : ''}`} onClick={() => chooseAvatar(a)} data-testid={`avatar-${a}`}><Avatar name={name} avatar={a} size={44} /></button>
          ))}
        </section>
      )}

      {!account && (
        <section className="set-card cta" data-testid="guest-cta">
          <span className="cta-icon"><Icon name="sparkles" size={26} /></span>
          <div>
            <b>{HAS_SERVER ? 'Create a free account' : 'Accounts are coming soon'}</b>
            <small>{HAS_SERVER ? 'Get a rating and chart, add friends, challenge them and sync your learning path. Your guest games carry over.' : 'Ratings, friends and live games arrive with online play. Your stats below are saved on this device.'}</small>
          </div>
          {HAS_SERVER && <button className="btn primary small" onClick={onSignUp} data-testid="profile-signup">Sign up</button>}
        </section>
      )}

      <section className="stat-grid" data-testid="profile-stats">
        <Stat label="Wins" value={stats.w} tone="win" />
        <Stat label="Losses" value={stats.l} tone="loss" />
        <Stat label="Draws" value={stats.d} />
        <Stat label="Win rate" value={pct(stats)} />
        <Stat label="Streak" value={stats.streak ? <><Icon name="flame" size={18} /> {stats.streak}</> : '0'} sub={`best ${stats.best}`} />
      </section>
      {account && (local.w + local.l + local.d > 0) && <p className="prof-note">Online games above · vs bots on this device: {local.w}W {local.l}L {local.d}D</p>}

      {account && (
        <section className="set-card">
          <h3>Rating</h3>
          <RatingChart points={profile?.ratingHistory ?? []} />
        </section>
      )}

      <button className="set-card coll-teaser" onClick={onCollection} data-testid="open-collection">
        <span className="coll-teaser-icons">{earned.slice(0, 4).map((b) => <i key={b.id}><Icon name={asIcon(b.icon)} size={16} /></i>)}{!earned.length && <i><Icon name="award" size={16} /></i>}</span>
        <span className="coll-teaser-text"><b>Badges &amp; skins</b><small>{earned.length}/{BADGES.length} badges · {SKIN_NAMES[progress.skins.w]} vs {SKIN_NAMES[progress.skins.b]}</small></span>
        <span className="chev"><Icon name="chevron-right" size={20} /></span>
      </button>
      <Recent games={games} online={online} onReplay={onReplay} />
    </div>
  );
}

function NameRow({ user, account }: { user: PublicUser | null; account: boolean }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(user?.name ?? '');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setVal(user?.name ?? ''), [user?.name]);
  if (!edit) {
    return (
      <div className="prof-name" data-testid="profile-name">
        {user?.name ?? 'You'}
        {user?.guest && <span className="guest-tag">GUEST</span>}
        {account && <button className="link-btn" onClick={() => setEdit(true)} data-testid="edit-name">Edit</button>}
      </div>
    );
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await client.updateProfile({ name: val }); setEdit(false); setErr(null); } catch (x) { setErr(x instanceof Error ? x.message : 'Could not save'); }
  };
  return (
    <form className="name-form" onSubmit={save}>
      <input value={val} onChange={(e) => setVal(e.target.value)} maxLength={20} autoFocus aria-label="Display name" data-testid="name-input" />
      <button className="btn tiny primary" type="submit" data-testid="save-name">Save</button>
      <button className="btn tiny ghost" type="button" onClick={() => { setEdit(false); setErr(null); }} aria-label="Cancel"><Icon name="x" size={14} /></button>
      {err && <small className="field-error">{err}</small>}
    </form>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: 'win' | 'loss' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <b>{value}</b>
      <small>{label}</small>
      {sub && <em>{sub}</em>}
    </div>
  );
}

function Recent({ games, online, onReplay }: { games: GameSummary[]; online: MyOnlineGame[] | null; onReplay: OpenReplay }) {
  const [all, setAll] = useState(false);
  // Online games from the server (all devices) plus bot / pass & play games saved here.
  type Row = { key: string; open: () => void; res: { cls: string; text: string }; title: string; sub: string; at: number };
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const g of online ?? []) {
    seen.add(g.gameId);
    rows.push({
      key: g.gameId, open: () => onReplay({ gameId: g.gameId }), at: g.endedAt,
      res: outcome({ result: { winner: g.winner, reason: g.reason } as never, you: g.seat }),
      title: `vs ${g.players[g.seat === 0 ? 1 : 0]}`, sub: `${g.rated ? 'Rated' : 'Casual'} · ${g.reason} · ${g.turns} turn${g.turns === 1 ? '' : 's'} · ${when(g.endedAt)}`,
    });
  }
  for (const g of games) {
    if (g.online && seen.has(g.online.gameId)) continue;
    rows.push({
      key: g.id, open: () => onReplay({ id: g.id }), at: g.endedAt, res: outcome(g),
      title: g.mode === 'pass' ? `${g.players[0]} vs ${g.players[1]}` : `vs ${g.players[g.you === 1 ? 0 : 1]}`,
      sub: `${g.mode === 'pass' ? 'Pass & Play' : g.mode === 'bot' ? 'Bot' : 'Online'} · ${g.turns} turn${g.turns === 1 ? '' : 's'} · ${when(g.endedAt)}`,
    });
  }
  rows.sort((a, b) => b.at - a.at);
  return (
    <section className="set-card" data-testid="profile-recent">
      <div className="card-head">
        <h3>Recent games</h3>
        {rows.length > 4 && <button className="link-btn" onClick={() => setAll((v) => !v)} data-testid="recent-link">{all ? 'Show less' : <>All {rows.length} <Icon name="chevron-right" size={14} /></>}</button>}
      </div>
      {!rows.length && <p className="prof-note">No games yet — play a bot, a friend, or a Quick Match.</p>}
      {rows.slice(0, all ? 40 : 4).map((r) => (
        <button key={r.key} className="recent-item" onClick={r.open}>
          <span className={`ri-res ${r.res.cls}`}>{r.res.text}</span>
          <span className="ri-main"><b>{r.title}</b><small>{r.sub}</small></span>
          <span className="ri-go">Review <Icon name="chevron-right" size={15} /></span>
        </button>
      ))}
    </section>
  );
}
