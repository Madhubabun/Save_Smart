import {
  PLATFORM_IDS,
  round2,
  type CatalogProduct,
  type CompareRequest,
  type ComparisonResponse,
  type ComparisonSummary,
  type CreateCartRequest,
  type CreateCartResponse,
  type Location,
  type LocationOption,
  type PlatformId,
  type PriceAlert,
  type PricePoint,
  type ProductPricesResponse,
  type ResolvedCartItem,
  type SavedCart,
  type SavedCartItem,
  type SavingsSummary,
  type UserPreferences,
} from '@savesmart/shared';
import { DEMO_CATALOG, DEMO_LOCATIONS } from '@savesmart/platform-adapters';
import { parseLine, parseShoppingList, resolveLine, searchCatalog, sizeFromManual, type ParsedLine } from '@savesmart/product-matching';
import { ComparisonService, toOffer } from '../../../backend/src/services/comparison';
import { ApiError } from '../lib/apiError';
import { storage } from '../lib/storage';
import { customProducts } from './customProducts';
import { priceBook } from './priceBook';
import { UserPriceAdapter } from './userAdapter';

/**
 * SaveSmart running entirely on the device: the same matching, comparison and
 * optimization code as the server, with prices from the user's own price book
 * and everything stored in this browser. No account, no server, no tracking.
 */

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const catalog = () => [...DEMO_CATALOG, ...customProducts.all()];
const byId = (id: string) => catalog().find((p) => p.id === id);

const service = () =>
  new ComparisonService(
    PLATFORM_IDS.map((id) => new UserPriceAdapter(id, catalog)),
    4000,
    catalog(),
  );

// ---- Device storage ----
interface StoredComparison {
  id: string;
  createdAt: string;
  purchasedAt: string | null;
  savedCartId: string | null;
  recommendedTotal: number | null;
  savings: number;
  orderCount: number;
  platforms: PlatformId[];
  response: ComparisonResponse;
}
interface StoredCart {
  id: string;
  name: string;
  items: { productId: string; quantity: number }[];
  createdAt: string;
  updatedAt: string;
  lastComparedAt: string | null;
  lastTotal: number | null;
}
interface StoredAlert {
  id: string;
  kind: 'product' | 'basket';
  productId?: string;
  savedCartId?: string;
  targetPrice: number;
  createdAt: string;
}

const col = <T>(key: string) => ({
  all: () => storage.getJSON<T[]>(key, []),
  save: (rows: T[]) => storage.setJSON(key, rows),
});
const comparisons = col<StoredComparison>('ss.local.comparisons');
const carts = col<StoredCart>('ss.local.carts');
const alerts = col<StoredAlert>('ss.local.alerts');

const DEFAULT_PREFS: UserPreferences = { preference: 'balanced', location: { city: 'Bengaluru', area: '', pincode: '' }, memberships: [] };
const prefs = (): UserPreferences => ({ ...DEFAULT_PREFS, ...storage.getJSON<Partial<UserPreferences>>('ss.prefs', {}) });

const notFound = (what: string) => new ApiError(404, 'not_found', `${what} not found.`);
const productsOf = (items: { productId: string; quantity: number }[]) =>
  items.map((i) => {
    const product = byId(i.productId);
    if (!product) throw new ApiError(400, 'unknown_product', 'One of the products is no longer available.');
    return { product, quantity: i.quantity };
  });

const withProducts = (c: StoredCart): SavedCart => ({ ...c, items: c.items.map((i) => ({ ...i, product: byId(i.productId) })) });

function resolveCart(req: CreateCartRequest): ResolvedCartItem[] {
  const lines: { parsed: ParsedLine; productId?: string }[] = [];
  if (req.text) for (const parsed of parseShoppingList(req.text)) lines.push({ parsed });
  for (const e of req.entries ?? []) {
    const parsed = parseLine(e.query);
    if (e.quantity) {
      parsed.quantity = e.quantity;
      parsed.bareNumber = false;
    }
    const manualSize = e.unit ? sizeFromManual(e.quantity ?? 1, e.unit) : null;
    if (manualSize && manualSize.unit !== 'pcs') {
      parsed.size = manualSize;
      parsed.quantity = 1;
    }
    lines.push({ parsed, productId: e.productId });
  }
  return lines.map(({ parsed, productId }) => {
    const picked = productId ? byId(productId) : undefined;
    if (picked) return { id: uid(), query: parsed.raw, product: picked, quantity: parsed.quantity, confidence: 'high', alternatives: [] };
    const r = resolveLine(parsed, catalog());
    if (r.product) return { id: uid(), query: parsed.raw, product: r.product, quantity: r.quantity, confidence: r.confidence, alternatives: r.alternatives, note: r.note };
    // Not in SaveSmart's product list: keep it as the user's own item so nothing on the list is lost.
    const own = customProducts.create(parsed);
    return { id: uid(), query: parsed.raw, product: own, quantity: parsed.quantity, confidence: 'high', alternatives: [], note: 'Added as your own item. Check its price in each app.' };
  });
}

