import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FeedFees, FeedListing } from '@savesmart/platform-adapters';
import { DEMO_CATALOG_BY_ID } from '@savesmart/platform-adapters';
import { createServices } from '../backend/src/app.js';
import { loadConfig } from '../backend/src/config.js';
import { MemoryStore } from '../backend/src/store/memoryStore.js';

/** A stand-in licensed feed that speaks SaveSmart's price-feed contract. */
const LISTINGS: Record<string, FeedListing[]> = {
  blinkit: [{ id: 'b1', name: 'Taaza Toned Milk', brand: 'Amul', pack: '1 L', price: 54, mrp: 56, stock: 'in_stock', observed_at: '2026-10-04T06:00:00Z' }],
  zepto: [{ id: 'z1', name: 'Amul Taaza Toned Fresh Milk', brand: 'Amul', pack: '1 ltr', price: 50, mrp: 56, stock: 'in_stock', observed_at: '2026-10-04T06:05:00Z' }],
  instamart: [{ id: 'i1', name: 'Taaza Toned Milk', brand: 'Amul', pack: '500 ml', price: 27, mrp: 28, stock: 'in_stock', observed_at: '2026-10-04T06:01:00Z' }],
  bigbasket: [],
};
const FEES: FeedFees = {
  delivery_fee: 30,
  free_delivery_above: 199,
  platform_fee: 2,
  handling_fee: 4,
  small_cart_fee: 0,
  small_cart_below: 0,
  surge_fee: 0,
  min_order_value: 0,
  observed_at: '2026-10-04T06:00:00Z',
};

let server: Server;
let base = '';
const seen: { path: string; auth: string | undefined; platform: string | null }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    seen.push({ path: url.pathname, auth: req.headers.authorization, platform: url.searchParams.get('platform') });
    const platform = url.searchParams.get('platform')!;
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer test-key') return res.writeHead(401).end('{}');
    if (url.pathname === '/serviceability') return res.end(JSON.stringify({ serviceable: platform !== 'bigbasket' }));
    if (url.pathname === '/fees') return res.end(JSON.stringify(FEES));
    if (url.pathname === '/listings') return res.end(JSON.stringify({ listings: LISTINGS[platform] ?? [] }));
    res.writeHead(404).end('{}');
  });
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('Licensed price feed', () => {
  it('requires a URL and key, and https outside local development', () => {
    expect(() => loadConfig({ PRICE_SOURCE: 'feed' })).toThrow(/PRICE_FEED_URL/);
    expect(() => loadConfig({ PRICE_FEED_URL: 'http://feed.example.com', PRICE_FEED_KEY: 'k' })).toThrow(/https/);
    expect(loadConfig({ PRICE_FEED_URL: 'https://feed.example.com', PRICE_FEED_KEY: 'k' }).priceSource).toBe('feed');
    expect(loadConfig({}).priceSource).toBe('community');
    expect(loadConfig({ PRICE_SOURCE: 'demo' }).priceSource).toBe('demo');
  });

  it('compares live prices from the feed, with fees, and labels them live', async () => {
    const config = { ...loadConfig({ PRICE_FEED_URL: base, PRICE_FEED_KEY: 'test-key' }), serveFrontend: false };
    const s = createServices(config, new MemoryStore());
    const milk = DEMO_CATALOG_BY_ID.get('amul-taaza-1l')!;
    const r = await s.comparison.compare({
      items: [{ product: milk, quantity: 2 }],
      location: { city: 'Bengaluru', area: 'Whitefield', pincode: '560066' },
      preference: 'balanced',
      memberships: [],
    });
    expect(r.dataSource).toBe('live');
    const offers = r.items[0].offers;
    expect(offers.zepto).toMatchObject({ status: 'available', price: 50 });
    expect(offers.blinkit).toMatchObject({ status: 'available', price: 54 });
    // Instamart only has 500 ml: two packs make one litre, and it is labelled.
    expect(offers.instamart).toMatchObject({ status: 'available', price: 54, packNote: '2 × 500 ml' });
    expect(r.platforms.find((p) => p.platform.id === 'bigbasket')!.status).toBe('not_serviceable');
    // Zepto: 2 × ₹50 = ₹100, below free delivery at ₹199, so ₹30 + ₹2 + ₹4 in fees.
    expect(r.result.recommended).toMatchObject({ total: 136, platforms: ['zepto'] });
    expect(seen.every((x) => x.auth === 'Bearer test-key')).toBe(true);
  });

  it('falls back to community prices when the feed fails', async () => {
    const config = { ...loadConfig({ PRICE_FEED_URL: base, PRICE_FEED_KEY: 'wrong' }), serveFrontend: false };
    const s = createServices(config, new MemoryStore());
    const r = await s.comparison.compare({
      items: [{ product: DEMO_CATALOG_BY_ID.get('amul-taaza-1l')!, quantity: 1 }],
      location: { city: 'Bengaluru', area: '', pincode: '560066' },
      preference: 'balanced',
      memberships: [],
    });
    // The feed rejects the key; with no community reports yet there is simply no price, never a made-up one.
    expect(r.platforms.every((p) => p.status === 'ok')).toBe(true);
    expect(Object.values(r.items[0].offers).every((o) => o.status === 'not_listed')).toBe(true);
    expect(r.result.recommended).toBeNull();
    expect(r.result.unavailableItemIds).toHaveLength(1);
  });
});
