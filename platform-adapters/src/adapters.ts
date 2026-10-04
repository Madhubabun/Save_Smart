import { round2, type FeeSchedule, type Location, type PlatformId, type PlatformListing } from '@savesmart/shared';
import { BaseAdapter, packFields } from './PlatformAdapter.js';
import type { BigBasketRawProduct, BlinkitRawProduct, InstamartRawProduct, ZeptoRawProduct } from './demo/rawTypes.js';

function feeFields(fees: FeeSchedule): Pick<PlatformListing, 'deliveryFee' | 'platformFee' | 'handlingFee'> {
  return { deliveryFee: fees.deliveryFee, platformFee: fees.platformFee, handlingFee: fees.handlingFee };
}

export class BlinkitAdapter extends BaseAdapter<BlinkitRawProduct> {
  readonly id: PlatformId = 'blinkit';

  protected normalize(raw: BlinkitRawProduct, location: Location, fees: FeeSchedule): PlatformListing {
    return {
      productId: String(raw.prid),
      platform: this.id,
      productName: raw.name,
      brand: raw.brand,
      variant: '',
      ...packFields(raw.unit),
      price: raw.price,
      mrp: raw.mrp,
      discount: round2(raw.mrp - raw.price),
      availability: raw.inventory <= 0 ? 'out_of_stock' : raw.inventory < 5 ? 'limited' : 'in_stock',
      ...feeFields(fees),
      productUrl: raw.slug,
      lastUpdated: new Date(raw.updated_at * 1000).toISOString(),
      location,
      dataSource: this.dataSource,
    };
  }
}

export class ZeptoAdapter extends BaseAdapter<ZeptoRawProduct> {
  readonly id: PlatformId = 'zepto';

  protected normalize(raw: ZeptoRawProduct, location: Location, fees: FeeSchedule): PlatformListing {
    const price = raw.sellingPrice / 100;
    const mrp = raw.mrp / 100;
    return {
      productId: raw.id,
      platform: this.id,
      productName: raw.productName,
      brand: raw.brandName,
      variant: '',
      ...packFields(raw.packsize),
      price,
      mrp,
      discount: round2(mrp - price),
      availability: raw.outOfStock ? 'out_of_stock' : raw.lowStock ? 'limited' : 'in_stock',
      ...feeFields(fees),
      productUrl: `https://www.zeptonow.com/search?query=${encodeURIComponent(raw.productName)}`,
      lastUpdated: raw.lastSyncedAt,
      location,
      dataSource: this.dataSource,
    };
  }
}

export class InstamartAdapter extends BaseAdapter<InstamartRawProduct> {
  readonly id: PlatformId = 'instamart';

  protected normalize(raw: InstamartRawProduct, location: Location, fees: FeeSchedule): PlatformListing {
    // Instamart names carry the size after " - "; the name itself is what we match on.
    const name = raw.display_name.split(' - ')[0];
    return {
      productId: raw.item_id,
      platform: this.id,
      productName: name,
      brand: raw.brand ?? '',
      variant: '',
      ...packFields(raw.quantity_label),
      price: raw.offer_price,
      mrp: raw.store_price,
      discount: round2(raw.store_price - raw.offer_price),
      availability: raw.in_stock ? (raw.max_allowed_quantity <= 2 ? 'limited' : 'in_stock') : 'out_of_stock',
      ...feeFields(fees),
      productUrl: `https://www.swiggy.com/instamart/search?query=${encodeURIComponent(name)}`,
      lastUpdated: raw.ts,
      location,
      dataSource: this.dataSource,
    };
  }
}

export class BigBasketAdapter extends BaseAdapter<BigBasketRawProduct> {
  readonly id: PlatformId = 'bigbasket';

  protected normalize(raw: BigBasketRawProduct, location: Location, fees: FeeSchedule): PlatformListing {
    const price = parseFloat(raw.pricing.discount.prim_price.sp);
    const mrp = parseFloat(raw.pricing.discount.mrp);
    // "Fresho Hybrid Tomato, 1 kg": the part before the comma is the name.
    const name = raw.desc.split(',')[0];
    return {
      productId: String(raw.sku),
      platform: this.id,
      productName: name,
      brand: raw.brand.name,
      variant: '',
      ...packFields(raw.w),
      price,
      mrp,
      discount: round2(mrp - price),
      availability: raw.availability.avail_status === 'O' ? 'out_of_stock' : raw.availability.avail_status === 'L' ? 'limited' : 'in_stock',
      ...feeFields(fees),
      productUrl: raw.absolute_url,
      lastUpdated: raw.updated,
      location,
      dataSource: this.dataSource,
    };
  }
}