async function compare(body: CompareRequest): Promise<ComparisonResponse> {
  const p = prefs();
  const location: Location = { city: body.location?.city || p.location.city, area: body.location?.area ?? p.location.area, pincode: body.location?.pincode ?? p.location.pincode };
  const compared = await service().compare({
    items: productsOf(body.items),
    location,
    preference: body.preference ?? p.preference,
    memberships: [],
    maxOrders: body.maxOrders,
  });
  // Platforms with no checked prices are simply not part of this comparison.
  const used = new Set(compared.items.flatMap((it) => PLATFORM_IDS.filter((pl) => it.offers[pl].status !== 'not_listed')));
  const response: ComparisonResponse = {
    id: uid(),
    createdAt: new Date().toISOString(),
    ...compared,
    platforms: compared.platforms.filter((pl) => used.has(pl.platform.id)),
    notices: compared.notices,
  };
  const rec = response.result.recommended;
  let savedCartId: string | null = null;
  if (body.savedCartId) {
    const rows = carts.all();
    const c = rows.find((x) => x.id === body.savedCartId);
    if (c) {
      c.lastComparedAt = response.createdAt;
      c.lastTotal = rec?.total ?? null;
      carts.save(rows);
      savedCartId = c.id;
    }
  }
  const rows = comparisons.all();
  rows.unshift({
    id: response.id,
    createdAt: response.createdAt,
    purchasedAt: null,
    savedCartId,
    recommendedTotal: rec?.total ?? null,
    savings: response.result.savings.amount,
    orderCount: rec?.orderCount ?? 0,
    platforms: rec?.platforms ?? [],
    response,
  });
  // Keep the newest 30 comparisons in full, and every purchase (for My Savings) without the bulky response.
  comparisons.save(rows.filter((r, i) => i < 30 || r.purchasedAt).map((r, i) => (i < 30 ? r : { ...r, response: null as unknown as ComparisonResponse })));
  return response;
}

function productPrices(product: CatalogProduct): ProductPricesResponse {
  const p = prefs();
  const entries = priceBook.forProduct(product.id);
  const offers = PLATFORM_IDS.map((pl) => {
    const e = entries[pl];
    if (!e) return { platform: pl, status: 'not_listed' as const };
    const mrp = e.mrp && e.mrp >= e.price ? e.mrp : e.price;
    return toOffer(
      pl,
      product,
      {
        kind: 'exact',
        multiplier: 1,
        score: 1,
        listing: {
          productId: product.id,
          platform: pl,
          productName: product.name,
          brand: product.brand,
          variant: product.variant,
          quantity: product.size.value,
          unit: product.size.unit,
          packCount: product.packCount,
          price: e.price,
          mrp,
          discount: mrp - e.price,
          availability: e.available ? 'in_stock' : 'out_of_stock',
          deliveryFee: 0,
          platformFee: 0,
          handlingFee: 0,
          productUrl: '',
          lastUpdated: e.checkedAt,
          location: p.location,
          dataSource: 'user',
        },
      } as Parameters<typeof toOffer>[2],
    );
  });
  const since = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const history = {} as Record<PlatformId, PricePoint[]>;
  for (const pl of PLATFORM_IDS) history[pl] = priceBook.history(product.id, pl).filter((h) => h.date >= since);
  const dates = [...new Set(Object.values(history).flatMap((h) => h.map((x) => x.date)))].sort();
  // Each app's last known price carries forward until it is checked again.
  const cheapestOn = (date: string | undefined): number | null => {
    if (!date) return null;
    const vals = PLATFORM_IDS.map((pl) => [...history[pl]].reverse().find((x) => x.date <= date)?.price).filter((v): v is number => v !== undefined);
    return vals.length ? Math.min(...vals) : null;
  };
  const daily = dates.map(cheapestOn).filter((v): v is number => v !== null);
  const todayBest = offers.filter((o) => o.status === 'available').map((o) => o.price!);
  const dayAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  return {
    product,
    location: p.location,
    dataSource: 'user',
    offers,
    history,
    summary: {
      today: todayBest.length ? Math.min(...todayBest) : null,
      yesterday: dates.some((d) => d <= dayAgo(1)) ? cheapestOn(dayAgo(1)) : null,
      sevenDaysAgo: dates.some((d) => d <= dayAgo(7)) ? cheapestOn(dayAgo(7)) : null,
      thirtyDayAverage: daily.length ? round2(daily.reduce((a, b) => a + b, 0) / daily.length) : null,
      thirtyDayLow: daily.length ? Math.min(...daily) : null,
    },
  };
}

