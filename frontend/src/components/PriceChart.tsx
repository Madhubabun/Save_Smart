import { useEffect, useMemo, useRef, useState } from 'react';
import { PLATFORMS, type PlatformId, type PricePoint } from '@savesmart/shared';
import { rupees } from '../lib/format';

/**
 * 30-day price history, one line per platform. Platform identity is carried by
 * colour AND dash pattern AND a direct end label, so it never relies on colour
 * alone (the platform hues are close for some colour-vision types).
 */
const DASH: Record<PlatformId, string | undefined> = { blinkit: undefined, zepto: '6 4', instamart: '2 3', bigbasket: '10 3 2 3' };

export function PriceChart({ history }: { history: Record<PlatformId, PricePoint[]> }) {
  const series = (Object.entries(history) as [PlatformId, PricePoint[]][]).filter(([, pts]) => pts.length > 1);
  const dates = useMemo(() => [...new Set(series.flatMap(([, pts]) => pts.map((p) => p.date)))].sort(), [series]);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Draw in real pixels so text stays readable on phones instead of scaling down.
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!series.length || dates.length < 2) return <p className="text-sm text-muted">Not enough history yet.</p>;

  const H = W < 480 ? 200 : 240;
  const pad = { l: 40, r: 76, t: 12, b: 26 };
  const all = series.flatMap(([, pts]) => pts.map((p) => p.price));
  const lo = Math.floor(Math.min(...all) * 0.97);
  const hi = Math.ceil(Math.max(...all) * 1.03);
  const x = (i: number) => pad.l + (i / (dates.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const idx = new Map(dates.map((d, i) => [d, i]));

  // Direct end labels, nudged apart so they never collide.
  const ends = series
    .map(([id, pts]) => ({ id, v: pts[pts.length - 1].price, y: y(pts[pts.length - 1].price) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (dates.length - 1));
    setHover(Math.max(0, Math.min(dates.length - 1, i)));
  }

  const hoverDate = hover !== null ? dates[hover] : null;
  const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <figure>
      <div className="relative" ref={boxRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-pan-y select-none"
          role="img"
          aria-label="Price history for the last 30 days by platform"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--muted)" className="tabular">
                ₹{t}
              </text>
            </g>
          ))}
          <text x={pad.l} y={H - 6} fontSize="12" fill="var(--muted)">
            {fmtDate(dates[0])}
          </text>
          <text x={W - pad.r} y={H - 6} fontSize="12" fill="var(--muted)" textAnchor="end">
            Today
          </text>
          {series.map(([id, pts]) => (
            <path
              key={id}
              d={pts.map((p, i) => `${i ? 'L' : 'M'}${x(idx.get(p.date)!).toFixed(1)},${y(p.price).toFixed(1)}`).join('')}
              fill="none"
              stroke={`var(--pf-${id})`}
              strokeWidth={2}
              strokeDasharray={DASH[id]}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {ends.map((e) => (
            <text key={e.id} x={W - pad.r + 8} y={e.y + 4} fontSize="12" fill="var(--ink)" fontWeight={600}>
              {PLATFORMS[e.id].shortName}
            </text>
          ))}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
              {series.map(([id, pts]) => {
                const p = pts.find((q) => q.date === hoverDate);
                return p ? <circle key={id} cx={x(hover)} cy={y(p.price)} r={4.5} fill={`var(--pf-${id})`} stroke="var(--surface)" strokeWidth={2} /> : null;
              })}
            </g>
          )}
        </svg>
        {hover !== null && hoverDate && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-xl border border-line bg-surface p-2.5 text-xs shadow-lg"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > dates.length / 2 ? '-105%' : '5%'})` }}
          >
            <p className="mb-1 font-semibold">{fmtDate(hoverDate)}</p>
            {series.map(([id, pts]) => {
              const p = pts.find((q) => q.date === hoverDate);
              return (
                <p key={id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted">
                    <span className="inline-block h-0.5 w-3" style={{ background: `var(--pf-${id})` }} />
                    {PLATFORMS[id].shortName}
                  </span>
                  <span className="tabular font-semibold text-ink">{p ? rupees(p.price) : '—'}</span>
                </p>
              );
            })}
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {series.map(([id]) => (
          <span key={id} className="inline-flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden>
              <line x1="1" x2="21" y1="3" y2="3" stroke={`var(--pf-${id})`} strokeWidth="2" strokeDasharray={DASH[id]} />
            </svg>
            {PLATFORMS[id].shortName}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
