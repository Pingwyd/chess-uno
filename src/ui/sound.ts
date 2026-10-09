/** Tiny synthesized sound effects (no assets, works offline) + haptics. */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.08, slideTo?: number, delay = 0) {
  if (!enabled || typeof window === 'undefined') return;
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

export function buzz(ms = 40) {
  if (enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(ms); } catch { /* ignore */ }
  }
}
