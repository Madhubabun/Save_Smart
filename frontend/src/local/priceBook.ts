import { PLATFORM_IDS, round2, type FeeSchedule, type PlatformId } from '@savesmart/shared';
import { storage } from '../lib/storage';

/**
 * The price book: real prices the user checked in each app, kept on this device.
 * SaveSmart never invents a price: a product with no entry for an app is treated as "not checked".
 */
export interface PriceEntry {
  price: number;
  /** MRP printed on the listing, when the user entered it. */
  mrp?: number;
  available: boolean;
  checkedAt: string;
}

export interface FeeEntry {
  deliveryFee: number;
  freeDeliveryAbove: number | null;
  handlingFee: number;
  platformFee: number;
  smallCartFee: number;
  smallCartBelow: number;
  minOrderValue: number;
  checkedAt: string;
}

interface Book {
  prices: Record<string, PriceEntry>;
  history: Record<string, { date: string; price: number }[]>;
  fees: Partial<Record<PlatformId, FeeEntry>>;
}

const KEY = 'ss.pricebook.v1';
const listeners = new Set<() => void>();
let book: Book = load();

function load(): Book {
  const b = storage.getJSON<Partial<Book>>(KEY, {});
  return { prices: b.prices ?? {}, history: b.history ?? {}, fees: b.fees ?? {} };
}

function save() {
  storage.setJSON(KEY, book);
  listeners.forEach((l) => l());
}

const key = (productId: string, platform: PlatformId) => `${productId}|${platform}`;
const today = () => new Date().toISOString().slice(0, 10);

/** Prices older than this are flagged as possibly out of date. */
export const STALE_AFTER_MS = 2 * 86_400_000;

export const priceBook = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },

  get(productId: string, platform: PlatformId): PriceEntry | undefined {
    return book.prices[key(productId, platform)];
  },

  forProduct(productId: string): Partial<Record<PlatformId, PriceEntry>> {
    const out: Partial<Record<PlatformId, PriceEntry>> = {};
    for (const p of PLATFORM_IDS) {
      const e = book.prices[key(productId, p)];
      if (e) out[p] = e;
    }
    return out;
  },

  set(productId: string, platform: PlatformId, entry: { price: number; mrp?: number; available: boolean }) {
    const k = key(productId, platform);
    const e: PriceEntry = { price: round2(entry.price), mrp: entry.mrp ? round2(entry.mrp) : undefined, available: entry.available, checkedAt: new Date().toISOString() };
    book.prices[k] = e;
    if (entry.available) {
      const h = (book.history[k] ?? []).filter((p) => p.date !== today());
      h.push({ date: today(), price: e.price });
      book.history[k] = h.slice(-90);
    }
    save();
  },

  /** "This app doesn't sell it" or "I haven't checked": removes the entry. */
  clear(productId: string, platform: PlatformId) {
    delete book.prices[key(productId, platform)];
    save();
  },

  history(productId: string, platform: PlatformId) {
    return book.history[key(productId, platform)] ?? [];
  },

  fees(platform: PlatformId): FeeEntry | undefined {
    return book.fees[platform];
  },

  setFees(platform: PlatformId, fees: Omit<FeeEntry, 'checkedAt'>) {
    book.fees[platform] = { ...fees, checkedAt: new Date().toISOString() };
    save();
  },

  feeSchedule(platform: PlatformId): FeeSchedule {
    const f = book.fees[platform];
    return {
      deliveryFee: f?.deliveryFee ?? 0,
      freeDeliveryAbove: f?.freeDeliveryAbove ?? null,
      platformFee: f?.platformFee ?? 0,
      handlingFee: f?.handlingFee ?? 0,
      smallCartFee: f?.smallCartFee ?? 0,
      smallCartBelow: f?.smallCartBelow ?? 0,
      surgeFee: 0,
      minOrderValue: f?.minOrderValue ?? 0,
      coupons: [],
    };
  },

  /** Platforms the user has entered at least one price for. */
  platformsInUse(): PlatformId[] {
    const used = new Set(Object.keys(book.prices).map((k) => k.split('|')[1] as PlatformId));
    return PLATFORM_IDS.filter((p) => used.has(p));
  },

  isEmpty() {
    return Object.keys(book.prices).length === 0;
  },

  export(): string {
    return JSON.stringify(book);
  },

  import(json: string) {
    const b = JSON.parse(json) as Partial<Book>;
    if (typeof b !== 'object' || !b || typeof b.prices !== 'object') throw new Error('Not a SaveSmart price book');
    book = { prices: b.prices ?? {}, history: b.history ?? {}, fees: b.fees ?? {} };
    save();
  },

  reset() {
    book = { prices: {}, history: {}, fees: {} };
    save();
  },
};

export function isStale(checkedAt: string) {
  return Date.now() - new Date(checkedAt).getTime() > STALE_AFTER_MS;
}
