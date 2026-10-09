import { useState } from 'react';
import { getOnlineClient } from '../net/online';

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
  return (
    <div className="overlay" onClick={onClose}>
      <form className="panel auth" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="auth-modal">
        <div className="seg seg-small">
          <button type="button" className={`seg-btn ${mode === 'signup' ? 'on' : ''}`} onClick={() => onMode('signup')}>Sign up</button>
          <button type="button" className={`seg-btn ${mode === 'login' ? 'on' : ''}`} onClick={() => onMode('login')}>Log in</button>
        </div>
        {mode === 'signup' && <p className="auth-note">Your guest stats carry over. Rated Quick Match unlocks with an account.</p>}
        <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label>Password<input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label>
        {mode === 'signup' && (
          <label><span>Display name <small>(optional)</small></span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} pattern="[A-Za-z0-9 _\-]{3,20}" /></label>
        )}
        {err && <div className="auth-error">{err}</div>}
        <div className="panel-actions">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? '…' : mode === 'signup' ? 'Create account' : 'Log in'}</button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
