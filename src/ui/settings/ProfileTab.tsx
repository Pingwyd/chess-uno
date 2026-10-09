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
import { Icon } from '../icons';


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

  const history = profile?.ratingHistory ?? [];
  return (
    <div className="prof" data-testid="profile">
      <section className="prof-head">
        <button className="prof-avatar" onClick={() => setPicker((v) => !v)} aria-label="Change avatar" data-testid="avatar-btn">
          <Avatar name={name} avatar={avatar} size={64} />
          <span className="prof-avatar-edit"><Icon name="pencil" size={12} /></span>
        </button>
        <div className="prof-id">
          <NameRow user={user} account={account} />
          <div className="prof-sub">
            {account ? <>Member since {new Date(profile?.memberSince ?? Date.now()).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</>
              : user ? 'Guest. Stats are kept on this device.' : 'Offline. Stats are kept on this device.'}
          </div>
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

      <section className={`ink rating-panel ${account ? '' : 'muted'}`} data-testid="profile-rating">
        <div className="rp-top">
          <div>
            <span className="eyebrow">Rating</span>
            <b className="rp-num">{account ? user!.rating : '—'}</b>
          </div>
          <div className="rp-side">
            <small>{account ? (user!.ratedGames ? `${user!.ratedGames} rated games` : 'Provisional') : 'No rating yet'}</small>
            {account && history.length > 1 && (() => {
              const d = history[history.length - 1].r - history[0].r;
              return <b className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? `+${d}` : d}</b>;
            })()}
          </div>
        </div>
        {account && <RatingChart points={history} />}
      </section>

      {!account && (
        <section className="cta" data-testid="guest-cta">
          <div>
            <b>{HAS_SERVER ? 'Create a free account' : 'Accounts are coming soon'}</b>
            <small>{HAS_SERVER ? 'A rating and chart, friends, challenges, and your learning path synced. Guest games carry over.' : 'Ratings, friends and live games arrive with online play. Stats below are saved on this device.'}</small>
          </div>
          {HAS_SERVER && <button className="btn primary" onClick={onSignUp} data-testid="profile-signup">Sign up <Icon name="arrow-right" size={16} /></button>}
        </section>
      )}

      <section className="stat-grid" data-testid="profile-stats">
        <Stat label="Wins" value={stats.w} tone="win" />
        <Stat label="Losses" value={stats.l} tone="loss" />
        <Stat label="Draws" value={stats.d} />
        <Stat label="Win rate" value={pct(stats)} />
        <Stat label="Streak" value={stats.streak} sub={`best ${stats.best}`} />
      </section>
      {account && (local.w + local.l + local.d > 0) && <p className="prof-note">Online games above. Vs bots on this device: {local.w}W {local.l}L {local.d}D.</p>}

      <div className="rows">
        <button className="row coll-teaser" onClick={onCollection} data-testid="open-collection">
          <span className="row-icon"><Icon name="award" size={20} /></span>
          <span className="row-main"><b>Badges &amp; skins</b><small>{earned.length}/{BADGES.length} badges · {SKIN_NAMES[progress.skins.w]} vs {SKIN_NAMES[progress.skins.b]}</small></span>
          <Icon name="chevron-right" size={18} className="chev" />
        </button>
      </div>
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
        {user?.guest && <span className="guest-tag">Guest</span>}
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
    <section className="recent prof-recent" data-testid="profile-recent">
      <div className="recent-head">
        <h3>Recent games</h3>
        {rows.length > 4 && <button className="link-btn" onClick={() => setAll((v) => !v)} data-testid="recent-link">{all ? 'Show less' : <>All {rows.length} <Icon name="chevron-right" size={14} /></>}</button>}
      </div>
      {!rows.length && <p className="prof-note">No games yet. Play a bot, a friend, or a quick match.</p>}
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
