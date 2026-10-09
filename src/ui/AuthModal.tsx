import { useState } from 'react';
import { getOnlineClient } from '../net/online';
import { Icon } from './icons';

const client = getOnlineClient();

/** Sign up / log in (a guest who signs up keeps their stats and history). */
export function AuthModal({ mode, onMode, onClose }: { mode: 'login' | 'signup'; onMode: (m: 'login' | 'signup') => void; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'signup') await client.signup(email, password, name);
      else await client.login(email, password);
      onClose();
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  const signup = mode === 'signup';
  return (
    <div className="overlay auth-overlay" onClick={onClose}>
      <form className="panel auth" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="auth-modal">
        <div className="auth-top">
          <span className="nav-brand auth-brand" aria-hidden="true"><span className="nb-chess">Chess</span><span className="nb-uno">Uno</span></span>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>
        <h2 className="auth-title">{signup ? 'Create account' : 'Sign in'}</h2>
        <p className="auth-note">{signup ? 'Your guest stats carry over. Rated quick match needs an account.' : 'Welcome back. Your rating, friends and path sync across devices.'}</p>
        <div className="seg seg-small auth-tabs">
          <button type="button" className={`seg-btn ${signup ? 'on' : ''}`} onClick={() => onMode('signup')}>Sign up</button>
          <button type="button" className={`seg-btn ${!signup ? 'on' : ''}`} onClick={() => onMode('login')}>Log in</button>
        </div>
        <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" /></label>
        <label>Password<input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? '8 characters or more' : ''} /></label>
        {signup && (
          <label><span>Display name <small>(optional)</small></span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} pattern="[A-Za-z0-9 _\-]{3,20}" /></label>
        )}
        {err && <div className="auth-error">{err}</div>}
        <button className="btn primary wide auth-go" type="submit" disabled={busy}>{busy ? '…' : signup ? 'Create account' : 'Log in'} <Icon name="arrow-right" size={18} /></button>
        <button className="btn ghost wide" type="button" onClick={onClose}>Cancel</button>
      </form>
    </div>
  );
}
