import { formatSize, platformSearchUrl, type CatalogProduct, type Location, type PlatformId, type PricePoint } from '@savesmart/shared';
import { DEMO_CATALOG, productTitle } from './catalog.js';
import { AREA_SURGE, CITY_PRICE_FACTOR, DEMO_LOCATIONS, findDemoLocation } from './locations.js';
import type { BigBasketRawProduct, BlinkitRawProduct, InstamartRawProduct, RawFees, ZeptoRawProduct } from './rawTypes.js';

/**
 * DemoDataProvider generates realistic, deterministic DEMO prices for each
 * platform in each platform's own raw format. These are NOT live prices and
 * every listing produced from them is labelled `dataSource: 'demo'`.
 *
 * A legitimate data provider (official API, partner feed) replaces this class
 * by implementing the same per-platform source interfaces.
 */

/** FNV-1a hash mapped to [0, 1): deterministic "randomness" so demos are repeatable. */
export function hash01(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

const PLATFORM_BIAS: Record<PlatformId, number> = { blinkit: 0.04, zepto: 0.06, instamart: 0.03, bigbasket: 0.07 };

/**
 * Hand-set Bengaluru prices for the demo shopping list so the story is clear:
 * BigBasket is the cheapest single app, but Zepto's dairy deals plus BigBasket's
 * rice make a two-order split cheaper even after fees. null = not listed.
 */
const PRICE_OVERRIDES: Record<string, Partial<Record<PlatformId, number | null>>> = {
  'amul-taaza-1l': { blinkit: 56, zepto: 49, instamart: 56, bigbasket: 55 },
  'britannia-white-bread-400g': { blinkit: 45, zepto: 38, instamart: 44, bigbasket: 44 },
  'white-eggs-12': { blinkit: 92, zepto: 76, instamart: null, bigbasket: 89 },
  'white-eggs-6': { blinkit: 48, zepto: 42, instamart: 46, bigbasket: 46 },
  'hybrid-tomato-1kg': { blinkit: 36, zepto: 42, instamart: 41, bigbasket: 34 },
  'daawat-rozana-basmati-5kg': { blinkit: 459, zepto: 489, instamart: 469, bigbasket: 439 },
  'good-day-cashew-200g': { blinkit: 36, zepto: 32, instamart: 40, bigbasket: 38 },
  'amul-taaza-500ml': { blinkit: 28, zepto: 27, instamart: 28, bigbasket: 28 },
};

/** Listings that are out of stock in the demo, to exercise availability handling. */
const OUT_OF_STOCK: Partial<Record<PlatformId, string[]>> = {
  zepto: ['amul-gold-1l', 'saffola-gold-oil-1l'],
  blinkit: ['brown-eggs-6', 'quaker-oats-1kg'],
  instamart: ['kelloggs-corn-flakes-475g'],
  bigbasket: ['coca-cola-750ml', 'nandini-toned-500ml'],
};

/** Products a platform does not list at all in the demo. */
const NOT_LISTED: Partial<Record<PlatformId, string[]>> = {
  zepto: ['nandini-toned-500ml', 'clinic-plus-shampoo-340ml'],
  blinkit: ['english-oven-pav-200g'],
  instamart: ['aashirvaad-atta-10kg'],
  bigbasket: ['lays-classic-salted-52g'],
};

export interface DemoListing {
  product: CatalogProduct;
  platform: PlatformId;
  price: number;
  mrp: number;
  stock: 'in_stock' | 'limited' | 'out_of_stock';
  updatedAt: Date;
}

export class DemoDataProvider {
  constructor(
    private readonly catalog: CatalogProduct[] = DEMO_CATALOG,
    private readonly now: () => Date = () => new Date(),
  ) {}

  isServiceable(platform: PlatformId, location: Location): boolean {
    const known = findDemoLocation(location.pincode);
    if (known) return known.serviceable.includes(platform);
    // Unknown pincodes in a known city: assume the city's common coverage.
    const sameCity = DEMO_LOCATIONS.filter((l) => l.city.toLowerCase() === location.city.toLowerCase());
    return sameCity.length === 0 || sameCity.some((l) => l.serviceable.includes(platform));
  }

  /** Current demo price of a catalog product on a platform at a location, or null if not listed. */
  listing(product: CatalogProduct, platform: PlatformId, location: Location): DemoListing | null {
    if (NOT_LISTED[platform]?.includes(product.id)) return null;
    const override = PRICE_OVERRIDES[product.id]?.[platform];
    if (override === null) return null;

    const factor = CITY_PRICE_FACTOR[location.city]?.[platform] ?? 1;
    const r = hash01(`${product.id}|${platform}`);
    let base: number;
    if (override !== undefined) {
      base = override;
    } else if (product.category === 'Fruits & Vegetables') {
      base = product.mrp * (0.62 + r * 0.36);
    } else {
      base = product.mrp * (1 - PLATFORM_BIAS[platform] - r * 0.1);
    }
    const price = Math.min(product.mrp, Math.max(1, Math.round(base * factor)));
    const mrp = Math.max(price, Math.round(product.mrp * (factor > 1 ? factor : 1)));

    const s = hash01(`${product.id}|${platform}|${location.pincode}|stock`);
    const stock = OUT_OF_STOCK[platform]?.includes(product.id) ? 'out_of_stock' : s < 0.08 && override === undefined ? 'limited' : 'in_stock';

    const minutesAgo = Math.floor(hash01(`${product.id}|${platform}|t`) * 14) + 1;
    return { product, platform, price, mrp, stock, updatedAt: new Date(this.now().getTime() - minutesAgo * 60_000) };
  }

  listings(platform: PlatformId, location: Location): DemoListing[] {
    return this.catalog.flatMap((p) => {
      const l = this.listing(p, platform, location);
      return l ? [l] : [];
    });
  }

  /**
   * Deterministic 30-day demo price history ending today at the current price.
   * Production would read recorded snapshots from the price_history table.
   */
  history(product: CatalogProduct, platform: PlatformId, location: Location, days = 30): PricePoint[] {
    const current = this.listing(product, platform, location);
    if (!current) return [];
    const today = this.now();
    const points: PricePoint[] = [];
    for (let d = days - 1; d >= 0; d--) {
      const date = new Date(today.getTime() - d * 86_400_000).toISOString().slice(0, 10);
      if (d === 0) {
        points.push({ date, price: current.price });
        continue;
      }
      // Prices move in short runs rather than daily noise.
      const bucket = Math.floor(d / 3);
      const wiggle = (hash01(`${product.id}|${platform}|${bucket}`) - 0.45) * 0.14;
      points.push({ date, price: Math.min(current.mrp, Math.max(1, Math.round(current.price * (1 + wiggle)))) });
    }
    return points;
  }

  fees(platform: PlatformId, location: Location): RawFees {
    const surge = AREA_SURGE[location.pincode]?.[platform];
    const common = { surge_fee: surge?.fee ?? 0, surge_reason: surge?.reason };
    switch (platform) {
      case 'blinkit':
        return {
          delivery_fee: 25, free_delivery_above: 199, platform_fee: 0, handling_fee: 4, small_cart_fee: 20, small_cart_below: 99,
          min_order_value: 0, offers: [{ code: 'BLINK40', text: '₹40 off on orders above ₹1,199', kind: 'flat', value: 40, min_order: 1199 }],
          ...common,
        };
      case 'zepto':
        return {
          delivery_fee: 30, free_delivery_above: 199, platform_fee: 3, handling_fee: 0, small_cart_fee: 25, small_cart_below: 99,
          min_order_value: 0,
          offers: [{ code: 'ZEPTO50', text: '₹50 off on orders above ₹999', kind: 'flat', value: 50, min_order: 999 }],
          membership: { name: 'Zepto Pass', free_delivery_above: 99, waives_small_cart_fee: true },
          ...common,
        };
      case 'instamart':
        return {
          delivery_fee: 35, free_delivery_above: 249, platform_fee: 0, handling_fee: 5, small_cart_fee: 20, small_cart_below: 99,
          min_order_value: 99,
          offers: [{ code: 'SAVE75', text: '₹75 off on orders above ₹999', kind: 'flat', value: 75, min_order: 999 }],
          membership: { name: 'Swiggy One', free_delivery_above: 99, waives_small_cart_fee: true },
          ...common,
        };
      case 'bigbasket':
        return {
          delivery_fee: 30, free_delivery_above: 200, platform_fee: 0, handling_fee: 0, small_cart_fee: 0, small_cart_below: 0,
          min_order_value: 100,
          offers: [{ code: 'BBNOW10', text: '10% off up to ₹60 on orders above ₹999', kind: 'percent', value: 10, min_order: 999, cap: 60 }],
          membership: { name: 'BB Star', free_delivery_above: 0, waives_small_cart_fee: true },
          ...common,
        };
    }
  }

  // ---- Raw platform-format feeds (what each adapter consumes) ----

  blinkitFeed(location: Location): BlinkitRawProduct[] {
    return this.listings('blinkit', location).map((l, i) => ({
      prid: 100000 + i * 7 + Math.floor(hash01(l.product.id) * 5),
      name: `${productTitle(l.product)}${l.product.category === 'Fruits & Vegetables' ? ' (Fresh)' : ''}`,
      brand: l.product.brand,
      unit: blinkitUnit(l.product),
      price: l.price,
      mrp: l.mrp,
      inventory: l.stock === 'out_of_stock' ? 0 : l.stock === 'limited' ? 2 : 20 + Math.floor(hash01(l.product.id + 'inv') * 40),
      slug: platformSearchUrl('blinkit', productTitle(l.product)),
      updated_at: Math.floor(l.updatedAt.getTime() / 1000),
    }));
  }

  zeptoFeed(location: Location): ZeptoRawProduct[] {
    return this.listings('zepto', location).map((l) => ({
      id: `zp-${Math.floor(hash01(l.product.id + 'z') * 1e8).toString(16)}`,
      productName: zeptoName(l.product),
      brandName: l.product.brand,
      packsize: zeptoPack(l.product),
      sellingPrice: l.price * 100,
      mrp: l.mrp * 100,
      outOfStock: l.stock === 'out_of_stock',
      lowStock: l.stock === 'limited',
      lastSyncedAt: l.updatedAt.toISOString(),
    }));
  }

  instamartFeed(location: Location): InstamartRawProduct[] {
    return this.listings('instamart', location).map((l) => ({
      item_id: `IM${Math.floor(hash01(l.product.id + 'im') * 1e7)}`,
      display_name: `${productTitle(l.product)} - ${formatSize(l.product.size, l.product.packCount)}`,
      brand: l.product.brand || null,
      quantity_label: formatSize(l.product.size, l.product.packCount),
      offer_price: l.price,
      store_price: l.mrp,
      in_stock: l.stock === 'out_of_stock' ? 0 : 1,
      max_allowed_quantity: l.stock === 'limited' ? 2 : 10,
      ts: l.updatedAt.toISOString(),
    }));
  }

  bigbasketFeed(location: Location): BigBasketRawProduct[] {
    return this.listings('bigbasket', location).map((l) => {
      const brand = l.product.brand || 'Fresho';
      const title = `${l.product.name}${l.product.variant ? ` ${l.product.variant}` : ''}`;
      return {
        sku: 40000000 + Math.floor(hash01(l.product.id + 'bb') * 1e6),
        desc: `${brand} ${title}, ${formatSize(l.product.size, l.product.packCount)}`,
        brand: { name: brand },
        w: formatSize(l.product.size, l.product.packCount),
        pricing: { discount: { mrp: l.mrp.toFixed(2), prim_price: { sp: l.price.toFixed(2) } } },
        availability: { avail_status: l.stock === 'out_of_stock' ? 'O' : l.stock === 'limited' ? 'L' : 'A' },
        absolute_url: platformSearchUrl('bigbasket', `${brand} ${title}`),
        updated: l.updatedAt.toISOString(),
      };
    });
  }
}

function blinkitUnit(p: CatalogProduct): string {
  const s = p.size;
  const base = s.unit === 'ml' ? (s.value >= 1000 ? `${s.value / 1000} l` : `${s.value} ml`) : s.unit === 'g' ? (s.value >= 1000 ? `${s.value / 1000} kg` : `${s.value} g`) : `${s.value} pieces`;
  return p.packCount > 1 ? `${p.packCount} x ${base}` : base;
}

function zeptoName(p: CatalogProduct): string {
  // Zepto-style titles add marketing words; matching must see through them.
  const extra = p.category === 'Dairy & Eggs' && p.size.unit === 'ml' ? ' Fresh' : '';
  return `${productTitle(p)}${extra}`.trim();
}

function zeptoPack(p: CatalogProduct): string {
  const base = p.size.unit === 'pcs' ? `${p.size.value} pcs` : p.size.unit === 'ml' ? `${p.size.value} ml` : p.size.value >= 1000 ? `${p.size.value / 1000} kg` : `${p.size.value} g`;
  return p.packCount > 1 ? `${p.packCount} x ${base}` : base;
}
