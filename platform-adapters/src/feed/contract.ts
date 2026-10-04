/**
 * The price-feed contract SaveSmart's server speaks. A licensed provider is
 * connected either by exposing these three endpoints directly or through a
 * thin mapping proxy (see docs/price-feed.md). All money is in rupees.
 *
 *   GET {base}/listings?platform=zepto&pincode=560066&q=amul%20taaza%20toned%20milk&limit=15
 *   GET {base}/fees?platform=zepto&pincode=560066
 *   GET {base}/serviceability?platform=zepto&pincode=560066
 *
 * Every request carries `Authorization: Bearer <PRICE_FEED_KEY>`.
 */

export interface FeedListing {
  /** The provider's id for the listing on that platform. */
  id: string;
  name: string;
  brand: string;
  /** Pack size as printed, e.g. "1 L", "500 g", "4 x 100 g", "12 pcs". */
  pack: string;
  price: number;
  mrp: number;
  stock: 'in_stock' | 'limited' | 'out_of_stock';
  url?: string;
  /** ISO time the provider last observed this price. */
  observed_at: string;
}

export interface FeedListingsResponse {
  listings: FeedListing[];
}

export interface FeedFees {
  delivery_fee: number;
  free_delivery_above: number | null;
  platform_fee: number;
  handling_fee: number;
  small_cart_fee: number;
  small_cart_below: number;
  surge_fee: number;
  surge_reason?: string;
  min_order_value: number;
  observed_at: string;
}

export interface FeedServiceability {
  serviceable: boolean;
}
