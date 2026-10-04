import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { PlatformId, SavedCartItem, ShoppingPreference, UserPreferences } from '@savesmart/shared';
import type { PriceSnapshot, Store, StoredAlert, StoredComparison, StoredSavedCart, User } from './types.js';

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

/** PostgreSQL persistence. Schema: database/schema.sql. All queries are parameterized. */
export class PgStore implements Store {
  readonly kind = 'postgres' as const;
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10 });
  }

  private async tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async createUser(tokenHash: string): Promise<User> {
    const id = randomUUID();
    return this.tx(async (c) => {
      const { rows } = await c.query('INSERT INTO users (id) VALUES ($1) RETURNING created_at', [id]);
      await c.query('INSERT INTO user_sessions (user_id, token_hash) VALUES ($1, $2)', [id, tokenHash]);
      return { id, createdAt: iso(rows[0].created_at)!, isAnonymous: true };
    });
  }

  async findUserByTokenHash(tokenHash: string): Promise<User | null> {
    const { rows } = await this.pool.query(
      `SELECT u.id, u.created_at, u.is_anonymous FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND (s.expires_at IS NULL OR s.expires_at > now())`,
      [tokenHash],
    );
    if (!rows[0]) return null;
    return { id: rows[0].id, createdAt: iso(rows[0].created_at)!, isAnonymous: rows[0].is_anonymous };
  }

  async getPreferences(userId: string): Promise<UserPreferences | null> {
    const { rows } = await this.pool.query('SELECT * FROM user_preferences WHERE user_id = $1', [userId]);
    const r = rows[0];
    if (!r) return null;
    return {
      preference: r.preference as ShoppingPreference,
      location: { city: r.city, area: r.area, pincode: r.pincode },
      memberships: r.memberships as PlatformId[],
      maxOrders: r.max_orders ?? undefined,
      monthlyBudget: r.monthly_budget === null ? undefined : Number(r.monthly_budget),
    };
  }

  async setPreferences(userId: string, p: UserPreferences): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_preferences (user_id, preference, city, area, pincode, memberships, max_orders, monthly_budget, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (user_id) DO UPDATE SET preference = EXCLUDED.preference, city = EXCLUDED.city, area = EXCLUDED.area,
         pincode = EXCLUDED.pincode, memberships = EXCLUDED.memberships, max_orders = EXCLUDED.max_orders,
         monthly_budget = EXCLUDED.monthly_budget, updated_at = now()`,
      [userId, p.preference, p.location.city, p.location.area, p.location.pincode, p.memberships, p.maxOrders ?? null, p.monthlyBudget ?? null],
    );
  }

  private async cartRows(where: string, params: unknown[]): Promise<StoredSavedCart[]> {
    const { rows } = await this.pool.query(
      `SELECT sc.*, COALESCE(json_agg(json_build_object('productId', ci.variant_id, 'quantity', ci.quantity) ORDER BY ci.position)
              FILTER (WHERE ci.id IS NOT NULL), '[]') AS items
       FROM saved_carts sc LEFT JOIN cart_items ci ON ci.cart_id = sc.cart_id
       WHERE ${where} GROUP BY sc.id ORDER BY sc.updated_at DESC`,
      params,
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      items: r.items as SavedCartItem[],
      createdAt: iso(r.created_at)!,
      updatedAt: iso(r.updated_at)!,
      lastComparedAt: iso(r.last_compared_at),
      lastTotal: num(r.last_total),
    }));
  }

  listSavedCarts(userId: string) {
    return this.cartRows('sc.user_id = $1', [userId]);
  }

  async getSavedCart(userId: string, id: string) {
    return (await this.cartRows('sc.user_id = $1 AND sc.id = $2', [userId, id]))[0] ?? null;
  }

  private async writeItems(c: pg.PoolClient, cartId: string, items: SavedCartItem[]) {
    await c.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
    for (const [i, item] of items.entries()) {
      await c.query('INSERT INTO cart_items (cart_id, variant_id, quantity, position) VALUES ($1, $2, $3, $4)', [cartId, item.productId, item.quantity, i]);
    }
  }

  async createSavedCart(userId: string, name: string, items: SavedCartItem[]) {
    const id = await this.tx(async (c) => {
      const cart = await c.query('INSERT INTO carts (user_id) VALUES ($1) RETURNING id', [userId]);
      const cartId = cart.rows[0].id as string;
      await this.writeItems(c, cartId, items);
      const saved = await c.query('INSERT INTO saved_carts (user_id, cart_id, name) VALUES ($1, $2, $3) RETURNING id', [userId, cartId, name]);
      return saved.rows[0].id as string;
    });
    return (await this.getSavedCart(userId, id))!;
  }

  async updateSavedCart(userId: string, id: string, patch: Parameters<Store['updateSavedCart']>[2]) {
    const found = await this.tx(async (c) => {
      const { rows } = await c.query('SELECT cart_id FROM saved_carts WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId]);
      if (!rows[0]) return false;
      if (patch.items) await this.writeItems(c, rows[0].cart_id, patch.items);
      await c.query(
        `UPDATE saved_carts SET
           name = COALESCE($3, name),
           last_compared_at = COALESCE($4, last_compared_at),
           last_total = CASE WHEN $5::boolean THEN $6 ELSE last_total END,
           updated_at = CASE WHEN $3 IS NOT NULL OR $7::boolean THEN now() ELSE updated_at END
         WHERE id = $1 AND user_id = $2`,
        [id, userId, patch.name ?? null, patch.lastComparedAt ?? null, patch.lastTotal !== undefined, patch.lastTotal ?? null, !!patch.items],
      );
      return true;
    });
    return found ? this.getSavedCart(userId, id) : null;
  }

  async deleteSavedCart(userId: string, id: string) {
    return this.tx(async (c) => {
      const { rows } = await c.query('DELETE FROM saved_carts WHERE id = $1 AND user_id = $2 RETURNING cart_id', [id, userId]);
      if (!rows[0]) return false;
      await c.query('DELETE FROM carts WHERE id = $1', [rows[0].cart_id]);
      return true;
    });
  }

  private alertRow(r: Record<string, unknown>): StoredAlert {
    return {
      id: r.id as string,
      userId: r.user_id as string,
      kind: r.kind as StoredAlert['kind'],
      productId: (r.variant_id as string) ?? null,
      savedCartId: (r.saved_cart_id as string) ?? null,
      targetPrice: Number(r.target_price),
      active: r.active as boolean,
      createdAt: iso(r.created_at)!,
    };
  }

  async listAlerts(userId: string) {
    const { rows } = await this.pool.query('SELECT * FROM price_alerts WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return rows.map((r) => this.alertRow(r));
  }

  async createAlert(a: Omit<StoredAlert, 'id' | 'createdAt' | 'active'>) {
    const { rows } = await this.pool.query(
      `INSERT INTO price_alerts (user_id, kind, variant_id, saved_cart_id, target_price) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [a.userId, a.kind, a.productId, a.savedCartId, a.targetPrice],
    );
    return this.alertRow(rows[0]);
  }

  async deleteAlert(userId: string, id: string) {
    const { rowCount } = await this.pool.query('DELETE FROM price_alerts WHERE id = $1 AND user_id = $2', [id, userId]);
    return (rowCount ?? 0) > 0;
  }

  private comparisonRow(r: Record<string, unknown>): StoredComparison {
    return {
      id: r.id as string,
      userId: r.user_id as string,
      savedCartId: (r.saved_cart_id as string) ?? null,
      createdAt: iso(r.created_at)!,
      purchasedAt: iso(r.purchased_at),
      sample: r.sample as boolean,
      recommendedTotal: num(r.recommended_total),
      savings: Number(r.savings),
      orderCount: Number(r.order_count),
      platforms: r.platforms as PlatformId[],
      response: (r.result as StoredComparison['response']) ?? null,
    };
  }

  async saveComparison(c: StoredComparison) {
    await this.pool.query(
      `INSERT INTO comparison_results (id, user_id, saved_cart_id, preference, recommended_total, savings, order_count, platforms, result, sample, created_at, purchased_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [c.id, c.userId, c.savedCartId, c.response?.result.preference ?? null, c.recommendedTotal, c.savings, c.orderCount, c.platforms, c.response, c.sample, c.createdAt, c.purchasedAt],
    );
  }

  async getComparison(userId: string, id: string) {
    const { rows } = await this.pool.query('SELECT * FROM comparison_results WHERE id = $1 AND user_id = $2', [id, userId]);
    return rows[0] ? this.comparisonRow(rows[0]) : null;
  }

  async markPurchased(userId: string, id: string) {
    const { rows } = await this.pool.query(
      `UPDATE comparison_results SET purchased_at = COALESCE(purchased_at, now()) WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId],
    );
    return rows[0] ? this.comparisonRow(rows[0]) : null;
  }

  async listPurchasedComparisons(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, saved_cart_id, created_at, purchased_at, sample, recommended_total, savings, order_count, platforms, NULL AS result
       FROM comparison_results WHERE user_id = $1 AND purchased_at IS NOT NULL ORDER BY purchased_at DESC LIMIT 500`,
      [userId],
    );
    return rows.map((r) => this.comparisonRow(r));
  }

  async listRecentComparisons(userId: string, limit: number) {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, saved_cart_id, created_at, purchased_at, sample, recommended_total, savings, order_count, platforms,
              jsonb_build_object('location', result->'location', 'items', jsonb_path_query_array(result, '$.items[*].itemId')) AS result
       FROM comparison_results WHERE user_id = $1 AND NOT sample ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map((r) => this.comparisonRow(r));
  }

  async addSampleSavings(_userId: string, entries: StoredComparison[]) {
    for (const e of entries) await this.saveComparison(e);
  }

  async clearSampleSavings(userId: string) {
    await this.pool.query('DELETE FROM comparison_results WHERE user_id = $1 AND sample', [userId]);
  }

  async recordPrices(snapshots: PriceSnapshot[]) {
    if (!snapshots.length) return;
    const values: unknown[] = [];
    const tuples = snapshots.map((s, i) => {
      values.push(s.productId, s.platform, s.pincode, s.date, s.price, s.mrp);
      const o = i * 6;
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6})`;
    });
    await this.pool.query(
      `INSERT INTO variant_price_snapshots (variant_id, platform_id, pincode, recorded_on, price, mrp) VALUES ${tuples.join(', ')}
       ON CONFLICT (variant_id, pincode, recorded_on, platform_id) DO UPDATE SET price = EXCLUDED.price, mrp = EXCLUDED.mrp`,
      values,
    );
  }

  async priceSnapshots(productId: string, pincode: string, sinceDate: string) {
    const { rows } = await this.pool.query(
      `SELECT variant_id, platform_id, pincode, to_char(recorded_on, 'YYYY-MM-DD') AS d, price, mrp FROM variant_price_snapshots
       WHERE variant_id = $1 AND pincode = $2 AND recorded_on >= $3 ORDER BY recorded_on`,
      [productId, pincode, sinceDate],
    );
    return rows.map((r) => ({ productId: r.variant_id, platform: r.platform_id, pincode: r.pincode, date: r.d, price: Number(r.price), mrp: Number(r.mrp) }));
  }

  async close() {
    await this.pool.end();
  }
}
