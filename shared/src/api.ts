import type { OptimizationResult } from './plan.js';
import type {
  Availability,
  CatalogProduct,
  DataSource,
  FeeSchedule,
  Location,
  PlatformId,
  PlatformInfo,
  ShoppingPreference,
  UserPreferences,
} from './types.js';

/** Request/response shapes of the HTTP API, shared by backend and frontend. */

export type MatchConfidence = 'high' | 'low' | 'none';

export interface ResolvedCartItem {
  id: string;
  /** What the user typed, e.g. "Milk 2". */
  query: string;
  product: CatalogProduct | null;
  quantity: number;
  confidence: MatchConfidence;
  /** Other products the user may have meant, best first. */
  alternatives: CatalogProduct[];
  note?: string;
}

export interface CreateCartRequest {
  /** A pasted shopping list, one item per line. */
  text?: string;
  /** Structured entries from manual entry or search. */
  entries?: { query: string; quantity?: number; unit?: string; productId?: string }[];
}

export interface CreateCartResponse {
  items: ResolvedCartItem[];
}

export interface CompareRequest {
  items: { productId: string; quantity: number }[];
  location: Location;
  preference: ShoppingPreference;
  memberships?: PlatformId[];
  maxOrders?: number;
  /** Demo control: pretend these platforms failed, to show graceful degradation. */
  simulateFailures?: PlatformId[];
  savedCartId?: string;
}

export type OfferStatus = 'available' | 'out_of_stock' | 'not_listed';

export interface ItemOffer {
  platform: PlatformId;
  status: OfferStatus;
  listingName?: string;
  /** Price of what the user buys for one cart unit (may be several packs, see packNote). */
  price?: number;
  mrp?: number;
  discountPercent?: number;
  availability?: Availability;
  /** e.g. "₹6.20 / 100 ml" */
  unitPriceLabel?: string;
  /** Set when an equivalent pack combination is used, e.g. "2 × 6 pcs". */
  packNote?: string;
  lastUpdated?: string;
  productUrl?: string;
  matchScore?: number;
}

export interface ComparedItem {
  itemId: string;
  product: CatalogProduct;
  quantity: number;
  offers: Record<PlatformId, ItemOffer>;
}

export interface PlatformStatus {
  platform: PlatformInfo;
  status: 'ok' | 'error' | 'not_serviceable';
  message?: string;
  fees?: FeeSchedule;
  isMember: boolean;
  durationMs?: number;
}

export interface Notice {
  level: 'info' | 'warning' | 'error';
  title: string;
  message: string;
}

/**
 * A suggestion to buy something equivalent for less: the same product in a
 * different pack size, or a similar product from another brand.
 */
export interface SmartSwap {
  itemId: string;
  kind: 'pack_size' | 'similar_product';
  from: CatalogProduct;
  fromQuantity: number;
  to: CatalogProduct;
  toQuantity: number;
  /** Cheapest current cost of the cart line, and of the swap, before order fees. */
  fromBest: { platform: PlatformId; total: number };
  toBest: { platform: PlatformId; total: number };
  /** How much the recommended plan total drops with this swap, fees and order splits included. */
  estimatedSaving: number;
  reason: string;
}

export interface ComparisonResponse {
  id: string;
  createdAt: string;
  location: Location;
  dataSource: DataSource;
  items: ComparedItem[];
  platforms: PlatformStatus[];
  result: OptimizationResult;
  notices: Notice[];
  swaps: SmartSwap[];
  /** How much the recommended plan drops if every swap is applied together. */
  swapAllSaving: number;
}

export interface ComparisonSummary {
  id: string;
  createdAt: string;
  location: Location;
  itemCount: number;
  total: number | null;
  savings: number;
  orderCount: number;
  platforms: PlatformId[];
  purchased: boolean;
  savedCartId: string | null;
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface ProductPricesResponse {
  product: CatalogProduct;
  location: Location;
  dataSource: DataSource;
  offers: ItemOffer[];
  history: Record<PlatformId, PricePoint[]>;
  summary: {
    today: number | null;
    yesterday: number | null;
    sevenDaysAgo: number | null;
    thirtyDayAverage: number | null;
    thirtyDayLow: number | null;
  };
}

export interface SavedCartItem {
  productId: string;
  quantity: number;
  /** Filled in on reads so clients can render the cart without another lookup. */
  product?: CatalogProduct;
}

export interface SavedCart {
  id: string;
  name: string;
  items: SavedCartItem[];
  createdAt: string;
  updatedAt: string;
  lastComparedAt: string | null;
  lastTotal: number | null;
}

export type PriceAlertKind = 'product' | 'basket';

export interface PriceAlert {
  id: string;
  kind: PriceAlertKind;
  productId?: string;
  savedCartId?: string;
  targetPrice: number;
  createdAt: string;
  active: boolean;
  /** Evaluated on read with the latest prices. */
  currentPrice: number | null;
  currentPlatform: PlatformId | null;
  triggered: boolean;
  label: string;
}

export interface SavingsEntry {
  id: string;
  comparisonId: string;
  createdAt: string;
  saved: number;
  total: number;
  orderCount: number;
  platforms: PlatformId[];
  sample: boolean;
}

export interface SavingsSummary {
  totalSaved: number;
  ordersOptimized: number;
  averageSaving: number;
  bestSaving: number;
  totalSpent: number;
  monthly: { month: string; saved: number; orders: number }[];
  byPlatform: { platform: PlatformId; orders: number }[];
  recent: SavingsEntry[];
  includesSample: boolean;
  /** Spent this calendar month on plans the user continued with. */
  thisMonthSpent: number;
  thisMonthSaved: number;
  monthlyBudget: number | null;
}

export interface SessionResponse {
  token: string;
  userId: string;
}

export interface LocationOption extends Location {
  serviceable: PlatformId[];
}

export type PreferencesPayload = UserPreferences;
