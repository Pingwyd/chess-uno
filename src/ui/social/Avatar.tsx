import { normalizeAvatar, type Presence } from '../../net/protocol';
import { Icon } from '../icons';

/** Flat two-tone tiles: ink or paper, picked from the name so a player always looks the same. */
const toneOf = (name: string) => ([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 3 === 0 ? 'paper' : 'ink');

/** Square avatar: the chosen Lucide icon, or the name's initial, on a flat ink or paper tile. */
export function Avatar({ name, avatar, size = 44, presence, className = '' }: {
  name: string; avatar?: string | null; size?: number; presence?: Presence; className?: string;
}) {
  const tone = toneOf(name || '?');
  const icon = normalizeAvatar(avatar);
  return (
    <span
      className={`av av-${tone} ${icon ? 'av-sym' : ''} ${className}`}
      style={{ width: size, height: size, fontSize: size * (icon ? 0.5 : 0.56) }}
      aria-hidden="true"
    >
      {icon ? <Icon name={icon} size="1em" strokeWidth={2.25} /> : (name || '?').slice(0, 1).toUpperCase()}
      {presence && <i className={`presence-dot pd-${presence.status}`} title={presence.status} />}
    </span>
  );
}

export function presenceText(p?: Presence): string {
  if (!p || p.status === 'offline') return 'Offline';
  if (p.status === 'playing') return p.rated ? 'In a rated game' : 'In a game';
  return 'Online';
}
