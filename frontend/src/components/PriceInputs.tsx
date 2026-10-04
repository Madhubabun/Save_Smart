import { useState } from 'react';
import { PLATFORMS, formatSize, platformSearchUrl, type CatalogProduct, type FeeSchedule, type ItemOffer, type PlatformId } from '@savesmart/shared';
import { productTitle } from '@savesmart/platform-adapters';
import { api, ApiError, type FeeReportInput } from '../lib/api';
import { rupees, timeAgo } from '../lib/format';
import { useApp } from '../state/AppState';
import { Button, PlatformTile, cx } from './ui';

const num = (s: string) => {
  const n = Number(s.replace(/[,₹\s]/g, ''));
  return s.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
};

/** Prices older than this are worth refreshing. */
const STALE_MS = 24 * 3_600_000;

export function offerStatus(offer: ItemOffer | undefined): { text: string; tone: 'ok' | 'stale' | 'missing' } {
  if (!offer || offer.status === 'not_listed') return { text: 'No recent price', tone: 'missing' };
  const when = offer.lastUpdated ? timeAgo(offer.lastUpdated) : '';
  const who = offer.source === 'community' ? (offer.reports && offer.reports > 1 ? `${offer.reports} people` : 'a shopper') : offer.source === 'live' ? 'price feed' : '';
  const stale = !!offer.lastUpdated && Date.now() - new Date(offer.lastUpdated).getTime() > STALE_MS;
  if (offer.status === 'out_of_stock') return { text: `Out of stock · ${who} · ${when}`, tone: stale ? 'stale' : 'ok' };
  return { text: `${rupees(offer.price)} · ${who} · ${when}`, tone: stale ? 'stale' : 'ok' };
}

/**
 * One product on one app: shows the latest known price and lets the user share
 * what they see, so everyone nearby gets it automatically next time.
 */
export function PriceRow({ product, platform, offer, showPlatform, onShared }: { product: CatalogProduct; platform: PlatformId; offer?: ItemOffer; showPlatform?: boolean; onShared: () => void }) {
  const { prefs } = useApp();
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const p = PLATFORMS[platform];
  const status = offerStatus(offer);

  async function share(available: boolean) {
    const price = num(value);
    if (available && !price) return;
    setState('saving');
    setError(null);
    try {
      await api.reportPrice({ productId: product.id, platform, available, price: price ?? undefined, location: prefs.location });
      setValue('');
      setState('saved');
      onShared();
      setTimeout(() => setState('idle'), 1500);
    } catch (e) {
      setState('idle');
      setError(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
    }
  }

  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        {showPlatform ? <PlatformTile id={platform} size={32} /> : <span className="flex size-8 shrink-0 items-center justify-center text-xl" aria-hidden>{product.emoji}</span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {showPlatform ? (
              p.shortName
            ) : (
              <>
                {productTitle(product)} <span className="font-normal text-muted">{formatSize(product.size, product.packCount)}</span>
              </>
            )}
          </p>
          <p className={cx('text-xs', status.tone === 'missing' ? 'text-muted' : status.tone === 'stale' ? 'font-semibold text-warn' : 'text-muted')}>
            {status.text}
            {status.tone === 'stale' ? ' · may have changed' : ''}
          </p>
        </div>
        <a
          className="shrink-0 text-xs font-semibold text-brand underline-offset-2 hover:underline"
          href={platformSearchUrl(platform, productTitle(product))}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open ↗
        </a>
      </div>
      <form
        className="mt-2 flex items-center gap-2 pl-11"
        onSubmit={(e) => {
          e.preventDefault();
          share(true);
        }}
      >
        <label className="flex h-10 flex-1 items-center gap-1 rounded-xl border border-line bg-surface px-3 focus-within:border-brand">
          <span className="text-sm text-muted">₹</span>
          <input
            inputMode="decimal"
            className="tabular w-full bg-transparent text-sm outline-none"
            placeholder="Price you see"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={`${productTitle(product)} price on ${p.shortName}`}
          />
        </label>
        <Button size="sm" type="submit" disabled={!num(value)} loading={state === 'saving'}>
          {state === 'saved' ? '✓ Shared' : 'Share'}
        </Button>
        <button type="button" className="shrink-0 text-xs font-semibold text-muted hover:text-ink" onClick={() => share(false)}>
          Out of stock
        </button>
      </form>
      {error && <p className="mt-1 pl-11 text-xs text-danger">{error}</p>}
    </div>
  );
}

const FEE_FIELDS: { key: keyof FeeReportInput; label: string; optional?: boolean }[] = [
  { key: 'deliveryFee', label: 'Delivery fee' },
  { key: 'freeDeliveryAbove', label: 'Free delivery above', optional: true },
  { key: 'handlingFee', label: 'Handling fee' },
  { key: 'platformFee', label: 'Platform fee' },
  { key: 'smallCartFee', label: 'Small-cart fee' },
  { key: 'smallCartBelow', label: 'Small-cart fee below' },
  { key: 'minOrderValue', label: 'Minimum order' },
];

/** The fees on an app's bill, shared once so totals include them for everyone nearby. */
export function FeeForm({ platform, current, onShared }: { platform: PlatformId; current: FeeSchedule | null; onShared: () => void }) {
  const { prefs } = useApp();
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(FEE_FIELDS.map((f) => [f.key, current && current.feesSource !== 'unknown' && current[f.key] !== null ? String(current[f.key]) : ''])),
  );
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const v = (k: string) => num(form[k] ?? '') ?? 0;
    setState('saving');
    setError(null);
    try {
      await api.reportFees({
        platform,
        location: prefs.location,
        deliveryFee: v('deliveryFee'),
        freeDeliveryAbove: num(form.freeDeliveryAbove ?? ''),
        handlingFee: v('handlingFee'),
        platformFee: v('platformFee'),
        smallCartFee: v('smallCartFee'),
        smallCartBelow: v('smallCartBelow'),
        minOrderValue: v('minOrderValue'),
      });
      setState('saved');
      onShared();
    } catch (e) {
      setState('idle');
      setError(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted">Copy these from the bill on {PLATFORMS[platform].shortName}'s cart screen. Leave "free delivery above" empty if delivery is never free.</p>
      <div className="grid grid-cols-2 gap-2">
        {FEE_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="text-xs font-semibold text-muted">{f.label}</span>
            <span className="mt-1 flex h-11 items-center gap-1 rounded-2xl border border-line bg-surface px-3 focus-within:border-brand">
              <span className="text-muted">₹</span>
              <input
                inputMode="decimal"
                className="tabular w-full bg-transparent outline-none"
                placeholder={f.optional ? '—' : '0'}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                aria-label={`${PLATFORMS[platform].shortName} ${f.label}`}
              />
            </span>
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <Button className="mt-3 w-full" variant="secondary" onClick={save} loading={state === 'saving'}>
        {state === 'saved' ? '✓ Shared, thank you' : `Share ${PLATFORMS[platform].shortName} fees`}
      </Button>
    </div>
  );
}
