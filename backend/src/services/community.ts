import { PLATFORMS, round2, type CatalogProduct, type FeeSchedule, type Location, type PlatformId, type PlatformInfo, type PlatformListing } from '@savesmart/shared';
import { productTitle, type PlatformAdapter } from '@savesmart/platform-adapters';
import type { FeeReport, PriceReport, Store } from '../store/types.js';

/** Community prices older than this are ignored: quick-commerce prices move daily. */
export const PRICE_FRESH_HOURS = 72;
/** Fees change less often than prices. */
export const FEE_FRESH_DAYS = 14;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : round2((s[m - 1] + s[m]) / 2);
}

/** One report per person (their latest), so nobody can outvote everyone else. */
function latestPerUser<T extends { userId: string; reportedAt: string }>(reports: T[]): T[] {
  const seen = new Map<string, T>();
  for (const r of reports) {
    const prev = seen.get(r.userId);
    if (!prev || r.reportedAt > prev.reportedAt) seen.set(r.userId, r);
  }
  return [...seen.values()].sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
}

/** Prefers reports from the same pincode; falls back to the whole city. */
function nearest<T extends { pincode: string }>(reports: T[], pincode: string): T[] {
  const local = pincode ? reports.filter((r) => r.pincode === pincode) : [];
  return local.length ? local : reports;
}

export interface CommunityPrice {
  price: number;
  mrp: number;
  available: boolean;
  observedAt: string;
  reports: number;
}

/**
 * Turns raw reports for one product on one platform into a price:
 * the median of reports made within a day of the newest one, so a single
 * mistyped price can't move the result and old reports drop out as new ones arrive.
 */
export function aggregatePrice(reports: PriceReport[], pincode: string): CommunityPrice | null {
  const people = latestPerUser(nearest(reports, pincode));
  if (!people.length) return null;
  const newest = people[0].reportedAt;
  const windowStart = new Date(new Date(newest).getTime() - 24 * 3_600_000).toISOString();
  const recent = people.filter((r) => r.reportedAt >= windowStart);
  const inStock = recent.filter((r) => r.available);
  const available = inStock.length * 2 > recent.length || (inStock.length * 2 === recent.length && recent[0].available);
  const priced = inStock.length ? inStock : recent;
  const price = median(priced.map((r) => r.price));
  const mrps = priced.map((r) => r.mrp).filter((m): m is number => m !== null);
  return { price, mrp: Math.max(price, mrps.length ? median(mrps) : price), available, observedAt: newest, reports: recent.length };
}

export function aggregateFees(reports: FeeReport[], pincode: string): FeeSchedule | null {
  const people = latestPerUser(nearest(reports, pincode)).slice(0, 15);
  if (!people.length) return null;
  const m = (f: (r: FeeReport) => number) => median(people.map(f));
  const freeAbove = people.map((r) => r.freeDeliveryAbove).filter((v): v is number => v !== null);
  return {
    deliveryFee: m((r) => r.deliveryFee),
    freeDeliveryAbove: freeAbove.length * 2 >= people.length ? median(freeAbove) : null,
    platformFee: m((r) => r.platformFee),
    handlingFee: m((r) => r.handlingFee),
    smallCartFee: m((r) => r.smallCartFee),
    smallCartBelow: m((r) => r.smallCartBelow),
    surgeFee: 0,
    minOrderValue: m((r) => r.minOrderValue),
    coupons: [],
    feesSource: 'community',
    feesObservedAt: people[0].reportedAt,
  };
}

const EMPTY_FEES: FeeSchedule = {
  deliveryFee: 0,
  freeDeliveryAbove: null,
  platformFee: 0,
  handlingFee: 0,
  smallCartFee: 0,
  smallCartBelow: 0,
  surgeFee: 0,
  minOrderValue: 0,
  coupons: [],
  feesSource: 'unknown',
};

/**
 * Prices that SaveSmart users saw in a platform's app and shared.
 * Reports for a platform and city are loaded once and reused briefly, so a
 * comparison of a whole cart costs one query per platform.
 */
