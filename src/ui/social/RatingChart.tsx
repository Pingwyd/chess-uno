import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RatingPoint } from '../../net/protocol';
import { Icon } from '../icons';

/** Rating over time (one point per rated game), drawn as an SVG line with a soft area fill. */
export function RatingChart({ points, height = 150 }: { points: RatingPoint[]; height?: number }) {
  // Draw at the real pixel width so ticks and labels keep their size on wide screens.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(320);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => { const w = Math.round(el.clientWidth); if (w > 0) setW(w); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [points.length < 2]);
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
  }, [points, H, W]);

  if (!geo) {
    return (
      <div className="rating-chart empty" data-testid="rating-chart">
        <span><Icon name="trend-up" size={28} /></span>
        <p>Play rated games to draw your rating chart.</p>
      </div>
    );
  }
  const first = points[0], last = points[points.length - 1];
  const diff = last.r - first.r;
  const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  // All games on one day would label both ends with the same date: label by game instead.
  const sameDay = fmt(first.t) === fmt(last.t);
  const games = points.length - 1;
  return (
    <div className="rating-chart" data-testid="rating-chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Rating from ${first.r} to ${last.r} over ${games} rated games`}>
        {geo.ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={geo.y(t)} y2={geo.y(t)} className="rc-grid" />
            <text x={pad.l - 6} y={geo.y(t) + 3.5} className="rc-tick" textAnchor="end">{t}</text>
          </g>
        ))}
        <path d={geo.area} className="rc-area" />
        <path d={geo.line} fill="none" className="rc-line" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={geo.last.x} cy={geo.last.y} r="4" className="rc-dot" />
        <text x={pad.l} y={H - 5} className="rc-tick">{sameDay ? 'Start' : fmt(first.t)}</text>
        <text x={W - pad.r} y={H - 5} className="rc-tick" textAnchor="end">{sameDay ? `Game ${games}` : fmt(last.t)}</text>
      </svg>
      <div className="rc-legend">
        <span>{games} rated game{games === 1 ? '' : 's'}{sameDay ? ` · ${fmt(last.t)}` : ''}</span>
        <b className={diff >= 0 ? 'up' : 'down'}>{diff >= 0 ? '+' : '−'}{Math.abs(diff)} since game 1</b>
      </div>
    </div>
  );
}
