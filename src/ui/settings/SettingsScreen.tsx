import { useEffect, useState } from 'react';
import { HAS_SERVER, storedToken } from '../../net/online';
import { AuthModal } from '../AuthModal';
import { HowToPlay } from '../HowToPlay';
import type { OpenReplay } from '../RecentGames';
import { client, useOnline } from '../social/useOnline';
import { PrefsTab, type PrefsProps } from './PrefsTab';
import { ProfileTab } from './ProfileTab';
import { CollectionTab } from './CollectionTab';
import '../social/social.css';
import { Icon } from '../icons';

export type SettingsTab = 'profile' | 'collection' | 'settings';

interface Props extends Omit<PrefsProps, 'onAuth' | 'onHowTo'> {
  initialTab: SettingsTab;
  onHome: () => void;
  onReplay: OpenReplay;
  onLearn: () => void;
}

/** Profile, Badges & skins and Settings (reached from Profile / Settings in the app nav). */
const TITLES: Record<SettingsTab, string> = { profile: 'Profile', collection: 'Badges & skins', settings: 'Settings' };

export function SettingsScreen({ initialTab, onHome, onReplay, onLearn, ...prefs }: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [auth, setAuth] = useState<'login' | 'signup' | null>(null);
  const [howTo, setHowTo] = useState(false);
  const view = useOnline();

  useEffect(() => {
    // Signed in before? Load the account (and keep the socket up for presence). Never creates a guest here.
    if (!HAS_SERVER || !storedToken()) return;
    client.ensureSession().then(() => client.connect()).catch(() => {});
  }, []);

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: null },
    { id: 'collection', label: 'Collection', icon: null },
    { id: 'settings', label: 'Settings', icon: null },
  ];

  return (
    <div className="lobby settings-screen" data-testid="settings">
      <header className="page-head with-back">
        <button className="icon-btn" onClick={onHome} aria-label="Home" data-testid="settings-home"><Icon name="chevron-left" size={20} /></button>
        <h1 className="page-title">{TITLES[tab]}</h1>
      </header>
      <nav className="set-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`set-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="set-body">
        {tab === 'profile' && <ProfileTab onSignUp={() => setAuth('signup')} onReplay={onReplay} onCollection={() => setTab('collection')} />}
        {tab === 'collection' && <CollectionTab pieceSet={prefs.pieceSet} onPieceSet={prefs.onPieceSet} onLearn={onLearn} />}
        {tab === 'settings' && <PrefsTab {...prefs} onAuth={setAuth} onHowTo={() => setHowTo(true)} />}
      </div>
      {auth && <AuthModal mode={auth} onMode={setAuth} onClose={() => setAuth(null)} />}
      {howTo && (
        <div className="overlay" onClick={() => setHowTo(false)}>
          <div className="panel rules" onClick={(e) => e.stopPropagation()}>
            <HowToPlay />
            <button className="btn wide" onClick={() => setHowTo(false)}>Got it</button>
          </div>
        </div>
      )}
      {view.error && <div className="toast set-toast" role="alert">{view.error}</div>}
    </div>
  );
}
