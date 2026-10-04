/**
 * Seeds PostgreSQL with platforms, locations, fee schedules, the canonical
 * catalog, each platform's listings (matched to the catalog by the product
 * matcher), current DEMO prices and 30 days of DEMO price history.
 *
 *   DATABASE_URL=postgres://... npm run db:seed
 */
import pg from 'pg';
import { PLATFORMS, PLATFORM_IDS } from '@savesmart/shared';
import { matchProduct } from '@savesmart/product-matching';
import { DEMO_CATALOG, DEMO_LOCATIONS, DemoDataProvider, createDemoAdapters, productTitle } from '@savesmart/platform-adapters';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to seed the database.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const provider = new DemoDataProvider();
const adapters = createDemoAdapters(provider);

try {
  await client.query('BEGIN');

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
    for (const platform of l.serviceable) {
      await client.query('INSERT INTO platform_locations VALUES ($1, $2) ON CONFLICT DO NOTHING', [platform, rows[0].id]);
    }
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

  let listingCount = 0;
  let historyCount = 0;
  for (const loc of DEMO_LOCATIONS) {
    const locationId = locationIds.get(loc.pincode)!;
    for (const adapter of adapters) {
      if (!loc.serviceable.includes(adapter.id)) continue;
      await client.query(
        `INSERT INTO platform_fee_schedules (platform_id, location_id, fees, data_source) VALUES ($1, $2, $3, 'demo')
         ON CONFLICT (platform_id, location_id) DO UPDATE SET fees = EXCLUDED.fees, updated_at = now()`,
        [adapter.id, locationId, await adapter.getFees(loc)],
      );
      for (const product of DEMO_CATALOG) {
        const listings = await adapter.search(productTitle(product), loc, 15);
        const match = matchProduct(product, listings);
        if (!match || match.kind !== 'exact') continue;
        const l = match.listing;
        const { rows } = await client.query(
          `INSERT INTO platform_products (platform_id, external_id, variant_id, match_score, title, brand, size_value, size_unit, pack_count, product_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (platform_id, external_id) DO UPDATE SET variant_id = EXCLUDED.variant_id, match_score = EXCLUDED.match_score
           RETURNING id`,
          [adapter.id, l.productId, product.id, match.score, l.productName, l.brand, l.quantity, l.unit, l.packCount, l.productUrl],
        );
        const ppId = rows[0].id;
        await client.query(
          `INSERT INTO prices (platform_product_id, location_id, price, mrp, availability, data_source, fetched_at)
           VALUES ($1, $2, $3, $4, $5, 'demo', $6)
           ON CONFLICT (platform_product_id, location_id) DO UPDATE SET price = EXCLUDED.price, mrp = EXCLUDED.mrp,
             availability = EXCLUDED.availability, fetched_at = EXCLUDED.fetched_at`,
          [ppId, locationId, l.price, l.mrp, l.availability, l.lastUpdated],
        );
        listingCount++;
        for (const point of provider.history(product, adapter.id, loc)) {
          await client.query(
            `INSERT INTO price_history (platform_product_id, location_id, price, mrp, recorded_on) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (platform_product_id, location_id, recorded_on) DO UPDATE SET price = EXCLUDED.price`,
            [ppId, locationId, point.price, l.mrp, point.date],
          );
          historyCount++;
        }
      }
    }
  }

  await client.query('COMMIT');
  console.log(`Seeded ${DEMO_CATALOG.length} products, ${DEMO_LOCATIONS.length} locations, ${listingCount} platform listings, ${historyCount} history rows (all DEMO data).`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  await client.end();
}
