import { useSettings } from '../settings/store';
import { Avatar } from '../social/Avatar';
import { useOnline } from '../social/useOnline';
import { Icon, type IconName } from '../icons';
import './nav.css';

export type NavTab = 'home' | 'learn' | 'social' | 'leaderboard' | 'profile' | 'settings';

const ITEMS: { id: Exclude<NavTab, 'settings'>; label: string; short: string; icon: IconName | null }[] = [
  { id: 'home', label: 'Home', short: 'Home', icon: 'house' },
  { id: 'learn', label: 'Learn', short: 'Learn', icon: 'graduation-cap' },
  { id: 'social', label: 'Social', short: 'Social', icon: 'users' },
  { id: 'leaderboard', label: 'Leaderboard', short: 'Ranks', icon: 'trophy' },
  { id: 'profile', label: 'Profile', short: 'Profile', icon: null },
];

/**
 * App navigation: a top bar on desktop/web widths, a bottom tab bar on phones (same component,
 * switched by CSS at 760px). Hidden during games, lessons and replays.
 */
export function AppNav({ active, onNav }: { active: NavTab | null; onNav: (t: NavTab) => void }) {
  const view = useOnline();
  const settings = useSettings();
  const requests = view.friends?.incoming.length ?? 0;
  const user = view.user;
  const me = <Avatar name={user?.name ?? 'You'} avatar={user?.avatar ?? settings.avatar} size={26} />;
  return (
    <nav className="app-nav" aria-label="Main" data-testid="app-nav">
      <button className="nav-brand" onClick={() => onNav('home')} aria-label="Chess UNO home">
        <span className="nb-chess">Chess</span><span className="nb-uno">UNO</span>
      </button>
      <div className="nav-items">
        {ITEMS.map((it) => (
          <button key={it.id} className={`nav-item ni-${it.id} ${active === it.id ? 'on' : ''}`} aria-current={active === it.id ? 'page' : undefined}
            onClick={() => onNav(it.id)} data-testid={`nav-${it.id}`}>
            <span className="ni-icon">{it.icon ? <Icon name={it.icon} size={21} /> : me}</span>
            <span className="ni-label ni-long">{it.id === 'profile' && user && !user.guest ? user.name : it.label}</span>
            <span className="ni-label ni-short">{it.short}</span>
            {it.id === 'social' && requests > 0 && <i className="tab-badge">{requests}</i>}
          </button>
        ))}
        <button className={`nav-item ni-settings ${active === 'settings' ? 'on' : ''}`} onClick={() => onNav('settings')} aria-label="Settings" data-testid="nav-settings">
          <span className="ni-icon"><Icon name="settings" size={20} /></span>
        </button>
      </div>
    </nav>
  );
}
