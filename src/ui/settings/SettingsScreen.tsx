import { useEffect, useState } from 'react';
import { HAS_SERVER, storedToken } from '../../net/online';
import { AuthModal } from '../AuthModal';
import { HowToPlay } from '../HowToPlay';
import type { OpenReplay } from '../RecentGames';
import { Avatar } from '../social/Avatar';
import { client, useOnline } from '../social/useOnline';
import { FriendsTab } from './FriendsTab';
import { PrefsTab, type PrefsProps } from './PrefsTab';
import { ProfileTab } from './ProfileTab';
import { useSettings } from './store';
import '../social/social.css';

export type SettingsTab = 'profile' | 'friends' | 'settings';

interface Props extends Omit<PrefsProps, 'onAuth' | 'onHowTo'> {
  initialTab: SettingsTab;
  onHome: () => void;
  onReplay: OpenReplay;
  /** A challenge was sent: open the online lobby (waiting room). */
  onChallenge: () => void;
  onWatch: (code: string) => void;
}

/** Settings page with the Profile and Friends menus inside it (reached from the avatar / gear on Home). */
export function SettingsScreen({ initialTab, onHome, onReplay, onChallenge, onWatch, ...prefs }: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [auth, setAuth] = useState<'login' | 'signup' | null>(null);
  const [howTo, setHowTo] = useState(false);
  const view = useOnline();
  const settings = useSettings();
  const requests = view.friends?.incoming.length ?? 0;

  useEffect(() => {
    // Signed in before? Load the account (and keep the socket up for presence). Never creates a guest here.
    if (!HAS_SERVER || !storedToken()) return;
    client.ensureSession().then(() => client.connect()).catch(() => {});
  }, []);

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <Avatar name={view.user?.name ?? 'You'} avatar={view.user?.avatar ?? settings.avatar} size={22} /> },
    { id: 'friends', label: 'Friends', icon: <span>🤝</span> },
    { id: 'settings', label: 'Settings', icon: <span>⚙</span> },
  ];

  return (
    <div className="lobby settings-screen" data-testid="settings">
      <header className="lobby-bar">
        <button className="icon-btn" onClick={onHome} aria-label="Home" data-testid="settings-home">⌂</button>
        <h1>{tab === 'profile' ? 'Profile' : tab === 'friends' ? 'Friends' : 'Settings'}</h1>
      </header>
      <nav className="set-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`set-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>
            {t.icon}<span>{t.label}</span>
            {t.id === 'friends' && requests > 0 && <i className="tab-badge">{requests}</i>}
          </button>
        ))}
      </nav>
      <div className="set-body">
        {tab === 'profile' && <ProfileTab pieceSet={prefs.pieceSet} onPieceSet={prefs.onPieceSet} onSignUp={() => setAuth('signup')} onReplay={onReplay} />}
        {tab === 'friends' && <FriendsTab onSignUp={() => setAuth('signup')} onChallenge={onChallenge} onWatch={onWatch} />}
        {tab === 'settings' && <PrefsTab {...prefs} onAuth={setAuth} onHowTo={() => setHowTo(true)} />}
      </div>
      {auth && <AuthModal mode={auth} onMode={setAuth} onClose={() => setAuth(null)} />}
      {howTo && (
        <div className="overlay" onClick={() => setHowTo(false)}>
          <div className="panel rules" onClick={(e) => e.stopPropagation()}>
            <HowToPlay />
            <button className="btn primary" onClick={() => setHowTo(false)}>Got it</button>
          </div>
        </div>
      )}
      {view.error && tab !== 'friends' && <div className="toast set-toast" role="alert">{view.error}</div>}
    </div>
  );
}
