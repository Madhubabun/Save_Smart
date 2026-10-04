import { PLATFORM_IDS, round2, type CatalogProduct, type Location, type PlatformId, type PricePoint, type ProductPricesResponse } from '@savesmart/shared';
import type { DemoDataProvider } from '@savesmart/platform-adapters';
import type { PriceSnapshot, Store } from '../store/types.js';
import { toOffer, type ComparisonService } from './comparison.js';

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Current prices and price history for a product. History combines snapshots
 * recorded from real comparisons with the demo provider's backfill, so charts
 * have data from day one. With a live provider only recorded snapshots remain.
 */
export class PriceService {
  constructor(
    private readonly comparison: ComparisonService,
    private readonly store: Store,
    private readonly demo: DemoDataProvider | null,
  ) {}

  async productPrices(product: CatalogProduct, location: Location): Promise<ProductPricesResponse> {
    const quotes = await this.comparison.quote([product], location);
    const offers = quotes.map((q) => (q.status === 'ok' ? toOffer(q.platform, product, q.matches.get(product.id)) : { platform: q.platform, status: 'not_listed' as const }));

    await this.store.recordPrices(
      offers
        .filter((o) => o.status === 'available' && o.price !== undefined)
        .map((o): PriceSnapshot => ({ productId: product.id, platform: o.platform, pincode: location.pincode, price: o.price!, mrp: o.mrp!, date: day(new Date()) })),
    );

    const since = day(new Date(Date.now() - 29 * 86_400_000));
    const recorded = await this.store.priceSnapshots(product.id, location.pincode, since);
    const history = {} as Record<PlatformId, PricePoint[]>;
    for (const platform of PLATFORM_IDS) {
      const byDate = new Map<string, number>();
      for (const p of this.demo?.history(product, platform, location) ?? []) byDate.set(p.date, p.price);
      for (const s of recorded) if (s.platform === platform) byDate.set(s.date, s.price);
      history[platform] = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, price]) => ({ date, price }));
    }

    // Summary uses the cheapest available platform each day.
    const dates = [...new Set(Object.values(history).flatMap((h) => h.map((p) => p.date)))].sort();
    const cheapestOn = (date: string | undefined): number | null => {
      if (!date) return null;
      const vals = Object.values(history).flatMap((h) => h.filter((p) => p.date === date).map((p) => p.price));
      return vals.length ? Math.min(...vals) : null;
    };
    const daily = dates.map(cheapestOn).filter((v): v is number => v !== null);
    const todayBest = offers.filter((o) => o.status === 'available').map((o) => o.price!);

    return {
      product,
      location,
      dataSource: 'demo',
      offers,
      history,
      summary: {
        today: todayBest.length ? Math.min(...todayBest) : null,
        yesterday: cheapestOn(dates[dates.length - 2]),
        sevenDaysAgo: cheapestOn(dates[dates.length - 8]),
        thirtyDayAverage: daily.length ? round2(daily.reduce((a, b) => a + b, 0) / daily.length) : null,
        thirtyDayLow: daily.length ? Math.min(...daily) : null,
      },
    };
  }
}
