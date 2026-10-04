/**
 * Domain types shared by every SaveSmart module.
 *
 * Nothing in here is specific to a single platform: adapters translate each
 * platform's own data format into these shapes, so the optimization engine
 * and the UI never see platform-specific formats.
 */

export type PlatformId = 'blinkit' | 'zepto' | 'instamart' | 'bigbasket';

export const PLATFORM_IDS: readonly PlatformId[] = ['blinkit', 'zepto', 'instamart', 'bigbasket'];

/** Base units every size is normalized to before comparison. */
export type BaseUnit = 'g' | 'ml' | 'pcs';

/** A normalized pack size, e.g. 1 L becomes { value: 1000, unit: 'ml' }. */
export interface Size {
  value: number;
  unit: BaseUnit;
}

export interface Location {
  city: string;
  area: string;
  pincode: string;
}

export type ProductCategory =
  | 'Dairy & Eggs'
  | 'Bakery'
  | 'Fruits & Vegetables'
  | 'Staples'
  | 'Snacks & Biscuits'
  | 'Beverages'
  | 'Household'
  | 'Personal Care'
  | 'Breakfast';

/** A canonical product in SaveSmart's own catalog. Platforms list it under their own names. */
export interface CatalogProduct {
  id: string;
  brand: string;
  /** Product line without brand or size, e.g. "Taaza Toned Milk". */
  name: string;
  /** Variant inside the line, e.g. "Toned", "Gold", "Brown". Empty when there is none. */
  variant: string;
  size: Size;
  /** Number of units inside one pack (e.g. a 6-pack of soap). Defaults to 1. */
  packCount: number;
  category: ProductCategory;
  emoji: string;
  /** Extra search words such as Hindi names or common synonyms. */
  keywords: string[];
  /** 0-100, used to rank ambiguous matches ("Milk" -> most bought milk first). */
  popularity: number;
  /** Reference MRP used by the demo data provider. */
  mrp: number;
}

export type Availability = 'in_stock' | 'limited' | 'out_of_stock';

/**
 * The standardized listing every PlatformAdapter returns (spec section 17).
 * `quantity` + `unit` describe the pack as written by the platform, already
 * normalized to base units.
 */
export interface PlatformListing {
  productId: string;
  platform: PlatformId;
  productName: string;
  brand: string;
  variant: string;
  quantity: number;
  unit: BaseUnit;
  packCount: number;
  price: number;
  mrp: number;
  /** Product discount in rupees (mrp - price). */
  discount: number;
  availability: Availability;
  deliveryFee: number;
  platformFee: number;
  handlingFee: number;
  productUrl: string;
  lastUpdated: string;
  location: Location;
  /** Where the number came from. Demo prices must always be labelled as such. */
  dataSource: DataSource;
}

export type DataSource = 'demo' | 'live';

export interface Coupon {
  code: string;
  description: string;
  type: 'flat' | 'percent';
  value: number;
  minOrder: number;
  maxDiscount?: number;
  /** Only applies when the user holds the platform's membership. */
  membersOnly?: boolean;
}

export interface Membership {
  name: string;
  /** Members get free delivery from this subtotal (0 = always free). */
  freeDeliveryAbove: number;
  /** Members skip the small-cart fee. */
  waivesSmallCartFee: boolean;
}

/**
 * Everything a platform charges on top of product prices, for one location.
 * The optimization objective is the final payable amount, so all of these matter.
 */
export interface FeeSchedule {
  deliveryFee: number;
  /** Delivery becomes free at or above this subtotal. null = never free. */
  freeDeliveryAbove: number | null;
  platformFee: number;
  handlingFee: number;
  smallCartFee: number;
  /** Small-cart fee applies when the subtotal is below this value. */
  smallCartBelow: number;
  surgeFee: number;
  surgeReason?: string;
  /** Orders below this subtotal cannot be placed at all. */
  minOrderValue: number;
  coupons: Coupon[];
  membership?: Membership;
}

export interface PlatformInfo {
  id: PlatformId;
  name: string;
  shortName: string;
  /** Brand-neutral accent used for chips and plan cards. */
  color: string;
  websiteUrl: string;
  deliveryEta: string;
}

export type ShoppingPreference = 'max_savings' | 'min_orders' | 'one_platform' | 'balanced';

export const SHOPPING_PREFERENCES: readonly ShoppingPreference[] = [
  'max_savings',
  'min_orders',
  'one_platform',
  'balanced',
];

export interface UserPreferences {
  preference: ShoppingPreference;
  location: Location;
  /** Platforms whose membership the user holds (Zepto Pass, Swiggy One, ...). */
  memberships: PlatformId[];
  /** Never split across more platforms than this. */
  maxOrders?: number;
}

/** Consistent API envelope used by every endpoint. */
export type ApiResponse<T> =
  | { ok: true; data: T; meta?: Record<string, unknown> }
  | { ok: false; error: ApiError };

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
