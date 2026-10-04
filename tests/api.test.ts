import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, ComparisonResponse, CreateCartResponse, PriceAlert, ProductPricesResponse, SavedCart, SavingsSummary } from '@savesmart/shared';
import { createApp, createServices } from '../backend/src/app.js';
import { loadConfig } from '../backend/src/config.js';
import { MemoryStore } from '../backend/src/store/memoryStore.js';

let server: Server;
let base = '';
let token = '';

async function call<T>(method: string, path: string, body?: unknown, auth = true): Promise<{ status: number; json: ApiResponse<T> }> {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as ApiResponse<T> };
}

function data<T>(r: { json: ApiResponse<T> }): T {
  if (!r.json.ok) throw new Error(`API error: ${r.json.error.code} ${r.json.error.message}`);
  return r.json.data;
}

beforeAll(async () => {
  const config = { ...loadConfig({}), demoLatencyMs: 0, rateLimitPerMinute: 10_000, compareRateLimitPerMinute: 10_000, serveFrontend: false };
  const app = createApp(config, createServices(config, new MemoryStore()), { log: false });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  token = data(await call<{ token: string }>('POST', '/session', undefined, false)).token;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const MVP_LIST = 'Milk 2\nBread 1\nEggs 12\nTomatoes 1kg\nRice 5kg\nBiscuits 2';

describe('SaveSmart API: MVP flow', () => {
  let comparison: ComparisonResponse;

  it('creates a cart from a pasted list', async () => {
    const cart = data(await call<CreateCartResponse>('POST', '/cart', { text: MVP_LIST }));
    expect(cart.items).toHaveLength(6);
    expect(cart.items.every((i) => i.product)).toBe(true);
  });

  it('compares the cart and finds a cheaper split than any single app', async () => {
    const cart = data(await call<CreateCartResponse>('POST', '/cart', { text: MVP_LIST }));
    const res = await call<ComparisonResponse>('POST', '/cart/compare', {
      items: cart.items.map((i) => ({ productId: i.product!.id, quantity: i.quantity })),
      location: { city: 'Bengaluru', area: 'Whitefield', pincode: '560066' },
      preference: 'balanced',
    });
    comparison = data(res);
    const r = comparison.result;
    expect(comparison.dataSource).toBe('demo');
    expect(comparison.platforms.every((p) => p.status === 'ok')).toBe(true);
    expect(r.cheapestSingle?.platform).toBe('bigbasket');
    expect(r.recommended?.orderCount).toBe(2);
    expect(r.recommended!.total).toBeLessThan(r.cheapestSingle!.plan!.total);
    expect(r.savings.amount).toBe(40);
    // Instamart has no 12-egg tray, so two 6-egg trays are used and labelled.
    expect(comparison.items.find((i) => i.product.id === 'white-eggs-12')!.offers.instamart.packNote).toBe('2 × 6 pcs');
  });

  it('records a purchase hand-off for the savings dashboard', async () => {
    data(await call('POST', `/comparisons/${comparison.id}/purchase`));
    const savings = data(await call<SavingsSummary>('GET', '/savings'));
    expect(savings.ordersOptimized).toBe(1);
    expect(savings.totalSaved).toBe(40);
  });

  it('keeps going when a platform fails', async () => {
    const res = await call<ComparisonResponse>('POST', '/cart/compare', {
      items: [{ productId: 'amul-taaza-1l', quantity: 2 }, { productId: 'onion-1kg', quantity: 1 }],
      preference: 'max_savings',
      simulateFailures: ['blinkit'],
    });
    const c = data(res);
    expect(c.platforms.find((p) => p.platform.id === 'blinkit')!.status).toBe('error');
    expect(c.notices[0].title).toBe("Blinkit prices couldn't be retrieved");
    expect(c.notices[0].message).toBe('Continuing with Zepto, Instamart, BigBasket.');
    expect(c.result.recommended).not.toBeNull();
    expect(c.result.recommended!.platforms).not.toContain('blinkit');
  });

  it('reports platforms that do not serve a location', async () => {
    const c = data(
      await call<ComparisonResponse>('POST', '/cart/compare', {
        items: [{ productId: 'onion-1kg', quantity: 1 }],
        location: { city: 'Pune', area: 'Kothrud', pincode: '411038' },
        preference: 'balanced',
      }),
    );
    expect(c.platforms.find((p) => p.platform.id === 'instamart')!.status).toBe('not_serviceable');
  });
});

describe('SaveSmart API: other endpoints', () => {
  it('searches products', async () => {
    const res = await fetch(`${base}/api/products/search?q=amul%20gold`);
    const json = (await res.json()) as ApiResponse<{ id: string }[]>;
    expect(json.ok && json.data[0].id).toBe('amul-gold-1l');
  });

  it('returns product prices with history', async () => {
    const res = await fetch(`${base}/api/products/amul-taaza-1l/prices?pincode=560066`);
    const json = (await res.json()) as ApiResponse<ProductPricesResponse>;
    if (!json.ok) throw new Error('failed');
    expect(json.data.offers).toHaveLength(4);
    expect(json.data.history.zepto).toHaveLength(30);
    expect(json.data.summary.today).toBe(49);
  });

  it('saves carts, compares again and creates alerts', async () => {
    const cart = data(await call<SavedCart>('POST', '/saved-carts', { name: 'Weekly Groceries', items: [{ productId: 'amul-taaza-1l', quantity: 2 }] }));
    expect(cart.items[0].product?.brand).toBe('Amul');
    data(await call<ComparisonResponse>('POST', '/cart/compare', { items: cart.items.map(({ productId, quantity }) => ({ productId, quantity })), preference: 'balanced', savedCartId: cart.id }));
    const [updated] = data(await call<SavedCart[]>('GET', '/saved-carts'));
    expect(updated.lastTotal).not.toBeNull();

    data(await call('POST', '/price-alerts', { kind: 'product', productId: 'amul-taaza-1l', targetPrice: 50 }));
    data(await call('POST', '/price-alerts', { kind: 'basket', savedCartId: cart.id, targetPrice: 50 }));
    const alerts = data(await call<PriceAlert[]>('GET', '/price-alerts'));
    const product = alerts.find((a) => a.kind === 'product')!;
    expect(product.currentPrice).toBe(49);
    expect(product.triggered).toBe(true);
    expect(alerts.find((a) => a.kind === 'basket')!.triggered).toBe(false);
  });

  it('validates input and hides internals in errors', async () => {
    const bad = await call('POST', '/cart/compare', { items: [{ productId: 'x', quantity: 0 }] });
    expect(bad.status).toBe(400);
    expect(!bad.json.ok && bad.json.error.code).toBe('invalid_request');
    const noAuth = await call('GET', '/saved-carts', undefined, false);
    expect(noAuth.status).toBe(401);
    const unknown = await call('GET', '/nope');
    expect(unknown.status).toBe(404);
  });

  it('rate limits per client', async () => {
    const config = { ...loadConfig({}), demoLatencyMs: 0, rateLimitPerMinute: 3, serveFrontend: false };
    const app = createApp(config, createServices(config, new MemoryStore()), { log: false });
    const s = app.listen(0);
    await new Promise((r) => s.once('listening', r));
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/health`;
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await fetch(url)).status);
    await new Promise<void>((r) => s.close(() => r()));
    expect(codes).toEqual([200, 200, 200, 429]);
  });
});
