import { useEffect, useState } from 'react';
import type { FriendInfo, UserSearchHit } from '../../net/protocol';
import { HAS_SERVER } from '../../net/online';
import { Avatar, presenceText } from '../social/Avatar';
import { client, useOnline } from '../social/useOnline';
import { Icon } from '../icons';

const ORDER = { playing: 0, online: 1, offline: 2 } as const;

export function FriendsTab({ onSignUp, onChallenge, onWatch }: {
  onSignUp: () => void;
  /** Challenge sent: show the waiting room. */
  onChallenge: () => void;
  onWatch: (code: string) => void;
}) {
  const view = useOnline();
  const user = view.user;
  useEffect(() => { if (user && !user.guest) void client.loadFriends(); }, [user?.id, user?.guest]);

  if (!HAS_SERVER) {
    return (
      <section className="cta" data-testid="friends-soon">
        <div><b>Friends are coming soon</b><small>Friends, challenges and live games arrive with online play. Until then: Pass &amp; Play, the bots, and the Learn path.</small></div>
      </section>
    );
  }
  if (!user || user.guest) {
    return (
      <section className="cta" data-testid="friends-guest">
        <div><b>Sign up to add friends</b><small>Friends need an account so they can find you. See who’s online, challenge them to a game, and watch theirs live.</small></div>
        <button className="btn primary small" onClick={onSignUp} data-testid="friends-signup">Sign up</button>
      </section>
    );
  }

  const f = view.friends;
  const friends = [...(f?.friends ?? [])].sort((a, b) => ORDER[a.presence?.status ?? 'offline'] - ORDER[b.presence?.status ?? 'offline'] || a.name.localeCompare(b.name));
  const onlineN = friends.filter((x) => x.presence && x.presence.status !== 'offline').length;
  const challenge = (fr: FriendInfo) => { if (client.challenge(fr.id)) onChallenge(); };

  return (
    <div className="friends" data-testid="friends">
      <Search />
      {!!f?.incoming.length && (
        <section className="set-card" data-testid="incoming">
          <h3>Friend requests <small>{f.incoming.length}</small></h3>
          {f.incoming.map((u) => (
            <Row key={u.id} u={u} sub="Wants to be friends">
              <button className="btn tiny ghost" onClick={() => void act('decline', u.id)} data-testid={`decline-${u.name}`}>Decline</button>
              <button className="btn tiny primary" onClick={() => void act('accept', u.id)} data-testid={`accept-${u.name}`}>Accept</button>
            </Row>
          ))}
        </section>
      )}
      <section className="set-card" data-testid="friend-list">
        <div className="card-head">
          <h3>Friends <small>{friends.length}</small></h3>
          {friends.length > 0 && <span className={`conn ${onlineN ? 'conn-online' : ''}`}><i />{onlineN} online</span>}
        </div>
        {f === null && <p className="prof-note">Loading…</p>}
        {f && !friends.length && <p className="prof-note">No friends yet. Search for a player above and send a request.</p>}
        {friends.map((u) => <FriendRow key={u.id} u={u} canChallenge={view.status === 'online'} onChallenge={() => challenge(u)} onWatch={onWatch} />)}
      </section>
      {!!f?.outgoing.length && (
        <section className="set-card" data-testid="outgoing">
          <h3>Sent requests</h3>
          {f.outgoing.map((u) => (
            <Row key={u.id} u={u} sub="Waiting for them to accept">
              <button className="btn tiny ghost" onClick={() => void act('cancel', u.id)} data-testid={`cancel-${u.name}`}>Cancel</button>
            </Row>
          ))}
        </section>
      )}
      {view.error && <div className="toast set-toast" role="alert">{view.error}</div>}
    </div>
  );
}

async function act(action: 'request' | 'accept' | 'decline' | 'cancel' | 'remove', id: string) {
  try { return await client.friendAction(action, id); } catch (e) { client.flashError(e instanceof Error ? e.message : 'Something went wrong'); return null; }
}

