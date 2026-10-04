import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PriceAlert, SavedCart } from '@savesmart/shared';
import { Badge, Button, Card, EmptyState, SectionTitle, Skeleton, cx } from '../components/ui';
import { api } from '../lib/api';
import { platformName, rupees } from '../lib/format';

export function Alerts() {
  const [alerts, setAlerts] = useState<PriceAlert[] | null>(null);
  const [carts, setCarts] = useState<SavedCart[]>([]);
  const load = () => api.alerts().then(setAlerts).catch(() => setAlerts([]));

  useEffect(() => {
    load();
    api.savedCarts().then(setCarts).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Price alerts</h1>
        <p className="text-sm text-muted">Checked against the latest prices every time you open this page.</p>
      </div>

      {!alerts && <Skeleton className="h-32" />}
      {alerts?.length === 0 && (
        <EmptyState icon="🔔" title="No alerts yet">
          Open any product (tap its name in your cart or results) to get an alert when it gets cheaper, or set one for a whole saved basket below.
        </EmptyState>
      )}
      {alerts && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Card key={a.id} className={cx('flex items-center gap-3 p-4', a.triggered && 'border-brand')}>
              <span className="text-2xl" aria-hidden>
                {a.kind === 'basket' ? '🧺' : '🏷️'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {a.kind === 'product' && a.productId ? (
                    <Link to={`/product/${a.productId}`} className="hover:underline">
                      {a.label}
                    </Link>
                  ) : (
                    a.label
                  )}
                </p>
                <p className="text-sm text-muted">
                  Below {rupees(a.targetPrice)} · now {rupees(a.currentPrice)}
                  {a.currentPlatform && a.kind === 'product' ? ` on ${platformName(a.currentPlatform)}` : ''}
                </p>
              </div>
              {a.triggered ? <Badge tone="brand">✓ Price reached</Badge> : <Badge>Watching</Badge>}
              <button
                className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-2"
                aria-label={`Delete alert for ${a.label}`}
                onClick={() => api.deleteAlert(a.id).then(load).catch(() => {})}
              >
                ✕
              </button>
            </Card>
          ))}
        </div>
      )}

      <BasketAlertForm carts={carts} onCreated={load} />
    </div>
  );
}

function BasketAlertForm({ carts, onCreated }: { carts: SavedCart[]; onCreated: () => void }) {
  const [cartId, setCartId] = useState('');
  const [target, setTarget] = useState('800');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!cartId && carts[0]) setCartId(carts[0].id);
  }, [carts, cartId]);

  return (
    <section>
      <SectionTitle>Basket alert</SectionTitle>
      <Card className="p-5">
        {carts.length === 0 ? (
          <p className="text-sm text-muted">Save a cart first, then get notified when your regular basket's best total drops below a price.</p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              await api.createAlert({ kind: 'basket', savedCartId: cartId, targetPrice: Number(target) }).catch(() => {});
              setSaving(false);
              onCreated();
            }}
          >
            <p className="text-sm text-muted">Notify me when my regular basket falls below a total.</p>
            <select className="h-12 w-full rounded-2xl border border-line bg-bg px-3" value={cartId} onChange={(e) => setCartId(e.target.value)} aria-label="Saved cart">
              {carts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">₹</span>
                <input
                  className="tabular h-12 w-full rounded-2xl border border-line bg-bg pl-8"
                  inputMode="numeric"
                  value={target}
                  onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))}
                  aria-label="Target basket total"
                />
              </div>
              <Button type="submit" className="h-12" loading={saving} disabled={!cartId || !(Number(target) > 0)}>
                Set alert
              </Button>
            </div>
          </form>
        )}
      </Card>
    </section>
  );
}
