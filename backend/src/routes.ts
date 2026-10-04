import { randomBytes, randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  PLATFORMS,
  PLATFORM_IDS,
  SHOPPING_PREFERENCES,
  round2,
  type ComparisonResponse,
  type PlatformId,
  type PriceAlert,
  type SavedCart,
  type SavingsSummary,
  type UserPreferences,
} from '@savesmart/shared';
import { DEFAULT_LOCATION } from '@savesmart/platform-adapters';
import { hashToken, parse, rateLimit, requireUser } from './http/middleware.js';
import { AppError, notFound, ok } from './http/respond.js';
import type { CatalogService } from './services/catalog.js';
import type { ComparisonService } from './services/comparison.js';
import { listLocations, resolveLocation } from './services/location.js';
import type { PriceService } from './services/prices.js';
import type { Store, StoredComparison, StoredSavedCart } from './store/types.js';

export interface Services {
  store: Store;
  catalog: CatalogService;
  comparison: ComparisonService;
  prices: PriceService;
}

// ---- Validation schemas ----
const platformId = z.enum(PLATFORM_IDS as [PlatformId, ...PlatformId[]]);
const preference = z.enum(SHOPPING_PREFERENCES as [UserPreferences['preference'], ...UserPreferences['preference'][]]);
const text = (max: number) => z.string().trim().max(max);
const locationSchema = z.object({
  city: text(60),
  area: text(80).default(''),
  pincode: z.string().trim().regex(/^([1-9][0-9]{5})?$/, 'Pincode must be 6 digits').default(''),
});
const cartItems = z.array(z.object({ productId: text(80).min(1), quantity: z.number().int().min(1).max(99) })).max(60);

const createCartSchema = z
  .object({
    text: text(4000).optional(),
    entries: z
      .array(z.object({ query: text(120).min(1), quantity: z.number().int().min(1).max(99).optional(), unit: text(12).optional(), productId: text(80).optional() }))
      .max(60)
      .optional(),
  })
  .refine((v) => v.text || v.entries?.length, 'Provide a shopping list or at least one item.');

const compareSchema = z.object({
  items: cartItems.min(1, 'Add at least one item to compare.'),
  location: locationSchema.optional(),
  preference: preference.default('balanced'),
  memberships: z.array(platformId).max(4).default([]),
  maxOrders: z.number().int().min(1).max(4).optional(),
  simulateFailures: z.array(platformId).max(4).default([]),
  savedCartId: z.string().uuid().optional(),
});

const preferencesSchema = z.object({
  preference,
  location: locationSchema,
  memberships: z.array(platformId).max(4).default([]),
  maxOrders: z.number().int().min(1).max(4).optional(),
});

const savedCartSchema = z.object({ name: text(60).min(1), items: cartItems.min(1) });
const savedCartPatch = z.object({ name: text(60).min(1).optional(), items: cartItems.min(1).optional() });

const alertSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('product'), productId: text(80).min(1), targetPrice: z.number().positive().max(100000) }),
  z.object({ kind: z.literal('basket'), savedCartId: z.string().uuid(), targetPrice: z.number().positive().max(1000000) }),
]);

const idParam = z.string().uuid();

