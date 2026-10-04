import { randomUUID } from 'node:crypto';
import type { PlatformId, SavedCartItem, UserPreferences } from '@savesmart/shared';
import type { FeeReport, PriceReport, PriceSnapshot, Store, StoredAlert, StoredComparison, StoredSavedCart, User } from './types.js';

/** In-memory store for demo mode and tests. Data resets when the server restarts. */
export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private users = new Map<string, User>();
  private tokens = new Map<string, string>();
  private prefs = new Map<string, UserPreferences>();
  private carts = new Map<string, StoredSavedCart>();
  private alerts = new Map<string, StoredAlert>();
  private comparisons = new Map<string, StoredComparison>();
  private snapshots = new Map<string, PriceSnapshot>();
  private priceReportList: PriceReport[] = [];
  private feeReportList: FeeReport[] = [];

  async createUser(tokenHash: string): Promise<User> {
    const user: User = { id: randomUUID(), createdAt: new Date().toISOString(), isAnonymous: true };
    this.users.set(user.id, user);
    this.tokens.set(tokenHash, user.id);
    return user;
  }

  async findUserByTokenHash(tokenHash: string): Promise<User | null> {
    const id = this.tokens.get(tokenHash);
    return id ? (this.users.get(id) ?? null) : null;
  }

  async getPreferences(userId: string) {
    return this.prefs.get(userId) ?? null;
  }

  async setPreferences(userId: string, prefs: UserPreferences) {
    this.prefs.set(userId, prefs);
  }

  async listSavedCarts(userId: string) {
    return [...this.carts.values()].filter((c) => c.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSavedCart(userId: string, id: string) {
    const c = this.carts.get(id);
    return c && c.userId === userId ? c : null;
  }

  async createSavedCart(userId: string, name: string, items: SavedCartItem[]) {
    const now = new Date().toISOString();
    const cart: StoredSavedCart = { id: randomUUID(), userId, name, items, createdAt: now, updatedAt: now, lastComparedAt: null, lastTotal: null };
    this.carts.set(cart.id, cart);
    return cart;
  }

  async updateSavedCart(userId: string, id: string, patch: Parameters<Store['updateSavedCart']>[2]) {
    const cart = await this.getSavedCart(userId, id);
    if (!cart) return null;
    const updated: StoredSavedCart = {
      ...cart,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: patch.name || patch.items ? new Date().toISOString() : cart.updatedAt,
    };
    this.carts.set(id, updated);
    return updated;
  }

  async deleteSavedCart(userId: string, id: string) {
    const cart = await this.getSavedCart(userId, id);
    if (!cart) return false;
    this.carts.delete(id);
    for (const [aid, a] of this.alerts) if (a.savedCartId === id) this.alerts.delete(aid);
    return true;
  }

  async listAlerts(userId: string) {
    return [...this.alerts.values()].filter((a) => a.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createAlert(alert: Omit<StoredAlert, 'id' | 'createdAt' | 'active'>) {
    const stored: StoredAlert = { ...alert, id: randomUUID(), createdAt: new Date().toISOString(), active: true };
    this.alerts.set(stored.id, stored);
    return stored;
  }

  async deleteAlert(userId: string, id: string) {
    const a = this.alerts.get(id);
    if (!a || a.userId !== userId) return false;
    this.alerts.delete(id);
    return true;
  }

  async saveComparison(c: StoredComparison) {
    this.comparisons.set(c.id, c);
    // Keep memory bounded in long-running demos.
    if (this.comparisons.size > 5000) {
      const oldest = [...this.comparisons.values()].filter((x) => !x.purchasedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (oldest) this.comparisons.delete(oldest.id);
    }
  }

  async getComparison(userId: string, id: string) {
    const c = this.comparisons.get(id);
    return c && c.userId === userId ? c : null;
  }

  async markPurchased(userId: string, id: string) {
    const c = await this.getComparison(userId, id);
    if (!c) return null;
    if (!c.purchasedAt) c.purchasedAt = new Date().toISOString();
    return c;
  }

  async listPurchasedComparisons(userId: string) {
    return [...this.comparisons.values()]
      .filter((c) => c.userId === userId && c.purchasedAt)
      .sort((a, b) => b.purchasedAt!.localeCompare(a.purchasedAt!));
  }

  async listRecentComparisons(userId: string, limit: number) {
    return [...this.comparisons.values()]
      .filter((c) => c.userId === userId && !c.sample)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async addSampleSavings(_userId: string, entries: StoredComparison[]) {
    for (const e of entries) this.comparisons.set(e.id, e);
  }

  async clearSampleSavings(userId: string) {
    for (const [id, c] of this.comparisons) if (c.userId === userId && c.sample) this.comparisons.delete(id);
  }

  async recordPrices(snapshots: PriceSnapshot[]) {
    for (const s of snapshots) this.snapshots.set(`${s.productId}|${s.platform}|${s.pincode}|${s.date}`, s);
  }

  async priceSnapshots(productId: string, pincode: string, sinceDate: string) {
    return [...this.snapshots.values()].filter((s) => s.productId === productId && s.pincode === pincode && s.date >= sinceDate);
  }

  async addPriceReport(r: PriceReport) {
    this.priceReportList.unshift(r);
    this.priceReportList.length = Math.min(this.priceReportList.length, 50_000);
  }

  async priceReports(productIds: string[] | null, platform: PlatformId, city: string, sinceIso: string) {
    const ids = productIds && new Set(productIds);
    const c = city.toLowerCase();
    return this.priceReportList.filter((r) => (!ids || ids.has(r.productId)) && r.platform === platform && r.city.toLowerCase() === c && r.reportedAt >= sinceIso);
  }

  async addFeeReport(r: FeeReport) {
    this.feeReportList.unshift(r);
    this.feeReportList.length = Math.min(this.feeReportList.length, 10_000);
  }

  async feeReports(platform: PlatformId, city: string, sinceIso: string) {
    const c = city.toLowerCase();
    return this.feeReportList.filter((r) => r.platform === platform && r.city.toLowerCase() === c && r.reportedAt >= sinceIso);
  }

  async close() {}
}