export class CommunityAdapter implements PlatformAdapter {
  readonly dataSource = 'community' as const;
  private cache = new Map<string, { at: number; reports: Promise<PriceReport[]> }>();
  /** Several pack sizes share a title (Taaza 1 L and 500 ml), so a search returns each of them. */
  private byTitle = new Map<string, CatalogProduct[]>();

  constructor(
    readonly id: PlatformId,
    private readonly store: Store,
    catalog: CatalogProduct[],
  ) {
    for (const p of catalog) {
      const key = productTitle(p).toLowerCase();
      this.byTitle.set(key, [...(this.byTitle.get(key) ?? []), p]);
    }
  }

  get info(): PlatformInfo {
    return PLATFORMS[this.id];
  }

  async isServiceable(): Promise<boolean> {
    return true;
  }

  async getFees(location: Location): Promise<FeeSchedule> {
    const reports = await this.store.feeReports(this.id, location.city, hoursAgo(FEE_FRESH_DAYS * 24));
    return aggregateFees(reports, location.pincode) ?? EMPTY_FEES;
  }

  /** The comparison service searches with a product's exact title; anything else finds nothing. */
  async search(query: string, location: Location): Promise<PlatformListing[]> {
    const products = this.byTitle.get(query.toLowerCase()) ?? [];
    if (!products.length) return [];
    const all = await this.reportsFor(location.city);
    return products.flatMap((product): PlatformListing[] => {
      const agg = aggregatePrice(
        all.filter((r) => r.productId === product.id),
        location.pincode,
      );
      if (!agg) return [];
      return [
      {
        productId: `${this.id}:${product.id}`,
        platform: this.id,
        productName: product.name,
        brand: product.brand,
        variant: product.variant,
        quantity: product.size.value,
        unit: product.size.unit,
        packCount: product.packCount,
        price: agg.price,
        mrp: agg.mrp,
        discount: round2(agg.mrp - agg.price),
        availability: agg.available ? 'in_stock' : 'out_of_stock',
        deliveryFee: 0,
        platformFee: 0,
        handlingFee: 0,
        productUrl: '',
        lastUpdated: agg.observedAt,
        location,
        dataSource: 'community',
        reports: agg.reports,
      },
      ];
    });
  }

  /** Called after a new report so the next comparison sees it straight away. */
  invalidate(city: string) {
    this.cache.delete(city.toLowerCase());
  }

  private reportsFor(city: string): Promise<PriceReport[]> {
    const key = city.toLowerCase();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 15_000) return hit.reports;
    const reports = this.store.priceReports(null, this.id, city, hoursAgo(PRICE_FRESH_HOURS));
    reports.catch(() => this.cache.delete(key));
    this.cache.set(key, { at: Date.now(), reports });
    return reports;
  }
}

/**
 * The licensed feed first; community prices for whatever the feed doesn't have.
 * Without a feed this is simply the community source.
 */
export class LayeredAdapter implements PlatformAdapter {
  constructor(
    private readonly feed: PlatformAdapter | null,
    readonly community: CommunityAdapter,
  ) {}

  get id() {
    return this.community.id;
  }
  get info() {
    return this.community.info;
  }
  get dataSource() {
    return this.feed ? this.feed.dataSource : this.community.dataSource;
  }

  async isServiceable(location: Location): Promise<boolean> {
    if (!this.feed) return true;
    // If the feed can't answer, community prices still can.
    return this.feed.isServiceable(location).catch(() => true);
  }

  async getFees(location: Location): Promise<FeeSchedule> {
    if (this.feed) {
      const fees = await this.feed.getFees(location).catch(() => null);
      if (fees) return { ...fees, feesSource: fees.feesSource ?? 'feed' };
    }
    return this.community.getFees(location);
  }

  async search(query: string, location: Location, limit?: number): Promise<PlatformListing[]> {
    if (this.feed) {
      const fromFeed = await this.feed.search(query, location, limit).catch(() => []);
      if (fromFeed.length) return fromFeed;
    }
    return this.community.search(query, location);
  }
}
