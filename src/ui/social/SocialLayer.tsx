import { useEffect, useState } from 'react';
import type { ChallengeInfo } from '../../net/protocol';
import { Avatar } from './Avatar';
import { client, useOnline } from './useOnline';
import { buzz, sfx } from '../sound';
import './social.css';

/**
 * In-app notifications on every screen: incoming friend challenges (accept / decline with a
 * countdown) and short notices (friend requests, accepted, declined…).
 */
export function SocialLayer({ onAccept, onOpenFriends }: { onAccept: () => void; onOpenFriends: () => void }) {
  const view = useOnline();
  const ch = view.challenges[0];
  if (!ch && !view.notices.length) return null;
  return (
    <div className="social-layer" aria-live="polite">
      {ch && <ChallengeCard key={ch.id} ch={ch} more={view.challenges.length - 1} offset={client.offset} onAccept={() => { onAccept(); client.replyChallenge(ch.id, true); }} />}
      {view.notices.map((n) => (
        <div key={n.id} className="notice" role="status" data-testid="notice">
          <span className="notice-icon">{n.icon}</span>
          <span className="notice-text">{n.text}</span>
          {n.action === 'friends' && <button className="btn tiny" onClick={() => { client.dismiss(n.id); onOpenFriends(); }}>View</button>}
          <button className="notice-x" aria-label="Dismiss" onClick={() => client.dismiss(n.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

function ChallengeCard({ ch, more, offset, onAccept }: { ch: ChallengeInfo; more: number; offset: number; onAccept: () => void }) {
  const [now, setNow] = useState(Date.now() + offset);
  useEffect(() => { sfx.turn(); buzz(60); }, []);
  useEffect(() => { const id = setInterval(() => setNow(Date.now() + offset), 500); return () => clearInterval(id); }, [offset]);
  const left = Math.max(0, Math.ceil((ch.expiresAt - now) / 1000));
  const frac = Math.max(0, Math.min(1, (ch.expiresAt - now) / 60_000));
  return (
    <div className="challenge-card" role="alertdialog" aria-label={`${ch.from.name} challenges you`} data-testid="challenge-card">
      <div className="cc-top">
        <Avatar name={ch.from.name} avatar={ch.from.avatar} size={48} />
        <div className="cc-text">
          <b>{ch.from.name} <small>{ch.from.rating}</small></b>
          <span>challenges you to a casual game ⚔</span>
        </div>
        <span className="cc-timer">{left}s</span>
      </div>
      <div className="cc-bar"><i style={{ width: `${frac * 100}%` }} /></div>
      <div className="cc-actions">
        <button className="btn ghost small" onClick={() => client.replyChallenge(ch.id, false)} data-testid="challenge-decline">Decline</button>
        <button className="btn primary small" onClick={onAccept} data-testid="challenge-accept">Accept &amp; play</button>
      </div>
      {more > 0 && <small className="cc-more">+{more} more waiting</small>}
    </div>
  );
}
