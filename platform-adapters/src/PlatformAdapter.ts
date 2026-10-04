import type { DataSource, FeeSchedule, Location, PlatformId, PlatformInfo, PlatformListing } from '@savesmart/shared';
import { PLATFORMS } from '@savesmart/shared';
import { parseSize, tokenize, tokenMatches } from '@savesmart/product-matching';
import type { RawFees } from './demo/rawTypes.js';

/**
 * The only contract the rest of SaveSmart knows about a platform.
 * The comparison service and optimization engine never see a platform's own data format.
 */
export interface PlatformAdapter {
  readonly id: PlatformId;
  readonly info: PlatformInfo;
  readonly dataSource: DataSource;
  isServiceable(location: Location): Promise<boolean>;
  getFees(location: Location): Promise<FeeSchedule>;
  /** Search the platform's catalog at a location and return standardized listings. */
  search(query: string, location: Location, limit?: number): Promise<PlatformListing[]>;
}

/** What an adapter reads from: a demo generator today, an official API or partner feed later. */
export interface PlatformSource<TRaw> {
  readonly dataSource: DataSource;
  serviceable(location: Location): Promise<boolean>;
  catalog(location: Location): Promise<TRaw[]>;
  fees(location: Location): Promise<RawFees>;
}

export class AdapterError extends Error {
  constructor(
    readonly platform: PlatformId,
    message: string,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

/** Parses a pack label such as "1 l", "4 x 100 g" or "12 pcs" into normalized size fields. */
export function packFields(label: string): Pick<PlatformListing, 'quantity' | 'unit' | 'packCount'> {
  const parsed = parseSize(label);
  if (!parsed) return { quantity: 1, unit: 'pcs', packCount: 1 };
  return { quantity: parsed.size.value, unit: parsed.size.unit, packCount: parsed.packCount };
}

export function feesFromRaw(raw: RawFees): FeeSchedule {
  return {
    deliveryFee: raw.delivery_fee,
    freeDeliveryAbove: raw.free_delivery_above,
    platformFee: raw.platform_fee,
    handlingFee: raw.handling_fee,
    smallCartFee: raw.small_cart_fee,
    smallCartBelow: raw.small_cart_below,
    surgeFee: raw.surge_fee,
    surgeReason: raw.surge_reason,
    minOrderValue: raw.min_order_value,
    coupons: raw.offers.map((o) => ({
      code: o.code,
      description: o.text,
      type: o.kind,
      value: o.value,
      minOrder: o.min_order,
      maxDiscount: o.cap,
      membersOnly: o.members_only,
    })),
    membership: raw.membership
      ? { name: raw.membership.name, freeDeliveryAbove: raw.membership.free_delivery_above, waivesSmallCartFee: raw.membership.waives_small_cart_fee }
      : undefined,
  };
}

/**
 * Shared adapter plumbing: caching per location, fee mapping and a simple
 * in-catalog search. Subclasses only translate their platform's raw record.
 */
export abstract class BaseAdapter<TRaw> implements PlatformAdapter {
  abstract readonly id: PlatformId;
  private cache = new Map<string, { at: number; listings: PlatformListing[] }>();

  constructor(
    protected readonly source: PlatformSource<TRaw>,
    private readonly cacheTtlMs = 60_000,
  ) {}

  get info(): PlatformInfo {
    return PLATFORMS[this.id];
  }

  get dataSource(): DataSource {
    return this.source.dataSource;
  }

  protected abstract normalize(raw: TRaw, location: Location, fees: FeeSchedule): PlatformListing;

  isServiceable(location: Location): Promise<boolean> {
    return this.source.serviceable(location);
  }

  async getFees(location: Location): Promise<FeeSchedule> {
    return feesFromRaw(await this.source.fees(location));
  }

  protected async allListings(location: Location): Promise<PlatformListing[]> {
    const key = location.pincode || `${location.city}|${location.area}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.cacheTtlMs) return hit.listings;
    if (!(await this.source.serviceable(location))) {
      throw new AdapterError(this.id, `${this.info.shortName} doesn't deliver to ${location.pincode || location.city} yet.`);
    }
    const [raw, fees] = await Promise.all([this.source.catalog(location), this.getFees(location)]);
    const listings = raw.map((r) => this.normalize(r, location, fees));
    this.cache.set(key, { at: Date.now(), listings });
    return listings;
  }

  async search(query: string, location: Location, limit = 12): Promise<PlatformListing[]> {
    const q = tokenize(query);
    const listings = await this.allListings(location);
    if (q.length === 0) return [];
    return listings
      .map((l) => {
        const tokens = tokenize(`${l.brand} ${l.productName}`);
        const matched = q.filter((qt) => tokens.some((t) => tokenMatches(qt, t))).length;
        return { l, score: matched / q.length };
      })
      .filter((x) => x.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.l);
  }
}
