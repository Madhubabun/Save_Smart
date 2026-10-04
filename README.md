# SaveSmart

**Shop smarter. Save more.** · *Your cart. Every store. The lowest total.*

SaveSmart compares a whole shopping cart across India's quick-commerce apps (Blinkit, Zepto, Swiggy Instamart, BigBasket / BB Now) and finds the cheapest way to buy **everything**: the cheapest single app, or a smart split across apps when that lowers the **final payable amount** after delivery, platform, handling, small-cart and surge fees, coupons and minimum order values.

> "I put my grocery list into SaveSmart, and it tells me the cheapest way to buy everything."

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Madhubabun/Save_Smart)

## Where prices come from

None of the apps offers a public price API, and SaveSmart never scrapes them or gets around their protections. Real prices come from two sources, layered:

1. **A licensed price feed** (optional): a price-data provider plugs in through one small contract. See [docs/price-feed.md](docs/price-feed.md).
2. **Community prices:** what SaveSmart users saw in the apps and shared, by city and pincode. A price is the median of recent reports nearby, each person counts once, typos are rejected, and reports expire after 3 days. Delivery, handling and other fees are shared the same way.

The feed is used first and community prices fill its gaps. Every price in the app shows when it was last seen. Items nobody has priced yet are listed as "no recent price", never guessed, with a quick way to fill them in.

Generated demo data (`PRICE_SOURCE=demo`) exists only for development and tests, and is labelled **Demo prices** wherever it appears.

## What you can do

- **Fill in missing prices** in a few taps: open the app, type what you see, and everyone nearby gets it next time.
- **Compare a whole cart** by searching, pasting a list ("Milk 2, Bread 1, Eggs 12") or adding items manually, and get the cheapest single app, the cheapest split and a recommended plan for your saving style.
- **Smart swaps:** SaveSmart suggests a different pack size of the same product, or the same kind of product from another brand (basmati for basmati, toned milk for toned milk), in exactly the same amount. A swap is only shown when it lowers the **whole plan total**, fees and order splits included. One tap applies it and re-runs the comparison.
- **Shop the plan:** each order has an "Open" button to continue on that app, a checklist to tick items off as you add them (remembered on the device), and **Share plan** to send the list to someone else.
- **Monthly budget:** set a grocery budget once. Results show how much of it a plan uses and warn you before a cart goes over; My Savings shows this month's spend against it.
- **Pick up where you left off:** Home shows your unfinished cart, recent comparisons and any price alerts that were reached.
- **Saved carts, price history and alerts** for products and whole baskets, a **savings dashboard**, dark mode, and an **installable app** (PWA) that opens instantly from the home screen.

## Quick start

Requires Node 20+.

```bash
npm install
npm run dev          # API on :8787, web app on http://localhost:5173
```

Open the app and tap **Try a sample list**, or paste:

```
Milk 2
Bread 1
Eggs 12
Tomatoes 1kg
Rice 5kg
Biscuits 2
```

With a fresh install there are no prices yet: share a few from the "Fill in missing prices" screen, or run with `PRICE_SOURCE=demo` to explore with generated data (in Bengaluru, Whitefield 560066, the demo split costs ₹752 against ₹792 for the cheapest single app).

Production build (the API also serves the web app):

```bash
npm run build
npm start            # http://localhost:8787
```

### With PostgreSQL

Without `DATABASE_URL` the API uses an in-memory store (data resets on restart). To persist:

```bash
export DATABASE_URL=postgres://user:pass@localhost:5432/savesmart
npm start            # creates the tables and loads the product catalog on first start
```

`npm run db:schema` and `npm run db:seed` do the same by hand; `npm run db:seed -- --demo` also adds demo listings and history for development.

### Put it online (installable app link)

Click **Deploy to Render** above (free tier): it creates the web app and a PostgreSQL database from `render.yaml`. Leave `PRICE_FEED_URL` and `PRICE_FEED_KEY` empty to start with community prices, or fill them in for your licensed feed. Open the URL Render gives you on your phone and choose **Add to Home Screen** / **Install app**. Free services sleep when idle, so the first open after a while takes a little longer.

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

Real prices come from `FeedAdapter` (licensed feed, `platform-adapters/src/feed/`) layered over `CommunityAdapter` (shared reports, `backend/src/services/community.ts`). For development, the `DemoDataProvider` covers **64 products**, 11 locations in 7 cities (with city-level price differences, area surge fees and platforms that don't deliver everywhere), out-of-stock and unlisted products, coupons, memberships and minimum order values.

### Connecting a price feed

Set `PRICE_FEED_URL` and `PRICE_FEED_KEY` (see [docs/price-feed.md](docs/price-feed.md) for the contract). Nothing else changes: the optimization engine and UI only see `PlatformListing` and `FeeSchedule`. Never bypass authentication, CAPTCHAs or anti-bot systems.

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
| GET | `/api/comparisons` | Recent comparisons for this user |
| GET | `/api/comparisons/:id` | Fetch a comparison (includes smart swaps) |
| POST | `/api/comparisons/:id/purchase` | Record that the user continued to a platform (feeds My Savings) |
| GET | `/api/products/search?q=` | Search the catalog |
| GET | `/api/products/:id/prices` | Current prices and 30-day history |
| GET | `/api/platforms`, `/api/locations` | Reference data |
| GET/PUT | `/api/preferences` | Location, saving preference, memberships, max orders, monthly budget |
| GET/POST/PUT/DELETE | `/api/saved-carts` | Recurring carts |
| GET/POST/DELETE | `/api/price-alerts` | Product and basket alerts (evaluated on read) |
| GET | `/api/savings` | Savings dashboard, this month's spend and budget |
| GET | `/api/prices?ids=` | Latest known prices and fee status for products in your area |
| POST | `/api/prices/report` | Share a price (or "out of stock") you saw in an app |
| POST | `/api/fees/report` | Share an app's fees from its bill |

## Security

Input validation on every endpoint (zod), per-IP rate limiting (stricter for comparisons), opaque bearer tokens stored only as SHA-256 hashes, parameterized SQL, security headers, a 64 KB body limit, generic error messages to clients, and logs that contain only method, path, status and duration. Configuration comes from environment variables (`.env.example`); there are no API keys in the frontend. Sessions are anonymous today; phone/OTP or OAuth login can issue the same kind of token.

## Ready for later

The architecture leaves room for: an AI shopping assistant (the engine already supports budgets via `maxOrders` and preference switching), voice/OCR/barcode list input (they produce the same `CreateCartRequest`), price-drop notifications (alerts are stored and evaluated), coupon and membership optimization (both already modelled in fees), affiliate links (`productUrl`), and **sponsored placements, which live in their own table and can never influence comparison results**.
