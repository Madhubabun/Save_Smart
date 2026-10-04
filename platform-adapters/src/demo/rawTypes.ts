/**
 * Raw record shapes as each platform's data source returns them. They are
 * deliberately different from one another (as real platforms are); adapters
 * turn them into the standardized PlatformListing.
 */

export interface BlinkitRawProduct {
  prid: number;
  name: string;
  brand: string;
  /** e.g. "1 l", "500 g", "6 pieces", "4 x 100 g" */
  unit: string;
  price: number;
  mrp: number;
  /** Units in stock at the dark store. 0 = sold out. */
  inventory: number;
  slug: string;
  updated_at: number;
}

export interface ZeptoRawProduct {
  id: string;
  productName: string;
  brandName: string;
  /** e.g. "1000 ml", "1 kg", "12 pcs" */
  packsize: string;
  /** Paise. */
  sellingPrice: number;
  /** Paise. */
  mrp: number;
  outOfStock: boolean;
  lowStock: boolean;
  lastSyncedAt: string;
}

export interface InstamartRawProduct {
  item_id: string;
  display_name: string;
  brand: string | null;
  quantity_label: string;
  offer_price: number;
  store_price: number;
  in_stock: 0 | 1;
  max_allowed_quantity: number;
  ts: string;
}

export interface BigBasketRawProduct {
  sku: number;
  desc: string;
  brand: { name: string };
  /** e.g. "1 L", "5 kg" */
  w: string;
  pricing: { discount: { mrp: string; prim_price: { sp: string } } };
  /** "A" available, "L" limited, "O" out of stock */
  availability: { avail_status: 'A' | 'L' | 'O' };
  absolute_url: string;
  updated: string;
}

export interface RawFees {
  delivery_fee: number;
  free_delivery_above: number | null;
  platform_fee: number;
  handling_fee: number;
  small_cart_fee: number;
  small_cart_below: number;
  surge_fee: number;
  surge_reason?: string;
  min_order_value: number;
  offers: { code: string; text: string; kind: 'flat' | 'percent'; value: number; min_order: number; cap?: number; members_only?: boolean }[];
  membership?: { name: string; free_delivery_above: number; waives_small_cart_fee: boolean };
}
