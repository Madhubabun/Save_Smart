import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ComparisonSummary, PriceAlert } from '@savesmart/shared';
import { api } from '../lib/api';
import { platformName, rupees } from '../lib/format';
import { useApp } from '../state/AppState';
import { Card, PlatformDot, SectionTitle } from './ui';

/** Home-screen shortcuts for returning users: unfinished cart, price drops, recent plans. Hidden for first-time visitors. */
export function ForYou() {
  const { cart } = useApp();
  const [recent, setRecent] = useState<ComparisonSummary[]>([]);
  const [hits, setHits] = useState<PriceAlert[]>([]);

  useEffect(() => {
    api.recentComparisons().then(setRecent).catch(() => {});
    api
      .alerts()
      .then((a) => setHits(a.filter((x) => x.active && x.triggered)))
      .catch(() => {});
  }, []);

  if (cart.length === 0 && recent.length === 0 && hits.length === 0) return null;
  const units = cart.reduce((a, l) => a + l.quantity, 0);

  return (
    <section className="space-y-3 animate-rise">
      <SectionTitle>Pick up where you left off</SectionTitle>

      {hits.length > 0 && (
        <Link to="/alerts" className="block min-w-0">
          <Card className="flex items-center gap-3 border-brand bg-brand-soft p-4">
            <span className="text-2xl" aria-hidden>
              🔔
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-brand-strong">
                {hits.length === 1 ? 'A price alert was reached' : `${hits.length} price alerts were reached`}
              </p>
              <p className="truncate text-sm text-muted">
                {hits
                  .slice(0, 2)
                  .map((h) => `${h.label} now ${h.currentPrice !== null ? rupees(h.currentPrice) : ''}${h.currentPlatform ? ` on ${platformName(h.currentPlatform)}` : ''}`)
                  .join(' · ')}
              </p>
            </div>
            <span aria-hidden>›</span>
          </Card>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {cart.length > 0 && (
          <Link to="/compare" className="block min-w-0">
            <Card className="flex h-full items-center gap-3 p-4 hover:border-brand">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-xl" aria-hidden>
                🛒
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">Continue your cart</p>
                <p className="truncate text-sm text-muted">
                  {units} {units === 1 ? 'item' : 'items'}: {cart.slice(0, 3).map((l) => l.product.name).join(', ')}
                  {cart.length > 3 ? '…' : ''}
                </p>
              </div>
              <span aria-hidden>›</span>
            </Card>
          </Link>
        )}
        {recent.slice(0, cart.length > 0 ? 3 : 4).map((c) => (
          <Link key={c.id} to={`/results/${c.id}`} className="block min-w-0">
            <Card className="flex h-full items-center gap-3 p-4 hover:border-brand">
              <div className="flex shrink-0 -space-x-1" aria-hidden>
                {c.platforms.map((p) => (
                  <PlatformDot key={p} id={p} className="ring-2 ring-surface" />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {c.total !== null ? rupees(c.total) : 'No plan'}{' '}
                  <span className="text-sm font-medium text-muted">
                    · {c.itemCount} {c.itemCount === 1 ? 'product' : 'products'}
                  </span>
                </p>
                <p className="truncate text-sm text-muted">
                  {ago(c.createdAt)} · {c.platforms.map(platformName).join(' + ') || c.location.area}
                  {c.purchased ? ' · opened' : ''}
                </p>
              </div>
              {c.savings > 0 && <span className="tabular shrink-0 text-sm font-bold text-save">−{rupees(c.savings)}</span>}
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
