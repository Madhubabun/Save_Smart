-- SaveSmart PostgreSQL schema.
-- Apply with: psql "$DATABASE_URL" -f database/schema.sql   (idempotent)
-- Money is stored as numeric(10,2) rupees. Sizes are stored in base units (g, ml, pcs).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Users and authentication
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY,
  is_anonymous  boolean NOT NULL DEFAULT true,
  display_name  text,
  phone         text UNIQUE,
  email         text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Opaque bearer tokens; only the SHA-256 hash is stored.
CREATE TABLE IF NOT EXISTS user_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id);

-- ---------------------------------------------------------------------------
-- Locations and platforms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id       serial PRIMARY KEY,
  city     text NOT NULL,
  area     text NOT NULL,
  pincode  text NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  UNIQUE (pincode, area)
);
CREATE INDEX IF NOT EXISTS locations_city_idx ON locations (lower(city));

CREATE TABLE IF NOT EXISTS platforms (
  id           text PRIMARY KEY,               -- 'blinkit', 'zepto', ...
  name         text NOT NULL,
  website_url  text NOT NULL,
  active       boolean NOT NULL DEFAULT true
);

-- Which platform delivers where.
CREATE TABLE IF NOT EXISTS platform_locations (
  platform_id  text NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  location_id  int  NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  PRIMARY KEY (platform_id, location_id)
);

