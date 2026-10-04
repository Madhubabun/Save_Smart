import { useCallback, useEffect, useMemo, useState } from 'react';
import { PLATFORMS, PLATFORM_IDS, type PlatformId } from '@savesmart/shared';
import { useCompareRunner } from '../components/CompareRunner';
import { FeeForm, PriceRow } from '../components/PriceInputs';
import { Button, Card, EmptyState, LinkButton, PlatformDot, Skeleton, cx } from '../components/ui';
import { api, type PriceLookup } from '../lib/api';
import { storage } from '../lib/storage';
import { useApp } from '../state/AppState';

/**
 * Fill in prices: for items nobody nearby has a recent price for, anyone can
 * share what they see in an app. Each share fills the gap for everyone in the area.
 */
export function CheckPrices() {
  const { cart, prefs } = useApp();
  const { run, running } = useCompareRunner();
  const [tab, setTab] = useState<PlatformId>(() => (storage.get('ss.checkTab') as PlatformId) || 'blinkit');
  const [lookup, setLookup] = useState<PriceLookup | null>(null);
  const [showFees, setShowFees] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(true);

  const products = useMemo(() => {
    const seen = new Set<string>();
    return cart.filter((l) => !seen.has(l.product.id) && seen.add(l.product.id)).map((l) => l.product);
  }, [cart]);

  const load = useCallback(() => {
    if (products.length) api.prices(products.map((p) => p.id), prefs.location).then(setLookup).catch(() => {});
  }, [products, prefs.location]);
  useEffect(load, [load]);

  if (!cart.length)
    return (
      <EmptyState icon="🛒" title="Your cart is empty" action={<LinkButton to="/compare">Build your cart</LinkButton>}>
        Add what you need first.
      </EmptyState>
    );

  const offer = (productId: string, p: PlatformId) => lookup?.offers[productId]?.find((o) => o.platform === p);
  const known = (p: PlatformId) => products.filter((pr) => offer(pr.id, p) && offer(pr.id, p)!.status !== 'not_listed').length;
  const missingHere = products.filter((pr) => !offer(pr.id, tab) || offer(pr.id, tab)!.status === 'not_listed');
  const shown = onlyMissing && missingHere.length ? missingHere : products;
  const fees = lookup?.fees[tab];
  const pick = (p: PlatformId) => {
    setTab(p);
    setShowFees(false);
    storage.set('ss.checkTab', p);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-28">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Fill in missing prices</h1>
        <p className="mt-1 text-[15px] text-muted">
          These items have no recent price near {prefs.location.area || prefs.location.city}. If you have an app open, share what you see. It takes a few seconds and fills the gap for everyone nearby, and their shares fill yours.
        </p>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="tablist" aria-label="Apps">
        {PLATFORM_IDS.map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={tab === p}
            onClick={() => pick(p)}
            className={cx('flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold', tab === p ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface')}
          >
            <PlatformDot id={p} />
            {PLATFORMS[p].shortName}
            {lookup && (
              <span className={cx('tabular rounded-full px-1.5 text-xs', known(p) === products.length ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted')}>
                {known(p)}/{products.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {!lookup ? (
        <Skeleton className="h-64" />
      ) : (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
              Only items without a price ({missingHere.length})
            </label>
            <button className="text-sm font-semibold text-brand underline" onClick={() => setShowFees((v) => !v)} aria-expanded={showFees}>
              {fees?.known ? `${PLATFORMS[tab].shortName} fees` : `Add ${PLATFORMS[tab].shortName} fees`}
            </button>
          </div>
          {!fees?.known && !showFees && <p className="mt-1 text-xs text-warn">Nobody nearby has shared {PLATFORMS[tab].shortName}'s fees yet, so its totals leave them out.</p>}
          {showFees && (
            <div className="mt-3 border-t border-line pt-3">
              <FeeForm key={tab} platform={tab} current={fees?.fees ?? null} onShared={load} />
            </div>
          )}
          <div className="mt-1 divide-y divide-line">
            {shown.map((pr) => (
              <PriceRow key={`${tab}-${pr.id}`} product={pr} platform={tab} offer={offer(pr.id, tab)} onShared={load} />
            ))}
          </div>
          {onlyMissing && missingHere.length === 0 && <p className="py-3 text-center text-sm text-muted">Every item has a recent {PLATFORMS[tab].shortName} price. 🎉</p>}
        </Card>
      )}

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur-md md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto max-w-2xl">
          <Button size="lg" className="w-full text-[17px]" onClick={() => run({ replace: true })} loading={running}>
            Compare again
          </Button>
        </div>
      </div>
    </div>
  );
}
