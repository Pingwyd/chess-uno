import type { Presence } from '../../net/protocol';

const HUES = [28, 172, 262, 330, 205, 48, 140, 296];
const hueOf = (name: string) => HUES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];

/** Round-cornered avatar: the chosen symbol, or the name's initial on a colour picked from the name. */
export function Avatar({ name, avatar, size = 44, presence, className = '' }: {
  name: string; avatar?: string | null; size?: number; presence?: Presence; className?: string;
}) {
  const h = hueOf(name || '?');
  return (
    <span
      className={`av ${avatar ? 'av-sym' : ''} ${className}`}
      style={{ width: size, height: size, fontSize: size * (avatar ? 0.56 : 0.48), background: `linear-gradient(135deg, hsl(${h} 90% 68%), hsl(${(h + 60) % 360} 70% 45%))` }}
      aria-hidden="true"
    >
      {avatar || (name || '?').slice(0, 1).toUpperCase()}
      {presence && <i className={`presence-dot pd-${presence.status}`} title={presence.status} />}
    </span>
  );
}

export function presenceText(p?: Presence): string {
  if (!p || p.status === 'offline') return 'Offline';
  if (p.status === 'playing') return p.rated ? 'In a rated game' : 'In a game';
  return 'Online';
}
