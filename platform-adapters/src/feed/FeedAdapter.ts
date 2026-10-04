import { PLATFORMS, type FeeSchedule, type Location, type PlatformId, type PlatformInfo, type PlatformListing } from '@savesmart/shared';
import { AdapterError, packFields, type PlatformAdapter } from '../PlatformAdapter.js';
import type { FeedFees, FeedListingsResponse, FeedServiceability } from './contract.js';

export interface FeedConfig {
  baseUrl: string;
  apiKey: string;
  /** How long a response is reused for the same request. Prices change, so keep this short. */
  cacheTtlMs?: number;
  fetch?: typeof fetch;
}

/**
 * A platform backed by a licensed price feed (see ./contract.ts). Listings are
 * fetched per search, so SaveSmart only asks for what a cart needs.
 */
export class FeedAdapter implements PlatformAdapter {
  readonly dataSource = 'live' as const;
  private cache = new Map<string, { at: number; value: Promise<unknown> }>();

  constructor(
    readonly id: PlatformId,
    private readonly config: FeedConfig,
  ) {}

  get info(): PlatformInfo {
    return PLATFORMS[this.id];
  }

  async isServiceable(location: Location): Promise<boolean> {
    if (!location.pincode) return true;
    const r = await this.get<FeedServiceability>('/serviceability', { pincode: location.pincode });
    return r.serviceable;
  }

  async getFees(location: Location): Promise<FeeSchedule> {
    const f = await this.get<FeedFees>('/fees', { pincode: location.pincode, city: location.city });
    return {
      deliveryFee: f.delivery_fee,
      freeDeliveryAbove: f.free_delivery_above,
      platformFee: f.platform_fee,
      handlingFee: f.handling_fee,
      smallCartFee: f.small_cart_fee,
      smallCartBelow: f.small_cart_below,
      surgeFee: f.surge_fee,
      surgeReason: f.surge_reason,
      minOrderValue: f.min_order_value,
      coupons: [],
    };
  }

  async search(query: string, location: Location, limit = 12): Promise<PlatformListing[]> {
    const r = await this.get<FeedListingsResponse>('/listings', { pincode: location.pincode, city: location.city, q: query, limit: String(limit) });
    return r.listings.map((l) => ({
      productId: `${this.id}:${l.id}`,
      platform: this.id,
      productName: l.name,
      brand: l.brand,
      variant: '',
      ...packFields(l.pack),
      price: l.price,
      mrp: Math.max(l.mrp, l.price),
      discount: Math.max(0, l.mrp - l.price),
      availability: l.stock,
      deliveryFee: 0,
      platformFee: 0,
      handlingFee: 0,
      productUrl: l.url ?? '',
      lastUpdated: l.observed_at,
      location,
      dataSource: 'live',
    }));
  }

  private get<T>(path: string, params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams({ platform: this.id, ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)) });
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}?${qs}`;
    const hit = this.cache.get(url);
    if (hit && Date.now() - hit.at < (this.config.cacheTtlMs ?? 120_000)) return hit.value as Promise<T>;
    const value = (this.config.fetch ?? fetch)(url, { headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: 'application/json' } }).then(async (res) => {
      if (!res.ok) throw new AdapterError(this.id, `price feed answered ${res.status}`);
      return (await res.json()) as T;
    });
    value.catch(() => this.cache.delete(url));
    this.cache.set(url, { at: Date.now(), value });
    return value;
  }
}

export function createFeedAdapters(config: FeedConfig, platforms: PlatformId[] = ['blinkit', 'zepto', 'instamart', 'bigbasket']): PlatformAdapter[] {
  return platforms.map((p) => new FeedAdapter(p, config));
}
