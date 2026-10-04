import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiResponse, ComparisonResponse, ProductPricesResponse } from '@savesmart/shared';
import { createApp, createServices } from '../backend/src/app.js';
import { loadConfig } from '../backend/src/config.js';
import { aggregatePrice } from '../backend/src/services/community.js';
import { MemoryStore } from '../backend/src/store/memoryStore.js';
import type { PriceReport } from '../backend/src/store/types.js';

let server: Server;
let base = '';

async function session() {
  const res = await fetch(`${base}/api/session`, { method: 'POST' });
  return ((await res.json()) as { data: { token: string } }).data.token;
}

async function call<T>(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as ApiResponse<T> };
}
const data = <T>(r: { json: ApiResponse<T> }) => {
  if (!r.json.ok) throw new Error(r.json.error.message);
  return r.json.data;
};

const WHITEFIELD = { city: 'Bengaluru', area: 'Whitefield', pincode: '560066' };

beforeAll(async () => {
  const config = { ...loadConfig({}), rateLimitPerMinute: 10_000, compareRateLimitPerMinute: 10_000, serveFrontend: false };
  expect(config.priceSource).toBe('community');
  const app = createApp(config, createServices(config, new MemoryStore()), { log: false });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('Community prices', () => {
  it('has no prices until someone shares one, and never makes one up', async () => {
    const t = await session();
    const r = data(await call<ComparisonResponse>(t, 'POST', '/cart/compare', { items: [{ productId: 'amul-taaza-1l', quantity: 1 }], location: WHITEFIELD }));
    expect(r.dataSource).toBe('community');
    expect(r.result.recommended).toBeNull();
    expect(Object.values(r.items[0].offers).every((o) => o.status === 'not_listed')).toBe(true);
  });

  it('compares with prices and fees people shared nearby', async () => {
    const [a, b, c] = [await session(), await session(), await session()];
    const report = (t: string, platform: string, productId: string, price: number) =>
      call(t, 'POST', '/prices/report', { productId, platform, price, available: true, location: WHITEFIELD });
    // Three people report Zepto milk; one typo-ish outlier doesn't move the median.
    expect((await report(a, 'zepto', 'amul-taaza-1l', 50)).status).toBe(201);
    await report(b, 'zepto', 'amul-taaza-1l', 51);
    await report(c, 'zepto', 'amul-taaza-1l', 70);
    await report(a, 'blinkit', 'amul-taaza-1l', 56);
    await report(a, 'zepto', 'britannia-white-bread-400g', 40);
    await report(b, 'blinkit', 'britannia-white-bread-400g', 36);
    data(
      await call(a, 'POST', '/fees/report', {
        platform: 'zepto', deliveryFee: 25, freeDeliveryAbove: 99, handlingFee: 3, platformFee: 2, smallCartFee: 0, smallCartBelow: 0, minOrderValue: 0, location: WHITEFIELD,
      }),
    );

    const t = await session();
    const r = data(
      await call<ComparisonResponse>(t, 'POST', '/cart/compare', {
        items: [{ productId: 'amul-taaza-1l', quantity: 2 }, { productId: 'britannia-white-bread-400g', quantity: 1 }],
        location: WHITEFIELD,
        preference: 'max_savings',
      }),
    );
    const milk = r.items[0].offers;
    expect(milk.zepto).toMatchObject({ status: 'available', price: 51, source: 'community', reports: 3 });
    expect(milk.blinkit).toMatchObject({ status: 'available', price: 56 });
    expect(milk.instamart.status).toBe('not_listed');
    // Zepto: 2 × 51 + 40 = 142, above ₹99 so delivery is free, ₹5 in fees = ₹147.
    // Blinkit has no shared fees, so its total leaves them out and says so.
    expect(r.result.cheapestSingle?.platform).toBe('zepto');
    expect(r.result.singleOptions.find((o) => o.platform === 'zepto')?.plan?.total).toBe(147);
    const plat = r.result.recommended!.platforms;
    if (plat.includes('blinkit')) expect(r.notices.some((n) => /Blinkit fees not known/.test(n.title))).toBe(true);
  });

  it('uses each person once and only recent, nearby reports', () => {
    const base = { productId: 'x', platform: 'zepto' as const, city: 'Bengaluru', mrp: null, available: true };
    const now = Date.now();
    const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
    const reports: PriceReport[] = [
      { ...base, userId: 'u1', pincode: '560066', price: 50, reportedAt: at(1) },
      { ...base, userId: 'u1', pincode: '560066', price: 10, reportedAt: at(2) }, // older report by the same person: ignored
      { ...base, userId: 'u2', pincode: '560066', price: 52, reportedAt: at(3) },
      { ...base, userId: 'u3', pincode: '560066', price: 40, reportedAt: at(40) }, // more than a day older than the newest: dropped
      { ...base, userId: 'u4', pincode: '560001', price: 30, reportedAt: at(1) }, // another pincode: only used if nothing local
    ];
    expect(aggregatePrice(reports, '560066')).toMatchObject({ price: 51, reports: 2, available: true });
    expect(aggregatePrice(reports, '560034')!.reports).toBe(3);
    expect(aggregatePrice([{ ...base, userId: 'u5', pincode: '', price: 50, reportedAt: at(1), available: false }], '')!.available).toBe(false);
  });

  it('rejects prices that look like typos and needs a city', async () => {
    const t = await session();
    const bad = await call(t, 'POST', '/prices/report', { productId: 'amul-taaza-1l', platform: 'zepto', price: 5, available: true, location: WHITEFIELD });
    expect(bad.status).toBe(400);
    const unknown = await call(t, 'POST', '/prices/report', { productId: 'nope', platform: 'zepto', price: 50, available: true, location: WHITEFIELD });
    expect(unknown.status).toBe(404);
  });

  it('shows shared prices and history on the product page and in price lookups', async () => {
    const t = await session();
    const p = data(await call<ProductPricesResponse>(t, 'GET', `/products/amul-taaza-1l/prices?city=Bengaluru&pincode=560066`));
    expect(p.dataSource).toBe('community');
    expect(p.offers.find((o) => o.platform === 'zepto')?.price).toBe(51);
    expect(p.history.zepto.length).toBeGreaterThan(0);
    const lookup = data(await call<{ offers: Record<string, { platform: string; price?: number }[]>; fees: Record<string, { known: boolean }> }>(t, 'GET', '/prices?ids=amul-taaza-1l,britannia-white-bread-400g&city=Bengaluru&pincode=560066'));
    expect(lookup.offers['amul-taaza-1l'].find((o) => o.platform === 'blinkit')?.price).toBe(56);
    expect(lookup.fees.zepto.known).toBe(true);
    expect(lookup.fees.instamart.known).toBe(false);
  });
});