async function evaluateAlerts(): Promise<PriceAlert[]> {
  const p = prefs();
  return Promise.all(
    alerts.all().map(async (a): Promise<PriceAlert> => {
      let currentPrice: number | null = null;
      let currentPlatform: PlatformId | null = null;
      let label = '';
      if (a.kind === 'product' && a.productId) {
        const product = byId(a.productId);
        label = product ? [product.brand, product.name].filter(Boolean).join(' ') : 'Removed product';
        for (const [pl, e] of Object.entries(product ? priceBook.forProduct(product.id) : {}) as [PlatformId, { price: number; available: boolean }][]) {
          if (e.available && (currentPrice === null || e.price < currentPrice)) {
            currentPrice = e.price;
            currentPlatform = pl;
          }
        }
      } else if (a.savedCartId) {
        const cart = carts.all().find((c) => c.id === a.savedCartId);
        label = cart ? `${cart.name} basket` : 'Deleted basket';
        const items = cart?.items.filter((i) => byId(i.productId)) ?? [];
        if (items.length) {
          const r = await service().compare({ items: productsOf(items), location: p.location, preference: p.preference, memberships: [], maxOrders: p.maxOrders });
          currentPrice = r.result.recommended?.total ?? null;
          currentPlatform = r.result.recommended?.platforms[0] ?? null;
        }
      }
      return { ...a, active: true, currentPrice, currentPlatform, triggered: currentPrice !== null && currentPrice <= a.targetPrice, label };
    }),
  );
}

function savings(): SavingsSummary {
  const entries = comparisons
    .all()
    .filter((c) => c.purchasedAt)
    .sort((a, b) => b.purchasedAt!.localeCompare(a.purchasedAt!));
  const monthly = new Map<string, { saved: number; orders: number }>();
  const byPlatform = new Map<PlatformId, number>();
  for (const e of entries) {
    const m = monthly.get(e.purchasedAt!.slice(0, 7)) ?? { saved: 0, orders: 0 };
    m.saved = round2(m.saved + e.savings);
    m.orders += 1;
    monthly.set(e.purchasedAt!.slice(0, 7), m);
    for (const pl of e.platforms) byPlatform.set(pl, (byPlatform.get(pl) ?? 0) + 1);
  }
  const totalSaved = round2(entries.reduce((a, e) => a + e.savings, 0));
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = entries.filter((e) => e.purchasedAt!.startsWith(month));
  return {
    totalSaved,
    ordersOptimized: entries.length,
    averageSaving: entries.length ? Math.round(totalSaved / entries.length) : 0,
    bestSaving: entries.reduce((a, e) => Math.max(a, e.savings), 0),
    totalSpent: round2(entries.reduce((a, e) => a + (e.recommendedTotal ?? 0), 0)),
    monthly: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, ...v })),
    byPlatform: [...byPlatform.entries()].sort((a, b) => b[1] - a[1]).map(([platform, orders]) => ({ platform, orders })),
    recent: entries.slice(0, 10).map((e) => ({
      id: e.id,
      comparisonId: e.id,
      createdAt: e.purchasedAt!,
      saved: e.savings,
      total: e.recommendedTotal ?? 0,
      orderCount: e.orderCount,
      platforms: e.platforms,
      sample: false,
    })),
    includesSample: false,
    thisMonthSpent: round2(thisMonth.reduce((a, e) => a + (e.recommendedTotal ?? 0), 0)),
    thisMonthSaved: round2(thisMonth.reduce((a, e) => a + e.savings, 0)),
    monthlyBudget: prefs().monthlyBudget ?? null,
  };
}

