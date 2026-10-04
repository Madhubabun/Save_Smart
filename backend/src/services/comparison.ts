import {
  PLATFORMS,
  formatSize,
  round2,
  unitPriceLabel,
  type CatalogProduct,
  type ComparedItem,
  type ComparisonResponse,
  type FeeSchedule,
  type ItemOffer,
  type Location,
  type Notice,
  type PlatformId,
  type PlatformStatus,
  type ShoppingPreference,
} from '@savesmart/shared';
import { matchProduct, type ListingMatch } from '@savesmart/product-matching';
import { optimizeCart, type EngineItem, type EnginePlatform } from '@savesmart/optimization-engine';
import { AdapterError, productTitle, type PlatformAdapter } from '@savesmart/platform-adapters';

export interface PlatformQuote {
  platform: PlatformId;
  status: PlatformStatus['status'];
  message?: string;
  fees?: FeeSchedule;
  matches: Map<string, ListingMatch | null>;
  durationMs: number;
}

export interface QuoteOptions {
  simulateFailures?: PlatformId[];
}

export interface CompareInput {
  items: { product: CatalogProduct; quantity: number }[];
  location: Location;
  preference: ShoppingPreference;
  memberships: PlatformId[];
  maxOrders?: number;
  simulateFailures?: PlatformId[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, platform: PlatformId): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new AdapterError(platform, 'timed out')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Turns a matched listing into what the UI shows for one cart line on one platform. */
export function toOffer(platform: PlatformId, product: CatalogProduct, match: ListingMatch | null | undefined): ItemOffer {
  if (!match) return { platform, status: 'not_listed' };
  const l = match.listing;
  const price = round2(l.price * match.multiplier);
  const mrp = round2(l.mrp * match.multiplier);
  return {
    platform,
    status: l.availability === 'out_of_stock' ? 'out_of_stock' : 'available',
    listingName: `${l.productName} · ${formatSize({ value: l.quantity, unit: l.unit }, l.packCount)}`,
    price,
    mrp,
    discountPercent: mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0,
    availability: l.availability,
    unitPriceLabel: unitPriceLabel(price, product.size, product.packCount),
    packNote: match.kind === 'multiple' ? `${match.multiplier} × ${formatSize({ value: l.quantity, unit: l.unit })}` : undefined,
    lastUpdated: l.lastUpdated,
    productUrl: l.productUrl,
    matchScore: match.score,
  };
}

/**
 * Orchestrates a comparison: asks every platform adapter in parallel, matches
 * listings to the cart's products, then hands standardized offers and fees to
 * the optimization engine. One failing platform never fails the comparison.
 */
export class ComparisonService {
  constructor(
    private readonly adapters: PlatformAdapter[],
    private readonly timeoutMs = 4000,
  ) {}

  get platformIds(): PlatformId[] {
    return this.adapters.map((a) => a.id);
  }

  async quote(products: CatalogProduct[], location: Location, opts: QuoteOptions = {}): Promise<PlatformQuote[]> {
    return Promise.all(
      this.adapters.map(async (adapter): Promise<PlatformQuote> => {
        const started = Date.now();
        const base = { platform: adapter.id, matches: new Map<string, ListingMatch | null>() };
        try {
          if (opts.simulateFailures?.includes(adapter.id)) {
            await new Promise((r) => setTimeout(r, 150));
            throw new AdapterError(adapter.id, 'simulated outage');
          }
          if (!(await adapter.isServiceable(location))) {
            return {
              ...base,
              status: 'not_serviceable',
              message: `${adapter.info.shortName} doesn't deliver to ${location.area || location.city} yet.`,
              durationMs: Date.now() - started,
            };
          }
          const work = (async () => {
            const fees = await adapter.getFees(location);
            const results = await Promise.all(products.map((p) => adapter.search(productTitle(p), location, 15)));
            products.forEach((p, i) => base.matches.set(p.id, matchProduct(p, results[i])));
            return fees;
          })();
          const fees = await withTimeout(work, this.timeoutMs, adapter.id);
          return { ...base, status: 'ok', fees, durationMs: Date.now() - started };
        } catch {
          // Details stay server-side; the user gets a clear, non-technical message.
          return {
            ...base,
            status: 'error',
            message: `${adapter.info.shortName} prices couldn't be retrieved.`,
            durationMs: Date.now() - started,
          };
        }
      }),
    );
  }

