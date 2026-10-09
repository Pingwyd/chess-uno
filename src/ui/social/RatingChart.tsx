import { useMemo } from 'react';
import type { RatingPoint } from '../../net/protocol';

/** Rating over time (one point per rated game), drawn as an SVG line with a soft area fill. */
export function RatingChart({ points, height = 150 }: { points: RatingPoint[]; height?: number }) {
  const W = 320;
  const H = height;
  const pad = { l: 34, r: 12, t: 12, b: 20 };
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const rs = points.map((p) => p.r);
    let lo = Math.min(...rs), hi = Math.max(...rs);
    if (hi - lo < 40) { const mid = (hi + lo) / 2; lo = mid - 20; hi = mid + 20; }
    lo = Math.floor((lo - 5) / 10) * 10;
    hi = Math.ceil((hi + 5) / 10) * 10;
    const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
    const y = (r: number) => pad.t + (1 - (r - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.r).toFixed(1)}`).join(' ');
    const area = `${line} L${x(points.length - 1).toFixed(1)} ${H - pad.b} L${pad.l} ${H - pad.b} Z`;
    const ticks = [lo, Math.round((lo + hi) / 20) * 10, hi];
    return { line, area, ticks, y, last: { x: x(points.length - 1), y: y(points[points.length - 1].r) } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, H]);

  if (!geo) {
    return (
      <div className="rating-chart empty" data-testid="rating-chart">
        <span>📈</span>
        <p>Play rated games to draw your rating chart.</p>
      </div>
    );
  }
  const first = points[0], last = points[points.length - 1];
  const diff = last.r - first.r;
  const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <div className="rating-chart" data-testid="rating-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Rating from ${first.r} to ${last.r} over ${points.length - 1} rated games`}>
        <defs>
          <linearGradient id="rc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2fe6d6" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#2fe6d6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="rc-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8a5cff" />
            <stop offset="100%" stopColor="#2fe6d6" />
          </linearGradient>
        </defs>
        {geo.ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={geo.y(t)} y2={geo.y(t)} className="rc-grid" />
            <text x={pad.l - 6} y={geo.y(t) + 3.5} className="rc-tick" textAnchor="end">{t}</text>
          </g>
        ))}
        <path d={geo.area} fill="url(#rc-fill)" />
        <path d={geo.line} fill="none" stroke="url(#rc-line)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={geo.last.x} cy={geo.last.y} r="4.5" className="rc-dot" />
        <text x={pad.l} y={H - 5} className="rc-tick">{fmt(first.t)}</text>
        <text x={W - pad.r} y={H - 5} className="rc-tick" textAnchor="end">{fmt(last.t)}</text>
      </svg>
      <div className="rc-legend">
        <span>{points.length - 1} rated game{points.length === 2 ? '' : 's'}</span>
        <b className={diff >= 0 ? 'up' : 'down'}>{diff >= 0 ? '▲' : '▼'} {Math.abs(diff)}</b>
      </div>
    </div>
  );
}