export const localApi = {
  searchProducts: async (q: string) => (q.trim().length < 2 ? [] : searchCatalog(q, catalog(), 8).map((h) => h.product)),
  locations: async (): Promise<LocationOption[]> => DEMO_LOCATIONS.map((l) => ({ city: l.city, area: l.area, pincode: l.pincode, serviceable: [...PLATFORM_IDS] })),
  createCart: async (body: CreateCartRequest): Promise<CreateCartResponse> => {
    if (!body.text?.trim() && !body.entries?.length) throw new ApiError(400, 'invalid', 'Provide a shopping list or at least one item.');
    return { items: resolveCart(body) };
  },
  compare,
  recentComparisons: async (): Promise<ComparisonSummary[]> =>
    comparisons
      .all()
      .filter((c) => c.response)
      .slice(0, 20)
      .map((c) => ({
        id: c.id,
        createdAt: c.createdAt,
        location: c.response.location,
        itemCount: c.response.items.length,
        total: c.recommendedTotal,
        savings: c.savings,
        orderCount: c.orderCount,
        platforms: c.platforms,
        purchased: !!c.purchasedAt,
        savedCartId: c.savedCartId,
      })),
  comparison: async (id: string) => {
    const c = comparisons.all().find((x) => x.id === id);
    if (!c?.response) throw notFound('Comparison');
    return c.response;
  },
  markPurchased: async (id: string) => {
    const rows = comparisons.all();
    const c = rows.find((x) => x.id === id);
    if (!c) throw notFound('Comparison');
    c.purchasedAt ??= new Date().toISOString();
    comparisons.save(rows);
    return { id };
  },
  product: async (id: string) => {
    const p = byId(id);
    if (!p) throw notFound('Product');
    return p;
  },
  productPrices: async (id: string) => {
    const p = byId(id);
    if (!p) throw notFound('Product');
    return productPrices(p);
  },
  preferences: async () => prefs(),
  savePreferences: async (p: UserPreferences) => {
    storage.setJSON('ss.prefs', p);
    return p;
  },
  savedCarts: async () => carts.all().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(withProducts),
  createSavedCart: async (name: string, items: SavedCartItem[]) => {
    productsOf(items);
    const rows = carts.all();
    if (rows.length >= 50) throw new ApiError(400, 'limit_reached', 'You can save up to 50 carts.');
    const now = new Date().toISOString();
    const cart: StoredCart = { id: uid(), name: name.trim().slice(0, 60), items: items.map(({ productId, quantity }) => ({ productId, quantity })), createdAt: now, updatedAt: now, lastComparedAt: null, lastTotal: null };
    carts.save([cart, ...rows]);
    return withProducts(cart);
  },
  updateSavedCart: async (id: string, patch: { name?: string; items?: SavedCartItem[] }) => {
    const rows = carts.all();
    const c = rows.find((x) => x.id === id);
    if (!c) throw notFound('Saved cart');
    if (patch.name) c.name = patch.name.trim().slice(0, 60);
    if (patch.items) c.items = patch.items.map(({ productId, quantity }) => ({ productId, quantity }));
    c.updatedAt = new Date().toISOString();
    carts.save(rows);
    return withProducts(c);
  },
  deleteSavedCart: async (id: string) => {
    carts.save(carts.all().filter((c) => c.id !== id));
    alerts.save(alerts.all().filter((a) => a.savedCartId !== id));
    return { deleted: true };
  },
  alerts: evaluateAlerts,
  createAlert: async (body: { kind: 'product'; productId: string; targetPrice: number } | { kind: 'basket'; savedCartId: string; targetPrice: number }) => {
    const rows = alerts.all();
    if (rows.length >= 50) throw new ApiError(400, 'limit_reached', 'You can have up to 50 alerts.');
    const a: StoredAlert = { id: uid(), createdAt: new Date().toISOString(), ...body };
    alerts.save([a, ...rows]);
    return a;
  },
  deleteAlert: async (id: string) => {
    alerts.save(alerts.all().filter((a) => a.id !== id));
    return { deleted: true };
  },
  savings: async () => savings(),
};