  async compare(input: CompareInput): Promise<Omit<ComparisonResponse, 'id' | 'createdAt'>> {
    const products = input.items.map((i) => i.product);
    const quotes = await this.quote(products, input.location, { simulateFailures: input.simulateFailures });
    const okQuotes = quotes.filter((q) => q.status === 'ok');

    const items: ComparedItem[] = input.items.map(({ product, quantity }, idx) => {
      const offers = {} as Record<PlatformId, ItemOffer>;
      for (const q of quotes) {
        offers[q.platform] = q.status === 'ok' ? toOffer(q.platform, product, q.matches.get(product.id)) : { platform: q.platform, status: 'not_listed' };
      }
      return { itemId: `${idx}:${product.id}`, product, quantity, offers };
    });

    const engineItems: EngineItem[] = items.map((it) => {
      const offers: EngineItem['offers'] = {};
      for (const q of okQuotes) {
        const o = it.offers[q.platform];
        if (o.status === 'not_listed') continue;
        offers[q.platform] = { unitPrice: o.price!, unitMrp: o.mrp!, available: o.status === 'available' };
      }
      return { id: it.itemId, label: `${[it.product.brand, it.product.name].filter(Boolean).join(' ')} ${formatSize(it.product.size, it.product.packCount)}`, quantity: it.quantity, offers };
    });

    const enginePlatforms: EnginePlatform[] = okQuotes.map((q) => ({
      id: q.platform,
      fees: q.fees!,
      isMember: input.memberships.includes(q.platform),
    }));

    const result = optimizeCart({
      items: engineItems,
      platforms: enginePlatforms,
      preference: input.preference,
      maxOrders: input.maxOrders,
    });

    const notices: Notice[] = [];
    const failed = quotes.filter((q) => q.status === 'error');
    if (failed.length) {
      const names = failed.map((q) => PLATFORMS[q.platform].shortName);
      notices.push({
        level: 'warning',
        title: `${names.join(' and ')} prices couldn't be retrieved`,
        message: okQuotes.length
          ? `Continuing with ${okQuotes.map((q) => PLATFORMS[q.platform].shortName).join(', ')}.`
          : 'No platform could be reached. Please try again in a moment.',
      });
    }
    for (const q of quotes.filter((x) => x.status === 'not_serviceable')) {
      notices.push({ level: 'info', title: `${PLATFORMS[q.platform].shortName} isn't available here`, message: q.message ?? '' });
    }
    const multiples = items.flatMap((it) =>
      Object.values(it.offers)
        .filter((o) => o.packNote && o.status === 'available')
        .map((o) => `${PLATFORMS[o.platform].shortName}: ${it.product.name} as ${o.packNote}`),
    );
    if (multiples.length) {
      notices.push({
        level: 'info',
        title: 'Equivalent pack sizes used',
        message: `Where a platform doesn't sell the exact pack, SaveSmart combines smaller packs of the same product: ${multiples.join('; ')}.`,
      });
    }

    const platforms: PlatformStatus[] = quotes.map((q) => ({
      platform: PLATFORMS[q.platform],
      status: q.status,
      message: q.message,
      fees: q.fees,
      isMember: input.memberships.includes(q.platform),
      durationMs: q.durationMs,
    }));

    return {
      location: input.location,
      dataSource: this.adapters.every((a) => a.dataSource === 'live') ? 'live' : 'demo',
      items,
      platforms,
      result,
      notices,
    };
  }
}
