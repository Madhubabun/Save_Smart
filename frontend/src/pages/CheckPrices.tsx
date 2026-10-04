import { useMemo, useState } from 'react';
import { PLATFORMS, PLATFORM_IDS, type PlatformId } from '@savesmart/shared';
import { useCompareRunner } from '../components/CompareRunner';
import { FeeForm, PriceRow } from '../components/PriceInputs';
import { Button, Card, EmptyState, LinkButton, PlatformDot, cx } from '../components/ui';
import { isStale } from '../local/priceBook';
import { usePriceBook } from '../local/usePriceBook';
import { storage } from '../lib/storage';
import { useApp } from '../state/AppState';

/**
 * Step 2 of comparing: the user checks today's prices in each app.
 * SaveSmart never makes up a price; it compares only what was checked.
 */
export function CheckPrices() {
  const { cart } = useApp();
  const { run, running } = useCompareRunner();
  const book = usePriceBook();
  const [tab, setTab] = useState<PlatformId>(() => (storage.get('ss.checkTab') as PlatformId) || 'blinkit');
  const [showFees, setShowFees] = useState(false);
  const pick = (p: PlatformId) => {
    setTab(p);
    setShowFees(false);
    storage.set('ss.checkTab', p);
  };

  const products = useMemo(() => {
    const seen = new Set<string>();
    return cart.filter((l) => !seen.has(l.product.id) && seen.add(l.product.id)).map((l) => l.product);
  }, [cart]);

  if (!cart.length)
    return (
      <EmptyState icon="🛒" title="Your cart is empty" action={<LinkButton to="/compare">Build your cart</LinkButton>}>
        Add what you need, then check prices.
      </EmptyState>
    );

  const checked = (p: PlatformId) => products.filter((pr) => book.get(pr.id, p)).length;
  const priced = products.filter((pr) => PLATFORM_IDS.some((p) => book.get(pr.id, p)?.available)).length;
  const stale = products.filter((pr) => PLATFORM_IDS.some((p) => {
    const e = book.get(pr.id, p);
    return e && isStale(e.checkedAt);
  })).length;
  const missing = products.length - priced;
  const fees = book.fees(tab);

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-28">
      <div>
        <p className="text-sm font-semibold text-brand">Step 2 of 2</p>
        <h1 className="text-2xl font-extrabold tracking-tight">Check today's prices</h1>
        <p className="mt-1 text-[15px] text-muted">
          Open each app, find the item and type the price you see. SaveSmart remembers it, so next time you only update what changed. The more apps you check, the more you can save.
        </p>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="tablist" aria-label="Apps">
        {PLATFORM_IDS.map((p) => {
          const n = checked(p);
          return (
            <button
              key={p}
              role="tab"
              aria-selected={tab === p}
              onClick={() => pick(p)}
              className={cx(
                'flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold',
                tab === p ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface',
              )}
            >
              <PlatformDot id={p} />
              {PLATFORMS[p].shortName}
              <span className={cx('tabular rounded-full px-1.5 text-xs', n === products.length ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted')}>
                {n}/{products.length}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <a
            className="font-bold text-brand underline-offset-2 hover:underline"
            href={PLATFORMS[tab].websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open {PLATFORMS[tab].name} ↗
          </a>
          <button className="text-sm font-semibold text-muted underline" onClick={() => setShowFees((v) => !v)} aria-expanded={showFees}>
            {fees ? 'Edit fees' : 'Add fees'}
          </button>
        </div>
        {!fees && !showFees && <p className="mt-1 text-xs text-warn">Fees not added yet: totals for {PLATFORMS[tab].shortName} won't include delivery or handling fees.</p>}
        {showFees && (
          <div className="mt-3 border-t border-line pt-3">
            <FeeForm platform={tab} onSaved={() => setShowFees(false)} />
          </div>
        )}
        <div className="mt-2 divide-y divide-line">
          {products.map((pr) => (
            <PriceRow key={pr.id} product={pr} platform={tab} />
          ))}
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur-md md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto max-w-2xl">
          <p className="mb-2 text-center text-xs text-muted">
            {priced === 0
              ? 'Enter at least one price to compare.'
              : missing > 0
                ? `${missing} item${missing > 1 ? 's have' : ' has'} no price yet and will be left out.`
                : stale > 0
                  ? `${stale} item${stale > 1 ? 's were' : ' was'} checked over 2 days ago. Prices may have changed.`
                  : 'All items have a price. Ready to compare.'}
          </p>
          <Button size="lg" className="w-full text-[17px]" disabled={priced === 0} onClick={() => run()} loading={running}>
            {(() => {
              const n = PLATFORM_IDS.filter((p) => checked(p) > 0).length;
              return n >= 2 ? `Compare ${n} apps` : 'See my total';
            })()}
          </Button>
        </div>
      </div>
    </div>
  );
}
