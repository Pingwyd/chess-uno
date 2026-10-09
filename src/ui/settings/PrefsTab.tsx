import { useState } from 'react';
import { HAS_SERVER } from '../../net/online';
import { has3D, type BoardMode } from '../BoardView';
import type { PieceSet } from '../pieces';
import { previewSfx } from '../sound';
import { client, useOnline } from '../social/useOnline';
import { setSettings, useSettings, type MotionPref, type Settings, type ThemePref } from './store';
import { RULES_VERSION } from '../../rules/cards';
import { Icon } from '../icons';
import { permission, requestPermission, type Permission } from '../../notify/browser';

export interface PrefsProps {
  pieceSet: PieceSet;
  onPieceSet: (p: PieceSet) => void;
  boardMode: BoardMode;
  onBoardMode: (m: BoardMode) => void;
  sound: boolean;
  onSound: (on: boolean) => void;
  onAuth: (mode: 'login' | 'signup') => void;
  onHowTo: () => void;
}

export function Toggle({ on, onChange, label, sub, testid, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string; testid?: string; disabled?: boolean }) {
  return (
    <label className={`set-row ${disabled ? 'disabled' : ''}`}>
      <span className="set-label"><b>{label}</b>{sub && <small>{sub}</small>}</span>
      <button type="button" role="switch" aria-checked={on} className={`switch ${on ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(!on)} data-testid={testid}><i /></button>
    </label>
  );
}

function Slider({ value, onChange, label, sub, testid, disabled, onRelease }: { value: number; onChange: (v: number) => void; label: string; sub?: string; testid?: string; disabled?: boolean; onRelease?: () => void }) {
  return (
    <div className={`set-row slider-row ${disabled ? 'disabled' : ''}`}>
      <span className="set-label"><b>{label}</b>{sub && <small>{sub}</small>}</span>
      <div className="slider">
        <input type="range" min={0} max={100} step={5} value={Math.round(value * 100)} disabled={disabled} aria-label={label}
          onChange={(e) => onChange(Number(e.target.value) / 100)} onPointerUp={onRelease} onKeyUp={onRelease} data-testid={testid}
          style={{ '--fill': `${Math.round(value * 100)}%` } as React.CSSProperties} />
        <output>{value ? `${Math.round(value * 100)}%` : 'Off'}</output>
      </div>
    </div>
  );
}

/** Master switch for system notifications; switching it on asks the browser for permission. */
function BrowserNotifyToggle() {
  const s = useSettings();
  const [perm, setPerm] = useState<Permission>(() => permission());
  const [busy, setBusy] = useState(false);
  const on = s.browserNotify && perm === 'granted';
  const sub = perm === 'unsupported' ? 'Not supported in this browser'
    : perm === 'denied' ? 'Blocked for this site. Allow notifications in your browser settings, then switch this on.'
    : 'While Chess Uno is open in a background tab';
  const change = async (v: boolean) => {
    if (!v) { setSettings({ browserNotify: false }); return; }
    setBusy(true);
    const p = await requestPermission();
    setBusy(false);
    setPerm(p);
    setSettings({ browserNotify: p === 'granted' });
  };
  return (
    <>
      <Toggle label="Browser notifications" sub={sub} on={on} onChange={(v) => void change(v)} disabled={busy || perm === 'unsupported'} testid="set-browser-notify" />
      <p className="prof-note notify-note" data-testid="notify-note">
        <Icon name={on ? 'bell' : 'bell-off'} size={15} />
        {on ? 'On. Choose what to hear about below.' : 'Off. You still see these inside the app.'} Alerts when the app is closed arrive later.
      </p>
    </>
  );
}

const notifyLabels: Record<keyof Settings['notify'], [string, string]> = {
  turn: ['Your turn', 'When an online opponent has moved or a game starts'],
  challenges: ['Challenges', 'Friend challenges and rematch offers'],
  friends: ['Friend requests', 'New requests and accepted requests'],
  streak: ['Streak reminders', 'Keep your learning streak alive'],
};

export function PrefsTab(p: PrefsProps) {
  const s = useSettings();
  return (
    <div className="prefs" data-testid="prefs">
      <section className="set-card" data-testid="set-appearance">
        <h3>Appearance</h3>
        <div className="set-row">
          <span className="set-label"><b>Theme</b><small>{s.theme === 'system' ? 'Follows this device' : s.theme === 'dark' ? 'Ink: near-black' : 'Paper: light'}</small></span>
          <div className="seg seg-small mini-seg" role="radiogroup" aria-label="Theme">
            {(['system', 'light', 'dark'] as ThemePref[]).map((t) => (
              <button key={t} role="radio" aria-checked={s.theme === t} className={`seg-btn ${s.theme === t ? 'on' : ''}`} onClick={() => setSettings({ theme: t })} data-testid={`set-theme-${t}`}>
                <Icon name={t === 'system' ? 'monitor' : t === 'light' ? 'sun' : 'moon'} size={15} /> {t === 'system' ? 'Auto' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="set-card" data-testid="set-board">
        <h3>Board</h3>
        <div className="set-row">
          <span className="set-label"><b>Default board</b><small>{has3D() ? 'You can still switch in a game' : '3D needs WebGL, which this device lacks'}</small></span>
          <div className="seg seg-small mini-seg">
            <button className={`seg-btn ${p.boardMode === '2d' ? 'on' : ''}`} onClick={() => p.onBoardMode('2d')} data-testid="set-2d">2D</button>
            <button className={`seg-btn ${p.boardMode === '3d' ? 'on' : ''}`} onClick={() => p.onBoardMode('3d')} disabled={!has3D()} data-testid="set-3d">3D</button>
          </div>
        </div>
        <div className="set-row">
          <span className="set-label"><b>Piece set</b></span>
          <div className="seg seg-small mini-seg">
            <button className={`seg-btn ${p.pieceSet === 'arcane' ? 'on' : ''}`} onClick={() => p.onPieceSet('arcane')}>Arcane</button>
            <button className={`seg-btn ${p.pieceSet === 'classic' ? 'on' : ''}`} onClick={() => p.onPieceSet('classic')}>Classic</button>
          </div>
        </div>
        <div className="set-row">
          <span className="set-label"><b>3D graphics</b><small>{s.graphics === 'auto' ? 'Trims effects on slower devices, keeps the board sharp' : s.graphics === 'high' ? 'All effects, always' : 'Effects off for battery and older phones'}</small></span>
          <div className="seg seg-small mini-seg">
            {(['auto', 'high', 'low'] as const).map((g) => (
              <button key={g} className={`seg-btn ${s.graphics === g ? 'on' : ''}`} onClick={() => setSettings({ graphics: g })} data-testid={`set-graphics-${g}`}>{g === 'auto' ? 'Auto' : g === 'high' ? 'High' : 'Low'}</button>
            ))}
          </div>
        </div>
        <Toggle label="Legal-move hints" sub="Dots and rings where the selected piece can go" on={s.hints} onChange={(v) => setSettings({ hints: v })} testid="set-hints" />
        <Toggle label="Confirm moves" sub="Tap a move, then press Play. Avoids mis-taps." on={s.confirmMoves} onChange={(v) => setSettings({ confirmMoves: v })} testid="set-confirm" />
      </section>

      <section className="set-card" data-testid="set-sound">
        <h3>Sound &amp; haptics</h3>
        <Toggle label="Sound" sub="Master switch for effects and music" on={p.sound} onChange={p.onSound} testid="set-sound-on" />
        <Slider label="Effects volume" value={s.sfxVolume} onChange={(v) => setSettings({ sfxVolume: v })} onRelease={previewSfx} disabled={!p.sound} testid="set-sfx" />
        <Slider label="Music" sub="Soft ambient loop" value={s.musicVolume} onChange={(v) => setSettings({ musicVolume: v })} disabled={!p.sound} testid="set-music" />
        <Toggle label="Vibration" sub={typeof navigator !== 'undefined' && 'vibrate' in navigator ? 'Haptic pulse on turn changes and Reverse' : 'Not supported on this device'} on={s.vibration} onChange={(v) => setSettings({ vibration: v })} testid="set-vibration" />
      </section>

      <section className="set-card" data-testid="set-notify">
        <h3>Notifications</h3>
        <BrowserNotifyToggle />
        {(Object.keys(notifyLabels) as (keyof Settings['notify'])[]).map((k) => (
          <Toggle key={k} label={notifyLabels[k][0]} sub={notifyLabels[k][1]} on={s.notify[k]} onChange={(v) => setSettings({ notify: { ...s.notify, [k]: v } })} testid={`set-notify-${k}`} />
        ))}
      </section>

      <section className="set-card" data-testid="set-motion">
        <h3>Accessibility</h3>
        <div className="set-row">
          <span className="set-label"><b>Reduced motion</b><small>Calmer animations: no board spins or card flips</small></span>
          <div className="seg seg-small mini-seg">
            {(['system', 'on', 'off'] as MotionPref[]).map((m) => (
              <button key={m} className={`seg-btn ${s.reducedMotion === m ? 'on' : ''}`} onClick={() => setSettings({ reducedMotion: m })} data-testid={`set-motion-${m}`}>{m === 'system' ? 'Auto' : m === 'on' ? 'On' : 'Off'}</button>
            ))}
          </div>
        </div>
      </section>

      <AccountSection onAuth={p.onAuth} />

      <section className="set-card" data-testid="set-about">
        <h3>About</h3>
        <button className="set-link" onClick={p.onHowTo} data-testid="set-howto"><span><Icon name="book" size={17} /> How to play</span><i><Icon name="chevron-right" size={18} /></i></button>
        <a className="set-link" href="https://github.com/Pingwyd/chess-uno" target="_blank" rel="noreferrer"><span><Icon name="code" size={17} /> Source code</span><i><Icon name="external" size={16} /></i></a>
        <p className="prof-note about-line">Chess UNO 0.1 · rules v{RULES_VERSION} · {HAS_SERVER ? 'online server connected' : 'offline build'}</p>
      </section>
    </div>
  );
}

function AccountSection({ onAuth }: { onAuth: (m: 'login' | 'signup') => void }) {
  const view = useOnline();
  const u = view.user;
  const [pw, setPw] = useState(false);
  const [del, setDel] = useState(false);
  if (!HAS_SERVER) {
    return (
      <section className="set-card" data-testid="set-account">
        <h3>Account</h3>
        <p className="prof-note">Accounts arrive with online play. Everything here is saved on this device.</p>
      </section>
    );
  }
  return (
    <section className="set-card" data-testid="set-account">
      <h3>Account</h3>
      {!u || u.guest ? (
        <>
          <p className="prof-note">{u ? <>Playing as guest <b>{u.name}</b>. Sign up to keep a rating, add friends and sync progress — your guest stats carry over.</> : 'Not signed in.'}</p>
          <div className="panel-actions left">
            <button className="btn primary small" onClick={() => onAuth('signup')} data-testid="set-signup">Sign up</button>
            <button className="btn ghost small" onClick={() => onAuth('login')} data-testid="set-login">Log in</button>
          </div>
        </>
      ) : (
        <>
          <div className="set-row"><span className="set-label"><b>{u.name}</b><small>{u.email}</small></span>
            <button className="btn ghost small" onClick={() => void client.logout()} data-testid="set-logout">Sign out</button></div>
          <button className="set-link" onClick={() => setPw((v) => !v)} data-testid="set-password"><span><Icon name="key" size={17} /> Change password</span><i><Icon name={pw ? 'chevron-up' : 'chevron-right'} size={18} /></i></button>
          {pw && <PasswordForm onDone={() => setPw(false)} />}
          <button className="set-link danger" onClick={() => setDel(true)} data-testid="set-delete"><span><Icon name="trash" size={17} /> Delete account</span><i><Icon name="chevron-right" size={18} /></i></button>
          {del && <DeleteDialog name={u.name} onClose={() => setDel(false)} />}
        </>
      )}
    </section>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await client.changePassword(cur, next);
      setMsg({ ok: true, text: 'Password changed' });
      setCur(''); setNext('');
      setTimeout(onDone, 1200);
    } catch (x) {
      setMsg({ ok: false, text: x instanceof Error ? x.message : 'Could not change password' });
    } finally { setBusy(false); }
  };
  return (
    <form className="auth inline-form" onSubmit={submit} data-testid="password-form">
      <label>Current password<input type="password" required value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></label>
      <label>New password <small>(8+ characters)</small><input type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></label>
      {msg && <div className={msg.ok ? 'auth-ok' : 'auth-error'}>{msg.text}</div>}
      <button className="btn primary small" type="submit" disabled={busy}>{busy ? '…' : 'Update password'}</button>
    </form>
  );
}

function DeleteDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await client.deleteAccount(password); onClose(); } catch (x) { setErr(x instanceof Error ? x.message : 'Could not delete'); } finally { setBusy(false); }
  };
  return (
    <div className="overlay" onClick={onClose}>
      <form className="panel auth danger-panel" onClick={(e) => e.stopPropagation()} onSubmit={go} data-testid="delete-dialog">
        <h2>Delete account?</h2>
        <p>This permanently removes <b>{name}</b>: your rating, friends and synced learning progress. Past games stay in your opponents’ histories as “Deleted player”. This can’t be undone.</p>
        <label>Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" data-testid="delete-password" /></label>
        <label>Type <b>DELETE</b> to confirm<input value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="delete-typed" /></label>
        {err && <div className="auth-error">{err}</div>}
        <div className="panel-actions">
          <button className="btn danger" type="submit" disabled={busy || typed !== 'DELETE' || !password} data-testid="delete-confirm">Delete forever</button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
