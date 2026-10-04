import { PLATFORMS, type CatalogProduct, type FeeSchedule, type Location, type PlatformId, type PlatformInfo, type PlatformListing } from '@savesmart/shared';
import { productTitle, type PlatformAdapter } from '@savesmart/platform-adapters';
import { platformSearchUrl } from '@savesmart/shared';
import { priceBook } from './priceBook';

/**
 * A platform adapter backed by the user's own price book. It plugs into the same
 * comparison service and optimizer as a licensed feed would: only the source differs.
 */
export class UserPriceAdapter implements PlatformAdapter {
  readonly dataSource = 'user' as const;

  constructor(
    readonly id: PlatformId,
    private readonly catalog: () => CatalogProduct[],
  ) {}

  get info(): PlatformInfo {
    return PLATFORMS[this.id];
  }

  async isServiceable(): Promise<boolean> {
    return true;
  }

  async getFees(): Promise<FeeSchedule> {
    return priceBook.feeSchedule(this.id);
  }

  /** Returns listings only for products the user has checked on this app. */
  async search(query: string, location: Location): Promise<PlatformListing[]> {
    const q = query.trim().toLowerCase();
    const fees = priceBook.feeSchedule(this.id);
    return this.catalog()
      .filter((p) => productQuery(p).toLowerCase() === q)
      .flatMap((p) => {
        const e = priceBook.get(p.id, this.id);
        if (!e) return [];
        const mrp = e.mrp && e.mrp >= e.price ? e.mrp : e.price;
        return [
          {
            productId: `${this.id}:${p.id}`,
            platform: this.id,
            productName: p.name,
            brand: p.brand,
            variant: p.variant,
            quantity: p.size.value,
            unit: p.size.unit,
            packCount: p.packCount,
            price: e.price,
            mrp,
            discount: mrp - e.price,
            availability: e.available ? 'in_stock' : 'out_of_stock',
            deliveryFee: fees.deliveryFee,
            platformFee: fees.platformFee,
            handlingFee: fees.handlingFee,
            productUrl: platformSearchUrl(this.id, productQuery(p)),
            lastUpdated: e.checkedAt,
            location,
            dataSource: 'user',
          } satisfies PlatformListing,
        ];
      });
  }
}

/** The comparison service searches each adapter with exactly this title. */
const productQuery = productTitle;
