import { useEffect, useState } from 'react';
import { HAS_SERVER } from '../../net/online';
import { AuthModal } from '../AuthModal';
import { FriendsTab } from '../settings/FriendsTab';
import { LiveGames } from './LiveGames';
import { client, useOnline } from './useOnline';
import './social.css';
import { Icon } from '../icons';

export type SocialTab = 'friends' | 'live';

/**
 * Social page: Friends and Live games. Sub-tabs on phones, side by side on wide screens.
 * Opening it starts an online session (a guest if you've never signed in) so live games can stream.
 */
export function SocialScreen({ initialTab = 'friends', onChallenge, onWatch }: { initialTab?: SocialTab; onChallenge: () => void; onWatch: (code: string) => void }) {
  const [tab, setTab] = useState<SocialTab>(initialTab);
  const [auth, setAuth] = useState<'login' | 'signup' | null>(null);
  const view = useOnline();
  const pick = (t: SocialTab) => { setTab(t); window.scrollTo(0, 0); };
  const requests = view.friends?.incoming.length ?? 0;
  const online = (view.friends?.friends ?? []).filter((f) => f.presence && f.presence.status !== 'offline').length;

  useEffect(() => {
    if (!HAS_SERVER) return;
    client.ensureSession().then(() => client.connect()).catch(() => {});
  }, []);

  return (
    <div className={`lobby social-screen show-${tab}`} data-testid="social">
      <header className="lobby-bar">
        <h1>Social</h1>
        {HAS_SERVER && <span className={`conn conn-${view.status}`}><i />{view.status === 'online' ? `${online} friend${online === 1 ? '' : 's'} online` : 'Connecting…'}</span>}
      </header>
      <nav className="set-tabs social-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'friends'} className={`set-tab ${tab === 'friends' ? 'on' : ''}`} onClick={() => pick('friends')} data-testid="social-tab-friends">
          <Icon name="users" size={17} /><span>Friends</span>{requests > 0 && <i className="tab-badge">{requests}</i>}
        </button>
        <button role="tab" aria-selected={tab === 'live'} className={`set-tab ${tab === 'live' ? 'on' : ''}`} onClick={() => pick('live')} data-testid="social-tab-live">
          <span className="live-dot" /><span>Live games{view.live ? ` · ${view.live.length}` : ''}</span>
        </button>
      </nav>
      <div className="social-cols">
        <div className="social-col sc-friends">
          <FriendsTab onSignUp={() => setAuth('signup')} onChallenge={onChallenge} onWatch={onWatch} />
        </div>
        <div className="social-col sc-live">
          {HAS_SERVER ? <LiveGames onWatch={onWatch} /> : (
            <section className="set-card cta">
              <span className="cta-icon"><Icon name="radio" size={26} /></span>
              <div><b>Live games are coming soon</b><small>Watch top players and friends once online play launches.</small></div>
            </section>
          )}
        </div>
      </div>
      {auth && <AuthModal mode={auth} onMode={setAuth} onClose={() => setAuth(null)} />}
      {view.error && <div className="toast" role="alert">{view.error}</div>}
    </div>
  );
}