function Row({ u, sub, children, highlight }: { u: FriendInfo; sub: React.ReactNode; children?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`friend-row ${highlight ? 'hl' : ''}`} data-testid={`friend-${u.name}`}>
      <Avatar name={u.name} avatar={u.avatar} size={42} presence={u.presence} />
      <div className="fr-main"><b>{u.name} <small className="fr-rating">{u.rating}</small></b><small>{sub}</small></div>
      <div className="fr-actions">{children}</div>
    </div>
  );
}

function FriendRow({ u, canChallenge, onChallenge, onWatch }: { u: FriendInfo; canChallenge: boolean; onChallenge: () => void; onWatch: (code: string) => void }) {
  const [menu, setMenu] = useState<null | 'menu' | 'confirm'>(null);
  const p = u.presence;
  return (
    <Row u={u} highlight={p?.status === 'playing'} sub={<span className={`ps ps-${p?.status ?? 'offline'}`}>{presenceText(p)}</span>}>
      {p?.status === 'playing' && p.code && <button className="btn tiny" onClick={() => onWatch(p.code!)} data-testid={`watch-${u.name}`}><Icon name="eye" size={14} /> Watch</button>}
      {p?.status === 'online' && <button className="btn tiny primary" disabled={!canChallenge} onClick={onChallenge} data-testid={`challenge-${u.name}`}><Icon name="swords" size={14} /> Challenge</button>}
      <button className="icon-btn tiny-icon" onClick={() => setMenu((v) => (v ? null : 'menu'))} aria-label={`More for ${u.name}`} data-testid={`more-${u.name}`}><Icon name="more" size={18} /></button>
      {menu && (
        <div className="fr-menu">
          {menu === 'menu' ? (
            <button onClick={() => setMenu('confirm')} data-testid={`remove-${u.name}`}>Remove friend</button>
          ) : (
            <>
              <span>Remove {u.name}?</span>
              <button className="danger-text" onClick={() => { setMenu(null); void act('remove', u.id); }} data-testid={`confirm-remove-${u.name}`}>Yes, remove</button>
              <button onClick={() => setMenu(null)}>Keep</button>
            </>
          )}
        </div>
      )}
    </Row>
  );
}

function Search() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<UserSearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits(null); return; }
    setBusy(true);
    const t = setTimeout(() => {
      client.searchUsers(term).then(setHits).catch(() => setHits([])).finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const update = (id: string, relation: UserSearchHit['relation']) => setHits((h) => h?.map((x) => (x.id === id ? { ...x, relation } : x)) ?? null);
  return (
    <section className="set-card search-card">
      <div className="search-box">
        <span className="search-icon"><Icon name="search" size={18} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find players by name" aria-label="Search players" data-testid="friend-search" />
        {busy && <i className="spinner tiny-spin" />}
      </div>
      {hits && (
        <div className="search-hits" data-testid="search-hits">
          {!hits.length && !busy && <p className="prof-note">No players match “{q.trim()}”.</p>}
          {hits.map((u) => (
            <Row key={u.id} u={u} sub={u.ratedGames ? `${u.ratedGames} rated games` : 'New player'}>
              {u.relation === 'none' && <button className="btn tiny primary" onClick={async () => { const r = await act('request', u.id); if (r) update(u.id, r); }} data-testid={`add-${u.name}`}><Icon name="user" size={13} /> Add</button>}
              {u.relation === 'outgoing' && <span className="rel-tag">Requested</span>}
              {u.relation === 'incoming' && <button className="btn tiny primary" onClick={async () => { const r = await act('accept', u.id); if (r) update(u.id, r); }}>Accept</button>}
              {u.relation === 'friends' && <span className="rel-tag ok"><Icon name="check" size={12} /> Friends</span>}
            </Row>
          ))}
        </div>
      )}
    </section>
  );
}
