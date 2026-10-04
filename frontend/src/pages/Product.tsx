import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ProductPricesResponse } from '@savesmart/shared';
import { LocationChip } from '../components/LocationPicker';
import { PriceChart } from '../components/PriceChart';
import { PriceRow } from '../components/PriceInputs';
import { Button, Card, SourceBadge, EmptyState, LinkButton, SectionTitle, Skeleton, cx } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { platformName, productLabel, productSize, rupees } from '../lib/format';
import { useApp } from '../state/AppState';

export function Product() {
  const { id = '' } = useParams();
  const { prefs, addProduct, cart } = useApp();
  const [data, setData] = useState<ProductPricesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api
      .productPrices(id, prefs.location)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'Product not found' : "Couldn't load prices"));
  }, [id, prefs.location, version]);

  if (error) return <EmptyState icon="🔍" title={error} action={<LinkButton to="/compare">Back to cart</LinkButton>} />;
  if (!data || data.product.id !== id)
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );

  const p = data.product;
  const available = data.offers.filter((o) => o.status === 'available');
  const cheapest = available.reduce<(typeof available)[number] | null>((a, b) => (!a || b.price! < a.price! ? b : a), null);
  const highest = available.reduce<(typeof available)[number] | null>((a, b) => (!a || b.price! > a.price! ? b : a), null);
  const inCart = cart.some((l) => l.product.id === p.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-surface text-4xl" aria-hidden>
          {p.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold leading-tight">{productLabel(p)}</h1>
          <p className="text-sm text-muted">
            {productSize(p)} · {p.category}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SourceBadge source={data.dataSource} />
            <LocationChip className="min-h-8 text-xs" />
          </div>
        </div>
      </div>

      {cheapest && (
        <Card className="p-5">
          <p className="text-sm font-semibold text-muted">Cheapest right now</p>
          <p className="mt-1 text-3xl font-extrabold">
            {platformName(cheapest.platform)} — <span className="tabular">{rupees(cheapest.price)}</span>
          </p>
          {highest && highest.price! > cheapest.price! && <p className="mt-1 font-semibold text-save">You save {rupees(highest.price! - cheapest.price!)} vs {platformName(highest.platform)}</p>}
          <Button className="mt-4 w-full sm:w-auto" onClick={() => addProduct(p)} variant={inCart ? 'secondary' : 'primary'}>
            {inCart ? '✓ In your cart · add one more' : 'Add to cart'}
          </Button>
        </Card>
      )}

      <section>
        <SectionTitle>Prices by app</SectionTitle>
        <Card className="divide-y divide-line px-4">
          {data.offers.map((o) => (
            <PriceRow key={o.platform} product={p} platform={o.platform} offer={o} showPlatform onShared={() => setVersion((v) => v + 1)} />
          ))}
        </Card>
        <p className="mt-2 text-xs text-muted">Each price shows who saw it and when. Seeing something different? Share it and everyone nearby gets the update.</p>
      </section>

      <section>
        <SectionTitle>Price history</SectionTitle>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Today" value={data.summary.today} strong />
          <Tile label="Yesterday" value={data.summary.yesterday} />
          <Tile label="7 days ago" value={data.summary.sevenDaysAgo} />
          <Tile label="30-day avg" value={data.summary.thirtyDayAverage} />
        </div>
        <Card className="p-4">
          <PriceChart history={data.history} />
          <p className="mt-3 text-xs text-muted">Lowest price on any app in the last 30 days: {rupees(data.summary.thirtyDayLow)}.
            {data.dataSource === 'demo' ? ' Demo history.' : ' Built from prices seen each day; it fills in as more people share.'}</p>
        </Card>
      </section>

      <AlertForm productId={p.id} suggested={data.summary.thirtyDayLow ?? data.summary.today} name={productLabel(p)} />
    </div>
  );
}

function Tile({ label, value, strong }: { label: string; value: number | null; strong?: boolean }) {
  return (
    <div className={cx('rounded-2xl border border-line p-3', strong ? 'bg-brand-soft' : 'bg-surface')}>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="tabular text-lg font-bold">{rupees(value)}</p>
    </div>
  );
}

function AlertForm({ productId, suggested, name }: { productId: string; suggested: number | null; name: string }) {
  const [target, setTarget] = useState(suggested ? String(Math.floor(suggested)) : '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function save() {
    const value = Number(target);
    if (!(value > 0)) return;
    setState('saving');
    try {
      await api.createAlert({ kind: 'product', productId, targetPrice: value });
      setState('saved');
    } catch {
      setState('error');
    }
  }

  return (
    <Card className="p-5">
      <p className="font-bold">🔔 Price alert</p>
      <p className="mt-1 text-sm text-muted">Notify me when {name} falls below:</p>
      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">₹</span>
          <input
            className="tabular h-12 w-full rounded-2xl border border-line bg-bg pl-8 pr-3"
            inputMode="decimal"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value.replace(/[^\d.]/g, ''));
              setState('idle');
            }}
            aria-label="Target price in rupees"
          />
        </div>
        <Button className="h-12" onClick={save} loading={state === 'saving'} disabled={!(Number(target) > 0)}>
          {state === 'saved' ? '✓ Alert set' : 'Set alert'}
        </Button>
      </div>
      {state === 'error' && <p className="mt-2 text-sm text-danger">Couldn't create the alert. Please try again.</p>}
      {state === 'saved' && <p className="mt-2 text-sm text-muted">You'll see it on the Alerts tab. Push and email notifications are coming soon.</p>}
    </Card>
  );
}
