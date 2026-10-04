import { afterAll, describe, expect, it } from 'vitest';
import { PgStore } from '../backend/src/store/pgStore.js';
import { hashToken } from '../backend/src/http/middleware.js';

/**
 * Runs against a real PostgreSQL with database/schema.sql applied and the seed loaded:
 *   TEST_DATABASE_URL=postgres://... npm test
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PgStore (PostgreSQL)', () => {
  const store = url ? new PgStore(url) : null!;
  afterAll(() => store?.close());

  it('round-trips users, preferences, saved carts, alerts, comparisons and snapshots', async () => {
    const tokenHash = hashToken(`test-${Date.now()}-${Math.random()}`);
    const user = await store.createUser(tokenHash);
    expect((await store.findUserByTokenHash(tokenHash))?.id).toBe(user.id);

    await store.setPreferences(user.id, { preference: 'max_savings', location: { city: 'Mumbai', area: 'Powai', pincode: '400076' }, memberships: ['zepto'], maxOrders: 2 });
    expect(await store.getPreferences(user.id)).toMatchObject({ preference: 'max_savings', memberships: ['zepto'], maxOrders: 2 });

    const cart = await store.createSavedCart(user.id, 'Weekly Groceries', [
      { productId: 'amul-taaza-1l', quantity: 2 },
      { productId: 'onion-1kg', quantity: 1 },
    ]);
    expect(cart.items).toEqual([
      { productId: 'amul-taaza-1l', quantity: 2 },
      { productId: 'onion-1kg', quantity: 1 },
    ]);
    const renamed = await store.updateSavedCart(user.id, cart.id, { name: 'Weekly', items: [{ productId: 'potato-1kg', quantity: 3 }], lastTotal: 123.5 });
    expect(renamed).toMatchObject({ name: 'Weekly', lastTotal: 123.5, items: [{ productId: 'potato-1kg', quantity: 3 }] });

    const alert = await store.createAlert({ userId: user.id, kind: 'basket', productId: null, savedCartId: cart.id, targetPrice: 800 });
    expect((await store.listAlerts(user.id)).map((a) => a.id)).toEqual([alert.id]);

    const id = crypto.randomUUID();
    await store.saveComparison({ id, userId: user.id, savedCartId: cart.id, createdAt: new Date().toISOString(), purchasedAt: null, sample: false, recommendedTotal: 645, savings: 35, orderCount: 2, platforms: ['zepto', 'blinkit'], response: null });
    expect(await store.listPurchasedComparisons(user.id)).toHaveLength(0);
    await store.markPurchased(user.id, id);
    expect(await store.listPurchasedComparisons(user.id)).toMatchObject([{ id, savings: 35, orderCount: 2 }]);

    await store.recordPrices([{ productId: 'amul-taaza-1l', platform: 'zepto', pincode: '560066', price: 49, mrp: 56, date: '2026-10-04' }]);
    expect(await store.priceSnapshots('amul-taaza-1l', '560066', '2026-10-01')).toMatchObject([{ price: 49, platform: 'zepto' }]);

    expect(await store.deleteSavedCart(user.id, cart.id)).toBe(true);
    expect(await store.listAlerts(user.id)).toHaveLength(0);
  });
});
