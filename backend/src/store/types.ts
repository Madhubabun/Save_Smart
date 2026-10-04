import type {
  ComparisonResponse,
  PlatformId,
  PriceAlertKind,
  SavedCartItem,
  UserPreferences,
} from '@savesmart/shared';

export interface User {
  id: string;
  createdAt: string;
  isAnonymous: boolean;
}

export interface StoredSavedCart {
  id: string;
  userId: string;
  name: string;
  items: SavedCartItem[];
  createdAt: string;
  updatedAt: string;
  lastComparedAt: string | null;
  lastTotal: number | null;
}

export interface StoredAlert {
  id: string;
  userId: string;
  kind: PriceAlertKind;
  productId: string | null;
  savedCartId: string | null;
  targetPrice: number;
  active: boolean;
  createdAt: string;
}

export interface StoredComparison {
  id: string;
  userId: string;
  savedCartId: string | null;
  createdAt: string;
  /** Set when the user continued to a platform with this plan. Feeds the savings dashboard. */
  purchasedAt: string | null;
  sample: boolean;
  recommendedTotal: number | null;
  savings: number;
  orderCount: number;
  platforms: PlatformId[];
  response: ComparisonResponse | null;
}

export interface PriceSnapshot {
  productId: string;
  platform: PlatformId;
  pincode: string;
  price: number;
  mrp: number;
  date: string;
}

/**
 * Persistence boundary. MemoryStore runs the demo without a database;
 * PgStore persists to PostgreSQL (see database/schema.sql).
 */
export interface Store {
  readonly kind: 'memory' | 'postgres';
  createUser(tokenHash: string): Promise<User>;
  findUserByTokenHash(tokenHash: string): Promise<User | null>;

  getPreferences(userId: string): Promise<UserPreferences | null>;
  setPreferences(userId: string, prefs: UserPreferences): Promise<void>;

  listSavedCarts(userId: string): Promise<StoredSavedCart[]>;
  getSavedCart(userId: string, id: string): Promise<StoredSavedCart | null>;
  createSavedCart(userId: string, name: string, items: SavedCartItem[]): Promise<StoredSavedCart>;
  updateSavedCart(userId: string, id: string, patch: { name?: string; items?: SavedCartItem[]; lastComparedAt?: string; lastTotal?: number | null }): Promise<StoredSavedCart | null>;
  deleteSavedCart(userId: string, id: string): Promise<boolean>;

  listAlerts(userId: string): Promise<StoredAlert[]>;
  createAlert(alert: Omit<StoredAlert, 'id' | 'createdAt' | 'active'>): Promise<StoredAlert>;
  deleteAlert(userId: string, id: string): Promise<boolean>;

  saveComparison(c: StoredComparison): Promise<void>;
  getComparison(userId: string, id: string): Promise<StoredComparison | null>;
  markPurchased(userId: string, id: string): Promise<StoredComparison | null>;
  listPurchasedComparisons(userId: string): Promise<StoredComparison[]>;
  /** Most recent comparisons, newest first, without the full response. */
  listRecentComparisons(userId: string, limit: number): Promise<StoredComparison[]>;
  addSampleSavings(userId: string, entries: StoredComparison[]): Promise<void>;
  clearSampleSavings(userId: string): Promise<void>;

  recordPrices(snapshots: PriceSnapshot[]): Promise<void>;
  priceSnapshots(productId: string, pincode: string, sinceDate: string): Promise<PriceSnapshot[]>;

  close(): Promise<void>;
}
