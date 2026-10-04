# Connecting a licensed price feed

SaveSmart never scrapes Blinkit, Zepto, Instamart or BigBasket and never works around their access controls. Live prices come from a **licensed price-data provider** (companies that track quick-commerce prices and sell API access). The server talks to any provider through one small contract, so switching providers never touches the comparison engine or the app.

## Turn it on

```bash
PRICE_SOURCE=feed            # optional: implied when PRICE_FEED_URL is set
PRICE_FEED_URL=https://feed.example.com/v1
PRICE_FEED_KEY=...           # secret: set it in your host's environment, never in the repo
npm start
```

The server refuses to start in feed mode without both values, and requires `https` (plain `http` is only accepted for `localhost`). Without a feed it runs on clearly labelled demo data for development.

Build the web app against the server with `VITE_PRICE_SOURCE=server npm run build -w @savesmart/frontend`.

## The contract

Every request carries `Authorization: Bearer <PRICE_FEED_KEY>`. Money is in rupees. Responses are cached for two minutes per request.

| Request | Response |
|---|---|
| `GET /listings?platform=zepto&pincode=560066&city=Bengaluru&q=Amul%20Taaza%20Toned%20Milk&limit=15` | `{ "listings": [{ "id", "name", "brand", "pack": "1 L", "price", "mrp", "stock": "in_stock" \| "limited" \| "out_of_stock", "url"?, "observed_at" }] }` |
| `GET /fees?platform=zepto&pincode=560066&city=Bengaluru` | `{ "delivery_fee", "free_delivery_above" \| null, "platform_fee", "handling_fee", "small_cart_fee", "small_cart_below", "surge_fee", "surge_reason"?, "min_order_value", "observed_at" }` |
| `GET /serviceability?platform=zepto&pincode=560066` | `{ "serviceable": true }` |

`platform` is one of `blinkit`, `zepto`, `instamart`, `bigbasket`. The types are in `platform-adapters/src/feed/contract.ts` and the client in `platform-adapters/src/feed/FeedAdapter.ts`.

If a provider's API looks different, put a thin proxy in front of it that maps its responses to these three endpoints. SaveSmart's product matching then pairs the provider's listings with its own catalog (sizes normalized, equivalent packs such as 2 × 500 ml labelled).

## What happens when the feed has problems

A platform whose request fails or times out is skipped with a notice ("Zepto prices couldn't be retrieved"), and the comparison continues with the others. Listings carry `observed_at`, shown in the app as "updated 5 min ago".
