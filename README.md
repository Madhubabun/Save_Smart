# SaveSmart

**Shop smarter. Save more.** · *Your cart. Every store. The lowest total.*

SaveSmart compares a whole shopping cart across India's quick-commerce apps (Blinkit, Zepto, Swiggy Instamart, BigBasket / BB Now) and finds the cheapest way to buy **everything**: the cheapest single app, or a smart split across apps when that lowers the **final payable amount** after delivery, platform, handling, small-cart and surge fees, coupons and minimum order values.

> "I put my grocery list into SaveSmart, and it tells me the cheapest way to buy everything."

> **Prices are demo data.** No platform offers a public price API, and SaveSmart does not scrape or bypass any access controls. All prices come from the `DemoDataProvider` and are labelled **Demo prices** everywhere in the app. A licensed data provider can replace it without touching the rest of the system (see [Going live](#going-live)).

## Quick start

Requires Node 20+.

```bash
npm install
npm run dev          # API on :8787, web app on http://localhost:5173
```

Open the app and tap **Try Demo**, or paste:

```
Milk 2
Bread 1
Eggs 12
Tomatoes 1kg
Rice 5kg
Biscuits 2
```

In Bengaluru (Whitefield, 560066) the cheapest single app is BigBasket at ₹792; SaveSmart's split (BigBasket ₹473 + Zepto ₹279) costs ₹752, so you save ₹40.

Production build (the API also serves the web app):

```bash
npm run build
npm start            # http://localhost:8787
```

### With PostgreSQL

Without `DATABASE_URL` the API uses an in-memory store (data resets on restart). To persist:

```bash
export DATABASE_URL=postgres://user:pass@localhost:5432/savesmart
npm run db:schema    # applies database/schema.sql (idempotent)
npm run db:seed      # platforms, locations, catalog, matched listings, demo prices + 30-day history
npm start
```

## Tests

```bash
npm test             # optimization engine, matching, adapters, API
npm run typecheck
TEST_DATABASE_URL=postgres://... npm test   # also runs the PostgreSQL store test
```

`tests/optimizer.test.ts` covers the 12 required scenarios: one platform cheapest, two-platform split, split that loses to delivery fees, minimum order value, unavailable product, different pack sizes must not match, quantity > 1, coupon changes the winner, three-platform split, and the "minimum orders", "maximum savings" and "prefer one platform" preferences. It also checks that local search matches exhaustive search and that a 40-item cart stays fast.

## How it works

```
Shopping list ─▶ parse (product, quantity, size) ─▶ resolve to catalog product (ask to confirm if ambiguous)
      │
      ▼
PlatformAdapters (parallel, per-platform timeout; a failing platform never fails the comparison)
      │  each adapter turns its platform's own raw format into a standard PlatformListing
      ▼
Product matching: brand + name + variant + normalized size (1 L = 1000 ml; 500 ml ≠ 1 L; 2 × 6 eggs = 12 eggs, labelled)
      ▼
Optimization engine: minimize final payable total = products − coupons + all fees, respecting minimum orders
      ▼
Cheapest single app · cheapest split · simplest option ─▶ user preference ─▶ recommendation + savings
```

### Optimization engine (`optimization-engine/`)

- Fees depend on each order's subtotal (free-delivery thresholds, small-cart fees, coupon minimums, minimum order values), so the engine searches over **assignments of items to platforms** and prices every order with the platform's full fee schedule.
- Realistic carts are solved **exactly** (exhaustive search, e.g. 6 items × 4 apps = 4,096 assignments in a few ms). Above 200k assignments it switches to **local search** per subset of platforms (single-item moves plus "empty a platform" moves that escape fixed-fee local minima).
- It keeps the best plan for every set of platforms, which yields the cheapest overall, the cheapest single app, the simplest option and the best plan for each number of orders.
- **Preferences:** *Maximum savings* (lowest total), *Fewer orders*, *Prefer one platform*, and *Balanced* (default): each extra order must save at least ₹25 or 3% of the cart, so SaveSmart never splits ₹100/₹101/₹102 into three orders to save ₹3. An optional maximum number of orders is also supported.
- Unavailable products are never silently dropped: they are reported per platform and, when nothing sells them, listed as excluded from totals.

### Product matching (`product-matching/`)

Parses sizes and units (kg/g/L/ml/pcs/dozen/multipacks), normalizes them to base units, and matches listings on brand, product identity and exact pack size. "Eggs 12" means one 12-egg tray; "Tomatoes 2kg" becomes 2 × 1 kg when there is no 2 kg pack; "Milk 2" picks the most popular milk and asks the user to confirm between brands. Hindi names and typos are understood (`aloo`, `tamatar`, `tomatos`).

### Platform data (`platform-adapters/`)

`PlatformAdapter` is the only contract the app knows. `BlinkitAdapter`, `ZeptoAdapter`, `InstamartAdapter` and `BigBasketAdapter` each read a different raw record format (prices in rupees vs paise, different stock and size fields) from a `PlatformSource` and return the standardized listing: `productId, platform, productName, brand, variant, quantity, unit, price, mrp, discount, availability, deliveryFee, platformFee, handlingFee, productUrl, lastUpdated, location`.

The `DemoDataProvider` covers **63 products**, 11 locations in 7 cities (with city-level price differences, area surge fees and platforms that don't deliver everywhere), out-of-stock and unlisted products, coupons, memberships and minimum order values.

### Going live

Implement `PlatformSource<TRaw>` against a licensed, permitted data source (official partner API or feed) and pass it to the existing adapter, or write a new adapter class. Nothing else changes: the optimization engine and UI only see `PlatformListing` and `FeeSchedule`. Never bypass authentication, CAPTCHAs or anti-bot systems.

## Project structure

| Folder | What's in it |
|---|---|
| `frontend/` | React + TypeScript + Vite + Tailwind web app (mobile-first, light/dark mode) |
| `backend/` | Node + TypeScript API (Express), services, memory and PostgreSQL stores, seed script |
| `database/` | `schema.sql`: users, sessions, products, variants, platforms, platform products, prices, price history, locations, carts, cart items, saved carts, comparison results, preferences, price alerts, sponsored placements; with indexes |
| `optimization-engine/` | Pure, isolated cart optimizer and fee calculator |
| `product-matching/` | Size/unit normalization, list parsing, product resolution and listing matching |
| `platform-adapters/` | `PlatformAdapter` interface, four adapters, `DemoDataProvider` and demo catalog |
| `shared/` | Domain and API types, formatting helpers |
| `tests/` | Vitest suites |

## API

All responses use `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/session` | Start an anonymous session (returns a bearer token) |
| POST | `/api/cart` | Turn a pasted list or entries into cart items |
| POST | `/api/cart/compare` | Compare and optimize a cart |
| GET | `/api/comparisons/:id` | Fetch a comparison |
| POST | `/api/comparisons/:id/purchase` | Record that the user continued to a platform (feeds My Savings) |
| GET | `/api/products/search?q=` | Search the catalog |
| GET | `/api/products/:id/prices` | Current prices and 30-day history |
| GET | `/api/platforms`, `/api/locations` | Reference data |
| GET/PUT | `/api/preferences` | Location, saving preference, memberships, max orders |
| GET/POST/PUT/DELETE | `/api/saved-carts` | Recurring carts |
| GET/POST/DELETE | `/api/price-alerts` | Product and basket alerts (evaluated on read) |
| GET | `/api/savings` | Savings dashboard |

## Security

Input validation on every endpoint (zod), per-IP rate limiting (stricter for comparisons), opaque bearer tokens stored only as SHA-256 hashes, parameterized SQL, security headers, a 64 KB body limit, generic error messages to clients, and logs that contain only method, path, status and duration. Configuration comes from environment variables (`.env.example`); there are no API keys in the frontend. Sessions are anonymous today; phone/OTP or OAuth login can issue the same kind of token.

## Ready for later

The architecture leaves room for: an AI shopping assistant (the engine already supports budgets via `maxOrders` and preference switching), voice/OCR/barcode list input (they produce the same `CreateCartRequest`), price-drop notifications (alerts are stored and evaluated), coupon and membership optimization (both already modelled in fees), affiliate links (`productUrl`), and **sponsored placements, which live in their own table and can never influence comparison results**.
