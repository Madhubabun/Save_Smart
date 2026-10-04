import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SavedCart } from '@savesmart/shared';
import { useCompareRunner } from '../components/CompareRunner';
import { Button, Card, EmptyState, LinkButton, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { rupees, timeAgo } from '../lib/format';
import { cartFromSaved, useApp } from '../state/AppState';

export function SavedCarts() {
  const [carts, setCarts] = useState<SavedCart[] | null>(null);
  const [error, setError] = useState(false);
  const { replaceCart, setSavedCartId } = useApp();
  const { run, running } = useCompareRunner();
  const navigate = useNavigate();

  const load = () =>
    api
      .savedCarts()
      .then(setCarts)
      .catch(() => setError(true));
  useEffect(() => {
    load();
  }, []);

  async function compareAgain(c: SavedCart) {
    const lines = cartFromSaved(c.items);
    replaceCart(lines);
    setSavedCartId(c.id);
    await run({ lines, savedCartId: c.id });
  }

  function edit(c: SavedCart) {
    replaceCart(cartFromSaved(c.items));
    setSavedCartId(c.id);
    navigate('/compare');
  }

  async function remove(c: SavedCart) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    await api.deleteSavedCart(c.id).catch(() => {});
    load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Saved carts</h1>
        <p className="text-sm text-muted">Your regular shopping, re-priced with today's prices in one tap.</p>
      </div>
      {error && <p className="text-sm text-danger">Couldn't load saved carts.</p>}
      {!carts && !error && (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}
      {carts?.length === 0 && (
        <EmptyState icon="⭐" title="No saved carts yet" action={<LinkButton to="/compare">Build a cart</LinkButton>}>
          Save carts like "Weekly Groceries" or "Breakfast" from your cart, then compare them again whenever you shop.
        </EmptyState>
      )}
      <div className="space-y-3">
        {carts?.map((c) => (
          <Card key={c.id} className="p-5 animate-rise">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{c.name}</h2>
                <p className="text-sm text-muted">
                  {c.items.length} items · {c.items.map((i) => i.product?.emoji).join(' ')}
                </p>
              </div>
              {c.lastTotal !== null && (
                <div className="text-right">
                  <p className="text-xs text-muted">Last best total</p>
                  <p className="tabular text-lg font-bold">{rupees(c.lastTotal)}</p>
                  <p className="text-xs text-muted">{timeAgo(c.lastComparedAt)}</p>
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => compareAgain(c)} loading={running} className="flex-1">
                Compare Again
              </Button>
              <Button variant="secondary" onClick={() => edit(c)}>
                Edit
              </Button>
              <Button variant="ghost" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}>
                🗑
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
