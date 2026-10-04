import { useEffect, useState } from 'react';
import { PLATFORMS, platformSearchUrl, type CatalogProduct, type PlatformId } from '@savesmart/shared';
import { productTitle } from '@savesmart/platform-adapters';
import { isStale, type FeeEntry } from '../local/priceBook';
import { usePriceBook } from '../local/usePriceBook';
import { timeAgo } from '../lib/format';
import { Button, PlatformTile, cx } from './ui';

const num = (s: string) => {
  const n = Number(s.replace(/[,₹\s]/g, ''));
  return s.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
};

/** One product on one app: open the app's search, type the price you see, or mark it out of stock. */
export function PriceRow({ product, platform, showPlatform }: { product: CatalogProduct; platform: PlatformId; showPlatform?: boolean }) {
  const book = usePriceBook();
  const entry = book.get(product.id, platform);
  const [value, setValue] = useState(entry?.available ? String(entry.price) : '');
  useEffect(() => setValue(entry?.available ? String(entry.price) : ''), [entry?.price, entry?.available]);
  const p = PLATFORMS[platform];

  function commit() {
    const n = num(value);
    if (n === null || n === 0) {
      if (value.trim() === '' && entry?.available) book.clear(product.id, platform);
      return;
    }
    if (n !== entry?.price || !entry.available) book.set(product.id, platform, { price: n, available: true });
  }

  const status = !entry ? 'Not checked' : !entry.available ? `Out of stock · ${timeAgo(entry.checkedAt)}` : `Checked ${timeAgo(entry.checkedAt)}`;
  const stale = entry && isStale(entry.checkedAt);
  const label = `${showPlatform ? p.shortName : productTitle(product)} price`;

  return (
    <div className="flex items-center gap-3 py-2.5">
      {showPlatform && <PlatformTile id={platform} size={32} />}
      <div className="min-w-0 flex-1">
        {showPlatform ? (
          <p className="text-sm font-semibold">{p.shortName}</p>
        ) : (
          <p className="truncate text-sm font-semibold">
            <span aria-hidden>{product.emoji} </span>
            {productTitle(product)}
          </p>
        )}
        <p className={cx('text-xs', stale ? 'font-semibold text-warn' : 'text-muted')}>
          {status}
          {stale ? ' · check again' : ''}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs font-semibold">
          <a className="text-brand underline-offset-2 hover:underline" href={platformSearchUrl(platform, productTitle(product))} target="_blank" rel="noopener noreferrer">
            Find on {p.shortName} ↗
          </a>
          {entry?.available !== false ? (
            <button className="text-muted hover:text-ink" onClick={() => book.set(product.id, platform, { price: entry?.price ?? 0, available: false })}>
              Out of stock
            </button>
          ) : (
            <button className="text-muted hover:text-ink" onClick={() => book.clear(product.id, platform)}>
              Clear
            </button>
          )}
        </div>
      </div>
      <label className={cx('flex h-11 w-28 shrink-0 items-center gap-1 rounded-2xl border bg-surface px-3 focus-within:border-brand', entry?.available === false ? 'border-line opacity-50' : 'border-line')}>
        <span className="text-muted">₹</span>
        <input
          inputMode="decimal"
          className="tabular w-full bg-transparent text-right font-semibold outline-none"
          placeholder="—"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          aria-label={label}
        />
      </label>
    </div>
  );
}

const FEE_FIELDS: { key: keyof Omit<FeeEntry, 'checkedAt'>; label: string; hint?: string }[] = [
  { key: 'deliveryFee', label: 'Delivery fee' },
  { key: 'freeDeliveryAbove', label: 'Free delivery above', hint: 'Leave empty if never free' },
  { key: 'handlingFee', label: 'Handling fee' },
  { key: 'platformFee', label: 'Platform fee' },
  { key: 'smallCartFee', label: 'Small-cart fee' },
  { key: 'smallCartBelow', label: 'Small-cart fee below' },
  { key: 'minOrderValue', label: 'Minimum order' },
];

/** The fees on an app's bill, copied once from its cart screen. */
export function FeeForm({ platform, onSaved }: { platform: PlatformId; onSaved?: () => void }) {
  const book = usePriceBook();
  const current = book.fees(platform);
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(FEE_FIELDS.map((f) => [f.key, current && current[f.key] !== null && current[f.key] !== undefined ? String(current[f.key]) : ''])),
  );
  const [saved, setSaved] = useState(false);

  function save() {
    const v = (k: string) => num(form[k] ?? '') ?? 0;
    book.setFees(platform, {
      deliveryFee: v('deliveryFee'),
      freeDeliveryAbove: num(form.freeDeliveryAbove ?? ''),
      handlingFee: v('handlingFee'),
      platformFee: v('platformFee'),
      smallCartFee: v('smallCartFee'),
      smallCartBelow: v('smallCartBelow'),
      minOrderValue: v('minOrderValue'),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved?.();
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Copy these from the bill on {PLATFORMS[platform].shortName}'s cart screen. {current ? `Last updated ${timeAgo(current.checkedAt)}.` : 'Until you add them, totals for this app leave fees out.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {FEE_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="text-xs font-semibold text-muted">{f.label}</span>
            <span className="mt-1 flex h-11 items-center gap-1 rounded-2xl border border-line bg-surface px-3 focus-within:border-brand">
              <span className="text-muted">₹</span>
              <input
                inputMode="decimal"
                className="tabular w-full bg-transparent outline-none"
                placeholder={f.hint ? '—' : '0'}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                aria-label={`${PLATFORMS[platform].shortName} ${f.label}`}
              />
            </span>
          </label>
        ))}
      </div>
      <Button className="mt-3 w-full" variant="secondary" onClick={save}>
        {saved ? '✓ Saved' : `Save ${PLATFORMS[platform].shortName} fees`}
      </Button>
    </div>
  );
}
