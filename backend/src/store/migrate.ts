import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { PLATFORMS, PLATFORM_IDS } from '@savesmart/shared';
import { DEMO_CATALOG, DEMO_LOCATIONS } from '@savesmart/platform-adapters';

const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../database/schema.sql');

/** Creates or updates the tables (the schema is idempotent). */
export async function applySchema(client: pg.ClientBase) {
  await client.query(readFileSync(schemaPath, 'utf8'));
}

/** Platforms, reference locations and SaveSmart's product catalog. No prices: those come from the feed or the community. */
export async function seedCatalog(client: pg.ClientBase) {
  for (const id of PLATFORM_IDS) {
    const p = PLATFORMS[id];
    await client.query(
      `INSERT INTO platforms (id, name, website_url) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, website_url = EXCLUDED.website_url`,
      [id, p.name, p.websiteUrl],
    );
  }
  const locationIds = new Map<string, number>();
  for (const l of DEMO_LOCATIONS) {
    const { rows } = await client.query(
      `INSERT INTO locations (city, area, pincode) VALUES ($1, $2, $3)
       ON CONFLICT (pincode, area) DO UPDATE SET city = EXCLUDED.city RETURNING id`,
      [l.city, l.area, l.pincode],
    );
    locationIds.set(l.pincode, rows[0].id);
  }
  for (const product of DEMO_CATALOG) {
    const familyId = `${product.brand} ${product.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await client.query(
      `INSERT INTO products (id, brand, name, category, popularity) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET popularity = GREATEST(products.popularity, EXCLUDED.popularity)`,
      [familyId, product.brand, product.name, product.category, product.popularity],
    );
    await client.query(
      `INSERT INTO product_variants (id, product_id, variant, size_value, size_unit, pack_count, mrp, emoji, keywords)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET mrp = EXCLUDED.mrp, keywords = EXCLUDED.keywords`,
      [product.id, familyId, product.variant, product.size.value, product.size.unit, product.packCount, product.mrp, product.emoji, product.keywords],
    );
  }
  return locationIds;
}

/** Run at server start, so a fresh database (e.g. on a free hosting tier) needs no manual setup. */
export async function migrate(client: pg.ClientBase) {
  await client.query('BEGIN');
  try {
    // Two instances starting together must not migrate at the same time.
    await client.query('SELECT pg_advisory_xact_lock(424242)');
    await applySchema(client);
    await seedCatalog(client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}
