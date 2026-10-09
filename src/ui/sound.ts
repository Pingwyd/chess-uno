/** Tiny synthesized sound effects and ambient music (no assets, works offline) + haptics. */
import { getSettings, subscribeSettings } from './settings/store';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  syncMusic();
}

const sfxVolume = () => getSettings().sfxVolume;

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.08, slideTo?: number, delay = 0) {
  if (!enabled || typeof window === 'undefined') return;
  gain *= sfxVolume();
  if (gain <= 0.0002) return;
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {
    /* audio unavailable */
  }
}

export const sfx = {
  draw: () => { tone(300, 0.18, 'triangle', 0.06, 900); tone(1200, 0.12, 'sine', 0.03, 1800, 0.12); },
  move: () => tone(180, 0.09, 'square', 0.04, 120),
  capture: () => { tone(140, 0.14, 'sawtooth', 0.05, 70); tone(520, 0.08, 'triangle', 0.03, 260, 0.03); },
  check: () => { tone(660, 0.12, 'triangle', 0.07); tone(880, 0.18, 'triangle', 0.07, undefined, 0.1); },
  skip: () => { tone(500, 0.12, 'square', 0.04, 250); tone(250, 0.18, 'square', 0.04, 120, 0.12); },
  reverse: () => { tone(220, 0.5, 'sawtooth', 0.04, 880); tone(880, 0.5, 'sine', 0.04, 220, 0.1); },
  turn: () => tone(740, 0.1, 'sine', 0.04),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.06, undefined, i * 0.12)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.05, undefined, i * 0.15)),
};

/** Short preview blip for the volume slider. */
export const previewSfx = () => tone(660, 0.12, 'triangle', 0.07);

export function buzz(ms = 40) {
  if (getSettings().vibration && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(ms); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------- ambient music

/**
 * A slow generative pad: soft sine chords over a i–VI–III–VII progression, with a sparse
 * arpeggio on top. Starts on the first user gesture once the music volume is above zero.
 */
const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
let musicGain: GainNode | null = null;
let musicTimer: ReturnType<typeof setTimeout> | null = null;
let step = 0;
let gestured = false;

function playBar() {
  if (!ctx || !musicGain) return;
  const chord = CHORDS[Math.floor(step / 2) % CHORDS.length];
  const t = ctx.currentTime;
  for (const f of chord) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f / 2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    o.connect(g).connect(musicGain);
    o.start(t);
    o.stop(t + 3.7);
  }
  // Sparse sparkle: one arpeggio note every other bar.
  if (step % 2 === 1) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = chord[(step >> 1) % 3] * 2;
    g.gain.setValueAtTime(0.0001, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.025, t + 0.65);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(g).connect(musicGain);
    o.start(t + 0.6);
    o.stop(t + 1.9);
  }
  step++;
  musicTimer = setTimeout(playBar, 2400);
}

/** Start/stop/re-level the music to match the settings. */
export function syncMusic() {
  if (typeof window === 'undefined') return;
  const vol = enabled ? getSettings().musicVolume : 0;
  if (vol <= 0) {
    if (musicTimer) clearTimeout(musicTimer);
    musicTimer = null;
    if (musicGain && ctx) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    return;
  }
  if (!gestured) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!musicGain) {
      musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      musicGain.connect(ctx.destination);
    }
    musicGain.gain.setTargetAtTime(vol * 0.9, ctx.currentTime, 0.3);
    if (!musicTimer) playBar();
  } catch {
    /* audio unavailable */
  }
}

if (typeof window !== 'undefined') {
  const first = () => { gestured = true; syncMusic(); window.removeEventListener('pointerdown', first); window.removeEventListener('keydown', first); };
  window.addEventListener('pointerdown', first);
  window.addEventListener('keydown', first);
  subscribeSettings(syncMusic);
}