-- Delivery/platform/handling/small-cart/surge fees, minimum order, coupons, membership: per platform per location.
CREATE TABLE IF NOT EXISTS platform_fee_schedules (
  platform_id  text NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  location_id  int  NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  fees         jsonb NOT NULL,
  data_source  text NOT NULL CHECK (data_source IN ('demo', 'live')),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
-- A product line, e.g. "Amul Taaza Toned Milk".
CREATE TABLE IF NOT EXISTS products (
  id          text PRIMARY KEY,
  brand       text NOT NULL DEFAULT '',
  name        text NOT NULL,
  category    text NOT NULL,
  popularity  smallint NOT NULL DEFAULT 50 CHECK (popularity BETWEEN 0 AND 100),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);
CREATE INDEX IF NOT EXISTS products_search_trgm_idx ON products USING gin (lower(brand || ' ' || name) gin_trgm_ops);

-- A purchasable pack of a product, e.g. "Amul Taaza Toned Milk 1 L". This is SaveSmart's canonical item.
CREATE TABLE IF NOT EXISTS product_variants (
  id          text PRIMARY KEY,
  product_id  text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant     text NOT NULL DEFAULT '',
  size_value  numeric(12,3) NOT NULL CHECK (size_value > 0),
  size_unit   text NOT NULL CHECK (size_unit IN ('g', 'ml', 'pcs')),
  pack_count  smallint NOT NULL DEFAULT 1 CHECK (pack_count > 0),
  mrp         numeric(10,2),
  emoji       text,
  keywords    text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants (product_id);
CREATE INDEX IF NOT EXISTS product_variants_keywords_idx ON product_variants USING gin (keywords);

-- A platform's own listing, linked to a canonical variant by the matcher.
CREATE TABLE IF NOT EXISTS platform_products (
  id           bigserial PRIMARY KEY,
  platform_id  text NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  external_id  text NOT NULL,
  variant_id   text REFERENCES product_variants(id) ON DELETE SET NULL,
  match_score  numeric(4,3),
  title        text NOT NULL,
  brand        text NOT NULL DEFAULT '',
  size_value   numeric(12,3) NOT NULL,
  size_unit    text NOT NULL CHECK (size_unit IN ('g', 'ml', 'pcs')),
  pack_count   smallint NOT NULL DEFAULT 1,
  product_url  text,
  UNIQUE (platform_id, external_id)
);
CREATE INDEX IF NOT EXISTS platform_products_variant_idx ON platform_products (variant_id, platform_id);

-- Latest known price of a listing at a location.
CREATE TABLE IF NOT EXISTS prices (
  platform_product_id  bigint NOT NULL REFERENCES platform_products(id) ON DELETE CASCADE,
  location_id          int NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  price                numeric(10,2) NOT NULL CHECK (price >= 0),
  mrp                  numeric(10,2) NOT NULL CHECK (mrp >= 0),
  availability         text NOT NULL CHECK (availability IN ('in_stock', 'limited', 'out_of_stock')),
  data_source          text NOT NULL CHECK (data_source IN ('demo', 'live')),
  fetched_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform_product_id, location_id)
);
CREATE INDEX IF NOT EXISTS prices_location_idx ON prices (location_id);

-- One row per listing, location and day.
CREATE TABLE IF NOT EXISTS price_history (
  id                   bigserial PRIMARY KEY,
  platform_product_id  bigint NOT NULL REFERENCES platform_products(id) ON DELETE CASCADE,
  location_id          int NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  price                numeric(10,2) NOT NULL,
  mrp                  numeric(10,2) NOT NULL,
  recorded_on          date NOT NULL,
  UNIQUE (platform_product_id, location_id, recorded_on)
);
CREATE INDEX IF NOT EXISTS price_history_lookup_idx ON price_history (platform_product_id, location_id, recorded_on DESC);

-- Snapshots captured from comparisons, keyed by canonical variant (cheap to query for charts and alerts).
CREATE TABLE IF NOT EXISTS variant_price_snapshots (
  variant_id   text NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  platform_id  text NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  pincode      text NOT NULL,
  recorded_on  date NOT NULL,
  price        numeric(10,2) NOT NULL,
  mrp          numeric(10,2) NOT NULL,
  PRIMARY KEY (variant_id, pincode, recorded_on, platform_id)
);

-- ---------------------------------------------------------------------------
-- Preferences, carts, comparisons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preference   text NOT NULL DEFAULT 'balanced' CHECK (preference IN ('max_savings', 'min_orders', 'one_platform', 'balanced')),
  city         text NOT NULL,
  area         text NOT NULL,
  pincode      text NOT NULL,
  memberships  text[] NOT NULL DEFAULT '{}',
  max_orders   smallint CHECK (max_orders BETWEEN 1 AND 10),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carts_user_idx ON carts (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS cart_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id     uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id  text NOT NULL REFERENCES product_variants(id),
  quantity    smallint NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  query       text,
  position    smallint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cart_items_cart_idx ON cart_items (cart_id, position);

-- A named, recurring cart ("Weekly Groceries"). Its items live in the linked cart.
CREATE TABLE IF NOT EXISTS saved_carts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cart_id           uuid NOT NULL UNIQUE REFERENCES carts(id) ON DELETE CASCADE,
  name              text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_compared_at  timestamptz,
  last_total        numeric(10,2)
);
CREATE INDEX IF NOT EXISTS saved_carts_user_idx ON saved_carts (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS comparison_results (
  id                 uuid PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  saved_cart_id      uuid REFERENCES saved_carts(id) ON DELETE SET NULL,
  preference         text,
  recommended_total  numeric(10,2),
  savings            numeric(10,2) NOT NULL DEFAULT 0,
  order_count        smallint NOT NULL DEFAULT 0,
  platforms          text[] NOT NULL DEFAULT '{}',
  result             jsonb,
  sample             boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- set when the user continued to a platform with this plan
  purchased_at       timestamptz
);
CREATE INDEX IF NOT EXISTS comparison_results_user_idx ON comparison_results (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comparison_results_purchased_idx ON comparison_results (user_id, purchased_at DESC) WHERE purchased_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS price_alerts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('product', 'basket')),
  variant_id         text REFERENCES product_variants(id) ON DELETE CASCADE,
  saved_cart_id      uuid REFERENCES saved_carts(id) ON DELETE CASCADE,
  target_price       numeric(10,2) NOT NULL CHECK (target_price > 0),
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_triggered_at  timestamptz,
  CHECK ((kind = 'product' AND variant_id IS NOT NULL) OR (kind = 'basket' AND saved_cart_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS price_alerts_user_idx ON price_alerts (user_id) WHERE active;
CREATE INDEX IF NOT EXISTS price_alerts_variant_idx ON price_alerts (variant_id) WHERE active AND kind = 'product';

-- ---------------------------------------------------------------------------
-- Monetization (future): sponsored placements are stored separately and can
-- never influence comparison or optimization results.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sponsored_placements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id  text REFERENCES product_variants(id) ON DELETE CASCADE,
  platform_id text REFERENCES platforms(id) ON DELETE CASCADE,
  label       text NOT NULL DEFAULT 'Sponsored',
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL
);