export function createRoutes(s: Services, opts: { compareRateLimitPerMinute: number }): Router {
  const r = Router();
  const user = (req: Request) => req.user!;

  const prefsFor = async (userId: string): Promise<UserPreferences> =>
    (await s.store.getPreferences(userId)) ?? {
      preference: 'balanced',
      location: { city: DEFAULT_LOCATION.city, area: DEFAULT_LOCATION.area, pincode: DEFAULT_LOCATION.pincode },
      memberships: [],
    };

  const withProducts = (c: StoredSavedCart): SavedCart => ({
    id: c.id,
    name: c.name,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    lastComparedAt: c.lastComparedAt,
    lastTotal: c.lastTotal,
    items: c.items.map((i) => ({ ...i, product: s.catalog.get(i.productId) })),
  });

  const productsOf = (items: { productId: string; quantity: number }[]) =>
    items.map((i) => {
      const product = s.catalog.get(i.productId);
      if (!product) throw new AppError(400, 'unknown_product', `Unknown product: ${i.productId}`);
      return { product, quantity: i.quantity };
    });

  r.get('/health', (_req, res) => ok(res, { status: 'ok', store: s.store.kind }));

  // ---- Session (anonymous today; phone/OTP login would issue the same kind of token) ----
  r.post('/session', rateLimit(20, 'session'), async (_req, res) => {
    const token = randomBytes(32).toString('base64url');
    const u = await s.store.createUser(hashToken(token));
    ok(res, { token, userId: u.id }, 201);
  });

  // ---- Reference data ----
  r.get('/platforms', (_req, res) => {
    ok(res, PLATFORM_IDS.map((id) => ({ ...PLATFORMS[id], dataSource: 'demo' })));
  });

  r.get('/locations', (_req, res) => ok(res, listLocations()));

  r.get('/products/search', (req, res) => {
    const q = parse(text(120), req.query.q ?? '');
    const limit = parse(z.coerce.number().int().min(1).max(30).default(10), req.query.limit);
    ok(res, q.length < 2 ? [] : s.catalog.search(q, limit));
  });

  r.get('/products/:id', (req, res) => {
    const product = s.catalog.get(req.params.id);
    if (!product) throw notFound('Product');
    ok(res, product);
  });

  r.get('/products/:id/prices', async (req, res) => {
    const product = s.catalog.get(req.params.id);
    if (!product) throw notFound('Product');
    const loc = parse(locationSchema.partial(), req.query);
    const { location } = resolveLocation(loc);
    ok(res, await s.prices.productPrices(product, location));
  });

  // ---- Cart ----
  r.post('/cart', (req, res) => {
    const body = parse(createCartSchema, req.body);
    ok(res, { items: s.catalog.resolveCart(body) }, 201);
  });

  r.post('/cart/compare', requireUser, rateLimit(opts.compareRateLimitPerMinute, 'compare'), async (req, res) => {
    const body = parse(compareSchema, req.body);
    const prefs = await prefsFor(user(req).id);
    const { location, notice } = resolveLocation(body.location ?? prefs.location);
    const compared = await s.comparison.compare({
      items: productsOf(body.items),
      location,
      preference: body.preference,
      memberships: body.memberships,
      maxOrders: body.maxOrders,
      simulateFailures: body.simulateFailures,
    });
    const response: ComparisonResponse = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...compared,
      notices: notice ? [notice, ...compared.notices] : compared.notices,
    };
    const rec = response.result.recommended;
    let savedCartId: string | null = null;
    if (body.savedCartId) {
      const updated = await s.store.updateSavedCart(user(req).id, body.savedCartId, { lastComparedAt: response.createdAt, lastTotal: rec?.total ?? null });
      savedCartId = updated ? updated.id : null;
    }
    await s.store.saveComparison({
      id: response.id,
      userId: user(req).id,
      savedCartId,
      createdAt: response.createdAt,
      purchasedAt: null,
      sample: false,
      recommendedTotal: rec?.total ?? null,
      savings: response.result.savings.amount,
      orderCount: rec?.orderCount ?? 0,
      platforms: rec?.platforms ?? [],
      response,
    });
    ok(res, response);
  });

  r.get('/comparisons/:id', requireUser, async (req, res) => {
    const c = await s.store.getComparison(user(req).id, parse(idParam, req.params.id));
    if (!c?.response) throw notFound('Comparison');
    ok(res, c.response);
  });

  /** The user continued to a platform with this plan: counts towards "My Savings". SaveSmart never places orders. */
  r.post('/comparisons/:id/purchase', requireUser, async (req, res) => {
    const c = await s.store.markPurchased(user(req).id, parse(idParam, req.params.id));
    if (!c) throw notFound('Comparison');
    ok(res, { id: c.id, purchasedAt: c.purchasedAt });
  });

  // ---- Preferences ----
  r.get('/preferences', requireUser, async (req, res) => ok(res, await prefsFor(user(req).id)));

  r.put('/preferences', requireUser, async (req, res) => {
    const body = parse(preferencesSchema, req.body);
    const { location } = resolveLocation(body.location);
    const prefs: UserPreferences = { ...body, location: { ...location, area: body.location.area || location.area } };
    await s.store.setPreferences(user(req).id, prefs);
    ok(res, prefs);
  });

  // ---- Saved carts ----
  r.get('/saved-carts', requireUser, async (req, res) => ok(res, (await s.store.listSavedCarts(user(req).id)).map(withProducts)));

  r.post('/saved-carts', requireUser, async (req, res) => {
    const body = parse(savedCartSchema, req.body);
    productsOf(body.items);
    if ((await s.store.listSavedCarts(user(req).id)).length >= 50) throw new AppError(400, 'limit_reached', 'You can save up to 50 carts.');
    ok(res, withProducts(await s.store.createSavedCart(user(req).id, body.name, body.items)), 201);
  });

  r.put('/saved-carts/:id', requireUser, async (req, res) => {
    const body = parse(savedCartPatch, req.body);
    if (body.items) productsOf(body.items);
    const updated = await s.store.updateSavedCart(user(req).id, parse(idParam, req.params.id), body);
    if (!updated) throw notFound('Saved cart');
    ok(res, withProducts(updated));
  });

  r.delete('/saved-carts/:id', requireUser, async (req, res) => {
    if (!(await s.store.deleteSavedCart(user(req).id, parse(idParam, req.params.id)))) throw notFound('Saved cart');
    ok(res, { deleted: true });
  });

  // ---- Price alerts ----
  r.get('/price-alerts', requireUser, async (req, res) => {
    const u = user(req);
    const prefs = await prefsFor(u.id);
    const { location } = resolveLocation(prefs.location);
    const alerts = await s.store.listAlerts(u.id);
    const evaluated = await Promise.all(
      alerts.map(async (a): Promise<PriceAlert> => {
        let currentPrice: number | null = null;
        let currentPlatform: PlatformId | null = null;
        let label = '';
        if (a.kind === 'product' && a.productId) {
          const product = s.catalog.get(a.productId);
          label = product ? `${[product.brand, product.name].filter(Boolean).join(' ')}` : 'Unknown product';
          if (product) {
            const quotes = await s.comparison.quote([product], location);
            for (const q of quotes) {
              const m = q.matches.get(product.id);
              if (!m || m.listing.availability === 'out_of_stock') continue;
              const price = round2(m.listing.price * m.multiplier);
              if (currentPrice === null || price < currentPrice) {
                currentPrice = price;
                currentPlatform = q.platform;
              }
            }
          }
        } else if (a.savedCartId) {
          const cart = await s.store.getSavedCart(u.id, a.savedCartId);
          label = cart ? `${cart.name} basket` : 'Deleted basket';
          if (cart?.items.length) {
            const result = await s.comparison.compare({
              items: productsOf(cart.items),
              location,
              preference: prefs.preference,
              memberships: prefs.memberships,
              maxOrders: prefs.maxOrders,
            });
            currentPrice = result.result.recommended?.total ?? null;
            currentPlatform = result.result.recommended?.platforms[0] ?? null;
          }
        }
        return {
          id: a.id,
          kind: a.kind,
          productId: a.productId ?? undefined,
          savedCartId: a.savedCartId ?? undefined,
          targetPrice: a.targetPrice,
          createdAt: a.createdAt,
          active: a.active,
          currentPrice,
          currentPlatform,
          triggered: currentPrice !== null && currentPrice <= a.targetPrice,
          label,
        };
      }),
    );
    ok(res, evaluated);
  });

  r.post('/price-alerts', requireUser, async (req, res) => {
    const body = parse(alertSchema, req.body);
    const u = user(req);
    if ((await s.store.listAlerts(u.id)).length >= 50) throw new AppError(400, 'limit_reached', 'You can have up to 50 alerts.');
    if (body.kind === 'product' && !s.catalog.get(body.productId)) throw notFound('Product');
    if (body.kind === 'basket' && !(await s.store.getSavedCart(u.id, body.savedCartId))) throw notFound('Saved cart');
    const alert = await s.store.createAlert({
      userId: u.id,
      kind: body.kind,
      productId: body.kind === 'product' ? body.productId : null,
      savedCartId: body.kind === 'basket' ? body.savedCartId : null,
      targetPrice: body.targetPrice,
    });
    ok(res, alert, 201);
  });

  r.delete('/price-alerts/:id', requireUser, async (req, res) => {
    if (!(await s.store.deleteAlert(user(req).id, parse(idParam, req.params.id)))) throw notFound('Alert');
    ok(res, { deleted: true });
  });

  // ---- Savings dashboard ----
  r.get('/savings', requireUser, async (req, res) => {
    const entries = await s.store.listPurchasedComparisons(user(req).id);
    const monthly = new Map<string, { saved: number; orders: number }>();
    const byPlatform = new Map<PlatformId, number>();
    for (const e of entries) {
      const month = e.purchasedAt!.slice(0, 7);
      const m = monthly.get(month) ?? { saved: 0, orders: 0 };
      m.saved = round2(m.saved + e.savings);
      m.orders += 1;
      monthly.set(month, m);
      for (const p of e.platforms) byPlatform.set(p, (byPlatform.get(p) ?? 0) + 1);
    }
    const totalSaved = round2(entries.reduce((a, e) => a + e.savings, 0));
    const summary: SavingsSummary = {
      totalSaved,
      ordersOptimized: entries.length,
      averageSaving: entries.length ? Math.round(totalSaved / entries.length) : 0,
      bestSaving: entries.reduce((a, e) => Math.max(a, e.savings), 0),
      totalSpent: round2(entries.reduce((a, e) => a + (e.recommendedTotal ?? 0), 0)),
      monthly: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
      byPlatform: [...byPlatform.entries()].sort((a, b) => b[1] - a[1]).map(([platform, orders]) => ({ platform, orders })),
      recent: entries.slice(0, 10).map((e) => ({
        id: e.id,
        comparisonId: e.id,
        createdAt: e.purchasedAt!,
        saved: e.savings,
        total: e.recommendedTotal ?? 0,
        orderCount: e.orderCount,
        platforms: e.platforms,
        sample: e.sample,
      })),
      includesSample: entries.some((e) => e.sample),
    };
    ok(res, summary);
  });

  /** Adds clearly-labelled sample history so the dashboard can be demonstrated before real use. */
  r.post('/savings/sample', requireUser, async (req, res) => {
    const u = user(req);
    await s.store.clearSampleSavings(u.id);
    const combos: PlatformId[][] = [['bigbasket', 'zepto'], ['blinkit'], ['zepto', 'instamart'], ['bigbasket'], ['blinkit', 'zepto'], ['instamart', 'bigbasket']];
    const entries: StoredComparison[] = Array.from({ length: 18 }, (_, i) => {
      const daysAgo = 3 + i * 5;
      const when = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
      const platforms = combos[i % combos.length];
      const savings = [86, 35, 52, 143, 41, 77, 64, 29, 95, 58, 112, 47, 70, 38, 88, 61, 54, 90][i];
      return {
        id: randomUUID(),
        userId: u.id,
        savedCartId: null,
        createdAt: when,
        purchasedAt: when,
        sample: true,
        recommendedTotal: 640 + ((i * 97) % 520),
        savings,
        orderCount: platforms.length,
        platforms,
        response: null,
      };
    });
    await s.store.addSampleSavings(u.id, entries);
    ok(res, { added: entries.length }, 201);
  });

  r.delete('/savings/sample', requireUser, async (req, res) => {
    await s.store.clearSampleSavings(user(req).id);
    ok(res, { cleared: true });
  });

  return r;
}
