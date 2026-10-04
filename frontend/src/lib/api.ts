import type {
  ApiResponse,
  CatalogProduct,
  CompareRequest,
  ComparisonResponse,
  ComparisonSummary,
  FeeSchedule,
  ItemOffer,
  Location,
  PlatformId,
  CreateCartRequest,
  CreateCartResponse,
  LocationOption,
  PriceAlert,
  ProductPricesResponse,
  SavedCart,
  SavedCartItem,
  SavingsSummary,
  SessionResponse,
  UserPreferences,
} from '@savesmart/shared';
import { storage } from './storage';

import { ApiError } from './apiError';

export { ApiError };

const TOKEN_KEY = 'ss.token';
let sessionPromise: Promise<string> | null = null;

async function createSession(): Promise<string> {
  const res = await fetch('/api/session', { method: 'POST' });
  const json = (await res.json()) as ApiResponse<SessionResponse>;
  if (!json.ok) throw new ApiError(res.status, json.error.code, json.error.message);
  storage.set(TOKEN_KEY, json.data.token);
  return json.data.token;
}

/** Anonymous session token, created on first use. No API keys ever live in the frontend. */
function token(): Promise<string> {
  const existing = storage.get(TOKEN_KEY);
  if (existing) return Promise.resolve(existing);
  sessionPromise ??= createSession().finally(() => (sessionPromise = null));
  return sessionPromise;
}

async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', "Can't reach SaveSmart right now. Check your connection and try again.");
  }
  if (res.status === 401 && !retried) {
    // Session expired (e.g. the demo server restarted): start a new one once.
    storage.remove(TOKEN_KEY);
    return request<T>(method, path, body, true);
  }
  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(res.status, 'bad_response', 'Something went wrong. Please try again.');
  }
  if (!json.ok) throw new ApiError(res.status, json.error.code, json.error.message);
  return json.data;
}

const loc = (l?: { city?: string; area?: string; pincode?: string }) =>
  l ? `?${new URLSearchParams({ city: l.city ?? '', area: l.area ?? '', pincode: l.pincode ?? '' })}` : '';

export const api = {
  searchProducts: (q: string, signal?: AbortSignal) =>
    fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=8`, { signal })
      .then((r) => r.json() as Promise<ApiResponse<CatalogProduct[]>>)
      .then((j) => (j.ok ? j.data : [])),
  locations: () => request<LocationOption[]>('GET', '/locations'),
  createCart: (body: CreateCartRequest) => request<CreateCartResponse>('POST', '/cart', body),
  compare: (body: CompareRequest) => request<ComparisonResponse>('POST', '/cart/compare', body),
  recentComparisons: () => request<ComparisonSummary[]>('GET', '/comparisons'),
  comparison: (id: string) => request<ComparisonResponse>('GET', `/comparisons/${id}`),
  markPurchased: (id: string) => request<{ id: string }>('POST', `/comparisons/${id}/purchase`),
  product: (id: string) => request<CatalogProduct>('GET', `/products/${encodeURIComponent(id)}`),
  productPrices: (id: string, l?: { city?: string; area?: string; pincode?: string }) =>
    request<ProductPricesResponse>('GET', `/products/${encodeURIComponent(id)}/prices${loc(l)}`),
  preferences: () => request<UserPreferences>('GET', '/preferences'),
  savePreferences: (p: UserPreferences) => request<UserPreferences>('PUT', '/preferences', p),
  savedCarts: () => request<SavedCart[]>('GET', '/saved-carts'),
  createSavedCart: (name: string, items: SavedCartItem[]) => request<SavedCart>('POST', '/saved-carts', { name, items }),
  updateSavedCart: (id: string, patch: { name?: string; items?: SavedCartItem[] }) => request<SavedCart>('PUT', `/saved-carts/${id}`, patch),
  deleteSavedCart: (id: string) => request<{ deleted: boolean }>('DELETE', `/saved-carts/${id}`),
  alerts: () => request<PriceAlert[]>('GET', '/price-alerts'),
  createAlert: (body: { kind: 'product'; productId: string; targetPrice: number } | { kind: 'basket'; savedCartId: string; targetPrice: number }) =>
    request<unknown>('POST', '/price-alerts', body),
  deleteAlert: (id: string) => request<unknown>('DELETE', `/price-alerts/${id}`),
  savings: () => request<SavingsSummary>('GET', '/savings'),
  /** Current prices for products in the user's area, from the feed and the community. */
  prices: (productIds: string[], l?: { city?: string; area?: string; pincode?: string }) =>
    request<PriceLookup>('GET', `/prices${loc(l)}${l ? '&' : '?'}ids=${productIds.map(encodeURIComponent).join(',')}`),
  reportPrice: (body: { productId: string; platform: PlatformId; available: boolean; price?: number; location?: Location }) =>
    request<{ reported: true }>('POST', '/prices/report', body),
  reportFees: (body: FeeReportInput & { platform: PlatformId; location?: Location }) => request<{ reported: true }>('POST', '/fees/report', body),
};

export interface PriceLookup {
  location: Location;
  offers: Record<string, ItemOffer[]>;
  fees: Record<PlatformId, { known: boolean; observedAt: string | null; fees: FeeSchedule | null }>;
}

export interface FeeReportInput {
  deliveryFee: number;
  freeDeliveryAbove: number | null;
  handlingFee: number;
  platformFee: number;
  smallCartFee: number;
  smallCartBelow: number;
  minOrderValue: number;
}
